[CmdletBinding()]
param(
    [string]$InstallDir = $(if ($env:AVATARKIT_INSTALL_DIR) { $env:AVATARKIT_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\AvatarKit' }),
    [string]$DataDir = $(if ($env:AVATARKIT_DATA_DIR) { $env:AVATARKIT_DATA_DIR } else { Join-Path $env:LOCALAPPDATA 'AvatarKit' }),
    [switch]$InstallModels = ($env:AVATARKIT_INSTALL_MODELS -eq '1')
)

$ErrorActionPreference = 'Stop'
$repo = 'amaansyed27/avatar-kit'
$archive = "https://github.com/$repo/archive/refs/heads/master.zip"

foreach ($required in 'py', 'node', 'npm', 'ffmpeg', 'ffprobe') {
    if (-not (Get-Command $required -ErrorAction SilentlyContinue)) {
        throw "Missing prerequisite '$required'. See https://github.com/$repo#requirements then run this installer again."
    }
}

$python312 = & py -3.12 -c "import sys; print(sys.executable)" 2>$null
if (-not $python312) { throw 'Python 3.12 is required.' }

$resolvedInstall = [System.IO.Path]::GetFullPath($InstallDir)
$resolvedData = [System.IO.Path]::GetFullPath($DataDir)
if ($resolvedInstall -eq [System.IO.Path]::GetPathRoot($resolvedInstall)) { throw 'Refusing to install at a drive root.' }

$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("avatarkit-install-" + [guid]::NewGuid().ToString('N'))
$zip = Join-Path $staging 'source.zip'
$unpacked = Join-Path $staging 'unpacked'
$backup = $null
try {
    New-Item -ItemType Directory -Force -Path $unpacked | Out-Null
    Write-Host 'Downloading AvatarKit...'
    Invoke-WebRequest -Uri $archive -OutFile $zip -UseBasicParsing
    Expand-Archive -LiteralPath $zip -DestinationPath $unpacked
    $source = Get-ChildItem -LiteralPath $unpacked -Directory | Select-Object -First 1
    if (-not $source -or -not (Test-Path (Join-Path $source.FullName 'scripts\windows\setup.ps1'))) {
        throw 'Downloaded archive did not contain a valid AvatarKit release.'
    }
    if (Test-Path -LiteralPath $resolvedInstall) {
        $backup = "$resolvedInstall.previous"
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
        Move-Item -LiteralPath $resolvedInstall -Destination $backup
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $resolvedInstall -Parent) | Out-Null
    Move-Item -LiteralPath $source.FullName -Destination $resolvedInstall
    New-Item -ItemType Directory -Force -Path $resolvedData | Out-Null

    $setupArgs = @{ DataDir = $resolvedData; NonInteractive = $true; SkipModels = (-not $InstallModels) }
    if ($InstallModels) { $setupArgs.InstallModels = $true }
    & (Join-Path $resolvedInstall 'scripts\windows\setup.ps1') @setupArgs

    $launcher = Join-Path $resolvedInstall 'avatarkit.ps1'
    $launcherText = @"
param([ValidateSet('start','stop','doctor','verify','models')][string]`$Command = 'start')
`$env:AVATARKIT_HOME = '$($resolvedData.Replace("'", "''"))'
`$root = '$($resolvedInstall.Replace("'", "''"))'
switch (`$Command) {
  'models' { & "`$root\scripts\windows\setup.ps1" -DataDir `$env:AVATARKIT_HOME -InstallModels }
  default { & "`$root\scripts\windows\`$Command.ps1" }
}
"@
    Set-Content -LiteralPath $launcher -Value $launcherText -Encoding utf8
    if ($backup -and (Test-Path -LiteralPath $backup)) { Remove-Item -LiteralPath $backup -Recurse -Force }
    Write-Host "Installed AvatarKit to $resolvedInstall"
    Write-Host "Data and models: $resolvedData"
    Write-Host 'Opening first-time setup. Choose output storage, compute, and model downloads in the app.'
    & $launcher start
} catch {
    if ($backup -and (Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $resolvedInstall)) {
        Move-Item -LiteralPath $backup -Destination $resolvedInstall
    }
    throw
} finally {
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
