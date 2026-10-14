// The casino: one big floor in eight rooms. Sim px, 60 px = 1 m; x runs east, y runs south.
import { CFG } from './config.js';
import { clamp, dist } from './util.js';

export const W = 3000, H = 1900;
export const ROOMS = {
  bar: { x: 20, y: 20, w: 600, h: 680, name: 'the bar' },
  rest: { x: 20, y: 720, w: 600, h: 460, name: 'the restrooms' },
  floor: { x: 640, y: 20, w: 1360, h: 1160, name: 'the casino floor' },
  arcade: { x: 2020, y: 20, w: 960, h: 680, name: 'the arcade' },
  race: { x: 2020, y: 720, w: 960, h: 460, name: 'the duck pond' },
  slots: { x: 20, y: 1200, w: 980, h: 680, name: 'the slot hall' },
  alley: { x: 1020, y: 1200, w: 980, h: 680, name: 'the back alley' },
  vip: { x: 2020, y: 1200, w: 960, h: 680, name: 'the VIP lounge' },
};

// Walls with door gaps. hw: a horizontal wall at y from x0 to x1; vw: a vertical wall at x from y0 to y1.
const T = 20, GAPS = [];
function hw(y, x0, x1, gaps = []) {
  const out = []; let x = x0;
  for (const [a, b] of gaps) { if (a > x) out.push({ x, y, w: a - x, h: T }); GAPS.push({ x: a, y, w: b - a, h: T }); x = b; }
  if (x1 > x) out.push({ x, y, w: x1 - x, h: T });
  return out;
}
function vw(x, y0, y1, gaps = []) {
  const out = []; let y = y0;
  for (const [a, b] of gaps) { if (a > y) out.push({ x, y, w: T, h: a - y }); GAPS.push({ x, y: a, w: T, h: b - a }); y = b; }
  if (y1 > y) out.push({ x, y, w: T, h: y1 - y });
  return out;
}
// The stall partitions stand inside a room, so the door routing never sees them; detour() steers round them.
const STALLS = [260, 380, 500].map(x => ({ x, y: 1060, w: 10, h: 120 }));
export const WALLS = [
  { x: 0, y: 0, w: W, h: T }, { x: 0, y: H - T, w: W, h: T }, { x: 0, y: 0, w: T, h: H }, { x: W - T, y: 0, w: T, h: H },
  ...vw(620, 20, 1180, [[300, 420], [900, 1020]]),     // bar | floor, restrooms | floor
  ...vw(2000, 20, 1180, [[300, 420], [900, 1020]]),    // floor | arcade, floor | duck pond
  ...hw(700, 20, 620, [[260, 380]]),                    // bar / restrooms
  ...hw(700, 2020, 2980, [[2440, 2560]]),               // arcade / duck pond
  ...hw(1180, 20, 2980, [[760, 880], [1240, 1400], [2440, 2560]]), // the long wall: floor to slots and alley, pond to VIP
  ...vw(1000, 1200, 1880, [[1480, 1600]]),              // slots | alley
  ...vw(2000, 1200, 1880, [[1480, 1600]]),              // alley | VIP
  ...STALLS, // restroom stalls
];
export const DOOR_GAPS = GAPS;
export const DOORS = [
  ['bar', 'floor', 590, 360, 670, 360], ['rest', 'floor', 590, 960, 670, 960], ['bar', 'rest', 320, 670, 320, 750],
  ['floor', 'arcade', 1970, 360, 2050, 360], ['floor', 'race', 1970, 960, 2050, 960], ['arcade', 'race', 2500, 670, 2500, 750],
  ['floor', 'slots', 820, 1150, 820, 1230], ['floor', 'alley', 1320, 1150, 1320, 1230], ['race', 'vip', 2500, 1150, 2500, 1230],
  ['slots', 'alley', 970, 1540, 1050, 1540], ['alley', 'vip', 1970, 1540, 2050, 1540],
].map(([a, b, ax, ay, bx, by]) => ({ a, b, pa: { x: ax, y: ay }, pb: { x: bx, y: by } }));

