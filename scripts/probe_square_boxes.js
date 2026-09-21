const http = require('http');
const fs = require('fs');
const path = require('path');

const portFile = path.join(process.env.HOME, 'Library/Application Support/Antigravity/DevToolsActivePort');
const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();

http.get('http://127.0.0.1:' + port + '/json', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const list = JSON.parse(data);
    const page = list.find(x => x.type === 'page' && x.url && !x.url.startsWith('data:'));
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.onopen = () => {
      const expr = `
        (() => {
          const els = Array.from(document.querySelectorAll('*'));
          const squareBoxes = [];
          for (const el of els) {
            const rect = el.getBoundingClientRect();
            if (rect.width < 25 || rect.height < 15) continue;
            if (rect.top > window.innerHeight || rect.bottom < 0) continue;
            if (rect.left > window.innerWidth || rect.right < 0) continue;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
            
            const hasBg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
            const hasBorder = cs.borderWidth !== '0px' && cs.borderColor !== 'transparent' && cs.borderStyle !== 'none';
            const isControl = ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.getAttribute('role') === 'button';
            const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';

            if (hasBg || hasBorder || isControl || hasShadow) {
              const r = cs.borderRadius;
              if (['HTML', 'BODY'].includes(el.tagName) || el.id === 'root') continue;
              if (r === '0px' || r === '0px 0px 0px 0px') {
                squareBoxes.push({
                  tag: el.tagName,
                  id: el.id || undefined,
                  classes: (el.className || '').toString().slice(0, 70),
                  role: el.getAttribute('role') || undefined,
                  testId: el.getAttribute('data-testid') || undefined,
                  rect: Math.round(rect.width) + 'x' + Math.round(rect.height),
                  bg: cs.backgroundColor,
                  border: cs.borderWidth + ' ' + cs.borderStyle + ' ' + cs.borderColor,
                  hasShadow: !!hasShadow,
                  text: (el.textContent || '').slice(0, 40).trim()
                });
              }
            }
          }
          return squareBoxes;
        })()
      `;
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    };
    ws.onmessage = m => {
      const resp = JSON.parse(m.data);
      if (resp.id === 1) {
        if (resp.result.exceptionDetails) {
          console.error('Eval error:', resp.result.exceptionDetails);
        } else {
          const val = resp.result.result.value;
          console.log('Total square boxes:', val.length);
          console.log(JSON.stringify(val, null, 2));
        }
        ws.close();
      }
    };
  });
});
