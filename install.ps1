# ============================================================================
# PIXEL GRAVITY installer for Antigravity 2.x (Windows)
# - Backs up app.asar, patches dist/utils.js to load the pixel theme injector,
#   repacks the asar, and deploys pixel-theme assets next to it.
# - Safe to re-run: if the asar is already patched it only refreshes the
#   theme assets (fast path for CSS edits... though CSS edits alone only
#   need a window reload, not this script).
# - Re-run this script after Antigravity auto-updates (updates restore the
#   stock app.asar and silently remove the theme).
# ============================================================================
param(
    [switch]$KillRunning,
    [ValidateSet("doodle", "pixel", "matcha", "phantom", "glass", "doodle-theme", "pixel-theme", "matcha-theme", "phantom-theme", "glass-theme")]
    [string]$Theme = "phantom"
)
$ErrorActionPreference = 'Stop'

switch -Regex ($Theme) {
    'glass'   { $ThemeName = 'glass-theme';   $ThemeTitle = 'LIQUID GRAVITY (液体玻璃拟态风 [Demo版])'; $ThemeColor = 'Cyan' }
    'pixel'   { $ThemeName = 'pixel-theme';   $ThemeTitle = 'PIXEL GRAVITY (8-Bit 复古像素极客风)'; $ThemeColor = 'Yellow' }
    'matcha'  { $ThemeName = 'matcha-theme';  $ThemeTitle = 'MATCHA GRAVITY (治愈系抹茶日记手帐风)'; $ThemeColor = 'Green' }
    'phantom' { $ThemeName = 'phantom-theme'; $ThemeTitle = 'PHANTOM GRAVITY (Persona 5 潮酷怪盗波普风)'; $ThemeColor = 'Red' }
    default   { $ThemeName = 'doodle-theme';  $ThemeTitle = 'DOODLE GRAVITY (纯线稿漫画手绘风)'; $ThemeColor = 'Magenta' }
}

$AppDir    = Join-Path $env:LOCALAPPDATA 'Programs\Antigravity'
$Resources = Join-Path $AppDir 'resources'
$Asar      = Join-Path $Resources 'app.asar'
$Backup    = Join-Path $Resources 'app.asar.pixel-backup'
$Injector  = Join-Path $PSScriptRoot 'patch\pixelTheme.js'
$Work      = Join-Path $env:TEMP ('theme-gravity-' + [guid]::NewGuid().ToString('N').Substring(0, 8))

