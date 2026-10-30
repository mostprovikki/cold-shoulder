// Scenario list for tests/site-check.mjs. Later tasks append entries here.
// Shape: { name, viewport?: 'desktop'|'phone'|'narrow'|'phone375', reducedMotion?: boolean, run: async (ev, ctx) => void }
// ctx.reload() reloads the page WITHOUT clearing storage and waits for regions.length > 0. Storage is cleared before each scenario.
// ev(js) evaluates js in the page (await allowed; JSON result). run throws to fail.
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const base = [
  {
    name: 'page builds a board',
    async run(ev) {
      const n = await ev('N');
      const kids = await ev("document.getElementById('grid').children.length");
      assert(n === 8, `N === 8, got ${n}`);
      assert(kids === 64, `grid children === 64, got ${kids}`);
    },
  },
  {
    name: 'ev supports await',
    async run(ev) {
      const v = await ev('await Promise.resolve(41) + 1');
      assert(v === 42, `expected 42, got ${v}`);
    },
  },
  {
    name: 'a placed piece draws no star glyph',
    async run(ev) {
      const content = await ev(`(() => {
        onCellClick(0, solution[0]); onCellClick(0, solution[0]);
        const cell = document.getElementById('grid').children[solution[0]];
        return getComputedStyle(cell, '::after').content + ' | ' + cell.className;
      })()`);
      assert(!content.includes('★'), `placed piece ::after content has a star glyph: ${content}`);
    },
  },
  {
    name: 'paw on first tap',
    async run(ev) {
      const href = await ev(`(() => {
        let r = 0, c = 0;
        outer: for (r = 0; r < N; r++) for (c = 0; c < N; c++) if (board[r][c] === 0) break outer;
        onCellClick(r, c);
        const u = document.getElementById('grid').children[r * N + c].querySelector('use');
        return u && u.getAttribute('href');
      })()`);
      assert(href === '#paw', `expected #paw, got ${href}`);
    },
  },
  {
    name: 'cat on second tap',
    async run(ev) {
      const href = await ev(`(() => {
        onCellClick(0, solution[0]); onCellClick(0, solution[0]);
        const u = document.getElementById('grid').children[solution[0]].querySelector('use');
        return u && u.getAttribute('href');
      })()`);
      assert(href === '#cat-calm', `expected #cat-calm, got ${href}`);
    },
  },
  {
    name: 'clash shows puffed cats',
    async run(ev) {
      const o = await ev(`(() => {
        const col = solution[0];
        for (const r of [0, 1]) { onCellClick(r, col); onCellClick(r, col); }
        return [0, 1].map((r) => { const cell = document.getElementById('grid').children[r * N + col];
          const u = cell.querySelector('use'); return [u && u.getAttribute('href'), cell.classList.contains('wrong')]; });
      })()`);
      for (const [h, w] of o) { assert(h === '#cat-mad', `expected #cat-mad, got ${h}`); assert(w, 'cell lacks class wrong'); }
    },
  },
  {
    name: 'small cells use simple cats',
    async run(ev) {
      const o = await ev(`[catSymbol('calm', 28), catSymbol('mad', 29.5), catSymbol('calm', 30), catSymbol('mad', 48)]`);
      assert(o[0] === '#cat-calm-s', `calm 28: ${o[0]}`);
      assert(o[1] === '#cat-mad-s', `mad 29.5: ${o[1]}`);
      assert(o[2] === '#cat-calm', `calm 30: ${o[2]}`);
      assert(o[3] === '#cat-mad', `mad 48: ${o[3]}`);
    },
  },
  {
    name: 'narrow phone hard board',
    viewport: 'narrow',
    async run(ev) {
      await ev(`setDiff('hard'); requestNewGame();`);
      let ok = false;
      for (let i = 0; i < 60 && !ok; i++) {
        ok = await ev('N === 10 && regions.length === 10');
        if (!ok) await new Promise((r) => setTimeout(r, 250));
      }
      assert(ok, 'hard board (N === 10) never appeared');
      const o = await ev(`(() => {
        onCellClick(0, solution[0]); onCellClick(0, solution[0]);
        const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
        const u = document.getElementById('grid').children[solution[0]].querySelector('use');
        return { href: u && u.getAttribute('href'), want: catSymbol('calm', px), px,
          sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
      })()`);
      assert(o.href === o.want, `cat uses ${o.href}, want ${o.want} at ${o.px}px`);
      assert(o.sw <= o.cw, `scrollWidth ${o.sw} > clientWidth ${o.cw}`);
    },
  },
  {
    name: 'reduced motion stops the cat pop',
    reducedMotion: true,
    async run(ev) {
      const o = await ev(`(() => {
        onCellClick(0, solution[0]); onCellClick(0, solution[0]);
        const cell = document.getElementById('grid').children[solution[0]];
        return [cell.classList.contains('star-pop'), getComputedStyle(cell.querySelector('svg.cat')).animationName];
      })()`);
      assert(o[0], 'cell has no star-pop class (probe invalid)');
      assert(o[1] === 'none', `cat svg animationName is ${o[1]}, want none`);
    },
  },
  {
    name: 'theme pop variants reach the cat svg',
    async run(ev) {
      const n = await ev(`(() => {
        applyTheme('tuxedo');
        onCellClick(0, solution[0]); onCellClick(0, solution[0]);
        return getComputedStyle(document.getElementById('grid').children[solution[0]].querySelector('svg.cat')).animationName;
      })()`);
      assert(n === 'pop-snap', `tuxedo cat animation is ${n}, want pop-snap`);
    },
  },
  {
    name: 'unknown stored coat falls back to ginger',
    async run(ev, ctx) {
      await ev(`localStorage.setItem('coldshoulder_theme','classic')`);
      await ctx.reload();
      const o = await ev(`[document.body.dataset.theme, getComputedStyle(document.documentElement).getPropertyValue('--fur').trim()]`);
      assert(o[0] === 'ginger', `theme is ${o[0]}, want ginger`);
      assert(o[1] !== '', '--fur is empty');
    },
  },
  {
    name: 'seven coats in the picker',
    async run(ev) {
      const o = await ev(`(() => {
        if (activeModal) closeModal();
        openModal('theme');
        const cards = [...document.querySelectorAll('.theme-card')];
        return [cards.length, cards.every(c => c.querySelector('use[href="#cat-calm"]'))];
      })()`);
      assert(o[0] === 7, `${o[0]} theme cards, want 7`);
      assert(o[1], 'a coat tile has no calm cat');
    },
  },
  {
    name: 'coat sets the cat colours',
    async run(ev) {
      const o = await ev(`(() => {
        applyTheme('tuxedo');
        return [getComputedStyle(document.documentElement).getPropertyValue('--fur').trim(), THEMES.tuxedo.css['--fur']];
      })()`);
      assert(o[1] && o[0] === o[1], `--fur is "${o[0]}", want "${o[1]}"`);
    },
  },
  {
    name: 'fredoka is loaded',
    async run(ev) {
      const ok = await ev(`await document.fonts.load('600 16px Fredoka'), await document.fonts.ready, document.fonts.check('600 16px Fredoka') && [...document.fonts].some(f => f.family.replace(/['"]/g,'') === 'Fredoka' && f.weight === '600' && f.status === 'loaded')`);
      assert(ok === true, 'Fredoka 600 not loaded');
    },
  },
  {
    name: 'ginger is warm cream',
    async run(ev) {
      const o = await ev(`[getComputedStyle(document.body).backgroundColor, THEMES.ginger.css['--page-bg'], (() => { const d = document.createElement('i'); d.style.color = THEMES.ginger.css['--page-bg']; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; })()]`);
      assert(o[1] !== '#f7f7f5', 'ginger --page-bg is still the cool white');
      assert(o[0] === o[2], `body background ${o[0]}, want ${o[2]}`);
    },
  },
  {
    name: 'storage is isolated between scenarios',
    async run(ev) {
      const o = await ev(`[localStorage.getItem('coldshoulder_theme'), document.body.dataset.theme]`);
      // the page itself writes its default theme on load, so storage holds null or 'ginger', never an earlier scenario's theme
      assert(o[0] === null || o[0] === 'ginger', `coldshoulder_theme leaked: ${o[0]}`);
      assert(o[1] === 'ginger', `body theme is ${o[1]}, want ginger`);
    },
  },
  {
    name: 'ctx.reload keeps storage',
    async run(ev, ctx) {
      await ev(`localStorage.setItem('cs_probe', 'kept')`);
      await ctx.reload();
      const v = await ev(`localStorage.getItem('cs_probe')`);
      assert(v === 'kept', `key lost across ctx.reload: ${v}`);
    },
  },
  {
    name: 'marking layers follow the variables',
    async run(ev) {
      // Layer elements live in the <symbol>s; computed style resolves :root variables there without rendering.
      const o = await ev(`(() => {
        const ids = ['cat-calm', 'cat-calm-s', 'cat-mad', 'cat-mad-s'], layers = ['bib', 'mask', 'patch', 'patch-2'];
        const fill = (id, l) => { const e = document.querySelector('#' + id + ' .layer-' + l); return e ? getComputedStyle(e).fill : 'MISSING'; };
        const defaults = [];
        for (const id of ids) for (const l of layers) defaults.push([id + ' ' + l, fill(id, l)]);
        const set = {};
        for (const l of layers) {
          document.documentElement.style.setProperty('--' + l, 'rgb(1, 2, 3)');
          set[l] = ids.map((id) => fill(id, l));
          document.documentElement.style.removeProperty('--' + l);
        }
        return { defaults, set };
      })()`);
      for (const [k, v] of o.defaults) assert(v === 'rgba(0, 0, 0, 0)', `default ${k} fill is ${v}`);
      for (const [l, arr] of Object.entries(o.set)) for (const v of arr) assert(v === 'rgb(1, 2, 3)', `--${l} gave fill ${v}`);
    },
  },
  {
    name: 'puffed cat on small cells',
    viewport: 'narrow',
    async run(ev) {
      await ev(`setDiff('hard'); requestNewGame();`);
      let ok = false;
      for (let i = 0; i < 60 && !ok; i++) {
        ok = await ev('N === 10 && regions.length === 10');
        if (!ok) await new Promise((r) => setTimeout(r, 250));
      }
      assert(ok, 'hard board never appeared');
      const o = await ev(`(() => {
        for (const r of [8, 9]) { onCellClick(r, solution[8]); onCellClick(r, solution[8]); }
        onCellClick(0, solution[0]); onCellClick(0, solution[0]);
        const g = document.getElementById('grid').children;
        return { px: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cell')),
          mad: [8, 9].map((r) => g[r * N + solution[8]].querySelector('use').getAttribute('href')) };
      })()`);
      assert(o.px < 30, `--cell is ${o.px}px, want < 30`);
      for (const h of o.mad) assert(h === '#cat-mad-s', `clash cat uses ${h}, want #cat-mad-s`);
      await ev('if (activeModal) closeModal()'); // first visit (clean storage) opens the help modal over the board
      await new Promise((r) => setTimeout(r, 1000));
    },
  },
  {
    name: 'sound map is complete',
    async run(ev) {
      const keys = await ev('Object.keys(SOUND_FILES).sort()');
      const want = ['clash', 'fail', 'hint', 'mark', 'place', 'redo', 'remove', 'sleep', 'undo', 'win'];
      assert(JSON.stringify(keys) === JSON.stringify(want), `SOUND_FILES keys: ${keys}`);
      await ev('await loadSounds()');
      const dec = await ev('Object.keys(_buffers).sort()');
      assert(JSON.stringify(dec) === JSON.stringify(want), `decoded sounds: ${dec}`);
      const st = await ev(`await Promise.all(Object.values(SOUND_FILES).map((u) => fetch(u).then((r) => r.status, (e) => String(e))))`);
      for (const s of st) assert(s === 200, `a sound file answered ${s}`);
    },
  },
  {
    name: 'missing sound file is silent',
    async run(ev) {
      // load failure without a 404 or a failed request (the network gate must stay strict): a URL fetch rejects before any request
      // decode failure: an undecodable data: URL
      const r = await ev(`SOUND_FILES.place = 'http://[bad';
        SOUND_FILES.mark = 'data:audio/mpeg;base64,AAAAAAAAAAAA';
        await loadSounds();
        playSound('place'); playSound('mark');
        'ok'`);
      assert(r === 'ok', `load/play failed: ${JSON.stringify(r)}`);
    },
  },
  {
    name: 'sound before first gesture is silent',
    async run(ev) {
      const n = await ev(`(() => { playSound('place'); return activeVoices(); })()`);
      assert(n === 0, `activeVoices ${n} before any gesture`);
    },
  },
  {
    name: 'rapid taps cap voices',
    async run(ev) {
      const n = await ev(`await loadSounds(); for (let i = 0; i < 50; i++) playSound('mark'); activeVoices()`);
      assert(n === 4, `activeVoices ${n}, want exactly 4 (0 means the clip never decoded)`);
    },
  },
  {
    name: 'mute persists',
    async run(ev, ctx) {
      await ev('toggleMute()');
      await ctx.reload();
      assert((await ev('isMuted()')) === true, 'mute lost on reload');
      const l = await ev(`document.getElementById('mute-btn').getAttribute('aria-label')`);
      assert(l === 'Unmute sounds', `mute button label: ${l}`);
    },
  },
  {
    name: 'share text is cat-themed',
    async run(ev) {
      const t = await ev('buildShareText()');
      assert(typeof t === 'string' && t.startsWith('🐱 Cold Shoulder · '), `share start: ${t}`);
      assert(t.endsWith('https://mostprovikki.github.io/cold-shoulder/'), `share end: ${t}`);
      assert(!/★|star/i.test(t), `share text has a star: ${t}`);
      assert(t.split('\n')[0].includes('· Kitten ·'), `random path lacks Kitten: ${t}`);
      const d = await ev(`playDaily('featured', 'medium', utcDateStr()); await new Promise(r => setTimeout(r, 1500)); buildShareText()`);
      const first = d.split('\n')[0];
      assert(first.includes('· Daily Nap ') && first.includes('· Tabby ·'), `featured daily line: ${first}`);
      assert(!/★|star/i.test(d), `daily share text has a star: ${d}`);
    },
  },
  {
    name: 'difficulty buttons use cat names',
    async run(ev) {
      const t = await ev(`['easy','medium','hard','extreme'].map(d => document.getElementById('btn-' + d).textContent.trim())`);
      assert(JSON.stringify(t) === JSON.stringify(['Kitten', 'Tabby', 'Alley Cat', 'Lion']), `buttons: ${JSON.stringify(t)}`);
    },
  },
  {
    name: 'toasts have no stars',
    async run(ev) {
      const msgs = await ev(`(() => { window.__rec = []; window.__orig = showToast;
        showToast = (m, ...a) => { __rec.push(String(m)); return __orig(m, ...a); };
        onCellClick(0, 0); onCellClick(0, 0); onCellClick(0, 1); onCellClick(0, 1);
        giveHint(); clearBoard(); giveHint(); shareResult(); return 1; })()`);
      await ev('await new Promise(r => setTimeout(r, 50)); 1');
      const rec = await ev('showToast = __orig; __rec');
      assert(msgs === 1, 'setup failed');
      assert(rec.some(m => /wrong box/.test(m)), `no wrong-box toast: ${JSON.stringify(rec)}`);
      assert(rec.some(m => /no cat fits/.test(m)), `no rule-out toast: ${JSON.stringify(rec)}`);
      assert(rec.some(m => /Copied/.test(m)), `no share toast: ${JSON.stringify(rec)}`);
      const bad = rec.filter(m => /★|\bstars?\b/i.test(m));
      assert(bad.length === 0, `toasts with stars: ${JSON.stringify(bad)}`);
    },
  },
  {
    name: 'clash bubble comes and goes',
    async run(ev) {
      await ev('if (activeModal) closeModal(); 1');
      await ev('onCellClick(0, solution[0]); onCellClick(0, solution[0]); onCellClick(1, solution[0]); onCellClick(1, solution[0]); 1');
      const on = await ev(`[...document.querySelectorAll('#grid-wrap .clash-bubble')].map(b => b.textContent)`);
      assert(on.length === 1 && on[0] === 'HSSS!', `bubble on clash: ${JSON.stringify(on)}`);
      const st = await ev(`(() => { const cs = getComputedStyle(document.querySelector('.clash-bubble')); return [cs.backgroundColor, cs.color]; })()`);
      assert(st[0] !== 'rgba(0, 0, 0, 0)' && st[0] !== st[1], `bubble fill: ${JSON.stringify(st)}`);
      await ev('onCellClick(1, solution[0]); 1');
      const off = await ev(`document.querySelectorAll('#grid-wrap .clash-bubble').length`);
      assert(off === 0, `bubble after clash gone: ${off}`);
    },
  },
  {
    name: 'win shows napping cats',
    async run(ev) {
      await ev('if (activeModal) closeModal(); 1');
      await ev('for (let r = 0; r < N; r++) { onCellClick(r, solution[r]); onCellClick(r, solution[r]); } 1');
      await ev('await new Promise(r => setTimeout(r, 1300)); 1');
      assert(await ev('won') === true, 'won not set');
      assert(await ev(`getComputedStyle(document.getElementById('modal-win')).display !== 'none' && !!document.getElementById('modal-win').offsetParent`), 'win modal not visible');
      const z = await ev(`document.querySelectorAll('.cell .zzz').length`);
      assert(z >= 1, `no .zzz in cells: ${z}`);
    },
  },
  {
    name: 'reduced motion stops the shake',
    reducedMotion: true,
    async run(ev) {
      await ev('if (activeModal) closeModal(); 1');
      await ev('onCellClick(0, solution[0]); onCellClick(0, solution[0]); onCellClick(1, solution[0]); onCellClick(1, solution[0]); 1');
      const a = await ev(`(() => { const s = document.querySelector('.cell.wrong svg.cat'); return s ? getComputedStyle(s).animationName : 'MISSING'; })()`);
      assert(a === 'none', `animationName under reduced motion: ${a}`);
    },
  },
  {
    name: 'bubble survives a board size change',
    async run(ev) {
      await ev('if (activeModal) closeModal(); 1');
      await ev(`setDiff('hard'); requestNewGame(); for (let i = 0; i < 100 && N !== 10; i++) await new Promise(r => setTimeout(r, 100)); 1`);
      assert(await ev('N') === 10, 'N is not 10');
      await ev('if (activeModal) closeModal(); const c = solution[8]; onCellClick(8, c); onCellClick(8, c); onCellClick(9, c); onCellClick(9, c); 1');
      assert(await ev(`document.querySelectorAll('.clash-bubble').length`) === 1, 'no bubble on 10x10 clash');
      await ev(`setDiff('easy'); requestNewGame(); for (let i = 0; i < 100 && N !== 8; i++) await new Promise(r => setTimeout(r, 100)); 1`);
      await ev('if (activeModal) closeModal(); 1');
      assert(await ev('N') === 8, 'N is not 8');
      assert(await ev(`document.querySelectorAll('.clash-bubble').length`) === 0, 'stale bubble after size change');
      await ev('for (let r = 0; r < N; r++) { onCellClick(r, solution[r]); onCellClick(r, solution[r]); } 1');
      assert(await ev('won') === true, 'not won after size change');
    },
  },
  {
    name: 'bubble does not cover the partner',
    async run(ev) {
      await ev('if (activeModal) closeModal(); 1');
      await ev('const c = solution[0]; onCellClick(0, c); onCellClick(0, c); onCellClick(1, c); onCellClick(1, c); await new Promise(r => setTimeout(r, 400)); 1');
      const g = await ev(`(() => { const b = document.querySelector('.clash-bubble').getBoundingClientRect(); const p = document.getElementById('grid').children[solution[0]].getBoundingClientRect();
        return b.left < p.right && b.right > p.left && b.top < p.bottom && b.bottom > p.top; })()`);
      assert(g === false, 'bubble covers the partner cell');
    },
  },
  {
    name: 'bubble avoids the partner on edge rows',
    async run(ev) {
      await ev('if (activeModal) closeModal(); 1');
      const check = async (placed, partner) => {
        await ev(`clearBoard(); const c = 3; onCellClick(${partner}, c); onCellClick(${partner}, c); onCellClick(${placed}, c); onCellClick(${placed}, c); await new Promise(r => setTimeout(r, 400)); 1`);
        const g = await ev(`(() => { const b = document.querySelector('.clash-bubble'); if (!b) return null; const br = b.getBoundingClientRect(), w = document.getElementById('grid-wrap').getBoundingClientRect(), p = document.getElementById('grid').children[${partner} * N + 3].getBoundingClientRect();
          return { hit: br.left < p.right && br.right > p.left && br.top < p.bottom && br.bottom > p.top, inside: br.left >= w.left - 0.5 && br.right <= w.right + 0.5 && br.top >= w.top - 0.5 && br.bottom <= w.bottom + 0.5 }; })()`);
        assert(g, 'no bubble');
        assert(!g.hit, `bubble covers partner (placed row ${placed})`);
        assert(g.inside, `bubble outside the board (placed row ${placed})`);
      };
      await check(7, 6);
      await check(0, 1);
    },
  },
];

