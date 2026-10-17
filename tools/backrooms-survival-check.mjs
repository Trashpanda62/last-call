import fs from "node:fs";
import assert from "node:assert/strict";
import { createGame, ringSpot } from "../src/sim.js";
import { WALLS, makeSeats, STAFF_DOORS, OBSTACLES } from "../src/map.js";
import {
  BR_WALLS,
  BR_HIDES,
  brClear,
  brCollide,
  brLos,
  brRoute,
  brSegment,
} from "../src/backrooms-map.js";
import { packPub, packFor, unpackSnap, wireCache } from "../src/wire.js";
const report = {
  at: new Date().toISOString(),
  routes: 0,
  segments: 0,
  walls: BR_WALLS.length,
  hides: BR_HIDES.length,
};
const make = () => {
  const g = createGame({
    mode: "escape",
    pick: "solo",
    players: 6,
    humans: [
      { name: "Player", key: "a" },
      { name: "Friend", key: "b" },
    ],
  });
  for (const c of g.G.chars) c.isHuman = true;
  return g;
};
const step = (g, t) => {
  for (let i = 0; i < t * 60 && !g.G.over; i++) g.tick(1 / 60);
};
const seats = makeSeats();
assert.notDeepEqual(BR_WALLS, WALLS);
assert.ok(BR_HIDES.length >= 5);
const ends = [
  ...seats.map((s) => s.approach),
  ...BR_HIDES,
  ...STAFF_DOORS.map((d) => ({ x: d.sx, y: d.sy })),
];
for (const from of [
  ringSpot(0, 6),
  ...BR_HIDES,
  ...STAFF_DOORS.map((d) => ({ x: d.sx, y: d.sy })),
])
  for (const to of ends) {
    assert.ok(brClear(to), "endpoint clear");
    const r = brRoute(from, to);
    assert.ok(r.length, "reachable endpoint " + JSON.stringify(to));
    let p = from;
    for (const q of r) {
      assert.ok(brSegment(p, q), "swept-radius segment");
      p = q;
      report.segments++;
    }
    report.routes++;
  }
for (let n = 4; n <= 32; n++) {
  const start = createGame({ mode: "escape", players: n, humans: [] });
  for (const c of start.G.chars)
    assert.ok(brClear(c), "all actual starting poses clear");
}
let g = make();
assert.equal(g.G.mode, "play");
assert.deepEqual(g.G.killerIds, []);
assert.ok(g.G.backrooms);
assert.deepEqual(
  g.G.seats.map(({ id, game, x, y, face }) => ({ id, game, x, y, face })),
  seats.map(({ id, game, x, y, face }) => ({ id, game, x, y, face })),
);
step(g, 89);
assert.equal(g.G.survival.entities.length, 0);
assert.equal(g.G.survival.reveals.length, 0);
step(g, 2);
assert.equal(g.G.survival.entities.length, 1);
const e = g.G.survival.entities[0];
assert.equal(e.kind, "bacteria");
for (const c of g.G.chars) {
  c.hidden = 0;
  c.hideSeen = false;
}
step(g, 165);
assert.equal(g.G.survival.entities.length, 4);
assert.deepEqual(
  g.G.survival.entities.map((e) => e.kind),
  ["bacteria", "hound", "smiler", "skinstealer"],
);
assert.equal(g.G.blackout, null);
report.progressiveSpawns = true;
// Safe hiding resists a nearby creature; a witnessed hide never magically erases the chase.
g = make();
const c = g.G.chars[0],
  h = BR_HIDES[0];
