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

// In-page client script for tracking frame-by-frame animation, metrics, and property interpolation
const AUX_BENCHMARK_SCRIPT = `
window.__runAuxBenchmark = async function(durationMs, actionType) {
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

  // Elements to track
  const root = document.querySelector('.h-screen.w-screen');
  const topBarConsumer = document.querySelector('[style*="36px - var(--aux-pane-width)"]') ||
                         Array.from(document.querySelectorAll('div')).find(d => (d.getAttribute('style') || '').includes('aux-pane-width'));

  function findPane() {
    return Array.from(document.querySelectorAll('div')).find(el => {
      const s = el.getAttribute('style') || '';
      return s.includes('transition: width') || (s.includes('flex-grow: 1') && s.includes('min-width: 0px'));
    });
  }

  const onFrame = (now) => {
    const delta = now - lastTime;
    frameDeltas.push(delta);
    lastTime = now;

    const pane = findPane();
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

  // Trigger Action
  const btn = document.querySelector('[data-testid="toggle-aux-sidebar"]') || 
              document.querySelector('button[aria-label="切换辅助面板"]');
  if (btn) {
    btn.click();
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
    trajectorySample: trajectory.filter((_, idx) => idx % 3 === 0 || idx === trajectory.length - 1)
  };
};
`;

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

async function auditThemeAuxPane(themeKey) {
  await switchTheme(themeKey);
  const { ws, send } = await connectToMainPage();

  await send('Performance.enable');
  await send('Runtime.evaluate', { expression: AUX_BENCHMARK_SCRIPT });

  const result = {
    theme: themeKey,
    domInspection: null,
    screenshots: {},
    expand: null,
    collapse: null
  };

  try {
    // 1. Inspect DOM & CSS properties before action
    const domInspect = await send('Runtime.evaluate', {
      expression: `(() => {
        const root = document.querySelector('.h-screen.w-screen');
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
    console.log(`[DOM Inspection - ${themeKey}]`, result.domInspection);

    // Ensure pane is collapsed at start
    const isExpandedAtStart = await send('Runtime.evaluate', {
      expression: `(() => {
        const root = document.querySelector('.h-screen.w-screen');
        const v = root ? window.getComputedStyle(root).getPropertyValue('--aux-pane-width') : '0px';
        return parseFloat(v) > 0;
      })()`,
      returnByValue: true
    });

    if (isExpandedAtStart.result.value) {
      console.log(`Pane is already expanded, collapsing it first...`);
      await send('Runtime.evaluate', {
        expression: `document.querySelector('[data-testid="toggle-aux-sidebar"]').click()`
      });
      await new Promise(r => setTimeout(r, 650));
    }

    // Capture initial collapsed screenshot
    result.screenshots.collapsed = await captureScreenshot(send, `${themeKey}_aux_01_collapsed.png`);

    // 2. Benchmark EXPAND
    console.log(`[Bench] Running Right Aux Sidebar EXPAND (650ms)...`);
    const metricsBeforeExpand = await getCdpMetrics(send);
    const expandBench = await send('Runtime.evaluate', {
      expression: `window.__runAuxBenchmark(650, 'expand')`,
      awaitPromise: true,
      returnByValue: true
    });
    const metricsAfterExpand = await getCdpMetrics(send);

    result.expand = {
      ...expandBench.result.value,
      cdpMetricsDiff: computeMetricsDiff(metricsBeforeExpand, metricsAfterExpand)
    };
    console.log(`[Bench Expand Result]`, JSON.stringify({
      fps: result.expand.fps,
      p50: result.expand.p50,
      p95: result.expand.p95,
      maxSpike: result.expand.maxSpike,
      dropRate144: result.expand.dropRate144,
      longTasks: result.expand.longTasksCount,
      recalcDuration: result.expand.cdpMetricsDiff.recalcStyleDurationMs
    }));

    // Capture expanded screenshot
    result.screenshots.expanded = await captureScreenshot(send, `${themeKey}_aux_02_expanded.png`);

    // Rest steady state for 400ms
    await new Promise(r => setTimeout(r, 400));

    // 3. Benchmark COLLAPSE
    console.log(`[Bench] Running Right Aux Sidebar COLLAPSE (650ms)...`);
    const metricsBeforeCollapse = await getCdpMetrics(send);
    const collapseBench = await send('Runtime.evaluate', {
      expression: `window.__runAuxBenchmark(650, 'collapse')`,
      awaitPromise: true,
      returnByValue: true
    });
    const metricsAfterCollapse = await getCdpMetrics(send);

    result.collapse = {
      ...collapseBench.result.value,
      cdpMetricsDiff: computeMetricsDiff(metricsBeforeCollapse, metricsAfterCollapse)
    };
    console.log(`[Bench Collapse Result]`, JSON.stringify({
      fps: result.collapse.fps,
      p50: result.collapse.p50,
      p95: result.collapse.p95,
      maxSpike: result.collapse.maxSpike,
      dropRate144: result.collapse.dropRate144,
      longTasks: result.collapse.longTasksCount,
      recalcDuration: result.collapse.cdpMetricsDiff.recalcStyleDurationMs
    }));

    // Settle collapsed state
    await new Promise(r => setTimeout(r, 400));
    result.screenshots.collapsed_final = await captureScreenshot(send, `${themeKey}_aux_03_collapsed_final.png`);

  } finally {
    ws.close();
  }

  return result;
}

async function main() {
  const themes = ['pixel', 'phantom', 'doodle', 'matcha'];
  const allResults = {};

  for (const t of themes) {
    try {
      allResults[t] = await auditThemeAuxPane(t);
    } catch (err) {
      console.error(`Failed to audit ${t}:`, err);
    }
  }

  // Restore pixel-theme as active
  console.log(`\nRestoring pixel-theme...`);
  fs.writeFileSync(
    path.join(resDir, 'active-theme.json'),
    JSON.stringify({ theme: 'pixel-theme' }, null, 2),
    'utf8'
  );

  const outPath = path.join(__dirname, 'aux_benchmark_results.json');
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\n========================================`);
  console.log(`ALL AUX PANE AUDITS COMPLETED! Saved results to: ${outPath}`);
  console.log(`========================================`);
}

main().catch(console.error);