// ---- final-fix wave scenarios
const topBarFit = (viewport) => ({
  name: `top bar fits every coat at ${viewport}`,
  viewport,
  async run(ev) {
    await ev('if (activeModal) closeModal(); 1');
    const keys = await ev('Object.keys(THEMES)');
    const bad = [];
    for (const k of keys) {
      const m = await ev(`(() => {
        applyTheme(${JSON.stringify(k)});
        const brand = document.getElementById('brand');
        const w = document.createTreeWalker(brand, NodeFilter.SHOW_TEXT);
        let n, tn = null;
        while ((n = w.nextNode())) if (n.textContent.includes('Cold Shoulder')) tn = n;
        if (!tn) return { err: 'no brand text node' };
        const rg = document.createRange(); rg.selectNodeContents(tn);
        const lines = new Set([...rg.getClientRects()].map((r) => Math.round(r.top))).size;
        const right = rg.getBoundingClientRect().right;
        const actions = document.getElementById('top-actions').getBoundingClientRect();
        const d = document.documentElement;
        return { right, actionsLeft: actions.left, lines, actionsRight: actions.right, over: d.scrollWidth - d.clientWidth, vw: d.clientWidth };
      })()`);
      if (m.err) bad.push(`${k}: ${m.err}`);
      else {
        if (m.right > m.actionsLeft - 1) bad.push(`${k}: brand text right ${m.right.toFixed(1)} > actions left ${m.actionsLeft.toFixed(1)}`);
        if (m.lines !== 1) bad.push(`${k}: brand wraps to ${m.lines} lines`);
        if (m.over > 0) bad.push(`${k}: page ${m.over}px wider than screen`);
        if (m.actionsRight > m.vw) bad.push(`${k}: buttons run off-screen`);
      }
    }
    assert(!bad.length, bad.join(' | '));
  },
});

