// The blackout in 3D (sim.js doLights, Steve 2026-10-15): the breaker panels on the walls, everyone's flashlights, and
// the monster. The monster takes the killer's place in the same frame the snapshot says so, both ways: the frame the
// power comes back on, the monster is gone and the killer's own bean stands where it stood (render3d.js hides the bean
// while its char has the monster flag).
import * as THREE from 'three';
import { M, yawOf } from './world.js';
import { BREAKERS, STAFF_DOORS, roomOf } from '../map.js';
import { makeBean, loadClips, onPlushReady } from './plush.js';
import { hasProp, propObject, propScale, propInfo, onPropsReady } from './props.js';
import * as audio from '../audio.js';

let MOD = null; // ./monster.js (the Sorceress monster) once it has loaded; a giant dark bean stands in until then
import('./monster.js').then(m => m.preloadMonster().then(ok => { if (ok) MOD = m; })).catch(() => { /* not there: the stand-in */ });

onPlushReady(() => loadClips(['snatched'])); // the victim's clip in the monster's claws (flinch, flail, go limp)

const HAND = 1.05, BEAM_LEN = 7, OTHER_LIGHTS = 4;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// The stand-in: a bean two and a half times the size, near black, with red eyes that glow in the dark.
function standIn() {
  const b = makeBean({ color: '#1b1216', hat: null, name: '' });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xff2a10, toneMapped: false });
  for (const sx of [-0.09, 0.09]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), eyeM); e.position.set(sx, 0.92, 0.36); b.root.add(e); }
  b.root.scale.setScalar(2.4);
  return {
    obj: b.root,
    update(dt, s, at) { b.update({ ...at, moving: s.moving, seated: false, pale: false, lucky: false, dt }); b.root.scale.setScalar(2.4); if (s.killT >= 0) b.root.rotation.x = -Math.sin(Math.min(1, s.killT / 0.5) * Math.PI / 2) * 0.25; else b.root.rotation.x = s.leapT >= 0 && s.leapT < 0.6 ? Math.sin(s.leapT / 0.6 * Math.PI) * 0.5 : 0; },
    dispose() {},
  };
}

// The Sorceress panel on a breaker's group: 0.72 m tall, its back on the wall, centred on the group (1.35 m, chest
// height); the lever into its slot (right of centre, the lower middle) and the lamp onto its lamp (top left). The slot and
// the lamp are where the fitted model has them (tools/v4_props.py breaker, .dev/fit/breaker-front.png).
const PANEL_H = 0.72;
function fitPanel(p) {
  const sc = propScale('breaker', { fit: [0, PANEL_H, 0] }), [w, h, d] = propInfo('breaker').size.map((v, i) => v * [sc.x, sc.y, sc.z][i]);
  const o = propObject('breaker', { cast: false }); o.scale.copy(sc); o.position.set(0, -h / 2, d / 2 - 0.015);
  o.traverse(m => { if (m.isMesh) m.userData.breaker = true; });
  p.g.add(o);
  for (const m of p.hand) { m.removeFromParent(); m.geometry.dispose(); }
  p.hand.length = 0;
  p.pivot.position.set(w * 0.17, -h / 2 + h * 0.52, d - 0.005);
  p.lamp.position.set(-w * 0.22, -h / 2 + h * 0.85, d - 0.01); p.lamp.scale.setScalar(0.9);
}

