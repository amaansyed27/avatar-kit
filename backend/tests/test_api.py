from fastapi.testclient import TestClient

from app.core import config


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
