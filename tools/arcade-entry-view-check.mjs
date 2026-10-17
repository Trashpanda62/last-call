// Real cabinet geometry, sphere-sized openings and actual rendered scoring motion.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const out='shots/arcade-entry';fs.mkdirSync(out,{recursive:true});
const report={at:new Date().toISOString(),variants:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 for(const variant of ['normal','noprops']) {
  const p=await browser.newPage({viewport:{width:1440,height:900},ignoreHTTPSErrors:true});
  p.on('pageerror',e=>report.errors.push(e.stack||e.message));
  await p.goto((process.env.LC_URL||'http://127.0.0.1:8319/')+(variant==='noprops'?'?noprops':''));
  await p.waitForFunction(()=>__lastCall?.S.ready,null,{timeout:120000});
  await p.evaluate(()=>{const L=__lastCall;L.noLock();L.start('gambler',{players:6});L.step(.1);L.S.paused=true;L.state.target=1e12;for(const c of L.state.chars){c.isHuman=true;if(c.id){c.x=1300;c.y=400+c.id*40;}}});
  const openings=await p.evaluate(async()=>{
   const L=__lastCall,T=await import('three'),{SKEE,SKEE_POCKETS}=await import('./src/skee.js');
   const seat=L.state.seats.find(s=>s.game==='skee');L.place(seat.x,seat.y);L.look(seat.face,-.15);L.render();L.render();
   const scene=L.scene().scene,root=scene.getObjectByName('skee-lane-0'),meshes=[];scene.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});
   const normal=new T.Vector3(0,SKEE.slope,1).normalize(),up=new T.Vector3(0,1,-SKEE.slope).normalize();
   return SKEE_POCKETS.map((hole,i)=>{
    const centre=root.localToWorld(new T.Vector3(hole.x,hole.y,hole.z)),blockers=[];
    // The centre and the whole scored sphere cross the actual target opening.
    for(const dx of [-SKEE.radius,0,SKEE.radius])for(const dy of [-SKEE.radius,0,SKEE.radius]){
     if(dx&&dy)continue;
     const from=centre.clone().addScaledVector(normal,.14).add(new T.Vector3(dx,0,0)).addScaledVector(up,dy);
     const ray=new T.Raycaster(from,normal.clone().negate(),0,.195);
     blockers.push(...ray.intersectObjects(meshes,false).filter(h=>{const m=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex||0]:h.object.material;return !m?.transparent||(m.opacity??1)>.5;}).map(h=>h.object.userData.propName||h.object.name||h.object.type));
    }
    return {pocket:i,value:hole.value,blockers};
   });
  });
  assert.ok(openings.every(h=>h.blockers.length===0),JSON.stringify(openings));
  const entries=await p.evaluate(async()=>{
   const L=__lastCall,{skeeNew,skeeLaunch,skeeTick,SKEE,SKEE_POCKETS}=await import('./src/skee.js');
   const witnesses=new Map();
   for(let ai=-40;ai<=40;ai++)for(let pi=0;pi<=200;pi++){
    const r=skeeNew(1,0,0,100);skeeLaunch(r,ai/40,pi/200,1);
    for(let n=0;n<1000&&r.phase==='roll';n++)skeeTick(r,1/120);
    if(r.last){const key=r.last===100?(r.ball.x<0?'left':'right'):String(r.last);if(!witnesses.has(key))witnesses.set(key,{aim:ai/40,power:pi/200});}
   }
   return [...witnesses].map(([key,w])=>{
    const r=skeeNew(1,0,0,100);skeeLaunch(r,w.aim,w.power,1);
    for(let n=0;n<1000&&r.phase==='roll';n++)skeeTick(r,1/120);
    const entry={...r.ball},hole=SKEE_POCKETS.find(h=>h.value===r.last&&Math.abs(h.x-entry.x)<.1);
    const off=Math.hypot(entry.x-hole.x,(entry.y-hole.y)*Math.sqrt(1+SKEE.slope**2));
    skeeTick(r,.08);const b=r.ball;
    return {key,...w,value:r.last,off,clearance:hole.radius-SKEE.radius,entry:{x:entry.x,y:entry.y,z:entry.z},after:{x:b.x,y:b.y,z:b.z},through:b.z-SKEE.boardZ+SKEE.slope*(b.y-SKEE.boardY)};
   });
  });
  assert.equal(entries.length,7);assert.ok(entries.every(e=>e.off<e.clearance+.008&&e.through<-.10&&e.after.z<e.entry.z));
  // A visible real host roll, photographed at the lip and after entry.
  await p.evaluate(w=>{const L=__lastCall;L.S.paused=false;L.press('spot:main');L.act('skee',{kind:'start',after:0,bet:100});L.step(.01);L.render();const r=L.state.skee[0];r.hot=false;document.activeElement?.blur();const realNow=performance.now.bind(performance);let clock=realNow();performance.now=()=>clock;try{window.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));clock+=w.power*1400;window.dispatchEvent(new KeyboardEvent('keyup',{key:' '}));}finally{performance.now=realNow;}if(!r.ball||Math.abs(r.ball.power-w.power)>.001)throw Error('Actual held Space roll failed');L.S.paused=true;for(let i=0;i<1000&&r.phase==='roll'&&!r.ball.opening;i++)L.step(1/120);L.render();L.render();},entries.find(e=>e.key==='40'));
  await p.screenshot({path:out+'/'+variant+'-skee-entry.jpg',type:'jpeg',quality:94});
  await p.evaluate(()=>{__lastCall.step(.10);__lastCall.render();__lastCall.render();});
  assert.equal(await p.evaluate(()=>__lastCall.state.skee[0].last),40);
  const renderedEntry=await p.evaluate(()=>{const L=__lastCall,b=L.state.skee[0].ball,m=L.scene().scene.getObjectByName('skee-lane-0').getObjectByName('skee-live-ball');return{stage:b.stage,power:b.power,host:[b.x,b.y,b.z],mesh:m.position.toArray(),visible:m.visible};});
  assert.equal(renderedEntry.stage,'pocket');assert.ok(renderedEntry.visible);
  assert.ok(Math.hypot(...renderedEntry.mesh.map((v,i)=>v-renderedEntry.host[i]))<.03,JSON.stringify(renderedEntry));
  await p.screenshot({path:out+'/'+variant+'-skee-through.jpg',type:'jpeg',quality:94});
  await p.evaluate(()=>{const L=__lastCall;L.act('leave');L.place(2500,480);L.look(.7,-.04);L.render();L.render();});
  await p.screenshot({path:out+'/'+variant+'-arcade-layout.jpg',type:'jpeg',quality:94});
  await p.evaluate(()=>{const L=__lastCall;const s=L.state.seats.find(s=>s.game==='flappy');L.place(s.x,s.y);L.look(s.face,.05);L.S.paused=false;L.render();L.render();});
  for(const part of ['spot:main','btn:start','btn:drop']){
   const pt=await p.evaluate(part=>{const L=__lastCall;L.aimAt(part);L.render();return L.parts().find(p=>p.part===part);},part);assert.ok(pt,part);
   await p.mouse.click(pt.x,pt.y);await p.evaluate(()=>{__lastCall.step(.01);__lastCall.render();});
  }
  assert.equal(await p.evaluate(()=>__lastCall.state.arcade.flappy.phase),'fly');
  await p.evaluate(()=>{const L=__lastCall;L.S.paused=true;const s=L.view.priv.seat;L.look(s.face,.05);L.render();});
  await p.screenshot({path:out+'/'+variant+'-flappy.jpg',type:'jpeg',quality:94});
  report.variants.push({variant,openings,entries,renderedEntry,physicalFlappyControls:true});await p.close();
 }
 assert.deepEqual(report.errors,[]);
 console.log('PASS: seven sphere-sized rendered openings; every ball travels through its scored hole; wall-mounted Flappy real clicks; both graphics variants.');
} catch(e){report.errors.push(e.stack||String(e));throw e;}
finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
