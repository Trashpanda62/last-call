// First-person cartoon gloves, drawn in their own pass on top of the world so they never clip into walls.
import * as THREE from 'three';
import { makeGlass, setFill, freeGlass } from './items.js';
import { makeSnack, snackAssets } from './snacks.js';
import { makeGlove } from './chars.js';
import {makeFirstPersonGlove} from './hand-assets.js';
import { DRINKS } from '../config.js';

const toy = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff), clearcoat: 0.3, clearcoatRoughness: 0.4, ...extra });

export class Hands {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xfff0dc, 0x40202a, 0.55); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffe6c8, 0.75); this.key.position.set(0.6, 1, 0.5); this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight(0xff9ad0, 0.5); this.rim.position.set(-0.8, 0.3, -0.6); this.scene.add(this.rim);
    this.rig = new THREE.Group(); this.camera.add(this.rig);
    this.gloveMat = toy(0xe8e2d6); this.sleeveMat = toy(0x888888); this.cuffMat = toy(0xe8e2d6);
    const sleeve = new THREE.CylinderGeometry(0.07, 0.085, 0.45, 18), generatedSleeve = new THREE.LatheGeometry([new THREE.Vector2(.064, -.315), new THREE.Vector2(.07, -.325), new THREE.Vector2(.078, .325)], 24), cuff = new THREE.TorusGeometry(0.075, 0.024, 10, 24);
    this.hand = []; this.generatedMaterials = new Map(); this.ghostMaterials = new Set([this.gloveMat, this.sleeveMat, this.cuffMat]);
    for (const s of [-1, 1]) {
      const g = new THREE.Group(), generated = makeFirstPersonGlove(s, this.generatedMaterials);
      const sl = new THREE.Mesh(generated ? generatedSleeve : sleeve, this.sleeveMat); sl.rotation.x = Math.PI / 2 - 0.2; sl.position.set(0, -0.04, 0.27);
      sl.name = 'first-person-sleeve';
      if (generated) generated.userData.attachSleeve(sl); else g.add(sl);
      const cf = new THREE.Mesh(cuff, this.cuffMat); cf.position.set(0, -0.005, 0.06); cf.rotation.x = -0.2; if (!generated) g.add(cf);
      const glove = generated || makeGlove(this.gloveMat, s, 0.95); glove.rotation.set(Math.PI / 2 - 0.25, 0, s * -0.15); glove.position.set(0, 0, -0.02); g.add(glove);
      const hold = new THREE.Group(); hold.position.set(-s * 0.01, 0.03, -0.06); g.add(hold);
      g.userData = { s, hold, glove, base: new THREE.Vector3(s * 0.3, generated ? -.27 : -.34, -0.5) };
      g.position.copy(g.userData.base);
      this.rig.add(g); this.hand.push(g);
    }
    for (const m of this.generatedMaterials.values()) this.ghostMaterials.add(m);
    this.left = this.hand[0]; this.right = this.hand[1];
    this.snack = null; this.snackKey = null;
    this.glass = null; this.glassKey = '';
    this.itemMaterials = new WeakMap(); this.keptMaterials = new Set();
    this.inventory = new THREE.Group(); this.inventory.visible = false; this.scene.add(this.inventory);
    // a vial for the killer, and a knife
    this.vial = new THREE.Group();
    const vg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05 }));
    const vl = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 10), new THREE.MeshStandardMaterial({ color: 0x7dff5a, emissive: 0x40c020, emissiveIntensity: 1.5 }));
    vl.position.y = -0.012; const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0x8a5835 })); cork.position.y = 0.055;
    this.vial.add(vg, vl, cork); this.vial.position.set(0, this.left.userData.glove.userData.generated ? -.015 : .07, -0.02); this.vial.visible = false; this.left.userData.hold.add(this.vial);
    this.knife = new THREE.Group();
    const edge = new THREE.Shape(); edge.moveTo(-.022, .04); edge.lineTo(-.022, .195); edge.quadraticCurveTo(.019, .17, .025, .085); edge.lineTo(.025, .04); edge.closePath();
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(edge, { depth: .004, bevelEnabled: true, bevelSize: .001, bevelThickness: .001, bevelSegments: 1, steps: 1 }), new THREE.MeshStandardMaterial({ color: 0xdde2e6, metalness: .45, roughness: .28 }));
    blade.rotation.x = -Math.PI / 2;
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0x3a2214 })); hilt.rotation.x = Math.PI / 2;
    this.knife.add(blade, hilt);
    if (this.right.userData.glove.userData.generated) { this.knife.rotation.x = .95; this.knife.position.set(.005, -.015, -.025); this.knife.scale.setScalar(1.25); }
    this.knife.visible = false; this.right.userData.hold.add(this.knife);
    // the shady guy's revolver, in the free left hand: up, BANG, a kick and a flash (Steve, 2026-10-15)
    this.gun = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.85, roughness: 0.35 }), wood = new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.6 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.12, 10), steel); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.035, -0.1);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 12), steel); drum.rotation.x = Math.PI / 2; drum.position.set(0, 0.03, -0.025);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.08), steel); frame.position.set(0, 0.04, -0.03);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.07, 0.03), wood); grip.position.set(0, -0.005, 0.02); grip.rotation.x = -0.35;
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.9 })); this.flash.position.set(0, 0.035, -0.18);
    this.gun.add(barrel, drum, frame, grip, this.flash); this.gun.scale.setScalar(1.8); this.gun.position.set(0.01, this.left.userData.glove.userData.generated ? -.01 : .05, -0.02); this.gun.visible = false; this.left.userData.hold.add(this.gun);
    this.anim = null; this.t = 0; this.bob = 0;
  }
  setSuit(color) { this.sleeveMat.color.set(color); }
  // World and hand scenes have different lighting. Separate material instances
  // retain each scene's shader selection while sharing all texture/geometry data.
  prepareItem(g) {
    const materialFor = m => {
      if (!this.itemMaterials.has(m)) {
        const copy = m.clone(); copy.onBeforeCompile = m.onBeforeCompile; copy.customProgramCacheKey = m.customProgramCacheKey;
        this.itemMaterials.set(m, copy); this.keptMaterials.add(copy);
      }
      return this.itemMaterials.get(m);
    };
    g.traverse(o => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map(materialFor) : materialFor(o.material); });
    return g;
  }
  prepareInventory() {
    const assets = snackAssets(); if (this.inventoryAssets === assets) return;
    this.inventory.clear(); this.inventoryAssets = assets;
    for (let kind = 0; kind < 3; kind++) this.inventory.add(this.prepareItem(makeSnack(kind, .22)));
    for (const { kind, color } of DRINKS) this.inventory.add(this.prepareItem(makeGlass(kind, color)));
  }
  setGhost(ghost) {
    for (const m of this.ghostMaterials) {
      m.opacity = ghost ? 0.35 : 1;
      if (m.transparent !== !!ghost) { m.transparent = !!ghost; m.depthWrite = !ghost; m.needsUpdate = true; }
    }
  }
  // at: a screen point (NDC) to reach for: the nearer hand pokes (or grabs, for a pull) toward it.
  play(kind, at) {
    this.anim = { kind, t: 0, dur: { sip: 1.0, poison: 1.1, stab: 0.5, shoot: 0.7, crunch: 0.8, coin: 0.45, click: 0.3, press: 0.38, pull: 0.65, throw: 0.6 }[kind] || 0.5 };
    if (at && kind !== 'throw' && kind !== 'sip') {
      // on a tall screen the hand stops further out, or it fills the narrow view
      const d = new THREE.Vector3(at.x, at.y, 0.5).unproject(this.camera).normalize(), k = (this.camera.aspect < 1 ? 0.72 : 0.52) / Math.max(0.3, -d.z);
      this.anim.to = d.multiplyScalar(k).add(new THREE.Vector3(0, -0.035, 0.11)); // the wrist sits behind the fingertip
      this.anim.hand = at.x < -0.12 ? this.left : this.right;
    }
  }
  setAspect(a, fov) { this.camera.aspect = a; this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  // s: { drink: {kind, color, sips} | null held, seated, game, moving, ghost, dt, t, light }
  update(s) {
    const dt = s.dt; this.t += dt;
    this.rig.visible = !s.hidden;
    if (s.hidden) return;
    // a ghost's mittens go see-through (switching transparency needs a new shader)
    this.setGhost(s.ghost);
    this.hemi.intensity = 0.55 * s.light; this.key.intensity = 0.75 * s.light; this.rim.intensity = 0.4 * s.light;
    // the drink in the right hand
    const key = s.drink ? s.drink.kind + s.drink.color : '';
    if (key !== this.glassKey) {
      if (this.glass) { this.right.userData.hold.remove(this.glass); freeGlass(this.glass, this.keptMaterials); }
      this.glass = s.drink ? this.prepareItem(makeGlass(s.drink.kind, s.drink.color)) : null;
      if (this.glass) { this.glass.scale.setScalar(0.85); this.glass.position.set(0, -0.03, 0); this.right.userData.hold.add(this.glass); }
      this.glassKey = key;
    }
    if (this.glass) setFill(this.glass, s.drink.sips / 4);
    this.bob += dt * (s.moving ? 9 : 2);
    const amp = s.moving ? 0.018 : 0.004;
    for (const h of this.hand) {
      const b = h.userData.base, sd = h.userData.s;
      h.position.set(b.x + Math.cos(this.bob * 0.5) * amp * sd, b.y + Math.abs(Math.sin(this.bob * 0.5)) * amp * 1.5, b.z);
      h.rotation.set(0, sd * -0.12, sd * 0.08);
      h.userData.glove.userData.curl(0.3 + Math.sin(this.t * 1.3 + sd) * 0.04);
    }
    if (this.glass) { this.right.userData.glove.userData.curl(0.75); this.right.userData.glove.userData.pose?.('drink'); }
    if (s.seated) { // hands rest low at the sides, out of the way of the table, and reach in to press things
      this.left.position.y -= this.left.userData.glove.userData.generated ? .04 : .09; this.right.position.y -= this.right.userData.glove.userData.generated ? .04 : .09; this.left.position.x -= 0.08; this.right.position.x += 0.08; this.left.position.z += 0.02; this.right.position.z += 0.02;
    }
    if (!this.glass && !s.seated) { this.right.position.y -= this.right.userData.glove.userData.generated ? .015 : .05; }
    this.vial.visible = false; this.knife.visible = false; this.gun.visible = false;
    if (this.anim) {
      const a = this.anim; a.t += dt; const p = Math.min(1, a.t / a.dur), k = Math.sin(p * Math.PI);
      if (a.to) { // reach: out to the point and back, finger out; a pull drags down at the end
        const h = a.hand, e = p < 0.45 ? Math.sin(p / 0.45 * Math.PI / 2) : Math.cos((p - 0.45) / 0.55 * Math.PI / 2);
        // the arm points from where the hand rests to the target, so the sleeve trails off the bottom of the view
        const fwd = Math.max(0.05, h.position.z - a.to.z);
        const pitch = Math.atan2(a.to.y - h.position.y, fwd); h.rotation.x += (h.userData.glove.userData.generated ? Math.min(.25, pitch) : pitch) * e; h.rotation.y -= Math.atan2(a.to.x - h.position.x, fwd) * e;
        h.position.lerp(a.to, e);
        if (a.kind === 'pull') { h.position.y -= Math.max(0, Math.sin((p - 0.35) / 0.65 * Math.PI)) * 0.12 * (p > 0.35 ? 1 : 0); h.userData.glove.userData.curl(0.95); }
        else h.userData.glove.userData.curl(0.25 + 0.5 * e);
      } else if (a.kind === 'sip') { // up to the mouth and tipped: you see the glass's side and base go by, not a disc of drink
        this.right.position.x -= 0.2 * k; this.right.position.y += 0.27 * k; this.right.position.z += 0.2 * k; this.right.rotation.x = 1.3 * k; this.right.rotation.z += 0.25 * k;
      }
      else if (a.kind === 'poison') { this.vial.visible = true; this.left.userData.glove.userData.pose?.('pinch'); this.left.position.x += 0.16 * k; this.left.position.y += 0.08 * k; this.left.position.z -= 0.15 * k; this.left.rotation.z = -1.6 * Math.max(0, Math.sin(Math.min(1, p * 1.6) * Math.PI)); }
      else if (a.kind === 'shoot') { // raised to the middle of the view, kicks up as it fires
        const up = Math.min(1, p * 5), kick = p > 0.2 ? Math.max(0, 1 - (p - 0.2) * 4) : 0;
        this.gun.visible = true; this.flash.visible = p > 0.2 && p < 0.3; this.flash.scale.setScalar(1 + Math.random());
        this.left.position.x += 0.2 * up * (1 - p * 0.5); this.left.position.y += 0.1 * up; this.left.position.z -= 0.18 * up; this.left.rotation.x = 0.5 * kick; this.left.userData.glove.userData.curl(1);
      }
      else if (a.kind === 'stab') { this.knife.visible = true; this.right.position.z -= 0.3 * k; this.right.position.x -= 0.1 * k; this.right.userData.glove.userData.curl(1); }
      else if (a.kind === 'crunch') { // visible food already owns the lift/chew motion below
        if (!(s.eating > 0)) { this.left.position.x += 0.2 * k; this.left.position.y += 0.2 * k; this.left.position.z += 0.1 * k; }
      }
      else if (a.kind === 'pull') { this.right.position.y -= 0.12 * k; this.right.position.x += 0.06 * k; this.right.userData.glove.userData.curl(0.9); }
      else if (a.kind === 'throw') { this.right.position.z -= 0.22 * k; this.right.position.y += 0.08 * k; this.right.rotation.x = -0.6 * k; this.right.userData.glove.userData.curl(1 - p); }
      else { this.right.position.z -= 0.12 * k; this.right.position.y += 0.02 * k; } // coin, click, press: a poke forward
      if (a.kind === 'coin') this.right.userData.glove.userData.pose?.('pinch');
      if (a.kind === 'click' || a.kind === 'press') (a.hand || this.right).userData.glove.userData.pose?.('point');
      if (a.kind === 'stab') this.right.userData.glove.userData.pose?.('knife');
      if (p >= 1) this.anim = null;
    }
    const foodKey = s.eating > 0 && !s.ghost ? `${s.snack}:${snackAssets()}` : null;
    if (foodKey !== this.snackKey) {
      this.snack?.parent?.remove(this.snack); this.snack = foodKey ? this.prepareItem(makeSnack(s.snack, .22)) : null; this.snackKey = foodKey;
      if (this.snack) { this.snack.userData.baseScale = this.snack.scale.x; this.snack.position.set(0, this.left.userData.glove.userData.generated ? -.005 : .025, -.015); this.left.userData.hold.add(this.snack); }
    }
    if (this.snack) {
      const age = 2.4 - s.eating, rise = Math.min(1, age / .24, s.eating / .3), chew = Math.sin(age * 24);
      this.left.position.x += .24 * rise; this.left.position.y += (.27 + Math.abs(chew) * .017) * rise; this.left.position.z += .2 * rise;
      this.left.rotation.x = .65 * rise; this.left.rotation.z -= chew * .045 * rise; this.left.userData.glove.userData.curl(.85); this.left.userData.glove.userData.pose?.('snack');
      this.snack.scale.setScalar(this.snack.userData.baseScale * Math.max(.25, 1 - Math.floor(age / .6) * .19));
    }
    // Raise the complete generated forearm from below the view. Keep the wrist
    // neutral instead of folding its bone to force the sleeve out of frame.
    for (const h of this.hand) if (h.userData.glove.userData.generated) h.rotation.x += .5;
  }
}
