// The casino: one big floor in seven rooms. Sim px, 60 px = 1 m; x runs east, y runs south.
import { CFG } from './config.js';
import { clamp, dist } from './util.js';

export const W = 3000, H = 1900;
export const ROOMS = {
  bar: { x: 20, y: 20, w: 600, h: 680, name: 'the bar' },
  rest: { x: 20, y: 720, w: 600, h: 460, name: 'the restrooms' },
  floor: { x: 640, y: 20, w: 1360, h: 1160, name: 'the casino floor' },
  arcade: { x: 2020, y: 20, w: 960, h: 680, name: 'the arcade' },
  race: { x: 2020, y: 720, w: 960, h: 460, name: 'the duck pond' },
  slots: { x: 20, y: 1200, w: 1580, h: 680, name: 'the slot hall' },
  vip: { x: 1620, y: 1200, w: 1360, h: 680, name: 'the VIP lounge' },
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
  ...hw(1180, 20, 2980, [[760, 880], [1680, 1800], [2440, 2560]]), // the long wall: floor to slots and VIP, pond to VIP
  ...vw(1600, 1200, 1880, [[1480, 1600]]),              // slots | VIP
  ...STALLS, // restroom stalls
];
export const DOOR_GAPS = GAPS;
export const DOORS = [
  ['bar', 'floor', 590, 360, 670, 360], ['rest', 'floor', 590, 960, 670, 960], ['bar', 'rest', 320, 670, 320, 750],
  ['floor', 'arcade', 1970, 360, 2050, 360], ['floor', 'race', 1970, 960, 2050, 960], ['arcade', 'race', 2500, 670, 2500, 750],
  ['floor', 'slots', 820, 1150, 820, 1230], ['floor', 'vip', 1740, 1150, 1740, 1230], ['race', 'vip', 2500, 1150, 2500, 1230],
  ['slots', 'vip', 1570, 1540, 1650, 1540],
].map(([a, b, ax, ay, bx, by]) => ({ a, b, pa: { x: ax, y: ay }, pb: { x: bx, y: by } }));

