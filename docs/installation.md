# Installation

AvatarKit separates the application from its data directory. Updating the application therefore keeps models, generations, settings, and history intact.

## Windows 11 (fully supported)

Prerequisites are Python 3.12 with the `py` launcher, Node.js 22 or newer, FFmpeg/ffprobe, and Git. Confirm them with:

```powershell
py -3.12 --version
node --version
ffmpeg -version
git --version
```

Install the application core:

```powershell
irm https://raw.githubusercontent.com/amaansyed27/avatar-kit/master/install.ps1 | iex
```

The default application path is `%LOCALAPPDATA%\Programs\AvatarKit`; persistent data is `%LOCALAPPDATA%\AvatarKit`. Start it with:

```powershell
& "$env:LOCALAPPDATA\Programs\AvatarKit\avatarkit.ps1" start
```

Install the large official SadTalker and Chatterbox model stacks afterward:

```powershell
& "$env:LOCALAPPDATA\Programs\AvatarKit\avatarkit.ps1" models
```

Use `doctor`, `verify`, or `stop` in place of `start` for those operations. To install the models during the one-line installation, set `$env:AVATARKIT_INSTALL_MODELS='1'` first.

Custom locations can be selected before running the installer:

```powershell
$env:AVATARKIT_INSTALL_DIR = 'D:\Apps\AvatarKit'
$env:AVATARKIT_DATA_DIR = 'D:\AvatarKitData'
irm https://raw.githubusercontent.com/amaansyed27/avatar-kit/master/install.ps1 | iex
```

## macOS and Linux (core preview)

The browser UI, API, local database, and tests have automated macOS/Linux coverage. SadTalker and Chatterbox installation and inference are not yet release-verified on those platforms, so this is a core preview rather than full talking-avatar support.

```bash
curl -fsSL https://raw.githubusercontent.com/amaansyed27/avatar-kit/master/install.sh | bash
```

Prerequisites are Python 3.11 or 3.12, Node.js 22 or newer, FFmpeg/ffprobe, curl, and tar. The installer prints the exact launch command when complete.

## Updating

Run the same one-line installer again. It replaces application code only and reuses the configured data directory. The Windows installer restores the previous application directory if setup fails.

## Storage

The application core is relatively small. Official engines, Python environments, model caches, and generated videos can consume more than 10 GB. AvatarKit never downloads those models during the default installation.