// ---------- Furniture ----------
export const BJ_TABLES = [{ x: 960, y: 230 }, { x: 1680, y: 230 }];          // flat edge north at y, felt curves south
export const RL_TABLE = { x: 1170, y: 860, w: 300, h: 120 };                  // wheel at the east end
export const CRASH_SCREEN = { x0: 2240, x1: 2760 };                          // on the arcade's north wall
export const PLINKO_YS = [260, 380, 500];                                    // cabinets on the arcade's east wall
export const MINES_XS = [2100, 2210, 2320], TOWER_XS = [2660, 2770, 2880];  // consoles on the arcade's south wall
export const POND = { x: 2140, y: 900, w: 780, h: 170 };                     // the duck race channel, ducks swim east
export const RACE_XS = [2180, 2290, 2400, 2600, 2710, 2820];                // betting desks along the north side
export const SLOT_WEST_YS = [1300, 1410, 1520, 1630, 1740];                  // penny machines on the slot hall's west wall
export const SLOT_SOUTH_XS = [380, 500, 620, 740, 860];                      // south wall: one penny, four high limit
export const JACKPOT = { x: 520, y: 1460 };                                  // the progressive jackpot tower
export const DICE_TABLE = { x: 1120, y: 1440, w: 320, h: 150 };
export const WHEEL_X = 1700;                                                 // the prize wheel on the alley's south wall
export const COIN = { x: 1855, y: 1335 };
export const COFFEE = { x: 2400, y: 1505, w: 160, h: 70 };
export const SECURITY = { x: 650, y: 560, w: 50, h: 130 };                  // the security desk: camera monitors on the floor's west wall

export const OBSTACLES = [
  { x: 60, y: 60, w: 400, h: 50, kind: 'counter' },
  ...[[150, 420], [420, 470], [200, 600]].map(([x, y]) => ({ x: x - 22, y: y - 22, w: 44, h: 44, kind: 'hightop' })),
  { x: 30, y: 780, w: 40, h: 260, kind: 'sinks' },
  ...BJ_TABLES.map(t => ({ x: t.x - 120, y: t.y, w: 240, h: 100, kind: 'bj' })),
  { ...RL_TABLE, kind: 'roulette' },
  ...[0, 1, 2, 3].map(i => ({ x: 2320 + i * 120 - 25, y: 196, w: 50, h: 26, kind: 'crashDesk' })),
  ...PLINKO_YS.map(y => ({ x: 2900, y: y - 45, w: 80, h: 90, kind: 'plinko' })),
  ...MINES_XS.map(x => ({ x: x - 25, y: 652, w: 50, h: 48, kind: 'mines' })),
  ...TOWER_XS.map(x => ({ x: x - 25, y: 652, w: 50, h: 48, kind: 'tower' })),
  { ...POND, kind: 'pond' },
  ...RACE_XS.map(x => ({ x: x - 35, y: 838, w: 70, h: 22, kind: 'desk' })),
  ...SLOT_WEST_YS.map(y => ({ x: 25, y: y - 26, w: 40, h: 52, kind: 'slot' })),
  ...SLOT_SOUTH_XS.map(x => ({ x: x - 26, y: 1835, w: 52, h: 40, kind: 'slot' })),
  { x: JACKPOT.x - 40, y: JACKPOT.y - 40, w: 80, h: 80, kind: 'jackpot' },
  { ...DICE_TABLE, kind: 'dice' },
  ...[WHEEL_X - 60, WHEEL_X + 60].map(x => ({ x: x - 20, y: 1800, w: 40, h: 30, kind: 'wheelDesk' })),
  { x: WHEEL_X - 100, y: 1855, w: 200, h: 25, kind: 'wheel' },
  { x: COIN.x - 45, y: COIN.y - 45, w: 90, h: 90, kind: 'coin' },
  { ...COFFEE, kind: 'coffee' },
  { ...SECURITY, kind: 'security' },
  { x: 2090, y: 1830, w: 220, h: 40, kind: 'couch' }, { x: 2690, y: 1830, w: 220, h: 40, kind: 'couch' },
  // dressing that you walk around: bar booths and a jukebox, a slot-hall ottoman, a VIP pool table, champagne and piano
  { x: 30, y: 230, w: 80, h: 110, kind: 'booth' }, { x: 30, y: 470, w: 80, h: 110, kind: 'booth' }, { x: 540, y: 655, w: 50, h: 40, kind: 'jukebox' },
  { x: 710, y: 1540, w: 100, h: 100, kind: 'ottoman' },
  { x: 2110, y: 1290, w: 150, h: 80, kind: 'pool' }, { x: 2745, y: 1270, w: 56, h: 56, kind: 'champagne' }, { x: 2785, y: 1748, w: 90, h: 64, kind: 'piano' },
];

