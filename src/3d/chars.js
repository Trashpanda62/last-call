// Plush bean gamblers: a soft capsule with a suit, bow tie, mitten gloves, dot eyes and a hat.
// Local +Z is the front. Feet at y=0. Standing eye height is about 1.05 m.
import * as THREE from 'three';
import * as T from './textures.js';

const BODY_R = 0.3, BODY_LEN = 0.62, BODY_Y = 0.79; // capsule centre
const COLLAR = BODY_Y + 0.15;                        // where the suit ends and the face begins
const plush = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.75, sheen: 0.8, sheenRoughness: 0.45, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5), ...extra });
const SKIN = 0xf2c09a, GLOVE = 0xfbf8f2, PANTS = 0x24202a;
const shared = {
  eye: new THREE.MeshStandardMaterial({ color: 0x0c0a0c, roughness: 0.2 }),
  shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  shirt: plush(0xfbf8f2),
  glove: plush(GLOVE),
  pants: plush(PANTS),
  shoe: new THREE.MeshStandardMaterial({ color: 0x141014, roughness: 0.35 }),
  black: plush(0x18141a),
  gold: new THREE.MeshStandardMaterial({ color: 0xe0b050, metalness: 0.9, roughness: 0.25 }),
  jewel: new THREE.MeshStandardMaterial({ color: 0xe0304a, roughness: 0.1, emissive: 0x400010 }),
  visor: new THREE.MeshStandardMaterial({ color: 0x3ddc97, roughness: 0.3, transparent: true, opacity: 0.75 }),
  shadow: new THREE.MeshBasicMaterial({ map: T.blob(), transparent: true, depthWrite: false, opacity: 0.8 }),
  lucky: new THREE.MeshBasicMaterial({ map: T.glow(), color: 0xffd060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  bubble: new THREE.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.8 }),
};
const G = {
  body: new THREE.CapsuleGeometry(BODY_R, BODY_LEN, 10, 28, 1),
  jacket: (() => { // lathe the capsule's lower profile, a hair wider, up to the collar
    const pts = [], r = BODY_R + 0.008, half = BODY_LEN / 2;
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r, -half + Math.sin(a) * r)); }
    pts.push(new THREE.Vector2(r, COLLAR - BODY_Y));
    return new THREE.LatheGeometry(pts, 28);
  })(),
  eye: new THREE.SphereGeometry(0.045, 14, 10),
  shine: new THREE.SphereGeometry(0.012, 8, 6),
  arm: new THREE.CapsuleGeometry(0.075, 0.2, 6, 12),
  glove: new THREE.SphereGeometry(0.09, 14, 10),
  thumb: new THREE.SphereGeometry(0.04, 10, 8),
  leg: new THREE.CapsuleGeometry(0.085, 0.1, 6, 12),
  shoe: new THREE.SphereGeometry(0.09, 12, 8),
  shadow: new THREE.PlaneGeometry(0.9, 0.9),
  bubble: new THREE.SphereGeometry(0.035, 8, 6),
  xbar: new THREE.BoxGeometry(0.1, 0.022, 0.02),
};

function shirtV() {
  const s = new THREE.Shape(); s.moveTo(-0.11, 0.0); s.lineTo(0.11, 0.0); s.lineTo(0, -0.2); s.closePath();
  return new THREE.ShapeGeometry(s);
}
const V = shirtV();

export function makeHat(kind, color) {
  const g = new THREE.Group();
  const felt = plush(new THREE.Color(color).multiplyScalar(0.55));
  const band = shared.black;
  const cyl = (rt, rb, h, m, y, s = 24) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m); c.position.y = y; g.add(c); return c; };
  switch (kind) {
    case 'tophat': cyl(0.3, 0.3, 0.025, felt, 0.0); cyl(0.19, 0.18, 0.36, felt, 0.19); cyl(0.183, 0.183, 0.06, band, 0.05); break;
    case 'fedora': {
      cyl(0.33, 0.33, 0.02, felt, 0); const c = cyl(0.17, 0.21, 0.19, felt, 0.1); c.scale.z = 0.9;
      cyl(0.205, 0.212, 0.05, band, 0.035);
      const dent = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), felt); dent.position.y = 0.17; dent.scale.set(1, 0.35, 0.9); g.add(dent);
      break;
    }
    case 'cowboy': {
      const brim = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.25, 0], [0.36, 0.06], [0.38, 0.09], [0.36, 0.07], [0.25, 0.02], [0, 0.02]].map(p => new THREE.Vector2(...p)), 28), felt);
      g.add(brim); const c = cyl(0.16, 0.2, 0.2, felt, 0.11); c.scale.x = 0.85; cyl(0.2, 0.205, 0.04, band, 0.04);
      break;
    }
    case 'beret': { const b = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 12), felt); b.scale.set(1, 0.32, 1); b.position.set(0.03, 0.04, 0); b.rotation.z = -0.2; g.add(b); cyl(0.015, 0.015, 0.06, felt, 0.13); break; }
    case 'bowler': {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), felt); d.scale.y = 0.95; d.position.y = 0.02; g.add(d);
      const brim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 28), felt); brim.rotation.x = Math.PI / 2; brim.scale.z = 0.5; g.add(brim);
      cyl(0.222, 0.222, 0.04, band, 0.04); break;
    }
    case 'visor': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 28), shared.visor); ring.rotation.x = Math.PI / 2; ring.position.y = -0.04; g.add(ring);
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.012, 24, 1, false, -Math.PI / 2.4, Math.PI / 1.2), shared.visor); v.position.set(0, -0.03, 0.06); v.rotation.x = -0.2; g.add(v);
      break;
    }
    case 'crown': {
      cyl(0.2, 0.2, 0.12, shared.gold, 0.05, 24);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const p = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 8), shared.gold); p.position.set(Math.cos(a) * 0.19, 0.15, Math.sin(a) * 0.19); g.add(p); const j = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), shared.jewel); j.position.set(Math.cos(a) * 0.205, 0.06, Math.sin(a) * 0.205); g.add(j); }
      break;
    }
    case 'beanie': {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.315, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), felt); d.position.y = -0.08; g.add(d);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.05, 8, 28), plush(0xf3ead8)); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.06; g.add(cuff);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), plush(0xf3ead8)); pom.position.y = 0.25; g.add(pom);
      break;
    }
    default: break;
  }
  return g;
}

