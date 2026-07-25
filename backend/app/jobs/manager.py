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
            await self.emit(job_id, "Running face animation", "running")
            # The engine-specific command is intentionally gated by verified installation/model checks.
            await self.emit(job_id, "Engine invocation not yet verified on this host", "failed")
            self.repo.update_job(
                job_id,
                error_code="ENGINE_INVOCATION_UNVERIFIED",
                error_message="Run doctor and the real-engine smoke test after installing pinned SadTalker models.",
            )
