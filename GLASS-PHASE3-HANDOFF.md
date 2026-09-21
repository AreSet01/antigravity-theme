# LIQUID GRAVITY · Phase 3 进度交接书（给接手的 AI）

> 日期：2026-09-18。目标读者：接手本仓库继续开发的 AI Agent。
> 读完这份就能开工：现状、已完成、未完成、硬约束、部署与验证方法，全在里面。
> 配套文档：`GLASS-PHASE3-PLAN.md`（完整方案与依据）、`GLASS-PHASE2-HANDOFF.md`（玻璃主题早期交接）。

---

## 0. 一句话现状

**脚本阻塞已修复；排版重构批次 1~4 已做完并提交；批次 5（活力度三档 calm / balanced / vivid）及预设校准（T1 & T3）、BOM/Payload 自动化自检已全部完成并测试通过。剩余长线任务为批次 6 / Phase 4（chrome 真 SDF 实例挂载）。**

---

## 1. 环境与路径

| 项 | 值 |
|---|---|
| 仓库（唯一真源） | 本地工作区（支持 Windows 与 macOS 双端脚本） |
| 应用安装目录 | Windows `%LOCALAPPDATA%\Programs\Antigravity` / macOS `/Applications/Antigravity.app` |
| 主题 CSS 部署位置 | `…/resources/glass-theme/glass.css`（普通文件，改完复制 + reload 即生效） |
| 注入器部署位置 | `…/resources/app.asar` 内的 `dist/pixelTheme.js`（改了必须重打包） |
| 当前激活主题 | `…/resources/active-theme.json` → `{"theme": "glass-theme"}` |
| 自检工具 | `npm run check-payloads`（验证注入器内嵌脚本）/ `npm run check-bom`（验证 PowerShell BOM） |
| 应用当前状态 | 正在运行 |

---

## 2. 已完成并通过实机验证

### 2.1 脚本修复（阻塞项，用户报「打不开」）

- **根因**：`switch-theme.ps1` / `install.ps1` 存成了 UTF-8 **无 BOM**。PowerShell 5.1 按 GBK 解码，
  中文把字符串收尾引号吃掉 → 解析失败 → 双击 bat 闪退。
- **已修**：两个 .ps1 补 BOM；四个 .bat 末尾加 `if errorlevel 1 pause`。
- **规则固化**：已写入 `复用指南.md` 第 21 条守则，并提供 `npm run check-bom` 自动化回归自检。

### 2.2 注入器（`patch/pixelTheme.js`）

- 新增 `LIQUID_GLASS_CORE_JS`：移植自 `zsio/liquid-glass` 的 2D SDF 光学引擎
  （斯涅尔折射 + 三通道色散 + 全内反射 + 倒角流光遮罩，Worker + OffscreenCanvas 生成贴图）。
  暴露 `window.__pxLiquidGlass.mount(host, options)`；类名前缀 `px-lg`。
- `GLASS_LENS_JS` 整体重写：真圆形透镜（中心光学平坦、底下文字可读）、惯性流光、
  静止 300ms 淡出、打字隐藏、悬停输入框/代码降到 `--glass-lens-dim`。
- 调参面板新增「透镜光学」六滑杆；装载顺序 core → lens → panel。
- **2026-09-18 批次 5 增补**：
  - `GLASS_QUALITY_JS` 增加 `--glass-vibrance` 监听，实时将值同步到 `document.documentElement[data-px-vibrance]`。
  - 调参面板增加「极光活力」三档下拉选单（清雅 `calm` / 均衡 `balanced` / 艳丽 `vivid`）。
  - 调参面板预设表全面校准（T3）：默认背景模糊从旧的 14px 校准至 10px，暗色模式下各预设透明度与极光饱和度已与 Phase 3 规范全面对齐，防止点选预设导致样式倒退。

### 2.3 主题 CSS 批次 1~5（`glass-theme/glass.css`）

- **批次 1 · 暗色抬起面回归修复**：拆出 `--glass-fill` 与 `--glass-tint`。新增 `--glass-raise` / `--glass-select`。
- **批次 2 · 圆角比例尺 + 表面三级**：新 token `--glass-radius-row: 10px`；废除 blanket 规则。
- **批次 3 · 正文排版**：内联 code 走 raise 底 + 6px 圆角；代码块对齐 `--glass-radius-sm`；段间距节奏化。
- **批次 4 · 折射带宽回暖**：`--glass-blur` 降至 10px；五档透镜带宽重生成。
- **批次 5 · 活力度三档**：新增 `--glass-vibrance` 及 Section 10.1 覆盖块（`vivid` 185%/1.06/0.88，`balanced` 150%/1.00/0.74，`calm` 120%/1.00/0.50）。

---

## 3. 未完成（后续任务清单）

### T2 · 批次 6 / Phase 4：chrome 上真 SDF 引擎（大，独立立项）

- 需求：标题栏 / 侧栏 / 输入栏 / 正文底板各挂 1 个真 2D SDF 实例（细长元素上下带不再被拉伸）。
- 方案（PLAN 文档 B.2b）：不注入子节点（React 会打架）——注入器建 `<filter>`，只往应用元素写
  `backdrop-filter: url(#id)` + 两个自定义属性，描边/流光交给 CSS 的 `::before/::after` 读。
  **实例严格 ≤4 个**，resize 走 ResizeObserver + 48ms 节流。
