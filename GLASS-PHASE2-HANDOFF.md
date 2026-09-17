# LIQUID GRAVITY 液态玻璃主题 —— Phase 2/3 开发交接

> 面向接手开发的 agent。Phase 1（纯 CSS 玻璃主题）已完成并实机验证，本文件是**剩余工作**的施工单。
> 仓库：`E:\搞搞新意思\antigravity-美化`；目标应用：Antigravity（Electron，实机在
> `%LOCALAPPDATA%\Programs\Antigravity`）。

---

## 0. 现状（开工前先读）

### 已交付
- `glass-theme/glass.css`（约 1180 行）：第五套主题「LIQUID GRAVITY」，纯 CSS 交付。
  - 三层：`body::before` 极光壁纸（纯 CSS + transform 合成动画）→ `backdrop-filter` 玻璃面 →
    四边不等亮内描边 + 斜向高光 + 柔和投影。
  - **真折射已实现且可用**：`backdrop-filter` 第一段是 `var(--glass-lens*)`，指向一枚
    **data: URI 外链 SVG 滤镜**（两趟 `feDisplacementMap` 做边缘透镜）。本机 Chromium 146 实测
    确认该写法真的作用于 backdrop（`scale=0` vs `80` 截图哈希不同、玻璃内外文字可见错位）。
  - 五个强度档 `--glass-lens-xs|sm|md|lg|xl` 由 `test-reports/md-probe/gen_glass_lens.js` 生成；
    分工：chrome 用 `sm`、浮层用 `xs`、正文卡片 `brightness(1)`（关闭）。
  - 参数区在文件第 0 节（`--glass-*`），改完 Ctrl+R 即生效。
- 五套主题注册齐了：`install.ps1` / `switch-theme.ps1` / `install.sh` / `switch.sh` /
  `uninstall.ps1` / `uninstall.sh`（README、复用指南里的主题表也可按需补）。
- 实机验收全绿：根 `scrollHeight === clientHeight`、`html{overflow:clip}`、空浮层壳 0×0、
  Tailwind 间距完好（`p-4=16px` / `px-3=12px` / `ol=32px decimal`）、玻璃表面 computed
  `backdrop-filter` 含折射滤镜。四套老主题无回归。

### 工作区状态（未提交）
`git status` 应看到：`glass-theme/`（新）+ `install.ps1` / `switch-theme.ps1` / `install.sh` /
`switch.sh` / `uninstall.ps1` / `uninstall.sh` / `patch/pixelTheme.js`（改）。全部只改了本地，
**没有提交、没有推送**。

### 当前运行态与一个临时补丁
用户机器上 `active-theme.json = glass-theme`，主题已在跑。但 **asar 里的注入器还是旧的**：
`patch/pixelTheme.js` 的 `readThemeCss()` 原本只认四个硬编码文件名（phantom/matcha/doodle/pixel），
第五套主题会**两个分支都落空 → 返回空串 → insertCSS 插空表 → 切换后整个应用没有任何主题**（不报错！）。
工作区已修好（新增第 3 步兜底：`<目录名去 -theme>.css` → 目录里任意 `.css`），
**但必须重打包 asar 才生效**。在此之前，`resources/glass-theme/phantom.css` 是一份 glass.css 的
**兼容副本**（顶住旧解析器），切主题不会删它（`switch-theme.ps1` 用 `Copy-Item $LocalSrc\*`，不清目录）。

---

## 1. 必做前置任务

### T1（阻塞项）重打包 asar，让注入器认识第五套主题
1. 完全退出 Antigravity（进程未退净时 `Move-Item` 会静默失败）。
2. `powershell -ExecutionPolicy Bypass -File .\install.ps1 -Theme glass -KillRunning`
3. **核对是否真的生效**（install.ps1 会静默失败，必须验）：
   - `app.asar` 的 mtime 是刚刚；
   - 或抽取验证：`node test-reports/md-probe/asar_list.js "%LOCALAPPDATA%\Programs\Antigravity\resources\app.asar" extract dist/pixelTheme.js /tmp/pixelTheme.js`
     然后在 `/tmp/pixelTheme.js` 里 `grep -c "no CSS file found in theme dir"`（新增日志）应为 1。
