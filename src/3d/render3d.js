// The 3D view: first-person camera for the player, a camera tour for the menu, an orbit for meetings.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld, buildWorldSteps, loadRoomMats, GLOWS, REFLECTS, M, WALL_H, yawOf } from './world.js';
import { BEAMS } from './machines.js';
import { makeBean, loadPlush, plushReady, loadClips, loadHats, PLAYED, updatePotatoDetail } from './plush.js';
import { loadProps, propsLoaded } from './props.js';
import { GESTURES, Gestures, prepareGestures } from './gestures.js';
import { Items, bodyPoseVersion } from './items.js';
import { Hands } from './hands.js';
import {loadHandAssets} from './hand-assets.js';
import { Hazards, prepareEffectTextures } from './hazards.js';
import { preloadMonster, makeMonster } from './monster.js';
import { DeathScene } from './death-scene.js';
import { Blackout } from './blackout.js';
import { Backrooms, preloadBackrooms } from './backrooms.js';
import { setAniso, loadFelts, loadArt, loadArt2, prepareCardTextures, preparePlinkoTextures } from './textures.js';
import { PRESETS } from '../settings.js';
import { BELL, ROOMS, roomOf, DOORS, DOOR_GAPS, los, SHADY, prepareNavigation } from '../map.js';
import { ringSpot } from '../sim.js';

export const EYE = { stand: 1.12, seat: 1.42, ghost: 1.6 };
const POOL = 12; // the most pooled point lights the graphics settings can ask for
let R = null;
const splitPassMaterials = !/[?&]legacyPassMaterials\b/.test(location.search); // diagnostic comparison
const splitSsrMaterials = !/[?&]legacySsrMaterials\b/.test(location.search);

// The menu's camera tour: slow dolly shots through the casino (sim px and metres).
const TOUR = [
  { a: [1000, 800, 2.5], b: [1640, 800, 2.5], look: [1320, 260, 1.1] },
  { a: [2230, 560, 1.8], b: [2770, 560, 1.8], look: [2500, 20, 1.9] },
  { a: [2160, 1140, 2.0], b: [2780, 1140, 2.0], look: [2560, 960, 0.5] },
  { a: [1480, 1080, 1.9], b: [1900, 1080, 1.9], look: [1500, 975, 0.8] }, // main-floor dice cluster
  { a: [320, 1260, 2.1], b: [820, 1290, 2.1], look: [560, 1760, 1.2] },
  { a: [2200, 1300, 1.8], b: [2780, 1320, 1.8], look: [2480, 1540, 0.6] },
  { a: [700, 640, 1.7], b: [1900, 640, 1.7], look: [1320, 940, 0.9] },
];
const SHOT = 9;
export const STATION_BACK = 0.3; // metres the eye sits back from a real seat's spot (the security desk, the VIP sofas)
const SITS = new Set(['cams', 'vip']); // the games have no seats: everyone stands at them

export async function init(canvas, { lowPower = false, progress = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.0; // (the graphics settings set both)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !lowPower; renderer.shadowMap.type = THREE.PCFShadowMap;
  // the AO pass draws the scene again; the shadow map and world matrices are brought up to date once per frame in draw()
  renderer.shadowMap.autoUpdate = false; renderer.info.autoReset = false;
  setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
  scene.background = new THREE.Color(0x0b0709);
  scene.fog = new THREE.Fog(0x1a0a0e, 18, 46);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentRoom = new RoomEnvironment();
  const env = pmrem.fromScene(environmentRoom, 0.04).texture;
  // The filtered environment texture stays in use; the source room and PMREM's
  // intermediate targets/materials are only needed while producing it.
  environmentRoom.dispose(); pmrem.dispose();
  scene.environment = env; scene.environmentIntensity = 0.28;
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 90);
  camera.rotation.order = 'YXZ';
  const hemi = new THREE.HemisphereLight(0xffd5a4, 0x261018, 0.36); scene.add(hemi);
  const fill = new THREE.AmbientLight(0x352128, 0.23); scene.add(fill);
  // a soft overhead key light that follows the camera and gives everything near you a contact shadow
  const key = new THREE.DirectionalLight(0xffd9ad, 0.68);
  key.castShadow = !lowPower; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 0.5, far: 24 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 3;
  scene.add(key, key.target);
  const torch = new THREE.PointLight(0xffd8a0, 0, 3.2, 1.6); scene.add(torch); // your own glow when the lights go out
  const pool = [];
  for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffd29a, 0, 10, 1.6); scene.add(l); pool.push(l); }
  const g0 = GLOWS.length, steps = buildWorldSteps(scene);
  let step, stage = 0;
  while (!(step = steps.next()).done) { progress(Math.min(.95, ++stage / 32), step.value); await nextPaint(); }
  const world = step.value, glowRange = [g0, GLOWS.length];
  const items = new Items(scene);
  const hazards = new Hazards(scene);
  const hands = new Hands(); hands.scene.matrixWorldAutoUpdate = /[?&]legacyHandMatrices\b/.test(location.search); hands.scene.environment = env; hands.scene.environmentIntensity = 0.3;
  const dealerSpots = world.machines.dealerSpots;
  const dealers = dealerSpots.map(() => makeBean({ color: '#22201e', hat: 'visor', dealer: true }));
  dealers.forEach(d => scene.add(d.root));
  // The frame, at the render resolution (the graphics settings pick the passes, see applyGfx): the casino (or the
  // screen-space reflections pass, which draws it itself), ambient occlusion, your hands, bloom, tone mapping, FXAA or
  // SMAA, then FSR 1 (or a plain bilinear copy) up to the screen when the render scale is not 100%.
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  const handPass = new RenderPass(hands.scene, hands.camera); handPass.clear = false; handPass.clearDepth = true;
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.15, 0.3, 1.0);
  const passes = { scene: new RenderPass(scene, camera), handPass, bloom, output: new OutputPass(), copy: new ShaderPass(CopyShader), gtao: null, ssr: null, fxaa: null, smaa: null, fsr: null };

  R = { death: new DeathScene(scene), renderer, scene, camera, composer, bloom, passes, hemi, fill, key, torch, pool, world, glowRange, items, hazards, hands, beans: new Map(), dealers, dealerSpots, lowPower,
    dark: 0, orbitA: 0, tourT: 0, last: performance.now(), size: '', fp: { bob: 0 }, me: -1, dyn: 1, dynT: 0, frameMs: 16.7, lightN: 8, bloomK: 0.15 };
  R.bartender = makeBean({ kind: 'bartender' }); scene.add(R.bartender.root);
  R.shady = makeBean({ color: '#34343c', hat: 'fedora' }); scene.add(R.shady.root);
  R.blk = new Blackout(scene);
  R.br = new Backrooms(R); // the backrooms casino (pub.backrooms)
  applyGfx({ ...PRESETS[lowPower ? 'low' : 'high'], tone: 'agx', exposure: 1, fov: 72, sharpness: 0.25, dynres: 0 });
  R.fsrReady = import('./fsr.js').then(m => { passes.fsr = new m.FSRPass({ sharpness: R.gfx.sharpness }); passes.fsr.name = 'fsr'; if (R.gfx) applyGfx(R.gfx); }).catch(() => { /* bilinear it is */ });
  progress(1, 'Casino built');
  return R;
}

