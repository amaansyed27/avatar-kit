from __future__ import annotations

import asyncio
import platform
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.core.config import data_home, ensure_data_dirs
from app.db.repository import Repository
from app.jobs.manager import JobManager

repo = Repository()
manager = JobManager(repo)


class JobRequest(BaseModel):
    workflow: str = Field(pattern="^(speech|clone)$")
    preset: str = Field(default="balanced", pattern="^(fast|balanced|best)$")
    watermark: bool = True


class SettingsPatch(BaseModel):
    default_preset: str | None = None
    watermark_enabled: bool | None = None
    max_upload_mb: int | None = Field(default=None, ge=1, le=2048)
    max_audio_seconds: int | None = Field(default=None, ge=1, le=7200)
    device: str | None = Field(default=None, pattern="^(auto|cuda|cpu)$")
    cleanup_failed: bool | None = None
    open_after_generation: bool | None = None
    log_level: str | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_data_dirs()
    yield


app = FastAPI(title="AvatarKit", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:7865", "http://localhost:7865"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health() -> dict:
    return {"status": "ok", "version": "0.1.0", "local_only": True}


@app.get("/api/v1/system")
def system() -> dict:
    return {
        "os": platform.platform(),
        "data_directory": str(data_home()),
        "ffmpeg": manager.media.available(),
    }


@app.get("/api/v1/engines")
def engines() -> list[dict]:
    return [vars(engine.status()) for engine in manager.engines.values()]


@app.get("/api/v1/engines/{engine_id}")
def engine(engine_id: str) -> dict:
    item = manager.engines.get(engine_id)
    if not item:
        raise HTTPException(404, "Unknown engine")
    return vars(item.status())


@app.post("/api/v1/engines/{engine_id}/install")
def install(engine_id: str) -> dict:
    item = manager.engines.get(engine_id)
    if not item:
        raise HTTPException(404, "Unknown engine")
    try:
        return vars(item.install())
    except Exception as exc:
        raise HTTPException(500, {"code": "ENGINE_INSTALL_FAILED", "detail": str(exc)}) from exc


@app.get("/api/v1/jobs")
def jobs() -> list[dict]:
    return repo.list_jobs()


@app.post("/api/v1/jobs", status_code=201)
async def create_job(request: JobRequest) -> dict:
    job = manager.create(request.workflow, request.preset, request.watermark)
    return job


@app.post("/api/v1/jobs/{job_id}/inputs/{kind}")
async def upload_input(job_id: str, kind: str, file: UploadFile = File(...)) -> dict:  # noqa: B008
    if not file.filename:
        raise HTTPException(422, "A file name is required")
    try:
        job = manager.store_input(job_id, kind, file.filename, await file.read())
        return job
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/v1/jobs/{job_id}/start")
async def start_job(job_id: str) -> dict:
    job = repo.job(job_id)
    if not job: raise HTTPException(404, "Job not found")
    if job["state"] not in {"created", "failed"}: raise HTTPException(409, "Job has already started")
    asyncio.create_task(manager.run_real_avatar(job_id))
    return repo.update_job(job_id, state="queued", phase="Queued") or job


@app.get("/api/v1/jobs/{job_id}")
def job(job_id: str) -> dict:
    value = repo.job(job_id)
    if not value:
        raise HTTPException(404, "Job not found")
    return value


@app.post("/api/v1/jobs/{job_id}/cancel")
async def cancel(job_id: str) -> dict:
    value = await manager.cancel(job_id)
    if not value:
        raise HTTPException(404, "Job not found")
    return value


@app.delete("/api/v1/jobs/{job_id}", status_code=204)
def delete(job_id: str) -> None:
    if not manager.delete(job_id):
        raise HTTPException(404, "Job not found")


@app.get("/api/v1/jobs/{job_id}/events")
async def events(job_id: str) -> StreamingResponse:
    if not repo.job(job_id):
        raise HTTPException(404, "Job not found")

    async def stream():
        while True:
            event = await manager.events.setdefault(job_id, asyncio.Queue()).get()
            yield f"data: {event}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/api/v1/jobs/{job_id}/output")
def output(job_id: str) -> FileResponse:
    job = repo.job(job_id)
    path = Path(job["output_path"]) if job and job["output_path"] else None
    if not path or not path.is_file():
        raise HTTPException(404, "Output is missing")
    return FileResponse(path, media_type="video/mp4", filename=path.name)


@app.get("/api/v1/settings")
def settings() -> dict:
    return repo.settings()


@app.put("/api/v1/settings")
def update_settings(patch: SettingsPatch) -> dict:
    return repo.update_settings(patch.model_dump(exclude_none=True))


@app.get("/api/v1/diagnostics")
def diagnostics() -> dict:
    usage = shutil.disk_usage(data_home())
    return {
        "os": platform.platform(),
        "python": platform.python_version(),
        "data_directory": str(data_home()),
        "free_disk_bytes": usage.free,
        "ffmpeg": manager.media.available(),
        "engines": [vars(e.status()) for e in manager.engines.values()],
    }


@app.post("/api/v1/diagnostics/run")
def run_diagnostics() -> dict:
    return diagnostics()
