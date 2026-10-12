// First-person plush hands, drawn in their own pass on top of the world so they never clip into walls.
import * as THREE from 'three';
import * as T from './textures.js';
import { makeGlass, setFill } from './items.js';

const plush = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.75, sheen: 0.8, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffffff), ...extra });

export class Hands {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xffe8c8, 0x401820, 0.7); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffe0b0, 0.8); this.key.position.set(0.5, 1, 0.4); this.scene.add(this.key);
    this.rig = new THREE.Group(); this.camera.add(this.rig);
    this.gloveMat = plush(0xe8e2d8); this.sleeveMat = plush(0x888888); this.cuffMat = plush(0xfbf8f2);
    const glove = new THREE.SphereGeometry(0.075, 18, 14), thumb = new THREE.SphereGeometry(0.034, 12, 10);
    const sleeve = new THREE.CylinderGeometry(0.06, 0.07, 0.4, 16), cuff = new THREE.TorusGeometry(0.058, 0.016, 8, 20);
    this.hand = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const sl = new THREE.Mesh(sleeve, this.sleeveMat); sl.rotation.x = Math.PI / 2 - 0.25; sl.position.set(0, -0.05, 0.22); g.add(sl);
      const cf = new THREE.Mesh(cuff, this.cuffMat); cf.position.set(0, 0, 0.04); g.add(cf);
      const gl = new THREE.Mesh(glove, this.gloveMat); gl.scale.set(1, 0.85, 1.15); g.add(gl);
      const th = new THREE.Mesh(thumb, this.gloveMat); th.position.set(-s * 0.06, 0.035, -0.03); g.add(th);
      const hold = new THREE.Group(); hold.position.set(-s * 0.01, 0.02, -0.05); g.add(hold);
      g.userData = { s, hold, base: new THREE.Vector3(s * 0.27, -0.27, -0.45) };
      g.position.copy(g.userData.base);
      this.rig.add(g); this.hand.push(g);
    }
    this.left = this.hand[0]; this.right = this.hand[1];
    this.glass = null; this.glassKey = '';
    // cards for blackjack, a vial for the killer
    this.cards = new THREE.Group();
    [['A♠', false, -0.03, 0.1], ['K♥', true, 0.03, -0.1]].forEach(([l, red, x, r]) => {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.13), new THREE.MeshStandardMaterial({ map: T.cardTex(l, red), roughness: 0.6, side: THREE.DoubleSide }));
      c.position.set(x, 0.07, 0.01); c.rotation.z = r; this.cards.add(c);
    });
    this.cards.rotation.x = -0.3; this.left.userData.hold.add(this.cards); this.cards.visible = false;
    this.vial = new THREE.Group();
    const vg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05 }));
    const vl = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0x7dff5a, emissive: 0x40c020, emissiveIntensity: 1.5 }));
    vl.position.y = -0.012; const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0x8a5835 })); cork.position.y = 0.055;
    this.vial.add(vg, vl, cork); this.vial.position.set(0, 0.06, -0.02); this.vial.visible = false; this.left.userData.hold.add(this.vial);
    this.knife = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.16, 4), new THREE.MeshStandardMaterial({ color: 0xdde2e6, metalness: 1, roughness: 0.2 }));
    blade.rotation.x = -Math.PI / 2; blade.position.z = -0.1; blade.scale.x = 0.4;
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0x3a2214 })); hilt.rotation.x = Math.PI / 2;
    this.knife.add(blade, hilt); this.knife.visible = false; this.right.userData.hold.add(this.knife);
    this.anim = null; this.t = 0; this.bob = 0;
  }
  setSuit(color) { this.sleeveMat.color.set(color); }
  play(kind) { this.anim = { kind, t: 0, dur: { sip: 1.0, poison: 1.1, stab: 0.5, crunch: 0.8, coin: 0.45, click: 0.3 }[kind] || 0.5 }; }
  setAspect(a, fov) { this.camera.aspect = a; this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  // s: { drink: {kind, color, sips} | null held, seated, game, moving, ghost, dt, t, light }
  update(s) {
    const dt = s.dt; this.t += dt;
    this.rig.visible = !s.hidden;
    if (s.hidden) return;
    this.gloveMat.opacity = this.sleeveMat.opacity = this.cuffMat.opacity = s.ghost ? 0.35 : 1;
    this.gloveMat.transparent = this.sleeveMat.transparent = this.cuffMat.transparent = !!s.ghost;
    this.hemi.intensity = 0.7 * s.light; this.key.intensity = 0.8 * s.light;
    // drink in the right hand
    const key = s.drink ? s.drink.kind + s.drink.color : '';
    if (key !== this.glassKey) {
      if (this.glass) this.right.userData.hold.remove(this.glass);
      this.glass = s.drink ? makeGlass(s.drink.kind, s.drink.color) : null;
      if (this.glass) { this.glass.scale.setScalar(0.9); this.glass.position.set(0, -0.02, 0); this.right.userData.hold.add(this.glass); }
      this.glassKey = key;
    }
    if (this.glass) setFill(this.glass, s.drink.sips / 4);
    this.cards.visible = s.seated && s.game === 'bj';
    this.bob += dt * (s.moving ? 9 : 2);
    const amp = s.moving ? 0.018 : 0.004;
    for (const h of this.hand) {
      const b = h.userData.base, sd = h.userData.s;
      h.position.set(b.x + Math.cos(this.bob * 0.5) * amp * sd, b.y + Math.abs(Math.sin(this.bob * 0.5)) * amp * 1.5, b.z);
      h.rotation.set(0, sd * -0.15, sd * 0.1);
    }
    if (s.seated) { this.left.position.y += 0.04; this.right.position.y += 0.02; this.left.position.x += 0.04; this.right.position.x -= 0.03; }
    if (!this.glass && !s.seated) { this.right.position.y -= 0.06; }
    this.vial.visible = false; this.knife.visible = false;
    if (this.anim) {
      const a = this.anim; a.t += dt; const p = Math.min(1, a.t / a.dur), k = Math.sin(p * Math.PI);
      if (a.kind === 'sip') { this.right.position.x -= 0.22 * k; this.right.position.y += 0.18 * k; this.right.position.z += 0.12 * k; this.right.rotation.x = 1.0 * k; }
      else if (a.kind === 'poison') { this.vial.visible = true; this.left.position.x += 0.16 * k; this.left.position.y += 0.08 * k; this.left.position.z -= 0.15 * k; this.left.rotation.z = -1.6 * Math.max(0, Math.sin(Math.min(1, p * 1.6) * Math.PI)); }
      else if (a.kind === 'stab') { this.knife.visible = true; this.right.position.z -= 0.3 * k; this.right.position.x -= 0.1 * k; }
      else if (a.kind === 'crunch') { this.left.position.x += 0.2 * k; this.left.position.y += 0.2 * k; this.left.position.z += 0.1 * k; }
      else if (a.kind === 'coin' || a.kind === 'click') { this.right.position.z -= 0.1 * k; this.right.position.y += 0.03 * k; }
      if (p >= 1) this.anim = null;
    }
  }
}
