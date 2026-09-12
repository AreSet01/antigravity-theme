# 🌌 Antigravity Theme 美化增强套件

<p align="center">
  <b>Google Antigravity 2.x 全量高刷、无损热切、多风格深度美化套件</b><br>
  <i>Deep visual restyling, high-refresh smooth animations, and instant zero-restart theme hot-switching for Google Antigravity.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?logo=windows" alt="Platform" />
  <img src="https://img.shields.io/badge/Compatibility-Antigravity%202.x-6C5CE7" alt="Compatibility" />
  <img src="https://img.shields.io/badge/Themes-4%20Presets-FF7675" alt="Themes" />
  <img src="https://img.shields.io/badge/Switching-Zero--Restart%20(0.1s)-55EFC4" alt="Switching" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
</p>

---

[📖 English Documentation](#english) | [📖 简体中文文档](#简体中文)

---

<a name="简体中文"></a>
## 简体中文

### ✨ 简介

**Antigravity Theme** 是一套专为 **Google Antigravity 2.x** 客户端打造的深度视觉美化与性能增强套件。

项目打破了传统 Electron 客户端单调的视觉体验，在完全不影响原有核心编码与 AI 交互功能的前提下，注入了四套极具艺术张力与实用性的定制主题。同时采用**非侵入式加载器架构**，结合自研的 CDP（Chrome DevTools Protocol）通讯通道，实现了**无需重启客户端、0.1 秒全窗口无感秒级切换**。

---

### 🎨 四大预设主题风格

| 主题代号 | 视觉流派 | 核心调色板 | 特色组件与质感 | 切换指令 |
| :--- | :--- | :--- | :--- | :--- |
| **🎭 phantom** | **Persona 5 潮酷怪盗波普风** | `#D81124` (怪盗猩红)<br>`#121212` (夜幕曜黑)<br>`#F5F5F5` (高光纯白) | 警戒斜纹切角、高饱和波普徽章、锋利几何折角、动感对话流 | `switch phantom` |
| **🍵 matcha** | **治愈系抹茶日记手帐风** | `#2D4B39` (深苔竹青)<br>`#5B8A68` (抹茶苍绿)<br>`#F6F8F3` (日式和纸) | 手帐贴纸质感、书签便签角标、柔和护眼纸纹、优雅圆润排版 | `switch matcha` |
| **✒️ doodle** | **纯线稿漫画粉印手绘风** | `#202020` (墨线勾勒)<br>`#FDFCF7` (手绘糙纸)<br>`#E84855` (落款粉印) | 黑白漫画分镜框、直角硬边分割、印章式交互反馈、纯粹纸质感 | `switch doodle` |
| **👾 pixel** | **8-Bit 复古像素极客风** | Sweetie-16 经典复古调色板<br>点阵荧光绿 / 琥珀橙 | 中文点阵字体、CRT 扫描线与荧光微光、像素方块滑块、复古进度条 | `switch pixel` |

---

### 🚀 核心特性

1. **⚡ 0 重启秒级热切换 (Zero-Restart CDP Hot-Switching)**
   - 内置 `switch.bat` / `switch-theme.ps1`，自动通过本地 DevTools 端口建立调试连接。
   - **无需关闭或重启 Antigravity**，也不必重新封包 asar，一键输入主题代号，0.1 秒内所有渲染进程自动完成样式热重载。
2. **🏎️ 60Hz / 144Hz / 165Hz 高刷平滑调优**
   - 彻底排查并拆除了每帧触发全树重排的注册 `@property` CSS 变量动画。
   - 所有平移与缩放严格对齐物理设备像素（`calc(N * var(--px-dev))`），彻底杜绝点阵字体重采样发糊与长任务（Long Tasks）掉帧卡顿。
3. **🪟 自绘像素级无缝窗口按钮**
   - 彻底绕过 Windows 11 `titleBarOverlay` 无法自定义底色并偶现浅白条闪烁的系统缺陷。
   - 采用纯 CSS / 矢量自绘最小化、最大化、关闭按钮，完美融入应用顶栏色调，支持完整原生操作。
4. **🛡️ 非侵入式安全架构**
   - 仅在 `app.asar` 中注入微型加载器钩子（数十行），所有主题 CSS 与字体资源完全存放在 asar 外部目录（`resources/<theme>/`）。
   - 用户可随时以纯文本方式修改 CSS，按下 `Ctrl + R` 即可实时见效。
   - 安装前自动备份原始包（`app.asar.pixel-backup`），卸载脚本 `uninstall.bat` 能够 100% 无损恢复原厂状态。

---

### 📦 快速开始与安装

#### 运行环境要求
- **操作系统**：Windows 10 / 11 (x64)
- **目标应用**：Google Antigravity 2.x
- **依赖工具**：[Node.js](https://nodejs.org/)（安装脚本使用 `npx @electron/asar` 解装包，需确保 `npx` 可在终端调用）

#### 1. 一键安装
1. **完全退出 Antigravity**（请检查 Windows 托盘区，确保进程已退出）；
2. 在本项目根目录下，**双击运行 `install.bat`**，或在终端执行：
   ```powershell
   # 默认安装 phantom 主题（若程序在运行，加 -KillRunning 自动退出）
   powershell -ExecutionPolicy Bypass -File .\install.ps1 -KillRunning
   
   # 或指定初始安装主题：phantom | matcha | doodle | pixel
   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Theme matcha -KillRunning
   ```
3. 安装完成后启动 Antigravity，即可看到全新视觉效果！

#### 2. 一键极速切换主题
美化包支持免重启热切，随时在终端或 CMD 执行：
```cmd
:: 方式一：打开交互式数字选择菜单（按 1~4 快速选择）
switch

:: 方式二：直接传参切换指定风格
switch phantom   :: 切换至 Persona 5 怪盗波普风
switch matcha    :: 切换至 治愈系抹茶日记风
switch doodle    :: 切换至 纯线稿漫画手绘风
switch pixel     :: 切换至 8-Bit 复古像素风
```
> **提示**：你也可以在文件资源管理器中直接双击 `switch.bat` 运行！

#### 3. 彻底卸载与还原
如需恢复原版官方界面：
```cmd
:: 双击运行 uninstall.bat，或执行：
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1 -KillRunning
```
卸载程序会自动从备份无损还原 `app.asar`，并彻底清理所有外置主题资产文件。

---

### 🛠️ 进阶定制与实时调色

所有主题样式文件均安装在外部用户目录：
```
%LOCALAPPDATA%\Programs\Antigravity\resources\<theme-name>\<theme-name>.css
```
- **实时调色**：用任意编辑器打开对应 `.css` 文件，修改顶部 `:root` 变量区（例如背景色、强调色、字体大小），保存后在 Antigravity 窗口按下 **`Ctrl + R`** 即可在 1 秒内看到修改结果，无需重新安装！
- **新增自定义主题 / 复用至其他 Electron 客户端**：请详阅 [复用指南.md](复用指南.md)。

---

<a name="english"></a>
## English Documentation

### ✨ Introduction

**Antigravity Theme** is a comprehensive visual restyling, performance optimization, and hot-switching theme suite engineered for **Google Antigravity 2.x** client.

It replaces the default monochromatic interface with four high-aesthetic, production-ready design styles without interfering with any core coding, extension, or AI features. Utilizing a **non-invasive external asset architecture** alongside direct **Chrome DevTools Protocol (CDP)** integration, it allows users to switch themes **within 0.1 seconds without restarting the app**.

---

### 🎨 Four Preset Themes

| Theme Key | Aesthetics & Design Philosophy | Primary Palette | Key Visual Characteristics | Quick Switch |
| :--- | :--- | :--- | :--- | :--- |
| **🎭 phantom** | **Persona 5 Bold Pop-Art** | `#D81124` (Crimson)<br>`#121212` (Obsidian)<br>`#F5F5F5` (Pure White) | Slanted hazard warning stripes, high-saturation pop badges, sharp geometric angles | `switch phantom` |
| **🍵 matcha** | **Japanese Matcha Diary** | `#2D4B39` (Deep Moss)<br>`#5B8A68` (Matcha Green)<br>`#F6F8F3` (Washi Paper) | Stationery stickers, bookmark tabs, warm eye-protective paper tone, rounded flow | `switch matcha` |
| **✒️ doodle** | **Comic Manga Line Art** | `#202020` (Ink Outline)<br>`#FDFCF7` (Rough Paper)<br>`#E84855` (Seal Stamp Red) | Clean storyboard panels, right-angled framing, ink stamp accent feedback | `switch doodle` |
| **👾 pixel** | **8-Bit Retro Geek Art** | Sweetie-16 16-color palette<br>Dot-matrix phosphor glow | Chinese/English dot-matrix font, CRT scanlines, pixelated block scrollbars | `switch pixel` |

---

### 🚀 Key Features

1. **⚡ Zero-Restart Hot Switching (0.1s)**
   - Powered by `switch.bat` / `switch-theme.ps1` connecting to Chromium's local DevTools port.
   - Switch between themes instantly without killing the application or repacking asar archives.
2. **🏎️ 60Hz / 144Hz / 165Hz High-Refresh Pacing**
   - Eliminated redundant style recalculation bottlenecks caused by animated root `@property` variables.
   - Strictly mapped layout coordinates to physical device pixels (`calc(N * var(--px-dev))`), preventing font resampling blur and animation frame drops.
3. **🪟 Custom Native-Free Caption Controls**
   - Eliminates Windows 11 `titleBarOverlay` tint discoloration and white background flash issues.
   - Pure CSS/vector minimize, maximize, and close buttons seamlessly integrated into the titlebar.
4. **🛡️ Non-Invasive & Safe Architecture**
   - Only a compact loader hook is placed inside `app.asar`. All CSS stylesheets and WOFF2 fonts reside outside in `resources/<theme>/`.
   - Edit CSS directly and press `Ctrl + R` to preview changes in real time.
   - Automatic `app.asar.pixel-backup` creation ensures complete uninstallation with `uninstall.bat`.

---

### 📦 Quick Start & Usage

#### Prerequisites
- **OS**: Windows 10 / 11 (x64)
- **App**: Google Antigravity 2.x
- **Dependency**: [Node.js](https://nodejs.org/) (`npx` must be available in PATH for asar packing/unpacking)

#### 1. Installation
1. **Completely exit Antigravity** (ensure no background instances remain in the system tray).
2. Double click `install.bat` or run in terminal:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1 -KillRunning
   ```
3. Launch Antigravity to enjoy your chosen theme.

#### 2. Switching Themes
Switch anytime from terminal or command prompt:
```cmd
:: Interactive number-based menu (1-4):
switch

:: Or specify the theme directly:
switch phantom
switch matcha
switch doodle
switch pixel
```
*(You can also simply double-click `switch.bat` in Windows Explorer).*

#### 3. Uninstallation
To restore official stock files:
```cmd
uninstall.bat
:: Or in PowerShell:
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1 -KillRunning
```

---

### 📁 Project Structure

```text
antigravity-theme/
├── doodle-theme/            # Comic manga theme CSS & fonts
├── matcha-theme/            # Japanese matcha stationery theme CSS & fonts
├── phantom-theme/           # Persona 5 pop-art theme CSS & fonts
├── pixel-theme/             # 8-Bit retro pixel theme CSS & fonts
├── patch/
│   └── pixelTheme.js        # Core runtime theme injector & CDP hot-reload engine
├── install.bat / .ps1       # Automated patcher & asset deployer
├── switch.bat / switch-theme.ps1 # Instant zero-restart theme hot-switcher
├── uninstall.bat / .ps1     # 100% clean restore & cleanup script
├── 复用指南.md              # In-depth technical architecture & reuse guide
└── README.md                # Bilingual documentation
```

---

### 📄 License & Acknowledgments

- **Fonts**: Fusion Pixel Font (`fusion-pixel-font`) licensed under the **SIL Open Font License 1.1**.
- **Code & Themes**: Licensed under the **MIT License**.
- Detailed technical insights and performance audit reports are available in `复用指南.md`.