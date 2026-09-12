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

  console.log('Sending reloads to clean state...');
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 3000));

  const check = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        hasDialog: !!document.querySelector('[role="dialog"]'),
        hasMenu: !!document.querySelector('[role="menu"]'),
        hasPopper: !!document.querySelector('[data-radix-popper-content-wrapper]')
      };
    })()`,
    returnByValue: true
  });
  console.log('Clean check:', check.result.value);

  // Capture clean shot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  fs.writeFileSync(path.resolve(__dirname, '..', 'artifacts', 'screenshots', 'test_clean.png'), buf);
  console.log('Saved clean shot!');
  ws.close();
}

main().catch(console.error);
