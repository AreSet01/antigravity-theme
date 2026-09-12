const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');

const themes = [
  {
    key: 'phantom',
    file: path.join(repoDir, 'phantom-theme', 'phantom.css'),
    accent: '#E60012',
    indicator: '#E60012',
    hoverText: '#FFFFFF',
    darkBg: '#1A1A1E',
    lightBorder: '#000000',
    darkBorder: '#FFFFFF',
    shadow: '4px 4px 0 #000000',
    sidebarLight: '#F4F4F6',
    sidebarDark: '#131317',
    font: 'var(--doodle-font-ui, sans-serif)',
    anim: 'p5-menu-enter 120ms cubic-bezier(0.16, 1, 0.3, 1)'
  },
  {
    key: 'pixel',
    file: path.join(repoDir, 'pixel-theme', 'pixel.css'),
    accent: '#00F0FF',
    indicator: '#00F0FF',
    hoverText: '#000000',
    darkBg: '#1A1C23',
    lightBorder: '#000000',
    darkBorder: '#5A6988',
    shadow: '4px 4px 0 #000000',
    sidebarLight: '#E5E7EB',
    sidebarDark: '#1E1E2E',
    font: "var(--px-font-mono, 'Press Start 2P', monospace)",
    anim: 'px-menu-enter 120ms steps(3)'
  },
  {
    key: 'doodle',
    file: path.join(repoDir, 'doodle-theme', 'doodle.css'),
    accent: '#FF3366',
    indicator: '#FF3366',
    hoverText: '#FFFFFF',
    darkBg: '#1B1B22',
    lightBorder: '#111113',
    darkBorder: '#FFFFFF',
    shadow: '3px 3px 0 #111113',
    sidebarLight: '#FDFBF7',
    sidebarDark: '#1B1B22',
    font: 'var(--doodle-font-ui, sans-serif)',
    anim: 'doodle-menu-enter 120ms cubic-bezier(0.16, 1, 0.3, 1)'
  },
  {
    key: 'matcha',
    file: path.join(repoDir, 'matcha-theme', 'matcha.css'),
    accent: '#4E875B',
    indicator: '#4E875B',
    hoverText: '#FFFFFF',
    darkBg: '#171E19',
    lightBorder: '#2D5339',
    darkBorder: '#D5DEC6',
    shadow: '3px 3px 0 #2D5339',
    sidebarLight: '#F3F6F3',
    sidebarDark: '#1A241D',
    font: 'var(--matcha-font-ui, sans-serif)',
    anim: 'matcha-menu-enter 120ms cubic-bezier(0.16, 1, 0.3, 1)'
  }
];

