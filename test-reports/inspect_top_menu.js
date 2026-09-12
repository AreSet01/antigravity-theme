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

  // Reset popups
  for (let i = 0; i < 3; i++) {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise(r => setTimeout(r, 100));
  }

  // Click Antigravity button
  console.log('--- Clicking Antigravity button ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Antigravity');
      if (btn) btn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 500));

  const topMenuInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const menu = document.querySelector('div.border-menu-border') || document.querySelector('[class*="border-menu-border"]');
      if (!menu) return { error: 'No menu found' };
      const cs = window.getComputedStyle(menu);
      const buttons = Array.from(menu.querySelectorAll('button'));
      console.log('MENU HTML:', menu.innerHTML);
      return {
        innerHTML: menu.innerHTML,
        className: menu.className,
        border: cs.border,
        borderLeft: cs.borderLeft,
        boxShadow: cs.boxShadow,
        borderRadius: cs.borderRadius,
        animation: cs.animation,
        backgroundColor: cs.backgroundColor,
        minWidth: cs.minWidth,
        buttons: buttons.map(b => {
          const bcs = window.getComputedStyle(b);
          return {
            text: b.innerText.trim(),
            bg: bcs.backgroundColor,
            color: bcs.color,
            fontSize: bcs.fontSize,
            fontFamily: bcs.fontFamily,
            display: bcs.display
          };
        })
      };
    })()`,
    returnByValue: true
  });
  console.log('Top Menu Container & Items:', JSON.stringify(topMenuInfo.result.value, null, 2));

  // Hover interactive item in top menu (检查更新)
  console.log('\n--- Hovering interactive item (检查更新) via CDP Mouse ---');
  const btnRect = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('div.border-menu-border button'));
      const btn = btns.find(b => !b.classList.contains('pointer-events-none'));
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`,
    returnByValue: true
  });
  console.log('Button coordinates:', btnRect.result.value);
  const elementAtPoint = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.elementFromPoint(112, 60);
      return el ? { tag: el.tagName, className: el.className, text: el.innerText ? el.innerText.trim() : '' } : null;
    })()`,
    returnByValue: true
  });
  console.log('Element at point (112, 60):', JSON.stringify(elementAtPoint.result.value, null, 2));
  if (btnRect.result.value) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: btnRect.result.value.x,
      y: btnRect.result.value.y
    });
    await new Promise(r => setTimeout(r, 400));
  }

  const hoverResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('div.border-menu-border button'));
      const btn = btns.find(b => !b.classList.contains('pointer-events-none'));
      if (!btn) return null;
      const bcs = window.getComputedStyle(btn);
      return {
        text: btn.innerText.trim(),
        bg: bcs.backgroundColor,
        color: bcs.color,
        borderLeft: bcs.borderLeft,
        transform: bcs.transform,
        childColors: Array.from(btn.children).map(c => ({
          tag: c.tagName,
          color: window.getComputedStyle(c).color
        }))
      };
    })()`,
    returnByValue: true
  });
  console.log('Hovered Top Menu Item:', JSON.stringify(hoverResult.result.value, null, 2));

  // Close
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  ws.close();
}
main().catch(console.error);
