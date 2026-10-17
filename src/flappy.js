// Original cabinet game: fixed-step, host-owned flight and bounded pipe collisions.
export const FLAPPY = Object.freeze({step:1/120, gravity:1.85, flap:.60, speed:.30, maxSpeed:.43, gap:.28, minGap:.21, radius:.025, x:.23, width:.105, spacing:.43, limit:45});
const centre = n => .5 + Math.sin(n*2.399)*.22;
// Each opening keeps its size while on screen; later pipes tighten without
// changing an obstacle around a player who is already flying through it.
export const flappyGap = n => Math.max(FLAPPY.minGap, FLAPPY.gap - n*.004);
export const flappySpeed = score => Math.min(FLAPPY.maxSpeed, FLAPPY.speed + score*.007);
export const flappyMultiplier = score => score>=15?3:score>=10?2:score>=6?1.5:score>=3?1:0;
export function flappyNew(id,seat,player,bet) {return {game:'flappy',id,seat,player,bet,phase:'aim',seq:0,score:0,y:.5,vy:0,time:FLAPPY.limit,elapsed:0,acc:0,lastFlap:-1,paid:false,abandoned:false,pipes:Array.from({length:4},(_,i)=>({n:i,x:.85+i*FLAPPY.spacing,y:centre(i),gap:flappyGap(i),passed:false}))};}
export function flappyFlap(r,seq) {
 if(!r||!['aim','fly'].includes(r.phase)||r.abandoned||seq!==r.seq+1||r.elapsed-r.lastFlap<.10)return false;
 r.seq=seq;r.phase='fly';r.vy=FLAPPY.flap;r.lastFlap=r.elapsed;return true;
}
export function flappyTick(r,dt) {
 if(!r||r.phase==='done'||!(dt>0)||!Number.isFinite(dt))return;
 r.time=Math.max(0,r.time-dt);if(!r.time||r.abandoned){r.phase='done';return;}
 r.acc+=Math.min(1,dt);
 for(let i=0;r.acc>=FLAPPY.step&&i<120;i++,r.acc-=FLAPPY.step){
  const h=FLAPPY.step;r.elapsed+=h;if(r.phase!=='fly')continue;
  r.y+=r.vy*h-FLAPPY.gravity*h*h/2;r.vy-=FLAPPY.gravity*h;
  const speed=flappySpeed(r.score);
  for(const p of r.pipes){p.x-=speed*h;
   if(p.x-FLAPPY.width/2<=FLAPPY.x+FLAPPY.radius&&p.x+FLAPPY.width/2>=FLAPPY.x-FLAPPY.radius&&Math.abs(r.y-p.y)+FLAPPY.radius>=p.gap/2)r.phase='done';
   if(!p.passed&&p.x+FLAPPY.width/2<FLAPPY.x-FLAPPY.radius){p.passed=true;r.score++;}
  }
  if(r.y<FLAPPY.radius||r.y>1-FLAPPY.radius)r.phase='done';
  for(const p of r.pipes)if(p.x<-.1){const next=Math.max(...r.pipes.map(p=>p.n))+1;p.n=next;p.x=Math.max(...r.pipes.map(p=>p.x))+FLAPPY.spacing;p.y=centre(next);p.gap=flappyGap(next);p.passed=false;}
  if(r.phase==='done')break;
 }
}
export function flappyView(r){if(!r)return null;const {paid,abandoned,acc,policy,lastFlap,...v}=r;return {...v,mult:flappyMultiplier(r.score)};}
