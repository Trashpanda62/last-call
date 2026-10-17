// Hero props (plan-v4 phase 4, look A): Sorceress/Meshy models fitted in Blender (tools/prop_fit.py: +Y up, the front
// facing +Z, centred on x/z, the bottom at y=0, sizes in metres, extras.prop = { size: [w, h, d], top }). They load in
// a bounded queue before the casino is built. Startup waits for the models; procedural stand-ins remain available
// for the toy/noprops comparison modes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { roomOf } from '../map.js';

export const PROP_NAMES = ['bjTable', 'rouletteTable', 'diceTable', 'slot', 'slotHigh', 'jackpot', 'plinko', 'console', 'prizeWheel', 'duck',
  'barCounter', 'backBar', 'stool', 'chair', 'booth', 'couch', 'armchair', 'chandelier', 'piano', 'poolTable', 'champagne',
  'skeeCabinet', 'snackDonut', 'snackPretzel', 'palm', 'camera', 'pitBell', 'toilet', 'sink', 'rocket', 'ottoman', 'breaker']; // Jukebox and snack trays use their own meshes. coinPodium: its fluting decimated into red streaks; hightop: its column decimated away; crates: decimated into shards. The hand-built ones stay (the dumpster and street lamp went with the back alley)
const SRC = {};
let ready = false;
const waiters = [];
export const propsReady = () => ready;
export function onPropsReady(f) { if (ready) f(); else waiters.push(f); }
export const hasProp = n => !!SRC[n];
export const propInfo = n => SRC[n] && SRC[n].info;
export const propsLoaded = () => Object.keys(SRC);

export function loadProps(base = 'assets/props/') {
  if (/[?&](toy|noprops)\b/.test(location.search)) return Promise.resolve(); // the hand-built casino (comparisons)
  const loader = new GLTFLoader();
  let next = 0;
  return Promise.all(Array.from({ length: 4 }, async () => {
    while (next < PROP_NAMES.length) { const n = PROP_NAMES[next++]; try { const g = await loader.loadAsync(base + n + '.glb'); SRC[n] = prep(g.scene); } catch (error) { if (n === 'skeeCabinet') throw new Error('Skee-ball model failed to load. Retry preparation.', { cause: error }); /* optional legacy prop fallback */ } }
  }))
    .then(() => { if (!Object.keys(SRC).length) return; ready = true; waiters.splice(0).forEach(f => f()); });
}

function prep(scene) {
  let info = null;
  const parts = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (o.userData && o.userData.prop) info = typeof o.userData.prop === 'string' ? JSON.parse(o.userData.prop) : { ...o.userData.prop };
    if (o.isMesh) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { m.envMapIntensity = 0.5; if (m.map) m.map.anisotropy = 4; }
      parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
    }
  });
  if (!info) { const b = new THREE.Box3().setFromObject(scene), s = b.getSize(new THREE.Vector3()); info = { size: [s.x, s.y, s.z] }; const shift = new THREE.Matrix4().makeTranslation(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); for (const p of parts) p.matrix.premultiply(shift); }
  return { info, parts };
}

// A copy of a prop's material with its green felt re-dyed (the high-rollers' blue blackjack table).
const dyed = new Map();
export function dyeFelt(src, color) {
  const key = src.uuid + color; if (dyed.has(key)) return dyed.get(key);
  const m = src.clone(), dye = { value: new THREE.Color(color) };
  m.onBeforeCompile = sh => {
    sh.uniforms.uDye = dye;
    sh.fragmentShader = 'uniform vec3 uDye;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  float feltMask = smoothstep(0.015, 0.06, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
  diffuseColor.rgb = mix(diffuseColor.rgb, uDye * (dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) * 3.2), feltMask);`);
  };
  m.customProgramCacheKey = () => 'dyeFelt';
  dyed.set(key, m); return m;
}

// The scale that fits a prop into fit = [w, h, d] (0 = free): uniform takes the largest that fits every given axis,
// stretch hits each given axis (free ones take the mean). top: the height its top surface (extras.top) should sit at.
export function propScale(name, { fit = [0, 0, 0], stretch = false, top = null } = {}) {
  const { size, top: t0 } = SRC[name].info;
  const k = [0, 1, 2].map(i => fit[i] > 0 ? fit[i] / size[i] : null), given = k.filter(v => v !== null);
  let s;
  if (!given.length) s = [1, 1, 1];
  else if (stretch) { const mean = given.reduce((a, b) => a + b, 0) / given.length; s = k.map(v => v === null ? mean : v); }
  else { const m = Math.min(...given); s = [m, m, m]; }
  if (top !== null && t0) s[1] = top / t0;
  return new THREE.Vector3(...s);
}

const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
const matOf = (name, o) => new THREE.Matrix4().compose(new THREE.Vector3(o.x, o.y || 0, o.z), q.setFromAxisAngle(up, o.yaw || 0).clone(), o.scale || propScale(name, o));

// One prop as its own object (it can move: chandeliers fall, ducks swim).
export function propObject(name, o = {}) {
  const g = new THREE.Group();
  for (const p of SRC[name].parts) {
    const m = new THREE.Mesh(p.geometry, p.material); m.applyMatrix4(p.matrix);
    m.castShadow = o.cast !== false; m.receiveShadow = true; m.userData.prop = true; g.add(m);
  }
  if (o.x !== undefined) { g.position.set(o.x, o.y || 0, o.z); g.rotation.y = o.yaw || 0; g.scale.copy(o.scale || propScale(name, o)); }
  return g;
}

// Many of one prop that never move: one instanced mesh per part. list: [{ x, y, z, yaw, fit, stretch, top, scale }]
// Each room gets its own batch (userData.room), so the renderer can skip rooms you can't see.
export function placeProps(group, name, list, { cast = true } = {}) {
  if (!list.length) return null;
  const rooms = new Map();
  for (const o of list) { const r = roomOf({ x: o.x * 60, y: o.z * 60 }); if (!rooms.has(r)) rooms.set(r, []); rooms.get(r).push(o); }
  const out = [];
  for (const [room, some] of rooms) for (const p of SRC[name].parts) {
    const im = new THREE.InstancedMesh(p.geometry, p.material, some.length);
    some.forEach((o, i) => im.setMatrixAt(i, matOf(name, o).multiply(p.matrix)));
    im.castShadow = cast; im.receiveShadow = true; im.userData.prop = true; im.userData.fixedScenery = true; im.userData.propName = name; im.userData.room = room; im.computeBoundingSphere(); im.computeBoundingBox(); group.add(im); out.push(im);
  }
  return out;
}
