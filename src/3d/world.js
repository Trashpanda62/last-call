// The static casino, built once from the map data. Sim px -> metres: x/60 east, y/60 south.
// Rooms, walls, trim, lights and decor live here; the game machines are in machines.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { ROOMS, WALLS, OBSTACLES, DOOR_GAPS, CHANDELIERS, PLANTS, TAP, BELL, DICE_TABLE, SHADY, PIANO, BOWL_SPOTS, STAFF_DOORS, makeSeats } from '../map.js';
import { buildMachinesSteps } from './machines.js';
import { makeMirror, mirrorFrame } from './mirror.js';
import { hasProp, placeProps, propObject, propScale, propInfo } from './props.js';
const propHeight = n => propInfo(n).size[1];

export const M = 1 / 60, WALL_H = 3.6;
// turns for models whose front isn't the side the game wants (set from the fitted check renders)
export const PROP_YAW = { piano: Math.PI, poolTable: 0 }; // the piano's keyboard faces the bench side (-z)
export const yawOf = a => Math.PI / 2 - a; // object facing +Z local -> facing sim angle a
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- Materials ----------
const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const candyMats = new Map();
const shareCandy = !/[?&]uncachedCandy\b/.test(location.search); // diagnostic comparison
// Restroom stall laminate: a sea-green panel with a faint grain and a bevelled edge every tile (one panel per 1.2 m).
function stallTex() {
  const [c, g] = T.canvas(256, 256);
  g.fillStyle = '#7fa29d'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '20,40,40'},${0.02 + Math.random() * 0.04})`; g.fillRect(Math.random() * 256, 0, 1 + Math.random() * 3, 256); }
  g.strokeStyle = 'rgba(20,40,40,0.35)'; g.lineWidth = 3; g.strokeRect(10, 10, 236, 236);
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.strokeRect(13, 13, 230, 230);
  return T.tex(c);
}
// Gold, chrome and the gloss coats stay rough (0.35 and up): sharper, every light left a white spot on them (Steve: no glare).
export const MAT = {
  gold: std({ color: 0xc6a15e, metalness: 0.88, roughness: 0.48, envMapIntensity: 0.5 }),
  brass: std({ color: 0xb58b4d, metalness: 0.85, roughness: 0.46 }),
  chrome: std({ color: 0xdde2e6, metalness: 1, roughness: 0.4, envMapIntensity: 0.6 }),
  darkWood: std({ roughness: 0.42 }),
  wood: std({ map: T.wood('#6b4128', '#3a2214'), roughness: 0.5 }),
  polished: phys({ color: 0x100b0b, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.35 }),
  velvet: phys({ color: 0x5c0d1c, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0x9b3945), sheenRoughness: 0.5 }),
  purple: phys({ color: 0x430b17, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0x85303d), sheenRoughness: 0.5 }),
  teal: phys({ color: 0x330c15, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xd2b77a), sheenRoughness: 0.5 }),
  leather: phys({ color: 0x2a1410, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
  black: std({ color: 0x141014, roughness: 0.4 }),
  blackGloss: phys({ color: 0x0e0c10, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.35 }),
  marble: std({ color: 0xffffff, roughness: 0.42 }),
  marbleDark: std({ color: 0x999999, roughness: 0.46 }), // the VIP coffee table (pale marble glares under its spot)
  porcelain: std({ color: 0xf6f6f2, roughness: 0.35 }),
  leaf: phys({ color: 0x2f7a35, roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0x9fe08a) }),
  pot: std({ color: 0x1a1214, roughness: 0.3, metalness: 0.4 }),
  mirror: std({ color: 0x8a7a70, metalness: 0.9, roughness: 0.3, envMapIntensity: 0.25 }),
  stall: std({ map: stallTex(), roughness: 0.38 }),
  rope: phys({ color: 0xb01828, roughness: 0.7, sheen: 1, sheenColor: new THREE.Color(0x9b3945) }),
  water: phys({ color: 0x1fa8c8, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.85, clearcoat: 1, clearcoatRoughness: 0.05 }),
  metalDark: std({ color: 0x2a2c34, metalness: 0.7, roughness: 0.45 }),
  // Identical lacquer colors can share a material, so static betting stands
  // batch together instead of adding a new draw for each individual stand.
  candy: c => {
    if (!shareCandy) return phys({ color: c, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.35 });
    if (!candyMats.has(c)) candyMats.set(c, phys({ color: c, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.35 }));
    return candyMats.get(c);
  },
};
// Emissive materials get dimmed when the lights go out; keep a list with their normal strength.
export const GLOWS = [];
// The surfaces the screen-space reflections may mirror (graphics settings, Ultra): hard floors, polished wood, stone, gloss.
export const REFLECTS = new Set();
export function glowMat(color, strength = 1, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: strength, roughness: 0.4, ...extra });
  GLOWS.push({ m, k: 'emissiveIntensity', v: strength }); return m;
}
export function basicGlow(map, strength = 1.6, extra = {}) {
  const m = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(strength, strength, strength), toneMapped: false, ...extra });
  GLOWS.push({ m, k: 'color', v: strength }); return m;
}

// Per-room look: floor, walls, ceiling, and how the walls are dressed.
// Shared architectural palette; machine displays and game colors keep their meanings.
const ROOM_LOOK = {
  floor: { wall: () => T.noirStone(), floor: () => T.oxbloodCarpet(), tile: 3.2, wallTile: 3.2, ceil: '#130b0d', trim: 'deco', cove: 0xd6ab66 },
  bar: { wall: () => T.noirStone(), floor: () => T.oxbloodCarpet(), tile: 3.2, wallTile: 3.2, ceil: '#130b0d', trim: 'deco', cove: 0xe4ad67 },
  rest: { wall: () => T.tiles('#282322', '#171415'), floor: () => T.tiles('#171415', '#302827'), tile: 1.2, ceil: '#171214', trim: 'tile', cove: 0xd2ba8b, wallRough: 0.5, floorRough: 0.55 },
  arcade: { wall: () => T.noirStone(), floor: () => T.oxbloodCarpet(), tile: 3.2, wallTile: 3.2, ceil: '#130b0d', trim: 'deco', cove: 0xd6ab66 },
  race: { wall: () => T.noirStone(), floor: () => T.noirStone(), tile: 2.4, wallTile: 3.2, ceil: '#130b0d', trim: 'deco', cove: 0xd6ab66, floorRough: 0.48 },
  slots: { wall: () => T.noirStone(), floor: () => T.oxbloodCarpet(), tile: 3.2, wallTile: 3.2, ceil: '#130b0d', trim: 'deco', cove: 0xd6ab66 },
  vip: { wall: () => T.noirStone(), floor: () => T.oxbloodCarpet(), tile: 3.2, wallTile: 3.2, ceil: '#130b0d', trim: 'deco', cove: 0xd6ab66 },
};
export const roomMats = {}; // (exported for backrooms.js, which swaps them on the backrooms night)
for (const k in ROOM_LOOK) {
  const L = ROOM_LOOK[k];
  roomMats[k] = {
    wall: std({ roughness: L.wallRough ?? 0.8 }),
    floor: std({ roughness: L.floorRough ?? 0.95 }),
    ceil: L.ceil ? std({ roughness: 0.9 }) : null,
    tile: L.tile,
  };
  if ((L.floorRough ?? 0.95) < 0.7) REFLECTS.add(roomMats[k].floor);
}
for (const k of ['polished', 'blackGloss', 'marble', 'marbleDark', 'chrome', 'porcelain']) if (MAT[k]) REFLECTS.add(MAT[k]);

// Prepare PBR materials before construction. Paint fallback maps only when they
// are requested: startup used to paint every room, then replace all that work.
// Phones skip the normal maps.
const ROOM_MATS = {
  floor: ['noirMarble', 'oxbloodCarpet'], bar: ['noirMarble', 'oxbloodCarpet'], rest: ['noirMarble', 'noirMarble'], arcade: ['noirMarble', 'oxbloodCarpet'],
  race: ['noirMarble', 'noirMarble'], slots: ['noirMarble', 'oxbloodCarpet'], vip: ['noirMarble', 'oxbloodCarpet'],
};
export function loadRoomMats(lowPower = false) {
  if (/[?&](toy|nomats)\b/.test(location.search)) {
    for (const k in ROOM_LOOK) {
      const L = ROOM_LOOK[k], m = roomMats[k]; m.wall.map = L.wall(); m.floor.map = L.floor(); if (m.ceil) m.ceil.map = T.ceiling(L.ceil);
      for (const material of [m.wall, m.floor, m.ceil]) if (material) material.needsUpdate = true;
    }
    MAT.darkWood.map = T.wood('#170e0d', '#080607'); MAT.marble.map = T.noirStone(); MAT.marble.color.set(0xffffff); MAT.marbleDark.map = T.noirStone(); MAT.marbleDark.color.set(0x999999); for (const m of [MAT.darkWood, MAT.marble, MAT.marbleDark]) m.needsUpdate = true; return;
  }
  const L = new THREE.TextureLoader(), cache = {};
  const tex = (file, srgb) => cache[file] || (cache[file] = new Promise(ok => L.load('assets/mats/' + file, t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = T.aniso(); if (srgb) t.colorSpace = THREE.SRGBColorSpace; ok(t);
  }, undefined, () => ok(null))));
  const use = (mat, name, { tint = 0xffffff, ns = 0.6, fallback = null } = {}) => {
    tex(name + '-color.jpg', true).then(t => {
      if (t) { mat.map = t; mat.color.set(tint); }
      else if (fallback) mat.map = fallback();
      mat.needsUpdate = true;
    });
    if (!lowPower) tex(name + '-normal.jpg', false).then(t => { if (!t) return; mat.normalMap = t; mat.normalScale.set(ns, ns); mat.needsUpdate = true; });
  };
  for (const k in ROOM_MATS) {
    const [wall, floor] = ROOM_MATS[k], m = roomMats[k];
    const look = ROOM_LOOK[k];
    use(m.wall, wall, { ns: 0.12, fallback: look.wall }); use(m.floor, floor, { ns: 0.5, fallback: look.floor });
    if (m.ceil) use(m.ceil, 'ceiling', { tint: 0x66504a, ns: 0.8, fallback: () => T.ceiling(look.ceil) });
  }
  use(MAT.darkWood, 'darkWood', { tint: 0x352324, fallback: () => T.wood('#170e0d', '#080607') }); use(MAT.marble, 'noirMarble', { ns: 0.12, fallback: T.noirStone }); use(MAT.marbleDark, 'noirMarble', { tint: 0x999999, ns: 0.12, fallback: T.noirStone }); use(MAT.velvet, 'velvet', { tint: 0x792630 }); use(MAT.leather, 'leather');
  use(MAT.gold, 'goldLeaf', { tint: 0xc4ac79, ns: 0.18 }); use(MAT.brass, 'brass', { tint: 0xb49b72, ns: 0.18 });
  return Promise.all(Object.values(cache));
}

// ---------- Static batching: everything that never moves is merged per material ----------
// Two batches: the shell (floors, walls, ceilings) and the furniture, which casts shadows.
const cullStaticBatches = !/[?&]globalBatches\b/.test(location.search); // diagnostic comparison
export class Batch {
  constructor(cast = false) { this.lists = new Map(); this.cast = cast; }
  add(geom, mat, pos, rotY = 0, scale = null, rotX = 0, rotZ = 0) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    const m = new THREE.Matrix4().compose(pos || v3(0, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')), scale || v3(1, 1, 1));
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    if (!this.lists.has(mat)) this.lists.set(mat, []);
    this.lists.get(mat).push(g);
  }
  build(group) {
    for (const [mat, gs] of this.lists) {
      const mesh = new THREE.Mesh(mergeGeometries(gs, false), mat);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.receiveShadow = true; mesh.castShadow = this.cast; mesh.userData.fixedScenery = true;
      mesh.geometry.computeBoundingBox(); const b = mesh.geometry.boundingBox, eps = .001;
      // Keep the existing material batches. Tag one only if its entire bounds
      // belong to a room; shared walls and door frames stay globally visible.
      if (cullStaticBatches) for (const [room, r] of Object.entries(ROOMS)) if (b.min.x >= r.x * M - eps && b.max.x <= (r.x + r.w) * M + eps && b.min.z >= r.y * M - eps && b.max.z <= (r.y + r.h) * M + eps) { mesh.userData.room = room; mesh.boundingBox = b; break; }
      mesh.name = 'static-' + (mesh.userData.room || 'shared');
      group.add(mesh);
    }
    // mergeGeometries owns new attribute buffers. Closures can retain a builder;
    // release its staging copies once the scene owns the completed batches.
    this.lists.clear();
  }
}
export function uvScale(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
export const cyl = (rt, rb, h, s = 20) => new THREE.CylinderGeometry(rt, rb, h, s);
export const sph = (r, s = 16) => new THREE.SphereGeometry(r, s, Math.max(8, s * 0.75));
export const lathe = (pts, s = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), s);
export const torus = (r, t, rs = 8, ts = 32, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

function strictRoom(x, y) {
  for (const k in ROOMS) { const r = ROOMS[k]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return k; }
  return null;
}
const nearGap = (x, y, pad) => DOOR_GAPS.some(g => x > g.x - pad && x < g.x + g.w + pad && y > g.y - pad && y < g.y + g.h + pad);

export function buildWorld(scene, opts = {}) {
  const steps = buildWorldSteps(scene, opts);
  let step; do { step = steps.next(); } while (!step.done);
  return step.value;
}

// Startup consumes these same construction steps across animation frames; the
// diagnostic world rebuild can still finish synchronously through buildWorld().
export function* buildWorldSteps(scene, opts = {}) {
  const group = new THREE.Group(); scene.add(group);
  const S = new Batch(false), B = new Batch(true);
  const anim = [];       // per-frame updaters: f(t) or { every, f }
  const lightSpots = []; // where the pooled point lights can go: { p, color, power, range }
  const bulbs = [];      // marquee bulbs: { p, phase, color }
  const ctx = { group, S, B, anim, lightSpots, bulbs, sign, M, WALL_H };

  yield 'Building casino rooms';

  // ---------- Floors, ceilings, cove light ----------
  for (const k in ROOMS) {
    const r = ROOMS[k], m = roomMats[k], L = ROOM_LOOK[k];
    const w = r.w * M, d = r.h * M, cx = (r.x + r.w / 2) * M, cz = (r.y + r.h / 2) * M;
    // Black stone surrounds a red carpet field; the borders are flush surfaces.
    const inset = k === 'rest' || k === 'race' ? 0 : .75;
    if (inset) S.add(uvScale(new THREE.PlaneGeometry(w, d), w / 2.4, d / 2.4), MAT.marble, v3(cx, 0, cz), 0, null, -Math.PI / 2);
    S.add(uvScale(new THREE.PlaneGeometry(w - inset * 2, d - inset * 2), (w - inset * 2) / m.tile, (d - inset * 2) / m.tile), m.floor, v3(cx, inset ? .002 : 0, cz), 0, null, -Math.PI / 2);
    if (inset) for (const [sx, sz, sw, sd] of [[cx, cz-d/2+inset, w-inset*2, .018], [cx, cz+d/2-inset, w-inset*2, .018], [cx-w/2+inset, cz, .018, d-inset*2], [cx+w/2-inset, cz, .018, d-inset*2]]) S.add(new THREE.PlaneGeometry(sw, sd), MAT.gold, v3(sx, .004, sz), 0, null, -Math.PI/2);
    if (m.ceil) {
      S.add(uvScale(new THREE.PlaneGeometry(w, d), w / 2, d / 2), m.ceil, v3(cx, WALL_H, cz), 0, null, Math.PI / 2);
      // a glowing cove strip a little in from the walls, and the dark soffit above it
      const cm = glowMat(L.cove, k === 'arcade' ? 1.5 : k === 'race' || k === 'rest' ? 0.65 : 1); // the pale cyan coves blew out the race room and the restrooms
      const inset = 0.25;
      for (const [sx, sz, len, rot] of [[cx, r.y * M + inset, w - inset * 2, 0], [cx, (r.y + r.h) * M - inset, w - inset * 2, 0], [r.x * M + inset, cz, d - inset * 2, Math.PI / 2], [(r.x + r.w) * M - inset, cz, d - inset * 2, Math.PI / 2]]) {
        B.add(box(len, 0.03, 0.04), cm, v3(sx, WALL_H - 0.16, sz), rot);
        S.add(box(len + 0.3, 0.12, 0.3), MAT.black, v3(sx, WALL_H - 0.06, sz), rot);
      }
    }
  }
  // Doorways: floor threshold, gold frame and header and keystone (the neon signs hang beside the doors now, not over them)
  const SIGNED = [];
  for (const gp of DOOR_GAPS) {
    const vertical = gp.w < gp.h, cx = (gp.x + gp.w / 2) * M, cz = (gp.y + gp.h / 2) * M;
    const len = (vertical ? gp.h : gp.w) * M, th = (vertical ? gp.w : gp.h) * M + 0.14;
    S.add(uvScale(new THREE.PlaneGeometry(gp.w * M, gp.h * M), 0.6, 0.6), MAT.darkWood, v3(cx, 0.003, cz), 0, null, -Math.PI / 2);
    S.add(box(vertical ? th : len + 0.02, WALL_H - 2.75, vertical ? len + 0.02 : th), MAT.darkWood, v3(cx, 2.75 + (WALL_H - 2.75) / 2, cz));
    for (const s of [-1, 1]) {
      const p = vertical ? v3(cx, 1.375, cz + s * len / 2) : v3(cx + s * len / 2, 1.375, cz);
      B.add(vertical ? box(th, 2.75, 0.14) : box(0.14, 2.75, th), MAT.gold, p);
      const base = p.clone(); base.y = 0.08; B.add(vertical ? box(th + 0.04, 0.16, 0.18) : box(0.18, 0.16, th + 0.04), MAT.black, base);
    }
    B.add(vertical ? box(th + 0.02, 0.16, len + 0.14) : box(len + 0.14, 0.16, th + 0.02), MAT.gold, v3(cx, 2.78, cz));
    // keystone
    if (!SIGNED.some(([x, y]) => Math.abs(gp.x + gp.w / 2 - x) < 90 && Math.abs(gp.y + gp.h / 2 - y) < 30)) B.add(vertical ? box(th + 0.06, 0.3, 0.2) : box(0.2, 0.3, th + 0.06), MAT.gold, v3(cx, 2.95, cz));
  }

  // ---------- Walls: each side gets the look of the room it faces ----------
  yield 'Dressing the walls';
  const colLists = [];
  for (const r of WALLS) {
    const stall = r.w <= 10 || r.h <= 10;
    const h = stall ? 1.8 : WALL_H, y0 = stall ? 0.15 : 0; // stall panels stand on chrome feet, clear of the floor
    const x0 = r.x * M, x1 = (r.x + r.w) * M, z0 = r.y * M, z1 = (r.y + r.h) * M;
    const sides = [
      { n: [1, 0], at: (u) => [r.x + r.w + 8, u], c: x1, lo: r.y, hi: r.y + r.h },
      { n: [-1, 0], at: (u) => [r.x - 8, u], c: x0, lo: r.y, hi: r.y + r.h },
      { n: [0, 1], at: (u) => [u, r.y + r.h + 8], c: z1, lo: r.x, hi: r.x + r.w },
      { n: [0, -1], at: (u) => [u, r.y - 8], c: z0, lo: r.x, hi: r.x + r.w },
    ];
    for (const sd of sides) {
      const runs = [];
      for (let u = sd.lo; u < sd.hi; u += 5) {
        const room = strictRoom(...sd.at(Math.min(u + 2.5, sd.hi)));
        const last = runs[runs.length - 1];
        if (last && last.room === room) last.hi = Math.min(u + 5, sd.hi); else runs.push({ room, lo: u, hi: Math.min(u + 5, sd.hi) });
      }
      for (const run of runs) {
        if (!run.room) continue;
        const len = (run.hi - run.lo) * M, mid = (run.lo + run.hi) / 2 * M;
        const p = sd.n[0] ? [sd.c, mid] : [mid, sd.c];
        const room = run.room, m = roomMats[room], L = ROOM_LOOK[room];
        const rotY = Math.atan2(sd.n[0], sd.n[1]);
        const wt = L.wallTile || 1.2;
        S.add(uvScale(new THREE.PlaneGeometry(len, h), stall ? len / 1.2 : len / wt, stall ? h / 1.8 : h / wt), stall ? MAT.stall : m.wall, v3(p[0], y0 + h / 2, p[1]), rotY);
        if (stall || len < 0.4) continue;
        const out = (d, y) => v3(p[0] + sd.n[0] * d, y, p[1] + sd.n[1] * d);
        if (L.trim === 'deco') {
          S.add(uvScale(box(len, 1.0, 0.05), len / 2, 0.5), MAT.marble, out(0.025, 0.5), rotY);
          B.add(box(len, 0.05, 0.07), MAT.gold, out(0.05, 1.02), rotY);
          S.add(box(len, 0.16, 0.1), MAT.gold, out(0.05, WALL_H - 0.3), rotY);
          S.add(box(len, 0.12, 0.07), MAT.black, out(0.06, 0.06), rotY);
          // The arcade originally had flat neon walls. Keep its cabinet and
          // screen clearances rather than adding pilasters behind them.
          if (room !== 'arcade') colLists.push({ room, n: sd.n, p, len, rotY, horiz: !sd.n[0], c: sd.c, lo: run.lo, hi: run.hi });
        } else if (L.trim === 'tile') {
          S.add(box(len, 1.2, 0.03), MAT.marble, out(0.015, 0.6), rotY);
          S.add(box(len, 0.04, 0.05), MAT.chrome, out(0.03, 1.22), rotY);
        } else if (L.trim === 'neon') {
          S.add(box(len, 0.9, 0.04), MAT.blackGloss, out(0.02, 0.45), rotY);
          for (const [y, col] of [[0.92, 0x3fe0ff], [WALL_H - 0.45, 0xff3fa4]]) B.add(box(len, 0.03, 0.03), glowMat(col, 2.4), out(0.05, y), rotY);
        }
      }
    }
  }
  // Pilasters along the dressed walls: marble shafts with gold caps, skipped near doors.
  const pil = { shaft: box(0.36, WALL_H - 0.75, 0.12), cap: box(0.5, 0.16, 0.2), base: box(0.48, 0.3, 0.18) };
  // and none behind a sign or the tote board, or where furniture stands against the wall (sim px on the wall face)
  const NO_PIL = [[1320, 20], [513, 1200], [2980, 950], [220, 20], [420, 20], [20, 1427], [20, 1653], [471, 1880], [697, 1880], [1847, 1880], [2300, 1880], [2740, 1880], [20, 247], [20, 473], [640, 660]];
  for (const w of colLists) {
    const n = Math.floor(w.len / 4.2);
    for (let i = 1; i <= n; i++) {
      const u = w.lo + (w.hi - w.lo) * i / (n + 1);
      const sx = w.horiz ? u : w.c / M, sy = w.horiz ? w.c / M : u;
      const behindGuide = POSTERS.some(([x, y, yaw]) => {
        const dx = sx - x, dy = sy - y, nx = Math.sin(yaw), ny = Math.cos(yaw);
        // Full guide width plus half a pilaster, measured on this wall face.
        return Math.abs(dx * nx + dy * ny) < 2 && Math.abs(dx * ny - dy * nx) < 57;
      });
      if ((Math.abs(sy-720)<2 && sx>=2690 && sx<=2930) || nearGap(sx, sy, 50) || behindGuide || NO_PIL.some(([x, y]) => Math.abs(sx - x) < 15 && Math.abs(sy - y) < 15)) continue;
      const pos = (d, y) => v3(sx * M + w.n[0] * d, y, sy * M + w.n[1] * d);
      B.add(pil.shaft, MAT.marble, pos(0.07, 0.3 + (WALL_H - 0.75) / 2), w.rotY);
      B.add(pil.cap, MAT.gold, pos(0.1, WALL_H - 0.4), w.rotY);
      B.add(pil.base, MAT.darkWood, pos(0.09, 0.15), w.rotY);
      // a little sconce on every other pilaster
      if (i % 2) {
        const sm = sconceMat || (sconceMat = glowMat(0xffc080, 1.6));
        B.add(box(0.08, 0.22, 0.1), MAT.gold, pos(0.16, 2.05), w.rotY);
        B.add(lathe([[0.02, 0], [0.07, 0.13], [0.08, 0.15], [0, 0.15]], 12), sm, pos(0.22, 2.1), w.rotY);
      }
    }
  }

  const seats = makeSeats();
  for (const [label, build] of [['bar', bar], ['restrooms', restrooms], ['VIP lounge', vip], ['wall art', decor], ['pit bell', pitBell], ['seats', c => seatsAndRails(c, seats)], ['plants', plants], ['chandeliers', chandeliers], ['arcade', arcadeDressing], ['staff doors', staffDoors]]) {
    yield 'Building ' + label; build(ctx);
  }
  // what the machines add (backrooms.js keeps the games and hides the rest): their own children, glows and static batch
  const k0 = group.children.length, gm0 = GLOWS.length, MB = new Batch(true), mGroup = new THREE.Group();
  ctx.B = MB; const machines = yield* buildMachinesSteps(ctx, seats); ctx.B = B;
  group.add(mGroup);
  const machineKids = new Set(group.children.slice(k0)), machineGlows = new Set(GLOWS.slice(gm0).map(e => e.m));
  // Neon signs on the walls of the main rooms, each on a black backer (Steve, 2026-10-16: they hung too high, the lights
  // behind showed through them and they covered the doors). A room's sign hangs on the wall beside its doorway, centred
  // 2.25 m up, its own width plus 0.3 m clear of the door frame, in front of the pilasters.
  yield 'Hanging the signs';
  const beside = (doorEdge, side, w, gap = 0.3) => doorEdge * M + side * (gap + w * 0.55);
  sign('LAST CALL', 0xe2bb72, 1320 * M, 2.2, 20 * M + 0.05, 0, 4.6, 1.15);
  sign('BAR', 0xffc070, 320 * M, 2.88, 20 * M + 0.62, 0, 1.6, 0.5); // in front of the back-bar carving
  // (the restrooms named from the bar and the duck race from the arcade, between MINES and DRAGON TOWER: from the room
  // you come from; VIP stays on the lounge side, the pond leaves no room to stand in front of it on the other)
  sign('VIP', 0xd8b36e, beside(2440, -1, 1.4), 2.25, 1200 * M + 0.24, 0, 1.4, 0.36);
  sign('RESTROOMS', 0xd2b77a, beside(380, 1, 1.7, 0.45), 2.3, 700 * M - 0.24, Math.PI, 1.7, 0.26);
  sign('DUCK RACE', 0xd8b36e, beside(2560, 1, 2.0, 0.65), 2.25, 700 * M - 0.24, Math.PI, 2.0, 0.3);
  sign('SLOTS', 0xffd040, 510 * M, 2.35, 1200 * M + 0.24, 0, 1.8, 0.45);
  sign('HIGH LIMIT', 0xffd040, 1620 * M + .24, 2.5, 1270 * M, Math.PI/2, 1.8, 0.30, true, true);
  sign('DICE', 0xe2bb72, 2000 * M - .24, 2.35, 780 * M, -Math.PI/2, 1.3, 0.4); // aligned with the southern table pit
  // The coin game has its own HEADS OR TAILS title; a second wall label hid behind the coin.
  bulbsMesh(ctx);

  yield 'Batching the rooms'; S.build(group);
  yield 'Batching the furniture'; B.build(group);
  yield 'Batching the tables'; MB.build(mGroup);

  function sign(text, color, x, y, z, rotY, w, h, chase = true, suspended = false) {
    const hex = '#' + new THREE.Color(color).getHexString();
    const art = T.art2Tex('sign-' + text.toLowerCase().replace(/[^a-z]/g, ''));
    if (art) { // the generated neon sign, fitted in a box a little roomier than the lettering's
      const a = art.image.width / art.image.height, bw = w * 1.1, bh = h * 1.8;
      [w, h] = a > bw / bh ? [bw, bw / a] : [bh * a, bh];
    }
    const t = art || T.neonTexture(text, hex, 1024, Math.round(1024 * h / w), `bold italic ${Math.round(1024 * h / w * 0.6)}px Georgia`);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basicGlow(t, 1.4, { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); // (brighter washed the tubes out pale)
    m.name = 'casino-room-sign-' + text.toLowerCase().replace(/[^a-z]/g, '');
    m.position.set(x, y, z); m.rotation.y = rotY; group.add(m);
    // the black backer: nothing behind shows through the glowing tubes (additive), and the sign reads as mounted
    const fw = v3(Math.sin(rotY), 0, Math.cos(rotY)), pad = chase ? 0.2 : 0.08;
    B.add(rbox(w + pad * 2, h + pad * 2, 0.04, 0.015), MAT.signBack || (MAT.signBack = std({ color: 0x050405, roughness: 0.6 })), v3(x, y, z).addScaledVector(fw, -0.03), rotY);
    if (suspended) {
      const top = y + h / 2 + 0.08, length = WALL_H - top, rod = box(0.025, length, 0.025);
      for (const side of [-1, 1]) B.add(rod, MAT.metalDark, v3(x + Math.cos(rotY) * w * 0.4 * side, top + length / 2, z - Math.sin(rotY) * w * 0.4 * side));
    }
    anim.push(tt => { m.material.opacity = 0.9 + Math.sin(tt * 3 + x) * 0.1; });
    if (chase) { // a ring of marquee bulbs around the sign
      const nx = Math.max(4, Math.round(w / 0.22)), ny = Math.max(2, Math.round(h / 0.22));
      const right = v3(Math.cos(rotY), 0, -Math.sin(rotY)), fwd = v3(Math.sin(rotY), 0, Math.cos(rotY));
      const at = (u, v) => v3(x, y, z).addScaledVector(right, u).add(v3(0, v, 0)).addScaledVector(fwd, 0.02);
      let k = 0;
      for (let i = 0; i <= nx; i++) { bulbs.push({ p: at(-w / 2 - 0.08 + (w + 0.16) * i / nx, h / 2 + 0.08), phase: k++ }); bulbs.push({ p: at(-w / 2 - 0.08 + (w + 0.16) * i / nx, -h / 2 - 0.08), phase: k++ }); }
      for (let i = 1; i < ny; i++) { bulbs.push({ p: at(-w / 2 - 0.08, -h / 2 - 0.08 + (h + 0.16) * i / ny), phase: k++ }); bulbs.push({ p: at(w / 2 + 0.08, -h / 2 - 0.08 + (h + 0.16) * i / ny), phase: k++ }); }
    }
    return m;
  }

  let acc = {};
  return {
    group, lightSpots, seats, machines, chandeliers: ctx.chandeliers, machineKids, machineGlows,
    update(t, dt, state) {
      mirrorFrame();
      anim.forEach((a, i) => {
        if (typeof a === 'function') return a(t, dt, state);
        acc[i] = (acc[i] || 0) + dt; if (acc[i] >= a.every) { acc[i] = 0; a.f(t, state); }
      });
      machines.update(t, dt, state);
    },
  };
}
let sconceMat = null;

// ---------- Bar ----------
function bar(ctx) {
  const { S, B, group } = ctx;
  const o = OBSTACLES.find(o => o.kind === 'counter');
  const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M, w = o.w * M, d = o.h * M;
  if (hasProp('barCounter')) { // counter sections side by side
    const n = Math.max(1, Math.round(w / 2)), sw = w / n;
    placeProps(group, 'barCounter', Array.from({ length: n }, (_, i) => ({ x: o.x * M + sw * (i + 0.5), z: cz + 0.05, fit: [sw + 0.01, 1.08, d + 0.2], stretch: true })));
  } else {
    B.add(uvScale(box(w, 1.0, d), w, 1), MAT.darkWood, v3(cx, 0.5, cz));
    B.add(rbox(w + 0.14, 0.08, d + 0.2, 0.03), MAT.polished, v3(cx, 1.04, cz + 0.04));
    for (let x = o.x + 20; x < o.x + o.w - 10; x += 40) B.add(box(0.05, 0.8, 0.02), MAT.gold, v3(x * M, 0.5, (o.y + o.h) * M + 0.005));
    B.add(cyl(0.025, 0.025, w, 10), MAT.brass, v3(cx, 0.2, (o.y + o.h) * M + 0.22), 0, null, 0, Math.PI / 2);
  }
  // bar stools along the front
  const stools = [];
  for (let x = o.x + 40; x < o.x + o.w; x += 70) {
    const sx = x * M, sz = (o.y + o.h) * M + 0.45;
    if (Math.abs(x - TAP.x) < 50) continue;
    if (hasProp('stool')) { stools.push({ x: sx, z: sz, yaw: Math.PI, fit: [0.42, 0, 0.42], top: 0.82 }); continue; }
    B.add(cyl(0.2, 0.2, 0.09, 18), MAT.velvet, v3(sx, 0.78, sz)); B.add(cyl(0.03, 0.03, 0.75, 8), MAT.brass, v3(sx, 0.38, sz));
    B.add(cyl(0.2, 0.22, 0.03, 18), MAT.brass, v3(sx, 0.015, sz)); B.add(torus(0.15, 0.012, 6, 20), MAT.brass, v3(sx, 0.3, sz), 0, null, Math.PI / 2);
  }
  if (stools.length) placeProps(group, 'stool', stools);
  for (let i = 0; i < 3; i++) { // beer taps at the pour spot
    const x = (TAP.x - 20 + i * 20) * M, z = (o.y + o.h - 8) * M;
    B.add(cyl(0.02, 0.02, 0.3, 8), MAT.brass, v3(x, 1.22, z)); B.add(cyl(0.012, 0.012, 0.18, 8), MAT.black, v3(x, 1.42, z)); B.add(sph(0.03, 8), MAT.brass, v3(x, 1.36, z + 0.05));
  }
  // back bar: cabinet, mirror, lit shelves of bottles
  const bz = 20 * M;
  if (hasProp('backBar')) {
    const n = Math.max(1, Math.round(w / 2.2)), sw = w / n;
    placeProps(group, 'backBar', Array.from({ length: n }, (_, i) => ({ x: o.x * M + sw * (i + 0.5), z: bz + 0.26, fit: [sw + 0.01, 2.6, 0.5], stretch: true })));
  } else backBarHandmade(ctx, o, cx, w, bz);
  // high-top tables
  const tops = OBSTACLES.filter(o => o.kind === 'hightop').map(h => ({ x: (h.x + h.w / 2) * M, z: (h.y + h.h / 2) * M }));
  if (hasProp('hightop')) placeProps(group, 'hightop', tops.map(t => ({ ...t, fit: [0.76, 0, 0.76], top: 1.075 })));
  else for (const { x, z } of tops) {
    B.add(cyl(0.38, 0.38, 0.05, 28), MAT.polished, v3(x, 1.05, z)); B.add(torus(0.38, 0.015, 6, 32), MAT.gold, v3(x, 1.05, z), 0, null, Math.PI / 2);
    B.add(cyl(0.05, 0.05, 1.0, 10), MAT.brass, v3(x, 0.52, z)); B.add(cyl(0.25, 0.28, 0.04, 20), MAT.brass, v3(x, 0.02, z));
    const lamp = new THREE.Mesh(sph(0.06, 12), glowMat(0xffb060, 2.5)); lamp.position.set(x, 1.13, z); group.add(lamp);
  }
  ctx.lightSpots.push({ p: v3(cx, 2.4, bz + 1.0), color: 0xffb060, power: 4, range: 6 });
}
// The hand-built back bar: cabinet, mirror, lit shelves of bottles.
function backBarHandmade(ctx, o, cx, w, bz) {
  const { S, B, group } = ctx;
  B.add(box(w, 0.9, 0.45), MAT.darkWood, v3(cx, 0.45, bz + 0.225));
  S.add(box(w, 1.5, 0.02), MAT.mirror, v3(cx, 1.75, bz + 0.01));
  for (const y of [1.25, 1.7, 2.15]) { B.add(box(w, 0.04, 0.3), MAT.polished, v3(cx, y, bz + 0.15)); B.add(box(w, 0.012, 0.02), glowMat(0xffb060, 2), v3(cx, y + 0.03, bz + 0.29)); }
  const bottle = lathe([[0, 0], [0.045, 0], [0.05, 0.02], [0.05, 0.2], [0.03, 0.25], [0.016, 0.3], [0.016, 0.36], [0, 0.36]], 10);
  const cols = [0x2a7a3a, 0x8a2a1a, 0xc8a050, 0x5a3a8a, 0xd9f0c8, 0x6ab0e8, 0xb8692a, 0xe8e0d0];
  const inst = new THREE.InstancedMesh(bottle, phys({ roughness: 0.05, transmission: 0, transparent: true, opacity: 0.85, clearcoat: 1 }), 90);
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  let i = 0, seed = 1; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const y of [1.27, 1.72, 2.17]) for (let k = 0; k < 30; k++) {
    const s = 0.85 + rr() * 0.4;
    mtx.compose(v3((o.x + 12 + k * (o.w - 24) / 29) * M, y, bz + 0.12 + rr() * 0.08), new THREE.Quaternion(), v3(s, s, s));
    inst.setMatrixAt(i, mtx); inst.setColorAt(i, col.setHex(cols[Math.floor(rr() * cols.length)])); i++;
  }
  group.add(inst);
}

// ---------- Restrooms ----------
function restrooms(ctx) {
  const { B, S, group } = ctx;
  const o = OBSTACLES.find(o => o.kind === 'sinks');
  const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M;
  const sinks = hasProp('sink');
  if (sinks) { // one vanity unit per basin, facing into the room
    const n = 4, uw = o.h * M / n;
    placeProps(group, 'sink', Array.from({ length: n }, (_, i) => ({ x: cx, z: o.y * M + uw * (i + 0.5), yaw: Math.PI / 2, fit: [uw + 0.01, 0.92, o.w * M + 0.04], stretch: true })));
  } else {
    B.add(box(o.w * M, 0.85, o.h * M), MAT.darkWood, v3(cx, 0.425, cz));
    B.add(box(o.w * M + 0.06, 0.05, o.h * M + 0.04), MAT.marble, v3(cx + 0.02, 0.875, cz));
  }
  for (let y = o.y + 32.5; y < o.y + o.h; y += 65) {
    if (!sinks) {
      B.add(lathe([[0, 0], [0.12, 0.01], [0.17, 0.08], [0.18, 0.1], [0, 0.1]], 20), MAT.porcelain, v3(cx + 0.05, 0.82, y * M), 0, v3(1, 1, 1.3));
      B.add(cyl(0.015, 0.015, 0.22, 8), MAT.chrome, v3(cx - 0.12, 1.0, y * M)); B.add(cyl(0.012, 0.012, 0.14, 8), MAT.chrome, v3(cx - 0.06, 1.1, y * M), 0, null, 0, Math.PI / 2);
    }
    B.add(box(0.03, 0.04, 0.6), glowMat(0xe0fff8, 1.5), v3(20 * M + 0.05, 2.02, y * M));
  }
  // one long mirror over the basins, at face height (Steve, 2026-10-16: they hung too high and reflected nothing): a real
  // reflection (mirror.js), in a gold frame
  const len = o.h * M - 0.12, mh = 0.78;
  S.add(box(0.03, mh + 0.1, len + 0.1), MAT.gold, v3(20 * M + 0.015, 1.5, cz));
  const glass = makeMirror(new THREE.PlaneGeometry(len, mh), { aspect: len / mh, size: 1024 });
  glass.position.set(20 * M + 0.034, 1.5, cz); glass.rotation.y = Math.PI / 2; group.add(glass);
  if (hasProp('toilet')) placeProps(group, 'toilet', [320, 440, 560].map(x => ({ x: x * M, z: 1150 * M + 0.08, yaw: Math.PI, fit: [0.5, 0.82, 0.74] })));
  else for (const x of [320, 440, 560]) {
    const z = 1150 * M, sx = x * M;
    B.add(lathe([[0, 0], [0.16, 0], [0.18, 0.2], [0.22, 0.38], [0.2, 0.42], [0, 0.42]], 20), MAT.porcelain, v3(sx, 0, z), 0, v3(1, 1, 1.25));
    B.add(rbox(0.4, 0.4, 0.18, 0.04), MAT.porcelain, v3(sx, 0.6, z + 0.2));
  }
  for (const x of [260, 380, 500]) {
    const sx = (x + 5) * M, w = 10 * M, z0 = 1060 * M, z1 = 1180 * M;
    B.add(box(0.04, 0.06, 2.0), MAT.chrome, v3(sx, 2.0, 1120 * M)); // the head rail
    B.add(box(w + 0.02, 0.03, z1 - z0), MAT.chrome, v3(sx, 1.965, (z0 + z1) / 2)); // a capped top edge
    B.add(box(w + 0.04, 2.0, 0.06), MAT.stall, v3(sx, 1.0, z0 + 0.03)); // the front post, floor to rail
    B.add(box(w + 0.06, 0.04, 0.08), MAT.chrome, v3(sx, 0.02, z0 + 0.03)); // its shoe
    for (const z of [z0 + 0.35, z1 - 0.25]) B.add(cyl(0.025, 0.03, 0.15, 10), MAT.chrome, v3(sx, 0.075, z)); // feet
    B.add(box(0.012, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: 0x3fd07a }), v3(sx + w / 2 + 0.008, 1.15, z0 + 0.12)); // a VACANT dot by the latch
  }
}

// ---------- VIP lounge ----------
function vip(ctx) {
  const { B, group } = ctx;
  const o = OBSTACLES.find(o => o.kind === 'coffee');
  const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M;
  B.add(rbox(o.w * M, 0.06, o.h * M, 0.02), MAT.marbleDark, v3(cx, 0.45, cz));
  B.add(box(o.w * M - 0.2, 0.42, o.h * M - 0.2), MAT.gold, v3(cx, 0.21, cz));
  B.add(cyl(0.12, 0.09, 0.25, 16), MAT.chrome, v3(cx + 0.5, 0.6, cz));
  B.add(cyl(0.03, 0.04, 0.35, 10), std({ color: 0x1a4a2a, roughness: 0.1 }), v3(cx + 0.5, 0.75, cz));
  for (const c of OBSTACLES.filter(o => o.kind === 'couch')) {
    const x = (c.x + c.w / 2) * M, z = (c.y + c.h / 2) * M, w = c.w * M;
    if (hasProp('couch')) { placeProps(group, 'couch', [-1, 1].map(k => ({ x: x + k * w / 4, z: z + 0.02, yaw: Math.PI, fit: [w / 2 - 0.04, 0.9, 0.74], stretch: true }))); continue; }
    B.add(rbox(w, 0.42, 0.6, 0.08), MAT.purple, v3(x, 0.21, z - 0.04));
    B.add(rbox(w, 0.6, 0.18, 0.08), MAT.purple, v3(x, 0.6, z + 0.2));
    for (const s of [-1, 1]) B.add(rbox(0.18, 0.55, 0.6, 0.08), MAT.purple, v3(x + s * w / 2, 0.38, z - 0.02));
    for (let k = -1; k <= 1; k++) B.add(rbox(w / 3 - 0.04, 0.12, 0.5, 0.05), MAT.purple, v3(x + k * w / 3, 0.47, z - 0.06));
  }
  // velvet rope at the VIP door from the duck pond, and a rug
  for (const x of [2410, 2590]) { B.add(cyl(0.03, 0.03, 0.95, 10), MAT.gold, v3(x * M, 0.475, 1235 * M)); B.add(sph(0.05, 10), MAT.gold, v3(x * M, 0.97, 1235 * M)); B.add(cyl(0.16, 0.16, 0.03, 16), MAT.gold, v3(x * M, 0.015, 1235 * M)); }
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), std({ color: 0x320912, roughness: 0.95 })); rug.rotation.x = -Math.PI / 2; rug.position.set(cx, 0.006, cz); rug.receiveShadow = true; group.add(rug);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.25, 2.33, 64), MAT.gold); ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.008, cz); group.add(ring);
  // a big TV on the east wall
  B.add(rbox(0.08, 1.3, 2.3, 0.02), MAT.blackGloss, v3(2980 * M - 0.05, 1.9, 1540 * M));
  ctx.vipTv = { x: 2980 * M - 0.1, y: 1.9, z: 1540 * M, w: 2.15, h: 1.2 };
  // Piano and bench share the same reference as their full collision footprint.
  const px = PIANO.x * M, pz = PIANO.y * M;
  if (hasProp('piano')) { placeProps(group, 'piano', [{ x: px, z: pz - 0.15, yaw: PROP_YAW.piano, fit: [1.7, 0, 1.75] }]); return; }
  B.add(rbox(1.5, 0.35, 1.0, 0.1), MAT.blackGloss, v3(px, 0.9, pz)); B.add(box(1.4, 0.06, 0.3), MAT.porcelain, v3(px, 0.92, pz - 0.6));
  for (const [dx, dz] of [[-0.6, -0.35], [0.6, -0.35], [0, 0.35]]) B.add(cyl(0.05, 0.04, 0.75, 10), MAT.blackGloss, v3(px + dx, 0.38, pz + dz));
}

// ---------- Dressing: booths, jukebox, ottoman, pool table, champagne tower, rugs and paintings ----------
const ob = kind => OBSTACLES.filter(o => o.kind === kind).map(o => ({ x: (o.x + o.w / 2) * M, z: (o.y + o.h / 2) * M, w: o.w * M, d: o.h * M }));
function painting(kind, seed) {
  const [c, g] = T.canvas(256, 320); let s = seed * 9301 + 49297; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  if (kind === 0) { // portrait of a distinguished bean
    g.fillStyle = ['#2a3a5a', '#4a2a3a', '#2a4a3a'][seed % 3]; g.fillRect(0, 0, 256, 320);
    const rg = g.createRadialGradient(128, 140, 10, 128, 160, 200); rg.addColorStop(0, 'rgba(255,230,180,0.35)'); rg.addColorStop(1, 'rgba(0,0,0,0.4)'); g.fillStyle = rg; g.fillRect(0, 0, 256, 320);
    g.fillStyle = ['#e8443a', '#3ddc97', '#f4e04d', '#a066ff', '#ff8c2e'][seed % 5]; g.beginPath(); g.ellipse(128, 215, 78, 118, 0, 0, 7); g.fill();
    g.fillStyle = '#f3ead8'; g.beginPath(); g.ellipse(140, 150, 50, 32, 0, 0, 7); g.fill();
    g.fillStyle = '#151015'; g.beginPath(); g.arc(124, 148, 7, 0, 7); g.arc(156, 148, 7, 0, 7); g.fill();
    g.fillRect(78, 52, 100, 14); g.fillRect(92, 0, 72, 56); // top hat
    g.strokeStyle = '#d9a94a'; g.lineWidth = 4; g.beginPath(); g.arc(156, 150, 13, 0, 7); g.stroke(); // monocle
  } else if (kind === 1) { // deco sunburst
    g.fillStyle = '#14121e'; g.fillRect(0, 0, 256, 320);
    for (let i = 0; i < 24; i++) { const a0 = Math.PI + i / 24 * Math.PI, a1 = a0 + Math.PI / 48; g.fillStyle = i % 2 ? '#d9a94a' : '#8a5a20'; g.beginPath(); g.moveTo(128, 260); g.arc(128, 260, 240, a0, a1); g.fill(); }
    g.fillStyle = '#e8c46a'; g.beginPath(); g.arc(128, 260, 60, Math.PI, 0); g.fill(); g.fillStyle = '#14121e'; g.fillRect(0, 260, 256, 60);
    g.strokeStyle = '#d9a94a'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(20, 275 + i * 10); g.lineTo(236, 275 + i * 10); g.stroke(); }
  } else if (kind === 2) { // still life: dice, cherries and a cocktail
    g.fillStyle = '#3a1a20'; g.fillRect(0, 0, 256, 320); g.fillStyle = '#5a2a20'; g.fillRect(0, 210, 256, 110);
    g.fillStyle = '#f8f4ec'; g.save(); g.translate(70, 220); g.rotate(-0.2); g.fillRect(-28, -28, 56, 56); g.restore();
    g.fillStyle = '#c0302a'; for (const [x, y] of [[62, 210], [78, 228], [70, 220]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
    g.fillStyle = '#e0203a'; g.beginPath(); g.arc(170, 235, 18, 0, 7); g.arc(200, 240, 18, 0, 7); g.fill();
    g.strokeStyle = '#2a6a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(170, 218); g.quadraticCurveTo(185, 170, 205, 160); g.lineTo(200, 222); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(100, 90); g.lineTo(160, 90); g.lineTo(130, 140); g.closePath(); g.moveTo(130, 140); g.lineTo(130, 190); g.moveTo(110, 192); g.lineTo(150, 192); g.stroke();
    g.fillStyle = 'rgba(255,90,140,0.7)'; g.beginPath(); g.moveTo(106, 96); g.lineTo(154, 96); g.lineTo(130, 134); g.fill();
  } else { // a night skyline with a neon sign
    const lg = g.createLinearGradient(0, 0, 0, 320); lg.addColorStop(0, '#0a0a2a'); lg.addColorStop(1, '#5a1a4a'); g.fillStyle = lg; g.fillRect(0, 0, 256, 320);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.8})`; g.fillRect(r() * 256, r() * 140, 2, 2); }
    for (let x = 0; x < 256; x += 32) { const h = 80 + r() * 140; g.fillStyle = '#120a1a'; g.fillRect(x, 320 - h, 30, h); g.fillStyle = '#ffd040'; for (let k = 0; k < 8; k++) if (r() > 0.5) g.fillRect(x + 6 + (k % 2) * 12, 320 - h + 10 + Math.floor(k / 2) * 18, 6, 8); }
    g.fillStyle = '#ff3fa4'; g.font = '900 28px Arial Black, sans-serif'; g.textAlign = 'center'; g.shadowColor = '#ff3fa4'; g.shadowBlur = 12; g.fillText('LAST CALL', 128, 120);
  }
  return T.tex(c, false);
}
function decor(ctx) {
  const { B, group } = ctx;
  const add = (m, p) => { m.position.copy(p); group.add(m); return m; };
  // bar booths: two benches facing each other with a table between, against the west wall
  for (const o of ob('booth')) {
    if (hasProp('booth')) placeProps(group, 'booth', [-1, 1].map(s => ({ x: o.x, z: o.z + s * (o.d / 2 - 0.27), yaw: s < 0 ? 0 : Math.PI, fit: [o.w, 1.1, 0.56], stretch: true })));
    else for (const s of [-1, 1]) {
      B.add(rbox(o.w, 0.45, 0.42, 0.06), MAT.velvet, v3(o.x, 0.225, o.z + s * (o.d / 2 - 0.22))); B.add(rbox(o.w, 0.75, 0.14, 0.06), MAT.velvet, v3(o.x, 0.75, o.z + s * (o.d / 2 - 0.05)));
      for (let k = -1; k <= 1; k++) B.add(sph(0.025, 8), MAT.gold, v3(o.x + k * o.w / 3, 0.85, o.z + s * (o.d / 2 - 0.13)));
    }
    B.add(rbox(o.w - 0.2, 0.05, 0.6, 0.02), MAT.polished, v3(o.x + 0.05, 0.75, o.z)); B.add(cyl(0.05, 0.05, 0.72, 10), MAT.brass, v3(o.x + 0.05, 0.37, o.z));
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.14, 14, 1, true), glowMat(0xffb060, 1.8, { side: THREE.DoubleSide })), v3(o.x + 0.1, 0.84, o.z));
  }
  // jukebox against the south wall
  for (const o of ob('jukebox')) {
    // A clean physical cabinet: all type and song labels are drawn from real text.
    const fz = o.z - o.d / 2 - 0.012, w = o.w, front = fz - 0.014;
    B.add(rbox(w, 1.3, o.d, 0.09), MAT.darkWood, v3(o.x, 0.65, o.z));
    B.add(rbox(w - 0.10, 1.20, 0.035, 0.06), MAT.brass, v3(o.x, 0.68, fz));
    B.add(rbox(w - 0.17, 1.1, 0.035, 0.04), MAT.blackGloss, v3(o.x, 0.68, front));
    const arch = new THREE.Mesh(new THREE.TorusGeometry(w / 2 - 0.06, 0.032, 8, 48, Math.PI), glowMat(0xffc775, 1.5));
    arch.name = 'jukebox-arch'; add(arch, v3(o.x, 1.22, front));
    for (const side of [-1, 1]) B.add(box(0.035, 0.92, 0.035), glowMat(0xffc775, 1.4), v3(o.x + side * (w / 2 - 0.06), 0.76, front));
    const face = (text, width, height, y, font = 'bold 48px Georgia') => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: T.plaque(text, { w: 1024, h: 160, bg: '#131916', ink: '#e9d9ad', font }), toneMapped: false }));
      mesh.name = 'jukebox-label-' + text; mesh.rotation.y = Math.PI; add(mesh, v3(o.x, y, front - 0.028)); return mesh;
    };
    const marquee = T.art2Tex('jukebox-marquee-v2');
    if (marquee) { const sign = new THREE.Mesh(new THREE.PlaneGeometry(w - .18, (w - .18) / 3), new THREE.MeshBasicMaterial({ map: marquee, toneMapped: false })); sign.name = 'jukebox-generated-marquee'; sign.rotation.y = Math.PI; add(sign, v3(o.x, 1.08, front - .03)); }
    else face('LAST CALL', w - .22, .16, 1.1, '600 88px Cinzel');
    // Song-selection strips behind glass, followed by a dark brass speaker grille.
    for (let i = 0; i < 4; i++) face(['A1  MIDNIGHT','A2  SMOKE & VELVET','B1  LAST ROUND','B2  HOUSE LIGHTS'][i], w - 0.28, 0.055, 0.86 - i * 0.07, '32px Arial');
    B.add(rbox(w - 0.24, 0.34, 0.025, 0.03), MAT.black, v3(o.x, 0.34, front - 0.02));
    for (let i = 0; i < 13; i++) B.add(box(0.012, 0.29, 0.018), MAT.brass, v3(o.x + (i - 6) * (w - 0.30) / 13, 0.34, front - 0.04));
    B.add(box(w - 0.16, 0.05, o.d + 0.02), MAT.brass, v3(o.x, 0.08, o.z));
  }

  B.add(rbox(.10,2.0,1.7,.025),MAT.darkWood,v3((SHADY.x+25)*M,1,SHADY.y*M));
  const shopSign=new THREE.Mesh(new THREE.PlaneGeometry(1.5,.30),basicGlow(T.plaque('HOUSE INSURANCE',{w:1024,h:200,bg:'#142b25',ink:'#edcc84',font:'bold 78px Georgia'}),1));
  shopSign.name='shady-shop-sign';shopSign.rotation.y=-Math.PI/2;shopSign.position.set((SHADY.x+20)*M,1.9,SHADY.y*M);group.add(shopSign);
  // the shady guy's stock in the corner beside him: a big pine crate with a smaller one on top, dark wood frames
  for (const o of ob('crates')) {
    const crate = (w, h, d, x, y, z, yaw) => {
      B.add(box(w - 0.04, h - 0.04, d - 0.04), MAT.wood, v3(x, y + h / 2, z), yaw);
      const c = Math.cos(yaw), sn = Math.sin(yaw), at = (dx, dy, dz) => v3(x + dx * c + dz * sn, y + dy, z - dx * sn + dz * c);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add(box(0.05, h, 0.05), MAT.darkWood, at(sx * (w / 2 - 0.025), h / 2, sz * (d / 2 - 0.025)), yaw);
      for (const fy of [0.03, h / 2, h - 0.03]) for (const sz of [-1, 1]) B.add(box(w, 0.05, 0.03), MAT.darkWood, at(0, fy, sz * (d / 2 - 0.005)), yaw); // slats front and back
      for (const fy of [0.03, h - 0.03]) for (const sx of [-1, 1]) B.add(box(0.03, 0.05, d), MAT.darkWood, at(sx * (w / 2 - 0.005), fy, 0), yaw);
    };
    crate(o.w - 0.04, 0.62, o.d - 0.04, o.x, 0, o.z, 0.05);
    crate(0.5, 0.36, 0.42, o.x - 0.04, 0.62, o.z + 0.03, -0.3);
  }
  // round velvet ottoman in the slot hall (the palm in the middle is in PLANTS)
  for (const o of ob('ottoman')) {
    if (hasProp('ottoman')) { placeProps(group, 'ottoman', [{ x: o.x, z: o.z, fit: [o.w, 0, o.w] }]); continue; }
    B.add(cyl(o.w / 2, o.w / 2 + 0.02, 0.42, 40), MAT.velvet, v3(o.x, 0.21, o.z)); B.add(torus(o.w / 2, 0.035, 8, 48), MAT.velvet, v3(o.x, 0.42, o.z), 0, null, Math.PI / 2);
    B.add(cyl(o.w / 2 + 0.03, o.w / 2 + 0.03, 0.05, 40), MAT.gold, v3(o.x, 0.025, o.z));
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; B.add(sph(0.02, 6), MAT.gold, v3(o.x + Math.cos(a) * (o.w / 2 - 0.12), 0.44, o.z + Math.sin(a) * (o.w / 2 - 0.12))); }
  }
  // pool table
  const felt = std({ color: 0x1a6a3a, roughness: 0.9 });
  for (const o of ob('pool')) {
    if (hasProp('poolTable')) placeProps(group, 'poolTable', [{ x: o.x, z: o.z, yaw: PROP_YAW.poolTable, fit: [o.w, 0, o.d], stretch: true, top: 0.8 }]);
    else {
    B.add(rbox(o.w, 0.25, o.d, 0.05), MAT.darkWood, v3(o.x, 0.66, o.z)); B.add(box(o.w - 0.24, 0.02, o.d - 0.24), felt, v3(o.x, 0.79, o.z));
    for (const s of [-1, 1]) { B.add(rbox(o.w, 0.06, 0.13, 0.03), MAT.polished, v3(o.x, 0.8, o.z + s * (o.d / 2 - 0.06))); B.add(rbox(0.13, 0.06, o.d, 0.03), MAT.polished, v3(o.x + s * (o.w / 2 - 0.06), 0.8, o.z)); }
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add(cyl(0.07, 0.05, 0.55, 12), MAT.darkWood, v3(o.x + dx * (o.w / 2 - 0.15), 0.27, o.z + dz * (o.d / 2 - 0.15)));
    [0xf8f4ec, 0xf4c020, 0x2050c0, 0xc0302a, 0x6a2a9a, 0xff7a20, 0x1a8a3a, 0x8a1a1a, 0x151515].forEach((c, i) =>
      B.add(sph(0.029, 12), MAT.candy(c), v3(o.x + (i ? 0.45 + Math.floor((i - 1) / 3) * 0.055 : -0.5), 0.82, o.z + (i ? ((i - 1) % 3 - 1) * 0.06 : 0))));
    B.add(cyl(0.008, 0.014, 1.45, 8), MAT.wood, v3(o.x - 0.2, 0.83, o.z + 0.25), 0.3, null, 0, Math.PI / 2);
    }
    for (const dx of [-0.5, 0.5]) { add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.2, 20, 1, true), glowMat(0x3a8a5a, 0.6, { side: THREE.DoubleSide })), v3(o.x + dx, 2.3, o.z)); B.add(cyl(0.006, 0.006, 0.9, 4), MAT.metalDark, v3(o.x + dx, 2.85, o.z)); }
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(o.w + 1.6, o.d + 1.4), std({ color: 0x320912, roughness: 0.95 })); rug.rotation.x = -Math.PI / 2; rug.receiveShadow = true; add(rug, v3(o.x, 0.006, o.z));
  }
  // champagne tower
  const coupe = lathe([[0, 0], [0.04, 0], [0.008, 0.01], [0.006, 0.08], [0.055, 0.1], [0.06, 0.125], [0.055, 0.125], [0.0, 0.105]], 16);
  const glassMat = phys({ color: 0xfff0c0, roughness: 0.05, transparent: true, opacity: 0.6, clearcoat: 1 });
  for (const o of ob('champagne')) {
    if (hasProp('champagne')) { placeProps(group, 'champagne', [{ x: o.x, z: o.z, fit: [o.w * 1.05, 0, o.w * 1.05] }]); continue; }
    B.add(cyl(o.w / 2, o.w / 2, 0.05, 32), MAT.marble, v3(o.x, 0.8, o.z)); B.add(cyl(0.06, 0.1, 0.78, 14), MAT.gold, v3(o.x, 0.39, o.z));
    const spots = []; for (let L = 0; L < 4; L++) { const n = 4 - L; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) spots.push([(i - (n - 1) / 2) * 0.12, 0.825 + L * 0.125, (j - (n - 1) / 2) * 0.12]); }
    const im = new THREE.InstancedMesh(coupe, glassMat, spots.length);
    spots.forEach(([dx, y, dz], i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(o.x + dx, y, o.z + dz))); group.add(im);
    B.add(cyl(0.035, 0.04, 0.25, 12), std({ color: 0x1a4a2a, roughness: 0.1, metalness: 0.2 }), v3(o.x, 1.45, o.z));
  }
  if (!hasProp('piano')) B.add(rbox(0.7, 0.08, 0.32, 0.03), MAT.blackGloss, v3(PIANO.x*M, 0.48, (PIANO.y-60)*M)); // the piano's bench
  // a rug in the bar
  const [rc, rg] = T.canvas(256, 256);
  rg.fillStyle = '#4a1418'; rg.fillRect(0, 0, 256, 256); rg.strokeStyle = '#d9a94a'; rg.lineWidth = 6; rg.strokeRect(12, 12, 232, 232); rg.lineWidth = 2; rg.strokeRect(24, 24, 208, 208);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; rg.fillStyle = '#7a2a20'; rg.beginPath(); rg.ellipse(128 + Math.cos(a) * 60, 128 + Math.sin(a) * 60, 28, 12, a, 0, 7); rg.fill(); }
  rg.fillStyle = '#d9a94a'; rg.beginPath(); rg.arc(128, 128, 22, 0, 7); rg.fill();
  const barRug = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), std({ map: T.tex(rc, false), roughness: 0.95 })); barRug.rotation.x = -Math.PI / 2; barRug.receiveShadow = true; add(barRug, v3(300 * M, 0.006, 470 * M));
  // paintings: [x, y (sim px, a wall's inner face), yaw (the way the picture faces), kind]
  const ART = [[20, 291, Math.PI / 2, 0], [20, 525, Math.PI / 2, 3], [640, 480, Math.PI / 2, 1], [2000, 615, -Math.PI / 2, 1], [640, 205, Math.PI / 2, 0], [2000, 205, -Math.PI / 2, 2],
    [2275, 1200, 0, 0], [2725, 1200, 0, 2], [2460, 1880, Math.PI, 3], [2800, 1880, Math.PI, 0], [620, 515, -Math.PI / 2, 2]];
  ART.forEach(([px, py, yaw, kind], i) => {
    const nx = Math.sin(yaw), nz = Math.cos(yaw), x = px * M, z = py * M;
    B.add(rbox(1.0, 1.24, 0.06, 0.02), MAT.gold, v3(x + nx * 0.03, 1.75, z + nz * 0.03), yaw);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 1.05), std({ map: T.art2Tex(PAINTINGS[i]) || painting(kind, i + 1), roughness: 0.6 }));
    pic.name = 'casino-painting-' + i;
    pic.rotation.y = yaw; add(pic, v3(x + nx * 0.065, 1.75, z + nz * 0.065));
    const lamp = new THREE.Mesh(cyl(0.025, 0.025, 0.5, 10), glowMat(0xffe0b0, 1.5)); lamp.rotation.set(0, yaw, Math.PI / 2, 'YXZ'); add(lamp, v3(x + nx * 0.14, 2.42, z + nz * 0.14));
  });
  // Crisp house guides: [x, y (a wall's inner face), yaw, name, framed].
  for (const [px, py, yaw, name, framed] of POSTERS) {
    const map = casinoGuide(name);
    const nx = Math.sin(yaw), nz = Math.cos(yaw), x = px * M, z = py * M, h = name === 'wash' ? 1.75 : 1.95, w = h * map.image.width / map.image.height, hy = name === 'wash' ? 2.13 : 2.07; // full guide clears the chair rail / restroom tile trim
    if (framed) B.add(box(w + 0.08, h + 0.08, 0.03), MAT.black, v3(x + nx * 0.015, hy, z + nz * 0.015), yaw);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map, roughness: framed ? 0.35 : 0.8 }));
    pic.name = 'casino-guide-' + name;
    pic.rotation.y = yaw; add(pic, v3(x + nx * (framed ? 0.035 : 0.012), hy, z + nz * (framed ? 0.035 : 0.012)));
  }
}
// Wall instructions are actual typography, rendered at native texture resolution.
function casinoGuide(name) {
  const guides = {
    derby: ['DUCK DERBY', 'PICK A LANE. BACK YOUR BIRD.', ['Choose a numbered duck lane.', 'Click its numbered circle to place chips.', 'Press the green START button to enter.', 'Watch the finish. First duck pays.']],
    rocket: ['ROCKET RUN', 'HOW HIGH WILL YOU GO?', ['Place chips on the betting circle.', 'Press SPACE while bets are open.', 'Watch your multiplier climb.', 'Press SPACE to cash out in flight.']],
    roulette: ['ROULETTE', 'A LITTLE LUCK GOES A LONG WAY.', ['Place chips on numbers or colours.', 'Scroll to change your chip value.', 'Click the wheel to spin.', 'Wait for the ball to settle.']],
    jackpot: ['LUCKY SLOTS', 'THREE OF A KIND. ONE BIG NIGHT.', ['Place chips on the betting circle.', 'Pull the machine lever to spin.', 'Matching symbols pay the prize.', 'Change your chip before the next spin.']],
    lounge: ['HEADS OR TAILS', 'CALL IT. FLIP IT. RIDE YOUR LUCK.', ['Choose HEADS or TAILS with your chips.', 'Click the giant coin to flip.', 'A correct call doubles your stake.', 'TAKE your winnings or flip again.']],
    cocktails: ['HOUSE COCKTAILS', 'EVERY GOOD ALIBI STARTS AT THE BAR.', ['Walk up to the bartender.', 'Left-click to choose your drink.', 'Press F to take a sip.', 'Check suspicious drinks with R.']],
    missing: ['STAY SHARP', 'SOMEONE HERE IS NOT A GAMBLER.', ['Watch who leaves the table.', 'Space marks someone you suspect.', 'Left-click a body to report it.', 'Ghosts can watch the cameras with C.']],
    wash: ['A CLEAN GETAWAY', 'SOME DRINKS LEAVE A BITTER TASTE.', ['Feeling ill? Find the restroom sink.', 'Walk close and left-click the sink.', 'Check snacks and drinks with R.', 'Keep your eyes on your glass.']]
  };
  const [title, strap, steps] = guides[name] || guides.roulette;
  const [c, g] = T.canvas(1200, 1600); g.fillStyle = '#101d1d'; g.fillRect(0, 0, 1200, 1600);
  g.strokeStyle = '#d5b776'; g.lineWidth = 12; g.strokeRect(28, 28, 1144, 1544); g.lineWidth = 2; g.strokeRect(48, 48, 1104, 1504);
  g.textAlign = 'center'; g.fillStyle = '#c5aa72'; g.font = '32px Arial'; g.fillText('LAST CALL  /  HOUSE GUIDE', 600, 135);
  g.fillStyle = '#fff0cc'; g.font = 'bold 90px Georgia'; g.fillText(title, 600, 282, 1050);
  g.fillStyle = '#93cbc2'; g.font = 'bold 30px Arial'; g.fillText(strap, 600, 355, 1030);
  for (let i = 0; i < steps.length; i++) {
    const y = 525 + i * 230;
    g.fillStyle = '#d5b776'; g.beginPath(); g.arc(145, y, 52, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#101d1d'; g.font = 'bold 56px Arial'; g.fillText(String(i + 1), 145, y + 20);
    g.fillStyle = '#f5f0df'; g.font = 'bold 64px Arial'; g.textAlign = 'left';
    const words = steps[i].split(' '); let line = '', lines = [];
    for (const word of words) { if (g.measureText(line + word).width > 800) { lines.push(line.trim()); line = ''; } line += word + ' '; } lines.push(line.trim());
    lines.forEach((text, j) => g.fillText(text, 245, y - (lines.length - 1) * 34 + j * 72 + 18)); g.textAlign = 'center';
    if (i < 3) { g.strokeStyle = '#37514c'; g.beginPath(); g.moveTo(245, y + 105); g.lineTo(1080, y + 105); g.stroke(); }
  }
  g.fillStyle = '#c5aa72'; g.font = '28px Arial'; g.fillText('PLACE CHIPS  /  USE THE GAME CONTROL', 600, 1495);
  return T.tex(c, false);
}
// the generated paintings by frame (paint-09 to 11 are in reserve), and the posters
const PAINTINGS = Array.from({ length: 11 }, (_, i) => ['portrait-gambler', 'portrait-queen', 'portrait-bartender'][i % 3]);
const POSTERS = [[2020, 775, Math.PI / 2, 'derby', true], [1770, 1880, Math.PI, 'lounge', true], [1600, 1410, -Math.PI / 2, 'missing', false],
  [2020, 560, Math.PI / 2, 'rocket', true], [620, 250, -Math.PI / 2, 'cocktails', true], [500, 720, 0, 'wash', false],
  [620, 1200, 0, 'jackpot', true], [1260, 1180, Math.PI, 'roulette', true]];

// ---------- Pit bell ----------
function pitBell(ctx) {
  const { B, group } = ctx;
  const bx = BELL.x * M, bz = BELL.y * M;
  if (hasProp('pitBell')) placeProps(group, 'pitBell', [{ x: bx, z: bz, fit: [0, 1.32, 0] }]);
  else pitBellHandmade(ctx, bx, bz);
  const label = T.textSprite('PIT BELL', { color: '#e8c46a', size: 40, h: 0.16 }); label.name = 'casino-pit-bell-sign'; label.position.set(bx, 1.55, bz); group.add(label);
  // a marble medallion in the carpet around it
  const med = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), std({ map: T.medallion(), roughness: 0.55, metalness: 0.1 })); // (0.25 mirrored the chandelier)
  med.rotation.x = -Math.PI / 2; med.position.set(bx, 0.005, bz); med.receiveShadow = true; group.add(med);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.7, 64), MAT.gold); ring.rotation.x = -Math.PI / 2; ring.position.set(bx, 0.007, bz); group.add(ring);
  for (const b of BOWL_SPOTS) {
    const x = b.x * M, z = b.y * M;
    B.add(cyl(0.18, 0.22, 0.04, 20), MAT.brass, v3(x, 0.02, z)); B.add(cyl(0.03, 0.03, 0.9, 10), MAT.brass, v3(x, 0.47, z)); B.add(cyl(0.2, 0.16, 0.04, 20), MAT.darkWood, v3(x, 0.93, z));
  }
  // a sign over every snack stand, so the hungry can find one from across the room
  const snackLabels = [];
  for (const [i, b] of BOWL_SPOTS.entries()) {
    const kind = i % 3;
    // Fixed signs share their paint/material; each sprite keeps its own transform.
    const s = snackLabels[kind] ? snackLabels[kind].clone() : (snackLabels[kind] = T.textSprite(['DOUGHNUTS', 'PRETZELS', 'HOT DOGS'][kind], { color: '#ffd27a', size: 40, h: 0.14 }));
    s.name = 'casino-snack-sign-' + i;
    s.position.set(b.x * M, 1.5, b.y * M); group.add(s);
  }
}
function pitBellHandmade(ctx, bx, bz) {
  const { B, group, anim } = ctx;
  B.add(cyl(0.5, 0.6, 0.08, 32), MAT.gold, v3(bx, 0.04, bz));
  B.add(cyl(0.14, 0.18, 0.95, 20), MAT.marble, v3(bx, 0.55, bz));
  B.add(cyl(0.2, 0.18, 0.06, 24), MAT.gold, v3(bx, 1.05, bz));
  const bell = new THREE.Mesh(lathe([[0, 0.2], [0.04, 0.2], [0.05, 0.16], [0.1, 0.12], [0.13, 0.04], [0.15, 0], [0, 0]], 24), MAT.gold);
  bell.position.set(bx, 1.08, bz); bell.castShadow = true; group.add(bell);
  const knob = new THREE.Mesh(sph(0.03, 10), MAT.gold); knob.position.set(bx, 1.3, bz); group.add(knob);
  anim.push(t => { bell.rotation.z = Math.sin(t * 2) * 0.03; });
}

