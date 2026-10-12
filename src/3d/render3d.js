// The 3D view: first-person camera for the player, slow orbits for the menu, meetings and the results.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld, GLOWS, M, WALL_H, yawOf } from './world.js';
import { Bean } from './chars.js';
import { Items } from './items.js';
import { Hands } from './hands.js';
import { setAniso } from './textures.js';
import { BELL } from '../map.js';

export const EYE = { stand: 1.12, seat: 1.42, ghost: 1.6 };
const FOV = 72;
let R = null;

export function init(canvas, { lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0709);
  scene.fog = new THREE.Fog(0x1a0a0e, 14, 34);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env; scene.environmentIntensity = 0.35;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 80);
  camera.rotation.order = 'YXZ';
  const hemi = new THREE.HemisphereLight(0xffe2b8, 0x3a1018, 0.55); scene.add(hemi);
  const fill = new THREE.AmbientLight(0x402028, 0.35); scene.add(fill);
  const torch = new THREE.PointLight(0xffd8a0, 0, 3.2, 1.6); scene.add(torch); // the player's own glow when the lights go out
  const world = buildWorld(scene);
  const items = new Items(scene);
  const hands = new Hands(); hands.scene.environment = env; hands.scene.environmentIntensity = 0.25;
  const dealers = [
    new Bean({ color: '#22201e', hat: 'visor', dealer: true }), new Bean({ color: '#22201e', hat: 'visor', dealer: true }),
  ];
  const dealerSpots = [{ x: 900, y: 252, a: Math.PI / 2 }, { x: 900, y: 935, a: -Math.PI / 2 }];
  dealers.forEach(d => scene.add(d.root));

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const handPass = new RenderPass(hands.scene, hands.camera); handPass.clear = false; handPass.clearDepth = true; composer.addPass(handPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.5, 0.97); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  R = { renderer, scene, camera, composer, bloom, hemi, fill, torch, world, items, hands, beans: new Map(), dealers, dealerSpots, lowPower,
    dark: 0, orbitA: 0, last: performance.now(), size: '', fp: { bob: 0 }, me: -1 };
  return R;
}

function resize() {
  const c = R.renderer.domElement;
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  const pr = Math.min(window.devicePixelRatio || 1, R.lowPower ? 1 : 1.5);
  const key = w + 'x' + h + '@' + pr; if (key === R.size) return; R.size = key;
  R.renderer.setPixelRatio(pr); R.renderer.setSize(w, h, false);
  c.style.width = '100vw'; c.style.height = '100vh';
  R.composer.setPixelRatio(pr); R.composer.setSize(w, h);
  R.bloom.resolution.set(w / 2, h / 2);
  // keep roughly the same horizontal view on tall screens
  const aspect = w / h, fov = aspect < 1 ? Math.min(100, 2 * Math.atan(Math.tan(FOV * Math.PI / 360) * 1.6 / aspect) * 180 / Math.PI * 0.62) : FOV;
  R.camera.aspect = aspect; R.camera.fov = fov; R.camera.updateProjectionMatrix();
  R.hands.setAspect(aspect, fov);
}

function beanFor(c) {
  let b = R.beans.get(c.id);
  if (!b || b.key !== c.color + c.hat) {
    if (b) R.scene.remove(b.root);
    b = new Bean({ color: c.color, hat: c.hat, name: c.name }); b.key = c.color + c.hat; b.name = c.name;
    R.scene.add(b.root); R.beans.set(c.id, b);
  }
  return b;
}

