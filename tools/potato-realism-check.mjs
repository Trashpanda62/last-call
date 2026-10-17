// Actual casino lighting, runtime potato materials and existing poses, on the ml350 GPU.
// LC_URL=http://127.0.0.1:8317/ PW=/path/to/playwright node tools/potato-realism-check.mjs [--before]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const before=process.argv.includes('--before'),out=`shots/potato-realism-${before?'before':'after'}`;
fs.mkdirSync(out,{recursive:true});
const report={at:new Date().toISOString(),before,variants:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 for(const fallback of [false,true]) {
  const page=await browser.newPage({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  let detailRequests=0;page.on('request',r=>{if(r.url().endsWith('/bean-high.glb'))++detailRequests;});
  await page.goto((process.env.LC_URL||'http://127.0.0.1:8317/')+(fallback?'?noprops':''));
  await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const row=await page.evaluate(async()=>{
   const L=__lastCall,P=await import('./src/3d/plush.js');
   L.noLock();L.start('gambler',{players:6});L.step(.1);L.S.paused=true;
   for(const c of L.state.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;c.x=300;c.y=300+c.id*40;}
   const p=window.potatoReview=new P.PlushBean({kind:'bean',name:'Red',color:'#d63e38'});
   L.scene().scene.add(p.root);
   const m=p.model.getObjectByProperty('isSkinnedMesh',true);
   return {joints:Object.fromEntries(Object.entries(p.b).map(([n,b])=>[n,b.o.position.toArray()])),info:p.info,bones:Object.keys(p.b),vertices:m.geometry.attributes.position.count,triangles:m.geometry.index.count/3,texture:[p.mat.map.image.width,p.mat.map.image.height],normalMap:!!p.mat.normalMap,roughnessMap:!!p.mat.roughnessMap};
  });
  assert.equal(row.bones.length,16,'existing runtime skeleton must remain complete');
  if(!before){assert.ok(Math.abs(row.joints.LeftArm[1]-row.joints.RightArm[1])<.002,'shoulders must have matching heights');assert.ok(row.joints.Spine1[1]>0,'spine must ascend through chest');}
  assert.ok(Math.abs(row.info.height-1.41)<.001,'pilot must keep the shipped 1.41 m player height');
  for(const [name,pose,distance,pitch]of [['full','idle',120,-.21],['face','idle',42,-.09],['side','side',105,-.18],['other-side','other-side',105,-.18],['side-walk','side-walk',105,-.18],['other-side-walk','other-side-walk',105,-.18],['walk','walk',120,-.21],['seated','seated',110,.02],['holding','holding',105,-.18],['dead','dead',120,-.4]]) {
   const measured=await page.evaluate(({pose,distance,pitch})=>{
    const L=__lastCall,p=potatoReview;L.place(1134,1034);L.look(0,pitch);
    p.setDead(pose==='dead');p.holding=pose==='holding';
    for(let i=0;i<100;i++)p.update({x:(1134+distance)/60,z:1034/60,face:pose.startsWith('other-side')?Math.PI:pose.startsWith('side')?0:-Math.PI/2,look:pose.startsWith('other-side')?Math.PI:pose.startsWith('side')?0:-Math.PI/2,moving:pose.includes('walk'),seated:pose==='seated',t:i/60,dt:1/60});
    L.render();L.render();p.model.updateMatrixWorld(true);
    const m=p.model.getObjectByProperty('isSkinnedMesh',true);m.computeBoundingBox();
    const b=m.boundingBox;return {bounds:{min:b.min.toArray(),max:b.max.toArray()},finite:p.b.Head.o.matrixWorld.elements.every(Number.isFinite),gesture:p.busy};
   },{pose,distance,pitch});
   assert.ok(measured.finite);assert.ok(measured.bounds.min.every(Number.isFinite));assert.ok(measured.bounds.max.every(Number.isFinite));
   assert.ok(measured.bounds.max.every((n,i)=>n-measured.bounds.min[i]<2.5),'pose must not explode');
   (row.poses||={})[name]=measured;
   await page.screenshot({path:`${out}/${fallback?'fallback':'normal'}-${name}.jpg`,type:'jpeg',quality:93});
  }
  row.gestures=await page.evaluate(()=>{
   const p=potatoReview;p.setDead(false);p.holding=false;
   return ['wave','cheer','chips'].map(name=>{
    const accepted=p.play(name);for(let i=0;i<30;i++)p.update({x:21,z:17,face:0,look:0,t:i/60,dt:1/60});
    return {name,accepted,finite:Object.values(p.b).every(b=>b.o.quaternion.toArray().every(Number.isFinite))};
   });
  });
  for(const g of row.gestures){assert.ok(g.accepted,`${g.name} must use the existing motion clip`);assert.ok(g.finite);}
  if(!before){
   assert.equal(detailRequests,0,'standard startup must not download the dense mesh');
   await page.evaluate(async()=>{(await import('./src/settings-ui.js')).openSettings('gfx');});
   await page.locator('.set-row').filter({hasText:'Potato detail'}).locator('select').selectOption('high');
   row.highReady=await page.evaluate(async()=>{const P=await import('./src/3d/plush.js');await P.loadPotatoDetail();return P.potatoDetailInfo();});
   assert.ok(row.highReady.loaded,'dense mesh must load from the real setting');assert.equal(row.highReady.triangles,1500000);
   await page.evaluate(async()=>{(await import('./src/settings-ui.js')).closeSettings();__lastCall.S.paused=true;});
   row.highPoses=[];
   for(const pose of ['idle','walk','seated','holding','side','other-side','side-walk','other-side-walk']){
    const info=await page.evaluate(async pose=>{
     const L=__lastCall,p=potatoReview,P=await import('./src/3d/plush.js');p.g=null;p.holding=pose==='holding';
     L.place(1134,1034);L.look(0,pose==='seated'?.12:pose.includes('side')?-.22:-.09);
     for(let i=0;i<60;i++)p.update({x:(pose.includes('side')?1214:1176)/60,z:1034/60,face:pose.startsWith('other-side')?Math.PI:pose.startsWith('side')?0:-Math.PI/2,look:pose.startsWith('other-side')?Math.PI:pose.startsWith('side')?0:-Math.PI/2,moving:pose.includes('walk'),seated:pose==='seated',t:i/60,dt:1/60});
     L.render();L.render();let meshes=0;L.scene().scene.traverse(o=>{if(o.userData.potatoDetail&&o.visible)++meshes;});
     return {pose,...P.potatoDetailInfo(),meshes,lowVisible:p.bodyMesh.visible};
    },pose);
    assert.ok(info.active);assert.equal(info.meshes,1);assert.equal(info.lowVisible,false);row.highPoses.push(info);
    await page.screenshot({path:`${out}/${fallback?'fallback':'normal'}-high-${pose}.jpg`,type:'jpeg',quality:94});
   }
   row.hats=[];
   for(const [name,color,hat]of [['Red','#e8443a','fedora'],['Mint','#3ddc97','tophat'],['Lola','#ff7ac8','beret']]){
    const info=await page.evaluate(async({name,color,hat})=>{
     const L=__lastCall,P=await import('./src/3d/plush.js');potatoReview.root.visible=false;
     window.hatReview?.dispose();const p=window.hatReview=new P.PlushBean({kind:'bean',name,color,hat});L.scene().scene.add(p.root);
     L.look(0,-.1);for(let i=0;i<50;i++)p.update({x:1194/60,z:1034/60,face:-Math.PI/2,look:-Math.PI/2,t:0,dt:1/60});L.render();L.render();
     return {name,hat,scale:p.hat.scale.toArray(),detail:P.potatoDetailInfo()};
    },{name,color,hat});
    assert.ok(info.detail.active);row.hats.push(info);
    await page.screenshot({path:`${out}/${fallback?'fallback':'normal'}-hat-${name}.jpg`,type:'jpeg',quality:93});
   }
   await page.evaluate(()=>{hatReview.dispose();hatReview=null;potatoReview.root.visible=true;});
   row.lod=await page.evaluate(async()=>{
    const L=__lastCall,P=await import('./src/3d/plush.js'),S=await import('./src/settings.js'),p=potatoReview;
    p.g=null;p.update({x:1400/60,z:1034/60,face:-Math.PI/2,look:-Math.PI/2,t:0,dt:.1});L.render();
    const far={...P.potatoDetailInfo(),lowVisible:p.bodyMesh.visible};
    S.set('gfx','characterDetail','standard');L.render();const standard=P.potatoDetailInfo();
    S.setPreset('ultra');const ultra=S.settings().gfx.characterDetail;S.setPreset('high');L.render();
    return {far,standard,ultra,saved:JSON.parse(localStorage.getItem('lc.settings')).gfx.characterDetail};
   });
   assert.equal(row.lod.far.active,false);assert.ok(row.lod.far.lowVisible);assert.equal(row.lod.standard.active,false);assert.equal(row.lod.ultra,'high');assert.equal(row.lod.saved,'standard');
   row.crowd=await page.evaluate(async()=>{
    const L=__lastCall,P=await import('./src/3d/plush.js'),S=await import('./src/settings.js'),scene=L.scene().scene;
    potatoReview.root.visible=false;L.look(0,-.1);const actors=[];
    for(let i=0;i<32;i++){
     const p=new P.PlushBean({kind:'bean',name:'Red',color:'#e8443a'});actors.push(p);scene.add(p.root);
     for(let j=0;j<20;j++)p.update({x:1134/60+.9+Math.floor(i/8)*.8,z:1034/60+(i%8-3.5)*.65,face:-Math.PI/2,look:-Math.PI/2,t:0,dt:1/60});
    }
    const rows=[];
    for(const detail of ['standard','high']){
     S.set('gfx','characterDetail',detail);for(let i=0;i<4;i++)L.render();
     const times=[];for(let i=0;i<12;i++){const t=performance.now();L.render();times.push(performance.now()-t);await new Promise(requestAnimationFrame);}
     let dense=0;scene.traverse(o=>{if(o.userData.potatoDetail&&o.visible)++dense;});
     rows.push({detail,dense,lowVisible:actors.filter(p=>p.bodyMesh.visible).length,cpuMedianMs:times.sort((a,b)=>a-b)[6],gfx:L.gfx()});
    }
    const sharedGeometries=new Set(actors.map(p=>p.bodyMesh.geometry)).size;
    actors.forEach(p=>p.dispose());S.set('gfx','characterDetail','standard');potatoReview.root.visible=true;L.render();
    return {actors:32,sharedGeometries,rows,afterDispose:P.potatoDetailInfo()};
   });
   assert.equal(row.crowd.sharedGeometries,1);assert.equal(row.crowd.rows[0].dense,0);assert.equal(row.crowd.rows[0].lowVisible,32);
   assert.equal(row.crowd.rows[1].dense,1);assert.equal(row.crowd.rows[1].lowVisible,31);assert.equal(row.crowd.afterDispose.active,false);
   row.detailRequests=detailRequests;assert.equal(detailRequests,1,'one shared dense asset per page');
  }
  report.variants.push({fallback,...row});await page.close();
 }
 if(!before){
  const fault=await browser.newPage({ignoreHTTPSErrors:true});
  fault.on('pageerror',e=>report.errors.push(e.message));
  await fault.addInitScript(()=>localStorage.setItem('lc.settings',JSON.stringify({v:2,gfx:{preset:'custom',characterDetail:'high'}})));
  await fault.route('**/assets/chars/bean-high.glb',r=>r.abort());
  await fault.goto(process.env.LC_URL||'http://127.0.0.1:8317/');
  await fault.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  report.optionalFailure=await fault.evaluate(async()=>{const L=__lastCall,P=await import('./src/3d/plush.js');L.noLock();L.start('gambler',{players:6});L.step(.1);L.render();return {ready:L.S.ready,...P.potatoDetailInfo()};});
  assert.ok(report.optionalFailure.ready);assert.equal(report.optionalFailure.loaded,false);assert.equal(report.optionalFailure.active,false);await fault.close();
 }
 assert.deepEqual(report.errors,[]);
 fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
 console.log(before?'PASS: fourteen baseline character views and existing motions.':'PASS: forty-two actual-casino views including both arms at rest and walking, existing poses/motions, real detail setting, original 1.5M triangle asset, lazy download, distance switching, hats/colors and one dense draw across a 32-potato crowd in both graphics modes.');
}catch(e){report.errors.push(e.stack||String(e));fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');throw e;}
finally{await browser.close();}
