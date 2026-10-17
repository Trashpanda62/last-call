// The approved Sorceress glove, reduced and finger-rigged locally. One geometry,
// texture set and local material per pair; skeletons remain independent.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
let source=null,loading;
export function loadHandAssets(){
  if(/[?&](toy|noprops|legacyHands)\b/.test(location.search))return Promise.resolve();
  return loading ||= new GLTFLoader().loadAsync('assets/hands/casino-glove.glb').then(g=>{
    let mesh;g.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});
    if(!mesh||mesh.skeleton.bones.length!==17)throw new Error('Casino glove rig is incomplete');
    source=g.scene;
  });
}
const xAxis=new THREE.Vector3(1,0,0),delta=new THREE.Quaternion(),angles=[1,1.35,.85];
const profiles={pinch:{all:.7,index:.45,thumb:.8},point:{all:.85,index:.05,thumb:.3},snack:{all:.7,thumb:.6},drink:{all:.72,thumb:.65},knife:{all:1,thumb:.9}};
export function makeFirstPersonGlove(side,materials){
  if(!source)return null;
  const glove=new THREE.Group(),canonical=new THREE.Group(),model=clone(source);glove.name=side<0?'GeneratedGloveLeft':'GeneratedGloveRight';
  // Source fingers point +Y and the palm faces +Z. Keep fingers forward,
  // palms down and thumbs toward the midline; mirror the left glove only.
  canonical.rotation.set(0,0,Math.PI);canonical.scale.set(side<0?-.72:.72,.72,.72);model.position.y=-.23;canonical.add(model);glove.add(canonical);
  const chains={};let forearm;
  model.traverse(o=>{
    if(o.isBone&&o.name==='forearm')forearm=o;
    if(o.isBone&&/^(thumb|index|middle|ring|little)_[123]$/.test(o.name))chains[o.name]={bone:o,rest:o.quaternion.clone()};
    if(o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;const original=o.material;
      if(!materials.has(original)){const m=original.clone();m.envMapIntensity=.5;materials.set(original,m);}
      o.material=materials.get(original);
    }
  });
  // Preserve the authored neutral wrist/forearm alignment. A fixed 60-degree
  // bend used to hide the cut end made every idle and reach pose look broken.
  const joints=Object.entries(chains).map(([name,v])=>({...v,digit:name.slice(0,-2),joint:+name.at(-1)-1}));
  const pose=(kind,strength=1)=>{
    const p=profiles[kind],all=p?.all??kind;
    for(const {digit,joint,bone,rest}of joints){
      const c=THREE.MathUtils.clamp((p?.[digit]??all)*strength,0,1),angle=c*angles[joint];
      bone.quaternion.copy(rest).multiply(delta.setFromAxisAngle(xAxis,angle));
    }
  };
  glove.userData={generated:true,curl(c){pose(c);},pose,attachSleeve(sleeve){const along=new THREE.Vector3(.3,.954,0).normalize();sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),along);sleeve.position.set(.03,.035,.00906).addScaledVector(along,.325/.72);sleeve.scale.setScalar(1/.72);forearm.add(sleeve);}};glove.userData.curl(.25);return glove;
}
