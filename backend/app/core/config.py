from __future__ import annotations

import os
from pathlib import Path


def data_home() -> Path:
    """Return the only location AvatarKit writes user media and runtime state."""
    configured = os.environ.get("AVATARKIT_HOME")
    return Path(configured) if configured else Path.home() / ".avatarkit"


def ensure_data_dirs() -> dict[str, Path]:
    root = data_home()
    names = (
        "cache",
        "database",
        "engines",
        "environments",
        "jobs",
        "logs",
        "models",
        "outputs",
        "temp",
    )
    paths = {name: root / name for name in names}
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths
