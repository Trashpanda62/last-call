// Bean gamblers (look A): a soft vinyl bean with a big face, a suit, a bow tie, four-finger cartoon gloves and a hat.
// Local +Z is the front. Feet at y=0. Standing eye height is about 1.05 m.
import * as THREE from 'three';
const SICK = new THREE.Color(0xa8e890);
import * as T from './textures.js';

const BODY_R = 0.31, BODY_LEN = 0.6, BODY_Y = 0.8; // capsule centre
const COLLAR = BODY_Y + 0.13;                      // where the suit ends and the face begins
const toy = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5), clearcoat: 0.25, clearcoatRoughness: 0.45, ...extra });
const SKIN = 0xf6c8a4, GLOVE = 0xfbf9f4, PANTS = 0x24202a;
const shared = {
  eye: new THREE.MeshPhysicalMaterial({ color: 0x0c0a0c, roughness: 0.15, clearcoat: 1 }),
  shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  brow: new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.6 }),
  mouth: new THREE.MeshStandardMaterial({ color: 0x5a1a1a, roughness: 0.5 }),
  blush: new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.35, depthWrite: false }),
  shirt: toy(0xfbf8f2),
  glove: toy(GLOVE, { roughness: 0.45, clearcoat: 0.4 }),
  pants: toy(PANTS),
  shoe: new THREE.MeshPhysicalMaterial({ color: 0x141014, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
  black: toy(0x18141a),
  gold: new THREE.MeshStandardMaterial({ color: 0xe0b050, metalness: 0.9, roughness: 0.25 }),
  jewel: new THREE.MeshStandardMaterial({ color: 0xe0304a, roughness: 0.1, emissive: 0x400010 }),
  visor: new THREE.MeshStandardMaterial({ color: 0x3ddc97, roughness: 0.3, transparent: true, opacity: 0.75 }),
  shadow: new THREE.MeshBasicMaterial({ map: T.blob(), transparent: true, depthWrite: false, opacity: 0.8 }),
  lucky: new THREE.MeshBasicMaterial({ map: T.glow(), color: 0xffd060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  bubble: new THREE.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.8 }),
  white: toy(0xffffff), red: toy(0xe0303a), petal: toy(0xff7ac8), leaf: toy(0x3a9a3a), metal: new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.35 }),
};
const G = {
  body: new THREE.CapsuleGeometry(BODY_R, BODY_LEN, 12, 32, 1),
  jacket: (() => { // the capsule's lower profile, a hair wider, flaring at the hem, up to the collar
    const pts = [], r = BODY_R + 0.01, half = BODY_LEN / 2;
    for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r * (1 + (i < 4 ? 0 : 0.015)), -half + Math.sin(a) * r)); }
    pts.push(new THREE.Vector2(r, COLLAR - BODY_Y));
    return new THREE.LatheGeometry(pts, 32);
  })(),
  eye: new THREE.SphereGeometry(0.055, 18, 14),
  shine: new THREE.SphereGeometry(0.014, 8, 6),
  shine2: new THREE.SphereGeometry(0.007, 6, 4),
  brow: new THREE.CapsuleGeometry(0.011, 0.05, 4, 8),
  smile: new THREE.TorusGeometry(0.04, 0.009, 6, 16, Math.PI * 0.8),
  blush: new THREE.CircleGeometry(0.035, 16),
  sleeve: new THREE.CapsuleGeometry(0.075, 0.18, 6, 14),
  cuff: new THREE.TorusGeometry(0.068, 0.02, 8, 18),
  palm: new THREE.SphereGeometry(0.075, 16, 12),
  finger: new THREE.CapsuleGeometry(0.026, 0.05, 4, 8),
  thumb: new THREE.CapsuleGeometry(0.028, 0.04, 4, 8),
  leg: new THREE.CapsuleGeometry(0.085, 0.1, 6, 12),
  shoe: new THREE.SphereGeometry(0.09, 14, 10),
  shadow: new THREE.PlaneGeometry(0.9, 0.9),
  bubble: new THREE.SphereGeometry(0.035, 8, 6),
  xbar: new THREE.BoxGeometry(0.11, 0.024, 0.02),
};
const V = (() => { const s = new THREE.Shape(); s.moveTo(-0.12, 0.0); s.lineTo(0.12, 0.0); s.lineTo(0, -0.22); s.closePath(); return new THREE.ShapeGeometry(s); })();

