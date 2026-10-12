// The 3D view: first-person camera for the player, a camera tour for the menu, an orbit for meetings.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld, loadRoomMats, GLOWS, M, yawOf } from './world.js';
import { makeBean, loadPlush, onPlushReady, plushReady, loadClips, PLAYED } from './plush.js';
import { loadProps, onPropsReady, propsLoaded } from './props.js';
import { GESTURES, Gestures } from './gestures.js';
import { Items } from './items.js';
import { Hands } from './hands.js';
import { Hazards } from './hazards.js';
import { setAniso, loadFelts, loadArt } from './textures.js';
import { BELL } from '../map.js';
import { ringRadius } from '../sim.js';

export const EYE = { stand: 1.12, seat: 1.42, ghost: 1.6 };
const FOV = 72, POOL = 8;
let R = null;

// The menu's camera tour: slow dolly shots through the casino (sim px and metres).
const TOUR = [
  { a: [1000, 800, 2.5], b: [1640, 800, 2.5], look: [1320, 260, 1.1] },
  { a: [2230, 560, 1.8], b: [2770, 560, 1.8], look: [2500, 20, 1.9] },
  { a: [2160, 1140, 2.0], b: [2780, 1140, 2.0], look: [2560, 960, 0.5] },
  { a: [1120, 1290, 1.9], b: [1520, 1290, 1.9], look: [1700, 1880, 1.9] },
  { a: [320, 1260, 2.1], b: [820, 1290, 2.1], look: [560, 1760, 1.2] },
  { a: [2200, 1300, 1.8], b: [2780, 1320, 1.8], look: [2480, 1540, 0.6] },
  { a: [700, 640, 1.7], b: [1900, 640, 1.7], look: [1320, 940, 0.9] },
];
const SHOT = 9;

export function init(canvas, { lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !lowPower; renderer.shadowMap.type = THREE.PCFShadowMap;
  setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  loadFelts(); loadArt();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0709);
  scene.fog = new THREE.Fog(0x1a0a0e, 18, 46);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env; scene.environmentIntensity = 0.32;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 90);
  camera.rotation.order = 'YXZ';
  const hemi = new THREE.HemisphereLight(0xffe2b8, 0x3a1018, 0.42); scene.add(hemi);
  const fill = new THREE.AmbientLight(0x402028, 0.28); scene.add(fill);
  // a soft overhead key light that follows the camera and gives everything near you a contact shadow
  const key = new THREE.DirectionalLight(0xffe6c8, 0.75);
  key.castShadow = !lowPower; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 0.5, far: 24 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 3;
  scene.add(key, key.target);
  const torch = new THREE.PointLight(0xffd8a0, 0, 3.2, 1.6); scene.add(torch); // your own glow when the lights go out
  const pool = [];
  for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffd29a, 0, 10, 1.6); scene.add(l); pool.push(l); }
  const g0 = GLOWS.length, world = buildWorld(scene), glowRange = [g0, GLOWS.length];
  loadRoomMats(lowPower);
  const items = new Items(scene);
  const hazards = new Hazards(scene);
  const hands = new Hands(); hands.scene.environment = env; hands.scene.environmentIntensity = 0.3;
  const dealerSpots = world.machines.dealerSpots;
  const dealers = dealerSpots.map(() => makeBean({ color: '#22201e', hat: 'visor', dealer: true }));
  dealers.forEach(d => scene.add(d.root));
  // the plush models arrive in the background: swap the dealers and add the bartender
  onPlushReady(() => {
    dealers.forEach((d, i) => { scene.remove(d.root); dealers[i] = makeBean({ dealer: true }); scene.add(dealers[i].root); });
    R.bartender = makeBean({ kind: 'bartender' }); scene.add(R.bartender.root);
  });
  loadPlush(); onPlushReady(() => loadClips(GESTURES));
  // the hero props arrive in the background too: the casino is rebuilt with them once you are not seated at a game
  loadProps(); onPropsReady(() => { R.rebuild = true; });

  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lowPower ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (!lowPower) {
    gtao = new GTAOPass(scene, camera, 256, 256);
    gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    // AO comes only from solid meshes: skip glows, glass, sprites and anything marked noAO
    gtao._overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverse(o => {
        if (!o.visible) return;
        const m = o.material, tr = m && !Array.isArray(m) && (m.transparent || m.blending === THREE.AdditiveBlending);
        if (o.isPoints || o.isLine || o.isSprite || tr || o.userData.noAO) { o.visible = false; cache.push(o); }
      });
    };
    const setSize = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); // AO at half resolution
    composer.addPass(gtao);
  }
  const handPass = new RenderPass(hands.scene, hands.camera); handPass.clear = false; handPass.clearDepth = true; composer.addPass(handPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.55, 0.92); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  R = { renderer, scene, camera, composer, bloom, gtao, hemi, fill, key, torch, pool, world, glowRange, items, hazards, hands, beans: new Map(), dealers, dealerSpots, lowPower,
    dark: 0, orbitA: 0, tourT: 0, last: performance.now(), size: '', fp: { bob: 0 }, me: -1 };
  return R;
}

