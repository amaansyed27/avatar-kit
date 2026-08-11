from __future__ import annotations

import asyncio
import json
import platform
import shutil
import tempfile
import zipfile
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.core.config import data_home, ensure_data_dirs, output_home
from app.db.repository import Repository
from app.engines.operations import EngineOperationManager
from app.jobs.manager import JobManager
from app.storage import StorageManager

repo = Repository()
manager = JobManager(repo)
engine_operations = EngineOperationManager()
storage_manager = StorageManager(repo)


class JobRequest(BaseModel):
    workflow: str = Field(pattern="^(speech|clone)$")
    preset: str = Field(default="balanced", pattern="^(fast|balanced|best)$")
    watermark: bool = True


class SettingsPatch(BaseModel):
    setup_completed: bool | None = None
    default_preset: str | None = None
    watermark_enabled: bool | None = None
    max_upload_mb: int | None = Field(default=None, ge=1, le=2048)
    max_audio_seconds: int | None = Field(default=None, ge=1, le=7200)
    device: str | None = Field(default=None, pattern="^(auto|cuda|cpu)$")
    cleanup_failed: bool | None = None
    open_after_generation: bool | None = None
    log_level: str | None = None
    output_directory: str | None = None
    auto_cleanup_temp: bool | None = None
    keep_source_files: bool | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_data_dirs()
    yield
    await manager.shutdown()


