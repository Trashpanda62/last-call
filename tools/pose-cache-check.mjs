// Compare cached rotations with the retained legacy path after external pose edits.
import assert from 'node:assert/strict';import fs from 'node:fs';import{createRequire}from'node:module';
const{chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/3d/plush.js',async route=>{
  const response=await route.fetch(),source=await response.text();assert.ok(source.includes('const cacheBoneRotations ='));
  await route.fulfill({response,body:source.replace('const cacheBoneRotations =','let cacheBoneRotations =')+`
window.__poseAudit={calls:0,error:0,eulerError:0,unchanged:0,unchangedCallbacks:0};const checkedRotation=PlushBean.prototype.rot;
let poseEulerCallbacks=0;const poseEuler=THREE.Euler.prototype.setFromRotationMatrix;
THREE.Euler.prototype.setFromRotationMatrix=function(...a){poseEulerCallbacks++;return poseEuler.apply(this,a);};
PlushBean.prototype.rot=function(name,...angles){
 const bone=this.b[name],same=bone&&bone.poseX===(angles[0]??0)&&bone.poseY===(angles[1]??0)&&bone.poseZ===(angles[2]??0)&&bone.poseRotation&&bone.o.quaternion.equals(bone.poseRotation),before=poseEulerCallbacks;
 checkedRotation.call(this,name,...angles);if(!bone||!cacheBoneRotations)return;
 if(same){__poseAudit.unchanged++;__poseAudit.unchangedCallbacks+=poseEulerCallbacks-before;}
 const cached=bone.o.quaternion.toArray(),euler=bone.o.rotation.toArray();cacheBoneRotations=false;
 try{checkedRotation.call(this,name,...angles);}finally{cacheBoneRotations=true;}
 const reference=bone.o.quaternion.toArray();window.__poseAudit.calls++;
 for(let i=0;i<4;i++)window.__poseAudit.error=Math.max(window.__poseAudit.error,Math.abs(cached[i]-reference[i]));
 for(let i=0;i<3;i++)window.__poseAudit.eulerError=Math.max(window.__poseAudit.eulerError,Math.abs(euler[i]-bone.o.rotation.toArray()[i]));
};
`});
 });
 await page.goto('https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const data=await page.evaluate(async()=>{
  const{makeBean}=await import('./src/3d/plush.js');const rows=[];let time=100;
  for(const kind of ['bean','round','croupier','bartender','guard'])for(const mode of ['idle','moving','seated','held drink','eating','gesture','chip gesture','dead']){
   const bean=makeBean({kind,color:'#a14466',hat:'none'});bean.holding=mode==='held drink';bean.setDead(mode==='dead');
   if(mode==='gesture'||mode==='chip gesture')bean.play(mode==='gesture'?'cheer':'chips');
   const at=__poseAudit.calls;
   for(let frame=0;frame<24;frame++){
    // Emulate a completed gesture/overlay replacing the previous base pose.
    // Unchanged cached angles must still overwrite every changed bone.
    if(frame%3===0)for(const bone of Object.values(bean.b))bone.o.quaternion.set(.2,.3,.1,.9).normalize();
    bean.update({x:2,z:3,face:.4,look:-.3,moving:mode==='moving',seated:mode==='seated',seatHeight:.58,eating:mode==='eating'?1.8:0,t:time+=.016,dt:.016});
   }
   rows.push({kind,mode,comparisons:__poseAudit.calls-at});bean.dispose();
  }
  return{rows,...__poseAudit};
 });
 fs.writeFileSync(process.argv[2]||'shots/pose-cache.json',JSON.stringify({at:new Date().toISOString(),...data,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(data.rows.length,40);assert.ok(data.rows.every(r=>r.comparisons>=384));assert.equal(data.error,0,'cached rotations exactly match the legacy path after external edits');assert.equal(data.eulerError,0,'Euler state also matches the original path');assert.ok(data.unchanged>1000);assert.equal(data.unchangedCallbacks,0,'equal bone rotations do not repeat Euler conversions');
 console.log('PASS: bone quaternions and Euler state exactly match legacy rotations across five models and eight pose/gesture/eating/death cases, including overwritten and unchanged bones.',data.calls,'comparisons;',data.unchanged,'equal rotations avoid Euler callbacks.');
}finally{await browser.close();}
