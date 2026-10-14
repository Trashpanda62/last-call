// Headless pathing check: node tools/nav-check.mjs [routes per room pair]
// Independent of the router's own geometry: every leg of a route is sampled every 3 px and must keep a character's
// radius clear of every wall, stall and piece of furniture, and every route is walked with the game's collide() and
// must arrive. Covers every ordered pair of rooms, every rest spot from every door, and openSpot() in every room.
// Run it on the ml350 (never Steve's PC).
import { ROOMS, REST_SPOTS, DOORS, SOLIDS, route, collide, openSpot } from '../src/map.js';
import { CFG } from '../src/config.js';

const K = +(process.argv[2] || 60);
const R = CFG.radius;
const gap = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));
const room = p => SOLIDS.every(r => gap(p, r) >= R + 1); // somewhere a character can stand
const rand = (a, b) => a + Math.random() * (b - a);
function spot(r) { for (;;) { const p = { x: rand(r.x + 20, r.x + r.w - 20), y: rand(r.y + 20, r.y + r.h - 20) }; if (room(p)) return p; } }

const fails = { tight: [], stuck: [], openSpot: [] };
let routes = 0, legs = 0;
const label = (a, b) => `(${Math.round(a.x)},${Math.round(a.y)}) -> (${Math.round(b.x)},${Math.round(b.y)})`;
function check(from, to) {
  routes++;
  const pts = [from, ...route(from, to)];
  for (let i = 1; i < pts.length; i++) {
    legs++;
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n };
      if (!SOLIDS.every(r => gap(p, r) >= R - 1)) { fails.tight.push(`${label(from, to)} leg ${i} at (${Math.round(p.x)},${Math.round(p.y)})`); return; }
    }
  }
  // walk it like a bot: 3 px a step, collide() after every step, at most 600 steps a waypoint
  const c = { x: from.x, y: from.y };
  for (const w of pts.slice(1)) {
    let steps = 0;
    while (Math.hypot(w.x - c.x, w.y - c.y) > 5) {
      const d = Math.hypot(w.x - c.x, w.y - c.y), s = Math.min(3, d);
      c.x += (w.x - c.x) / d * s; c.y += (w.y - c.y) / d * s; collide(c);
      if (++steps > 600) { fails.stuck.push(`${label(from, to)} stuck at (${Math.round(c.x)},${Math.round(c.y)}) heading for (${Math.round(w.x)},${Math.round(w.y)})`); return; }
    }
  }
}
const rooms = Object.values(ROOMS);
for (const a of rooms) for (const b of rooms) for (let i = 0; i < K; i++) check(spot(a), spot(b));
for (const d of DOORS) for (const p of [d.pa, d.pb]) for (const r of REST_SPOTS) check(p, r);
let spots = 0;
for (const [name, r] of Object.entries(ROOMS)) for (let i = 0; i < 200; i++) {
  const p = openSpot(r); spots++;
  if (!room(p)) { fails.openSpot.push(`${name} (${Math.round(p.x)},${Math.round(p.y)})`); continue; }
  const before = fails.tight.length + fails.stuck.length;
  check(DOORS.find(d => d.a === name) ? DOORS.find(d => d.a === name).pa : DOORS.find(d => d.b === name).pb, p);
  if (fails.tight.length + fails.stuck.length > before) fails.openSpot.push(`${name} (${Math.round(p.x)},${Math.round(p.y)}) unreachable from its door`);
}
const bad = fails.tight.length + fails.stuck.length + fails.openSpot.length;
console.log(JSON.stringify({ routes, legs, openSpots: spots, tight: fails.tight.length, stuck: fails.stuck.length, badOpenSpots: fails.openSpot.length,
  first: [...fails.tight.slice(0, 3), ...fails.stuck.slice(0, 3), ...fails.openSpot.slice(0, 3)] }));
process.exitCode = bad ? 1 : 0;