// ---------- Graphics settings ----------
// Tone mapping, with the exposure that matches each one's brightness to the others at "100%".
const TONE = { agx: [THREE.AgXToneMapping, 0.78], aces: [THREE.ACESFilmicToneMapping, 1], neutral: [THREE.NeutralToneMapping, 1.17] };
const SHADOWS = { off: null, low: { size: 1024, radius: 1.5 }, high: { size: 2048, radius: 3 }, ultra: { size: 4096, radius: 4 } };
const BLOOM = { off: null, subtle: [0.15, 0.3, 1.0], strong: [0.34, 0.5, 0.9] }; // [strength, radius, threshold]
let lastAniso = 0;
// Apply the graphics settings (settings.js gfx). Cheap to call again: only what changed is rebuilt.
export function applyGfx(g) {
  if (!R) return;
  const prev = R.gfx || {}, r = R.renderer; R.gfx = { ...g };
  const [tm, ex] = TONE[g.tone] || TONE.agx; r.toneMapping = tm; r.toneMappingExposure = ex * (g.exposure || 1);
  // shadows: the key light's map size and softness (switching them on or off rebuilds every shader once)
  const sh = R.lowPower ? null : SHADOWS[g.shadows], on = !!sh;
  if (r.shadowMap.enabled !== on) { r.shadowMap.enabled = on; R.key.castShadow = on; dirtyMats(); }
  if (sh) {
    if (R.key.shadow.mapSize.x !== sh.size) { R.key.shadow.mapSize.set(sh.size, sh.size); if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; } }
    R.key.shadow.radius = sh.radius;
  }
  // multisampling on the frame (FXAA and SMAA work on the finished picture instead)
  const samples = g.aa === 'msaa8' ? Math.min(8, r.capabilities.maxSamples || 4) : g.aa === 'msaa' ? 4 : 0;
  for (const t of [R.composer.renderTarget1, R.composer.renderTarget2]) if (t.samples !== samples) { t.samples = samples; t.dispose(); }
  // the point lights that follow you (a new count rebuilds the shaders once)
  R.lightN = Math.max(2, Math.min(POOL, g.lights || 8));
  R.pool.forEach((l, i) => { l.visible = i < R.lightN; });
  const b = BLOOM[g.bloom]; if (b) { R.bloomK = b[0]; R.bloom.radius = b[1]; R.bloom.threshold = b[2]; }
  if (g.aniso !== lastAniso) { lastAniso = g.aniso; anisoAll(Math.min(g.aniso || 1, r.capabilities.getMaxAnisotropy())); }
  if (R.passes.fsr) R.passes.fsr.sharpness = g.sharpness ?? 0.25;
  if (g.scale !== prev.scale || g.dynres !== prev.dynres) R.dyn = 1;
  setPasses();
}
function dirtyMats() { for (const sc of [R.scene, R.hands.scene]) sc.traverse(o => { for (const m of o.material ? [].concat(o.material) : []) m.needsUpdate = true; }); }
// Texture filtering: new textures get it from textures.js; the ones already up are changed (and uploaded again) here.
function anisoAll(n) {
  setAniso(n);
  const seen = new Set();
  const material = m => {
    for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) {
      const t = m[k]; if (!t || seen.has(t) || t.isRenderTargetTexture || !t.generateMipmaps) continue;
      seen.add(t); if (t.anisotropy !== n) { t.anisotropy = n; t.needsUpdate = true; }
    }
  };
  for (const sc of [R.scene, R.hands.scene]) sc.traverse(o => { for (const m of o.material ? [].concat(o.material) : []) material(m); });
  for (const m of R.br?.materials() || []) material(m);
}
const effScale = () => Math.max(0.25, Math.min(2, (R.gfx.scale || 1) * R.dyn * (R.boost || 1)));
// Resolution stays at the selected setting; nearby characters no longer trigger a 2.56x pixel spike.
// The pass list for the current settings (EffectComposer renders the last enabled one to the screen).
function setPasses() {
  const P = R.passes, g = R.gfx, list = [];
  if (g.ssr && !R.lowPower) list.push(P.ssr || (P.ssr = makeSsr())); else list.push(P.scene);
  if (g.ao !== 'off' && !R.lowPower && !R.aoDropped) { list.push(P.gtao || (P.gtao = makeGtao())); P.gtao.half = g.ao !== 'full'; }
  list.push(P.handPass);
  if (g.bloom !== 'off') list.push(P.bloom);
  list.push(P.output);
  if (g.aa === 'fxaa') list.push(P.fxaa || (P.fxaa = new FXAAPass()));
  if (g.aa === 'smaa' || (g.ssr && /^msaa/.test(g.aa))) list.push(P.smaa || (P.smaa = new SMAAPass())); // (the reflections pass draws the casino without multisampling)
  if (Math.abs(effScale() - 1) > 0.001) list.push(g.upscaler === 'fsr' && P.fsr && effScale() < 1 ? P.fsr : P.copy);
  for (const p of list) p.enabled = true;
  R.composer.passes = list;
  R.size = ''; // the next frame sizes every pass
}
function makeGtao() {
  const gtao = new GTAOPass(R.scene, R.camera, 256, 256);
  gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
  // One override material alternated between skin/instance/static shader flags
  // on every draw. Identical materials per flag set keep Three's selection cached.
  const normals = new Map();
  gtao.normalForObject = o => {
    if (!splitPassMaterials) return gtao.normalMaterial;
    const key = passGeometryKey(o);
    if (!normals.has(key)) normals.set(key, gtao.normalMaterial.clone());
    return normals.get(key);
  };
  if (splitPassMaterials) {
    const override = gtao._renderOverride;
    gtao._renderOverride = function (renderer, material, ...args) {
      const direct = renderer.renderBufferDirect;
      renderer.renderBufferDirect = function (camera, scene, geometry, mat, object, group) {
        return direct.call(this, camera, scene, geometry, mat === gtao.normalMaterial ? gtao.normalForObject(object) : mat, object, group);
      };
      try { return override.call(this, renderer, material, ...args); }
      finally { renderer.renderBufferDirect = direct; }
    };
    const dispose = gtao.dispose;
    gtao.dispose = function () { for (const material of normals.values()) material.dispose(); normals.clear(); dispose.call(this); };
  }
  // AO comes only from solid meshes: skip glows, glass, sprites and anything marked noAO
  gtao._overrideVisibility = function () {
    const cache = this._visibilityCache;
    this.scene.traverseVisible(o => {
      if (!o.visible) return;
      const m = o.material, tr = m && !Array.isArray(m) && (m.transparent || m.blending === THREE.AdditiveBlending);
      if (o.isPoints || o.isLine || o.isSprite || tr || o.userData.noAO) { o.visible = false; cache.push(o); }
    });
  };
  gtao.half = true;
  const setSize = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => setSize(Math.max(1, gtao.half ? w >> 1 : w), Math.max(1, gtao.half ? h >> 1 : h)); // Half: AO at half resolution
  return gtao;
}
// Screen-space reflections: the floors, the polished wood and the glossy machines mirror what is on screen (the browser
// has no ray tracing hardware access; this is the same idea done on the finished frame). Glows, glass and light
// cones stay out of the normal and metalness passes.
function makeSsr() {
  const ssr = new SSRPass({ renderer: R.renderer, scene: R.scene, camera: R.camera, width: 256, height: 256, selects: [] });
  const set = new Set(); ssr._selects.includes = o => set.has(o); ssr.reflectSet = set;
  ssr.opacity = 0.42; ssr.maxDistance = 6; ssr.thickness = 0.03; ssr.blur = true; ssr.distanceAttenuation = true; ssr.fresnel = true;
  const variants = new Map(), sources = new Set([ssr.normalMaterial, ssr.metalnessOnMaterial, ssr.metalnessOffMaterial]);
  ssr.materialForObject = (o, material) => {
    if (!splitSsrMaterials) return material;
    const key = material.id + '/' + passGeometryKey(o);
    if (!variants.has(key)) variants.set(key, material.clone());
    return variants.get(key);
  };
  const withVariants = fn => function (renderer, ...args) {
    const direct = renderer.renderBufferDirect;
    renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      return direct.call(this, camera, scene, geometry, sources.has(material) ? ssr.materialForObject(object, material) : material, object, group);
    };
    try { return fn.call(this, renderer, ...args); }
    finally { renderer.renderBufferDirect = direct; }
  };
  const hide = fn => function (...a) {
    const hidden = [];
    this.scene.traverseVisible(o => { const m = o.material, tr = m && !Array.isArray(m) && (m.transparent || m.blending === THREE.AdditiveBlending); if (o.isSprite || o.isPoints || tr) hidden.push(o); });
    for (const o of hidden) o.visible = false;
    try { fn.apply(this, a); } finally { for (const o of hidden) o.visible = true; }
  };
  ssr._renderOverride = hide(withVariants(ssr._renderOverride)); ssr._renderMetalness = hide(withVariants(ssr._renderMetalness));
  const dispose = ssr.dispose;
  ssr.dispose = function () { for (const material of variants.values()) material.dispose(); variants.clear(); dispose.call(this); };
  fillReflects(ssr);
  return ssr;
}
function fillReflects(ssr) { ssr.reflectSet.clear(); R.world.group.traverse(o => { if (o.isMesh && [].concat(o.material).some(m => REFLECTS.has(m))) ssr.reflectSet.add(o); }); }
// Frame pacing for the dynamic resolution: the render scale steps down while frames run long, and back up when there
// is room again (never straight back to a step that was just too slow).
function dynRes(dt) {
  const tgt = R.gfx.dynres; if (!tgt) { if (R.dyn !== 1) { R.dyn = 1; setPasses(); } return; }
  R.frameMs += (dt * 1000 - R.frameMs) * 0.05; R.dynT += dt;
  const budget = 1000 / tgt, floor = Math.min(1, 0.5 / (R.gfx.scale || 1));
  if (R.dynT < 1.2) return;
  if (R.frameMs > budget * 1.12 && R.dyn > floor + 0.001) { R.tooSlow = R.dyn; R.dyn = Math.max(floor, +(R.dyn - 0.1).toFixed(2)); R.dynT = 0; R.slowAt = performance.now(); setPasses(); }
  else if (R.frameMs < budget * 1.03 && R.dyn < 1 && R.dynT > 4 && !(R.tooSlow && R.dyn + 0.1 >= R.tooSlow - 0.001 && performance.now() - R.slowAt < 20000)) { R.dyn = Math.min(1, +(R.dyn + 0.1).toFixed(2)); R.dynT = 0; setPasses(); }
}
// For the FPS readout and the settings screen.
export function gfxState() {
  if (!R) return null;
  return { internal: R.internal || [0, 0], out: R.outSize || [0, 0], scale: R.gfx ? effScale() : 1, dyn: R.dyn, fsr: R.composer.passes.includes(R.passes.fsr), ao: R.composer.passes.includes(R.passes.gtao),
    aoDropped: !!R.aoDropped, maxSamples: R.renderer.capabilities.maxSamples, maxAniso: R.renderer.capabilities.getMaxAnisotropy(), passes: R.composer.passes.map(p => p.name || p.constructor.name) };
}

// Swap the hand-built casino for the one with the hero props. Its procedural geometry is dropped; the prop models,
// materials and canvas textures are shared and stay.
function rebuildWorld() {
  R.rebuild = false;
  const old = R.world;
  R.scene.remove(old.group);
  const oldGlows = new Set(GLOWS.slice(R.glowRange[0], R.glowRange[1])), g0 = GLOWS.length;
  R.world = buildWorld(R.scene);
  const newGlows = new Set(GLOWS.slice(g0));
  // free what only the old casino used (its screens' canvases, per-build materials); anything the new one shares stays
  const keepM = new Set(), keepT = new Set();
  const mats = o => o.material ? [].concat(o.material) : [];
  const maps = m => ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].map(k => m[k]).filter(Boolean);
  R.world.group.traverse(o => { for (const m of mats(o)) { keepM.add(m); for (const t of maps(m)) keepT.add(t); } });
  old.group.traverse(o => {
    if (o.geometry && !o.userData.prop) o.geometry.dispose();
    if (o.userData.prop) return;
    for (const m of mats(o)) if (!keepM.has(m)) { for (const t of maps(m)) if (!keepT.has(t) && t.image instanceof HTMLCanvasElement) t.dispose(); m.dispose(); }
  });
  // the lights-out list: one entry per material (the new build re-adds the shared ones it uses, so keep the first)
  const seen = new Set();
  for (let i = 0; i < GLOWS.length; i++) {
    const e = GLOWS[i], k = e.m.uuid + e.k;
    if (seen.has(k) || (oldGlows.has(e) && !keepM.has(e.m))) GLOWS.splice(i--, 1);
    else { seen.add(k); if (oldGlows.has(e)) newGlows.add(e); }
  }
  // the world's entries sit together again at the end, so the next rebuild can find them
  const rest = GLOWS.filter(e => !newGlows.has(e)), mine = GLOWS.filter(e => newGlows.has(e));
  GLOWS.length = 0; GLOWS.push(...rest, ...mine);
  R.glowRange = [rest.length, GLOWS.length];
  if (R.passes.ssr) fillReflects(R.passes.ssr);
  if (lastAniso) anisoAll(Math.min(lastAniso, R.renderer.capabilities.getMaxAnisotropy()));
  // compile the new casino's shaders now (off the main thread where the GPU allows), not on first sight of each room
  try {
    if (R.renderer.extensions.has('KHR_parallel_shader_compile')) R.renderer.compileAsync(R.scene, R.camera).catch(() => {});
    else R.renderer.compile(R.scene, R.camera);
    // and upload every texture now: the first look into the bar used to stall on them
    const seenT = new Set();
    R.scene.traverse(o => { for (const m of o.material ? [].concat(o.material) : []) for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap']) {
      const t = m[k]; if (t && !seenT.has(t)) { seenT.add(t); R.renderer.initTexture(t); }
    } });
  } catch (e) { /* it compiles lazily instead */ }
}

// Phones draw at their own pixel density (Steve, 2026-10-15: "very low resolution and blurry on mobile"; they were
// drawn at 1x, then at the Low preset's 59%), up to 2x, or 2.5x on a phone with 8+ cores and 8 GB. Their savings come
// from the effects instead: no shadows, AO or reflections on a phone, and the Low preset's FXAA, no bloom, four lamps.
const PHONE_PR = (navigator.hardwareConcurrency || 4) >= 8 && (navigator.deviceMemory || 4) >= 8 ? 2.5 : 2;
function resize() {
  const c = R.renderer.domElement, FOV = R.gfx.fov || 72;
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  const pr = Math.min(window.devicePixelRatio || 1, R.lowPower ? PHONE_PR : 2), s = effScale(); // the canvas has the display's own pixels; the frame is drawn at s of that
  const key = w + 'x' + h + '@' + pr + '/' + s + '/' + FOV; if (key === R.size) return; R.size = key;
  R.renderer.setPixelRatio(pr); R.renderer.setSize(w, h, false); R.pr = pr;
  if (R.lowPower) { c.style.width = w + 'px'; c.style.height = h + 'px'; } else { c.style.width = '100vw'; c.style.height = '100vh'; } // (a phone's 100vh can run past the visible page)
  R.composer.setPixelRatio(pr * s); R.composer.setSize(w, h);
  R.internal = [Math.round(w * pr * s), Math.round(h * pr * s)]; R.outSize = [Math.round(w * pr), Math.round(h * pr)];
  R.bloom.resolution.set(R.internal[0] / 2, R.internal[1] / 2);
  if (R.passes.fsr) R.passes.fsr.setOutputSize(R.outSize[0], R.outSize[1]);
  // keep roughly the same horizontal view on tall screens
  const aspect = w / h, fov = aspect < 1 ? Math.min(100, 2 * Math.atan(Math.tan(FOV * Math.PI / 360) * 1.6 / aspect) * 180 / Math.PI * 0.62) : FOV;
  R.camera.aspect = aspect; R.baseFov = fov; R.camera.fov = fov * (R.zoom || 1); R.camera.updateProjectionMatrix();
  R.hands.setAspect(aspect, R.camera.fov);
}