export class Blackout {
  constructor(scene) {
    this.scene = scene;
    // breaker panels: a grey box on the wall, a big throw lever, a lamp (red: needs resetting; green: done; dark: not in
    // use). The hand-built box stands in until the Sorceress panel (assets/props/breaker.glb) has loaded; the lever and the
    // lamp stay ours, so they can move and light, set into the model's lever slot and onto its lamp.
    const box = hasProp('breaker') ? null : new THREE.MeshStandardMaterial({ color: 0x6d7076, metalness: 0.6, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.5, roughness: 0.6 });
    const knobM = new THREE.MeshStandardMaterial({ color: 0xd02018, roughness: 0.4, emissive: 0x400000 }); // (a little glow: it reads by flashlight)
    this.panels = BREAKERS.map((b, i) => {
      const g = new THREE.Group(); g.name = 'breaker-panel-' + i;
      const wx = (b.x + Math.cos(b.face) * 31) * M, wz = (b.y + Math.sin(b.face) * 31) * M;
      g.position.set(wx, 1.35, wz); g.rotation.y = yawOf(b.face + Math.PI); // local +Z faces the room
      const hand = [];
      if (box) {
        hand.push(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.12), box));
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.02), dark); slot.position.set(0.1, -0.02, 0.07); hand.push(slot);
        for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.01), dark); s.position.set(-0.11, 0.08 - i * 0.07, 0.065); hand.push(s); }
      }
      hand.forEach(m => g.add(m));
      const pivot = new THREE.Group(); pivot.position.set(0.1, -0.02, 0.08); g.add(pivot);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), dark); lever.position.y = 0.1; pivot.add(lever);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 9), knobM); knob.position.y = 0.21; pivot.add(knob);
      const lampM = new THREE.MeshBasicMaterial({ color: 0x220000, toneMapped: false });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), lampM); lamp.position.set(-0.14, 0.2, 0.07); g.add(lamp);
      scene.add(g);
      return { g, hand, pivot, lamp, lampM };
    });
    onPropsReady(() => { if (hasProp('breaker')) { this.panels.forEach(fitPanel); box?.dispose(); } });
    // your flashlight, from the camera; the nearest others' from their hands; everyone's beam as a faint cone
    this.mine = new THREE.SpotLight(0xfff1d6, 0, 22, 0.45, 0.45, 1.6); scene.add(this.mine, this.mine.target);
    this.others = [...Array(OTHER_LIGHTS)].map(() => { const L = new THREE.SpotLight(0xfff1d6, 0, 16, 0.42, 0.5, 1.6); scene.add(L, L.target); return L; });
    const cone = new THREE.ConeGeometry(1.5, BEAM_LEN, 20, 1, true); cone.translate(0, -BEAM_LEN / 2, 0); cone.rotateX(-Math.PI / 2); // apex at the origin, opening along +Z
    this.beamMat = new THREE.MeshBasicMaterial({ name: 'flashlight-beam', color: 0xfff0c8, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
    this.coneGeo = cone; this.beams = new Map(); this.mons = new Map();
    // Blackout cones otherwise have no mesh until somebody turns a flashlight
    // on. Include a hidden representative in texture/buffer/shader preparation.
    this.beamTemplate = new THREE.Mesh(cone, this.beamMat); this.beamTemplate.visible = false; scene.add(this.beamTemplate);
    // escape mode's exits: a staff door standing open on the dark, a green EXIT sign over it and a green glow
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    const g2 = cv.getContext('2d'); g2.fillStyle = '#0a3a18'; g2.fillRect(0, 0, 256, 96); g2.fillStyle = '#7dffa8'; g2.font = '900 64px Arial Black, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('EXIT', 128, 52);
    const signTex = new THREE.CanvasTexture(cv); signTex.colorSpace = THREE.SRGBColorSpace;
    const signM = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }), voidM = new THREE.MeshBasicMaterial({ color: 0x010201 });
    this.exits = STAFF_DOORS.map(d => {
      const g = new THREE.Group(), nx = Math.cos(d.face), nz = Math.sin(d.face);
      g.position.set(d.x * M, 0, d.y * M); g.rotation.y = Math.atan2(nx, nz); // local +Z: into the room
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 2.08), voidM); hole.position.set(0, 1.05, 0.16); g.add(hole);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), signM); sign.position.set(0, 2.32, 0.14); g.add(sign);
      g.visible = false; scene.add(g);
      return { g, at: v3(d.x * M + nx * 0.6, 2.1, d.y * M + nz * 0.6) };
    });
    // (two lights, always in the scene so the light count never changes and nothing recompiles when the doors open)
    this.exitGlow = [0, 1].map(() => { const L = new THREE.PointLight(0x40ff80, 0, 6, 1.6); scene.add(L); return L; });
  }
  // Every frame, after the beans (render3d.js): pub, priv as the snapshot has them; beans the render's beans; cam the camera.
  update(pub, priv, beans, t, dt, cam, meIdx, firstPerson) {
    const B = pub && pub.blackout && pub.mode === 'play' && !pub.over ? pub.blackout : null;
    // the panels
    this.panels.forEach((p, i) => {
      const br = B && B.br.find(r => r[0] === i);
      const prog = br ? br[1] : 0, done = br && br[2];
      p.pivot.rotation.x = br ? Math.PI * 0.8 * (1 - (done ? 1 : prog)) : 0; // tripped: lever thrown down, out of the panel; reset: up
      p.lampM.color.setHex(!br ? 0x1a0606 : done ? 0x30ff60 : Math.sin(t * 8) > 0 ? 0xff2010 : 0x400404);
    });
    // the open exits
    const X = pub && pub.exits && !pub.exits.closed && pub.mode === 'play' && !pub.over ? pub.exits : null;
    this.exits.forEach((e, i) => { e.g.visible = !!X && X.ids.includes(i); });
    this.exitGlow.forEach((L, k) => { const i = X ? X.ids[k] : undefined; L.intensity = i === undefined ? 0 : 3.5 + Math.sin(t * 3) * 0.8; if (i !== undefined) L.position.copy(this.exits[i].at); });
    // flashlights
    const lit = [];
    if (B) for (const c of pub.chars) if (c.alive && c.flash && !c.held) lit.push(c);
    const meChar = pub && priv ? pub.chars[meIdx] : null;
    const mineOn = !!(B && priv && priv.flash && firstPerson);
    this.mine.intensity = mineOn ? 45 : 0;
    if (mineOn) { this.mine.position.copy(cam.position); cam.getWorldDirection(this._d || (this._d = v3())); this.mine.target.position.copy(cam.position).addScaledVector(this._d, 10); this.mine.target.updateMatrixWorld(); }
    const near = lit.filter(c => c.id !== meIdx || !firstPerson).map(c => [c, (c.x * M - cam.position.x) ** 2 + (c.y * M - cam.position.z) ** 2]).sort((a, b) => a[1] - b[1]);
    this.others.forEach((L, k) => {
      const e = near[k];
      if (!e || e[1] > 30 * 30) { L.intensity = 0; return; }
      const c = e[0], x = c.x * M, z = c.y * M;
      L.position.set(x + Math.cos(c.look) * 0.25, HAND, z + Math.sin(c.look) * 0.25); L.target.position.set(x + Math.cos(c.look) * 8, 0.3, z + Math.sin(c.look) * 8); L.target.updateMatrixWorld();
      L.intensity = 30;
    });
    const seenB = new Set();
    for (const c of lit) {
      if (c.id === meIdx && firstPerson) continue;
      let m = this.beams.get(c.id);
      if (!m) { m = new THREE.Mesh(this.coneGeo, this.beamMat); m.renderOrder = 5; this.scene.add(m); this.beams.set(c.id, m); }
      m.position.set(c.x * M + Math.cos(c.look) * 0.25, HAND, c.y * M + Math.sin(c.look) * 0.25);
      m.rotation.set(0.12, yawOf(c.look), 0, 'YXZ'); // tipped down a little
      seenB.add(c.id);
    }
    for (const [id, m] of this.beams) if (!seenB.has(id)) { this.scene.remove(m); this.beams.delete(id); }
    // the monster(s)
    const seenM = new Set();
    let growl = 0;
    if (B) for (const c of pub.chars) {
      if (!c.monster || !c.alive) continue;
      seenM.add(c.id);
      let e = this.mons.get(c.id);
      if (!e) {
        const body = MOD ? MOD.makeMonster() : null;
        e = { body: body || standIn(), real: !!body, x: c.x, y: c.y, born: t, killAt: -1, leapAt: -1, maul: false, leap: false, step: 0, speed: 0 };
        this.scene.add(e.body.obj); this.mons.set(c.id, e);
      }
      const moved = Math.hypot(c.x - e.x, c.y - e.y) * M; e.x = c.x; e.y = c.y;
      e.speed += ((dt > 0 ? moved / dt : 0) - e.speed) * Math.min(1, dt * 6);
      // the stab and the pounce start on the frame the snapshot's flag does (every catch, however many: no limit)
      if (c.maul && !e.maul) e.killAt = t; else if (!c.maul && e.killAt >= 0 && t - e.killAt > 2.5) e.killAt = -1;
      if (c.leap && !e.leap) e.leapAt = t; else if (!c.leap && e.leapAt >= 0 && t - e.leapAt > 2) e.leapAt = -1;
      e.maul = c.maul; e.leap = c.leap;
      const at = { x: c.x * M, z: c.y * M, face: yawOf(c.face), look: yawOf(c.look), t };
      e.body.obj.visible = !(c.id === meIdx && firstPerson); // (you don't see yourself from inside it)
      if (e.real) { e.body.obj.position.set(at.x, 0, at.z); e.body.obj.rotation.y = at.face; e.base ??= e.body.obj.scale.x; e.body.obj.scale.setScalar(e.base * (pub.backrooms ? 0.9 : 1)); } // (under the backrooms' 2.7 m ceiling it stoops to fit)
      e.body.update(dt, { moving: (c.moving || e.speed > 0.3) && !c.leap, speed: e.speed, roarT: t - e.born, killT: e.killAt >= 0 ? t - e.killAt : -1, leapT: e.leapAt >= 0 ? t - e.leapAt : -1 }, at);
      // its footfalls and its growl, by how near it is (through a wall, muffled)
      const d = Math.hypot(at.x - cam.position.x, at.z - cam.position.z), here = meChar && roomOf(meChar) === roomOf(c);
      if ((e.step += moved) > 1.5) { e.step = 0; const v = Math.max(0, 1 - d / 26); if (v > 0.02) audio.sfx('mstep', v * (here ? 1 : 0.4), !here); }
      growl = Math.max(growl, c.id === meIdx ? 0.25 : Math.max(0, 1 - d / 16) ** 2 * (here ? 1 : 0.3));
    }
    for (const [id, e] of this.mons) if (!seenM.has(id)) { this.scene.remove(e.body.obj); e.body.dispose(); this.mons.delete(id); }
    audio.growl(growl);
    // a victim in its claws: flinches, flails and goes limp (once per catch)
    this.held = this.held || new Set();
    for (const c of pub ? pub.chars : []) {
      if (!(B && c.held && c.alive)) { this.held.delete(c.id); continue; }
      if (this.held.has(c.id)) continue;
      const b = beans.get(c.id); if (b && b.play && b.play('snatched')) this.held.add(c.id);
    }
  }
}
