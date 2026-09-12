const fs = require('fs');
const http = require('http');
const path = require('path');
const { execSync } = require('child_process');

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

async function getCdpMetrics(send) {
  const m = await send('Performance.getMetrics');
  const map = {};
  for (const item of m.metrics) {
    map[item.name] = item.value;
  }
  return map;
}

function computeMetricsDiff(before, after) {
  return {
    recalcStyleCount: after.RecalcStyleCount - before.RecalcStyleCount,
    recalcStyleDurationMs: +((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000).toFixed(2),
    layoutCount: after.LayoutCount - before.LayoutCount,
    layoutDurationMs: +((after.LayoutDuration - before.LayoutDuration) * 1000).toFixed(2),
    scriptDurationMs: +((after.ScriptDuration - before.ScriptDuration) * 1000).toFixed(2),
    taskDurationMs: +((after.TaskDuration - before.TaskDuration) * 1000).toFixed(2)
  };
}

async function switchAndPrepareTheme(themeKey) {
  console.log(`\n========================================`);
  console.log(`>>> Switching to theme: ${themeKey}`);
  console.log(`========================================`);

  execSync(`powershell -ExecutionPolicy Bypass -File .\\switch-theme.ps1 ${themeKey}`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });

  // Poll until app is ready
  console.log(`Waiting for app to hydrate and stabilize...`);
  let ready = false;
  let attempts = 0;
  while (!ready && attempts < 40) {
    await new Promise(r => setTimeout(r, 300));
    attempts++;
    try {
      const { ws, send } = await connectToMainPage();
      const check = await send('Runtime.evaluate', {
        expression: `(() => {
          const btn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
          const nodes = document.querySelectorAll('*').length;
          const chat = document.querySelector('[class*="overflow-y-auto"]');
          const modal = document.querySelector('[role="dialog"]');
          return { ready: !!btn && nodes > 1000 && !!chat, hasModal: !!modal };
        })()`,
        returnByValue: true
      });
      if (check && check.result && check.result.value) {
        if (check.result.value.hasModal) {
          // Close modal if open
          await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        }
        if (check.result.value.ready) {
          ready = true;
        }
      }
      ws.close();
    } catch (e) {
      // connecting might fail during reload
    }
  }

  if (!ready) throw new Error(`Theme ${themeKey} failed to stabilize within 12s`);
  console.log(`Theme ${themeKey} stabilized! Waiting extra 2000ms for CPU idle...`);
  await new Promise(r => setTimeout(r, 2000));
}

