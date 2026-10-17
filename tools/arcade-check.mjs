import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ARCADE, arcadeNew, arcadeMove, arcadeDrop, arcadeTick, arcadeView, arcadeMultiplier } from '../src/arcade.js';
import { CFG } from '../src/config.js';
import { createGame } from '../src/sim.js';
import { packPub, packFor, unpackSnap, wireCache } from '../src/wire.js';
const rows = [];
function run(game, dt, hot = false) {
  const r = arcadeNew(game, 1, 1, 0, 1000, hot);
  let n = 0;
  while (r.phase !== 'done' && n++ < 60 / dt + 10) {
    if (r.phase === 'aim') {
      assert.ok(arcadeDrop(r, r.seq + 1));
      assert.equal(arcadeDrop(r, r.seq), false, 'a duplicate drop never consumes another play');
    }
    arcadeTick(r, dt);
  }
  assert.equal(r.phase, 'done');
  assert.ok(r.coins.length <= 40);
  assert.equal(r.used, game === 'pusher' ? ARCADE.pusherTokens : ARCADE.clawTries);
  assert.equal(r.score, game === 'pusher' ? r.coins.filter(c => c.paid).length : r.prizes.filter(p => p.taken).reduce((a,p)=>a+p.value,0));
  return r;
}
for (const game of ['pusher', 'claw']) for (const hot of [false, true]) {
  const results = [1/120, 1/60, 1/30].map(dt => run(game, dt, hot));
  assert.equal(results[0].score, results[1].score); assert.equal(results[0].score, results[2].score);
  if (hot) assert.ok(arcadeMultiplier(results[0]) > 1, game + ' protected round pays a visible assisted win');
  rows.push({game,hot,score:results[0].score,mult:arcadeMultiplier(results[0])});
}
const claw=arcadeNew('claw',1,1,0,1000);
assert.equal(arcadeMove(claw,Infinity,0,1),false);
assert.ok(arcadeMove(claw,1e9,-1e9,1));assert.equal(claw.x,.075);assert.equal(claw.z,-.075);
assert.equal(arcadeMove(claw,-1,0,1),false);
claw.x=.43;claw.z=.36;arcadeDrop(claw,2);for(let i=0;i<400;i++)arcadeTick(claw,1/120);
assert.equal(claw.score,0,'claw outside visible prize bounds misses');
const abandoned=arcadeNew('pusher',1,1,0,1000);abandoned.abandoned=true;arcadeTick(abandoned,.1);assert.equal(abandoned.phase,'done');
for (const game of ['pusher','claw']) {
  const g=createGame({humans:[{name:'Owner',key:'o'},{name:'Other',key:'x'}],players:6,killers:1,forceRole:'gambler'});
  g.G.target=1e12;for(const c of g.G.chars)c.isHuman=true;
  const c=g.G.chars[0],s=g.G.seats.find(s=>s.game===game);
  g.setInput(0,{x:s.x,y:s.y,look:s.face,posVer:c.posVer});assert.equal(c.seat,s);
  const before=g.G.bank;g.action(0,'arcade',{kind:'start',after:0,bet:1000});const r=g.G.arcade[game];assert.ok(r);
  g.action(0,'arcade',{kind:'start',after:0,bet:1000});assert.equal(g.G.arcade[game].id,r.id);
  g.action(1,'arcade',{kind:'drop',round:r.id,sequence:1});assert.equal(r.used,0);
  g.action(0,'arcade',{kind:'drop',round:r.id-1,sequence:1});assert.equal(r.used,0);
  g.action(0,'arcade',{kind:'drop',round:r.id,sequence:1});assert.equal(r.used,1);
  g.action(0,'arcade',{kind:'drop',round:r.id,sequence:1});assert.equal(r.used,1);
  for(let i=0;i<4000&&r.phase!=='done';i++){if(r.phase==='aim')g.action(0,'arcade',{kind:'drop',round:r.id,sequence:r.seq+1});g.tick(1/60);}
  assert.equal(r.paid,true);const bank=g.G.bank;assert.equal(r.net,bank-before,'published bank change matches actual credit');assert.ok(Math.abs(bank-before-Math.round(r.bet*(arcadeMultiplier(r)-1)+r.bet*CFG.comp))<.001,'the actual host bank receives exactly the posted net return');
  g.action(0,'arcade',{kind:'drop',round:r.id,sequence:r.seq+1});for(let i=0;i<60;i++)g.tick(1/60);assert.equal(g.G.bank,bank,'one settlement');
  g.action(0,'arcade',{kind:'start',after:0,bet:1000});assert.equal(g.G.arcade[game].id,r.id,'stale restart rejected');
  const publicRound=arcadeView(r);assert.equal(publicRound.policy,undefined);
  const view=g.view(1),decoded=unpackSnap(packFor(packPub(view.pub),view.priv,{},null),wireCache());
  assert.deepEqual(decoded.pub.arcade[game],publicRound);
  rows.push({game,host:true,used:r.used,score:r.score,bank,paid:r.paid});
}
for(const game of ['pusher','claw']) for(const inFlight of [false,true]) {
 const g=createGame({humans:[{name:'Owner',key:'o'}],players:6,killers:1,forceRole:'gambler'});g.G.target=1e12;for(const c of g.G.chars)c.isHuman=true;
 const c=g.G.chars[0],s=g.G.seats.find(s=>s.game===game);g.setInput(0,{x:s.x,y:s.y,look:s.face,posVer:c.posVer});
 c.items.add('insurance');g.action(0,'insurance');const before=g.G.bank;g.action(0,'arcade',{kind:'start',after:0,bet:1000});const r=g.G.arcade[game];
 if(inFlight)g.action(0,'arcade',{kind:'drop',round:r.id,sequence:1});
 c.alive=false;c.seat.occ=null;c.seat=null;c.x=1300;c.y=500;
 for(let i=0;i<600&&!r.paid;i++)g.tick(1/120);
 assert.equal(r.paid,true,'death/leave finishes native round');assert.equal(r.phase,'done');assert.ok(g.G.bank>=before,'insurance covers abandoned loss');assert.equal(r.net,g.G.bank-before,'posted bank change includes insurance refund');
 if(!inFlight)assert.equal(c.items.has('insurance'),false,'one idle abandonment consumes protection');
 const paid=g.G.bank;for(let i=0;i<100;i++)g.tick(1/120);assert.equal(g.G.bank,paid);
 rows.push({game,inFlight,abandoned:true,insurance:true,paid:r.paid,bank:g.G.bank});
}
// Each visible claw tag is paid after one delivered grab, including a clean miss.
for(const [value,x] of [[1,-.30],[2,0],[3,.30],[0,.43]]){
 const g=createGame({humans:[{name:'Payout',key:'p'}],players:6,killers:1,forceRole:'gambler'});g.G.target=1e12;for(const c of g.G.chars)c.isHuman=true;
 const c=g.G.chars[0],s=g.G.seats.find(s=>s.game==='claw');c.lucky=0;g.setInput(0,{x:s.x,y:s.y,look:s.face,posVer:c.posVer});const before=g.G.bank;
 g.action(0,'arcade',{kind:'start',after:0,bet:1000});const r=g.G.arcade.claw;r.hot=false;
 let seq=1;for(let i=0;i<Math.round(Math.abs(x)/.075);i++)g.action(0,'arcade',{kind:'move',round:r.id,sequence:seq++,dx:Math.sign(x),dz:0});
 if(!value)for(let i=0;i<5;i++)g.action(0,'arcade',{kind:'move',round:r.id,sequence:seq++,dx:0,dz:1});
 g.action(0,'arcade',{kind:'drop',round:r.id,sequence:seq});for(let i=0;i<400&&!r.paid;i++)g.tick(1/120);
 assert.equal(r.used,1);assert.equal(r.score,value);assert.equal(r.phase,'done');assert.equal(r.paid,true);const expected=Math.round(1000*(value-1)+1000*CFG.comp);assert.equal(g.G.bank-before,expected);assert.equal(r.net,expected);
 const paid=g.G.bank;g.action(0,'arcade',{kind:'drop',round:r.id,sequence:seq});for(let i=0;i<20;i++)g.tick(1/120);assert.equal(g.G.bank,paid);
 rows.push({game:'claw',tag:value,grabCount:r.used,gross:1000*value,net:r.net,bankBefore:before,bankAfter:g.G.bank,once:true});
}
// A normal single-token push must pay for its first fallen coin (no gold assistance).
{
 const g=createGame({humans:[{name:'Coin payout',key:'coin'}],players:6,killers:1,forceRole:'gambler'});g.G.target=1e12;for(const c of g.G.chars)c.isHuman=true;
 const c=g.G.chars[0],s=g.G.seats.find(s=>s.game==='pusher');c.lucky=0;g.setInput(0,{x:s.x,y:s.y,look:s.face,posVer:c.posVer});const before=g.G.bank;
 g.action(0,'arcade',{kind:'start',after:0,bet:1000});const r=g.G.arcade.pusher;r.hot=false;
 g.action(0,'arcade',{kind:'drop',round:r.id,sequence:1});for(let i=0;i<600&&!r.paid;i++)g.tick(1/120);
 assert.equal(r.score,1);assert.equal(r.used,1);assert.equal(r.paid,true);assert.equal(arcadeMultiplier(r),1);assert.equal(r.net,1000*CFG.comp);assert.equal(g.G.bank-before,r.net);
 const paid=g.G.bank;g.action(0,'arcade',{kind:'drop',round:r.id,sequence:1});for(let i=0;i<120;i++)g.tick(1/120);assert.equal(g.G.bank,paid);
 rows.push({game:'pusher',assist:false,fallenCoins:r.score,tokenCount:r.used,gross:1000,net:r.net,bankBefore:before,bankAfter:g.G.bank,once:true});
}
for(const score of [0,1,2,3,12])assert.equal(arcadeMultiplier({game:'pusher',score}),Math.min(score,3));
const out=process.argv[2]||'docs/performance/2026-10-17-arcade-rules.json';
fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),rows},null,2)+'\n');
console.log('PASS: both finite arcade games, frame-step agreement, visible claw reach/misses, protected assistance, bounded tokens, real host ownership/replay/settlement and packed spectator state.');