const dragScenario = (name, erase) => ({
  name,
  async run(ev) {
    await ev('if (activeModal) closeModal(); 1');
    // cells (0,0)..(0,3); never touch solution cells (cats are not involved, only markers)
    const setup = erase ? 'for (let c = 0; c < 4; c++) { board[0][c] = 2; } renderBoard(); 1' : '1';
    await ev(setup);
    await ev(`window.__drag = null; (async () => {
      const g = document.getElementById('grid').children;
      const mid = (i) => { const b = g[i].getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
      const ptr = (type, el, [x, y]) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', buttons: 1 }));
      ptr('pointerdown', g[0], mid(0));
      for (let i = 1; i < 4; i++) { ptr('pointermove', document, mid(i)); await new Promise((r) => setTimeout(r, 20)); }
      const mid_paws = [0, 1, 2, 3].map((i) => g[i].querySelectorAll('svg.paw').length);
      ptr('pointerup', document, mid(3));
      const end_paws = [0, 1, 2, 3].map((i) => g[i].querySelectorAll('svg.paw').length);
      window.__drag = { mid_paws, end_paws };
    })(); 1`);
    await ev('await new Promise((r) => setTimeout(r, 200)); 1');
    const res = await ev('window.__drag');
    const o = typeof res === "string" ? JSON.parse(res) : res;
    const want = erase ? [0, 0, 0, 0] : [1, 1, 1, 1];
    assert(JSON.stringify(o.mid_paws) === JSON.stringify(want), `paws before pointerup: ${JSON.stringify(o.mid_paws)}, want ${JSON.stringify(want)} (after: ${JSON.stringify(o.end_paws)})`);
  },
});

