// The static casino, built once from the map data. Sim px -> metres: x/60 east, y/60 south.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { ROOMS, WALLS, OBSTACLES, DOOR_GAPS, CHANDELIERS, PLANTS, TAP, BELL, BOWL_SPOTS, SLOT_YS, makeSeats } from '../map.js';

export const M = 1 / 60, WALL_H = 3.6;
export const yawOf = a => Math.PI / 2 - a; // object facing +Z local -> facing sim angle a
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- Materials ----------
const std = (o) => new THREE.MeshStandardMaterial(o);
export const MAT = {
  gold: std({ color: 0xd9a94a, metalness: 0.9, roughness: 0.32, envMapIntensity: 0.7 }),
  brass: std({ color: 0xc8963a, metalness: 0.85, roughness: 0.35 }),
  chrome: std({ color: 0xdde2e6, metalness: 1, roughness: 0.18 }),
  darkWood: std({ map: T.wood('#4a2616', '#2a140a'), roughness: 0.45 }),
  wood: std({ map: T.wood('#6b4128', '#3a2214'), roughness: 0.5 }),
  polished: std({ color: 0x3a1a10, roughness: 0.18, metalness: 0.1 }),
  velvet: new THREE.MeshPhysicalMaterial({ color: 0x9a1a30, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xff8090), sheenRoughness: 0.5 }),
  purple: new THREE.MeshPhysicalMaterial({ color: 0x5a2470, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xd090ff), sheenRoughness: 0.5 }),
  leather: std({ color: 0x2a1410, roughness: 0.55 }),
  black: std({ color: 0x141014, roughness: 0.4 }),
  marble: std({ color: 0xd8d0c4, roughness: 0.35 }),
  porcelain: std({ color: 0xf6f6f2, roughness: 0.12 }),
  felt: std({ color: 0x1b6a40, roughness: 0.95 }),
  slotRed: std({ color: 0xb01828, roughness: 0.35, metalness: 0.3 }),
  leaf: new THREE.MeshPhysicalMaterial({ color: 0x2f7a35, roughness: 0.7, sheen: 0.6, sheenColor: new THREE.Color(0x9fe08a) }),
  pot: std({ color: 0x1a1214, roughness: 0.3, metalness: 0.4 }),
  mirror: std({ color: 0x8a7a70, metalness: 0.9, roughness: 0.3, envMapIntensity: 0.25 }),
  stall: std({ color: 0x6a8a88, roughness: 0.5 }),
};
// Emissive materials get dimmed when the lights go out; keep a list with their normal strength.
export const GLOWS = [];
function glowMat(color, strength = 1, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(color), emissiveIntensity: strength, roughness: 0.4, ...extra });
  GLOWS.push({ m, k: 'emissiveIntensity', v: strength }); return m;
}
function basicGlow(map, strength = 1.6, extra = {}) {
  const m = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(strength, strength, strength), toneMapped: false, ...extra });
  GLOWS.push({ m, k: 'color', v: strength }); return m;
}

const ROOM_LOOK = {
  floor: { wall: () => T.wallpaper('#6a1a2a'), floor: () => T.carpet('#7a1424'), tile: 1.6, ceil: '#2a1418' },
  bar: { wall: () => T.wallpaper('#3d2416', '#d9a94a'), floor: () => T.wood('#6b4128', '#3a2214'), tile: 2.4, ceil: '#24140c' },
  rest: { wall: () => T.tiles('#e6efe9', '#c4dad6'), floor: () => T.tiles('#2b3a40', '#3a4e55'), tile: 1.2, ceil: '#1e2a2e' },
  race: { wall: () => T.wallpaper('#1d2a52'), floor: () => T.carpet('#1d2742', '#e8c46a', '#16203a'), tile: 1.6, ceil: '#141a30' },
  vip: { wall: () => T.wallpaper('#4a2458'), floor: () => T.carpet('#4a2050', '#e8c46a', '#3a1840'), tile: 1.6, ceil: '#24122c' },
};
const roomMats = {};
for (const k in ROOM_LOOK) {
  const L = ROOM_LOOK[k];
  roomMats[k] = {
    wall: std({ map: L.wall(), roughness: k === 'rest' ? 0.25 : 0.8 }),
    floor: std({ map: L.floor(), roughness: k === 'bar' ? 0.35 : 0.95 }),
    ceil: std({ map: T.ceiling(L.ceil), roughness: 0.9 }),
    tile: L.tile,
  };
}