4. 删掉兼容副本：`rm "%LOCALAPPDATA%\Programs\Antigravity\resources\glass-theme\phantom.css"`
5. 重新刷新验证：`node test-reports/md-probe/glass_verify_0917.js`（令牌、壁纸、表面 bd、必修项、
   Tailwind 健康应全绿）。
6. 注意：`install.ps1` 会把 `active-theme.json` 重置为传入的主题；装完确认是 `glass-theme`。

### T2 提交（可选，按用户指示）
建议分两个提交：① 五套主题注册 + 注入器解析器修复；② `glass-theme/glass.css`。**不要推送**，除非用户明确要求。

---

## 2. Phase 2 · 注入器 widget（`patch/pixelTheme.js`）

> 全部遵循仓库既有 payload 模式：模板字符串常量 + 在 `attachPixelTheme()` 的 `dom-ready`
> 里 `wc.executeJavaScript(..., true)` 装载 + 幂等判定（`window.__pxXxx` / `already-present`）+
> `stop()` 可清理。**按主题 token 门控**：glass.css 已声明 `--px-glass: on`，其它四套主题没有，
> 装载前先读一次主题声明（参照 `wantsNativeCaption()` 的写法）再决定是否注入，避免给老主题白付成本。

### W1 指针跟随高光（`GLASS_SHEEN_JS`）
- 一个 `pointermove`（`capture: true, passive: true`）+ rAF 节流；把指针在**玻璃表面内**的相对位置
  写成该元素的内联 `--glass-mx / --glass-my`（0~1）。
- CSS 侧（glass-theme 待补）：玻璃面加一层 `radial-gradient(circle at calc(var(--glass-mx)*100%) ...)` 的
  `.px-sheen` 层或 `::after`，强度取 `--glass-sheen`。
- 静止 250ms 自动停（照抄 `CURSOR_JS` 的 `idleStopMs`/`wake()` 思路）；窗口 `blur`/`visibilitychange`
  隐藏时清空；`document` 上**只挂一个**监听器，用 `elementFromPoint` 之外的最近玻璃祖先定位（避免每帧 qsa）。
- 验收：鼠标在侧栏上移动时高光跟随、静止后停止重绘（用 `Performance.getMetrics` 前后差值确认 idle 归零）。

### W2 鼠标透镜（参考站的「拖动镜片，看边缘」）
- `https://glass.zs.uy/` 的招牌交互：一块玻璃跟着指针走，边缘实时折射。
- 实现建议：注入器创建一个 `#px-glass-lens` 元素（挂 body，`position: fixed`、`pointer-events: none`），
  内联 `backdrop-filter: var(--glass-lens-lg) blur(...)`，rAF 里跟随指针（用 transform 位移，避免布局）。
- 约束：`z-index` 必须 **≤ 2147483640**（指针画布 2147483647、窗口按钮 2147483644 不动）；
  跟随用 `transform`，不要 `left/top`；提供开关（`--glass-lens-follow: on|off`）与静止停摆。
- 验收：移动时镜片边缘可见畸变（截图对比固定/跟随两态），静止 300ms 后停止重绘，帧时间不劣化。

### W3 实时调参面板（`GLASS_PANEL_JS`）
- 悬浮面板（可拖动/折叠，本身用 glass 材质），滑杆直接写 `:root` 的 `--glass-*` → 全 UI 即时生效。
- 参数集照 `glass.css` 第 0 节：`--glass-blur / -sat / -bright / -alpha / -alpha-hi / -alpha-card /
  -rim-top / -rim-side / -rim-bot / -sheen / -radius / -wall-vivid / -wall-speed / -grain`，
  折射档 `/浮层档/卡片档` 三选一（`--glass-lens*` 只能选预生成档位，**scale 不能由 CSS 变量驱动**）。