export const extra = [
  topBarFit('narrow'),
  topBarFit('phone'),
  topBarFit('phone375'),
  dragScenario('drag marks show paws live', false),
  dragScenario('drag erase removes paws live', true),
  {
    name: 'no undo or redo after a win',
    async run(ev) {
      await ev('if (activeModal) closeModal(); 1');
      const wins = `(() => { const s = JSON.parse(localStorage.getItem('coldshoulder_stats') || '{"perDiff":{}}'); return Object.values(s.perDiff).reduce((a, d) => a + d.won, 0); })()`;
      await ev('for (let r = 0; r < N; r++) { onCellClick(r, solution[r]); onCellClick(r, solution[r]); } 1');
      await ev('await new Promise(r => setTimeout(r, 300)); if (activeModal) closeModal(); 1');
      assert(await ev('won') === true, 'not won');
      const before = await ev('JSON.stringify(board)');
      assert(await ev(wins) === 1, 'win count not 1 after win');
      assert(await ev(`document.getElementById('undo-btn').disabled`) === true, 'undo button enabled after win');
      assert(await ev(`document.getElementById('redo-btn').disabled`) === true, 'redo button enabled after win');
      await ev('undo(); undo(); redo(); redo(); document.getElementById("undo-btn").click(); document.getElementById("redo-btn").click(); 1');
      assert(await ev('JSON.stringify(board)') === before, 'board changed by undo/redo after win');
      assert(await ev('won') === true, 'won cleared');
      assert(await ev(wins) === 1, 'win count changed');
    },
  },
  {
    name: 'clash bubble hides while paused',
    async run(ev) {
      await ev('if (activeModal) closeModal(); 1');
      await ev('onCellClick(0, solution[0]); onCellClick(0, solution[0]); onCellClick(1, solution[0]); onCellClick(1, solution[0]); 1');
      const disp = () => ev(`getComputedStyle(document.querySelector('.clash-bubble')).display`);
      assert(await disp() !== 'none', 'bubble hidden before pause');
      await ev('togglePause(); 1');
      assert(await disp() === 'none', 'bubble shows through the pause cover');
      await ev('togglePause(); 1');
      assert(await disp() !== 'none', 'bubble not back after resume');
      await ev(`document.getElementById('grid-wrap').classList.add('generating'); 1`);
      assert(await disp() === 'none', 'bubble shows through the generating overlay');
      await ev(`document.getElementById('grid-wrap').classList.remove('generating'); 1`);
    },
  },
];

