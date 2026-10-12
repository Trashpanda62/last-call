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
  if (/[?&]toy/.test(location.search)) return Promise.resolve(); // ?toy keeps the toy beans (comparisons)
  const loader = new GLTFLoader();
  return Promise.all(KINDS.map(k => loader.loadAsync(base + k + '.glb').then(g => { SRC[k] = prep(g.scene); })))
    .then(() => { ready = true; waiters.splice(0).forEach(f => f()); })
    .catch(e => console.warn('Plush beans did not load; keeping the toy beans.', e));
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
    this.hat = null;
    if (hat) {
      const s = S.info.trunkR / 0.31;
      this.hat = makeHat(hat, color || '#888888'); this.hat.scale.setScalar(s); this.hat.position.set(0, H - 0.08 * s, 0.01);
      this.model.add(this.hat); this.b.Head.o.attach(this.hat);
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
  setLabel(text, color) {
    const key = text + color; if (key === this.labelKey) return; this.labelKey = key;
    if (this.label) { this.root.remove(this.label); this.label.material.map.dispose(); this.label.material.dispose(); }
    this.label = T.textSprite(text, { color, size: 40, h: 0.055, screen: true }); this.label.position.y = this.labelY; this.root.add(this.label);
  }
  setDead(on) { this.dead = on; if (this.label) this.label.visible = !on; }
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

// A plush bean once the models are in, the toy bean before.
export function makeBean(opts) {
  if (!ready) return new Bean(opts);
  const kind = opts.kind || (opts.dealer ? 'croupier' : ROUND.has(opts.name) ? 'round' : 'bean');
  return new PlushBean({ ...opts, kind, hat: kind === 'bean' || kind === 'round' ? opts.hat : null });
}
