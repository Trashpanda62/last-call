// Measure deferred static GPU buffers on the first visit to each casino room.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const result=await p.evaluate(()=>{
  let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const L=__lastCall;L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.place(1300,600);L.look(Math.PI/2);L.render();
  let renderer;const scene=L.scene().scene,before=scene.onBeforeRender;scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;
  const gl=renderer.getContext(),data=gl.bufferData;let uploads=[];
  gl.bufferData=function(target,value,...args){uploads.push({target,bytes:typeof value==='number'?value:value?.byteLength||0});return data.call(this,target,value,...args);};
  const rows=[];
  try{for(const [name,x,y,look]of [['bar',350,400,-Math.PI/2],['rest',330,1000,Math.PI],['arcade',2530,430,-Math.PI/2],['race',2520,1000,-Math.PI/2],['slots',1300,1480,Math.PI/2],['vip',2500,1500,Math.PI/2],['north',1110,303,Math.PI/2],['backrooms',1300,600,Math.PI/2]]){
   uploads=[];L.place(x,y);L.look(look,-.05);if(name==='backrooms')L.state.backrooms=true;L.render();rows.push({name,uploads:uploads.slice(),bytes:uploads.reduce((n,u)=>n+u.bytes,0),gfx:L.gfx()});
  }}finally{gl.bufferData=data;}
  return rows;
 });
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/geometry-loading.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),rows:result,errors},null,2));
 console.log(JSON.stringify(result.map(r=>({name:r.name,buffers:r.uploads.length,bytes:r.bytes,geos:r.gfx.geos}))));assert.deepEqual(errors,[]);
 if(!process.argv.includes('--baseline'))assert.ok(result.every(r=>r.bytes===0),'static room geometry should already be uploaded before menu readiness');
 console.log(process.argv.includes('--baseline')?'PASS: deferred room-buffer baseline recorded.':'PASS: all first room visits reuse prepared GPU buffers; no page/shader errors.');
}finally{await b.close();}
