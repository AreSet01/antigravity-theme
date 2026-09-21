const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

const portFile = path.join(os.homedir(), 'Library/Application Support/Antigravity/DevToolsActivePort');

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
      const h = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === id) {
          ws.removeEventListener('message', h);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id, method, params }));
    });

  // Extract panel JS from patch/pixelTheme.js
  const injectorCode = fs.readFileSync(path.resolve(__dirname, '../patch/pixelTheme.js'), 'utf8');
  const panelMatch = injectorCode.match(/const GLASS_PANEL_JS = \`([\s\S]*?)\`;/);
  if (!panelMatch) throw new Error('GLASS_PANEL_JS extraction failed');
  const panelJs = panelMatch[1];

  // 1. Upgrade live renderer panel
  await send('Runtime.evaluate', {
    expression: `(() => {
      const oldRoot = document.getElementById('px-glass-panel-root');
      if (oldRoot) oldRoot.remove();
      delete window.__pxGlassPanel;
    })()`
  });
  await send('Runtime.evaluate', { expression: panelJs });

  // 2. Comprehensive evaluation
  const checkExpr = `(() => {
    const de = document.documentElement;
    const b = document.body;
    const csB = getComputedStyle(b);
    const leading = document.querySelector('.leading-relaxed');
    const csL = leading ? getComputedStyle(leading) : null;
    const pill = document.getElementById('px-glass-panel-pill');
    const card = document.getElementById('px-glass-panel-card');

    // Test slider reactivity and !important injection on both de and b
    const blurInput = card ? card.querySelector('input[type="range"]') : null;
    let sliderTest = null;
    if (blurInput) {
      blurInput.value = '22';
      if (blurInput.oninput) blurInput.oninput();
      sliderTest = {
        deBlur: de.style.getPropertyValue('--glass-blur'),
        dePrio: de.style.getPropertyPriority('--glass-blur'),
        bodyBlur: b.style.getPropertyValue('--glass-blur'),
        bodyPrio: b.style.getPropertyPriority('--glass-blur'),
        computed: getComputedStyle(b).getPropertyValue('--glass-blur').trim()
      };
      // Restore default
      blurInput.value = '10';
      if (blurInput.oninput) blurInput.oninput();
    }

    // Test preset click
    const presetBtns = card ? Array.from(card.querySelectorAll('button')).filter(btn =>
      ['默认深空', 'iOS明亮', '夜间高对比', '极速省电'].includes(btn.textContent.trim())
    ) : [];
    const iosBtn = presetBtns.find(x => x.textContent.trim() === 'iOS明亮');
    let presetTest = null;
    if (iosBtn) {
      iosBtn.click();
      presetTest = {
        deBlur: de.style.getPropertyValue('--glass-blur'),
        bodyBlur: b.style.getPropertyValue('--glass-blur'),
        computedSat: getComputedStyle(b).getPropertyValue('--glass-sat').trim(),
        vibranceAttr: de.getAttribute('data-px-vibrance')
      };
      // Restore default preset
      const defBtn = presetBtns.find(x => x.textContent.trim() === '默认深空');
      if (defBtn) defBtn.click();
    }

    // Test nested prose reset
    const testDiv = document.createElement('div');
    testDiv.className = 'leading-relaxed';
    const innerDiv = document.createElement('div');
    innerDiv.className = 'leading-relaxed';
    testDiv.appendChild(innerDiv);
    b.appendChild(testDiv);
    const csInner = getComputedStyle(innerDiv);
    const nestedReset = {
      bg: csInner.backgroundColor,
      border: csInner.borderWidth,
      padding: csInner.padding,
      backdrop: csInner.backdropFilter
    };
    testDiv.remove();

    return {
      bodyClass: b.className,
      glassLensCard: csB.getPropertyValue('--glass-lens-card').trim(),
      glassLens: csB.getPropertyValue('--glass-lens').trim().slice(0, 35),
      glassLensStrong: csB.getPropertyValue('--glass-lens-strong').trim().slice(0, 35),
      glassSelect: csB.getPropertyValue('--glass-select').trim(),
      glassRaise: csB.getPropertyValue('--glass-raise').trim(),
      glassBlur: csB.getPropertyValue('--glass-blur').trim(),
      glassSat: csB.getPropertyValue('--glass-sat').trim(),
      glassWallVivid: csB.getPropertyValue('--glass-wall-vivid').trim(),
      hasPill: !!pill,
      hasCard: !!card,
      sliderTest,
      presetTest,
      nestedReset,
      redlines: {
        scrollHeightMatchesClient: de.scrollHeight === de.clientHeight,
        overflow: getComputedStyle(de).overflow,
        emptyListboxes: Array.from(document.querySelectorAll('[role="listbox"]:empty')).map(x => ({ w: x.offsetWidth, h: x.offsetHeight }))
      },
      proseFrosted: csL ? {
        bg: csL.backgroundColor,
        backdrop: csL.backdropFilter || csL.webkitBackdropFilter,
        borderRadius: csL.borderRadius,
        border: csL.border,
        padding: csL.padding
      } : null
    };
  })()`;

  const evalRes = await send('Runtime.evaluate', { expression: checkExpr, returnByValue: true });
  console.log('FULL COMPREHENSIVE VERIFICATION:\n', JSON.stringify(evalRes.result.value, null, 2));

  // 3. Reset glass-user.css to clean defaults
  const userCssPath = '/Applications/Antigravity.app/Contents/Resources/glass-theme/glass-user.css';
  const cleanDefaults = `:root, body.theme-light, body:not(.theme-light) {
  --glass-blur: 10px !important;
  --glass-sat: 150% !important;
  --glass-bright: 1.00 !important;
  --glass-alpha: 0.32 !important;
  --glass-alpha-card: 0.44 !important;
  --glass-alpha-hi: 0.58 !important;
  --glass-rim-top: 0.72 !important;
  --glass-rim-side: 0.30 !important;
  --glass-rim-bot: 0.14 !important;
  --glass-sheen: 0.26 !important;
  --glass-radius: 18px !important;
  --glass-wall-vivid: 0.74 !important;
  --glass-wall-speed: 48s !important;
  --glass-grain: 0.030 !important;
  --glass-lens: var(--glass-lens-sm) !important;
  --glass-lens-strong: var(--glass-lens-xs) !important;
  --glass-lens-card: brightness(1) !important;
  --glass-lens-follow: on !important;
  --glass-quality: balanced !important;
  --glass-vibrance: balanced !important;
}
`;
  fs.writeFileSync(userCssPath, cleanDefaults, 'utf8');

  ws.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