const IN_PAGE_BENCH_SCRIPT = `
window.__runAuxPaneBench = async function(durationMs, actionType) {
  const frameDeltas = [];
  const trajectory = [];
  let lastTime = performance.now();
  let startTime = performance.now();
  let running = true;
  const longTasks = [];
  let observer;

  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push({
          startTime: +(entry.startTime.toFixed(2)),
          duration: +(entry.duration.toFixed(2))
        });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch (e) {}

  const root = document.querySelector('.h-screen.w-screen') || document.querySelector('[style*="--sidebar-width"]');
  const topBarConsumer = document.querySelector('[style*="36px - var(--aux-pane-width)"]') ||
                         Array.from(document.querySelectorAll('div')).find(d => (d.getAttribute('style') || '').includes('aux-pane-width'));

  function findRightPane() {
    const candidatePanes = Array.from(document.querySelectorAll('div')).filter(el => {
      const s = el.getAttribute('style') || '';
      return (s.includes('transition: width') || s.includes('transition:width')) && s.includes('overflow: hidden');
    });
    return candidatePanes.find(el => el.getBoundingClientRect().left > 300) ||
           candidatePanes[candidatePanes.length - 1];
  }

  const onFrame = (now) => {
    const delta = now - lastTime;
    frameDeltas.push(delta);
    lastTime = now;

    const pane = findRightPane();
    const paneRect = pane ? pane.getBoundingClientRect() : null;
    const topBarPr = topBarConsumer ? parseFloat(window.getComputedStyle(topBarConsumer).paddingRight) : null;
    const auxVarVal = root ? window.getComputedStyle(root).getPropertyValue('--aux-pane-width') : null;

    trajectory.push({
      t: +(now - startTime).toFixed(1),
      d: +(delta.toFixed(2)),
      paneWidth: paneRect ? +(paneRect.width.toFixed(1)) : 0,
      paddingRight: topBarPr !== null ? +(topBarPr.toFixed(1)) : 0,
      auxVar: auxVarVal ? auxVarVal.trim() : null
    });

    if (running) requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  // Trigger toggle click
  const btn = document.querySelector('[data-testid="toggle-aux-sidebar"]') || 
              document.querySelector('button[aria-label="切换辅助面板"]');
  if (btn) btn.click();

  await new Promise(r => setTimeout(r, durationMs));
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
    action: actionType,
    totalFrames: total,
    mean: +(mean.toFixed(2)),
    fps: +(1000 / mean).toFixed(1),
    p50: +(sorted[Math.floor(total * 0.5)].toFixed(2)),
    p90: +(sorted[Math.floor(total * 0.9)].toFixed(2)),
    p95: +(sorted[Math.floor(total * 0.95)].toFixed(2)),
    maxSpike: +(sorted[total - 1].toFixed(2)),
    dropped144,
    dropRate144: +((dropped144 / total * 100).toFixed(1)),
    dropped60,
    dropRate60: +((dropped60 / total * 100).toFixed(1)),
    longTasksCount: longTasks.length,
    maxLongTask: longTasks.length ? +(Math.max(...longTasks.map(x => x.duration)).toFixed(2)) : 0,
    longTasks,
    trajectoryKeyframes: trajectory.filter((_, idx) => idx % 4 === 0 || idx === trajectory.length - 1)
  };
};
`;

