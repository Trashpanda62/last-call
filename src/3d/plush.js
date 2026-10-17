// Plush beans (look A, Steve 2026-10-12): Sorceress/Meshy felt models rigged in Blender (tools/rig_bean.py), posed here
// from the same inputs as the toy Bean in chars.js. Player colours are a shader tint on the red felt; staff keep theirs.
// The models load in the background; until they arrive (or if they fail) the toy beans stand in.
// Since 2026-10-15 the bodies are creepy potatoes (Steve: "i want creepy looking potatoes basically"; tools/v5_potato.py,
// take b): the same rig and clips, the player colour on the red waistcoat, the potato skin a variety per player, and no
// fuzz (POTATO below; the felt and fur code stays for the plush models in assets/chars/old-plush).
// 2026-10-17: the standard body is the Hunyuan realism pilot, with an optional
// original 1.5M-triangle near mesh; round bodies and staff retain their v5 models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import * as T from './textures.js';
import { Bean, makeHat } from './chars.js';
import { settings, onSettings, PRESETS } from '../settings.js';

const KINDS = ['bean', 'round', 'croupier', 'bartender', 'guard'];
const ROUND = new Set(['Biscuit', 'Duke', 'Coco', 'Ozzie', 'Snow', 'Peach', 'Navy', 'Fudge', 'Lilac', 'Brick', 'Mittens', 'Sunny']); // the second body shape
const SRC = {};
let ready = false;
const waiters = [];
let plushBase = 'assets/chars/';
export const plushReady = () => ready;
export function onPlushReady(f) { if (ready) f(); else waiters.push(f); }

export function loadPlush(base = 'assets/chars/') {
  if (/[?&]toy\b/.test(location.search)) return Promise.resolve(); // ?toy keeps the toy beans (comparisons)
  const loader = new GLTFLoader();
  plushBase = base;
  return Promise.all(KINDS.map(k => loader.loadAsync(base + k + '.glb').then(g => { SRC[k] = prep(g.scene); })))
    .then(() => { ready = true; waiters.splice(0).forEach(f => f()); if (settings().gfx.characterDetail === 'high') loadPotatoDetail(); })
    .catch(e => console.warn('Plush beans did not load; keeping the toy beans.', e));
}

// Sorceress hats (plan-v4 phase 2, assets/hats; tools/v4_more.py): each replaces the hand-built hat of its kind, sized
// and seated like it. Beans made before they load get theirs swapped in.
const HAT_SRC = {}, hatted = new Set();
const HAT_GROW = { party: 1.6 }; // the hand-built party hat is a thin cone; the model reads too small at its width
export function loadHats(base = 'assets/hats/') {
  if (/[?&](toy|noprops)\b/.test(location.search)) return;
  const loader = new GLTFLoader();
  return fetch(base + 'hats.json').then(r => { if (!r.ok) throw new Error('Hat catalog failed to load'); return r.json(); }) // the kinds that have a model; the rest keep the hand-built hat
    .then(kinds => Promise.all(kinds.map(k => loader.loadAsync(base + k + '.glb').then(g => { HAT_SRC[k] = g.scene; }).catch(() => null))))
    .then(() => { for (const r of hatted) { const b = r.deref(); if (b) b.fitHat(); } hatted.clear(); });
}
const HAT_FIT = new Map();
function hatModel(kind, color) {
  const src = HAT_SRC[kind]; if (!src) return null;
  let fit = HAT_FIT.get(kind);
  if (!fit) {
    const ref = new THREE.Box3().setFromObject(makeHat(kind, color)), gb = new THREE.Box3().setFromObject(src);
    const k = (ref.max.x - ref.min.x) / (gb.max.x - gb.min.x) * (HAT_GROW[kind] || 1);
    HAT_FIT.set(kind, fit = { k, y: ref.min.y - gb.min.y * k });
  }
  const m = src.clone(true), k = fit.k;
  m.scale.setScalar(k); m.position.y = fit.y;
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = hatFelt(o.material, k); o.material.envMapIntensity = 0.4; } });
  const g = new THREE.Group(); g.add(m); g.userData.model = true; return g;
}
// The hats are felt in the previews too: the felt's sheen, pile and rim (no fuzz shells: hats are small and many), once
// per source material. Metal (crowns, badges) stays as it is. k: metres per model unit, so the pile is the body's size.
const HAT_FELT = new Map();
function hatFelt(src, k) {
  if (!src || !src.isMeshStandardMaterial || src.metalness > 0.3) return src;
  let m = HAT_FELT.get(src); if (m) return m;
  m = new THREE.MeshPhysicalMaterial({ map: src.map, color: src.color, normalMap: src.normalMap, roughness: Math.max(0.85, src.roughness), metalness: 0, sheen: 0.9, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xa8a29a), transparent: src.transparent, alphaTest: src.alphaTest, side: src.side });
  const u = { uHatUnit: { value: k } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform float uHatUnit;\nvarying vec3 vFurP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFurP = position * uHatUnit;');
    sh.fragmentShader = FUR_GLSL + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= furPile( vFurP );').replace('#include <opaque_fragment>', `
  float furRim = pow( 1.0 - saturate( dot( normalize( normal ), normalize( vViewPosition ) ) ), 2.0 );
  outgoingLight += diffuseColor.rgb * ( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse ) * furRim * 1.6;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'plushHatFelt';
  HAT_FELT.set(src, m); return m;
}

// The red felt's mean luminance (linear), so a tint keeps the texture's shading.
function feltLum(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 128, 128);
    const d = x.getImageData(0, 0, 128, 128).data, lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = lin(d[i]), g = lin(d[i + 1]), b = lin(d[i + 2]);
      if (r > 0.02 && (r - Math.max(g, b)) / r > 0.7) { sum += 0.2126 * r + 0.7152 * g + 0.0722 * b; n++; }
    }
    return n > 50 ? sum / n : 0.08;
  } catch { return 0.08; }
}

