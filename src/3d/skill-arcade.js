import * as THREE from 'three';
import {MAT,v3,box,rbox} from './world.js';
import {SKILL_NAMES,pinballFlipper} from '../skill-arcade.js';
import {makeBean,onPlushReady} from './plush.js';
import {paintSkill} from './skill-arcade-paint.js';
export function buildSkillCabinet(ctx,c,seat,screen,betSocket,actionButton,focusAt,registerScreen,updaters,starters){
 const yaw=c.face,axis=v3(0,1,0),origin=v3(c.x/60,0,c.y/60),at=(x,y,z)=>v3(x,y,z).applyAxisAngle(axis,yaw).add(origin);
 const add=(geo,mat,x,y,z)=>ctx.B.add(geo,mat,at(x,y,z),yaw);
 const pin=c.game==='pinball',pop=c.game==='pop',width=pop?1.7:pin?1.38:1.28,depth=pop?1.65:pin?1.82:1.26;
 add(rbox(width,.78,depth,.055),MAT.blackGloss,0,.43,0);
 add(rbox(width+.035,.045,depth+.03,.018),MAT.gold,0,.84,0);
 for(const x of[-width/2,width/2])add(box(.035,.82,depth),MAT.darkWood,x,.43,0);
 // Recessed foot plinth, burgundy insert and antique brass hardware make a complete cabinet.
 add(rbox(width-.12,.12,depth-.12,.025),MAT.darkWood,0,.09,0);
 add(box(width-.15,.35,.025),new THREE.MeshStandardMaterial({color:0x5f1c2c,roughness:.65}),0,.48,depth/2+.018);
 if(!pin&&!pop){
  add(rbox(1.28,1.25,.32,.045),MAT.blackGloss,0,1.52,-.36);
  for(const x of[-.63,.63])add(box(.035,1.28,.34),MAT.gold,x,1.52,-.36);
  add(rbox(1.30,.14,.46,.025),MAT.darkWood,0,2.20,-.30);
 }else if(pin){
  for(const x of[-.65,.65])add(box(.045,.30,1.82),MAT.darkWood,x,.99,0);
  add(rbox(1.38,.62,.17,.03),MAT.blackGloss,0,1.37,-.83);
 }
 if(pop){buildPotatoPop();return;}
 const face=screen({w:pin?1.18:1.13,h:pin?1.68:1.20,cw:600,ch:760,pos:at(0,pin?1.095:1.51,pin?-.01:-.185),yaw,tilt:pin?1.30:0,every:1/60,far:16,seat:seat.id,strength:1.03,
  key:(t,r)=>r?.phase==='play'?t:r?[r.id,r.phase,r.score].join(':'):'idle',paint:(g,w,h,t,r)=>paintSkill(c.game,g,w,h,t,r),arg:st=>st.pub?.arcade?.[c.game]||null});
 face.name='skill-screen-'+c.game;registerScreen(seat.id,face);focusAt(seat.id,'core',face);
 // Metal paddles sit above the glass; their hinge endpoints match the host's collision segments.
 if(pin){
  const paddleMat=new THREE.MeshStandardMaterial({color:0xe2c28a,metalness:.65,roughness:.24});
  const point=(x,y)=>v3((x-.5)*1.18,(.5-(112+y*540)/760)*1.68,.014);
  const paddles=[0,1].map(side=>{const f=pinballFlipper(side,.22),a=point(f.x,f.y),b=point(f.ex,f.ey),mesh=new THREE.Mesh(new THREE.CapsuleGeometry(.023,a.distanceTo(b)-.046,5,12),paddleMat);mesh.name=side?'pinball-right-flipper':'pinball-left-flipper';face.add(mesh);return mesh;});
  const bumps=[{x:.29,y:.27,r:.075},{x:.71,y:.27,r:.075},{x:.5,y:.45,r:.085}].map(p=>{const root=new THREE.Group();root.position.copy(point(p.x,p.y));face.add(root);const rim=new THREE.Mesh(new THREE.TorusGeometry(p.r*1.18,.009,8,32),paddleMat);root.add(rim);const mat=new THREE.MeshStandardMaterial({color:0x8f2337,emissive:0xe34c24,emissiveIntensity:.12,metalness:.3,roughness:.2});const cap=new THREE.Mesh(new THREE.SphereGeometry(p.r*1.05,24,12),mat);cap.scale.z=.28;root.add(cap);return mat;});
  const ball=new THREE.Mesh(new THREE.SphereGeometry(.019,20,14),new THREE.MeshStandardMaterial({color:0xfaf5e8,metalness:.75,roughness:.15}));ball.name='pinball-steel-ball';face.add(ball);
  updaters.push((_t,_dt,st)=>{const r=st.pub?.arcade?.pinball;for(const side of[0,1]){const f=pinballFlipper(side,side?r?.ra??.22:r?.la??.22),a=point(f.x,f.y),b=point(f.ex,f.ey);paddles[side].position.copy(a).add(b).multiplyScalar(.5);paddles[side].quaternion.setFromUnitVectors(v3(0,1,0),b.sub(a).normalize());}bumps.forEach((mat,i)=>mat.emissiveIntensity=.12+(r?.bumps?.[i]?.cool||0)*7);const b=r?.ball||(!r?{x:.55,y:.70}:null);ball.visible=!!b;if(b)ball.position.copy(point(b.x,b.y)).setZ(.04);});
 }
 const z=pin?.85:.46;
 betSocket(seat,'main',at(pin?-.48:-.39,.885,z),'BET',.088);
 actionButton(seat,'btn:start','START',at(pin?-.15:.03,.885,z),'#63313b',.078);
 const leftButton=actionButton(seat,'btn:drop',pin?'A':c.game==='vault'?'LOCK':c.game==='train'?'JUMP':'DROP',at(pin?-.69:.37,pin?.83:.885,pin?.55:z),'#8a642e',.085);
 const rightButton=(pin||c.game==='train')&&actionButton(seat,'btn:alt',pin?'D':'SLIDE',at(pin?.69:-.07,pin?.83:.885,pin?.55:z-.22),'#63313b',.075);
 if(pin)actionButton(seat,'btn:launch','LAUNCH',at(.42,.885,z),'#278459',.08);
 if(pin)updaters.push((_t,_dt,st)=>{const r=st.pub?.arcade?.pinball;leftButton.position.y=.848-(r?.left>0?.012:0);rightButton.position.y=.848-(r?.right>0?.012:0);});
 if(pin){const sign=screen({w:1.20,h:.36,cw:900,ch:270,pos:at(0,1.40,-.73),yaw,every:.2,far:20,seat:seat.id,key:(_t,r)=>r?[r.score,r.phase].join(':'):'idle',arg:st=>st.pub?.arcade?.[c.game]||null,paint:(g,w,h,_t,r)=>{g.fillStyle='#180b0e';g.fillRect(0,0,w,h);g.strokeStyle='#cca75d';g.lineWidth=10;g.strokeRect(5,5,w-10,h-10);g.textAlign='center';g.fillStyle='#f7d58c';g.font='bold 66px Georgia';g.fillText('MIDNIGHT PINBALL',w/2,98);g.font='bold 60px Arial';g.fillText(String(r?.score||0).padStart(6,'0'),w/2,206);}});sign.name='pinball-backglass';}
 ctx.lightSpots.push({p:at(0,2.7,.6),color:0xffce86,power:1.3,range:3.2});
 // Shared cabinet finish: framed marquee, lit speaker grille, coin chute and service door.
 if(!pin){screen({w:1.14,h:.13,cw:900,ch:105,pos:at(0,2.17,-.055),yaw,far:20,key:()=>0,paint:(g,w,h)=>{g.fillStyle='#24131b';g.fillRect(0,0,w,h);g.textAlign='center';g.textBaseline='middle';g.fillStyle='#f6d18b';g.font='bold 52px Georgia';g.fillText(SKILL_NAMES[c.game].toUpperCase(),w/2,h/2);}});}
 for(const side of[-1,1])for(let i=0;i<5;i++)add(box(.13,.008,.012),MAT.gold,side*.43,.55+i*.025,depth/2+.036);
 add(rbox(.19,.15,.025,.015),MAT.brass,0,.40,depth/2+.035);add(box(.10,.015,.015),MAT.blackGloss,0,.43,depth/2+.053);
 add(rbox(.46,.19,.025,.015),MAT.darkWood,0,.19,depth/2+.035);

 function buildPotatoPop(){
  const root=new THREE.Group();root.name='potato-pop-playfield';root.position.copy(origin);root.rotation.y=yaw;ctx.group.add(root);
  const shape=new THREE.Shape();shape.moveTo(-.79,-.65);shape.lineTo(.79,-.65);shape.lineTo(.79,.65);shape.lineTo(-.79,.65);shape.closePath();
  const positions=Array.from({length:9},(_,i)=>({x:(.22+i%3*.28-.5)*1.58,z:(.34+Math.floor(i/3)*.24-.5)*1.30}));
  for(const p of positions){const hole=new THREE.Path();hole.absarc(p.x,p.z,.158,0,Math.PI*2,true);shape.holes.push(hole);}
  const deck=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:false,curveSegments:32}),new THREE.MeshStandardMaterial({color:0x324439,roughness:.55,metalness:.12}));deck.rotation.x=Math.PI/2;deck.position.y=.92;root.add(deck);
  const potatoes=[];
  for(const [i,p] of positions.entries()){
   const rim=new THREE.Mesh(new THREE.TorusGeometry(.162,.014,8,32),MAT.brass);rim.rotation.x=Math.PI/2;rim.position.set(p.x,.927,p.z);root.add(rim);
   const well=new THREE.Mesh(new THREE.CylinderGeometry(.153,.153,.30,24,1,true),new THREE.MeshStandardMaterial({color:0x080909,side:THREE.DoubleSide}));well.position.set(p.x,.76,p.z);root.add(well);
   const bottom=new THREE.Mesh(new THREE.CircleGeometry(.153,24),MAT.blackGloss);bottom.rotation.x=-Math.PI/2;bottom.position.set(p.x,.868,p.z);root.add(bottom);
   const body=new THREE.Group();body.name='pop-potato-'+i;body.position.set(p.x,.4,p.z);root.add(body);potatoes.push(body);
   const eyeMat=new THREE.MeshBasicMaterial({color:0xf1dec4,toneMapped:false});for(const side of[-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(.012,8,6),eyeMat);e.position.set(side*.047,.40,.13);body.add(e);const pupil=new THREE.Mesh(new THREE.SphereGeometry(.006,8,6),MAT.blackGloss);pupil.position.set(side*.047,.402,.14);body.add(pupil);}body.userData.eyeMat=eyeMat;
   // A hit plate rides the target, and maps to its host-owned hole coordinate.
   const hit=new THREE.Mesh(new THREE.SphereGeometry(.14,12,8),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=.34;hit.userData.part='scr';hit.userData.uvPart=()=> 'btn:hole'+i;body.add(hit);body.userData.hit=hit;
   // Register via the physical starter path, so these targets use normal scene raycasts.
   (starters[seat.id]||=[]).push([hit,'btn:hole'+i]);
  }
  onPlushReady(()=>{for(const body of potatoes){const bean=makeBean({kind:'round',color:'#71402c'});bean.root.scale.setScalar(.31);bean.root.rotation.x=-.25;bean.root.position.z=.035;if(bean.label)bean.label.visible=false;body.add(bean.root);body.userData.bean=bean;}});
  const mallet=new THREE.Group();mallet.name='potato-pop-mallet';root.add(mallet);
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.018,.023,.32,12),MAT.darkWood);handle.rotation.x=Math.PI/3;handle.position.set(0,.13,.12);mallet.add(handle);
  const head=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.19,16),new THREE.MeshStandardMaterial({color:0x8e3540,roughness:.9}));head.rotation.z=Math.PI/2;mallet.add(head);mallet.visible=false;
  // Invisible UV surface retains exact normalized hole coordinates for accessibility and touch.
  const face=screen({w:1.58,h:1.30,cw:790,ch:650,pos:at(0,.929,0),yaw,tilt:Math.PI/2,seat:seat.id,key:()=>0,paint:(g,w,h)=>g.clearRect(0,0,w,h)});face.material.transparent=true;face.material.opacity=0;face.material.depthWrite=false;face.name='skill-screen-pop';registerScreen(seat.id,face);focusAt(seat.id,'core',face);
  const sign=screen({w:1.58,h:.35,cw:960,ch:215,pos:at(0,1.18,-.70),yaw,every:1/30,seat:seat.id,key:(_t,r)=>r?[r.id,r.phase,r.score,Math.ceil(r.time)].join(':'):'idle',arg:st=>st.pub?.arcade?.pop,paint:(g,w,h,_t,r)=>{g.fillStyle='#190f14';g.fillRect(0,0,w,h);g.strokeStyle='#c29b5d';g.lineWidth=8;g.strokeRect(4,4,w-8,h-8);g.textAlign='center';g.fillStyle='#f2d39b';g.font='bold 54px Georgia';g.fillText('POTATO POP',w/2,66);g.font='bold 40px Arial';g.fillText(!r?'INSERT CHIPS · START':r.phase==='done'?'COMPLETE · '+r.score+' POINTS · '+r.mult+'× RETURN':r.score+' POINTS    '+Math.ceil(r.time)+' SECONDS',w/2,133);g.font='24px Arial';g.fillText('POTATO +1     RED EYES −3',w/2,184);}});focusAt(seat.id,'core',sign);
  betSocket(seat,'main',at(-.55,.94,.71),'BET',.09);actionButton(seat,'btn:start','START',at(.53,.94,.71),'#278459',.08);
  updaters.push((t,dt,st)=>{const r=st.pub?.arcade?.pop;for(const [i,body]of potatoes.entries()){const p=r?.holes?.[i],demo=!r&&i===4,active=(r?.phase==='play'&&p?.on)||demo,age=r?r.elapsed-(p?.up||0):1,until=p?p.until-r.elapsed:1,rise=active?Math.min(1,age*9,until*9):0;body.position.y=.43+Math.max(0,rise)*.34;body.visible=rise>0;body.userData.hit.visible=active;body.userData.eyeMat.color.set(p?.bad?'#ff2519':'#f1dec4');body.scale.setScalar(r?.flash===i&&r.timer>0?.85:1);}mallet.visible=!!(r&&r.flash>=0&&r.timer>0);if(mallet.visible){const p=positions[r.flash];mallet.position.set(p.x,1.02+Math.abs(Math.sin(r.timer/.18*Math.PI))*.18,p.z);mallet.rotation.x=-r.timer*3;}});
  for(const side of[-1,1])add(box(.045,.12,1.65),MAT.gold,side*.83,.91,0);
  ctx.lightSpots.push({p:at(0,2.4,.3),color:0xffd29a,power:1.8,range:3});
 }
}
