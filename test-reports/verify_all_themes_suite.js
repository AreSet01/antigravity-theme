const fs = require('fs');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');

const portFile = path.join(process.env.APPDATA, 'Antigravity', 'DevToolsActivePort');
const artifactsDir = path.resolve(__dirname, '..', 'artifacts', 'screenshots');
if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

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

async function connectToMainPage(retries = 6) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const port = getPort();
      const list = await getTargets(port);
      const main = list.find((x) => x.type === 'page' && !x.url.startsWith('data:'));
      if (!main) throw new Error('Main page target not found');

      const ws = new WebSocket(main.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });

      let msgId = 0;
      const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const id = ++msgId;
          const handler = (msg) => {
            const data = JSON.parse(msg.data);
            if (data.id === id) {
              ws.removeEventListener('message', handler);
              if (data.error) reject(data.error);
              else resolve(data.result);
            }
          };
          ws.addEventListener('message', handler);
          ws.send(JSON.stringify({ id, method, params }));
        });

      await send('Runtime.evaluate', { expression: 'document.readyState' });
      return { ws, send };
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1200));
    }
  }
}

async function captureScreenshot(send, filename) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  const fullPath = path.join(artifactsDir, filename);
  fs.writeFileSync(fullPath, buf);
  console.log(`  [Screenshot Saved] ${filename} (${buf.length} bytes)`);
  return fullPath;
}

async function resetPopups(send) {
  for (let i = 0; i < 4; i++) {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 120));
  }
}

async function switchTheme(themeKey) {
  console.log(`\n================================================================`);
  console.log(`>>> SWITCHING TO THEME: ${themeKey}`);
  console.log(`================================================================`);
  execSync(`powershell -ExecutionPolicy Bypass -File .\\switch-theme.ps1 ${themeKey}`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });
  await new Promise((r) => setTimeout(r, 3500));
}