function Write-Step($msg) { Write-Host "[theme] $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "[theme] ERROR: $msg" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $Asar))     { Fail "app.asar not found at $Asar - is Antigravity installed?" }
if (-not (Test-Path $Injector)) { Fail "patch\pixelTheme.js not found next to this script." }

# --- 1. Make sure Antigravity is not running (asar is locked while it runs) ---
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

# --- 2. Extract the current asar ---
Write-Step "Extracting app.asar..."
npx --yes @electron/asar extract $Asar $Work
if ($LASTEXITCODE -ne 0) { Fail "asar extract failed (is Node.js installed?)" }

$UtilsPath = Join-Path $Work 'dist\utils.js'
if (-not (Test-Path $UtilsPath)) { Fail "dist/utils.js not found inside app.asar - app layout changed?" }
$Utils = [System.IO.File]::ReadAllText($UtilsPath)

$PackedInjector = Join-Path $Work 'dist\pixelTheme.js'
$AlreadyPatched = $Utils.Contains('pixelTheme')
$NeedsRepack = $false

if ($AlreadyPatched) {
    # utils.js is already wired up, but the injector itself may have changed
    # since the last install - compare and refresh it if so. (Skipping this
    # is why a plain re-run used to silently ship a stale injector.)
    $packedHash = if (Test-Path $PackedInjector) { (Get-FileHash $PackedInjector).Hash } else { '' }
    if ($packedHash -ne (Get-FileHash $Injector).Hash) {
        Write-Step "app.asar is patched, but the injector changed - updating it."
        Copy-Item $Injector $PackedInjector -Force
        $NeedsRepack = $true
    }
    else {
        Write-Step "app.asar is already patched and up to date - refreshing theme assets only."
    }
}
else {
    # --- 3. Patch dist/utils.js at four stable anchors ---
    $A1 = 'const loadingOverlay_1 = require("./loadingOverlay");'
    $A2 = '(0, loadingOverlay_1.attachLoadingOverlay)(win, foregroundColor, backgroundColor);'
    $A3 = 'void win.loadURL(url);'
    #  A4/A5 feed pixel colors into the BrowserWindow constructor. These two
    #  values become titleBarOverlay.color/symbolColor - the OS-drawn caption
    #  buttons - and the window's own backgroundColor. Setting them here rather
    #  than calling setTitleBarOverlay() afterwards avoids a timing window where
    #  Windows paints the stock near-white strip, and kills the startup flash.
    #  Kept as two single-line anchors on purpose: a multi-line anchor would
    #  match only if this script's line endings happened to match utils.js.
    $A4 = "const backgroundColor = isLight ? '#FAFAFA' : '#131313';"
    $A5 = "const foregroundColor = isLight ? '#383A42' : '#FAFAFA';"
    #  A6 switches off Windows' own caption buttons. The surrounding code is
    #    titleBarOverlay: isMacOS() ? false : { color, symbolColor, height }
    #  so making the condition true yields `false` - no native buttons - and
    #  the page draws pixel ones instead. Left as a condition rather than a
    #  literal so `--px-native-caption: on` can hand them back without a
    #  different patch.
    $A6 = 'titleBarOverlay: isMacOS()'
    foreach ($a in @($A1, $A2, $A3, $A4, $A5, $A6)) {
        if (-not $Utils.Contains($a)) {
            Fail "Patch anchor not found in utils.js (app version too new?). Nothing was modified. Anchor: $a"
        }
    }
    Write-Step "Patching dist/utils.js..."
    $Utils = $Utils.Replace($A1, $A1 + "`nconst pixelTheme_1 = require(`"./pixelTheme`");")
    $Utils = $Utils.Replace($A2, '(0, pixelTheme_1.attachPixelLoadingOverlay)(win, foregroundColor, backgroundColor);')
    $Utils = $Utils.Replace($A3, "(0, pixelTheme_1.attachPixelTheme)(win);`n    " + $A3)
    $Utils = $Utils.Replace($A4, "const pixelChrome_1 = (0, pixelTheme_1.chromeColors)(isLight);`n    const backgroundColor = pixelChrome_1.background;")
    $Utils = $Utils.Replace($A5, 'const foregroundColor = pixelChrome_1.foreground;')
    $Utils = $Utils.Replace($A6, 'titleBarOverlay: !(0, pixelTheme_1.wantsNativeCaption)() || isMacOS()')
    [System.IO.File]::WriteAllText($UtilsPath, $Utils, (New-Object System.Text.UTF8Encoding($false)))

    # --- 3b. Silence the app's own titlebar-overlay IPC when the overlay is off ---
    #  Antigravity's UI calls window:set-title-bar-overlay to keep the caption
    #  in sync with its theme. With native caption buttons disabled that call
    #  throws "Titlebar overlay is not enabled" and spams the log. Guard it on a
    #  flag the injector sets on the window, so ipcHandlers needs no new import.
    $HandlersPath = Join-Path $Work 'dist\ipcHandlers.js'
    if (Test-Path $HandlersPath) {
        $Handlers = [System.IO.File]::ReadAllText($HandlersPath)
        $H1 = "if (win && process.platform === 'win32') {"
        if ($Handlers.Contains($H1)) {
            $Handlers = $Handlers.Replace($H1, "if (win && process.platform === 'win32' && !win.__pixelNoNativeCaption) {")
            [System.IO.File]::WriteAllText($HandlersPath, $Handlers, (New-Object System.Text.UTF8Encoding($false)))
        }
        else {
            Write-Step "note: titlebar IPC guard anchor not found - harmless log noise may appear."
        }
    }

    Copy-Item $Injector $PackedInjector -Force

    # --- 4. Back up the pristine asar before we overwrite it ---
    #  Only on a fresh patch: re-running must never overwrite the backup
    #  with an already-patched asar, or uninstall would have nothing to
    #  restore to.
    Write-Step "Backing up app.asar -> app.asar.pixel-backup"
    Copy-Item $Asar $Backup -Force
    $NeedsRepack = $true
}

if ($NeedsRepack) {
    Write-Step "Repacking app.asar..."
    $NewAsar = "$Asar.pixel-new"
    npx --yes @electron/asar pack $Work $NewAsar
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $NewAsar)) { Fail "asar pack failed - app.asar was NOT modified." }
    Move-Item $NewAsar $Asar -Force
}

# --- 5. Deploy all theme assets (outside the asar, freely editable) ---
$AllThemes = @('pixel-theme', 'doodle-theme', 'matcha-theme', 'phantom-theme', 'glass-theme')
foreach ($t in $AllThemes) {
    $src = Join-Path $PSScriptRoot $t
    if (Test-Path $src) {
        Write-Step "Deploying $t assets to resources\$t..."
        $dst = Join-Path $Resources $t
        if (Test-Path $dst) { Remove-Item $dst -Recurse -Force -Confirm:$false }
        Copy-Item $src $dst -Recurse
    }
}

# Write active theme config
$ActiveConfig = @{ theme = $ThemeName } | ConvertTo-Json
$ActiveConfigPath = Join-Path $Resources 'active-theme.json'
[System.IO.File]::WriteAllText($ActiveConfigPath, $ActiveConfig, (New-Object System.Text.UTF8Encoding($false)))
Write-Step "Active theme set to: $ThemeName"

# --- 6. Cleanup ---
Remove-Item $Work -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  +-------------------------------------------------------------+" -ForegroundColor Yellow
Write-Host "  |  $ThemeTitle installed! " -ForegroundColor $ThemeColor
Write-Host "  |  Launch or reload (Ctrl+R) Antigravity to see your theme!   |" -ForegroundColor White
Write-Host "  |                                                             |" -ForegroundColor Yellow
Write-Host "  |  Switch theme anytime:                                      |" -ForegroundColor Cyan
Write-Host "  |    .\switch-theme.ps1 phantom  (Persona 5 潮酷怪盗风)       |" -ForegroundColor Red
Write-Host "  |    .\switch-theme.ps1 matcha   (治愈系抹茶日记手帐风)       |" -ForegroundColor Green
Write-Host "  |    .\switch-theme.ps1 doodle   (纯线稿漫画粉印手绘风)       |" -ForegroundColor Magenta
Write-Host "  |    .\switch-theme.ps1 pixel    (8-Bit 复古像素极客风)       |" -ForegroundColor Yellow
Write-Host "  |    .\switch-theme.ps1 glass    (液体玻璃拟态风 [Demo版])    |" -ForegroundColor Cyan
Write-Host "  +-------------------------------------------------------------+" -ForegroundColor Yellow
Write-Host ""
