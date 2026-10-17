// Deterministic same-build comparison: room-only vs projected doorway visibility.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const rows=[];
 for(const coarse of [true,false]){
  const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('https://10.42.0.37:3161/'+(coarse?'?coarseCull':''));await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  await p.evaluate(()=>{let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);const L=__lastCall;L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.place(2180,805);L.look(Math.PI,.23);L.render();});
  await p.waitForTimeout(500);const crowded=await p.evaluate(()=>__lastCall.gfx());
  await p.evaluate(()=>{const L=__lastCall;for(const [id,y] of [[1,700],[2,960]]){const c=L.state.chars[id];c.x=1900;c.y=y;c.seat=null;c.alive=true;c.monster=false;c.moving=false;c.held=null;}L.place(2180,960);L.look(Math.PI,0);L.render();});
  await p.waitForTimeout(150);const actors=await p.evaluate(()=>__lastCall.scene().actors);
  assert.equal(actors.find(c=>c.id===2).visible,true,'character framed by the doorway stays visible');
  if(!coarse)assert.equal(actors.find(c=>c.id===1).visible,false,'character behind the adjoining wall is culled');
  assert.deepEqual(errors,[]);rows.push({mode:coarse?'room-only':'doorway-window',crowded,actors:actors.filter(c=>c.id===1||c.id===2)});await p.close();
 }
 const reduction={calls:1-rows[1].crowded.calls/rows[0].crowded.calls,triangles:1-rows[1].crowded.tris/rows[0].crowded.tris};
 assert.ok(reduction.triangles>.2,'doorway culling should remove substantial hidden geometry');
 const result={at:new Date().toISOString(),viewport:[1280,720],preset:'high',players:32,seed:42,rows,reduction};fs.writeFileSync('shots/portal-audit.json',JSON.stringify(result,null,2));console.log('PASS: visible doorway actor preserved, actor behind wall removed; deterministic 32-player audit',JSON.stringify(result));
}finally{await b.close();}

