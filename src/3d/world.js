// The static casino, built once from the map data. Sim px -> metres: x/60 east, y/60 south.
// Rooms, walls, trim, lights and decor live here; the game machines are in machines.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { ROOMS, WALLS, OBSTACLES, DOOR_GAPS, CHANDELIERS, PLANTS, TAP, BELL, BOWL_SPOTS, makeSeats } from '../map.js';
import { buildMachines } from './machines.js';

export const M = 1 / 60, WALL_H = 3.6;
export const yawOf = a => Math.PI / 2 - a; // object facing +Z local -> facing sim angle a
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- Materials ----------
const std = (o) => new THREE.MeshStandardMaterial(o);
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
export const MAT = {
  gold: std({ color: 0xd9a94a, metalness: 0.9, roughness: 0.3, envMapIntensity: 0.8 }),
  brass: std({ color: 0xc8963a, metalness: 0.85, roughness: 0.35 }),
  chrome: std({ color: 0xdde2e6, metalness: 1, roughness: 0.15 }),
  darkWood: std({ map: T.wood('#4a2616', '#2a140a'), roughness: 0.42 }),
  wood: std({ map: T.wood('#6b4128', '#3a2214'), roughness: 0.5 }),
  polished: phys({ color: 0x3a1a10, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 }),
  velvet: phys({ color: 0x9a1a30, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xff8090), sheenRoughness: 0.5 }),
  purple: phys({ color: 0x5a2470, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xd090ff), sheenRoughness: 0.5 }),
  teal: phys({ color: 0x1a6a6a, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0x80fff0), sheenRoughness: 0.5 }),
  leather: phys({ color: 0x2a1410, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
  black: std({ color: 0x141014, roughness: 0.4 }),
  blackGloss: phys({ color: 0x0e0c10, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }),
  marble: std({ color: 0xe0d8cc, roughness: 0.25 }),
  porcelain: std({ color: 0xf6f6f2, roughness: 0.12 }),
  leaf: phys({ color: 0x2f7a35, roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0x9fe08a) }),
  pot: std({ color: 0x1a1214, roughness: 0.3, metalness: 0.4 }),
  mirror: std({ color: 0x8a7a70, metalness: 0.9, roughness: 0.3, envMapIntensity: 0.25 }),
  stall: std({ color: 0x6a8a88, roughness: 0.5 }),
  rope: phys({ color: 0xb01828, roughness: 0.7, sheen: 1, sheenColor: new THREE.Color(0xff8090) }),
  water: phys({ color: 0x1fa8c8, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.85, clearcoat: 1, clearcoatRoughness: 0.05 }),
  metalDark: std({ color: 0x2a2c34, metalness: 0.7, roughness: 0.45 }),
  candy: c => phys({ color: c, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
};
// Emissive materials get dimmed when the lights go out; keep a list with their normal strength.
export const GLOWS = [];
export function glowMat(color, strength = 1, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: strength, roughness: 0.4, ...extra });
  GLOWS.push({ m, k: 'emissiveIntensity', v: strength }); return m;
}
export function basicGlow(map, strength = 1.6, extra = {}) {
  const m = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(strength, strength, strength), toneMapped: false, ...extra });
  GLOWS.push({ m, k: 'color', v: strength }); return m;
}

// Per-room look: floor, walls, ceiling, and how the walls are dressed.
const ROOM_LOOK = {
  floor: { wall: () => T.wallpaper('#5a1422'), floor: () => T.carpet('#7a1424'), tile: 1.6, ceil: '#2a1418', trim: 'deco', cove: 0xffc880 },
  bar: { wall: () => T.wallpaper('#3d2416', '#d9a94a'), floor: () => T.wood('#6b4128', '#3a2214'), tile: 2.4, ceil: '#24140c', trim: 'deco', cove: 0xffb060, floorRough: 0.35 },
  rest: { wall: () => T.tiles('#e6efe9', '#c4dad6'), floor: () => T.tiles('#2b3a40', '#3a4e55'), tile: 1.2, ceil: '#1e2a2e', trim: 'tile', cove: 0xc0fff0, wallRough: 0.25 },
  arcade: { wall: () => T.wallpaper('#1a1038', '#ff3fa4'), floor: () => T.arcadeCarpet(), tile: 2.2, ceil: '#0c0a1a', trim: 'neon', cove: 0xff3fa4 },
  race: { wall: () => T.wallpaper('#123a52', '#7fe8ff'), floor: () => T.tiles('#b8ccc8', '#3f8a98'), tile: 1.4, ceil: '#0e2232', trim: 'deco', cove: 0x7fe8ff, floorRough: 0.3 },
  slots: { wall: () => T.wallpaper('#1c1a52', '#e8c46a'), floor: () => T.carpet('#1a2068', '#e8c46a', '#0e1240'), tile: 1.6, ceil: '#14122e', trim: 'deco', cove: 0x9fb0ff },
  alley: { wall: () => T.brick('#7a3a2a'), floor: () => T.asphalt(), tile: 3.0, ceil: null, trim: 'brick', cove: null, floorRough: 0.55, wallTile: 2.4 },
  vip: { wall: () => T.wallpaper('#3e1a4c'), floor: () => T.vipCarpet(), tile: 1.6, ceil: '#24122c', trim: 'deco', cove: 0xd070ff },
};
const roomMats = {};
for (const k in ROOM_LOOK) {
  const L = ROOM_LOOK[k];
  roomMats[k] = {
    wall: std({ map: L.wall(), roughness: L.wallRough ?? 0.8 }),
    floor: std({ map: L.floor(), roughness: L.floorRough ?? 0.95 }),
    ceil: L.ceil ? std({ map: T.ceiling(L.ceil), roughness: 0.9 }) : null,
    tile: L.tile,
  };
}