// One gambler. update() poses it from the view each frame.
export class Bean {
  constructor({ color, hat, name, dealer = false }) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const suit = plush(color), skin = plush(SKIN);
    this.mats = { suit, skin, base: new THREE.Color(color), skinBase: new THREE.Color(SKIN) };
    const add = (geo, mat, x, y, z, parent = this.body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    add(G.body, skin, 0, BODY_Y, 0);
    add(G.jacket, suit, 0, BODY_Y, 0);
    // shirt front, lapels and bow tie
    const v = add(V, shared.shirt, 0, COLLAR + 0.005, BODY_R + 0.012); v.rotation.x = -0.05;
    for (const s of [-1, 1]) { const l = add(new THREE.BoxGeometry(0.03, 0.2, 0.012), plush(new THREE.Color(color).multiplyScalar(0.6)), s * 0.055, COLLAR - 0.09, BODY_R + 0.016); l.rotation.z = s * 0.5; }
    const tieMat = dealer ? shared.black : plush(0x18141a);
    for (const s of [-1, 1]) { const b = add(new THREE.ConeGeometry(0.035, 0.07, 8), tieMat, s * 0.035, COLLAR - 0.005, BODY_R + 0.03); b.rotation.z = s * Math.PI / 2; }
    add(new THREE.SphereGeometry(0.018, 8, 6), tieMat, 0, COLLAR - 0.005, BODY_R + 0.035);
    // buttons
    for (let i = 0; i < 2; i++) add(new THREE.SphereGeometry(0.014, 8, 6), shared.black, 0, COLLAR - 0.26 - i * 0.09, BODY_R + 0.005);
    // eyes in a group so they can glance around the face
    this.eyes = new THREE.Group(); this.eyes.position.y = BODY_Y + 0.27; this.body.add(this.eyes);
    this.eyeDots = []; this.xEyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(G.eye, shared.eye); e.position.set(s * 0.085, 0, 0.278); e.scale.set(0.8, 1.35, 0.5); this.eyes.add(e); this.eyeDots.push(e);
      const sh = new THREE.Mesh(G.shine, shared.shine); sh.position.set(s * 0.085 + 0.012, 0.025, 0.3); this.eyes.add(sh); this.eyeDots.push(sh);
      const x = new THREE.Group(); x.position.set(s * 0.085, 0, 0.29);
      for (const r of [0.8, -0.8]) { const b = new THREE.Mesh(G.xbar, shared.eye); b.rotation.z = r; x.add(b); }
      x.visible = false; this.eyes.add(x); this.xEyes.push(x);
    }
    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * (BODY_R + 0.02), BODY_Y + 0.02, 0); this.body.add(pivot);
      const a = new THREE.Mesh(G.arm, suit); a.position.y = -0.14; pivot.add(a);
      const hand = new THREE.Group(); hand.position.y = -0.3; pivot.add(hand);
      hand.add(new THREE.Mesh(G.glove, shared.glove));
      const th = new THREE.Mesh(G.thumb, shared.glove); th.position.set(-s * 0.05, 0.03, 0.06); hand.add(th);
      pivot.rotation.z = s * 0.28;
      this.arms.push({ pivot, hand, s });
    }
    this.rightHand = this.arms[1].hand;
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.12, 0.25, 0); this.body.add(pivot);
      const l = new THREE.Mesh(G.leg, shared.pants); l.position.y = -0.1; pivot.add(l);
      const sh = new THREE.Mesh(G.shoe, shared.shoe); sh.position.set(0, -0.2, 0.04); sh.scale.set(1, 0.6, 1.4); pivot.add(sh);
      this.legs.push(pivot);
    }
    // hat
    this.hat = makeHat(hat, color); this.hat.position.y = BODY_Y + BODY_LEN / 2 + BODY_R - 0.06; this.body.add(this.hat);
    // contact shadow, lucky glow, poison bubbles
    this.shadow = new THREE.Mesh(G.shadow, shared.shadow); this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.01; this.root.add(this.shadow);
    this.luckyRing = new THREE.Mesh(G.shadow, shared.lucky); this.luckyRing.rotation.x = -Math.PI / 2; this.luckyRing.position.y = 0.02; this.luckyRing.scale.setScalar(1.4); this.luckyRing.visible = false; this.root.add(this.luckyRing);
    this.bubbles = [];
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(G.bubble, shared.bubble); b.visible = false; this.root.add(b); this.bubbles.push(b); }
    this.label = null; this.labelKey = '';
    if (name) this.setLabel(name, '#f3ead8');
    this.phase = Math.random() * 10; this.walk = 0; this.yaw = 0; this.eyeYaw = 0; this.seatBlend = 0; this.dead = false;
  }
  setLabel(text, color) {
    const key = text + color; if (key === this.labelKey) return; this.labelKey = key;
    if (this.label) { this.root.remove(this.label); this.label.material.map.dispose(); this.label.material.dispose(); }
    this.label = T.textSprite(text, { color, size: 40, h: 0.055, screen: true }); this.label.position.y = 1.95; this.root.add(this.label);
  }
  setDead(on) {
    this.dead = on;
    this.eyeDots.forEach(e => { e.visible = !on; }); this.xEyes.forEach(x => { x.visible = on; });
    if (this.label) this.label.visible = !on;
  }
  // s: { x, z, face, look, moving, seated, pale, lucky, t, dt }
  update(s) {
    const dt = Math.min(0.1, s.dt || 0.016);
    this.root.position.set(s.x, 0, s.z);
    if (this.dead) {
      this.body.rotation.set(-Math.PI / 2 + 0.05, 0, 0.25); this.body.position.set(0, 0.3, 0.7);
      this.root.rotation.y = s.face; this.shadow.scale.set(1, 2, 1);
      this.arms.forEach(a => { a.pivot.rotation.x = 0; a.pivot.rotation.z = a.s * 1.3; });
      this.legs.forEach((l, i) => { l.rotation.x = 0; l.rotation.z = (i ? 1 : -1) * 0.3; });
      this.bubbles.forEach(b => { b.visible = false; });
      this.luckyRing.visible = false;
      return;
    }
    // turn the body toward where it is heading, eyes toward where it looks
    let d = s.face - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * (s.seated ? 20 : 10));
    this.root.rotation.y = this.yaw;
    let e = s.look - this.yaw; e = Math.atan2(Math.sin(e), Math.cos(e));
    e = Math.max(-1.1, Math.min(1.1, e));
    this.eyeYaw += (e - this.eyeYaw) * Math.min(1, dt * 12);
    this.eyes.rotation.y = this.eyeYaw;
    this.seatBlend += ((s.seated ? 1 : 0) - this.seatBlend) * Math.min(1, dt * 10);
    this.walk += ((s.moving ? 1 : 0) - this.walk) * Math.min(1, dt * 8);
    this.phase += dt * 11 * (0.3 + this.walk);
    const sw = Math.sin(this.phase) * this.walk;
    const sb = this.seatBlend;
    this.body.position.set(0, Math.abs(Math.cos(this.phase)) * 0.05 * this.walk + sb * 0.3 + Math.sin(s.t * 2 + this.phase) * 0.006, 0);
    this.body.rotation.set(0, 0, sw * 0.07);
    this.legs.forEach((l, i) => { l.rotation.x = (i ? sw : -sw) * 0.7 - sb * 1.45; l.rotation.z = 0; });
    this.arms.forEach((a, i) => {
      a.pivot.rotation.x = (i ? -sw : sw) * 0.6 - sb * 0.9 + (this.holding && i === 1 ? -0.9 : 0);
      a.pivot.rotation.z = a.s * (0.28 - sb * 0.15);
    });
    this.body.scale.set(1, 1 + Math.sin(s.t * 2.2 + this.phase) * 0.008, 1);
    // poisoned: going green, bubbles over the head
    const pale = s.pale ? 0.55 + Math.sin(s.t * 4) * 0.1 : 0;
    this.mats.skin.color.copy(this.mats.skinBase).lerp(new THREE.Color(0xa8e890), pale);
    this.bubbles.forEach((b, i) => {
      b.visible = !!s.pale;
      if (!s.pale) return;
      const p = (s.t * 0.8 + i / 4) % 1;
      b.position.set(Math.sin(i * 2.1 + s.t) * 0.12, 1.6 + sb * 0.3 + p * 0.5, Math.cos(i * 1.7) * 0.1);
      b.scale.setScalar(1 - p * 0.7);
    });
    this.luckyRing.visible = !!s.lucky;
    if (s.lucky) { this.luckyRing.material.opacity = 0.5 + Math.sin(s.t * 5) * 0.2; this.luckyRing.rotation.z = s.t; }
    this.shadow.scale.set(1, 1, 1);
    if (this.label) this.label.position.y = 1.95 + sb * 0.3;
  }
}