// Name tags in a crowd: nearest first, and a tag that would sit on top of a nearer one stays hidden this frame.
const camFwd = new THREE.Vector3(), lp = new THREE.Vector3(), ls = new THREE.Vector3(), tags = [], placed = [];
const legacyLabelMatrices = /[?&]legacyLabelMatrices\b/.test(location.search); // diagnostic comparison
function declutterLabels(cam) {
  tags.length = 0; placed.length = 0;
  const P = cam.projectionMatrix.elements;
  for (const b of R.beans.values()) {
    const l = b.label; if (!l || !b.root.visible) continue;
    l.visible = true;
    if (legacyLabelMatrices) l.getWorldPosition(lp); else lp.setFromMatrixPosition(l.matrixWorld);
    const d = lp.distanceToSquared(cam.position);
    if (R.wasBlk && d > 9) { l.visible = false; continue; } // in a blackout a name shows only up close: tags would give the hiders away
    lp.project(cam);
    if (lp.z > 1 || Math.abs(lp.x) > 1.3 || Math.abs(lp.y) > 1.3) continue;
    // The visible-matrix pass has already updated this sprite and its parents.
    // Reading scale directly also avoids decomposing an unused quaternion.
    if (legacyLabelMatrices) l.getWorldScale(ls);
    else { ls.setFromMatrixScale(l.matrixWorld); if (l.matrixWorld.determinant() < 0) ls.x = -ls.x; }
    // screen-sized sprites: half their size in NDC is scale x projection / 2
    tags.push({ l, d, x: lp.x, y: lp.y, w: ls.x * P[0] / 2, h: ls.y * P[5] / 2 });
  }
  tags.sort((a, b) => a.d - b.d);
  for (const e of tags) {
    if (placed.some(a => Math.abs(a.x - e.x) < a.w + e.w && Math.abs(a.y - e.y) < (a.h + e.h) * 0.9)) e.l.visible = false;
    else placed.push(e);
  }
}
// Killer edges: a red glow where each gambler stands (killer sense: through the walls; night eyes: in the dark), and the
// jackpot lure's flashing beacon.
let glowTexture = null;
function glowTex() {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d'); g.translate(32, 64); g.scale(1, 2);
  const gr = g.createRadialGradient(0, 0, 2, 0, 0, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 31, 0, 7); g.fill();
  return (glowTexture = new THREE.CanvasTexture(c));
}
function glowSprite(color) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.renderOrder = 998; R.scene.add(s); return s;
}
function edgeGlows(pub, priv) {
  const glows = R.glows || (R.glows = new Map());
  const play = pub && priv && pub.mode === 'play' && !pub.over && priv.alive;
  const sense = play && priv.perk === 'sense' && priv.senseT > 0 ? Math.min(1, priv.senseT / 0.4) : 0;
  const night = play && priv.perk === 'night' && pub.lightsT > 0 ? Math.min(1, R.dark / 0.3) : 0;
  const k = Math.max(sense, night * 0.8), used = new Set();
  if (k > 0.01) for (const c of pub.chars) {
    if (!c.alive || c.id === priv.me || priv.killers.includes(c.id)) continue;
    const b = R.beans.get(c.id); if (!b) continue;
    let s = glows.get(c.id); if (!s) glows.set(c.id, s = glowSprite(0xff2a18));
    s.visible = true; used.add(c.id);
    const far = Math.max(1, b.root.position.distanceTo(R.camera.position) / 7); // far ones grow, so a glow across the casino still reads
    s.position.set(b.root.position.x, 0.95, b.root.position.z); s.scale.set(1.1 * far, 2.2 * far, 1);
    s.material.opacity = k * 0.9; s.material.depthTest = !sense; // the sense sees through walls; night eyes only what is in view
  }
  for (const [id, s] of glows) if (!used.has(id)) s.visible = false;
  // the lure: a beacon over the machine, and a pooled light flashing red and gold
  const L = pub && pub.mode === 'play' && !pub.over ? pub.lure : null, spots = R.world.lightSpots;
  if (!R.lure) { R.lure = { spr: glowSprite(0xff3020), spot: { p: new THREE.Vector3(), color: 0xff3020, power: 0, range: 9 } }; }
  const lu = R.lure, on = !!L, i = spots.indexOf(lu.spot);
  lu.spr.visible = on;
  if (on) {
    const red = Math.floor(performance.now() / 250) % 2 === 0, col = red ? 0xff3020 : 0xffd040;
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 60);
    lu.spr.position.set(L.x * M, 2.7, L.y * M); lu.spr.scale.set(3.2 * pulse, 3.2 * pulse, 1); lu.spr.material.color.setHex(col); lu.spr.material.opacity = 1;
    lu.spot.p.set(L.x * M, 2.4, L.y * M); lu.spot.color = col; lu.spot.power = 7;
    if (i < 0) spots.push(lu.spot);
  } else if (i >= 0) spots.splice(i, 1);
}
// A character leaving the scene frees its name tag (its own canvas).
function dropBean(b) { R.scene.remove(b.root); if (b.dispose) b.dispose(); else { const l = b.label; if (l) { l.material.map?.dispose(); l.material.dispose(); } } }
function beanFor(c) {
  let b = R.beans.get(c.id);
  const key = c.color + c.hat + plushReady();
  if (!b || b.key !== key) {
    if (b) dropBean(b);
    b = makeBean({ color: c.color, hat: c.hat, name: c.name }); b.key = key; b.name = c.name;
    R.scene.add(b.root); R.beans.set(c.id, b);
  }
  return b;
}

// The nearest light spots get the pooled point lights; the edge of the set fades so nothing pops.
function placeLights(cam, lit) {
  const spots = R.world.lightSpots;
  const cache = R.lightSelection || (R.lightSelection = { spots: null, camera: new THREE.Vector3(NaN, NaN, NaN), entries: [], order: [] });
  const moved = !cache.camera.equals(cam), entries = cache.entries;
  let dirty = moved || cache.spots !== spots || entries.length !== spots.length;
  cache.spots = spots; cache.camera.copy(cam);
  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    let e = entries[i];
    if (!e) e = entries[i] = { spot: null, position: new THREE.Vector3(NaN, NaN, NaN), distance: 0, index: i };
    if (moved || e.spot !== spot || !e.position.equals(spot.p)) {
      e.spot = spot; e.position.copy(spot.p); e.distance = spot.p.distanceToSquared(cam); dirty = true;
    }
  }
  entries.length = spots.length;
  const order = cache.order;
  if (dirty) {
    order.length = entries.length;
    for (let i = 0; i < entries.length; i++) order[i] = entries[i];
    order.sort((a, b) => a.distance - b.distance || a.index - b.index);
  }
  const n = R.lightN, edge = order.length > n ? Math.sqrt(order[n].distance) : 1e9;
  for (let k = 0; k < n; k++) {
    const L = R.pool[k], e = order[k];
    if (!e) { L.intensity = 0; continue; }
    // Power/color still update every frame (falling fixtures and Backrooms).
    const s = e.spot, d = Math.sqrt(e.distance);
    L.position.copy(s.p); L.color.setHex(s.color); L.distance = s.range;
    L.intensity = s.power * Math.min(1, Math.max(0, (edge - d) / 4)) * lit;
  }
}