- 风险：大面板贴图重生成成本、与 React 抢 style 属性。做完必须跑长任务与帧时间实测。

---

## 4. 硬约束（血泪守则，违一条就出事故）

1. **注入器绝不能观察 class 属性**（MutationObserver 只看 childList）——会与框架回写 className
   形成微任务互答，渲染进程饿死。
2. **主题 CSS 顶部那行 `@layer px-theme, properties, theme, base, components, utilities;` 不许动**
   ——动了全 UI 的 Tailwind 间距/列表/边框一次性失效。
3. **z-index 安全线**：浮层 ≤ 2147483640；自绘指针画布 2147483647；玻璃透镜 2147483638；
   窗口按钮 2147483644。打平会按 DOM 顺序盖住指针。
4. **折射透镜只上 chrome**：正文卡片/消息气泡/代码块一律 `brightness(1)`，
   位移会把背后密集文字拉出重影。
5. **`.ps1` 含中文必须存 UTF-8 with BOM**（见 2.1）。
6. **install.ps1 在 Antigravity 未退净时静默失败**：重打包后必须核对 asar mtime 或抽取比对。
7. **实机验证时窗口必须可见**：窗口被遮住时 `visibilityState=hidden`，Chromium 冻结 rAF 与
   transition，动效相关验证全部假失败。同一个 PowerShell 里先
   `[Microsoft.VisualBasic.Interaction]::AppActivate($pid)` 再跑 node。
8. **不要用 `[class*="bg-transparent"]` 做排除条件**（见 2.4）。
9. **改 CSS ≠ 要重打包**：CSS 复制到 resources + reload 即可；只有改 `patch/pixelTheme.js`
   才需要重打包 + 重启。

---

## 5. 部署与验证手册（复制即用）

### 5.1 CSS-only 改动（秒级）

```powershell
# 1) 改仓库 glass-theme/glass.css
# 2) 复制到运行目录
Copy-Item .\glass-theme\glass.css "$env:LOCALAPPDATA\Programs\Antigravity\resources\glass-theme\glass.css" -Force
# 3) 激活窗口后 reload
Add-Type -AssemblyName Microsoft.VisualBasic
$p = Get-Process -Name Antigravity | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
[Microsoft.VisualBasic.Interaction]::AppActivate($p.Id)
cd .\test-reports\md-probe; node cdp.js -e "location.reload()"
```

### 5.2 注入器改动（重打包）

```powershell
node .\test-reports\md-probe\check_payloads.js          # 期望 failures: 0
# 完全退出 Antigravity 后：
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Theme glass -KillRunning
# 验证（install.ps1 会静默失败，必做）：
node .\test-reports\md-probe\asar_list.js "$env:LOCALAPPDATA\Programs\Antigravity\resources\app.asar" extract dist/pixelTheme.js $env:TEMP\chk.js
# 然后比对 $env:TEMP\chk.js 与 patch\pixelTheme.js
```

### 5.3 现成探针（`test-reports/md-probe/`）

| 脚本 | 用途 |
|---|---|
| `glass_cold_verify_0918.js` | 冷启动验收：core/lens/panel、z、根健康、p-4 |
| `layout_census_0918.js` | 排版体检：圆角/表面/字号分布（防 blanket 规则回归） |
| `layout_ab_0918.js current dark` | 令牌与几何对照（可与 `head` 版 CSS 对比） |
| `edge_ab_0918.js sm` | 新旧边缘滤镜并排对照 |
| `glass_reload_0918.js 名.png --theme=light --mouse=x,y` | reload + 切亮暗 + 指针摆位 + 截图 |
| `click_text_0918.js "解析函数用法"` | 按文本点元素（开一个会话） |
| `gen_glass_lens.js [out] [--chroma=1.2]` | 重生成静态边缘透镜（改 LEVELS 后重跑，再替换 CSS 第 0.1 节） |
| `rotate_0918.js` | 五套主题轮转回归（确认别家不被玻璃 widget 污染） |

### 5.4 每轮改动必过的红线

```
document.documentElement.scrollHeight === clientHeight   （根无溢出）
getComputedStyle(documentElement).overflow === 'clip'
p-4 === 16px、px-3 === 12px                              （Tailwind 健康）
[role=listbox]:empty 的 rect === 0×0                     （空浮层壳归零）
浮层 z ≤ 2147483640；#px-cursor 2147483647
```

---

## 6. 已知取舍（不是 bug，别去"修"）

- 消息气泡底部那行淡字 = 应用自己的渐隐截断。
- 代码块不做玻璃（底下常年压着密集代码，透明 + 模糊会叠成鬼影）。
- 亮/暗色参数分叉是刻意的（亮玻璃必须薄、暗玻璃必须实）。
- 静态 chrome 滤镜的带宽是「边长比例」，细长元素上下带必然比左右带窄 —— 想彻底解决见 T2。
- 悬停追踪器对超大容器（>1200 节点）跳过，长文档内评论气泡不出现。

---

## 7. 记忆与文档索引

- `GLASS-PHASE3-PLAN.md` —— 本轮完整方案（分 A/B/C 三块 + 批次表 + 证据）。
- `GLASS-PHASE2-HANDOFF.md` —— 玻璃主题注入器/wiget 架构交接。
- `README.md` —— 五套主题说明（glass 段落已更新到 2026-09-18 状态）。
- 工作区未提交；`test-reports/md-probe/` 被 gitignore（探针工具不进仓库，但留在磁盘上）。
