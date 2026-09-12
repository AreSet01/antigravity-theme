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

  await send('DOM.enable');
  await send('CSS.enable');

  // Dispatch hover
  const row = await send('Runtime.evaluate', {
    expression: `(() => {
      const r = document.querySelector('[data-testid="conversation-row-sidebar"]').getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`,
    returnByValue: true
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: row.result.value.x,
    y: row.result.value.y
  });
  await new Promise(r => setTimeout(r, 400));

  const doc = await send('DOM.getDocument', { depth: -1 });
  const spanNode = await send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '[data-testid="conversation-row-sidebar"] .group-hover\\:invisible span'
  });
  console.log('spanNode nodeId:', spanNode ? spanNode.nodeId : 'null');
  if (spanNode && spanNode.nodeId) {
    const matched = await send('CSS.getMatchedStylesForNode', { nodeId: spanNode.nodeId });
    console.log('\nMatched rules for timestamp span:');
    matched.matchedCSSRules.forEach(r => {
      const vis = r.rule.style.cssProperties.filter(p => ['visibility', 'display', 'opacity'].includes(p.name));
      if (vis.length > 0) {
        console.log(`[${r.rule.selectorList.text}]: ${vis.map(p => p.name + ': ' + p.value).join('; ')}`);
      }
    });
  }

  ws.close();
}
main().catch(console.error);
