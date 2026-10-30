'use strict';
const assert = require('assert');
const E = require('../src/engine.js');

// ── PRNG ─────────────────────────────────────────────────────────────────────
{
  const a = E.makeRng('seed-1'), b = E.makeRng('seed-1'), c = E.makeRng('seed-2');
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  assert.deepStrictEqual(sa, sb, 'same seed same stream');
  assert.notDeepStrictEqual(sa, sc, 'diff seed diff stream');
  sa.forEach(v => assert.ok(v >= 0 && v < 1));
  const r = E.makeRng('x');
  const arr = E.rngShuffle(r, [1, 2, 3, 4, 5]);
  assert.strictEqual(arr.length, 5);
  assert.deepStrictEqual([...arr].sort(), [1, 2, 3, 4, 5]);
}
console.log('PRNG ok');

// ── placeStars ───────────────────────────────────────────────────────────────
{
  for (const n of [8, 10, 12]) {
    const sol = E.placeStars(n, E.makeRng('stars-' + n));
    assert.strictEqual(sol.length, n);
    assert.strictEqual(new Set(sol).size, n, 'cols unique');
    for (let r = 1; r < n; r++) assert.ok(Math.abs(sol[r] - sol[r - 1]) > 1, 'no adjacency');
  }
}
console.log('placeStars ok');

// ── growRegions ──────────────────────────────────────────────────────────────
function checkRegions(n, reg, stars) {
  const cells = E.regionCellsOf(n, reg);
  assert.strictEqual(cells.length, n, 'n regions');
  let total = 0;
  cells.forEach((cs, i) => {
    total += cs.length;
    assert.ok(cs.length >= 1, 'region ' + i + ' nonempty');
    const set = new Set(cs.map(([r, c]) => r * n + c));
    const seen = new Set([cs[0][0] * n + cs[0][1]]);
    const q = [cs[0]];
    while (q.length) {
      const [r, c] = q.pop();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc, k = nr * n + nc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n && set.has(k) && !seen.has(k)) { seen.add(k); q.push([nr, nc]); }
      }
    }
    assert.strictEqual(seen.size, cs.length, 'region ' + i + ' contiguous');
  });
  assert.strictEqual(total, n * n, 'full partition');
  stars.forEach((col, row) => assert.strictEqual(reg[row][col], row, 'region i holds star i'));
}
{
  for (const d of ['easy', 'medium', 'hard', 'extreme']) {
    const cfg = E.DIFF[d];
    const rng = E.makeRng('grow-' + d);
    const stars = E.placeStars(cfg.n, rng);
    const reg = E.growRegions(cfg.n, stars, rng, cfg);
    checkRegions(cfg.n, reg, stars);
  }
}
console.log('growRegions ok');

// ── uniqueness ───────────────────────────────────────────────────────────────
{
  let uniqueMade = 0;
  for (const d of ['easy', 'medium', 'hard', 'extreme']) {
    const cfg = E.DIFF[d];
    const rng = E.makeRng('uniq-' + d);
    const stars = E.placeStars(cfg.n, rng);
    let reg = E.growRegions(cfg.n, stars, rng, cfg);
    reg = E.shrinkPins(cfg.n, reg, stars, rng, cfg.pins);
    reg = E.makeUnique(cfg.n, reg, stars, rng, cfg.maxRounds);
    if (reg) {
      uniqueMade++;
      assert.strictEqual(E.countSolutions(cfg.n, reg, 2), 1, d + ' unique');
      checkRegions(cfg.n, reg, stars);
    }
  }
  assert.ok(uniqueMade >= 1, 'at least one difficulty produced a unique puzzle');
}
console.log('uniqueness ok');

// ── grader ───────────────────────────────────────────────────────────────────
{
  for (const d of ['easy', 'medium']) {
    const cfg = E.DIFF[d];
    for (let i = 0; i < 5; i++) {
      const rng = E.makeRng('grade-' + d + '-' + i);
      const stars = E.placeStars(cfg.n, rng);
      let reg = E.growRegions(cfg.n, stars, rng, cfg);
      reg = E.shrinkPins(cfg.n, reg, stars, rng, cfg.pins);
      reg = E.makeUnique(cfg.n, reg, stars, rng, cfg.maxRounds);
      if (!reg) continue;
      const g = E.logicSolve(cfg.n, reg);
      assert.ok(typeof g.solved === 'boolean');
      if (g.solved) assert.ok(g.maxTier >= 1 && g.maxTier <= 3, 'tier in range');
    }
  }
  assert.strictEqual(E.gradeFits({ solved: true, maxTier: 1, t3: 0 }, 'easy'), true);
  assert.strictEqual(E.gradeFits({ solved: true, maxTier: 2, t3: 0 }, 'easy'), true);
  assert.strictEqual(E.gradeFits({ solved: true, maxTier: 3, t3: 1 }, 'easy'), false);
  assert.strictEqual(E.gradeFits({ solved: true, maxTier: 3, t3: 2 }, 'medium'), true);
  assert.strictEqual(E.gradeFits({ solved: true, maxTier: 3, t3: 3 }, 'hard'), true);
  assert.strictEqual(E.gradeFits({ solved: true, maxTier: 3, t3: 5 }, 'hard'), false);
  assert.strictEqual(E.gradeFits({ solved: true, maxTier: 3, t3: 4 }, 'extreme'), true);
  assert.strictEqual(E.gradeFits({ solved: true, maxTier: 3, t3: 3 }, 'extreme'), false);
  assert.strictEqual(E.gradeFits({ solved: false, maxTier: 3, t3: 9 }, 'extreme'), false);
  assert.ok(E.fitScore({ solved: true, maxTier: 2, t3: 0 }, 'easy') < E.fitScore({ solved: true, maxTier: 3, t3: 2 }, 'easy'));
}
console.log('grader ok');

// ── generatePuzzle ───────────────────────────────────────────────────────────
{
  const p1 = E.generatePuzzle('coldshoulder-daily-2026-07-11-medium', 'medium');
  const p2 = E.generatePuzzle('coldshoulder-daily-2026-07-11-medium', 'medium');
  assert.ok(p1 && p2, 'daily generated');
  assert.deepStrictEqual(p1.regions, p2.regions, 'daily deterministic');
  assert.deepStrictEqual(p1.solution, p2.solution);

  for (const d of ['easy', 'medium', 'hard', 'extreme']) {
    for (let s = 0; s < 3; s++) {
      const t0 = Date.now();
      const p = E.generatePuzzle('test-' + d + '-' + s, d);
      const ms = Date.now() - t0;
      assert.ok(p, d + ' seed ' + s + ' generated');
      assert.ok(ms < 5000, d + ' too slow: ' + ms + 'ms');
      assert.strictEqual(E.countSolutions(p.n, p.regions, 2), 1, d + ' unique');
      assert.ok(p.grade.solved, d + ' logic-solvable, no guessing');
      checkRegions(p.n, p.regions, p.solution);
      assert.strictEqual(new Set(p.solution).size, p.n);
      for (let r = 1; r < p.n; r++) assert.ok(Math.abs(p.solution[r] - p.solution[r - 1]) > 1);
    }
  }
  assert.strictEqual(E.dailySeed('2026-07-11', 'featured'), 'coldshoulder-daily-2026-07-11-featured');
  assert.match(E.utcDateStr(new Date()), /^\d{4}-\d{2}-\d{2}$/);
}
console.log('generatePuzzle ok');
console.log('ALL TESTS PASSED');
