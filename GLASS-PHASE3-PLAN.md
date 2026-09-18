# LIQUID GRAVITY · Phase 3 方案（脚本修复 / 效果回补 / 排版重构）

> 面向接手执行的 agent 与用户评审。日期：2026-09-18。
> 仓库：`E:\搞搞新意思\antigravity-美化`；当前分支 main，工作区未提交。
> 本方案的每一条都有实测依据，依据来源写在「证据」里，别凭感觉改。

---

## 0. 三件事分开看

| 编号 | 问题 | 状态 |
|---|---|---|
| **A** | 脚本打不开、双击闪退 | ✅ 已修复并验证（本次会话内完成） |
| **B** | 液态玻璃「效果丢失」 | 🔍 已定位到三处，方案见下，**待批准执行** |
| **C** | 排版需要重新调整 | 📐 已做量化体检，方案见下，**待批准执行** |

---

## A. 脚本打不开（已修）

### A.1 根因

`switch-theme.ps1` 与 `install.ps1` 存成了 **UTF-8 无 BOM**。Windows PowerShell 5.1 对无 BOM 的 `.ps1`
按系统 ANSI 代码页（中文机器上是 GBK）解码，于是中文字符串被拆错字节边界，**把字符串的收尾双引号吃掉**。

实测（`[Management.Automation.Language.Parser]::ParseFile`）：

```
install.ps1        [no-BOM]  parse-errors=0     ← 侥幸没吃到引号，但输出全是乱码
switch-theme.ps1   [no-BOM]  parse-errors=2     ← L58 Missing closing ')'
uninstall.ps1      [BOM]     parse-errors=0     ← 唯一带 BOM 的，一直正常
```

被吃掉引号的行（GBK 误解码后引号数对不上）：第 22、58、92、112、124、126 行，例如
`"…主题极速切换面板"` → GBK 下变成 `"…涓婚鏋侀€熷垏鎹㈤潰鏉?`，收尾引号没了 → 整个文件解析崩。

因为 `switch.bat` / `switch-theme.bat` 只是 `powershell -File` 的壳，解析错误一闪而过窗口就关了 ——
这就是「打不开、根本没办法使用」的全部原因。**和本次玻璃主题改造无关**，`git status` 显示这两个脚本
从未被本次改动碰过；它是 9ddd17c（加第五套主题时）引入的历史问题，直到你去点 switch 才暴露。

### A.2 已做的修复

1. 给 `install.ps1`、`switch-theme.ps1` 补 UTF-8 BOM（`uninstall.ps1` 本来就有）。
   复测：三个脚本 `parse-errors=0`；`.\switch-theme.ps1 glass` 跑通，中文横幅显示正常。
2. 四个 `.bat` 末尾加 `if errorlevel 1 pause` —— 以后再出错窗口会停住，不会闪退到看不见报错。

### A.3 需要你做的

- 直接双击 `switch.bat` 验证一次。若仍闪退，把停住的报错截给我。
- **长期约束**：以后任何带中文的 `.ps1` 必须存 UTF-8 **with BOM**。建议加进 `复用指南.md` 的硬规则，
  并在 CI/自检脚本里加一条 BOM 检查（方案 D 的批次 0）。

---

## B. 效果丢失（三处，均已定位）

### B.1 【回归·我引入的】暗色下"抬起感"的小控件被填成深色

**证据**（同一份 DOM，只换 CSS，量 `getComputedStyle`）：

| 元素 / 令牌 | 改造前 (HEAD) | 现在 | 观感变化 |
|---|---|---|---|
| `New Conversation` 主按钮底 | `rgba(255,255,255,0.20)` | `rgba(14,18,42,0.44)` | 抬起的亮玻璃 → 一个深色凹洞 |
| `--secondary` | 白 0.132 | 深靛 0.384 | 次级按钮同上 |
| `--sidebar-secondary`（选中/悬停行） | 白 0.165 | 深靛 0.48 | 选中行比侧栏还暗，"高亮"变"压暗" |
| `--muted` / `--sidebar-muted` | 白 0.07 | 深靛 0.18 | 弱化区块反而更重 |

原因：为修暗色可读性，我把 15 处 `rgb(var(--glass-tint) / …)` 一次性替换成了 `--glass-fill`。
**大面积底板该用深填充是对的，但"抬起/选中/悬停"的小面必须继续用白色**——玻璃的层级感靠"越靠近用户越亮"。

**修法**（精确到行，`glass-theme/glass.css`）：把下列四行的 `--glass-fill` 改回 `--glass-tint`，
并给它们单独的 alpha（避免跟着大面板的 0.32 走）：

- L208 `--secondary`、L210 `--muted`、L214 `--sidebar-secondary`、L215 `--sidebar-muted`（暗色块）
- L296 / L298 / L302 / L303（亮色块，亮色下 fill 本来就是白，改回去只是保持语义一致）

新增两个语义参数放在第 0 节：

