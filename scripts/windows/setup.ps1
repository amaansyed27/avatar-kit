[CmdletBinding()]
param([switch]$SkipModels, [switch]$InstallModels, [switch]$Repair, [string]$DataDir, [switch]$CpuOnly, [switch]$NonInteractive)
$ErrorActionPreference = 'Stop'; $root = (Resolve-Path "$PSScriptRoot\..\..").Path
if ($DataDir) { $env:AVATARKIT_HOME = $DataDir } elseif (-not $env:AVATARKIT_HOME) { $env:AVATARKIT_HOME = Join-Path $env:USERPROFILE '.avatarkit' }
'cache','database','engines','environments','jobs','logs','models','outputs','temp' | ForEach-Object { New-Item -ItemType Directory -Force (Join-Path $env:AVATARKIT_HOME $_) | Out-Null }
foreach ($command in 'git','node','npm','ffmpeg','ffprobe') { if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { Write-Warning "$command is missing. Install it from its official source before real generation." } }
$py = (& py -3.12 -c "import sys; print(sys.executable)" 2>$null); if (-not $py) { throw 'Python 3.12 is required for the isolated FastAPI environment.' }
$venv = Join-Path $env:AVATARKIT_HOME 'environments\backend'; if ($Repair -and (Test-Path $venv)) { Remove-Item -Recurse -Force $venv }; if (-not (Test-Path "$venv\Scripts\python.exe")) { & py -3.12 -m venv $venv }
& "$venv\Scripts\python.exe" -m pip install --upgrade pip; & "$venv\Scripts\python.exe" -m pip install -e "$root\backend[dev]"
Push-Location "$root\frontend"; npm install; npm run build; Pop-Location
Write-Host "Core setup complete. Engine/model downloads are explicit and large; run doctor.ps1, then install from Diagnostics or setup.ps1 -InstallModels after reviewing terms."
Write-Host "Start: $root\scripts\windows\start.ps1"
