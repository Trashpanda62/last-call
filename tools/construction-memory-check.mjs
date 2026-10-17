// Query retained builders after GC, without holding them through debug globals.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const p=await b.newPage({ignoreHTTPSErrors:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const cdp=await p.context().newCDPSession(p);await cdp.send('HeapProfiler.collectGarbage');
 const {result:prototype}=await cdp.send('Runtime.evaluate',{expression:"import('./src/3d/world.js').then(m=>m.Batch.prototype)",awaitPromise:true});assert.ok(prototype.objectId);
 const {objects}=await cdp.send('Runtime.queryObjects',{prototypeObjectId:prototype.objectId});
 const {result}=await cdp.send('Runtime.callFunctionOn',{objectId:objects.objectId,returnByValue:true,functionDeclaration:`function(){return Array.from(this,b=>{let geometries=0,bytes=0;for(const gs of b.lists.values())for(const g of gs){geometries++;for(const a of Object.values(g.attributes))bytes+=a.array.byteLength;if(g.index)bytes+=g.index.array.byteLength;}return {materials:b.lists.size,geometries,bytes};});}`});
 const rows=result.value,summary={builders:rows.length,geometries:rows.reduce((n,r)=>n+r.geometries,0),bytes:rows.reduce((n,r)=>n+r.bytes,0)};
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/construction-memory.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),rows,summary,errors},null,2));console.log(JSON.stringify(summary));assert.deepEqual(errors,[]);
 if(!process.argv.includes('--baseline'))assert.equal(summary.bytes,0,'completed builders should release staging geometry buffers');
 console.log(process.argv.includes('--baseline')?'PASS: retained construction buffers measured after GC.':'PASS: completed builders retain no staging geometry buffers.');
 await cdp.send('Runtime.releaseObject',{objectId:objects.objectId});await cdp.send('Runtime.releaseObject',{objectId:prototype.objectId});
}finally{await b.close();}
