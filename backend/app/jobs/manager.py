from __future__ import annotations

import asyncio
import shutil
import uuid
from pathlib import Path

from app.core.config import ensure_data_dirs
from app.db.repository import Repository, now
from app.engines.chatterbox import ChatterboxVoiceEngine
from app.engines.sadtalker import SadTalkerAvatarEngine
from app.media.ffmpeg import FFmpegService


class JobManager:
    def __init__(self, repo: Repository) -> None:
        self.repo, self.media = repo, FFmpegService()
        self.engines = {"sadtalker": SadTalkerAvatarEngine(), "chatterbox": ChatterboxVoiceEngine()}
        self.lock = asyncio.Lock()
        self.events: dict[str, asyncio.Queue[dict]] = {}

    def all_engines_ready(self) -> bool:
        return all(e.status().installed and e.status().models_ready for e in self.engines.values())

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

    async def cancel(self, job_id: str) -> dict | None:
        job = self.repo.job(job_id)
        if not job:
            return None
        if job["state"] in ("completed", "failed", "cancelled"):
            return job
        await self.emit(job_id, "Cancelled", "cancelled")
        return self.repo.job(job_id)

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
            if not self.all_engines_ready():
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
            job = self.repo.job(job_id)
            if not job or not job["portrait_path"] or not job["audio_path"]:
                await self.emit(job_id, "Awaiting valid local inputs", "failed")
                self.repo.update_job(job_id, error_code="MISSING_INPUT", error_message="Add a portrait and audio before generating.")
                return
            await self.emit(job_id, "Normalizing audio", "running")
            job_dir = ensure_data_dirs()["jobs"] / job_id; audio = job_dir / "normalized.wav"
            self.media.normalize_audio(Path(job["audio_path"]), audio)
            output_dir = job_dir / "sadtalker-output"; output_dir.mkdir(exist_ok=True)
            engine = self.engines["sadtalker"]
            command = [str(engine._python()), str(engine._root() / "inference.py"), "--driven_audio", str(audio), "--source_image", job["portrait_path"], "--result_dir", str(output_dir), "--still", "--preprocess", "crop"]
            await self.emit(job_id, "Running face animation", "running")
            process = await asyncio.create_subprocess_exec(*command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            with Path(job["log_path"]).open("w", encoding="utf-8") as log:  # noqa: ASYNC230
                assert process.stdout
                async for line in process.stdout:
                    log.write(line.decode(errors="replace"))
            if await process.wait() != 0:
                raise RuntimeError("SadTalker exited with an error; open the local log from History.")
            videos = sorted(output_dir.rglob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
            if not videos: raise RuntimeError("SadTalker did not produce an MP4 output.")
            destination = ensure_data_dirs()["outputs"] / f"{job_id}.mp4"; shutil.copy2(videos[0], destination)
            await self.emit(job_id, "Verifying output", "running"); self.media.verify_output(destination)
            self.repo.update_job(job_id, state="completed", phase="Complete", output_path=str(destination))
            await self.emit(job_id, "Complete", "completed")
