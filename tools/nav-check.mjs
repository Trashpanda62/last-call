// Headless pathing check: node tools/nav-check.mjs [pairs]
// Routes between random open points in every pair of rooms, plus every rest spot from every door, and fails when a
// leg of a route runs through a wall (los() is false between consecutive waypoints). Run it on the ml350.
import { ROOMS, REST_SPOTS, DOORS, OBSTACLES, WALLS, los, route } from '../src/map.js';

const N = +(process.argv[2] || 4000);
const near = (p, o, m) => p.x > o.x - m && p.x < o.x + o.w + m && p.y > o.y - m && p.y < o.y + o.h + m;
const clear = p => !OBSTACLES.some(o => near(p, o, 30)) && !WALLS.some(w => near(p, w, 20)); // where a character can stand
const rand = (a, b) => a + Math.random() * (b - a);
function spot(room) {
  for (;;) { const p = { x: rand(room.x + 60, room.x + room.w - 60), y: rand(room.y + 60, room.y + room.h - 60) }; if (clear(p)) return p; }
}
const bad = [];
function check(from, to, label) {
  const pts = [from, ...route(from, to)];
  for (let i = 1; i < pts.length; i++) if (!los(pts[i - 1], pts[i])) { bad.push(`${label}: (${Math.round(from.x)},${Math.round(from.y)}) -> (${Math.round(to.x)},${Math.round(to.y)}) leg ${i}`); return; }
}
const rooms = Object.values(ROOMS);
for (let i = 0; i < N; i++) { const a = rooms[i % rooms.length], b = rooms[Math.floor(Math.random() * rooms.length)]; check(spot(a), spot(b), 'random'); }
let fixed = 0;
for (const d of DOORS) for (const p of [d.pa, d.pb]) for (const r of REST_SPOTS) { check(p, r, 'rest spot'); fixed++; }
console.log(JSON.stringify({ routes: N + fixed, throughWalls: bad.length, first: bad.slice(0, 5) }));
process.exitCode = bad.length ? 1 : 0;
