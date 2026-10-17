// Escape geometry is independent of the casino. Machine and seat coordinates are shared verbatim.
import {
  W,
  H,
  OBSTACLES,
  SLOT_BANKS,
  makeSeats,
  STAFF_DOORS,
  segRect,
} from "./map.js";
import { CFG } from "./config.js";
const seats = makeSeats();
const protect = [
  ...OBSTACLES.map((r) => ({
    x: r.x - 36,
    y: r.y - 36,
    w: r.w + 72,
    h: r.h + 72,
  })),
  ...seats.map((s) => ({ x: s.x - 65, y: s.y - 65, w: 130, h: 130 })),
  ...STAFF_DOORS.map((d) => ({ x: d.sx - 100, y: d.sy - 100, w: 200, h: 200 })),
  { x: 700, y: 280, w: 1240, h: 620 },
];
const overlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const BR_WALLS = [
  { x: 0, y: 0, w: W, h: 20 },
  { x: 0, y: H - 20, w: W, h: 20 },
  { x: 0, y: 0, w: 20, h: H },
  { x: W - 20, y: 0, w: 20, h: H },
];
// Staggered baffles: broad passages open around their ends, irregular sightlines between machines.
for (const [vertical, line, start, end] of [
  [1, 540, 140, 1080],
  [1, 1250, 40, 1120],
  [1, 1920, 100, 1100],
  [1, 2530, 180, 1100],
  [1, 1530, 1260, 1810],
  [0, 760, 70, 2890],
  [0, 1120, 160, 2880],
  [0, 1280, 140, 2880],
  [0, 1810, 700, 2880],
]) {
  let a = null;
  for (let t = start; t <= end + 20; t += 20) {
    const r = vertical
      ? { x: line, y: t, w: 20, h: 20 }
      : { x: t, y: line, w: 20, h: 20 };
    const blocked = t > end || protect.some((p) => overlap(r, p));
    if (!blocked && a === null) a = t;
    if (blocked && a !== null) {
      if (t - a >= 80)
        BR_WALLS.push(
          vertical
            ? { x: line, y: a, w: 20, h: t - a }
            : { x: a, y: line, w: t - a, h: 20 },
        );
      a = null;
    }
  }
}
export const BR_HIDES = [];
const bodySolids = [...BR_WALLS, ...OBSTACLES];
const gap = (p, r) =>
  Math.hypot(
    Math.max(r.x - p.x, 0, p.x - r.x - r.w),
    Math.max(r.y - p.y, 0, p.y - r.y - r.h),
  );
for (const [x, y] of [
  [740, 740],
  [1780, 740],
  [1880, 1080],
  [680, 1460],
  [1430, 1510],
  [2300, 1120],
  [2050, 1380],
  [510, 930],
  [300, 800],
  [2570, 1450],
  [1000, 520],
]) {
  const r = { x: x - 24, y: y - 44, w: 48, h: 36, kind: "br-locker" },
    at = { x, y: y + 24 };
  if (
    bodySolids.some(
      (b) =>
        overlap(
          { ...r, x: r.x - 18, y: r.y - 18, w: r.w + 36, h: r.h + 36 },
          b,
        ) || gap(at, b) < 30,
    ) ||
    seats.some((s) => Math.hypot(s.x - x, s.y - y) < 95)
  )
    continue;
  BR_HIDES.push({ id: BR_HIDES.length, x, y: y + 24, box: r });
  bodySolids.push(r);
}
export const BR_SOLIDS = bodySolids;
export function brClear(p, r = CFG.radius + 2) {
  return (
    p.x > r &&
    p.y > r &&
    p.x < W - r &&
    p.y < H - r &&
    !BR_SOLIDS.some((b) => gap(p, b) < r)
  );
}
const cover = new Set([
  "hightop",
  "booth",
  "jukebox",
  "crates",
  "ottoman",
  "pool",
  "champagne",
  "piano",
  "couch",
  "coffee",
  "slot",
  "plinko",
  "skee",
  "mines",
  "tower",
  "stack",
  "vault",
  "train",
  "pinball",
  "pop",
  "pusher",
  "claw",
  "flappy",
  "jackpot",
  "br-locker",
]);
const visionSolids = [
  ...BR_WALLS,
  ...SLOT_BANKS,
  ...BR_SOLIDS.filter((r) => cover.has(r.kind)),
];
export function brLos(a, b) {
  return !visionSolids.some((r) => segRect(a.x, a.y, b.x, b.y, r));
}
export function brCollide(c) {
  const R = CFG.radius;
  for (const r of BR_SOLIDS) {
    const nx = Math.max(r.x, Math.min(c.x, r.x + r.w)),
      ny = Math.max(r.y, Math.min(c.y, r.y + r.h)),
      dx = c.x - nx,
      dy = c.y - ny,
      d = Math.hypot(dx, dy);
    if (d >= R) continue;
    if (d > 0.001) {
      c.x += (dx / d) * (R - d);
      c.y += (dy / d) * (R - d);
    } else {
      const v = [c.x - r.x, r.x + r.w - c.x, c.y - r.y, r.y + r.h - c.y],
        i = v.indexOf(Math.min(...v));
      if (i === 0) c.x = r.x - R;
      if (i === 1) c.x = r.x + r.w + R;
      if (i === 2) c.y = r.y - R;
      if (i === 3) c.y = r.y + r.h + R;
    }
  }
}
const sweepRadius = CFG.radius - 0.01,
  sweepR2 = sweepRadius * sweepRadius;
