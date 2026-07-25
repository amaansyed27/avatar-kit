from __future__ import annotations

import subprocess
from pathlib import Path

from app.core.config import ensure_data_dirs
from app.engines.base import Engine, EngineStatus


class SadTalkerAvatarEngine(Engine):
    engine_id = "sadtalker"
    display_name = "SadTalker"
    source_url = "https://github.com/OpenTalker/SadTalker"
    revision = "main (pin before production model install)"

    def _root(self) -> Path:
        return ensure_data_dirs()["engines"] / self.engine_id

    def _python(self) -> Path:
        return ensure_data_dirs()["environments"] / self.engine_id / "Scripts" / "python.exe"

    def status(self) -> EngineStatus:
        installed = (self._root() / "inference.py").exists() and self._python().exists()
        models = (self._root() / "checkpoints").exists() and any(
            (self._root() / "checkpoints").glob("*")
        )
        return EngineStatus(
            self.engine_id,
            self.display_name,
            installed,
            models,
            "Install uses the official OpenTalker repository; models are never bundled.",
        )

    def install(self) -> EngineStatus:
        root = self._root()
        root.parent.mkdir(parents=True, exist_ok=True)
        if not root.exists():
            subprocess.run(["git", "clone", "--depth", "1", self.source_url, str(root)], check=True)
        return self.status()

    def ensure_models(self) -> EngineStatus:
        raise RuntimeError(
            "SadTalker model download must be run through setup.ps1 after reviewing upstream model terms."
        )