// ---------- Seats ----------
// Everyone stands at the games; only the security desk and the VIP lounge's sofas have seats.
function seatsAndRails(ctx, seats) {
  const { B, group } = ctx;
  const lists = { stool: [], chair: [], armchair: [] };
  const fits = { stool: { fit: [0.44, 0, 0.44], top: 0.71 }, armchair: { fit: [0.86, 0, 0.8], top: 0.52 }, chair: { fit: [0.54, 0, 0.52], top: 0.58 } };
  for (const s of seats) {
    if (s.game !== 'vip' && s.game !== 'cams') continue;
    const x = s.x * M, z = s.y * M, yaw = yawOf(s.face);
    const back = v3(-Math.sin(yaw) * 0.26, 0, -Math.cos(yaw) * 0.26);
    const stool = ['pusher', 'claw', 'slots', 'crash', 'plinko', 'mines', 'tower', 'wheel', 'coin', 'race'].includes(s.game);
    const kind = stool ? 'stool' : s.game === 'vip' ? 'armchair' : 'chair';
    if (hasProp(kind)) { lists[kind].push({ x, z, yaw, ...fits[kind] }); continue; } // seat tops match the hand-built ones: sitters land the same
    if (stool) {
      const top = s.game === 'race' ? MAT.teal : s.game === 'slots' ? MAT.velvet : MAT.purple;
      B.add(cyl(0.21, 0.2, 0.1, 20), top, v3(x, 0.66, z)); B.add(torus(0.205, 0.02, 8, 24), MAT.gold, v3(x, 0.66, z), 0, null, Math.PI / 2);
      B.add(rbox(0.36, 0.3, 0.06, 0.03), top, v3(x + back.x * 0.8, 0.86, z + back.z * 0.8), yaw);
      B.add(cyl(0.035, 0.035, 0.62, 10), MAT.brass, v3(x, 0.31, z)); B.add(cyl(0.2, 0.22, 0.03, 18), MAT.brass, v3(x, 0.015, z));
      B.add(torus(0.16, 0.012, 6, 20), MAT.brass, v3(x, 0.28, z), 0, null, Math.PI / 2);
    } else if (s.game === 'vip') {
      B.add(rbox(0.8, 0.4, 0.75, 0.1), MAT.purple, v3(x, 0.32, z), yaw);
      B.add(rbox(0.8, 0.75, 0.2, 0.08), MAT.purple, v3(x + back.x * 1.3, 0.62, z + back.z * 1.3), yaw);
      for (const sd of [-1, 1]) B.add(rbox(0.16, 0.5, 0.75, 0.07), MAT.purple, v3(x + Math.cos(yaw) * 0.4 * sd, 0.47, z - Math.sin(yaw) * 0.4 * sd), yaw);
    } else { // table chairs: velvet seat, curved back, gold legs
      B.add(rbox(0.5, 0.12, 0.48, 0.05), MAT.velvet, v3(x, 0.52, z), yaw);
      B.add(rbox(0.5, 0.62, 0.1, 0.05), MAT.velvet, v3(x + back.x, 0.84, z + back.z), yaw, null, -0.08);
      B.add(box(0.52, 0.025, 0.11), MAT.gold, v3(x + back.x * 1.05, 1.16, z + back.z * 1.05), yaw);
      for (const [dx, dz] of [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]]) {
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        B.add(cyl(0.022, 0.016, 0.46, 8), MAT.gold, v3(x + dx * c + dz * sn, 0.23, z - dx * sn + dz * c));
      }
    }
  }
  for (const k in lists) if (lists[k].length) placeProps(group, k, lists[k]);
}

