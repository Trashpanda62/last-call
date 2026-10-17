// A real mirror (Steve, 2026-10-16: "there is no reflection"): three.js's Reflector technique, trimmed. Each frame the
// mirror is on screen and near enough, the scene is drawn once more from the camera reflected in the mirror's plane
// (an oblique near plane clips everything behind the glass) into a texture the glass shows projectively.
// Once per frame at most: other passes that draw the scene (normals, depth) reuse it, and a pass with an override
// material never redraws it.
import * as THREE from 'three';

const VERT = `uniform mat4 textureMatrix; varying vec4 vUv;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() { vUv = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
#include <logdepthbuf_vertex>
}`;
const FRAG = `uniform vec3 tint; uniform sampler2D tDiffuse; varying vec4 vUv;
#include <logdepthbuf_pars_fragment>
void main() {
#include <logdepthbuf_fragment>
  gl_FragColor = vec4(texture2DProj(tDiffuse, vUv).rgb * tint, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

let tick = 0;
export const mirrorFrame = () => { tick++; }; // world.update calls it once per drawn frame
// geometry: a plane facing +z in its own space. opts.size: the texture's long side; opts.far: no redraw beyond this (m).
export function makeMirror(geometry, { size = 768, far = 14, tint = 0xe8ece8, aspect = 2 } = {}) {
  const rt = new THREE.WebGLRenderTarget(size, Math.round(size / aspect), { type: THREE.HalfFloatType, samples: 0 });
  const mat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: rt.texture }, tint: { value: new THREE.Color(tint) }, textureMatrix: { value: new THREE.Matrix4() } }, vertexShader: VERT, fragmentShader: FRAG });
  const mesh = new THREE.Mesh(geometry, mat); mesh.name = 'mirror';
  const cam = new THREE.PerspectiveCamera(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const at = new THREE.Vector3(), eye = new THREE.Vector3(), n = new THREE.Vector3(), view = new THREE.Vector3(), look = new THREE.Vector3(), target = new THREE.Vector3(), rot = new THREE.Matrix4();
  let lastFrame = -1;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (scene.overrideMaterial || tick === lastFrame) return;
    at.setFromMatrixPosition(mesh.matrixWorld); eye.setFromMatrixPosition(camera.matrixWorld);
    if (at.distanceTo(eye) > far) return;
    rot.extractRotation(mesh.matrixWorld); n.set(0, 0, 1).applyMatrix4(rot);
    view.subVectors(at, eye); if (view.dot(n) > 0) return; // behind the glass
    lastFrame = tick;
    view.reflect(n).negate().add(at);
    rot.extractRotation(camera.matrixWorld); look.set(0, 0, -1).applyMatrix4(rot).add(eye);
    target.subVectors(at, look).reflect(n).negate().add(at);
    cam.position.copy(view); cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(n); cam.lookAt(target);
    cam.far = camera.far; cam.near = camera.near; cam.layers.mask = camera.layers.mask; cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    const tm = mat.uniforms.textureMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(mesh.matrixWorld);
    // the oblique near plane: the mirror's plane in the reflected camera's space
    plane.setFromNormalAndCoplanarPoint(n, at).applyMatrix4(cam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = cam.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
    const was = renderer.getRenderTarget(), xr = renderer.xr.enabled, shadows = renderer.shadowMap.autoUpdate;
    mesh.visible = false; renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt); renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, cam);
    renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = shadows; renderer.setRenderTarget(was); mesh.visible = true;
    if (camera.viewport !== undefined) renderer.state.viewport(camera.viewport);
  };
  mesh.userData.dispose = () => { rt.dispose(); mat.dispose(); };
  return mesh;
}
