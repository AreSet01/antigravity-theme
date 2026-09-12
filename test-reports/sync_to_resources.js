const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');
const appDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity');
const resources = path.join(appDir, 'resources');

if (!fs.existsSync(resources)) {
  console.error('Resources dir does not exist:', resources);
  process.exit(1);
}

const themeFolders = ['phantom-theme', 'pixel-theme', 'doodle-theme', 'matcha-theme'];

for (const tf of themeFolders) {
  const srcDir = path.join(repoDir, tf);
  const dstDir = path.join(resources, tf);

  if (!fs.existsSync(dstDir)) {
    fs.mkdirSync(dstDir, { recursive: true });
  }

  const files = fs.readdirSync(srcDir);
  for (const f of files) {
    const srcFile = path.join(srcDir, f);
    const dstFile = path.join(dstDir, f);
    const stat = fs.statSync(srcFile);
    if (stat.isFile()) {
      fs.copyFileSync(srcFile, dstFile);
      console.log(`Copied ${tf}/${f} -> ${dstFile} (${stat.size} bytes)`);
    }
  }
}

console.log('All 4 theme folders successfully synced to Antigravity resources!');
