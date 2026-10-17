import {makeBackroomsMonster} from './backrooms-entities.js';
import {brLos} from '../backrooms-map.js';
import * as THREE from 'three';
import { makeBean } from './plush.js';
import { makeMonster } from './monster.js';
import { los } from '../map.js';

export const DEATH_SECONDS = 3.4;
export const DEATH_CAUSE = {blade: 'Knife attack', shiv: 'Knife attack', monster: 'Monster attack', poison: 'Poisoned', trap: 'Rigged machine', chandelier: 'Falling chandelier', drown: 'Shoved into the pond', shot: 'Shot'};
// A local cinematic built from the victim's private death snapshot. Network spectators
// keep their own cameras, and no living player receives the attacker's appearance.
export class DeathScene {
  constructor(scene) {
    this.scene = scene; this.key = null; this.active = false;
    this.overlay = document.createElement('div'); this.overlay.id = 'deathVignette';
    this.overlay.setAttribute('aria-hidden', 'true'); document.body.append(this.overlay);
    this.caption = document.createElement('div'); this.caption.id = 'deathCaption'; this.caption.className = 'hidden'; this.caption.setAttribute('role', 'status'); document.body.append(this.caption);
  }
  clear() {
    if (!this.group && !this.active) return;
    if (this.group) this.scene.remove(this.group);
    this.monster?.dispose(); this.monster = null;
    this.victim?.dispose?.(); this.attacker?.dispose?.(); this.victim = this.attacker = null;
    this.group = this.actor = this.light = null; this.active = false; this.overlay.style.opacity = '0'; this.caption.classList.add('hidden'); document.body.classList.remove('death-scene');
  }
  update(pub, priv, camera, dt) {
    const d = priv?.deathScene;
    if (!d || priv.alive || !pub) { this.clear(); this.key = null; return false; }
    const key = `${priv.me}:${d.t}`;
    if (key !== this.key) {
      this.clear(); this.key = key;
      // New death snapshots play once even when network delivery was delayed.
      const name = document.createElement('strong'), cause = document.createElement('span');
      name.textContent = d.killer?.name ? 'Killed by ' + d.killer.name : 'You died'; cause.textContent = DEATH_CAUSE[d.cause] || 'An unlucky end';
      this.caption.replaceChildren(name, cause); this.caption.classList.remove('hidden');
      this.age = 0; this.group = new THREE.Group(); this.group.name = 'death-cinematic'; this.scene.add(this.group);
      const v = pub.chars[priv.me]; this.victim = makeBean({ color: v.color, hat: v.hat }); this.group.add(this.victim.root);
      this.monster = d.attacker?.entity ? makeBackroomsMonster(d.attacker.entity) : d.attacker?.monster || !d.attacker ? makeMonster() : null;
      this.attacker = this.monster ? null : makeBean({ color: d.attacker?.color || '#29202b', hat: d.attacker?.hat || 'none' });
      this.actor = this.monster?.obj || this.attacker.root; this.actor.name = 'death-jumpscare-attacker'; this.group.add(this.actor);
      this.light = new THREE.PointLight(0xffb18a, 5, 7, 1.5); this.group.add(this.light);
      // Choose an unobstructed side of the body for the third-person shot.
      this.angle = d.face + Math.PI * .72;
      for (let i = 0; i < 12; i++) {
        const a = d.face + Math.PI * .72 + i * Math.PI / 6;
        if ((pub.escape?brLos:los)({ x: d.x, y: d.y }, { x: d.x + Math.cos(a) * 140, y: d.y + Math.sin(a) * 140 })) { this.angle = a; break; }
      }
    }
    // Advance with rendered frames so a shader compilation or a slow device cannot skip the scare.
    const age = this.age = (this.age || 0) + Math.min(.1, Math.max(0, dt));
    if (!this.group || age >= DEATH_SECONDS) { this.clear(); return false; }
    this.active = true; document.body.classList.add('death-scene');
    const x = d.x / 60, z = d.y / 60, a = this.angle;
    const scare = age >= .24 && age < 1.05;
    this.phase = scare ? 'jumpscare' : age < .24 ? 'reveal' : 'collapse';
    const fall = THREE.MathUtils.smoothstep(age, .95, 2.15);
    this.victim.setDead(false); this.victim.update({ x, z, face: Math.PI / 2 - d.face, look: Math.PI / 2 - d.face, t: pub.t, dt });
    if (this.victim.label) this.victim.label.visible = false;
    const body = this.victim.model || this.victim.body;
    if (body) { body.rotation.x = fall * Math.PI / 2; body.rotation.z = fall * .16; body.position.y = fall * .27; body.position.z = -fall * .48; }
    const dist = 2.25 + Math.min(.3, age * .07);
    camera.position.set(x + Math.cos(a) * dist, 1.35 + (1 - fall) * .12, z + Math.sin(a) * dist);
    camera.lookAt(x, .78 - fall * .42, z);
    const face = Math.PI / 2 - Math.atan2(camera.position.z - z, camera.position.x - x);
    // Keep the attacker beside the body in the wider shot, leaving the collapse visible.
    this.actor.position.set(x - Math.cos(a) * 1.05 - Math.sin(a) * .8, 0, z - Math.sin(a) * 1.05 + Math.cos(a) * .8); this.actor.rotation.y = face;
    if (this.monster) this.monster.update(dt, { moving: false, killT: age, roarT: -1, leapT: -1 });
    else {
      this.attacker.update({ x: this.actor.position.x, z: this.actor.position.z, face, look: face, t: pub.t, dt });
      this.attacker.rot?.('RightArm', -1.45, 0, -.2); this.attacker.rot?.('LeftArm', -1.2, 0, .2);
      if (this.attacker.label) this.attacker.label.visible = false;
    }
    if (scare) {
      // A hard cut into a fast lunge, then a held face, rather than a flat overlay.
      const p = Math.min(1, (age - .24) / .16), gap = this.monster ? 2.5 - .3 * p : 1.15 - .2 * p;
      camera.position.set(x + Math.cos(a) * 2, this.monster ? 1.92 : 1.01, z + Math.sin(a) * 2);
      this.actor.position.set(camera.position.x - Math.cos(a) * gap, 0, camera.position.z - Math.sin(a) * gap);
      if (this.monster) { const head = this.monster.head(); camera.position.y = head.y + .06; camera.lookAt(head); }
      else camera.lookAt(this.actor.position.x, 1.01, this.actor.position.z);
      camera.rotateZ(Math.sin(age * 37) * .025 * (1 - Math.min(1, (age - .24) / .8)));
    }
    this.light.position.copy(camera.position); this.light.position.y += .35;
    this.light.intensity = scare ? 8 : 4;
    camera.fov = scare ? 61 : 68; camera.updateProjectionMatrix();
    const fade = Math.max(0, (age - 2.95) / .45);
    this.overlay.style.opacity = String(scare ? .7 : .25 + fade * .65);
    return true;
  }
  info() { return { active: this.active, phase: this.phase, age: this.age || 0 }; }
}