// A cartoon glove: round palm, three fat fingers and a thumb. curl 0 = open, 1 = fist.
export function makeGlove(mat, side = 1, scale = 1) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(G.palm, mat); palm.scale.set(1, 0.8, 1.05); g.add(palm);
  const fingers = [];
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group(); pivot.position.set((i - 1) * 0.045, -0.035, 0.05); g.add(pivot);
    const f = new THREE.Mesh(G.finger, mat); f.position.set(0, -0.035, 0); pivot.add(f);
    pivot.rotation.x = 0.4; fingers.push(pivot);
  }
  const tp = new THREE.Group(); tp.position.set(side * 0.065, 0.0, 0.03); g.add(tp);
  const th = new THREE.Mesh(G.thumb, mat); th.position.set(0, -0.03, 0); tp.add(th);
  tp.rotation.z = side * 0.7; tp.rotation.x = 0.3;
  g.scale.setScalar(scale);
  g.userData = { fingers, thumb: tp, side, curl(c) { fingers.forEach((p, i) => { p.rotation.x = 0.4 + c * (1.6 + i * 0.05); }); tp.rotation.x = 0.3 + c * 0.6; } };
  return g;
}

export function makeHat(kind, color) {
  const g = new THREE.Group();
  const felt = toy(new THREE.Color(color).multiplyScalar(0.55));
  const band = shared.black;
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  const cyl = (rt, rb, h, m, y, s = 24) => add(new THREE.CylinderGeometry(rt, rb, h, s), m, 0, y, 0);
  const sphCap = (r, m) => new THREE.SphereGeometry(r, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  switch (kind) {
    case 'tophat': cyl(0.31, 0.31, 0.025, felt, 0.0); cyl(0.2, 0.19, 0.38, felt, 0.2); cyl(0.193, 0.193, 0.06, band, 0.05); break;
    case 'fedora': {
      cyl(0.34, 0.34, 0.02, felt, 0); const c = cyl(0.17, 0.21, 0.2, felt, 0.1); c.scale.z = 0.9;
      cyl(0.205, 0.212, 0.05, band, 0.035);
      const dent = add(sphCap(0.17), felt, 0, 0.18, 0); dent.scale.set(1, 0.35, 0.9);
      break;
    }
    case 'cowboy': {
      add(new THREE.LatheGeometry([[0, 0], [0.25, 0], [0.37, 0.06], [0.39, 0.09], [0.37, 0.07], [0.25, 0.02], [0, 0.02]].map(p => new THREE.Vector2(...p)), 28), felt);
      const c = cyl(0.16, 0.2, 0.21, felt, 0.11); c.scale.x = 0.85; cyl(0.2, 0.205, 0.04, band, 0.04);
      break;
    }
    case 'beret': { const b = add(new THREE.SphereGeometry(0.3, 20, 12), felt, 0.03, 0.04, 0); b.scale.set(1, 0.32, 1); b.rotation.z = -0.2; cyl(0.015, 0.015, 0.06, felt, 0.13); break; }
    case 'bowler': {
      const d = add(sphCap(0.23), felt, 0, 0.02, 0); d.scale.y = 0.95;
      const brim = add(new THREE.TorusGeometry(0.26, 0.03, 8, 28), felt); brim.rotation.x = Math.PI / 2; brim.scale.z = 0.5;
      cyl(0.232, 0.232, 0.04, band, 0.04); break;
    }
    case 'visor': {
      const ring = add(new THREE.TorusGeometry(0.29, 0.02, 6, 28), shared.visor, 0, -0.04, 0); ring.rotation.x = Math.PI / 2;
      const v = add(new THREE.CylinderGeometry(0.35, 0.35, 0.012, 24, 1, false, -Math.PI / 2.4, Math.PI / 1.2), shared.visor, 0, -0.03, 0.06); v.rotation.x = -0.2;
      break;
    }
    case 'crown': {
      cyl(0.2, 0.2, 0.12, shared.gold, 0.05, 24);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(new THREE.ConeGeometry(0.04, 0.1, 8), shared.gold, Math.cos(a) * 0.19, 0.15, Math.sin(a) * 0.19); add(new THREE.SphereGeometry(0.022, 8, 6), shared.jewel, Math.cos(a) * 0.205, 0.06, Math.sin(a) * 0.205); }
      break;
    }
    case 'beanie': {
      add(sphCap(0.325), felt, 0, -0.08, 0);
      const cuff = add(new THREE.TorusGeometry(0.32, 0.05, 8, 28), toy(0xf3ead8), 0, -0.06, 0); cuff.rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.08, 12, 10), toy(0xf3ead8), 0, 0.25, 0);
      break;
    }
    case 'cap': { // a baseball cap, worn forwards
      const d = add(sphCap(0.3), felt, 0, -0.07, 0); d.scale.y = 0.75;
      const bill = add(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 24, 1, false, -Math.PI / 2, Math.PI), felt, 0, -0.05, 0.2); bill.scale.set(1, 1, 0.9); bill.rotation.x = -0.12;
      add(new THREE.SphereGeometry(0.025, 8, 6), toy(0xffffff), 0, 0.16, 0);
      break;
    }
    case 'party': {
      const c = add(new THREE.ConeGeometry(0.15, 0.4, 24), toy(0xff3fa4), 0.03, 0.12, 0); c.rotation.z = -0.15;
      add(new THREE.SphereGeometry(0.05, 10, 8), toy(0xffd040), 0.06, 0.33, 0);
      for (let i = 0; i < 3; i++) { const r = add(new THREE.TorusGeometry(0.12 - i * 0.035, 0.012, 6, 20), toy(0xffd040), 0.03 + i * 0.012, i * 0.1 + 0.0, 0); r.rotation.x = Math.PI / 2; }
      break;
    }
    case 'pirate': {
      const h = add(new THREE.CylinderGeometry(0.3, 0.32, 0.18, 3, 1), shared.black, 0, 0.06, 0); h.rotation.y = Math.PI / 6; h.scale.set(1.2, 1, 0.8);
      add(new THREE.SphereGeometry(0.06, 10, 8), shared.white, 0, 0.1, 0.2);
      break;
    }
    case 'flower': { // a big flower tucked over one eye
      add(new THREE.SphereGeometry(0.05, 10, 8), toy(0xffd040), 0.17, -0.04, 0.17);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, p = add(new THREE.SphereGeometry(0.05, 10, 8), shared.petal, 0.17 + Math.cos(a) * 0.07, -0.04 + Math.sin(a) * 0.07, 0.17); p.scale.set(1, 1, 0.5); }
      break;
    }
    case 'propeller': {
      const d = add(sphCap(0.3), felt, 0, -0.07, 0); d.scale.y = 0.6;
      cyl(0.012, 0.012, 0.12, shared.metal, 0.12);
      const prop = new THREE.Group(); prop.position.y = 0.18; g.add(prop);
      for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.05), toy(s > 0 ? 0xff3a3a : 0x3a8aff)); b.position.x = s * 0.11; prop.add(b); }
      g.userData.spin = prop;
      break;
    }
    case 'chef': {
      cyl(0.24, 0.22, 0.14, shared.white, 0.03);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(new THREE.SphereGeometry(0.13, 14, 10), shared.white, Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.1); }
      add(new THREE.SphereGeometry(0.14, 14, 10), shared.white, 0, 0.26, 0);
      break;
    }
    case 'headphones': {
      const band2 = add(new THREE.TorusGeometry(0.31, 0.022, 8, 28, Math.PI), shared.metal, 0, -0.12, 0); band2.rotation.y = Math.PI / 2;
      for (const s of [-1, 1]) { const cup = add(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 18), toy(0xff3fa4), s * 0.31, -0.14, 0); cup.rotation.z = Math.PI / 2; }
      break;
    }
    case 'sombrero': {
      add(new THREE.LatheGeometry([[0, 0], [0.3, 0], [0.5, 0.04], [0.52, 0.08], [0.49, 0.06], [0.3, 0.02], [0, 0.02]].map(p => new THREE.Vector2(...p)), 32), toy(0xe8c46a));
      const c = cyl(0.12, 0.2, 0.26, toy(0xe8c46a), 0.13); void c;
      const r = add(new THREE.TorusGeometry(0.2, 0.025, 6, 24), toy(0xe0303a), 0, 0.05, 0); r.rotation.x = Math.PI / 2;
      break;
    }
    // The hats of the second sixteen (players 17-32). Each is also the size and seat its generated model is fitted to.
    case 'captain': { // a ship captain's cap: white top, black band and peak, gold badge
      cyl(0.22, 0.21, 0.08, band, 0.03);
      const top = add(new THREE.CylinderGeometry(0.27, 0.23, 0.07, 28), shared.white, 0, 0.1, 0); top.scale.z = 0.95;
      const peak = add(new THREE.CylinderGeometry(0.18, 0.18, 0.015, 24, 1, false, -Math.PI / 2, Math.PI), band, 0, 0.0, 0.13); peak.scale.z = 0.75; peak.rotation.x = 0.25;
      add(new THREE.SphereGeometry(0.035, 10, 8), shared.gold, 0, 0.07, 0.215).scale.z = 0.4;
      break;
    }
    case 'viking': { // a horned helmet
      const d = add(sphCap(0.28), toy(0x9aa0a8), 0, -0.06, 0); d.scale.y = 0.85;
      const rim = add(new THREE.TorusGeometry(0.28, 0.025, 8, 28), toy(0x6a4a2a), 0, -0.05, 0); rim.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) { const h = add(new THREE.ConeGeometry(0.055, 0.26, 12), toy(0xf3ead8), s * 0.33, 0.1, 0); h.rotation.z = -s * 0.9; }
      break;
    }
    case 'wizard': { // a tall pointed hat with a brim and gold stars
      const blue = toy(0x23285a);
      cyl(0.33, 0.33, 0.02, blue, 0);
      const c = add(new THREE.ConeGeometry(0.19, 0.5, 24), blue, 0, 0.26, -0.02); c.rotation.x = -0.15;
      for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.022, 6, 4), shared.gold, Math.cos(i * 2.2) * (0.15 - i * 0.03), 0.08 + i * 0.09, Math.sin(i * 2.2) * (0.15 - i * 0.03) + 0.02);
      break;
    }
    case 'mortarboard': { // a graduation cap: skull cap, square board, gold tassel
      cyl(0.21, 0.23, 0.12, shared.black, 0.0);
      add(new THREE.BoxGeometry(0.6, 0.025, 0.6), shared.black, 0, 0.075, 0);
      add(new THREE.SphereGeometry(0.025, 8, 6), shared.gold, 0, 0.095, 0);
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), shared.gold, 0.2, 0.0, 0.0);
      add(new THREE.CylinderGeometry(0.02, 0.03, 0.07, 8), shared.gold, 0.2, -0.12, 0);
      break;
    }
    case 'jester': { // three floppy points with bells
      cyl(0.24, 0.25, 0.07, toy(0x7a2a9a), 0.0);
      const cols = [0xf2c230, 0x1fb5b0, 0x7a2a9a];
      [-1, 0, 1].forEach((s, i) => {
        const c = add(new THREE.ConeGeometry(0.1, 0.32, 14), toy(cols[i]), s * 0.2, 0.17, s ? 0 : -0.05); c.rotation.z = -s * 1.05;
        add(new THREE.SphereGeometry(0.04, 10, 8), shared.gold, s * 0.36, s ? 0.24 : 0.35, s ? 0 : -0.05);
      });
      break;
    }
    case 'bow': { // a big satin hair bow
      const pink = toy(0xff4fa0);
      for (const s of [-1, 1]) { const l = add(new THREE.SphereGeometry(0.13, 16, 12), pink, s * 0.15, 0.07, 0); l.scale.set(1.25, 0.8, 0.45); l.rotation.z = s * 0.25; }
      add(new THREE.SphereGeometry(0.055, 12, 10), pink, 0, 0.06, 0.01);
      break;
    }
    case 'deerstalker': { // a tweed cap with a peak at the front and the back
      const tweed = toy(0x8a6a44);
      const d = add(sphCap(0.27), tweed, 0, -0.07, 0); d.scale.y = 0.85;
      for (const s of [-1, 1]) { const p = add(new THREE.CylinderGeometry(0.16, 0.16, 0.015, 20, 1, false, -Math.PI / 2, Math.PI), tweed, 0, -0.04, s * 0.2); p.scale.z = 0.6; if (s < 0) p.rotation.y = Math.PI; }
      add(new THREE.SphereGeometry(0.035, 8, 6), tweed, 0, 0.17, 0);
      break;
    }
    case 'nightcap': { // a long striped nightcap flopping to one side, with a pompom
      const blue = toy(0x6a8ad8);
      add(sphCap(0.29), blue, 0, -0.08, 0).scale.y = 0.55;
      const c = add(new THREE.ConeGeometry(0.17, 0.42, 18), blue, 0.14, 0.15, 0); c.rotation.z = -1.1;
      add(new THREE.SphereGeometry(0.06, 10, 8), shared.white, 0.35, 0.22, 0);
      break;
    }
    case 'plume': { // a wide cavalier hat with a big feather
      const purple = toy(0x4a2a6a);
      const brim = add(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 28), purple, 0, 0, 0); brim.rotation.z = 0.12;
      cyl(0.18, 0.2, 0.15, purple, 0.08);
      const f = add(new THREE.SphereGeometry(0.1, 12, 10), shared.white, -0.12, 0.2, -0.05); f.scale.set(0.55, 2.1, 0.4); f.rotation.z = 0.7;
      break;
    }
    case 'bunny': { // a headband with two tall ears
      const brown = toy(0x8a5a3a);
      add(new THREE.TorusGeometry(0.29, 0.02, 6, 24, Math.PI), brown, 0, -0.24, 0);
      for (const s of [-1, 1]) {
        const e = add(new THREE.SphereGeometry(0.075, 14, 10), brown, s * 0.1, 0.25, 0); e.scale.set(0.8, 3, 0.35); e.rotation.z = -s * 0.15;
        const i2 = add(new THREE.SphereGeometry(0.05, 12, 8), toy(0xff9ac0), s * 0.1, 0.25, 0.02); i2.scale.set(0.8, 3, 0.3); i2.rotation.z = -s * 0.15;
      }
      break;
    }
    case 'ushanka': { // a fur trapper hat, the ear flaps down
      const fur = toy(0xe8e4dc);
      const d = add(sphCap(0.3), toy(0x8a8f99), 0, -0.07, 0); d.scale.y = 0.75;
      const roll = add(new THREE.TorusGeometry(0.3, 0.06, 10, 28), fur, 0, -0.05, 0); roll.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.07, 0.2, 0.18), fur, s * 0.31, -0.16, 0).rotation.z = s * 0.1;
      break;
    }
    case 'hardhat': { // a yellow hard hat with a ridge
      const yel = toy(0xf2c230);
      const d = add(sphCap(0.27), yel, 0, -0.04, 0); d.scale.y = 0.95;
      add(new THREE.CylinderGeometry(0.32, 0.33, 0.02, 28), yel, 0, -0.04, 0.02);
      add(new THREE.TorusGeometry(0.26, 0.025, 6, 20, Math.PI), yel, 0, -0.04, 0).rotation.y = Math.PI / 2;
      break;
    }
    case 'fez': { // a red fez with a black tassel
      cyl(0.15, 0.19, 0.22, toy(0xc8202a), 0.09);
      add(new THREE.CylinderGeometry(0.007, 0.007, 0.14, 6), shared.black, 0.1, 0.16, 0).rotation.z = -0.9;
      add(new THREE.CylinderGeometry(0.018, 0.03, 0.08, 8), shared.black, 0.19, 0.07, 0);
      break;
    }
    case 'umbrella': { // a little red umbrella on a headband
      add(new THREE.TorusGeometry(0.29, 0.02, 6, 24, Math.PI), shared.black, 0, -0.24, 0);
      cyl(0.012, 0.012, 0.24, shared.metal, 0.12);
      add(new THREE.ConeGeometry(0.42, 0.14, 8), toy(0xe0303a), 0, 0.29, 0);
      add(new THREE.SphereGeometry(0.02, 6, 4), shared.metal, 0, 0.37, 0);
      break;
    }
    case 'catears': { // a headband with two pointed cat ears
      const k = toy(0x2a2228);
      add(new THREE.TorusGeometry(0.29, 0.02, 6, 24, Math.PI), k, 0, -0.24, 0);
      for (const s of [-1, 1]) {
        const e = add(new THREE.ConeGeometry(0.09, 0.17, 4), k, s * 0.15, 0.08, 0); e.rotation.z = -s * 0.25; e.scale.z = 0.45;
        const i2 = add(new THREE.ConeGeometry(0.05, 0.1, 4), toy(0xff9ac0), s * 0.15, 0.07, 0.025); i2.rotation.z = -s * 0.25; i2.scale.z = 0.3;
      }
      break;
    }
    case 'bucket': { // a floppy bucket hat in a bright print
      const c = toy(0xf08a3a);
      cyl(0.2, 0.23, 0.15, c, 0.07);
      add(new THREE.LatheGeometry([[0.2, 0.02], [0.36, -0.06], [0.37, -0.075], [0.35, -0.07], [0.2, 0.0]].map(p => new THREE.Vector2(...p)), 28), c);
      add(sphCap(0.2), c, 0, 0.13, 0).scale.y = 0.25;
      break;
    }
    default: break;
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// One gambler. update() poses it from the view each frame.
export class Bean {
  constructor({ color, hat, name, dealer = false }) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const suit = toy(color), skin = toy(SKIN);
    this.mats = { suit, skin, base: new THREE.Color(color), skinBase: new THREE.Color(SKIN) };
    const add = (geo, mat, x, y, z, parent = this.body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    add(G.body, skin, 0, BODY_Y, 0);
    add(G.jacket, suit, 0, BODY_Y, 0);
    // shirt front, lapels, bow tie, pocket square, buttons
    const v = add(V, shared.shirt, 0, COLLAR + 0.005, BODY_R + 0.013); v.rotation.x = -0.05;
    const lapel = toy(new THREE.Color(color).multiplyScalar(0.62));
    for (const s of [-1, 1]) { const l = add(new THREE.BoxGeometry(0.035, 0.22, 0.014), lapel, s * 0.06, COLLAR - 0.1, BODY_R + 0.017); l.rotation.z = s * 0.45; }
    const tieMat = dealer ? shared.red : shared.black;
    for (const s of [-1, 1]) { const b = add(new THREE.ConeGeometry(0.04, 0.08, 10), tieMat, s * 0.04, COLLAR - 0.005, BODY_R + 0.032); b.rotation.z = s * Math.PI / 2; }
    add(new THREE.SphereGeometry(0.02, 8, 6), tieMat, 0, COLLAR - 0.005, BODY_R + 0.04);
    const sq = add(new THREE.BoxGeometry(0.05, 0.03, 0.01), dealer ? shared.red : shared.white, 0.15, COLLAR - 0.17, BODY_R - 0.035); sq.rotation.set(-0.1, 0.45, 0.15);
    for (let i = 0; i < 2; i++) add(new THREE.SphereGeometry(0.015, 8, 6), shared.gold, 0, COLLAR - 0.28 - i * 0.09, BODY_R + 0.008);
    // the face: eyes in a group so they can glance; brows, smile, blush
    this.face = new THREE.Group(); this.face.position.y = BODY_Y + 0.25; this.body.add(this.face);
    this.eyeDots = []; this.xEyes = []; this.brows = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(G.eye, shared.eye); e.position.set(s * 0.095, 0.0, 0.272); e.scale.set(0.82, 1.3, 0.55); this.face.add(e); this.eyeDots.push(e);
      const sh = new THREE.Mesh(G.shine, shared.shine); sh.position.set(s * 0.095 + 0.016, 0.03, 0.302); this.face.add(sh); this.eyeDots.push(sh);
      const sh2 = new THREE.Mesh(G.shine2, shared.shine); sh2.position.set(s * 0.095 - 0.012, -0.02, 0.302); this.face.add(sh2); this.eyeDots.push(sh2);
      const x = new THREE.Group(); x.position.set(s * 0.095, 0, 0.29);
      for (const r of [0.8, -0.8]) { const b = new THREE.Mesh(G.xbar, shared.eye); b.rotation.z = r; x.add(b); }
      x.visible = false; this.face.add(x); this.xEyes.push(x);
      const br = new THREE.Mesh(G.brow, shared.brow); br.position.set(s * 0.095, 0.105, 0.262); br.rotation.set(-0.25, 0, Math.PI / 2 + s * 0.15); this.face.add(br); this.brows.push(br);
      const bl = new THREE.Mesh(G.blush, shared.blush); bl.position.set(s * 0.165, -0.075, 0.232); bl.rotation.y = s * 0.55; bl.scale.y = 0.6; this.face.add(bl);
    }
    this.mouth = new THREE.Mesh(G.smile, shared.mouth); this.mouth.position.set(0, -0.085, 0.272); this.mouth.rotation.set(-0.2, 0, Math.PI + Math.PI * 0.1); this.face.add(this.mouth);
    // arms with cartoon gloves
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * (BODY_R + 0.02), BODY_Y + 0.03, 0); this.body.add(pivot);
      const a = new THREE.Mesh(G.sleeve, suit); a.position.y = -0.13; pivot.add(a);
      const cuff = new THREE.Mesh(G.cuff, shared.glove); cuff.position.y = -0.26; cuff.rotation.x = Math.PI / 2; pivot.add(cuff);
      const hand = new THREE.Group(); hand.position.y = -0.33; pivot.add(hand);
      const glove = makeGlove(shared.glove, -s, 0.95); glove.rotation.set(0, s * 0.3, 0); hand.add(glove);
      pivot.rotation.z = s * 0.28;
      this.arms.push({ pivot, hand, glove, s });
    }
    this.rightHand = this.arms[1].hand;
    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.13, 0.26, 0); this.body.add(pivot);
      const l = new THREE.Mesh(G.leg, shared.pants); l.position.y = -0.1; pivot.add(l);
      const sh = new THREE.Mesh(G.shoe, shared.shoe); sh.position.set(0, -0.2, 0.045); sh.scale.set(1, 0.6, 1.45); pivot.add(sh);
      this.legs.push(pivot);
    }
    // hat
    this.hat = makeHat(hat, color); this.hat.position.y = BODY_Y + BODY_LEN / 2 + BODY_R - 0.06; this.body.add(this.hat);
    this.body.traverse(o => { if (o.isMesh && o.material !== shared.blush) o.castShadow = true; });
    // contact shadow, lucky glow, poison bubbles
    this.shadow = new THREE.Mesh(G.shadow, shared.shadow); this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.01; this.root.add(this.shadow);
    this.luckyRing = new THREE.Mesh(G.shadow, shared.lucky); this.luckyRing.rotation.x = -Math.PI / 2; this.luckyRing.position.y = 0.02; this.luckyRing.scale.setScalar(1.4); this.luckyRing.visible = false; this.root.add(this.luckyRing);
    this.bubbles = [];
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(G.bubble, shared.bubble); b.visible = false; this.root.add(b); this.bubbles.push(b); }
    this.label = null; this.labelKey = '';
    if (name) this.setLabel(name, '#f3ead8');
    this.phase = Math.random() * 10; this.walk = 0; this.yaw = 0; this.eyeYaw = 0; this.seatBlend = 0; this.dead = false; this.blinkT = 2 + Math.random() * 3;
  }
  setLabel(text, color) {
    const key = text + color; if (key === this.labelKey) return; this.labelKey = key;
    if (this.label) { this.root.remove(this.label); this.label.material.map.dispose(); this.label.material.dispose(); }
    this.label = T.textSprite(text, { color, size: 40, h: 0.055, screen: true }); this.label.position.y = 1.98; this.root.add(this.label);
  }
  setDead(on) {
    this.dead = on;
    this.eyeDots.forEach(e => { e.visible = !on; }); this.xEyes.forEach(x => { x.visible = on; });
    this.mouth.rotation.z = on ? Math.PI * 0.1 : Math.PI + Math.PI * 0.1;
    if (this.label) this.label.visible = !on;
  }
  // s: { x, z, face, look, moving, seated, pale, lucky, t, dt }
  update(s) {
    const dt = Math.min(0.1, s.dt || 0.016);
    this.root.position.set(s.x, 0, s.z);
    if (this.dead) {
      this.body.rotation.set(-Math.PI / 2 + 0.05, 0, 0.25); this.body.position.set(0, 0.3, 0.7);
      this.root.rotation.y = s.face; this.shadow.scale.set(1, 2, 1);
      this.arms.forEach(a => { a.pivot.rotation.x = 0; a.pivot.rotation.z = a.s * 1.3; a.glove.userData.curl(0); });
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
    this.face.rotation.y = this.eyeYaw * 0.8;
    // blink
    this.blinkT -= dt; if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4;
    const bl = this.blinkT < 0 ? 0.12 : 1;
    this.eyeDots[0].scale.y = this.eyeDots[3].scale.y = 1.3 * bl;
    this.seatBlend += ((s.seated ? 1 : 0) - this.seatBlend) * Math.min(1, dt * 10);
    this.walk += ((s.moving ? 1 : 0) - this.walk) * Math.min(1, dt * 8);
    this.phase += dt * 11 * (0.3 + this.walk);
    const sw = Math.sin(this.phase) * this.walk;
    const sb = this.seatBlend;
    this.body.position.set(0, Math.abs(Math.cos(this.phase)) * 0.05 * this.walk + Math.sin(s.t * 2 + this.phase) * 0.006, 0);
    this.body.rotation.set(0, 0, sw * 0.07);
    this.legs.forEach((l, i) => { l.rotation.x = (i ? sw : -sw) * 0.7 - sb * 1.45; l.rotation.z = 0; });
    this.arms.forEach((a, i) => {
      a.pivot.rotation.x = (i ? -sw : sw) * 0.6 - sb * 0.9 + (this.holding && i === 1 ? -0.9 : 0);
      a.pivot.rotation.z = a.s * (0.28 - sb * 0.15);
      a.glove.userData.curl(this.holding && i === 1 ? 0.8 : 0.25 + Math.sin(s.t + i) * 0.05);
    });
    this.body.scale.set(1, 1 + Math.sin(s.t * 2.2 + this.phase) * 0.008, 1);
    if (this.hat.userData.spin) this.hat.userData.spin.rotation.y += dt * (4 + this.walk * 20);
    // poisoned: going green, bubbles over the head
    const pale = s.pale ? 0.55 + Math.sin(s.t * 4) * 0.1 : 0;
    if (pale || this.wasPale) this.mats.skin.color.copy(this.mats.skinBase).lerp(SICK, pale); this.wasPale = pale > 0;
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
    if (this.label) this.label.position.y = 1.98 + sb * 0.3;
  }
}
