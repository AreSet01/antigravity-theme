#!/usr/bin/env bash
# ============================================================================
# ANTIGRAVITY THEME installer for Antigravity 2.x (macOS)
# - Backs up app.asar, patches dist/utils.js to load the theme injector,
#   repacks the asar, re-signs the app bundle, and deploys theme assets.
# - Safe to re-run: if the asar is already patched it only refreshes the
#   theme assets.
# - Re-run this script after Antigravity auto-updates.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color output helpers
CYAN='\033[0;36m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

write_step() { echo -e "${CYAN}[theme] $1${NC}"; }
fail() { echo -e "${RED}[theme] ERROR: $1${NC}" >&2; exit 1; }

# Parse arguments
KILL_RUNNING=0
THEME="phantom"
CUSTOM_APP_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -k|--kill|-KillRunning)
      KILL_RUNNING=1
      shift
      ;;
    -t|--theme|-Theme)
      THEME="$2"
      shift 2
      ;;
    --app)
      CUSTOM_APP_PATH="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: ./install.sh [options]"
      echo ""
      echo "Options:"
      echo "  -t, --theme <theme>   Theme to install: phantom (default), matcha, doodle, pixel, glass"
      echo "  -k, --kill            Automatically terminate running Antigravity processes"
      echo "  --app <path>          Custom path to Antigravity.app"
      echo "  -h, --help            Show this help message"
      exit 0
      ;;
    *)
      THEME="$1"
      shift
      ;;
  esac
done

# Normalize theme
THEME_LOWER="$(echo "$THEME" | tr '[:upper:]' '[:lower:]')"
case "$THEME_LOWER" in
  glass|glass-theme)
    THEME_NAME="glass-theme"
    THEME_TITLE="LIQUID GRAVITY (液体玻璃拟态风 [Demo版])"
    THEME_COLOR="${CYAN}"
    ;;
  pixel|pixel-theme)
    THEME_NAME="pixel-theme"
    THEME_TITLE="PIXEL GRAVITY (8-Bit 复古像素极客风)"
    THEME_COLOR="${YELLOW}"
    ;;
  matcha|matcha-theme)
    THEME_NAME="matcha-theme"
    THEME_TITLE="MATCHA GRAVITY (治愈系抹茶日记手帐风)"
    THEME_COLOR="${GREEN}"
    ;;
  phantom|phantom-theme)
    THEME_NAME="phantom-theme"
    THEME_TITLE="PHANTOM GRAVITY (Persona 5 潮酷怪盗波普风)"
    THEME_COLOR="${RED}"
    ;;
  doodle|doodle-theme|*)
    THEME_NAME="doodle-theme"
    THEME_TITLE="DOODLE GRAVITY (纯线稿漫画粉印手绘风)"
    THEME_COLOR="${MAGENTA}"
    ;;
esac

# 1. Locate Antigravity.app
if [[ -n "$CUSTOM_APP_PATH" ]]; then
  APP_DIR="$CUSTOM_APP_PATH"
elif [[ -d "/Applications/Antigravity.app" ]]; then
  APP_DIR="/Applications/Antigravity.app"
elif [[ -d "$HOME/Applications/Antigravity.app" ]]; then
  APP_DIR="$HOME/Applications/Antigravity.app"
else
  fail "Antigravity.app not found in /Applications or ~/Applications. Is Antigravity installed?"
fi

RESOURCES="$APP_DIR/Contents/Resources"
ASAR="$RESOURCES/app.asar"
BACKUP="$RESOURCES/app.asar.pixel-backup"
INJECTOR="$SCRIPT_DIR/patch/pixelTheme.js"

if [[ ! -f "$ASAR" ]]; then
  fail "app.asar not found at $ASAR"
fi
if [[ ! -f "$INJECTOR" ]]; then
  fail "patch/pixelTheme.js not found at $INJECTOR"
fi

# Ensure node is available
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js is required but was not found in PATH."
fi

# Resolve asar tool
ASAR_CMD=""
if [[ -x "$SCRIPT_DIR/node_modules/.bin/asar" ]]; then
  ASAR_CMD="$SCRIPT_DIR/node_modules/.bin/asar"
