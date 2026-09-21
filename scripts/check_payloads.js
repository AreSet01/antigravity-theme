#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const targetFile = path.resolve(__dirname, '../patch/pixelTheme.js');
const code = fs.readFileSync(targetFile, 'utf8');

const regex = /const\s+([A-Z0-9_]+_JS)\s*=\s*`([\s\S]*?)(?<!\\)`;/g;
let match;
let count = 0;
let failures = 0;

// Also test loading the entire file with mocked electron
try {
  const Module = require('module');
  const origRequire = Module.prototype.require;
  Module.prototype.require = function(request) {
    if (request === 'electron') {
      return {
        BrowserWindow: class {},
        ipcMain: { on() {}, handle() {} },
        app: { getPath() { return ''; } }
      };
    }
    return origRequire.apply(this, arguments);
  };
  require(targetFile);
  console.log('✓ patch/pixelTheme.js whole-module load: PASS');
} catch (err) {
  console.error('✗ patch/pixelTheme.js whole-module load: FAIL', err);
  failures++;
}

// Check each embedded string payload
while ((match = regex.exec(code)) !== null) {
  const name = match[1];
  count++;
  try {
    const payloadCode = vm.runInNewContext(match[0] + ';' + name);
    new vm.Script(payloadCode);
    console.log(`✓ Payload ${name} (${payloadCode.length} bytes): PASS`);
  } catch (err) {
    console.error(`✗ Payload ${name}: FAIL - ${err.message}`);
    failures++;
  }
}

console.log(`\nVerified ${count} payloads. Failures: ${failures}`);
if (failures > 0) {
  process.exit(1);
} else {
  console.log('All payloads intact and error-free.');
}