app = FastAPI(title="AvatarKit", version="0.1.1", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:7865", "http://localhost:7865"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health() -> dict:
    return {"status": "ok", "version": "0.1.1", "local_only": True}


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


@app.post("/api/v1/engines/{engine_id}/models")
def models(engine_id: str) -> dict:
    item = manager.engines.get(engine_id)
    if not item:
        raise HTTPException(404, "Unknown engine")
    try:
        return vars(item.ensure_models())
    except Exception as exc:
        raise HTTPException(500, {"code": "MODEL_DOWNLOAD_FAILED", "detail": str(exc)}) from exc


@app.post("/api/v1/engines/{engine_id}/setup", status_code=202)
def setup_engine(engine_id: str) -> dict:
    item = manager.engines.get(engine_id)
    if not item:
        raise HTTPException(404, "Unknown engine")
    status = item.status()
    action = "models" if status.installed else "setup"
    return engine_operations.start(engine_id, action)


@app.get("/api/v1/engine-operations")
def list_engine_operations() -> list[dict]:
    return engine_operations.list()


@app.get("/api/v1/engine-operations/{operation_id}")
def engine_operation(operation_id: str) -> dict:
    operation = engine_operations.get(operation_id)
    if not operation:
        raise HTTPException(404, "Engine operation not found")
    return operation


@app.get("/api/v1/engine-operations/{operation_id}/log", response_class=PlainTextResponse)
def engine_operation_log(operation_id: str, download: bool = False):
    path = engine_operations.log_path(operation_id)
    if not path:
        raise HTTPException(404, "Setup log is not available yet")
    if download:
        return FileResponse(path, media_type="text/plain", filename=f"avatarkit-model-setup-{operation_id[:8]}.log")
    return path.read_text(encoding="utf-8", errors="replace")


@app.get("/api/v1/jobs")
def jobs() -> list[dict]:
    return repo.list_jobs()


@app.get("/api/v1/library")
def library() -> dict:
    return manager.library_summary()


@app.delete("/api/v1/jobs")
def clear_jobs(scope: str = "all") -> dict:
    if scope not in {"all", "failed"}:
        raise HTTPException(422, "Scope must be all or failed")
    try:
        return {"deleted": manager.clear(scope), "summary": manager.library_summary()}
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


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
    if not job:
        raise HTTPException(404, "Job not found")
    if job["state"] not in {"created", "failed"}:
        raise HTTPException(409, "Job has already started")
    return manager.start(job_id)


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
    job = repo.job(job_id)
    if job and job["state"] in {"validating", "queued", "running", "cancelling"}:
        raise HTTPException(409, "Cancel the active generation before deleting it")
    if not manager.delete(job_id):
        raise HTTPException(404, "Job not found")


@app.get("/api/v1/jobs/{job_id}/events")
async def events(job_id: str) -> StreamingResponse:
    if not repo.job(job_id):
        raise HTTPException(404, "Job not found")

    async def stream():
        while True:
            event = await manager.events.setdefault(job_id, asyncio.Queue()).get()
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/api/v1/jobs/{job_id}/output")
def output(job_id: str) -> FileResponse:
    job = repo.job(job_id)
    path = Path(job["output_path"]) if job and job["output_path"] else None
    if not path or not path.is_file():
        raise HTTPException(404, "Output is missing")
    return FileResponse(path, media_type="video/mp4", filename=path.name)


@app.get("/api/v1/jobs/{job_id}/portrait")
def portrait(job_id: str) -> FileResponse:
    job = repo.job(job_id)
    path = Path(job["portrait_path"]) if job and job["portrait_path"] else None
    if not path or not path.is_file():
        raise HTTPException(404, "Portrait is missing")
    return FileResponse(path)


@app.get("/api/v1/jobs/{job_id}/log", response_class=PlainTextResponse)
def job_log(job_id: str) -> str:
    job = repo.job(job_id)
    path = Path(job["log_path"]) if job and job["log_path"] else None
    if not path or not path.is_file():
        raise HTTPException(404, "Log is missing")
    return path.read_text(encoding="utf-8", errors="replace")


@app.get("/api/v1/jobs/{job_id}/log/download")
def download_job_log(job_id: str) -> FileResponse:
    job = repo.job(job_id)
    path = Path(job["log_path"]) if job and job["log_path"] else None
    if not path or not path.is_file():
        raise HTTPException(404, "Log is missing")
    return FileResponse(path, media_type="text/plain", filename=f"avatarkit-job-{job_id[:8]}.log")


@app.get("/api/v1/logs/download")
def download_all_logs() -> StreamingResponse:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in ensure_data_dirs()["logs"].rglob("*.log"):
            archive.write(path, path.relative_to(ensure_data_dirs()["logs"]))
    buffer.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="avatarkit-logs.zip"'}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)


@app.get("/api/v1/diagnostics/report")
def diagnostic_report() -> StreamingResponse:
    content = json.dumps(diagnostics(), indent=2).encode()
    headers = {"Content-Disposition": 'attachment; filename="avatarkit-diagnostics.json"'}
    return StreamingResponse(iter([content]), media_type="application/json", headers=headers)


@app.get("/api/v1/settings")
def settings() -> dict:
    return repo.settings()


@app.put("/api/v1/settings")
def update_settings(patch: SettingsPatch) -> dict:
    values = patch.model_dump(exclude_none=True)
    if "output_directory" in values:
        configured = values["output_directory"].strip()
        if configured:
            try:
                target = output_home(configured)
                with tempfile.NamedTemporaryFile(prefix=".avatarkit-write-", dir=target):
                    pass
            except (OSError, ValueError) as exc:
                raise HTTPException(422, f"Output directory is not writable: {exc}") from exc
        values["output_directory"] = configured
    return repo.update_settings(values)


@app.get("/api/v1/storage")
def storage(quick: bool = False) -> dict:
    return storage_manager.report(quick=quick)


@app.delete("/api/v1/storage/{category}")
def clear_storage(category: str) -> dict:
    if any(job["state"] in {"validating", "queued", "running", "cancelling"} for job in repo.list_jobs()):
        raise HTTPException(409, "Wait for the active generation before clearing storage")
    if any(operation["state"] in {"queued", "running"} for operation in engine_operations.list()):
        raise HTTPException(409, "Wait for the active model setup before clearing storage")
    try:
        return storage_manager.clear(category)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


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
