import * as THREE from 'three';
import * as Gm from '../games.js';
import {MAT,v3,cyl,box,sph,glowMat} from './world.js';
// Physical miniature and raised tubular plot with shared geometry and reusable transforms.
export function buildRocketFlight(group,updaters,cx,z,w,h) {
 const root=new THREE.Group();root.name='rocket-flight-3d';root.position.set(cx,1.95,z+.32);group.add(root);
 const lacquer=new THREE.MeshStandardMaterial({color:0x8b1c26,metalness:.3,roughness:.35});
 const trailMat=new THREE.MeshStandardMaterial({color:0xd5a950,metalness:.75,roughness:.28,emissive:0x4b2606,emissiveIntensity:.35});
 const rocket=new THREE.Group();rocket.name='rocket-live-model';root.add(rocket);
 const add=(geo,mat,x,y,zz)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,zz);m.castShadow=true;rocket.add(m);return m;};
 add(cyl(.075,.075,.34,20),MAT.chrome,0,0,0);
 add(new THREE.ConeGeometry(.075,.15,20),lacquer,0,.245,0);
 add(cyl(.07,.05,.05,16),MAT.gold,0,-.195,0);
 for(let i=0;i<3;i++){const a=i/3*Math.PI*2,m=add(box(.025,.17,.15),lacquer,Math.sin(a)*.075,-.14,Math.cos(a)*.075);m.rotation.y=a;}
 const window=add(sph(.038,12),MAT.gold,0,.045,.069);window.scale.z=.35;
 const flame=add(new THREE.ConeGeometry(.065,.32,16),glowMat(0xffb44b,2),0,-.37,0);flame.rotation.z=Math.PI;
 const trail=new THREE.InstancedMesh(cyl(.022,.022,1,10),trailMat,64);trail.name='rocket-3d-trail';trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);trail.count=0;root.add(trail);
 const burst=new THREE.Mesh(sph(.17,16),glowMat(0xe96132,1.8));burst.name='rocket-crash-burst';burst.visible=false;root.add(burst);
 let displayAge=0,lastRound=null,lastPhase=null;
 const a=v3(0,0,0),b=v3(0,0,0),d=v3(0,0,0),mid=v3(0,0,0),scale=v3(1,1,1),up=v3(0,1,0),q=new THREE.Quaternion(),matrix=new THREE.Matrix4();
 updaters.push((t,dt,st)=>{const C=st.pub?.crash;if(!C){root.visible=false;return;}root.visible=true;
  const flying=C.phase==='fly'||C.phase==='boom';
  if(C.round!==lastRound||C.phase!==lastPhase){displayAge=C.phase==='fly'?C.t:0;lastRound=C.round;lastPhase=C.phase;}
  if(C.phase==='fly') {
    const predicted=displayAge+Math.min(.1,Math.max(0,dt));
    displayAge=Math.max(0,predicted+(C.t-predicted)*(1-Math.exp(-6*Math.max(0,dt))));
  }
  const age=C.phase==='fly'?displayAge:C.phase==='boom'?Gm.crashTime(Math.max(1.0001,C.point||C.mult)):0;
  // A fixed flight corridor avoids the old live-axis rescale that made long flights slide
  // backwards/downwards. Both miniature and tube follow this same continuously rising path.
  const progress=tt=>1-Math.exp(-tt/7);
  const plot=(tt,out)=>{const u=progress(tt);return out.set(-w/2+w*.039375+w*.9325*u,-h/2+h*.08+h*.824*u*u,.13*Math.sin(u*Math.PI));};
  if(flying){plot(age,b);rocket.position.copy(b);const u=progress(age);d.set(w*.9325,h*.824*2*u,.13*Math.PI*Math.cos(u*Math.PI)).normalize();rocket.quaternion.setFromUnitVectors(up,d);
   trail.count=64;for(let i=0;i<64;i++){plot(age*i/64,a);plot(age*(i+1)/64,b);d.copy(b).sub(a);const len=d.length();q.setFromUnitVectors(up,len>1e-8?d.divideScalar(len):up);mid.copy(a).add(b).multiplyScalar(.5);scale.set(1,Math.max(.00001,len),1);matrix.compose(mid,q,scale);trail.setMatrixAt(i,matrix);}trail.instanceMatrix.needsUpdate=true;trail.computeBoundingSphere();
  }else{rocket.position.set(-w*.36,-h*.30,0);rocket.rotation.set(.08,0,-.25);trail.count=0;}
  rocket.visible=C.phase!=='boom';flame.visible=C.phase==='fly';flame.scale.y=.85+.15*Math.sin(t*35);
  burst.visible=C.phase==='boom';if(burst.visible){plot(age,burst.position);burst.scale.setScalar(.7+Math.min(1,C.t)*1.6);}
 });
}
