// A finished cinematic must release its actor/light references while the manager stays alive.
import assert from'node:assert/strict';import fs from'node:fs';import{createRequire}from'node:module';
const{chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 await page.evaluate(async()=>{
  const THREE=await import('three'),{DeathScene}=await import('./src/3d/death-scene.js'),L=__lastCall;L.noLock();L.start('gambler',{players:6});L.step(.1);L.S.paused=true;L.S.screen='briefing';
  const cinematic=window.__retainedDeathScene=new DeathScene(new THREE.Scene()),camera=new THREE.PerspectiveCamera(72,16/9,.05,90);window.__deathWeak=[];
  const c=L.view.pub.chars[0];
  for(let i=0;i<12;i++){
   const t=100+i,priv={...L.view.priv,alive:false,deathScene:{t,x:c.x,y:c.y,face:c.look,attacker:i%2?{color:'#123456',hat:'none',monster:false}:null}},pub={...L.view.pub,t:t+.1};
   cinematic.update(pub,priv,camera,.1);
   for(const [name,o]of [['actor',cinematic.actor],['victim',cinematic.victim.root],['light',cinematic.light]])__deathWeak.push({i,name,ref:new WeakRef(o)});
   cinematic.clear();cinematic.clear();
  }
 });
 const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');
 const data=await page.evaluate(()=>({retained:__deathWeak.filter(r=>r.ref.deref()).map(({i,name})=>({i,name})),detachedGroups:__retainedDeathScene.scene.children.length,tracked:__deathWeak.length}));
 await page.evaluate(()=>{__retainedDeathScene.overlay.remove();delete window.__retainedDeathScene;delete window.__deathWeak;});
 fs.writeFileSync(process.argv[2]||'shots/death-lifetime.json',JSON.stringify({at:new Date().toISOString(),...data,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(data.tracked,36);assert.equal(data.detachedGroups,0);assert.deepEqual(data.retained,[],'all 36 cinematic actors/victims/lights must be collectible after repeated clear');
 console.log('PASS: 12 alternating monster/human cinematics release all 36 tracked objects after repeated clear while the manager stays alive.');
}finally{await browser.close();}
