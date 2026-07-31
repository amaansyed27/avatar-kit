from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class EngineStatus:
    engine_id: str
    display_name: str
    installed: bool
    models_ready: bool
    detail: str
    version: str | None = None


class Engine(ABC):
    engine_id: str
    display_name: str

    @abstractmethod
    def status(self) -> EngineStatus: ...

    @abstractmethod
    def install(self) -> EngineStatus: ...

    @abstractmethod
    def ensure_models(self) -> EngineStatus: ...


def venv_python(environment: Path) -> Path:
    """Return the interpreter path for a virtual environment on this platform."""
    if os.name == "nt":
        return environment / "Scripts" / "python.exe"
    return environment / "bin" / "python"
