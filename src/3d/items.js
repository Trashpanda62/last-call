// Drinks, snack bowls, bodies, effects and floating text: everything in the view that comes and goes.
import * as THREE from 'three';
import * as T from './textures.js';
import { CFG, DRINKS } from '../config.js';
import { makeSeats } from '../map.js';
import { makeBean } from './plush.js';
import { makeSnack, snackAssets, batchSnackDisplay } from './snacks.js';

const M = 1 / 60;
const SEATS = makeSeats();
const RAIL_H = 1.02, BOWL_H = 0.95;
// Only corpses own these fixed world-space poses. Weak keys release with their
// actors; living characters continue using the ordinary per-frame skin update.
const bodyPoseVersions = new WeakMap();
export const bodyPoseVersion = skeleton => bodyPoseVersions.get(skeleton)?.version;

const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.34, depthWrite: false });
// a bright lip on every glass, so its shape reads even end-on (a sip tips the mouth toward you)
const rimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.75, emissive: 0x404040 });
const rim = (r, y) => ({ geo: new THREE.TorusGeometry(r, 0.0035, 6, 28), y });
const liquidMats = {};
const liquidMat = c => liquidMats[c] || (liquidMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, transparent: true, opacity: 0.88, emissive: new THREE.Color(c).multiplyScalar(0.3) }));
const lathe = (pts, s = 20) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), s);
const GEO = {
  martini: { glass: lathe([[0.04, 0], [0.04, 0.005], [0.006, 0.01], [0.006, 0.09], [0.075, 0.16], [0.078, 0.162]]), liquid: new THREE.ConeGeometry(0.068, 0.062, 20), ly: 0.123, cone: true, rim: rim(0.078, 0.162) },
  cosmo: null,
  beer: { glass: lathe([[0.048, 0], [0.05, 0.005], [0.05, 0.15], [0.052, 0.152]]), liquid: new THREE.CylinderGeometry(0.046, 0.046, 0.13, 20), ly: 0.07, foam: true, handle: true, rim: rim(0.052, 0.152) },
  whiskey: { glass: lathe([[0.045, 0], [0.047, 0.02], [0.047, 0.095], [0.049, 0.097]]), liquid: new THREE.CylinderGeometry(0.043, 0.043, 0.05, 20), ly: 0.045, ice: true, rim: rim(0.049, 0.097) },
  mojito: { glass: lathe([[0.036, 0], [0.038, 0.01], [0.038, 0.17], [0.04, 0.172]]), liquid: new THREE.CylinderGeometry(0.035, 0.035, 0.14, 18), ly: 0.08, mint: true, straw: true, rim: rim(0.04, 0.172) },
};
GEO.cosmo = GEO.martini;
// Garnishes have fixed shapes and finishes, just like the glass bodies. Each
// drink keeps its own transforms/fill while sharing these immutable resources.
const EXTRAS = {
  foam: [new THREE.CylinderGeometry(0.047, 0.046, 0.02, 18), new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.9 })],
  handle: [new THREE.TorusGeometry(0.035, 0.009, 6, 14, Math.PI), glassMat],
  ice: [new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.6, roughness: 0.05 })],
  mint: [new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshStandardMaterial({ color: 0x2e9a3a })],
  straw: [new THREE.CylinderGeometry(0.004, 0.004, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xff5c8a })],
  olive: [new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6a9a2a })],
  orange: [new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff8030 })],
};