// ---------- Plants ----------
function plants(ctx) {
  const { B, group } = ctx;
  if (hasProp('palm')) { placeProps(group, 'palm', PLANTS.map(([px, py], i) => ({ x: px * M, z: py * M, yaw: i * 2.4, fit: [0, 1.7 + (i % 3) * 0.12, 0] }))); return; }
  for (const [px, py] of PLANTS) {
    const x = px * M, z = py * M;
    B.add(lathe([[0, 0], [0.2, 0], [0.26, 0.45], [0.29, 0.5], [0, 0.5]], 18), MAT.pot, v3(x, 0, z));
    B.add(torus(0.28, 0.018, 6, 24), MAT.gold, v3(x, 0.47, z), 0, null, Math.PI / 2);
    B.add(cyl(0.03, 0.04, 1.2, 8), MAT.wood, v3(x, 1.0, z));
    for (let i = 0; i < 11; i++) { // palm fronds
      const a = i / 11 * Math.PI * 2, tilt = 0.6 + (i % 3) * 0.25, len = 0.65 + (i % 2) * 0.25;
      B.add(sph(0.12, 10), MAT.leaf, v3(x + Math.cos(a) * len * 0.42, 1.55 + len * 0.15 - tilt * 0.2, z + Math.sin(a) * len * 0.42), -a, v3(0.5, 0.12, len * 2.4), -tilt);
    }
  }
}

