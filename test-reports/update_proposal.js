const fs = require('fs');
const path = require('path');

const target1 = 'C:\\Users\\19096\\.gemini\\antigravity\\brain\\e03dea31-f4e0-4067-9ffb-b5b070469cf4\\interaction_audit_and_proposal.md';
const target2 = 'C:\\Users\\19096\\.gemini\\antigravity\\brain\\67bdf379-577f-4e6b-a820-7c47849c1979\\interaction_audit_and_proposal.md';

let content = fs.readFileSync(target1, 'utf8');

const matrixText = `
### 补丁 10：四大主题专属视觉与交互参数规格表 (Multi-theme Alignment Matrix)

| 主题名称 (Theme) | 菜单左侧指示条色 (Border-Left) | 悬停高亮底色 (Hover Bg) | 悬停文字色 (Hover Text) | 菜单投影 (Hard Shadow) | 光标层级 (Cursor Z-Index) | 侧栏实体遮罩色 (Sidebar Mask) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Phantom (怪盗黑红)** | \`#E60012\` (5px) | \`#E60012\` | \`#FFFFFF\` | \`4px 4px 0 #000000\` | \`2147483647\` | 亮: \`#F4F4F6\` / 暗: \`#262630\` |
| **Pixel (复古像素)** | \`#00F0FF\` (5px) | \`#00F0FF\` | \`#000000\` | \`4px 4px 0 #000000\` | \`2147483647\` | 亮: \`#E5E7EB\` / 暗: \`#1E1E2E\` |
| **Doodle (涂鸦线稿)** | \`#FF3366\` (5px) | \`#FF3366\` | \`#FFFFFF\` | \`3px 3px 0 #111113\` | \`2147483647\` | 亮: \`#FDFBF7\` / 暗: \`#1B1B22\` |
| **Matcha (日系抹茶)** | \`#4E875B\` (5px) | \`#4E875B\` | \`#FFFFFF\` | \`3px 3px 0 #2D5339\` | \`2147483647\` | 亮: \`#F3F6F3\` / 暗: \`#1A241D\` |

---
`;

if (!content.includes('补丁 10：四大主题专属视觉与交互参数规格表')) {
  content = content.replace('## 四、全量 4 大主题执行与 CDP 自动化验证计划', matrixText + '\n## 四、全量 4 大主题执行与 CDP 自动化验证计划');
  fs.writeFileSync(target1, content, 'utf8');
  console.log('Updated target1');
}

fs.writeFileSync(target2, content, 'utf8');
console.log('Saved target2');
