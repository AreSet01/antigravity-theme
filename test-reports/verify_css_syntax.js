const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');
const themes = [
  'pixel-theme/pixel.css',
  'doodle-theme/doodle.css',
  'matcha-theme/matcha.css',
  'phantom-theme/phantom.css'
];

let allPassed = true;

for (const t of themes) {
  const fullPath = path.join(repoDir, t);
  const content = fs.readFileSync(fullPath, 'utf8');
  let openBraces = 0;
  let closeBraces = 0;
  let inComment = false;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];

    if (inComment) {
      if (c === '*' && next === '/') {
        inComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === stringChar) {
        inString = false;
      }
      continue;
    }

    if (c === '/' && next === '*') {
      inComment = true;
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      continue;
    }

    if (c === '{') openBraces++;
    if (c === '}') closeBraces++;
  }

  const balanced = (openBraces === closeBraces);
  console.log(`${t}: openBraces=${openBraces}, closeBraces=${closeBraces}, balanced=${balanced}`);
  if (!balanced) allPassed = false;
}

if (!allPassed) {
  console.error('FAILED: Unbalanced CSS braces detected!');
  process.exit(1);
} else {
  console.log('SUCCESS: All 4 CSS stylesheets have perfectly balanced braces.');
}
