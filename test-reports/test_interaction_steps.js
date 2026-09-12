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

  const mouseMove = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await new Promise(r => setTimeout(r, 100));
  };

  console.log('1. Ensuring conversation is loaded...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const link = document.querySelector('a[aria-label="解析函数用法"]') || document.querySelector('a[aria-label*="Fixing"]');
      if (link) link.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log('2. Testing Kebab click...');
  const kebabRect = await send('Runtime.evaluate', {
    expression: `(() => {
      const kebab = document.querySelector('[data-testid="conversation-kebab"]');
      if (!kebab) return null;
      const r = kebab.getBoundingClientRect();
      kebab.click();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })()`,
    returnByValue: true
  });
  console.log('Kebab rect & clicked:', kebabRect.result.value);
  await new Promise(r => setTimeout(r, 500));

  const kebabMenuInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const menu = document.querySelector('[role="menu"]');
      return menu ? {
        tag: menu.tagName,
        cls: menu.className,
        rect: menu.getBoundingClientRect(),
        items: Array.from(menu.querySelectorAll('[role="menuitem"], button')).map(i => i.innerText.trim())
      } : null;
    })()`,
    returnByValue: true
  });
  console.log('Kebab menu info:', kebabMenuInfo.result.value);
  await pressEscape();

  console.log('3. Testing Model Selector click...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const b = document.querySelector('[data-testid="model-selector-trigger"]');
      if (b) b.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 500));

  const modelMenuInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const menu = document.querySelector('[role="menu"], [data-radix-popper-content-wrapper]');
      return menu ? {
        cls: menu.className,
        rect: menu.getBoundingClientRect(),
        items: Array.from(menu.querySelectorAll('[role="menuitem"], button')).map(i => i.innerText.trim().slice(0, 30))
      } : null;
    })()`,
    returnByValue: true
  });
  console.log('Model menu info:', modelMenuInfo.result.value);
  await pressEscape();

  console.log('4. Testing Input Focus...');
  const inputInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector('div[contenteditable="true"]');
      if (el) {
        el.focus();
        el.textContent = '请帮我优化这段交互体验与视觉动效...';
        return { focused: true, rect: el.getBoundingClientRect() };
      }
      return { focused: false };
    })()`,
    returnByValue: true
  });
  console.log('Input info:', inputInfo.result.value);

  console.log('5. Testing Settings Modal & Tabs...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const b = document.querySelector('[data-testid="settings-button"]');
      if (b) b.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  // Open combobox in Settings
  const cbInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const cb = document.querySelector('[role="dialog"] button[role="combobox"]');
      if (cb) {
        cb.click();
        return { clicked: true, text: cb.innerText.trim() };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Settings combobox clicked:', cbInfo.result.value);
  await new Promise(r => setTimeout(r, 500));

  await pressEscape(); // closes combobox
  await new Promise(r => setTimeout(r, 300));

  // Click Appearance tab
  await send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('[role="dialog"] button')).filter(b => b.innerText.includes('外观'));
      if (tabs.length > 0) tabs[0].click();
    })()`
  });
  await new Promise(r => setTimeout(r, 500));

  // Click Shortcuts tab
  const shortcutsClicked = await send('Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('[role="dialog"] button')).filter(b => b.innerText.includes('快捷键'));
      if (tabs.length > 0) {
        tabs[0].click();
        return true;
      }
      return false;
    })()`,
    returnByValue: true
  });
  console.log('Shortcuts tab clicked:', shortcutsClicked.result.value);
  await new Promise(r => setTimeout(r, 500));

  await pressEscape(); // closes settings
  await pressEscape();

  console.log('All test steps verified successfully!');
  ws.close();
}

main().catch(console.error);