// Swap the hand-built casino for the one with the hero props. Its procedural geometry is dropped; the prop models,
// materials and canvas textures are shared and stay.
function rebuildWorld() {
  R.rebuild = false;
  const old = R.world;
  R.scene.remove(old.group);
  old.group.traverse(o => { if (o.geometry && !o.userData.prop) o.geometry.dispose(); });
  GLOWS.splice(R.glowRange[0], R.glowRange[1] - R.glowRange[0]);
  const g0 = GLOWS.length;
  R.world = buildWorld(R.scene);
  R.glowRange = [g0, GLOWS.length];
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
  R.camera.aspect = aspect; R.baseFov = fov; R.camera.fov = fov * (R.zoom || 1); R.camera.updateProjectionMatrix();
  R.hands.setAspect(aspect, R.camera.fov);
}

function beanFor(c) {
  let b = R.beans.get(c.id);
  const key = c.color + c.hat + plushReady();
  if (!b || b.key !== key) {
    if (b) R.scene.remove(b.root);
    b = makeBean({ color: c.color, hat: c.hat, name: c.name }); b.key = key; b.name = c.name;
    R.scene.add(b.root); R.beans.set(c.id, b);
  }
  return b;
}

// The nearest light spots get the pooled point lights; the edge of the set fades so nothing pops.
const tmpD = [];
function placeLights(cam, lit) {
  const spots = R.world.lightSpots;
  tmpD.length = 0;
  for (let i = 0; i < spots.length; i++) tmpD.push([spots[i].p.distanceToSquared(cam), i]);
  tmpD.sort((a, b) => a[0] - b[0]);
  const edge = tmpD.length > POOL ? Math.sqrt(tmpD[POOL][0]) : 1e9;
  for (let k = 0; k < POOL; k++) {
    const L = R.pool[k], e = tmpD[k];
    if (!e) { L.intensity = 0; continue; }
    const s = spots[e[1]], d = Math.sqrt(e[0]);
    L.position.copy(s.p); L.color.setHex(s.color); L.distance = s.range;
    L.intensity = s.power * Math.min(1, Math.max(0, (edge - d) / 4)) * lit;
  }
}

