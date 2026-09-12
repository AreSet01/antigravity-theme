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

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { hasDialog: false };
      // find close button in top right of dialog
      const allButtons = Array.from(dialog.querySelectorAll('button'));
      const closeCandidate = allButtons.find(b => {
        const r = b.getBoundingClientRect();
        const dr = dialog.getBoundingClientRect();
        return (r.right >= dr.right - 60) && (r.top <= dr.top + 60);
      });
      return {
        hasDialog: true,
        closeCandidate: closeCandidate ? {
          cls: closeCandidate.className,
          html: closeCandidate.innerHTML,
          aria: closeCandidate.getAttribute('aria-label')
        } : null
      };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));

  // Try clicking the close candidate
  const closeRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return false;
      const allButtons = Array.from(dialog.querySelectorAll('button'));
      const closeCandidate = allButtons.find(b => {
        const r = b.getBoundingClientRect();
        const dr = dialog.getBoundingClientRect();
        return (r.right >= dr.right - 60) && (r.top <= dr.top + 60);
      });
      if (closeCandidate) {
        closeCandidate.click();
        return true;
      }
      return false;
    })()`,
    returnByValue: true
  });
  console.log('Clicked close:', closeRes.result.value);

  await new Promise(r => setTimeout(r, 600));

  const afterCheck = await send('Runtime.evaluate', {
    expression: `!!document.querySelector('[role="dialog"]')`,
    returnByValue: true
  });
  console.log('Dialog still open after click?:', afterCheck.result.value);

  ws.close();
}

main().catch(console.error);
