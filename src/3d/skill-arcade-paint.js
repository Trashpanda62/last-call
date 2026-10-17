import * as T from './textures.js';
import {SKILL_NAMES,SKILL_HINTS,SKILL_TIERS,pinballFlipper} from '../skill-arcade.js';
const image=(game,i)=>T.art2('arcade-'+game+'-'+i);
function pic(g,im,x,y,w,h){if(im)g.drawImage(im,x,y,w,h);}
function disk(g,x,y,r,color){g.fillStyle=color;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();}
function line(g,ax,ay,bx,by,width,color){g.strokeStyle=color;g.lineWidth=width;g.lineCap='round';g.beginPath();g.moveTo(ax,ay);g.lineTo(bx,by);g.stroke();}
export function paintSkill(game,g,w,h,t,r){
 g.save();g.scale(w/600,h/760);const W=600,H=760;
 g.fillStyle='#100a0c';g.fillRect(0,0,W,H);pic(g,image(game,0),8,108,584,568);g.fillStyle='#09060a66';g.fillRect(8,108,584,568);
 if(game==='stack'){
  const blocks=r?.blocks||[{x:.5,w:.76}],score=r?.score||0,base=620,dy=Math.min(32,430/Math.max(12,blocks.length)),first=Math.max(0,blocks.length-14);
  blocks.slice(first).forEach((b,i)=>{const x=(b.x-b.w/2)*W,y=base-i*dy;g.fillStyle='#0008';g.fillRect(x+4,y+5,b.w*W,dy+4);pic(g,image(game,1),x,y,b.w*W,dy+4);line(g,x+2,y+2,x+b.w*W-2,y+2,2,'#ffe2aa99');});
  const x=r?.x??.45,bw=r?.w??.76,y=base-(blocks.length-first)*dy-15;
  pic(g,image(game,1),(x-bw/2)*W,y,bw*W,dy+4);
  line(g,x*W,y-5,x*W,y-25,2,'#f5d68a');pic(g,image(game,2),22,520,78,134);if(score>=10)pic(g,image(game,3),485,125,85,90);
  const cut=r?.cut,age=r? r.elapsed-(cut?.t||0):2;if(cut&&age<.7){const dx=(cut.x-cut.keepX),left=dx<0,ww=cut.w-cut.keepW;if(ww>0){g.save();g.globalAlpha=1-age/.7;pic(g,image(game,1),((left?cut.x-cut.w/2:cut.keepX+cut.keepW/2)+Math.sign(dx)*age*.15)*W,y+age*age*300,ww*W,dy);g.restore();}}
 }else if(game==='vault'){
  pic(g,image(game,1),82,180,436,436);disk(g,300,398,140,'#10090ce8');
  const a=r?.angle??t*.45,target=r?.target??1.1,win=Math.max(.12,.29-(r?.locks||0)*.028);
  g.save();g.translate(300,398);g.rotate(a);pic(g,image(game,2),-140,-140,280,280);g.restore();
  if((r?.locks||0)>0)pic(g,image(game,3),455,550,115,90);
  g.strokeStyle='#65be95';g.lineWidth=19;g.beginPath();g.arc(300,398,118,target-win-Math.PI/2,target+win-Math.PI/2);g.stroke();
  for(let i=0;i<48;i++){const a=i*Math.PI/24;line(g,300+Math.sin(a)*99,398-Math.cos(a)*99,300+Math.sin(a)*107,398-Math.cos(a)*107,2,'#c29b5d');}
  line(g,300,398,300+Math.sin(a)*112,398-Math.cos(a)*112,8,'#f6d58b');disk(g,300,398,18,'#bb8847');
  for(let i=0;i<5;i++)disk(g,204+i*48,628,12,i<(r?.locks||0)?'#75d3a3':'#594134');
  if(r?.flash>0){g.strokeStyle=r.locks>0&&Math.abs(Math.atan2(Math.sin(a-target),Math.cos(a-target)))<win?'#82e0af':'#d77966';g.lineWidth=6;g.beginPath();g.arc(300,398,150,0,Math.PI*2);g.stroke();}
  g.fillStyle='#edba8b';g.textAlign='center';g.font='bold 20px Arial';g.fillText((3-(r?.strikes||0))+' ATTEMPTS · MATCH THE GREEN ARC',300,155);
 }else if(game==='train'){
  const off=(t*30)%584;pic(g,image(game,0),8-off,108,584,568);pic(g,image(game,0),592-off,108,584,568);
  g.fillStyle='#0a070b66';g.fillRect(8,108,584,568);line(g,8,610,592,610,6,'#cba15d');
  const y=610-(r?.y||0)*300,slide=(r?.slide||0)>0;
  g.save();g.translate(132,y);if(slide){g.rotate(-Math.PI/2);pic(g,image(game,1),0,-48,46,96);}else{g.rotate(Math.sin(t*18)*.035);pic(g,image(game,1),-38,-104,82,104);}g.restore();
  for(const o of r?.obstacles||[{x:.8,kind:'case'}]){if(o.kind==='case')pic(g,image(game,2),o.x*W-24,550,48,60);else pic(g,image(game,3),o.x*W-27,365,54,195);}
  g.textAlign='center';g.font='bold 22px Arial';g.fillStyle='#ffe2a2';g.fillText('PLATFORM 13 · LAST DEPARTURE',300,650);
 }else if(game==='pop'){
  for(let i=0;i<9;i++){const x=(.22+i%3*.28)*W,y=(.34+Math.floor(i/3)*.24)*H,p=r?.holes?.[i],demo=!r&&i===4;
   g.save();g.beginPath();g.ellipse(x,y,72,80,0,0,Math.PI*2);g.fillStyle='#100a0c';g.fill();g.strokeStyle='#bb9150';g.lineWidth=5;g.stroke();g.clip();
   if(p?.on||demo){const rise=demo?1:Math.min(1,(r.elapsed-p.up)*9);pic(g,image(game,p?.bad?2:1),x-69,y+68-rise*143,138,154);}
   if(r?.flash===i&&r.timer>0){g.fillStyle='#ffd27655';g.fillRect(x-75,y-85,150,170);pic(g,image(game,3),x-28,y-60,70,100);}g.restore();
  }
 }else if(game==='pinball'){
  // The same normalized geometry drives the 240 Hz sphere/rail/flipper collisions.
  g.save();g.translate(0,112);g.scale(600,540);pic(g,image(game,0),.04,.025,.92,.99);
  const rail=(ax,ay,bx,by,width=.015)=>line(g,ax,ay,bx,by,width,'#d9b36f');
  rail(.065,.11,.065,.72);rail(.935,.11,.935,.72);rail(.065,.11,.25,.055);rail(.25,.055,.75,.055);rail(.75,.055,.935,.11);rail(.065,.70,.18,.86,.024);rail(.935,.70,.82,.86,.024);
  const bumps=r?.bumps||[{x:.29,y:.27,r:.075},{x:.71,y:.27,r:.075},{x:.5,y:.45,r:.085}];
  for(const p of bumps){if(p.cool>0){disk(g,p.x,p.y,p.r+.025,'#ffe7a877');}pic(g,image(game,1),p.x-p.r,p.y-p.r,p.r*2,p.r*2);}
  pic(g,image(game,2),.40,.57,.20,.14);pic(g,image(game,3),.42,.08,.16,.12);
  for(const side of[0,1]){const f=pinballFlipper(side,side?r?.ra??.22:r?.la??.22);line(g,f.x,f.y,f.ex,f.ey,.043,'#f5d28d');line(g,f.x,f.y,f.ex,f.ey,.022,'#912f3d');disk(g,f.x,f.y,.025,'#f5d28d');}
  g.restore();
  g.textAlign='center';g.font='bold 20px Arial';g.fillStyle='#f5d28d';g.fillText(r&&!r.ball&&r.phase==='play'?'SPACE · LAUNCH NEXT BALL':(r?.balls??3)+' IN RESERVE · BUMPERS +50',300,675);
 }
 // Fixed header/footer preserve readable play area and the real hit coordinates.
 g.fillStyle='#100a0cf2';g.fillRect(0,0,600,108);g.fillRect(0,701,600,59);g.strokeStyle='#bd9553';g.lineWidth=4;g.strokeRect(3,3,594,754);
 g.textAlign='center';g.textBaseline='middle';g.fillStyle='#edcc88';g.font='bold '+(game==='pinball'?31:38)+'px Georgia';g.fillText(SKILL_NAMES[game].toUpperCase(),300,35);
 g.font='bold 20px Arial';g.fillStyle='#fff0cc';g.fillText(r?.phase==='done'?'PAID $'+Math.round(r.bet*r.mult)+' · '+r.mult+'× RETURN':r?r.score+' POINTS · '+Math.ceil(r.time)+'s':'PLACE BET · PRESS START',300,76);
 g.font='bold 15px Arial';g.fillText(SKILL_HINTS[game],300,721);g.font='13px Arial';g.fillStyle='#c8b58e';g.fillText(SKILL_TIERS[game].map((n,i)=>n+' = '+[1,1.5,2,3][i]+'×').join('     '),300,746);
 if(r?.phase==='aim'){g.fillStyle='#f7d48c';g.font='bold 20px Arial';g.fillText(game==='pinball'?'SPACE TO LAUNCH':'SPACE / CLICK TO BEGIN',300,675);}
 g.restore();
}
