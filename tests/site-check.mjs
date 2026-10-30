#!/usr/bin/env node
/**
 * Headless UI gate: serves the repo root under /cold-shoulder/, drives index.html in Chrome over CDP.
 *
 *   node tests/site-check.mjs [--only=console,network,text,scenarios] [--shots DIR] [--chrome PATH]
 *
 * Prints PASS <name> or FAIL <name> -- <detail> per check; exits 0 only if every check that ran passed.
 * Chrome runs with a throwaway profile and OS-assigned ports; the server binds 127.0.0.1 port 0.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i < 0) return null;
  if (args[i].includes('=')) return args.splice(i, 1)[0].split('=').slice(1).join('=');
  return args.splice(i, 2)[1] ?? null;
};
const onlyArg = opt('--only');
const shots = opt('--shots');
const chromePath = opt('--chrome') || process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ALL = ['console', 'network', 'text', 'scenarios'];
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : ALL;
const badOnly = only.filter((o) => !ALL.includes(o));
if (badOnly.length || !only.length) { console.error(`site-check: unknown --only value ${badOnly.join(',')}; use ${ALL.join(',')}`); process.exit(2); }
const want = (n) => only.includes(n);
if (!fs.existsSync(chromePath)) { console.error(`site-check: Chrome not found at ${chromePath}; pass --chrome PATH`); process.exit(1); }

const PREFIX = '/cold-shoulder/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { p = ''; }
  if (!p.startsWith(PREFIX)) { res.writeHead(404); return res.end('not found'); }
  let file = path.join(root, p.slice(PREFIX.length) || 'index.html');
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(404); return res.end('not found'); }
  fs.stat(file, (e, st) => {
    if (!e && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const pageUrl = origin + PREFIX + 'index.html';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'site-check-'));
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${profile}`,
  '--remote-debugging-port=0', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
let finished = false;
const done = (code) => {
  if (finished) return;
  finished = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { server.close(); } catch {}
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }, 300);
};
process.on('SIGINT', () => done(130));
process.on('SIGTERM', () => done(143));
chrome.on('error', (e) => { console.error('site-check: cannot start Chrome: ' + e.message); done(1); });
setTimeout(() => { console.error('site-check: no result after 120 s; Chrome stopped answering'); done(1); }, 120_000).unref();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await wait(100);
  if (!fs.existsSync(portFile)) throw new Error('Chrome did not start');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', () => j(new Error('CDP socket failed'))); });

  let seq = 0, ctx = '';
  const reqUrl = new Map(), pending = new Map(), consoleErrors = [], requests = [], badResponses = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    const P = msg.params;
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = P.exceptionDetails;
      consoleErrors.push(`[${ctx}] exception: ${(d.exception && d.exception.description) || d.text}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && P.type === 'error') {
      consoleErrors.push(`[${ctx}] console.error: ${P.args.map((a) => a.value ?? a.description).join(' ')}`);
    } else if (msg.method === 'Network.requestWillBeSent') {
      requests.push({ ctx, url: P.request.url }); reqUrl.set(P.requestId, P.request.url);
    } else if (msg.method === 'Network.responseReceived') {
      if (P.response.status >= 400) badResponses.push({ ctx, url: P.response.url, status: P.response.status });
    } else if (msg.method === 'Network.loadingFailed' && !P.canceled) {
      badResponses.push({ ctx, url: reqUrl.get(P.requestId) || P.requestId, status: 'failed: ' + P.errorText });
    }
  });
  const send = (method, params = {}) => new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, replMode: true });
    const x = r.result && r.result.exceptionDetails;
    if (x) throw new Error((x.exception && x.exception.description) || x.text);
    return r.result.result.value;
  };

  const VIEWPORTS = {
    desktop: { width: 1280, height: 900, mobile: false },
    phone: { width: 360, height: 740, mobile: true },
    narrow: { width: 320, height: 640, mobile: true },
    phone375: { width: 375, height: 667, mobile: true },
  };
  const setViewport = (name, reducedMotion = false) => Promise.all([
    send('Emulation.setDeviceMetricsOverride', { ...VIEWPORTS[name], deviceScaleFactor: 1 }),
    send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }] }),
  ]);
  // clear: wipe the origin's local/session storage first, so each check starts from defaults;
  // ctx.reload() in a scenario passes false to keep storage.
  const load = async (clear = true) => {
    if (clear) await send('Storage.clearDataForOrigin', { origin, storageTypes: 'local_storage,session_storage' });
    await send('Page.navigate', { url: pageUrl });
    for (let i = 0; i < 100; i++) {
      await wait(100);
      try { if (await ev('document.readyState === "complete" && typeof regions !== "undefined" && regions.length > 0')) return; } catch {}
    }
    throw new Error('page never built a puzzle (regions.length > 0)');
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  const results = [];
  const record = (name, failures) => results.push({ name, failures });

  // ---- per-viewport pass: console / network / text / narrow overflow
  const textFails = [], overflowFails = [], loadFails = [];
  const OLD_NAME = 'star' + 'struck'; // built at run time so this file never holds the old name
  const TEXT_JS = `(() => {
    const re = new RegExp('★|\\\\bstars?\\\\b|' + ${JSON.stringify(OLD_NAME)});
    const out = [];
    const t = document.title.toLowerCase();
    if (re.test(t)) out.push('title: ' + t);
    const b = document.body.cloneNode(true);
    b.querySelectorAll('script, style').forEach((e) => e.remove());
    const body = b.textContent.toLowerCase();
    const m = body.match(re);
    if (m) { const i = m.index; out.push('body text: ...' + body.slice(Math.max(0, i - 25), i + 25).replace(/\\s+/g, ' ') + '...'); }
    document.querySelectorAll('[title],[aria-label]').forEach((e) => {
      for (const a of ['title', 'aria-label']) {
        const v = (e.getAttribute(a) || '').toLowerCase();
        if (re.test(v)) out.push(a + ': ' + v);
      }
    });
    // glyphs drawn through CSS: test content / custom-property VALUES only (not selectors)
    const cssVal = (where, name, v) => { if (v && /★/.test(v)) out.push('css ' + where + ' ' + name + ': ' + v.trim()); };
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch { continue; }
      const walk = (list) => { for (const r of list) {
        if (r.style) { cssVal(r.selectorText || r.cssText.slice(0, 30), 'content', r.style.getPropertyValue('content'));
          for (let i = 0; i < r.style.length; i++) { const n = r.style[i]; if (n.startsWith('--')) cssVal(r.selectorText || '', n, r.style.getPropertyValue(n)); } }
        if (r.cssRules) walk(r.cssRules);
      } };
      walk(rules);
    }
    const inl = document.documentElement.style;
    for (let i = 0; i < inl.length; i++) { const n = inl[i]; if (n.startsWith('--')) cssVal('inline html', n, inl.getPropertyValue(n)); }
    return out;
  })()`;
  if (want('console') || want('network') || want('text')) {
    for (const vp of ['desktop', 'phone', 'narrow']) {
      ctx = vp;
      await setViewport(vp);
      try { await load(); } catch (e) { loadFails.push(`${vp}: ${e.message}`); }
      await wait(300);
      if (want('text')) for (const f of await ev(TEXT_JS)) textFails.push(`${vp} ${f}`);
      if (vp === 'narrow') {
        const o = await ev('document.documentElement.scrollWidth - document.documentElement.clientWidth');
        if (o > 0) overflowFails.push(`scrollWidth exceeds clientWidth by ${o}px at narrow`);
        if (shots) {
          fs.mkdirSync(shots, { recursive: true });
          const img = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(shots, 'narrow.png'), Buffer.from(img.result.data, 'base64'));
        }
      }
      if (shots && vp !== 'narrow') {
        fs.mkdirSync(shots, { recursive: true });
        const img = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(shots, vp + '.png'), Buffer.from(img.result.data, 'base64'));
      }
    }
  }

  // ---- scenarios
  const scenFails = [];
  if (want('scenarios')) {
    const scenarios = (await import('./site-scenarios.mjs')).default;
    for (const s of scenarios) {
      ctx = `scenario ${s.name}`;
      try {
        await setViewport(s.viewport || 'desktop', !!s.reducedMotion);
        await load();
        await s.run(ev, { reload: () => load(false) });
      } catch (e) {
        scenFails.push(`${s.name}: ${String(e.message || e).split('\n')[0]}`);
      }
      if (shots) {
        try {
          fs.mkdirSync(shots, { recursive: true });
          const img = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(shots, 'scenario-' + s.name.replace(/[^a-z0-9]+/gi, '-') + '.png'), Buffer.from(img.result.data, 'base64'));
        } catch {}
      }
    }
    await setViewport('desktop');
  }

  if (loadFails.length) record('load', loadFails);
  if (want('console')) record('console', consoleErrors);
  if (want('network')) {
    const f = [];
    for (const r of requests) {
      if (/^(data|blob|chrome-extension):/.test(r.url)) continue; // chrome-extension: browser noise, not the page
      if (!r.url.startsWith(origin + '/')) f.push(`off-origin request ${r.url}`);
    }
    for (const r of badResponses) f.push(`${r.status} ${r.url}`);
    record('network', [...new Set(f)]);
  }
  if (want('text')) record('text', textFails);
  if (want('console') || want('network') || want('text')) record('narrow overflow', overflowFails);
  if (want('scenarios')) record('scenarios', scenFails);

  const LIMIT = process.env.SITE_ALL ? Infinity : 5;
  let bad = false;
  for (const r of results) {
    if (r.failures.length) { bad = true; console.log(`FAIL ${r.name} -- ${r.failures.slice(0, LIMIT).join(' | ')}${r.failures.length > LIMIT ? ` | (+${r.failures.length - LIMIT} more)` : ''}`); }
    else console.log(`PASS ${r.name}`);
  }
  try { ws.close(); } catch {}
  done(bad ? 1 : 0);
} catch (e) {
  console.error('site-check: ' + (e && e.stack || e));
  done(1);
}
