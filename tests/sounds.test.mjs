// Sound assets gate: credits, size budget, SOUND_FILES paths. Prints SOUNDS OK.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets', 'sounds');
const fails = [];
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')) : [];
if (!files.length) fails.push('assets/sounds has no .mp3 files');

const credits = fs.existsSync(path.join(dir, 'CREDITS.md')) ? fs.readFileSync(path.join(dir, 'CREDITS.md'), 'utf8') : '';
if (!credits) fails.push('assets/sounds/CREDITS.md missing');
for (const f of files) {
  const row = credits.split('\n').find((l) => l.includes(f));
  if (!row) fails.push(`${f}: no row in CREDITS.md`);
  else {
    if (!row.includes('CC0')) fails.push(`${f}: row lacks CC0`);
    if (!/https:\/\//.test(row)) fails.push(`${f}: row lacks an https:// source URL`);
  }
}
const total = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
if (total > 307200) fails.push(`total ${total} bytes exceeds 307200`);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = html.match(/SOUND_FILES\s*=\s*\{([\s\S]*?)\}/);
if (!m) fails.push('SOUND_FILES literal not found in index.html');
else {
  const paths = [...m[1].matchAll(/['"]([^'"]+\.mp3)['"]/g)].map((x) => x[1]);
  if (!paths.length) fails.push('SOUND_FILES has no paths');
  for (const p of paths) if (!fs.existsSync(path.join(root, p))) fails.push(`SOUND_FILES path missing: ${p}`);
}
if (fails.length) { console.error('SOUNDS FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('SOUNDS OK');