// ---------- Static batching: everything that never moves is merged per material ----------
// Two batches: the shell (floors, walls, ceilings) and the furniture, which casts shadows.
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
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.receiveShadow = true; mesh.castShadow = this.cast;
      group.add(mesh);
    }
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
  const group = new THREE.Group(); scene.add(group);
  const S = new Batch(false), B = new Batch(true);
  const anim = [];       // per-frame updaters: f(t) or { every, f }
  const lightSpots = []; // where the pooled point lights can go: { p, color, power, range }
  const bulbs = [];      // marquee bulbs: { p, phase, color }
  const ctx = { group, S, B, anim, lightSpots, bulbs, sign, M, WALL_H };

  // ---------- Floors, ceilings, cove light ----------
  for (const k in ROOMS) {
    const r = ROOMS[k], m = roomMats[k], L = ROOM_LOOK[k];
    const w = r.w * M, d = r.h * M, cx = (r.x + r.w / 2) * M, cz = (r.y + r.h / 2) * M;
    S.add(uvScale(new THREE.PlaneGeometry(w, d), w / m.tile, d / m.tile), m.floor, v3(cx, 0, cz), 0, null, -Math.PI / 2);
    if (m.ceil) {
      S.add(uvScale(new THREE.PlaneGeometry(w, d), w / 2, d / 2), m.ceil, v3(cx, WALL_H, cz), 0, null, Math.PI / 2);
      // a glowing cove strip a little in from the walls, and the dark soffit above it
      const cm = glowMat(L.cove, k === 'arcade' ? 2.2 : 1.3);
      const inset = 0.25;
      for (const [sx, sz, len, rot] of [[cx, r.y * M + inset, w - inset * 2, 0], [cx, (r.y + r.h) * M - inset, w - inset * 2, 0], [r.x * M + inset, cz, d - inset * 2, Math.PI / 2], [(r.x + r.w) * M - inset, cz, d - inset * 2, Math.PI / 2]]) {
        B.add(box(len, 0.03, 0.04), cm, v3(sx, WALL_H - 0.16, sz), rot);
        S.add(box(len + 0.3, 0.12, 0.3), MAT.black, v3(sx, WALL_H - 0.06, sz), rot);
      }
    } else night(ctx, r);
  }
  // Doorways: floor threshold, gold frame and header
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
    B.add(vertical ? box(th + 0.06, 0.3, 0.2) : box(0.2, 0.3, th + 0.06), MAT.gold, v3(cx, 2.95, cz));
  }

  // ---------- Walls: each side gets the look of the room it faces ----------
  const colLists = [];
  for (const r of WALLS) {
    const stall = r.w <= 10 || r.h <= 10;
    const h = stall ? 2.0 : WALL_H;
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
        S.add(uvScale(new THREE.PlaneGeometry(len, h), len / wt, h / wt), stall ? MAT.stall : m.wall, v3(p[0], h / 2, p[1]), rotY);
        if (stall || len < 0.4) continue;
        const out = (d, y) => v3(p[0] + sd.n[0] * d, y, p[1] + sd.n[1] * d);
        if (L.trim === 'deco') {
          S.add(uvScale(box(len, 1.0, 0.05), len / 2, 0.5), MAT.darkWood, out(0.025, 0.5), rotY);
          B.add(box(len, 0.05, 0.07), MAT.gold, out(0.05, 1.02), rotY);
          S.add(box(len, 0.16, 0.1), MAT.gold, out(0.05, WALL_H - 0.3), rotY);
          S.add(box(len, 0.12, 0.07), MAT.black, out(0.06, 0.06), rotY);
          colLists.push({ room, n: sd.n, p, len, rotY, horiz: !sd.n[0], c: sd.c, lo: run.lo, hi: run.hi });
        } else if (L.trim === 'tile') {
          S.add(box(len, 1.2, 0.03), MAT.marble, out(0.015, 0.6), rotY);
          S.add(box(len, 0.04, 0.05), MAT.chrome, out(0.03, 1.22), rotY);
        } else if (L.trim === 'neon') {
          S.add(box(len, 0.9, 0.04), MAT.blackGloss, out(0.02, 0.45), rotY);
          for (const [y, col] of [[0.92, 0x3fe0ff], [WALL_H - 0.45, 0xff3fa4]]) B.add(box(len, 0.03, 0.03), glowMat(col, 2.4), out(0.05, y), rotY);
        } else if (L.trim === 'brick') {
          S.add(box(len, 0.25, 0.05), MAT.metalDark, out(0.025, 0.125), rotY);
        }
      }
    }
  }
  // Pilasters along the dressed walls: marble shafts with gold caps, skipped near doors.
  const pil = { shaft: box(0.36, WALL_H - 0.75, 0.12), cap: box(0.5, 0.16, 0.2), base: box(0.48, 0.3, 0.18) };
  for (const w of colLists) {
    const n = Math.floor(w.len / 4.2);
    for (let i = 1; i <= n; i++) {
      const u = w.lo + (w.hi - w.lo) * i / (n + 1);
      const sx = w.horiz ? u : w.c / M, sy = w.horiz ? w.c / M : u;
      if (nearGap(sx, sy, 50)) continue;
      const pos = (d, y) => v3(sx * M + w.n[0] * d, y, sy * M + w.n[1] * d);
      B.add(pil.shaft, MAT.marble, pos(0.07, 0.3 + (WALL_H - 0.75) / 2), w.rotY);
      B.add(pil.cap, MAT.gold, pos(0.1, WALL_H - 0.4), w.rotY);
      B.add(pil.base, MAT.darkWood, pos(0.09, 0.15), w.rotY);
      // a little sconce on every other pilaster
      if (i % 2) {
        const sm = sconceMat || (sconceMat = glowMat(0xffc080, 2.2));
        B.add(box(0.08, 0.22, 0.1), MAT.gold, pos(0.16, 2.05), w.rotY);
        B.add(lathe([[0.02, 0], [0.07, 0.13], [0.08, 0.15], [0, 0.15]], 12), sm, pos(0.22, 2.1), w.rotY);
      }
    }
  }

  const seats = makeSeats();
  bar(ctx); restrooms(ctx); vip(ctx); decor(ctx); pitBell(ctx); seatsAndRails(ctx, seats); plants(ctx); chandeliers(ctx);
  alleyDressing(ctx); arcadeDressing(ctx);
  const machines = buildMachines(ctx, seats);
  // neon signs over the main rooms
  sign('LAST CALL', 0xff5c8a, 1320 * M, 2.75, 20 * M + 0.05, 0, 4.6, 1.15);
  sign('BAR', 0xffc070, 320 * M, 2.95, 20 * M + 0.04, 0, 1.6, 0.6);
  sign('VIP', 0xd070ff, 2500 * M, 3.0, 1200 * M + 0.05, 0, 1.4, 0.55);
  sign('RESTROOMS', 0x80fff0, 320 * M, 3.05, 700 * M - 0.05, Math.PI, 2.2, 0.38);
  sign('DUCK RACE', 0x7fe8ff, 2500 * M, 3.1, 720 * M + 0.05, 0, 2.6, 0.55);
  sign('SLOTS', 0xffd040, 510 * M, 3.0, 1200 * M + 0.05, 0, 2.0, 0.6);
  sign('HIGH LIMIT', 0xffd040, 680 * M, 2.75, 1880 * M - 0.05, Math.PI, 2.4, 0.42);
  bulbsMesh(ctx);

  S.build(group); B.build(group);

  function sign(text, color, x, y, z, rotY, w, h, chase = true) {
    const hex = '#' + new THREE.Color(color).getHexString();
    const t = T.neonTexture(text, hex, 1024, Math.round(1024 * h / w), `bold italic ${Math.round(1024 * h / w * 0.6)}px Georgia`);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basicGlow(t, 1.8, { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    m.position.set(x, y, z); m.rotation.y = rotY; group.add(m);
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
    group, lightSpots, seats, machines, chandeliers: ctx.chandeliers,
    update(t, dt, state) {
      anim.forEach((a, i) => {
        if (typeof a === 'function') return a(t, dt, state);
        acc[i] = (acc[i] || 0) + dt; if (acc[i] >= a.every) { acc[i] = 0; a.f(t, state); }
      });
      machines.update(t, dt, state);
    },
  };
}
let sconceMat = null;

// The back alley has no ceiling: a night sky with stars and strings of party lights.
function night(ctx, r) {
  const { S, B, anim, group, M, WALL_H } = ctx;
  const [c, g] = T.canvas(512, 512);
  const lg = g.createLinearGradient(0, 0, 0, 512); lg.addColorStop(0, '#0a0c24'); lg.addColorStop(1, '#1a1030'); g.fillStyle = lg; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; const s = Math.random() < 0.1 ? 2.5 : 1.2; g.fillRect(Math.random() * 512, Math.random() * 512, s, s); }
  const sky = new THREE.MeshBasicMaterial({ map: T.tex(c), color: 0xffffff });
  const w = r.w * M, d = r.h * M, cx = (r.x + r.w / 2) * M, cz = (r.y + r.h / 2) * M;
  S.add(uvScale(new THREE.PlaneGeometry(w, d), 2, 1.4), sky, v3(cx, WALL_H + 1.2, cz), 0, null, Math.PI / 2);
  // the walls carry on up to the sky
  for (const [x, z, len, rot] of [[cx, r.y * M, w, 0], [cx, (r.y + r.h) * M, w, Math.PI], [r.x * M, cz, d, Math.PI / 2], [(r.x + r.w) * M, cz, d, -Math.PI / 2]]) {
    S.add(uvScale(new THREE.PlaneGeometry(len, 1.2), len / 2.4, 0.5), roomMats.alley.wall, v3(x, WALL_H + 0.6, z), rot);
  }
  // string lights zig-zagging across
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false });
  const cols = [0xffe0a0, 0xff7ac8, 0x7cc8ff, 0xffd040, 0x3ddc97];
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const za = r.y * M + 0.4 + i * (d - 0.8) / 4, zb = za + (d - 0.8) / 8;
    const a = v3(r.x * M + 0.3, WALL_H + 0.3, za), b = v3((r.x + r.w) * M - 0.3, WALL_H + 0.3, zb);
    for (let k = 0; k <= 24; k++) { const u = k / 24, p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * 0.7; pts.push(p); }
  }
  const im = new THREE.InstancedMesh(sph(0.05, 8), bulbMat, pts.length);
  pts.forEach((p, i) => { im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)); im.setColorAt(i, new THREE.Color(cols[i % cols.length]).multiplyScalar(2.5)); });
  group.add(im);
  for (let i = 0; i < 5; i++) {
    const line = new THREE.BufferGeometry().setFromPoints(pts.slice(i * 25, i * 25 + 25));
    group.add(new THREE.Line(line, new THREE.LineBasicMaterial({ color: 0x111111 })));
  }
  ctx.lightSpots.push({ p: v3(cx - 3, WALL_H - 0.2, cz - 2), color: 0xffc890, power: 6, range: 10 }, { p: v3(cx + 3, WALL_H - 0.2, cz + 2), color: 0xff9ad0, power: 5, range: 10 });
  void anim; void B;
}