// The models came with hard edges (normals split up to ~50 degrees where faces meet): on the low-poly vests and bodies
// they read as facets. Each vertex gets the area-weighted normal of every face at its position that faces its own way
// (within ~78 degrees), so the forms round off like the stuffed toys while thin double-sided bits (bow ties) keep their sides.
function smoothNormals(g) {
  const P = g.attributes.position, N = g.attributes.normal, I = g.index; if (!P || !N || !I) return;
  const key = i => Math.round(P.getX(i) * 1e4) + ',' + Math.round(P.getY(i) * 1e4) + ',' + Math.round(P.getZ(i) * 1e4);
  const id = new Int32Array(P.count), at = new Map(); for (let i = 0; i < P.count; i++) { const k = key(i); if (!at.has(k)) at.set(k, at.size); id[i] = at.get(k); }
  const faces = Array.from({ length: at.size }, () => []), fn = new Float32Array(I.count), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < I.count; f += 3) {
    a.fromBufferAttribute(P, I.getX(f)); b.fromBufferAttribute(P, I.getX(f + 1)); c.fromBufferAttribute(P, I.getX(f + 2));
    c.sub(b); b.sub(a); b.cross(c); fn[f] = b.x; fn[f + 1] = b.y; fn[f + 2] = b.z; // its length is twice the area: the weight
    for (let j = 0; j < 3; j++) faces[id[I.getX(f + j)]].push(f);
  }
  const out = new Float32Array(N.count * 3), n = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < N.count; i++) {
    n.fromBufferAttribute(N, i); s.set(0, 0, 0);
    for (const f of faces[id[i]]) { a.set(fn[f], fn[f + 1], fn[f + 2]); const l = a.length(); if (l > 0 && a.dot(n) / l > 0.2) s.add(a); }
    (s.lengthSq() > 0 ? s.normalize() : s.copy(n)).toArray(out, i * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}

function prep(scene) {
  let info = { height: 1.41, crownR: 0.24, trunkR: 0.3, legTop: 0.23 }, mesh = null;
  scene.traverse(o => {
    if (o.userData && o.userData.bean) info = JSON.parse(o.userData.bean);
    if (o.isSkinnedMesh) mesh = o;
  });
  smoothNormals(mesh.geometry);
  // Clones share this rest pose. Compute its bounds once per source, rather than
  // skinning every vertex again for each of the 32 characters during warmup.
  scene.updateMatrixWorld(true);
  scene.traverse(o => { if (o.isSkinnedMesh && !o.boundingSphere) o.computeBoundingSphere(); });
  const src = mesh.material, map = src.map;
  return { scene, info, map, src, ref: map && map.image ? feltLum(map.image) : 0.08, skin: POTATO && map && map.image ? skinMean(map.image) : null };
}

// ---------- Potatoes (2026-10-15) ----------
// The bodies are potatoes: no fur shells and no stray fibres (the code above stays, off). FUZZ turns them back on.
const POTATO = true, FUZZ = !POTATO;
// Each player a potato variety (the portraits use the same: tools/v5_potato.py CAST); the colour itself is the waistcoat.
const VARIETY = { golden: '#c9a04e', red: '#9c4a3c', purple: '#6a4664', pale: '#d8c08a' };
const SKIN = { Mint: 'golden', Lola: 'red', Duke: 'golden', Coco: 'purple', Ozzie: 'red', Teal: 'golden', Snow: 'pale', Ruby: 'red', Sky: 'golden',
  Peach: 'golden', Ink: 'purple', Plum: 'purple', Fern: 'golden', Diva: 'red', Goldie: 'golden', Lilac: 'purple', Dash: 'golden', Brick: 'red',
  Presto: 'purple', Mittens: 'golden', Sunny: 'golden' }; // the rest: russet, as modelled
// the russet skin's mean colour (linear): brownish pixels, not the red waistcoat, the white gloves or the black shoes
function skinMean(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 128, 128);
    const d = x.getImageData(0, 0, 128, 128).data, lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const s = [0, 0, 0]; let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), sat = mx ? (mx - Math.min(r, g, b)) / mx : 0;
      if (mx > 40 && sat > 0.3 && sat < 0.7 && r >= g && g >= b && (r - Math.max(g, b)) / r < 0.45) { s[0] += lin(r); s[1] += lin(g); s[2] += lin(b); n++; }
    }
    return n > 50 ? new THREE.Color(s[0] / n, s[1] / n, s[2] / n) : null;
  } catch { return null; }
}
// Potato skin up close (Steve wants realism and a freaky amount of detail nose to nose): the model's own colour, normal
// and roughness maps, and over them, worked out from the rest-pose point (metres, so it stays put as the body moves and
// needs no UVs: the atlas is in scraps), the russet netting (corky ridges round 6 mm and 2.2 mm cells), sunken lenticels,
// a fine grain and patches of dry dirt. Each scale fades out once it is under a pixel, so the floor view pays for none of it.
const POTATO_GLSL = `
uniform vec3 uSkin;
uniform float uSkinOn;
uniform float uEyeY;
vec2 potVor( vec3 p ) { // (distance to the nearest cell point, the gap to the second: 0 on a border)
  vec3 c = floor( p ), f = fract( p ); float d1 = 8.0, d2 = 8.0;
  for ( int z = -1; z <= 1; z++ ) for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
    vec3 o = vec3( float( x ), float( y ), float( z ) ), r = o + 0.1 + 0.8 * vec3( furHash( c + o ), furHash( c + o + 11.3 ), furHash( c + o + 23.9 ) ) - f;
    float d = dot( r, r ); if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) d2 = d;
  }
  return vec2( sqrt( d1 ), sqrt( d2 ) - sqrt( d1 ) );
}
// the skin's relief in metres at rest point p; pw: metres per pixel. net: how much corky ridge, pore: how much lenticel
float potSkin( vec3 p, float pw, out float net, out float pore ) {
  float h = 0.0; net = 0.0; pore = 0.0;
  float l1 = 1.0 - smoothstep( 0.0012, 0.003, pw ), l2 = 1.0 - smoothstep( 0.0005, 0.0011, pw ), l3 = 1.0 - smoothstep( 0.0004, 0.001, pw ), l4 = 1.0 - smoothstep( 0.00012, 0.0003, pw );
  if ( l1 > 0.0 ) { vec2 v = potVor( p / 0.006 + 0.37 * vec3( furNoise( p * 90.0 ) ) ); float r = 1.0 - smoothstep( 0.02, 0.13, v.y ); net += r * l1; h += 0.00035 * r * l1 - 0.00012 * v.x * l1; }
  if ( l2 > 0.0 ) { vec2 v = potVor( p / 0.0022 + 3.1 ); float r = 1.0 - smoothstep( 0.03, 0.16, v.y ); net += 0.6 * r * l2; h += 0.00015 * r * l2; }
  if ( l3 > 0.0 ) { // lenticels: one dimple in about a quarter of the 12 mm cells, about a millimetre across, with a raised lip
    vec3 q = p / 0.012, c = floor( q );
    if ( furHash( c + 41.7 ) < 0.27 ) {
      float d = length( fract( q ) - 0.25 - 0.5 * vec3( furHash( c + 1.3 ), furHash( c + 4.7 ), furHash( c + 8.9 ) ) ) * 0.012, rad = 0.0005 + 0.0005 * furHash( c + 2.2 );
      float dip = 1.0 - smoothstep( rad * 0.4, rad, d ), lip = smoothstep( rad * 0.7, rad, d ) * ( 1.0 - smoothstep( rad, rad * 1.6, d ) );
      pore = dip * l3; h += ( -0.0004 * dip + 0.00008 * lip ) * l3;
    }
  }
  if ( l4 > 0.0 ) h += 0.00004 * ( furNoise( p / 0.0004 ) - 0.5 ) * l4; // the grain, nose to nose
  return h;
}
`;
function potatoMat(S, tint, skin) {
  const sk = skin && VARIETY[skin] && S.skin ? new THREE.Color(VARIETY[skin]) : null; // (THREE.Color takes hex as sRGB: linear here)
  if (sk) { sk.r = Math.min(3, sk.r / S.skin.r); sk.g = Math.min(3, sk.g / S.skin.g); sk.b = Math.min(3, sk.b / S.skin.b); }
  const u = { uTint: { value: new THREE.Color(tint || '#ffffff') }, uTintOn: { value: tint ? 1 : 0 }, uRef: { value: S.ref }, uFurFreq: { value: FUR.freq },
    uSkin: { value: sk || new THREE.Color(1, 1, 1) }, uSkinOn: { value: sk ? 1 : 0 }, uEyeY: { value: S.info.height * 0.66 } };
  const src = S.src || {};
  const m = new THREE.MeshPhysicalMaterial({ map: S.map, normalMap: src.normalMap || null, roughnessMap: src.roughnessMap || null, roughness: 1, metalness: 0,
    specularIntensity: 0.6, clearcoat: 0 });
  if (src.normalScale) m.normalScale.copy(src.normalScale);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vFurP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFurP = position;');
    sh.fragmentShader = FUR_GLSL + POTATO_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `
  // the red waistcoat in the player's colour (bright red only: the skin's dark red-brown blemishes stay as they are)
  float potFaceMask = ( 1.0 - smoothstep( 0.85, 1.0, length( ( vFurP.xy - vec2( 0.0, uEyeY + 0.11 ) ) / vec2( 0.19, 0.21 ) ) ) ) * smoothstep( 0.02, 0.1, vFurP.z );
  vec4 potTex = texture2D( map, vMapUv ), sampledDiffuseColor = mix( potTex, feltColour( potTex ), smoothstep( 0.05, 0.1, potTex.r ) * ( 1.0 - potFaceMask ) );
  float potMx = max( potTex.r, max( potTex.g, potTex.b ) ), potSat = potMx > 0.0 ? ( potMx - min( potTex.r, min( potTex.g, potTex.b ) ) ) / potMx : 0.0;
  float potRed = smoothstep( 0.55, 0.8, ( potTex.r - max( potTex.g, potTex.b ) ) / max( potTex.r, 1e-3 ) ) * smoothstep( 0.05, 0.1, potTex.r );
  float potVest = potRed * ( 1.0 - potFaceMask );
  // the potato itself: brownish, not the waistcoat, the white gloves, the black shoes, the eyes or the teeth
  float potSkinM = ( 1.0 - potVest ) * ( 1.0 - potRed * potFaceMask ) * smoothstep( 0.22, 0.36, potSat ) * smoothstep( 0.015, 0.05, potMx );
  // the eyes: what is not skin on the front of the head, wet and glossy (too human). Gloves never get up there in the rest pose
  float potEye = ( 1.0 - potSkinM ) * ( 1.0 - potVest ) * smoothstep( uEyeY - 0.02, uEyeY + 0.02, vFurP.y ) * step( 0.0, vFurP.z );
  sampledDiffuseColor.rgb *= mix( vec3( 1.0 ), uSkin, potSkinM * uSkinOn );
  float potPw = length( fwidth( vFurP ) ), potNet, potPore;
  float potH = potSkin( vFurP, potPw, potNet, potPore ) * potSkinM;
  potH += 0.00006 * ( furNoise( vFurP / 0.0005 ) - 0.5 ) * potVest * ( 1.0 - smoothstep( 0.00015, 0.0004, potPw ) ); // the waistcoat's weave
  // dry dirt in patches a couple of centimetres across, thicker low down
  float potDirt = smoothstep( 0.55, 0.85, furNoise( vFurP * 45.0 ) + 0.25 * furNoise( vFurP * 160.0 ) + 0.25 * ( 1.0 - smoothstep( 0.3, 0.9, vFurP.y ) ) ) * potSkinM;
  sampledDiffuseColor.rgb *= ( 1.0 + potSkinM * ( 0.08 * potNet - 0.45 * potPore ) ) * mix( vec3( 1.0 ), vec3( 0.62, 0.55, 0.46 ), potDirt * 0.6 );
  diffuseColor *= sampledDiffuseColor;`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix( clamp( roughnessFactor + 0.12 * potNet * potSkinM + 0.2 * potDirt, 0.04, 1.0 ), 0.1, potEye );`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { // the relief as a bump: the surface gradient of potH (metres) along the screen
    vec3 dpx = dFdx( -vViewPosition ), dpy = dFdy( -vViewPosition ), r1 = cross( dpy, normal ), r2 = cross( normal, dpx );
    float det = dot( dpx, r1 ); vec3 grad = sign( det ) * ( dFdx( potH ) * r1 + dFdy( potH ) * r2 );
    normal = normalize( abs( det ) * normal - grad );
  }`);
  };
  m.customProgramCacheKey = () => 'potatoSkin';
  m.userData.u = u;
  return m;
}