- 预设：iOS 明亮 / 夜间高对比 / 省电（perf 档）。
- 「复制为 CSS」按钮：把当前值拼成一段 `:root { ... }` 交给剪贴板（`navigator.clipboard.writeText`）。
- **固化（可选）**：面板 `console.log('[px-glass] ' + JSON.stringify(params))` → 主进程
  `wc.on('console-message')` 拦截该前缀 → 写 `resources/glass-theme/glass-user.css` → `insertCSS` 热更新。
  这样不动 preload、不污染应用的 `nativeStorage`。用户手改主题 CSS 永远是「真源」，`glass-user.css`
  只存面板覆盖值（删掉即回默认）。

### W4 画质档联动
- glass.css 已备好 `html[data-px-glass="ultra|balanced|perf"]` 三档规则。注入器读 `--glass-quality`
  的值写到 `document.documentElement` 的 `data-px-glass` 属性上（**只在值变化时写**，别每帧写）。
- perf 档建议同时停掉 W1/W2 的常驻监听。

### W5 色散（chromatic aberration）
- 现状：透镜是单通道位移（X 用贴图 R 通道、Y 用 G 通道，其它通道恒 128 隔离），**没有色散**。
- 做法：同一张贴图跑三趟 `feDisplacementMap`（R/G/B 各用略不同的 scale），再用
  `feColorMatrix` 抽出单通道 + `feComposite` 相加合成。生成器 `gen_glass_lens.js` 已预留 `chroma` 参数
  （早期实验版有实现，可参考 `glass_lab.js` 里的 `refractFilter(scale, bevel, chroma)`）。
- 成本：滤镜图变三倍，**必须先测帧时间**再决定是否默认开启；建议默认 0，作为参数给用户开。

### W6 指针策略收尾
- glass.css 目前用 CSS 隐藏了自绘像素指针（`#px-cursor{display:none}` + 还原系统 cursor），
  但 `CURSOR_JS` 引擎仍在跑（白付 rAF 成本）。加一行门控：主题声明 `--px-cursor: off` 时**跳过装载 CURSOR_JS**。
- 可选加分项：玻璃主题专属的「透镜圆盘」指针（真正消费 `--px-cursor-radius`，目前该 token 无人读）。

### W7 性能上限实测（决定 balanced 档的表面数量）
- 测同一屏挂 1 / 4 / 8 块 `url()` 玻璃时的帧时间与 LongTask（144Hz 屏）。
- 复用 `test-reports/md-probe/probe_live.js` / `inpage_wrap.js` 的采集手法；
  结论写回 glass.css 第 10 节（`--glass-quality` 各档允许的表面数量）。

---

## 3. 硬约束（血泪教训，别重新踩）

1. **注入器绝不能观察 class 属性**（`MutationObserver` 只看 `childList`）：观察 class 会与框架回写
   className 形成微任务互答，渲染进程直接饿死。
2. **主题 CSS 里不写 `@layer` + Tailwind 层名**（utilities/theme/base/components）：会把层序顶乱，
   全 UI 的 `p-*` / `m-*` / `border-*` 一次性失效。只用文件顶部登记好的 `px-theme` 层。
3. **浮层 z-index ≤ 2147483640**；指针画布 2147483647、窗口按钮 2147483644 保持不动。
   打平会按 DOM 顺序决胜，浮层会盖住指针（表现为「悬停菜单上没有指针」）。
4. **每套主题都要带**：空浮层壳归零（`[role=menu]:empty` 等）+ `html{overflow:clip}`
   （`none` 挡不住程序化滚动）+ 空壳归零，否则会出「整个 UI 上移、标题栏被裁」的偶发超框。
5. **位移动效要给容器留内边距余量**，或一律用 `scale`（transform 位移计入祖先滚动容器的
   scrollable overflow，会凭空冒出滚动条）。
6. **主题表与注入器必须同版本部署**：`.px-menu-item / .px-listbox-item / .px-menu-content` 由注入器打标，
   CSS 与 asar 版本不一致时菜单会退回原生配色。
