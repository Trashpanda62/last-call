// Asynchronous GPU elapsed queries; no gl.finish/readPixels in measured frames.
// Elapsed GPU command time may include pipeline gaps while the CPU submits work.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.LC_URL||'https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const rows=[];
 for(const name of ['floor','bar','ghost']) rows.push(await p.evaluate(async name=>{
  let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);const L=__lastCall;L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.place(name==='bar'?350:1300,name==='bar'?400:600);L.look(name==='bar'?-Math.PI/2:Math.PI/2,-.05);if(name==='ghost'){L.state.chars[0].alive=false;L.act('cameras');}L.render();
  const scene=L.scene().scene;let renderer;const before=scene.onBeforeRender;scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;
  const gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const device=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  if(!ext)return {name,available:false,device,reason:'EXT_disjoint_timer_query_webgl2 unavailable',gfx:L.gfx()};
  const median=ns=>{const sorted=ns.slice().sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];},queries=[],frames=[];let capture=false,mode='passes',frame=0;
  const render=renderer.render,shadow=renderer.shadowMap.render;
  const timed=(kind,fn)=>{const q=gl.createQuery(),row={q,kind,frame,mode};queries.push(row);gl.beginQuery(ext.TIME_ELAPSED_EXT,q);try{return fn();}finally{gl.endQuery(ext.TIME_ELAPSED_EXT);}};
  renderer.render=function(sc,cam){if(!capture||mode!=='passes')return render.call(this,sc,cam);const kind=sc===scene?(sc.overrideMaterial?.isMeshNormalMaterial?'ao-normal':'scene-and-shadow'):sc.isScene?'hands':'post';return timed(kind,()=>render.call(this,sc,cam));};
  renderer.shadowMap.render=function(...args){if(!capture||mode!=='shadow'||!this.enabled||(!this.autoUpdate&&!this.needsUpdate))return shadow.apply(this,args);return timed('shadow',()=>shadow.apply(this,args));};
  try {
   for(mode of ['passes','shadow'])for(let i=0;i<8;i++) {frame++;const at=performance.now();capture=true;try{L.render();}finally{capture=false;}frames.push({mode,frame,cpuMs:performance.now()-at});await new Promise(requestAnimationFrame);}
   const deadline=performance.now()+10000;
   while(queries.some(r=>!gl.getQueryParameter(r.q,gl.QUERY_RESULT_AVAILABLE))){if(performance.now()>deadline)throw new Error('GPU query deadline exceeded');await new Promise(requestAnimationFrame);}
   const disjoint=!!gl.getParameter(ext.GPU_DISJOINT_EXT);if(disjoint)return {name,available:true,valid:false,device,reason:'GPU timing was disjoint; samples discarded'};
   const groups=new Map();for(const r of queries){r.ms=gl.getQueryParameter(r.q,gl.QUERY_RESULT)/1e6;const key=r.mode+'/'+r.kind;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r.ms);}
   const gpu=[...groups].map(([key,samples])=>({key,samples:samples.length,medianMs:median(samples),totalMs:samples.reduce((n,x)=>n+x,0)}));
   return {name,available:true,valid:true,device,gfx:L.gfx(),cpuMedianMs:median(frames.filter(f=>f.mode==='passes').map(f=>f.cpuMs)),gpu,frames,queries:queries.map(({q,...r})=>r)};
  }finally{capture=false;renderer.render=render;renderer.shadowMap.render=shadow;for(const {q}of queries)gl.deleteQuery(q);}
 },name));
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/gpu-pass-audit.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),rows,errors,note:'GPU elapsed queries can include CPU submission gaps; these samples do not alone identify an exclusive GPU bottleneck.'},null,2));
 console.log(JSON.stringify(rows.map(({name,available,valid,device,reason,cpuMedianMs,gpu})=>({name,available,valid,device,reason,cpuMedianMs,gpu}))));assert.deepEqual(errors,[]);
 console.log('PASS: GPU timing capability and scene/pass samples recorded without page errors.');
}finally{await b.close();}