// ---------- Bar ----------
function bar(ctx) {
  const { S, B, group } = ctx;
  const o = OBSTACLES.find(o => o.kind === 'counter');
  const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M, w = o.w * M, d = o.h * M;
  B.add(uvScale(box(w, 1.0, d), w, 1), MAT.darkWood, v3(cx, 0.5, cz));
  B.add(rbox(w + 0.14, 0.08, d + 0.2, 0.03), MAT.polished, v3(cx, 1.04, cz + 0.04));
  for (let x = o.x + 20; x < o.x + o.w - 10; x += 40) B.add(box(0.05, 0.8, 0.02), MAT.gold, v3(x * M, 0.5, (o.y + o.h) * M + 0.005));
  B.add(cyl(0.025, 0.025, w, 10), MAT.brass, v3(cx, 0.2, (o.y + o.h) * M + 0.22), 0, null, 0, Math.PI / 2);
  // bar stools along the front
  for (let x = o.x + 40; x < o.x + o.w; x += 70) {
    const sx = x * M, sz = (o.y + o.h) * M + 0.45;
    if (Math.abs(x - TAP.x) < 50) continue;
    B.add(cyl(0.2, 0.2, 0.09, 18), MAT.velvet, v3(sx, 0.78, sz)); B.add(cyl(0.03, 0.03, 0.75, 8), MAT.brass, v3(sx, 0.38, sz));
    B.add(cyl(0.2, 0.22, 0.03, 18), MAT.brass, v3(sx, 0.015, sz)); B.add(torus(0.15, 0.012, 6, 20), MAT.brass, v3(sx, 0.3, sz), 0, null, Math.PI / 2);
  }
  for (let i = 0; i < 3; i++) { // beer taps at the pour spot
    const x = (TAP.x - 20 + i * 20) * M, z = (o.y + o.h - 8) * M;
    B.add(cyl(0.02, 0.02, 0.3, 8), MAT.brass, v3(x, 1.22, z)); B.add(cyl(0.012, 0.012, 0.18, 8), MAT.black, v3(x, 1.42, z)); B.add(sph(0.03, 8), MAT.brass, v3(x, 1.36, z + 0.05));
  }
  // back bar: cabinet, mirror, lit shelves of bottles
  const bz = 20 * M;
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
  // high-top tables
  for (const h of OBSTACLES.filter(o => o.kind === 'hightop')) {
    const x = (h.x + h.w / 2) * M, z = (h.y + h.h / 2) * M;
    B.add(cyl(0.38, 0.38, 0.05, 28), MAT.polished, v3(x, 1.05, z)); B.add(torus(0.38, 0.015, 6, 32), MAT.gold, v3(x, 1.05, z), 0, null, Math.PI / 2);
    B.add(cyl(0.05, 0.05, 1.0, 10), MAT.brass, v3(x, 0.52, z)); B.add(cyl(0.25, 0.28, 0.04, 20), MAT.brass, v3(x, 0.02, z));
    const lamp = new THREE.Mesh(sph(0.06, 12), glowMat(0xffb060, 2.5)); lamp.position.set(x, 1.13, z); group.add(lamp);
  }
  ctx.lightSpots.push({ p: v3(cx, 2.4, bz + 1.0), color: 0xffb060, power: 4, range: 6 });
}

