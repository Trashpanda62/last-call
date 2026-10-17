// Original arcade rules. Coordinates are normalized screen space; the host owns time, hits and payouts.
export const SKILL_GAMES = ['stack','vault','train','pinball','pop'];
export const SKILL_NAMES = {stack:'Potato Stack',vault:'Vault Breaker',train:'Last Train',pinball:'Midnight Pinball',pop:'Potato Pop'};
export const SKILL_HINTS = {stack:'LEFT CLICK · DROP BLOCK',vault:'LEFT CLICK · LOCK TUMBLER',train:'LEFT CLICK · JUMP / RIGHT CLICK · SLIDE',pinball:'LEFT / RIGHT CLICK · FLIPPERS',pop:'CLICK THE FRIENDLY POTATOES · AVOID RED EYES'};
export const SKILL_TIERS = {stack:[4,7,10,14],vault:[1,2,3,5],train:[5,10,16,24],pinball:[500,950,1500,2200],pop:[6,12,20,28]};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function skillMultiplier(r){const a=SKILL_TIERS[r.game];return r.score>=a[3]?3:r.score>=a[2]?2:r.score>=a[1]?1.5:r.score>=a[0]?1:0;}
const wave=(t,s)=>.5+Math.sin(t*s)*.43;
export function skillNew(game,id,seat,player,bet){
 const r={game,id,seat,player,bet,seq:0,phase:'aim',score:0,elapsed:0,time:game==='pop'?30:60,acc:0,paid:false,abandoned:false,lastAction:-1,timer:0};
 if(game==='stack')Object.assign(r,{blocks:[{x:.5,w:.76}],x:.13,w:.76,fall:0,cut:null});
 if(game==='vault')Object.assign(r,{angle:0,target:1.1,locks:0,strikes:0,flash:0});
 if(game==='train')Object.assign(r,{y:0,vy:0,slide:0,next:1.3,obstacles:[],n:0});
 if(game==='pinball')Object.assign(r,{ball:null,balls:3,left:0,right:0,la: .22,ra:.22,trail:[],bumps:[{x:.29,y:.27,r:.075,cool:0},{x:.71,y:.27,r:.075,cool:0},{x:.5,y:.45,r:.085,cool:0}],lastFlip:[-1,-1]});
 if(game==='pop')Object.assign(r,{holes:Array.from({length:9},(_,i)=>({id:i,on:false,bad:false,until:0,up:0})),next:.3,n:0,misses:0,flash:-1});
 return r;
}
export function skillAction(r,seq,a={}){
 if(!r||r.phase==='done'||r.abandoned||seq!==r.seq+1||r.elapsed-r.lastAction<.065)return false;
 if(r.game==='stack'&&r.fall>0)return false;
 if(!Number.isFinite(a.button??0)||![0,2].includes(a.button??0))return false;
 if(r.game==='pop'&&r.phase!=='aim'&&(!Number.isFinite(a.x)||!Number.isFinite(a.y)||a.x<0||a.x>1||a.y<0||a.y>1))return false;
 r.seq=seq;r.lastAction=r.elapsed;
 if(r.phase==='aim'){r.phase='play';if(r.game==='pinball')serve(r);return true;}
 if(r.game==='stack'){
  const prev=r.blocks.at(-1),lo=Math.max(r.x-r.w/2,prev.x-prev.w/2),hi=Math.min(r.x+r.w/2,prev.x+prev.w/2);
  if(hi-lo<.018){r.phase='done';return true;}
  r.cut={x:r.x,w:r.w,keepX:(lo+hi)/2,keepW:hi-lo,t:r.elapsed};r.w=hi-lo;r.blocks.push({x:(lo+hi)/2,w:r.w});r.score++;r.x=.07+r.w/2;r.fall=.18;if(r.score>=18)r.phase='done';
 } else if(r.game==='vault'){
  const d=Math.abs(Math.atan2(Math.sin(r.angle-r.target),Math.cos(r.angle-r.target))),window=Math.max(.12,.29-r.locks*.028);
  r.flash=.32;if(d<window){r.locks++;r.score=r.locks;r.target=(r.target+2.399)%(Math.PI*2);if(r.locks>=5)r.phase='done';}else if(++r.strikes>=3)r.phase='done';
 } else if(r.game==='train'){
  if(a.button===2){if(r.y===0)r.slide=.65;}else if(r.y===0&&r.slide<=0)r.vy=2.65;
 } else if(r.game==='pinball'){
  if(!r.ball){serve(r);return true;}const side=a.button===2?1:0;if(r.elapsed-r.lastFlip[side]>=.13){r.lastFlip[side]=r.elapsed;if(side)r.right=.16;else r.left=.16;}
 } else if(r.game==='pop'){
  const x=(a.x-.08)/.28,y=(a.y-.22)/.24,col=Math.floor(x),row=Math.floor(y);
  if(col>=0&&col<3&&row>=0&&row<3){const h=r.holes[row*3+col],cx=.08+col*.28+.14,cy=.22+row*.24+.12;if(h.on&&Math.hypot((a.x-cx)/.12,(a.y-cy)/.105)<=1){h.on=false;r.flash=h.id;r.timer=.18;if(h.bad){r.score=Math.max(0,r.score-3);r.misses++;}else r.score++;}}
 }
 return true;
}
function serve(r){if(r.balls<=0){r.phase='done';return;}r.ball={x:.91,y:.86,vx:0,vy:-2.0,launch:true};r.balls--;r.trail=[];}
export function pinballFlipper(side,a){const x=side?.82:.18,sign=side?-1:1;return {x,y:.86,ex:x+sign*.27*Math.cos(a),ey:.86+.27*Math.sin(a)};}
function rail(b,ax,ay,bx,by,radius,bounce= .82,boost=0){
 const dx=bx-ax,dy=by-ay,u=clamp(((b.x-ax)*dx+(b.y-ay)*dy)/(dx*dx+dy*dy),0,1),px=ax+u*dx,py=ay+u*dy,d=Math.hypot(b.x-px,b.y-py),R=.016+radius;
 if(d>=R)return false;const nx=(b.x-px)/(d||1),ny=(b.y-py)/(d||1),vn=b.vx*nx+b.vy*ny;b.x=px+nx*R;b.y=py+ny*R;if(vn<0){b.vx-=(1+bounce)*vn*nx;b.vy-=(1+bounce)*vn*ny;}if(boost){b.vy-=boost*(.4+u*.6);b.vx+=(px<.5?1:-1)*boost*.16;}return true;
}
function pinStep(r,h){
 const oldL=r.la,oldR=r.ra;r.left=Math.max(0,r.left-h);r.right=Math.max(0,r.right-h);r.la+=((r.left>0?-.40:.22)-r.la)*Math.min(1,h*32);r.ra+=((r.right>0?-.40:.22)-r.ra)*Math.min(1,h*32);
 for(const p of r.bumps)p.cool=Math.max(0,p.cool-h);
 const b=r.ball;if(!b)return;b.vy+=1.3*h;b.vx*=1-h*.055;b.vy*=1-h*.055;b.x+=b.vx*h;b.y+=b.vy*h;
 rail(b,.065,.11,.065,1.02,.008);rail(b,.935,.11,.935,1.02,.008);rail(b,.065,.11,.25,.055,.008);rail(b,.25,.055,.75,.055,.008);rail(b,.75,.055,.935,.11,.008);
 if(b.launch&&b.y<.58){b.launch=false;b.vx=-.65;}
 if(!b.launch){rail(b,.065,.70,.18,.86,.015);rail(b,.935,.70,.82,.86,.015);}
 for(const p of r.bumps){const d=Math.hypot(b.x-p.x,b.y-p.y),R=p.r+.016;if(d<R){const nx=(b.x-p.x)/(d||1),ny=(b.y-p.y)/(d||1),vn=b.vx*nx+b.vy*ny;b.x=p.x+nx*R;b.y=p.y+ny*R;if(vn<0){b.vx-=(1.9*vn-.22)*nx;b.vy-=(1.9*vn-.22)*ny;if(!p.cool){r.score+=50;p.cool=.16;}}}}
 for(const side of b.launch?[]:[0,1]){const a=side?r.ra:r.la,old=side?oldR:oldL,f=pinballFlipper(side,a);rail(b,f.x,f.y,f.ex,f.ey,.018,.82,a<old?Math.min(2,(old-a)/h*.12):0);}
 const speed=Math.hypot(b.vx,b.vy);if(speed>3){b.vx*=3/speed;b.vy*=3/speed;}
 if(b.y>1.04){r.ball=null;if(r.balls<=0)r.phase='done';}
}
function step(r,h){
 r.elapsed+=h;r.timer=Math.max(0,r.timer-h);if(r.phase==='aim')return;
 if(r.game==='stack'){r.fall=Math.max(0,r.fall-h);r.x=r.w/2+.04+(1-r.w-.08)*(.5+.5*Math.sin(r.elapsed*(1.5+r.score*.20)));}
 else if(r.game==='vault'){r.angle=(r.angle+h*(1.7+r.locks*.55)*(r.locks%2?-1:1)+Math.PI*2)%(Math.PI*2);r.flash=Math.max(0,r.flash-h);}
 else if(r.game==='train'){
  r.slide=Math.max(0,r.slide-h);r.y=Math.max(0,r.y+r.vy*h-3.8*h*h/2);r.vy=r.y>0?r.vy-3.8*h:0;r.next-=h;
  if(r.next<=0){const n=r.n++;r.obstacles.push({n,x:1.1,kind:n%3===2?'bar':'case',passed:false});r.next=Math.max(.95,1.65-r.score*.018);}
  const speed=.40+Math.min(.24,r.score*.008);for(const o of r.obstacles){o.x-=speed*h;if(Math.abs(o.x-.22)<.105&&((o.kind==='case'&&r.y<.20)||(o.kind==='bar'&&(r.slide<=0||r.y>0))))r.phase='done';if(!o.passed&&o.x<.13){o.passed=true;r.score++;}}r.obstacles=r.obstacles.filter(o=>o.x>-.15);
 }else if(r.game==='pinball')pinStep(r,h);
 else if(r.game==='pop'){
  for(const p of r.holes)if(p.on&&r.elapsed>=p.until){p.on=false;if(!p.bad)r.misses++;}
  r.next-=h;if(r.next<=0){const n=r.n++,free=r.holes.filter(p=>!p.on);if(free.length){const p=free[(n*7+Math.floor(n/3))%free.length];p.on=true;p.bad=n%5===3;p.up=r.elapsed;p.until=r.elapsed+Math.max(.43,1.05-r.score*.016);}r.next=Math.max(.24,.65-r.score*.009);}
 }
}
export function skillTick(r,dt){if(!r||r.phase==='done'||!(dt>0)||!Number.isFinite(dt))return;r.time=Math.max(0,r.time-dt);if(!r.time||r.abandoned){r.phase='done';return;}r.acc+=Math.min(dt,1);const h=1/240;for(let n=0;r.acc>=h&&n<240&&r.phase!=='done';n++,r.acc-=h)step(r,h);}
export function skillView(r){const{policy,paid,abandoned,acc,lastAction,...out}=r;return{...out,mult:skillMultiplier(r)};}
