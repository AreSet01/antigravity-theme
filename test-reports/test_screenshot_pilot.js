const fs = require('fs');
const http = require('http');
const path = require('path');

const portFile = path.join(process.env.APPDATA, 'Antigravity', 'DevToolsActivePort');
const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim();
const artifactsDir = path.resolve(__dirname, '..', 'artifacts', 'screenshots');
if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

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

  const capture = async (filename) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    const outPath = path.join(artifactsDir, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`Saved screenshot: ${outPath} (${buf.length} bytes)`);
    return outPath;
  };

  await capture('test_pilot.png');
  ws.close();
}

main().catch(console.error);
