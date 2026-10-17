// Repeatable cold-start and first-play audit. Use the same GPU/viewport for before/after comparisons.
import {createRequire} from 'node:module';import fs from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PW || 'playwright');
const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--enable-gpu-rasterization'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}});
 await p.addInitScript(()=>{window.perfLong=[];new PerformanceObserver(l=>perfLong.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({entryTypes:['longtask']});});
 const started=Date.now();await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});const readyMs=Date.now()-started;
 const readyAt=await p.evaluate(()=>performance.now());
 async function sample(){return p.evaluate(async()=>{let times=[],end=performance.now()+3000,prev=performance.now(),before=__lastCall.gfx().frames;await new Promise(ok=>{function f(now){times.push(now-prev);prev=now;if(now<end)requestAnimationFrame(f);else ok();}requestAnimationFrame(f);});times=times.slice(1).sort((a,b)=>a-b);return {frames:times.length,renderFrames:__lastCall.gfx().frames-before,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],gfx:__lastCall.gfx()};});}
 const menu=await sample();await p.evaluate(()=>{__lastCall.noLock();__lastCall.start('killer');__lastCall.step(.1);__lastCall.render();});const firstPlay=await sample();const later=await sample();
 const resources=await p.evaluate(readyAt=>({bytes:performance.getEntriesByType('resource').reduce((s,e)=>s+e.transferSize,0),requests:performance.getEntriesByType('resource').length,longTasks:perfLong,lateAssets:performance.getEntriesByType('resource').filter(e=>e.startTime>readyAt&&/\/assets\//.test(e.name)).map(e=>e.name)}),readyAt);
 const data={at:new Date().toISOString(),readyMs,readyAt,menu,firstPlay,later,resources};const path=process.argv[2]||'shots/performance-after.json';fs.mkdirSync(path.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(path,JSON.stringify(data,null,2));console.log(JSON.stringify(data));
}finally{await b.close();}
