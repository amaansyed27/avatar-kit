# AvatarKit v0.1.0

AvatarKit is a local-first Windows application for creating a talking-avatar MP4 from a portrait plus speech, or from a portrait, text, and a consented voice reference. It uses SadTalker for face animation and Chatterbox TTS for cloned speech. No accounts, keys, telemetry, or cloud inference are part of this application.

## Current status

The application shell, local API, persistent SQLite settings/history, diagnostics, FFmpeg validation, job states, cancellation endpoint, and Windows scripts are implemented. Real model generation is deliberately blocked until each official engine and its models have been explicitly installed and verified. It never substitutes a fabricated video for a missing engine.

SadTalker is isolated because upstream documents Python 3.8; Chatterbox documents Python 3.11. The FastAPI application runs from its own Python 3.12 environment. Engine revisions and sources are recorded in `runners/*/manifest.json` and notices are in `NOTICE.md`.

## Quick start (Windows)

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\windows\setup.ps1 -SkipModels
.\scripts\windows\start.ps1
```

Open `http://127.0.0.1:7865`. Use **Diagnostics** to inspect actual local availability. Runtime files are under `.avatarkit` inside this repository by default; set `AVATARKIT_HOME` before setup to change it. `stop.ps1` stops only recorded AvatarKit process IDs; `clean-cache.ps1` retains jobs, outputs, models, and the database.

## Using it

1. On **Create**, add a clear, front-facing portrait.
2. Use **Existing speech** for audio containing the exact words, or **Clone from text** with a clean 10–30 second reference.
3. Choose Fast test, Balanced, or Best quality; watermarking is enabled by default.
4. Confirm you own or have consent for the face and voice, then generate once Diagnostics reports verified engines/models.

All media must remain local. Only explicit engine/model installation uses the network. Delete a job to remove associated local files; generated history detects missing files rather than crashing.

## Requirements and limits

- Windows 11, Git, Node.js, Python 3.12, FFmpeg/ffprobe, and preferably NVIDIA CUDA.
- RTX 5060 Laptop GPU (8 GB VRAM) is the target. Use **Fast test** if GPU memory is constrained.
- Model files are intentionally not committed. Their sizes and licenses are upstream-specific and must be reviewed before download.
- v0.1 does not include live avatars, webcam driving, full-body animation, MuseTalk, LivePortrait, Wav2Lip, cloud inference, accounts, sharing, or mobile apps.

## Verification

```powershell
.\scripts\windows\verify.ps1
```

## Planned roadmap (not implemented)

- v0.2 MuseTalk lip-sync; v0.3 LivePortrait expressions; v0.4 additional voice engines.
- v0.5 video/full-body input; v0.6 real-time microphone/webcam; v0.7 dubbing/translation.
- v1.0 local or BYOK conversational avatars.

## Privacy and responsible use

AvatarKit is designed only for the user or people who have explicitly consented. It includes a required consent confirmation and a visible AI-generated watermark enabled by default. It does not include celebrity presets, identity discovery, scraping, or hidden watermark removal.