// ---------- Restrooms ----------
function restrooms(ctx) {
  const { B, S } = ctx;
  const o = OBSTACLES.find(o => o.kind === 'sinks');
  const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M;
  B.add(box(o.w * M, 0.85, o.h * M), MAT.darkWood, v3(cx, 0.425, cz));
  B.add(box(o.w * M + 0.06, 0.05, o.h * M + 0.04), MAT.marble, v3(cx + 0.02, 0.875, cz));
  for (let y = o.y + 30; y < o.y + o.h; y += 65) {
    B.add(lathe([[0, 0], [0.12, 0.01], [0.17, 0.08], [0.18, 0.1], [0, 0.1]], 20), MAT.porcelain, v3(cx + 0.05, 0.82, y * M), 0, v3(1, 1, 1.3));
    B.add(cyl(0.015, 0.015, 0.22, 8), MAT.chrome, v3(cx - 0.12, 1.0, y * M)); B.add(cyl(0.012, 0.012, 0.14, 8), MAT.chrome, v3(cx - 0.06, 1.1, y * M), 0, null, 0, Math.PI / 2);
    S.add(box(0.03, 0.9, 0.75), MAT.gold, v3(20 * M + 0.015, 1.75, y * M)); S.add(box(0.02, 0.8, 0.65), MAT.mirror, v3(20 * M + 0.03, 1.75, y * M));
    B.add(box(0.03, 0.04, 0.6), glowMat(0xe0fff8, 2), v3(20 * M + 0.05, 2.25, y * M));
  }
  for (const x of [200, 320, 440, 560]) {
    if (x === 200) continue;
    const z = 1150 * M, sx = (x - 0) * M;
    B.add(lathe([[0, 0], [0.16, 0], [0.18, 0.2], [0.22, 0.38], [0.2, 0.42], [0, 0.42]], 20), MAT.porcelain, v3(sx, 0, z), 0, v3(1, 1, 1.25));
    B.add(rbox(0.4, 0.4, 0.18, 0.04), MAT.porcelain, v3(sx, 0.6, z + 0.2));
  }
  for (const x of [260, 380, 500]) B.add(box(0.04, 0.06, 2.0), MAT.chrome, v3((x + 5) * M, 2.0, 1120 * M)); // stall rails
}

