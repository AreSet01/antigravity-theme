# ============================================================================
# PIXEL GRAVITY uninstaller - restores the original app.asar from backup
# and removes the deployed theme assets.
# ============================================================================
param(
    [switch]$KillRunning
)
$ErrorActionPreference = 'Stop'

$AppDir    = Join-Path $env:LOCALAPPDATA 'Programs\Antigravity'
$Resources = Join-Path $AppDir 'resources'
$Asar      = Join-Path $Resources 'app.asar'
$Backup    = Join-Path $Resources 'app.asar.pixel-backup'
$ThemeDst  = Join-Path $Resources 'pixel-theme'

function Write-Step($msg) { Write-Host "[pixel] $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "[pixel] ERROR: $msg" -ForegroundColor Red; exit 1 }

$procs = @(Get-Process -Name 'Antigravity', 'language_server' -ErrorAction SilentlyContinue)
if ($procs.Count -gt 0) {
    if ($KillRunning) {
        Write-Step "Stopping running Antigravity processes..."
        $procs | Stop-Process -Force -Confirm:$false
        Start-Sleep -Seconds 2
    }
    else {
        Fail "Antigravity is running. Close it (check the tray icon too), or re-run with -KillRunning."
    }
}

if (Test-Path $Backup) {
    Write-Step "Restoring original app.asar from backup..."
    Copy-Item $Backup $Asar -Force
    Remove-Item $Backup -Force -Confirm:$false
}
else {
    Write-Step "No backup found (app.asar.pixel-backup). If an auto-update already replaced app.asar, the patch is gone anyway - nothing to restore."
}

# 清理 4 套主题资源及激活配置
$AllThemes = @('pixel-theme', 'doodle-theme', 'matcha-theme', 'phantom-theme', 'glass-theme')
foreach ($t in $AllThemes) {
    $tDst = Join-Path $Resources $t
    if (Test-Path $tDst) {
        Write-Step "Removing $t assets..."
        Remove-Item $tDst -Recurse -Force -Confirm:$false
    }
}

$ActiveConfigPath = Join-Path $Resources 'active-theme.json'
if (Test-Path $ActiveConfigPath) {
    Remove-Item $ActiveConfigPath -Force -Confirm:$false
}

Write-Step "Done. Antigravity is back to stock."
