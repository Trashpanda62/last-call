import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const rows=await p.evaluate(async()=>{
  const D=await import('./src/3d/render3d.js'),L=__lastCall;L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.place(1300,600);L.look(Math.PI/2);L.render();
  await D.warmup({pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'});
  const scene=L.scene().scene;let renderer;const before=scene.onBeforeRender;scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;
  const gl=renderer.getContext(),link=gl.linkProgram,buffer=gl.bufferData;let links=[],buffers=[];
  gl.linkProgram=function(program){links.push(gl.getAttachedShaders(program).map(s=>(gl.getShaderSource(s).match(/^#define (?:SHADER_TYPE|SHADER_NAME|USE_[A-Z_]+|OPAQUE)\b.*$/gm)||[])));return link.call(this,program);};
  gl.bufferData=function(target,data,...a){buffers.push(typeof data==='number'?data:data?.byteLength||0);return buffer.call(this,target,data,...a);};
  const rows=[],capture=(name,setup=()=>{})=>{links=[];buffers=[];const at=performance.now();setup();L.render();rows.push({name,ms:performance.now()-at,links:links.slice(),buffers:buffers.length,bytes:buffers.reduce((a,b)=>a+b,0),calls:L.gfx().calls,blackout:!!L.view.pub.blackout,monster:!!L.view.priv.monster});};
  try {
   capture('ready');
   capture('blackout',()=>{L.state.chars[0].cd.lights=0;L.act('lights');L.step(.1);});
   capture('blackout repeat');
   capture('transform',()=>{L.act('transform');L.step(.1);});
   capture('monster repeat');
  }finally{gl.linkProgram=link;gl.bufferData=buffer;}
  return rows;
 });const out=process.argv[2]||'shots/blackout-loading.json';fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),rows,errors},null,2));
 assert.deepEqual(errors,[]);assert.ok(rows.find(r=>r.name==='blackout').blackout);assert.ok(rows.find(r=>r.name==='transform').monster);
 for(const r of rows){assert.equal(r.links.length,0,r.name+': prepared shaders');assert.equal(r.buffers,0,r.name+': prepared geometry');}
 console.log('PASS: real blackout and monster transformation use prepared shaders/buffers, including the first flashlight cones.');
}finally{await b.close();}