for (const t of themes) {
  let css = fs.readFileSync(t.file, 'utf8');

  // Strip any previous Section 23 if already appended
  const marker = '/* ============================================================================\n   23. 图一/图二/图三/图四 全场景交互精准闭环落地规范';
  const idx = css.indexOf(marker);
  if (idx !== -1) {
    css = css.substring(0, idx).trimEnd() + '\n';
  }

  const patchCss = `
/* ============================================================================
   23. 图一/图二/图三/图四 全场景交互精准闭环落地规范 (Interactive Defect Fixes: ${t.key})
   ============================================================================ */

/* --- 1. 光标层级绝对置顶与弹窗浮层安全收敛 (彻底解决图一指针被菜单覆盖) --- */
#px-cursor {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  pointer-events: none !important;
  z-index: 2147483647 !important;
}

[data-radix-popper-content-wrapper],
div:has(> [role="listbox"]:not(:empty)),
div[class*="z-[6000]"],
div[class*="z-[8000]"],
[role="listbox"]:not(:empty),
[role="dialog"]:not(.settings-modal-container),
[role="alertdialog"],
div.animate-modalFadeIn {
  z-index: 2147483640 !important;
}

/* --- 2. 模型下拉菜单、子菜单及所有选项项高对比度全覆盖 (解决图一配色奇怪与白字浅底) --- */
[role="menuitem"],
[role="menuitemradio"],
[role="menuitemcheckbox"],
[role="option"],
[data-radix-collection-item],
[class*="select-item"],
.monaco-menu .action-item {
  font-family: ${t.font} !important;
  font-size: 12px !important;
  border-radius: 0 !important;
  padding: 6px 14px !important;
  cursor: pointer !important;
  color: var(--foreground) !important;
  background: transparent !important;
  border: none !important;
  border-left: 3px solid transparent !important;
  transition: transform 120ms ease, background-color 120ms ease, color 120ms ease, border-color 120ms ease !important;
}

body.theme-light [role="menuitem"],
body.theme-light [role="menuitemradio"],
body.theme-light [role="menuitemcheckbox"],
body.theme-light [role="option"],
body.theme-light [data-radix-collection-item],
body.theme-light [class*="select-item"],
body.theme-light .monaco-menu .action-item {
  color: #111113 !important;
  background-color: transparent !important;
}

/* 悬停、焦点、选中、展开态：主题高对比背景 + 高对比文字 + 指示条 + 3px 位移 */
[role="menuitem"]:hover,
[role="menuitem"]:focus,
[role="menuitem"][data-highlighted],
[role="menuitem"][data-state="open"],
[role="menuitem"][aria-expanded="true"],
[role="menuitemradio"]:hover,
[role="menuitemradio"]:focus,
[role="menuitemradio"][data-highlighted],
[role="menuitemradio"][data-checked],
[role="menuitemradio"][aria-checked="true"],
[role="menuitemcheckbox"]:hover,
[role="menuitemcheckbox"]:focus,
[role="menuitemcheckbox"][data-highlighted],
[role="option"]:hover,
[role="option"]:focus,
[role="option"][data-highlighted],
[role="option"][aria-selected="true"],
[class*="select-item"]:hover,
[class*="select-item"]:focus,
body.theme-light [role="menuitem"]:hover,
body.theme-light [role="menuitem"]:focus,
body.theme-light [role="menuitem"][data-highlighted],
body.theme-light [role="menuitem"][data-state="open"],
body.theme-light [role="menuitem"][aria-expanded="true"],
body.theme-light [role="menuitemradio"]:hover,
body.theme-light [role="menuitemradio"]:focus,
body.theme-light [role="menuitemradio"][data-highlighted],
body.theme-light [role="menuitemradio"][data-checked],
body.theme-light [role="menuitemradio"][aria-checked="true"],
body.theme-light [role="menuitemcheckbox"]:hover,
body.theme-light [role="menuitemcheckbox"]:focus,
body.theme-light [role="menuitemcheckbox"][data-highlighted],
body.theme-light [role="option"]:hover,
body.theme-light [role="option"][data-highlighted],
body.theme-light [role="option"][aria-selected="true"],
body.theme-light [class*="select-item"]:hover {
  background-color: ${t.accent} !important;
  color: ${t.hoverText} !important;
  border-left: 3px solid ${t.indicator} !important;
  transform: translateX(3px) !important;
  box-shadow: none !important;
}

[role="menuitem"]:hover *,
[role="menuitem"]:focus *,
[role="menuitem"][data-highlighted] *,
[role="menuitem"][data-state="open"] *,
[role="menuitem"][aria-expanded="true"] *,
[role="menuitemradio"]:hover *,
[role="menuitemradio"]:focus *,
[role="menuitemradio"][data-highlighted] *,
[role="menuitemradio"][data-checked] *,
[role="menuitemradio"][aria-checked="true"] *,
[role="menuitemcheckbox"]:hover *,
[role="menuitemcheckbox"]:focus *,
[role="menuitemcheckbox"][data-highlighted] *,
[role="option"]:hover *,
[role="option"]:focus *,
[role="option"][data-highlighted] *,
[role="option"][aria-selected="true"] *,
[class*="select-item"]:hover *,
[class*="select-item"]:focus *,
body.theme-light [role="menuitem"]:hover *,
body.theme-light [role="menuitem"]:focus *,
body.theme-light [role="menuitem"][data-highlighted] *,
body.theme-light [role="menuitem"][data-state="open"] *,
body.theme-light [role="menuitem"][aria-expanded="true"] *,
body.theme-light [role="menuitemradio"]:hover *,
body.theme-light [role="menuitemradio"]:focus *,
body.theme-light [role="menuitemradio"][data-highlighted] *,
body.theme-light [role="menuitemradio"][data-checked] *,
body.theme-light [role="menuitemradio"][aria-checked="true"] *,
body.theme-light [role="menuitemcheckbox"]:hover *,
body.theme-light [role="menuitemcheckbox"]:focus *,
body.theme-light [role="menuitemcheckbox"][data-highlighted] *,
body.theme-light [role="option"]:hover *,
body.theme-light [role="option"][data-highlighted] *,
body.theme-light [role="option"][aria-selected="true"] *,
body.theme-light [class*="select-item"]:hover * {
  color: ${t.hoverText} !important;
  fill: ${t.hoverText} !important;
}

/* 菜单内徽章与角标悬停颜色 */
[role="menuitem"]:hover [class*="rounded-full"],
[role="menuitem"][data-highlighted] [class*="rounded-full"],
[role="menuitemradio"]:hover [class*="rounded-full"],
[role="menuitemradio"][data-highlighted] [class*="rounded-full"] {
  background-color: rgba(0, 0, 0, 0.35) !important;
  color: ${t.hoverText} !important;
}

/* --- 3. 侧栏会话项悬停防穿透与实体遮罩 (解决图二时间戳与功能图标重叠) --- */
[data-testid="conversation-row-sidebar"] span.truncate {
  color: var(--foreground) !important;
  font-family: ${t.font} !important;
  opacity: 1 !important;
  visibility: visible !important;
  position: relative !important;
  z-index: 1 !important;
}
body.theme-light [data-testid="conversation-row-sidebar"] span.truncate {
  color: #111113 !important;
}

/* 悬停时彻底隐藏相对时间戳容器 */
[data-testid="conversation-row-sidebar"]:hover .group-hover\\:invisible,
[data-testid="conversation-row-sidebar"]:hover [class*="group-hover:invisible"],
[data-testid="conversation-row-sidebar"]:hover .group-hover\\:invisible span,
[data-testid="conversation-row-sidebar"]:hover [class*="group-hover:invisible"] span {
  visibility: hidden !important;
  opacity: 0 !important;
  display: none !important;
}

/* 悬停时右侧操作栏具备完全不透明实体背景，消除叠印 */
[data-testid="conversation-row-sidebar"]:hover .absolute.top-0.bottom-0.-right-1,
[data-testid="conversation-row-sidebar"]:hover [class*="absolute"][class*="right"],
[data-testid="conversation-list-sidebar"]:hover .absolute.top-0.bottom-0.-right-1 {
  background-color: ${t.sidebarLight} !important;
  border-radius: 4px !important;
  background-image: none !important;
  padding-left: 6px !important;
}
body:not(.theme-light) [data-testid="conversation-row-sidebar"]:hover .absolute.top-0.bottom-0.-right-1,
body:not(.theme-light) [data-testid="conversation-row-sidebar"]:hover [class*="absolute"][class*="right"],
body:not(.theme-light) [data-testid="conversation-list-sidebar"]:hover .absolute.top-0.bottom-0.-right-1 {
  background-color: ${t.sidebarDark} !important;
  background-image: none !important;
}

/* --- 4. 顶部系统下拉菜单全量重构（将图三动效与样式完全对齐图四上下文菜单） --- */
div.border-menu-border,
[class*="border-menu-border"],
body.theme-light div.border-menu-border,
body.theme-light [class*="border-menu-border"],
body.theme-light [class*="shadow-"].border-menu-border,
body.theme-light [class*="shadow-"][class*="border-menu-border"],
body.theme-light [data-testid="title-menu-bar"] div[class*="z-[8000]"],
body.theme-light [data-testid="title-menu-bar"] div[class*="min-w-"] {
  border-radius: 0 !important;
  border: 2px solid ${t.lightBorder} !important;
  border-left: 5px solid ${t.accent} !important;
  box-shadow: ${t.shadow} !important;
  background-color: #FFFFFF !important;
  padding: 4px 0 !important;
  animation: ${t.anim} forwards !important;
  transform-origin: top left !important;
  min-width: 220px !important;
  overflow: visible !important;
}

body:not(.theme-light) div.border-menu-border,
body:not(.theme-light) [class*="border-menu-border"],
body:not(.theme-light) [class*="shadow-"].border-menu-border,
body:not(.theme-light) [class*="shadow-"][class*="border-menu-border"],
body:not(.theme-light) [data-testid="title-menu-bar"] div[class*="z-[8000]"],
body:not(.theme-light) [data-testid="title-menu-bar"] div[class*="min-w-"] {
  border-radius: 0 !important;
  border: 2px solid ${t.darkBorder} !important;
  border-left: 5px solid ${t.accent} !important;
  box-shadow: 4px 4px 0 #000000 !important;
  background-color: ${t.darkBg} !important;
  padding: 4px 0 !important;
  animation: ${t.anim} forwards !important;
  transform-origin: top left !important;
  min-width: 220px !important;
}

/* 顶部系统下拉菜单子项（对齐图四右键菜单：高对比度排版 + 悬停反色与位移动效 + 内部专属指示条） */
div.border-menu-border button,
[class*="border-menu-border"] button,
[data-testid="title-menu-bar-option"],
div[class*="border-menu-border"] button {
  font-family: ${t.font} !important;
  font-size: 12px !important;
  border-radius: 0 !important;
  padding: 6px 14px !important;
  cursor: pointer !important;
  color: #111113 !important;
  background: transparent !important;
  border: none !important;
  border-left: 3px solid transparent !important;
  width: 100% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  text-align: left !important;
  transition: transform 120ms ease, background-color 120ms ease, color 120ms ease, border-color 120ms ease !important;
}

body:not(.theme-light) div.border-menu-border button,
body:not(.theme-light) [class*="border-menu-border"] button,
body:not(.theme-light) [data-testid="title-menu-bar-option"] {
  color: #FFFFFF !important;
}

div.border-menu-border button:hover,
div.border-menu-border button:focus,
[class*="border-menu-border"] button:hover,
[class*="border-menu-border"] button:focus,
[data-testid="title-menu-bar-option"]:hover,
[data-testid="title-menu-bar-option"]:focus,
[data-testid="title-menu-bar-option"][data-highlighted],
body.theme-light div.border-menu-border button:hover,
body.theme-light div.border-menu-border button:focus,
body.theme-light [class*="border-menu-border"] button:hover,
body.theme-light [class*="border-menu-border"] button:focus,
body.theme-light [data-testid="title-menu-bar-option"]:hover,
body.theme-light [data-testid="title-menu-bar-option"]:focus,
body.theme-light [data-testid="title-menu-bar-option"][data-highlighted] {
  background-color: ${t.accent} !important;
  color: ${t.hoverText} !important;
  border-left: 3px solid ${t.indicator} !important;
  transform: translateX(3px) !important;
  box-shadow: none !important;
}

div.border-menu-border button:hover *,
div.border-menu-border button:focus *,
[class*="border-menu-border"] button:hover *,
[class*="border-menu-border"] button:focus *,
[data-testid="title-menu-bar-option"]:hover *,
[data-testid="title-menu-bar-option"]:focus *,
[data-testid="title-menu-bar-option"][data-highlighted] *,
body.theme-light div.border-menu-border button:hover *,
body.theme-light div.border-menu-border button:focus *,
body.theme-light [class*="border-menu-border"] button:hover *,
body.theme-light [class*="border-menu-border"] button:focus *,
body.theme-light [data-testid="title-menu-bar-option"]:hover *,
body.theme-light [data-testid="title-menu-bar-option"]:focus *,
body.theme-light [data-testid="title-menu-bar-option"][data-highlighted] * {
  color: ${t.hoverText} !important;
  fill: ${t.hoverText} !important;
}

/* 分割线：图四标准纯实线分割 */
div.border-menu-border hr,
div.border-menu-border [class*="border-t"],
div.border-menu-border [class*="h-px"],
[class*="border-menu-border"] hr,
[class*="border-menu-border"] [class*="border-t"],
[class*="border-menu-border"] [class*="h-px"],
[data-testid="title-menu-bar"] hr,
[data-testid="title-menu-bar"] div[class*="border-t"],
[data-testid="title-menu-bar"] div[class*="h-px"] {
  border: none !important;
  border-top: 1px solid ${t.lightBorder} !important;
  margin: 4px 0 !important;
  opacity: 0.2 !important;
}
body:not(.theme-light) div.border-menu-border hr,
body:not(.theme-light) div.border-menu-border [class*="border-t"],
body:not(.theme-light) div.border-menu-border [class*="h-px"],
body:not(.theme-light) [class*="border-menu-border"] hr,
body:not(.theme-light) [data-testid="title-menu-bar"] hr {
  border-top: 1px solid #FFFFFF !important;
  opacity: 0.2 !important;
}

/* --- 5. 既定关键补丁加固 (Combobox 展开白字、发送按钮置灰、代码块无倒刺、危险确认红钮) --- */
button[role="combobox"],
button[role="combobox"] * {
  color: var(--foreground) !important;
  fill: currentColor !important;
}
body.theme-light button[role="combobox"],
body.theme-light button[role="combobox"] * {
  color: #111113 !important;
  fill: currentColor !important;
}

[data-testid="send-button"]:disabled,
button[data-testid="send-button"]:disabled {
  background-color: var(--muted) !important;
  color: var(--muted-foreground) !important;
  border: 1px solid var(--border) !important;
  box-shadow: none !important;
  opacity: 0.35 !important;
  cursor: not-allowed !important;
}
[data-testid="send-button"]:disabled svg,
button[data-testid="send-button"]:disabled svg {
  color: var(--muted-foreground) !important;
  fill: var(--muted-foreground) !important;
}

[role="dialog"] button:has(svg.lucide-trash),
[role="dialog"] button:has(svg.lucide-trash-2),
[role="dialog"] button[class*="destructive"],
[role="alertdialog"] button:has(svg.lucide-trash),
[role="alertdialog"] button[class*="destructive"] {
  background-color: #E60012 !important;
  color: #FFFFFF !important;
  border: 2px solid #000000 !important;
  font-weight: bold !important;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5) !important;
}
`;

  fs.writeFileSync(t.file, css + '\n' + patchCss, 'utf8');
  console.log(`Updated theme CSS: ${t.key} (${t.file})`);
}

console.log('All 4 theme CSS files successfully updated!');
