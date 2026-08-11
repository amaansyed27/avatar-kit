import asyncio
import json

from fastapi.testclient import TestClient

from app.core import config
from app.db.repository import Repository
from app.engines.operations import EngineOperationManager
from app.jobs.manager import JobManager
from app.storage import StorageManager


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


def test_storage_report_and_clear_are_scoped(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARKIT_HOME", str(tmp_path / "data"))
    repo = Repository(tmp_path / "data" / "database" / "jobs.sqlite3")
    storage = StorageManager(repo)
    cache_file = config.ensure_data_dirs()["cache"] / "download.part"
    cache_file.write_bytes(b"cached")

    report = storage.report()
    assert report["data_directory"] == str((tmp_path / "data").resolve())
    assert next(item for item in report["categories"] if item["id"] == "cache")["bytes"] == 6
    assert storage.clear("cache")["removed_bytes"] == 6
    assert not cache_file.exists()

    try:
        storage.clear("models")
    except ValueError as exc:
        assert "Only cache" in str(exc)
    else:
        raise AssertionError("Model storage was cleared through the disposable-data endpoint")


def test_custom_output_directory_is_used(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARKIT_HOME", str(tmp_path / "data"))
    repo = Repository(tmp_path / "data" / "database" / "jobs.sqlite3")
    destination = tmp_path / "My Videos"
    repo.update_settings({"output_directory": str(destination)})
    manager = JobManager(repo)

    assert manager.library_summary()["data_directory"] == str(destination.resolve())
    assert destination.is_dir()


def test_work_cleanup_preserves_or_removes_sources_by_policy(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATARKIT_HOME", str(tmp_path))
    manager = JobManager(Repository(tmp_path / "database" / "jobs.sqlite3"))
    job = manager.create("speech", "fast", False)
    job_dir = tmp_path / "jobs" / job["id"]
    portrait = job_dir / "portrait.png"
    portrait.write_bytes(b"portrait")
    (job_dir / "normalized.wav").write_bytes(b"temporary")
    work = job_dir / "sadtalker-output"
    work.mkdir()
    (work / "work.mp4").write_bytes(b"temporary")
    manager.repo.update_job(job["id"], portrait_path=str(portrait))

    manager._cleanup_work_files(job["id"], keep_sources=True)
    assert portrait.exists()
    assert not (job_dir / "normalized.wav").exists()
    assert not work.exists()

    manager._cleanup_work_files(job["id"], keep_sources=False)
    assert not job_dir.exists()
    assert manager.repo.job(job["id"])["portrait_path"] is None