// ---------- VIP lounge ----------
function vip(ctx) {
  const { B, group } = ctx;
  const o = OBSTACLES.find(o => o.kind === 'coffee');
  const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M;
  B.add(rbox(o.w * M, 0.06, o.h * M, 0.02), MAT.marble, v3(cx, 0.45, cz));
  B.add(box(o.w * M - 0.2, 0.42, o.h * M - 0.2), MAT.gold, v3(cx, 0.21, cz));
  B.add(cyl(0.12, 0.09, 0.25, 16), MAT.chrome, v3(cx + 0.5, 0.6, cz));
  B.add(cyl(0.03, 0.04, 0.35, 10), std({ color: 0x1a4a2a, roughness: 0.1 }), v3(cx + 0.5, 0.75, cz));
  for (const c of OBSTACLES.filter(o => o.kind === 'couch')) {
    const x = (c.x + c.w / 2) * M, z = (c.y + c.h / 2) * M, w = c.w * M;
    B.add(rbox(w, 0.42, 0.6, 0.08), MAT.purple, v3(x, 0.21, z - 0.04));
    B.add(rbox(w, 0.6, 0.18, 0.08), MAT.purple, v3(x, 0.6, z + 0.2));
    for (const s of [-1, 1]) B.add(rbox(0.18, 0.55, 0.6, 0.08), MAT.purple, v3(x + s * w / 2, 0.38, z - 0.02));
    for (let k = -1; k <= 1; k++) B.add(rbox(w / 3 - 0.04, 0.12, 0.5, 0.05), MAT.purple, v3(x + k * w / 3, 0.47, z - 0.06));
  }
  // velvet rope at the VIP door from the duck pond, and a rug
  for (const x of [2410, 2590]) { B.add(cyl(0.03, 0.03, 0.95, 10), MAT.gold, v3(x * M, 0.475, 1235 * M)); B.add(sph(0.05, 10), MAT.gold, v3(x * M, 0.97, 1235 * M)); B.add(cyl(0.16, 0.16, 0.03, 16), MAT.gold, v3(x * M, 0.015, 1235 * M)); }
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), std({ color: 0x2a0e30, roughness: 0.95 })); rug.rotation.x = -Math.PI / 2; rug.position.set(cx, 0.006, cz); rug.receiveShadow = true; group.add(rug);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.25, 2.33, 64), MAT.gold); ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.008, cz); group.add(ring);
  // a big TV on the east wall
  B.add(rbox(0.08, 1.3, 2.3, 0.02), MAT.blackGloss, v3(2980 * M - 0.05, 1.9, 1540 * M));
  ctx.vipTv = { x: 2980 * M - 0.1, y: 1.9, z: 1540 * M, w: 2.15, h: 1.2 };
  // a piano for no reason
  const px = 2830 * M, pz = 1780 * M;
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
    for (const s of [-1, 1]) {
      B.add(rbox(o.w, 0.45, 0.42, 0.06), MAT.velvet, v3(o.x, 0.225, o.z + s * (o.d / 2 - 0.22))); B.add(rbox(o.w, 0.75, 0.14, 0.06), MAT.velvet, v3(o.x, 0.75, o.z + s * (o.d / 2 - 0.05)));
      for (let k = -1; k <= 1; k++) B.add(sph(0.025, 8), MAT.gold, v3(o.x + k * o.w / 3, 0.85, o.z + s * (o.d / 2 - 0.13)));
    }
    B.add(rbox(o.w - 0.2, 0.05, 0.6, 0.02), MAT.polished, v3(o.x + 0.05, 0.75, o.z)); B.add(cyl(0.05, 0.05, 0.72, 10), MAT.brass, v3(o.x + 0.05, 0.37, o.z));
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.14, 14, 1, true), glowMat(0xffb060, 1.8, { side: THREE.DoubleSide })), v3(o.x + 0.1, 0.84, o.z));
  }
  // jukebox against the south wall
  for (const o of ob('jukebox')) {
    const fz = o.z - o.d / 2 - 0.01;
    B.add(rbox(o.w, 1.25, o.d, 0.1), MAT.polished, v3(o.x, 0.62, o.z));
    B.add(cyl(o.w / 2, o.w / 2, o.d, 24), MAT.polished, v3(o.x, 1.25, o.z), 0, null, Math.PI / 2);
    B.add(torus(o.w / 2 - 0.04, 0.03, 8, 24, Math.PI), glowMat(0xff3fa4, 2.5), v3(o.x, 1.25, fz));
    for (const s of [-1, 1]) B.add(box(0.04, 1.0, 0.04), glowMat(0x3fe0ff, 2.5), v3(o.x + s * (o.w / 2 - 0.06), 0.62, fz));
    B.add(box(o.w - 0.25, 0.32, 0.02), glowMat(0xffd040, 1.6), v3(o.x, 0.95, fz));
    B.add(box(o.w - 0.25, 0.3, 0.02), MAT.chrome, v3(o.x, 0.4, fz));
  }
  // round velvet ottoman in the slot hall (the palm in the middle is in PLANTS)
  for (const o of ob('ottoman')) {
    B.add(cyl(o.w / 2, o.w / 2 + 0.02, 0.42, 40), MAT.velvet, v3(o.x, 0.21, o.z)); B.add(torus(o.w / 2, 0.035, 8, 48), MAT.velvet, v3(o.x, 0.42, o.z), 0, null, Math.PI / 2);
    B.add(cyl(o.w / 2 + 0.03, o.w / 2 + 0.03, 0.05, 40), MAT.gold, v3(o.x, 0.025, o.z));
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; B.add(sph(0.02, 6), MAT.gold, v3(o.x + Math.cos(a) * (o.w / 2 - 0.12), 0.44, o.z + Math.sin(a) * (o.w / 2 - 0.12))); }
  }
  // pool table
  const felt = std({ color: 0x1a6a3a, roughness: 0.9 });
  for (const o of ob('pool')) {
    B.add(rbox(o.w, 0.25, o.d, 0.05), MAT.darkWood, v3(o.x, 0.66, o.z)); B.add(box(o.w - 0.24, 0.02, o.d - 0.24), felt, v3(o.x, 0.79, o.z));
    for (const s of [-1, 1]) { B.add(rbox(o.w, 0.06, 0.13, 0.03), MAT.polished, v3(o.x, 0.8, o.z + s * (o.d / 2 - 0.06))); B.add(rbox(0.13, 0.06, o.d, 0.03), MAT.polished, v3(o.x + s * (o.w / 2 - 0.06), 0.8, o.z)); }
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.add(cyl(0.07, 0.05, 0.55, 12), MAT.darkWood, v3(o.x + dx * (o.w / 2 - 0.15), 0.27, o.z + dz * (o.d / 2 - 0.15)));
    [0xf8f4ec, 0xf4c020, 0x2050c0, 0xc0302a, 0x6a2a9a, 0xff7a20, 0x1a8a3a, 0x8a1a1a, 0x151515].forEach((c, i) =>
      B.add(sph(0.029, 12), MAT.candy(c), v3(o.x + (i ? 0.45 + Math.floor((i - 1) / 3) * 0.055 : -0.5), 0.82, o.z + (i ? ((i - 1) % 3 - 1) * 0.06 : 0))));
    B.add(cyl(0.008, 0.014, 1.45, 8), MAT.wood, v3(o.x - 0.2, 0.83, o.z + 0.25), 0.3, null, 0, Math.PI / 2);
    for (const dx of [-0.5, 0.5]) { add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.2, 20, 1, true), glowMat(0x3a8a5a, 0.6, { side: THREE.DoubleSide })), v3(o.x + dx, 2.3, o.z)); B.add(cyl(0.006, 0.006, 0.9, 4), MAT.metalDark, v3(o.x + dx, 2.85, o.z)); }
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(o.w + 1.6, o.d + 1.4), std({ color: 0x2a0e30, roughness: 0.95 })); rug.rotation.x = -Math.PI / 2; rug.receiveShadow = true; add(rug, v3(o.x, 0.006, o.z));
  }
  // champagne tower
  const coupe = lathe([[0, 0], [0.04, 0], [0.008, 0.01], [0.006, 0.08], [0.055, 0.1], [0.06, 0.125], [0.055, 0.125], [0.0, 0.105]], 16);
  const glassMat = phys({ color: 0xfff0c0, roughness: 0.05, transparent: true, opacity: 0.6, clearcoat: 1 });
  for (const o of ob('champagne')) {
    B.add(cyl(o.w / 2, o.w / 2, 0.05, 32), MAT.marble, v3(o.x, 0.8, o.z)); B.add(cyl(0.06, 0.1, 0.78, 14), MAT.gold, v3(o.x, 0.39, o.z));
    const spots = []; for (let L = 0; L < 4; L++) { const n = 4 - L; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) spots.push([(i - (n - 1) / 2) * 0.12, 0.825 + L * 0.125, (j - (n - 1) / 2) * 0.12]); }
    const im = new THREE.InstancedMesh(coupe, glassMat, spots.length);
    spots.forEach(([dx, y, dz], i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(o.x + dx, y, o.z + dz))); group.add(im);
    B.add(cyl(0.035, 0.04, 0.25, 12), std({ color: 0x1a4a2a, roughness: 0.1, metalness: 0.2 }), v3(o.x, 1.45, o.z));
  }
  for (const o of ob('piano')) B.add(rbox(0.7, 0.08, 0.32, 0.03), MAT.blackGloss, v3(o.x, 0.48, o.z - o.d / 2 - 0.35)); // the piano's bench
  // a rug in the bar
  const [rc, rg] = T.canvas(256, 256);
  rg.fillStyle = '#4a1418'; rg.fillRect(0, 0, 256, 256); rg.strokeStyle = '#d9a94a'; rg.lineWidth = 6; rg.strokeRect(12, 12, 232, 232); rg.lineWidth = 2; rg.strokeRect(24, 24, 208, 208);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; rg.fillStyle = '#7a2a20'; rg.beginPath(); rg.ellipse(128 + Math.cos(a) * 60, 128 + Math.sin(a) * 60, 28, 12, a, 0, 7); rg.fill(); }
  rg.fillStyle = '#d9a94a'; rg.beginPath(); rg.arc(128, 128, 22, 0, 7); rg.fill();
  const barRug = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), std({ map: T.tex(rc, false), roughness: 0.95 })); barRug.rotation.x = -Math.PI / 2; barRug.receiveShadow = true; add(barRug, v3(300 * M, 0.006, 470 * M));
  // paintings: [x, y (sim px, a wall's inner face), yaw (the way the picture faces), kind]
  const ART = [[20, 285, Math.PI / 2, 0], [20, 525, Math.PI / 2, 3], [640, 440, Math.PI / 2, 1], [2000, 660, -Math.PI / 2, 1], [640, 180, Math.PI / 2, 0], [2000, 180, -Math.PI / 2, 2],
    [2240, 1200, 0, 0], [2760, 1200, 0, 2], [2200, 1880, Math.PI, 3], [2800, 1880, Math.PI, 0], [620, 520, -Math.PI / 2, 2]];
  ART.forEach(([px, py, yaw, kind], i) => {
    const nx = Math.sin(yaw), nz = Math.cos(yaw), x = px * M, z = py * M;
    B.add(rbox(1.0, 1.24, 0.06, 0.02), MAT.gold, v3(x + nx * 0.03, 1.75, z + nz * 0.03), yaw);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 1.05), std({ map: painting(kind, i + 1), roughness: 0.6 }));
    pic.rotation.y = yaw; add(pic, v3(x + nx * 0.065, 1.75, z + nz * 0.065));
    const lamp = new THREE.Mesh(cyl(0.025, 0.025, 0.5, 10), glowMat(0xffe0b0, 1.5)); lamp.rotation.set(0, yaw, Math.PI / 2, 'YXZ'); add(lamp, v3(x + nx * 0.14, 2.42, z + nz * 0.14));
  });
}