7. **install.ps1 在 Antigravity 未退净时静默失败**：重打包后必须核对 mtime 或抽取 `dist/pixelTheme.js` 验证。
8. **透镜只能用在 chrome 上**：压在密集正文（消息气泡/代码块）上会把背景文字拉出重影，像渲染 bug。
9. 实测确认的坑：`group/user-input` / `[data-testid="user-input-step"]` 是**用户消息气泡**的类名，
   不是输入栏——拿去当 composer 选择器会给每条消息套上强透镜。

---

## 4. 部署与验证手册

### CSS-only 改动（推荐路径，秒级）
```bash
# 1) 改仓库里的 glass-theme/glass.css
# 2) 同步到运行目录（两个名字都要，phantom.css 是给旧注入器的兼容副本，T1 后可删）
R="$LOCALAPPDATA/Programs/Antigravity/resources"
cp glass-theme/glass.css "$R/glass-theme/glass.css"
cp glass-theme/glass.css "$R/glass-theme/phantom.css"   # T1 完成后这行不再需要
# 3) 刷新
cd test-reports/md-probe && node cdp.js -e "location.reload()"
```
或用现成脚本：`.\switch-theme.ps1 glass`（会同步 + 写 active-theme.json + CDP 自动刷新）。

### 注入器改动（必须重打包 + 重启应用）
改完 `patch/pixelTheme.js` 后先跑 **语法检查**（9 个内嵌 payload 全部要过）：
```bash
node test-reports/md-probe/check_payloads.js     # 期望 failures: 0
```
再按 T1 的步骤重打包。**期间用户的 Antigravity 必须关闭**。

### 现成探针（都在 `test-reports/md-probe/`，均已 gitignore）
| 脚本 | 用途 |
|---|---|
| `glass_verify_0917.js` | 主题验收：令牌 / 壁纸层 / 各表面 computed `backdrop-filter` / 必修项 / Tailwind 健康，一次跑完 |
| `glass_shot.js` | 实拍当前渲染 + 打印关键状态（`node glass_shot.js 名字.png`） |
| `glass_refract_gate.js` | 裁决 `backdrop-filter` 的 url() 折射是否真作用于 backdrop（三形态 + 哈希对比） |
| `gen_glass_lens.js` | 生成边缘透镜位移滤镜的 data: URI（五档），改强度/带宽后可重生成并替换 CSS 第 0.1 节 |
| `glass_lab.js` / `glass_lab2.js` | 在真实窗口铺「鲜艳壁纸 + 多配方玻璃」对照板（看折射/色散/描边） |
| `glass_tune.js` | 把候选参数集当覆盖表打进页面，逐组截图对比（调参最快的手段） |
| `verify_all_themes_0917.js` | 五套主题逐一切换 reload 的回归检查（注意它只认四套，需扩到五套） |

### 每次改完必跑的验收（预期值）
- `document.documentElement.scrollHeight === clientHeight`（无根溢出），`scrollTop === 0`
- `getComputedStyle(documentElement).overflow === 'clip'`
- 空浮层壳 `[role=listbox]:empty` 的 rect = 0×0
- 合成元素：`p-4` = 16px、`px-3` = 12px、`pl-8`+`list-decimal` = 32px / decimal
- 标题栏 `backdrop-filter` 含 `feDisplacementMap`（折射在跑）
- 截图确认：亮色/暗色两套都要看（`glass_tune.js` 可临时切 `body.theme-light` 看另一套）

---

## 5. 已知取舍（不是 bug，别去"修"）

- **消息气泡底部那行淡字**是应用自己的渐隐截断效果，与本主题无关。
- **代码块不做玻璃**：它下面常年压着另一段密集代码，透明 + 模糊会叠成「鬼影」。
- **玻璃主题用系统指针**（隐藏了自绘像素指针），见 W6。
- **亮色/暗色参数分叉**是刻意的：亮色玻璃要薄（`--glass-alpha: 0.34`），白多了背景色会被洗掉。
- 折射档的模糊半径要小（参考站「模糊程度 0.35px」），透镜本身才是主角；糊太狠就没有透镜感了。
