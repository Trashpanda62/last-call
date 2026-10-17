// Host/rules oracle: the same exported module drives real authoritative game actions.
import assert from 'node:assert/strict';import fs from 'node:fs';
import {SKEE,SKEE_POCKETS,skeeNew,skeeLaunch,skeeTick,skeeMultiplier} from '../src/skee.js';
import {createGame} from '../src/sim.js';import {CFG} from '../src/config.js';import {packPub,packFor,unpackSnap,wireCache} from '../src/wire.js';
const finishBall=(r,dt=1/120)=>{for(let i=0;i<1000&&['roll','result'].includes(r.phase);i++)skeeTick(r,dt);assert.ok(['aim','done'].includes(r.phase));};
const witnesses=new Map();let probes=0;
for(let ai=-40;ai<=40;ai++)for(let pi=0;pi<=200;pi++){
 const r=skeeNew(1,0,0,100);skeeLaunch(r,ai/40,pi/200,1);finishBall(r);probes++;
 const key=r.last===100?(ai<0?'100-left':'100-right'):String(r.last);if(!witnesses.has(key))witnesses.set(key,{aim:ai/40,power:pi/200,value:r.last});
}
assert.deepEqual([...witnesses.keys()].sort(),['0','10','20','30','40','50','100-left','100-right'].sort());
let frames=0;for(const w of witnesses.values())for(const dt of[1/120,1/60,1/30,.1]){const r=skeeNew(1,0,0,100);assert.equal(skeeLaunch(r,w.aim,w.power,1),true);finishBall(r,dt);assert.equal(r.last,w.value);frames++;}
let protectedRounds=0;for(const aim of[-1,-.5,0,.5,1])for(const power of[0,.1,.5,.9,1]){
 const r=skeeNew(1,0,0,100,true);for(let i=1;i<=9;i++){assert.ok(skeeLaunch(r,aim,power,i));finishBall(r);}
 assert.equal(r.phase,'done');assert.equal(r.history.length,9);assert.equal(r.score,750);assert.ok(skeeMultiplier(r.score)>1);assert.equal(skeeLaunch(r,0,.5,10),false);protectedRounds++;
}
const bad=skeeNew(1,0,0,100);for(const args of[[NaN,.5,1],[0,Infinity,1],[0,.5,0],[0,.5,2]])assert.equal(skeeLaunch(bad,...args),false);
assert.ok(skeeLaunch(bad,50,-50,1));assert.equal(bad.ball.aim,1);assert.equal(bad.ball.power,0);assert.equal(skeeLaunch(bad,0,.5,1),false);
const timeout=skeeNew(2,0,0,100);skeeTick(timeout,91);assert.equal(timeout.phase,'done');assert.equal(timeout.history.length,0);
const payout=[0,119,120,199,200,299,300,399,400,549,550,900].map(s=>[s,skeeMultiplier(s)]);assert.deepEqual(payout.map(r=>r[1]),[0,0,.5,.5,1,1,1.5,1.5,2,2,3,3]);
function game(){const g=createGame({humans:[{name:'One',key:'1'},{name:'Two',key:'2'},{name:'Watch',key:'3'}],players:6,forceRole:'gambler'});for(const c of g.G.chars)c.isHuman=true;g.G.target=1e12;return g;}
function sit(g,id,machine){const s=g.G.seats.find(s=>s.game==='skee'&&s.machine===machine);const c=g.G.chars[id];g.setInput(id,{x:s.x,y:s.y,look:s.face,posVer:c.posVer});assert.equal(c.seat,s);return s;}
function start(g,id,machine,bet=100){sit(g,id,machine);const after=g.G.skee[machine]?.id||0;g.action(id,'skee',{kind:'start',bet,after});return g.G.skee[machine];}
function tickUntil(g,done,limit=1500){for(let i=0;i<limit&&!done();i++)g.tick(1/120);assert.ok(done());}
const g=game(),a=start(g,0,0),b=start(g,1,1),bank0=g.G.bank;
assert.notEqual(a.id,b.id);for(const id of[0,1])g.action(id,'skee',{kind:'start',bet:999,after:0});assert.equal(g.G.skee[0],a);assert.equal(g.G.skee[1],b);
g.action(1,'skee',{kind:'roll',round:a.id,sequence:1,aim:0,power:.4});assert.equal(a.launched,0);
g.action(0,'skee',{kind:'roll',round:a.id+999,sequence:1,aim:0,power:.4});assert.equal(a.launched,0);
g.action(0,'bank',{d:99999,b:100});assert.equal(g.G.bank,bank0,'client may not report skee outcomes');
const w=witnesses.get('40');
for(let n=1;n<=9;n++){
 for(const [id,r]of[[0,a],[1,b]]){const packet={kind:'roll',round:r.id,sequence:n,...w};g.action(id,'skee',packet);g.action(id,'skee',packet);assert.equal(r.launched,n);}
 tickUntil(g,()=>[a,b].every(r=>['aim','done'].includes(r.phase)));
}
assert.ok(a.paid&&b.paid);assert.equal(a.score,360);assert.equal(b.score,360);
assert.equal(g.G.bank,bank0+2*Math.round(100*(1.5-1)+100*CFG.comp));const settled=g.G.bank;
for(let i=0;i<10;i++){g.action(0,'skee',{kind:'roll',round:a.id,sequence:9,...w});g.action(0,'skee',{kind:'start',after:0,bet:100});g.tick(1/60);}
assert.equal(g.G.bank,settled);assert.equal(g.G.skee[0],a,'delayed start replay cannot open another paid round');
// Actual wire round trip, owner/spectator state and no private luck flag in snapshots.
const st={},cache=wireCache();for(let n=0;n<3;n++){const pub=g.pubView(),view=g.view(2,pub),packet=packFor(packPub(pub),view.priv,st,g.G.meeting),out=unpackSnap(JSON.parse(JSON.stringify(packet)),cache);assert.deepEqual(out.pub.skee,pub.skee);assert.ok(!JSON.stringify(out.pub.skee).includes('hot'));}
const leave=game(),lr=start(leave,0,0);leave.action(0,'skee',{kind:'roll',round:lr.id,sequence:1,...w});leave.action(0,'leave');tickUntil(leave,()=>lr.paid);assert.equal(lr.launched,1);assert.equal(lr.history.length,1);assert.equal(lr.score,40);
const death=game(),dr=start(death,0,0);const victim=death.G.chars[0];victim.trapT=.001;victim.trapBy=death.G.killerIds[0];victim.trapItem='the skee-ball return';death.tick(1/60);tickUntil(death,()=>dr.paid);assert.equal(victim.alive,false);assert.equal(victim.seat,null);assert.equal(dr.score,0);
const ghost=game();ghost.G.chars[0].alive=false;const gr=start(ghost,0,0);ghost.action(0,'skee',{kind:'roll',round:gr.id,sequence:1,...w});tickUntil(ghost,()=>gr.phase==='aim');assert.equal(gr.score,40,'ghost can still play');
const disconnect=game(),dc=start(disconnect,0,0);disconnect.action(0,'skee',{kind:'roll',round:dc.id,sequence:1,...w});disconnect.dropHuman(0);const replacement=disconnect.G.chars[0];replacement.sitT=90;replacement.gameT=9999;tickUntil(disconnect,()=>dc.paid,6000);assert.equal(dc.launched,9);assert.equal(replacement.isHuman,false);const doneBank=disconnect.G.bank;for(let i=0;i<10;i++)disconnect.tick(1/60);assert.equal(disconnect.G.bank,doneBank,'replacement round pays once');
const report={at:new Date().toISOString(),probes,witnesses:Object.fromEntries(witnesses),fixedStepChecks:frames,protectedRounds,payout,host:{simultaneousLanes:2,ballsPerLane:9,score:a.score,bankDelta:g.G.bank-bank0,duplicateRolls:'rejected',delayedStartReplay:'rejected',clientSettlement:'rejected',wrongOwnerAndRound:'rejected',wireRoundTrips:3,leave:{launched:lr.launched,score:lr.score,paid:lr.paid},death:{score:dr.score,paid:dr.paid},ghost:{score:gr.score},disconnect:{bot:!replacement.isHuman,launched:dc.launched,score:dc.score,paid:dc.paid}}};
const out=process.argv.find(a=>a.endsWith('.json'))||'docs/performance/2026-10-16-skee-rules.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));console.log('PASS: seven swept pockets/miss, nine-ball limits, every payout, protected wins and real host/wire ownership/settlement/lifecycle.');
