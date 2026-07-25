$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$legacyData = Join-Path $env:USERPROFILE '.avatarkit'
if (-not $env:AVATARKIT_HOME -or $env:AVATARKIT_HOME -eq $legacyData) {
    $env:AVATARKIT_HOME = Join-Path $root 'backend\.avatarkit'
}

$all = @(Get-CimInstance Win32_Process)
$targets = @()
foreach ($name in 'backend.pid', 'frontend.pid') {
    $file = Join-Path $env:AVATARKIT_HOME $name
    if (Test-Path -LiteralPath $file) {
        $recordedId = [int](Get-Content -LiteralPath $file)
        $targets += $all | Where-Object ProcessId -eq $recordedId
        Remove-Item -LiteralPath $file -Force
    }
}

$targetIds = @($targets.ProcessId)
do {
    $children = @($all | Where-Object {
        $_.ParentProcessId -in $targetIds -and $_.ProcessId -notin $targetIds
    })
    if ($children) {
        $targets += $children
        $targetIds += $children.ProcessId
    }
} while ($children)

# Catch an orphaned engine process, but only when its command names this exact repository.
$targets += $all | Where-Object {
    $command = [string]$_.CommandLine
    $command -like "*$root*" -and (
        $command -like '*uvicorn app.main:app*' -or
        $command -like '*vite.js preview*' -or
        $command -like '*sadtalker*inference.py*'
    )
}
$targets = @($targets | Sort-Object ProcessId -Unique)

# Stop descendants before their virtual-environment launcher parents.
for ($pass = 0; $pass -lt 8 -and $targets; $pass++) {
    $parentIds = @($targets.ParentProcessId)
    $leaves = @($targets | Where-Object { $_.ProcessId -notin $parentIds })
    foreach ($leaf in $leaves) {
        Stop-Process -Id $leaf.ProcessId -Force -ErrorAction SilentlyContinue
    }
    $leafIds = @($leaves.ProcessId)
    $targets = @($targets | Where-Object { $_.ProcessId -notin $leafIds })
}
foreach ($target in $targets) {
    Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host 'AvatarKit stopped.'
