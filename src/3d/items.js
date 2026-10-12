// Drinks, snack bowls, bodies, effects and floating text: everything in the view that comes and goes.
import * as THREE from 'three';
import * as T from './textures.js';
import { CFG } from '../config.js';
import { makeSeats } from '../map.js';
import { Bean } from './chars.js';

const M = 1 / 60;
const SEATS = makeSeats();
const RAIL_H = 1.02, BOWL_H = 0.95;

const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false });
const liquidMats = {};
const liquidMat = c => liquidMats[c] || (liquidMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, transparent: true, opacity: 0.88, emissive: new THREE.Color(c).multiplyScalar(0.3) }));
const lathe = (pts, s = 20) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), s);
const GEO = {
  martini: { glass: lathe([[0.04, 0], [0.04, 0.005], [0.006, 0.01], [0.006, 0.09], [0.075, 0.16], [0.078, 0.162]]), liquid: new THREE.ConeGeometry(0.068, 0.062, 20), ly: 0.123, cone: true },
  cosmo: null,
  beer: { glass: lathe([[0.048, 0], [0.05, 0.005], [0.05, 0.15], [0.052, 0.152]]), liquid: new THREE.CylinderGeometry(0.046, 0.046, 0.13, 20), ly: 0.07, foam: true, handle: true },
  whiskey: { glass: lathe([[0.045, 0], [0.047, 0.02], [0.047, 0.095], [0.049, 0.097]]), liquid: new THREE.CylinderGeometry(0.043, 0.043, 0.05, 20), ly: 0.045, ice: true },
  mojito: { glass: lathe([[0.036, 0], [0.038, 0.01], [0.038, 0.17], [0.04, 0.172]]), liquid: new THREE.CylinderGeometry(0.035, 0.035, 0.14, 18), ly: 0.08, mint: true, straw: true },
};
GEO.cosmo = GEO.martini;

// A cartoon cocktail, ~1.5x real size so it reads from across a table.
export function makeGlass(kind, color) {
  const def = GEO[kind] || GEO.whiskey;
  const g = new THREE.Group();
  const liq = new THREE.Mesh(def.liquid, liquidMat(color)); liq.position.y = def.ly; liq.rotation.x = def.cone ? Math.PI : 0; g.add(liq);
  const gl = new THREE.Mesh(def.glass, glassMat); gl.renderOrder = 2; g.add(gl);
  if (def.foam) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.046, 0.02, 18), new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.9 })); f.position.y = def.ly + 0.07; liq.add(f); f.position.set(0, 0.07, 0); }
  if (def.handle) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 14, Math.PI), glassMat); h.position.set(0.05, 0.08, 0); h.rotation.z = -Math.PI / 2; g.add(h); }
  if (def.ice) for (let i = 0; i < 2; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.6, roughness: 0.05 })); c.position.set(-0.012 + i * 0.022, 0.06, i * 0.01); c.rotation.set(i, i * 0.5, 0.3); g.add(c); }
  if (def.mint) for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshStandardMaterial({ color: 0x2e9a3a })); l.scale.set(1, 0.4, 1.8); l.position.set(Math.cos(i * 2) * 0.018, 0.14, Math.sin(i * 2) * 0.018); g.add(l); }
  if (def.straw) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xff5c8a })); s.position.set(0.012, 0.15, 0); s.rotation.z = -0.2; g.add(s); }
  if (kind === 'martini' || kind === 'cosmo') { const o = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: kind === 'martini' ? 0x6a9a2a : 0xff8030 })); o.position.set(0.02, 0.11, 0); g.add(o); }
  g.scale.setScalar(1.9);
  g.userData = { liq, def };
  return g;
}
export function setFill(glass, frac) {
  const { liq, def } = glass.userData; frac = Math.max(0.08, frac);
  if (def.cone) liq.scale.setScalar(0.45 + 0.55 * frac);
  else { liq.scale.y = frac; liq.position.y = def.ly - (1 - frac) * def.liquid.parameters.height / 2; }
}

const markerMat = new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xffb020, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.2 });
const spikeMat = new THREE.MeshBasicMaterial({ map: T.glow(), color: 0x7dff5a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.8 });
const puddleMats = {
  poison: new THREE.MeshStandardMaterial({ color: 0x5aff40, emissive: 0x2a8020, transparent: true, opacity: 0.6, roughness: 0.1 }),
  shiv: new THREE.MeshStandardMaterial({ color: 0x9a0a10, transparent: true, opacity: 0.85, roughness: 0.15 }),
};

