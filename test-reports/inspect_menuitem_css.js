const fs = require('fs');
const http = require('http');
const path = require('path');

const portFile = path.join(process.env.APPDATA, 'Antigravity', 'DevToolsActivePort');
const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim();

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const targets = await getTargets();
  const main = targets.find((x) => x.type === 'page' && !x.url.startsWith('data:'));
  const ws = new WebSocket(main.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let msgId = 0;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++msgId;
      const h = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id === id) {
          ws.removeEventListener('message', h);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id, method, params }));
    });

  // Switch to pixel
  const { execSync } = require('child_process');
  execSync(`powershell -ExecutionPolicy Bypass -File .\\switch-theme.ps1 pixel`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });
  await new Promise(r => setTimeout(r, 3500));

  // Open kebab
  await send('Runtime.evaluate', {
    expression: `(() => {
      const kebab = document.querySelector('[data-testid="conversation-kebab"]');
      if (kebab) kebab.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  // Inspect the first menu item's computed styles and matched rules
  await send('DOM.enable');
  await send('CSS.enable');
  const doc = await send('DOM.getDocument', { depth: -1 });
  const itemNode = await send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '[role="menu"] [role="menuitem"], [role="menu"] button'
  });

  console.log('Item node id:', itemNode.nodeId);
  if (itemNode.nodeId) {
    const matched = await send('CSS.getMatchedStylesForNode', { nodeId: itemNode.nodeId });
    const computed = await send('CSS.getComputedStyleForNode', { nodeId: itemNode.nodeId });
    const bg = computed.computedStyle.find(s => s.name === 'background-color');
    const color = computed.computedStyle.find(s => s.name === 'color');
    console.log('Computed background:', bg);
    console.log('Computed color:', color);
    console.log('Matched CSS rules:');
    matched.matchedCSSRules.forEach(r => {
      if (r.rule.style.cssText.includes('background') || r.rule.style.cssText.includes('color')) {
        console.log(`[${r.rule.selectorList.text}]: ${r.rule.style.cssText}`);
      }
    });
  }

  // Restore phantom
  execSync(`powershell -ExecutionPolicy Bypass -File .\\switch-theme.ps1 phantom`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });

  ws.close();
}

main().catch(console.error);
