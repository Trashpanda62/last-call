// The backrooms casino (Steve, 2026-10-15): one time in a hundred, when the lights come back on, the casino is Level 0
// of the Backrooms. "Make it look EXACTLY like the backrooms": a low drop ceiling of stained tiles with flush fluorescent
// panels in a grid, mono-yellow wallpaper with its faint chevron stripes on every wall, damp mottled carpet, a thin dark
// baseboard and nothing else. Every bit of casino dressing goes (no trim, pilasters, signs, art, plants, rugs, lamps,
// chandeliers, back bar); what you play stays, dulled as if it had been sitting there for years, and where the
// dressing was solid in the sim a wallpapered pillar or wall stub stands instead (so nothing invisible blocks you).
// Built once per casino build (a list of mesh -> material swaps and meshes to hide), then switched in one frame both ways:
// render3d.js calls update() at the blackout snap, so it swaps in the frame the power comes back. Nothing walks the scene
// per frame. The textures are Sorceress art (assets/backrooms, tools/backrooms_art.py); canvas paint stands in when an
// image cannot load.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { MAT, GLOWS, roomMats, M } from './world.js';
import { BEAMS } from './machines.js';
import { ROOMS, OBSTACLES } from '../map.js';
import * as audio from '../audio.js';

const HIDE = 'hide';
export const CEIL_H = 2.7; // the backrooms' ceiling (the casino's walls go on up behind it to 3.6 m, out of sight)
const CEIL_M = 2.4, CARPET_M = 3.2, PAPER_M = 2.4; // metres one ceiling texture (4 x 4 tiles of 0.6 m), carpet and paper texture cover
const LIGHT = { hemi: [0xfff6cc, 0x8a7a48], fill: 0xfff4c0, key: 0xfff8e0 }; // flat, yellow-white, from everywhere
// the props that stay (what you use: the bar counter for drinks, snacks, the pit bell, the restrooms, the seats)
const KEEP_PROPS = new Set(['barCounter', 'snackBowl', 'pitBell', 'sink', 'toilet', 'armchair', 'chair']);
// the solid dressing (map.js OBSTACLES) that becomes a wallpapered pillar or wall stub, floor to ceiling
const PILLARS = new Set(['hightop', 'booth', 'jukebox', 'crates', 'ottoman', 'pool', 'champagne', 'piano', 'couch', 'coffee']);
const PAPER_TINT = 0xffe892, CARPET_TINT = 0xf2dca0; // (the tone mapping greys yellows: pushed back a little)
const DOOR_COLOR = 0x3a4a3e; // the STAFF ONLY doors (world.js staffDoors): plain doors stay

// Canvas stand-ins, the same layout as the Sorceress art, when unavailable (or for ?nomats).
function standIn(kind) {
  const [c, g] = T.canvas(256, 256);
  const fleck = (n, a, col) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${col},${Math.random() * a})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); } };
  if (kind === 'wall') {
    g.fillStyle = '#cdb862'; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) { g.fillStyle = 'rgba(120,96,30,0.18)'; g.fillRect(x, 0, 2, 256); }
    fleck(400, 0.08, '90,70,20');
  } else if (kind === 'floor') {
    g.fillStyle = '#9a8650'; g.fillRect(0, 0, 256, 256); fleck(3000, 0.12, '60,50,20'); fleck(1500, 0.08, '230,220,170');
  } else { // the drop ceiling: 4 x 4 tiles, a panel over two of them, T-bars
    g.fillStyle = kind === 'glow' ? '#000' : '#d6cfae'; g.fillRect(0, 0, 256, 256); if (kind !== 'glow') fleck(900, 0.25, '120,110,80');
    g.fillStyle = kind === 'glow' ? '#fff' : '#f4f0dc'; g.fillRect(68, 68, 56, 120);
    if (kind !== 'glow') { g.fillStyle = '#e2dcc4'; for (let k = 0; k <= 4; k++) { g.fillRect(k * 64 - 2, 0, 4, 256); g.fillRect(0, k * 64 - 2, 256, 4); } }
  }
  return T.tex(c);
}
// A wet patch on the carpet: a soft irregular dark blot.
function stainTex() {
  const [c, g] = T.canvas(128, 128);
  for (let i = 0; i < 9; i++) {
    const x = 40 + Math.random() * 48, y = 40 + Math.random() * 48, r = 18 + Math.random() * 26, rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  }
  return T.tex(c, false);
}

