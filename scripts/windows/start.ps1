$ErrorActionPreference = 'Stop'; $root = (Resolve-Path "$PSScriptRoot\..\..").Path; $legacyData = Join-Path $env:USERPROFILE '.avatarkit'; if (-not $env:AVATARKIT_HOME -or $env:AVATARKIT_HOME -eq $legacyData) { $env:AVATARKIT_HOME = Join-Path $root 'backend\.avatarkit' }; $python = Join-Path $env:AVATARKIT_HOME 'environments\backend\Scripts\python.exe'
if (-not (Test-Path $python)) { throw 'Run scripts\windows\setup.ps1 first.' }
try { if ((Invoke-WebRequest http://127.0.0.1:7866/api/v1/health -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { Start-Process 'http://127.0.0.1:7865'; exit } } catch {}
$proc = Start-Process $python -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','7866' -WorkingDirectory "$root\backend" -PassThru -WindowStyle Hidden; Set-Content (Join-Path $env:AVATARKIT_HOME 'backend.pid') $proc.Id
$node = (Get-Command node -ErrorAction Stop).Source; $vite = Join-Path $root 'frontend\node_modules\vite\bin\vite.js'
if (-not (Test-Path $vite)) { throw 'Frontend dependencies are missing. Run setup.ps1 first.' }
$frontend = Start-Process $node -ArgumentList $vite,'preview','--host','127.0.0.1','--port','7865','--strictPort' -WorkingDirectory "$root\frontend" -PassThru -WindowStyle Hidden
Set-Content (Join-Path $env:AVATARKIT_HOME 'frontend.pid') $frontend.Id
$ready = $false; for ($attempt = 0; $attempt -lt 20; $attempt++) { try { if ((Invoke-WebRequest http://127.0.0.1:7865 -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { $ready = $true; break } } catch { Start-Sleep -Milliseconds 500 } }
if (-not $ready) { throw 'AvatarKit frontend did not become ready. Run doctor.ps1 and check the frontend build.' }
Start-Process 'http://127.0.0.1:7865'; Write-Host 'AvatarKit: http://127.0.0.1:7865'