// ---------- Pit bell ----------
function pitBell(ctx) {
  const { B, group, anim } = ctx;
  const bx = BELL.x * M, bz = BELL.y * M;
  B.add(cyl(0.5, 0.6, 0.08, 32), MAT.gold, v3(bx, 0.04, bz));
  B.add(cyl(0.14, 0.18, 0.95, 20), MAT.marble, v3(bx, 0.55, bz));
  B.add(cyl(0.2, 0.18, 0.06, 24), MAT.gold, v3(bx, 1.05, bz));
  const bell = new THREE.Mesh(lathe([[0, 0.2], [0.04, 0.2], [0.05, 0.16], [0.1, 0.12], [0.13, 0.04], [0.15, 0], [0, 0]], 24), MAT.gold);
  bell.position.set(bx, 1.08, bz); bell.castShadow = true; group.add(bell);
  const knob = new THREE.Mesh(sph(0.03, 10), MAT.gold); knob.position.set(bx, 1.3, bz); group.add(knob);
  const label = T.textSprite('PIT BELL', { color: '#e8c46a', size: 40, h: 0.16 }); label.position.set(bx, 1.55, bz); group.add(label);
  anim.push(t => { bell.rotation.z = Math.sin(t * 2) * 0.03; });
  // a marble medallion in the carpet around it
  const med = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), std({ map: T.medallion(), roughness: 0.25, metalness: 0.1 }));
  med.rotation.x = -Math.PI / 2; med.position.set(bx, 0.005, bz); med.receiveShadow = true; group.add(med);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.7, 64), MAT.gold); ring.rotation.x = -Math.PI / 2; ring.position.set(bx, 0.007, bz); group.add(ring);
  for (const b of BOWL_SPOTS) {
    const x = b.x * M, z = b.y * M;
    B.add(cyl(0.18, 0.22, 0.04, 20), MAT.brass, v3(x, 0.02, z)); B.add(cyl(0.03, 0.03, 0.9, 10), MAT.brass, v3(x, 0.47, z)); B.add(cyl(0.2, 0.16, 0.04, 20), MAT.darkWood, v3(x, 0.93, z));
  }
}

