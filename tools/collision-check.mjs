// Exact original circle/rectangle resolution, including sequential pushes.
// Run on ml350. Optional --benchmark measures isolated work, not game FPS.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { SOLIDS, W, H, collide } from '../src/map.js';
import { CFG } from '../src/config.js';
import { clamp } from '../src/util.js';
import { createGame } from '../src/sim.js';
function originalCollision(c) {
  const R = CFG.radius;
  for (const r of SOLIDS) {
    const nx = clamp(c.x, r.x, r.x + r.w), ny = clamp(c.y, r.y, r.y + r.h);
    const dx = c.x - nx, dy = c.y - ny, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) continue;
    if (d2 > 1e-4) { const d = Math.sqrt(d2); c.x += dx / d * (R - d); c.y += dy / d * (R - d); }
    else {
      const l = c.x - r.x, rr = r.x + r.w - c.x, t = c.y - r.y, b = r.y + r.h - c.y, m = Math.min(l, rr, t, b);
      if (m === l) c.x = r.x - R; else if (m === rr) c.x = r.x + r.w + R; else if (m === t) c.y = r.y - R; else c.y = r.y + r.h + R;
    }
  }
}
const points = [], offsets = [-CFG.radius - 1, -CFG.radius - 1e-9, -CFG.radius, -CFG.radius + 1e-9, -1e-9, 0, 1e-9, CFG.radius - 1e-9, CFG.radius, CFG.radius + 1e-9, CFG.radius + 1];
for (let y = -32; y <= H + 32; y += 8) for (let x = -32; x <= W + 32; x += 8) points.push([x, y]);
for (const r of SOLIDS) for (const x of [r.x, r.x + r.w / 2, r.x + r.w]) for (const y of [r.y, r.y + r.h / 2, r.y + r.h]) for (const dx of offsets) for (const dy of offsets) points.push([x + dx, y + dy]);
let checks = 0, displacedInputs = 0;
for (const [x, y] of points) {
  const a = { x, y }, b = { x, y };
  for (let i = 0; i < 3; i++) { originalCollision(a); collide(b); assert.equal(b.x, a.x); assert.equal(b.y, a.y); checks++; }
  if (a.x !== x || a.y !== y) displacedInputs++;
}
const trajectories = [], random = Math.random;
try {
  for (let seed of [42, 71]) {
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const game = createGame({ humans: [{ name: 'Collision audit', key: 'host' }], players: 32, killers: 2, forceRole: 'killer' });
    for (let tick = 0; tick < 3600; tick++) { game.tick(1 / 60); if (tick % 3 === 0) for (const c of game.G.chars) trajectories.push([c.x, c.y]); }
  }
} finally { Math.random = random; }
// Count real source operations without adding counters to production code.
// Build both functions with the same closures for a fair optional microbenchmark.
const build = (fn, limit = clamp) => new Function('CFG', 'clamp', 'SOLIDS', 'return (' + fn.toString() + ');')(CFG, limit, SOLIDS);
let oldClamps = 0, newClamps = 0;
const before = build(originalCollision, (...a) => { oldClamps++; return clamp(...a); }), after = build(collide, (...a) => { newClamps++; return clamp(...a); });
for (const [x, y] of trajectories) {
  const a = { x, y }, b = { x, y }, live = { x, y }; before(a); after(b); collide(live);
  assert.deepEqual(b, a); assert.deepEqual(live, a); checks++;
}
assert.ok(displacedInputs > 10000, 'the geometry fixture must actually resolve collisions');
assert.ok(newClamps < oldClamps, 'rejecting distant rectangles must reduce narrow collision work');
const report = { at: new Date().toISOString(), solids: SOLIDS.length, gridAndEdges: points.length, displacedInputs, trajectoryPoints: trajectories.length, checks, oldClamps, newClamps };
if (process.argv.includes('--benchmark')) {
  const functions = { before: build(originalCollision), after: build(collide) };
  const measure = fn => {
    const began = performance.now(); let checksum = 0;
    for (let k = 0; k < 3; k++) for (const [x, y] of trajectories) { const c = { x, y }; fn(c); checksum += c.x + c.y; }
    return { ms: performance.now() - began, checksum };
  };
  measure(functions.before); measure(functions.after); report.timings = [];
  for (let i = 0; i < 11; i++) {
    const row = {}; for (const name of i % 2 ? ['after', 'before'] : ['before', 'after']) row[name] = measure(functions[name]);
    assert.equal(row.before.checksum, row.after.checksum); report.timings.push(row);
  }
  const median = a => a.sort((a, b) => a - b)[Math.floor(a.length / 2)];
  report.medianMs = Object.fromEntries(['before', 'after'].map(k => [k, median(report.timings.map(r => r[k].ms))]));
}
const out = process.argv.find(a => a.endsWith('.json')) || 'shots/collision-check.json';
fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log('PASS: original collision resolution matches exactly across map grid/edges, repeated pushes and seeded 32-player positions.', JSON.stringify({ ...report, timings: undefined }));
