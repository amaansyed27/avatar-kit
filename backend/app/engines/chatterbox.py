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
    revision = "5de7a54aa4e5e2baadb0182dde554908b48b85c2"
    languages: ClassVar[tuple[dict[str, str], ...]] = ({"id": "en", "name": "English"},)

    def _python(self) -> Path:
        return ensure_data_dirs()["environments"] / self.engine_id / "Scripts" / "python.exe"

    def _root(self) -> Path:
        return ensure_data_dirs()["engines"] / self.engine_id

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
        root = self._root()
        root.parent.mkdir(parents=True, exist_ok=True)
        if not root.exists():
            subprocess.run(["git", "clone", self.source_url, str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "checkout", self.revision], check=True)
        # Install from official source because its pyproject pins Perth directly from the
        # upstream repository; the PyPI metadata resolves an incompatible Perth build on Windows.
        subprocess.run([str(python), "-m", "pip", "install", "--upgrade", "pip"], check=True)
        subprocess.run([str(python), "-m", "pip", "install", "--force-reinstall", str(root)], check=True)
        return self.status()

    def ensure_models(self) -> EngineStatus:
        python = self._python(); model_root = ensure_data_dirs()["models"] / "chatterbox"; model_root.mkdir(parents=True, exist_ok=True)
        env = os.environ | {"HF_HOME": str(model_root)}
        code = "from chatterbox.tts import ChatterboxTTS; ChatterboxTTS.from_pretrained(device='cpu')"
        subprocess.run([str(python), "-c", code], check=True, env=env)
        return self.status()
