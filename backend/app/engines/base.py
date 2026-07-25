from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


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
