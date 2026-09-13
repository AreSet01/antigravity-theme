#!/usr/bin/env bash
# ============================================================================
# ANTIGRAVITY THEME uninstaller (macOS)
# Restores the original app.asar from backup and removes deployed theme assets.
# ============================================================================

set -euo pipefail

# Color output helpers
CYAN='\033[0;36m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

write_step() { echo -e "${CYAN}[theme] $1${NC}"; }
fail() { echo -e "${RED}[theme] ERROR: $1${NC}" >&2; exit 1; }

KILL_RUNNING=0
CUSTOM_APP_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -k|--kill|-KillRunning)
      KILL_RUNNING=1
      shift
      ;;
    --app)
      CUSTOM_APP_PATH="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: ./uninstall.sh [options]"
      echo ""
      echo "Options:"
      echo "  -k, --kill     Automatically terminate running Antigravity processes"
      echo "  --app <path>   Custom path to Antigravity.app"
      echo "  -h, --help     Show this help message"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

# Locate Antigravity.app
if [[ -n "$CUSTOM_APP_PATH" ]]; then
  APP_DIR="$CUSTOM_APP_PATH"
elif [[ -d "/Applications/Antigravity.app" ]]; then
  APP_DIR="/Applications/Antigravity.app"
elif [[ -d "$HOME/Applications/Antigravity.app" ]]; then
  APP_DIR="$HOME/Applications/Antigravity.app"
else
  fail "Antigravity.app not found in /Applications or ~/Applications."
fi

RESOURCES="$APP_DIR/Contents/Resources"
ASAR="$RESOURCES/app.asar"
BACKUP="$RESOURCES/app.asar.pixel-backup"

# 1. Stop running Antigravity processes if needed
if pgrep -f "Antigravity.app" >/dev/null 2>&1 || pgrep -x "Antigravity" >/dev/null 2>&1; then
  if [[ "$KILL_RUNNING" -eq 1 ]]; then
    write_step "Stopping running Antigravity processes..."
    pkill -f "Antigravity.app" 2>/dev/null || true
    pkill -x "Antigravity" 2>/dev/null || true
    sleep 2
  else
    fail "Antigravity is running. Close it, or re-run with -k / --kill."
  fi
fi

# 2. Restore backup asar
if [[ -f "$BACKUP" ]]; then
  write_step "Restoring original app.asar from backup..."
  cp -f "$BACKUP" "$ASAR"
  rm -f "$BACKUP"
else
  write_step "No backup found (app.asar.pixel-backup). If an auto-update already replaced app.asar, the patch is already clean."
fi

# 3. Clean up theme assets and config
ALL_THEMES=('pixel-theme' 'doodle-theme' 'matcha-theme' 'phantom-theme')
for t in "${ALL_THEMES[@]}"; do
  dst="$RESOURCES/$t"
  if [[ -d "$dst" ]]; then
    write_step "Removing $t assets..."
    rm -rf "$dst"
  fi
done

ACTIVE_CONFIG_PATH="$RESOURCES/active-theme.json"
if [[ -f "$ACTIVE_CONFIG_PATH" ]]; then
  rm -f "$ACTIVE_CONFIG_PATH"
fi

# 4. Re-sign Antigravity.app with codesign after all resource changes
if command -v codesign >/dev/null 2>&1; then
  write_step "Re-signing Antigravity.app..."
  codesign --force --deep --sign - "$APP_DIR" 2>/dev/null || true
fi

echo -e "${GREEN}[theme] Done. Antigravity is back to stock official status.${NC}"
