import asyncio
import json

from fastapi.testclient import TestClient

from app.core import config
from app.db.repository import Repository
from app.engines.operations import EngineOperationManager
from app.jobs.manager import JobManager


def test_health_and_settings(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARKIT_HOME", str(tmp_path))
    # Import reload is avoided: test validates public request models on the initialized app.
    from app.main import app

    with TestClient(app) as client:
        assert client.get("/api/v1/health").json()["local_only"] is True
        assert client.put("/api/v1/settings", json={"device": "cpu"}).json()["device"] == "cpu"


def test_data_dirs_are_outside_repo(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARKIT_HOME", str(tmp_path / "Avatar Data"))
    paths = config.ensure_data_dirs()
    assert all(path.exists() for path in paths.values())
    assert paths["outputs"].parent == tmp_path / "Avatar Data"


def test_background_failure_is_persisted(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARKIT_HOME", str(tmp_path))
    manager = JobManager(Repository(tmp_path / "jobs.sqlite3"))
    job = manager.create("speech", "fast", False)

    async def fail(_: str) -> None:
        raise RuntimeError("engine exploded")

    monkeypatch.setattr(manager, "run_real_avatar", fail)

    async def run() -> None:
        manager.start(job["id"])
        await manager.tasks[job["id"]]

    asyncio.run(run())
    failed = manager.repo.job(job["id"])
    assert failed
    assert failed["state"] == "failed"
    assert failed["error_code"] == "GENERATION_FAILED"
    assert failed["error_message"] == "engine exploded"


def test_clear_removes_job_output_and_log(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARKIT_HOME", str(tmp_path))
    manager = JobManager(Repository(tmp_path / "jobs.sqlite3"))
    job = manager.create("speech", "fast", False)
    output = tmp_path / "outputs" / f"{job['id']}.mp4"
    log = tmp_path / "logs" / f"{job['id']}.log"
    output.write_bytes(b"video")
    log.write_text("engine log", encoding="utf-8")
    manager.repo.update_job(
        job["id"],
        state="completed",
        phase="Complete",
        output_path=str(output),
    )

    assert manager.clear("all") == 1
    assert manager.repo.list_jobs() == []
    assert not output.exists()
    assert not log.exists()
    assert not (tmp_path / "jobs" / job["id"]).exists()


def test_upload_limit_is_enforced_before_writing(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARKIT_HOME", str(tmp_path))
    manager = JobManager(Repository(tmp_path / "jobs.sqlite3"))
    manager.repo.update_settings({"max_upload_mb": 1})
    job = manager.create("speech", "fast", False)

    try:
        manager.store_input(job["id"], "portrait", "large.png", b"x" * (1024 * 1024 + 1))
    except ValueError as exc:
        assert "1 MB" in str(exc)
    else:
        raise AssertionError("Oversized upload was accepted")
    assert not (tmp_path / "jobs" / job["id"] / "portrait.png").exists()


def test_engine_operation_history_and_logs_are_persistent(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARKIT_HOME", str(tmp_path))
    operations = EngineOperationManager()
    operation_id = "a" * 32
    status = {
        "id": operation_id,
        "engine_id": "sadtalker",
        "action": "setup",
        "state": "completed",
        "phase": "Ready",
        "started_at": "2026-01-01T00:00:00+00:00",
    }
    (operations.directory / f"{operation_id}.json").write_text(
        json.dumps(status), encoding="utf-8"
    )
    (operations.directory / f"{operation_id}.log").write_text(
        "download complete", encoding="utf-8"
    )

    assert operations.get(operation_id) == status
    assert operations.list() == [status]
    assert operations.log_path(operation_id).read_text(encoding="utf-8") == "download complete"
