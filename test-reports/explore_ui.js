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
  if (!main) throw new Error('No main page target');

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
      const allButtons = Array.from(document.querySelectorAll('button, a, [role="button"], input, textarea')).map(el => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          text: el.innerText ? el.innerText.trim().slice(0, 40) : '',
          aria: el.getAttribute('aria-label'),
          title: el.getAttribute('title'),
          testid: el.getAttribute('data-testid'),
          role: el.getAttribute('role'),
          className: el.className,
          visible: rect.width > 0 && rect.height > 0,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
        };
      }).filter(b => b.visible);

      // Main sections
      const sections = {
        sidebar: !!document.querySelector('aside, [data-testid*="sidebar"], .sidebar'),
        header: !!document.querySelector('header, [data-testid*="header"], .titlebar, [data-testid*="title"]'),
        chatArea: !!document.querySelector('[data-testid*="chat"], main, [class*="conversation"], [class*="chat"]'),
        auxPane: !!document.querySelector('[data-testid*="aux"], aside[class*="aux"]'),
        dialog: !!document.querySelector('[role="dialog"]'),
        dropdown: !!document.querySelector('[role="menu"], [role="listbox"], .dropdown, [data-radix-popper-content-wrapper]')
      };

      // Find sessions list
      const sessions = Array.from(document.querySelectorAll('[data-testid*="session"], [data-testid*="conversation"], [class*="session-item"], [class*="thread"]')).map(el => ({
        tag: el.tagName,
        text: el.innerText ? el.innerText.trim().slice(0, 30) : '',
        className: el.className,
        rect: el.getBoundingClientRect()
      }));

      return {
        windowInner: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
        sections,
        sessionsCount: sessions.length,
        sessionsSample: sessions.slice(0, 5),
        interactiveCount: allButtons.length,
        buttons: allButtons.slice(0, 40)
      };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
}

main().catch(console.error);
