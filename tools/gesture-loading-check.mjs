// Compare staged clips to hashes captured from the original synchronous retargeter.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const reference=JSON.parse(fs.readFileSync('docs/performance/2026-10-16-gesture-bake-reference.json'));
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/3d/plush.js',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
window.__gestureLoading={bakes:[]};let gestureLoadingTick=0;
const gestureLoadingClock=()=>{gestureLoadingTick++;requestAnimationFrame(gestureLoadingClock);};requestAnimationFrame(gestureLoadingClock);
const gestureLoadingSteps=bakeSteps;bakeSteps=function*(kind,name){
 const row={kind,name,firstTick:gestureLoadingTick,frames:0,workMs:0};__gestureLoading.bakes.push(row);
 const steps=gestureLoadingSteps(kind,name);
 for(;;){const began=performance.now(),step=steps.next();row.workMs+=performance.now()-began;
  if(step.done){row.lastTick=gestureLoadingTick;return step.value;}row.frames++;yield step.value;
 }
};
window.__checkGestureLoading=async()=>{
 const staged=Object.keys(BAKED).sort(),before=__gestureLoading.bakes.length,played=[];
 for(const kind of KINDS){
  const bean=new PlushBean({kind,color:'#a14466'});
  try{for(const key of staged.filter(k=>k.startsWith(kind+':'))){
   const name=key.slice(kind.length+1),started=bean.play(name,true);
   bean.update({x:2,z:3,face:.4,look:-.3,moving:false,seated:false,t:100,dt:.016});
   played.push({key,started,active:!!bean.g,finite:Object.values(bean.b).every(b=>b.o.quaternion.toArray().every(Number.isFinite))});
  }}finally{bean.dispose();}
 }
 const firstUseBakes=__gestureLoading.bakes.length-before;
 const again=await import('./gestures.js');let repeatFrames=0;for(const _frame of again.prepareGestures())repeatFrames++;
 const rows=[];
 for(const kind of KINDS)for(const name of Object.keys(CLIPS)){
  const clip=bake(kind,name),packed=new Uint8Array(clip.q.byteLength+clip.y.byteLength+clip.reach.byteLength);let offset=0;
  for(const a of [clip.q,clip.y,clip.reach]){packed.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),offset);offset+=a.byteLength;}
  const digest=await crypto.subtle.digest('SHA-256',packed),sha256=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  rows.push({kind,name,frames:clip.n,bytes:packed.length,sha256});
 }
 return {staged,played,firstUseBakes,repeatFrames,rows,bakes:__gestureLoading.bakes};
};
`});
 });
 await page.goto('https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const startup=await page.evaluate(()=>({bakes:__gestureLoading.bakes.slice(),readyMs:__lastCall.S.boot.ms}));
 const result=await page.evaluate(()=>__checkGestureLoading());
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/gesture-loading.json';
 fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),startup,...result,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(startup.bakes.length,52,'prepare player gestures, grabs and the staff gestures that can actually play');
 assert.equal(new Set(startup.bakes.map(r=>r.kind+':'+r.name)).size,52,'no duplicate bakes');
 assert.ok(new Set(startup.bakes.flatMap(r=>[r.firstTick,r.lastTick])).size>2,'preparation yields to loading frames');
 assert.equal(result.firstUseBakes,0,'every live gesture reuses prepared data');assert.equal(result.repeatFrames,0,'subsequent warmups do no retargeting');
 assert.equal(result.played.length,52);assert.ok(result.played.every(r=>r.started&&r.active&&r.finite));
 const expected=new Map(reference.rows.map(r=>[r.kind+':'+r.name,r]));
 assert.equal(result.rows.length,expected.size);
 for(const row of result.rows){const old=expected.get(row.kind+':'+row.name);assert.equal(row.frames,old.frames);assert.equal(row.bytes,old.bytes);assert.equal(row.sha256,old.sha256,row.kind+':'+row.name+' preserves every quaternion/root/reach float');}
 console.log('PASS: 52 live gesture variants prepared across loading frames; zero first-use/repeat bakes; all 115 staged/fallback clips match original retargeting bytes exactly.');
}finally{await browser.close();}