```css
--glass-raise:   0.14;   /* 抬起面（次级按钮、hover 行）—— 永远是 --glass-tint 白 */
--glass-select:  0.22;   /* 选中态 —— 比 raise 再亮一档 */
```

保留 `--glass-fill` 只服务四处：`--sidebar` / `--card` / 浮层底 / 正文底板 slab。

**验收**：暗色下 `New Conversation` 的 computed background 回到 `rgba(255,255,255,0.2±)`；
选中会话行比侧栏底亮，不是暗。

### B.2 【取舍·可调回】chrome 边缘折射带被砍掉一半

改造时把静态滤镜的带宽（占边长比例）从线性版减半：

| 档 | HEAD | 现在 | 位移强度 |
|---|---|---|---|
| xs | 0.14 | 0.055 | 18 → 20 |
| sm | 0.18 | 0.075 | 32 → 34 |
| md | 0.22 | 0.100 | 52 → 54 |
| lg | 0.26 | 0.130 | 78 → 80 |
| xl | 0.32 | 0.165 | 110 → 112 |

理由是 Snell 曲线把偏折压到最外沿、窄带也够"脆"。但实测对照板（`62_edge_ab_sm.png`：彩色文字底
+ 两块同参数面板，左 HEAD 线性 / 右新 Snell）显示：**在浅色壁纸 + 14px 模糊下，窄带 + 快速衰减
基本看不出厚度**，左边那块反而更像玻璃。这就是你感觉到的「玻璃变平了」。

**修法（二选一，建议先做 a，b 作为 Phase 4）**

- **a. 便宜的**：把 chrome 三档带宽调回 0.11 / 0.14 / 0.18，并把模糊从 14px 降到 10px
  （模糊会把折射糊掉——参考站的默认模糊只有 0.35px）。重新生成：
  `node test-reports/md-probe/gen_glass_lens.js` + `--chroma=1.2`，再跑 css01 那段替换。
- **b. 对的**：把 `window.__pxLiquidGlass` 的真 2D SDF 也用到 chrome 上。
  不注入子节点（React 会打架），改成：注入器按元素实际尺寸生成贴图 → 在文档里建 `<filter id>` →
  只往应用元素上写 `backdrop-filter: url(#id)` 和两个自定义属性；描边/流光交给主题 CSS 的
  `::before/::after` 读那两个属性。实例严格限 4 个（标题栏 / 侧栏 / 输入栏 / 正文底板），
  resize 用 ResizeObserver + 48ms 节流，贴图走 Worker。
  这样细长元素上下带不再被拉伸，是 zsio 那种"每个圆角都对"的质感。

### B.3 【取舍·给开关】暗色的"极光感"被调淡

为了让正文压得住，暗色把饱和 185%→150%、壁纸浓度 0.88→0.74、`--glass-bright` 1.06→1.00。
可读性确实好了，但"液态玻璃"的艳色也淡了。

**修法**：不选边，加一个三档 `--glass-vibrance`（`calm | balanced | vivid`），
在调参面板加一个下拉，默认 `balanced`（当前值），`vivid` 回到 HEAD 的 185%/0.88/1.06。
一处 `:root[data-px-vibrance="vivid"]` 覆盖即可，不动主令牌。

---

## C. 排版重构（新工作）

### C.1 体检数据（当前可见元素 616 个）

**圆角分布**：

| 值 | 元素数 |
|---|---|
| 9999px（胶囊） | 62 |
| 18px | 4 |
| 12px | 4 |
| 7px | 3 |
| 8px / 16px / 52px | 各 1 |

**表面色分布**：`rgba(255,255,255,0.12)` 一种颜色占 61 个元素，其余每种 ≤9 个。

**根因就一条规则**（`glass.css` L768-771）：

```css
button:not([class*="bg-primary"]):not([role="switch"]):not([data-testid="send-button"]):not(…),
[role="button"]:not([class*="bg-primary"]) {
  border-radius: var(--glass-radius-pill) !important;   /* 所有按钮一律胶囊 */
  background-color: rgb(var(--glass-tint) / 0.12) !important;  /* 所有按钮一个底色 */
}
```

它把**每一个** `button` / `[role=button]` 无差别做成胶囊 + 同一个底色。于是：
分组标题（`Pinned Conversations`、`Projects`，实际是 17px 高的 button）变成了小药丸、
28px 的菜单项、32px 的侧栏行、24px 的图标钮、48px 的会话卡，全是同一个形状同一个底色 ——
**没有层级，只有"一片胶囊"**，这就是"排版需要重调"的核心。

**纵向节奏**：侧栏行高混用 32 / 28 / 24 / 48；同尺寸行的圆角却分别是 18px、8px、9999px（来自不同规则）。

**正文**：段落 14px / 行高 22.75px / 宽 752px；代码块 14px 等宽、`padding: 0`（应用自己给的内边距）、圆角 12px。

