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

  console.log('Testing 1: Model selector trigger...');
  const modelRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('[data-testid="model-selector-trigger"]');
      if (btn) {
        btn.click();
        return { clicked: true };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Model trigger:', modelRes.result.value);
  await new Promise(r => setTimeout(r, 600));

  const modelMenu = await send('Runtime.evaluate', {
    expression: `(() => {
      const popover = document.querySelector('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]');
      return popover ? {
        found: true,
        tag: popover.tagName,
        className: popover.className,
        rect: popover.getBoundingClientRect(),
        items: Array.from(popover.querySelectorAll('[role="menuitem"], [role="option"], button')).map(i => i.innerText.trim().slice(0, 30))
      } : { found: false };
    })()`,
    returnByValue: true
  });
  console.log('Model Menu:', JSON.stringify(modelMenu.result.value, null, 2));

  // Close model menu by clicking body
  await send('Runtime.evaluate', { expression: `document.body.click()` });
  await new Promise(r => setTimeout(r, 400));

  console.log('Testing 2: Conversation kebab menu...');
  const kebabRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('[data-testid="conversation-kebab"]');
      if (btn) {
        btn.click();
        return { clicked: true };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Kebab trigger:', kebabRes.result.value);
  await new Promise(r => setTimeout(r, 600));

  const kebabMenu = await send('Runtime.evaluate', {
    expression: `(() => {
      const popover = document.querySelector('[role="menu"], [data-radix-popper-content-wrapper]');
      return popover ? {
        found: true,
        tag: popover.tagName,
        className: popover.className,
        rect: popover.getBoundingClientRect(),
        items: Array.from(popover.querySelectorAll('[role="menuitem"], button')).map(i => i.innerText.trim())
      } : { found: false };
    })()`,
    returnByValue: true
  });
  console.log('Kebab Menu:', JSON.stringify(kebabMenu.result.value, null, 2));

  // Close kebab menu
  await send('Runtime.evaluate', { expression: `document.body.click()` });
  await new Promise(r => setTimeout(r, 400));

  console.log('Testing 3: Settings modal...');
  const setRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('[data-testid="settings-button"]');
      if (btn) {
        btn.click();
        return { clicked: true };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Settings trigger:', setRes.result.value);
  await new Promise(r => setTimeout(r, 600));

  const setDialog = await send('Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { found: false };
      const tabs = Array.from(dialog.querySelectorAll('nav button, [role="tablist"] button, aside button, button')).filter(b => {
        return b.closest('nav') || b.closest('[role="tablist"]') || (b.parentElement && b.parentElement.className.includes('flex-col'));
      }).map(b => b.innerText.trim());
      return {
        found: true,
        rect: dialog.getBoundingClientRect(),
        tabs
      };
    })()`,
    returnByValue: true
  });
  console.log('Settings Dialog:', JSON.stringify(setDialog.result.value, null, 2));

  // Close settings dialog via escape or close button
  await send('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.querySelector('[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has(svg.lucide-x)');
      if (closeBtn) closeBtn.click();
      else {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      }
    })()`
  });
  await new Promise(r => setTimeout(r, 500));

  ws.close();
}

main().catch(console.error);
