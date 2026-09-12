const fs = require('fs');
const http = require('http');
const path = require('path');

const resDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity', 'resources');
const portFile = path.join(process.env.APPDATA, 'Antigravity', 'DevToolsActivePort');
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

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

async function connectToMainPage() {
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

  return { ws, send };
}

async function captureScreenshot(send, filename) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  const fullPath = path.join(screenshotsDir, filename);
  fs.writeFileSync(fullPath, buf);
  console.log(`[Screenshot] Saved ${filename} (${buf.length} bytes)`);
  return fullPath;
}

async function switchTheme(themeKey) {
  const themeFolder = `${themeKey}-theme`;
  console.log(`\n========================================`);
  console.log(`>>> Switching to theme: ${themeKey} (${themeFolder})`);
  console.log(`========================================`);

  fs.writeFileSync(
    path.join(resDir, 'active-theme.json'),
    JSON.stringify({ theme: themeFolder }, null, 2),
    'utf8'
  );

  const { ws, send } = await connectToMainPage();
  try {
    await send('Page.reload');
  } catch (e) {}
  try {
    ws.close();
  } catch (e) {}

  // Wait 3.5s for page reload, CSS injection, and React hydration
  await new Promise((r) => setTimeout(r, 3500));
}

// In-page benchmarking helper string
const BENCHMARK_CLIENT_SCRIPT = `
window.__runBench = async function(durationMs, actionFn) {
  const frameDeltas = [];
  let lastTime = performance.now();
  let running = true;
  const longTasks = [];
  let observer;
  try {
    observer = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) longTasks.push(e.duration);
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch (e) {}

  const onFrame = (now) => {
    frameDeltas.push(now - lastTime);
    lastTime = now;
    if (running) requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  if (actionFn) {
    try {
      await actionFn();
    } catch (err) {
      console.error('Action error in benchmark:', err);
    }
  }

  await new Promise((r) => setTimeout(r, durationMs));
  running = false;
  if (observer) observer.disconnect();

  const samples = frameDeltas.slice(1);
  const total = samples.length;
  if (total === 0) return { error: 'No frames recorded' };

  const sum = samples.reduce((a, b) => a + b, 0);
  const mean = sum / total;
  const sorted = [...samples].sort((a, b) => a - b);
  const dropped144 = samples.filter((d) => d > 6.944).length;
  const dropped60 = samples.filter((d) => d > 16.667).length;

  return {
    totalFrames: total,
    mean: +(mean.toFixed(2)),
    p50: +(sorted[Math.floor(total * 0.5)].toFixed(2)),
    p90: +(sorted[Math.floor(total * 0.9)].toFixed(2)),
    p95: +(sorted[Math.floor(total * 0.95)].toFixed(2)),
    maxSpike: +(sorted[total - 1].toFixed(2)),
    dropped144,
    dropRate144: +((dropped144 / total * 100).toFixed(1)),
    dropped60,
    dropRate60: +((dropped60 / total * 100).toFixed(1)),
    longTasksCount: longTasks.length,
    maxLongTask: longTasks.length ? +(Math.max(...longTasks).toFixed(2)) : 0
  };
};
`;

async function runBenchmark(send, durationMs, actionCode) {
  await send('Runtime.evaluate', { expression: BENCHMARK_CLIENT_SCRIPT });
  const expr = `window.__runBench(${durationMs}, ${actionCode})`;
  const res = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true
  });
  return res.result.value;
}

async function pressKey(send, key, code, keyCode) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
}