export const CHANDELIERS = [
  [960, 330], [1680, 330], [1320, 600], [1320, 920], [860, 780], [1780, 780],
  [320, 330], [320, 950], [2300, 380], [2700, 380], [2500, 1060], [300, 1450], [700, 1650], [2500, 1540],
];
export const PLANTS = [[760, 1590], [660, 40], [1980, 40], [660, 1160], [1980, 1160], [600, 40], [2040, 680], [2960, 680], [2040, 1860], [2960, 1220], [980, 1220], [40, 1860], [1980, 1860], [1040, 1860], [2960, 1860]];
export const TAP = { x: 260, y: 145 };
export const BELL = { x: 1320, y: 600 };
export const REST_SPOTS = [{ x: 110, y: 820 }, { x: 110, y: 980 }, { x: 320, y: 1120 }, { x: 440, y: 1120 }, { x: 560, y: 1120 }];
export const BOWL_SPOTS = [{ x: 530, y: 160 }, { x: 2900, y: 1300 }, { x: 2120, y: 140 }, { x: 1560, y: 1260 }];
export const GAME_NAMES = {
  bj: 'blackjack', roulette: 'roulette', race: 'the duck race', vip: 'the VIP lounge', slots: 'the slots', crash: 'Crash',
  plinko: 'Plinko', mines: 'Mines', tower: 'Dragon Tower', coin: 'the coin flip', wheel: 'the prize wheel', dice: 'street dice', cams: 'the security desk',
};

export function makeSeats() {
  const seats = [];
  // drink: the little stand behind the seat (opposite the way it faces)
  const add = (game, x, y, face, extra) => {
    const dx = -Math.cos(face) * 42, dy = -Math.sin(face) * 42;
    seats.push({ id: seats.length, game, x, y, face, drink: { x: x + dx, y: y + dy }, approach: { x: x + dx * 1.45, y: y + dy * 1.45 }, occ: null, claim: null, ...extra });
  };
  for (const [ti, t] of BJ_TABLES.entries()) for (const deg of [30, 60, 90, 120, 150]) {
    const a = deg * Math.PI / 180, x = t.x + Math.cos(a) * 168, y = t.y + Math.sin(a) * 152;
    add('bj', Math.round(x), Math.round(y), Math.atan2(t.y + 30 - y, t.x - x), { table: ti });
  }
  for (const x of [1210, 1290, 1370]) { add('roulette', x, RL_TABLE.y - 40, Math.PI / 2); add('roulette', x, RL_TABLE.y + RL_TABLE.h + 40, -Math.PI / 2); }
  SLOT_WEST_YS.forEach((y, i) => add('slots', 110, y, Math.PI, { tier: 'penny', machine: i }));
  SLOT_SOUTH_XS.forEach((x, i) => add('slots', x, 1790, Math.PI / 2, { tier: i === 0 ? 'penny' : 'high', machine: 5 + i }));
  RACE_XS.forEach(x => add('race', x, 800, Math.PI / 2));
  [0, 1, 2, 3].forEach(i => add('crash', 2320 + i * 120, 262, -Math.PI / 2));
  PLINKO_YS.forEach((y, i) => add('plinko', 2858, y, 0, { machine: i }));
  MINES_XS.forEach((x, i) => add('mines', x, 612, Math.PI / 2, { machine: i }));
  TOWER_XS.forEach((x, i) => add('tower', x, 612, Math.PI / 2, { machine: i }));
  [-60, 60].forEach((dx, i) => add('wheel', WHEEL_X + dx, 1762, Math.PI / 2, { machine: i }));
  for (const x of [1220, 1340]) { add('dice', x, DICE_TABLE.y - 40, Math.PI / 2); add('dice', x, DICE_TABLE.y + DICE_TABLE.h + 40, -Math.PI / 2); }
  for (const [x, y] of [[1780, 1430], [1930, 1430]]) add('coin', x, y, Math.atan2(COIN.y - y, COIN.x - x));
  add('cams', SECURITY.x + SECURITY.w + 38, SECURITY.y + SECURITY.h / 2, Math.PI);
  add('vip', COFFEE.x - 70, COFFEE.y + 35, 0); add('vip', COFFEE.x + COFFEE.w + 70, COFFEE.y + 35, Math.PI);
  add('vip', COFFEE.x + 80, COFFEE.y - 65, Math.PI / 2); add('vip', COFFEE.x + 80, COFFEE.y + COFFEE.h + 65, -Math.PI / 2);
  return seats;
}

