import * as THREE from 'three';
import {MAT,v3,box,rbox,basicGlow} from './world.js';
import * as T from './textures.js';
import {SKILL_NAMES} from '../skill-arcade.js';
import {paintSkill} from './skill-arcade-paint.js';
export function buildSkillCabinet(ctx,c,seat,screen,betSocket,actionButton,focusAt,registerScreen){
 const yaw=c.face,axis=v3(0,1,0),origin=v3(c.x/60,0,c.y/60),at=(x,y,z)=>v3(x,y,z).applyAxisAngle(axis,yaw).add(origin);
 const add=(geo,mat,x,y,z)=>ctx.B.add(geo,mat,at(x,y,z),yaw);
 const pin=c.game==='pinball',width=pin?1.38:1.28,depth=pin?1.82:1.26;
 add(rbox(width,.78,depth,.055),MAT.blackGloss,0,.43,0);
 add(rbox(width+.035,.045,depth+.03,.018),MAT.gold,0,.84,0);
 for(const x of[-width/2,width/2])add(box(.035,.82,depth),MAT.darkWood,x,.43,0);
 // Recessed foot plinth, burgundy insert and antique brass hardware make a complete cabinet.
 add(rbox(width-.12,.12,depth-.12,.025),MAT.darkWood,0,.09,0);
 add(box(width-.15,.35,.025),new THREE.MeshStandardMaterial({color:0x5f1c2c,roughness:.65}),0,.48,depth/2+.018);
 if(!pin){
  add(rbox(1.28,1.25,.32,.045),MAT.blackGloss,0,1.52,-.36);
  for(const x of[-.63,.63])add(box(.035,1.28,.34),MAT.gold,x,1.52,-.36);
  add(rbox(1.30,.14,.46,.025),MAT.darkWood,0,2.20,-.30);
 }else{
  for(const x of[-.65,.65])add(box(.045,.30,1.82),MAT.darkWood,x,.99,0);
  add(rbox(1.38,.62,.17,.03),MAT.blackGloss,0,1.37,-.83);
 }
 const face=screen({w:pin?1.18:1.13,h:pin?1.68:1.20,cw:600,ch:760,pos:at(0,pin?1.095:1.51,pin?-.01:-.185),yaw,tilt:pin?1.30:0,every:1/60,far:16,seat:seat.id,strength:1.03,
  key:(t,r)=>r?.phase==='play'?t:r?[r.id,r.phase,r.score].join(':'):'idle',paint:(g,w,h,t,r)=>paintSkill(c.game,g,w,h,t,r),arg:st=>st.pub?.arcade?.[c.game]||null});
 face.name='skill-screen-'+c.game;registerScreen(seat.id,face);focusAt(seat.id,'core',face);
 const z=pin?.85:.46;
 betSocket(seat,'main',at(pin?-.48:-.39,.885,z),'BET',.088);
 actionButton(seat,'btn:start','START',at(pin?-.15:.03,.885,z),'#63313b',.078);
 actionButton(seat,'btn:drop',pin?'LEFT':c.game==='vault'?'LOCK':c.game==='train'?'JUMP':c.game==='pop'?'HIT':'DROP',at(pin?.18:.37,.885,z),'#8a642e',.085);
 if(pin||c.game==='train')actionButton(seat,'btn:alt',pin?'RIGHT':'SLIDE',at(pin?.50:-.07,.885,pin?z:z-.22),'#63313b',.075);
 if(pin){const sign=screen({w:1.20,h:.36,cw:900,ch:270,pos:at(0,1.40,-.73),yaw,every:.2,far:20,seat:seat.id,key:(_t,r)=>r?[r.score,r.phase].join(':'):'idle',arg:st=>st.pub?.arcade?.[c.game]||null,paint:(g,w,h,_t,r)=>{g.fillStyle='#180b0e';g.fillRect(0,0,w,h);g.strokeStyle='#cca75d';g.lineWidth=10;g.strokeRect(5,5,w-10,h-10);g.textAlign='center';g.fillStyle='#f7d58c';g.font='bold 66px Georgia';g.fillText('MIDNIGHT PINBALL',w/2,98);g.font='bold 60px Arial';g.fillText(String(r?.score||0).padStart(6,'0'),w/2,206);}});sign.name='pinball-backglass';}
 ctx.lightSpots.push({p:at(0,2.7,.6),color:0xffce86,power:1.3,range:3.2});
}
