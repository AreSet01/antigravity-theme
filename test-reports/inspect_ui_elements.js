const fs = require('fs');
const http = require('http');
const path = require('path');

const portFile = path.join(process.env.APPDATA, 'Antigravity', 'DevToolsActivePort');
const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim();

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const targets = await getTargets();
  const main = targets.find((x) => x.type === 'page' && !x.url.startsWith('data:'));
  if (!main) throw new Error('No main page target');

  const ws = new WebSocket(main.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let msgId = 0;
  const send = (method, params = {}) =>
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

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const header = document.querySelector('header');
      const aside = document.querySelector('aside');
      const main = document.querySelector('main');
      const settingsBtn = document.querySelector('[data-testid="settings-button"]');
      const auxBtn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
      const collapseSidebarBtn = document.querySelector('[data-testid="collapse-sidebar"]');
      const kebabs = Array.from(document.querySelectorAll('[data-testid="conversation-kebab"]'));
      
      // Look for model selector
      const modelBtns = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = (b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '');
        return /model|gemini|claude|gpt|o3|sonnet|flash/i.test(t);
      }).map(b => ({ text: b.innerText.trim(), testid: b.getAttribute('data-testid'), className: b.className }));

      // Look for input textarea
      const inputs = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]')).map(el => ({
        tag: el.tagName,
        placeholder: el.placeholder || el.getAttribute('data-placeholder'),
        className: el.className
      }));

      // Look for message bubbles
      const messages = Array.from(document.querySelectorAll('[data-testid*="message"], [class*="message"], [class*="bubble"], [class*="prose"]')).slice(0, 10).map(m => ({
        tag: m.tagName,
        testid: m.getAttribute('data-testid'),
        className: m.className.slice(0, 50),
        textSnippet: m.innerText ? m.innerText.slice(0, 40) : ''
      }));

      // Look for window caption buttons
      const windowControls = Array.from(document.querySelectorAll('[class*="window-control"], [aria-label*="关闭"], [aria-label*="最大化"], [aria-label*="最小化"]')).map(w => ({
        aria: w.getAttribute('aria-label'),
        className: w.className
      }));

      return {
        hasHeader: !!header,
        hasAside: !!aside,
        hasMain: !!main,
        settingsBtn: !!settingsBtn,
        auxBtn: !!auxBtn,
        collapseSidebarBtn: !!collapseSidebarBtn,
        kebabCount: kebabs.length,
        modelBtns,
        inputs,
        messagesCount: messages.length,
        messagesSample: messages,
        windowControls
      };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
}

main().catch(console.error);
