// The v4 kill set in 3D: the security desk and its monitors, the hired guard, ghost haunts, rigged-seat sparks
// (killers only), and the effects for traps, the pond and falling chandeliers. Chandeliers themselves live in world.js.
import * as THREE from 'three';
import * as T from './textures.js';
import { SECURITY, ROOMS, makeSeats } from '../map.js';
import { makeBean, onPlushReady } from './plush.js';
import { onPropsReady, hasProp, propObject } from './props.js';
import { MAT, glowMat, rbox, box, cyl, v3, yawOf, Batch, WALL_H } from './world.js';

const M = 1 / 60;
const SEATS = makeSeats();
// CCTV: a camera high in a corner of each room, looking at its middle
const CCTV = {};
for (const k in ROOMS) {
  const r = ROOMS[k];
  CCTV[k] = { p: v3((r.x + 40) * M, WALL_H - 0.35, (r.y + 40) * M), look: v3((r.x + r.w * 0.55) * M, 0.4, (r.y + r.h * 0.6) * M) };
}

export class Hazards {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.desk();
    const guard = () => {
      if (this.guard) this.group.remove(this.guard.root);
      this.guard = makeBean({ kind: 'guard', color: '#1d2a44', hat: 'cap', name: 'Security' }); this.guard.setLabel('SECURITY', '#9fd8ff');
      this.guard.root.visible = false; this.group.add(this.guard.root);
    };
    guard(); onPlushReady(guard);
    // a camera model in each room's corner, just behind the CCTV eye so the live view never sees it
    onPropsReady(() => {
      if (!hasProp('camera')) return;
      for (const k in CCTV) {
        const { p, look } = CCTV[k], d = look.clone().sub(p), flat = Math.hypot(d.x, d.z);
        const o = propObject('camera', { cast: false }); o.position.copy(p).addScaledVector(d.normalize(), -0.28); o.position.y -= 0.1;
        o.rotation.set(Math.atan2(p.y - look.y, flat), Math.atan2(look.x - p.x, look.z - p.z), 0, 'YXZ'); this.group.add(o);
      }
    });
    const mk = (geo, mat, n = 120) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; this.group.add(m); return m; };
    this.fx = {
      sparks: mk(new THREE.BoxGeometry(0.02, 0.02, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff080, toneMapped: false })),
      splash: mk(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, roughness: 0.05, transparent: true, opacity: 0.8 })),
      smash: mk(new THREE.OctahedronGeometry(0.04, 0), new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe0a0, emissiveIntensity: 0.6, roughness: 0.05 })),
      wisp: mk(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ map: T.glow(), color: 0x8ab0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
    };
    this.tmp = new THREE.Object3D();
    this.sprites = []; // a pool for the generated effect sprites (assets/art2 fx-*), refilled every frame
  }
  // one effect sprite: the art's black is see-through (additive glows, or alpha from brightness for smoke and confetti)
  sprite(i, k, x, y, z, size, opacity, rot = 0) {
    const map = T.art2Tex('fx-' + k, k === 'smoke' || k === 'confetti'); if (!map) return i;
    let sp = this.sprites[i];
    if (!sp) { sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); this.sprites.push(sp); this.group.add(sp); }
    const m = sp.material, add = !(k === 'smoke' || k === 'confetti');
    if (m.map !== map) { m.map = map; m.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true; }
    sp.position.set(x, y, z);
    // an effect right in front of the camera (a win at your own table, seen from the table view) fades out instead of filling the screen
    const near = this.cam ? Math.min(1, Math.max(0, (sp.position.distanceTo(this.cam.position) - size * 0.6 - 0.4) / 1.5)) : 1;
    m.opacity = Math.max(0, Math.min(1, opacity)) * near; m.rotation = rot; sp.scale.setScalar(size); sp.visible = near > 0;
    return i + 1;
  }
  // a dark wood desk against the floor's west wall with three monitors; they wake up once the crew buys cameras
  desk() {
    const B = new Batch(true), x = (SECURITY.x + SECURITY.w / 2) * M, z = (SECURITY.y + SECURITY.h / 2) * M, d = SECURITY.w * M, w = SECURITY.h * M;
    B.add(rbox(d, 0.76, w, 0.03), MAT.darkWood, v3(x, 0.38, z));
    B.add(box(d + 0.06, 0.04, w + 0.06), MAT.darkWood, v3(x, 0.78, z)); // matte: a gloss top threw two white hotspots
    for (const dz of [-0.62, 0, 0.62]) {
      B.add(rbox(0.06, 0.38, 0.56, 0.02), MAT.black, v3(x - 0.12, 1.06, z + dz), 0, null, 0, 0);
      B.add(cyl(0.025, 0.025, 0.2, 8), MAT.metalDark, v3(x - 0.14, 0.88, z + dz));
    }
    B.add(rbox(0.22, 0.03, 0.42, 0.01), MAT.black, v3(x + 0.1, 0.81, z)); // keyboard
    B.build(this.group);
    this.screens = [];
    // before the crew pays for cameras the monitors say so, instead of sitting there black
    const [oc, og] = T.canvas(256, 160);
    og.fillStyle = '#0b1418'; og.fillRect(0, 0, 256, 160);
    for (let y = 0; y < 160; y += 3) { og.fillStyle = 'rgba(150,220,255,0.04)'; og.fillRect(0, y, 256, 1); }
    og.textAlign = 'center'; og.fillStyle = '#5f8a98'; og.font = 'bold 24px monospace'; og.fillText('NO SIGNAL', 128, 70);
    og.font = '14px monospace'; og.fillStyle = '#4a6a76'; og.fillText('CAMERAS NOT BOUGHT', 128, 100);
    this.screenOff = new THREE.MeshBasicMaterial({ map: T.tex(oc, false), color: 0x8a9aa0 });
    this.screenOn = glowMat(0x7fb8d0, 1.1);
    const [cv, ctx] = T.canvas(256, 160); this.feedCtx = ctx; this.feedTex = T.tex(cv, false);
    this.screenFeed = new THREE.MeshBasicMaterial({ map: this.feedTex, toneMapped: false });
    [-0.62, 0, 0.62].forEach((dz, i) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), this.screenOff);
      s.position.set(x - 0.085, 1.07, z + dz); s.rotation.y = Math.PI / 2; this.group.add(s); this.screens.push(s);
    });
    this.lastFeed = '';
  }
  paintFeed(name, t) {
    const c = this.feedCtx, W = 256, H = 160;
    c.fillStyle = '#0e1a1e'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 3) { c.fillStyle = `rgba(150,220,255,${0.05 + Math.random() * 0.05})`; c.fillRect(0, y, W, 1); }
    c.fillStyle = '#bfefff'; c.font = 'bold 22px monospace'; c.fillText('CAM · ' + name.toUpperCase(), 12, 30);
    c.fillStyle = (t | 0) % 2 ? '#ff4040' : '#601010'; c.beginPath(); c.arc(W - 20, 22, 7, 0, 7); c.fill();
    this.feedTex.needsUpdate = true;
  }
  update(pub, priv, beans, t, dt, cam = null) {
    this.cam = cam;
    // the desk monitors
    const S = pub.security;
    if (S && S.cams) {
      const key = S.feed + ((t * 2) | 0);
      if (key !== this.lastFeed) { this.lastFeed = key; this.paintFeed(ROOMS[S.feed] ? ROOMS[S.feed].name.replace(/^the /, '') : S.feed, t * 2); }
      this.screens.forEach((s, i) => { s.material = i === 1 ? this.screenFeed : this.screenOn; });
    } else this.screens.forEach(s => { s.material = this.screenOff; });
    // the guard
    const g = pub.guard;
    this.guard.root.visible = !!g && pub.mode === 'play';
    if (g) this.guard.update({ x: g.x * M, z: g.y * M, face: yawOf(g.look), look: yawOf(g.look), moving: g.moving, seated: false, t, dt });
    // effects
    const counts = { sparks: 0, splash: 0, smash: 0, wisp: 0 };
    const put = (k, x, y, z, s = 1, rx = 0, ry = 0) => {
      const m = this.fx[k], i = counts[k]++; if (i >= m.instanceMatrix.count) return;
      this.tmp.position.set(x, y, z); this.tmp.rotation.set(rx, ry, 0); this.tmp.scale.setScalar(s); this.tmp.updateMatrix(); m.setMatrixAt(i, this.tmp.matrix);
    };
    let ns = 0;
    for (const f of pub.fx) { // sprites over the particles
      const x = f.x * M, z = f.y * M, a = Math.max(0, f.t);
      if (f.kind === 'sparks') { const p = 1.5 - a; ns = this.sprite(ns, 'sparks', x, 1.0, z, 0.5 + p * 0.9, a * 1.2, p); ns = this.sprite(ns, 'smoke', x, 1.1 + p * 0.5, z, 0.6 + p * 0.8, a * 0.5); }
      else if (f.kind === 'smash') { const p = 1.5 - a; ns = this.sprite(ns, 'smoke', x, 0.4 + p * 0.4, z, 1.2 + p * 1.6, a * 0.6); ns = this.sprite(ns, 'sparks', x, 0.5, z, 0.8 + p, a * 0.9, p * 2); }
      else if (f.kind === 'chips') { const p = 1 - a; ns = this.sprite(ns, 'confetti', x, 1.6 + p * 0.4, z, 0.8 + p * 1.2, a * 1.5, p); ns = this.sprite(ns, 'stars', x, 1.5, z, 0.6 + p * 1.0, a * 1.3); }
      else if (f.kind === 'bubbles') { const p = (1.5 - a) / 1.5; ns = this.sprite(ns, 'fizz', x, 0.5 + p * 0.9, z, 0.5 + p * 0.4, a * 0.8); }
      else if (f.kind === 'splat') { const p = (1.5 - a) / 1.5; ns = this.sprite(ns, 'smoke', x, 0.7 + p * 0.3, z, 0.4 + p * 0.6, a * 0.45); }
    }
    for (const h of pub.haunts || []) { // a ghostly wisp rising through whoever is haunted
      const c = pub.chars[h.on]; if (!c || !c.alive) continue;
      const b = beans.get(c.id), cx = b ? b.root.position.x : c.x * M, cz = b ? b.root.position.z : c.y * M;
      ns = this.sprite(ns, 'ghost', cx, 1.0 + Math.sin(t * 2) * 0.1, cz, 1.3, 0.55 + Math.sin(t * 3) * 0.15, Math.sin(t) * 0.3);
    }
    for (let i = ns; i < this.sprites.length; i++) this.sprites[i].visible = false;
    for (const f of pub.fx) {
      const x = f.x * M, z = f.y * M, a = Math.max(0, f.t);
      if (f.kind === 'sparks') for (let i = 0; i < 14; i++) { const p = 1.5 - a, ang = i * 0.45; put('sparks', x + Math.cos(ang) * p * 0.8, 0.9 + p * 1.1 - p * p * 1.4, z + Math.sin(ang) * p * 0.8, a > 0.2 ? 1 : a * 5, p * 3, ang); }
      else if (f.kind === 'splash') for (let i = 0; i < 16; i++) { const p = 1.2 - a, ang = i * 0.39; put('splash', x + Math.cos(ang) * p * 0.7, 0.05 + p * 1.6 - p * p * 1.9, z + Math.sin(ang) * p * 0.7, 1.2 - p * 0.5); }
      else if (f.kind === 'smash') for (let i = 0; i < 24; i++) { const p = 1.5 - a, ang = i * 0.26 + (i % 3); put('smash', x + Math.cos(ang) * p * (0.6 + (i % 4) * 0.25), Math.max(0.03, 0.4 + p * 0.9 - p * p * 1.3), z + Math.sin(ang) * p * (0.6 + (i % 4) * 0.25), 1, p * 4, ang); }
    }
    // haunts: cold blue wisps circling whoever is haunted
    for (const h of pub.haunts || []) {
      const c = pub.chars[h.on]; if (!c || !c.alive) continue;
      const b = beans.get(c.id), cx = b ? b.root.position.x : c.x * M, cz = b ? b.root.position.z : c.y * M;
      for (let i = 0; i < 6; i++) { const ang = t * 1.6 + i * 1.047; put('wisp', cx + Math.cos(ang) * 0.45, 0.6 + i * 0.2 + Math.sin(t * 3 + i) * 0.08, cz + Math.sin(ang) * 0.45, 1.4 + Math.sin(t * 5 + i) * 0.4); }
    }
    // killers see their rigged seats fizz
    if (priv && priv.rigged) for (const id of priv.rigged) {
      const s = SEATS[id]; if (!s) continue;
      for (let i = 0; i < 3; i++) { const ang = t * 7 + i * 2.1; put('sparks', s.x * M + Math.cos(ang) * 0.18, 0.95 + Math.abs(Math.sin(t * 9 + i)) * 0.2, s.y * M + Math.sin(ang) * 0.18, 0.8, t * 5, ang); }
    }
    for (const k in this.fx) { const m = this.fx[k]; m.count = counts[k]; m.instanceMatrix.needsUpdate = true; }
  }
  // Seated at the security desk with the cameras on, your view is the live camera.
  cctv(cam, pub, priv) {
    if (!priv || !priv.seat || priv.seat.game !== 'cams' || !pub.security || !pub.security.cams || pub.mode !== 'play') return false;
    const c = CCTV[pub.security.feed]; if (!c) return false;
    cam.position.copy(c.p); cam.lookAt(c.look);
    return true;
  }
}