### C.2 方案

**C2-1 建立四级圆角比例尺**（替换那条 blanket 规则）

| 层级 | 值 | 用在 |
|---|---|---|
| `--glass-radius-row` | 10px | 侧栏行、菜单项、列表项 |
| `--glass-radius-sm` | 14px | 小卡片、输入框、代码块 |
| `--glass-radius` | 18px | 面板、气泡 |
| `--glass-radius-lg` | 26px | 弹窗 |
| `--glass-radius-pill` | 9999px | **只**给真正的胶囊控件：主按钮、开关、标签 chip、图标圆钮（宽高比≈1 且 ≤32px） |

做法：blanket 规则只保留 transition，圆角/底色按三类选择器分派
（图标钮 `button:has(> svg:only-child)`、行 `[role=option] / .px-menu-item / 侧栏 a`、其余按钮）。

**C2-2 表面三级化**：`rest 0`（透明）/ `hover --glass-raise` / `selected --glass-select + 2px 主色左边条`。
现在 61 个元素静止态就带 0.12 底，等于"全都处于 hover 态"，选中态自然读不出来。
静止态改为透明，层级立刻出来。

**C2-3 分组标题去玻璃**：`Pinned Conversations` / `Projects` 这类 17px 高的标题
→ 无底色、无圆角，`font-size: 11px; letter-spacing: .06em; opacity: .62; text-transform: none`，
和可点击行彻底区分。

**C2-4 侧栏纵向节奏统一**：行高 32（主）/ 28（次级）；行间 2px；分组间 14px；
分组标题上下 `margin: 14px 0 6px`。目标是扫视时能看出"组—行"两层结构。

**C2-5 正文排版**：段距 `margin-block: 0.75em`；标题 `h2/h3` 上下距按 1.4/0.6em；
代码块 13px / 行高 1.62 / 内边距 12px 14px / 圆角 14px（对齐 C2-1）；
行内 code 用 `--glass-raise` 底 + 6px 圆角，不再用 7px 这种孤儿值。

**C2-6 字号收敛**：当前可见字号有 12 / 12.6 / 13 / 14 / 16.94 五档且行高不成体系。
主题侧只统一自己能控的：11（辅助）/ 12（次要）/ 13（正文次级）/ 14（正文）/ 17（标题），
行高一律 1.5（正文）/ 1.3（标题）。应用自带的 16.94px 是 rem 缩放产物，不动。

---

## D. 执行批次与验收

| 批次 | 内容 | 影响面 | 回滚 |
|---|---|---|---|
| **0** | 脚本 BOM 规则写进 `复用指南.md` + 加一个 BOM 自检脚本 | 文档/脚本 | 无风险 |
| **1** | B.1 回归修复（4+4 行令牌 + 两个新参数） | 暗色全 UI | `git checkout` 单文件 |
| **2** | C2-1 / C2-2 / C2-3（圆角与表面层级、分组标题） | 全 UI 形状 | 同上 |
| **3** | C2-4 / C2-5 / C2-6（纵向节奏与正文排版） | 侧栏 + 正文 | 同上 |
| **4** | B.2a 边缘折射带宽调回 + 模糊降到 10px | chrome 观感 | 重跑生成器 |
| **5** | B.3 `--glass-vibrance` 三档 + 面板下拉 | 可选 | 纯新增 |
| **6**（Phase 4，另立） | B.2b chrome 上真 SDF 引擎 | 注入器，需重打包 asar | 见 Phase2 交接文档 |

**每批的验收命令**（都在 `test-reports/md-probe/`）：

```bash
node layout_census_0918.js        # 圆角/表面/字号分布，批次 2、3 后必须看
node layout_ab_0918.js current dark   # 令牌与几何对照，批次 1 后必须看
node edge_ab_0918.js sm           # 新旧边缘滤镜并排，批次 4 后必须看
node glass_cold_verify_0918.js    # 冷启动健康：根无溢出 / clip / p-4=16px / 透镜 renderer
```

**硬性红线（每批都要过）**：根 `scrollHeight === clientHeight`、`html{overflow:clip}`、
`p-4 = 16px`、空 `[role=listbox]` 0×0、浮层 z ≤ 2147483640、指针画布 2147483647。

**测试注意**：Antigravity 窗口被终端遮住时 `visibilityState=hidden`，Chromium 冻结 rAF 与 transition，
任何动效验证都会假失败 —— 在同一个 PowerShell 里先 `AppActivate` 再跑 node。

---

## E. 不做的事

- 不动 `@layer px-theme, properties, theme, base, components, utilities;` 这行登记（会废掉全 UI 间距）。
- 不给聊天消息列表的动态节点批量挂 SDF 实例（Worker 与主线程都扛不住）。
- 不改应用自己的 rem 基准与 16.94px 字号链。
- 不碰另外四套主题的 CSS；注入器改动必须保持 `--px-glass: on` 门控。