const materialTasks = new Map();
export function preloadBackrooms(lowPower = false) {
  const key = !!lowPower;
  if (materialTasks.has(key)) return materialTasks.get(key);
  if (/[?&](toy|nomats)\b/.test(location.search)) return Promise.resolve({});
  // These optional textures retain their painted fallback on failure. Their own
  // manager keeps that behavior separate from required character/art failures.
  const loader = new THREE.TextureLoader(new THREE.LoadingManager()), loaded = {};
  const files = [['wall', 'wallpaper-color.webp', true], ['floor', 'carpet-color.webp', true],
    ['ceil', 'ceiling-color.webp', true], ['glow', 'ceiling-glow.webp', false],
    ...(lowPower ? [] : [['wallNormal', 'wallpaper-normal.webp', false], ['floorNormal', 'carpet-normal.webp', false], ['ceilNormal', 'ceiling-normal.webp', false]])];
  const task = Promise.all(files.map(([name, file, srgb]) => new Promise(ok => loader.load('assets/backrooms/' + file, t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    loaded[name] = t; ok();
  }, undefined, () => ok())))).then(() => loaded);
  materialTasks.set(key, task); return task;
}

export class Backrooms {
  // R: render3d's state (scene, renderer, camera, the lights and the pooled point lights)
  constructor(R) {
    this.R = R; this.on = false; this.world = null; this.flips = 0; this.warmed = false;
    this.swaps = []; this.hides = []; this.dulled = new Map();
    this.adds = new THREE.Group(); this.adds.visible = false; R.scene.add(this.adds);
    const std = (name, o) => Object.assign(new THREE.MeshStandardMaterial(o), { name: 'br-' + name });
    const W = this.W = {};
    this.tex = {};
    W.wall = std('wall', { roughness: 0.92, color: PAPER_TINT }); // walls are mapped at 1.2 m
    W.pillar = std('wall', { roughness: 0.92, color: PAPER_TINT }); // the new pillars, in metres
    W.floor = {};
    for (const k in roomMats) W.floor[k] = std('floor', { roughness: 0.97, color: CARPET_TINT });
    W.ceil = std('ceil', { emissive: 0xeef6cf, emissiveIntensity: 2.2, roughness: 0.95 });
    W.base = std('base', { color: 0x4a3c22, roughness: 0.75 }); // the thin dark baseboard
    W.stain = Object.assign(new THREE.MeshBasicMaterial({ map: stainTex(), color: 0x3a2a0c, transparent: true, opacity: 0.4, fog: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), { name: 'br-stain' });
    this.build();
    this.vignette = null;
    this.loading = this.load(R.lowPower);
    this.base = null; // the casino's light colours, kept while the backrooms' are in
  }

  // What the backrooms add: the low ceiling over everything, the pillars, the wet patches.
  build() {
    const W = this.W, add = (m) => { m.updateMatrix(); m.matrixAutoUpdate = false; this.adds.add(m); return m; };
    // one ceiling over the whole map (it closes over the doorways too: plain openings)
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const r of Object.values(ROOMS)) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    x0 -= 20; y0 -= 20; x1 += 20; y1 += 20;
    this.ceilRect = [x0 * M, y0 * M, x1 * M, y1 * M]; // (the ceiling itself is built with the casino: ceiling(), from scan())
    // pillars and wall stubs where the dressing was solid, each with its baseboard
    const geos = [], bases = [];
    const boxUV = (bw, bh, bd) => { // a box with its paper in metres on every face
      const g = new THREE.BoxGeometry(bw, bh, bd), u = g.attributes.uv, size = [[bd, bh], [bd, bh], [bw, bd], [bw, bd], [bw, bh], [bw, bh]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; u.setXY(i, u.getX(i) * size[f][0], u.getY(i) * size[f][1]); }
      return g;
    };
    for (const o of OBSTACLES) {
      if (!PILLARS.has(o.kind)) continue;
      const bw = o.w * M, bd = o.h * M, cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M;
      geos.push(boxUV(bw, CEIL_H, bd).translate(cx, CEIL_H / 2, cz));
      bases.push(new THREE.BoxGeometry(bw + 0.03, 0.09, bd + 0.03).translate(cx, 0.045, cz));
    }
    if (geos.length) {
      const p = add(new THREE.Mesh(mergeGeometries(geos), W.pillar)); p.receiveShadow = true; // (no shadow caster: the light is flat anyway)
      add(new THREE.Mesh(mergeGeometries(bases), W.base));
    }
    // wet patches: dark blots scattered over the carpet (the same every night)
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const spots = [];
    for (const r of Object.values(ROOMS)) for (let i = 0; i < Math.round(r.w * r.h / 90000); i++) spots.push([r.x + 30 + rnd() * (r.w - 60), r.y + 30 + rnd() * (r.h - 60), 0.8 + rnd() * 2.6, rnd() * 6.28]);
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), W.stain, spots.length), mt = new THREE.Matrix4(), q = new THREE.Quaternion();
    spots.forEach(([x, y, sz, a], i) => im.setMatrixAt(i, mt.compose(new THREE.Vector3(x * M, 0.006, y * M), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(sz, 1, sz * (0.5 + rnd())))));
    im.renderOrder = 1; this.adds.add(im);
    this.adds.updateMatrixWorld(true);
  }

  // Use preloaded art directly, painting only missing images. Warmup waits for
  // these material assignments before scanning/compiling either scene variant.
  load(lowPower) {
    const W = this.W, floors = Object.entries(W.floor), walls = [[W.wall, 1.2], [W.pillar, 1]];
    const put = (mat, key, t, r = 1) => { if (!t) return; mat[key] = rep(t, r); mat.needsUpdate = true; };
    return preloadBackrooms(lowPower).then(loaded => {
      for (const kind of ['wall', 'floor', 'ceil', 'glow']) this.tex[kind] = loaded[kind] || standIn(kind);
      for (const [m, k] of walls) { put(m, 'map', this.tex.wall, k / PAPER_M); put(m, 'normalMap', loaded.wallNormal, k / PAPER_M); m.normalScale.set(0.35, 0.35); }
      for (const [k, m] of floors) { put(m, 'map', this.tex.floor, roomMats[k].tile / CARPET_M); put(m, 'normalMap', loaded.floorNormal, roomMats[k].tile / CARPET_M); m.normalScale.set(0.7, 0.7); }
      put(W.ceil, 'map', this.tex.ceil, 1 / CEIL_M); put(W.ceil, 'emissiveMap', this.tex.glow, 1 / CEIL_M);
      put(W.ceil, 'normalMap', loaded.ceilNormal, 1 / CEIL_M); W.ceil.normalScale.set(0.6, 0.6);
      this.ready = true;
    });
  }

  // The drop ceiling over the whole map, with a well cut up into it over anything taller than CEIL_H (the prize wheel,
  // the jackpot tower, the big screens...): wallpapered sides up to just over its top, closed with ceiling tiles (Steve,
  // 2026-10-15: "fix the low ceiling"). The tall parts are found from the machines' own vertices, so merged batches work.
  ceiling(world) {
    if (this.ceil) { this.adds.remove(this.ceil); this.ceil.traverse(o => o.geometry && o.geometry.dispose()); }
    const CELL = 0.3, cells = new Map(), v = new THREE.Vector3(), mi = new THREE.Matrix4(), mw = new THREE.Matrix4();
    world.group.updateMatrixWorld(true);
    for (const kid of world.machineKids || []) kid.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const pos = o.geometry.attributes.position, n = o.isInstancedMesh ? o.count : 1;
      for (let k = 0; k < n; k++) {
        if (o.isInstancedMesh) { o.getMatrixAt(k, mi); mw.multiplyMatrices(o.matrixWorld, mi); } else mw.copy(o.matrixWorld);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mw);
          if (v.y <= CEIL_H - 0.03) continue;
          const key = Math.floor(v.x / CELL) + ',' + Math.floor(v.z / CELL);
          cells.set(key, Math.max(cells.get(key) || 0, v.y));
        }
      }
    });
    // the cells as rectangles (with a margin), merged while any two overlap
    let wells = [...cells].map(([k, top]) => { const [cx, cz] = k.split(',').map(Number); return { x0: cx * CELL - 0.2, z0: cz * CELL - 0.2, x1: (cx + 1) * CELL + 0.2, z1: (cz + 1) * CELL + 0.2, top }; });
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < wells.length && !merged; i++) for (let j = i + 1; j < wells.length && !merged; j++) {
        const a = wells[i], b = wells[j];
        if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1) {
          wells[i] = { x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1), top: Math.max(a.top, b.top) };
          wells.splice(j, 1); merged = true;
        }
      }
    }
    const [X0, Z0, X1, Z1] = this.ceilRect;
    wells = wells.map(w => ({ x0: Math.max(w.x0, X0 + 0.01), z0: Math.max(w.z0, Z0 + 0.01), x1: Math.min(w.x1, X1 - 0.01), z1: Math.min(w.z1, Z1 - 0.01), top: w.top + 0.15 }));
    // the ceiling: one shape with a hole per well (shape x, y = world x, z; its UVs are metres)
    const shape = new THREE.Shape([new THREE.Vector2(X0, Z0), new THREE.Vector2(X1, Z0), new THREE.Vector2(X1, Z1), new THREE.Vector2(X0, Z1)]);
    for (const w of wells) shape.holes.push(new THREE.Path([new THREE.Vector2(w.x0, w.z0), new THREE.Vector2(w.x0, w.z1), new THREE.Vector2(w.x1, w.z1), new THREE.Vector2(w.x1, w.z0)]));
    const g = new THREE.Group();
    const lid = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2).translate(0, CEIL_H, 0), this.W.ceil); g.add(lid);
    // each well: four papered sides from the ceiling up, and a tiled lid
    const sides = [], tops = [];
    const side = (len, h, x, z, ry) => { const p = new THREE.PlaneGeometry(len, h), u = p.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * len, u.getY(i) * h); return p.rotateY(ry).translate(x, CEIL_H + h / 2, z); };
    for (const w of wells) {
      const h = w.top - CEIL_H, cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2, wx = w.x1 - w.x0, wz = w.z1 - w.z0;
      sides.push(side(wx, h, cx, w.z0, 0), side(wx, h, cx, w.z1, Math.PI), side(wz, h, w.x0, cz, Math.PI / 2), side(wz, h, w.x1, cz, -Math.PI / 2));
      const t = new THREE.PlaneGeometry(wx, wz), u = t.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * wx, u.getY(i) * wz);
      tops.push(t.rotateX(Math.PI / 2).translate(cx, w.top, cz));
    }
    if (sides.length) { g.add(new THREE.Mesh(mergeGeometries(sides), this.W.pillar)); g.add(new THREE.Mesh(mergeGeometries(tops), this.W.ceil)); }
    g.traverse(o => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    this.adds.add(g); g.updateMatrixWorld(true); this.ceil = g; this.wells = wells;
  }

  // Walk a casino build once: what each mesh becomes, and what goes.
  scan(world) {
    this.world = world; this.swaps = []; this.hides = [];
    this.warmed = null; // a rebuilt world's materials need preparation again
    this.ceiling(world);
    const glows = new Set(GLOWS.map(e => e.m)), mk = world.machineKids || new Set(), beams = new Set(BEAMS.map(b => b.m));
    const rooms = new Map(); for (const k in roomMats) { const r = roomMats[k]; rooms.set(r.wall, this.W.wall); rooms.set(r.floor, this.W.floor[k]); if (r.ceil) rooms.set(r.ceil, HIDE); }
    const ctx = { glows, beams, rooms };
    const visit = (o, machine) => {
      if (o.isMesh || o.isLine || o.isSprite || o.isPoints) {
        const to = machine ? this.machinePick(o, ctx) : this.pick(o, ctx);
        if (to === HIDE) this.hides.push([o, o.layers.mask]); else if (to && to !== o.material) this.swaps.push([o, o.material, to]);
      }
      for (const c of o.children) visit(c, machine);
    };
    for (const c of world.group.children) visit(c, mk.has(c));
  }

  // The casino's own: the shell becomes the backrooms; the dressing goes, but for what you use.
  pick(o, { rooms }) {
    const m = o.material;
    if (Array.isArray(m) || o.isLine || o.isSprite || o.isPoints) return HIDE;
    if (rooms.has(m)) return rooms.get(m);
    if (o.userData.prop) return KEEP_PROPS.has(o.userData.propName) ? this.dull(m) : HIDE;
    const merged = !o.isInstancedMesh && o.matrixAutoUpdate === false;
    if (merged && !o.castShadow) return m === MAT.black || m === MAT.metalDark ? this.W.base : m === MAT.stall ? null : HIDE; // the shell's trim: a baseboard is all
    if (merged) return m === MAT.stall || m === MAT.chrome || m === MAT.porcelain || (m.color && m.color.getHex() === DOOR_COLOR && !m.map) ? this.dull(m) : HIDE; // stalls, plain doors
    return HIDE; // every lamp, sign, picture, plaque and rug
  }

  // The games: all stay, their static parts dulled; the light cones over the tables go.
  machinePick(o, { glows, beams }) {
    if (beams.has(o)) return HIDE;
    const m = o.material;
    if (Array.isArray(m) || glows.has(m)) return null;
    if ((o.userData.prop || (!o.isInstancedMesh && o.matrixAutoUpdate === false)) && (m.isMeshStandardMaterial)) return this.dull(m);
    return null;
  }

  // A material that has been sitting in the backrooms for years: greyer, yellower, no shine. (Only static ones: the
  // table rig's live materials are left alone.)
  dull(m) {
    if (!m || !m.isMeshStandardMaterial || (m.emissive && m.emissive.getHex() && m.emissiveIntensity > 0)) return null;
    let d = this.dulled.get(m);
    if (!d) {
      d = m.clone(); d.name = 'br-dull';
      const hsl = {}; d.color.getHSL(hsl); d.color.setHSL(hsl.h, hsl.s * 0.55, hsl.l * 0.92).lerp(new THREE.Color(0xb8a870), 0.18);
      d.roughness = Math.max(0.65, m.roughness); d.metalness = m.metalness * 0.5; d.envMapIntensity = 0.4;
      if (d.isMeshPhysicalMaterial) { d.clearcoat = 0; d.sheen = 0; }
      this.dulled.set(m, d);
    }
    return d;
  }

  apply() {
    for (const [o, , to] of this.swaps) o.material = to;
    for (const [o] of this.hides) o.layers.mask = 0;
    this.adds.visible = true;
  }
  unapply() {
    for (const [o, from] of this.swaps) o.material = from;
    for (const [o, mask] of this.hides) o.layers.mask = mask;
    this.adds.visible = false;
  }

  // Every frame, at the blackout snap (render3d.js): on is the snapshot's pub.backrooms. Switches in this frame.
  update(on, world) {
    if (world !== this.world) { if (this.on) this.unapply(); this.scan(world); if (this.on) this.apply(); }
    if (on === this.on) return;
    this.on = on; this.flips++;
    const R = this.R;
    if (on) {
      this.apply();
      this.base = { hemi: R.hemi.color.getHex(), ground: R.hemi.groundColor.getHex(), fill: R.fill.color.getHex(), key: R.key.color.getHex() };
      R.hemi.color.setHex(LIGHT.hemi[0]); R.hemi.groundColor.setHex(LIGHT.hemi[1]); R.fill.color.setHex(LIGHT.fill); R.key.color.setHex(LIGHT.key);
    } else {
      this.unapply();
      const b = this.base; if (b) { R.hemi.color.setHex(b.hemi); R.hemi.groundColor.setHex(b.ground); R.fill.color.setHex(b.fill); R.key.color.setHex(b.key); }
      audio.hum(0);
    }
    this.vig(on);
  }

  // The camera's edges darken a little, as in the photo (a page overlay on the canvas, under the HUD).
  vig(on) {
    if (!this.vignette) {
      const v = document.getElementById('view'); if (!v || !v.parentNode) return;
      const d = this.vignette = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(48,38,8,0.42) 100%)';
      v.after(d);
    }
    this.vignette.style.display = on ? 'block' : 'none';
  }

  // The lighting while it is on, after render3d's own pass (lit: 1 with the lights on, less while they are out).
  light(lit, blk, t) {
    const R = this.R, f = flicker(t);
    R.hemi.intensity = 1.45 * lit * f; R.fill.intensity = 0.6 * lit * f; R.key.intensity = 0.22 * lit; R.scene.environmentIntensity = 0.18 * lit;
    this.W.ceil.emissiveIntensity = (blk ? 0 : 2.2 * f) * lit;
    R.scene.fog.color.setRGB(0.66 * lit, 0.6 * lit, 0.32 * lit);
    if (!blk) { R.scene.fog.near = 4 - R.dark * 3; R.scene.fog.far = 40 - R.dark * 36; }
    R.scene.background.setRGB(0.66 * lit, 0.6 * lit, 0.32 * lit);
    audio.hum(blk ? 0 : 0.4 + 0.6 * lit);
  }
  // after the pooled point lights are placed: weak, and all the same tired white
  pool() { for (const L of this.R.pool) { L.intensity *= 0.2; L.color.setHex(0xf6f4cc); } }

  // Texture uploads and both material variants are prepared by render3d.warmup,
  // with the same render target and frame budget as the ordinary casino.
  materials() { return [this.W.wall, this.W.pillar, ...Object.values(this.W.floor), this.W.ceil, this.W.base, this.W.stain, ...this.dulled.values()]; }
  info() { return { on: this.on, flips: this.flips, swaps: this.swaps.length, hides: this.hides.length, ready: !!this.ready, warmed: this.warmed, wells: (this.wells || []).map(w => [+w.x0.toFixed(1), +w.z0.toFixed(1), +w.x1.toFixed(1), +w.z1.toFixed(1), +w.top.toFixed(2)]) }; }
}

// A texture repeated r times over the same UVs (a clone: the image is shared).
function rep(t, r) { const c = t.clone(); c.repeat.set(r, r); c.anisotropy = T.aniso(); c.needsUpdate = true; return c; }
// The tubes: steady, with a stutter now and then (every 7 to 8 s, about a fifth of a second).
function flicker(t) {
  const ph = t % 7.7;
  if (ph < 0.22) return Math.sin(t * 97) > 0.2 ? 0.62 : 1;
  return 0.985 + Math.sin(t * 2.3) * 0.015;
}
