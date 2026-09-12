# ============================================================================
# PIXEL GRAVITY - 一键极速切换主题脚本 (4 套主题秒级生效)
# 支持主题：phantom (P5怪盗) | matcha (日式抹茶) | doodle (漫画粉印) | pixel (复古像素)
# 特性：无需重启 Antigravity，无需重新打包 asar，自动同步本地最新 CSS，CDP 自动刷新！
# ============================================================================
param(
    [ValidateSet("phantom", "matcha", "doodle", "pixel", "phantom-theme", "matcha-theme", "doodle-theme", "pixel-theme", "")]
    [string]$Theme = ""
)
$ErrorActionPreference = 'Stop'

$ThemesMeta = @{
    "phantom" = @{ Name = "phantom-theme"; Title = "PHANTOM GRAVITY (Persona 5 潮酷怪盗波普风)"; Color = "Red"; File = "phantom.css" }
    "matcha"  = @{ Name = "matcha-theme";  Title = "MATCHA GRAVITY (治愈系抹茶日记手帐风)";    Color = "Green"; File = "matcha.css" }
    "doodle"  = @{ Name = "doodle-theme";  Title = "DOODLE GRAVITY (纯线稿漫画粉印手绘风)";    Color = "Magenta"; File = "doodle.css" }
    "pixel"   = @{ Name = "pixel-theme";   Title = "PIXEL GRAVITY (8-Bit 复古像素极客风)";      Color = "Yellow"; File = "pixel.css" }
}

# 交互式选择菜单（如果未传参）
if ([string]::IsNullOrWhiteSpace($Theme)) {
    Write-Host ""
    Write-Host "  =======================================================" -ForegroundColor Cyan
    Write-Host "              Antigravity 2.x 主题极速切换面板" -ForegroundColor Yellow
    Write-Host "  =======================================================" -ForegroundColor Cyan
    Write-Host "   [1] phantom  - Persona 5 潮酷怪盗波普风 (红黑白/红白波普/警戒斜纹)" -ForegroundColor Red
    Write-Host "   [2] matcha   - 治愈系抹茶日记手帐风 (抹茶绿/和纸白/便签书签)" -ForegroundColor Green
    Write-Host "   [3] doodle   - 纯线稿漫画粉印手绘风 (粉白红印/分镜直角/微动效)" -ForegroundColor Magenta
    Write-Host "   [4] pixel    - 8-Bit 复古像素极客风 (Sweetie-16/CRT扫描线/方块滑块)" -ForegroundColor Yellow
    Write-Host "  =======================================================" -ForegroundColor Cyan
    $choice = Read-Host " 请输入编号或主题名称 [1-4 / phantom / matcha / doodle / pixel] (默认 1)"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }
    
    switch ($choice.Trim().ToLower()) {
        "1" { $Theme = "phantom" }
        "2" { $Theme = "matcha" }
        "3" { $Theme = "doodle" }
        "4" { $Theme = "pixel" }
        default { $Theme = $choice.Trim().ToLower() }
    }
}

# 规范化主题名称
$Key = $Theme.Replace("-theme", "").ToLower()
if (-not $ThemesMeta.ContainsKey($Key)) {
    Write-Host "[theme] 未知主题: '$Theme'，有效主题为: phantom, matcha, doodle, pixel" -ForegroundColor Red
    exit 1
}

$CurrentMeta = $ThemesMeta[$Key]
$ThemeName  = $CurrentMeta.Name
$ThemeTitle = $CurrentMeta.Title
$ThemeColor = $CurrentMeta.Color

$AppDir    = Join-Path $env:LOCALAPPDATA 'Programs\Antigravity'
$Resources = Join-Path $AppDir 'resources'

if (-not (Test-Path $Resources)) {
    Write-Host "[theme] 错误: 未在 $Resources 找到 Antigravity resources 目录。" -ForegroundColor Red
    exit 1
}

# 1. 同步本地主题文件到 resources 目录（确保最新编辑实时生效）
$LocalSrc = Join-Path $PSScriptRoot $ThemeName
$TargetDst = Join-Path $Resources $ThemeName

if (Test-Path $LocalSrc) {
    Write-Host "[theme] 正在同步本地 $ThemeName 资源..." -ForegroundColor Cyan
    if (-not (Test-Path $TargetDst)) {
        New-Item -ItemType Directory -Path $TargetDst -Force | Out-Null
    }
    Copy-Item "$LocalSrc\*" $TargetDst -Recurse -Force
}

# 2. 写入 active-theme.json 配置
$ActiveConfig = @{ theme = $ThemeName } | ConvertTo-Json
$ActiveConfigPath = Join-Path $Resources 'active-theme.json'
[System.IO.File]::WriteAllText($ActiveConfigPath, $ActiveConfig, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "  +-------------------------------------------------------------+" -ForegroundColor Yellow
Write-Host "  |  主题已成功切换为:                                          |" -ForegroundColor White
Write-Host "  |  $ThemeTitle" -ForegroundColor $ThemeColor
Write-Host "  +-------------------------------------------------------------+" -ForegroundColor Yellow

# 3. 尝试通过 DevToolsActivePort CDP 自动向运行中的 Antigravity 发送热重载指令
$PortFile = Join-Path $env:APPDATA 'Antigravity\DevToolsActivePort'
$Reloaded = $false

if (Test-Path $PortFile) {
    try {
        $Port = (Get-Content $PortFile)[0].Trim()
        $NodeScript = @"
const http = require('http');
http.get('http://127.0.0.1:$Port/json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const list = JSON.parse(data);
      const page = list.find(x => x.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({ id: 1, method: 'Page.reload' }));
          setTimeout(() => process.exit(0), 300);
        };
        ws.onerror = () => process.exit(1);
      } else { process.exit(1); }
    } catch(e) { process.exit(1); }
  });
}).on('error', () => process.exit(1));
"@
        $TempJs = Join-Path $env:TEMP 'theme_hot_reload.js'
        [System.IO.File]::WriteAllText($TempJs, $NodeScript, (New-Object System.Text.UTF8Encoding($false)))
        $proc = Start-Process -FilePath 'node' -ArgumentList "`"$TempJs`"" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
        if ($proc.ExitCode -eq 0) {
            $Reloaded = $true
        }
        Remove-Item $TempJs -Force -ErrorAction SilentlyContinue
    } catch {}
}

if ($Reloaded) {
    Write-Host "  >>> [CDP 自动重载成功] Antigravity 窗口已瞬间刷新为您切换的主题！<<<" -ForegroundColor Green
} else {
    Write-Host "  >>> 提示: 如果 Antigravity 已打开，按 Ctrl + R 即可立即秒级生效！<<<" -ForegroundColor Cyan
}
Write-Host ""