// ---------- Seats and drink rails ----------
function seatsAndRails(ctx, seats) {
  const { B } = ctx;
  for (const s of seats) {
    const x = s.x * M, z = s.y * M, yaw = yawOf(s.face);
    const back = v3(-Math.sin(yaw) * 0.26, 0, -Math.cos(yaw) * 0.26);
    const stool = ['slots', 'crash', 'plinko', 'mines', 'tower', 'wheel', 'coin', 'race'].includes(s.game);
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
}

// ---------- Plants ----------
function plants(ctx) {
  const { B } = ctx;
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
// Each one is its own small model so a killer can bring it down (pub.chandeliers, same order as CHANDELIERS).
function chandeliers(ctx) {
  const { group, lightSpots, anim } = ctx;
  const crystal = new THREE.OctahedronGeometry(0.035, 0);
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe0a0, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.3 });
  GLOWS.push({ m: crystalMat, k: 'emissiveIntensity', v: 0.9 });
  const bulbMat = glowMat(0xffd8a0, 3.2), bulbGeo = sph(0.045, 10);
  const list = ctx.chandeliers = [];
  for (const [cxp, czp] of CHANDELIERS) {
    const room = strictRoom(cxp, czp);
    if (room === 'alley' || room === 'race' || room === 'arcade') { lightSpots.push({ p: v3(cxp * M, WALL_H - 0.5, czp * M), color: room === 'arcade' ? 0xd0a0ff : 0xbfefff, power: 6, range: 10 }); list.push(null); continue; }
    const big = room === 'floor', R = big ? 0.8 : 0.5;
    const g = new THREE.Group(); g.position.set(cxp * M, 0, czp * M); group.add(g);
    const B = new Batch(true), crystals = [], bulbPts = [];
    B.add(cyl(0.012, 0.012, 0.5, 6), MAT.gold, v3(0, WALL_H - 0.25, 0)); B.add(cyl(0.18, 0.12, 0.08, 16), MAT.gold, v3(0, WALL_H - 0.04, 0));
    for (const [rr, y, t] of [[R, 0.6, 0.03], [R * 0.62, 0.82, 0.025], [R * 0.3, 1.0, 0.02]]) B.add(torus(rr, t, 8, 40), MAT.gold, v3(0, WALL_H - y, 0), 0, null, Math.PI / 2);
    B.add(lathe([[0, -0.3], [0.06, -0.2], [0.1, 0], [0.04, 0.1], [0, 0.12]], 16), MAT.gold, v3(0, WALL_H - 0.85, 0));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; B.add(cyl(0.01, 0.01, R * 1.02, 6), MAT.gold, v3(Math.cos(a) * R * 0.5, WALL_H - 0.6, Math.sin(a) * R * 0.5), -a, null, 0, Math.PI / 2); }
    const nb = big ? 14 : 8;
    for (let i = 0; i < nb; i++) {
      const a = i / nb * Math.PI * 2;
      bulbPts.push(v3(Math.cos(a) * R, WALL_H - 0.53, Math.sin(a) * R));
      if (big) bulbPts.push(v3(Math.cos(a + 0.2) * R * 0.62, WALL_H - 0.76, Math.sin(a + 0.2) * R * 0.62));
      for (let j = 0; j < 4; j++) crystals.push(v3(Math.cos(a + 0.2) * R * (0.95 - j * 0.02), WALL_H - 0.7 - j * 0.085, Math.sin(a + 0.2) * R * (0.95 - j * 0.02)));
      crystals.push(v3(Math.cos(a) * R * 0.6, WALL_H - 0.98 - (i % 2) * 0.08, Math.sin(a) * R * 0.6));
    }
    B.build(g);
    const cm = new THREE.InstancedMesh(crystal, crystalMat, crystals.length);
    crystals.forEach((p, i) => cm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
    const bm = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbPts.length);
    bulbPts.forEach((p, i) => bm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
    g.add(cm, bm);
    const spot = { p: v3(cxp * M, WALL_H - 0.95, czp * M), color: 0xffd29a, power: big ? 9 : 6, range: big ? 12 : 8 };
    lightSpots.push(spot);
    list.push({ g, bm, spot, power: spot.power, drop: WALL_H - 1.18, seed: cxp + czp });
  }
  // falling: it shudders on its chain, then drops; down: it lies broken on the floor, dark
  anim.push((t, dt, state) => {
    const chs = state && state.pub && state.pub.chandeliers; if (!chs) return;
    for (const ch of chs) {
      const e = list[ch.id]; if (!e) continue;
      const g = e.g;
      if (ch.state === 'up') { g.position.y = 0; g.rotation.set(0, 0, 0); e.bm.visible = true; e.spot.power = e.power; continue; }
      if (ch.state === 'falling') {
        const shake = Math.min(1, (1.6 - ch.t) / 0.8) * 0.06;
        g.rotation.set(Math.sin(t * 31 + e.seed) * shake, 0, Math.cos(t * 27 + e.seed) * shake);
        g.position.y = ch.t < 0.35 ? -e.drop * (1 - (ch.t / 0.35) ** 2) : 0;
        e.spot.power = e.power * (0.5 + 0.5 * Math.abs(Math.sin(t * 40)));
      } else { g.position.y = -e.drop; g.rotation.set(0.12, e.seed % 3, 0.22); e.bm.visible = false; e.spot.power = 0; }
    }
  });
}

