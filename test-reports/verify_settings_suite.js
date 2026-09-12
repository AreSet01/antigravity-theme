const fs = require('fs');
const http = require('http');
const path = require('path');

const portFile = path.join(process.env.APPDATA, 'Antigravity', 'DevToolsActivePort');
const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim();
const resourcesDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity', 'resources');
const repoDir = 'e:\\搞搞新意思\\antigravity-美化';
const screenshotsDir = path.join(repoDir, 'test-reports', 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = reject;
  });
}

function createSend(ws) {
  let msgId = 0;
  return (method, params = {}) =>
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
}

async function captureScreenshot(send, filename) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const filePath = path.join(screenshotsDir, filename);
  fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
  console.log(`[Screenshot saved]: ${filePath}`);
  return filePath;
}

const { execSync } = require('child_process');

async function switchToTheme(themeName) {
  console.log(`\n======================================================`);
  console.log(`[Theme Switch] Switching to theme: ${themeName}...`);
  console.log(`======================================================`);

  try {
    execSync(`powershell -ExecutionPolicy Bypass -File switch-theme.ps1 -Theme ${themeName}`, {
      cwd: repoDir,
      stdio: 'inherit'
    });
    console.log(`[Theme Switch] Waiting 3.0s for app reload and render...`);
    await new Promise((r) => setTimeout(r, 3000));
    console.log(`[Theme Switch] Ready.`);
  } catch (err) {
    console.error(`[Theme Switch ERROR]:`, err.message);
    throw err;
  }
}