// Fuzz (Steve 2026-10-15: "our characters do not look fuzzy like the previews at all"; the previews are the felt toys in
// assets/portraits). Two parts: the felt itself gets fibre speckle, a stronger sheen and a soft rim, and over it stand
// shells of short fibres: the body drawn again a few millimetres out along its normal per shell, each cutting away all
// but the fibres (strands from a 3D cell hash in the model's rest pose, so they stay put as it moves and need no UVs),
// thinner and fewer further out. The shells are instances of one draw on the bean's own skeleton, so a bean's fuzz costs
// one draw call and no copied vertices. How many shells follows the graphics preset.
const FUR = { len: 0.018, freq: 1 / 0.0022, shells: { low: 4, medium: 6, high: 8, ultra: 12 } };
const SHADOW_SHELLS = { off: 'low', low: 'medium', high: 'high', ultra: 'ultra' }; // a Custom preset: go by its shadows
const qualityOf = g => (PRESETS[g.preset] ? g.preset : SHADOW_SHELLS[g.shadows]) || 'high';
let furQ = qualityOf(settings().gfx), furN = FUR.shells[furQ];
onSettings((s, part) => { if (part === 'gfx') { furQ = qualityOf(s.gfx); furN = FUR.shells[furQ]; } });
export const furQuality = () => furQ;
// Close up (Steve 2026-10-15: "i want ultra realistic high fidelity and resolution felt from close up. it should be a
// freaky amount of detail."): a bean that fills the screen gets more shells (finer fibres, no stacked shell edges at a
// glancing angle) and a coat of stray fibres standing off the felt (strandGeo). How close counts goes by how big the
// bean is on screen (distance, scaled by the lens), so only the one you are nose to nose with pays; the crowded floor
// view (beans 2 m and more away) draws what it did. Phones (low) get a modest version.
const NEAR = { low: { shells: 6, strands: 0.15 }, medium: { shells: 10, strands: 0.4 }, high: { shells: 12, strands: 1 }, ultra: { shells: 24, strands: 1 } };
const _np = new THREE.Vector3(), _cp = new THREE.Vector3(), _db = new THREE.Vector2(), TAN36 = Math.tan(36 * Math.PI / 180);
// the bean's distance as it looks on screen: metres, as if seen through the game's usual 72 degree lens
export function screenDist(o, cam) {
  _np.setFromMatrixPosition(o.matrixWorld); _np.y += 0.7;
  const d = _np.distanceTo(cam.getWorldPosition(_cp));
  return cam.isPerspectiveCamera ? d * Math.tan(cam.fov * Math.PI / 360) / TAN36 / (cam.zoom || 1) : d;
}
// shared GLSL: a cheap hash, and the fibre pattern at a rest-pose point (in cells) and a height up the fibre (0..1)
const FUR_GLSL = `
uniform vec3 uTint;
uniform float uTintOn;
uniform float uRef;
uniform float uFurFreq;
varying vec3 vFurP;
float furHash( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
// one fibre per cell at a random spot, as tall as its own random length, leaning its own way (felt is a tangle, not a
// brushed coat), tapering to its tip; two offset grids
float furStrand( vec3 p, float h, float k, float pw ) {
  vec3 c = floor( p ), f = fract( p );
  vec3 r = vec3( furHash( c ), furHash( c + 17.1 ), furHash( c + 41.7 ) ), lean = vec3( furHash( c + 51.1 ), furHash( c + 57.3 ), furHash( c + 63.7 ) ) - 0.5;
  float d = length( f - ( 0.15 + 0.7 * r ) - lean * h * 0.9 ), l = ( 0.3 + 0.7 * furHash( c + 7.3 ) ) * k;
  // pw: cells per pixel (no derivatives in here: it runs in branches). Close up the edge is crisp, so each fibre reads
  // as its own strand rather than a soft noise (Steve 2026-10-15: "i want individual fibres visible")
  float rad = 0.5 * ( 1.0 - h / max( l, 1e-3 ) ), aa = pw * mix( 0.15, 0.5, smoothstep( 0.2, 0.6, pw ) ) + 1e-3;
  return h < l ? 1.0 - smoothstep( rad - aa, rad + aa, d ) : 0.0;
}
float furFibres( vec3 p, float h, float k, float pw ) {
  vec3 bend = ( vec3( sin( p.y * 0.31 + p.z * 0.17 ), sin( p.z * 0.29 + p.x * 0.23 ), sin( p.x * 0.27 + p.y * 0.19 ) ) + 0.5 * vec3( sin( p.z * 1.13 + p.y * 0.7 ), sin( p.x * 1.07 + p.z * 0.6 ), sin( p.y * 1.21 + p.x * 0.8 ) ) ) * h * 0.3; // and the coat curls a little as a whole
  return max( furStrand( p + bend, h, k, pw ), furStrand( p * 1.37 + bend + 5.3, h, k, pw * 1.37 ) );
}
// Nose to nose, minky-style strands 4.4 mm apart (q in their cells): each a thin column leaning hard (two cells over its
// height) along a nap that turns slowly over the body, so shell by shell it traces a short line from its dark root to
// its light tip, and reads as its own fibre. cell: which strand it is (its own shade).
float furTuft( vec3 q, float h, float k, float pw, out vec3 cell ) {
  q += vec3( sin( q.y * 0.21 + q.z * 0.13 ), sin( q.z * 0.19 + q.x * 0.17 ), sin( q.x * 0.23 + q.y * 0.11 ) ) * 2.2 * h;
  vec3 c = floor( q ), r = vec3( furHash( c + 0.7 ), furHash( c + 3.3 ), furHash( c + 6.1 ) ); cell = c;
  float l = ( 0.5 + 0.5 * furHash( c + 9.9 ) ) * k, d = length( fract( q ) - 0.2 - 0.6 * r );
  float rad = 0.24 * ( 1.0 - 0.7 * h / max( l, 1e-3 ) ), aa = pw * 0.2 + 1e-3;
  return h < l ? 1.0 - smoothstep( rad - aa, rad + aa, d ) : 0.0;
}
float furNoise( vec3 p ) {
  vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( furHash( i ), furHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( furHash( i + vec3( 0, 1, 0 ) ), furHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( furHash( i + vec3( 0, 0, 1 ) ), furHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( furHash( i + vec3( 0, 1, 1 ) ), furHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
// the felt's pile at play distance: soft blotches 6 and 15 mm across (p in metres), each fading out only once it is
// smaller than a pixel, so 2-5 m away the felt still reads mottled rather than averaged into plastic
float furPile( vec3 p ) {
  vec3 a = p * 170.0, b = p * 66.0;
  float la = 1.0 - smoothstep( 0.5, 1.1, length( fwidth( a ) ) ), lb = 1.0 - smoothstep( 0.5, 1.1, length( fwidth( b ) ) );
  float n = 1.0; // (only the octaves big enough to see are worked out: the cost, far off)
  if ( la > 0.0 ) n += ( furNoise( a ) - 0.5 ) * 0.45 * la;
  if ( lb > 0.0 ) n += ( furNoise( b ) - 0.5 ) * 0.3 * lb;
  return n;
}
// Close up: the matted felt under the pile, fibres about 0.15 mm thick lying every which way (each 1.6 mm cell holds
// one, cut at the cell's edges into short lengths), lit fibres over a darker mat. pw: fibre cells (2.2 mm) per pixel.
float furLine( vec3 q, float pw ) {
  vec3 c = floor( q ), w = fract( q ) - vec3( furHash( c + 3.1 ), furHash( c + 8.7 ), furHash( c + 13.9 ) );
  vec3 d = normalize( vec3( furHash( c + 21.3 ), furHash( c + 29.1 ), furHash( c + 37.7 ) ) - 0.5 );
  float aa = 0.6 * pw + 1e-3;
  return 1.0 - smoothstep( 0.05 - aa, 0.05 + aa, length( w - d * dot( w, d ) ) );
}
float furMatted( vec3 p, float pw ) {
  vec3 q = p * 625.0; float qw = pw * 1.375;
  float l = furLine( q, qw ) + furLine( q * 1.31 + 7.7, qw * 1.31 ) + 0.7 * furLine( q * 0.77 + 3.3, qw * 0.77 );
  return 0.84 + 0.24 * min( l, 1.4 );
}
// pills: little balls of matted fibre a millimetre or so across, in about one 7 mm cell in fourteen. x: how much of the
// pill is here, y: its shadow ring on the felt round it
vec2 furPill( vec3 p, float pw ) {
  vec3 q = p * 140.0, c = floor( q );
  if ( furHash( c + 71.3 ) > 0.07 ) return vec2( 0.0 );
  float rad = 0.09 + 0.06 * furHash( c + 5.9 ), d = length( fract( q ) - 0.25 - 0.5 * vec3( furHash( c + 1.7 ), furHash( c + 2.3 ), furHash( c + 4.1 ) ) );
  float aa = pw * 0.31 + 1e-3, pill = 1.0 - smoothstep( rad - aa, rad + aa, d );
  return vec2( pill, ( 1.0 - smoothstep( rad, rad * 1.7, d ) ) - pill );
}
// the felt's colour: the red felt swapped for the player's colour, keeping the texture's shading
vec4 feltColour( vec4 t ) {
  float felt = smoothstep( 0.55, 0.8, ( t.r - max( t.g, t.b ) ) / max( t.r, 1e-3 ) );
  float lum = dot( t.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  t.rgb = mix( t.rgb, min( uTint * ( lum / uRef ), vec3( 1.0 ) ), felt * uTintOn );
  return t;
}
`;
// how far apart a pixel's neighbours are in fibre cells: past about one, the fibres are sub-pixel and turn into their average
const FUR_LOD = 'float furPw = length( fwidth( vFurP * uFurFreq ) ), furLod = smoothstep( 0.45, 1.3, furPw );';

