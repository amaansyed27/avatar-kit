from __future__ import annotations

import subprocess
import urllib.request
from pathlib import Path
from typing import ClassVar

from app.core.config import ensure_data_dirs
from app.engines.base import Engine, EngineStatus, venv_python


class SadTalkerAvatarEngine(Engine):
    engine_id = "sadtalker"
    display_name = "SadTalker"
    source_url = "https://github.com/OpenTalker/SadTalker"
    revision = "cd4c0465ae0b54a6f85af57f5c65fec9fe23e7f8"
    model_urls: ClassVar[dict[str, str]] = {
        "mapping_00109-model.pth.tar": "https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/mapping_00109-model.pth.tar",
        "mapping_00229-model.pth.tar": "https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/mapping_00229-model.pth.tar",
        "SadTalker_V0.0.2_256.safetensors": "https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/SadTalker_V0.0.2_256.safetensors",
        "SadTalker_V0.0.2_512.safetensors": "https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/SadTalker_V0.0.2_512.safetensors",
    }

    def _root(self) -> Path:
        return ensure_data_dirs()["engines"] / self.engine_id

    def _python(self) -> Path:
        return venv_python(ensure_data_dirs()["environments"] / "sadtalker-py39")

    def status(self) -> EngineStatus:
        installed = (self._root() / "inference.py").exists() and self._python().exists()
        if installed:
            check = subprocess.run(
                [str(self._python()), "-c", "import torch, face_alignment, gfpgan"],
                capture_output=True, text=True, check=False,
            )
            installed = check.returncode == 0
        models = all((self._root() / "checkpoints" / filename).is_file() for filename in self.model_urls)
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
            subprocess.run(["git", "clone", self.source_url, str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "checkout", self.revision], check=True)
        python = self._python()
        if not python.exists():
            subprocess.run(["py", "-3.9", "-m", "venv", str(python.parent.parent)], check=True)
        subprocess.run([str(python), "-m", "pip", "install", "--upgrade", "pip"], check=True)
        # Official SadTalker requirements build extensions that import torch at build time.
        # Install a CUDA-capable wheel first; users selecting CPU can still pass --device cpu.
        subprocess.run(
            [
                str(python),
                "-m",
                "pip",
                "install",
                "torch==2.7.1+cu128",
                "torchvision==0.22.1+cu128",
                "torchaudio==2.7.1+cu128",
                "--index-url",
                "https://download.pytorch.org/whl/cu128",
            ],
            check=True,
        )
        # Current lmdb releases no longer publish a CPython 3.8 Windows wheel.
        # Keep the last compatible binary wheel to avoid an unreliable local C build.
        subprocess.run([str(python), "-m", "pip", "install", "lmdb==1.4.1"], check=True)
        subprocess.run([str(python), "-m", "pip", "install", "-r", str(root / "requirements.txt")], check=True)
        # BasicSR 1.4.2 imports a torchvision module removed in modern CUDA builds.
        # The public rgb_to_grayscale function remains available at this stable location.
        degradation = (
            python.parent.parent
            / "Lib"
            / "site-packages"
            / "basicsr"
            / "data"
            / "degradations.py"
        )
        if degradation.is_file():
            original = "from torchvision.transforms.functional_tensor import rgb_to_grayscale"
            replacement = "from torchvision.transforms.functional import rgb_to_grayscale"
            source = degradation.read_text(encoding="utf-8")
            if original in source:
                degradation.write_text(source.replace(original, replacement), encoding="utf-8")
        return self.status()

    def ensure_models(self) -> EngineStatus:
        directory = self._root() / "checkpoints"; directory.mkdir(parents=True, exist_ok=True)
        for filename, url in self.model_urls.items():
            target = directory / filename
            if not target.is_file() or target.stat().st_size < 1024:
                temporary = target.with_suffix(target.suffix + ".part")
                urllib.request.urlretrieve(url, temporary)
                temporary.replace(target)
        return self.status()
