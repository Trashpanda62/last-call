import * as audio from "../audio.js";
// Generated textured creatures with bounded meshes and shared source animations.
import * as THREE from "three";
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import { M } from "./world.js";
const SOURCES=new Map();
export async function preloadBackroomsEntities(){
 const loader=new GLTFLoader();
 await Promise.all(['bacteria','skinstealer','hound','smiler'].map(async kind=>{
  const file=kind==='bacteria'?'stalker':kind,g=await loader.loadAsync(new URL('../../assets/backrooms/entities/'+file+'.glb',import.meta.url).href);
  g.scene.updateMatrixWorld(true);
  g.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;if(o.isSkinnedMesh&&!o.boundingSphere)o.computeBoundingSphere();
   if(kind==='smiler'){const mat=new THREE.MeshBasicMaterial({map:o.material.map,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))<.09)discard;');};o.material=mat;o.castShadow=false;}
  }});
  SOURCES.set(kind,g);
 }));
}
function generatedEntity(kind){
 const src=SOURCES.get(kind==='mimic'?'smiler':kind);if(!src)return null;
 const g=new THREE.Group();g.name='backrooms-'+kind;g.userData.entityKind=kind;g.userData.generated=true;
 const model=cloneSkeleton(src.scene);g.add(model);
 const humanoid=['bacteria','skinstealer'].includes(kind);
 if(humanoid)model.scale.setScalar((kind==='bacteria'?2.55:2.15)/1.7);
 else {const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),k=kind==='hound'?1.12/size.y:.72/Math.max(size.x,size.y);model.scale.setScalar(k);model.position.set(-(box.min.x+box.max.x)*k/2,-box.min.y*k,-(box.min.z+box.max.z)*k/2);if(kind!=='hound')model.position.y+=1.35;}
 const mixer=new THREE.AnimationMixer(model),actions={},bones=[];
 for(const clip of src.animations){if(['walk','run'].includes(clip.name)){actions[clip.name]=mixer.clipAction(clip);actions[clip.name].play();actions[clip.name].setEffectiveWeight(0);}}
 model.traverse(o=>{if(o.isBone&&/spine|head|arm|foreleg|hindleg/i.test(o.name))bones.push({bone:o,rest:o.quaternion.clone()});});
 let clock=0;
 function update(dt,s={}){
  clock+=Math.min(.1,dt||0);const moving=!!s.moving,attack=s.killT>=0;
  if(actions.walk){const run=moving&&s.alert;actions.walk.setEffectiveWeight(run?0:1);actions.run?.setEffectiveWeight(run?1:0);if(!moving)actions.walk.time=.08;mixer.update(moving?Math.min(.1,dt||0):0);}
  else for(const b of bones){b.bone.quaternion.copy(b.rest);const limb=/leg/i.test(b.bone.name),phase=(/right/i.test(b.bone.name)?Math.PI:0)+(/hind/i.test(b.bone.name)?Math.PI:0);b.bone.rotateX(limb&&moving?Math.sin(clock*11+phase)*.5:Math.sin(clock*1.6)*.018);}
  if(!moving||attack){model.rotation.x=attack?Math.sin(Math.min(1,s.killT/.5)*Math.PI)*.25:Math.sin(clock*1.2)*.012;}
  else model.rotation.x=0;
 }
 return {g,limbs:[],updateGenerated:update,model};
}
export class BackroomsEntities {
  constructor(scene) {
    this.scene = scene;
    this.entities = new Map();
    this.mimics = new Map();
  }
  make(kind) {
    const generated=generatedEntity(kind);if(generated)return generated;
    const g = new THREE.Group();
    g.name = "backrooms-" + kind;
    g.userData.entityKind = kind;
    const limbs = [];
    const black = new THREE.MeshStandardMaterial({
        color: 0x10110e,
        roughness: 0.91,
      }),
      skin = new THREE.MeshStandardMaterial({ color: 0x9b8b71, roughness: 1 }),
      wound = new THREE.MeshStandardMaterial({ color: 0x291c17, roughness: 1 }),
      cloth = new THREE.MeshStandardMaterial({ color: 0x4a493b, roughness: 1 }),
      bone = new THREE.MeshStandardMaterial({
        color: 0xc4b89c,
        roughness: 0.8,
      }),
      eye = new THREE.MeshBasicMaterial({ color: 0xece9c9, toneMapped: false });
    const ell = (parent, mat, x, y, z, rx, ry, rz) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
      m.position.set(x, y, z);
      m.scale.set(rx, ry, rz);
      parent.add(m);
      return m;
    };
    const rod = (parent, mat, a, b, r1, r2) => {
      const A = new THREE.Vector3(...a),
        B = new THREE.Vector3(...b),
        v = B.clone().sub(A);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r2, r1, v.length(), 8),
        mat,
      );
      m.position.copy(A).add(B).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        v.normalize(),
      );
      parent.add(m);
      return m;
    };
    const tooth = (parent, x, y, z, down = false, size = 0.08) => {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(size * 0.26, size, 5),
        bone,
      );
      m.position.set(x, y, z);
      if (down) m.rotation.z = Math.PI;
      parent.add(m);
    };
    const arm = (x, y, z, len, side, mat = black, crawl = false) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      g.add(pivot);
      limbs.push(pivot);
      const elbow = [side * 0.045, -len * 0.5, crawl ? 0.15 : -0.08],
        hand = [side * 0.08, -len, crawl ? 0.3 : 0.09];
      rod(pivot, mat, [0, 0, 0], elbow, 0.07, 0.045);
      ell(pivot, mat, ...elbow, 0.065, 0.065, 0.065);
      rod(pivot, mat, elbow, hand, 0.042, 0.032);
      ell(pivot, mat, ...hand, 0.09, 0.045, 0.105);
      for (let i = 0; i < 4; i++) {
        const a = [hand[0] + (i - 1.5) * 0.033, hand[1] - 0.01, hand[2] + 0.05],
          b = [a[0] + side * 0.015, a[1] - 0.1, a[2] + 0.09];
        rod(pivot, mat, a, b, 0.018, 0.006);
        rod(pivot, bone, b, [b[0], b[1] - 0.025, b[2] + 0.04], 0.009, 0.001);
      }
      return pivot;
    };
    if (kind === "smiler" || kind === "mimic") {
      const shadow = new THREE.MeshBasicMaterial({
        color: 0x080a06,
        transparent: true,
        opacity: 0.84,
        depthWrite: false,
      });
      ell(g, shadow, 0, 1.65, 0, 0.37, 0.36, 0.04);
      for (const side of [-1, 1]) {
        const e = ell(g, eye, side * 0.13, 1.77, 0.06, 0.073, 0.025, 0.018);
        e.rotation.z = side * 0.3;
      }
      // A narrow ragged crescent full of teeth, rather than a cartoon ring.
      for (let i = 0; i < 13; i++) {
        const x = (i - 6) * 0.035,
          y = 1.58 - 0.09 * (1 - (x / 0.23) ** 2);
        tooth(g, x, y + 0.035, 0.075, true, 0.085 - Math.abs(i - 6) * 0.004);
        tooth(g, x, y - 0.025, 0.075, false, 0.065);
      }
    } else if (kind === "hound") {
      ell(g, skin, 0, 0.64, -0.12, 0.3, 0.27, 0.5);
      ell(g, wound, 0, 0.83, -0.18, 0.24, 0.1, 0.43);
      for (let i = 0; i < 7; i++)
        ell(g, bone, 0, 0.87, -0.5 + i * 0.1, 0.065, 0.035, 0.025);
      ell(g, skin, 0, 0.73, 0.45, 0.27, 0.27, 0.28);
      ell(g, black, 0, 0.81, 0.46, 0.3, 0.24, 0.29);
      ell(g, skin, 0, 0.63, 0.69, 0.21, 0.13, 0.1);
      ell(g, wound, 0, 0.57, 0.7, 0.19, 0.105, 0.04);
      for (let i = 0; i < 9; i++)
        tooth(g, (i - 4) * 0.038, 0.63, 0.735, true, 0.09);
      for (let i = 0; i < 7; i++)
        tooth(g, (i - 3) * 0.043, 0.52, 0.74, false, 0.075);
      for (const x of [-0.13, 0.13]) {
        ell(g, wound, x, 0.78, 0.71, 0.075, 0.055, 0.025);
        ell(g, eye, x, 0.79, 0.732, 0.024, 0.018, 0.012);
      }
      for (let i = 0; i < 22; i++) {
        const x = Math.sin(i * 7) * 0.25,
          z = 0.34 + (i % 5) * 0.06;
        rod(
          g,
          black,
          [x, 0.91, z],
          [x * 1.15, 0.49 - (i % 4) * 0.04, z + 0.16],
          0.018,
          0.006,
        );
      }
      for (const side of [-1, 1]) {
        arm(side * 0.27, 0.75, 0.16, 0.7, side, skin, true);
        const hip = [side * 0.24, 0.64, -0.43],
          knee = [side * 0.42, 0.36, -0.63],
          foot = [side * 0.37, 0.07, -0.28];
        rod(g, skin, hip, knee, 0.13, 0.085);
        rod(g, skin, knee, foot, 0.07, 0.035);
        ell(g, skin, ...foot, 0.11, 0.055, 0.18);
      }
    } else {
      const pale = kind === "skinstealer",
        mat = pale ? skin : black;
      ell(g, pale ? cloth : black, 0, 1.43, 0, 0.26, 0.46, 0.15);
      ell(g, mat, 0, 1.95, 0, 0.1, 0.18, 0.1);
      ell(g, mat, 0, 2.17, 0.02, 0.17, 0.24, 0.15);
      for (const side of [-1, 1]) {
        ell(g, mat, side * 0.075, 2.2, 0.15, 0.05, 0.045, 0.023);
        ell(
          g,
          pale ? wound : eye,
          side * 0.075,
          2.21,
          0.175,
          pale ? 0.028 : 0.013,
          0.016,
          0.007,
        );
      }
      ell(g, wound, 0, 2.07, 0.16, 0.092, 0.065, 0.024);
      for (let i = 0; i < 7; i++)
        tooth(g, (i - 3) * 0.021, 2.1, 0.18, true, 0.035);
      for (const side of [-1, 1]) {
        arm(side * 0.28, 1.83, 0, 1.1, side, mat);
        const hip = [side * 0.14, 1.12, 0],
          knee = [side * 0.2, 0.61, -0.08],
          ankle = [side * 0.23, 0.1, 0.04];
        rod(g, pale ? cloth : black, hip, knee, 0.12, 0.065);
        rod(g, mat, knee, ankle, 0.065, 0.035);
        ell(g, mat, ...ankle, 0.075, 0.07, 0.18);
      }
      if (pale) {
        for (let i = 0; i < 5; i++) {
          const m = rod(
            g,
            wound,
            [-0.13 + i * 0.065, 2.01, 0.12],
            [-0.1 + i * 0.05, 2.31, 0.16],
            0.006,
            0.003,
          );
          m.rotation.z = 0.1;
        }
        for (let i = 0; i < 5; i++) {
          const m = new THREE.Mesh(
            new THREE.ConeGeometry(0.055, 0.28, 4),
            cloth,
          );
          m.position.set(-0.2 + i * 0.1, 1.07, 0.07);
          m.rotation.z = Math.PI;
          g.add(m);
        }
        for (let i = 0; i < 3; i++)
          ell(g, bone, 0, 1.68 - i * 0.11, 0.15, 0.012, 0.012, 0.009);
      } else {
        for (let i = 0; i < 22; i++) {
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(Math.sin(i) * 0.15, 1.2, 0),
            new THREE.Vector3(Math.sin(i * 3) * 0.28, 1.8, Math.cos(i) * 0.2),
            new THREE.Vector3(
              Math.sin(i) * (0.3 + (i % 3) * 0.08),
              2.43 - (i % 5) * 0.12,
              Math.cos(i * 2) * 0.22,
            ),
          ]);
          g.add(
            new THREE.Mesh(
              new THREE.TubeGeometry(
                curve,
                8,
                0.008 + (i % 3) * 0.004,
                4,
                false,
              ),
              black,
            ),
          );
        }
        for (let i = 0; i < 7; i++)
          rod(
            g,
            black,
            [0, 1.2 + i * 0.12, 0],
            [Math.sin(i * 5) * 0.42, 1.22 + i * 0.13, -0.06],
            0.025,
            0.005,
          );
      }
    }
    return { g, limbs };
  }
  update(pub, priv, t, dt = 1 / 60) {
    const S = pub?.survival,
      on = !!S && !pub.over,
      seen = new Set();
    if (on)
      for (const e of S.entities) {
        seen.add(e.id);
        let b = this.entities.get(e.id);
        if (!b) {
          b = this.make(e.kind);
          b.x = e.x;
          b.y = e.y;
          b.face = e.face;
          this.scene.add(b.g);
          this.entities.set(e.id, b);
        }
        b.g.visible = true;
        const k = 1 - Math.exp(-Math.min(0.1, dt) * 16);
        if (Math.hypot(e.x - b.x, e.y - b.y) > 250) {
          b.x = e.x;
          b.y = e.y;
        } else {
          b.x += (e.x - b.x) * k;
          b.y += (e.y - b.y) * k;
        }
        b.face +=
          Math.atan2(Math.sin(e.face - b.face), Math.cos(e.face - b.face)) * k;
        b.g.position.set(
          b.x * M,
          e.kind === "smiler" ? Math.sin(t * 1.1) * 0.08 : 0,
          b.y * M,
        );
        b.g.rotation.y = Math.PI / 2 - b.face;
        b.updateGenerated?.(dt,e);
        b.limbs.forEach(
          (l, i) =>
            (l.rotation.x = e.moving
              ? Math.sin(t * (e.kind === "hound" ? 12 : 6) + i * Math.PI) * 0.4
              : 0),
        );
      }
    for (const [id, b] of this.entities) if (!seen.has(id)) b.g.visible = false;
    const active = new Set();
    if (on)
      for (const r of S.mimics) {
        active.add(r.seat);
        let g = this.mimics.get(r.seat);
        if (!g) {
          g = new THREE.Group();
          g.name = "revealed-machine-mimic-" + r.seat;
          const red = new THREE.MeshBasicMaterial({ color: 0xc7b493 }),
            dark = new THREE.MeshBasicMaterial({ color: 0x080402 });
          const mouth = new THREE.Mesh(
            new THREE.SphereGeometry(0.25, 12, 8),
            dark,
          );
          mouth.scale.set(1.5, 0.65, 0.5);
          g.add(mouth);
          for (let i = 0; i < 10; i++) {
            const tooth = new THREE.Mesh(
              new THREE.ConeGeometry(0.035, 0.13, 5),
              red,
            );
            tooth.position.set(
              ((i % 5) - 2) * 0.12,
              i < 5 ? 0.09 : -0.09,
              0.12,
            );
            tooth.rotation.z = i < 5 ? Math.PI : 0;
            g.add(tooth);
          }
          this.scene.add(g);
          this.mimics.set(r.seat, g);
        }
        g.visible = true;
        g.position.set(r.x * M, 0.85 + Math.sin(t * 8) * 0.025, r.y * M);
        const c = pub.chars.find((c) => c.id === priv?.me);
        if (c) g.rotation.y = Math.atan2(c.x - r.x, c.y - r.y);
        g.scale.setScalar(r.t > 0 ? 1 + Math.sin(t * 10) * 0.08 : 0.65);
      }
    for (const [id, g] of this.mimics) if (!active.has(id)) g.visible = false;
    if (on) {
      const c = pub.chars.find((c) => c.id === priv?.me);
      if (c) {
        const v = Math.max(
          0,
          ...S.entities.map(
            (e) =>
              Math.max(0, 1 - Math.hypot(e.x - c.x, e.y - c.y) / 850) *
              (e.alert ? 0.6 : 0.2),
          ),
        );
        audio.growl(v);
        if (t - (this.stepAt || 0) > 0.9 && v > 0.04) {
          this.stepAt = t;
          audio.sfx("mstep", v * 0.7);
        }
        if(t-(this.voiceAt||0)>7&&v>.08){this.voiceAt=t;const nearest=S.entities.reduce((a,e)=>!a||Math.hypot(e.x-c.x,e.y-c.y)<Math.hypot(a.x-c.x,a.y-c.y)?e:a,null);audio.sfx(nearest?.kind==='hound'?'entityHound':'entityStalker',v*.55);}
      }
    }
  }
}

export function makeBackroomsMonster(kind) {
  const { g, limbs,updateGenerated,model } = BackroomsEntities.prototype.make(kind);
  return {
    obj: g,
    update(dt, s) {
      updateGenerated?.(dt,s);
      limbs.forEach(
        (l, i) => (l.rotation.x = Math.sin((s.killT || 0) * 8 + i) * 0.24),
      );
    },
    head() {
      g.updateMatrixWorld(true);
      const head=model?.getObjectByName('Head');if(head)return head.getWorldPosition(new THREE.Vector3());
      return g.localToWorld(
        new THREE.Vector3(
          0,
          kind === "hound"
            ? 0.78
            : kind === "smiler" || kind === "mimic"
              ? 1.65
              : 2.17,
          0.15,
        ),
      );
    },
    dispose() {
      if(g.userData.generated){g.traverse(o=>o.skeleton?.dispose());g.removeFromParent();return;}
      const materials = new Set();
      g.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) materials.add(o.material);
      });
      for (const m of materials) m.dispose();
    },
  };
}