// ---------- Furniture ----------
export const BJ_TABLES = [{ x: 960, y: 230 }, { x: 1680, y: 230 }];          // flat edge north at y, felt curves south
export const BJ_SEAT_RING = { x: 145, y: 128 }; // bodies 0.4–0.5 m from the rail, within reach of cards/chips
export const RL_TABLE = { x: 900, y: 900, w: 300, h: 120 };                  // wheel at the east end
export const CRASH_SCREEN = { x0: 2240, x1: 2760 };                          // on the arcade's north wall
// First measured arcade construction: consolidated Plinko pair frees the east bays for two real lanes.
export const PLINKO_STATIONS = [2115, 2217].map(x => ({ x, y: 213, baseX: x, baseY: 129, face: -Math.PI / 2 }));
export const SKEE_LANES = [2754, 2862].map((x, machine) => ({ x, y: 222, w: 84, h: 276, playerY: 396, machine }));
// The plush rocket statue: walk-through decor in the dead corner behind the first Plinko cabinet (it stood inside the
// relocated cabinet and hid half its board). r is its footprint radius, h its height in metres.
export const ARCADE_ROCKET = { x: 2045, y: 52, r: 24, h: 1.6 };
export const MINES_XS = [2148], TOWER_XS = [2292];  // consoles on the arcade's south wall
export const ARCADE_CABS = [
  {game:'stack',x:2150,y:435,w:84,h:78,face:Math.PI},
  {game:'vault',x:2280,y:435,w:84,h:78,face:Math.PI},
  {game:'train',x:2410,y:435,w:84,h:78,face:Math.PI},
  {game:'pop',x:2215,y:513,w:84,h:78,face:0},
  {game:'pinball',x:2375,y:517,w:88,h:112,face:0},
{ game: 'pusher', x: 2920, y: 522, w: 90, h: 102 }, { game: 'claw', x: 2920, y: 638, w: 96, h: 102 }, { game: 'flappy', x: 2660, y: 650, w: 90, h: 88 }];
export const POND = { x: 2140, y: 900, w: 780, h: 170 };                     // the duck race channel, ducks swim east
export const RACE_XS = [2690]; // one shared betting pedestal, east of the arcade doorway
// Four continuous back-to-back banks. The centre aisle links both public doors;
// outer/end aisles allow escape, while full-height cabinets conceal the far side.
export const SLOT_STATIONS = [
  ...[400, 1120].flatMap(cx => [1390, 1690].flatMap(y =>
    [-168,-84,0,84,168].flatMap(dx => [
      {x:cx+dx,y:y-32,face:-Math.PI/2,tier:'penny'},
      {x:cx+dx,y:y+32,face:Math.PI/2,tier:'penny'}]))),
  ...[1370,1454,1696,1780].map(y => ({x:1660,y,face:0,tier:'high'})),
].map((s,machine)=>({...s,machine}));
export const SLOT_BANKS = [400,1120].flatMap(x => [1390,1690].map(y => ({x:x-204,y:y-58,w:408,h:116,kind:'slot-bank'})));
export const SLOT_WEST_YS = [1300, 1410, 1520, 1630, 1740];                  // penny machines on the slot hall's west wall
export const SLOT_SOUTH_XS = [380, 500, 620, 740, 860];                      // south wall: one penny, four high limit
export const JACKPOT = { x: 820, y: 1540 };                                  // the progressive jackpot tower
export const DICE_TABLE = { x: 1340, y: 900, w: 320, h: 150 };                 // main floor social cluster
export const WHEEL_X = 2180;                                                 // the prize wheel on the VIP lounge's south wall, facing the door from the floor
export const COIN = { x: 2640, y: 1720 };                                   // in the VIP lounge
export const COFFEE = { x: 2400, y: 1505, w: 160, h: 70 };
export const PIANO = { x: 2830, y: 1780 }; // shared model, bench and collision reference
export const SECURITY = { x: 650, y: 560, w: 50, h: 130 };                  // the security desk: camera monitors on the floor's west wall
// House Insurance against the VIP east wall, with its own approach clear of the TV and piano.
export const SHADY = { x: 2910, y: 1675, face: Math.PI, stand: { x: 2853, y: 1675 } };