// ---------- The table camera ----------
// Seated at a game, the camera rises behind your seat and looks down on the whole game, like a dealer's-eye view:
// the points the rig names (rig.focus()) are fitted into the part of the screen the HUD leaves free. Extra points
// (the roulette wheel, the pond, the Crash screen) come along when they fit under the ceiling.
const CEIL = 3.45, shotCam = new THREE.PerspectiveCamera(46, 1, 0.05, 90), pv = new THREE.Vector3(), pc = new THREE.Vector3();
shotCam.rotation.order = 'YXZ';
function fitShot(pts, look, pitch, fov, aspect, safe) {
  shotCam.fov = fov; shotCam.aspect = aspect; shotCam.updateProjectionMatrix();
  shotCam.rotation.set(pitch, -look - Math.PI / 2, 0); shotCam.updateMatrix();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(shotCam.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(shotCam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(shotCam.quaternion);
  const box = new THREE.Box3().setFromPoints(pts), c = box.getCenter(new THREE.Vector3());
  const th = Math.tan(fov * Math.PI / 360), tw = th * aspect;
  const sx = (safe.x0 + safe.x1) / 2, sy = (safe.y0 + safe.y1) / 2, sw = safe.x1 - safe.x0, sh = safe.y1 - safe.y0;
  const at = D => {
    const pos = c.clone().addScaledVector(fwd, -D);
    let b = null;
    for (let it = 0; it < 5; it++) {
      shotCam.position.copy(pos); shotCam.updateMatrixWorld(true);
      b = { x0: 9, x1: -9, y0: 9, y1: -9, behind: false };
      for (const p of pts) {
        pc.copy(p).applyMatrix4(shotCam.matrixWorldInverse); if (pc.z > -0.05) { b.behind = true; break; }
        pv.copy(p).project(shotCam); b.x0 = Math.min(b.x0, pv.x); b.x1 = Math.max(b.x1, pv.x); b.y0 = Math.min(b.y0, pv.y); b.y1 = Math.max(b.y1, pv.y);
      }
      if (b.behind) break;
      pos.addScaledVector(right, ((b.x0 + b.x1) / 2 - sx) * tw * D).addScaledVector(up, ((b.y0 + b.y1) / 2 - sy) * th * D);
    }
    return { pos, ok: !b.behind && b.x1 - b.x0 <= sw && b.y1 - b.y0 <= sh };
  };
  let lo = 0.4, hi = 16;
  if (!at(hi).ok) return null;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (at(mid).ok) hi = mid; else lo = mid; }
  const r = at(hi);
  return { pos: r.pos, quat: shotCam.quaternion.clone(), fov };
}
function tableShot(F, aspect, safe) {
  const key = [F.key, aspect.toFixed(3), safe.y0.toFixed(3), safe.y1.toFixed(3)].join();
  if (R.shotKey === key) return R.shot;
  if (F.fixed) { shotCam.position.copy(F.fixed.pos); shotCam.lookAt(F.fixed.at); R.shotKey = key; return (R.shot = { pos: F.fixed.pos.clone(), quat: shotCam.quaternion.clone(), fov: F.fixed.fov }); }
  // the camera has to stay under the ceiling and inside your room (a seat with its back to a wall looks down steeper)
  const room = ROOMS[roomOf({ x: F.at[0], y: F.at[1] })], pad = 12;
  const ok = s => s && s.pos.y <= CEIL && s.pos.x / M > room.x + pad && s.pos.x / M < room.x + room.w - pad && s.pos.z / M > room.y + pad && s.pos.z / M < room.y + room.h - pad;
  let best = null;
  for (const pts of F.extra.length ? [F.core.concat(F.extra), F.core] : [F.core]) {
    for (const dp of [0, 0.15, -0.2, 0.3, -0.4, -0.6]) {
      const pitch = Math.max(-1.45, Math.min(-0.05, F.pitch + dp));
      for (let fov = F.fov; fov <= 72 && !best; fov += 4) { const s = fitShot(pts, F.look, pitch, fov, aspect, safe); if (ok(s)) best = s; }
      if (best) break;
    }
    if (best) break;
  }
  if (!best) { best = fitShot(F.core, F.look, F.pitch, 76, aspect, safe); if (best) { const p = best.pos; p.y = Math.min(p.y, CEIL); p.x = Math.max((room.x + pad) * M, Math.min((room.x + room.w - pad) * M, p.x)); p.z = Math.max((room.y + pad) * M, Math.min((room.y + room.h - pad) * M, p.z)); } }
  R.shotKey = key; R.shot = best;
  return best;
}

// frame: { pub, priv, me: {x,y,look,pitch,moving}, mode: 'fp'|'orbit', my: panel view, table: seated at a game (the
// table camera), safe: { top, bottom } CSS px the HUD covers }
// Hero props are most of the triangles. In first person only the rooms you can see into are drawn: your own, then any
// room whose doorway shows on screen inside the doorway you are already looking through.
const PORTALS = DOORS.map(d => {
  const mx = (d.pa.x + d.pb.x) / 2, my = (d.pa.y + d.pb.y) / 2;
  const g = DOOR_GAPS.find(g => mx >= g.x - 1 && mx <= g.x + g.w + 1 && my >= g.y - 1 && my <= g.y + g.h + 1);
  return { a: d.a, b: d.b, box: new THREE.Box3(new THREE.Vector3(g.x * M, 0, g.y * M), new THREE.Vector3((g.x + g.w) * M, WALL_H, (g.y + g.h) * M)) };
});
const cornerV = new THREE.Vector3(), cullFr = new THREE.Frustum(), cullVP = new THREE.Matrix4();
// A doorway's extent on screen as [x0, y0, x1, y1] in NDC, the whole screen when it reaches behind you, null when off it.
function portalRect(box, cam) {
  if (!cullFr.intersectsBox(box)) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    cornerV.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(cam.matrixWorldInverse);
    if (cornerV.z > -cam.near) return [-1, -1, 1, 1];
    cornerV.applyMatrix4(cam.projectionMatrix);
    x0 = Math.min(x0, cornerV.x); y0 = Math.min(y0, cornerV.y); x1 = Math.max(x1, cornerV.x); y1 = Math.max(y1, cornerV.y);
  }
  return x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1 ? null : [x0, y0, x1, y1];
}
const coarseCull = /[?&]coarseCull\b/.test(location.search); // diagnostic comparison with room-only culling
const actorBox = new THREE.Box3(), actorCenter = new THREE.Vector3(), actorSize = new THREE.Vector3(1.8, 2.6, 1.8);
let poseFrame = 0;
const guardedSkeletons = new WeakSet();
const passGeometryKeys = new WeakMap();
function passGeometryKey(o) {
  const geometry = o.geometry, morph = geometry.morphAttributes;
  const flags = (o.isSkinnedMesh ? 1 : 0) | (o.isInstancedMesh ? 2 : 0) | (o.isBatchedMesh ? 4 : 0) | (o.instanceColor ? 8 : 0) | (o.morphTexture ? 16 : 0) | (o.colorTexture ? 32 : 0);
  const p = morph.position?.length || 0, n = morph.normal?.length || 0, c = morph.color?.length || 0;
  let entry = passGeometryKeys.get(geometry);
  if (!entry || entry.p !== p || entry.n !== n || entry.c !== c) { entry = { p, n, c, keys: new Map() }; passGeometryKeys.set(geometry, entry); }
  if (!entry.keys.has(flags)) entry.keys.set(flags, [flags, p, n, c].join('/'));
  return entry.keys.get(flags);
}
const ordinaryShadowSource = m => m && !(m.alphaTest > 0 || m.alphaToCoverage || m.alphaMap || m.displacementMap || m.clippingPlanes?.length);
const shadowSideOf = m => m.shadowSide ?? (m.side === THREE.FrontSide ? THREE.BackSide : m.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
function prepareShadowMaterial(o) {
  if (!splitPassMaterials || !o.isMesh || !o.castShadow) return;
  const assignments = R.shadowAssignments || (R.shadowAssignments = new WeakMap()), previous = assignments.get(o);
  if (o.customDepthMaterial !== undefined && o.customDepthMaterial !== previous?.depth) return;
  const sources = o.material, m = Array.isArray(sources) ? sources[0] : sources;
  // Three keeps specialized variants for alpha/displacement/clipping. Preserve
  // those paths and any authored custom depth material.
  let ordinary = ordinaryShadowSource(m);
  // Chips, coins and the dice puck have several opaque material groups. They
  // can retain one geometry-specific depth variant when every group uses the
  // same shadow faces. Mixed/specialized groups keep Three's native handling.
  if (ordinary && Array.isArray(sources)) {
    const side = shadowSideOf(m);
    for (const source of sources) if (!ordinaryShadowSource(source) || shadowSideOf(source) !== side) { ordinary = false; break; }
  }
  if (!ordinary) {
    if (previous) { delete o.customDepthMaterial; assignments.delete(o); }
    return;
  }
  const side = shadowSideOf(m);
  const key = passGeometryKey(o) + '/' + side;
  if (previous?.source === m && previous.key === key) return;
  const variants = R.shadowMaterials || (R.shadowMaterials = new Map());
  if (!variants.has(key)) variants.set(key, new THREE.MeshDepthMaterial({ side }));
  o.customDepthMaterial = variants.get(key); assignments.set(o, { depth: o.customDepthMaterial, source: m, key });
}
// Object3D.updateMatrixWorld walks invisible subtrees too. Rendering skips them;
// update their matrices on the frame they become visible, before any render pass.
function updateVisibleMatrices(object) {
  if (!object.visible) return;
  const bodyState = object.userData.bodyPoseState, bodyCache = bodyState && object.userData.bodyWorldCache;
  if (bodyState && bodyCache) {
    const sameParent = bodyCache.parentMatrix.equals(object.parent.matrixWorld);
    if (sameParent && bodyCache.version === bodyState.version && bodyCache.gfx === R.gfx) return;
    // A moved parent changes world-space skinning even if the corpse's joints
    // stayed fixed. Invalidate its bone texture together with its matrices.
    if (!sameParent) bodyState.version++;
  }
  prepareShadowMaterial(object);
  // SkinnedMesh.updateMatrixWorld also refreshes bindMatrixInverse. Calling
  // only Object3D.updateWorldMatrix leaves the body transformed twice while
  // attached hats stay in place. Let Three update that visible mesh subtree.
  if (object.isSkinnedMesh) {
    const skeleton = object.skeleton;
    if (!guardedSkeletons.has(skeleton)) {
      guardedSkeletons.add(skeleton); const update = skeleton.update; let lastFrame = -1, lastVersion;
      // Three counts each AO/color render as a new frame. The pose stays fixed
      // across those passes; reuse its bone matrices and GPU texture upload.
      // Corpse revisions also survive display frames until their fall changes.
      skeleton.update = function () {
        const version = bodyPoseVersion(this);
        if (lastFrame === poseFrame || (version !== undefined && version === lastVersion)) return;
        lastFrame = poseFrame; lastVersion = version; update.call(this);
      };
    }
    object.updateMatrixWorld(true); return;
  }
  object.updateWorldMatrix(false, false, true);
  for (const child of object.children) updateVisibleMatrices(child);
  if (bodyState) {
    const cache = bodyCache || (object.userData.bodyWorldCache = { parentMatrix: new THREE.Matrix4() });
    cache.version = bodyState.version; cache.gfx = R.gfx; cache.parentMatrix.copy(object.parent.matrixWorld);
  }
}
function cullRooms(cam, all) {
  if (!R.roomProps || R.roomProps.world !== R.world) { const list = []; R.world.group.traverse(o => { if (o.userData.room) list.push(o); }); R.roomProps = { world: R.world, list }; }
  const props = R.roomProps;
  let cache = R.portalVisibility;
  const changed = !cache || cache.props !== props || cache.count !== props.list.length || cache.all !== all || cache.near !== cam.near ||
    !cache.position.equals(cam.position) || !cache.projection.equals(cam.projectionMatrix) || !cache.inverse.equals(cam.matrixWorldInverse);
  let seen = changed ? null : cache.seen, start = changed ? null : cache.start, windows = changed ? new Map() : cache.windows;
  if (changed && !all) {
    cullFr.setFromProjectionMatrix(cullVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    start = roomOf({ x: cam.position.x / M, y: cam.position.z / M });
    seen = new Set([start]); windows.set(start, [[-1, -1, 1, 1]]);
    for (const q = [[start, [-1, -1, 1, 1], null]]; q.length;) {
      const [r, win, via] = q.pop();
      for (const p of PORTALS) {
        if (p === via) continue;
        const o = p.a === r ? p.b : p.b === r ? p.a : null; if (!o || o === start) continue;
        const pr = portalRect(p.box, cam); if (!pr) continue;
        const cut = [Math.max(pr[0], win[0]), Math.max(pr[1], win[1]), Math.min(pr[2], win[2]), Math.min(pr[3], win[3])];
        if (cut[0] >= cut[2] || cut[1] >= cut[3]) continue;
        if (!windows.has(o)) windows.set(o, []);
        if (windows.get(o).some(w => w[0] <= cut[0] && w[1] <= cut[1] && w[2] >= cut[2] && w[3] >= cut[3])) continue;
        windows.get(o).push(cut); seen.add(o); q.push([o, cut, p]);
      }
    }
  }
  // A visible doorway exposes only its projected window, not every object behind that room's walls.
  const visible = (room, bounds) => {
    if (!seen || room === start) return true;
    if (!seen.has(room)) return false;
    if (coarseCull) return true;
    if (!bounds) return true;
    const rect = portalRect(bounds, cam); if (!rect) return false;
    return windows.get(room).some(w => rect[0] <= w[2] && rect[2] >= w[0] && rect[1] <= w[3] && rect[3] >= w[1]);
  };
  const actorVisible = b => {
    actorCenter.copy(b.root.position); actorCenter.y += 1.3; actorBox.setFromCenterAndSize(actorCenter, actorSize);
    return visible(roomOf({ x: b.root.position.x / M, y: b.root.position.z / M }), actorBox);
  };
  // Doorways and room props are fixed. Moving actors still get fresh bounds
  // below, even when the camera can reuse its doorway windows and prop results.
  if (changed) {
    for (const o of props.list) o.visible = visible(o.userData.room, o.boundingBox);
    if (!cache) cache = R.portalVisibility = { position: new THREE.Vector3(), projection: new THREE.Matrix4(), inverse: new THREE.Matrix4() };
    cache.props = props; cache.count = props.list.length; cache.all = all; cache.near = cam.near;
    cache.position.copy(cam.position); cache.projection.copy(cam.projectionMatrix); cache.inverse.copy(cam.matrixWorldInverse);
    cache.seen = seen; cache.start = start; cache.windows = windows;
  }
  if (seen) for (const b of R.beans.values()) if (b.root.visible) b.root.visible = actorVisible(b);
  R.dealers.forEach(b => { b.root.visible = actorVisible(b); });
  if (R.bartender) R.bartender.root.visible = actorVisible(R.bartender);
  if (R.shady) R.shady.root.visible = actorVisible(R.shady);
  R.roomsSeen = seen ? [...seen] : null;
}


// Same-room actors can be behind the camera yet still cost a complete shadow
// submission. Cull only after posing and item updates, so gestures and held
// props keep their normal timeline while the actor is outside the view.
const actorViewFrustum = new THREE.Frustum(), actorViewMatrix = new THREE.Matrix4();
const actorViewBox = new THREE.Box3(), actorLabelPoint = new THREE.Vector3();
function cullOffscreenActors(cam, poses) {
  actorViewFrustum.setFromProjectionMatrix(actorViewMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const shadows = R.renderer.shadowMap.enabled && R.key.castShadow;
  const lightY = R.key.position.y - R.key.target.position.y;
  if (shadows && lightY <= 0) return 0;
  const lightX = shadows ? -(R.key.position.x - R.key.target.position.x) / lightY : 0;
  const lightZ = shadows ? -(R.key.position.z - R.key.target.position.z) / lightY : 0;
  let culled = 0;
  for (const { b } of poses) {
    const root = b.root;
    if (!root.visible || root.scale.x !== 1 || root.scale.y !== 1 || root.scale.z !== 1) continue;
    const p = root.position;
    // Include raised arms, gestures, held food/glasses, hats and poison bubbles.
    actorViewBox.min.set(p.x - 1.5, p.y - .5, p.z - 1.5);
    actorViewBox.max.set(p.x + 1.5, p.y + 3.5, p.z + 1.5);
    if (actorViewFrustum.intersectsBox(actorViewBox)) continue;
    if (shadows) {
      // Include the complete directional shadow down to below the floor, plus
      // a filtering margin. A body outside the view may still cast into it.
      const height = Math.max(0, actorViewBox.max.y + .5), dx = lightX * height, dz = lightZ * height;
      actorViewBox.min.x += Math.min(0, dx) - .15; actorViewBox.max.x += Math.max(0, dx) + .15;
      actorViewBox.min.z += Math.min(0, dz) - .15; actorViewBox.max.z += Math.max(0, dz) + .15;
      actorViewBox.min.y = Math.min(-.5, actorViewBox.min.y);
      if (actorViewFrustum.intersectsBox(actorViewBox)) continue;
    }
    // Name tags use screen-sized sprites. Keep any tag that can enter the view
    // or participate in the existing, wider decluttering region.
    if (b.label) {
      actorLabelPoint.copy(b.label.position).applyEuler(root.rotation).add(p).applyMatrix4(cam.matrixWorldInverse);
      if (actorLabelPoint.z >= -cam.near) { if (actorLabelPoint.z < 3.5) continue; }
      else {
        actorLabelPoint.applyMatrix4(cam.projectionMatrix);
        const w = Math.abs(b.label.scale.x * cam.projectionMatrix.elements[0] / 2), h = Math.abs(b.label.scale.y * cam.projectionMatrix.elements[5] / 2);
        if (actorLabelPoint.z <= 1 && Math.abs(actorLabelPoint.x) <= 1.3 + w && Math.abs(actorLabelPoint.y) <= 1.3 + h) continue;
      }
    }
    root.visible = false; ++culled;
  }
  return culled;
}

// Fixed scenery may sit inside the key's shadow camera while neither its body
// nor its projected shadow can reach the current view. Keep the portal decision
// intact: temporarily suppress only these draws, then restore visibility even if
// rendering fails. Bounds follow parent transforms; unchanged views reuse them.
const sceneryFrustum = new THREE.Frustum(), sceneryVP = new THREE.Matrix4(), sceneryBox = new THREE.Box3();
function cullOffscreenScenery(cam) {
  let cache = R.sceneryCull;
  if (!cache || cache.world !== R.world) {
    const entries = [];
    R.world.group.traverse(object => { if (object.userData.fixedScenery) entries.push({ object, matrix: new THREE.Matrix4(), bounds: new THREE.Box3(), epoch: -1 }); });
    cache = R.sceneryCull = { world: R.world, entries, hidden: [], projection: new THREE.Matrix4(), inverse: new THREE.Matrix4(), epoch: 0 };
  }
  cache.hidden.length = 0;
  const shadows = R.renderer.shadowMap.enabled && R.key.castShadow;
  const ly = R.key.position.y - R.key.target.position.y;
  if (shadows && ly <= 0) return cache.hidden;
  const lx = shadows ? -(R.key.position.x - R.key.target.position.x) / ly : 0;
  const lz = shadows ? -(R.key.position.z - R.key.target.position.z) / ly : 0;
  if (!cache.epoch || !cache.projection.equals(cam.projectionMatrix) || !cache.inverse.equals(cam.matrixWorldInverse) || cache.shadows !== shadows || cache.lx !== lx || cache.lz !== lz) {
    cache.projection.copy(cam.projectionMatrix); cache.inverse.copy(cam.matrixWorldInverse);
    cache.shadows = shadows; cache.lx = lx; cache.lz = lz; ++cache.epoch;
    sceneryFrustum.setFromProjectionMatrix(sceneryVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  }
  for (const entry of cache.entries) {
    const o = entry.object;
    if (!o.visible) continue;
    const moved = entry.epoch < 0 || !entry.matrix.equals(o.matrixWorld);
    if (moved) {
      const bounds = o.isInstancedMesh ? o.boundingBox : o.geometry.boundingBox;
      if (!bounds || bounds.isEmpty()) continue;
      entry.matrix.copy(o.matrixWorld); entry.bounds.copy(bounds).applyMatrix4(o.matrixWorld);
    }
    if (moved || entry.epoch !== cache.epoch || entry.cast !== o.castShadow) {
      entry.epoch = cache.epoch; entry.cast = o.castShadow;
      sceneryBox.copy(entry.bounds);
      entry.culled = !sceneryFrustum.intersectsBox(sceneryBox);
      if (entry.culled && shadows && o.castShadow) {
        const height = Math.max(0, sceneryBox.max.y + .5), dx = lx * height, dz = lz * height;
        sceneryBox.min.x += Math.min(0, dx) - .15; sceneryBox.max.x += Math.max(0, dx) + .15;
        sceneryBox.min.z += Math.min(0, dz) - .15; sceneryBox.max.z += Math.max(0, dz) + .15;
        sceneryBox.min.y = Math.min(-.5, sceneryBox.min.y);
        entry.culled = !sceneryFrustum.intersectsBox(sceneryBox);
      }
    }
    if (entry.culled) { o.visible = false; cache.hidden.push(o); }
  }
  return cache.hidden;
}

export function draw(frame, { prepareOnly = false } = {}) {
  if (!R) return;
  ++poseFrame;
  if (R.rebuild && !frame.my) rebuildWorld();
  R.renderer.info.reset();
  resize();
  const now = performance.now(); const dt = Math.min(0.1, (now - R.last) / 1000); R.last = now;
  // with dynamic resolution on, a machine still under about 45 fps at the lowest scale for five seconds of play drops
  // the ambient occlusion pass (a whole extra draw)
  if (frame.pub && document.visibilityState === 'visible') {
    dynRes(dt);
    if (R.gfx.dynres && R.composer.passes.includes(R.passes.gtao)) {
      R.slowT = dt > 1 / 45 && R.dyn <= Math.min(1, 0.5 / (R.gfx.scale || 1)) + 0.001 ? (R.slowT || 0) + dt : Math.max(0, (R.slowT || 0) - dt * 0.5);
      if (R.slowT > 5) { R.aoDropped = true; setPasses(); }
    }
  }
  const { pub, priv, me } = frame;
  // seated on a phone in landscape the view narrows a little so the table's parts are big enough to tap
  const zoom = frame.zoom || 1;
  if (Math.abs((R.zoom || 1) - zoom) > 0.002) { R.zoom = (R.zoom || 1) + (zoom - (R.zoom || 1)) * Math.min(1, dt * 5); if (Math.abs(R.zoom - zoom) < 0.004) R.zoom = zoom; R.hands.setAspect(R.camera.aspect, R.baseFov * R.zoom); }
  const t = pub ? pub.t : now / 1000;
  const orbit = frame.mode !== 'fp' || !pub;
  const meeting = pub && pub.mode === 'meeting';
  // lights out: fade everything but your own glow
  // (killers knew it was coming: their eyes are used to the dark, and night eyes see in it)
  // (the monster sees better than anyone)
  const want = pub && pub.lightsT > 0 && !pub.over && pub.mode === 'play' ? (priv && priv.monster ? 0.5 : priv && priv.isKiller && priv.alive ? (priv.perk === 'night' ? 0.35 : 0.62) : 1) : 0;
  R.dark += (want - R.dark) * Math.min(1, dt * (want ? 6 : 2));
  // a blackout goes out and comes back on in one frame: the frame the monster turns back into the killer's own body
  const blk = !!(pub && pub.blackout && !pub.over && pub.mode === 'play');
  if (blk !== !!R.wasBlk) R.dark = want;
  R.wasBlk = blk;
  R.br.update(!!(pub && pub.backrooms), R.world); // the backrooms casino swaps in here too: the frame the power comes back
  const lit = 1 - R.dark * (blk ? 0.985 : 0.94); // (a blackout is blacker: flashlights are the light)
  R.hemi.intensity = 0.36 * lit; R.fill.intensity = 0.23 * lit; R.key.intensity = 0.68 * lit; R.scene.environmentIntensity = 0.28 * lit;
  for (const g of GLOWS) {
    const k = g.v * (1 - R.dark * 0.85);
    if (g.k === 'color') { if (g.base) g.m.color.copy(g.base).multiplyScalar(k); else g.m.color.setScalar(k); } else g.m[g.k] = k;
  }
  R.torch.intensity = R.dark * (blk && priv && !priv.monster ? (priv.flash ? 0.6 : 0.35) : 2.2); // your own glow (in a blackout, barely: hiding is in the dark)
  R.scene.fog.color.setRGB(0.1 * lit, 0.04 * lit, 0.055 * lit);
  if (blk) { R.scene.fog.near = 4; R.scene.fog.far = 20; } // (a blackout's dark is the missing light, so a flashlight reaches across a room)
  else { R.scene.fog.near = 18 - R.dark * 17; R.scene.fog.far = 46 - R.dark * 42.5; }
  R.scene.background.setRGB(0.043 * lit, 0.027 * lit, 0.035 * lit);
  if (R.br.on) R.br.light(lit, blk, t); // its flat fluorescent light and haze instead

  // Position actors before visibility is computed, then pose only the ones the
  // final camera can see. Hidden rooms used to animate every bone every frame.
  const poses = [];
  const pose = (b, state, height = 0) => { b.root.position.set(state.x, height, state.z); poses.push({ b, state, height }); };
  R.dealers.forEach((d, i) => { const s = R.dealerSpots[i]; pose(d, { x: s.x * M, z: s.y * M, face: yawOf(s.a), look: yawOf(s.a) + Math.sin(t * 0.4 + i * 2) * 0.5, moving: false, t, dt }); });
  // the bartender drifts along behind the counter, facing the room; walk up to the bar and he comes over to serve you
  if (R.bartender) {
    const serve = priv && priv.alive && priv.atBar, want = serve ? Math.max(110, Math.min(410, priv.x)) : 260 + Math.sin(t * 0.13) * 150;
    R.btX = R.btX ?? want; const step = want - R.btX; R.btX += Math.sign(step) * Math.min(Math.abs(step), (serve ? 130 : 60) * dt);
    const toMe = serve ? Math.atan2(priv.y - 52, priv.x - R.btX) : Math.PI / 2;
    pose(R.bartender, { x: R.btX * M, z: 52 * M, face: yawOf(Math.abs(step) > 6 ? (step > 0 ? 0 : Math.PI) : Math.PI / 2), look: yawOf(toMe) + (serve ? 0 : Math.sin(t * 0.5) * 0.6), moving: Math.abs(step) > 6, t, dt }, .32);
  }
  // the shady guy leans in his corner, watching the room, and watches you once you come close
  if (R.shady) {
    const near = priv && priv.alive && Math.hypot(priv.x - SHADY.x, priv.y - SHADY.y) < 260;
    pose(R.shady, { x: SHADY.x * M, z: SHADY.y * M, face: yawOf(SHADY.face), look: near ? yawOf(Math.atan2(priv.y - SHADY.y, priv.x - SHADY.x)) : yawOf(SHADY.face) + Math.sin(t * 0.3) * 0.7, moving: false, t, dt });
    shadyLook(R.shady);
  }

  // characters
  const seen = new Set();
  const meIdx = priv ? priv.me : -1;
  if (pub) {
    const alive = pub.chars.filter(c => c.alive);
    for (const c of pub.chars) {
      // Corpses and the private death cinematic own their separate actors.
      if (!c.alive) continue;
      const b = beanFor(c); seen.add(c.id);
      const isMe = c.id === meIdx;
      const peekMe = isMe && !orbit && (frame.peek || 0) > 0.05 && !R.peekNear; // over the shoulder you see yourself (not with a wall right behind you)
      b.root.visible = c.alive && !c.staffInside && !c.monster && !(isMe && !orbit && !peekMe); // (the monster is drawn by blackout.js instead)
      if (!c.held && b.root.rotation.z) b.root.rotation.z = 0; // (kicking in the monster's hands)
      if (!b.root.visible) continue;
      let x = c.x, y = c.y, face = c.face, look = c.look, moving = c.moving, seated = c.seat !== null;
      const st = seated && R.world.seats[c.seat];
      if (st && !SITS.has(st.game)) seated = false; // everyone stands at the games (a bot on the game's own spot)
      if (meeting) { // everyone gathers around the pit bell
        const p = ringSpot(alive.indexOf(c), alive.length);
        x = p.x; y = p.y; face = look = p.face; moving = false; seated = false;
      }
      if (isMe && (orbit || peekMe) && me) { x = me.x; y = me.y; look = me.look; if (peekMe) face = me.look; }
      pose(b, { x: x * M, z: y * M, face: yawOf(face), look: yawOf(look), moving, seated, seatHeight: st?.game === 'vip' ? 0.52 : 0.58, eating: c.eating, pale: c.pale, lucky: c.lucky, t, dt });
      const partner = priv && priv.killers && priv.killers.includes(c.id) && !isMe;
      // your marks (Space) and, for a killer, the suggested target show on the name tag
      const mk = frame.marks && frame.marks.get(c.color), prey = !!(priv && priv.prey && priv.prey.id === c.id);
      b.setLabel((frame.talking && frame.talking.has(c.id) ? '🔊 ' : '') + (isMe ? 'You' : prey ? 'TARGET · ' + c.name : mk === 'sus' ? '? ' + c.name : mk === 'ok' ? '✓ ' + c.name : c.name), // 🔊: talking (voice chat)
        partner ? '#ff8a80' : prey ? '#ff5a4a' : mk === 'sus' ? '#ffb050' : mk === 'ok' ? '#7ee08a' : '#f3ead8');
    }
  }
  for (const [id, b] of R.beans) if (!seen.has(id)) { dropBean(b); R.beans.delete(id); }
  if (plushReady()) (R.gestures || (R.gestures = new Gestures())).tick(pub, priv, R.beans, { dealers: R.dealers, bartender: R.bartender }, t, dt);

  // camera
  const cam = R.camera;
  let handsHidden = true;
  if (orbit && meeting) {
    R.orbitA += dt * 0.12;
    const cx = BELL.x * M, cz = BELL.y * M, rad = 4.2 + (pub.chars.length > 10 ? 1 : 0);
    cam.position.set(cx + Math.cos(R.orbitA) * rad, 2.15, cz + Math.sin(R.orbitA) * rad); // under the chandeliers' drops
    cam.lookAt(cx, 1.0, cz);
  } else if (orbit) {
    R.tourT += dt;
    const shot = TOUR[Math.floor(R.tourT / SHOT) % TOUR.length], u = (R.tourT % SHOT) / SHOT, e = u * u * (3 - 2 * u);
    cam.position.set((shot.a[0] + (shot.b[0] - shot.a[0]) * e) * M, shot.a[2] + (shot.b[2] - shot.a[2]) * e, (shot.a[1] + (shot.b[1] - shot.a[1]) * e) * M);
    cam.lookAt(shot.look[0] * M, shot.look[2], shot.look[1] * M);
  } else {
    const ghost = !priv.alive, seated = !!priv.seat, sits = seated && SITS.has(priv.seat.game);
    R.fp.bob += dt * (me.moving ? 10 : 0);
    // Machine use never changes the player's physical eye height.
    const eyeTo = ghost ? EYE.ghost : priv.monster ? 2.45 : EYE.stand; // the monster looks down on everyone
    R.eyeY = R.eyeY === undefined || ghost ? eyeTo : R.eyeY + (eyeTo - R.eyeY) * Math.min(1, dt * 6);
    // standing, the eye sits a little behind the body's centre, so someone at arm's length (a knife's reach) is a face, not a wall of plush
    const back = sits || ghost ? 0 : 0.12; // (the body keeps 0.25 m off walls, so this never pokes through one)
    // in a real seat the eye is a step back from the seat's own spot
    const sb = sits ? STATION_BACK : 0, sf = sits ? priv.seat.face : 0;
    cam.position.set(me.x * M - Math.cos(me.look) * back - Math.cos(sf) * sb, R.eyeY + (me.moving && !ghost ? Math.abs(Math.sin(R.fp.bob)) * 0.03 : 0), me.y * M - Math.sin(me.look) * back - Math.sin(sf) * sb);
    cam.rotation.set(me.pitch || 0, -me.look - Math.PI / 2, 0);
    handsHidden = false;
    const pk = !seated && !ghost ? frame.peek || 0 : 0; if (!pk) R.peekNear = false;
    if (pk > 0.001) { // a killer's camera over the shoulder: 2.2 m back, a little right and up, pulled in short of any wall
      const fx = Math.cos(me.look), fy = Math.sin(me.look), want = { x: me.x + (-fx * 2.2 - fy * 0.5) * pk / M, y: me.y + (-fy * 2.2 + fx * 0.5) * pk / M };
      let t = 1; if (!los(me, want)) { let lo = 0, hi = 1; for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (los(me, { x: me.x + (want.x - me.x) * mid, y: me.y + (want.y - me.y) * mid })) lo = mid; else hi = mid; } t = Math.max(0, lo - 0.3 / Math.max(0.01, Math.hypot(want.x - me.x, want.y - me.y) * M)); }
      const room = Math.hypot(want.x - me.x, want.y - me.y) * M * t; R.peekNear = room < 1.1 * pk; // backed against a wall: rise higher, and your own body steps aside
      cam.position.set((me.x + (want.x - me.x) * t) * M, R.eyeY + (R.peekNear ? 0.85 : 0.5) * pk, (me.y + (want.y - me.y) * t) * M);
      cam.rotation.x = (me.pitch || 0) - (R.peekNear ? 0.3 : 0.12) * pk;
      if (pk > 0.3) handsHidden = true;
    }
    const myChar = pub.chars[meIdx];
    R.hands.setSuit(myChar.color);
    const d = priv.drink && priv.drink.held ? pub.drinks.find(x => x.holder === meIdx) : null;
    R.hands.update({ dt, t, eating: myChar.eating, snack: myChar.snack, drink: d ? { kind: d.kind, color: d.color, sips: d.sips } : null, seated, game: priv.seat && priv.seat.game, moving: me.moving, ghost, light: lit + R.dark * 0.25, hidden: false });
    if (R.hazards.cctv(cam, pub, priv, frame.cameraFeed)) handsHidden = true;
  }
  // the table camera, blended in from (and back out to) your eyes
  const rig = R.world.machines.rig, F = !orbit && frame.table && rig.focus();
  const wantT = F ? 1 : 0;
  R.tk = (R.tk || 0) + (wantT - (R.tk || 0)) * Math.min(1, dt * 5);
  if (R.tk < 0.002 && !wantT) R.tk = 0;
  const e = R.tk * R.tk * (3 - 2 * R.tk);
  if (F) { const H = innerHeight, sf = frame.safe || {}; R.lastShot = tableShot(F, cam.aspect, { x0: -0.95, x1: 0.95, y0: -1 + 2 * (sf.bottom || 0) / H, y1: 1 - 2 * (sf.top || 0) / H }); }
  const shot = R.tk > 0 && !orbit ? R.lastShot : null;
  const baseFov = R.baseFov * (R.zoom || 1);
  let fov = baseFov;
  if (shot) { // glide between shots (the duck race changes its shot when they run)
    const cs = R.cs && R.tk < 1 && e < 0.02 ? null : R.cs, k = Math.min(1, dt * 2.5);
    if (!cs) R.cs = { pos: shot.pos.clone(), quat: shot.quat.clone(), fov: shot.fov };
    else { cs.pos.lerp(shot.pos, k); cs.quat.slerp(shot.quat, k); cs.fov += (shot.fov - cs.fov) * k; }
    cam.position.lerp(R.cs.pos, e); cam.quaternion.slerp(R.cs.quat, e); fov = baseFov + (R.cs.fov - baseFov) * e;
    if (e > 0.25) handsHidden = true;
  }
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  R.bloom.strength = R.bloomK * (1 - 0.8 * e); // the felt's white print would glow
  // a chandelier right over the table camera would hang in the shot (one that is coming down still shows)
  for (const ch of R.world.chandeliers || []) if (ch) ch.g.visible = !(shot && e > 0.3 && ch.g.position.y === 0 && ch.g.rotation.x === 0 && Math.hypot(ch.g.position.x - cam.position.x, ch.g.position.z - cam.position.z) < 2.4);
  // other players standing right under the table camera would block the game: they step out of the shot
  if (shot && e > 0.5) {
    cam.getWorldDirection(camFwd); const fl = Math.hypot(camFwd.x, camFwd.z) || 1;
    for (const [id, b] of R.beans) {
      if (id === meIdx || !b.root.visible) continue;
      const dx = b.root.position.x - cam.position.x, dz = b.root.position.z - cam.position.z, d = Math.hypot(dx, dz);
      if (d < 1.5 || (d < 3 && (dx * camFwd.x + dz * camFwd.z) / (fl * d) > 0.3)) b.root.visible = false; // close, or close and ahead
    }
  }
  if (pub && !orbit && priv.monster) handsHidden = true;
  const deathActive = R.death.update(pub, priv, cam, dt);
  // The cinematic's key light replaces your own glow. Keeping the point-light
  // count constant avoids recompiling the entire visible casino on a death.
  R.torch.visible = !deathActive;
  if (deathActive) handsHidden = true;
  if (handsHidden) R.hands.update({ hidden: true, dt });
  cam.updateMatrixWorld();
  cullRooms(cam, orbit);
  let posed = 0;
  for (const { b, state, height } of poses) {
    b.poseDt = Math.min(.1, (b.poseDt || 0) + dt);
    if (!b.root.visible) continue;
    state.dt = b.poseDt; b.poseDt = 0; b.update(state); b.root.position.y = height; ++posed;
  }
  R.actorWork = { posed, total: poses.length };
  R.blk.update(pub, priv, R.beans, t, dt, cam, meIdx, !orbit);
  R.torch.position.copy(cam.position);
  placeLights(cam.position, lit);
  if (R.br.on) R.br.pool();
  // the shadow light hangs over a point a few metres ahead of you, snapped to its texels so shadows don't swim
  const ahead = new THREE.Vector3(0, 0, -5).applyQuaternion(cam.quaternion); ahead.y = 0;
  const step = 22 / 2048, tx = Math.round((cam.position.x + ahead.x) / step) * step, tz = Math.round((cam.position.z + ahead.z) / step) * step;
  R.key.target.position.set(tx, 0, tz); R.key.position.set(tx + 2.5, 12, tz + 3.5); R.key.target.updateMatrixWorld();
  if (!orbit) edgeGlows(pub, priv); else if (R.glows || R.lure) edgeGlows(null, null);
  R.world.update(now / 1000, dt, { pub, priv, my: frame.my || null, bg: frame.bg || [], cam: cam.position, camObj: cam });
  if (legacyLabelMatrices) declutterLabels(cam);
  if (pub) R.items.update(pub, priv || { me: -1, spiked: [], alive: true }, R.beans, t, dt, { firstPerson: !orbit, camera: cam, deathActive });
  if (pub) R.hazards.update(pub, priv, R.beans, t, dt, cam);
  // the light cones over the tables thin out as you walk into one, so they never wash the view out
  for (const b of BEAMS) {
    // Material visibility leaves the table rig's separate object visibility
    // intact, and avoids submitting black additive geometry when beams are off.
    b.mat.visible = R.gfx.beams !== false;
    if (b.mat.visible) { const d = Math.hypot(cam.position.x - b.x, cam.position.z - b.z); b.mat.color.multiplyScalar(Math.max(0.12, Math.min(1, (d - b.r * 0.5) / 2.5))); }
  }
  if (!legacyLabelMatrices) for (const b of R.beans.values()) if (b.root.visible && b.label) b.label.visible = true;
  R.actorWork.offscreen = !orbit && !prepareOnly ? cullOffscreenActors(cam, poses) : 0;
  updatePotatoDetail(cam);
  updateVisibleMatrices(R.scene);
  if (!R.hands.scene.matrixWorldAutoUpdate) updateVisibleMatrices(R.hands.scene);
  if (!legacyLabelMatrices) declutterLabels(cam);
  R.renderer.shadowMap.needsUpdate = R.renderer.shadowMap.enabled;
  if (!prepareOnly) {
    const hidden = orbit ? [] : cullOffscreenScenery(cam);
    try { R.composer.render(dt); }
    finally { for (const o of hidden) o.visible = true; }
  }
}

// at: the screen point (NDC) the hand reaches for, or null for the plain animation.
// The shady guy's look: dark glasses and a toothpick on his head (they turn with it), and his fedora (it loads later)
// in plain black felt. His own copies of the hat's materials: the other fedoras share theirs.
const shadyMat = { lens: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.1, metalness: 0.5 }), pick: new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 0.8 }) };
function shadyLook(b) {
  const u = b.root.userData;
  if (!u.shades) {
    const head = b.root.getObjectByName('Head'); if (!head) return;
    b.root.updateMatrixWorld(true);
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.02), shadyMat.lens); l.position.set(s * SHADES.dx, 0, -0.025); l.rotation.y = s * 0.35; g.add(l); }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.016, 0.016), shadyMat.lens));
    const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 5), shadyMat.pick); tp.rotation.z = 1.25; tp.position.set(0.06, -SHADES.mouth, 0); g.add(tp);
    g.position.set(0, SHADES.y, SHADES.z); b.root.add(g); g.updateMatrixWorld(true); head.attach(g);
    u.shades = g;
  }
  if (b.hat && !b.hat.userData.dark) { b.hat.userData.dark = true; b.hat.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.map = null; o.material.color.setHex(0x1a1a1e); } }); } // (the model swaps in later: a new hat)
}
const SHADES = { y: 1.02, z: 0.345, dx: 0.105, mouth: 0.14 }; // on the potato's eyes and mouth (assets/chars/bean.glb; the plush bean's were y 1.1, z 0.27, dx 0.12, mouth 0.19)