// frame: { pub, priv, me: {x,y,look,pitch,moving}, mode: 'fp'|'orbit', my: panel view }
export function draw(frame) {
  if (!R) return;
  if (R.rebuild && !frame.my) rebuildWorld();
  resize();
  const now = performance.now(); const dt = Math.min(0.1, (now - R.last) / 1000); R.last = now;
  const { pub, priv, me } = frame;
  // seated on a phone in landscape the view narrows a little so the table's parts are big enough to tap
  const zoom = frame.zoom || 1;
  if (Math.abs((R.zoom || 1) - zoom) > 0.002) { R.zoom = (R.zoom || 1) + (zoom - (R.zoom || 1)) * Math.min(1, dt * 5); if (Math.abs(R.zoom - zoom) < 0.004) R.zoom = zoom; R.camera.fov = R.baseFov * R.zoom; R.camera.updateProjectionMatrix(); R.hands.setAspect(R.camera.aspect, R.camera.fov); }
  const t = pub ? pub.t : now / 1000;
  const orbit = frame.mode !== 'fp' || !pub;
  const meeting = pub && pub.mode === 'meeting';
  // lights out: fade everything but your own glow
  const want = pub && pub.lightsT > 0 && !pub.over && pub.mode === 'play' ? 1 : 0;
  R.dark += (want - R.dark) * Math.min(1, dt * (want ? 6 : 2));
  const lit = 1 - R.dark * 0.94;
  R.hemi.intensity = 0.42 * lit; R.fill.intensity = 0.28 * lit; R.key.intensity = 0.75 * lit; R.scene.environmentIntensity = 0.32 * lit;
  for (const g of GLOWS) {
    const k = g.v * (1 - R.dark * 0.85);
    if (g.k === 'color') { if (g.base) g.m.color.copy(g.base).multiplyScalar(k); else g.m.color.setScalar(k); } else g.m[g.k] = k;
  }
  R.torch.intensity = R.dark * 2.2;
  R.scene.fog.color.setRGB(0.1 * lit, 0.04 * lit, 0.055 * lit);
  R.scene.fog.near = 18 - R.dark * 17; R.scene.fog.far = 46 - R.dark * 42.5;
  R.scene.background.setRGB(0.043 * lit, 0.027 * lit, 0.035 * lit);

  // dealers idle at their tables
  R.dealers.forEach((d, i) => { const s = R.dealerSpots[i]; d.update({ x: s.x * M, z: s.y * M, face: yawOf(s.a), look: yawOf(s.a) + Math.sin(t * 0.4 + i * 2) * 0.5, moving: false, t, dt }); });
  // the bartender drifts along behind the counter, facing the room
  if (R.bartender) { const bx = 260 + Math.sin(t * 0.13) * 150; R.bartender.update({ x: bx * M, z: 52 * M, face: yawOf(Math.PI / 2), look: yawOf(Math.PI / 2) + Math.sin(t * 0.5) * 0.6, moving: Math.abs(Math.cos(t * 0.13)) > 0.35, t, dt }); R.bartender.root.position.y = 0.32; } // on the raised floor behind the bar

  // characters
  const seen = new Set();
  const meIdx = priv ? priv.me : -1;
  if (pub) {
    const alive = pub.chars.filter(c => c.alive), rr = ringRadius(alive.length) * 0.85;
    for (const c of pub.chars) {
      const b = beanFor(c); seen.add(c.id);
      const isMe = c.id === meIdx;
      b.root.visible = c.alive && !(isMe && !orbit);
      if (!b.root.visible) continue;
      let x = c.x, y = c.y, face = c.face, look = c.look, moving = c.moving, seated = c.seat !== null;
      if (meeting) { // everyone gathers around the pit bell
        const i = alive.indexOf(c), a = i / alive.length * Math.PI * 2;
        x = BELL.x + Math.cos(a) * rr; y = BELL.y + Math.sin(a) * rr; face = look = a + Math.PI; moving = false; seated = false;
      }
      if (isMe && orbit && me) { x = me.x; y = me.y; look = me.look; }
      b.update({ x: x * M, z: y * M, face: yawOf(face), look: yawOf(look), moving, seated, pale: c.pale, lucky: c.lucky, t, dt });
      const partner = priv && priv.killers && priv.killers.includes(c.id) && !isMe;
      b.setLabel(isMe ? 'You' : c.name, partner ? '#ff8a80' : '#f3ead8');
    }
  }
  for (const [id, b] of R.beans) if (!seen.has(id)) { R.scene.remove(b.root); R.beans.delete(id); }
  if (plushReady()) (R.gestures || (R.gestures = new Gestures())).tick(pub, priv, R.beans, { dealers: R.dealers, bartender: R.bartender }, t, dt);

  // camera
  const cam = R.camera;
  let handsHidden = true;
  if (orbit && meeting) {
    R.orbitA += dt * 0.12;
    const cx = BELL.x * M, cz = BELL.y * M, rad = 4.2 + (pub.chars.length > 10 ? 1 : 0);
    cam.position.set(cx + Math.cos(R.orbitA) * rad, 2.4, cz + Math.sin(R.orbitA) * rad);
    cam.lookAt(cx, 1.0, cz);
  } else if (orbit) {
    R.tourT += dt;
    const shot = TOUR[Math.floor(R.tourT / SHOT) % TOUR.length], u = (R.tourT % SHOT) / SHOT, e = u * u * (3 - 2 * u);
    cam.position.set((shot.a[0] + (shot.b[0] - shot.a[0]) * e) * M, shot.a[2] + (shot.b[2] - shot.a[2]) * e, (shot.a[1] + (shot.b[1] - shot.a[1]) * e) * M);
    cam.lookAt(shot.look[0] * M, shot.look[2], shot.look[1] * M);
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
    if (R.hazards.cctv(cam, pub, priv)) handsHidden = true; // the security desk shows the live camera
  }
  if (handsHidden) R.hands.update({ hidden: true, dt });
  cam.updateMatrixWorld();
  R.torch.position.copy(cam.position);
  placeLights(cam.position, lit);
  // the shadow light hangs over a point a few metres ahead of you, snapped to its texels so shadows don't swim
  const ahead = new THREE.Vector3(0, 0, -5).applyQuaternion(cam.quaternion); ahead.y = 0;
  const step = 22 / 2048, tx = Math.round((cam.position.x + ahead.x) / step) * step, tz = Math.round((cam.position.z + ahead.z) / step) * step;
  R.key.target.position.set(tx, 0, tz); R.key.position.set(tx + 2.5, 12, tz + 3.5); R.key.target.updateMatrixWorld();
  R.world.update(now / 1000, dt, { pub, priv, my: frame.my || null, cam: cam.position });
  if (pub) R.items.update(pub, priv || { me: -1, spiked: [], alive: true }, R.beans, t, dt, { firstPerson: !orbit, camera: cam });
  if (pub) R.hazards.update(pub, priv, R.beans, t, dt);
  R.composer.render(dt);
}