// ---------- Chandeliers ----------
function litChandelier(m) {
  if (m.userData.lit) return; m.userData.lit = true;
  m.emissive = new THREE.Color(0xffe2b0); m.emissiveMap = m.map; m.emissiveIntensity = 0.13; m.needsUpdate = true;
  m.color.multiplyScalar(0.4); // (its light hangs just under it: at full colour the model burned white)
  GLOWS.push({ m, k: 'emissiveIntensity', v: 0.13 });
}
// Each one is its own small model so a killer can bring it down (pub.chandeliers, same order as CHANDELIERS).
function chandeliers(ctx) {
  const { group, lightSpots, anim } = ctx;
  const model = hasProp('chandelier');
  // Generated chandeliers already contain their bulbs and crystals. Construct
  // the handmade resources only when that visible fallback is actually needed.
  const crystal = model ? null : new THREE.OctahedronGeometry(0.035, 0);
  const crystalMat = model ? null : new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe0a0, emissiveIntensity: 0.55, roughness: 0.05, metalness: 0.3 });
  if (crystalMat) GLOWS.push({ m: crystalMat, k: 'emissiveIntensity', v: 0.55 });
  const bulbMat = model ? null : glowMat(0xffd8a0, 1.1), bulbGeo = model ? null : sph(0.045, 10);
  const list = ctx.chandeliers = [];
  let modelMount = null;
  for (const [cxp, czp] of CHANDELIERS) {
    const room = strictRoom(cxp, czp);
    if (room === 'race' || room === 'arcade') { lightSpots.push({ p: v3(cxp * M, WALL_H - 0.5, czp * M), color: 0xe0b67a, power: room === 'race' ? 3.5 : 6, range: 10 }); list.push(null); continue; }
    const big = room === 'floor', R = big ? 0.8 : 0.5;
    const g = new THREE.Group(); g.position.set(cxp * M, 0, czp * M); group.add(g);
    const B = model && modelMount ? null : new Batch(true), crystals = [], bulbPts = [];
    if (model) { // the model hangs from the ceiling rose; it glows a little so it reads as lit
      const sc = propScale('chandelier', { fit: [big ? 1.9 : 1.25, 0, big ? 1.9 : 1.25] }), o = propObject('chandelier', { cast: false });
      const tall = propHeight('chandelier') * sc.y, room = WALL_H - 0.12 - 2.45; // its lowest crystal stays above 2.45 m, clear of eye level
      if (tall > room) sc.multiplyScalar(room / tall);
      o.scale.copy(sc); o.position.y = WALL_H - 0.12 - propHeight('chandelier') * sc.y; g.add(o);
      o.traverse(m => { if (m.isMesh) { m.userData.prop = true; litChandelier(m.material); } });
    }
    if (B) { B.add(cyl(0.012, 0.012, 0.5, 6), MAT.gold, v3(0, WALL_H - 0.25, 0)); B.add(cyl(0.18, 0.12, 0.08, 16), MAT.gold, v3(0, WALL_H - 0.04, 0)); }
    if (!model) {
    for (const [rr, y, t] of [[R, 0.6, 0.03], [R * 0.62, 0.82, 0.025], [R * 0.3, 1.0, 0.02]]) B.add(torus(rr, t, 8, 40), MAT.gold, v3(0, WALL_H - y, 0), 0, null, Math.PI / 2);
    B.add(lathe([[0, -0.3], [0.06, -0.2], [0.1, 0], [0.04, 0.1], [0, 0.12]], 16), MAT.gold, v3(0, WALL_H - 0.85, 0));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; B.add(cyl(0.01, 0.01, R * 1.02, 6), MAT.gold, v3(Math.cos(a) * R * 0.5, WALL_H - 0.6, Math.sin(a) * R * 0.5), -a, null, 0, Math.PI / 2); }
    }
    const nb = big ? 14 : 8;
    for (let i = 0; !model && i < nb; i++) {
      const a = i / nb * Math.PI * 2;
      bulbPts.push(v3(Math.cos(a) * R, WALL_H - 0.53, Math.sin(a) * R));
      if (big) bulbPts.push(v3(Math.cos(a + 0.2) * R * 0.62, WALL_H - 0.76, Math.sin(a + 0.2) * R * 0.62));
      for (let j = 0; j < 4; j++) crystals.push(v3(Math.cos(a + 0.2) * R * (0.95 - j * 0.02), WALL_H - 0.7 - j * 0.085, Math.sin(a + 0.2) * R * (0.95 - j * 0.02)));
      crystals.push(v3(Math.cos(a) * R * 0.6, WALL_H - 0.98 - (i % 2) * 0.08, Math.sin(a) * R * 0.6));
    }
    if (B) {
      B.build(g);
      if (model) modelMount = g.children[g.children.length - 1];
    } else {
      // Every generated chandelier has the same fixed stem and ceiling rose.
      // Share that geometry; each mesh still follows its own falling parent.
      g.add(modelMount.clone());
    }
    let bm = null;
    if (!model) {
      bm = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbPts.length);
      bulbPts.forEach((p, i) => bm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
      g.add(bm);
    }
    if (crystals.length) {
      const cm = new THREE.InstancedMesh(crystal, crystalMat, crystals.length);
      crystals.forEach((p, i) => cm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
      g.add(cm);
    }
    const spot = { p: v3(cxp * M, WALL_H - 1.3, czp * M), color: 0xffd29a, power: big ? 7.5 : 5.5, range: big ? 12 : 8 }; // low enough not to burn a white disc into the ceiling
    lightSpots.push(spot);
    list.push({ g, bm, spot, power: spot.power, drop: WALL_H - 1.18, seed: cxp + czp, model });
  }
  // falling: it shudders on its chain, then drops; down: it lies broken on the floor, dark
  anim.push((t, dt, state) => {
    const chs = state && state.pub && state.pub.chandeliers; if (!chs) return;
    for (const ch of chs) {
      const e = list[ch.id]; if (!e) continue;
      const g = e.g;
      if (ch.state === 'up') { g.position.y = 0; g.rotation.set(0, 0, 0); if (e.bm) e.bm.visible = true; e.spot.power = e.power; continue; }
      if (ch.state === 'falling') {
        const shake = Math.min(1, (1.6 - ch.t) / 0.8) * 0.06;
        g.rotation.set(Math.sin(t * 31 + e.seed) * shake, 0, Math.cos(t * 27 + e.seed) * shake);
        g.position.y = ch.t < 0.35 ? -e.drop * (1 - (ch.t / 0.35) ** 2) : 0;
        e.spot.power = e.power * (0.5 + 0.5 * Math.abs(Math.sin(t * 40)));
      } else { g.position.y = -e.drop; g.rotation.set(0.12, e.seed % 3, 0.22); if (e.bm) e.bm.visible = false; e.spot.power = 0; }
    }
  });
}

