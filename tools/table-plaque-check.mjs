// Actual occupied-seat views of both blackjack plaques, separate from the wall-sign audit.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const out=process.argv[2]||'shots/table-plaques';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const report={at:new Date().toISOString(),variants:[],errors:[]};
try{
 for(const fallback of [false,true]){
  const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}});p.on('pageerror',e=>report.errors.push(e.stack||e.message));
  await p.goto('https://10.42.0.37:3161/'+(fallback?'?noprops':''));await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const rows=await p.evaluate(async()=>{
   const THREE=await import('three'),L=__lastCall;L.noLock();L.start('gambler',{players:6});L.step(.1);L.S.paused=true;
   for(const c of L.state.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;if(c.id){c.x=1850;c.y=700+c.id*40;}}
   const scene=L.scene().scene,signs=[];scene.traverse(o=>{if(o.name==='blackjack-table-sign')signs.push(o);});signs.sort((a,b)=>a.position.x-b.position.x);
   const rows=[];
   for(const seat of L.state.seats.filter(s=>s.game==='bj')){
    L.act('leave');seat.occ=seat.claim=null;L.place(seat.x,seat.y);L.look(seat.face,-.3);L.step(.02);L.render();
    const sign=signs[seat.table],target=sign.getWorldPosition(new THREE.Vector3());
    for(let i=0;i<3;i++){const eye=L.scene().camera.position,d=target.clone().sub(eye);L.look(Math.atan2(d.z,d.x),Math.atan2(d.y,Math.hypot(d.x,d.z)));L.render();}
    const eye=L.scene().camera.position.clone(),objects=[];scene.traverseVisible(o=>{if(o.isMesh)objects.push(o);});
    const blocked=[],ray=new THREE.Raycaster(),w=sign.geometry.parameters.width,h=sign.geometry.parameters.height;
    for(const u of [-.44,-.22,0,.22,.44])for(const v of [-.44,-.22,0,.22,.44]){
     const point=sign.localToWorld(new THREE.Vector3(u*w,v*h,0)),d=point.clone().sub(eye);ray.set(eye,d.clone().normalize());ray.far=d.length()+.015;
     const hits=ray.intersectObjects(objects,false).filter(hit=>{const mat=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material;return mat?.visible!==false&&(mat?.opacity??1)>.65&&!(mat?.transmission>.5);});
     if(hits[0]?.object!==sign)blocked.push({u,v,object:hits[0]?.object.name||hits[0]?.object.type||'no hit',geometry:hits[0]?.object.geometry.type,point:hits[0]?.point.toArray()});
    }
    const corners=[[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]].map(([u,v])=>sign.localToWorld(new THREE.Vector3(u*w,v*h,0)).project(L.scene().camera));
    const xs=corners.map(v=>(v.x+1)*640),ys=corners.map(v=>(1-v.y)*360);
    rows.push({seat:seat.id,table:seat.table,occupied:L.view.priv.seat?.id===seat.id,eye:eye.toArray(),visible:25-blocked.length,blocked,pixels:{width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},png:document.querySelector('#view').toDataURL('image/png')});
   }return rows;
  });
  for(const r of rows){fs.writeFileSync(`${out}/${fallback?'fallback':'model'}-seat-${r.seat}.png`,Buffer.from(r.png.split(',')[1],'base64'));delete r.png;}
  report.variants.push({fallback,rows});await p.close();
 }
 fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report.variants.map(v=>({fallback:v.fallback,rows:v.rows.map(r=>({...r,eye:undefined}))})),null,2));
 assert.deepEqual(report.errors,[]);assert.equal(report.variants.length,2);for(const v of report.variants){assert.equal(v.rows.length,10);for(const r of v.rows){assert.ok(r.occupied);assert.equal(r.visible,25,'seat '+r.seat+' plaque obstruction');}}
 console.log('PASS: ten occupied seats in both graphics variants have clear 25-point plaque surfaces.');
}finally{await browser.close();}
