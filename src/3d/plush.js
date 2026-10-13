// Plush beans (look A, Steve 2026-10-12): Sorceress/Meshy felt models rigged in Blender (tools/rig_bean.py), posed here
// from the same inputs as the toy Bean in chars.js. Player colours are a shader tint on the red felt; staff keep theirs.
// The models load in the background; until they arrive (or if they fail) the toy beans stand in.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import * as T from './textures.js';
import { Bean, makeHat } from './chars.js';

const KINDS = ['bean', 'round', 'croupier', 'bartender', 'guard'];
const ROUND = new Set(['Biscuit', 'Duke', 'Coco', 'Ozzie', 'Snow', 'Peach']); // the second body shape
const SRC = {};
let ready = false;
const waiters = [];
export const plushReady = () => ready;
export function onPlushReady(f) { if (ready) f(); else waiters.push(f); }

export function loadPlush(base = 'assets/chars/') {
  if (/[?&]toy\b/.test(location.search)) return Promise.resolve(); // ?toy keeps the toy beans (comparisons)
  const loader = new GLTFLoader();
  return Promise.all(KINDS.map(k => loader.loadAsync(base + k + '.glb').then(g => { SRC[k] = prep(g.scene); })))
    .then(() => { ready = true; waiters.splice(0).forEach(f => f()); })
    .catch(e => console.warn('Plush beans did not load; keeping the toy beans.', e));
}

// Sorceress hats (plan-v4 phase 2, assets/hats; tools/v4_more.py): each replaces the hand-built hat of its kind, sized
// and seated like it. Beans made before they load get theirs swapped in.
const HAT_SRC = {}, hatted = new Set();
const HAT_GROW = { party: 1.6 }; // the hand-built party hat is a thin cone; the model reads too small at its width
export function loadHats(base = 'assets/hats/') {
  if (/[?&](toy|noprops)\b/.test(location.search)) return;
  const loader = new GLTFLoader();
  fetch(base + 'hats.json').then(r => r.json()) // the kinds that have a model; the rest keep the hand-built hat
    .then(kinds => Promise.all(kinds.map(k => loader.loadAsync(base + k + '.glb').then(g => { HAT_SRC[k] = g.scene; }).catch(() => null))))
    .then(() => { for (const r of hatted) { const b = r.deref(); if (b) b.fitHat(); } hatted.clear(); }).catch(() => null);
}
function hatModel(kind, color) {
  const src = HAT_SRC[kind]; if (!src) return null;
  const ref = new THREE.Box3().setFromObject(makeHat(kind, color)), m = src.clone(true), gb = new THREE.Box3().setFromObject(m);
  const k = (ref.max.x - ref.min.x) / (gb.max.x - gb.min.x) * (HAT_GROW[kind] || 1);
  m.scale.setScalar(k); m.position.y = ref.min.y - gb.min.y * k;
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material.envMapIntensity = 0.4; } });
  const g = new THREE.Group(); g.add(m); g.userData.model = true; return g;
}

// The red felt's mean luminance (linear), so a tint keeps the texture's shading.
function feltLum(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 128, 128);
    const d = x.getImageData(0, 0, 128, 128).data, lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = lin(d[i]), g = lin(d[i + 1]), b = lin(d[i + 2]);
      if (r > 0.02 && (r - Math.max(g, b)) / r > 0.7) { sum += 0.2126 * r + 0.7152 * g + 0.0722 * b; n++; }
    }
    return n > 50 ? sum / n : 0.08;
  } catch { return 0.08; }
}

function prep(scene) {
  let info = { height: 1.41, crownR: 0.24, trunkR: 0.3, legTop: 0.23 }, mesh = null;
  scene.traverse(o => {
    if (o.userData && o.userData.bean) info = JSON.parse(o.userData.bean);
    if (o.isSkinnedMesh) mesh = o;
  });
  const src = mesh.material, map = src.map;
  return { scene, info, map, ref: map && map.image ? feltLum(map.image) : 0.08 };
}

