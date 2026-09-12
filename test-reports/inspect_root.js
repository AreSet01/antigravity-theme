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
      // Find top container hierarchy
      const root = document.querySelector('.h-screen.w-screen') || document.body.firstElementChild;
      const children = Array.from(root.children).map(c => ({
        tag: c.tagName,
        className: c.className,
        rect: c.getBoundingClientRect()
      }));

      // Find sessions links
      const sessionLinks = Array.from(document.querySelectorAll('a[aria-label]')).map(a => ({
        label: a.getAttribute('aria-label'),
        rect: a.getBoundingClientRect()
      }));

      // Find center view text
      const centerArea = document.querySelector('.flex-1.flex.flex-col') || document.body;

      return {
        rootTag: root.tagName,
        rootClass: root.className,
        children,
        sessionLinks: sessionLinks.slice(0, 10),
        centerSnippet: centerArea.innerText.slice(0, 300)
      };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
}

main().catch(console.error);
