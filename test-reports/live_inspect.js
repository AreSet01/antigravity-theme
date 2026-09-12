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

  await send('Runtime.evaluate', {
    expression: `(() => {
      let modal = document.querySelector('.settings-modal-container');
      if (!modal) {
        const btn = document.querySelector('[data-testid="settings-button"]');
        if (btn) btn.click();
      }
    })()`
  });
  await new Promise((r) => setTimeout(r, 600));

  await send('DOM.enable');
  await send('CSS.enable');
  const doc = await send('DOM.getDocument', { depth: -1 });

  const btnNode = await send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '.settings-modal-container div.bg-sidebar button'
  });

  if (btnNode.nodeId) {
    const matched = await send('CSS.getMatchedStylesForNode', { nodeId: btnNode.nodeId });
    const rules = matched.matchedCSSRules.map(r => ({
      selector: r.rule.selectorList.text,
      cssText: r.rule.style.cssText
    })).filter(r => r.selector.includes('sidebar') || r.cssText.includes('230, 0, 18'));
    console.log('Matched rules on 通用:');
    console.log(JSON.stringify(rules, null, 2));
  }

  ws.close();
}

main().catch(console.error);
