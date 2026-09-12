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
  console.log(`[Captured] ${filename} (${buf.length} bytes)`);
  return fullPath;
}

async function resetAllPopups(send) {
  for (let i = 0; i < 4; i++) {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await new Promise((r) => setTimeout(r, 150));
  }

  // Ensure aux pane is closed
  await send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('.h-screen.w-screen') || document.body;
      const auxVar = window.getComputedStyle(root).getPropertyValue('--aux-pane-width');
      if (parseFloat(auxVar) > 0) {
        const auxBtn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
        if (auxBtn) auxBtn.click();
      }
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    })()`
  });
  await new Promise((r) => setTimeout(r, 400));
}

async function switchTheme(themeKey) {
  console.log(`\n======================================================`);
  console.log(`>>> SWITCHING THEME TO: ${themeKey}`);
  console.log(`======================================================`);
  execSync(`powershell -ExecutionPolicy Bypass -File .\\switch-theme.ps1 ${themeKey}`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });
  // Wait 4s for full CDP reload and React rehydration
  await new Promise((r) => setTimeout(r, 4000));
}

async function runThemeAudit(themeKey) {
  const { ws, send } = await connectToMainPage();
  const themeAudit = { theme: themeKey, states: {}, cssDiagnostics: {} };

  try {
    // 0. Initial cleanup & Ensure conversation loaded
    await resetAllPopups(send);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const link = document.querySelector('a[aria-label="解析函数用法"]') || document.querySelector('a[aria-label*="Fixing"]');
        if (link) link.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 1200));

    // ========================================================
    // State 1: Workspace Chat Clean
    // ========================================================
    console.log(`[${themeKey}] Capturing 01_workspace_chat...`);
    await resetAllPopups(send);
    themeAudit.states['01_workspace_chat'] = await captureScreenshot(send, `${themeKey}_01_workspace_chat.png`);

    // ========================================================
    // State 2: Sidebar Session Hover
    // ========================================================
    console.log(`[${themeKey}] Capturing 02_sidebar_session_hover...`);
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
    themeAudit.states['02_sidebar_session_hover'] = await captureScreenshot(send, `${themeKey}_02_sidebar_session_hover.png`);

    // ========================================================
    // State 3: Sidebar Kebab Menu Open
    // ========================================================
    console.log(`[${themeKey}] Capturing 03_sidebar_kebab_menu...`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const kebab = document.querySelector('[data-testid="conversation-kebab"]');
        if (kebab) kebab.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 500));
    themeAudit.states['03_sidebar_kebab_menu'] = await captureScreenshot(send, `${themeKey}_03_sidebar_kebab_menu.png`);
    await resetAllPopups(send);

    // ========================================================
    // State 4: Model Selector Dropdown Open
    // ========================================================
    console.log(`[${themeKey}] Capturing 04_model_selector_dropdown...`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const trigger = document.querySelector('[data-testid="model-selector-trigger"]');
        if (trigger) trigger.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 500));
    themeAudit.states['04_model_selector_dropdown'] = await captureScreenshot(send, `${themeKey}_04_model_selector_dropdown.png`);
    await resetAllPopups(send);

    // ========================================================
    // State 5: Input Focus & Toolbar
    // ========================================================
    console.log(`[${themeKey}] Capturing 05_input_focus_state...`);
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
    // Move mouse over send button
    const sendBtnPos = await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button:has(svg.lucide-arrow-right), button:has(svg.lucide-arrow-up), [aria-label*="发送"]');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`,
      returnByValue: true
    });
    if (sendBtnPos.result.value) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: sendBtnPos.result.value.x,
        y: sendBtnPos.result.value.y
      });
      await new Promise((r) => setTimeout(r, 300));
    }
    themeAudit.states['05_input_focus_state'] = await captureScreenshot(send, `${themeKey}_05_input_focus_state.png`);
    await resetAllPopups(send);

    // ========================================================
    // State 6: Message Bubble Action Toolbar Hover
    // ========================================================
    console.log(`[${themeKey}] Capturing 06_message_bubble_actions...`);
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
    themeAudit.states['06_message_bubble_actions'] = await captureScreenshot(send, `${themeKey}_06_message_bubble_actions.png`);
    await resetAllPopups(send);

    // ========================================================
    // State 7: Right Auxiliary Tools Panel Expanded
    // ========================================================
    console.log(`[${themeKey}] Capturing 07_aux_panel_expanded...`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const auxBtn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
        if (auxBtn) auxBtn.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 700));
    themeAudit.states['07_aux_panel_expanded'] = await captureScreenshot(send, `${themeKey}_07_aux_panel_expanded.png`);
    // Collapse aux pane back
    await send('Runtime.evaluate', {
      expression: `(() => {
        const auxBtn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
        if (auxBtn) auxBtn.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 600));

    // ========================================================
    // State 8: Settings Modal - General Tab & Combobox
    // ========================================================
    console.log(`[${themeKey}] Capturing 08_settings_general_combobox...`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const setBtn = document.querySelector('[data-testid="settings-button"]');
        if (setBtn) setBtn.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 600));
    // Click combobox in General tab
    await send('Runtime.evaluate', {
      expression: `(() => {
        const cb = document.querySelector('[role="dialog"] button[role="combobox"]');
        if (cb) cb.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 500));
    themeAudit.states['08_settings_general_combobox'] = await captureScreenshot(send, `${themeKey}_08_settings_general_combobox.png`);
    await resetAllPopups(send);

    // Re-open settings for Appearance & Shortcuts
    await send('Runtime.evaluate', {
      expression: `(() => {
        const setBtn = document.querySelector('[data-testid="settings-button"]');
        if (setBtn) setBtn.click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 600));

    // ========================================================
    // State 9: Settings Modal - Appearance Tab
    // ========================================================
    console.log(`[${themeKey}] Capturing 09_settings_appearance_tab...`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const tabs = Array.from(document.querySelectorAll('[role="dialog"] button')).filter(b => b.innerText.includes('外观'));
        if (tabs.length > 0) tabs[0].click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 500));
    themeAudit.states['09_settings_appearance_tab'] = await captureScreenshot(send, `${themeKey}_09_settings_appearance_tab.png`);

    // ========================================================
    // State 10: Settings Modal - Shortcuts Tab
    // ========================================================
    console.log(`[${themeKey}] Capturing 10_settings_shortcuts_tab...`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const tabs = Array.from(document.querySelectorAll('[role="dialog"] button')).filter(b => b.innerText.includes('快捷键'));
        if (tabs.length > 0) tabs[0].click();
      })()`
    });
    await new Promise((r) => setTimeout(r, 500));
    themeAudit.states['10_settings_shortcuts_tab'] = await captureScreenshot(send, `${themeKey}_10_settings_shortcuts_tab.png`);
    await resetAllPopups(send);

    // ========================================================
    // CSS & DOM Diagnostics Extraction
    // ========================================================
    console.log(`[${themeKey}] Extracting CSS diagnostics...`);
    const diagRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const root = document.querySelector('.h-screen.w-screen') || document.body;
        const cs = window.getComputedStyle(root);
        const topBar = document.querySelector('header, .shrink-0, [style*="aux-pane-width"]');
        const tbCs = topBar ? window.getComputedStyle(topBar) : null;
        const sendBtn = document.querySelector('button:has(svg.lucide-arrow-right), button:has(svg.lucide-arrow-up)');
        const sendCs = sendBtn ? window.getComputedStyle(sendBtn) : null;
        const editor = document.querySelector('div[contenteditable="true"]');
        const edCs = editor ? window.getComputedStyle(editor) : null;
        
        return {
          rootBg: cs.backgroundColor,
          rootFg: cs.color,
          fontFamily: cs.fontFamily,
          auxPaneWidth: cs.getPropertyValue('--aux-pane-width'),
          sidebarWidth: cs.getPropertyValue('--sidebar-width'),
          sendButtonBg: sendCs ? sendCs.backgroundColor : null,
          sendButtonFg: sendCs ? sendCs.color : null,
          sendButtonBorder: sendCs ? sendCs.border : null,
          editorBorder: edCs ? edCs.border : null,
          editorRadius: edCs ? edCs.borderRadius : null,
          topBarTransition: tbCs ? tbCs.transition : null,
          topBarPaddingRight: tbCs ? tbCs.paddingRight : null
        };
      })()`,
      returnByValue: true
    });
    themeAudit.cssDiagnostics = diagRes.result.value;

  } finally {
    ws.close();
  }

  return themeAudit;
}

async function main() {
  const themes = ['phantom', 'pixel', 'doodle', 'matcha'];
  const allResults = {};

  for (const t of themes) {
    try {
      await switchTheme(t);
      allResults[t] = await runThemeAudit(t);
    } catch (err) {
      console.error(`Error auditing theme ${t}:`, err);
    }
  }

  // Restore phantom as active theme at the end
  console.log(`\nRestoring phantom-theme...`);
  execSync(`powershell -ExecutionPolicy Bypass -File .\\switch-theme.ps1 phantom`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });

  const outPath = path.resolve(__dirname, '..', 'artifacts', 'interactive_audit_data.json');
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\n======================================================`);
  console.log(`ALL 40 SCREENSHOTS CAPTURED & AUDIT COMPLETE!`);
  console.log(`Report JSON saved to: ${outPath}`);
  console.log(`Screenshots in: ${artifactsDir}`);
  console.log(`======================================================`);
}

main().catch(console.error);