export const BELL = { x: 1320, y: 600 };
// Wall-side waste bins: every room has an accessible place to dispose of drinks.
export const TRASH_CANS = [[570,570],[570,800],[720,1040],[1900,500],[2090,580],[2880,1120],[100,1250],[1500,1815],[2000,1830],[2880,1400]].map(([x,y],id)=>({id,x,y}));
export const BAR_TABLES = [[150,420,1.075],[420,470,1.075],[200,600,1.075],[73,285,.775],[73,525,.775]].map(([x,y,height],id)=>({id,x,y,height,glassOffset:height<1?22:12}));
export const OBSTACLES = [
  ...TRASH_CANS.map(p=>({x:p.x-15,y:p.y-15,w:30,h:30,kind:'trash'})),
  { x: BELL.x-36, y: BELL.y-36, w:72, h:72, kind: 'pit-bell' },
  { x: 60, y: 60, w: 400, h: 50, kind: 'counter' },
  ...[[150, 420], [420, 470], [200, 600]].map(([x, y]) => ({ x: x - 22, y: y - 22, w: 44, h: 44, kind: 'hightop' })),
  { x: 30, y: 780, w: 40, h: 260, kind: 'sinks' },
  ...BJ_TABLES.map(t => ({ x: t.x - 120, y: t.y, w: 240, h: 100, kind: 'bj' })),
  { ...RL_TABLE, kind: 'roulette' },
  ...[0, 1, 2, 3].map(i => ({ x: 2320 + i * 120 - 25, y: 196, w: 50, h: 26, kind: 'crashDesk' })),
  ...PLINKO_STATIONS.map(p => ({ x: p.x - 45, y: 84, w: 90, h: 107, kind: 'plinko' })),
  ...SKEE_LANES.map(p => ({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h, kind: 'skee' })),
  ...MINES_XS.map(x => ({ x: x - 25, y: 652, w: 50, h: 48, kind: 'mines' })),
  ...TOWER_XS.map(x => ({ x: x - 25, y: 652, w: 50, h: 48, kind: 'tower' })),
  ...ARCADE_CABS.map(c => ({ x: c.x-c.w/2, y: c.y-c.h/2, w:c.w, h:c.h, kind:c.game })),
  { ...POND, kind: 'pond' },
  ...RACE_XS.map(x => ({ x: x - 35, y: 838, w: 70, h: 22, kind: 'desk' })),
  ...SLOT_STATIONS.map(s=>({x:s.x-26,y:s.y-26,w:52,h:52,kind:'slot'})),
  ...SLOT_BANKS,
  { x: JACKPOT.x - 40, y: JACKPOT.y - 40, w: 80, h: 80, kind: 'jackpot' },
  { ...DICE_TABLE, kind: 'dice' },
  ...[WHEEL_X - 60, WHEEL_X + 60].map(x => ({ x: x - 20, y: 1800, w: 40, h: 30, kind: 'wheelDesk' })),
  { x: WHEEL_X - 100, y: 1855, w: 200, h: 25, kind: 'wheel' },
  { x: COIN.x - 45, y: COIN.y - 45, w: 90, h: 90, kind: 'coin' },
  { ...COFFEE, kind: 'coffee' },
  { ...SECURITY, kind: 'security' },

  // dressing that you walk around: bar booths and a jukebox, a slot-hall ottoman, a VIP pool table, champagne and piano
  { x: 30, y: 230, w: 80, h: 110, kind: 'booth' }, { x: 30, y: 470, w: 80, h: 110, kind: 'booth' }, { x: 420, y: 655, w: 50, h: 40, kind: 'jukebox' },
  { x: SHADY.x - 18, y: SHADY.y - 18, w: 36, h: 36, kind: 'shady' },
  { x: SHADY.x + 22, y: SHADY.y - 51, w: 6, h: 102, kind: 'shop-wall' }, // solid back of the insurance alcove
  { x: 2915, y: 1765, w: 40, h: 24, kind: 'crates' }, // his stock: a couple of crates in the corner beside him
  { x: 50, y: 1480, w: 90, h: 90, kind: 'ottoman' },
  { x: 2110, y: 1290, w: 150, h: 80, kind: 'pool' }, { x: 2745, y: 1270, w: 56, h: 56, kind: 'champagne' }, { x: PIANO.x - 51, y: PIANO.y - 72, w: 102, h: 120, kind: 'piano' },
];

export const CHANDELIERS = [
  [960, 330], [1680, 330], [1320, 600], [1320, 920], [860, 780], [1780, 780],
  [320, 330], [320, 950], [2300, 380], [2700, 380], [2500, 1060], [300, 1450], [700, 1650], [2500, 1540],
  [1300, 1330], [1760, 1560], // the slot hall's east end (by the dice), the VIP lounge's west end (the coin flip and the wheel)
];
export const PLANTS = [[695, 70], [1940, 80], [690, 1125], [1950, 1130], [560, 75], [2935, 80], [2050, 660], [70, 1740], [80, 1820], [1450, 1815]];
// STAFF ONLY doors, one per room but the duck pond: [room, x, y] on a wall's inner face and the way the door faces into
// the room. A killer with the staff-passage edge steps in one and out of another (at the stand spot, 38 px out).
export const STAFF_DOORS = [['bar', 20, 640, 0], ['rest', 110, 1180, -Math.PI / 2], ['floor', 780, 20, Math.PI / 2], ['arcade', 2880, 20, Math.PI / 2],
  ['vip', 2980, 1370, Math.PI], ['slots', 160, 1200, Math.PI / 2]]
  .map(([room, x, y, face], id) => ({ id, room, x, y, face, sx: Math.round(x + Math.cos(face) * 38), sy: Math.round(y + Math.sin(face) * 38) }));
export const TAP = { x: 260, y: 145 };