// Felt: rough with a soft sheen. The tint swaps the red felt for the player's colour.
function feltMat(S, tint) {
  const u = { uTint: { value: new THREE.Color(tint || '#ffffff') }, uTintOn: { value: tint ? 1 : 0 }, uRef: { value: S.ref }, uFurFreq: { value: FUR.freq }, uFurLen: { value: FUR.len }, uFurN: { value: furN }, uPxK: { value: 0.001 } };
  const m = new THREE.MeshPhysicalMaterial({ map: S.map, roughness: 0.95, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xa8a29a) });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vFurP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFurP = position;');
    // the fibres' speckle (roots in shade, lighter tips), fading to plain felt where it is too fine to see
    sh.fragmentShader = FUR_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = feltColour( texture2D( map, vMapUv ) );
  ${FUR_LOD}
  vec3 fp = vFurP * uFurFreq;
  float speck = 0.92, button = 1.0 - smoothstep( 0.004, 0.03, dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  if ( furLod < 0.999 ) speck = mix( 0.78 + 0.3 * furFibres( fp, 0.25, 1.0, furPw ) + 0.12 * furHash( floor( fp * 0.5 ) ), 0.92, furLod ); // too fine to see: not worked out
  if ( furPw < 0.6 ) speck *= mix( furMatted( vFurP, furPw ), 1.0, smoothstep( 0.3, 0.6, furPw ) ); // up close: the matted fibres
  if ( furPw < 0.8 ) { vec2 pl = furPill( vFurP, furPw ) * ( 1.0 - smoothstep( 0.5, 0.8, furPw ) ); speck *= 1.0 + 0.16 * pl.x - 0.3 * pl.y; } // and pills
  sampledDiffuseColor.rgb *= mix( speck * furPile( vFurP ), 1.0, button ); // the black eyes stay smooth buttons
  diffuseColor *= sampledDiffuseColor;
#endif`).replace('#include <opaque_fragment>', `
  // a soft fuzz rim: fibres at a glancing angle catch the light the felt is getting
  float furRim = pow( 1.0 - saturate( dot( normalize( normal ), normalize( vViewPosition ) ) ), 2.0 );
  outgoingLight += diffuseColor.rgb * ( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse ) * furRim * 2.2;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'plushFelt2';
  m.userData.u = u;
  return m;
}