// Felt: rough with a soft sheen. The tint swaps the red felt for the player's colour.
function feltMat(S, tint) {
  const u = { uTint: { value: new THREE.Color(tint || '#ffffff') }, uTintOn: { value: tint ? 1 : 0 }, uRef: { value: S.ref } };
  const m = new THREE.MeshPhysicalMaterial({ map: S.map, roughness: 0.92, metalness: 0, sheen: 0.6, sheenRoughness: 0.75, sheenColor: new THREE.Color(0x8a8a8a) });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform vec3 uTint;\nuniform float uTintOn;\nuniform float uRef;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float felt = smoothstep( 0.55, 0.8, ( sampledDiffuseColor.r - max( sampledDiffuseColor.g, sampledDiffuseColor.b ) ) / max( sampledDiffuseColor.r, 1e-3 ) );
  float lum = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, min( uTint * ( lum / uRef ), vec3( 1.0 ) ), felt * uTintOn );
  diffuseColor *= sampledDiffuseColor;
#endif`);
  };
  m.customProgramCacheKey = () => 'plushFelt';
  m.userData.u = u;
  return m;
}

const BONES = ['Hips', 'Spine', 'Spine1', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const shadowMat = new THREE.MeshBasicMaterial({ map: T.blob(), transparent: true, depthWrite: false, opacity: 0.8 });
const luckyMat = new THREE.MeshBasicMaterial({ map: T.glow(), color: 0xffd060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.8 });
const flatGeo = new THREE.PlaneGeometry(0.9, 0.9), bubbleGeo = new THREE.SphereGeometry(0.035, 8, 6);
const SICK = new THREE.Color(0x9ad870);
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), eu = new THREE.Euler();

// ---------- Gestures: Sorceress hy-motion clips (SMPL joint positions), retargeted by matching bone directions ----------
const CLIPS = {}, BAKED = {};
export function loadClips(names, base = 'assets/anim/') {
  return Promise.all(names.map(n => fetch(base + n + '.json').then(r => r.json()).then(c => { CLIPS[n] = { fps: c.fps, n: c.n, j: Float32Array.from(c.j) }; }).catch(() => {})));
}
export const hasClip = n => !!CLIPS[n];
export const PLAYED = {}; // gestures started, by name (debug info)
// SMPL joints: 0 pelvis, 1/2 hips (left/right), 3/6/9 spine, 4/5 knees, 7/8 ankles, 10/11 toes, 12 neck, 15 head,
// 16/17 shoulders, 18/19 elbows, 20/21 wrists. Left is +X and the front +Z, as on our rig. A bean bends less than a person.
const AIM = [['Spine', 0, 9, 0.45], ['Spine1', 9, 12, 0.45], ['Head', 12, 15, 0.3],
  ['LeftArm', 16, 18, 1], ['LeftForeArm', 18, 20, 1], ['RightArm', 17, 19, 1], ['RightForeArm', 19, 21, 1],
  ['LeftUpLeg', 1, 4, 1], ['LeftLeg', 4, 7, 1], ['LeftFoot', 7, 10, 0.6], ['RightUpLeg', 2, 5, 1], ['RightLeg', 5, 8, 1], ['RightFoot', 8, 11, 0.6]];
