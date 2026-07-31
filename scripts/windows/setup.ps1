[CmdletBinding()]
param([switch]$SkipModels, [switch]$InstallModels, [switch]$Repair, [string]$DataDir, [switch]$CpuOnly, [switch]$NonInteractive)
$ErrorActionPreference = 'Stop'; $root = (Resolve-Path "$PSScriptRoot\..\..").Path
$legacyData = Join-Path $env:USERPROFILE '.avatarkit'; $repoData = Join-Path $root 'backend\.avatarkit'
if ($DataDir) { $env:AVATARKIT_HOME = $DataDir } elseif (-not $env:AVATARKIT_HOME -or $env:AVATARKIT_HOME -eq $legacyData) { $env:AVATARKIT_HOME = $repoData }
'cache','database','engines','environments','jobs','logs','models','outputs','temp' | ForEach-Object { New-Item -ItemType Directory -Force (Join-Path $env:AVATARKIT_HOME $_) | Out-Null }
foreach ($command in 'git','node','npm','ffmpeg','ffprobe') { if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { Write-Warning "$command is missing. Install it from its official source before real generation." } }
$py = (& py -3.12 -c "import sys; print(sys.executable)" 2>$null); if (-not $py -or $LASTEXITCODE -ne 0) { throw 'Python 3.12 is required for the isolated FastAPI environment.' }
$venv = Join-Path $env:AVATARKIT_HOME 'environments\backend'; if ($Repair -and (Test-Path $venv)) { Remove-Item -Recurse -Force $venv }; if (-not (Test-Path "$venv\Scripts\python.exe")) { & py -3.12 -m venv $venv }
if ($LASTEXITCODE -ne 0) { throw 'Backend virtual environment creation failed.' }
& "$venv\Scripts\python.exe" -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Pip upgrade failed.' }
& "$venv\Scripts\python.exe" -m pip install -e "$root\backend[dev]"
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
Push-Location "$root\frontend"
try {
  npm install
  if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }
if ($InstallModels) {
  if ($Repair) {
    'sadtalker-py39','chatterbox' | ForEach-Object { $engineEnv = Join-Path $env:AVATARKIT_HOME "environments\$_"; if (Test-Path $engineEnv) { Remove-Item -Recurse -Force $engineEnv } }
  }
  $apiPython = "$venv\Scripts\python.exe"
  Push-Location "$root\backend"
  try {
    & $apiPython -c "from app.engines.sadtalker import SadTalkerAvatarEngine as E; E().install(); E().ensure_models()"
    if ($LASTEXITCODE -ne 0) { throw 'SadTalker installation failed.' }
    & $apiPython -c "from app.engines.chatterbox import ChatterboxVoiceEngine as E; E().install(); E().ensure_models()"
    if ($LASTEXITCODE -ne 0) { throw 'Chatterbox installation failed.' }
  } finally { Pop-Location }
}
Write-Host "Core setup complete. Use -InstallModels to install verified upstream engines and their large model files."
Write-Host "Start: $root\scripts\windows\start.ps1"