export const REST_SPOTS = [{ x: 110, y: 820 }, { x: 110, y: 980 }, { x: 320, y: 1120 }, { x: 440, y: 1120 }, { x: 560, y: 1120 }];
export const BOWL_SPOTS = [{ x: 530, y: 160 }, { x: 2900, y: 1300 }, { x: 2070, y: 480 }, { x: 1520, y: 1280 }, { x: 1900, y: 1100 }, { x: 980, y: 1250 }]; // bar, VIP, arcade, slot hall (east, by the dice), casino floor, slot hall
export const GAME_NAMES = {
  bj: 'blackjack', roulette: 'roulette', race: 'the duck race', vip: 'the VIP lounge', slots: 'the slots', crash: 'Crash',
  stack:'Potato Stack',vault:'Vault Breaker',train:'Last Train',pinball:'Midnight Pinball',pop:'Potato Pop',flappy: 'Flying Pigs', pusher: 'the coin-pusher', claw: 'the prize claw', skee: 'skee-ball', plinko: 'Plinko', mines: 'Mines', tower: 'Dragon Tower', coin: 'the coin flip', wheel: 'the prize wheel', dice: 'street dice', cams: 'the security desk',
};

export function makeSeats() {
  const seats = [];
  // drink: the little stand behind the seat (opposite the way it faces)
  const add = (game, x, y, face, extra) => {
    const dx = -Math.cos(face) * 42, dy = -Math.sin(face) * 42;
    seats.push({ id: seats.length, game, x, y, face, drink: { x: x + dx, y: y + dy }, approach: { x: x + dx * 1.45, y: y + dy * 1.45 }, occ: null, claim: null, ...extra });
  };
  for (const [ti, t] of BJ_TABLES.entries()) for (const deg of [30, 60, 90, 120, 150]) {
    const a = deg * Math.PI / 180, x = t.x + Math.cos(a) * BJ_SEAT_RING.x, y = t.y + Math.sin(a) * BJ_SEAT_RING.y;
    add('bj', Math.round(x), Math.round(y), Math.atan2(t.y + 30 - y, t.x - x), { table: ti });
  }
  for (const x of [RL_TABLE.x+50, RL_TABLE.x+110, RL_TABLE.x+290]) { add('roulette', x, RL_TABLE.y - 40, Math.PI / 2); add('roulette', x, RL_TABLE.y + RL_TABLE.h + 40, -Math.PI / 2); }
  SLOT_STATIONS.forEach(s=>add('slots',s.x+Math.cos(s.face)*66,s.y+Math.sin(s.face)*66,s.face+Math.PI,{tier:s.tier,machine:s.machine}));
  RACE_XS.forEach(x => add('race', x, 800, Math.PI / 2));
  [0, 1, 2, 3].forEach(i => add('crash', 2320 + i * 120, 262, -Math.PI / 2));
  PLINKO_STATIONS.forEach((p, i) => add('plinko', p.x, p.y, p.face, { machine: i }));
  MINES_XS.forEach((x, i) => add('mines', x, 612, Math.PI / 2, { machine: i }));
  TOWER_XS.forEach((x, i) => add('tower', x, 612, Math.PI / 2, { machine: i }));
  [-60, 60].forEach((dx, i) => add('wheel', WHEEL_X + dx, 1762, Math.PI / 2, { machine: i }));
  for (const x of [DICE_TABLE.x+100, DICE_TABLE.x+220]) { add('dice', x, DICE_TABLE.y - 40, Math.PI / 2); add('dice', x, DICE_TABLE.y + DICE_TABLE.h + 40, -Math.PI / 2); }
  for (const [x, y] of [[COIN.x-75, COIN.y-70], [COIN.x+75, COIN.y-70]]) add('coin', x, y, Math.atan2(COIN.y - y, COIN.x - x));
  add('cams', SECURITY.x + SECURITY.w + 38, SECURITY.y + SECURITY.h / 2, Math.PI);
  add('vip', COFFEE.x - 70, COFFEE.y + 35, 0); add('vip', COFFEE.x + COFFEE.w + 70, COFFEE.y + 35, Math.PI);
  add('vip', COFFEE.x + 80, COFFEE.y - 65, Math.PI / 2); add('vip', COFFEE.x + 80, COFFEE.y + COFFEE.h + 65, -Math.PI / 2);
  SKEE_LANES.forEach(p => add('skee', p.x, p.playerY, -Math.PI / 2, { machine: p.machine }));
  ARCADE_CABS.forEach(c => c.face!==undefined?add(c.game,c.x,c.y+Math.cos(c.face)*(c.h/2+38),-Math.PI/2*Math.cos(c.face),{machine:0}):c.game==='flappy'?add(c.game,c.x,c.y-82,Math.PI/2,{machine:0}):add(c.game, c.x-c.w/2-38, c.y, 0, { machine: 0 }));
  return seats;
}