export function playHand(kind, at) { if (R) R.hands.play(kind, at); }

// ---------- Pressing the table in front of you ----------
const ray = new THREE.Raycaster(), ndcV = new THREE.Vector2(), shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
// The part of your own table under a screen point (NDC): { part, uv, point } or null.
export function pick(nx, ny) {
  const rig = R && R.world.machines.rig; if (!rig || !rig.active) return null;
  ndcV.set(nx, ny); ray.setFromCamera(ndcV, R.camera); ray.far = 20;
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
export function consolePointOf(x, y) { const rig = R && R.world.machines.rig, p = rig && rig.consolePoint(x, y); return p ? p.toArray() : null; }
export function setHover(h) { const rig = R && R.world.machines.rig; if (rig) rig.setHover(h); }
export const camPos = () => R && R.camera.position.toArray();
export const deathPlaying = () => !!R?.death.active;
export function gesture(id, name, upper) { const b = R && R.beans.get(id); return !!(b && b.play && b.play(name, upper)); }
// automation: the live scene, for headless checks that need to look inside it
export const debugScene = () => R && { scene: R.scene, camera: R.camera, br: R.br.info(), death: R.death.info(), actors: [...R.beans].map(([id, b]) => ({ id, visible: b.root.visible })) };
export function info() {
  if (!R) return null;
  const i = R.renderer.info;
  return { frames: i.render.frame, calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, cam: [R.camera.position.x, R.camera.position.y, R.camera.position.z, R.camera.rotation.x, R.camera.rotation.y].map(v => +v.toFixed(2)), gestures: { ...PLAYED }, props: propsLoaded().length, rebuildPending: !!R.rebuild, rooms: R.roomsSeen || null, actorWork: R.actorWork, ao: R.composer.passes.includes(R.passes.gtao), passes: R.composer.passes.map(p => p.name || p.constructor.name), internal: R.internal, out: R.outSize, pr: R.pr };
}

// Give the loading UI a paint opportunity, then continue in a task. Waiting for
// a second animation frame left an extra idle frame between every work batch.
const nextPaint = () => new Promise(ok => requestAnimationFrame(() => setTimeout(ok, 0)));
async function prepareGesturesInSteps() {
  if (/[?&]legacyGestureWarmup\b/.test(location.search)) return;
  let began = performance.now();
  for (const _frame of prepareGestures()) {
    if (performance.now() - began >= 12) { await nextPaint(); began = performance.now(); }
  }
}
async function prepareEffectTexturesInSteps() {
  let began = performance.now();
  for (const _texture of prepareEffectTextures()) {
    if (performance.now() - began >= 12) { await nextPaint(); began = performance.now(); }
  }
}
async function prepareNavigationInSteps() {
  let began = performance.now();
  for (const _step of prepareNavigation()) {
    if (performance.now() - began >= 12) { await nextPaint(); began = performance.now(); }
  }
}
let assetsTask;
export function preloadAssets(lowPower, progress = () => {}) {
  if (assetsTask) return assetsTask;
  const jobs = [
    ['Characters and animation', () => loadPlush().then(() => loadClips([...GESTURES, 'snatched'])).then(() => Promise.all([loadHats(), prepareGesturesInSteps()]))],
    ['Casino models', () => loadProps()], ['First-person hands', () => loadHandAssets()], ['Cards and table art', () => Promise.all([loadFelts(), loadArt(), loadArt2().then(prepareEffectTexturesInSteps)])],
    ['Room materials', () => loadRoomMats(lowPower)], ['Backrooms materials', () => preloadBackrooms(lowPower)], ['Monster', () => preloadMonster()],
    ['Casino paths', () => prepareNavigationInSteps()],
  ];
  let done = 0; const failed = [], manager = THREE.DefaultLoadingManager, previousError = manager.onError;
  manager.onError = url => { failed.push(url); previousError?.(url); };
  return assetsTask = Promise.all(jobs.map(async ([label, job]) => { await job(); progress(++done / jobs.length, label); })).then(() => {
    if (failed.length) throw new Error('Asset failed to load: ' + failed[0]);
  }).finally(() => { manager.onError = previousError; });
}
let warmupTail = Promise.resolve();
export async function warmup(frame, progress = () => {}, current = () => true) {
  if (!R) return;
  // Preparations temporarily change shared renderer/scene state. A replacement
  // arrival waits for the canceled one's cleanup before touching that state.
  const previous = warmupTail; let release;
  warmupTail = new Promise(ok => { release = ok; });
  await previous;
  const canceled = {}, check = () => { if (!current()) throw canceled; };
  const report = progress; progress = (...args) => { check(); report(...args); };
  const paint = async () => { await nextPaint(); check(); };
  let monster;
  try {
    check();
    await Promise.all([R.br.loading, R.fsrReady]);
    check();
    if (!/[?&]legacySceneWarmup\b/.test(location.search)) {
      // Keep initial allocation out of the single prepare-only draw. Preserve its
      // resize/room/character order while giving the loading screen time to paint.
      progress(.02, 'Preparing the view'); await paint(); resize();
      progress(.04, 'Preparing rooms'); await paint();
      R.br.update(!!frame.pub?.backrooms, R.world);
      progress(.06, 'Preparing players'); await paint();
      const chars = frame.pub?.chars || []; let began = performance.now();
      for (let i = 0; i < chars.length; i++) {
        if (!chars[i].alive) continue;
        beanFor(chars[i]);
        if (performance.now() - began >= 12) {
          progress(.06 + .03 * (i + 1) / chars.length, 'Preparing players');
          await paint(); began = performance.now();
        }
      }
    }
    progress(.1, 'Preparing the casino'); await paint();
    // Construct the dynamic scene without rendering: rendering here would synchronously
    // upload every visible texture and compile shaders before the staged warmup below.
    draw(frame, { prepareOnly: true }); await paint();
    await prepareGesturesInSteps();
    check();
    R.hands.prepareInventory();
    monster = makeMonster(); if (monster) R.scene.add(monster.obj);
    let effectsStart = performance.now();
    for (const _sprite of R.hazards.prepareSprites()) if (performance.now() - effectsStart >= 12) {
      progress(.12, 'Preparing effects'); await paint(); effectsStart = performance.now();
    }
    const textures = new Set();
    let cardsStart = performance.now();
    for (const texture of prepareCardTextures()) {
      textures.add(texture);
      if (performance.now() - cardsStart >= 12) { progress(.13, 'Preparing the cards'); await paint(); cardsStart = performance.now(); }
    }
    for (const texture of preparePlinkoTextures()) {
      textures.add(texture);
      if (performance.now() - cardsStart >= 12) { progress(.13, 'Preparing table payouts'); await paint(); cardsStart = performance.now(); }
    }
    if (!/[?&]legacyBoundsWarmup\b/.test(location.search)) {
      progress(.14, 'Preparing scene bounds'); await paint();
      await prepareBoundsInSteps([R.scene, R.hands.scene], check);
    }
    const materialTextures = m => { for (const value of Object.values(m)) if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value); };
    for (const scene of [R.scene, R.hands.scene]) scene.traverse(o => {
      prepareShadowMaterial(o);
      for (const m of o.material ? [].concat(o.material) : []) materialTextures(m);
    });
    for (const [, from, to] of R.br.swaps) for (const m of [].concat(from, to)) materialTextures(m);
    let n = 0, batchStart = performance.now();
    for (const texture of textures) {
      R.renderer.initTexture(texture); ++n;
      if (performance.now() - batchStart >= 12) {
        progress(.15 + .45 * n / textures.size, 'Uploading textures'); await paint();
        batchStart = performance.now();
      }
    }
    // Compile for the composer's linear render target. Compiling to the screen
    // instead would prepare different tone-mapping/color-space shader variants.
    const target = R.renderer.getRenderTarget();
    const depthMaterials = new Map(), retainedDepth = new Set();
    let depthPrepared = false;
    const shadowScene = new THREE.Scene();
    // Real shadow draws pass a null scene while retaining the main render's
    // light state. Match that combination without reparenting any lights.
    shadowScene.traverseVisible = visit => R.scene.traverseVisible(o => { if (o.isLight) visit(o); });
    const shadowTarget = new THREE.WebGLRenderTarget(1, 1);
    try {
      progress(.64, 'Uploading geometry'); await paint();
      R.renderer.setRenderTarget(shadowTarget);
      await uploadGeometryInSteps([R.scene, R.hands.scene], R.camera, check);
      progress(.7, 'Preparing shaders'); await paint();
      R.renderer.setRenderTarget(R.composer.readBuffer);
      await compileInSteps(R.scene, R.camera, R.scene, null, check);
      await compileInSteps(R.hands.scene, R.hands.camera, R.hands.scene, null, check);
      const wasGhost = R.hands.gloveMat.transparent;
      const ghostMaterials = R.hands.ghostMaterials;
      try {
        R.hands.setGhost(!wasGhost);
        await compileInSteps(R.hands.scene, R.hands.camera, R.hands.scene, o => ghostMaterials.has(o.material) ? o.material : null, check);
      } finally { R.hands.setGhost(wasGhost); }
      // Room materials need new variants when a later preset changes lights or
      // shadows; an unchanged preset can reuse its completed preparation.
      const backroomsKey = [R.lightN, R.renderer.shadowMap.enabled, R.renderer.shadowMap.type, R.renderer.toneMapping, R.renderer.outputColorSpace].join('/');
      if (R.br.warmed !== backroomsKey) {
        progress(.76, 'Preparing the backrooms'); await paint();
        const wasOn = R.br.on;
        try {
          if (wasOn) R.br.unapply(); else R.br.apply();
          await compileInSteps(R.scene, R.camera, R.scene, null, check);
          R.br.warmed = backroomsKey;
        } finally { if (wasOn) R.br.apply(); else R.br.unapply(); }
      }
      // compile() reads object.material, not scene.overrideMaterial. Prepare the
      // actual AO override and shadow variants too, preserving skin/instance flags.
      if (R.composer.passes.includes(R.passes.gtao)) {
        progress(.8, 'Preparing ambient occlusion'); await paint();
        R.renderer.setRenderTarget(R.passes.gtao.normalRenderTarget);
        await compileInSteps(R.scene, R.camera, R.scene, o => o.isMesh ? R.passes.gtao.normalForObject(o) : null, check);
      }
      const ssr = R.passes.ssr;
      if (R.composer.passes.includes(ssr)) {
        progress(.82, 'Preparing reflections'); await paint();
        R.renderer.setRenderTarget(ssr.normalRenderTarget);
        await compileInSteps(R.scene, R.camera, R.scene, o => o.isMesh ? ssr.materialForObject(o, ssr.normalMaterial) : null, check);
        // The selective-metalness pass disables fog while retaining scene lights.
        const metalScene = new THREE.Scene();
        metalScene.traverseVisible = shadowScene.traverseVisible;
        R.renderer.setRenderTarget(ssr.metalnessRenderTarget);
        await compileInSteps(R.scene, R.camera, metalScene, o => o.isMesh ? ssr.materialForObject(o, ssr.reflectSet.has(o) ? ssr.metalnessOnMaterial : ssr.metalnessOffMaterial) : null, check);
      }
      if (R.renderer.shadowMap.enabled) {
        progress(.85, 'Preparing shadows'); await paint();
        R.renderer.setRenderTarget(shadowTarget);
        await compileInSteps(R.scene, R.key.shadow.camera, shadowScene, o => {
          if (!o.isMesh || !o.castShadow) return null;
          return [].concat(o.material).map(m => {
            const custom = o.customDepthMaterial;
            if (custom && R.shadowAssignments?.get(o)?.depth !== custom) return custom;
            const key = custom ? m.id + '/' + custom.id : m;
            if (!depthMaterials.has(key)) {
              // Three copies source texture/alpha/displacement properties before
              // each real shadow draw. Compile those same flags on a temporary
              // material, retaining its program until the real variant acquires it.
              const d = custom ? custom.clone() : new THREE.MeshDepthMaterial();
              for (const k of ['map', 'alphaMap', 'alphaTest', 'displacementMap', 'displacementScale', 'displacementBias', 'wireframe', 'clipShadows', 'clippingPlanes', 'clipIntersection']) d[k] = m[k];
              d.alphaTest = m.alphaToCoverage ? .5 : m.alphaTest;
              d.side = m.shadowSide ?? (m.side === THREE.FrontSide ? THREE.BackSide : m.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
              depthMaterials.set(key, d);
            }
            const prepared = depthMaterials.get(key);
            // Array-material meshes use Three's internal shadow material. Their
            // hidden table programs have no live owner until first entry; keep
            // preparation references instead of deleting them after loading.
            if (Array.isArray(o.material)) retainedDepth.add(prepared);
            return prepared;
          });
        }, check);
      }
      if (!/[?&]legacyPostWarmup\b/.test(location.search)) {
        progress(.87, 'Preparing screen effects'); await paint();
        await compilePostInSteps(check);
      }
      progress(.88, 'Finalizing shaders'); await paint();
      // compileAsync waits for linking, but Three defers uniform/attribute discovery
      // until first use. Finish those driver queries in bounded loading batches.
      let began = performance.now();
      for (const program of R.renderer.info.programs) {
        while (!program.isReady()) await paint();
        program.getUniforms(); program.getAttributes();
        if (performance.now() - began >= 12) { await paint(); began = performance.now(); }
      }
      progress(.9, 'Finishing the scene'); await paint();
      R.renderer.setRenderTarget(target); draw(frame); await paint();
      depthPrepared = true;
    } finally {
      R.renderer.setRenderTarget(target); shadowTarget.dispose();
      for (const m of depthMaterials.values()) if (!depthPrepared || !retainedDepth.has(m)) m.dispose();
      if (depthPrepared) {
        // Acquire the replacement programs before releasing the previous batch,
        // so repeated level/preset preparation has a bounded lifetime too.
        for (const m of R.depthWarmupMaterials || []) m.dispose();
        R.depthWarmupMaterials = retainedDepth;
      }
    }
    R.last = performance.now(); progress(1, 'Ready');
  } catch (e) { if (e !== canceled) throw e; }
  finally { try { monster?.dispose(); } finally { release(); } }
}

async function prepareBoundsInSteps(scenes, check = () => {}) {
  const geometry = new Set(), objects = [], visible = new Set();
  for (const scene of scenes) {
    scene.traverseVisible(o => visible.add(o));
    scene.traverse(o => {
      if (!o.geometry || !(o.isMesh || o.isLine || o.isPoints)) return;
      geometry.add(o.geometry);
      // Fixed instances can be prepared while their room is hidden. Dynamic
      // effects with culling disabled retain their normal first-visible bounds.
      if (o.boundingSphere === null && (visible.has(o) || o.frustumCulled)) objects.push(o);
    });
  }
  let began = performance.now();
  for (const o of [...geometry, ...objects]) {
    check();
    if (o.boundingSphere === null) o.computeBoundingSphere();
    if (performance.now() - began >= 12) { await nextPaint(); began = performance.now(); }
  }
}

async function compilePostInSteps(check = () => {}) {
  const renderer = R.renderer, composer = R.composer, render = renderer.render, target = renderer.getRenderTarget();
  const draws = [], emptyScene = new THREE.Scene();
  // Let each actual pass choose its materials, defines and destination (OutputPass
  // configures tone mapping here). Record fullscreen draws without rendering the
  // world again or depending on private pass fields, then compile them in stages.
  try {
    renderer.render = (object, camera) => {
      if (object.isMesh && camera.isOrthographicCamera) draws.push({ object, camera, material: object.material, target: renderer.getRenderTarget() });
    };
    for (let i = 0; i < composer.passes.length; i++) {
      const pass = composer.passes[i]; if (!pass.enabled || pass instanceof RenderPass) continue;
      const screen = pass.renderToScreen;
      try {
        pass.renderToScreen = composer.renderToScreen && composer.isLastEnabledPass(i);
        pass.render(renderer, composer.writeBuffer, composer.readBuffer, 0, false);
      } finally { pass.renderToScreen = screen; }
    }
  } finally { renderer.render = render; renderer.setRenderTarget(target); }
  const prepared = new Set();
  try {
    for (const draw of draws) {
      check();
      if (draw.object.geometry.boundingSphere === null) draw.object.geometry.computeBoundingSphere();
      // Several blur/bloom passes reuse the same fullscreen material. Retain
      // separate screen/linear-target variants when a material needs both.
      const key = draw.material.id + '/' + (draw.target ? draw.target.texture.colorSpace : renderer.outputColorSpace);
      if (prepared.has(key)) continue; prepared.add(key);
      renderer.setRenderTarget(draw.target);
      await compileInSteps(draw.object, draw.camera, emptyScene, () => draw.material, check);
    }
  } finally { renderer.setRenderTarget(target); }
}

async function uploadGeometryInSteps(scenes, camera, check = () => {}) {
  const ready = R.geometryReady || (R.geometryReady = new WeakSet()), instances = R.instancesReady || (R.instancesReady = new WeakSet());
  const objects = [], seen = new Set();
  for (const scene of scenes) scene.traverse(o => {
    if (!o.geometry || !(o.isMesh || o.isLine || o.isPoints)) return;
    if ((!ready.has(o.geometry) && !seen.has(o.geometry)) || (o.isInstancedMesh && !instances.has(o))) { objects.push(o); seen.add(o.geometry); }
  });
  if (!objects.length) return;
  const uploadScene = new THREE.Scene(); uploadScene.matrixWorldAutoUpdate = false;
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, toneMapped: false, fog: false });
  const sort = R.renderer.sortObjects; R.renderer.sortObjects = false;
  let began = performance.now();
  try {
    for (let start = 0; start < objects.length; start += 16) {
      check();
      const chunk = objects.slice(start, start + 16), saved = [], ranges = new Map();
      try {
        for (const o of chunk) {
          saved.push([o, o.children, o.material, o.visible, o.frustumCulled]);
          if (!ranges.has(o.geometry)) { ranges.set(o.geometry, { ...o.geometry.drawRange }); o.geometry.setDrawRange(0, 0); }
          // A flat traversal view keeps original object/instance buffers and
          // parents intact. Zero vertices still initialize attributes/indexes.
          o.children = []; o.material = material; o.visible = true; o.frustumCulled = false;
        }
        uploadScene.children = chunk; R.renderer.render(uploadScene, camera);
        for (const o of chunk) { ready.add(o.geometry); if (o.isInstancedMesh) instances.add(o); }
      } finally {
        uploadScene.children = [];
        for (const [o, children, mat, visible, frustumCulled] of saved) { o.children = children; o.material = mat; o.visible = visible; o.frustumCulled = frustumCulled; }
        for (const [g, range] of ranges) g.setDrawRange(range.start, range.count);
      }
      if (performance.now() - began >= 12) { await nextPaint(); began = performance.now(); }
    }
  } finally { R.renderer.sortObjects = sort; material.dispose(); }
}

