// Observe four evolving 32-player runs (at most 600 simulated seconds each).
// Complements static room checks; the accelerated clock is not an FPS benchmark.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 await page.evaluate(()=>{
  const L=__lastCall;L.noLock();L.start('gambler',{players:32});L.step(.1);L.S.paused=true;L.render();
  const scene=L.scene().scene,before=scene.onBeforeRender;let renderer;
  scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;
  const gl=renderer.getContext(),link=gl.linkProgram,buffer=gl.bufferData,direct=renderer.renderBufferDirect;
  window.__soak={links:[],buffers:[],stage:'idle',tick:0,current:null};const A=__soak;
  renderer.renderBufferDirect=function(camera,scene,geometry,material,object,...a){
   const previous=A.current;A.current={type:object.type,name:object.name,material:material.type,geometry:geometry.type,instanced:!!object.isInstancedMesh,skin:!!object.isSkinnedMesh};
   try{return direct.call(this,camera,scene,geometry,material,object,...a);}finally{A.current=previous;}
  };
  gl.linkProgram=function(program){A.links.push({stage:A.stage,tick:A.tick,current:A.current,defines:gl.getAttachedShaders(program).map(s=>(gl.getShaderSource(s).match(/^#define (?:SHADER_NAME|SHADER_TYPE|USE_\w+|NUM_\w+|OPAQUE)\b.*$/gm)||[]))});return link.call(this,program);};
  gl.bufferData=function(target,data,...a){A.buffers.push({stage:A.stage,tick:A.tick,current:A.current,target,bytes:typeof data==='number'?data:data?.byteLength||0});return buffer.call(this,target,data,...a);};
 });
 const rows=[];
 for(const [mode,seed]of [['classic',42],['classic',947],['escape',72],['escape',311]]){
  const row=await page.evaluate(async({mode,seed})=>{
   const L=__lastCall,A=__soak;let random=seed;Math.random=()=>((random=(random*1664525+1013904223)>>>0)/4294967296);
   A.stage=mode+'-'+seed;A.tick=0;const links=A.links.length,buffers=A.buffers.length;
   L.start('gambler',{players:32,mode});L.step(.1);L.S.paused=true;L.render();
   const samples=[],events={bodies:new Set(),drinks:new Set(),snacks:new Set(),effects:new Set(),haunts:new Set(),meetings:new Set(),blackout:0,backrooms:0};
   const places=[[1300,600,Math.PI/2],[350,400,-Math.PI/2],[330,1000,Math.PI],[2530,430,-Math.PI/2],[2180,960,Math.PI],[1300,1480,Math.PI/2],[2500,1500,Math.PI/2]];
   for(let frame=0;frame<1800&&!L.state.over;frame++){
    L.step(1/3);A.tick=+(L.state.t||0).toFixed(2);
    if(frame%60===0){const [x,y,look]=places[Math.floor(frame/60)%places.length];L.place(x,y);L.look(look,-.05);}
    const v=L.view.pub;for(const b of v.bodies)events.bodies.add(b.id+':'+b.cause);for(const d of v.drinks)events.drinks.add(d.kind);for(const c of v.chars)if(c.eating>0)events.snacks.add(c.snack);for(const fx of v.fx)events.effects.add(fx.kind);for(const h of v.haunts||[])events.haunts.add(h.on);
    if(v.meeting)events.meetings.add(v.meeting.title+v.meeting.reason);if(v.blackout)events.blackout++;if(v.backrooms)events.backrooms++;
    L.render();
    if(frame%90===0)samples.push({frame,t:A.tick,gfx:L.gfx(),alive:v.chars.filter(c=>c.alive).length,bodies:v.bodies.length});
    if(frame%12===0)await new Promise(requestAnimationFrame);
   }
   return{mode,seed,simulatedSeconds:A.tick,over:L.state.over,events:Object.fromEntries(Object.entries(events).map(([k,v])=>[k,v instanceof Set?[...v]:v])),samples,links:A.links.slice(links),buffers:A.buffers.slice(buffers),final:L.gfx()};
  },{mode,seed});rows.push(row);console.log(JSON.stringify({mode,seed,t:row.simulatedSeconds,links:row.links.length,buffers:row.buffers.length,events:row.events}));
 }
 const result={at:new Date().toISOString(),rows,errors},out=process.argv.find(a=>a.endsWith('.json'))||'shots/live-event-soak.json';fs.writeFileSync(out,JSON.stringify(result,null,2));assert.deepEqual(errors,[]);
 if(!process.argv.includes('--baseline'))for(const row of rows){assert.equal(row.links.length,0,row.mode+' '+row.seed+': no late shader links');assert.equal(row.buffers.length,0,row.mode+' '+row.seed+': no late geometry buffers');}
 console.log('PASS: four evolving 32-player classic/escape runs have no page errors'+(process.argv.includes('--baseline')?'; deferred work recorded.':', late shader links or geometry buffers.'));
}finally{await browser.close();}