const CHILD = { Spine: 'Spine1', Spine1: 'Head', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot' };
const UPPER = new Set(['Spine', 'Spine1', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']);
function bake(kind, name) {
  const key = kind + ':' + name; if (BAKED[key]) return BAKED[key];
  const C = CLIPS[name], S = SRC[kind]; if (!C || !S) return null;
  const tpl = skClone(S.scene); tpl.updateMatrixWorld(true);
  const bones = {}; tpl.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const rest = {}; for (const n of BONES) rest[n] = bones[n].quaternion.clone();
  const hipsW = bones.Hips.getWorldQuaternion(new THREE.Quaternion());
  const V = () => new THREE.Vector3(), J = (f, k, v) => v.fromArray(C.j, (f * 22 + k) * 3);
  const a = V(), b = V(), c = V(), x = V(), y = V(), z = V(), cur = V(), want = V(), hp = V(), cp = V();
  const q = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), m = new THREE.Matrix4(), I = new THREE.Quaternion();
  const y0 = J(0, 0, V()).y, leg = Math.max(0.3, y0 - J(0, 7, V()).y);
  const out = { fps: C.fps, n: C.n, q: new Float32Array(C.n * BONES.length * 4), y: new Float32Array(C.n) };
  for (let f = 0; f < C.n; f++) {
    for (const n of BONES) bones[n].quaternion.copy(rest[n]);
    // the hips follow the pelvis (across the hips, up the spine), at 60%
    x.subVectors(J(f, 1, a), J(f, 2, b)).normalize(); c.subVectors(J(f, 3, a), J(f, 0, b));
    z.crossVectors(x, c).normalize(); y.crossVectors(z, x);
    q.setFromRotationMatrix(m.makeBasis(x, y, z)).slerp(I, 0.4);
    bones.Hips.parent.getWorldQuaternion(pq);
    bones.Hips.quaternion.copy(pq.invert().multiply(q).multiply(hipsW));
    tpl.updateMatrixWorld(true);
    for (const [n, j0, j1, k] of AIM) {
      const bo = bones[n], ch = bones[CHILD[n]];
      bo.getWorldPosition(hp);
      if (ch) cur.subVectors(ch.getWorldPosition(cp), hp).normalize(); else cur.set(0, 1, 0).applyQuaternion(bo.getWorldQuaternion(wq));
      want.subVectors(J(f, j1, a), J(f, j0, b)).normalize().lerp(cur, 1 - k).normalize();
      q.setFromUnitVectors(cur, want);
      bo.getWorldQuaternion(wq).premultiply(q);
      bo.parent.getWorldQuaternion(pq);
      bo.quaternion.copy(pq.invert().multiply(wq));
      bo.updateMatrixWorld(true);
    }
    BONES.forEach((n, i) => bones[n].quaternion.toArray(out.q, (f * BONES.length + i) * 4));
    out.y[f] = (J(f, 0, a).y - y0) * S.info.legTop / leg; // bounces scaled to the bean's short legs
  }
  return (BAKED[key] = out);
}

export class PlushBean {
  constructor({ kind = 'bean', color = null, hat = null, name = null }) {
    const S = SRC[kind];
    this.kind = kind; this.info = S.info;
    const H = S.info.height;
    this.root = new THREE.Group();
    this.model = skClone(S.scene); this.root.add(this.model);
    this.color = color ? new THREE.Color(color) : null;
    this.mat = feltMat(S, kind === 'bean' || kind === 'round' ? color : null);
    this.model.traverse(o => { if (o.isSkinnedMesh) { o.material = this.mat; o.castShadow = true; o.frustumCulled = false; } });
    // each bone's rest pose, and its rest orientation in the model's frame, so poses can be given in character axes
    this.model.updateMatrixWorld(true);
    const inv = this.model.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.b = {};
    this.model.traverse(o => {
      if (!o.isBone || !BONES.includes(o.name)) return;
      const w = o.getWorldQuaternion(new THREE.Quaternion()).premultiply(inv);
      this.b[o.name] = { o, rest: o.quaternion.clone(), w, wi: w.clone().invert(), restScale: o.scale.clone() };
    });
    // the right hand (the character's own right, -X) holds drinks; an anchor with the model's axes at the glove
    this.rightHand = new THREE.Group();
    const rh = this.b.RightHand.o, hp = new THREE.Vector3();
    rh.getWorldPosition(hp); this.model.worldToLocal(hp);
    this.rightHand.position.copy(hp).add(new THREE.Vector3(-0.04, -0.05, 0)); this.model.add(this.rightHand); rh.attach(this.rightHand);
    // hat on the crown, riding the head bone
    this.hat = null; this.hatKind = hat; this.hatColor = color || '#888888';
    if (hat) {
      const s = S.info.trunkR / 0.31;
      this.hat = hatModel(hat, this.hatColor) || makeHat(hat, this.hatColor); this.hat.scale.setScalar(s); this.hat.position.set(0, H - 0.08 * s, 0.01);
      this.model.add(this.hat); this.b.Head.o.attach(this.hat);
      if (!this.hat.userData.model) hatted.add(new WeakRef(this));
    }
    this.shadow = new THREE.Mesh(flatGeo, shadowMat); this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.01; this.root.add(this.shadow);
    this.luckyRing = new THREE.Mesh(flatGeo, luckyMat); this.luckyRing.rotation.x = -Math.PI / 2; this.luckyRing.position.y = 0.02; this.luckyRing.scale.setScalar(1.4); this.luckyRing.visible = false; this.root.add(this.luckyRing);
    this.bubbles = [];
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(bubbleGeo, bubbleMat); b.visible = false; this.root.add(b); this.bubbles.push(b); }
    this.label = null; this.labelKey = ''; this.labelY = H + 0.57;
    if (name) this.setLabel(name, '#f3ead8');
    this.phase = Math.random() * 10; this.walk = 0; this.yaw = 0; this.eyeYaw = 0; this.seatBlend = 0; this.dead = false; this.holding = false;
    this.seatLift = Math.max(0, 0.49 - S.info.legTop);
  }
  // the generated hat has arrived: put it where the hand-built one sits
  fitHat() {
    const m = this.hat && !this.hat.userData.model && hatModel(this.hatKind, this.hatColor); if (!m) return;
    m.position.copy(this.hat.position); m.quaternion.copy(this.hat.quaternion); m.scale.copy(this.hat.scale);
    this.hat.parent.add(m); this.hat.removeFromParent(); this.hat = m;
  }
  setLabel(text, color) {
    const key = text + color; if (key === this.labelKey) return; this.labelKey = key;
    if (this.label) { this.root.remove(this.label); this.label.material.map.dispose(); this.label.material.dispose(); }
    this.label = T.textSprite(text, { color, size: 40, h: 0.055, screen: true }); this.label.position.y = this.labelY; this.root.add(this.label);
  }
  setDead(on) { this.dead = on; if (this.label) this.label.visible = !on; }
  // play a gesture over the procedural pose; upper: arms, spine and head only (seated, or holding still)
  play(name, upper = false) { if (!CLIPS[name] || this.dead) return false; this.g = { name, t: 0, upper }; PLAYED[name] = (PLAYED[name] || 0) + 1; return true; }
  get busy() { return !!this.g; }
  // a rotation given in the character's axes (x pitch forward/back, y turn, z roll), applied about the bone's joint
  rot(name, x = 0, y = 0, z = 0) {
    const B = this.b[name]; if (!B) return;
    qa.setFromEuler(eu.set(x, y, z, 'XYZ'));
    qb.copy(B.wi).multiply(qa).multiply(B.w);
    B.o.quaternion.copy(B.rest).multiply(qb);
  }
  // s: { x, z, face, look, moving, seated, pale, lucky, t, dt }
  update(s) {
    const dt = Math.min(0.1, s.dt || 0.016), H = this.info.height;
    this.root.position.set(s.x, 0, s.z);
    if (this.dead) {
      this.root.rotation.y = s.face;
      this.model.rotation.set(Math.PI / 2, 0, 0.15); this.model.position.set(0, this.info.trunkR * 0.85, -H * 0.35);
      for (const n of BONES) this.rot(n);
      this.rot('LeftArm', 0, 0, 0.9); this.rot('RightArm', 0, 0, -0.9);
      this.rot('LeftUpLeg', 0, 0, 0.35); this.rot('RightUpLeg', 0, 0, -0.35);
      this.shadow.scale.set(1, 2, 1); this.shadow.position.z = 0;
      this.bubbles.forEach(b => { b.visible = false; }); this.luckyRing.visible = false;
      return;
    }
    this.model.rotation.set(0, 0, 0);
    let d = s.face - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * (s.seated ? 20 : 10));
    this.root.rotation.y = this.yaw;
    let e = s.look - this.yaw; e = Math.atan2(Math.sin(e), Math.cos(e));
    e = Math.max(-1.1, Math.min(1.1, e));
    this.eyeYaw += (e - this.eyeYaw) * Math.min(1, dt * 12);
    this.seatBlend += ((s.seated ? 1 : 0) - this.seatBlend) * Math.min(1, dt * 10);
    this.walk += ((s.moving ? 1 : 0) - this.walk) * Math.min(1, dt * 8);
    this.phase += dt * 11 * (0.3 + this.walk);
    const sw = Math.sin(this.phase) * this.walk, sb = this.seatBlend, w = this.walk;
    const breathe = Math.sin(s.t * 2.2 + this.phase);
    this.model.position.set(0, Math.abs(Math.cos(this.phase)) * 0.045 * w + sb * this.seatLift, 0);
    this.rot('Hips', 0, 0, sw * 0.06);
    this.rot('Spine', 0.05 * w + 0.04 * sb, 0, -sw * 0.03);
    this.rot('Spine1', 0, this.eyeYaw * 0.15, 0);
    this.rot('Head', 0, this.eyeYaw * 0.3, breathe * 0.012);
    for (const [i, side, sx] of [[0, 'Left', 1], [1, 'Right', -1]]) {
      const swing = (i ? -sw : sw);
      const hold = this.holding && side === 'Right';
      // arms hang a little lower than the A-pose they were modelled in, swing when walking, reach forward when seated
      this.rot(`${side}Arm`, swing * 0.55 - sb * 0.75 - (hold ? 0.85 : 0), 0, -sx * (0.42 - sb * 0.15 + Math.max(0, swing) * 0.05));
      this.rot(`${side}ForeArm`, -0.15 - (hold ? 0.9 : 0) - sb * 0.35, 0, 0);
      this.rot(`${side}Hand`, 0, 0, 0);
      const leg = (i ? sw : -sw);
      this.rot(`${side}UpLeg`, leg * 0.6 - sb * 1.45, 0, 0);
      this.rot(`${side}Leg`, Math.max(0, -leg) * 0.7 + sb * 1.35, 0, 0);
      this.rot(`${side}Foot`, -sb * 0.1, 0, 0);
    }
    const sp = this.b.Spine1; if (sp) sp.o.scale.copy(sp.restScale).multiplyScalar(1 + breathe * 0.006);
    if (this.g) this.gesture(dt, s.moving);
    if (this.hat && this.hat.userData.spin) this.hat.userData.spin.rotation.y += dt * (4 + w * 20);
    // poisoned: going green, bubbles over the head
    const u = this.mat.userData.u;
    if (this.color) u.uTint.value.copy(this.color).lerp(SICK, s.pale ? 0.55 + Math.sin(s.t * 4) * 0.1 : 0);
    this.bubbles.forEach((b, i) => {
      b.visible = !!s.pale; if (!s.pale) return;
      const p = (s.t * 0.8 + i / 4) % 1;
      b.position.set(Math.sin(i * 2.1 + s.t) * 0.12, H + 0.15 + sb * this.seatLift + p * 0.5, Math.cos(i * 1.7) * 0.1);
      b.scale.setScalar(1 - p * 0.7);
    });
    this.luckyRing.visible = !!s.lucky;
    if (s.lucky) { this.luckyRing.material.opacity = 0.5 + Math.sin(s.t * 5) * 0.2; this.luckyRing.rotation.z = s.t; }
    this.shadow.scale.set(1, 1, 1);
    if (this.label) this.label.position.y = this.labelY + sb * this.seatLift;
  }
}

