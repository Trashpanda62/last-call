// Real first-person skee lane play and GPU preparation, normal and procedural fallback.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const out='shots/skee';fs.mkdirSync(out,{recursive:true});const report={at:new Date().toISOString(),rows:[],errors:[]};
try{
 for(const fallback of[false,true]){
  const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}});p.on('pageerror',e=>{report.errors.push(e.message);console.log('PAGE ERROR',e.stack);});p.on('console',m=>{if(m.type()==='error')console.log('BROWSER ERROR',m.text());});
  const requests=[];p.on('request',r=>{if(/assets\//.test(r.url()))requests.push(r.url());});
  await p.goto((process.env.LC_URL||'https://10.42.0.37:3161/')+(fallback?'?noprops':''));await p.waitForFunction(()=>window.__lastCall?.S.ready||window.__lastCall?.S.boot?.error,null,{timeout:120000});
  if(await p.evaluate(()=>!!__lastCall.S.boot.error)) { const cause=await p.evaluate(async()=>{try{const{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');await new GLTFLoader().loadAsync('assets/props/skeeCabinet.glb');return 'direct load succeeded';}catch(e){return e.stack;}});throw Error(cause);}
  const result=await p.evaluate(async fallback=>{
   const D=await import('./src/3d/render3d.js'),THREE=await import('three'),T=await import('./src/tables.js'),{SKEE_POCKETS}=await import('./src/skee.js');
   const assert=condition=>{if(!condition)throw Error('Actual skee action expectation failed');};
   const L=__lastCall;L.noLock();L.start('gambler',{players:6});L.step(.1);for(const c of L.state.chars){c.isHuman=true;if(c.id)c.x=1300,c.y=550+c.id*35;}L.state.target=1e12;L.S.paused=true;L.S.disp={};
   const seat=L.state.seats.find(s=>s.game==='skee');L.look(seat.face,-.15);L.place(seat.x,seat.y);L.render();
   const screenBefore=L.S.screen;L.S.screen='preparing-test';
   await D.warmup({pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'});L.S.screen=screenBefore;
   L.S.paused=false;L.render();
   let renderer;const scene=L.scene().scene,before=scene.onBeforeRender;scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;
   const gl=renderer.getContext(),link=gl.linkProgram,buffer=gl.bufferData;let links=0,buffers=0;gl.linkProgram=function(...a){links++;return link.apply(this,a);};gl.bufferData=function(...a){buffers++;return buffer.apply(this,a);};
   const realNow=performance.now.bind(performance);let clock=realNow();performance.now=()=>clock;
   const space=()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));window.dispatchEvent(new KeyboardEvent('keyup',{key:' '}));};
   const rows=[];
   function snap(label){L.render();const root=scene.getObjectByName('skee-lane-0'),cam=L.scene().camera,eyes=cam.position.clone(),ray=new THREE.Raycaster(),meshes=[];scene.traverseVisible(o=>{if(o.isMesh&&!o.isInstancedMesh)meshes.push(o);});
    const pockets=SKEE_POCKETS.map((slot,i)=>{const ring=root.getObjectByName('skee-pocket-'+i),pt=ring.getWorldPosition(new THREE.Vector3()),dst=pt.distanceTo(eyes),ndc=pt.clone().project(cam);ray.set(eyes,pt.clone().sub(eyes).normalize());ray.far=dst+.01;const first=ray.intersectObjects(meshes,false).find(h=>h.distance<dst-.05);return{value:slot.value,world:pt.toArray(),projection:ndc.toArray(),blocker:first?.object.name||null};});
    const ball=root.getObjectByName('skee-live-ball'),r=L.view.pub.skee[0];return{label,seat:L.table()?.seat,phase:r?.phase,score:r?.score,launched:r?.launched,pockets,chip:L.parts().find(p=>p.part==='spot:main'),ball:{visible:ball.visible,position:ball.position.toArray()},controls:[...document.querySelectorAll('#gameControls button')].map(b=>({text:b.textContent,disabled:b.disabled})),links,buffers};}
   rows.push(snap('ready'));assert(L.press('spot:main')===true);space();L.step(1/60);L.render();const round=L.state.skee[0];assert(round&&round.phase==='aim');rows.push(snap('start'));
   // Actual held keyboard action changes power; a repeated keydown never creates another launch.
   window.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));clock+=560;L.render();rows.push(snap('charging'));window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',repeat:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:' '}));
   L.step(.15);L.render();rows.push(snap('rolling'));assert(round.launched===1);const firstPower=round.ball?.power;
   for(let i=0;i<480&&round.phase!=='aim';i++){L.step(1/60);clock+=1000/60;L.render();}
   rows.push(snap('first score'));for(let n=2;n<=9;n++){L.press('btn:roll');L.step(1/60);L.render();for(let i=0;i<480&&round.phase!=='aim'&&round.phase!=='done';i++){L.step(1/60);clock+=1000/60;L.render();}}
   rows.push(snap('completed'));assert(round.launched===9&&round.paid&&round.phase==='done');
   // Final first-person play frame and a second lane/spectator overview.
   L.step(1.2);L.look(seat.face,-.15);L.S.disp={};L.render();const png=document.getElementById('view').toDataURL('image/png');
   L.act('leave');L.place(2700,470);L.look(-1.1,-.10);L.render();const overview=document.getElementById('view').toDataURL('image/png');
   const result={fallback,rows,firstPower,round:{score:round.score,history:round.history,paid:round.paid},links,buffers,memory:renderer.info.memory,png,overview};
   gl.linkProgram=link;gl.bufferData=buffer;const offset=clock-realNow();performance.now=()=>realNow()+offset;L.S.paused=true;return result;
  },fallback);
  for(const key of['png','overview']){fs.writeFileSync(`${out}/${fallback?'fallback':'normal'}-${key}.png`,Buffer.from(result[key].split(',')[1],'base64'));delete result[key];}
  result.assetRequests=requests;
  await p.evaluate(()=>{const L=__lastCall,s=L.state.seats.find(s=>s.game==='skee');L.place(s.x,s.y);L.look(s.face,-.15);L.S.paused=false;L.render();if(L.press('spot:main')!==true)throw Error('UI follow-up chip placement failed');L.render();});
  const roll=p.locator('#gameControls [data-play="btn:roll"]');
  await p.keyboard.press('Space');await p.waitForFunction(()=>__lastCall.state.skee[0].phase==='aim');
  await p.waitForTimeout(100);const before=await p.evaluate(()=>__lastCall.state.skee[0].launched);
  const cancelBox=await roll.boundingBox();await p.mouse.move(cancelBox.x+cancelBox.width/2,cancelBox.y+cancelBox.height/2);await p.mouse.down();await p.waitForTimeout(420);await roll.dispatchEvent('pointercancel',{pointerId:1});await p.mouse.up();await p.waitForTimeout(450);
  assert.equal(await p.evaluate(()=>__lastCall.state.skee[0].launched),before,'pointer cancellation never rolls');
  const box=await roll.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.waitForTimeout(600);await p.mouse.up();
  await p.waitForFunction(n=>__lastCall.state.skee[0].launched===n+1,before);
  const mouse=await p.evaluate(()=>({power:__lastCall.state.skee[0].ball?.power,balls:__lastCall.state.skee[0].launched}));assert.ok(mouse.power>.3&&mouse.power<.7);
  await p.waitForFunction(()=>__lastCall.state.skee[0].phase==='aim');
  await p.evaluate(()=>{window.testPad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[testPad]});testPad.buttons[0]={pressed:true,value:1};});
  await p.waitForTimeout(700);await p.evaluate(()=>{testPad.buttons[0]={pressed:false,value:0};});await p.waitForFunction(()=>__lastCall.state.skee[0].launched===2);
  const controller=await p.evaluate(()=>({power:__lastCall.state.skee[0].ball?.power,balls:__lastCall.state.skee[0].launched}));assert.ok(controller.power>.3&&controller.power<.7);
  await p.waitForFunction(()=>__lastCall.state.skee[0].phase==='aim');await p.evaluate(()=>{testPad.axes[2]=.30;});await p.waitForTimeout(150);await p.evaluate(()=>{testPad.axes[2]=0;});
  const aimed=await p.evaluate(()=>__lastCall.table().extra.aim);assert.ok(Math.abs(aimed)>.05,'right stick changes real lane aim without leaving mouse look');
  await p.screenshot({path:`${out}/${fallback?'fallback':'normal'}-hud.png`});await p.evaluate(()=>{__lastCall.S.paused=true;});
  await p.setViewportSize({width:740,height:420});await p.evaluate(()=>{__lastCall.S.paused=false;__lastCall.render();});await p.waitForTimeout(200);
  const compact=await p.evaluate(()=>{const b=document.querySelector('#gameControls [data-play="btn:roll"]'),r=b.getBoundingClientRect();return{visible:!!b.getClientRects().length,rect:{x:r.x,y:r.y,width:r.width,height:r.height},overflow:document.documentElement.scrollWidth>innerWidth,blackjack:!!document.querySelector('#bjActions:not(.hidden) button')};});assert.ok(compact.visible&&!compact.overflow&&!compact.blackjack);assert.ok(compact.rect.x>=0&&compact.rect.y>=0&&compact.rect.x+compact.rect.width<=740&&compact.rect.y+compact.rect.height<=420);
  await p.screenshot({path:`${out}/${fallback?'fallback':'normal'}-compact.png`});
  result.inputs={mouse,controller,rightStickAim:aimed,compact,controllerHardware:'simulated standard mapping; physical device untested'};
  report.rows.push(result);await p.close();
 }
 fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));assert.deepEqual(report.errors,[]);for(const r of report.rows){assert.ok(Math.abs(r.firstPower-.4)<.001);assert.equal(r.links,0);assert.equal(r.buffers,0);for(const row of r.rows){assert.ok(row.pockets.every(p=>Math.abs(p.projection[0])<1&&Math.abs(p.projection[1])<1));assert.ok(row.chip?.on);}}
 console.log('PASS: actual chip/Space start, held keyboard power, nine scored balls and single host payout, both graphics paths, all seven target centers in view, zero first-use shaders/static buffers.');
}finally{await browser.close();}
