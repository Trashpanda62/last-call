// Cover all presets/bloom, actual SSR/AO overrides, tables and both room variants.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const rows=await p.evaluate(async()=>{
  const D=await import('./src/3d/render3d.js'),settings=await import('./src/settings.js'),L=__lastCall;L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.place(1300,600);L.look(Math.PI/2);L.render();
  const scene=L.scene().scene;let renderer;const before=scene.onBeforeRender;scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;
  // Retain direct coverage of shared plain/instanced preparation, even though
  // live held food now uses independent material selection state. Three gives
  // both object kinds the same .type; place the plain representative first.
  const THREE=await import('three'),{makeSnack}=await import('./src/3d/snacks.js'),sharedFeatures=new THREE.Group();sharedFeatures.visible=false;
  for(let kind=0;kind<3;kind++)sharedFeatures.add(makeSnack(kind,.25));scene.add(sharedFeatures);scene.children.splice(scene.children.indexOf(sharedFeatures),1);scene.children.unshift(sharedFeatures);
  const gl=renderer.getContext(),link=gl.linkProgram,direct=renderer.renderBufferDirect,observed=new Map();let stage='',links=[],selections={};
  gl.linkProgram=function(program){links.push({stage,flags:gl.getAttachedShaders(program).map(s=>(gl.getShaderSource(s).match(/^#define (?:SHADER_TYPE|SHADER_NAME|USE_[A-Z_]+|OPAQUE)\b.*$/gm)||[]))});return link.call(this,program);};
  renderer.renderBufferDirect=function(camera,scene,geometry,material,...a){if(!observed.has(material)){const own=Object.hasOwn(material,'customProgramCacheKey'),key=material.customProgramCacheKey;observed.set(material,{own,key});material.customProgramCacheKey=function(){if(stage==='repeat')selections[this.type]=(selections[this.type]||0)+1;return key.call(this);};}return direct.call(this,camera,scene,geometry,material,...a);};
  const rows=[];
  try {
   for(const preset of ['low','medium','high','ultra','bloom']){
    L.S.screen='briefing';links=[];stage='settings';settings.setPreset(preset==='bloom'?'high':preset);if(preset==='bloom'){settings.set('gfx','bloom','strong');settings.set('gfx','aa','smaa');}
    const at=performance.now();await D.warmup({pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'},(_n,text)=>stage=text);const warmupMs=performance.now()-at;
    L.S.screen='game';stage='repeat';selections={};const selectionFrames=[],began=performance.now();
    for(let i=0;i<3;i++){
     const before={...selections};L.render();
     selectionFrames.push(Object.fromEntries(Object.entries(selections).map(([key,n])=>[key,n-(before[key]||0)]).filter(([,n])=>n)));
    }
    const threeFramesMs=performance.now()-began,tableActivations=[];stage='table activation';
    for(const game of ['slots','dice']){
     if(L.view.priv.seat)L.act('leave');const seat=L.state.seats.find(s=>s.game===game);if(seat.occ)seat.occ.seat=null;seat.occ=seat.claim=null;
     const at=links.length;L.place(seat.x,seat.y);L.look(seat.face,-.35);L.render();const part=L.parts().find(p=>p.part.startsWith('spot:'))?.part;
     if(L.table()?.game!==game||!part||!L.press(part))throw Error('Table activation setup failed: '+game);L.render();L.render();
     tableActivations.push({game,links:links.slice(at)});
    }
    L.act('leave');L.place(1300,600);L.look(Math.PI/2);L.render();
    const roomActivations=[];
    for(const backrooms of [false,true])for(const[name,x,y,look]of[['floor',1300,600,Math.PI/2],['bar',350,400,-Math.PI/2],['rest',330,1000,Math.PI],['arcade',2530,430,-Math.PI/2],['race',2180,960,Math.PI],['slots',1300,1480,Math.PI/2],['vip',2500,1500,Math.PI/2]]){
     stage='room activation';const at=links.length;L.state.backrooms=backrooms;L.place(x,y);L.look(look,-.05);L.render();L.render();
     roomActivations.push({name,backrooms,links:links.slice(at)});
    }
    L.state.backrooms=false;L.place(1300,600);L.look(Math.PI/2);L.render();
    rows.push({preset,warmupMs,threeFramesMs,links:links.slice(),selections:{...selections},selectionFrames,tableActivations,roomActivations,gfx:L.gfx(),state:D.gfxState()});
   }
  }finally{L.S.screen='game';sharedFeatures.removeFromParent();gl.linkProgram=link;renderer.renderBufferDirect=direct;for(const [m,{own,key}]of observed){if(own)m.customProgramCacheKey=key;else delete m.customProgramCacheKey;}}
  return rows;
 });const out=process.argv.find(a=>a.endsWith('.json'))||'shots/graphics-loading.json';fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),rows,errors},null,2));
 assert.deepEqual(errors,[]);
 for(const r of rows){
  if(!process.argv.includes('--baseline'))assert.equal(r.links.filter(l=>/Finishing|repeat|table activation|room activation/.test(l.stage)).length,0,r.preset+': no shaders deferred to final loading/gameplay draws');
  // A material outside the final loading view can activate its cached program
  // once when it enters view. Re-selecting it on subsequent frames is waste.
  for(const frame of r.selectionFrames.slice(1))assert.deepEqual(frame,{},r.preset+': no repeated geometry-flag shader selections after first activation');
 }
 assert.ok(rows.find(r=>r.preset==='low').state.fsr);assert.ok(rows.find(r=>r.preset==='ultra').state.passes.includes('SSRPass'));assert.ok(rows.find(r=>r.preset==='bloom').state.passes.includes('UnrealBloomPass'));
 console.log(process.argv.includes('--baseline')?'RECORDED: graphics preparation and actual room activation baseline.':'PASS: Low/Medium/High/Ultra and bloom defer no shader links to final/loading gameplay draws; zero selections after first activation, with FSR, SMAA, AO, SSR and bloom exercised.');
}finally{await b.close();}
