const fs = require('fs');
const http = require('http');
const path = require('path');

const portFile = path.join(process.env.APPDATA, 'Antigravity', 'DevToolsActivePort');
const artifactsDir = path.resolve(__dirname, '..', 'artifacts', 'screenshots');

function getPort() {
  return fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim();
}

function getTargets(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
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
  const fullPath = path.join(artifactsDir, filename);
  fs.writeFileSync(fullPath, buf);
  console.log(`[Re-captured] ${filename} (${buf.length} bytes)`);
  return fullPath;
}

async function closeAll(send) {
  // Click close button if dialog open
  await send('Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        const allButtons = Array.from(dialog.querySelectorAll('button'));
        const closeCandidate = allButtons.find(b => {
          const r = b.getBoundingClientRect();
          const dr = dialog.getBoundingClientRect();
          return (r.right >= dr.right - 60) && (r.top <= dr.top + 60);
        });
        if (closeCandidate) closeCandidate.click();
      }
      const auxBtn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
      const root = document.querySelector('.h-screen.w-screen') || document.body;
      if (root && parseFloat(window.getComputedStyle(root).getPropertyValue('--aux-pane-width')) > 0) {
        if (auxBtn) auxBtn.click();
      }
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    })()`
  });
  for (let i = 0; i < 3; i++) {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise(r => setTimeout(r, 150));
  }
  await new Promise(r => setTimeout(r, 400));
}

async function main() {
  const { ws, send } = await connectToMainPage();
  try {
    await closeAll(send);
    // Ensure session loaded
    await send('Runtime.evaluate', {
      expression: `(() => {
        const link = document.querySelector('a[aria-label="解析函数用法"]') || document.querySelector('a[aria-label*="Fixing"]');
        if (link) link.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('Capturing clean phantom_01_workspace_chat...');
    await captureScreenshot(send, 'phantom_01_workspace_chat.png');

    console.log('Capturing clean phantom_02_sidebar_session_hover...');
    const sessionHover = await send('Runtime.evaluate', {
      expression: `(() => {
        const link = document.querySelector('a[aria-label="解析函数用法"]');
        if (!link) return null;
        const rect = link.getBoundingClientRect();
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
      })()`,
      returnByValue: true
    });
    if (sessionHover.result.value) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: sessionHover.result.value.x,
        y: sessionHover.result.value.y
      });
      await new Promise((r) => setTimeout(r, 400));
    }
    await captureScreenshot(send, 'phantom_02_sidebar_session_hover.png');

    console.log('Capturing clean phantom_03_sidebar_kebab_menu...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const kebab = document.querySelector('[data-testid="conversation-kebab"]');
        if (kebab) kebab.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 500));
    await captureScreenshot(send, 'phantom_03_sidebar_kebab_menu.png');
    await closeAll(send);

    console.log('Capturing clean phantom_04_model_selector_dropdown...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const trigger = document.querySelector('[data-testid="model-selector-trigger"]');
        if (trigger) trigger.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 500));
    await captureScreenshot(send, 'phantom_04_model_selector_dropdown.png');
    await closeAll(send);

    console.log('Capturing clean phantom_05_input_focus_state...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const editor = document.querySelector('div[contenteditable="true"]');
        if (editor) {
          editor.focus();
          editor.textContent = '请帮我优化当前的交互动效与视觉反馈...';
        }
      })()`
    });
    await new Promise((r) => setTimeout(r, 400));
    await captureScreenshot(send, 'phantom_05_input_focus_state.png');
    await closeAll(send);

    console.log('Capturing clean phantom_06_message_bubble_actions...');
    const actionBtnPos = await send('Runtime.evaluate', {
      expression: `(() => {
        const copyBtn = document.querySelector('button[aria-label="Copy code"], button[aria-label="复制"]');
        if (!copyBtn) return null;
        copyBtn.scrollIntoView({ block: 'center' });
        const r = copyBtn.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`,
      returnByValue: true
    });
    if (actionBtnPos.result.value) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: actionBtnPos.result.value.x,
        y: actionBtnPos.result.value.y
      });
      await new Promise((r) => setTimeout(r, 400));
    }
    await captureScreenshot(send, 'phantom_06_message_bubble_actions.png');
    await closeAll(send);

    console.log('Capturing clean phantom_07_aux_panel_expanded...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const auxBtn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
        if (auxBtn) auxBtn.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 700));
    await captureScreenshot(send, 'phantom_07_aux_panel_expanded.png');
    await closeAll(send);

    console.log('Phantom screenshots re-captured cleanly!');
  } finally {
    ws.close();
  }
}

main().catch(console.error);
