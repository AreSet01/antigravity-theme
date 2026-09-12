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

  // Reset any open modals
  for (let i = 0; i < 3; i++) {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise(r => setTimeout(r, 100));
  }

  // Ensure conversation is open
  await send('Runtime.evaluate', {
    expression: `(() => {
      const link = document.querySelector('a[aria-label="解析函数用法"]') || document.querySelector('a[aria-label*="Fixing"]') || document.querySelector('[data-testid="conversation-row-sidebar"] a') || document.querySelector('a[href*="/c/"]');
      if (link) link.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1200));

  // 1. Open model selector trigger
  console.log('--- Opening Model Selector ---');
  const triggerFound = await send('Runtime.evaluate', {
    expression: `(() => {
      const t = document.querySelector('[data-testid="model-selector-trigger"]');
      if (t) { t.click(); return true; }
      return false;
    })()`,
    returnByValue: true
  });
  console.log('Trigger clicked:', triggerFound.result.value);
  await new Promise(r => setTimeout(r, 600));

  // Inspect all open poppers/menus
  const poppersInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], [data-radix-collection-item]'));
      return items.map(it => ({
        tag: it.tagName,
        text: it.innerText.split('\\n')[0].trim(),
        className: it.className,
        attrs: Array.from(it.attributes).map(a => a.name + '=' + a.value),
        bg: window.getComputedStyle(it).backgroundColor,
        color: window.getComputedStyle(it).color,
        childColors: Array.from(it.children).map(c => ({
          tag: c.tagName,
          text: c.innerText.trim(),
          color: window.getComputedStyle(c).color,
          bg: window.getComputedStyle(c).backgroundColor
        }))
      }));
    })()`,
    returnByValue: true
  });
  console.log('Open Model Menu Items:', JSON.stringify(poppersInfo.result.value, null, 2));

  // Enable CSS inspection
  await send('DOM.enable');
  await send('CSS.enable');
  const doc = await send('DOM.getDocument', { depth: -1 });
  const itemNode = await send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '[role="menuitem"], [role="option"]'
  });
  if (itemNode && itemNode.nodeId) {
    const matched = await send('CSS.getMatchedStylesForNode', { nodeId: itemNode.nodeId });
    console.log('\nMatched rules for first model item:');
    matched.matchedCSSRules.forEach(r => {
      const colorProp = r.rule.style.cssProperties.filter(p => ['color', 'background-color', 'fill'].includes(p.name));
      if (colorProp.length > 0) {
        console.log(`[${r.rule.selectorList.text}]: ${colorProp.map(p => p.name + ': ' + p.value).join('; ')}`);
      }
    });
  }

  // Find item with submenu and press ArrowRight to open submenu
  const foundSub = await send('Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"]'));
      const target = items.find(it => it.innerText.includes('Gemini 3.6') || it.innerText.includes('3.6') || it.innerText.includes('Flash') || it.getAttribute('aria-haspopup'));
      if (target) {
        target.focus();
        target.scrollIntoView();
        return { text: target.innerText.split('\\n')[0], tag: target.tagName, attrs: Array.from(target.attributes).map(a => a.name + '=' + a.value) };
      }
      return null;
    })()`,
    returnByValue: true
  });
  console.log('Target item with submenu:', JSON.stringify(foundSub.result.value, null, 2));

  // Send ArrowRight
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await new Promise(r => setTimeout(r, 600));

  // Now inspect ALL open menus/poppers/submenus and their items!
  const allSubmenus = await send('Runtime.evaluate', {
    expression: `(() => {
      const menus = Array.from(document.querySelectorAll('[role="menu"], [data-radix-menu-content], [data-radix-popper-content-wrapper]'));
      return menus.map((m, idx) => {
        const cs = window.getComputedStyle(m);
        const rect = m.getBoundingClientRect();
        return {
          idx,
          tag: m.tagName,
          className: m.className,
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          zIndex: cs.zIndex,
          border: cs.border,
          borderLeft: cs.borderLeft,
          boxShadow: cs.boxShadow,
          backgroundColor: cs.backgroundColor,
          items: Array.from(m.querySelectorAll('[role="menuitem"], [role="option"], [data-radix-collection-item], button, [tabindex]')).filter(it => it.innerText && it.innerText.trim()).map(it => {
            const ics = window.getComputedStyle(it);
            return {
              tag: it.tagName,
              text: it.innerText.split('\\n')[0].trim(),
              attrs: Array.from(it.attributes).map(a => a.name + '=' + a.value),
              bg: ics.backgroundColor,
              color: ics.color,
              highlighted: it.hasAttribute('data-highlighted') || it.getAttribute('data-state') === 'open',
              children: Array.from(it.children).map(c => ({
                tag: c.tagName,
                text: c.innerText.trim(),
                color: window.getComputedStyle(c).color,
                bg: window.getComputedStyle(c).backgroundColor
              }))
            };
          })
        };
      });
    })()`,
    returnByValue: true
  });
  console.log('All open menus and submenus:', JSON.stringify(allSubmenus.result.value, null, 2));

  // Also move down into submenu using ArrowDown
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await new Promise(r => setTimeout(r, 400));

  const afterArrowDown = await send('Runtime.evaluate', {
    expression: `(() => {
      const active = document.activeElement;
      const cs = active ? window.getComputedStyle(active) : null;
      return active ? {
        tag: active.tagName,
        text: active.innerText.split('\\n')[0].trim(),
        attrs: Array.from(active.attributes).map(a => a.name + '=' + a.value),
        bg: cs ? cs.backgroundColor : null,
        color: cs ? cs.color : null,
        children: Array.from(active.children).map(c => ({
          tag: c.tagName,
          text: c.innerText.trim(),
          color: window.getComputedStyle(c).color
        }))
      } : null;
    })()`,
    returnByValue: true
  });
  console.log('Active element after ArrowDown:', JSON.stringify(afterArrowDown.result.value, null, 2));



  // Close
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  ws.close();
}

main().catch(console.error);
