// Original clipping oracle for visibility, voices and navigation. Run on ml350.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { segRect, los, SOLIDS, WALLS, ROOMS, DOORS, W, H } from '../src/map.js';
import { CFG } from '../src/config.js';
function originalSegment(x1, y1, x2, y2, r) {
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
let seed = 42; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const segments = [], rects = [...SOLIDS, ...SOLIDS.map(r => ({ x: r.x - CFG.radius, y: r.y - CFG.radius, w: r.w + CFG.radius * 2, h: r.h + CFG.radius * 2 }))];
for (let i = 0; i < 3000; i++) segments.push([rand() * W, rand() * H, rand() * W, rand() * H]);
for (const r of Object.values(ROOMS)) for (let i = 0; i < 500; i++) segments.push([r.x + rand() * r.w, r.y + rand() * r.h, r.x + rand() * r.w, r.y + rand() * r.h]);
for (const d of DOORS) segments.push([d.pa.x, d.pa.y, d.pb.x, d.pb.y]);
for (const r of SOLIDS.slice(0, 10)) rects.push({ ...r, w: 0 }, { ...r, h: 0 }, { ...r, w: 0, h: 0 });
let checks = 0, intersections = 0, visibilityChecks = 0;
const compare = (x1, y1, x2, y2, r) => { const expected = originalSegment(x1, y1, x2, y2, r); assert.equal(segRect(x1, y1, x2, y2, r), expected); checks++; if (expected) intersections++; };
for (const p of segments) for (const r of rects) { compare(...p, r); compare(p[2], p[3], p[0], p[1], r); }
for (const r of rects) for (const x of [r.x, r.x + r.w / 2, r.x + r.w]) for (const y of [r.y, r.y + r.h / 2, r.y + r.h]) for (const d of [-1, -1e-9, 0, 1e-9, 1]) {
  compare(x + d, y, x + d, y, r); compare(x + d, y - 100, x + d, y + 100, r); compare(x - 100, y + d, x + 100, y + d, r);
  compare(x + d, y + d, x, y, r); compare(x, y, x + d, y + d, r);
}
for (const p of segments) {
  const a = { x: p[0], y: p[1] }, b = { x: p[2], y: p[3] };
  const expected = WALLS.every(r => !originalSegment(...p, r)); assert.equal(los(a, b), expected); assert.equal(los(b, a), expected); visibilityChecks += 2;
}
const build = (fn, visit) => {
  let body = fn.toString();
  if (visit) { const needle = '  let t0 = 0, t1 = 1;'; assert.ok(body.includes(needle)); body = body.replace(needle, '  prepared();\n' + needle); }
  return new Function('prepared', 'return (' + body + ');')(visit);
};
let oldPreparations = 0, newPreparations = 0;
const oldCount = build(originalSegment, () => oldPreparations++), newCount = build(segRect, () => newPreparations++);
for (const p of segments) for (const r of SOLIDS) assert.equal(newCount(...p, r), oldCount(...p, r));
assert.ok(newPreparations < oldPreparations, 'distant segments skip full clipping preparation');
const report = { at: new Date().toISOString(), segments: segments.length, rectangles: rects.length, checks, intersections, visibilityChecks, oldPreparations, newPreparations };
if (process.argv.includes('--benchmark')) {
  const functions = { before: build(originalSegment), after: build(segRect) };
  const measure = fn => { const began = performance.now(); let hits = 0; for (const p of segments) for (const r of SOLIDS) if (fn(p[0], p[1], p[2], p[3], r)) hits++; return { ms: performance.now() - began, hits }; };
  measure(functions.before); measure(functions.after); report.timings = [];
  for (let i = 0; i < 11; i++) {
    const row = {}; for (const name of i % 2 ? ['after', 'before'] : ['before', 'after']) row[name] = measure(functions[name]);
    assert.equal(row.before.hits, row.after.hits); report.timings.push(row);
  }
  const median = a => a.sort((a, b) => a - b)[Math.floor(a.length / 2)]; report.medianMs = Object.fromEntries(['before', 'after'].map(k => [k, median(report.timings.map(r => r[k].ms))]));
}
const out = process.argv.find(a => a.endsWith('.json')) || 'shots/segment-check.json';
fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log('PASS: original segment/visibility results, including reversed paths, tangencies, degenerate segments/rectangles and navigation clearance.', JSON.stringify({ ...report, timings: undefined }));
