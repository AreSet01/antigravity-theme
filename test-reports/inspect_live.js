const fs = require('fs');
const http = require('http');
const path = require('path');

const portFile = path.join(process.env.APPDATA, 'Antigravity', 'DevToolsActivePort');
function getPort() {
  return fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim();
}
function getTargets(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const port = getPort();
  const list = await getTargets(port);
  const mainTarget = list.find((x) => x.type === 'page' && !x.url.startsWith('data:'));
  if (!mainTarget) throw new Error('Main page target not found');
  const ws = new WebSocket(mainTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
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
    expression: '(() => { const cur = document.getElementById("px-cursor"); return { htmlClasses: document.documentElement.className, bodyClasses: document.body.className, cursorEl: cur ? { tagName: cur.tagName, zIndex: window.getComputedStyle(cur).zIndex, position: window.getComputedStyle(cur).position, pointerEvents: window.getComputedStyle(cur).pointerEvents, parentElement: cur.parentElement ? cur.parentElement.tagName : null, nextSibling: cur.nextElementSibling ? cur.nextElementSibling.tagName : null } : null }; })()',
    returnByValue: true
  });
  console.log('--- Initial Info ---', JSON.stringify(res.result.value, null, 2));

  // Inspect Sidebar row DOM
  console.log('\n--- Inspecting Sidebar Row ---');
  const sidebarInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const row = document.querySelector('[data-testid="conversation-row-sidebar"]');
      if (!row) return { error: 'No conversation row found' };
      const rect = row.getBoundingClientRect();
      return {
        rowTag: row.tagName,
        rowClass: row.className,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        innerHTML: row.innerHTML
      };
    })()`,
    returnByValue: true
  });
  console.log('Sidebar row:', JSON.stringify(sidebarInfo.result.value, null, 2));

  // Hover over row
  if (sidebarInfo.result.value && sidebarInfo.result.value.rect) {
    const r = sidebarInfo.result.value.rect;
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(r.x + r.w / 2),
      y: Math.round(r.y + r.h / 2)
    });
    await new Promise(r => setTimeout(r, 400));

    const hoveredRowInfo = await send('Runtime.evaluate', {
      expression: `(() => {
        const row = document.querySelector('[data-testid="conversation-row-sidebar"]');
        if (!row) return null;
        return Array.from(row.querySelectorAll('*')).map(el => {
          const cs = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            className: el.className,
            text: el.innerText ? el.innerText.trim() : '',
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            visibility: cs.visibility,
            opacity: cs.opacity,
            display: cs.display,
            position: cs.position,
            bg: cs.backgroundColor,
            color: cs.color,
            zIndex: cs.zIndex
          };
        }).filter(x => x.text || x.tag === 'BUTTON' || x.tag === 'svg');
      })()`,
      returnByValue: true
    });
    console.log('Hovered row elements:', JSON.stringify(hoveredRowInfo.result.value, null, 2));
  }

  // 2. Open Title Menu
  console.log('\n--- Clicking Antigravity Title Button ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Antigravity');
      if (btn) btn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 800));

  const afterClick = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Antigravity');
      const parent = btn ? btn.parentElement : null;
      // All siblings or absolute/popovers in parent or body
      const menuInParent = parent ? Array.from(parent.children).filter(c => c !== btn).map(c => ({
        tag: c.tagName,
        className: c.className,
        style: c.getAttribute('style'),
        innerHTML: c.innerHTML.substring(0, 100),
        csBorder: window.getComputedStyle(c).border,
        csBorderLeft: window.getComputedStyle(c).borderLeft,
        csBoxShadow: window.getComputedStyle(c).boxShadow,
        csRadius: window.getComputedStyle(c).borderRadius,
        csBg: window.getComputedStyle(c).backgroundColor,
        csAnimation: window.getComputedStyle(c).animation,
        items: Array.from(c.querySelectorAll('*')).filter(x => x.children.length === 0 && x.innerText && x.innerText.trim()).map(x => ({
          text: x.innerText.trim(),
          className: x.className,
          tag: x.tagName,
          csBg: window.getComputedStyle(x).backgroundColor,
          csColor: window.getComputedStyle(x).color,
          beforeBorder: window.getComputedStyle(x, '::before').borderLeft
        }))
      })) : [];

      const bodyMenus = Array.from(document.querySelectorAll('[role="menu"], [data-radix-popper-content-wrapper]')).map(m => ({
        tag: m.tagName,
        className: m.className,
        style: m.getAttribute('style'),
        innerHTML: m.innerHTML.substring(0, 100)
      }));

      return { menuInParent, bodyMenus };
    })()`,
    returnByValue: true
  });
  console.log('After Clicking Antigravity menuInParent:', JSON.stringify(afterClick.result.value.menuInParent, null, 2));

  // Inspect matched styles on the title menu div and its buttons
  await send('DOM.enable');
  await send('CSS.enable');
  const doc = await send('DOM.getDocument', { depth: -1 });
  const menuNode = await send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: 'div.border-menu-border'
  });
  console.log('menuNode id:', menuNode.nodeId);
  if (menuNode.nodeId) {
    const matched = await send('CSS.getMatchedStylesForNode', { nodeId: menuNode.nodeId });
    console.log('Matched rules for div.border-menu-border:');
    if (matched && matched.matchedCSSRules) {
      matched.matchedCSSRules.forEach(r => {
        if (r.rule && r.rule.selectorList && r.rule.style && r.rule.style.cssProperties) {
          const props = r.rule.style.cssProperties.filter(p => ['box-shadow', 'border', 'border-left', 'animation', 'background-color'].includes(p.name));
          if (props.length > 0) {
            console.log(`[${r.rule.selectorList.text}]: ${props.map(p => p.name + ': ' + p.value).join('; ')}`);
          }
        }
      });
    }

    const itemNode = await send('DOM.querySelector', {
      nodeId: menuNode.nodeId,
      selector: 'button'
    });
    if (itemNode.nodeId) {
      const itemMatched = await send('CSS.getMatchedStylesForNode', { nodeId: itemNode.nodeId });
      console.log('\nMatched rules for title menu button:');
      itemMatched.matchedCSSRules.forEach(r => {
        console.log(`[${r.rule.selectorList.text}]: ${r.rule.style.cssText}`);
      });
    }
  }

  // 3. Open Kebab Menu
  console.log('\n--- Opening Kebab Menu ---');
  await send('Runtime.evaluate', {
    expression: '(() => { const kebab = document.querySelector("[data-testid=\\"conversation-kebab\\"]"); if (kebab) kebab.click(); })()'
  });
  await new Promise(r => setTimeout(r, 600));

  const kebabRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const menus = Array.from(document.querySelectorAll('[role="menu"]'));
      return menus.map(m => {
        const cs = window.getComputedStyle(m);
        return {
          tag: m.tagName,
          className: m.className,
          border: cs.border,
          borderLeft: cs.borderLeft,
          boxShadow: cs.boxShadow,
          borderRadius: cs.borderRadius,
          animation: cs.animation,
          items: Array.from(m.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')).map(it => {
            const ics = window.getComputedStyle(it);
            return {
              text: it.innerText.split('\\n')[0].trim(),
              className: it.className,
              bg: ics.backgroundColor,
              color: ics.color,
              borderLeft: ics.borderLeft,
              beforeBorder: window.getComputedStyle(it, '::before').borderLeft,
              children: Array.from(it.children).map(c => ({
                tag: c.tagName,
                color: window.getComputedStyle(c).color
              }))
            };
          })
        };
      });
    })()`,
    returnByValue: true
  });
  console.log('--- Kebab Menu Info ---', JSON.stringify(kebabRes.result.value, null, 2));

  // Also inspect context menu by dispatching contextmenu event on conversation row
  console.log('\n--- Opening Context Menu ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const row = document.querySelector('[data-testid="conversation-row-sidebar"]');
      if (row) {
        const rect = row.getBoundingClientRect();
        const ev = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect.x + 50,
          clientY: rect.y + 15
        });
        row.dispatchEvent(ev);
      }
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  const contextMenuRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const menus = Array.from(document.querySelectorAll('[role="menu"]'));
      return menus.map(m => {
        const cs = window.getComputedStyle(m);
        return {
          tag: m.tagName,
          className: m.className,
          border: cs.border,
          borderLeft: cs.borderLeft,
          boxShadow: cs.boxShadow,
          borderRadius: cs.borderRadius,
          animation: cs.animation,
          items: Array.from(m.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')).map(it => {
            const ics = window.getComputedStyle(it);
            return {
              text: it.innerText.split('\\n')[0].trim(),
              className: it.className,
              bg: ics.backgroundColor,
              color: ics.color,
              borderLeft: ics.borderLeft,
              beforeBorder: window.getComputedStyle(it, '::before').borderLeft
            };
          })
        };
      });
    })()`,
    returnByValue: true
  });
  console.log('--- Context Menu Info ---', JSON.stringify(contextMenuRes.result.value, null, 2));

  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  ws.close();
}
main().catch(console.error);
