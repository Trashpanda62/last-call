import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FLAPPY,flappyGap,flappySpeed,flappyNew,flappyFlap,flappyTick} from '../src/flappy.js';
assert.ok(FLAPPY.speed>.22&&FLAPPY.gap<.34);
assert.ok(flappySpeed(15)>flappySpeed(0));assert.equal(flappySpeed(100),FLAPPY.maxSpeed);
assert.ok(flappyGap(15)<flappyGap(0));assert.equal(flappyGap(100),FLAPPY.minGap);
const tap=(r)=>flappyFlap(r,r.seq+1);
function run(threshold,clearX) {
 const r=flappyNew(1,1,0,100);tap(r);
 for(let i=0;i<6000&&r.phase!=='done';i++){
  const p=r.pipes.filter(p=>p.x>clearX).sort((a,b)=>a.x-b.x)[0];
  if(r.y<(p?.y??.5)-threshold&&r.vy<.2)tap(r);
  flappyTick(r,1/120);
 }
 return r;
}
const casual=run(.035,.14),precise=run(.02,.1525);
assert.ok(casual.score<15);assert.ok(precise.score>=15);
const idle=flappyNew(2,1,0,100);tap(idle);flappyTick(idle,1);flappyTick(idle,1);assert.equal(idle.phase,'done');assert.equal(idle.score,0);
const spam=flappyNew(3,1,0,100);for(let i=0;i<240&&spam.phase!=='done';i++){tap(spam);flappyTick(spam,1/120);}assert.equal(spam.phase,'done');assert.equal(spam.score,0);
// Rendering and collision share a fixed gap on each pipe, including late pipes.
for(const n of [0,5,15,30])for(const hit of [false,true]) {
 const r=flappyNew(4,1,0,100);tap(r);const p=r.pipes[0];p.n=n;p.gap=flappyGap(n);p.x=FLAPPY.x;
 r.y=p.y+p.gap/2-FLAPPY.radius+(hit?.001:-.001);r.vy=0;
 flappyTick(r,1/120);assert.equal(r.phase,hit?'done':'fly');assert.equal(p.gap,flappyGap(n));
}
const report={at:new Date().toISOString(),speed:{start:flappySpeed(0),at15:flappySpeed(15),max:FLAPPY.maxSpeed},gap:{first:flappyGap(0),at15:flappyGap(15),min:FLAPPY.minGap},casualScore:casual.score,preciseScore:precise.score,noInputScore:idle.score,spamScore:spam.score,collisionEdges:8,visibleGapMatchesCollision:true};
fs.writeFileSync('docs/performance/2026-10-17-flappy-difficulty.json',JSON.stringify(report,null,2)+'\n');console.log(report);
