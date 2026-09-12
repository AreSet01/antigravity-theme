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

  const rowData = await send('Runtime.evaluate', {
    expression: `(() => {
      const row = document.querySelector('[data-testid="conversation-row-sidebar"]');
      if (!row) return { error: 'No row' };
      const r = row.getBoundingClientRect();
      return {
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        children: Array.from(row.querySelectorAll('*')).map(c => ({
          tag: c.tagName,
          className: c.className,
          text: c.innerText ? c.innerText.trim() : '',
          rect: { x: c.getBoundingClientRect().x, y: c.getBoundingClientRect().y, w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height },
          visibility: window.getComputedStyle(c).visibility,
          opacity: window.getComputedStyle(c).opacity,
          display: window.getComputedStyle(c).display,
          position: window.getComputedStyle(c).position,
          bg: window.getComputedStyle(c).backgroundColor
        })).filter(x => x.text || x.tag === 'BUTTON' || x.tag === 'svg')
      };
    })()`,
    returnByValue: true
  });
  console.log('Unhovered row:', JSON.stringify(rowData.result.value, null, 2));

  // Dispatch mouse move over row
  if (rowData.result.value && rowData.result.value.rect) {
    const r = rowData.result.value.rect;
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(r.x + r.w / 2),
      y: Math.round(r.y + r.h / 2)
    });
    await new Promise(r => setTimeout(r, 500));

    const hoveredData = await send('Runtime.evaluate', {
      expression: `(() => {
        const row = document.querySelector('[data-testid="conversation-row-sidebar"]');
        if (!row) return { error: 'No row' };
        return Array.from(row.querySelectorAll('*')).map(c => ({
          tag: c.tagName,
          className: c.className,
          text: c.innerText ? c.innerText.trim() : '',
          rect: { x: Math.round(c.getBoundingClientRect().x), y: Math.round(c.getBoundingClientRect().y), w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height) },
          visibility: window.getComputedStyle(c).visibility,
          opacity: window.getComputedStyle(c).opacity,
          display: window.getComputedStyle(c).display,
          position: window.getComputedStyle(c).position,
          bg: window.getComputedStyle(c).backgroundColor
        })).filter(x => x.text || x.tag === 'BUTTON' || x.tag === 'svg');
      })()`,
      returnByValue: true
    });
    console.log('Hovered row:', JSON.stringify(hoveredData.result.value, null, 2));
  }

  ws.close();
}
main().catch(console.error);