async function auditTheme(themeKey) {
  await switchAndPrepareTheme(themeKey);
  const { ws, send } = await connectToMainPage();

  await send('Performance.enable');
  await send('Runtime.evaluate', { expression: IN_PAGE_BENCH_SCRIPT });

  const result = {
    theme: themeKey,
    domInspection: null,
    screenshots: {},
    expand: null,
    collapse: null
  };

  try {
    // 1. Initial DOM inspection
    const domInspect = await send('Runtime.evaluate', {
      expression: `(() => {
        const root = document.querySelector('.h-screen.w-screen') || document.querySelector('[style*="--sidebar-width"]');
        const rootComputed = root ? window.getComputedStyle(root) : null;
        const topBarConsumer = document.querySelector('[style*="36px - var(--aux-pane-width)"]') ||
                               Array.from(document.querySelectorAll('div')).find(d => (d.getAttribute('style') || '').includes('aux-pane-width'));
        const topBarComputed = topBarConsumer ? window.getComputedStyle(topBarConsumer) : null;
        return {
          totalDomNodes: document.querySelectorAll('*').length,
          rootInlineStyle: root ? root.getAttribute('style') : '',
          rootTransitionProperty: rootComputed ? rootComputed.transitionProperty : '',
          rootTransition: rootComputed ? rootComputed.transition : '',
          auxPaneWidthVar: rootComputed ? rootComputed.getPropertyValue('--aux-pane-width') : '',
          topBarInlineStyle: topBarConsumer ? topBarConsumer.getAttribute('style') : '',
          topBarTransition: topBarComputed ? topBarComputed.transition : '',
          topBarPaddingRight: topBarComputed ? topBarComputed.paddingRight : ''
        };
      })()`,
      returnByValue: true
    });
    result.domInspection = domInspect.result.value;

    // Check if initially expanded; ensure collapsed
    const isExpanded = await send('Runtime.evaluate', {
      expression: `(() => {
        const root = document.querySelector('.h-screen.w-screen') || document.querySelector('[style*="--sidebar-width"]');
        const v = root ? window.getComputedStyle(root).getPropertyValue('--aux-pane-width') : '0px';
        return parseFloat(v) > 0;
      })()`,
      returnByValue: true
    });

    if (isExpanded.result.value) {
      console.log(`Closing previously open right aux pane...`);
      await send('Runtime.evaluate', { expression: `document.querySelector('[data-testid="toggle-aux-sidebar"]').click()` });
      await new Promise(r => setTimeout(r, 800));
    }

    // Capture Collapsed Screenshot
    result.screenshots.collapsed = await captureScreenshot(send, `${themeKey}_aux_01_collapsed.png`);

    // 2. EXPAND BENCHMARK
    console.log(`[Bench ${themeKey}] Running EXPAND (700ms)...`);
    const mBeforeExp = await getCdpMetrics(send);
    const expRes = await send('Runtime.evaluate', {
      expression: `window.__runAuxPaneBench(700, 'expand')`,
      awaitPromise: true,
      returnByValue: true
    });
    const mAfterExp = await getCdpMetrics(send);

    result.expand = {
      ...expRes.result.value,
      cdpMetricsDiff: computeMetricsDiff(mBeforeExp, mAfterExp)
    };
    console.log(`[${themeKey} EXPAND] FPS: ${result.expand.fps} | P50: ${result.expand.p50}ms | P95: ${result.expand.p95}ms | Spike: ${result.expand.maxSpike}ms | 144Hz Drop: ${result.expand.dropRate144}% | LongTasks: ${result.expand.longTasksCount} (max ${result.expand.maxLongTask}ms) | RecalcDuration: ${result.expand.cdpMetricsDiff.recalcStyleDurationMs}ms`);

    // Capture Expanded Screenshot
    result.screenshots.expanded = await captureScreenshot(send, `${themeKey}_aux_02_expanded.png`);

    // Settle steady state
    await new Promise(r => setTimeout(r, 500));

    // 3. COLLAPSE BENCHMARK
    console.log(`[Bench ${themeKey}] Running COLLAPSE (700ms)...`);
    const mBeforeCol = await getCdpMetrics(send);
    const colRes = await send('Runtime.evaluate', {
      expression: `window.__runAuxPaneBench(700, 'collapse')`,
      awaitPromise: true,
      returnByValue: true
    });
    const mAfterCol = await getCdpMetrics(send);

    result.collapse = {
      ...colRes.result.value,
      cdpMetricsDiff: computeMetricsDiff(mBeforeCol, mAfterCol)
    };
    console.log(`[${themeKey} COLLAPSE] FPS: ${result.collapse.fps} | P50: ${result.collapse.p50}ms | P95: ${result.collapse.p95}ms | Spike: ${result.collapse.maxSpike}ms | 144Hz Drop: ${result.collapse.dropRate144}% | LongTasks: ${result.collapse.longTasksCount} (max ${result.collapse.maxLongTask}ms) | RecalcDuration: ${result.collapse.cdpMetricsDiff.recalcStyleDurationMs}ms`);

    // Capture Final Collapsed Screenshot
    result.screenshots.collapsed_final = await captureScreenshot(send, `${themeKey}_aux_03_collapsed_final.png`);
    await new Promise(r => setTimeout(r, 400));

  } finally {
    ws.close();
  }

  return result;
}

async function main() {
  const themes = ['phantom', 'doodle', 'matcha', 'pixel'];
  const allResults = {};

  for (const t of themes) {
    try {
      allResults[t] = await auditTheme(t);
    } catch (err) {
      console.error(`Audit failed for ${t}:`, err);
    }
  }

  // Restore pixel-theme as active
  console.log(`\nRestoring pixel-theme...`);
  execSync(`powershell -ExecutionPolicy Bypass -File .\\switch-theme.ps1 pixel`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });

  const outPath = path.join(__dirname, 'aux_benchmark_final.json');
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\n========================================`);
  console.log(`ALL AUDITS COMPLETED! Saved to: ${outPath}`);
  console.log(`========================================`);
}

main().catch(console.error);
