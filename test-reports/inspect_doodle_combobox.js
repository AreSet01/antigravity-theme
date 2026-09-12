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

  // Switch to doodle
  const { execSync } = require('child_process');
  execSync(`powershell -ExecutionPolicy Bypass -File .\\switch-theme.ps1 doodle`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });
  await new Promise(r => setTimeout(r, 3500));

  // Open settings
  await send('Runtime.evaluate', { expression: `document.querySelector('[data-testid="settings-button"]').click()` });
  await new Promise(r => setTimeout(r, 600));

  const cbData = await send('Runtime.evaluate', {
    expression: `(() => {
      const cb = document.querySelector('[role="dialog"] button[role="combobox"]');
      if (!cb) return { error: 'No cb' };
      const cs = window.getComputedStyle(cb);
      return {
        cbTag: cb.tagName,
        cbClass: cb.className,
        innerHTML: cb.innerHTML,
        innerText: cb.innerText,
        computedBg: cs.backgroundColor,
        computedColor: cs.color,
        computedWidth: cs.width,
        computedHeight: cs.height,
        computedVisibility: cs.visibility,
        children: Array.from(cb.children).map(c => {
          const ccs = window.getComputedStyle(c);
          return {
            tag: c.tagName,
            cls: c.className,
            text: c.innerText,
            computedColor: ccs.color,
            computedDisplay: ccs.display,
            computedOpacity: ccs.opacity,
            computedWidth: ccs.width,
            computedHeight: ccs.height
          };
        })
      };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(cbData.result.value, null, 2));

  // Close settings
  await send('Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        const allButtons = Array.from(dialog.querySelectorAll('button'));
        const closeCandidate = allButtons.find(b => {
          const r = b.getBoundingClientRect();
          const dr = dialog.getBoundingClientRect();
          return (r.right >= dr.right - 60) && (r.top <= dr.top + 60);
        });
        if (closeCandidate) closeCandidate.click();
      }
    })()`
  });

  // Restore phantom
  execSync(`powershell -ExecutionPolicy Bypass -File .\\switch-theme.ps1 phantom`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });

  ws.close();
}

main().catch(console.error);
