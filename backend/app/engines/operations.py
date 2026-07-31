from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import ensure_data_dirs


def _now() -> str:
    return datetime.now(UTC).isoformat()


class EngineOperationManager:
    def __init__(self) -> None:
        self.directory = ensure_data_dirs()["logs"] / "engine-operations"
        self.directory.mkdir(parents=True, exist_ok=True)

    def _status_path(self, operation_id: str) -> Path:
        return self.directory / f"{operation_id}.json"

    def _log_path(self, operation_id: str) -> Path:
        return self.directory / f"{operation_id}.log"

    def _read(self, path: Path) -> dict | None:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def list(self) -> list[dict]:
        operations = [item for path in self.directory.glob("*.json") if (item := self._read(path))]
        return sorted(operations, key=lambda item: item.get("started_at", ""), reverse=True)

    def get(self, operation_id: str) -> dict | None:
        if not operation_id.isalnum():
            return None
        return self._read(self._status_path(operation_id))

    def active_for(self, engine_id: str) -> dict | None:
        return next(
            (
                operation
                for operation in self.list()
                if operation.get("engine_id") == engine_id
                and operation.get("state") in {"queued", "running"}
            ),
            None,
        )

    def start(self, engine_id: str, action: str) -> dict:
        active = self.active_for(engine_id)
        if active:
            return active
        operation_id = uuid.uuid4().hex
        status_path = self._status_path(operation_id)
        log_path = self._log_path(operation_id)
        operation = {
            "id": operation_id,
            "engine_id": engine_id,
            "action": action,
            "state": "queued",
            "phase": "Preparing setup",
            "started_at": _now(),
            "finished_at": None,
            "error": None,
        }
        status_path.write_text(json.dumps(operation, indent=2), encoding="utf-8")
        command = [
            sys.executable,
            "-m",
            "app.engines.worker",
            operation_id,
            engine_id,
            action,
            str(status_path),
        ]
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        with log_path.open("w", encoding="utf-8") as log:
            subprocess.Popen(
                command,
                cwd=Path(__file__).resolve().parents[2],
                env=os.environ.copy(),
                stdout=log,
                stderr=subprocess.STDOUT,
                creationflags=flags,
            )
        return operation

    def log_path(self, operation_id: str) -> Path | None:
        operation = self.get(operation_id)
        path = self._log_path(operation_id)
        return path if operation and path.is_file() else None