elif command -v asar >/dev/null 2>&1; then
  ASAR_CMD="asar"
else
  ASAR_CMD="npx --yes @electron/asar"
fi

# 2. Check if Antigravity is running
if pgrep -f "Antigravity.app" >/dev/null 2>&1 || pgrep -x "Antigravity" >/dev/null 2>&1; then
  if [[ "$KILL_RUNNING" -eq 1 ]]; then
    write_step "Stopping running Antigravity processes..."
    pkill -f "Antigravity.app" 2>/dev/null || true
    pkill -x "Antigravity" 2>/dev/null || true
    sleep 2
  else
    fail "Antigravity is currently running. Please close it completely, or run with -k / --kill."
  fi
fi

# 3. Prepare workspace and extract asar
WORK_DIR="$(mktemp -d -t antigravity_theme_work_XXXXXX)"
cleanup() {
  if [[ -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
  fi
}
trap cleanup EXIT

write_step "Extracting app.asar..."
$ASAR_CMD extract "$ASAR" "$WORK_DIR"

UTILS_PATH="$WORK_DIR/dist/utils.js"
if [[ ! -f "$UTILS_PATH" ]]; then
  fail "dist/utils.js not found inside app.asar - application structure may have changed."
fi

PACKED_INJECTOR="$WORK_DIR/dist/pixelTheme.js"
NEEDS_REPACK=0

# Check if already patched
if grep -q "pixelTheme" "$UTILS_PATH"; then
  # utils.js is already patched; check if injector changed
  if [[ -f "$PACKED_INJECTOR" ]] && cmp -s "$INJECTOR" "$PACKED_INJECTOR"; then
    write_step "app.asar is already patched and up to date - refreshing theme assets only."
  else
    write_step "app.asar is patched, but injector changed - updating pixelTheme.js..."
    cp -f "$INJECTOR" "$PACKED_INJECTOR"
    NEEDS_REPACK=1
  fi
else
  write_step "Patching dist/utils.js..."
  # Use node for safe substring replacement without regex/encoding pitfalls
  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    let code = fs.readFileSync(p, 'utf8');

    const A1 = 'const loadingOverlay_1 = require(\"./loadingOverlay\");';
    const A2 = '(0, loadingOverlay_1.attachLoadingOverlay)(win, foregroundColor, backgroundColor);';
    const A3 = 'void win.loadURL(url);';
    const A4 = \"const backgroundColor = isLight ? '#FAFAFA' : '#131313';\";
    const A5 = \"const foregroundColor = isLight ? '#383A42' : '#FAFAFA';\";
    const A6 = 'titleBarOverlay: isMacOS()';

    const anchors = [A1, A2, A3, A4, A5, A6];
    for (const a of anchors) {
      if (!code.includes(a)) {
        console.error('Missing anchor:', a);
        process.exit(2);
      }
    }

    code = code.replace(A1, A1 + '\nconst pixelTheme_1 = require(\"./pixelTheme\");');
    code = code.replace(A2, '(0, pixelTheme_1.attachPixelLoadingOverlay)(win, foregroundColor, backgroundColor);');
    code = code.replace(A3, '(0, pixelTheme_1.attachPixelTheme)(win);\n    ' + A3);
    code = code.replace(A4, 'const pixelChrome_1 = (0, pixelTheme_1.chromeColors)(isLight);\n    const backgroundColor = pixelChrome_1.background;');
    code = code.replace(A5, 'const foregroundColor = pixelChrome_1.foreground;');
    code = code.replace(A6, 'titleBarOverlay: !(0, pixelTheme_1.wantsNativeCaption)() || isMacOS()');

    fs.writeFileSync(p, code, 'utf8');
  " "$UTILS_PATH" || fail "Failed to patch dist/utils.js - anchor mismatch."

  # Patch ipcHandlers.js if present
  HANDLERS_PATH="$WORK_DIR/dist/ipcHandlers.js"
  if [[ -f "$HANDLERS_PATH" ]]; then
    node -e "
      const fs = require('fs');
      const p = process.argv[1];
      let code = fs.readFileSync(p, 'utf8');
      const H1 = \"if (win && process.platform === 'win32') {\";
      if (code.includes(H1)) {
        code = code.replace(H1, \"if (win && process.platform === 'win32' && !win.__pixelNoNativeCaption) {\");
        fs.writeFileSync(p, code, 'utf8');
      }
    " "$HANDLERS_PATH" || true
  fi

  cp -f "$INJECTOR" "$PACKED_INJECTOR"

  # Backup pristine asar before first overwrite
  if [[ ! -f "$BACKUP" ]]; then
    write_step "Backing up app.asar -> app.asar.pixel-backup..."
    cp -f "$ASAR" "$BACKUP"
  fi

  NEEDS_REPACK=1
fi

# 4. Repack if needed
if [[ "$NEEDS_REPACK" -eq 1 ]]; then
  write_step "Repacking app.asar..."
  NEW_ASAR="$ASAR.pixel-new"
  $ASAR_CMD pack "$WORK_DIR" "$NEW_ASAR"
  if [[ ! -f "$NEW_ASAR" ]]; then
    fail "asar pack failed - app.asar was NOT modified."
  fi
  mv -f "$NEW_ASAR" "$ASAR"
fi

# 5. Deploy theme assets outside asar
ALL_THEMES=('pixel-theme' 'doodle-theme' 'matcha-theme' 'phantom-theme' 'glass-theme')
for t in "${ALL_THEMES[@]}"; do
  src="$SCRIPT_DIR/$t"
  if [[ -d "$src" ]]; then
    write_step "Deploying $t assets to Contents/Resources/$t..."
    dst="$RESOURCES/$t"
    rm -rf "$dst"
    cp -R "$src" "$dst"
  fi
done

# Write active theme config
ACTIVE_CONFIG_PATH="$RESOURCES/active-theme.json"
echo "{\"theme\": \"$THEME_NAME\"}" > "$ACTIVE_CONFIG_PATH"
write_step "Active theme set to: $THEME_NAME"

# 6. Ad-hoc codesign for macOS (must run after all asar & resource modifications)
if command -v codesign >/dev/null 2>&1; then
  write_step "Signing modified Antigravity.app with ad-hoc signature..."
  codesign --force --deep --sign - "$APP_DIR" 2>/dev/null || {
    write_step "Warning: codesign returned non-zero, but app may still launch normally."
  }
fi

echo ""
echo -e "${YELLOW}  +-------------------------------------------------------------+${NC}"
echo -e "${YELLOW}  |${NC}  ${THEME_COLOR}${THEME_TITLE} installed!${NC}"
echo -e "${YELLOW}  |${NC}  ${WHITE}Launch or reload (Cmd + R) Antigravity to see your theme!  ${NC}${YELLOW}|${NC}"
echo -e "${YELLOW}  |                                                             |${NC}"
echo -e "${YELLOW}  |${NC}  ${CYAN}Switch theme anytime:                                      ${NC}${YELLOW}|${NC}"
echo -e "${YELLOW}  |${NC}    ${RED}./switch.sh phantom${NC}  (Persona 5 潮酷怪盗风)               ${YELLOW}|${NC}"
echo -e "${YELLOW}  |${NC}    ${GREEN}./switch.sh matcha${NC}   (治愈系抹茶日记手帐风)               ${YELLOW}|${NC}"
echo -e "${YELLOW}  |${NC}    ${MAGENTA}./switch.sh doodle${NC}   (纯线稿漫画粉印手绘风)               ${YELLOW}|${NC}"
echo -e "${YELLOW}  |${NC}    ${YELLOW}./switch.sh pixel${NC}    (8-Bit 复古像素极客风)               ${YELLOW}|${NC}"
echo -e "${YELLOW}  |${NC}    ${CYAN}./switch.sh glass${NC}    (液体玻璃拟态风 [Demo版])           ${YELLOW}|${NC}"
echo -e "${YELLOW}  +-------------------------------------------------------------+${NC}"
echo ""
