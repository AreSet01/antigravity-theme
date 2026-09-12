const fs = require('fs');
const http = require('http');
const path = require('path');

const portFile = path.join(process.env.APPDATA, 'Antigravity', 'DevToolsActivePort');
const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim();

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + port + '/json', (res) => {
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
          else resolve(data);
        }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id, method, params }));
    });

  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const cur = document.getElementById('px-cursor');
      return {
        htmlClasses: document.documentElement.className,
        bodyClasses: document.body.className,
        cursorEl: cur ? {
          tagName: cur.tagName,
          zIndex: window.getComputedStyle(cur).zIndex,
          position: window.getComputedStyle(cur).position,
          pointerEvents: window.getComputedStyle(cur).pointerEvents,
          parentElement: cur.parentElement ? cur.parentElement.tagName : null
        } : null
      };
    })()`,
    returnByValue: true
  });
  console.log('--- Initial Info ---', JSON.stringify(info.result.value, null, 2));

  // 1. Open model selector
  await send('Runtime.evaluate', {
    expression: '(() => { const t = document.querySelector("[data-testid=\"model-selector-trigger\"]"); if (t) t.click(); })()'
  });
  await new Promise(r => setTimeout(r, 600));

  const modelInfo = await send('Runtime.evaluate', {
    expression: '(() => {' +
      'const wrappers = Array.from(document.querySelectorAll("[data-radix-popper-content-wrapper], [role=\"menu\"]"));' +
      'return JSON.stringify(wrappers.map(w => ({' +
        'tag: w.tagName,' +
        'className: w.className,' +
        'zIndex: window.getComputedStyle(w).zIndex,' +
        'items: Array.from(w.querySelectorAll("[role=\"menuitem\"], [role=\"option\"]")).slice(0, 5).map(it => ({' +
          'text: it.innerText.split("\\\\n")[0].trim(),' +
          'className: it.className,' +
          'bg: window.getComputedStyle(it).backgroundColor,' +
          'color: window.getComputedStyle(it).color,' +
          'borderLeft: window.getComputedStyle(it).borderLeft,' +
          'beforeBorder: window.getComputedStyle(it, "::before").borderLeft' +
        '}))' +
      '})));' +
    '})()',
    returnByValue: true
  });
  console.log('--- Model Menu Info ---', modelInfo.result ? modelInfo.result.value : modelInfo);

  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await new Promise(r => setTimeout(r, 300));

  // 2. Open Title Menu
  await send('Runtime.evaluate', {
    expression: '(() => { const b = document.querySelectorAll("[data-testid=\"title-menu-bar\"] button"); if (b[0]) b[0].click(); })()'
  });
  await new Promise(r => setTimeout(r, 600));

  const titleInfo = await send('Runtime.evaluate', {
    expression: '(() => {' +
      'const menus = Array.from(document.querySelectorAll("[role=\"menu\"], [data-testid=\"title-menu-bar-menu\"], [data-radix-popper-content-wrapper]"));' +
      'return JSON.stringify(menus.map(m => ({' +
        'tag: m.tagName,' +
        'className: m.className,' +
        'zIndex: window.getComputedStyle(m).zIndex,' +
        'border: window.getComputedStyle(m).border,' +
        'boxShadow: window.getComputedStyle(m).boxShadow,' +
        'items: Array.from(m.querySelectorAll("[role=\"menuitem\"], [data-testid=\"title-menu-bar-option\"]")).slice(0, 5).map(it => ({' +
          'text: it.innerText.split("\\\\n")[0].trim(),' +
          'className: it.className,' +
          'bg: window.getComputedStyle(it).backgroundColor,' +
          'color: window.getComputedStyle(it).color,' +
          'borderLeft: window.getComputedStyle(it).borderLeft,' +
          'beforeBorder: window.getComputedStyle(it, "::before").borderLeft' +
        '}))' +
      '})));' +
    '})()',
    returnByValue: true
  });
  console.log('--- Title Menu Info ---', titleInfo.result.value);

  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await new Promise(r => setTimeout(r, 300));

  // 3. Open Kebab Menu
  await send('Runtime.evaluate', {
    expression: '(() => { const k = document.querySelector("[data-testid=\"conversation-kebab\"]"); if (k) k.click(); })()'
  });
  await new Promise(r => setTimeout(r, 600));

  const kebabInfo = await send('Runtime.evaluate', {
    expression: '(() => {' +
      'const menus = Array.from(document.querySelectorAll("[role=\"menu\"]"));' +
      'return JSON.stringify(menus.map(m => ({' +
        'tag: m.tagName,' +
        'className: m.className,' +
        'zIndex: window.getComputedStyle(m).zIndex,' +
        'border: window.getComputedStyle(m).border,' +
        'boxShadow: window.getComputedStyle(m).boxShadow,' +
        'items: Array.from(m.querySelectorAll("[role=\"menuitem\"]")).map(it => ({' +
          'text: it.innerText.split("\\\\n")[0].trim(),' +
          'className: it.className,' +
          'bg: window.getComputedStyle(it).backgroundColor,' +
          'color: window.getComputedStyle(it).color,' +
          'borderLeft: window.getComputedStyle(it).borderLeft,' +
          'beforeBorder: window.getComputedStyle(it, "::before").borderLeft' +
        '}))' +
      '})));' +
    '})()',
    returnByValue: true
  });
  console.log('--- Kebab Menu Info ---', kebabInfo.result.value);

  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  ws.close();
}
main().catch(console.error);