// ---------- Static batching: everything that never moves is merged per material ----------
class Batch {
  constructor() { this.lists = new Map(); }
  add(geom, mat, pos, rotY = 0, scale = null, rotX = 0, rotZ = 0) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    const m = new THREE.Matrix4().compose(pos || v3(0, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')), scale || v3(1, 1, 1));
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    if (!this.lists.has(mat)) this.lists.set(mat, []);
    this.lists.get(mat).push(g);
  }
  build(group) {
    for (const [mat, gs] of this.lists) {
      const mesh = new THREE.Mesh(mergeGeometries(gs, false), mat);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); group.add(mesh);
    }
  }
}
function uvScale(g, su, sv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
const cyl = (rt, rb, h, s = 20) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, s = 16) => new THREE.SphereGeometry(r, s, Math.max(8, s * 0.75));
const lathe = (pts, s = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), s);

function strictRoom(x, y) {
  for (const k in ROOMS) { const r = ROOMS[k]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return k; }
  return null;
}

export function buildWorld(scene) {
  const group = new THREE.Group(); scene.add(group);
  const B = new Batch();
  const anim = []; // per-frame updaters
  const lights = [];

  // Floors and ceilings
  for (const k in ROOMS) {
    const r = ROOMS[k], m = roomMats[k];
    const w = r.w * M, d = r.h * M, cx = (r.x + r.w / 2) * M, cz = (r.y + r.h / 2) * M;
    B.add(uvScale(new THREE.PlaneGeometry(w, d), w / m.tile, d / m.tile), m.floor, v3(cx, 0, cz), 0, null, -Math.PI / 2);
    B.add(uvScale(new THREE.PlaneGeometry(w, d), w / 2, d / 2), m.ceil, v3(cx, WALL_H, cz), 0, null, Math.PI / 2);
  }
  // Doorway floors (the gaps between rooms)
  for (const gp of DOOR_GAPS) {
    B.add(uvScale(new THREE.PlaneGeometry(gp.w * M, gp.h * M), 0.6, 0.6), MAT.darkWood, v3((gp.x + gp.w / 2) * M, 0.002, (gp.y + gp.h / 2) * M), 0, null, -Math.PI / 2);
    B.add(box(gp.w * M + 0.02, WALL_H - 2.7, gp.h * M + 0.02), MAT.darkWood, v3((gp.x + gp.w / 2) * M, 2.7 + (WALL_H - 2.7) / 2, (gp.y + gp.h / 2) * M));
    const vertical = gp.w < gp.h; // wall runs north-south
    const len = (vertical ? gp.h : gp.w) * M, th = (vertical ? gp.w : gp.h) * M + 0.12;
    for (const s of [-1, 1]) {
      const p = vertical ? v3((gp.x + gp.w / 2) * M, 1.35, (gp.y + gp.h / 2) * M + s * len / 2) : v3((gp.x + gp.w / 2) * M + s * len / 2, 1.35, (gp.y + gp.h / 2) * M);
      B.add(vertical ? box(th, 2.7, 0.12) : box(0.12, 2.7, th), MAT.gold, p);
    }
    B.add(vertical ? box(th, 0.14, len + 0.12) : box(len + 0.12, 0.14, th), MAT.gold, v3((gp.x + gp.w / 2) * M, 2.72, (gp.y + gp.h / 2) * M));
  }

  // Walls: each side gets the look of the room it faces. Thin walls are restroom stall partitions.
  for (const r of WALLS) {
    const stall = r.w <= 10 || r.h <= 10;
    const h = stall ? 2.0 : WALL_H;
    const x0 = r.x * M, x1 = (r.x + r.w) * M, z0 = r.y * M, z1 = (r.y + r.h) * M;
    const sides = [ // n: outward normal; runs are split where the room on that side changes
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
        const s = { n: sd.n, p, len };
        const m = roomMats[run.room], room = run.room;
        const rotY = Math.atan2(s.n[0], s.n[1]);
        const mat = stall ? MAT.stall : m.wall;
        B.add(uvScale(new THREE.PlaneGeometry(s.len, h), s.len / 1.2, h / 1.2), mat, v3(s.p[0], h / 2, s.p[1]), rotY);
        if (stall || s.len < 0.4) continue;
        const out = (d) => v3(s.p[0] + s.n[0] * d, 0, s.p[1] + s.n[1] * d);
        const wain = out(0.025); wain.y = 0.5;
        B.add(uvScale(box(s.len, 1.0, 0.05), s.len / 2, 0.5), room === 'rest' ? MAT.marble : MAT.darkWood, wain, rotY);
        const rail = out(0.05); rail.y = 1.02; B.add(box(s.len, 0.05, 0.06), MAT.gold, rail, rotY);
        const crown = out(0.05); crown.y = WALL_H - 0.12; B.add(box(s.len, 0.14, 0.1), MAT.gold, crown, rotY);
        const base = out(0.06); base.y = 0.05; B.add(box(s.len, 0.1, 0.06), MAT.black, base, rotY);
      }
    }
    if (!stall) { // the wall's top under the ceiling, for gaps seen through doorways
      B.add(box(r.w * M, 0.02, r.h * M), MAT.black, v3((x0 + x1) / 2, WALL_H - 0.01, (z0 + z1) / 2));
    }
  }

  const seats = makeSeats();
  // ---------- Bar ----------
  {
    const o = OBSTACLES.find(o => o.kind === 'counter');
    const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M, w = o.w * M, d = o.h * M;
    B.add(uvScale(box(w, 1.0, d), w, 1), MAT.darkWood, v3(cx, 0.5, cz));
    B.add(rbox(w + 0.12, 0.08, d + 0.18, 0.03), MAT.polished, v3(cx, 1.04, cz + 0.04));
    for (let x = o.x + 20; x < o.x + o.w - 10; x += 40) B.add(box(0.05, 0.8, 0.02), MAT.gold, v3(x * M, 0.5, (o.y + o.h) * M + 0.005));
    B.add(cyl(0.025, 0.025, w, 10), MAT.brass, v3(cx, 0.2, (o.y + o.h) * M + 0.22), 0, null, 0, Math.PI / 2);
    for (let i = 0; i < 3; i++) { // beer taps at the pour spot
      const x = (TAP.x - 20 + i * 20) * M, z = (o.y + o.h - 8) * M;
      B.add(cyl(0.02, 0.02, 0.3, 8), MAT.brass, v3(x, 1.22, z));
      B.add(cyl(0.012, 0.012, 0.18, 8), MAT.black, v3(x, 1.42, z));
      B.add(sph(0.03, 8), MAT.brass, v3(x, 1.36, z + 0.05));
    }
    // back bar: cabinet, mirror, shelves of bottles
    const bz = 20 * M;
    B.add(box(w, 0.9, 0.45), MAT.darkWood, v3(cx, 0.45, bz + 0.225));
    B.add(box(w, 1.5, 0.02), MAT.mirror, v3(cx, 1.75, bz + 0.01));
    for (const y of [1.25, 1.7, 2.15]) B.add(box(w, 0.04, 0.3), MAT.polished, v3(cx, y, bz + 0.15));
    const bottle = lathe([[0, 0], [0.045, 0], [0.05, 0.02], [0.05, 0.2], [0.03, 0.25], [0.016, 0.3], [0.016, 0.36], [0, 0.36]], 10);
    const cols = [0x2a7a3a, 0x8a2a1a, 0xc8a050, 0x5a3a8a, 0xd9f0c8, 0x6ab0e8, 0xb8692a, 0xe8e0d0];
    const n = 3 * 30, inst = new THREE.InstancedMesh(bottle, new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 }), n);
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    let i = 0;
    for (const y of [1.27, 1.72, 2.17]) for (let k = 0; k < 30; k++) {
      const s = 0.85 + Math.random() * 0.4;
      mtx.compose(v3((o.x + 12 + k * (o.w - 24) / 29) * M, y, bz + 0.12 + Math.random() * 0.08), new THREE.Quaternion(), v3(s, s, s));
      inst.setMatrixAt(i, mtx); inst.setColorAt(i, col.setHex(cols[Math.floor(Math.random() * cols.length)])); i++;
    }
    group.add(inst);
    const strip = new THREE.Mesh(box(w, 0.03, 0.03), glowMat(0xffb060, 2.2)); strip.position.set(cx, 2.42, bz + 0.05); group.add(strip);
    sign('BAR', 0xffc070, cx, 2.95, bz + 0.03, 0, 1.6, 0.6);
  }

  // ---------- Blackjack ----------
  {
    const o = OBSTACLES.find(o => o.kind === 'bj');
    const cx = (o.x + o.w / 2) * M, z0 = o.y * M, rx = o.w / 2 * M, rz = o.h * M;
    const half = (ax, az) => { const s = new THREE.Shape(); for (let i = 0; i <= 32; i++) { const t = Math.PI * i / 32; s.lineTo(Math.cos(t) * ax, -Math.sin(t) * az); } s.closePath(); return s; };
    const rail = new THREE.ExtrudeGeometry(half(rx + 0.16, rz + 0.16), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.06, bevelSegments: 4, curveSegments: 32 });
    B.add(rail, MAT.leather, v3(cx, 0.74, z0), 0, null, -Math.PI / 2);
    const top = new THREE.ShapeGeometry(half(rx, rz), 48);
    const pos = top.attributes.position, uv = top.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + rx) / (2 * rx), 1 + pos.getY(i) / rz);
    const felt = new THREE.Mesh(top, std({ map: T.bjFelt(), roughness: 0.95 }));
    felt.rotation.x = -Math.PI / 2; felt.position.set(cx, 0.865, z0); group.add(felt);
    B.add(cyl(0.3, 0.4, 0.74, 20), MAT.darkWood, v3(cx, 0.37, z0 + rz * 0.4));
    B.add(box(rx * 2 + 0.3, 0.12, 0.3), MAT.darkWood, v3(cx, 0.8, z0 - 0.1));
    // chip tray, shoe, chips and cards
    B.add(box(0.6, 0.04, 0.18), MAT.black, v3(cx, 0.88, z0 + 0.14));
    B.add(rbox(0.2, 0.12, 0.3, 0.02), MAT.black, v3(cx + 0.6, 0.93, z0 + 0.2), -0.4);
    chipStacks(B, [[cx - 0.22, z0 + 0.14], [cx - 0.1, z0 + 0.14], [cx + 0.02, z0 + 0.14], [cx + 0.14, z0 + 0.14]], 0.885, 6);
    cardsOn(group, [[cx - 0.05, z0 + 0.4, 0.1], [cx + 0.07, z0 + 0.41, -0.1]], 0.87);
  }

  // ---------- Roulette ----------
  {
    const o = OBSTACLES.find(o => o.kind === 'roulette');
    const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M, w = o.w * M, d = o.h * M;
    B.add(rbox(w + 0.25, 0.12, d + 0.25, 0.05), MAT.leather, v3(cx, 0.8, cz));
    B.add(box(w - 0.3, 0.74, d - 0.4), MAT.darkWood, v3(cx, 0.37, cz));
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std({ map: T.rouletteFelt(), roughness: 0.95 }));
    felt.rotation.set(-Math.PI / 2, 0, Math.PI); felt.position.set(cx, 0.865, cz); group.add(felt);
    // The wheel sits at the east end (the felt is turned to face the players on the north side).
    const wx = (o.x + o.w - 50) * M, wz = cz;
    B.add(cyl(0.72, 0.6, 0.14, 40), MAT.darkWood, v3(wx, 0.92, wz));
    B.add(new THREE.TorusGeometry(0.66, 0.035, 8, 48), MAT.gold, v3(wx, 0.99, wz), 0, null, Math.PI / 2);
    const wheel = new THREE.Group(); wheel.position.set(wx, 0.985, wz); group.add(wheel);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), std({ map: T.wheelTex(), roughness: 0.3, metalness: 0.2 }));
    disc.rotation.x = -Math.PI / 2; wheel.add(disc);
    const hub = new THREE.Mesh(lathe([[0, 0.12], [0.03, 0.12], [0.02, 0.06], [0.08, 0.02], [0.12, 0]], 16), MAT.gold); wheel.add(hub);
    for (let i = 0; i < 4; i++) { const arm = new THREE.Mesh(cyl(0.012, 0.012, 0.22, 6), MAT.gold); arm.rotation.z = Math.PI / 2; arm.rotation.y = i * Math.PI / 2; arm.position.y = 0.06; arm.position.x = Math.cos(i * Math.PI / 2) * 0.11; arm.position.z = -Math.sin(i * Math.PI / 2) * 0.11; wheel.add(arm); }
    const ball = new THREE.Mesh(sph(0.025, 10), MAT.porcelain); group.add(ball);
    anim.push(t => { wheel.rotation.y = t * 0.9; const a = -t * 1.7; const r = 0.5 + Math.sin(t * 0.3) * 0.05; ball.position.set(wx + Math.cos(a) * r, 1.0, wz + Math.sin(a) * r); });
    chipStacks(B, [[cx - 0.5, cz + 0.1], [cx - 0.2, cz - 0.2], [cx + 0.1, cz + 0.15]], 0.87, 5);
  }

  // ---------- Slots ----------
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i]; if (o.kind !== 'slot') continue;
    const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M, d = o.w * M, w = o.h * M;
    B.add(rbox(d, 1.0, w, 0.05), MAT.slotRed, v3(cx, 0.5, cz));
    B.add(rbox(d * 0.8, 0.9, w, 0.05), MAT.slotRed, v3(cx - d * 0.1, 1.45, cz));
    B.add(box(0.06, 0.04, w + 0.02), MAT.gold, v3(cx + d / 2, 1.0, cz));
    B.add(rbox(d * 0.85, 0.32, w + 0.04, 0.06), MAT.gold, v3(cx - d * 0.08, 2.02, cz));
    B.add(box(0.12, 0.06, w * 0.8), MAT.chrome, v3(cx + d / 2 + 0.02, 0.98, cz));
    const lever = cyl(0.018, 0.018, 0.5, 8);
    B.add(lever, MAT.chrome, v3(cx, 1.35, cz + w / 2 + 0.04));
    B.add(sph(0.05, 12), MAT.slotRed, v3(cx, 1.62, cz + w / 2 + 0.04));
    const idx = SLOT_YS.indexOf(o.y + 26);
    const live = T.liveCanvas(256, 160, (g, W, H, t) => paintReels(g, W, H, t, idx));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, 0.5), basicGlow(live.tex, 1.15));
    scr.position.set(cx - d * 0.1 + d * 0.4 + 0.005, 1.5, cz); scr.rotation.y = Math.PI / 2; group.add(scr);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 0.26), basicGlow(T.neonTexture('777', '#ffd040', 512, 160, 'bold 120px Georgia'), 1.8, { blending: THREE.AdditiveBlending, transparent: true }));
    top.position.set(cx - d * 0.08 + d * 0.425 + 0.01, 2.02, cz); top.rotation.y = Math.PI / 2; group.add(top);
    anim.push({ every: 0.12 + idx * 0.01, f: t => live.update(t) });
  }

  // ---------- Race lounge ----------
  {
    const sx0 = 1330 * M, sx1 = 1730 * M, wz = 20 * M + 0.02;
    B.add(box(sx1 - sx0 + 0.2, 2.0, 0.06), MAT.gold, v3((sx0 + sx1) / 2, 2.1, wz + 0.02));
    const live = T.liveCanvas(1024, 300, paintRace);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(sx1 - sx0, 1.8), basicGlow(live.tex, 1.1));
    scr.position.set((sx0 + sx1) / 2, 2.1, wz + 0.06); group.add(scr);
    anim.push({ every: 1 / 15, f: t => live.update(t) });
    for (const o of OBSTACLES.filter(o => o.kind === 'desk')) {
      const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M;
      B.add(rbox(o.w * M, 0.08, o.h * M + 0.08, 0.02), MAT.polished, v3(cx, 0.82, cz));
      B.add(box(o.w * M - 0.1, 0.78, 0.06), MAT.darkWood, v3(cx, 0.39, cz - 0.1));
      B.add(box(0.36, 0.22, 0.03), MAT.black, v3(cx, 1.0, cz - 0.08), 0, null, -0.25);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.18), glowMat(0x3a6aff, 0.9)); m.position.set(cx, 1.0, cz - 0.06); m.rotation.x = -0.25; group.add(m);
    }
    sign('RACES', 0x60a0ff, 1530 * M, 3.3, wz + 0.05, 0, 2.0, 0.5);
  }

  // ---------- VIP lounge ----------
  {
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
    }
    sign('VIP', 0xd070ff, 1530 * M, 3.15, 610 * M + 0.05, 0, 1.2, 0.5);
    for (const x of [1440, 1620]) { // velvet rope posts by the door
      B.add(cyl(0.03, 0.03, 0.95, 10), MAT.gold, v3(x * M, 0.475, 640 * M)); B.add(sph(0.05, 10), MAT.gold, v3(x * M, 0.97, 640 * M));
      B.add(cyl(0.16, 0.16, 0.03, 16), MAT.gold, v3(x * M, 0.015, 640 * M));
    }
  }

  // ---------- Restrooms ----------
  {
    const o = OBSTACLES.find(o => o.kind === 'sinks');
    const cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M;
    B.add(box(o.w * M, 0.85, o.h * M), MAT.darkWood, v3(cx, 0.425, cz));
    B.add(box(o.w * M + 0.06, 0.05, o.h * M + 0.04), MAT.marble, v3(cx + 0.02, 0.875, cz));
    for (let y = o.y + 30; y < o.y + o.h; y += 65) {
      B.add(lathe([[0, 0], [0.12, 0.01], [0.17, 0.08], [0.18, 0.1], [0, 0.1]], 20), MAT.porcelain, v3(cx + 0.05, 0.82, y * M), 0, v3(1, 1, 1.3));
      B.add(cyl(0.015, 0.015, 0.22, 8), MAT.chrome, v3(cx - 0.12, 1.0, y * M)); B.add(cyl(0.012, 0.012, 0.14, 8), MAT.chrome, v3(cx - 0.06, 1.1, y * M), 0, null, 0, Math.PI / 2);
      B.add(box(0.03, 0.9, 0.75), MAT.gold, v3(20 * M + 0.015, 1.75, y * M)); B.add(box(0.02, 0.8, 0.65), MAT.mirror, v3(20 * M + 0.03, 1.75, y * M));
    }
    for (const x of [200, 320, 450]) {
      const z = 1140 * M;
      B.add(lathe([[0, 0], [0.16, 0], [0.18, 0.2], [0.22, 0.38], [0.2, 0.42], [0, 0.42]], 20), MAT.porcelain, v3(x * M, 0, z), 0, v3(1, 1, 1.25));
      B.add(rbox(0.4, 0.4, 0.18, 0.04), MAT.porcelain, v3(x * M, 0.6, z + 0.2));
    }
    sign('RESTROOMS', 0x80fff0, 270 * M, 3.05, 600 * M - 0.05, Math.PI, 2.2, 0.38);
  }

  // ---------- Pit bell, snack stands, seats and drink rails ----------
  {
    const bx = BELL.x * M, bz = BELL.y * M;
    B.add(cyl(0.22, 0.28, 0.08, 24), MAT.gold, v3(bx, 0.04, bz));
    B.add(cyl(0.14, 0.16, 0.95, 20), MAT.marble, v3(bx, 0.55, bz));
    B.add(cyl(0.2, 0.18, 0.06, 24), MAT.gold, v3(bx, 1.05, bz));
    const bell = new THREE.Mesh(lathe([[0, 0.2], [0.04, 0.2], [0.05, 0.16], [0.1, 0.12], [0.13, 0.04], [0.15, 0], [0, 0]], 24), MAT.gold);
    bell.position.set(bx, 1.08, bz); group.add(bell);
    const knob = new THREE.Mesh(sph(0.03, 10), MAT.gold); knob.position.set(bx, 1.3, bz); group.add(knob);
    const label = T.textSprite('PIT BELL', { color: '#e8c46a', size: 40, h: 0.16 }); label.position.set(bx, 1.55, bz); group.add(label);
    anim.push(t => { bell.rotation.z = Math.sin(t * 2) * 0.03; });
  }
  for (const b of BOWL_SPOTS) {
    const x = b.x * M, z = b.y * M;
    B.add(cyl(0.18, 0.22, 0.04, 20), MAT.brass, v3(x, 0.02, z));
    B.add(cyl(0.03, 0.03, 0.9, 10), MAT.brass, v3(x, 0.47, z));
    B.add(cyl(0.2, 0.16, 0.04, 20), MAT.darkWood, v3(x, 0.93, z));
  }
  for (const s of seats) {
    const x = s.x * M, z = s.y * M, yaw = yawOf(s.face);
    const back = v3(-Math.sin(yaw) * 0.26, 0, -Math.cos(yaw) * 0.26);
    if (s.game === 'slots') {
      B.add(cyl(0.2, 0.2, 0.1, 18), MAT.velvet, v3(x, 0.62, z));
      B.add(cyl(0.035, 0.035, 0.6, 10), MAT.brass, v3(x, 0.3, z));
      B.add(cyl(0.2, 0.22, 0.03, 18), MAT.brass, v3(x, 0.015, z));
      B.add(new THREE.TorusGeometry(0.16, 0.012, 6, 20), MAT.brass, v3(x, 0.28, z), 0, null, Math.PI / 2);
    } else if (s.game === 'vip') {
      B.add(rbox(0.8, 0.4, 0.75, 0.1), MAT.purple, v3(x, 0.32, z), yaw);
      B.add(rbox(0.8, 0.75, 0.2, 0.08), MAT.purple, v3(x + back.x * 1.3, 0.62, z + back.z * 1.3), yaw);
      for (const sd of [-1, 1]) B.add(rbox(0.16, 0.5, 0.75, 0.07), MAT.purple, v3(x + Math.cos(yaw) * 0.4 * sd, 0.47, z - Math.sin(yaw) * 0.4 * sd), yaw);
    } else {
      B.add(rbox(0.5, 0.12, 0.48, 0.05), MAT.velvet, v3(x, 0.52, z), yaw);
      B.add(rbox(0.5, 0.62, 0.1, 0.05), MAT.velvet, v3(x + back.x, 0.84, z + back.z), yaw, null, -0.08);
      B.add(box(0.5, 0.025, 0.1), MAT.brass, v3(x + back.x * 1.05, 1.15, z + back.z * 1.05), yaw);
      for (const [dx, dz] of [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]]) {
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        B.add(cyl(0.022, 0.016, 0.46, 8), MAT.gold, v3(x + dx * c + dz * sn, 0.23, z - dx * sn + dz * c));
      }
    }
    // The drink rail behind the seat: a little brass cocktail stand.
    const dx = s.drink.x * M, dz = s.drink.y * M;
    B.add(cyl(0.12, 0.14, 0.03, 16), MAT.brass, v3(dx, 0.015, dz));
    B.add(cyl(0.022, 0.022, 0.98, 10), MAT.brass, v3(dx, 0.5, dz));
    B.add(cyl(0.12, 0.1, 0.035, 20), MAT.polished, v3(dx, 1.0, dz));
    B.add(new THREE.TorusGeometry(0.12, 0.008, 6, 24), MAT.gold, v3(dx, 1.017, dz), 0, null, Math.PI / 2);
  }

  // ---------- Plants ----------
  for (const [px, py] of PLANTS) {
    const x = px * M, z = py * M;
    B.add(lathe([[0, 0], [0.18, 0], [0.24, 0.4], [0.26, 0.45], [0, 0.45]], 18), MAT.pot, v3(x, 0, z));
    B.add(new THREE.TorusGeometry(0.25, 0.015, 6, 24), MAT.gold, v3(x, 0.42, z), 0, null, Math.PI / 2);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2, tilt = 0.5 + (i % 3) * 0.25, len = 0.5 + (i % 2) * 0.25;
      B.add(sph(0.12, 10), MAT.leaf, v3(x + Math.cos(a) * len * 0.45, 0.5 + len * 0.6, z + Math.sin(a) * len * 0.45), -a, v3(0.6, 0.25, len * 2.2), -tilt);
    }
  }

  // ---------- Neon sign, chandeliers, wall sconces ----------
  sign('LAST CALL', 0xff5c8a, 900 * M, 2.75, 20 * M + 0.04, 0, 4.4, 1.1);
  const crystal = new THREE.OctahedronGeometry(0.035, 0);
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe0a0, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.3 });
  GLOWS.push({ m: crystalMat, k: 'emissiveIntensity', v: 0.9 });
  const bulbMat = glowMat(0xffd8a0, 3.2);
  const crystals = [];
  for (const [cxp, czp] of CHANDELIERS) {
    const x = cxp * M, z = czp * M, big = cxp === 900;
    const R = big ? 0.75 : 0.5;
    B.add(cyl(0.012, 0.012, 0.5, 6), MAT.gold, v3(x, WALL_H - 0.25, z));
    B.add(cyl(0.18, 0.12, 0.08, 16), MAT.gold, v3(x, WALL_H - 0.04, z));
    B.add(new THREE.TorusGeometry(R, 0.03, 8, 40), MAT.gold, v3(x, WALL_H - 0.6, z), 0, null, Math.PI / 2);
    B.add(new THREE.TorusGeometry(R * 0.6, 0.025, 8, 32), MAT.gold, v3(x, WALL_H - 0.82, z), 0, null, Math.PI / 2);
    B.add(lathe([[0, -0.2], [0.06, -0.12], [0.1, 0], [0.04, 0.1], [0, 0.12]], 16), MAT.gold, v3(x, WALL_H - 0.8, z));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; B.add(cyl(0.01, 0.01, R * 1.02, 6), MAT.gold, v3(x + Math.cos(a) * R * 0.5, WALL_H - 0.6, z + Math.sin(a) * R * 0.5), -a, null, 0, Math.PI / 2); }
    const nb = big ? 12 : 8;
    for (let i = 0; i < nb; i++) {
      const a = i / nb * Math.PI * 2;
      const b = new THREE.Mesh(sph(0.045, 10), bulbMat); b.position.set(x + Math.cos(a) * R, WALL_H - 0.53, z + Math.sin(a) * R); group.add(b);
      for (let j = 0; j < 3; j++) crystals.push(v3(x + Math.cos(a + 0.2) * R * (0.95 - j * 0.02), WALL_H - 0.7 - j * 0.09, z + Math.sin(a + 0.2) * R * (0.95 - j * 0.02)));
      crystals.push(v3(x + Math.cos(a) * R * 0.6, WALL_H - 0.95 - (i % 2) * 0.08, z + Math.sin(a) * R * 0.6));
    }
    const L = new THREE.PointLight(0xffd29a, big ? 7 : 5, big ? 11 : 8, 1.5);
    L.position.set(x, WALL_H - 0.9, z); group.add(L); lights.push({ l: L, v: L.intensity });
  }
  const cm = new THREE.InstancedMesh(crystal, crystalMat, crystals.length);
  crystals.forEach((p, i) => cm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  group.add(cm);
  // Sconces along the casino floor's long walls
  const sconceMat = glowMat(0xffc080, 2.4);
  for (let y = 120; y < 1180; y += 220) for (const [wx, face] of [[540, 1], [1260, -1]]) {
    if (y > 230 && y < 390) continue; if (y > 830 && y < 990) continue;
    const x = wx * M + face * 0.08, z = y * M;
    B.add(box(0.06, 0.3, 0.14), MAT.gold, v3(wx * M + face * 0.03, 2.2, z));
    const s = new THREE.Mesh(lathe([[0.02, 0], [0.08, 0.14], [0.09, 0.16], [0, 0.16]], 12), sconceMat); s.position.set(x, 2.28, z); group.add(s);
  }

  B.build(group);

  function sign(text, color, x, y, z, rotY, w, h) {
    const hex = '#' + new THREE.Color(color).getHexString();
    const t = T.neonTexture(text, hex, 1024, Math.round(1024 * h / w), `bold italic ${Math.round(1024 * h / w * 0.6)}px Georgia`);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basicGlow(t, 1.8, { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    m.position.set(x, y, z); m.rotation.y = rotY; group.add(m);
    anim.push(tt => { m.material.opacity = 0.92 + Math.sin(tt * 3 + x) * 0.08; });
  }

  let acc = {};
  return {
    group, lights, seats,
    update(t, dt) {
      anim.forEach((a, i) => {
        if (typeof a === 'function') return a(t);
        acc[i] = (acc[i] || 0) + dt; if (acc[i] >= a.every) { acc[i] = 0; a.f(t); }
      });
    },
  };
}

function chipStacks(B, spots, y, n) {
  const chip = cyl(0.032, 0.032, 0.012, 16);
  const cols = [0xe8443a, 0x2a2a2a, 0x3ddc97, 0x4a7dff, 0xe8c46a];
  spots.forEach(([x, z], i) => {
    const mat = MAT['chip' + i] || (MAT['chip' + i] = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.4 }));
    const h = 2 + ((i * 7) % n);
    for (let k = 0; k < h; k++) B.add(chip, mat, v3(x, y + k * 0.013, z));
  });
}
function cardsOn(group, spots, y) {
  spots.forEach(([x, z, r], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.1), new THREE.MeshStandardMaterial({ map: T.cardTex(['A♠', 'K♥', '7♣', 'Q♦'][i % 4], i % 2 === 1), roughness: 0.6 }));
    m.rotation.set(-Math.PI / 2, 0, r); m.position.set(x, y + 0.002 * (i + 1), z); group.add(m);
  });
}

