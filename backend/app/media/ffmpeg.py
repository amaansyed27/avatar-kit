from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from app.core.config import ensure_data_dirs


class MediaError(RuntimeError):
    pass


class FFmpegService:
    def __init__(self) -> None:
        managed = ensure_data_dirs()["engines"] / "ffmpeg" / "ffmpeg.exe"
        self.ffmpeg = str(managed) if managed.is_file() else shutil.which("ffmpeg")
        self.ffprobe = shutil.which("ffprobe")

    def available(self) -> bool:
        return bool(self.ffmpeg and self.ffprobe)

    def probe(self, path: Path) -> dict:
        if not self.ffprobe:
            raise MediaError("FFPROBE_UNAVAILABLE")
        result = subprocess.run(
            [
                self.ffprobe,
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode or not result.stdout:
            raise MediaError("CORRUPT_MEDIA")
        return json.loads(result.stdout)

    def validate_image(self, path: Path) -> dict:
        data = self.probe(path)
        stream = next(
            (item for item in data.get("streams", []) if item.get("codec_type") == "video"), None
        )
        if not stream or not stream.get("width") or not stream.get("height"):
            raise MediaError("UNSUPPORTED_IMAGE")
        return {"width": stream["width"], "height": stream["height"]}

    def validate_audio(self, path: Path) -> float:
        data = self.probe(path)
        if not any(item.get("codec_type") == "audio" for item in data.get("streams", [])):
            raise MediaError("NO_AUDIO_STREAM")
        return float(data["format"].get("duration") or 0)

    def normalize_audio(self, source: Path, destination: Path) -> None:
        if not self.ffmpeg:
            raise MediaError("FFMPEG_UNAVAILABLE")
        destination.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            [
                self.ffmpeg,
                "-y",
                "-i",
                str(source),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                str(destination),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode:
            raise MediaError("AUDIO_NORMALIZATION_FAILED")

    def verify_output(self, path: Path) -> dict:
        if not path.exists() or path.stat().st_size < 1024:
            raise MediaError("INVALID_OUTPUT")
        data = self.probe(path)
        streams = data.get("streams", [])
        video = next((s for s in streams if s.get("codec_type") == "video"), None)
        audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
        if (
            not video
            or not audio
            or video.get("codec_name") != "h264"
            or audio.get("codec_name") != "aac"
        ):
            raise MediaError("INVALID_OUTPUT")
        return {
            "duration": float(data["format"].get("duration") or 0),
            "resolution": f"{video['width']}x{video['height']}",
        }
