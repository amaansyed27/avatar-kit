$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$legacyData = Join-Path $env:USERPROFILE '.avatarkit'
if (-not $env:AVATARKIT_HOME -or $env:AVATARKIT_HOME -eq $legacyData) {
    $env:AVATARKIT_HOME = Join-Path $root 'backend\.avatarkit'
}
$python = Join-Path $env:AVATARKIT_HOME 'environments\backend\Scripts\python.exe'

& $python -m ruff check "$root\backend"
if ($LASTEXITCODE -ne 0) { throw 'Ruff verification failed.' }
& $python -m pytest "$root\backend\tests"
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed.' }
Push-Location "$root\frontend"
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally {
    Pop-Location
}