async function auditTheme(themeKey) {
  await switchTheme(themeKey);
  const { ws, send } = await connectToMainPage();

  const results = {
    theme: themeKey,
    benchmarks: {},
    screenshots: {}
  };

  try {
    // 0. Eager Font Pre-warming: ensure glyphs are in GPU memory before animations
    console.log(`[Font] Pre-warming font cache for ${themeKey}...`);
    await send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          if (document.fonts && document.fonts.load) {
            await Promise.all([
              document.fonts.load('12px "Fusion Pixel 12px Proportional SC"'),
              document.fonts.load('12px "Fusion Pixel 12px Monospaced SC"')
            ]);
            const warm = document.createElement('div');
            warm.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;z-index:-1;contain:strict;';
            warm.innerHTML = '<span style=\"font-family:\\'Fusion Pixel 12px Proportional SC\\'\">ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789基本设置模型通用外观</span>';
            (document.body || document.documentElement).appendChild(warm);
            await new Promise(r => requestAnimationFrame(r));
            try { warm.remove(); } catch(e) {}
          }
        } catch(e) {}
      })()`,
      awaitPromise: true
    });

    // 1. Screenshot: Default Workspace
    results.screenshots.workspace = await captureScreenshot(send, `${themeKey}_01_workspace.png`);

    // 2. Left Sidebar Collapse & Expand
    console.log(`[Bench] Left Sidebar Toggle (Collapse)...`);
    const collapseBench = await runBenchmark(
      send,
      650,
      `async () => {
        const btn = document.querySelector('button[aria-label="切换侧边栏"]') || document.querySelector('[data-testid="sidebar-toggle"]');
        if (btn) btn.click();
      }`
    );
    results.benchmarks.sidebarCollapse = collapseBench;
    results.screenshots.sidebarCollapsed = await captureScreenshot(send, `${themeKey}_02_sidebar_collapsed.png`);

    console.log(`[Bench] Left Sidebar Toggle (Expand)...`);
    const expandBench = await runBenchmark(
      send,
      650,
      `async () => {
        const btn = document.querySelector('button[aria-label="切换侧边栏"]') || document.querySelector('[data-testid="sidebar-toggle"]');
        if (btn) btn.click();
      }`
    );
    results.benchmarks.sidebarExpand = expandBench;

    // 3. Right Aux Sidebar Toggle
    console.log(`[Bench] Right Aux Sidebar Expand...`);
    const auxBench = await runBenchmark(
      send,
      650,
      `async () => {
        const btn = document.querySelector('[data-testid="toggle-aux-sidebar"]') || document.querySelector('button[aria-label="切换辅助面板"]');
        if (btn) btn.click();
      }`
    );
    results.benchmarks.auxSidebarExpand = auxBench;
    results.screenshots.auxSidebarExpanded = await captureScreenshot(send, `${themeKey}_03_aux_expanded.png`);

    // Collapse aux sidebar back
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('[data-testid="toggle-aux-sidebar"]') || document.querySelector('button[aria-label="切换辅助面板"]');
        if (btn) btn.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 650));

    // 4. Model Selector Popover
    console.log(`[Bench] Model Selector Menu Open...`);
    const modelBench = await runBenchmark(
      send,
      400,
      `async () => {
        const btn = document.querySelector('[data-testid="model-selector-trigger"]');
        if (btn) btn.click();
      }`
    );
    results.benchmarks.modelMenuOpen = modelBench;
    results.screenshots.modelMenu = await captureScreenshot(send, `${themeKey}_04_model_menu.png`);

    // Close model selector with Escape
    await pressKey(send, 'Escape', 'Escape', 27);
    await new Promise((r) => setTimeout(r, 300));

    // 5. Conversation Context / Kebab Menu
    console.log(`[Bench] Conversation Kebab Menu Open...`);
    const kebabBench = await runBenchmark(
      send,
      400,
      `async () => {
        const btn = document.querySelector('[data-testid="conversation-kebab"]');
        if (btn) btn.click();
      }`
    );
    results.benchmarks.kebabMenuOpen = kebabBench;
    results.screenshots.kebabMenu = await captureScreenshot(send, `${themeKey}_05_kebab_menu.png`);

    // Close kebab menu with Escape
    await pressKey(send, 'Escape', 'Escape', 27);
    await new Promise((r) => setTimeout(r, 300));

    // 6. Settings Dialog Open & Close
    console.log(`[Bench] Settings Dialog Open...`);
    const settingsBench = await runBenchmark(
      send,
      450,
      `async () => {
        const btn = document.querySelector('[data-testid="settings-button"]');
        if (btn) btn.click();
      }`
    );
    results.benchmarks.settingsDialogOpen = settingsBench;
    results.screenshots.settingsDialog = await captureScreenshot(send, `${themeKey}_06_settings_dialog.png`);

    // Close settings dialog with Escape
    console.log(`[Bench] Settings Dialog Close...`);
    const settingsCloseBench = await runBenchmark(
      send,
      350,
      `async () => {
        const evt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true });
        document.dispatchEvent(evt);
      }`
    );
    results.benchmarks.settingsDialogClose = settingsCloseBench;
    await pressKey(send, 'Escape', 'Escape', 27);
    await new Promise((r) => setTimeout(r, 400));

    // 7. Main Chat View Scrolling
    console.log(`[Bench] Main Chat Scrolling...`);
    const scrollBench = await runBenchmark(
      send,
      1000,
      `async () => {
        const sc = Array.from(document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]'))
          .find(el => el.clientHeight > 300 && el.scrollHeight > el.clientHeight);
        if (!sc) return;
        const initialTop = sc.scrollTop;
        const start = performance.now();
        return new Promise(resolve => {
          const step = (t) => {
            const elapsed = t - start;
            if (elapsed < 450) {
              sc.scrollTop = initialTop + (elapsed / 450) * 300;
              requestAnimationFrame(step);
            } else if (elapsed < 900) {
              sc.scrollTop = initialTop + 300 - ((elapsed - 450) / 450) * 300;
              requestAnimationFrame(step);
            } else {
              sc.scrollTop = initialTop;
              resolve();
            }
          };
          requestAnimationFrame(step);
        });
      }`
    );
    results.benchmarks.chatScroll = scrollBench;

    // 8. Steady State / Idle Animation (1000ms)
    console.log(`[Bench] Idle Steady State (1000ms)...`);
    const idleBench = await runBenchmark(send, 1000, null);
    results.benchmarks.idleSteadyState = idleBench;

    console.log(`Done auditing ${themeKey}! Summary:`, JSON.stringify(results.benchmarks, null, 2));
  } finally {
    ws.close();
  }

  return results;
}

async function main() {
  const themes = ['pixel', 'doodle', 'matcha', 'phantom'];
  const allResults = {};

  for (const t of themes) {
    try {
      allResults[t] = await auditTheme(t);
    } catch (err) {
      console.error(`Failed to audit ${t}:`, err);
    }
  }

  const outPath = path.join(__dirname, 'benchmark_results.json');
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\n========================================`);
  console.log(`ALL AUDITS COMPLETED! Saved results to: ${outPath}`);
  console.log(`========================================`);
}

main().catch(console.error);
