# AvatarKit

Local-first talking-avatar software that turns a portrait and speech into an MP4. AvatarKit uses SadTalker for face animation and Chatterbox for consented voice cloning, with local history, diagnostics, compute controls, and no accounts or cloud inference.

## Install

Windows 11 is the fully supported v0.1 platform. Install the core with one command:

```powershell
irm https://raw.githubusercontent.com/amaansyed27/avatar-kit/master/install.ps1 | iex
```

Then start AvatarKit:

```powershell
& "$env:LOCALAPPDATA\Programs\AvatarKit\avatarkit.ps1" start
```

Open `http://127.0.0.1:7865`. Install the multi-gigabyte official engines and models only when you are ready:

```powershell
& "$env:LOCALAPPDATA\Programs\AvatarKit\avatarkit.ps1" models
```

macOS/Linux core preview:

```bash
curl -fsSL https://raw.githubusercontent.com/amaansyed27/avatar-kit/master/install.sh | bash
```

See [the installation guide](docs/installation.md) for prerequisites, custom directories, upgrades, diagnostics, and the precise platform support boundary.

## What works in v0.1

- Portrait plus existing speech to a talking-avatar MP4.
- Portrait plus text and a consented 10–30 second voice reference.
- GPU-first or explicit CPU execution, selectable in Settings.
- Persistent local generation library with playback, download, logs, and deletion.
- Dark cinematic and paper-beige light themes.
- Local diagnostics, cancellable jobs, storage controls, FFmpeg validation, and visible AI watermarking.
- Application/model data separated from source code for safe upgrades.

AvatarKit never substitutes a fabricated result when an engine is unavailable. Diagnostics reports the actual state and generation remains blocked until both engines and their models are ready.

## Requirements

- Windows 11, Python 3.12, Node.js 22+, Git, and FFmpeg/ffprobe.
- An NVIDIA GPU is recommended; CPU mode works but face animation and voice synthesis are substantially slower.
- Model files are not bundled or committed. Upstream licenses and download sizes apply.

The UI/API core is CI-tested on Windows, macOS, and Linux. Model installation and real inference are release-verified only on Windows in v0.1.

## Develop and verify

```powershell
git clone https://github.com/amaansyed27/avatar-kit.git
cd avatar-kit
.\scripts\windows\setup.ps1 -SkipModels
.\scripts\windows\verify.ps1
.\scripts\windows\start.ps1
```

Runtime files remain under `backend\.avatarkit` for a source checkout unless `AVATARKIT_HOME` is set. The public installer instead uses a separate persistent data directory.

## Scope and roadmap

v0.1 does not include live avatars, webcam driving, full-body animation, translation, cloud inference, accounts, or sharing. Planned model expansion includes MuseTalk, LivePortrait, Wav2Lip, and additional local voice engines, followed by production packaging for all three desktop platforms.

## Privacy and responsible use

Use AvatarKit only for yourself or people who have explicitly consented to use of their face and voice. The app requires a consent confirmation and enables a visible AI-generated watermark by default. It contains no celebrity presets, identity discovery, scraping, telemetry, or hidden watermark removal.

## License

AvatarKit source is MIT-licensed. SadTalker, Chatterbox, their dependencies, and downloaded model weights retain their respective upstream licenses. See [NOTICE.md](NOTICE.md).
