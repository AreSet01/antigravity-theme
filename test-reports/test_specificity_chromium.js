// Empirical Chromium Test for W3C Specificity under prefers-reduced-motion
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* 1. Preceding author rule with class and attribute: html body [role="dialog"].animate-modalScaleIn */
html body [role="dialog"].animate-modalScaleIn {
  animation: pixel-modal-pop-in 240ms steps(3) forwards !important;
}

/* 2. Proposed reduced motion rule placed at the end of stylesheet */
@media (prefers-reduced-motion: reduce) {
  html:root body *,
  html:root body *::before,
  html:root body *::after,
  html:root *,
  html:root *::before,
  html:root *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
</style>
</head>
<body>
<div id="target" role="dialog" class="animate-modalScaleIn">Test Modal</div>
</body>
</html>`;

const testHtmlPath = path.resolve('test-reports/test_reduced_motion.html');
fs.writeFileSync(testHtmlPath, htmlContent, 'utf8');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333;

console.log('Spawning Chrome headless on port ' + port + ' with --force-prefers-reduced-motion...');

const chromeProc = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--force-prefers-reduced-motion',
  `--remote-debugging-port=${port}`,
  `file:///${testHtmlPath.replace(/\\/g, '/')}`
]);

async function run() {
  // Wait for Chrome CDP to be available
  await new Promise(r => setTimeout(r, 1000));

  function get(url) {
    return new Promise((resolve, reject) => {
      http.get(url, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
  }

  let targets;
  for (let i = 0; i < 10; i++) {
    try {
      targets = await get(`http://127.0.0.1:${port}/json/list`);
      if (targets && targets.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!targets || targets.length === 0) {
    console.error('Failed to get targets from Chrome');
    chromeProc.kill();
    return;
  }

  const wsUrl = targets[0].webSocketDebuggerUrl;
  console.log('Connected to target WS URL:', wsUrl);

  const ws = new WebSocket(wsUrl);

  await new Promise(r => { ws.onopen = r; });

  let id = 1;
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = id++;
      const handler = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id === curId) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  async function testHtml(html, title) {
    await send('Runtime.evaluate', {
      expression: `document.open(); document.write(${JSON.stringify(html)}); document.close();`
    });
    await new Promise(r => setTimeout(r, 400));
    const evalResult = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const el = document.getElementById('target');
          if (!el) return { error: 'Element #target not found' };
          const comp = window.getComputedStyle(el);
          return {
            animationDuration: comp.animationDuration,
            animationName: comp.animationName,
            animationIterationCount: comp.animationIterationCount,
            transitionDuration: comp.transitionDuration
          };
        })()
      `,
      returnByValue: true
    });
    console.log(`\n--- [TEST] ${title} ---`);
    console.log('Result:', evalResult.result.value);
    return evalResult.result.value;
  }

  // Test Case 1: Proposed rule exactly as written in report
  const htmlProposed = `<!DOCTYPE html>
  <html>
  <head>
  <style>
  html body [role="dialog"].animate-modalScaleIn {
    animation: pixel-modal-pop-in 240ms steps(3) forwards !important;
  }
  @media (prefers-reduced-motion: reduce) {
    html:root body *,
    html:root body *::before,
    html:root body *::after,
    html:root *,
    html:root *::before,
    html:root *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
    #px-cursor { display: none !important; }
  }
  </style>
  </head>
  <body>
    <div id="target" role="dialog" class="animate-modalScaleIn">Test Modal</div>
  </body>
  </html>`;
  await testHtml(htmlProposed, 'Proposed in Report: html:root body * vs html body [role="dialog"].animate-modalScaleIn');

  // Test Case 2: What if animation: none !important is used with the proposed selector html:root body *?
  const htmlAnimNone = `<!DOCTYPE html>
  <html>
  <head>
  <style>
  html body [role="dialog"].animate-modalScaleIn {
    animation: pixel-modal-pop-in 240ms steps(3) forwards !important;
  }
  @media (prefers-reduced-motion: reduce) {
    html:root body * {
      animation: none !important;
    }
  }
  </style>
  </head>
  <body>
    <div id="target" role="dialog" class="animate-modalScaleIn">Test Modal</div>
  </body>
  </html>`;
  await testHtml(htmlAnimNone, 'html:root body * with animation: none !important');

  // Test Case 3: What if we increase specificity to override (0, 2, 2) or (0, 3, 1)?
  // e.g. using :not(#fake_id_that_never_matches) or repeated pseudo-classes or [class]
  const htmlHighSpec = `<!DOCTYPE html>
  <html>
  <head>
  <style>
  html body [role="dialog"].animate-modalScaleIn {
    animation: pixel-modal-pop-in 240ms steps(3) forwards !important;
  }
  /* Selector with ID specificity: (1, 1, 2) */
  @media (prefers-reduced-motion: reduce) {
    html:root:not(#_px_never_exist_) body *,
    html:root:not(#_px_never_exist_) body *::before,
    html:root:not(#_px_never_exist_) body *::after,
    html:root:not(#_px_never_exist_) *,
    html:root:not(#_px_never_exist_) *::before,
    html:root:not(#_px_never_exist_) *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }
  </style>
  </head>
  <body>
    <div id="target" role="dialog" class="animate-modalScaleIn">Test Modal</div>
  </body>
  </html>`;
  await testHtml(htmlHighSpec, 'High Specificity Fix (with ID pseudo-negation :not(#_)): (1, 1, 2) vs (0, 2, 2)');

  ws.close();
  chromeProc.kill();
}

run().catch(err => {
  console.error('Error running test:', err);
  chromeProc.kill();
});
