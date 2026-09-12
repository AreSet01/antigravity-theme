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
      const root = document.querySelector('.h-screen.w-screen');
      const rootStyle = root ? root.getAttribute('style') : null;
      const rootComputed = root ? window.getComputedStyle(root) : null;
      
      const auxVar = rootComputed ? rootComputed.getPropertyValue('--aux-pane-width') : null;
      const sidebarVar = rootComputed ? rootComputed.getPropertyValue('--sidebar-width') : null;

      // Find buttons in header/top-right
      const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
        ariaLabel: b.getAttribute('aria-label'),
        testid: b.getAttribute('data-testid'),
        title: b.getAttribute('title'),
        classes: b.className,
        rect: b.getBoundingClientRect()
      })).filter(b => b.ariaLabel || b.testid || b.title);

      // Find elements with inline style containing aux-pane-width
      const auxConsumers = Array.from(document.querySelectorAll('*')).filter(el => {
        const s = el.getAttribute('style') || '';
        return s.includes('aux-pane-width');
      }).map(el => ({
        tag: el.tagName,
        className: el.className,
        style: el.getAttribute('style'),
        rect: el.getBoundingClientRect(),
        computedPaddingRight: window.getComputedStyle(el).paddingRight,
        computedTransition: window.getComputedStyle(el).transition
      }));

      // Find any aside or aux element
      const auxCandidates = Array.from(document.querySelectorAll('[data-testid*="aux"], [class*="aux"], aside')).map(el => ({
        tag: el.tagName,
        testid: el.getAttribute('data-testid'),
        className: el.className,
        style: el.getAttribute('style'),
        rect: el.getBoundingClientRect(),
        computedWidth: window.getComputedStyle(el).width,
        computedTransition: window.getComputedStyle(el).transition
      }));

      return {
        rootStyle,
        auxVar,
        sidebarVar,
        rootTransition: rootComputed ? rootComputed.transition : null,
        auxConsumers,
        auxCandidates,
        relevantButtons: allButtons.filter(b => (b.ariaLabel && (b.ariaLabel.includes('面板') || b.ariaLabel.includes('侧边栏') || b.ariaLabel.includes('辅助') || b.ariaLabel.includes('aux'))) || (b.testid && (b.testid.includes('aux') || b.testid.includes('sidebar'))))
      };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
}

main().catch(console.error);