Object.assign(c, { x: h.x, y: h.y });
g.action(0, "use");
assert.equal(c.hidden, h.id);
const pos = { x: c.x, y: c.y };
g.setInput(0, { x: 2500, y: 1000, posVer: c.posVer }, true);
assert.equal(c.x, pos.x);
g.action(0, "play", { net: 100000 });
assert.equal(c.won, 0);
g.G.t = 100;
g.G.survival.entities.push({
  id: -101,
  kind: "hound",
  name: "Hound",
  speed: 205,
  sight: 430,
  x: c.x + 25,
  y: c.y,
  face: 0,
  path: [],
  memory: 0,
  repath: 0,
  target: null,
});
step(g, 1);
assert.equal(c.alive, true);
g.action(0, "use");
assert.equal(c.hidden, undefined);
Object.assign(g.G.survival.entities[0], {
  x: c.x + 25,
  y: c.y,
  path: [],
  repath: 0,
});
step(g, 0.2);
assert.equal(c.alive, false);
assert.equal(c.deathScene.killer.name, "Hound");
report.hideAndDeath = true;
// Entering in sight produces an honest warning and does not grant invulnerability.
g = make();
Object.assign(g.G.chars[0], { x: h.x, y: h.y });
g.G.t = 100;
g.G.survival.entities.push({
  id: -102,
  kind: "hound",
  name: "Hound",
  speed: 205,
  sight: 430,
  x: h.x + 25,
  y: h.y,
  face: Math.PI,
  path: [],
  memory: 6,
  repath: 0,
  target: 0,
});
g.action(0, "use");
assert.equal(g.G.chars[0].hideSeen, true);
step(g, 0.2);
assert.equal(g.G.chars[0].alive, false);
assert.equal(g.G.chars[0].hidden, undefined, 'death releases locker so ghosts can move');
assert.equal(g.view(0).priv.hidden, false);
report.witnessedHideUnsafe = true;
// Mimics remain private, telegraph on actual use, permit retreat and do not require trap checks.
g = make();
g.G.t = 91;
g.G.survival.nextSpawn = 1e9;
let m = g.G.survival.mimics.values().next().value;
let s = g.G.seats[m.seat];
let c0 = g.G.chars[0];
Object.assign(c0, { x: s.x, y: s.y, look: s.face });
g.setInput(0, { x: s.x, y: s.y, look: s.face, posVer: c0.posVer });
assert.ok(c0.seat);
g.action(0, "tableBet", { seat: s.id, round: 1, bet: 100 });
assert.equal(g.G.survival.reveals.length, 1);
const publicState = g.view(0);
assert.equal(publicState.priv.canInspect, false);
assert.ok(!JSON.stringify(publicState.pub).includes("used"));
g.action(0, "inspect");
assert.equal(c0.inspect, null);
step(g, 2.6);
assert.equal(c0.alive, false);
assert.equal(c0.deathScene.killer.name, "Machine Mimic");
g = make();
g.G.t = 91;
g.G.survival.nextSpawn = 1e9;
m = g.G.survival.mimics.values().next().value;
s = g.G.seats[m.seat];
c0 = g.G.chars[0];
Object.assign(c0, { x: s.x, y: s.y, look: s.face });
g.setInput(0, { x: s.x, y: s.y, look: s.face, posVer: c0.posVer });
g.action(0, "tableBet", { seat: s.id, round: 1, bet: 100 });
g.action(0, "leave");
Object.assign(c0, ringSpot(0, 6));
step(g, 2.6);
assert.equal(c0.alive, true);
report.mimicTelegraphRetreatAndPrivacy = true;
// Exit unlock, uninterrupted hold, per-player saved winnings and final result.
g = make();
const d = STAFF_DOORS[0];
c0 = g.G.chars[0];
Object.assign(c0, { x: d.sx, y: d.sy, won: 12345 });
step(g, 29);
assert.equal(c0.escaped, undefined);
step(g, 1.5);
assert.ok(g.G.exits);
assert.equal(c0.escaped, undefined);
Object.assign(c0, { x: d.sx + 100, y: d.sy });
step(g, 0.2);
assert.equal(c0.exitT, 0);
Object.assign(c0, { x: d.sx, y: d.sy });
step(g, 3.1);
assert.equal(c0.escaped, true);
assert.equal(c0.extracted, 12345);
c0.won = 99999;
assert.equal(g.view(0).priv.wallet, 12345);
assert.equal(g.G.over, null);
for (const c of g.G.chars) if (c.id) c.alive = false;
g.tick(0.1);
assert.ok(g.G.over);
assert.equal(g.view(0).priv.won, true);
assert.equal(g.view(1).priv.won, false);
report.extraction = 12345;
// Entity behaviors are distinct: watch a Smiler to stop it; a Hound hears running through a wall.
g = make();
g.G.t = 100;
g.G.survival.nextSpawn = 1e9;
for (const c of g.G.chars) if (c.id) c.alive = false;
c0 = g.G.chars[0];
Object.assign(c0, { x: 1500, y: 600, look: Math.PI });
g.G.survival.entities = [
  {
    id: -102,
    kind: "smiler",
    name: "Smiler",
    speed: 180,
    sight: 660,
    x: 1400,
    y: 600,
    face: 0,
    path: [{ x: 1500, y: 600 }],
    repath: 100,
    memory: 6,
    target: 0,
  },
];
g.tick(0.1);
assert.equal(g.G.survival.entities[0].x, 1400);
c0.look = 0;
g.tick(0.1);
assert.ok(g.G.survival.entities[0].x > 1400);
report.smilerFreezesWhenWatched = true;
const wall = BR_WALLS.find(
  (w) =>
    w.x > 20 &&
    w.y > 20 &&
    w.h > 100 &&
    brClear({ x: w.x - 50, y: w.y + w.h / 2 }) &&
    brClear({ x: w.x + 70, y: w.y + w.h / 2 }),
);
assert.ok(wall);
g = make();
g.G.t = 100;
g.G.survival.nextSpawn = 1e9;
for (const c of g.G.chars) if (c.id) c.alive = false;
c0 = g.G.chars[0];
Object.assign(c0, {
  x: wall.x + 70,
  y: wall.y + wall.h / 2,
  moving: true,
  sprinting: true,
});
const hound = {
  id: -101,
  kind: "hound",
  name: "Hound",
  speed: 0,
  sight: 430,
  x: wall.x - 50,
  y: c0.y,
  face: 0,
  path: [],
  repath: 100,
  memory: 0,
  target: null,
};
assert.equal(brLos(hound, c0), false);
g.G.survival.entities = [hound];
g.tick(0.1);
assert.equal(hound.target, 0);
report.houndHearsThroughWalls = true;
g = make();
c0 = g.G.chars[0];
Object.assign(c0, { x: wall.x - 20, y: wall.y + wall.h / 2 });
g.setInput(0, { x: wall.x + 40, y: c0.y, look: 0, posVer: c0.posVer }, true);
assert.ok(c0.x <= wall.x - 14.9);
report.remoteCannotCrossMovedWalls = true;
// Wire carries independent entity state, hiding and extraction to guests without leaking dormant mimics.
g = make();
Object.assign(g.G.chars[1], { x: h.x, y: h.y });
g.action(1, "use");
g.G.t = 91;
g.tick(0.01);
const v = g.view(1),
  snap = unpackSnap(
    JSON.parse(JSON.stringify(packFor(packPub(v.pub), v.priv, {}, null))),
    wireCache(),
  );
assert.deepEqual(snap.pub.survival, JSON.parse(JSON.stringify(v.pub.survival)));
assert.equal(snap.pub.chars[1].hidden, true);
assert.equal(snap.priv.hidden, true);
report.guestWire = true;
g = make();
g.G.t = 899.99;
g.G.survival.nextSpawn = 1e9;
g.tick(0.02);
assert.ok(g.G.over);
assert.equal(g.view(0).priv.won, false);
report.deadline = true;
const classic = createGame({
  players: 6,
  humans: [{ name: "Classic" }],
  forceRole: "gambler",
});
assert.equal(classic.G.killerIds.length, 1);
assert.equal(classic.view(0).pub.survival, null);
report.classicUnchanged = true;
fs.writeFileSync(
  "docs/performance/2026-10-17-backrooms-survival-rules.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log("PASS", report);
