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

  // Click on the first session link
  const clickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const link = document.querySelector('a[aria-label="解析函数用法"]') || document.querySelector('a[aria-label="Fixing Git Remote Push"]');
      if (link) {
        link.click();
        return { clicked: true, label: link.getAttribute('aria-label') };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });

  console.log('Click result:', clickRes.result.value);
  await new Promise((r) => setTimeout(r, 1200));

  // Inspect chat messages
  const inspectRes = await send('Runtime.evaluate', {
    expression: `(() => {
      // Find message bubbles or turn containers
      const bubbles = Array.from(document.querySelectorAll('[data-testid*="message"], [class*="message"], [class*="prose"], pre, code')).map(el => ({
        tag: el.tagName,
        cls: el.className.slice(0, 50),
        testid: el.getAttribute('data-testid'),
        text: el.innerText ? el.innerText.slice(0, 50) : ''
      }));

      // Find tool action buttons (copy, retry, edit, etc.)
      const actionBtns = Array.from(document.querySelectorAll('button')).filter(b => {
        const a = b.getAttribute('aria-label') || b.getAttribute('title') || b.getAttribute('data-testid') || '';
        return /copy|retry|edit|share|delete|more|复制|重试|编辑/i.test(a);
      }).map(b => ({
        aria: b.getAttribute('aria-label'),
        title: b.getAttribute('title'),
        testid: b.getAttribute('data-testid'),
        cls: b.className.slice(0, 40)
      }));

      return {
        bubblesCount: bubbles.length,
        bubblesSample: bubbles.slice(0, 10),
        actionBtns
      };
    })()`,
    returnByValue: true
  });

  console.log('Inspect result:', JSON.stringify(inspectRes.result.value, null, 2));
  ws.close();
}

main().catch(console.error);
