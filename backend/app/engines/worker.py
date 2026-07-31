from __future__ import annotations

import json
import sys
import traceback
from datetime import UTC, datetime
from pathlib import Path

from app.engines.chatterbox import ChatterboxVoiceEngine
from app.engines.sadtalker import SadTalkerAvatarEngine

ENGINES = {
    "sadtalker": SadTalkerAvatarEngine,
    "chatterbox": ChatterboxVoiceEngine,
}


def now() -> str:
    return datetime.now(UTC).isoformat()


def write_status(path: Path, value: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2), encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    operation_id, engine_id, action, status_name = sys.argv[1:5]
    path = Path(status_name)
    status = json.loads(path.read_text(encoding="utf-8"))
    try:
        engine = ENGINES[engine_id]()
        status |= {"state": "running", "phase": "Installing engine runtime"}
        write_status(path, status)
        print(f"AvatarKit model setup {operation_id}", flush=True)
        print(f"Engine: {engine.display_name}\nAction: {action}\n", flush=True)
        if action == "setup":
            engine.install()
        status["phase"] = "Downloading and verifying models"
        write_status(path, status)
        engine.ensure_models()
        result = vars(engine.status())
        status |= {
            "state": "completed",
            "phase": "Ready",
            "finished_at": now(),
            "result": result,
        }
        write_status(path, status)
        print("\nSetup complete. Engine and models are ready.", flush=True)
        return 0
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        status |= {
            "state": "failed",
            "phase": "Setup failed",
            "finished_at": now(),
            "error": str(exc),
        }
        write_status(path, status)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
