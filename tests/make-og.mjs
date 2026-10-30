#!/usr/bin/env node
/**
 * Renders og.png (1200x630): a cat on a board, the name, the Ginger look. Uses the cat sprite from index.html.
 *
 *   node tests/make-og.mjs [--chrome PATH]
 *
 * Headless Chrome with a throwaway profile; nothing is served and no network is used.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--chrome');
const chromePath = (i > 0 && process.argv[i + 1]) || process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(chromePath)) { console.error(`make-og: Chrome not found at ${chromePath}; pass --chrome PATH`); process.exit(1); }

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sprite = index.match(/<svg width="0" height="0"[\s\S]*?<\/defs>\s*<\/svg>/);
if (!sprite) { console.error('make-og: cat sprite block not found in index.html'); process.exit(1); }
const font = (w) => pathToFileURL(path.join(root, `assets/fonts/fredoka-${w}.woff2`)).href;

// 5x5 board, one cat per row/column, none touching; tints stand in for the five boxes.
const cats = [1, 3, 0, 2, 4];
const tint = ['#f8d9b0', '#fbe6c8', '#f3cfa0', '#fdeedd', '#efd9bf'];
const box = [[0,0,0,1,1],[0,0,1,1,1],[2,2,3,3,1],[2,3,3,4,4],[2,3,4,4,4]];
let cells = '';
for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
  const edge = (dr, dc) => { const rr = r + dr, cc = c + dc; return rr < 0 || cc < 0 || rr > 4 || cc > 4 || box[rr][cc] !== box[r][c]; };
  const b = (d, dr, dc) => `border-${d}:${edge(dr, dc) ? '5px solid #5b3a29' : '1px solid #e3cdb3'};`;
  cells += `<div class="cell" style="background:${tint[box[r][c]]};${b('top', -1, 0)}${b('bottom', 1, 0)}${b('left', 0, -1)}${b('right', 0, 1)}">${cats[r] === c ? '<svg><use href="#cat-calm"/></svg>' : ''}</div>`;
}
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Fredoka;font-weight:600;src:url('${font(600)}') format('woff2')}
@font-face{font-family:Fredoka;font-weight:700;src:url('${font(700)}') format('woff2')}
:root{--fur:#f4a259;--stripe:#c9702a;--ink:#5b3a29;--ear:#f2a7a0;--eye:#fff8c4;--bib:transparent;--mask:transparent;--patch:transparent;--patch-2:transparent}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#fff8ee;font-family:Fredoka,system-ui,sans-serif;color:#3d2a1e;display:flex;align-items:center;justify-content:space-between;padding:0 90px 0 100px}
h1{font-size:112px;font-weight:700;line-height:1;letter-spacing:-1px}
p{font-size:33px;font-weight:600;color:#6b4f3d;margin-top:26px;line-height:1.25}
.board{display:grid;grid-template-columns:repeat(5,92px);grid-template-rows:repeat(5,92px);border:5px solid #5b3a29;border-radius:14px;overflow:hidden;box-shadow:0 14px 0 #e3cdb3}
.cell{display:flex;align-items:center;justify-content:center}
.cell svg{width:76px;height:76px}
</style>${sprite[0]}<div><h1>Cold<br>Shoulder</h1><p>One cat per row, column and box.<br>No two cats touching.</p></div><div class="board">${cells}</div>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'make-og-'));
const page = path.join(dir, 'card.html');
fs.writeFileSync(page, html);
const out = path.join(root, 'og.png');
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files',
  `--user-data-dir=${path.join(dir, 'profile')}`, '--window-size=1200,630', '--force-device-scale-factor=1',
  '--virtual-time-budget=4000', `--screenshot=${out}`, pathToFileURL(page).href], { stdio: 'ignore' });
let code = 1;
const clean = () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
process.on('SIGINT', () => { clean(); process.exit(130); });
process.on('SIGTERM', () => { clean(); process.exit(143); });
chrome.on('error', (e) => { console.error('make-og: cannot start Chrome: ' + e.message); clean(); process.exit(1); });
const timer = setTimeout(() => { console.error('make-og: Chrome took over 60 s'); clean(); process.exit(1); }, 60_000);
chrome.on('exit', (c) => {
  clearTimeout(timer);
  const ok = c === 0 && fs.existsSync(out);
  if (ok) console.log(`wrote og.png (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`); else console.error('make-og: Chrome exited ' + c);
  clean(); process.exit(ok ? 0 : 1);
});
