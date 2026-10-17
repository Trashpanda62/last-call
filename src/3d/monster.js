// The blackout monster (Steve, 2026-10-15): when the power goes out the killer becomes a giant mutated potato, the
// creepy potato cast grown huge and wrong (too many eyes, too many teeth, sprouts like horns). Sorceress concept, mesh and
// auto-rig, hy-motion clips retargeted and baked in Blender (tools/v6_monster.py, tools/v5_monster_rig.py with
// MONSTER_RUN=v6) into assets/monster/monster.glb: idle, walk, run (loops, in place), roar, leap and stab (anchored).
// The felt monster before it is kept in assets/monster/old/ (its clips: kill and slam where this one has stab).
// The model faces +Z like the beans: put it in the world with obj.rotation.y = yawOf(face), as plush.js does.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import * as T from './textures.js';
import { CFG } from '../config.js';

// Clips in the GLB: idle, walk, run, roar, kill (lunge, maul at bean height, let go) and slam (the same length).
// height: rest pose to the head top (its hunched stance stands about 2.3-2.5 m); speeds: the ground speed each loop's
// feet were measured at, so playback scales with the real speed. Kill beats, seconds into the kill, for a victim standing
// 0.7 m in front: the claws land on it (grab, hands about 1.4 m up and 0.9 m out), the head comes down on it (bite,
// lowest at about 0.9 s), the monster rears up and lets go (drop). It does not lift the victim: it stays where it stood
// (assets/anim/snatched.json is a bean clip for it: flinch, flail, go limp). slam beats are for opts.kill = 'slam'
// (grabs at the feet, hoists the victim over its head, slams it down 0.7 m in front).
// leap: the pounce (the sim flies it CFG.leapTime seconds); air: from where the clip is played at the leap (it rears up,
// its feet leave the floor at 0.4 s) to where it lands, stretched over the sim's flight, then the landing crouch at its
// own speed (tools/v5_monster_rig.py AIR). The kill clip is the stab (grab, three stabs, let go), played over monsterHold.
// walkSpeed, runSpeed: the ground speeds the short potato legs' loops look right at.
export const MONSTER = {
  height: 2.6, killLen: 2.167, roarLen: 1.967, walkSpeed: 1.2, runSpeed: 2.2, leapLen: 1.367,
  air: [0.2, 0.833], flight: CFG.leapTime,
  kill: { grab: 0.35, bite: 0.9, drop: 1.45 },
  slam: { grab: 0.2, lift: 0.45, drop: 1.5 },
};
const LOOPS = ['idle', 'walk', 'run'];
let ONCE = ['roar', 'kill', 'leap'];
const ALIAS = { kill: ['stab', 'kill'], leap: ['leap'] }; // (the old felt monster has kill and no leap: it just runs at them)
let SRC = null, CLIPS = null, loading = null;

export function preloadMonster(base = 'assets/monster/') {
  if (!loading) loading = new GLTFLoader().loadAsync(base + 'monster.glb').then(g => {
    const clips = {}; for (const c of g.animations) clips[c.name] = c;
    for (const [n, alt] of Object.entries(ALIAS)) clips[n] = alt.map(a => clips[a]).find(Boolean);
    if (!clips.leap) ONCE = ['roar', 'kill'];
    if (![...LOOPS, ...ONCE].every(n => clips[n])) throw new Error('monster.glb is missing clips');
    MONSTER.killLen = clips.kill.duration; MONSTER.roarLen = clips.roar.duration; if (clips.leap) MONSTER.leapLen = clips.leap.duration;
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material; // MeshStandard from the GLB: rough felt that flashlight beams pick out
      m.roughness = 0.9; m.metalness = 0; m.envMapIntensity = 0.25;
    });
    // Rendering sorts skinned meshes by their bounds even with frustum culling
    // disabled. Retain the source rest-pose bounds for every monster clone.
    if (!/[?&]legacyBoundsWarmup\b/.test(location.search)) {
      g.scene.updateMatrixWorld(true);
      g.scene.traverse(o => { if (o.isSkinnedMesh && !o.boundingSphere) o.computeBoundingSphere(); });
    }
    SRC = g.scene; CLIPS = clips; return true;
  }).catch(e => { console.warn('Monster did not load; keeping the fallback.', e); loading = null; return false; });
  return loading;
}