PlushBean.prototype.gesture = function (dt, moving) {
  const g = this.g, B = bake(this.kind, g.name);
  if (!B || (moving && !g.upper)) { this.g = null; return; }
  g.t += dt;
  const dur = (B.n - 1) / B.fps; if (g.t >= dur) { this.g = null; return; }
  const w = Math.min(1, g.t / 0.2, (dur - g.t) / 0.3), fi = g.t * B.fps, f0 = Math.floor(fi), f1 = Math.min(B.n - 1, f0 + 1), u = fi - f0;
  BONES.forEach((n, i) => {
    if (g.upper && !UPPER.has(n)) return;
    qa.fromArray(B.q, (f0 * BONES.length + i) * 4); qb.fromArray(B.q, (f1 * BONES.length + i) * 4);
    this.b[n].o.quaternion.slerp(qa.slerp(qb, u), w);
  });
  if (!g.upper) this.model.position.y += (B.y[f0] * (1 - u) + B.y[f1] * u) * w;
};

// A plush bean once the models are in, the toy bean before.
export function makeBean(opts) {
  if (!ready) return new Bean(opts);
  const kind = opts.kind || (opts.dealer ? 'croupier' : ROUND.has(opts.name) ? 'round' : 'bean');
  return new PlushBean({ ...opts, kind, hat: kind === 'bean' || kind === 'round' ? opts.hat : null });
}