const SYM = ['7', '🍒', '🔔', '💎', '🍋', 'BAR'];
function paintReels(g, w, h, t, idx) {
  g.fillStyle = '#1a0a10'; g.fillRect(0, 0, w, h);
  const spin = (Math.floor(t / 4 + idx * 0.37) % 3) === 0;
  for (let i = 0; i < 3; i++) {
    const x = 12 + i * 80;
    const grd = g.createLinearGradient(0, 10, 0, h - 10); grd.addColorStop(0, '#b8b0a0'); grd.addColorStop(0.5, '#fffaf0'); grd.addColorStop(1, '#b8b0a0');
    g.fillStyle = grd; g.fillRect(x, 10, 72, h - 20);
    const off = spin ? (t * 900 + i * 40) % 60 : 0;
    g.font = 'bold 40px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = -1; k <= 1; k++) {
      const s = SYM[Math.abs(Math.floor(t * (spin ? 12 : 0) + i * 2 + k + idx)) % SYM.length];
      g.fillStyle = s === '7' ? '#c0302a' : s === 'BAR' ? '#151515' : '#000';
      g.font = s === 'BAR' ? 'bold 22px Georgia' : 'bold 40px Georgia';
      g.fillText(s, x + 36, h / 2 + k * 60 + off);
    }
  }
  g.fillStyle = 'rgba(255,40,60,0.6)'; g.fillRect(0, h / 2 - 2, w, 4);
  g.strokeStyle = '#e8c46a'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
}
function paintRace(g, w, h, t) {
  g.fillStyle = '#0a1230'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1e6a3a'; g.fillRect(20, 60, w - 40, h - 80);
  g.fillStyle = '#e8c46a'; g.font = 'bold 34px Georgia'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const heat = Math.floor(t / 12), rt = t % 12;
  g.fillText(`RACE ${heat % 9 + 1}  ·  LIVE FROM LAST CALL DOWNS`, 30, 32);
  g.textAlign = 'right'; g.fillText(rt < 9 ? 'RUNNING' : 'FINISHED', w - 30, 32);
  const names = ['Gravy Train', 'Lucky Lou', 'Big Debt', 'Nine Lives'];
  const cols = ['#e8443a', '#3ddc97', '#4a7dff', '#f4e04d'];
  for (let i = 0; i < 4; i++) {
    const y = 90 + i * 52;
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(20, y + 26); g.lineTo(w - 20, y + 26); g.stroke();
    const speed = 0.8 + ((i * 37 + heat * 13) % 10) / 25;
    const p = Math.min(1, rt / 8 * speed);
    const x = 60 + p * (w - 170);
    const bob = Math.sin(t * 18 + i) * 3;
    g.fillStyle = '#5a3420'; g.beginPath(); g.ellipse(x, y + 4 + bob, 34, 12, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(x + 30, y - 6 + bob, 12, 8, -0.5, 0, 7); g.fill();
    g.fillStyle = cols[i]; g.beginPath(); g.arc(x - 4, y - 12 + bob, 10, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 18px Georgia'; g.textAlign = 'left'; g.fillText(names[i], 26, y - 14);
  }
  g.fillStyle = '#fff'; g.fillRect(w - 110, 60, 6, h - 80);
}