// A cartoon cocktail, ~1.5x real size so it reads from across a table.
const HQ = new THREE.Quaternion(), RQ = new THREE.Quaternion(), HS = new THREE.Vector3(), GRIP = new THREE.Vector3(0, -0.08, 0);
const holderPosition = new THREE.Vector3(), holderScale = new THREE.Vector3();
const legacyItemAttachments = /[?&]legacyItemAttachments\b/.test(location.search);
function holderTransform(holder) {
  if (legacyItemAttachments) {
    holder.rightHand.getWorldQuaternion(HQ).invert(); holder.root.getWorldQuaternion(RQ); holder.rightHand.getWorldScale(HS);
    return;
  }
  // Refresh the hand and its ancestors once. Both rotations and the hand scale
  // then come from those same current matrices, without three parent walks.
  holder.rightHand.updateWorldMatrix(true, false);
  holder.rightHand.matrixWorld.decompose(holderPosition, HQ, HS);
  holder.root.matrixWorld.decompose(holderPosition, RQ, holderScale);
  HQ.invert();
}
export function makeGlass(kind, color) {
  const def = GEO[kind] || GEO.whiskey;
  const g = new THREE.Group();
  const liq = new THREE.Mesh(def.liquid, liquidMat(color)); liq.position.y = def.ly; liq.rotation.x = def.cone ? Math.PI : 0; g.add(liq);
  const gl = new THREE.Mesh(def.glass, glassMat); gl.renderOrder = 2; g.add(gl);
  if (def.rim) { const r = new THREE.Mesh(def.rim.geo, rimMat); r.rotation.x = Math.PI / 2; r.position.y = def.rim.y; r.renderOrder = 3; g.add(r); }
  if (def.foam) { const f = new THREE.Mesh(...EXTRAS.foam); liq.add(f); f.position.set(0, 0.07, 0); }
  if (def.handle) { const h = new THREE.Mesh(...EXTRAS.handle); h.position.set(0.05, 0.08, 0); h.rotation.z = -Math.PI / 2; g.add(h); }
  if (def.ice) for (let i = 0; i < 2; i++) { const c = new THREE.Mesh(...EXTRAS.ice); c.position.set(-0.012 + i * 0.022, 0.06, i * 0.01); c.rotation.set(i, i * 0.5, 0.3); g.add(c); }
  if (def.mint) for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(...EXTRAS.mint); l.scale.set(1, 0.4, 1.8); l.position.set(Math.cos(i * 2) * 0.018, 0.14, Math.sin(i * 2) * 0.018); g.add(l); }
  if (def.straw) { const s = new THREE.Mesh(...EXTRAS.straw); s.position.set(0.012, 0.15, 0); s.rotation.z = -0.2; g.add(s); }
  if (kind === 'martini' || kind === 'cosmo') { const o = new THREE.Mesh(...EXTRAS[kind === 'martini' ? 'olive' : 'orange']); o.position.set(0.02, 0.11, 0); g.add(o); }
  g.scale.setScalar(1.9);
  g.userData = { liq, def };
  return g;
}
export function setFill(glass, frac) {
  const { liq, def } = glass.userData; frac = Math.max(0.08, frac);
  if (def.cone) liq.scale.setScalar(0.45 + 0.55 * frac);
  else { liq.scale.y = frac; liq.position.y = def.ly - (1 - frac) * def.liquid.parameters.height / 2; }
}

const drinkGlowGeo = new THREE.PlaneGeometry(0.16, 0.16);
// Glasses and their markers share fixed shapes. Hand materials have their own
// shader cache and live as long as the hand scene.
const SHARED_GEO = new Set([drinkGlowGeo, ...Object.values(GEO).flatMap(d => [d.glass, d.liquid, d.rim && d.rim.geo]), ...Object.values(EXTRAS).map(e => e[0])]);
const SHARED_MAT = new Set([glassMat, rimMat, ...Object.values(EXTRAS).map(e => e[1])]);
export function freeGlass(g, keepMaterials) {
  g.traverse(o => {
    if (o.geometry && !SHARED_GEO.has(o.geometry)) o.geometry.dispose();
    if (o.material && !SHARED_MAT.has(o.material) && !keepMaterials?.has(o.material) && o.material !== spikeMat && !Object.values(liquidMats).includes(o.material)) o.material.dispose();
  });
}