// ---------- Geometry ----------
export function segRect(x1, y1, x2, y2, r) {
  if ((x1 < r.x && x2 < r.x) || (x1 > r.x + r.w && x2 > r.x + r.w) || (y1 < r.y && y2 < r.y) || (y1 > r.y + r.h && y2 > r.y + r.h)) return false;
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
const VISION_SOLIDS = WALLS.concat(SLOT_BANKS);
export function los(a, b) { for (const w of VISION_SOLIDS) if (segRect(a.x, a.y, b.x, b.y, w)) return false; return true; }
export const SOLIDS = WALLS.concat(OBSTACLES);
export function collide(c) {
  const R = CFG.radius;
  for (const r of SOLIDS) {
    // Most furniture is far away. Keep the sequential solver for nearby
    // rectangles, including pushes that bring the character into later ones.
    if (c.x < r.x - R || c.x > r.x + r.w + R || c.y < r.y - R || c.y > r.y + r.h + R) continue;
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
// (prepared during loading, with a synchronous fallback for standalone simulation).
let CORNERS = null, cornerBuild = null;
function corners() {
  if (CORNERS) return CORNERS;
  const steps = prepareNavigation(); let step;
  while (!(step = steps.next()).done) { /* standalone callers finish the shared build */ }
  return step.value;
}
export function* prepareNavigation() {
  if (!CORNERS && !cornerBuild) cornerBuild = buildCorners();
  while (!CORNERS) {
    const step = cornerBuild.next();
    if (step.done) { CORNERS = step.value; cornerBuild = null; }
    else yield step.value;
  }
  return CORNERS;
}
function* buildCorners() {
  const pts = [];
  const roomy = p => ![...IN_ROOM, ...WALLS].some(o => inside(p, inflate(o, CFG.radius + 1)));
  for (const o of IN_ROOM) for (const [sx, sy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    // 10 px clear of the furniture, or 3 px where that is too close to something else (a counter by a wall)
    const p = [10, 3].map(m => { const q = inflate(o, CFG.radius + m); return { x: q.x + sx * q.w, y: q.y + sy * q.h }; }).find(roomy);
    if (p) pts.push(p);
  }
  const adj = pts.map(() => []);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (!free(pts[i], pts[j])) continue;
      const d = dist(pts[i], pts[j]); adj[i].push([j, d]); adj[j].push([i, d]);
    }
    yield i;
  }
  return { pts, adj };
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

// Breaker panels on the walls (the blackout, sim.js): where you stand to reset one, facing it (face, radians); the panel
// hangs on the wall 31 px ahead, at chest height, on plain wall: clear of doorways, pilasters, pictures and furniture.
// Each blackout lights up CFG.breakers of them, in different rooms from each other and from the monster.
export const BREAKERS = [
  { x: 52, y: 405, face: Math.PI },          // the bar, west wall, between the booths
  { x: 588, y: 800, face: 0 },               // the restrooms, east wall, north of the door to the floor
  { x: 1550, y: 1148, face: Math.PI / 2 },   // the casino floor, south wall, west of the door to the VIP lounge
  { x: 2948, y: 640, face: 0 },              // the arcade, east wall, past the Plinko cabinets
  { x: 1960, y: 1232, face: -Math.PI / 2 },       // VIP north wall, clear of the high-limit banks and the floor doorway
  { x: 400, y: 1232, face: -Math.PI / 2 },   // the slot hall, north wall
  { x: 2680, y: 1148, face: Math.PI / 2 },   // the duck pond, south wall, east of the door to the VIP lounge
];