// ---------- Staff doors ----------
// A STAFF ONLY door in six rooms (map.STAFF_DOORS), each with a caged lamp. A killer with the staff-passage edge
// steps in one and out of another; to everyone else they are just locked doors.
function staffDoors(ctx) {
  const { B, group } = ctx;
  const doorMat = std({ color: 0x1a1416, metalness: 0.4, roughness: 0.6 }), lampMat = glowMat(0xffe0a0, 1.6);
  const plateMat = new THREE.MeshBasicMaterial({ map: T.plaque('STAFF ONLY', { w: 256, h: 70, bg: '#c8b890', ink: '#2a1a10', font: '900 34px Arial Black, sans-serif' }) });
  for (const d of STAFF_DOORS) {
    const nx = Math.cos(d.face), nz = Math.sin(d.face), yaw = Math.atan2(nx, nz);
    const at = (out, y, side = 0) => v3(d.x * M + nx * out + nz * side, y, d.y * M + nz * out - nx * side);
    B.add(box(1.0, 2.1, 0.11), doorMat, at(0.055, 1.05), yaw); // (proud of every room's dado rail and neon strip)
    B.add(box(1.12, 0.08, 0.15), MAT.metalDark, at(0.075, 2.14), yaw);
    B.add(box(0.2, 0.04, 0.05), MAT.chrome, at(0.13, 1.05, 0.35), yaw);
    const lamp = new THREE.Mesh(sph(0.08, 12), lampMat); lamp.position.copy(at(0.18, 2.45)); group.add(lamp);
    ctx.lightSpots.push({ p: at(0.5, 2.3), color: 0xffd8a0, power: 1.2, range: 3.5 });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), plateMat); plate.rotation.y = yaw; plate.position.copy(at(0.115, 1.65)); group.add(plate);
  }
}