export class Items {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.drinks = new Map(); this.bodies = new Map(); this.floatCache = new Map(); this.floatPool = [];
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.028, 0), markerMat); this.marker.scale.y = 1.5; this.group.add(this.marker);
    this.bowls = [];
    // fx: one instanced mesh per kind, refilled every frame
    this.fx = {};
    const mk = (kind, geo, mat, n = 160) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; this.group.add(m); this.fx[kind] = m; };
    mk('chips', new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    mk('bubbles', new THREE.SphereGeometry(0.04, 8, 6), bubbleMat);
    mk('splat', new THREE.SphereGeometry(0.03, 6, 4), puddleMats.shiv);
    mk('crumbs', new THREE.BoxGeometry(0.025, 0.025, 0.025), new THREE.MeshStandardMaterial({ color: 0xb8803a }));
    this.tmp = new THREE.Object3D(); this.col = new THREE.Color();
  }
  ensureBowls(bowls) {
    if (this.bowls.length) return;
    const bowlGeo = lathe([[0, 0], [0.08, 0], [0.15, 0.05], [0.17, 0.09], [0.16, 0.09], [0.14, 0.055], [0, 0.015]], 24);
    const pretzel = new THREE.TorusGeometry(0.03, 0.011, 6, 12);
    const pMat = new THREE.MeshStandardMaterial({ color: 0xb06a28, roughness: 0.6 });
    for (const b of bowls) {
      const g = new THREE.Group(); g.position.set(b.x * M, BOWL_H, b.y * M);
      g.add(new THREE.Mesh(bowlGeo, new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.2 })));
      for (let i = 0; i < 9; i++) { const p = new THREE.Mesh(pretzel, pMat); const a = i * 2.4, r = (i % 3) * 0.035; p.position.set(Math.cos(a) * r, 0.06 + (i % 2) * 0.015, Math.sin(a) * r); p.rotation.set(1.2 + i, i, 0); g.add(p); }
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), spikeMat); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; glow.visible = false; g.add(glow);
      g.userData.glow = glow;
      this.group.add(g); this.bowls.push(g);
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
      if (!g) { g = makeGlass(d.kind, d.color); const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), spikeMat); glow.visible = false; g.add(glow); g.userData.glow = glow; this.drinks.set(d.id, g); }
      setFill(g, d.sips / CFG.drinkSips);
      const holder = d.holder !== null ? beans.get(d.holder) : null;
      const mine = d.holder === priv.me && opts.firstPerson;
      if (mine) { if (g.parent) g.parent.remove(g); continue; } // the first-person hands show it
      if (holder && !holder.root.visible) { if (g.parent) g.parent.remove(g); continue; }
      if (holder) {
        if (g.parent !== holder.rightHand) { holder.rightHand.add(g); g.position.set(0, 0.03, 0.06); g.rotation.set(0, 0, 0); }
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
    for (const [id, g] of this.drinks) if (!seen.has(id)) { if (g.parent) g.parent.remove(g); this.drinks.delete(id); }
    this.marker.visible = !!myPlaced && priv.alive;
    if (myPlaced) { this.marker.position.set(myPlaced.position.x, myPlaced.position.y + 0.42 + Math.sin(t * 3) * 0.02, myPlaced.position.z); this.marker.rotation.y = t * 2; }

    // bodies
    const bseen = new Set();
    for (const b of pub.bodies) {
      const key = b.id + ':' + b.x + ':' + b.y; bseen.add(key);
      let e = this.bodies.get(key);
      if (!e) {
        const c = pub.chars[b.id];
        const bean = new Bean({ color: c.color, hat: c.hat }); bean.setDead(true);
        const pud = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), puddleMats[b.cause] || puddleMats.shiv);
        pud.rotation.x = -Math.PI / 2; pud.position.set(b.x * M + 0.1, 0.012, b.y * M + 0.05); pud.scale.set(1.3, 0.8, 1);
        this.group.add(bean.root, pud);
        e = { bean, pud, face: Math.random() * Math.PI * 2 }; this.bodies.set(key, e);
      }
      e.bean.update({ x: b.x * M, z: b.y * M, face: e.face, look: e.face, t, dt });
    }
    for (const [k, e] of this.bodies) if (!bseen.has(k)) { this.group.remove(e.bean.root, e.pud); this.bodies.delete(k); }

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
      else if (f.kind === 'crumbs') for (let i = 0; i < 8; i++) { const p = 1 - a, ang = i * 0.8; put('crumbs', x + Math.cos(ang) * p * 0.3, BOWL_H + 0.1 + p * 0.3 - p * p * 0.6, z + Math.sin(ang) * p * 0.3, 1); }
    }
    for (const k in this.fx) { const m = this.fx[k]; m.count = counts[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

    // floating money text
    this.floatPool.forEach(s => { s.visible = false; });
    let fi = 0;
    for (const f of pub.floats) {
      const key = f.text + f.color;
      let s = this.floatPool[fi];
      if (!s || s.userData.key !== key) {
        if (!this.floatCache.has(key)) this.floatCache.set(key, T.textSprite(f.text, { color: f.color, size: 56, bg: null, h: 0.3 }).material);
        if (!s) { s = new THREE.Sprite(); this.group.add(s); this.floatPool[fi] = s; }
        s.material = this.floatCache.get(key); s.userData.key = key;
        const img = s.material.map.image; s.scale.set(0.3 * img.width / img.height, 0.3, 1);
      }
      const life = 1.6 - f.t;
      s.position.set(f.x * M, 1.9 + life * 0.45, (f.y + 18 * life) * M);
      s.material.opacity = Math.min(1, f.t); s.visible = true; fi++;
    }
  }
}
