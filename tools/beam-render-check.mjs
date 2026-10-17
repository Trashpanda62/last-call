// Additive cones keep both faces visible while avoiding sorted back/front draws.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const out='shots/beam-render';fs.mkdirSync(out,{recursive:true});
try {
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto(process.env.LC_URL||'https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const authored=await p.evaluate(async()=>{const {BEAMS}=await import('./src/3d/machines.js');const meshes=BEAMS.map(({m})=>m);__lastCall.scene().scene.traverse(o=>{if(o.material?.name==='flashlight-beam')meshes.push(o);});return meshes.map(m=>({kind:m.material.name==='flashlight-beam'?'flashlight':'table',single:m.material.forceSinglePass,additive:m.material.blending===2,side:m.material.side,depthWrite:m.material.depthWrite,transparent:m.material.transparent,tris:m.geometry.index.count/3}));});
 assert.ok(authored.length>=5);assert.ok(authored.every(m=>m.single&&m.additive&&m.side===2&&!m.depthWrite&&m.transparent),'only additive double-sided cones opt into one pass');
 await p.evaluate(async()=>{const settings=await import('./src/settings.js');settings.set('gfx','beams',true);let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);const L=__lastCall;L.noLock();performance.now=()=>90000;L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.render();});
 const rows=[];
 for(const [name,x,y,look,pitch,mode]of [['floor',1300,600,Math.PI/2,-.05],['north',1110,303,Math.PI/2,-.05],['blackjack-cone',1110,170,Math.PI/2,.25],['dice-cone',1240,1430,Math.PI/2,.3],['coin-cone',1855,1340,Math.PI/2,.3],['ghost',1300,600,Math.PI/2,-.05,'ghost'],['backrooms',1300,600,Math.PI/2,-.05,'backrooms'],['flashlights',1300,600,Math.PI/2,-.05,'flashlights']]) {
  if(mode==='flashlights')await p.evaluate(()=>{const L=__lastCall;L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.state.chars[0].cd.lights=0;L.act('lights');for(let i=1;i<=8;i++){const c=L.state.chars[i];c.isHuman=true;c.x=1240+i%4*35;c.y=740+Math.floor(i/4)*60;c.look=c.face=-Math.PI/2;c.flash=true;}L.step(.02);});
  await p.evaluate(({x,y,look,pitch,mode})=>{const L=__lastCall;L.place(x,y);L.look(look,pitch);if(mode==='ghost'){L.state.chars[0].alive=false;L.act('cameras');}if(mode==='backrooms'){L.act('cameras');L.state.backrooms=true;}L.render();L.render();},{x,y,look,pitch,mode});
  const shots=[],gfx=[];
  for(const single of [false,true]) {
   gfx.push(await p.evaluate(async single=>{const {BEAMS}=await import('./src/3d/machines.js');const meshes=BEAMS.map(({m})=>m);__lastCall.scene().scene.traverse(o=>{if(o.material?.name==='flashlight-beam')meshes.push(o);});for(const m of meshes){m.material.forceSinglePass=single;m.material.needsUpdate=true;}__lastCall.render();__lastCall.render();let calls=0,tris=0;const visible=m=>{for(let o=m;o;o=o.parent)if(!o.visible)return false;return m.material.visible;};const cam=__lastCall.scene().camera,{Frustum,Matrix4}=await import('three'),frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse));for(const m of meshes)if(visible(m)&&m.layers.test(cam.layers)&&(!m.frustumCulled||frustum.intersectsObject(m))){calls++;tris+=m.geometry.index.count/3;}return {...__lastCall.gfx(),coneCalls:calls,coneTris:tris,coneEnergy:meshes.filter(visible).reduce((n,m)=>n+m.material.color.r+m.material.color.g+m.material.color.b,0)};},single));
   shots.push((await p.screenshot({path:`${out}/${name}-${single?'single':'sorted'}.png`})).toString('base64'));
  }
  const pixels=await p.evaluate(async shots=>{const decode=async b=>{const im=new Image();im.src='data:image/png;base64,'+b;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);return g.getImageData(0,0,c.width,c.height).data;};const a=await decode(shots[0]),b=await decode(shots[1]);let changed=0,max=0,sum=0;for(let i=0;i<a.length;i+=4){const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));if(d>2)changed++;max=Math.max(max,d);sum+=d;}return {changedFraction:changed/(a.length/4),maxChannel:max,meanMaxChannel:sum/(a.length/4)};},shots);
  rows.push({name,before:gfx[0],after:gfx[1],pixels});
 }
 fs.writeFileSync(`${out}/report.json`,JSON.stringify({at:new Date().toISOString(),authored,rows,errors},null,2));
 console.log(JSON.stringify(rows.map(r=>({name:r.name,calls:[r.before.calls,r.after.calls],tris:[r.before.tris,r.after.tris],...r.pixels}))));
 assert.deepEqual(errors,[]);assert.ok(rows.some(r=>r.after.calls<r.before.calls&&r.after.coneEnergy>0),'exercise enabled, illuminated cones');
 assert.ok(authored.every(m=>m.tris===(m.kind==='flashlight'?20:56)));
 for(const row of rows){assert.equal(row.before.calls-row.after.calls,row.after.coneCalls,'one redundant draw removed per visible cone');assert.equal(row.before.tris-row.after.tris,row.after.coneTris,'only redundant cone geometry submissions are removed');assert.equal(row.pixels.changedFraction,0,'images differ by at most additive rounding (2/255)');}
 console.log('PASS: additive cones retain both faces and image quality with fewer submissions.');
}finally{await b.close();}
