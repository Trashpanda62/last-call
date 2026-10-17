// Sample actual sign surfaces from standing approaches in the fully built scene.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const out='shots/sign-overlap';fs.mkdirSync(out,{recursive:true});
try {
 const report={at:new Date().toISOString(),variants:[],errors:[]};
 for(const fallback of [false,true]){
  const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}});p.on('pageerror',e=>report.errors.push(e.stack||e.message));
  await p.goto((process.env.LC_URL||'https://10.42.0.37:3161/')+(fallback?'?noprops':''));await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const rows=await p.evaluate(async fallback=>{
   const THREE=await import('three'),map=await import('./src/map.js'),L=__lastCall;L.noLock();L.start('gambler',{players:6});L.step(.1);L.S.paused=true;
   for(const c of L.state.chars){c.isHuman=true;if(c.id!==L.view.priv.me){c.x=1320;c.y=600+c.id*60;c.seat=null;}}
   const clock=performance.now.bind(performance);let now=clock();performance.now=()=>now;
   const scene=L.scene().scene, signs=[];scene.traverse(o=>{if(o.isMesh&&(/^(casino-(guide|painting|room-sign)-|race-odds-\d+$|arcade-score-)/.test(o.name)||o.name==='shady-shop-sign'||o.name==='race-tote-board'))signs.push(o);});
   const rows=[];
   for(const sign of signs){
    const center=sign.getWorldPosition(new THREE.Vector3()),normal=new THREE.Vector3(0,0,1).applyQuaternion(sign.getWorldQuaternion(new THREE.Quaternion()));
    const w=sign.geometry.parameters.width,h=sign.geometry.parameters.height;let distance=Math.max(2.4,w*.65),eye=center.clone().addScaledVector(normal,distance);eye.y=1.12;
    const seat=sign.name.startsWith('race-odds-')?L.state.seats.find(s=>s.id===+sign.name.slice(10)):sign.name.startsWith('arcade-score-')?L.state.seats.find(s=>s.game===sign.name.slice(13)):null;if(seat){eye.set(seat.x/60,1.12,seat.y/60);}
    // A painting above furniture needs a real floor viewing bay, not a point inside that furniture.
    if(!seat)while(distance<4.4&&!map.standable({x:eye.x*60,y:eye.z*60})){distance+=.5;eye.copy(center).addScaledVector(normal,distance);eye.y=1.12;}
    const stand=map.standable({x:eye.x*60,y:eye.z*60});
    L.place(eye.x*60,eye.z*60);L.look(Math.atan2(center.z-eye.z,center.x-eye.x),Math.atan2(center.y-eye.y,Math.hypot(center.x-eye.x,center.z-eye.z)));now+=1000;L.render();
    const objects=[];scene.traverseVisible(o=>{if(o.isMesh&&!o.isSprite)objects.push(o);});
    const blocked=[],ray=new THREE.Raycaster(), seen=[];
    for(const u of [-.44,-.22,0,.22,.44])for(const v of [-.44,-.22,0,.22,.44]){
     const target=sign.localToWorld(new THREE.Vector3(u*w+1e-4,v*h+1e-4,0)) /* (off the quad's diagonal, where a ray at the exact centre can miss both triangles) */,direction=target.clone().sub(eye),limit=direction.length();direction.normalize();ray.set(eye,direction);ray.far=limit+.015;
     const hits=ray.intersectObjects(objects,false).filter(hit=>{const mat=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material;return mat?.visible!==false&&(mat?.opacity??1)>.65&&!(mat?.transmission>.5);});
     const first=hits[0];seen.push(!!first&&first.object===sign);
     if(!first||first.object!==sign)blocked.push({u,v,object:first?.object.name||first?.object.type||'no hit',distance:first?.distance,material:first?.face?.materialIndex,geometry:first?.object.geometry.type,point:first?.point.toArray(),parent:first?.object.parent?.name,bounds:first?new THREE.Box3().setFromObject(first.object).getSize(new THREE.Vector3()).toArray():null});
    }
    const row={name:sign.name,fallback,position:center.toArray(),eye:eye.toArray(),standable:stand,samples:seen.length,visible:seen.filter(Boolean).length,blocked};
    if(sign.name.startsWith('casino-guide-')||/room-sign-(bar|highlimit|plinko)$/.test(sign.name)||blocked.length)row.png=document.getElementById('view').toDataURL('image/png');rows.push(row);
   }
   return rows;
  },fallback);
  for(const row of rows){if(row.png){fs.writeFileSync(`${out}/${fallback?'fallback':'model'}-${row.name}.png`,Buffer.from(row.png.split(',')[1],'base64'));delete row.png;}}
  report.variants.push({fallback,rows});await p.close();
 }
 fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.variants.map(v=>({fallback:v.fallback,rows:v.rows.map(r=>({name:r.name,clear:r.visible+'/'+r.samples,standable:r.standable,blocks:[...new Set(r.blocked.map(b=>b.object))]}))})),null,2));
 assert.deepEqual(report.errors,[]);
 assert.ok(report.variants.every(v=>v.rows.every(r=>r.visible===r.samples&&r.standable)),'every audited sign/painting needs a clear standing view');
 console.log('PASS: audited house guides, paintings, neon signs, race odds, arcade scores and shop sign have unobstructed standing approaches in normal/fallback scenes.');
}finally{await browser.close();}