async function testThemeSettings(themeName) {
  const targets = await getTargets();
  const main = targets.find((x) => x.type === 'page' && !x.url.startsWith('data:'));
  if (!main) throw new Error('Target page not found');

  const ws = await connectWs(main.webSocketDebuggerUrl);
  const send = createSend(ws);

  // 1. Ensure modal is closed first
  await send('Runtime.evaluate', {
    expression: `(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (modal) {
        const evt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true });
        document.dispatchEvent(evt);
      }
    })()`
  });
  await new Promise((r) => setTimeout(r, 400));

  // 2. Open Settings dialog
  console.log(`[${themeName}] Opening settings dialog...`);
  const openRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('[data-testid="settings-button"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`,
    returnByValue: true
  });

  if (!openRes.result.value) {
    throw new Error('Settings button not found');
  }

  // Wait for animation & React mounting
  await new Promise((r) => setTimeout(r, 1200));

  // 3. Inspect settings modal container & tabs
  const diagnosis = await send('Runtime.evaluate', {
    expression: `(() => {
      const container = document.querySelector('.settings-modal-container');
      if (!container) return { error: 'settings-modal-container not found' };

      const cStyle = window.getComputedStyle(container);

      // Check left tabs
      const tabs = Array.from(container.querySelectorAll('div.bg-sidebar button, [class*="bg-sidebar"] button')).map(b => ({
        text: b.textContent.trim(),
        className: b.className,
        computedBg: window.getComputedStyle(b).backgroundColor,
        computedColor: window.getComputedStyle(b).color,
        computedBorder: window.getComputedStyle(b).border || window.getComputedStyle(b).borderLeft,
        computedBorderLeft: window.getComputedStyle(b).borderLeft,
        computedShadow: window.getComputedStyle(b).boxShadow,
        height: b.getBoundingClientRect().height
      }));

      const activeTab = tabs.find(t => t.className.includes('bg-sidebar-secondary') || t.className.includes('bg-sidebar-accent')) || tabs[0];

      // Check comboboxes
      const comboboxes = Array.from(container.querySelectorAll('button[role="combobox"]')).map(cb => ({
        text: cb.textContent.trim(),
        computedBg: window.getComputedStyle(cb).backgroundColor,
        computedColor: window.getComputedStyle(cb).color,
        computedBorder: window.getComputedStyle(cb).border,
        computedShadow: window.getComputedStyle(cb).boxShadow
      }));

      // Check switches
      const switches = Array.from(container.querySelectorAll('button[role="switch"]')).map(sw => ({
        ariaChecked: sw.getAttribute('aria-checked'),
        computedBg: window.getComputedStyle(sw).backgroundColor,
        computedBorder: window.getComputedStyle(sw).border
      }));

      // Check scroll bottom padding
      const contentScroll = container.querySelector('.overflow-y-auto > div.p-6') || container.querySelector('.overflow-auto > div.grow') || container.querySelector('.overflow-y-auto > div.space-y-8');
      const contentScrollPaddingBottom = contentScroll ? window.getComputedStyle(contentScroll).paddingBottom : null;

      return {
        padding: cStyle.padding,
        animation: cStyle.animation,
        tabCount: tabs.length,
        activeTab,
        tabsSample: tabs.slice(0, 3),
        comboboxCount: comboboxes.length,
        comboboxSample: comboboxes[0],
        switchCount: switches.length,
        switchSample: switches.find(s => s.ariaChecked === 'false'),
        scrollPaddingBottom: contentScrollPaddingBottom
      };
    })()`,
    returnByValue: true
  });

  console.log(`[${themeName}] Container Diagnosis:`, JSON.stringify(diagnosis.result.value, null, 2));

  // 4. Capture Overview Screenshot
  await captureScreenshot(send, `${themeName}_settings_fixed_overview.png`);

  // 5. Open Combobox dropdown to verify Popper z-index & no occluding
  console.log(`[${themeName}] Clicking combobox to test popper...`);
  await send('Runtime.evaluate', {
    expression: `(() => {
      const cb = document.querySelector('.settings-modal-container button[role="combobox"]');
      if (cb) cb.click();
    })()`
  });

  await new Promise((r) => setTimeout(r, 500));

  const popperDiagnosis = await send('Runtime.evaluate', {
    expression: `(() => {
      const listbox = document.querySelector('[role="listbox"]:not(:empty)');
      if (!listbox) return { error: 'No open listbox found' };

      const lbStyle = window.getComputedStyle(listbox);
      const parentStyle = window.getComputedStyle(listbox.parentElement);
      const rect = listbox.getBoundingClientRect();

      return {
        found: true,
        itemCount: listbox.querySelectorAll('[role="option"]').length,
        listboxZIndex: lbStyle.zIndex,
        parentZIndex: parentStyle.zIndex,
        parentPosition: parentStyle.position,
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        }
      };
    })()`,
    returnByValue: true
  });

  console.log(`[${themeName}] Popper Diagnosis:`, JSON.stringify(popperDiagnosis.result.value, null, 2));

  // 6. Capture Dropdown Screenshot
  await captureScreenshot(send, `${themeName}_settings_fixed_dropdown.png`);

  // 7. Close dropdown & modal with Escape
  await send('Runtime.evaluate', {
    expression: `(() => {
      const evt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true });
      document.dispatchEvent(evt);
      setTimeout(() => document.dispatchEvent(evt), 100);
    })()`
  });

  await new Promise((r) => setTimeout(r, 400));
  ws.close();

  return {
    theme: themeName,
    diagnosis: diagnosis.result.value,
    popperDiagnosis: popperDiagnosis.result.value
  };
}

async function main() {
  const themes = ['phantom', 'pixel', 'matcha', 'doodle'];
  const allResults = [];

  for (const theme of themes) {
    await switchToTheme(theme);
    const res = await testThemeSettings(theme);
    allResults.push(res);
  }

  // Restore initial theme to phantom
  await switchToTheme('phantom');

  console.log('\n======================================================');
  console.log('ALL THEMES SETTINGS REGRESSION RESULTS:');
  console.log('======================================================');
  console.log(JSON.stringify(allResults, null, 2));

  fs.writeFileSync(
    path.join(repoDir, 'test-reports', 'settings_regression_results.json'),
    JSON.stringify(allResults, null, 2),
    'utf8'
  );
}

main().catch((err) => {
  console.error('Test Suite Failed with stack:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