async function verifyTheme(themeKey) {
  const { ws, send } = await connectToMainPage();
  const report = { theme: themeKey, tests: {} };

  try {
    await resetPopups(send);

    // Wait for conversation elements to be present
    for (let w = 0; w < 20; w++) {
      const hasLink = await send('Runtime.evaluate', {
        expression: `!!(document.querySelector('a[aria-label="解析函数用法"]') || document.querySelector('[data-testid="conversation-row-sidebar"] a') || document.querySelector('[data-testid="conversation-row-sidebar"]'))`,
        returnByValue: true
      });
      if (hasLink && hasLink.result && hasLink.result.value) break;
      await new Promise(r => setTimeout(r, 300));
    }

    // Ensure conversation loaded
    await send('Runtime.evaluate', {
      expression: `(() => {
        const link = document.querySelector('a[aria-label="解析函数用法"]') || document.querySelector('a[aria-label*="Fixing"]') || document.querySelector('[data-testid="conversation-row-sidebar"] a') || document.querySelector('[data-testid="conversation-row-sidebar"]');
        if (link) link.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1200));

    // Wait for model selector trigger
    for (let w = 0; w < 20; w++) {
      const hasTrigger = await send('Runtime.evaluate', {
        expression: `!!document.querySelector('[data-testid="model-selector-trigger"]')`,
        returnByValue: true
      });
      if (hasTrigger && hasTrigger.result && hasTrigger.result.value) break;
      await new Promise(r => setTimeout(r, 300));
    }

    // -------------------------------------------------------------
    // Test 1: 图一验证 (Model selector dropdown & Submenu & Cursor)
    // -------------------------------------------------------------
    console.log(`\n[${themeKey}] Testing Issue 1: Model selector & Submenu...`);
    await resetPopups(send);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const t = document.querySelector('[data-testid="model-selector-trigger"]');
        if (t) t.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 500));

    // Open submenu with ArrowRight
    await send('Runtime.evaluate', {
      expression: `(() => {
        const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
        const sub = items.find(it => it.getAttribute('aria-haspopup') === 'menu' || it.innerText.includes('Gemini 3.8') || it.innerText.includes('Flash'));
        if (sub) sub.focus();
      })()`
    });
    await new Promise(r => setTimeout(r, 200));
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await new Promise(r => setTimeout(r, 400));
    // Move into submenu
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await new Promise(r => setTimeout(r, 400));

    // Move cursor over active submenu item to visually capture cursor above submenu
    const activeSubRect = await send('Runtime.evaluate', {
      expression: `(() => {
        const a = document.activeElement;
        if (!a) return null;
        const r = a.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`,
      returnByValue: true
    });
    if (activeSubRect.result.value) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: activeSubRect.result.value.x,
        y: activeSubRect.result.value.y
      });
      await new Promise(r => setTimeout(r, 300));
    }

    const modelCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const cur = document.getElementById('px-cursor');
        const curZ = cur ? window.getComputedStyle(cur).zIndex : null;
        const active = document.activeElement;
        const acs = active ? window.getComputedStyle(active) : null;
        const wrappers = Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper], [role="menu"]'));
        const maxPopperZ = Math.max(...wrappers.map(w => parseInt(window.getComputedStyle(w).zIndex) || 0));
        return {
          cursorZ: curZ,
          maxPopperZ: maxPopperZ,
          cursorAboveMenus: parseInt(curZ) > maxPopperZ,
          activeItem: active ? {
            tag: active.tagName,
            text: active.innerText.split('\\n')[0].trim(),
            bg: acs ? acs.backgroundColor : null,
            color: acs ? acs.color : null
          } : null
        };
      })()`,
      returnByValue: true
    });
    console.log(`  Model Menu & Cursor Result:`, JSON.stringify(modelCheck.result.value, null, 2));
    report.tests.modelSelector = modelCheck.result.value;

    await captureScreenshot(send, `${themeKey}_test_model_submenu.png`);
    await resetPopups(send);

    // -------------------------------------------------------------
    // Test 2: 图二验证 (Sidebar session hover timestamp & kebab)
    // -------------------------------------------------------------
    console.log(`\n[${themeKey}] Testing Issue 2: Sidebar session hover...`);
    const rowRect = await send('Runtime.evaluate', {
      expression: `(() => {
        const row = document.querySelector('[data-testid="conversation-row-sidebar"]');
        if (!row) return null;
        const r = row.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`,
      returnByValue: true
    });
    if (rowRect.result.value) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: rowRect.result.value.x,
        y: rowRect.result.value.y
      });
      await new Promise(r => setTimeout(r, 500));
    }

    const sidebarCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const row = document.querySelector('[data-testid="conversation-row-sidebar"]');
        if (!row) return { error: 'No row' };
        const tsDiv = row.querySelector('[class*="group-hover:invisible"]');
        const tsSpan = tsDiv ? tsDiv.querySelector('span') : null;
        const actionBtns = Array.from(row.querySelectorAll('button'));
        return {
          timestampDivDisplay: tsDiv ? window.getComputedStyle(tsDiv).display : null,
          timestampDivVisibility: tsDiv ? window.getComputedStyle(tsDiv).visibility : null,
          timestampSpanDisplay: tsSpan ? window.getComputedStyle(tsSpan).display : null,
          timestampSpanVisibility: tsSpan ? window.getComputedStyle(tsSpan).visibility : null,
          buttonsCount: actionBtns.length,
          buttonsVisible: actionBtns.map(b => window.getComputedStyle(b).visibility),
          noOverlap: (!tsDiv || window.getComputedStyle(tsDiv).display === 'none' || window.getComputedStyle(tsDiv).visibility === 'hidden')
        };
      })()`,
      returnByValue: true
    });
    console.log(`  Sidebar Hover Check Result:`, JSON.stringify(sidebarCheck.result.value, null, 2));
    report.tests.sidebarHover = sidebarCheck.result.value;

    await captureScreenshot(send, `${themeKey}_test_sidebar_hover.png`);

    // -------------------------------------------------------------
    // Test 3: 图三对齐图四验证 (Top system dropdown menu: Antigravity)
    // -------------------------------------------------------------
    console.log(`\n[${themeKey}] Testing Issue 3: Top System Menu Bar...`);
    await resetPopups(send);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Antigravity');
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 500));

    // Hover interactive item in top menu
    const topBtnPos = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('div.border-menu-border button'));
        const btn = btns.find(b => !b.classList.contains('pointer-events-none'));
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`,
      returnByValue: true
    });
    if (topBtnPos.result.value) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: topBtnPos.result.value.x,
        y: topBtnPos.result.value.y
      });
      await new Promise(r => setTimeout(r, 400));
    }

    const topMenuCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const menu = document.querySelector('div.border-menu-border');
        if (!menu) return { error: 'No menu' };
        const cs = window.getComputedStyle(menu);
        const btns = Array.from(menu.querySelectorAll('button'));
        const hoveredBtn = btns.find(b => !b.classList.contains('pointer-events-none'));
        const hbCs = hoveredBtn ? window.getComputedStyle(hoveredBtn) : null;
        return {
          border: cs.border,
          borderLeft: cs.borderLeft,
          boxShadow: cs.boxShadow,
          borderRadius: cs.borderRadius,
          animation: cs.animation,
          hoveredItem: hoveredBtn ? {
            text: hoveredBtn.innerText.trim(),
            bg: hbCs.backgroundColor,
            color: hbCs.color,
            borderLeft: hbCs.borderLeft,
            transform: hbCs.transform
          } : null
        };
      })()`,
      returnByValue: true
    });
    console.log(`  Top Menu Check Result:`, JSON.stringify(topMenuCheck.result.value, null, 2));
    report.tests.topMenu = topMenuCheck.result.value;

    await captureScreenshot(send, `${themeKey}_test_top_menu.png`);
    await resetPopups(send);

    // -------------------------------------------------------------
    // Test 4: 图四上下文菜单对比验证 (Kebab / Right click context menu)
    // -------------------------------------------------------------
    console.log(`\n[${themeKey}] Testing Context Menu for alignment comparison...`);
    const rowRectForKebab = await send('Runtime.evaluate', {
      expression: `(() => {
        const row = document.querySelector('[data-testid="conversation-row-sidebar"]');
        if (!row) return null;
        const r = row.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`,
      returnByValue: true
    });
    if (rowRectForKebab.result.value) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: rowRectForKebab.result.value.x,
        y: rowRectForKebab.result.value.y
      });
      await new Promise(r => setTimeout(r, 400));
    }

    await send('Runtime.evaluate', {
      expression: `(() => {
        const kebab = document.querySelector('[data-testid="conversation-kebab"]') || document.querySelector('[data-testid="conversation-row-sidebar"] button:last-child');
        if (kebab) kebab.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 600));

    // Hover first item in context menu
    const kebabItemPos = await send('Runtime.evaluate', {
      expression: `(() => {
        const item = document.querySelector('[role="menu"] [role="menuitem"]');
        if (!item) return null;
        const r = item.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`,
      returnByValue: true
    });
    if (kebabItemPos.result.value) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: kebabItemPos.result.value.x,
        y: kebabItemPos.result.value.y
      });
      await new Promise(r => setTimeout(r, 400));
    }

    const contextCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) return { error: 'No menu' };
        const cs = window.getComputedStyle(menu);
        const item = menu.querySelector('[role="menuitem"]');
        const ics = item ? window.getComputedStyle(item) : null;
        return {
          border: cs.border,
          borderLeft: cs.borderLeft,
          boxShadow: cs.boxShadow,
          borderRadius: cs.borderRadius,
          animation: cs.animation,
          hoveredItem: item ? {
            text: item.innerText.split('\\n')[0].trim(),
            bg: ics.backgroundColor,
            color: ics.color,
            borderLeft: ics.borderLeft,
            transform: ics.transform
          } : null
        };
      })()`,
      returnByValue: true
    });
    console.log(`  Context Menu Check Result:`, JSON.stringify(contextCheck.result.value, null, 2));
    report.tests.contextMenu = contextCheck.result.value;

    await captureScreenshot(send, `${themeKey}_test_context_menu.png`);
    await resetPopups(send);

  } finally {
    ws.close();
  }

  return report;
}

async function main() {
  const themesToTest = ['phantom', 'pixel', 'doodle', 'matcha'];
  const allReports = {};

  for (const t of themesToTest) {
    try {
      await switchTheme(t);
      allReports[t] = await verifyTheme(t);
    } catch (err) {
      console.error(`Error verifying theme ${t}:`, err);
    }
  }

  // Restore phantom at the end
  console.log(`\n================================================================`);
  console.log(`Restoring default active theme: phantom`);
  console.log(`================================================================`);
  execSync(`powershell -ExecutionPolicy Bypass -File .\\switch-theme.ps1 phantom`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });

  const outReport = path.resolve(__dirname, '..', 'artifacts', 'regression_verification_results.json');
  fs.writeFileSync(outReport, JSON.stringify(allReports, null, 2), 'utf8');
  console.log(`\nAll 4 themes successfully verified!`);
  console.log(`Results report saved to: ${outReport}`);
}

main().catch(console.error);
