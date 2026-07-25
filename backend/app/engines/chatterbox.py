from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import ClassVar

from app.core.config import ensure_data_dirs
from app.engines.base import Engine, EngineStatus


class ChatterboxVoiceEngine(Engine):
    engine_id = "chatterbox"
    display_name = "Chatterbox TTS"
    source_url = "https://github.com/resemble-ai/chatterbox"
    revision = "v0.1.2"
    languages: ClassVar[tuple[dict[str, str], ...]] = ({"id": "en", "name": "English"},)

    def _python(self) -> Path:
        return ensure_data_dirs()["environments"] / self.engine_id / "Scripts" / "python.exe"

    def status(self) -> EngineStatus:
        python = self._python()
        installed = python.exists()
        if installed:
            result = subprocess.run(
                [str(python), "-c", "import chatterbox"], capture_output=True, text=True, check=False
            )
            installed = result.returncode == 0
        cache = ensure_data_dirs()["models"] / "chatterbox"
        models_ready = installed and any(cache.rglob("*.safetensors"))
        return EngineStatus(
            self.engine_id,
            self.display_name,
            models_ready,
            installed,
            "Chatterbox downloads its model cache on explicit first synthesis.",
            self.revision,
        )

    def install(self) -> EngineStatus:
        python = self._python()
        python.parent.parent.mkdir(parents=True, exist_ok=True)
        if not python.exists():
            subprocess.run(["py", "-3.12", "-m", "venv", str(python.parent.parent)], check=True)
        subprocess.run([str(python), "-m", "pip", "install", "chatterbox-tts"], check=True)
        return self.status()

    def ensure_models(self) -> EngineStatus:
        python = self._python(); model_root = ensure_data_dirs()["models"] / "chatterbox"; model_root.mkdir(parents=True, exist_ok=True)
        env = os.environ | {"HF_HOME": str(model_root)}
        code = "from chatterbox.tts import ChatterboxTTS; ChatterboxTTS.from_pretrained(device='cpu')"
        subprocess.run([str(python), "-c", code], check=True, env=env)
        return self.status()
