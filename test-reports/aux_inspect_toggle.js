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

  // Click toggle
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
      if (btn) btn.click();
    })()`
  });

  await new Promise(r => setTimeout(r, 650));

  const afterExpand = await send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.h-screen.w-screen');
      const rootStyle = root ? root.getAttribute('style') : null;
      const rootComputed = root ? window.getComputedStyle(root) : null;
      const auxVar = rootComputed ? rootComputed.getPropertyValue('--aux-pane-width') : null;

      // Find the right pane element!
      const allDivs = Array.from(document.querySelectorAll('div, aside, section')).filter(el => {
        const w = el.getBoundingClientRect().width;
        const r = el.getBoundingClientRect().right;
        return w > 100 && Math.abs(r - window.innerWidth) < 5;
      }).map(el => ({
        tag: el.tagName,
        className: el.className,
        id: el.id,
        style: el.getAttribute('style'),
        rect: {
          x: el.getBoundingClientRect().x,
          y: el.getBoundingClientRect().y,
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height
        },
        computedTransition: window.getComputedStyle(el).transition
      }));

      const topBarConsumer = document.querySelector('[style*="36px - var(--aux-pane-width)"]');

      return {
        rootStyle,
        auxVar,
        topBarPaddingRight: topBarConsumer ? window.getComputedStyle(topBarConsumer).paddingRight : null,
        rightPanes: allDivs
      };
    })()`,
    returnByValue: true
  });

  console.log('EXPANDED:', JSON.stringify(afterExpand.result.value, null, 2));

  // Toggle back to collapse
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
      if (btn) btn.click();
    })()`
  });

  await new Promise(r => setTimeout(r, 650));

  const afterCollapse = await send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.h-screen.w-screen');
      const rootStyle = root ? root.getAttribute('style') : null;
      const topBarConsumer = document.querySelector('[style*="36px - var(--aux-pane-width)"]');
      return {
        rootStyle,
        topBarPaddingRight: topBarConsumer ? window.getComputedStyle(topBarConsumer).paddingRight : null
      };
    })()`,
    returnByValue: true
  });

  console.log('COLLAPSED:', JSON.stringify(afterCollapse.result.value, null, 2));

  ws.close();
}

main().catch(console.error);