// The shells over the felt: shell i of n stands (i + 1) / n of the fuzz's length out. Black (the button eyes, mouths,
// bow ties) gets next to none: on the domed eyes it read as black whiskers.
function furMat(S, u) {
  const m = new THREE.MeshStandardMaterial({ map: S.map, roughness: 1, metalness: 0, transparent: true, depthWrite: false, alphaTest: 0.02 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform float uFurLen;\nuniform float uFurN;\nvarying vec3 vFurP;\nvarying float vFurH;\n' + sh.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
  vFurH = ( float( gl_InstanceID ) + 1.0 ) / uFurN; vFurP = position;
  transformed += normalize( objectNormal ) * uFurLen * vFurH;`);
    sh.fragmentShader = 'varying float vFurH;\nuniform float uFurN;\n' + FUR_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `
  vec4 furTex = texture2D( map, vMapUv ), sampledDiffuseColor = feltColour( furTex );
  ${FUR_LOD}
  // the texture's own black (not a dark tint) and the felt right round it (a blurred look) get next to no fuzz: the faces stay crisp
  float h = vFurH, k = mix( 0.04, 1.0, smoothstep( 0.012, 0.05, min( dot( furTex.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 1.4 * dot( texture2D( map, vMapUv, 3.0 ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) ) );
  vec3 fp = vFurP * uFurFreq;
  float a = 0.7 * k * pow( 1.0 - h, 1.6 ); // fading fast outwards, so the shells' edges do not band
  vec3 furJit = vec3( 1.0 ), cf = floor( fp ); float root = mix( 0.62, 1.08, h );
  if ( furLod < 0.999 ) {
    float fib = furFibres( fp, h, k, furPw );
    float furNear = 1.0 - smoothstep( 0.35, 0.8, furPw ), furTufted = 0.0; // nose to nose (a bean 0.7 m off at the game's lens is about 0.45)
    if ( furPw < 0.45 ) fib = max( fib, furStrand( fp * 2.3 + 9.1, h, k * 0.8, furPw * 2.3 ) * smoothstep( 0.45, 0.25, furPw ) ); // finer fibres close up
    // and the minky strands (furTuft), each shaded its own way, so the pile reads as separate fibres rather than a fine noise
    if ( furNear > 0.0 ) { vec3 tc; float tf = furTuft( fp * 0.5 + 3.7, h, k, furPw * 0.5, tc ) * furNear; if ( tf > fib ) { cf = tc + 101.0; furTufted = tf; } fib = max( fib * ( 1.0 - 0.5 * furNear ), tf ); }
    if ( furPw < 0.8 ) fib = max( fib, furPill( vFurP, furPw ).x * ( 1.0 - smoothstep( 0.5, 0.8, furPw ) ) * k * smoothstep( 0.45, 0.2, h ) ); // pills stand up
    a = mix( fib, a, furLod );
    // close up there are many shells; seen face on, every other one adds little but cost, so it is dropped before lighting
    if ( uFurN > 10.5 && mod( floor( h * uFurN + 0.5 ), 2.0 ) > 0.5 && abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ) > 0.55 ) a = 0.0;
    // each fibre its own shade (dyed felt is never one colour), and the roots deep in each other's shadow
    // nose to nose: each strand its own shade and brightness, some glinting
    furJit = mix( 1.0 + ( vec3( furHash( cf + 1.3 ), furHash( cf + 2.9 ), furHash( cf + 5.1 ) ) - 0.5 ) * mix( 0.16, 0.3, furNear ) + ( furHash( cf + 8.3 ) - 0.5 ) * 0.5 * furNear + step( 0.9, furHash( cf + 9.7 ) ) * h * 0.6 * furNear, vec3( 1.0 ), furLod );
    root = mix( mix( mix( 0.4, 1.12, h ), mix( 0.25, 1.2, h ), furNear ), root, furLod );
    root = mix( root, mix( 0.45, 1.75, smoothstep( 0.0, 0.35, h ) ) * ( 0.8 + 0.5 * furHash( cf + 4.4 ) ), furTufted * furNear ); // a strand: a short dark root, then lit along its length
  }
  // too far off to make out fibres, only the halo round the outline shows: the rest is dropped before it is lit (the cost)
  a *= mix( 1.0, smoothstep( 0.7, 0.3, abs( dot( normalize( vNormal ), normalize( vViewPosition ) ) ) ), furLod );
  sampledDiffuseColor.rgb *= root * furJit * ( 0.9 + 0.2 * furHash( cf ) ) * furPile( vFurP ); // shaded roots, lighter tips
  diffuseColor *= vec4( sampledDiffuseColor.rgb, a * 0.9 );`).replace('#include <opaque_fragment>', `
  // the tips catch the light at a glancing angle: the soft bright halo round the toys in the previews
  float furRim = pow( 1.0 - saturate( dot( normalize( normal ), normalize( vViewPosition ) ) ), 2.0 );
  outgoingLight *= 1.0 + furRim * ( 0.5 + vFurH ) * 1.8;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'plushFur';
  return m;
}
// a kind's fur: the body's own vertices, drawn once per shell
function furGeo(S, src) {
  if (S.furGeo) return S.furGeo;
  const g = new THREE.InstancedBufferGeometry();
  g.index = src.index; for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
  g.boundingSphere = src.boundingSphere ? src.boundingSphere.clone() : null; g.boundingBox = src.boundingBox ? src.boundingBox.clone() : null;
  g.instanceCount = furN;
  return (S.furGeo = g);
}
// Only the fur's own material draws the shells: the AO and reflection passes' stand-in materials draw none. Close up,
// more of them (NEAR).
function furBeforeRender(r, sc, cam, geo, mat) {
  if (mat !== this.material) { geo.instanceCount = 0; return; }
  const near = 1 - THREE.MathUtils.smoothstep(screenDist(this, cam), 0.8, 1.6), n = Math.round(furN + (NEAR[furQ].shells - furN) * near);
  geo.instanceCount = n; this.material.userData.u.uFurN.value = n;
}

// Stray fibres: thousands of thin hairs per kind, scattered over the felt (not its black: eyes, mouths, bow ties),
// leaning and curling every which way, mostly 5-9 mm, one in eight a long stray to 2.5 cm, tapering, lighter at the tips. Each is a
// ribbon of 4 segments turned to face the camera, riding the skeleton at its root; one instanced draw per bean, as many
// instances as its closeness asks (none past about 2 m on screen). A fibre thinner than a pixel is drawn most of a pixel
// wide and that much fainter, so it does not shimmer.
// Close up they are stylised like plush/minky fibres rather than true-scale felt (a real fibre is a tenth of a pixel):
// about a millimetre thick at the root, crisp-edged, each its own shade, dark at the root where its neighbours shade
// it, and glinting along its length (a Kajiya-Kay highlight off a key light from above), so each reads as its own hair.
const STRANDS = 16000, SEG = 4;
function strandGeo(S, mesh) {
  if (S.strandGeo) return S.strandGeo;
  const g0 = mesh.geometry, P = g0.attributes.position, N = g0.attributes.normal, UV = g0.attributes.uv, SI = g0.attributes.skinIndex, SW = g0.attributes.skinWeight, I = g0.index;
  let tex = null; const TW = 256;
  try { const c = document.createElement('canvas'); c.width = c.height = TW; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(S.map.image, 0, 0, TW, TW); tex = x.getImageData(0, 0, TW, TW).data; } catch { /* no lookup: fibres everywhere */ }
  const flip = S.map.flipY, dark = (u, v) => { if (!tex) return false; const x = Math.min(TW - 1, Math.max(0, Math.floor(u * TW))), y = Math.min(TW - 1, Math.max(0, Math.floor((flip ? 1 - v : v) * TW))), i = (y * TW + x) * 4; return 0.2126 * tex[i] + 0.7152 * tex[i + 1] + 0.0722 * tex[i + 2] < 60; };
  const nt = I.count / 3, cdf = new Float64Array(nt), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let tot = 0;
  for (let t = 0; t < nt; t++) { a.fromBufferAttribute(P, I.getX(3 * t)); b.fromBufferAttribute(P, I.getX(3 * t + 1)).sub(a); c.fromBufferAttribute(P, I.getX(3 * t + 2)).sub(a); tot += b.cross(c).length() / 2; cdf[t] = tot; }
  let seed = 90127; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const root = new Float32Array(STRANDS * 3), nrm = new Float32Array(STRANDS * 3), dir = new Float32Array(STRANDS * 3), bnd = new Float32Array(STRANDS * 3), uv = new Float32Array(STRANDS * 2), si = new Float32Array(STRANDS * 4), sw = new Float32Array(STRANDS * 4), len = new Float32Array(STRANDS);
  const n = new THREE.Vector3(), tg = new THREE.Vector3(), rv = new THREE.Vector3(), d = new THREE.Vector3(), w3 = [0, 0, 0], ids = [0, 0, 0];
  let k = 0;
  for (let tries = 0; k < STRANDS && tries < STRANDS * 6; tries++) {
    const r = rnd() * tot; let lo = 0, hi = nt - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; }
    let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    w3[0] = 1 - u - v; w3[1] = u; w3[2] = v; for (let j = 0; j < 3; j++) ids[j] = I.getX(3 * lo + j);
    let tu = 0, tv = 0; for (let j = 0; j < 3; j++) { tu += UV.getX(ids[j]) * w3[j]; tv += UV.getY(ids[j]) * w3[j]; }
    if (dark(tu, tv)) continue;
    a.set(0, 0, 0); n.set(0, 0, 0);
    for (let j = 0; j < 3; j++) { a.addScaledVector(b.fromBufferAttribute(P, ids[j]), w3[j]); n.addScaledVector(c.fromBufferAttribute(N, ids[j]), w3[j]); }
    n.normalize();
    const top = w3[0] >= w3[1] && w3[0] >= w3[2] ? 0 : w3[1] >= w3[2] ? 1 : 2; // the skin of the nearest corner
    rv.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(); tg.copy(rv).addScaledVector(n, -rv.dot(n)).normalize();
    d.copy(n).addScaledVector(tg, 1.4 + rnd() * 2.4).normalize(); // lying over at 55-75 degrees, like plush pile: they read as lines, not dots
    rv.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5); tg.crossVectors(d, rv).normalize().multiplyScalar(0.2 + rnd() * 0.7);
    const q = rnd(); len[k] = q < 0.6 ? 0.005 + rnd() * 0.004 : q < 0.88 ? 0.009 + rnd() * 0.006 : 0.015 + rnd() * 0.01;
    a.toArray(root, k * 3); n.toArray(nrm, k * 3); d.toArray(dir, k * 3); tg.toArray(bnd, k * 3); uv[k * 2] = tu; uv[k * 2 + 1] = tv;
    for (let j = 0; j < 4; j++) { si[k * 4 + j] = SI.getComponent(ids[top], j); sw[k * 4 + j] = SW.getComponent(ids[top], j); }
    k++;
  }
  const g = new THREE.InstancedBufferGeometry(), tA = new Float32Array((SEG + 1) * 4), idx = [];
  for (let i = 0; i <= SEG; i++) { tA.set([i / SEG, -1, i / SEG, 1], i * 4); if (i < SEG) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2); }
  g.setIndex(idx); g.setAttribute('aT', new THREE.BufferAttribute(tA, 2));
  const I3 = (arr, sz) => new THREE.InstancedBufferAttribute(arr.slice(0, k * sz), sz);
  g.setAttribute('position', I3(root, 3)); g.setAttribute('normal', I3(nrm, 3)); g.setAttribute('aDir', I3(dir, 3)); g.setAttribute('aBend', I3(bnd, 3));
  g.setAttribute('uv', I3(uv, 2)); g.setAttribute('skinIndex', I3(si, 4)); g.setAttribute('skinWeight', I3(sw, 4)); g.setAttribute('aLen', I3(len, 1));
  if (!g0.boundingSphere) g0.computeBoundingSphere();
  g.boundingSphere = g0.boundingSphere.clone(); g.boundingSphere.radius += 0.03; g.instanceCount = 0; g.userData.max = k;
  return (S.strandGeo = g);
}
function strandMat(S, u) {
  const m = new THREE.MeshStandardMaterial({ map: S.map, roughness: 0.9, metalness: 0, transparent: true, depthWrite: false, alphaTest: 0.01, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute vec2 aT;\nattribute vec3 aDir;\nattribute vec3 aBend;\nattribute float aLen;\nuniform float uPxK;\nvarying vec3 vFurP;\nvarying vec3 vStrand;\nvarying vec3 vFurAx;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', 'vec3 transformed = position + ( aDir * aT.x + aBend * aT.x * aT.x ) * aLen; vFurP = position;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec3 furAx = aDir + 2.0 * aBend * aT.x;
#ifdef USE_SKINNING
  furAx = ( skinMatrix * vec4( furAx, 0.0 ) ).xyz;
#endif
  furAx = normalize( ( modelViewMatrix * vec4( furAx, 0.0 ) ).xyz );
  vec3 furSide = normalize( cross( furAx, normalize( mvPosition.xyz ) ) );
  float furW = 0.0011 * ( 1.0 - 0.65 * aT.x ), furWd = max( furW, -mvPosition.z * uPxK * 0.7 ); // no thinner than most of a pixel
  vFurAx = furAx;
  mvPosition.xyz += furSide * aT.y * furWd;
  gl_Position = projectionMatrix * mvPosition;
  vStrand = vec3( aT.x, aT.y, furW / furWd );`);
    sh.fragmentShader = 'varying vec3 vStrand;\nvarying vec3 vFurAx;\n' + FUR_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `
  vec4 sampledDiffuseColor = feltColour( texture2D( map, vMapUv ) );
  float sd = furHash( floor( vFurP * 20000.0 ) ), e = abs( vStrand.y ), ea = fwidth( vStrand.y ) * 1.2 + 1e-3; // sd: this strand's own dice
  float a = min( 1.0, vStrand.z * 1.15 ) * ( 1.0 - smoothstep( 1.0 - ea, 1.0, e ) ) * ( 1.0 - 0.35 * vStrand.x * vStrand.x );
  sampledDiffuseColor.rgb *= mix( 0.75, 2.0, pow( max( vStrand.x, 0.0 ), 0.5 ) ) * ( 0.75 + 0.5 * sd ) * ( 1.0 + ( vec3( furHash( vFurP * 1.7e4 + 1.3 ), furHash( vFurP * 1.7e4 + 2.9 ), furHash( vFurP * 1.7e4 + 5.1 ) ) - 0.5 ) * 0.25 ) * ( 1.0 - 0.25 * e * e ) * furPile( vFurP );
  diffuseColor *= vec4( sampledDiffuseColor.rgb, a );`).replace('#include <opaque_fragment>', `
  // a glint along each fibre (Kajiya-Kay: brightest where the fibre lies across the half vector), as bright as the
  // light the fibre is getting, so it never glows in the dark
  vec3 kT = normalize( vFurAx ), kV = normalize( vViewPosition ), kL = normalize( ( viewMatrix * vec4( 0.3, 1.0, 0.25, 0.0 ) ).xyz ), kH = normalize( kL + kV );
  float kTH = dot( kT, kH ), kk = pow( sqrt( max( 0.0, 1.0 - kTH * kTH ) ), 40.0 ), kTH2 = dot( kT, normalize( kH + 0.3 * kT ) ), kk2 = pow( sqrt( max( 0.0, 1.0 - kTH2 * kTH2 ) ), 12.0 );
  vec3 irr = ( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse ) / max( dot( diffuseColor.rgb, vec3( 0.3333 ) ), 0.06 );
  outgoingLight = outgoingLight * ( 1.0 + vStrand.x * 0.5 ) + ( kk * 0.6 * vec3( dot( irr, vec3( 0.3333 ) ) ) + kk2 * 0.4 * irr * diffuseColor.rgb ) * ( 0.4 + sd ) * vStrand.x;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'plushStrands';
  return m;
}
function strandBeforeRender(r, sc, cam, geo, mat) {
  if (mat !== this.material) { geo.instanceCount = 0; return; }
  const near = 1 - THREE.MathUtils.smoothstep(screenDist(this, cam), 0.9, 2.0);
  geo.instanceCount = Math.round(geo.userData.max * NEAR[furQ].strands * near * near);
  const t = r.getRenderTarget(), H = t ? t.height : r.getDrawingBufferSize(_db).y;
  this.material.userData.u.uPxK.value = cam.isPerspectiveCamera ? 2 * Math.tan(cam.fov * Math.PI / 360) / (cam.zoom || 1) / Math.max(1, H) : 0.001;
}

const BONES = ['Hips', 'Spine', 'Spine1', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
const cacheBoneRotations = !/[?&]legacyBoneRotations\b/.test(location.search);
const shadowMat = new THREE.MeshBasicMaterial({ map: T.blob(), transparent: true, depthWrite: false, opacity: 0.8 });
const luckyMat = new THREE.MeshBasicMaterial({ map: T.glow(), color: 0xffd060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.8 });
const flatGeo = new THREE.PlaneGeometry(0.9, 0.9), bubbleGeo = new THREE.SphereGeometry(0.035, 8, 6);
const SICK = new THREE.Color(0x9ad870);
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), eu = new THREE.Euler();

// ---------- Gestures: Sorceress hy-motion clips (SMPL joint positions), retargeted by matching bone directions ----------
const CLIPS = {}, BAKED = {}, CLIP_TASKS = {};
export function loadClips(names, base = 'assets/anim/') {
  return Promise.all(names.map(n => CLIP_TASKS[n] || (CLIP_TASKS[n] = fetch(base + n + '.json').then(r => { if (!r.ok) throw new Error('Animation failed: ' + n); return r.json(); }).then(c => { CLIPS[n] = { fps: c.fps, n: c.n, j: Float32Array.from(c.j) }; }))));
}
export const hasClip = n => !!CLIPS[n];
export const PLAYED = {}; // gestures started, by name (debug info)
// SMPL joints: 0 pelvis, 1/2 hips (left/right), 3/6/9 spine, 4/5 knees, 7/8 ankles, 10/11 toes, 12 neck, 15 head,
// 16/17 shoulders, 18/19 elbows, 20/21 wrists. Left is +X and the front +Z, as on our rig. A bean bends less than a person.
const AIM = [['Spine', 0, 9, 0.45], ['Spine1', 9, 12, 0.45], ['Head', 12, 15, 0.3],
  ['LeftArm', 16, 18, 1], ['LeftForeArm', 18, 20, 1], ['RightArm', 17, 19, 1], ['RightForeArm', 19, 21, 1],
  ['LeftUpLeg', 1, 4, 1], ['LeftLeg', 4, 7, 1], ['LeftFoot', 7, 10, 0.6], ['RightUpLeg', 2, 5, 1], ['RightLeg', 5, 8, 1], ['RightFoot', 8, 11, 0.6]];
const CHILD = { Spine: 'Spine1', Spine1: 'Head', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot' };
const UPPER = new Set(['Spine', 'Spine1', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']);
// Chips set down on the felt: a bean's arm is short and it stands back from the game, so as the clip's right hand goes
// out (its reach, 0..1 from the wrist's forward travel) the bean leans in `step` metres and lifts the arm `lift` radians,
// putting the mitten over the felt's edge (felts about 0.68 m high, 0.55-0.75 m in front of where a gambler stands).
const REACH = { chips: { step: 0.28, lift: 0.38 }, push: { step: 0.3, lift: 0.5 } };
const AX = new THREE.Vector3(1, 0, 0), qc = new THREE.Quaternion(), qd = new THREE.Quaternion();
const legacyGestureMatrices = /[?&]legacyGestureMatrices\b/.test(location.search);
const gesturePosition = new THREE.Vector3(), gestureScale = new THREE.Vector3();
function bake(kind, name) {
  const key = kind + ':' + name; if (BAKED[key]) return BAKED[key];
  const steps = bakeSteps(kind, name); let step;
  while (!(step = steps.next()).done) { /* synchronous fallback for new clips */ }
  return step.value;
}

// One shared dense draw, attached to the nearest visible pilot only. Other
// potatoes keep their crowd mesh; the optional download never blocks startup.
const detailActors = new Set();
let detailTask = null, detailSource = null, detailMesh = null, detailOwner = null;
const detailPosition = new THREE.Vector3(), detailForward = new THREE.Vector3(), detailDelta = new THREE.Vector3();
export function loadPotatoDetail() {
  if (detailSource) return Promise.resolve(true);
  if (detailTask) return detailTask;
  if (!SRC.bean) return Promise.resolve(false);
  // Optional detail must not enter the required-assets boot error ledger.
  detailTask = new GLTFLoader(new THREE.LoadingManager()).loadAsync(plushBase + 'bean-high.glb').then(g => {
    let high, low; g.scene.traverse(o => { if (o.isSkinnedMesh) high = o; });
    SRC.bean.scene.traverse(o => { if (o.isSkinnedMesh) low = o; });
    if (!high || !low) throw Error('Potato detail requires the playable skeleton');
    const order = high.skeleton.bones.map(b => low.skeleton.bones.findIndex(l => l.name === b.name));
    if (order.some(i => i < 0)) throw Error('Potato detail bones do not match');
    const indices = high.geometry.attributes.skinIndex;
    for (let i = 0; i < indices.array.length; i++) indices.array[i] = order[indices.array[i]];
    indices.needsUpdate = true;
    const map = high.material.map;
    detailSource = { geometry: high.geometry, src: high.material, map, info: SRC.bean.info,
      ref: map?.image ? feltLum(map.image) : SRC.bean.ref, skin: map?.image ? skinMean(map.image) : SRC.bean.skin };
    high.skeleton.dispose();
    return true;
  }).catch(e => { console.warn('High-detail potato unavailable; keeping the crowd mesh.', e); detailTask = null; return false; });
  return detailTask;
}
onSettings((s, part) => { if (part === 'gfx' && ready && s.gfx.characterDetail === 'high') loadPotatoDetail(); });
function releasePotatoDetail() {
  if (detailOwner) detailOwner.bodyMesh.visible = true;
  detailMesh?.removeFromParent(); detailOwner = null;
}
export function updatePotatoDetail(camera) {
  let closest = null, distance = detailOwner ? 1.8 : 1.55;
  if (settings().gfx.characterDetail === 'high' && detailSource) {
    camera.getWorldDirection(detailForward);
    for (const ref of detailActors) {
      const b = ref.deref(); if (!b) { detailActors.delete(ref); continue; }
      if (!b.root.visible || !b.model.visible) continue;
      let ancestor = b.root;
      while (ancestor && ancestor.visible && !ancestor.isScene) ancestor = ancestor.parent;
      if (!ancestor?.isScene) continue;
      b.root.getWorldPosition(detailPosition); detailPosition.y += .8;
      detailDelta.subVectors(detailPosition, camera.position);
      if (detailDelta.dot(detailForward) <= 0) continue;
      const d = detailDelta.length();
      if (d < distance) { distance = d; closest = b; }
    }
  }
  if (closest !== detailOwner) {
    releasePotatoDetail();
    if (closest) {
      const body = closest.bodyMesh;
      closest.detailMat ||= potatoMat(detailSource, closest.color ? '#' + closest.color.getHexString() : null, closest.skinName);
      detailMesh ||= new THREE.SkinnedMesh(detailSource.geometry, closest.detailMat);
      detailMesh.material = closest.detailMat;
      detailMesh.position.copy(body.position); detailMesh.quaternion.copy(body.quaternion); detailMesh.scale.copy(body.scale);
      detailMesh.bindMode = body.bindMode; detailMesh.bind(body.skeleton, body.bindMatrix);
      detailMesh.boundingSphere = body.boundingSphere.clone(); detailMesh.castShadow = true;
      detailMesh.userData.potatoDetail = true;
      body.parent.add(detailMesh); body.visible = false; detailOwner = closest;
    }
  }
  if (detailOwner) detailOwner.detailMat.userData.u.uTint.value.copy(detailOwner.mat.userData.u.uTint.value);
}
export const potatoDetailInfo = () => ({ requested: settings().gfx.characterDetail, loaded: !!detailSource,
  active: !!detailOwner, triangles: detailSource ? detailSource.geometry.index.count / 3 : 0 });
// The exact same retargeting can run a frame at a time during loading. Keep the
// ordinary cached gesture path above free of generator allocation.
export function* prepareClips(names, kinds = KINDS) {
  for (const kind of kinds) for (const name of names) {
    if (SRC[kind] && CLIPS[name] && !BAKED[kind + ':' + name]) yield* bakeSteps(kind, name);
  }
}
function* bakeSteps(kind, name) {
  const key = kind + ':' + name;
  const C = CLIPS[name], S = SRC[kind]; if (!C || !S) return null;
  const tpl = skClone(S.scene); tpl.updateMatrixWorld(true);
  const bones = {}; tpl.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const rest = {}; for (const n of BONES) rest[n] = bones[n].quaternion.clone();
  const hipsW = bones.Hips.getWorldQuaternion(new THREE.Quaternion());
  const V = () => new THREE.Vector3(), J = (f, k, v) => v.fromArray(C.j, (f * 22 + k) * 3);
  const a = V(), b = V(), c = V(), x = V(), y = V(), z = V(), cur = V(), want = V(), hp = V(), cp = V();
  const q = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), m = new THREE.Matrix4(), I = new THREE.Quaternion();
  const y0 = J(0, 0, V()).y, leg = Math.max(0.3, y0 - J(0, 7, V()).y);
  const out = { fps: C.fps, n: C.n, q: new Float32Array(C.n * BONES.length * 4), y: new Float32Array(C.n), reach: new Float32Array(C.n) };
  if (REACH[name]) { // how far out the right wrist is, from its nearest (0) to its farthest (1)
    const fz = []; for (let f = 0; f < C.n; f++) fz.push(J(f, 21, a).z - J(f, 0, b).z);
    const lo = Math.min(...fz), hi = Math.max(...fz); fz.forEach((z, f) => { out.reach[f] = hi > lo ? (z - lo) / (hi - lo) : 0; });
  }
  for (let f = 0; f < C.n; f++) {
    for (const n of BONES) bones[n].quaternion.copy(rest[n]);
    // the hips follow the pelvis (across the hips, up the spine), at 60%
    x.subVectors(J(f, 1, a), J(f, 2, b)).normalize(); c.subVectors(J(f, 3, a), J(f, 0, b));
    z.crossVectors(x, c).normalize(); y.crossVectors(z, x);
    q.setFromRotationMatrix(m.makeBasis(x, y, z)).slerp(I, 0.4);
    bones.Hips.parent.getWorldQuaternion(pq);
    bones.Hips.quaternion.copy(pq.invert().multiply(q).multiply(hipsW));
    tpl.updateMatrixWorld(true);
    for (const [n, j0, j1, k] of AIM) {
      const bo = bones[n], ch = bones[CHILD[n]];
      bo.getWorldPosition(hp);
      if (ch) cur.subVectors(ch.getWorldPosition(cp), hp).normalize(); else cur.set(0, 1, 0).applyQuaternion(bo.getWorldQuaternion(wq));
      want.subVectors(J(f, j1, a), J(f, j0, b)).normalize().lerp(cur, 1 - k).normalize();
      q.setFromUnitVectors(cur, want);
      bo.getWorldQuaternion(wq).premultiply(q);
      bo.parent.getWorldQuaternion(pq);
      bo.quaternion.copy(pq.invert().multiply(wq));
      bo.updateMatrixWorld(true);
    }
    BONES.forEach((n, i) => bones[n].quaternion.toArray(out.q, (f * BONES.length + i) * 4));
    out.y[f] = (J(f, 0, a).y - y0) * S.info.legTop / leg; // bounces scaled to the bean's short legs
    yield;
  }
  return (BAKED[key] = out);
}

export class PlushBean {
  constructor({ kind = 'bean', color = null, hat = null, name = null }) {
    const S = SRC[kind];
    this.kind = kind; this.info = S.info;
    const H = S.info.height;
    this.root = new THREE.Group();
    this.model = skClone(S.scene); this.root.add(this.model);
    this.color = color ? new THREE.Color(color) : null;
    const player = kind === 'bean' || kind === 'round';
    this.mat = POTATO ? potatoMat(S, player ? color : null, player ? SKIN[name] : null) : feltMat(S, player ? color : null);
    this.skinName = player ? SKIN[name] : null;
    // culled with a roomy bounds (poses, hats and lying down stay inside it): off-camera plush cost nothing
    this.model.traverse(o => { if (o.isSkinnedMesh) { o.material = this.mat; o.castShadow = true; if (!o.boundingSphere) o.computeBoundingSphere(); o.boundingSphere.radius *= 1.6; } });
    this.bodyMesh = this.model.getObjectByProperty('isSkinnedMesh', true);
    if (kind === 'bean') { this.detailRef = new WeakRef(this); detailActors.add(this.detailRef); }
    // the fuzz: the shells ride the same skeleton, as a child with no offset of its own (plush only: potatoes have none)
    if (FUZZ) this.model.traverse(o => {
      if (!o.isSkinnedMesh || o.userData.fur) return;
      const fm = furMat(S, this.mat.userData.u); fm.userData.u = this.mat.userData.u;
      const fur = new THREE.SkinnedMesh(furGeo(S, o.geometry), fm); fur.userData.fur = true;
      fur.bind(o.skeleton, o.bindMatrix); fur.bindMode = o.bindMode; fur.boundingSphere = o.boundingSphere.clone();
      fur.raycast = () => {}; fur.onBeforeRender = furBeforeRender; fur.renderOrder = 1;
      o.add(fur);
      const sm = strandMat(S, this.mat.userData.u); sm.userData.u = this.mat.userData.u;
      const st = new THREE.SkinnedMesh(strandGeo(S, o), sm); st.userData.fur = st.userData.strands = true;
      st.bind(o.skeleton, o.bindMatrix); st.bindMode = o.bindMode; st.boundingSphere = o.boundingSphere.clone();
      st.raycast = () => {}; st.onBeforeRender = strandBeforeRender; st.renderOrder = 2;
      o.add(st);
    });
    // each bone's rest pose, and its rest orientation in the model's frame, so poses can be given in character axes
    this.model.updateMatrixWorld(true);
    const inv = this.model.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.b = {};
    this.model.traverse(o => {
      if (!o.isBone || !BONES.includes(o.name)) return;
      const w = o.getWorldQuaternion(new THREE.Quaternion()).premultiply(inv);
      this.b[o.name] = { o, rest: o.quaternion.clone(), w, wi: w.clone().invert(), restScale: o.scale.clone() };
    });
    // the right hand (the character's own right, -X) holds drinks; an anchor with the model's axes at the glove
    this.rightHand = new THREE.Group();
    const rh = this.b.RightHand.o, hp = new THREE.Vector3();
    rh.getWorldPosition(hp); this.model.worldToLocal(hp);
    this.rightHand.position.copy(hp).add(new THREE.Vector3(-0.04, -0.05, 0)); this.model.add(this.rightHand); rh.attach(this.rightHand);
    // hat on the crown, riding the head bone
    this.hat = null; this.hatKind = hat; this.hatColor = color || '#888888';
    if (hat) {
      const s = S.info.trunkR / 0.31;
      this.hat = hatModel(hat, this.hatColor) || makeHat(hat, this.hatColor); this.hat.scale.setScalar(s); this.hat.position.set(0, H - 0.08 * s, 0.01);
      this.model.add(this.hat); this.b.Head.o.attach(this.hat);
      if (!this.hat.userData.model) hatted.add(new WeakRef(this));
    }
    this.shadow = new THREE.Mesh(flatGeo, shadowMat); this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.01; this.root.add(this.shadow);
    this.luckyRing = new THREE.Mesh(flatGeo, luckyMat); this.luckyRing.rotation.x = -Math.PI / 2; this.luckyRing.position.y = 0.02; this.luckyRing.scale.setScalar(1.4); this.luckyRing.visible = false; this.root.add(this.luckyRing);
    this.bubbles = [];
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(bubbleGeo, bubbleMat); b.visible = false; this.root.add(b); this.bubbles.push(b); }
    this.label = null; this.labelKey = ''; this.labelY = H + 0.57;
    if (name) this.setLabel(name, '#f3ead8');
    this.phase = Math.random() * 10; this.walk = 0; this.yaw = 0; this.eyeYaw = 0; this.seatBlend = 0; this.dead = false; this.holding = false;
    this.seatLift = Math.max(0, 0.65 - S.info.legTop);
  }
  // the generated hat has arrived: put it where the hand-built one sits
  fitHat() {
    const m = this.hat && !this.hat.userData.model && hatModel(this.hatKind, this.hatColor); if (!m) return;
    m.position.copy(this.hat.position); m.quaternion.copy(this.hat.quaternion); m.scale.copy(this.hat.scale);
    this.hat.parent.add(m); this.hat.removeFromParent(); this.hat = m;
  }
  setLabel(text, color) {
    const key = text + color; if (key === this.labelKey) return; this.labelKey = key;
    if (this.label) { this.root.remove(this.label); this.label.material.map.dispose(); this.label.material.dispose(); }
    this.label = T.textSprite(text, { color, size: 40, h: 0.055, screen: true }); this.label.position.y = this.labelY; this.root.add(this.label);
  }
  setDead(on) { this.dead = on; if (this.label) this.label.visible = !on; }
  // Body materials and cloned skeletons belong to this actor. Model geometry,
  // skin/hat maps, hats and effect materials are shared with the asset library.
  dispose() {
    if (this.disposed) return; this.disposed = true;
    if (detailOwner === this) releasePotatoDetail();
    detailActors.delete(this.detailRef); this.detailMat?.dispose();
    this.root.removeFromParent(); this.mat.dispose();
    const skeletons = new Set(), materials = new Set();
    this.model.traverse(o => {
      if (o.skeleton) skeletons.add(o.skeleton);
      if (o.userData.fur) materials.add(o.material);
    });
    skeletons.forEach(s => s.dispose()); materials.forEach(m => m.dispose());
    if (this.label) { this.label.material.map?.dispose(); this.label.material.dispose(); }
  }
  // play a gesture over the procedural pose; upper: arms, spine and head only (seated, or holding still)
  play(name, upper = false) { if (!CLIPS[name] || this.dead) return false; this.g = { name, t: 0, upper }; PLAYED[name] = (PLAYED[name] || 0) + 1; return true; }
  get busy() { return !!this.g; }
  // a rotation given in the character's axes (x pitch forward/back, y turn, z roll), applied about the bone's joint
  rot(name, x = 0, y = 0, z = 0) {
    const B = this.b[name]; if (!B) return;
    if (cacheBoneRotations) {
      if (!B.poseRotation || B.poseX !== x || B.poseY !== y || B.poseZ !== z) {
        qa.setFromEuler(eu.set(x, y, z, 'XYZ'));
        qb.copy(B.wi).multiply(qa).multiply(B.w);
        (B.poseRotation || (B.poseRotation = new THREE.Quaternion())).multiplyQuaternions(B.rest, qb);
        B.poseX = x; B.poseY = y; B.poseZ = z;
      }
      // Gestures and eating can overwrite the bone after rot(). Restore those
      // changes, but avoid another Euler conversion when it is already exact.
      if (!B.o.quaternion.equals(B.poseRotation)) B.o.quaternion.copy(B.poseRotation);
      return;
    }
    qa.setFromEuler(eu.set(x, y, z, 'XYZ'));
    qb.copy(B.wi).multiply(qa).multiply(B.w);
    B.o.quaternion.copy(B.rest).multiply(qb);
  }
  // s: { x, z, face, look, moving, seated, pale, lucky, t, dt }
  update(s) {
    const dt = Math.min(0.1, s.dt ?? 0.016), H = this.info.height;
    this.root.position.set(s.x, 0, s.z);
    if (this.dead) {
      this.root.rotation.y = s.face;
      this.model.rotation.set(Math.PI / 2, 0, 0.15); this.model.position.set(0, this.info.trunkR * 0.85, -H * 0.35);
      for (const n of BONES) this.rot(n);
      this.rot('LeftArm', 0, 0, 0.9); this.rot('RightArm', 0, 0, -0.9);
      this.rot('LeftUpLeg', 0, 0, 0.35); this.rot('RightUpLeg', 0, 0, -0.35);
      this.shadow.scale.set(1, 2, 1); this.shadow.position.z = 0;
      this.bubbles.forEach(b => { b.visible = false; }); this.luckyRing.visible = false;
      return;
    }
    this.model.rotation.set(0, 0, 0);
    let d = s.face - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * (s.seated ? 20 : 10));
    this.root.rotation.y = this.yaw;
    let e = s.look - this.yaw; e = Math.atan2(Math.sin(e), Math.cos(e));
    e = Math.max(-1.1, Math.min(1.1, e));
    this.eyeYaw += (e - this.eyeYaw) * Math.min(1, dt * 12);
    this.seatBlend += ((s.seated ? 1 : 0) - this.seatBlend) * Math.min(1, dt * 10);
    this.walk += ((s.moving ? 1 : 0) - this.walk) * Math.min(1, dt * 8);
    this.phase += dt * 11 * (0.3 + this.walk);
    const sw = Math.sin(this.phase) * this.walk, sb = this.seatBlend, w = this.walk;
    const breathe = Math.sin(s.t * 2.2 + this.phase);
    this.model.position.set(0, Math.abs(Math.cos(this.phase)) * 0.045 * w, sb * 0.22);
    this.rot('Hips', 0, 0, sw * 0.06);
    this.rot('Spine', 0.05 * w + 0.04 * sb, 0, -sw * 0.03);
    this.rot('Spine1', 0, this.eyeYaw * 0.15, 0);
    this.rot('Head', 0, this.eyeYaw * 0.3, breathe * 0.012);
    for (const [i, side, sx] of [[0, 'Left', 1], [1, 'Right', -1]]) {
      const swing = (i ? -sw : sw);
      const hold = this.holding && side === 'Right';
      // arms hang a little lower than the A-pose they were modelled in, swing when walking, reach forward when seated
      this.rot(`${side}Arm`, swing * 0.55 - sb * 0.75 - (hold ? 0.85 : 0), 0, -sx * (0.42 - sb * 0.15 + Math.max(0, swing) * 0.05));
      this.rot(`${side}ForeArm`, -0.15 - (hold ? 0.9 : 0) - sb * 0.35, 0, 0);
      this.rot(`${side}Hand`, 0, 0, 0);
      const leg = (i ? sw : -sw);
      this.rot(`${side}UpLeg`, leg * 0.6 - sb * 1.45, 0, 0);
      this.rot(`${side}Leg`, Math.max(0, -leg) * 0.7 + sb * 1.35, 0, 0);
      this.rot(`${side}Foot`, -sb * 0.1, 0, 0);
    }
    const sp = this.b.Spine1; if (sp) sp.o.scale.copy(sp.restScale).multiplyScalar(1 + breathe * 0.006);
    if (this.g && !s.eating) this.gesture(dt, s.moving);
    if (s.eating) { const chew = Math.sin(s.t * 23); this.rot('RightArm', -1.05 + chew * .06, 0, .1); this.rot('RightForeArm', -1.1, 0, 0); this.rot('Head', .08 + chew * .055, Math.sin(s.t * 5) * .04, chew * .035); this.model.position.y += Math.abs(chew) * .012; }
    if (this.hat && this.hat.userData.spin) this.hat.userData.spin.rotation.y += dt * (4 + w * 20);
    // poisoned: going green, bubbles over the head
    const u = this.mat.userData.u;
    if (this.color) u.uTint.value.copy(this.color).lerp(SICK, s.pale ? 0.55 + Math.sin(s.t * 4) * 0.1 : 0);
    this.bubbles.forEach((b, i) => {
      b.visible = !!s.pale; if (!s.pale) return;
      const p = (s.t * 0.8 + i / 4) % 1;
      b.position.set(Math.sin(i * 2.1 + s.t) * 0.12, H + 0.15 + sb * this.seatLift + p * 0.5, Math.cos(i * 1.7) * 0.1);
      b.scale.setScalar(1 - p * 0.7);
    });
    this.luckyRing.visible = !!s.lucky;
    if (s.lucky) { this.luckyRing.material.opacity = 0.5 + Math.sin(s.t * 5) * 0.2; this.luckyRing.rotation.z = s.t; }
    this.shadow.scale.set(1, 1, 1);
    if (this.label) this.label.position.y = this.labelY + sb * this.seatLift;
  }
}

PlushBean.prototype.gesture = function (dt, moving) {
  const g = this.g, B = bake(this.kind, g.name);
  if (!B || (moving && !g.upper)) { this.g = null; return; }
  g.t += dt;
  const dur = (B.n - 1) / B.fps; if (g.t >= dur) { this.g = null; return; }
  const w = Math.min(1, g.t / 0.2, (dur - g.t) / 0.3), fi = g.t * B.fps, f0 = Math.floor(fi), f1 = Math.min(B.n - 1, f0 + 1), u = fi - f0;
  BONES.forEach((n, i) => {
    if (g.upper && !UPPER.has(n)) return;
    qa.fromArray(B.q, (f0 * BONES.length + i) * 4); qb.fromArray(B.q, (f1 * BONES.length + i) * 4);
    this.b[n].o.quaternion.slerp(qa.slerp(qb, u), w);
  });
  if (!g.upper) this.model.position.y += (B.y[f0] * (1 - u) + B.y[f1] * u) * w;
  const R = REACH[g.name]; if (!R) return;
  const r = (B.reach[f0] * (1 - u) + B.reach[f1] * u) * w, e = r * r * (3 - 2 * r); // eased
  this.model.position.z += R.step * e;
  // the arm lifted about the shoulder in the character's frame (pitch up: a negative turn about its left-right axis)
  const arm = this.b.RightArm.o;
  if (legacyGestureMatrices) {
    this.model.updateMatrixWorld(true);
    arm.parent.getWorldQuaternion(qc); this.model.getWorldQuaternion(qd);
  } else {
    // Only these two ancestor rotations are needed before the arm is lifted.
    // The final visible-scene update refreshes the completed pose and its skin.
    arm.parent.updateWorldMatrix(true, false);
    arm.parent.matrixWorld.decompose(gesturePosition, qc, gestureScale);
    this.model.matrixWorld.decompose(gesturePosition, qd, gestureScale);
  }
  qa.setFromAxisAngle(AX, -R.lift * e).premultiply(qd).multiply(qd.invert()); // the lift in world axes
  arm.quaternion.premultiply(qc).premultiply(qa).premultiply(qc.invert());
};

// A plush bean once the models are in, the toy bean before.
export function makeBean(opts) {
  if (!ready) return new Bean(opts);
  const kind = opts.kind || (opts.dealer ? 'croupier' : ROUND.has(opts.name) ? 'round' : 'bean');
  return new PlushBean({ ...opts, kind, hat: kind === 'bean' || kind === 'round' ? opts.hat : null });
}
