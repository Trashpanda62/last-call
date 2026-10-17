// Inspect the real first-person rig, held objects and independent mirrored poses.
import fs from 'node:fs';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const{chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const out='shots/generated-hands';fs.mkdirSync(out,{recursive:true});
try{
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[],failed=[],late=[];let ready=false;
 p.on('pageerror',e=>errors.push(e.stack||e.message));p.on('response',r=>{if(!r.ok())failed.push(r.url());});p.on('request',r=>{if(ready&&r.url().includes('/assets/'))late.push(r.url());});
 await p.route('**/src/3d/render3d.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nwindow.__handAudit=()=>R;\n'});});
 await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});ready=true;
 await p.evaluate(()=>{const L=__lastCall;L.noLock();L.start('killer',{players:4});L.step(.05);L.S.paused=true;L.S.screen='hand-audit';});
 const rows=[];
 for(const mode of ['open','idle','pinch','point','drink','snack','knife','seated','ghost','poison','shoot','reach','pull','throw','sip','drink-martini','drink-cosmo','drink-beer','drink-mojito','snack-pretzel','snack-hotdog','snack-bite']){
  const row=await p.evaluate(mode=>{
   const R=__handAudit(),h=R.hands;h.anim=null;h.setSuit('#493241');
   const s={dt:0,t:2,eating:0,snack:0,drink:null,seated:mode==='seated',moving:false,ghost:mode==='ghost',light:1,hidden:false};
   if(mode==='drink'||mode==='sip')s.drink={kind:'whiskey',color:'#ad6530',sips:4};
   if(mode.startsWith('drink-'))s.drink={kind:mode.slice(6),color:mode==='drink-cosmo'?'#ff6f9a':'#ad6530',sips:4};
   if(mode.startsWith('snack')){s.eating=1.4;s.snack={'snack-pretzel':1,'snack-hotdog':2}[mode]||0;}
   if(mode==='snack-bite')s.eating=2;
   const kind={"snack-bite":'crunch',knife:'stab',poison:'poison',shoot:'shoot',reach:'press',pull:'pull',throw:'throw',sip:'sip'}[mode];
   if(kind)h.play(kind,['reach','pull'].includes(mode)?{x:0,y:0}:undefined);h.update({...s,dt:kind?{crunch:.4,stab:.25,poison:.45,shoot:.2,press:.18,pull:.28,throw:.25,sip:.5}[kind]:0});
   if(mode==='open')for(const g of h.hand)g.userData.glove.userData.curl(0);
   if(['pinch','point'].includes(mode))for(const g of h.hand)g.userData.glove.userData.pose(mode);
   h.scene.updateMatrixWorld(true);const target=R.renderer.getRenderTarget();R.renderer.setRenderTarget(null);const bg=h.scene.background;h.scene.background=R.scene.background;R.renderer.clear();R.renderer.info.reset();R.renderer.render(h.scene,h.camera);h.scene.background=bg;R.renderer.setRenderTarget(target);
   const meshes=[];h.scene.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();meshes.push({name:o.name,bones:o.skeleton.bones.length,geometry:o.geometry.uuid,material:o.material.uuid,tris:o.geometry.index.count/3,boneMatrices:[...o.skeleton.boneMatrices],normal:o.material.normalMap?.image?.width,base:o.material.map?.image?.width});}});
   const orientation=h.hand.map(hand=>{const glove=hand.userData.glove;let mesh;glove.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});const wrist=glove.getObjectByName('wrist').getWorldPosition(mesh.position.clone()),middle=glove.getObjectByName('middle_3').getWorldPosition(mesh.position.clone()),thumb=glove.getObjectByName('thumb_3').getWorldPosition(mesh.position.clone());const wristAxis=mesh.position.clone().set(0,1,0).transformDirection(glove.getObjectByName('wrist').matrixWorld),elbowAxis=mesh.position.clone().set(0,1,0).transformDirection(glove.getObjectByName('forearm').matrixWorld);return{neutralWristDot:wristAxis.dot(elbowAxis),side:hand.userData.s,palmNormal:mesh.position.clone().set(0,0,1).transformDirection(mesh.matrixWorld).toArray(),fingersForward:middle.z-wrist.z,thumbInward:(thumb.x-middle.x)*-hand.userData.s};});
   const sleeveEnds=[];h.scene.traverse(o=>{if(o.name==='first-person-sleeve'){const v=o.localToWorld(o.position.clone().set(0,.325,0)).project(h.camera);sleeveEnds.push(v.toArray());}});const cloth=[];
   if(mode==='open')for(const hand of h.hand){let skin,sleeve;hand.traverse(o=>{if(o.isSkinnedMesh)skin=o;if(o.name==='first-person-sleeve')sleeve=o;});const matrix=sleeve.matrixWorld.clone().invert().multiply(skin.matrixWorld),position=skin.geometry.attributes.position;let maxOutside=0,points=0;for(let i=0;i<position.count;i++){if(position.getY(i)>.075)continue;const v=skin.position.clone().fromBufferAttribute(position,i);skin.applyBoneTransform(i,v);v.applyMatrix4(matrix);if(Math.abs(v.y)>.325)continue;const radius=.07+(.078-.07)*(v.y/.65+.5);maxOutside=Math.max(maxOutside,Math.hypot(v.x,v.z)-radius);points++;}cloth.push({points,maxOutside});}
   return {mode,meshes,orientation,draws:R.renderer.info.render.calls,sleeveEnds,cloth,leftY:h.left.position.y};
  },mode);rows.push(row);await p.locator('canvas').first().screenshot({path:`${out}/${mode}.png`});
 }
 const checks=await p.evaluate(()=>{const h=__handAudit().hands,[a,b]=h.hand.map(g=>g.userData.glove);a.userData.curl(0);b.userData.curl(0);const bone=g=>g.getObjectByName('index_2');const before=bone(b).quaternion.toArray();a.userData.curl(1);return{leftChanged:bone(a).quaternion.toArray().some((n,i)=>Math.abs(n-before[i])>1e-3),rightUnchanged:before.every((n,i)=>n===bone(b).quaternion.toArray()[i]),materials:h.ghostMaterials.size};});
 const report={at:new Date().toISOString(),rows,checks,errors,failed,late};fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(late,[]);assert.ok(checks.leftChanged&&checks.rightUnchanged);for(const row of rows){assert.equal(row.meshes.length,2);assert.ok(row.meshes.every(m=>m.bones===17&&m.tris<=6000&&m.boneMatrices.every(Number.isFinite)));assert.equal(row.meshes[0].geometry,row.meshes[1].geometry);assert.equal(row.meshes[0].material,row.meshes[1].material);}
 for(const row of rows.filter(r=>['open','idle','seated'].includes(r.mode)))for(const hand of row.orientation){assert.ok(hand.palmNormal[1]<-.7,row.mode+': palm must face down');assert.ok(hand.fingersForward<-.12,row.mode+': fingers must point away from the player');assert.ok(hand.thumbInward>.03,row.mode+': each thumb must face the midline');}
 for(const row of rows)for(const hand of row.orientation)assert.ok(hand.neutralWristDot<-.9999,row.mode+': forearm and wrist axes must stay straight');
 for(const row of rows)for(const c of row.cloth)assert.ok(c.points>0&&c.maxOutside<.001,'cut forearm stays inside the sleeve');
 for(const row of rows)assert.ok(row.sleeveEnds.every(([x,y,z])=>Math.abs(x)>1||Math.abs(y)>1||Math.abs(z)>1),row.mode+': sleeve must continue beyond the view');
 assert.ok(rows.find(r=>r.mode==='snack-bite').leftY<.06,'food and crunch must not double the arm lift');
 assert.equal(rows.find(r=>r.mode==='idle').draws,4,'two shared skinned meshes and two sleeves');
 const fallback=await b.newPage({ignoreHTTPSErrors:true});let fallbackLoads=0;fallback.on('request',r=>{if(r.url().includes('/assets/hands/'))fallbackLoads++;});await fallback.route('**/src/3d/render3d.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nwindow.__handAudit=()=>R;\n'});});
 await fallback.goto('https://10.42.0.37:3161/?legacyHands');await fallback.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 report.fallback=await fallback.evaluate(()=>{const h=__handAudit().hands,r=__handAudit().renderer;h.rig.visible=true;h.scene.updateMatrixWorld(true);r.info.reset();r.render(h.scene,h.camera);return{generated:h.hand.some(g=>g.userData.glove.userData.generated),draws:r.info.render.calls};});report.fallback.loads=fallbackLoads;assert.equal(report.fallback.generated,false);assert.equal(fallbackLoads,0);await fallback.close();
 const fault=await b.newPage({ignoreHTTPSErrors:true});await fault.route('**/assets/hands/casino-glove.glb',r=>r.abort());await fault.goto('https://10.42.0.37:3161/');await fault.locator('#bootRetry').waitFor({state:'visible',timeout:90000});report.failedAssetGated=await fault.evaluate(()=>!__lastCall.S.ready&&document.getElementById('menu').getClientRects().length===0);assert.ok(report.failedAssetGated);await fault.close();fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
 console.log('PASS: twenty-two actual hand states, neutral wrist axes, palms down/fingers forward/thumbs inward, independent 17-bone rigs, shared geometry/material, four idle submissions, under 12,000 glove triangles per pair, fallback, required-model failure gate and no late downloads.');
}finally{await b.close();}