// ---------- The arcade ----------
function arcadeDressing(ctx) {
  ctx.sign('PLINKO', 0xe2bb72, 2166 * M, 2.75, 3.05, 0, 2.0, 0.36, true, true); // follows the relocated north-wall pair
  ctx.sign('MINES', 0xe2bb72, 2210 * M, 2.45, 700 * M - 0.24, Math.PI, 1.5, 0.4);
  ctx.sign('DRAGON TOWER', 0xffa040, 2770 * M, 2.45, 700 * M - 0.24, Math.PI, 2.4, 0.4);
}

// Marquee bulbs everywhere share one instanced mesh with a chasing pattern.
function bulbsMesh(ctx) {
  const { bulbs, group, anim } = ctx;
  if (!bulbs.length) return;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const im = new THREE.InstancedMesh(sph(0.028, 8), mat, bulbs.length);
  bulbs.forEach((b, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(b.p.x, b.p.y, b.p.z)));
  const on = new THREE.Color(1.8, 1.35, 0.65), off = new THREE.Color(0.35, 0.25, 0.12); // (warm: brighter read as white dots)
  // Allocate the color attribute before GPU/shader preparation. Creating it on
  // the first chase tick changed the shader flags after compilation finished.
  bulbs.forEach((b, i) => im.setColorAt(i, b.phase % 3 === 0 ? off : on)); im.instanceColor.needsUpdate = true;
  GLOWS.push({ m: mat, k: 'color', v: 1 });
  group.add(im);
  anim.push({ every: 0.12, f: t => { const k = Math.floor(t * 8); bulbs.forEach((b, i) => im.setColorAt(i, (b.phase + k) % 3 === 0 ? off : on)); im.instanceColor.needsUpdate = true; } });
}
