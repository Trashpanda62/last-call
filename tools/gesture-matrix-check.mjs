// Stateful comparison with the retained full-skeleton/world-getter path.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/3d/plush.js',async route=>{
  const response=await route.fetch(),source=(await response.text()).replace('const legacyGestureMatrices =','let legacyGestureMatrices =');
  await route.fulfill({response,body:source+`
window.__gestureMatrixAudit={calls:0,rotations:0,maxError:0};
const gestureMatrixOriginal=PlushBean.prototype.gesture;
PlushBean.prototype.gesture=function(...args){
 const capture=()=>({q:BONES.map(n=>this.b[n].o.quaternion.toArray()),position:this.model.position.toArray(),g:this.g&&{...this.g}});
 const restore=s=>{BONES.forEach((n,i)=>this.b[n].o.quaternion.fromArray(s.q[i]));this.model.position.fromArray(s.position);this.g=s.g&&{...s.g};};
 const before=capture();legacyGestureMatrices=true;gestureMatrixOriginal.apply(this,args);const expected=capture();
 restore(before);legacyGestureMatrices=false;gestureMatrixOriginal.apply(this,args);const actual=capture();
 const audit=__gestureMatrixAudit;audit.calls++;
 for(let i=0;i<expected.q.length;i++){audit.rotations++;for(let j=0;j<4;j++)audit.maxError=Math.max(audit.maxError,Math.abs(expected.q[i][j]-actual.q[i][j]));}
 for(let i=0;i<3;i++)audit.maxError=Math.max(audit.maxError,Math.abs(expected.position[i]-actual.position[i]));
 if(JSON.stringify(expected.g)!==JSON.stringify(actual.g))throw Error('gesture timing/cancellation changed');
};
`});
 });
 await page.goto('https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const data=await page.evaluate(async()=>{
  const {makeBean}=await import('./src/3d/plush.js'),rows=[];
  // Loading may have exercised a gesture before this synchronous fixture.
  Object.assign(__gestureMatrixAudit,{calls:0,rotations:0,maxError:0});
  for(const kind of ['bean','round','croupier','bartender','guard'])for(const name of ['chips','push','cheer'])for(const mode of ['standing','seated','held drink','moving upper','moving full']){
   const bean=makeBean({kind,color:'#a14466',hat:'none'});bean.holding=mode==='held drink';const before=__gestureMatrixAudit.calls;
   try{for(let frame=0;frame<24;frame++){
    bean.g={name,t:.2+frame*.035,upper:mode!=='moving full'};
    bean.root.position.set(frame*.2,0,-frame*.3);bean.root.rotation.y=frame*.11;
    bean.update({x:2+frame*.2,z:3-frame*.3,face:.4+frame*.11,look:-.3,moving:mode.startsWith('moving'),seated:mode==='seated',seatHeight:.58,t:100+frame*.016,dt:.016});
   }}finally{bean.dispose();}rows.push({kind,name,mode,calls:__gestureMatrixAudit.calls-before});
  }return{rows,...__gestureMatrixAudit};
 });
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/gesture-matrices-check.json';
 fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),...data,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(data.calls,1800);assert.ok(data.maxError<1e-12,'all bone rotations and model positions match the original path');
 console.log('PASS:',data.calls,'stateful gestures /',data.rotations,'bone rotations match full-skeleton updates and independent world getters; max error',data.maxError);
}finally{await browser.close();}