const markerMat = new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xffb020, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.2 });
const spikeMat = new THREE.MeshBasicMaterial({ map: T.glow(), color: 0x7dff5a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.8 });
// a spill, not a disc: a lumpy blob with a few drops round it (the alpha mask every puddle shares)
const splat = (() => {
  const [c, g] = T.canvas(256, 256); let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#fff';
  for (let i = 0; i < 14; i++) { const a = r() * 7, d = r() * 46; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 34 + r() * 30, 0, 7); g.fill(); }
  for (let i = 0; i < 9; i++) { const a = r() * 7, d = 92 + r() * 26; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 4 + r() * 9, 0, 7); g.fill(); }
  return T.tex(c, false);
})();
const puddle = o => new THREE.MeshStandardMaterial({ transparent: true, alphaMap: splat, depthWrite: false, ...o });
const puddleMats = {
  poison: puddle({ color: 0x5aff40, emissive: 0x2a8020, opacity: 0.6, roughness: 0.1 }),
  shiv: puddle({ color: 0x9a0a10, opacity: 0.85, roughness: 0.15 }),
  drown: puddle({ color: 0x3fb8e0, opacity: 0.6, roughness: 0.05 }),
  trap: puddle({ color: 0x2a2224, opacity: 0.75, roughness: 0.6 }), // scorch
};
const puddleGeo = new THREE.PlaneGeometry(1.3, 1.3);

// Tray instances and ordinary held food need independent material program
// selections. Share every texture/shape and retain the authored shader hooks.
const heldSnackMaterials = new Map();
function heldSnack(kind) {
  const food = makeSnack(kind, .25);
  const materialFor = source => {
    if (!heldSnackMaterials.has(source)) {
      const material = source.clone(); material.onBeforeCompile = source.onBeforeCompile; material.customProgramCacheKey = source.customProgramCacheKey;
      heldSnackMaterials.set(source, material);
    }
    return heldSnackMaterials.get(source);
  };
  food.traverse(o => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map(materialFor) : materialFor(o.material); });
  return food;
}

