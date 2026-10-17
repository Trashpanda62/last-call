import assert from 'node:assert/strict';import fs from 'node:fs';
import {flappyNew,flappyFlap,flappyTick,flappyMultiplier} from '../src/flappy.js';
import {skeeNew,skeeLaunch,skeeTick} from '../src/skee.js';
import {createGame} from '../src/sim.js';import * as M from '../src/map.js';import {CFG} from '../src/config.js';
const r=flappyNew(1,1,0,100);assert.equal(flappyFlap(r,2),false);assert.equal(flappyFlap(r,1),true);assert.equal(flappyFlap(r,1),false);
let steps=0;while(r.phase!=='done'&&steps++<10000){const p=r.pipes.filter(p=>p.x>.14).sort((a,b)=>a.x-b.x)[0],target=p?.y||.5;if(r.y<target-.035&&r.vy<.2)flappyFlap(r,r.seq+1);flappyTick(r,1/120);}
assert.ok(r.score>=15,`autopilot can clear 15 pipes, got ${r.score}`);assert.equal(flappyMultiplier(r.score),3);
const fail=flappyNew(2,1,0,100);flappyFlap(fail,1);for(let i=0;i<240;i++)flappyTick(fail,1/120);assert.equal(fail.phase,'done');assert.equal(fail.score,0);
function game(){const g=createGame({humans:[{name:'Owner',key:'a'},{name:'Other',key:'b'}],players:6,forceRole:'gambler'});for(const c of g.G.chars)c.isHuman=true;g.G.target=1e12;return g;}
function sit(g,game,id=0){const c=g.G.chars[id],s=g.G.seats.find(s=>s.game===game);g.setInput(id,{x:s.x,y:s.y,look:s.face,posVer:c.posVer});assert.equal(c.seat,s);return s;}
const isolated=game();sit(isolated,'crash');isolated.action(0,'crash',{bet:1000,auto:0});assert.equal(isolated.G.race.phase,'bet');
const g=game();sit(g,'race');g.action(0,'race',{duck:2,bet:1000});assert.equal(g.G.race.phase,'run');assert.equal(g.G.race.t,0);const rid=g.G.race.round;g.action(0,'race',{duck:3,bet:2000});assert.equal(g.G.race.bets.get(0).duck,2);
g.action(0,'leave');sit(g,'flappy');g.action(0,'arcade',{kind:'start',after:0,bet:1000});const a=g.G.arcade.flappy;assert.ok(a);g.action(1,'arcade',{kind:'drop',round:a.id,sequence:1});assert.equal(a.seq,0);g.action(0,'arcade',{kind:'drop',round:a.id,sequence:1});assert.equal(a.seq,1);g.action(0,'arcade',{kind:'drop',round:a.id,sequence:1});assert.equal(a.seq,1);const bank=g.G.bank;for(let i=0;i<240;i++)g.tick(1/120);assert.ok(a.paid);const settled=g.G.bank;for(let i=0;i<30;i++)g.tick(1/120);assert.equal(g.G.bank,settled);g.action(0,'arcade',{kind:'start',after:0,bet:1000});assert.equal(g.G.arcade.flappy,a);
const pub=g.pubView();assert.ok(pub.arcade.flappy);assert.ok(!('policy'in pub.arcade.flappy));
const win=game();sit(win,'flappy');win.action(0,'arcade',{kind:'start',after:0,bet:1000});const wr=win.G.arcade.flappy,winningBank=win.G.bank;
for(let i=0;i<6000&&wr.phase!=='done';i++){const p=wr.pipes.filter(p=>p.x>.14).sort((a,b)=>a.x-b.x)[0];if(wr.phase==='aim'||wr.y<(p?.y||.5)-.035&&wr.vy<.2)win.action(0,'arcade',{kind:'drop',round:wr.id,sequence:wr.seq+1});win.tick(1/120);}
assert.ok(wr.paid&&wr.score>=15);assert.equal(wr.net,2100);assert.equal(win.G.bank-winningBank,wr.net);
const hidden={a:{x:400,y:1280},b:{x:400,y:1490}};assert.equal(M.los(hidden.a,hidden.b),false);assert.equal(M.los({x:820,y:1240},{x:820,y:1800}),true);
const sight=game(),observer=sight.G.chars[0],target=sight.G.chars[1];Object.assign(observer,{x:400,y:1280,look:Math.PI/2});Object.assign(target,{x:400,y:1490});assert.equal(sight.canSee(observer,target),false);observer.x=target.x=820;assert.equal(sight.canSee(observer,target),true);
const seats=M.makeSeats();for(const s of seats.filter(s=>['slots','flappy'].includes(s.game))){assert.ok(M.standable(s),`${s.game} seat ${s.id}`);assert.ok(M.standable(s.approach),`${s.game} approach ${s.id}`);}
function murder(x){const g=createGame({humans:[{name:'Killer',key:'k'},{name:'Victim',key:'v'},{name:'Witness',key:'w'}],players:6,killers:1,forceRole:'killer'});g.G.target=1e12;for(const c of g.G.chars){c.isHuman=true;c.x=1300;c.y=400+c.id*40;}const[k,v,w]=g.G.chars;Object.assign(k,{x,y:1490,look:Math.PI/2});Object.assign(v,{x,y:1515,look:Math.PI/2});Object.assign(w,{x,y:1280,look:Math.PI/2});k.cd.blade=0;const notes=w.notes.filter(n=>n.hard).length;g.action(0,'blade');assert.equal(v.alive,false);return w.notes.filter(n=>n.hard).length-notes;}
assert.equal(murder(400),0);assert.ok(murder(820)>0,'open aisle kill can still be witnessed');
let ballisticSamples=0,rebounds=0;
for(const hot of[false,true])for(const aim of[-1,0,1]){const sr=skeeNew(1,0,0,100,hot);skeeLaunch(sr,aim,.7,1);for(let i=0;i<1500&&sr.phase!=='aim'&&sr.phase!=='done';i++){
 const b=sr.ball,before=b&&{...b};skeeTick(sr,1/120);
 if(before?.stage==='flight'&&sr.ball?.stage==='flight'&&sr.ball.bounces===before.bounces){assert.ok(Math.abs(sr.ball.vy-before.vy+9.8/120)<1e-8);assert.equal(sr.ball.vx,before.vx);assert.equal(sr.ball.assist,false);ballisticSamples++;}
 if(sr.ball?.stage==='rebound')rebounds++;
 }}assert.ok(ballisticSamples>20&&rebounds>0);
const report={skeeball:{ballisticSamples,rebounds,noMidflightSteering:true},at:new Date().toISOString(),race:{instantStart:true,lateBetRejected:true,round:rid},flappy:{winningHostScore:wr.score,winningBankDelta:wr.net,autopilotScore:r.score,miss:fail.score,ownership:true,replay:true,paidOnce:true,bankDelta:settled-bank,wire:true},slotHall:{machines:M.SLOT_STATIONS.filter(s=>s.tier==='penny').length,banks:M.SLOT_BANKS.length,hiddenSightline:true,realMurderHidden:true,openAisleMurderWitnessed:true,centreAisleClear:true},clearSeats:seats.length};fs.writeFileSync('docs/performance/2026-10-17-arcade-followup-rules.json',JSON.stringify(report,null,2)+'\n');console.log(report);
