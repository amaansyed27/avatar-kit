from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import traceback
import uuid
from pathlib import Path

from app.core.config import ensure_data_dirs
from app.db.repository import Repository, now
from app.engines.chatterbox import ChatterboxVoiceEngine
from app.engines.sadtalker import SadTalkerAvatarEngine
from app.media.ffmpeg import FFmpegService


def append_error_log(path: Path, message: str, trace: str) -> None:
    with path.open("a", encoding="utf-8") as log:
        log.write(f"\nAvatarKit error: {message}\n")
        log.write(trace)


class JobManager:
    def __init__(self, repo: Repository) -> None:
        self.repo, self.media = repo, FFmpegService()
        self.engines = {"sadtalker": SadTalkerAvatarEngine(), "chatterbox": ChatterboxVoiceEngine()}
        self.lock = asyncio.Lock()
        self.events: dict[str, asyncio.Queue[dict]] = {}
        self.processes: dict[str, asyncio.subprocess.Process] = {}
        self.tasks: dict[str, asyncio.Task[None]] = {}

    def engines_ready_for(self, workflow: str) -> bool:
        required = ("sadtalker",) if workflow == "speech" else ("sadtalker", "chatterbox")
        for engine_id in required:
            status = self.engines[engine_id].status()
            if not status.installed or not status.models_ready:
                return False
        return True

    def create(self, workflow: str, preset: str, watermark: bool) -> dict:
        job_id = str(uuid.uuid4())
        dirs = ensure_data_dirs()
        job_dir = dirs["jobs"] / job_id
        job_dir.mkdir()
        job = {
            "id": job_id,
            "created_at": now(),
            "updated_at": now(),
            "state": "created",
            "phase": "Awaiting uploads",
            "workflow": workflow,
            "preset": preset,
            "watermark": int(watermark),
            "portrait_path": None,
            "audio_path": None,
            "output_path": None,
            "log_path": str(dirs["logs"] / f"{job_id}.log"),
            "error_code": None,
            "error_message": None,
        }
        self.events[job_id] = asyncio.Queue()
        return self.repo.create_job(job)

    def store_input(self, job_id: str, kind: str, filename: str, content: bytes) -> dict:
        job = self.repo.job(job_id)
        if not job or kind not in {"portrait", "audio", "reference"}:
            raise ValueError("Unknown job or input kind")
        suffix = Path(filename).suffix.lower()
        allowed = {"portrait": {".png", ".jpg", ".jpeg", ".webp"}, "audio": {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".webm"}, "reference": {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".webm"}}
        if suffix not in allowed[kind] or not content:
            raise ValueError("Unsupported or empty media file")
        path = ensure_data_dirs()["jobs"] / job_id / f"{kind}{suffix}"
        path.write_bytes(content)
        if kind == "portrait":
            self.media.validate_image(path); return self.repo.update_job(job_id, portrait_path=str(path)) or job
        duration = self.media.validate_audio(path)
        if duration <= 0: raise ValueError("Audio duration is invalid")
        return self.repo.update_job(job_id, audio_path=str(path)) or job

    async def emit(
        self, job_id: str, phase: str, state: str | None = None, message: str | None = None
    ) -> None:
        job = self.repo.update_job(job_id, phase=phase, **({"state": state} if state else {}))
        await self.events.setdefault(job_id, asyncio.Queue()).put(
            {"job": job, "message": message or phase}
        )

    def start(self, job_id: str) -> dict:
        job = self.repo.update_job(
            job_id,
            state="queued",
            phase="Queued",
            error_code=None,
            error_message=None,
        )
        if not job:
            raise ValueError("Job not found")
        task = asyncio.create_task(self._run_guarded(job_id))
        self.tasks[job_id] = task
        task.add_done_callback(lambda _: self.tasks.pop(job_id, None))
        return job

    async def _run_guarded(self, job_id: str) -> None:
        try:
            await self.run_real_avatar(job_id)
        except asyncio.CancelledError:
            job = self.repo.job(job_id)
            if job and job["state"] not in {"completed", "failed", "cancelled"}:
                await self.emit(job_id, "Cancelled", "cancelled")
            raise
        except Exception as exc:  # noqa: BLE001
            message = str(exc) or type(exc).__name__
            job = self.repo.job(job_id)
            if job and job.get("log_path"):
                await asyncio.to_thread(
                    append_error_log,
                    Path(job["log_path"]),
                    message,
                    traceback.format_exc(),
                )
            self.repo.update_job(
                job_id,
                state="failed",
                phase="Generation failed",
                error_code="GENERATION_FAILED",
                error_message=message,
            )
            await self.events.setdefault(job_id, asyncio.Queue()).put(
                {"job": self.repo.job(job_id), "message": message}
            )

    async def _stop_process_tree(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        if os.name == "nt":
            await asyncio.to_thread(
                subprocess.run,
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                check=False,
            )
            await process.wait()
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=8)
        except TimeoutError:
            process.kill()
            await process.wait()

    async def cancel(self, job_id: str) -> dict | None:
        job = self.repo.job(job_id)
        if not job:
            return None
        if job["state"] in ("completed", "failed", "cancelled"):
            return job
        process = self.processes.get(job_id)
        if process and process.returncode is None:
            await self.emit(job_id, "Stopping engine process", "cancelling")
            await self._stop_process_tree(process)
        task = self.tasks.get(job_id)
        if task and task is not asyncio.current_task() and not task.done():
            task.cancel()
        await self.emit(job_id, "Cancelled", "cancelled")
        return self.repo.job(job_id)

    async def shutdown(self) -> None:
        for job_id in list(self.tasks):
            await self.cancel(job_id)
        pending = [task for task in self.tasks.values() if not task.done()]
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

    def delete(self, job_id: str) -> bool:
        job = self.repo.job(job_id)
        if not job:
            return False
        job_dir = ensure_data_dirs()["jobs"] / job_id
        if job_dir.exists():
            shutil.rmtree(job_dir)
        for key in ("portrait_path", "audio_path", "output_path"):
            value = job.get(key)
            if value:
                path = Path(value)
                if path.exists() and str(path).startswith(str(ensure_data_dirs()["outputs"])):
                    path.unlink()
        self.repo.delete_job(job_id)
        return True

    async def run_real_avatar(self, job_id: str) -> None:
        """Reserved for SadTalker subprocess orchestration after engine/model readiness.
        No fallback video is ever generated in production when the engine is unavailable.
        """
        async with self.lock:
            job = self.repo.job(job_id)
            if not job:
                return
            if not await asyncio.to_thread(self.engines_ready_for, job["workflow"]):
                await self.emit(
                    job_id,
                    "Engine setup required",
                    "failed",
                    "Install SadTalker and Chatterbox from Diagnostics before generation.",
                )
                self.repo.update_job(
                    job_id,
                    error_code="ENGINE_NOT_READY",
                    error_message="Required local engines or models are missing.",
                )
                return
            if not job or not job["portrait_path"] or not job["audio_path"]:
                await self.emit(job_id, "Awaiting valid local inputs", "failed")
                self.repo.update_job(job_id, error_code="MISSING_INPUT", error_message="Add a portrait and audio before generating.")
                return
            await self.emit(job_id, "Normalizing audio", "running")
            job_dir = ensure_data_dirs()["jobs"] / job_id; audio = job_dir / "normalized.wav"
            await asyncio.to_thread(self.media.normalize_audio, Path(job["audio_path"]), audio)
            output_dir = job_dir / "sadtalker-output"; output_dir.mkdir(exist_ok=True)
            engine = self.engines["sadtalker"]
            settings = self.repo.settings()
            command = [str(engine._python()), str(engine._root() / "inference.py"), "--driven_audio", str(audio), "--source_image", job["portrait_path"], "--result_dir", str(output_dir), "--still", "--preprocess", "crop"]
            if settings.get("device") == "cpu": command += ["--device", "cpu"]
            if job["preset"] == "fast": command += ["--size", "256"]
            if job["preset"] == "best": command += ["--size", "512"]
            await self.emit(job_id, "Running face animation", "running")
            bundled_ffmpeg = next(
                (
                    engine._python().parent.parent
                    / "Lib"
                    / "site-packages"
                    / "imageio_ffmpeg"
                    / "binaries"
                ).glob("ffmpeg*.exe"),
                None,
            )
            process_env = os.environ.copy()
            if bundled_ffmpeg:
                managed_dir = ensure_data_dirs()["engines"] / "ffmpeg"
                managed_dir.mkdir(parents=True, exist_ok=True)
                managed_ffmpeg = managed_dir / "ffmpeg.exe"
                if not managed_ffmpeg.is_file():
                    shutil.copy2(bundled_ffmpeg, managed_ffmpeg)
                process_env["PATH"] = f"{managed_dir}{os.pathsep}{process_env.get('PATH', '')}"
            process = await asyncio.create_subprocess_exec(
                *command,
                cwd=str(engine._root()),
                env=process_env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            self.processes[job_id] = process
            try:
                with Path(job["log_path"]).open("w", encoding="utf-8") as log:  # noqa: ASYNC230
                    assert process.stdout
                    async for line in process.stdout:
                        log.write(line.decode(errors="replace"))
                        log.flush()
                if await process.wait() != 0:
                    raise RuntimeError("SadTalker exited with an error; open the local log from History.")
            finally:
                self.processes.pop(job_id, None)
            videos = sorted(output_dir.rglob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
            if not videos: raise RuntimeError("SadTalker did not produce an MP4 output.")
            destination = ensure_data_dirs()["outputs"] / f"{job_id}.mp4"
            if job["watermark"]:
                await self.emit(job_id, "Adding AI-generated watermark", "running")
                await asyncio.to_thread(self.media.add_watermark, videos[0], destination)
            else:
                shutil.copy2(videos[0], destination)
            await self.emit(job_id, "Verifying output", "running")
            await asyncio.to_thread(self.media.verify_output, destination)
            self.repo.update_job(job_id, state="completed", phase="Complete", output_path=str(destination))
            await self.emit(job_id, "Complete", "completed")
