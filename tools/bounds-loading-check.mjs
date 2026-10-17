// First scene/room/monster use must reuse bounds prepared during loading.
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
window.__boundsAudit={work:[],draws:[]};let boundsStage='';
for(const cls of [THREE.BufferGeometry,THREE.SkinnedMesh,THREE.InstancedMesh]){
 const compute=cls.prototype.computeBoundingSphere;
 cls.prototype.computeBoundingSphere=function(...args){
  const began=performance.now();try{return compute.apply(this,args);}finally{
   window.__boundsAudit.work.push({stage:boundsStage,type:this.type,name:this.name,dynamic:!!(this.isInstancedMesh&&!this.frustumCulled),vertices:(this.geometry||this).attributes?.position?.count||0,ms:performance.now()-began});
  }
 };
}
const originalBoundsWarmup=warmup;warmup=async function(frame,progress=()=>{}){
 return originalBoundsWarmup(frame,(n,text)=>{boundsStage=text;progress(n,text);});
};
const originalBoundsDraw=draw;draw=function(frame,options){
 const start=window.__boundsAudit.work.length;
 try{return originalBoundsDraw(frame,options);}finally{
  if(boundsStage==='Finishing the scene')window.__boundsAudit.draws.push(window.__boundsAudit.work.slice(start));
 }
};
`});
 });
 await page.goto('https://10.42.0.37:3161/');
 await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const startup=await page.evaluate(()=>({draws:__boundsAudit.draws.slice(),staged:__boundsAudit.work.filter(r=>r.stage==='Preparing scene bounds')}));
 const result=await page.evaluate(async()=>{
  const L=__lastCall,D=await import('./src/3d/render3d.js'),{makeMonster}=await import('./src/3d/monster.js');
  L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.S.screen='briefing';
  await D.warmup({pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'});L.S.screen='game';
  const rooms=[];
  for(const [name,x,y,look]of [['floor',1300,600,Math.PI/2],['bar',350,400,-Math.PI/2],['rest',330,1000,Math.PI],['arcade',2530,430,-Math.PI/2],['race',2520,1000,-Math.PI/2],['slots',1300,1480,Math.PI/2],['vip',2500,1500,Math.PI/2],['backrooms',1300,600,Math.PI/2]]){
   __boundsAudit.work=[];L.place(x,y);L.look(look,-.05);if(name==='backrooms')L.state.backrooms=true;L.render();
   rooms.push({name,work:__boundsAudit.work.slice()});
  }
  const monsters=[];
  for(let i=0;i<12;i++){
   __boundsAudit.work=[];const monster=makeMonster();monster.obj.updateMatrixWorld(true);
   const creationWork=__boundsAudit.work.slice();let error=0,skins=0;
   monster.obj.traverse(o=>{
    if(!o.isSkinnedMesh)return;skins++;const sphere=o.boundingSphere?.clone();
    if(!sphere){error=Infinity;return;}o.computeBoundingSphere();
    error=Math.max(error,sphere.center.distanceTo(o.boundingSphere.center),Math.abs(sphere.radius-o.boundingSphere.radius));
   });
   monsters.push({creationWork,error,skins});monster.dispose();
  }
  return {rooms,monsters};
 });
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/bounds-loading.json';
 fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),startup,...result,errors},null,2));
 assert.deepEqual(errors,[]);
 assert.ok(startup.staged.length>0,'exercise staged scene bounds');
 assert.ok(startup.draws.length>0,'capture the real final loading draw');
 for(const work of startup.draws)assert.deepEqual(work,[],'final loading draw does not calculate bounds');
 for(const room of result.rooms)assert.deepEqual(room.work.filter(w=>!w.dynamic),[],room.name+': first visit reuses prepared static/character bounds');
 for(const monster of result.monsters){assert.ok(monster.skins>0);assert.deepEqual(monster.creationWork,[]);assert.ok(monster.error<1e-8,'cached source bounds match an independent full skinning calculation');}
 console.log('PASS: no deferred bounds in the final loading draw; eight first room visits reuse static/character bounds; 12 monster clones match independent full skinning. Dynamic effects retain first-visible instance bounds.');
}finally{await browser.close();}