// glowing button eyes: a hot core and a soft additive halo, unlit so they read in a black room
const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.7), toneMapped: false }); // over-bright: blooms
const haloMat = new THREE.SpriteMaterial({ map: T.glow(), color: 0xff2a08, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const coreGeo = new THREE.SphereGeometry(0.22, 10, 8);

export function makeMonster(opts = {}) { // opts.kill: 'slam' plays the alternative kill (grab low, lift overhead, slam down)
  if (!SRC) return null;
  const obj = new THREE.Group(); obj.name = 'monster';
  const model = skClone(SRC); obj.add(model);
  const bones = {}, eyes = [];
  model.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; }
    if (/^eye/.test(o.name)) eyes.push(o);
  });
  const halos = [];
  for (const e of eyes) { // the eye empties are scaled to the button's radius, so these sizes are in button radii
    const c = new THREE.Mesh(coreGeo, coreMat); e.add(c);
    const h = new THREE.Sprite(haloMat); h.userData.s = /^eyeBig/.test(e.name) ? 5 : 4; h.scale.setScalar(h.userData.s); e.add(h); halos.push(h);
  }
  const mixer = new THREE.AnimationMixer(model), act = {}, w = {};
  for (const n of [...LOOPS, ...ONCE]) {
    const a = act[n] = mixer.clipAction(CLIPS[n === 'kill' && opts.kill === 'slam' && CLIPS.slam ? 'slam' : n]);
    if (ONCE.includes(n)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 0; }
    a.play(); a.setEffectiveWeight(n === 'idle' ? 1 : 0); w[n] = n === 'idle' ? 1 : 0;
  }
  act.walk.time = 0; act.run.time = 0;
  let clock = 0;
  const L = { roar: MONSTER.roarLen, kill: MONSTER.killLen, leap: MONSTER.leapLen };
  // a pounce leapT seconds in: the crouch skipped, the flight stretched over the sim's, then the landing at its own pace
  const leapClip = lt => { const [a, b] = MONSTER.air, F = MONSTER.flight; return lt < F ? a + (b - a) * lt / F : Math.min(L.leap, b + lt - F); };
  const tmp = new THREE.Vector3();
  return {
    obj,
    // s: { moving, speed (m/s), roarT, killT, leapT } (seconds since each started, -1 for none)
    update(dt, s) {
      dt = Math.min(0.1, Math.max(0, dt || 0)); clock += dt;
      const speed = s.moving ? Math.max(0, s.speed || 0) : 0;
      // one-shots: driven by their own clocks so the kill lines up with the sim's hold
      let once = null, ow = 0;
      for (const n of ONCE.includes('leap') ? ['kill', 'leap', 'roar'] : ['kill', 'roar']) { // (a catch mid-pounce: the stab takes over at once)
        const t = n === 'kill' ? s.killT : n === 'leap' ? s.leapT : s.roarT;
        const ct = n === 'leap' && t != null && t >= 0 ? leapClip(t) : t, end = n === 'leap' ? MONSTER.flight + L.leap - MONSTER.air[1] : L[n];
        if (t != null && t >= 0 && t < end) { once = n; act[n].time = ct; ow = Math.min(1, t / (n === 'leap' ? 0.05 : 0.12), (end - t) / 0.3); break; }
      }
      // locomotion: idle under 0.2 m/s, walk, run past the midpoint of their natural speeds (cross-fading over 0.8 m/s)
      const mid = (MONSTER.walkSpeed + MONSTER.runSpeed) / 2;
      const runK = THREE.MathUtils.smoothstep(speed, mid - 0.4, mid + 0.4), go = THREE.MathUtils.smoothstep(speed, 0.15, 0.6);
      const want = { idle: 1 - go, walk: go * (1 - runK), run: go * runK };
      const k = Math.min(1, dt * 8);
      for (const n of LOOPS) w[n] += (want[n] - w[n]) * k;
      // one walk/run phase, scaled to the ground speed so the feet keep up with the floor
      if (speed > 0.05) {
        act.walk.timeScale = THREE.MathUtils.clamp(speed / MONSTER.walkSpeed, 0.4, 2.2);
        act.run.timeScale = THREE.MathUtils.clamp(speed / MONSTER.runSpeed, 0.5, 1.8);
      }
      const sum = w.idle + w.walk + w.run || 1;
      for (const n of LOOPS) act[n].setEffectiveWeight((w[n] / sum) * (1 - ow));
      for (const n of ONCE) act[n].setEffectiveWeight(n === once ? ow : 0);
      mixer.update(dt);
      const flick = 0.85 + 0.15 * Math.sin(clock * 9.1) * Math.sin(clock * 3.7);
      haloMat.opacity = flick; halos.forEach(h => h.scale.setScalar(h.userData.s * (once === 'kill' ? 1.25 : 1)));
    },
    // world position between the claws (for carrying a victim through the kill) and of the head
    hands(out = new THREE.Vector3()) {
      obj.updateMatrixWorld(true);
      bones.LeftHand.getWorldPosition(out); bones.RightHand.getWorldPosition(tmp); return out.add(tmp).multiplyScalar(0.5);
    },
    head(out = new THREE.Vector3()) { obj.updateMatrixWorld(true); return bones.Head.getWorldPosition(out); },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(model);
      const skeletons = new Set(); model.traverse(o => { if (o.skeleton) skeletons.add(o.skeleton); }); skeletons.forEach(s => s.dispose());
      obj.removeFromParent();
    },
  };
}
