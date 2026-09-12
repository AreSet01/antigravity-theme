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

  // Check if settings is currently open, if not open it
  let evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      let modal = document.querySelector('[role="dialog"]');
      if (!modal) {
        const btn = document.querySelector('[data-testid="settings-button"]');
        if (btn) btn.click();
      }
      return !!document.querySelector('[role="dialog"]');
    })()`,
    returnByValue: true
  });

  await new Promise((r) => setTimeout(r, 600));

  evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { error: 'No dialog found' };

      // Inspect dialog attributes & structure
      const dialogInfo = {
        tagName: dialog.tagName,
        className: dialog.className,
        role: dialog.getAttribute('role'),
        ariaModal: dialog.getAttribute('aria-modal'),
        computedPadding: window.getComputedStyle(dialog).padding,
        computedBoxShadow: window.getComputedStyle(dialog).boxShadow,
        computedBorder: window.getComputedStyle(dialog).border,
        rect: dialog.getBoundingClientRect()
      };

      // Check if dialog is or contains .settings-modal-container
      const hasSettingsClass = dialog.classList.contains('settings-modal-container');
      const innerContainer = dialog.querySelector('.settings-modal-container') || dialog.closest('.settings-modal-container');

      // Inspect left tabs
      const tabs = Array.from(dialog.querySelectorAll('nav button, [role="tablist"] button, aside button, button')).filter(b => {
        const p = b.closest('nav') || b.closest('[role="tablist"]') || (b.parentElement && b.parentElement.className.includes('flex-col'));
        return !!p;
      }).map(b => ({
        text: b.textContent.trim(),
        className: b.className,
        role: b.getAttribute('role'),
        ariaSelected: b.getAttribute('aria-selected'),
        computedBg: window.getComputedStyle(b).backgroundColor,
        computedColor: window.getComputedStyle(b).color,
        computedBorder: window.getComputedStyle(b).border,
        computedRadius: window.getComputedStyle(b).borderRadius,
        computedShadow: window.getComputedStyle(b).boxShadow,
        rect: b.getBoundingClientRect()
      }));

      // Inspect form controls
      const comboboxes = Array.from(dialog.querySelectorAll('button[role="combobox"]')).map(b => ({
        text: b.textContent.trim(),
        className: b.className,
        computedBg: window.getComputedStyle(b).backgroundColor,
        computedColor: window.getComputedStyle(b).color,
        computedBorder: window.getComputedStyle(b).border,
        rect: b.getBoundingClientRect()
      }));

      const switches = Array.from(dialog.querySelectorAll('button[role="switch"]')).map(b => ({
        ariaChecked: b.getAttribute('aria-checked'),
        className: b.className,
        computedBg: window.getComputedStyle(b).backgroundColor,
        computedBorder: window.getComputedStyle(b).border,
        rect: b.getBoundingClientRect()
      }));

      // Inspect overflow scroll area and last child
      const scrollAreas = Array.from(dialog.querySelectorAll('.overflow-auto, .overflow-y-auto')).map(el => {
        const lastChild = el.lastElementChild;
        return {
          className: el.className,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          lastChildTag: lastChild ? lastChild.tagName : null,
          lastChildClass: lastChild ? lastChild.className : null,
          lastChildPaddingBottom: lastChild ? window.getComputedStyle(lastChild).paddingBottom : null
        };
      });

      const generalBtn = Array.from(document.querySelectorAll('.settings-modal-container button')).find(b => b.textContent.trim() === '通用');
      if (generalBtn) generalBtn.click();
      return { clicked: !!generalBtn };
    })()`,
    returnByValue: true
  });

  await new Promise((r) => setTimeout(r, 400));

  evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const cb = document.querySelector('.settings-modal-container button[role="combobox"]');
      if (cb) cb.click();
      return { clicked: !!cb };
    })()`,
    returnByValue: true
  });

  await new Promise((r) => setTimeout(r, 400));

  evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const d = document.querySelector('.settings-modal-container');
      const nav = d.querySelector('nav') || d.querySelector('.overflow-y-auto')?.parentElement;
      return {
        navTag: nav ? nav.tagName : null,
        navClass: nav ? nav.className : null,
        navStyle: nav ? nav.getAttribute('style') : null
      };
    })()`,
    returnByValue: true
  });

  console.log('Nav container:', JSON.stringify(evalRes.result.value, null, 2));
  ws.close();
}

main().catch(console.error);