async function compileInSteps(scene, camera, target = scene, override = null, check = () => {}) {
  const objects = [], seen = new Set();
  scene.traverse(o => {
    if (!o.material || !(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
    const material = override ? override(o) : o.material; if (!material) return;
    // Mesh and InstancedMesh share their .type. Keep their shader features in
    // the key when a tray and a held snack share geometry and material.
    const key = [o.geometry?.id, o.type, passGeometryKey(o), ...[].concat(material).map(m => m.id)].join('/');
    if (seen.has(key)) return; seen.add(key); objects.push({ object: o, material });
  });
  // A traversal view lets Three inspect the original objects without reparenting
  // them, cloning skeletons, or changing the scene's transforms and ownership.
  const batch = new THREE.Group(); batch.traverseVisible = () => {};
  let began = performance.now();
  for (let start = 0; start < objects.length; start += 64) {
    check();
    const saved = [], chunk = objects.slice(start, start + 64);
    batch.traverse = visit => { for (const { object, material } of chunk) {
      if (override) { saved.push([object, object.material]); object.material = material; }
      visit(object);
    } };
    try {
      const ready = R.renderer.compileAsync(batch, camera, target);
      // Waiting for the driver already yields to the browser. Only add a paint
      // when synchronous compilation itself used this frame's CPU budget.
      if (performance.now() - began >= 12) await nextPaint();
      await ready; began = performance.now();
    }
    finally { for (const [o, material] of saved) o.material = material; }
    check();
  }
}