// at: the screen point (NDC) the hand reaches for, or null for the plain animation.
export function playHand(kind, at) { if (R) R.hands.play(kind, at); }

// ---------- Pressing the table in front of you ----------
const ray = new THREE.Raycaster(), ndcV = new THREE.Vector2(), shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
// The part of your own table under a screen point (NDC): { part, uv, point } or null.
export function pick(nx, ny) {
  const rig = R && R.world.machines.rig; if (!rig || !rig.active) return null;
  ndcV.set(nx, ny); ray.setFromCamera(ndcV, R.camera); ray.far = 5;
  for (const h of ray.intersectObjects(rig.parts, false)) { if (!shown(h.object)) continue; const r = rig.resolve(h); if (r) return r; }
  return null;
}
// Phones: the nearest part within maxPx of a screen point, when a tap lands between parts.
export function pickNear(nx, ny, maxPx) {
  const rig = R && R.world.machines.rig; if (!rig || !rig.active) return null;
  const w = innerWidth / 2, h = innerHeight / 2, v = new THREE.Vector3(); let best = null, bd = maxPx;
  for (const c of rig.centers()) {
    v.copy(c.p).project(R.camera); if (v.z > 1) continue;
    const d = Math.hypot((v.x - nx) * w, (v.y - ny) * h); if (d < bd) { bd = d; best = { part: c.part, uv: null, point: c.p }; }
  }
  return best;
}
// Every part you can press, with its screen position in CSS px (tests).
export function partsOnScreen() {
  const rig = R && R.world.machines.rig; if (!rig || !rig.active) return [];
  const v = new THREE.Vector3();
  return rig.centers().map(c => { v.copy(c.p).project(R.camera); return { part: c.part, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, on: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1, p: c.p.toArray() }; });
}
export function screenPointOf(x, y) { const rig = R && R.world.machines.rig, p = rig && rig.screenPoint(x, y); if (!p) return null; const v = p.clone().project(R.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, p: p.toArray() }; }
export function setHover(h) { const rig = R && R.world.machines.rig; if (rig) rig.setHover(h); }
export const camPos = () => R && R.camera.position.toArray();
export function gesture(id, name, upper) { const b = R && R.beans.get(id); return !!(b && b.play && b.play(name, upper)); }
export function info() {
  if (!R) return null;
  const i = R.renderer.info;
  return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, cam: [R.camera.position.x, R.camera.position.y, R.camera.position.z, R.camera.rotation.x, R.camera.rotation.y].map(v => +v.toFixed(2)), gestures: { ...PLAYED }, props: propsLoaded().length, rebuildPending: !!R.rebuild };
}