const sleepWin = `if (activeModal) closeModal(); await loadSounds(); SLEEP_DELAY_MS = 50;
  for (let r = 0; r < N; r++) { onCellClick(r, solution[r]); onCellClick(r, solution[r]); }`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepStop = (name, action) => ({
  name: `sleep loop stops ${name}`,
  async run(ev) {
    await ev(sleepWin);
    await wait(300);
    assert(await ev('sleepLoopActive()') === true, 'loop did not start');
    await ev(action);
    await wait(1000);
    assert(await ev('sleepLoopActive()') === false, 'loop still active');
  },
});
const sleepScenarios = [
  {
    name: 'sleep loop starts after a win',
    async run(ev) {
      await ev(sleepWin);
      await wait(300);
      assert(await ev('sleepLoopActive()') === true, 'loop not active after win');
      assert(await ev('!_voices.includes(_sleep.src) && activeVoices() <= MAX_VOICES') === true, 'loop counted as a voice');
    },
  },
  sleepStop('on a new board', 'newGame()'),
  sleepStop('on clear', 'clearBoard()'),
  sleepStop('on mute', 'toggleMute()'),
  {
    name: 'sleep loop stops when the tab is hidden',
    async run(ev) {
      await ev(sleepWin);
      await wait(300);
      assert(await ev('sleepLoopActive()') === true, 'loop not active');
      await ev(`Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'))`);
      await wait(1000);
      assert(await ev('sleepLoopActive()') === false, 'still active when hidden');
      await ev(`Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'))`);
      await wait(400);
      assert(await ev('sleepLoopActive()') === false, 'restarted on visible');
    },
  },
  {
    name: 'sleep loop never starts muted',
    async run(ev) {
      await ev(`if (activeModal) closeModal(); await loadSounds(); toggleMute();`);
      await ev(sleepWin);
      await wait(300);
      assert(await ev('sleepLoopActive()') === false, 'started while muted');
    },
  },
  {
    name: 'sleep loop stops by itself',
    async run(ev) {
      await ev('SLEEP_MAX_MS = 300');
      await ev(sleepWin);
      await wait(1200);
      assert(await ev('sleepLoopActive()') === false, 'still active after max');
    },
  },
  {
    name: 'sleep loop is single',
    async run(ev) {
      await ev('if (activeModal) closeModal(); await loadSounds(); startSleepLoop(); startSleepLoop();');
      assert(await ev('sleepLoopActive()') === true, 'not active');
      assert(await ev('_sleepStarted') === 1, 'more than one loop node created');
    },
  },
];

export default [...base, ...extra, ...sleepScenarios];
