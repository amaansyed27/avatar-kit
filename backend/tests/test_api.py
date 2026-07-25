import asyncio

from fastapi.testclient import TestClient

from app.core import config
from app.db.repository import Repository
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
