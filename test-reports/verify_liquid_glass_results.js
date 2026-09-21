const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

const portFile = path.join(os.homedir(), 'Library/Application Support/Antigravity/DevToolsActivePort');
const artifactDir = '/Users/leungcc/.gemini/antigravity/brain/0c901e20-54c7-4b23-8ae0-ab2382a431be';

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

  console.log('Target found:', mainTarget.title, mainTarget.url);

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

  // Evaluate computed styles of interest
  const styleCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      
      const sidebar = document.querySelector('div.bg-sidebar.pt-1') || document.querySelector('.bg-sidebar');
      const userBubble = document.querySelector('div.rounded-2xl.bg-primary');
      const toolIsland = document.querySelector('div[class*="group/run-command"]') || document.querySelector('div.group:has(span.font-mono)');
      const codeBlock = document.querySelector('pre');
      const chatContainer = document.querySelector('[data-chat-container]') || document.querySelector('main');
      const tuningPanel = document.querySelector('.glass-tuning-panel');

      function inspect(el, name) {
        if (!el) return { name, exists: false };
        const cs = getComputedStyle(el);
        return {
          name,
          exists: true,
          tagName: el.tagName,
          className: el.className,
          borderRadius: cs.borderRadius,
          border: cs.border,
          borderTop: cs.borderTop,
          backgroundColor: cs.backgroundColor,
          backgroundImage: cs.backgroundImage,
          backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
          boxShadow: cs.boxShadow,
          outline: cs.outline
        };
      }

      return {
        rootVars: {
          glassBlur: rootStyle.getPropertyValue('--glass-blur').trim(),
          glassAlphaCard: rootStyle.getPropertyValue('--glass-alpha-card').trim(),
          glassAlpha: rootStyle.getPropertyValue('--glass-alpha').trim(),
          glassMeniscusCard: rootStyle.getPropertyValue('--glass-meniscus-card').trim(),
          glassMeniscusPanel: rootStyle.getPropertyValue('--glass-meniscus-panel').trim(),
          glassMeniscusFloat: rootStyle.getPropertyValue('--glass-meniscus-float').trim(),
          glassRadius: rootStyle.getPropertyValue('--glass-radius').trim(),
          glassRadiusLg: rootStyle.getPropertyValue('--glass-radius-lg').trim(),
        },
        bodyVars: {
          bg: bodyStyle.backgroundColor,
          backdrop: bodyStyle.backdropFilter,
        },
        elements: {
          sidebar: inspect(sidebar, 'sidebar'),
          userBubble: inspect(userBubble, 'userBubble'),
          toolIsland: inspect(toolIsland, 'toolIsland'),
          codeBlock: inspect(codeBlock, 'codeBlock'),
          tuningPanel: inspect(tuningPanel, 'tuningPanel')
        }
      };
    })()`,
    returnByValue: true
  });

  console.log('=== COMPUTED STYLES & TOKENS ===');
  console.log(JSON.stringify(styleCheck.result.value, null, 2));

  // Save styles to disk
  fs.writeFileSync(
    path.join(artifactDir, 'liquid_glass_computed_styles.json'),
    JSON.stringify(styleCheck.result.value, null, 2)
  );

  // Capture Fullscreen screenshot
  const fullScreen = await send('Page.captureScreenshot', { format: 'png' });
  const fullScreenBuf = Buffer.from(fullScreen.data, 'base64');
  fs.writeFileSync(path.join(artifactDir, 'live_liquid_final_fullscreen.png'), fullScreenBuf);
  console.log('Captured live_liquid_final_fullscreen.png');

  // Scroll to bottom of chat container and capture
  await send('Runtime.evaluate', {
    expression: `(() => {
      const scrollable = document.querySelector('div[class*="overflow-y-auto"]') || document.scrollingElement || document.documentElement;
      if (scrollable) {
        scrollable.scrollTop = scrollable.scrollHeight;
      }
    })()`
  });

  // Short pause
  await new Promise(r => setTimeout(r, 600));

  const bottomScreen = await send('Page.captureScreenshot', { format: 'png' });
  const bottomScreenBuf = Buffer.from(bottomScreen.data, 'base64');
  fs.writeFileSync(path.join(artifactDir, 'live_liquid_final_bottom.png'), bottomScreenBuf);
  console.log('Captured live_liquid_final_bottom.png');

  // If user bubble exists, capture its clip region or middle screen
  const userBubbleBox = await send('Runtime.evaluate', {
    expression: `(() => {
      const ub = document.querySelector('div.rounded-2xl.bg-primary');
      if (!ub) return null;
      ub.scrollIntoView({ block: 'center' });
      const rect = ub.getBoundingClientRect();
      return { x: Math.max(0, rect.x - 30), y: Math.max(0, rect.y - 30), width: rect.width + 60, height: rect.height + 60 };
    })()`,
    returnByValue: true
  });

  await new Promise(r => setTimeout(r, 500));

  if (userBubbleBox.result.value) {
    const box = userBubbleBox.result.value;
    const bubbleClip = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 }
    });
    fs.writeFileSync(path.join(artifactDir, 'live_liquid_final_userbubble.png'), Buffer.from(bubbleClip.data, 'base64'));
    console.log('Captured live_liquid_final_userbubble.png');
  }

  // Also capture sidebar clip
  const sidebarBox = await send('Runtime.evaluate', {
    expression: `(() => {
      const sb = document.querySelector('div.bg-sidebar.pt-1') || document.querySelector('.bg-sidebar');
      if (!sb) return null;
      const rect = sb.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: Math.min(rect.height, 800) };
    })()`,
    returnByValue: true
  });

  if (sidebarBox.result.value) {
    const box = sidebarBox.result.value;
    const sbClip = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 }
    });
    fs.writeFileSync(path.join(artifactDir, 'live_liquid_final_sidebar.png'), Buffer.from(sbClip.data, 'base64'));
    console.log('Captured live_liquid_final_sidebar.png');
  }

  ws.close();
  console.log('Verification finished successfully.');
}

main().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
