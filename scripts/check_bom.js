#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');

// Find all .ps1 files in repo
function findPs1Files(dir, fileList = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item === 'node_modules' || item === '.git') continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findPs1Files(fullPath, fileList);
    } else if (item.toLowerCase().endsWith('.ps1')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const files = findPs1Files(repoDir);
let failures = 0;

console.log(`Checking UTF-8 BOM for ${files.length} PowerShell (.ps1) files...\n`);

for (const f of files) {
  const relPath = path.relative(repoDir, f);
  const buf = fs.readFileSync(f);
  const hasBom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  if (hasBom) {
    console.log(`✓ [BOM OK] ${relPath}`);
  } else {
    console.error(`✗ [NO BOM] ${relPath} (PowerShell 5.1 will misparse Chinese strings!)`);
    failures++;
  }
}

console.log(`\nVerified ${files.length} files. Failures: ${failures}`);
if (failures > 0) {
  process.exit(1);
} else {
  console.log('All PowerShell scripts have required UTF-8 BOM.');
}
