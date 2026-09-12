# MD 预览悬停卡顿与 .md 切换缓慢 —— 根因定位与 v2 修复实测报告

> 日期：2026-09-12 ｜ 环境：Windows 11 / Antigravity 2.12.2 (Electron 41 / Chromium 146) / 144Hz / matcha 主题
> 工具：`test-reports/md-probe/`（CDP 合成输入 + PerformanceObserver + Profiler 采样 + 逐 API 计时钩子）

## 一、结论速览

| 指标 | 修复前（v1 注入器） | 修复后（v2 注入器） |
|---|---|---|
| 长文档预览内移动鼠标：单帧主线程阻塞 | **77~106 ms** | **1~5 ms** |
| 悬停期间 Long Task（>50ms） | 13 个 / 累计 1,133 ms | **0 个** |
| 悬停期间 Element.closest 调用量 | 340,590 次（459 ms） | **71 次（0.5 ms）** |
| 切换 .md 标签（长→短）Long Task | 2,158 + 262 ms | **751 ms** |
| 切换 .md 标签（短→长）Long Task | 2,198 + 69 ms | **843 ms**（319+524） |
| 切换期间样式重算 RecalcStyle | 933~993 ms | **8~257 ms** |
| 切换期间排版 Layout | 703~713 ms | **0~134 ms** |
| 点击到渲染完成（dispatch） | ~2.2 s | **0.03~0.33 s** |

## 二、根因（实测定位，推翻旧结论）

### 2.1 悬停卡顿：应用自带的「行内评论悬停追踪器」
每次 mousemove，应用的 `w()`(main.js:4933) 找到光标下的块元素后调用 `g()`(4931) 提取评论上下文：
`AKa → zKa → wIa` 对**整个容器**建两个 Range，用 TreeWalker 遍历全部 ~6,500 个文本节点，
过滤器里每个节点做 `intersectsNode` + 2~3 次 `closest('.select-none'/'.select-text'/'[data-find-ignore]')`
—— 8,754 节点的文档实测每帧 **34 万次 closest、77~106ms 阻塞**。
v1 补丁（`COMMENT_TRACKER_OPT_JS`）只把候选查找换成了 `elementFromPoint`，g() 原封未动，卡顿依旧。

### 2.2 切换卡顿：不是汉化
- 旧报告归因「汉化深搜」不成立：当前 preload 已对 `leading-relaxed/prose/katex` 剪枝（实测注入 "Settings" 不被翻译），本轮切换里汉化只占 ~30ms。
- 真实构成（2.2s 长任务）：React 同步挂载 8.7k 节点 → 左侧列表虚拟滚动器 `zWa`(main.js:5239) 读 `offsetWidth` 强制全树同步 Style+Layout（self 1.5~1.6s）→ 主题 CSS 232 条 `[class*=]` + 124 条通配选择器使全量样式重算多付 ~280ms/次（A/B 注入实测）→ 排版 0.7s。
- `matcha.css` §23.5 注释宣称启用 `content-visibility: auto`，实际写的是把 `cv: visible; contain: none` 全部**关掉**。

## 三、v2 修复内容

### 3.1 注入器 `patch/pixelTheme.js`
1. **`COMMENT_TRACKER_OPT_JS` v2**：querySelectorAll 补丁现在也**闸门 g() 本身**——只有可评论块（p/li/h1..h6/table/th/td/pre/div.code-line/markdown-frontmatter）且跟踪容器 ≤1,200 节点（WeakMap 计数，按 `__pxDomGen` 变更代失效）才返回命中。长文档预览（8.7k 节点）直接无候选 → g() 不运行 → 悬停 0 开销；聊天消息容器小（~200 节点），评论气泡功能保留。
2. **`STREAM_WATCH_JS` 菜单打标**：挂载瞬间给 ARIA 角色元素打 `px-menu-item / px-listbox-item / px-menu-content` 类，CSS 改用类桶匹配（O(1) 索引）替代 ~140 条后代通配选择器。
   - **必须只观察 childList**：观察 class 属性变更会导致「打标 ↔ 框架回写 className」在 MutationObserver 微任务里互相触发，**主线程饿死**（实测打开模型下拉菜单必现整个渲染进程卡死；去掉后消失）。
   - 面板打标不看 `:empty`：React 分批填内容，挂载瞬间面板可能是空的。
3. 汉化 preload 不变（剪枝已正确）。

### 3.2 四套主题 CSS（84 处精确替换，`apply_css_v2.js` 可复算）
1. §23.5 改为真正的 `content-visibility: auto` + `contain-intrinsic-size: auto 40px`（只挂 `.leading-relaxed > *` 直接子块；不给 table/th/td 开 cv——Chromium 表格支持不完整；不开 paint contain——裁装饰）。
2. 删除 `html, body, body *` 的 font-smoothing / font-synthesis（→ `:root` 一次设置靠继承）与 scrollbar-color/width（→ 只命中 `[class*="overflow"], .md-table-scroll`）。
3. `.katex, .katex *` → `.katex`；`.monaco-editor *` 同理靠继承。
4. 菜单系后代通配规则全部改为 `.px-menu-item` / `.px-listbox-item` / `.px-menu-content`（mega 31 条选择器 → 5 条；light/dark 重复复合器合并）。
5. `:has()` 滚动容器匹配器（4 条）删除，等价直选 `.leading-relaxed, [class*="prose"]`。

## 四、视觉回归核验（实机截图）
- 模型下拉菜单：奶白面板 + 墨绿 2px 边框 + 5px 绿色左条 + 硬阴影 + matcha-menu-enter 入场动画 ✓ 悬停项变白 ✓（`v2_dropdown_now.png`）
- 标题栏「文件」菜单：3 项打标 ✓ 面板绿色左边框 ✓（`v2_file_menu.png`）
- 设置弹窗：完整抹茶外观 + 左侧导航 + 主题卡片 ✓ Escape 优雅退出 ✓（`v2_settings_open.png`）
- 聊天区悬停：1~9ms，评论气泡功能保留（小容器通过闸门）
- MD 列表/表格/代码块/公式渲染正常；`contain-intrinsic-size` 使首屏滚动条略短（35,352px→~18,600px 估值），滚动后按真实高度收敛

## 五、已知取舍
1. **长文档预览内不再出现行内评论气泡**（>1,200 节点容器跳过 g()）——这是 80~100ms/帧换来的；聊天消息内评论功能不受影响。
2. 首次打开长文档滚动条长度为估算值，滚动过程中逐步收敛到真实值。
3. 若未来 Antigravity 自动更新把 `app.asar` 还原为官方版（注入器消失），px-* 类不会被打了：菜单退回应用原生配色（不损坏，仅无主题样式）。重跑 `install.ps1` 即恢复。

## 六、部署与复算
- `install.ps1`（注入器 → asar）+ `switch-theme.ps1 matcha`（活动主题，注意 install.ps1 每次会把活动主题重置为 phantom，需手动切回）
- 探针：`probe_live.js`（悬停+切换基准）、`probe_css_cats.js`（主题选择器边际成本）、`verify_menus.js` / `repro_jam.js`（菜单与回归）、`apply_css_v2.js`（CSS 改写复算）
- 注意：`install.ps1` 在应用未完全退出时（句柄未释放）`Move-Item` 会静默失败——重打包后务必核对 `app.asar` mtime / 抽取 `dist/pixelTheme.js` 验证版本。