// ---------- The back alley ----------
function alleyDressing(ctx) {
  const { B } = ctx;
  // a dumpster, crates and a fire escape ladder by the walls
  const dx = 1950 * M, dz = 1250 * M;
  B.add(rbox(1.0, 1.0, 1.6, 0.04), MAT.candy(0x2a6a3a), v3(dx - 0.3, 0.55, dz + 0.9));
  B.add(box(1.04, 0.06, 1.64), MAT.metalDark, v3(dx - 0.3, 1.08, dz + 0.9), 0, null, 0, -0.1);
  for (const [x, z, s] of [[1060, 1840, 0.6], [1110, 1845, 0.5], [1075, 1800, 0.45]]) B.add(box(s, s, s), MAT.wood, v3(x * M, s / 2 + (z === 1800 ? 0.6 : 0), z * M), z * 0.01);
  for (let i = 0; i < 8; i++) B.add(box(0.05, 0.05, 0.5), MAT.metalDark, v3(1030 * M + 0.04, 0.4 + i * 0.4, 1700 * M), 0);
  B.add(box(0.05, 3.4, 0.05), MAT.metalDark, v3(1030 * M + 0.04, 1.7, 1700 * M - 0.25)); B.add(box(0.05, 3.4, 0.05), MAT.metalDark, v3(1030 * M + 0.04, 1.7, 1700 * M + 0.25));
  // traffic cones
  for (const [x, z] of [[1480, 1380], [1080, 1250]]) { B.add(cyl(0.02, 0.16, 0.5, 14), MAT.candy(0xff6a1a), v3(x * M, 0.27, z * M)); B.add(box(0.36, 0.03, 0.36), MAT.candy(0xff6a1a), v3(x * M, 0.015, z * M)); }
  ctx.sign('DICE', 0x3fe0ff, 1280 * M, 2.9, 1200 * M + 0.05, 0, 1.4, 0.5);
  ctx.sign('SPIN TO WIN', 0xffd040, 1700 * M, 3.5, 1880 * M - 0.05, Math.PI, 2.6, 0.45, false);
  ctx.sign('FLIP', 0xff3fa4, 1990 * M, 2.6, 1335 * M, -Math.PI / 2, 1.1, 0.45);
}

// ---------- The arcade ----------
function arcadeDressing(ctx) {
  ctx.sign('CRASH', 0xff3fa4, 2500 * M, 3.25, 20 * M + 0.05, 0, 2.0, 0.42, false);
  ctx.sign('PLINKO', 0x3fe0ff, 2980 * M - 0.05, 3.1, 380 * M, -Math.PI / 2, 2.2, 0.5);
  ctx.sign('MINES', 0x3fff8a, 2210 * M, 2.9, 700 * M - 0.05, Math.PI, 1.6, 0.45);
  ctx.sign('DRAGON TOWER', 0xffa040, 2770 * M, 2.9, 700 * M - 0.05, Math.PI, 2.6, 0.45);
}

// Marquee bulbs everywhere share one instanced mesh with a chasing pattern.
function bulbsMesh(ctx) {
  const { bulbs, group, anim } = ctx;
  if (!bulbs.length) return;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const im = new THREE.InstancedMesh(sph(0.028, 8), mat, bulbs.length);
  bulbs.forEach((b, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(b.p.x, b.p.y, b.p.z)));
  const on = new THREE.Color(2.6, 2.1, 1.2), off = new THREE.Color(0.35, 0.25, 0.12);
  GLOWS.push({ m: mat, k: 'color', v: 1 });
  group.add(im);
  anim.push({ every: 0.12, f: t => { const k = Math.floor(t * 8); bulbs.forEach((b, i) => im.setColorAt(i, (b.phase + k) % 3 === 0 ? off : on)); im.instanceColor.needsUpdate = true; } });
}
