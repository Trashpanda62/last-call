import assert from 'node:assert/strict';import fs from 'node:fs';import * as M from '../src/map.js';import {CFG} from '../src/config.js';
const seats=M.makeSeats(),r=CFG.radius+1;
const gap=(p,b)=>Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.w),Math.max(b.y-p.y,0,p.y-b.y-b.h));
const solids=M.SOLIDS.concat(M.PLANTS.map(([x,y])=>({x:x-14.4,y:y-14.4,w:28.8,h:28.8,kind:'plant'})));
const starts=[...M.DOORS.flatMap((d,i)=>[d.pa,d.pb].map((p,j)=>({...p,id:`door-${i}-${j}`}))),...M.STAFF_DOORS.map(d=>({x:d.sx,y:d.sy,id:`staff-${d.id}`}))];
let segments=0;const rows=[];
for(const s of seats){for(const p of [s,s.approach])assert.ok(solids.every(b=>(p===s&&s.game==='bj'&&b.kind==='bj')||gap(p,b)>=r),`occupied/approach blocked: ${s.id}`);
 for(const start of starts){let from=start;const path=M.route(start,s.approach);for(const to of path){const n=Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/2);for(let i=0;i<=n;i++){const p={x:from.x+(to.x-from.x)*i/(n||1),y:from.y+(to.y-from.y)*i/(n||1)};assert.ok(M.SOLIDS.every(b=>gap(p,b)>=CFG.radius-.01),`${start.id} -> ${s.id}: blocked segment at ${JSON.stringify(p)}`);}from=to;segments++;}assert.deepEqual(from,s.approach);rows.push({from:start.id,seat:s.id,game:s.game,waypoints:path.length});}}
for(let i=0;i<seats.length;i++)for(const b of seats.slice(i+1))assert.ok(Math.hypot(seats[i].x-b.x,seats[i].y-b.y)>=CFG.radius*2);
const snacks=[];
for(const [id,bowl]of M.BOWL_SPOTS.entries()){
 const approach={x:bowl.x,y:bowl.y+30};
 assert.ok(solids.every(b=>gap(bowl,b)>=15),`snack stand ${id} overlaps furniture`);
 assert.ok(solids.every(b=>gap(approach,b)>=r),`snack approach ${id} blocked`);
 for(const start of starts){let from=start;const path=M.route(start,approach);for(const to of path){const n=Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/2);for(let i=0;i<=n;i++){const p={x:from.x+(to.x-from.x)*i/(n||1),y:from.y+(to.y-from.y)*i/(n||1)};assert.ok(M.SOLIDS.every(b=>gap(p,b)>=CFG.radius-.01),`${start.id} -> snack ${id}: blocked route`);}from=to;segments++;}assert.deepEqual(from,approach);}
 snacks.push({id,...bowl,approach,routes:starts.length});
}
// The rocket statue is walk-through decor: keep it off every arcade seat, approach, snack stand and furniture, and off
// every navigation route into the arcade.
const rocket=M.ARCADE_ROCKET,arcadeSeats=M.makeSeats().filter(s=>M.roomOf(s)==='arcade');let rocketSamples=0;
for(const s of arcadeSeats)for(const p of [s,s.approach])assert.ok(Math.hypot(p.x-rocket.x,p.y-rocket.y)>=rocket.r+r,`rocket statue blocks ${s.id}`);
for(const bowl of M.BOWL_SPOTS)assert.ok(Math.hypot(bowl.x-rocket.x,bowl.y-rocket.y)>=rocket.r+30+r,'rocket statue blocks a snack stand');
for(const b of M.OBSTACLES)assert.ok(gap(rocket,b)>=rocket.r+2,`rocket statue overlaps ${b.kind}`);
assert.ok(rocket.x-rocket.r>=M.ROOMS.arcade.x&&rocket.y-rocket.r>=M.ROOMS.arcade.y,'rocket statue crosses the arcade walls');
for(const s of arcadeSeats)for(const start of starts){let from=start;for(const to of M.route(start,s.approach)){const n=Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/2);for(let i=0;i<=n;i++){const p={x:from.x+(to.x-from.x)*i/(n||1),y:from.y+(to.y-from.y)*i/(n||1)};assert.ok(Math.hypot(p.x-rocket.x,p.y-rocket.y)>=rocket.r+CFG.radius,`${start.id} -> ${s.id}: route crosses the rocket statue`);rocketSamples++;}from=to;}}
const report={at:new Date().toISOString(),snacks,rocket:{...rocket,arcadeSeats:arcadeSeats.length,routes:arcadeSeats.length*starts.length,samples:rocketSamples},scope:'All 63 seat approaches and occupied positions, all six snacks, every door and staff exit. Blackjack seated positions intentionally exempt their own table rectangle.',seats:seats.map(({id,game,x,y,approach})=>({id,game,x,y,approach})),routes:rows.length+snacks.length*starts.length,segments,rows};fs.writeFileSync('docs/performance/2026-10-17-layout-routes.json',JSON.stringify(report,null,2)+'\n');console.log(`PASS: ${seats.length} actual casino seats and approaches; ${report.routes} host navigation routes / ${segments} segments clear at player radius; six snack stands and approaches clear, no simultaneous player overlaps.`);