// frame: { pub, priv, me: {x,y,look,pitch,moving}, mode: 'fp'|'orbit', t }
export function draw(frame) {
  if (!R) return;
  resize();
  const now = performance.now(); const dt = Math.min(0.1, (now - R.last) / 1000); R.last = now;
  const { pub, priv, me } = frame;
  const t = pub ? pub.t : now / 1000;
  R.world.update(now / 1000, dt);
  const orbit = frame.mode !== 'fp' || !pub;
  const meeting = pub && pub.mode === 'meeting';
  // lights out: fade everything but the player's glow
  const want = pub && pub.lightsT > 0 && !pub.over && pub.mode === 'play' ? 1 : 0;
  R.dark += (want - R.dark) * Math.min(1, dt * (want ? 6 : 2));
  const lit = 1 - R.dark * 0.94;
  R.hemi.intensity = 0.55 * lit; R.fill.intensity = 0.35 * lit; R.scene.environmentIntensity = 0.35 * lit;
  for (const L of R.world.lights) L.l.intensity = L.v * lit;
  for (const g of GLOWS) { if (g.k === 'color') g.m.color.setScalar(g.v * (1 - R.dark * 0.85)); else g.m[g.k] = g.v * (1 - R.dark * 0.85); }
  R.torch.intensity = R.dark * 2.2;
  R.scene.fog.color.setRGB(0.1 * lit, 0.04 * lit, 0.055 * lit);
  R.scene.fog.near = 14 - R.dark * 13; R.scene.fog.far = 34 - R.dark * 30.5;
  R.scene.background.setRGB(0.043 * lit, 0.027 * lit, 0.035 * lit);

  // dealers idle at their tables
  R.dealers.forEach((d, i) => { const s = R.dealerSpots[i]; d.update({ x: s.x * M, z: s.y * M, face: yawOf(s.a), look: yawOf(s.a) + Math.sin(t * 0.4 + i * 2) * 0.5, moving: false, t, dt }); });

  // characters
  const seen = new Set();
  const meIdx = priv ? priv.me : -1;
  if (pub) {
    const alive = pub.chars.filter(c => c.alive);
    for (const c of pub.chars) {
      const b = beanFor(c); seen.add(c.id);
      const isMe = c.id === meIdx;
      b.root.visible = c.alive && !(isMe && !orbit);
      if (!b.root.visible) continue;
      let x = c.x, y = c.y, face = c.face, look = c.look, moving = c.moving, seated = c.seat !== null;
      if (meeting) { // gather around the pit bell
        const i = alive.indexOf(c), a = i / alive.length * Math.PI * 2;
        x = BELL.x + Math.cos(a) * 110; y = BELL.y + Math.sin(a) * 110; face = look = a + Math.PI; moving = false; seated = false;
      }
      if (isMe && orbit && me) { x = me.x; y = me.y; look = me.look; }
      b.update({ x: x * M, z: y * M, face: yawOf(face), look: yawOf(look), moving, seated, pale: c.pale, lucky: c.lucky, t, dt });
      const partner = priv && priv.killers && priv.killers.includes(c.id) && !isMe;
      b.setLabel(isMe ? 'You' : c.name, partner ? '#ff8a80' : '#f3ead8');
    }
  }
  for (const [id, b] of R.beans) if (!seen.has(id)) { R.scene.remove(b.root); R.beans.delete(id); }

  // camera
  const cam = R.camera;
  let handsHidden = true;
  if (orbit) {
    R.orbitA += dt * (meeting ? 0.12 : 0.06);
    const cx = BELL.x * M, cz = BELL.y * M, rx = meeting ? 4.0 : 4.6, rz = meeting ? 4.0 : 7.0;
    cam.position.set(cx + Math.cos(R.orbitA) * rx, meeting ? 2.3 : 2.7, cz + Math.sin(R.orbitA) * rz);
    cam.lookAt(cx, meeting ? 1.0 : 1.3, cz);
  } else {
    const ghost = !priv.alive, seated = !!priv.seat;
    R.fp.bob += dt * (me.moving ? 10 : 0);
    const eye = ghost ? EYE.ghost : seated ? EYE.seat : EYE.stand;
    cam.position.set(me.x * M, eye + (me.moving && !ghost ? Math.abs(Math.sin(R.fp.bob)) * 0.03 : 0), me.y * M);
    cam.rotation.set(me.pitch || 0, -me.look - Math.PI / 2, 0);
    handsHidden = false;
    const myChar = pub.chars[meIdx];
    R.hands.setSuit(myChar.color);
    const d = priv.drink && priv.drink.held ? pub.drinks.find(x => x.holder === meIdx) : null;
    R.hands.update({ dt, t, drink: d ? { kind: d.kind, color: d.color, sips: d.sips } : null, seated, game: priv.seat && priv.seat.game, moving: me.moving, ghost, light: lit + R.dark * 0.25, hidden: false });
  }
  if (handsHidden) R.hands.update({ hidden: true, dt });
  R.torch.position.copy(cam.position);
  if (pub) R.items.update(pub, priv || { me: -1, spiked: [], alive: true }, R.beans, t, dt, { firstPerson: !orbit, camera: cam });
  R.composer.render(dt);
}

export function playHand(kind) { if (R) R.hands.play(kind); }
export function info() {
  if (!R) return null;
  const i = R.renderer.info;
  return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, cam: [R.camera.position.x, R.camera.position.y, R.camera.position.z, R.camera.rotation.x, R.camera.rotation.y].map(v => +v.toFixed(2)) };
}