const routeRects = BR_SOLIDS.map((r) => ({
  r,
  outer: {
    x: r.x - sweepRadius,
    y: r.y - sweepRadius,
    w: r.w + 2 * sweepRadius,
    h: r.h + 2 * sweepRadius,
  },
}));
// Analytic swept-circle clearance, including rounded furniture corners. No sampling gaps.
export function brSegment(a, b) {
  if (!brClear(a, sweepRadius) || !brClear(b, sweepRadius)) return false;
  const dx = b.x - a.x,
    dy = b.y - a.y,
    L = dx * dx + dy * dy;
  const point = (x, y) => {
    const t = L
      ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L))
      : 0;
    return (a.x + t * dx - x) ** 2 + (a.y + t * dy - y) ** 2;
  };
  return !routeRects.some(({ r, outer }) => {
    if (!segRect(a.x, a.y, b.x, b.y, outer)) return false;
    if (segRect(a.x, a.y, b.x, b.y, r)) return true;
    return (
      Math.min(
        gap(a, r) ** 2,
        gap(b, r) ** 2,
        point(r.x, r.y),
        point(r.x + r.w, r.y),
        point(r.x, r.y + r.h),
        point(r.x + r.w, r.y + r.h),
      ) < sweepR2
    );
  });
}
// A single reusable navigation graph, with exact standable endpoints and swept-radius smoothing.
let nodes, edges;
function graph() {
  if (nodes) return;
  nodes = [];
  const at = new Map();
  for (let y = 40; y < H; y += 40)
    for (let x = 40; x < W; x += 40)
      if (brClear({ x, y })) {
        at.set(x + "," + y, nodes.length);
        nodes.push({ x, y });
      }
  edges = nodes.map((p) => {
    const a = [];
    for (const [dx, dy] of [
      [40, 0],
      [-40, 0],
      [0, 40],
      [0, -40],
      [40, 40],
      [40, -40],
      [-40, 40],
      [-40, -40],
    ]) {
      const j = at.get(p.x + dx + "," + (p.y + dy));
      if (j !== undefined && brSegment(p, nodes[j])) a.push(j);
    }
    return a;
  });
}
export function brRoute(from, to) {
  if (!brClear(from, CFG.radius - 0.01) || !brClear(to, CFG.radius - 0.01))
    return [];
  if (brSegment(from, to)) return [{ ...to }];
  graph();
  const near = (p) =>
    nodes
      .map((n, i) => ({ i, d: Math.hypot(n.x - p.x, n.y - p.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 32)
      .find((n) => brSegment(p, nodes[n.i]))?.i;
  const a = near(from),
    b = near(to);
  if (a === undefined || b === undefined) return [];
  const cost = new Map([[a, 0]]),
    prev = new Map(),
    open = new Set([a]);
  let found = false;
  while (open.size) {
    let u,
      score = Infinity;
    for (const i of open) {
      const v =
        cost.get(i) +
        Math.hypot(nodes[i].x - nodes[b].x, nodes[i].y - nodes[b].y);
      if (v < score) {
        u = i;
        score = v;
      }
    }
    open.delete(u);
    if (u === b) {
      found = true;
      break;
    }
    for (const j of edges[u]) {
      const v =
        cost.get(u) +
        Math.hypot(nodes[j].x - nodes[u].x, nodes[j].y - nodes[u].y);
      if (v < (cost.get(j) ?? Infinity)) {
        cost.set(j, v);
        prev.set(j, u);
        open.add(j);
      }
    }
  }
  if (!found) return [];
  const raw = [{ ...to }];
  for (let i = b; i !== undefined; i = prev.get(i)) raw.unshift(nodes[i]);
  const out = [];
  let p = from;
  for (let i = 0; i < raw.length; ) {
    let j = raw.length - 1;
    while (j > i && !brSegment(p, raw[j])) j--;
    out.push({ ...raw[j] });
    p = raw[j];
    i = j + 1;
  }
  return out;
}
export function brOpen(r) {
  for (let i = 0; i < 200; i++) {
    const p = {
      x: r.x + 40 + Math.random() * (r.w - 80),
      y: r.y + 40 + Math.random() * (r.h - 80),
    };
    if (brClear(p)) return p;
  }
  return { x: 1320, y: 600 };
}
