import { CFG } from './config.js';
import { clamp, dist } from './util.js';

export const W = 1800, H = 1200;
export const ROOMS = {
  bar: { x: 20, y: 20, w: 500, h: 580, name: 'the bar', floor: '#3a281d' },
  rest: { x: 20, y: 620, w: 500, h: 560, name: 'the restrooms', floor: '#26343a' },
  floor: { x: 540, y: 20, w: 720, h: 1160, name: 'the casino floor', floor: '#4a1622' },
  race: { x: 1280, y: 20, w: 500, h: 570, name: 'the race lounge', floor: '#1d2742' },
  vip: { x: 1280, y: 610, w: 500, h: 570, name: 'the VIP lounge', floor: '#35203f' },
};
export const WALLS = [
  { x: 0, y: 0, w: W, h: 20 }, { x: 0, y: H - 20, w: W, h: 20 }, { x: 0, y: 0, w: 20, h: H }, { x: W - 20, y: 0, w: 20, h: H },
  { x: 20, y: 600, w: 200, h: 20 }, { x: 320, y: 600, w: 200, h: 20 },
  { x: 520, y: 20, w: 20, h: 230 }, { x: 520, y: 370, w: 20, h: 480 }, { x: 520, y: 970, w: 20, h: 210 },
  { x: 1260, y: 20, w: 20, h: 230 }, { x: 1260, y: 370, w: 20, h: 480 }, { x: 1260, y: 970, w: 20, h: 210 },
  { x: 1280, y: 590, w: 200, h: 20 }, { x: 1580, y: 590, w: 200, h: 20 },
  { x: 260, y: 1050, w: 10, h: 110 }, { x: 380, y: 1050, w: 10, h: 110 }, // restroom stalls
];
export const SLOT_YS = [480, 570, 660, 750];
export const OBSTACLES = [
  { x: 60, y: 60, w: 400, h: 50, kind: 'counter' },
  { x: 800, y: 280, w: 200, h: 80, kind: 'bj' },
  { x: 790, y: 800, w: 220, h: 100, kind: 'roulette' },
  { x: 30, y: 700, w: 40, h: 260, kind: 'sinks' },
  ...SLOT_YS.map(y => ({ x: 545, y: y - 26, w: 40, h: 52, kind: 'slot' })),
  { x: 1470, y: 690, w: 120, h: 50, kind: 'coffee' },
];
export const SOLIDS = WALLS.concat(OBSTACLES);
export const DOORS = [
  { a: 'bar', b: 'floor', pa: { x: 490, y: 310 }, pb: { x: 570, y: 310 } },
  { a: 'rest', b: 'floor', pa: { x: 490, y: 910 }, pb: { x: 570, y: 910 } },
  { a: 'bar', b: 'rest', pa: { x: 270, y: 570 }, pb: { x: 270, y: 650 } },
  { a: 'floor', b: 'race', pa: { x: 1230, y: 310 }, pb: { x: 1310, y: 310 } },
  { a: 'floor', b: 'vip', pa: { x: 1230, y: 910 }, pb: { x: 1310, y: 910 } },
  { a: 'race', b: 'vip', pa: { x: 1530, y: 560 }, pb: { x: 1530, y: 640 } },
];
export const TAP = { x: 260, y: 145 };
export const BELL = { x: 900, y: 590 };
export const REST_SPOTS = [{ x: 100, y: 760 }, { x: 100, y: 900 }, { x: 320, y: 1110 }, { x: 440, y: 1110 }, { x: 200, y: 1110 }];
export const BOWL_SPOTS = [{ x: 430, y: 132 }, { x: 1530, y: 760 }, { x: 1720, y: 470 }];
export const GAME_NAMES = { bj: 'blackjack', roulette: 'roulette', race: 'the races', vip: 'the VIP lounge', slots: 'the slots' };

export function makeSeats() {
  const seats = [];
  const add = (game, x, y, face, dx, dy) => seats.push({
    id: seats.length, game, x, y, face, drink: { x: x + dx, y: y + dy }, approach: { x: x + dx * 1.45, y: y + dy * 1.45 }, occ: null, claim: null,
  });
  [815, 875, 935, 995].forEach((x, i) => add('bj', x, i === 0 || i === 3 ? 392 : 402, -Math.PI / 2, 0, 42));
  [815, 875, 935, 995].forEach((x, i) => add('roulette', x, i === 0 || i === 3 ? 778 : 770, Math.PI / 2, 0, -42));
  [1360, 1460, 1560, 1660].forEach(x => add('race', x, 330, -Math.PI / 2, 0, 42));
  [1400, 1660].forEach(x => add('vip', x, 800, -Math.PI / 2, 0, 42));
  SLOT_YS.forEach(y => add('slots', 615, y, Math.PI, 42, 0));
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
export function route(from, to) {
  const a = roomOf(from), b = roomOf(to);
  const pts = [];
  if (a !== b) {
    const prev = { [a]: null }, q = [a];
    while (q.length) {
      const r = q.shift(); if (r === b) break;
      for (const d of DOORS) {
        const n = d.a === r ? d.b : d.b === r ? d.a : null;
        if (n && !(n in prev)) { prev[n] = { r, d }; q.push(n); }
      }
    }
    let cur = b;
    while (prev[cur]) { const { r, d } = prev[cur]; pts.unshift(...(d.a === r ? [d.pa, d.pb] : [d.pb, d.pa])); cur = r; }
  }
  pts.push(to);
  return detour(from, pts.map(p => ({ x: p.x, y: p.y })));
}
// Corner waypoints so straight legs never cut through a table, the counter or the slots.
const inflate = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
function blockedBy(a, b) { return OBSTACLES.find(o => segRect(a.x, a.y, b.x, b.y, inflate(o, CFG.radius - 1))) || null; }
function detour(from, pts) {
  const out = []; let cur = from;
  for (const p of pts) {
    for (let guard = 0; guard < 5; guard++) {
      const o = blockedBy(cur, p); if (!o) break;
      const r = inflate(o, CFG.radius + 10);
      const corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
      let best = null, bl = Infinity;
      for (const c of corners) {
        if (blockedBy(cur, c) === o) continue;
        const l = dist(cur, c) + dist(c, p) + (blockedBy(c, p) === o ? 1e4 : 0);
        if (l < bl) { bl = l; best = c; }
      }
      if (!best) break;
      out.push(best); cur = best;
    }
    out.push(p); cur = p;
  }
  return out;
}
