// First-use effect work belongs behind the loading barrier, not in gameplay.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const result=await p.evaluate(()=>{
  const L=__lastCall;L.noLock();L.start('killer',{players:6});L.step(.1);L.S.paused=true;L.place(1300,600);L.look(Math.PI/2);L.render();
  let renderer;const scene=L.scene().scene,before=scene.onBeforeRender;scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;
  const gl=renderer.getContext(),sub=gl.texSubImage2D,read=CanvasRenderingContext2D.prototype.getImageData;let readbacks=0;const uploads=[];
  CanvasRenderingContext2D.prototype.getImageData=function(...a){readbacks++;return read.apply(this,a);};
  gl.texSubImage2D=function(...a){const im=a.at(-1);if(im?.width&&im?.height)uploads.push({kind:im.constructor.name,width:im.width,height:im.height});return sub.apply(this,a);};
  let sprites,effectMaps,first,repeat;
  try{
   L.state.fx=['sparks','smash','chips','bubbles','splat'].map((kind,i)=>({kind,x:1250+i*30,y:850,t:1.1}));L.state.haunts=[{on:1,t:5}];L.render();first={readbacks,uploads:uploads.slice()};
   sprites=[];const maps=new Set();scene.traverseVisible(o=>{if(o.isSprite&&o.material.map){const t=o.material.map;sprites.push({width:t.image?.width,height:t.image?.height});if(t.image?.width>1000&&t.image?.height>1000)maps.add(t);}});effectMaps=maps.size;
   readbacks=0;uploads.length=0;L.render();repeat={readbacks,uploads:uploads.slice()};
  }finally{CanvasRenderingContext2D.prototype.getImageData=read;gl.texSubImage2D=sub;}
  return {first,repeat,effectMaps,sprites,gfx:L.gfx()};
 });
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/effects-loading.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),result,errors},null,2));console.log(JSON.stringify(result));
 assert.deepEqual(errors,[]);assert.equal(result.effectMaps,6,'exercise all six distinct effect sprite maps');
 if(!process.argv.includes('--baseline')){assert.equal(result.first.readbacks,0,'effect alpha masks are prepared before menu readiness');assert.deepEqual(result.first.uploads,[],'effect image textures are uploaded before menu readiness');}
 assert.equal(result.repeat.readbacks,0);assert.deepEqual(result.repeat.uploads,[]);
 console.log('PASS: effect sprites exercised without page/shader errors; repeated use avoids readback/image uploads'+(process.argv.includes('--baseline')?' (baseline measured).':'; first use already prepared.'));
}finally{await b.close();}
