$ErrorActionPreference = 'Stop'; $root = (Resolve-Path "$PSScriptRoot\..\..").Path; if (-not $env:AVATARKIT_HOME) { $env:AVATARKIT_HOME = Join-Path $root '.avatarkit' }; $python = Join-Path $env:AVATARKIT_HOME 'environments\backend\Scripts\python.exe'
if (-not (Test-Path $python)) { throw 'Run scripts\windows\setup.ps1 first.' }
try { if ((Invoke-WebRequest http://127.0.0.1:7866/api/v1/health -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { Start-Process 'http://127.0.0.1:7865'; exit } } catch {}
$proc = Start-Process $python -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','7866' -WorkingDirectory "$root\backend" -PassThru -WindowStyle Hidden; Set-Content (Join-Path $env:AVATARKIT_HOME 'backend.pid') $proc.Id
Push-Location "$root\frontend"; Start-Process npm -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','7865' -PassThru -WindowStyle Hidden | ForEach-Object { Set-Content (Join-Path $env:AVATARKIT_HOME 'frontend.pid') $_.Id }; Pop-Location
Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:7865'; Write-Host 'AvatarKit: http://127.0.0.1:7865'
