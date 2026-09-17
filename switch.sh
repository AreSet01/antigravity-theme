#!/usr/bin/env bash
# ============================================================================
# ANTIGRAVITY THEME switcher for macOS (5 套主题秒级生效)
# 支持主题：phantom (P5怪盗) | matcha (日式抹茶) | doodle (漫画粉印) | pixel (复古像素) | glass (液态玻璃)
# 特性：无需重启 Antigravity，无需重新打包 asar，自动同步本地最新 CSS，CDP 自动刷新！
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

THEME="${1:-}"

# Interactive menu if no theme argument provided
if [[ -z "$THEME" ]]; then
  echo ""
  echo -e "${CYAN}  =======================================================${NC}"
  echo -e "${YELLOW}              Antigravity 2.x 主题极速切换面板 (macOS)${NC}"
  echo -e "${CYAN}  =======================================================${NC}"
  echo -e "   ${RED}[1] phantom  - Persona 5 潮酷怪盗波普风 (红黑白/警戒斜纹)${NC}"
  echo -e "   ${GREEN}[2] matcha   - 治愈系抹茶日记手帐风 (抹茶绿/和纸白/便签书签)${NC}"
  echo -e "   ${MAGENTA}[3] doodle   - 纯线稿漫画粉印手绘风 (粉白红印/分镜直角/微动效)${NC}"
  echo -e "   ${YELLOW}[4] pixel    - 8-Bit 复古像素极客风 (Sweetie-16/CRT扫描线/方块滑块)${NC}"
  echo -e "${CYAN}   [5] glass    - 液体玻璃拟态风 [Demo版] (极光壁纸/毛玻璃折射/胶囊控件)${NC}"
  echo -e "${CYAN}  =======================================================${NC}"
  read -r -p " 请输入编号或主题名称 [1-5 / phantom / matcha / doodle / pixel / glass] (默认 1): " choice
  choice="${choice:-1}"
  case "$choice" in
    1) THEME="phantom" ;;
    2) THEME="matcha" ;;
    3) THEME="doodle" ;;
    4) THEME="pixel" ;;
    5) THEME="glass" ;;
    *) THEME="$choice" ;;
  esac
fi

# Normalize theme key
THEME_LOWER="$(echo "$THEME" | tr '[:upper:]' '[:lower:]')"
THEME_KEY="${THEME_LOWER%-theme}"

case "$THEME_KEY" in
  pixel)
    THEME_NAME="pixel-theme"
    THEME_TITLE="PIXEL GRAVITY (8-Bit 复古像素极客风)"
    THEME_COLOR="${YELLOW}"
    ;;
  matcha)
    THEME_NAME="matcha-theme"
    THEME_TITLE="MATCHA GRAVITY (治愈系抹茶日记手帐风)"
    THEME_COLOR="${GREEN}"
    ;;
  phantom)
    THEME_NAME="phantom-theme"
    THEME_TITLE="PHANTOM GRAVITY (Persona 5 潮酷怪盗波普风)"
    THEME_COLOR="${RED}"
    ;;
  glass)
    THEME_NAME="glass-theme"
    THEME_TITLE="LIQUID GRAVITY (液体玻璃拟态风 [Demo版])"
    THEME_COLOR="${CYAN}"
    ;;
  doodle)
    THEME_NAME="doodle-theme"
    THEME_TITLE="DOODLE GRAVITY (纯线稿漫画粉印手绘风)"
    THEME_COLOR="${MAGENTA}"
    ;;
  *)
    echo -e "${RED}[theme] 未知主题: '$THEME'，有效主题为: phantom, matcha, doodle, pixel, glass${NC}" >&2
    exit 1
    ;;
esac

# Locate Antigravity Resources
if [[ -d "/Applications/Antigravity.app/Contents/Resources" ]]; then
  RESOURCES="/Applications/Antigravity.app/Contents/Resources"
elif [[ -d "$HOME/Applications/Antigravity.app/Contents/Resources" ]]; then
  RESOURCES="$HOME/Applications/Antigravity.app/Contents/Resources"
else
  echo -e "${RED}[theme] 错误: 未找到 Antigravity.app Contents/Resources 目录。${NC}" >&2
  exit 1
fi

# 1. Sync local theme files into resources
LOCAL_SRC="$SCRIPT_DIR/$THEME_NAME"
TARGET_DST="$RESOURCES/$THEME_NAME"

if [[ -d "$LOCAL_SRC" ]]; then
  echo -e "${CYAN}[theme] 正在同步本地 $THEME_NAME 资源...${NC}"
  mkdir -p "$TARGET_DST"
  cp -R "$LOCAL_SRC/"* "$TARGET_DST/" 2>/dev/null || cp -R "$LOCAL_SRC"/* "$TARGET_DST"
fi

# 2. Write active-theme.json
ACTIVE_CONFIG_PATH="$RESOURCES/active-theme.json"
echo "{\"theme\": \"$THEME_NAME\"}" > "$ACTIVE_CONFIG_PATH"

echo ""
echo -e "${YELLOW}  +-------------------------------------------------------------+${NC}"
echo -e "${YELLOW}  |${NC}  ${WHITE}主题已成功切换为:                                          ${NC}${YELLOW}|${NC}"
echo -e "${YELLOW}  |${NC}  ${THEME_COLOR}${THEME_TITLE}${NC}"
echo -e "${YELLOW}  +-------------------------------------------------------------+${NC}"

# 3. Trigger hot-reload via Chrome DevTools Protocol (CDP)
PORT_FILE="$HOME/Library/Application Support/Antigravity/DevToolsActivePort"
RELOADED=0

if [[ -f "$PORT_FILE" ]] && command -v node >/dev/null 2>&1; then
  DEVTOOLS_PORT="$(head -n 1 "$PORT_FILE" | tr -d '[:space:]')"
  if [[ -n "$DEVTOOLS_PORT" ]]; then
    if node -e "
      const http = require('http');
      const port = process.argv[1];
      const req = http.get('http://127.0.0.1:' + port + '/json', (res) => {
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
      });
      req.on('error', () => process.exit(1));
    " "$DEVTOOLS_PORT" >/dev/null 2>&1; then
      RELOADED=1
    fi
  fi
fi

if [[ "$RELOADED" -eq 1 ]]; then
  echo -e "  ${GREEN}>>> [CDP 自动重载成功] Antigravity 窗口已瞬间刷新为您切换的主题！<<<${NC}"
else
  echo -e "  ${CYAN}>>> 提示: 如果 Antigravity 已打开，按 Cmd + R 即可立即秒级生效！<<<${NC}"
fi
echo ""
