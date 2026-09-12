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

  await send('DOM.enable');
  await send('CSS.enable');

  const doc = await send('DOM.getDocument', { depth: -1 });

  // Find some nodes with Chinese text
  const nodes = await send('Runtime.evaluate', {
    expression: `(() => {
      const els = Array.from(document.querySelectorAll('a, button, span, p, div')).filter(el => {
        return el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 && /[\u4e00-\u9fa5]/.test(el.innerText);
      }).slice(0, 5);
      return els.map(el => ({ text: el.innerText.trim(), tag: el.tagName, cls: el.className }));
    })()`,
    returnByValue: true
  });
  console.log('Sample text nodes:', nodes.result.value);

  // Check fonts installed / loaded in document
  const fonts = await send('Runtime.evaluate', {
    expression: `(() => {
      const loaded = [];
      document.fonts.forEach(f => {
        loaded.push({ family: f.family, status: f.status, loaded: f.loaded ? 'yes' : 'no' });
      });
      return loaded;
    })()`,
    returnByValue: true
  });
  console.log('Document Fonts:', fonts.result.value);

  ws.close();
}

main().catch(console.error);