// ---------- Geometry ----------
export function segRect(x1, y1, x2, y2, r) {
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
export function los(a, b) { for (const w of WALLS) if (segRect(a.x, a.y, b.x, b.y, w)) return false; return true; }
export const SOLIDS = WALLS.concat(OBSTACLES);
export function collide(c) {
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
export function roomOf(p) {
  for (const k in ROOMS) { const r = ROOMS[k]; if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return k; }
  for (const k in ROOMS) { const r = ROOMS[k]; if (p.x >= r.x - 30 && p.x <= r.x + r.w + 30 && p.y >= r.y - 30 && p.y <= r.y + r.h + 30) return k; }
  return 'floor';
}
// Shortest way through the doors (Dijkstra over door sides), then corner waypoints around furniture.
export function route(from, to) {
  const a = roomOf(from), b = roomOf(to);
  const pts = [];
  if (a !== b) {
    // nodes: each door side, keyed by the room it is in
    const nodes = [];
    DOORS.forEach((d, i) => { nodes.push({ room: d.a, p: d.pa, door: i, other: 1 }); nodes.push({ room: d.b, p: d.pb, door: i, other: 0 }); });
    const best = new Array(nodes.length).fill(Infinity), prev = new Array(nodes.length).fill(-1), done = new Array(nodes.length).fill(false);
    nodes.forEach((n, i) => { if (n.room === a) best[i] = dist(from, n.p); });
    let end = -1, endCost = Infinity;
    for (;;) {
      let u = -1; for (let i = 0; i < nodes.length; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
      if (u < 0) break; done[u] = true;
      const n = nodes[u];
      if (n.room === b && best[u] + dist(n.p, to) < endCost) { endCost = best[u] + dist(n.p, to); end = u; }
      const relax = (v, c) => { if (!done[v] && c < best[v]) { best[v] = c; prev[v] = u; } };
      const twin = n.door * 2 + n.other; relax(twin, best[u] + dist(n.p, nodes[twin].p)); // walk through the door
      nodes.forEach((m, v) => { if (v !== u && m.room === n.room && m.door !== n.door) relax(v, best[u] + dist(n.p, m.p)); });
    }
    for (let u = end; u >= 0; u = prev[u]) pts.unshift(nodes[u].p);
  }
  pts.push(to);
  return detour(from, pts.map(p => ({ x: p.x, y: p.y })));
}
const inflate = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const inside = (p, r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
const IN_ROOM = [...OBSTACLES, ...STALLS]; // what the detours steer round (the walls are handled by the doors)
// A character (CFG.radius) fits through: no furniture, stall or wall on the way.
const BLOCKS = [...IN_ROOM, ...WALLS].map(o => [o, inflate(o, CFG.radius)]);
// How close the segment a-b comes to rectangle r (0 when it crosses it): the nearest of its ends to r, or of r's corners
// to it, so a character cutting past a corner is measured round the corner, not against the inflated square.
function segGap(a, b, r) {
  if (segRect(a.x, a.y, b.x, b.y, r)) return 0;
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const toSeg = (x, y) => { const t = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)) : 0; return Math.hypot(a.x + t * dx - x, a.y + t * dy - y); };
  const toRect = p => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.w), Math.max(r.y - p.y, 0, p.y - r.y - r.h));
  return Math.min(toRect(a), toRect(b), toSeg(r.x, r.y), toSeg(r.x + r.w, r.y), toSeg(r.x + r.w, r.y + r.h), toSeg(r.x, r.y + r.h));
}
function free(a, b) { // a character's radius clear of everything, a pixel to spare over collide()
  for (const [o, q] of BLOCKS) if (segRect(a.x, a.y, b.x, b.y, q) && segGap(a, b, o) < CFG.radius) return false;
  return true;
}
// Where a character can stand: clear of furniture, stalls and walls by its radius.
export const standable = p => !IN_ROOM.some(o => inside(p, inflate(o, CFG.radius))) && !WALLS.some(w => inside(p, inflate(w, CFG.radius)));
// Somewhere to wander to: standable and a little room round it.
export const clearSpot = p => standable(p) && !IN_ROOM.some(o => inside(p, inflate(o, 30)));
export function openSpot(room, rnd = Math.random) {
  const r = (a, b) => a + rnd() * (b - a);
  for (let i = 0; i < 20; i++) { const p = { x: r(room.x + 60, room.x + room.w - 60), y: r(room.y + 160, room.y + room.h - 60) }; if (clearSpot(p)) return p; }
  // no luck: the clear point nearest the middle (the middle itself can be the pond or a table)
  const mid = { x: room.x + room.w / 2, y: room.y + room.h / 2 }; let best = null;
  for (let x = room.x + 60; x <= room.x + room.w - 60; x += 40) for (let y = room.y + 60; y <= room.y + room.h - 60; y += 40) {
    const p = { x, y }; if (clearSpot(p) && (!best || dist(p, mid) < dist(best, mid))) best = p;
  }
  return best || mid;
}
// The corners round every piece of furniture that a character can stand on, and which of them see each other
// (built once, on the first detour).
let CORNERS = null;
function corners() {
  if (CORNERS) return CORNERS;
  const pts = [];
  const roomy = p => ![...IN_ROOM, ...WALLS].some(o => inside(p, inflate(o, CFG.radius + 1)));
  for (const o of IN_ROOM) for (const [sx, sy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    // 10 px clear of the furniture, or 3 px where that is too close to something else (a counter by a wall)
    const p = [10, 3].map(m => { const q = inflate(o, CFG.radius + m); return { x: q.x + sx * q.w, y: q.y + sy * q.h }; }).find(roomy);
    if (p) pts.push(p);
  }
  const adj = pts.map(() => []);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    if (!free(pts[i], pts[j])) continue;
    const d = dist(pts[i], pts[j]); adj[i].push([j, d]); adj[j].push([i, d]);
  }
  return (CORNERS = { pts, adj });
}
// The shortest way from a to b round the furniture (Dijkstra over the corners); [b] when nothing is in the way or
// no way round exists.
function around(a, b) {
  if (free(a, b)) return [b];
  const { pts, adj } = corners(), n = pts.length, A = n, B = n + 1;
  const best = new Array(n + 2).fill(Infinity), prev = new Array(n + 2).fill(-1), done = new Array(n + 2).fill(false);
  const toB = pts.map(p => free(p, b));
  best[A] = 0;
  for (;;) {
    let u = -1; for (let i = 0; i < n + 2; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0 || u === B) break; done[u] = true;
    const relax = (v, c) => { if (!done[v] && c < best[v]) { best[v] = c; prev[v] = u; } };
    if (u === A) { for (let v = 0; v < n; v++) if (free(a, pts[v])) relax(v, dist(a, pts[v])); continue; }
    for (const [v, d] of adj[u]) relax(v, best[u] + d);
    if (toB[u]) relax(B, best[u] + dist(pts[u], b));
  }
  if (best[B] === Infinity) return [b];
  const out = [];
  for (let u = B; u !== A; u = prev[u]) out.unshift(u === B ? b : { x: pts[u].x, y: pts[u].y });
  return out;
}
function detour(from, pts) {
  const out = []; let cur = from;
  for (const p of pts) { out.push(...around(cur, p)); cur = p; }
  return out;
}
