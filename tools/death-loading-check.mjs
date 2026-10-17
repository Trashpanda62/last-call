// Real poison and human-attack cinematics must not rebuild the scene's shaders.
import fs from 'node:fs'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
 const p = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [];
 if(process.argv.includes('--baseline'))await p.route('**/src/main.js',async route=>{const response=await route.fetch(),source=await response.text();await route.fulfill({response,body:source.replace(/  if \(S\.deathUntil && !sceneDeathPlaying\(\)\) S\.deathUntil = 0;\r?\n/,'')});});
 p.on('pageerror', e => errors.push(e.message)); await p.goto('https://10.42.0.37:3161/'); await p.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
 const result = await p.evaluate(async () => {
  const L = __lastCall, D = await import('./src/3d/render3d.js');
  L.noLock(); L.start('gambler', { players: 32 }); L.step(.1); L.S.paused = true; L.place(750,550); L.look(0); L.render();
  await D.warmup({pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'});
  let renderer; const scene=L.scene().scene,before=scene.onBeforeRender;scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);}; L.render();scene.onBeforeRender=before;
  const clock=performance.now.bind(performance), gl=renderer.getContext(), link=gl.linkProgram, buffer=gl.bufferData, upload=gl.texSubImage2D;
  let frozen=clock(), links=[], buffers=[],uploads=[];performance.now=()=>frozen;
  gl.linkProgram=function(program){links.push(gl.getAttachedShaders(program).map(s=>(gl.getShaderSource(s).match(/^#define (?:SHADER_TYPE|SHADER_NAME|NUM_POINT_LIGHTS|USE_[A-Z_]+|OPAQUE)\b.*$/gm)||[])));return link.call(this,program);};
  gl.bufferData=function(target,data,...a){buffers.push(typeof data==='number'?data:data?.byteLength||0);return buffer.call(this,target,data,...a);};
  gl.texSubImage2D=function(...a){const im=a.at(-1);if(im?.width&&im?.height)uploads.push([im.constructor.name,im.width,im.height]);return upload.apply(this,a);};
  const rows=[],handoffs=[],revealInputs=[];
  const cameraKey=()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'c'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'c'}));};
  const capture=(name,setup=()=>{})=>{
   links=[];buffers=[];uploads=[];frozen+=100;const at=clock();setup();
   const wasActive=L.scene().death.active,deadlineRemaining=L.S.deathUntil-frozen;
   L.render();
   if(name.endsWith('reveal')){const paused=L.S.paused;L.S.paused=false;cameraKey();L.render();revealInputs.push({name,phase:L.scene().death.active,feed:L.view.priv.cameraFeed});L.S.paused=paused;}
   if(wasActive&&!L.scene().death.active){
    const paused=L.S.paused;L.S.paused=false;const remaining=L.S.deathUntil-frozen;cameraKey();L.render();
    handoffs.push({name,deadlineRemaining,remaining,feed:L.view.priv.cameraFeed});
    if(L.view.priv.cameraFeed){cameraKey();L.render();}L.S.paused=paused;
   }
   let pointLights=0;scene.traverseVisible(o=>{if(o.isPointLight)pointLights++;});rows.push({name,ms:clock()-at,phase:L.scene().death,pointLights,cameraFeed:L.view.priv.cameraFeed,links:links.slice(),buffers:buffers.length,bytes:buffers.reduce((a,b)=>a+b,0),uploads:uploads.slice()});
  };
  try {
   capture('ready');
   capture('poison death reveal',()=>{const c=L.state.chars[0];c.poisonT=.001;c.poisonBy=L.state.killerIds[0];L.step(.02);});
   for(let i=0;i<36;i++)capture('poison death '+i);
   capture('ghost camera',()=>L.act('cameras'));
   capture('close ghost camera',()=>L.act('cameras'));
   capture('revive',()=>{const c=L.state.chars[0];c.alive=true;c.deathScene=null;L.step(.02);});
   capture('human attack reveal',()=>{const c=L.state.chars[0],a=L.state.chars[L.state.killerIds[0]];c.alive=false;c.deathScene={t:L.state.t,x:c.x,y:c.y,face:c.look,cause:'blade',attacker:{color:a.color,hat:a.hat,monster:false}};L.step(.02);});
   for(let i=0;i<36;i++)capture('human death '+i);
   return {rows,handoffs,revealInputs,memory:{...renderer.info.memory,programs:renderer.info.programs.length}};
  }finally{performance.now=clock;gl.linkProgram=link;gl.bufferData=buffer;gl.texSubImage2D=upload;}
 });
 const out=process.argv[2]||'shots/death-loading.json'; fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),...result,errors},null,2));
 assert.deepEqual(errors,[]);
 for(const r of result.rows){assert.equal(r.links.length,0,r.name+': no shader compilation');assert.equal(r.buffers,0,r.name+': prepared geometry');assert.equal(r.pointLights,result.rows[0].pointLights,r.name+': stable lighting shader flags');}
 for(const prefix of ['poison death','human'])for(const phase of ['reveal','jumpscare','collapse'])assert.ok(result.rows.some(r=>r.name.startsWith(prefix)&&r.phase.active&&r.phase.phase===phase),prefix+': '+phase);
 assert.equal(result.rows.at(-1).phase.active,false,'cinematic clears and restores the normal lighting path');
 assert.equal(result.rows.find(r=>r.name==='ghost camera').cameraFeed,'floor','private ghost cameras work after the full cinematic');
 assert.equal(result.handoffs.length,2);
 for(const r of result.revealInputs){assert.equal(r.phase,true);assert.equal(r.feed,null,'C cannot skip an active cinematic');}
 if(!process.argv.includes('--baseline'))for(const r of result.handoffs){assert.equal(r.feed,'floor','first actual C key works as soon as the visual cinematic ends');assert.ok(r.remaining<=0,'completed visuals release the pending input deadline');}
 else assert.ok(result.handoffs.some(r=>r.remaining>0&&r.feed===null),'baseline reproduces the swallowed completion key');
 console.log('PASS: real poison and human-attack deaths retain reveal/jumpscare/collapse, private ghost-camera access and a stable point-light count; zero deferred shader links/geometry buffers.',JSON.stringify(result.rows.filter(r=>r.name.endsWith('reveal')).map(r=>({name:r.name,ms:r.ms,lights:r.pointLights}))));
} finally { await browser.close(); }
