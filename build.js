'use strict';
// Injects src/engine.js (between ENGINE markers) into the target HTML files.
const fs = require('fs');
const path = require('path');
const root = __dirname;
const engine = fs.readFileSync(path.join(root, 'src/engine.js'), 'utf8');
const m = engine.match(/\/\/ ==ENGINE-START==[\s\S]*?\/\/ ==ENGINE-END==/);
if (!m) { console.error('markers missing in src/engine.js'); process.exit(1); }
for (const file of ['index.html', 'generator.html']) {
  const p = path.join(root, file);
  const html = fs.readFileSync(p, 'utf8');
  if (!/\/\/ ==ENGINE-START==[\s\S]*?\/\/ ==ENGINE-END==/.test(html)) {
    console.error('markers missing in ' + file); process.exit(1);
  }
  fs.writeFileSync(p, html.replace(/\/\/ ==ENGINE-START==[\s\S]*?\/\/ ==ENGINE-END==/, m[0]));
  console.log('injected engine into ' + file);
}
