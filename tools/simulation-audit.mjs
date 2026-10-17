// Seeded simulation/host snapshot budget, separate from GPU rendering timings.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim.js';
import { packPub, packFor, unpackSnap, wireCache } from '../src/wire.js';
import { CFG } from '../src/config.js';
const report={ at:new Date().toISOString(), host:'local Node', seed:42, simulation:[], network:[] };
for (const players of [6,16,32]) for (const mode of ['play','blackout','escape-night','escape-exits']) {
  let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const game=createGame({humans:[{name:'Audit',key:'host'}],players,killers:2,forceRole:'killer',mode:mode.startsWith('escape-')?'escape':'classic'});
  if(mode!=='play'){game.G.chars[0].cd.lights=0;game.action(0,'lights');assert.ok(game.G.blackout);}
  if(mode==='escape-exits'){for(const b of game.G.blackout.br)b.done=true;game.tick(1/60);assert.ok(game.G.exits);}
  const samples=[], modes={};
  for(let i=0;i<1800;i++) {const mode=game.G.over?'over':game.G.blackout?'blackout':'play';modes[mode]=(modes[mode]||0)+1;const t=performance.now();game.tick(1/60);samples.push(performance.now()-t);}
  samples.sort((a,b)=>a-b);for(const c of game.G.chars)assert.ok(Number.isFinite(c.x+c.y));
  report.simulation.push({players,mode,escape:game.G.escape,exits:!!game.G.exits,ticks:samples.length,modes,totalMs:+samples.reduce((a,b)=>a+b,0).toFixed(2),p95Ms:+samples[Math.floor(samples.length*.95)].toFixed(3),maxMs:+samples.at(-1).toFixed(3)});
}
for(const players of [6,16,32]) for(const moving of [false,true]) {
  let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const game=createGame({humans:Array.from({length:players},(_,i)=>({name:'Guest '+i,key:'g'+i})),players,killers:2,forceRole:'killer'});
  const states=Array.from({length:players},()=>({})), caches=Array.from({length:players},wireCache);let packed=0,plain=0;const samples=[];
  for(let i=0;i<120;i++){
    if(moving)for(const c of game.G.chars){const look=i*.07+c.id;game.setInput(c.id,{x:c.x+Math.cos(look)*2,y:c.y+Math.sin(look)*2,look,moving:true,posVer:c.posVer},true);}
    for(let j=0;j<60/CFG.netHz;j++)game.tick(1/60);
    const t=performance.now(),pub=game.pubView(),base=packPub(pub),expectedChars=JSON.parse(JSON.stringify(pub.chars));
    for(let id=1;id<players;id++){
      const view=game.view(id,pub),msg={t:'snap',...packFor(base,view.priv,states[id],game.G.meeting)},wire=JSON.stringify(msg);
      packed+=Buffer.byteLength(wire);plain+=Buffer.byteLength(JSON.stringify({t:'snap',...view}));
      const restored=unpackSnap(JSON.parse(wire),caches[id]);assert.deepEqual(restored.pub.chars,expectedChars);assert.equal(restored.priv.me,id);
    }
    samples.push(performance.now()-t);
  }
  samples.sort((a,b)=>a-b);const seconds=120/CFG.netHz;
  report.network.push({players,moving,guests:players-1,hz:CFG.netHz,snapshots:120*(players-1),packedMbps:+(packed*8/seconds/1e6).toFixed(3),plainMbps:+(plain*8/seconds/1e6).toFixed(3),p95HostBatchWithValidationMs:+samples[Math.floor(samples.length*.95)].toFixed(3)});
}
const out=process.argv[2]||'docs/performance/2026-10-16-simulation.json';fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
