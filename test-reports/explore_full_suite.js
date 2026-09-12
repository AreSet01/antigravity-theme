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

  const pressEscape = async () => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise(r => setTimeout(r, 300));
  };

  // 1. Ensure any open modal is closed
  await pressEscape();
  await pressEscape();

  // 2. Check Aux panel
  const auxBtn = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
      if (btn) {
        btn.click();
        return { clicked: true };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Aux toggle 1:', auxBtn.result.value);
  await new Promise(r => setTimeout(r, 600));

  // Check what is visible in aux panel
  const auxContent = await send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('button, [role="tab"]')).filter(b => {
        const t = (b.innerText || '').trim();
        return ['终端', '工件', '浏览器', 'Diff', 'Terminal', 'Artifacts', 'Browser'].includes(t);
      }).map(b => b.innerText.trim());

      const root = document.querySelector('.h-screen.w-screen') || document.body;
      const auxVar = window.getComputedStyle(root).getPropertyValue('--aux-pane-width');
      return { auxVar, tabs };
    })()`,
    returnByValue: true
  });
  console.log('Aux Content:', JSON.stringify(auxContent.result.value, null, 2));

  // Toggle aux back
  await send('Runtime.evaluate', { expression: `document.querySelector('[data-testid="toggle-aux-sidebar"]').click()` });
  await new Promise(r => setTimeout(r, 600));

  // 3. Check Settings modal tabs
  await send('Runtime.evaluate', { expression: `document.querySelector('[data-testid="settings-button"]').click()` });
  await new Promise(r => setTimeout(r, 600));

  // Click on "外观" tab
  const appearanceTab = await send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('[role="dialog"] button')).filter(b => b.innerText.includes('外观'));
      if (tabs.length > 0) {
        tabs[0].click();
        return { clicked: true, text: tabs[0].innerText };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Appearance tab click:', appearanceTab.result.value);
  await new Promise(r => setTimeout(r, 600));

  const appearanceContent = await send('Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return {
        text: dialog ? dialog.innerText.slice(0, 300) : '',
        comboboxes: Array.from(document.querySelectorAll('[role="dialog"] button[role="combobox"]')).map(b => b.innerText.trim())
      };
    })()`,
    returnByValue: true
  });
  console.log('Appearance tab content:', JSON.stringify(appearanceContent.result.value, null, 2));

  await pressEscape();
  await pressEscape();

  ws.close();
}

main().catch(console.error);