export class Items {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.drinks = new Map(); this.snacks = new Map(); this.bodies = new Map(); this.floatCache = new Map(); this.floatPool = [];
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.028, 0), markerMat); this.marker.scale.y = 1.5; this.group.add(this.marker);
    this.bowls = [];
    // Keep death-puddle textures, buffers and shader variants in staged loading.
    // Each body's placement/growth remains on its own mesh.
    const puddles = new THREE.Group(); puddles.visible = false;
    for (const material of Object.values(puddleMats)) puddles.add(new THREE.Mesh(puddleGeo, material));
    this.group.add(puddles);
    // This marker is otherwise only created when a poisoned glass first lands.
    // Keep its shared buffers and material in the normal loading preparation.
    const inventory = this.inventory = new THREE.Group(); inventory.visible = false;
    inventory.add(new THREE.Mesh(drinkGlowGeo, spikeMat));
    // Hand-held glasses compile with different lights and no world fog. Prepare
    // the real world materials too, including every garnish's geometry flags.
    for (const { kind, color } of DRINKS) inventory.add(makeGlass(kind, color));
    this.group.add(inventory);
    // fx: one instanced mesh per kind, refilled every frame
    this.fx = {};
    const mk = (kind, geo, mat, n = 160) => { const m = new THREE.InstancedMesh(geo, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; this.group.add(m); this.fx[kind] = m; };
    mk('chips', new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    // Allocate the default white color buffer before loading uploads geometry,
    // rather than creating it on the first win. Bursts overwrite their prefix.
    this.fx.chips.setColorAt(0, this.fx.chips.material.color);
    this.fx.chips.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mk('bubbles', new THREE.SphereGeometry(0.04, 8, 6), bubbleMat);
    mk('splat', new THREE.SphereGeometry(0.03, 6, 4), puddleMats.shiv);
    mk('crumbs', new THREE.BoxGeometry(0.025, 0.025, 0.025), new THREE.MeshStandardMaterial({ color: 0xb8803a }));
    this.tmp = new THREE.Object3D(); this.col = new THREE.Color();
  }
  ensureBowls(bowls) {
    const assets = snackAssets();
    if (this.bowls.length && this.bowlsProp === assets) return;
    if (this.inventoryAssets !== assets) {
      for (const food of this.inventorySnacks || []) this.inventory.remove(food);
      // Trays use instanced draws; food in another player's hand uses the
      // original non-instanced material under world lights and fog.
      this.inventorySnacks = [0, 1, 2].map(heldSnack);
      this.inventory.add(...this.inventorySnacks); this.inventoryAssets = assets;
    }
    for (const g of this.bowls) { g.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); this.group.remove(g); }
    this.bowls = []; this.bowlsProp = assets; this.bowlTop = BOWL_H;
    const dishGeo = this.dishGeo || (this.dishGeo = lathe([[0, 0], [.13, 0], [.25, .035], [.25, .045], [.14, .015], [0, .015]], 32));
    const dishMat = this.dishMat || (this.dishMat = new THREE.MeshStandardMaterial({ color: 0xf3ead8, metalness: .18, roughness: .25 }));
    const bowlGlowGeo = this.bowlGlowGeo || (this.bowlGlowGeo = new THREE.PlaneGeometry(.8, .8));
    for (const b of bowls) {
      const g = new THREE.Group(); g.name = 'snack-tray-' + b.id; g.position.set(b.x * M, 0, b.y * M);
      const dish = new THREE.Mesh(dishGeo, dishMat); dish.position.y = BOWL_H; g.add(dish);
      const foodRoot = new THREE.Group();
      for (let i = 0; i < 3; i++) { const food = makeSnack(b.id % 3, .19); food.position.set(Math.cos(i * 2.1) * .105, BOWL_H + .032 + i * .005, Math.sin(i * 2.1) * .105); food.rotation.y = i * 1.4; foodRoot.add(food); }
      g.add(batchSnackDisplay(foodRoot));
      const glow = new THREE.Mesh(bowlGlowGeo, spikeMat); glow.rotation.x = -Math.PI / 2; glow.position.y = .02; glow.visible = false; g.add(glow);
      g.userData.glow = glow; this.group.add(g); this.bowls.push(g);
    }
  }
  // beans: Map id -> Bean, for drinks held in hand
  update(pub, priv, beans, t, dt, opts) {
    const spiked = new Set(priv.spiked || []);
    this.ensureBowls(pub.bowls);
    this.bowls.forEach((g, i) => { const on = spiked.has('bowl' + i); g.userData.glow.visible = on; if (on) g.userData.glow.material.opacity = 0.5 + Math.sin(t * 6) * 0.3; });
    // drinks
    const seen = new Set();
    let myPlaced = null;
    beans.forEach(b => { b.holding = false; });
    for (const d of pub.drinks) {
      seen.add(d.id);
      let g = this.drinks.get(d.id);
      if (!g) { g = makeGlass(d.kind, d.color); const glow = new THREE.Mesh(drinkGlowGeo, spikeMat); glow.visible = false; g.add(glow); g.userData.glow = glow; this.drinks.set(d.id, g); }
      setFill(g, d.sips / CFG.drinkSips);
      const holder = d.holder !== null ? beans.get(d.holder) : null;
      const mine = d.holder === priv.me && opts.firstPerson;
      if (mine) { if (g.parent) g.parent.remove(g); continue; } // the first-person hands show it
      if (holder && (!holder.root.visible || pub.chars[d.holder]?.eating > 0)) { if (g.parent) g.parent.remove(g); continue; }
      if (holder) {
        if (g.parent !== holder.rightHand) holder.rightHand.add(g);
        // upright in the world and turned with its holder, held round the middle, however the hand's bone is posed
        holderTransform(holder);
        g.quaternion.copy(HQ).multiply(RQ); g.position.copy(GRIP).applyQuaternion(HQ).divide(HS);
        holder.holding = true;
      } else {
        if (g.parent !== this.group) { this.group.add(g); g.rotation.set(0, 0, 0); }
        const onRail = SEATS.some(s => Math.abs(s.drink.x - d.x) < 6 && Math.abs(s.drink.y - d.y) < 6);
        g.position.set(d.x * M, onRail ? RAIL_H : 0, d.y * M);
        if (d.owner === priv.me) myPlaced = g;
      }
      const sp = spiked.has(d.id);
      g.userData.glow.visible = sp;
      if (sp) { g.userData.glow.position.y = 0.08; g.userData.glow.quaternion.copy(opts.camera.quaternion); g.userData.glow.material.opacity = 0.5 + Math.sin(t * 6) * 0.3; }
    }
    for (const [id, g] of this.drinks) if (!seen.has(id)) { if (g.parent) g.parent.remove(g); freeGlass(g); this.drinks.delete(id); }
    this.marker.visible = !!myPlaced && priv.alive;
    if (myPlaced) { this.marker.position.set(myPlaced.position.x, myPlaced.position.y + 0.42 + Math.sin(t * 3) * 0.02, myPlaced.position.z); this.marker.rotation.y = t * 2; }

    // A visible bite prop follows the animated hand; shrinking it after each
    // exaggerated chew gives the bite a readable payoff from across the room.
    const eating = new Set();
    for (const c of pub.chars) {
      const bean = beans.get(c.id);
      if (!c.alive || !c.eating || !bean || (c.id === priv.me && opts.firstPerson)) continue;
      eating.add(c.id);
      let food = this.snacks.get(c.id);
      if (!bean.root.visible && !legacyItemAttachments) {
        if (food && food.parent !== bean.rightHand) bean.rightHand.add(food);
        continue;
      }
      if (!food || food.userData.kind !== c.snack || food.userData.assets !== snackAssets()) {
        food?.parent?.remove(food); food = heldSnack(c.snack); food.userData.kind = c.snack; food.userData.assets = snackAssets(); food.userData.baseScale = food.scale.x; this.snacks.set(c.id, food);
      }
      if (food.parent !== bean.rightHand) bean.rightHand.add(food);
      holderTransform(bean);
      food.quaternion.copy(HQ).multiply(RQ); food.position.set(0, .035, .02);
      const bite = Math.floor((2.4 - c.eating) / .6); food.scale.setScalar(food.userData.baseScale * Math.max(.25, 1 - bite * .19));
    }
    for (const [id, food] of this.snacks) if (!eating.has(id)) { food.parent?.remove(food); this.snacks.delete(id); }

    // bodies
    const bseen = new Set();
    for (const b of pub.bodies) {
      const key = b.id + ':' + b.x + ':' + b.y; bseen.add(key);
      let e = this.bodies.get(key);
      if (!e) {
        const c = pub.chars[b.id];
        const bean = makeBean({ color: c.color, hat: c.hat, name: c.name }); bean.setDead(true);
        const pud = new THREE.Mesh(puddleGeo, puddleMats[b.cause] || puddleMats.shiv);
        pud.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28); pud.position.set(b.x * M + 0.1, 0.012, b.y * M + 0.05); pud.scale.set(1.3, 0.8, 1);
        this.group.add(bean.root, pud);
        const skeletons = new Set(); bean.root.traverse(o => { if (o.isSkinnedMesh) skeletons.add(o.skeleton); });
        const poseState = { version: 0 }; bean.root.userData.bodyPoseState = poseState;
        for (const skeleton of skeletons) bodyPoseVersions.set(skeleton, poseState);
        e = { bean, pud, skeletons, poseState, born: t, face: Math.random() * Math.PI * 2 }; this.bodies.set(key, e);
      }
      e.bean.root.visible = !(opts.deathActive && b.id === priv.me);
      const fall = THREE.MathUtils.smoothstep(t - e.born, 0, .65);
      // The corpse's pose is fixed once it lands. Keep cinematic visibility
      // live, and recompute the fall if a snapshot's clock moves backward.
      if (!e.settled || fall < 1) {
        e.bean.update({ x: b.x * M, z: b.y * M, face: e.face, look: e.face, t, dt });
        const model = e.bean.model;
        if (model && fall < 1) { model.rotation.x *= fall; model.position.y *= fall; model.position.z *= fall; }
        e.pud.scale.set(1.3 * Math.max(.05, fall), .8 * Math.max(.05, fall), 1);
        e.settled = fall === 1;
        e.poseState.version++;
      }
    }
    for (const [k, e] of this.bodies) if (!bseen.has(k)) {
      this.group.remove(e.bean.root, e.pud);
      if (e.bean.dispose) e.bean.dispose();
      else { const l = e.bean.label; if (l) { l.material.map?.dispose(); l.material.dispose(); } }
      this.bodies.delete(k);
    }

    // fx
    const counts = { chips: 0, bubbles: 0, splat: 0, crumbs: 0 };
    const put = (kind, x, y, z, s = 1, color) => {
      const m = this.fx[kind]; const i = counts[kind]++; if (i >= m.instanceMatrix.count) return;
      this.tmp.position.set(x, y, z); this.tmp.rotation.set(x * 7, y * 5, 0); this.tmp.scale.setScalar(s); this.tmp.updateMatrix();
      m.setMatrixAt(i, this.tmp.matrix); if (color !== undefined) m.setColorAt(i, this.col.setHex(color));
    };
    for (const f of pub.fx) {
      const x = f.x * M, z = f.y * M, a = Math.max(0, f.t);
      if (f.kind === 'chips') for (let i = 0; i < 8; i++) { const p = 1 - a, ang = i * 0.785; put('chips', x + Math.cos(ang) * p * 0.6, 1.3 + p * 1.2 - p * p * 1.6, z + Math.sin(ang) * p * 0.6, 1, [0xe8c46a, 0xe8443a, 0x3ddc97, 0x4a7dff][i % 4]); }
      else if (f.kind === 'bubbles') for (let i = 0; i < 8; i++) { const p = (1.5 - a) / 1.5; put('bubbles', x + Math.sin(i * 2.4) * 0.25, 0.2 + p * 1.4 + i * 0.05, z + Math.cos(i * 1.9) * 0.25, 1.2 - p * 0.8); }
      else if (f.kind === 'splat') for (let i = 0; i < 10; i++) { const p = (1.5 - a) / 1.5, ang = i * 0.63; put('splat', x + Math.cos(ang) * p * 0.6, 0.8 - p * 0.75, z + Math.sin(ang) * p * 0.6, 1); }
      else if (f.kind === 'crumbs') for (let i = 0; i < 8; i++) { const p = 1 - a, ang = i * 0.8; put('crumbs', x + Math.cos(ang) * p * 0.3, (this.bowlTop || BOWL_H) + 0.05 + p * 0.3 - p * p * 0.6, z + Math.sin(ang) * p * 0.3, 1); }
    }
    for (const k in this.fx) {
      const m = this.fx[k]; m.count = Math.min(counts[k], m.instanceMatrix.count);
      if (!m.count) continue;
      // Leave pending ranges intact until Three uploads them. Empty pools need
      // no transfer, and bursts only upload the instances they actually draw.
      m.instanceMatrix.addUpdateRange(0, m.count * 16); m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) { m.instanceColor.setUsage(THREE.DynamicDrawUsage); m.instanceColor.addUpdateRange(0, m.count * 3); m.instanceColor.needsUpdate = true; }
    }

    // floating money text
    this.floatPool.forEach(s => { s.visible = false; });
    let fi = 0; const activeFloatKeys = new Set();
    for (const f of pub.floats) {
      const key = f.text + f.color; activeFloatKeys.add(key);
      let s = this.floatPool[fi];
      if (!s || s.userData.key !== key) {
        if (!this.floatCache.has(key)) {
          this.floatCache.set(key, T.textSprite(f.text, { color: f.color, size: 56, bg: null, h: 0.3 }).material);
        }
        const material = this.floatCache.get(key);
        // The painted texture is shared; opacity belongs to each pooled label.
        if (!s) { s = new THREE.Sprite(material.clone()); this.group.add(s); this.floatPool[fi] = s; }
        else { if (!s.material.map) s.material.needsUpdate = true; s.material.map = material.map; }
        s.userData.key = key;
      }
      const img = s.material.map.image, hh = f.big ? 0.5 : 0.3;
      const life = 1.6 - f.t;
      s.position.set(f.x * M, 2.35 + life * 0.4, (f.y + 18 * life) * M); // starts above the name tags (about 2 m) and rises
      // right under a camera (the table view looks down on your own seat) a float would fill the screen: it shrinks and fades
      const near = opts.camera ? Math.min(1, Math.max(0, (s.position.distanceTo(opts.camera.position) - 1.2) / 2)) : 1;
      s.scale.set(hh * img.width / img.height * (0.5 + near / 2), hh * (0.5 + near / 2), 1);
      s.material.opacity = Math.min(1, f.t) * near; s.visible = near > 0; fi++;
    }
    // Protect every label in this snapshot, including ones processed later in
    // the pool. Hidden slots must release maps when their cached text expires.
    for (const [key, material] of this.floatCache) {
      if (this.floatCache.size <= 80) break;
      if (activeFloatKeys.has(key)) continue;
      for (const s of this.floatPool) if (s.material.map === material.map) { s.material.map = null; s.userData.key = null; }
      material.map.dispose(); material.dispose(); this.floatCache.delete(key);
    }
  }
}
