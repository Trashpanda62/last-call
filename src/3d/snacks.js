import * as THREE from 'three';
import { hasProp, propObject } from './props.js';
export const SNACK_NAMES = ['Chocolate doughnuts', 'Salted pretzels', 'Midnight hot dogs'];
export const snackAssets = () => ['snackDonut', 'snackPretzel'].map(n => Number(hasProp(n))).join('');
const mat = color => new THREE.MeshStandardMaterial({ color, roughness: .48 });
const dough = mat(0xdba04e), crust = mat(0xa65b22), chocolate = mat(0x492219), sausage = mat(0xb64c29), mustard = mat(0xffd52c);
const fallbackSnacks = new Map();
// A food prop in metres, bottom centred at the origin. Generated GLBs share the
// same fitted footprint as the immediate fallback meshes.
export function makeSnack(kind = 0, width = .24) {
  const name = ['snackDonut', 'snackPretzel', 'snackHotdog'][kind % 3];
  if (hasProp(name)) { const g = propObject(name, { x: 0, z: 0, fit: [width, width, width] }); g.name = name; return g; }
  if (!fallbackSnacks.has(kind)) fallbackSnacks.set(kind, buildSnack(kind, name));
  const g = fallbackSnacks.get(kind).clone(true); g.scale.setScalar(width / .24); return g;
}
// Tray food never moves independently. Share a draw for copies of each part,
// while held food keeps its ordinary hierarchy for the eating animation.
export function batchSnackDisplay(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(), out = new THREE.Group();
  root.traverse(o => {
    if (!o.isMesh) return;
    let materials = groups.get(o.geometry);
    if (!materials) groups.set(o.geometry, materials = new Map());
    let e = materials.get(o.material);
    if (!e) materials.set(o.material, e = { source: o, matrices: [] });
    e.matrices.push(o.matrixWorld.clone());
  });
  for (const [geometry, materials] of groups) for (const [material, e] of materials) {
    const im = new THREE.InstancedMesh(geometry, material, e.matrices.length);
    e.matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = e.source.castShadow; im.receiveShadow = e.source.receiveShadow;
    im.renderOrder = e.source.renderOrder; im.userData = { ...e.source.userData };
    im.matrixAutoUpdate = false; im.computeBoundingBox(); im.computeBoundingSphere(); out.add(im);
  }
  return out;
}
function buildSnack(kind, name) {
  const g = new THREE.Group(); g.name = name;
  const mesh = (geo, material, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  if (kind === 0) {
    mesh(new THREE.TorusGeometry(.078, .035, 12, 40), dough, 0, .035, 0, Math.PI / 2);
    mesh(new THREE.TorusGeometry(.078, .032, 10, 40), chocolate, 0, .052, 0, Math.PI / 2);
    for (let i = 0; i < 20; i++) { const a = i * 2.4; const m = mesh(new THREE.BoxGeometry(.014, .006, .005), mat([0xffcd31, 0xf38d99, 0x55bad3][i % 3]), Math.cos(a) * .08, .082, Math.sin(a) * .08); m.rotation.y = a; }
  } else if (kind === 1) {
    for (const [x, z] of [[-.04, 0], [.04, 0], [0, .05]]) mesh(new THREE.TorusGeometry(.045, .017, 10, 24), crust, x, .02, z, Math.PI / 2);
    for (let i = 0; i < 18; i++) mesh(new THREE.BoxGeometry(.006, .005, .006), mat(0xffeed0), Math.sin(i * 3.8) * .06, .039, Math.cos(i * 2.4) * .065);
  } else {
    for (const z of [-.033, .033]) { const b = mesh(new THREE.CapsuleGeometry(.033, .17, 6, 16), dough, 0, .035, z); b.rotation.z = Math.PI / 2; }
    const dog = mesh(new THREE.CapsuleGeometry(.025, .18, 6, 16), sausage, 0, .055, 0); dog.rotation.z = Math.PI / 2;
    const points = Array.from({ length: 18 }, (_, i) => new THREE.Vector3(-.1 + i / 17 * .2, .081, Math.sin(i * 1.5) * .013));
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, .004, 6, false), mustard, 0, 0, 0);
  }
  return g;
}
