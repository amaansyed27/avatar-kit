from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import ensure_data_dirs

DEFAULT_SETTINGS = {
    "default_preset": "balanced",
    "watermark_enabled": True,
    "max_upload_mb": 200,
    "max_audio_seconds": 600,
    "device": "auto",
    "cleanup_failed": True,
    "open_after_generation": False,
    "log_level": "info",
}


def now() -> str:
    return datetime.now(UTC).isoformat()


class Repository:
    def __init__(self, database_path: Path | None = None) -> None:
        self.path = database_path or ensure_data_dirs()["database"] / "avatarkit.sqlite3"
        self.initialize()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        con = sqlite3.connect(self.path)
        con.row_factory = sqlite3.Row
        try:
            yield con
            con.commit()
        finally:
            con.close()

    def initialize(self) -> None:
        with self.connection() as con:
            con.executescript("""
            CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, state TEXT NOT NULL,
              phase TEXT NOT NULL, workflow TEXT NOT NULL, preset TEXT NOT NULL, watermark INTEGER NOT NULL,
              portrait_path TEXT, audio_path TEXT, output_path TEXT, log_path TEXT, error_code TEXT, error_message TEXT
            );
            """)
            con.execute(
                "INSERT OR IGNORE INTO settings(id, value) VALUES(1, ?)",
                (json.dumps(DEFAULT_SETTINGS),),
            )
            con.execute(
                "UPDATE jobs SET state='failed', phase='Interrupted', error_code='JOB_INTERRUPTED', error_message='AvatarKit was closed while this job was running.' WHERE state IN ('validating','queued','running','cancelling')"
            )

    def settings(self) -> dict:
        with self.connection() as con:
            return json.loads(
                con.execute("SELECT value FROM settings WHERE id=1").fetchone()["value"]
            )

    def update_settings(self, patch: dict) -> dict:
        value = self.settings() | patch
        with self.connection() as con:
            con.execute("UPDATE settings SET value=? WHERE id=1", (json.dumps(value),))
        return value

    def create_job(self, job: dict) -> dict:
        with self.connection() as con:
            con.execute(
                """INSERT INTO jobs VALUES(:id,:created_at,:updated_at,:state,:phase,:workflow,:preset,:watermark,:portrait_path,:audio_path,:output_path,:log_path,:error_code,:error_message)""",
                job,
            )
        return job

    def list_jobs(self) -> list[dict]:
        with self.connection() as con:
            return [dict(r) for r in con.execute("SELECT * FROM jobs ORDER BY created_at DESC")]

    def job(self, job_id: str) -> dict | None:
        with self.connection() as con:
            row = con.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            return dict(row) if row else None

    def update_job(self, job_id: str, **patch: object) -> dict | None:
        if not patch:
            return self.job(job_id)
        patch["updated_at"] = now()
        sets = ", ".join(f"{key}=:${key}".replace(":$", ":") for key in patch)
        with self.connection() as con:
            con.execute(f"UPDATE jobs SET {sets} WHERE id=:id", patch | {"id": job_id})
        return self.job(job_id)

    def delete_job(self, job_id: str) -> None:
        with self.connection() as con:
            con.execute("DELETE FROM jobs WHERE id=?", (job_id,))
