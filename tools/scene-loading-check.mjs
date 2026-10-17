// Verify the actual loading barrier stages actor allocation before its first draw.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/3d/render3d.js',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:await response.text()+`
window.__sceneLoading={runs:[]};let sceneLoadingRun=null,sceneLoadingStage='',sceneLoadingTick=0;
const sceneLoadingBean=beanFor;beanFor=function(c){
 const previous=R.beans.get(c.id),began=performance.now(),bean=sceneLoadingBean(c);
 if(sceneLoadingRun&&bean!==previous)sceneLoadingRun.created.push({id:c.id,stage:sceneLoadingStage,tick:sceneLoadingTick,ms:performance.now()-began});
 return bean;
};
const sceneLoadingDraw=draw;draw=function(frame,options){
 const count=sceneLoadingRun?.created.length,began=performance.now(),roomReady=R.br.world===R.world;
 try{return sceneLoadingDraw(frame,options);}finally{
  if(sceneLoadingRun)sceneLoadingRun.draws.push({prepareOnly:!!options?.prepareOnly,created:sceneLoadingRun.created.length-count,roomReady,ms:performance.now()-began});
 }
};
const sceneLoadingWarmup=warmup;warmup=async function(frame,progress=()=>{}){
 const run={players:frame.pub?.chars.length||0,created:[],draws:[],stages:[]};
 __sceneLoading.runs.push(run);sceneLoadingRun=run;
 const tick=()=>{if(sceneLoadingRun===run){sceneLoadingTick++;requestAnimationFrame(tick);}};requestAnimationFrame(tick);
 try{return await sceneLoadingWarmup(frame,(n,text)=>{sceneLoadingStage=text;run.stages.push({text,at:performance.now(),tick:sceneLoadingTick});progress(n,text);});}
 finally{sceneLoadingRun=null;}
};
`});
 });
 await page.goto('https://10.42.0.37:3161/');
 await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 await page.evaluate(async()=>{
  const L=__lastCall,D=await import('./src/3d/render3d.js');
  L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.S.screen='briefing';
  await D.warmup({pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'});
  L.S.screen='game';L.render();
 });
 const runs=await page.evaluate(()=>__sceneLoading.runs);
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/scene-loading.json';
 fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),runs,errors},null,2));
 assert.deepEqual(errors,[]);assert.ok(runs.length>=2,'exercise menu and level preparation');
 assert.equal(runs[0].created.length,32,'prepare every demo actor');
 assert.ok(new Set(runs[0].created.map(c=>c.tick)).size>1,'actor creation yields between batches');
 for(const run of runs){
  assert.equal(run.players,32);
  assert.ok(run.draws.some(d=>d.prepareOnly));assert.ok(run.draws.some(d=>!d.prepareOnly));
  for(const draw of run.draws){assert.equal(draw.created,0,'draws reuse actors allocated during loading');assert.equal(draw.roomReady,true,'room preparation completes before drawing');}
  assert.ok(run.created.every(c=>c.stage==='Preparing players'));
 }
 console.log(JSON.stringify(runs.map(r=>({players:r.players,created:r.created.length,batches:new Set(r.created.map(c=>c.tick)).size,draws:r.draws}))));
 console.log('PASS: menu and level draws reuse staged room/actor preparation; 32-player allocation yields to the loading screen.');
}finally{await browser.close();}
