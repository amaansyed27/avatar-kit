from __future__ import annotations

import shutil
from pathlib import Path

from app.core.config import data_home, ensure_data_dirs, output_home
from app.db.repository import Repository


def directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


class StorageManager:
    CLEARABLE = {"cache", "temp", "logs"}

    def __init__(self, repo: Repository) -> None:
        self.repo = repo

    def report(self, quick: bool = False) -> dict:
        dirs = ensure_data_dirs()
        output = output_home(self.repo.settings().get("output_directory"))
        categories = []
        if not quick:
            for key, label in (
                ("models", "Model weights"),
                ("environments", "Engine runtimes"),
                ("engines", "Engine source"),
                ("cache", "Download cache"),
                ("temp", "Temporary files"),
                ("logs", "Logs"),
                ("jobs", "Source files"),
                ("database", "Library database"),
            ):
                categories.append({"id": key, "label": label, "bytes": directory_size(dirs[key]), "clearable": key in self.CLEARABLE})
            categories.append({"id": "outputs", "label": "Generated videos", "bytes": directory_size(output), "clearable": False})
        usage = shutil.disk_usage(data_home())
        return {
            "data_directory": str(data_home().resolve()),
            "output_directory": str(output),
            "free_bytes": usage.free,
            "used_bytes": sum(item["bytes"] for item in categories),
            "categories": categories,
        }

    def clear(self, category: str) -> dict:
        if category not in self.CLEARABLE:
            raise ValueError("Only cache, temporary files, and logs can be cleared here")
        target = ensure_data_dirs()[category].resolve()
        root = data_home().resolve()
        if not target.is_relative_to(root) or target == root:
            raise RuntimeError("Refusing to clear a path outside AvatarKit storage")
        removed = directory_size(target)
        for child in target.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
        return {"category": category, "removed_bytes": removed, "storage": self.report()}
