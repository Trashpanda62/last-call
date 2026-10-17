// Real host/guest/observer death delivery, including delayed packed snapshots.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const out=process.argv[2]||'shots/death-network';fs.mkdirSync(out,{recursive:true});
const report={at:new Date().toISOString(),rows:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const pages=[];
 for(const name of ['DeathHost','DeathGuest','DeathWatch']){
  const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:960,height:640}});pages.push(p);
  p.on('pageerror',e=>report.errors.push({name,error:e.stack||e.message}));
  await p.addInitScript(()=>localStorage.setItem('lc.settings',JSON.stringify({v:2,gfx:{preset:'low'},voice:{mode:'off'}})));
  await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  await p.evaluate(name=>{__lastCall.noLock();document.querySelector('#nameIn').value=name;},name);
 }
 const[h,g,w]=pages;await h.locator('#hostBtn').click();await h.waitForFunction(()=>__lastCall.S.code?.length===4,null,{timeout:45000});
 const code=await h.evaluate(()=>__lastCall.S.code);
 for(const p of[g,w]){await p.locator('#joinToggle').click();await p.locator('#codeIn').fill(code);await p.locator('#joinBtn').click();}
 await h.waitForFunction(()=>__lastCall.S.guests.size===2,null,{timeout:45000});
 for(const kind of ['knife-paused','rigged-game','monster','delayed-last-player']){
  if(report.rows.length)await h.evaluate(()=>document.querySelector('#againBtn').click());
  await h.locator('#optPlayers').selectOption('6');await h.locator('#startBtn').click();
  for(const p of pages){await p.waitForFunction(()=>!document.querySelector('#levelContinue').disabled,null,{timeout:120000});await p.locator('#levelContinue').click();}
  await h.evaluate(()=>{__lastCall.state.pickT=.01;});
  for(const p of pages)await p.waitForFunction(()=>__lastCall.view?.pub.mode==='play',null,{timeout:20000});
  await h.evaluate(()=>{
   const G=__lastCall.state;G.target=3000000;G.killerIds=[0];
   for(const c of G.chars){c.isHuman=true;c.isKiller=c.id===0;c.gear.clear();c.items.clear();if(c.seat)c.seat.occ=null;c.seat=null;c.x=1850;c.y=700+c.id*40;c.look=c.face=0;c.posVer++;c.moving=false;for(const key in c.cd)c.cd[key]=999;}
  });
  await g.waitForFunction(()=>__lastCall.view.priv.isKiller===false);
  await g.evaluate(()=>{
   window.deathCapture={phases:[],frames:[],keys:[],first:null,overDuring:false,ended:false};
   window.deathTrack=true;
   function sample(){if(!deathTrack)return;const L=__lastCall,d=L.scene().death,v=L.view?.priv;
    if(d.active){
     const phase=d.phase;if(!deathCapture.phases.includes(phase)){deathCapture.phases.push(phase);deathCapture.frames.push({phase,png:document.querySelector('#view').toDataURL('image/png')});}
     const key=v.me+':'+v.deathScene.t;if(!deathCapture.keys.includes(key))deathCapture.keys.push(key);
     if(!deathCapture.first)deathCapture.first={phase,caption:document.querySelector('#deathCaption').textContent,paused:L.S.paused,pauseVisible:!document.querySelector('#pause').classList.contains('hidden'),age:L.view.pub.t-v.deathScene.t,snapshot:structuredClone(v.deathScene),camera:L.scene().camera.position.toArray()};
     if(!document.querySelector('#over').classList.contains('hidden'))deathCapture.overDuring=true;
    }else if(deathCapture.first)deathCapture.ended=true;
    requestAnimationFrame(sample);
   }requestAnimationFrame(sample);
  });
  // Observe actual packed snapshots before transport; only the victim may receive death identity.
  await h.evaluate(async delayed=>{
   const {packPub,packFor}=await import('./src/wire.js');
   const room=__lastCall.S.room,send=room.send;window.deathWire=[];window.deathHeld=[];window.deathHolding=false;window.deathReleased=false;window.deathHeldAt=0;window.deathReleasedAt=0;
   window.restoreDeathSend=()=>{room.send=send;};
   room.send=function(conn,msg){
    if(msg.t==='snap'){
     const id=__lastCall.S.guests.get(conn)?.id;
     if(msg.priv?.deathScene)deathWire.push({id,snapshot:structuredClone(msg.priv.deathScene),pubLeak:!!msg.pub.deathScene||msg.pub.chars.some(c=>c&&typeof c==='object'&&!Array.isArray(c)&&('deathScene'in c||'killer'in c))});
     if(delayed&&id===1&&!deathReleased&&(deathHolding||msg.priv?.deathScene)){
      deathHeld.push({conn,msg:structuredClone(msg)});
      if(!deathHolding){deathHolding=true;deathHeldAt=performance.now();setTimeout(()=>{deathReleasedAt=performance.now();deathReleased=true;const L=__lastCall,entry=deathHeld.at(-1),guest=L.S.guests.get(entry.conn),pub=L.S.sim.pubView();guest.wire={};send.call(room,entry.conn,{t:'snap',...packFor(packPub(pub),L.S.sim.view(1,pub).priv,guest.wire,L.state.meeting)});},5000);}return;
     }
    }return send.call(this,conn,msg);
   };
  },kind==='delayed-last-player');
  if(kind==='rigged-game'){
   await h.evaluate(()=>{const L=__lastCall,G=L.state,k=G.chars[0],s=G.seats.find(s=>s.game==='bj');k.x=s.x;k.y=s.y;k.posVer++;k.cd.rig=0;L.S.me.x=k.x;L.S.me.y=k.y;L.S.me.posVer=k.posVer;L.act('rig');if(!G.traps.some(t=>t.id===s.id&&t.kind==='seat'))throw Error('Host rig failed');k.x=1850;k.y=700;k.posVer++;L.S.me.x=k.x;L.S.me.y=k.y;L.S.me.posVer=k.posVer;const v=G.chars[1];v.x=s.x;v.y=s.y;v.face=v.look=s.face;v.posVer++;});
   await g.waitForFunction(()=>__lastCall.view.priv.seat?.game==='bj');
   await g.evaluate(()=>{__lastCall.look(__lastCall.view.priv.seat.face,-.7);__lastCall.render();if(__lastCall.press('spot:main')!==true)throw Error('Guest chip failed');});
   await h.waitForFunction(()=>__lastCall.state.chars[1].trapT>0);
  }else{
   await h.evaluate(kind=>{
    const L=__lastCall,G=L.state,k=G.chars[0],v=G.chars[1];v.x=1320;v.y=600;v.look=v.face=0;v.posVer++;
    if(kind==='knife-paused'){const s=G.seats.find(s=>s.game==='bj');v.x=s.x;v.y=s.y;v.look=v.face=s.face;v.posVer++;}
    k.x=1850;k.y=700;k.look=v.look;k.posVer++;L.S.me.x=k.x;L.S.me.y=k.y;L.S.me.look=k.look;L.S.me.posVer=k.posVer;k.cd.blade=0;
    k.disguise={as:2,t:30};
    if(kind==='delayed-last-player')for(const c of G.chars)if(c!==k&&c!==v)c.alive=false;
   },kind);
   await g.waitForFunction(()=>Math.hypot(__lastCall.view.priv.x-__lastCall.S.me.x,__lastCall.view.priv.y-__lastCall.S.me.y)<2);
   if(kind==='knife-paused'){await g.waitForFunction(()=>__lastCall.view.priv.seat?.game==='bj');await g.evaluate(()=>{__lastCall.S.paused=true;document.querySelector('#pause').classList.remove('hidden');});}
   await h.evaluate(kind=>{const L=__lastCall,k=L.state.chars[0],v=L.state.chars[1];k.x=v.x-Math.cos(v.look)*25;k.y=v.y-Math.sin(v.look)*25;k.look=v.look;k.posVer++;L.S.me.x=k.x;L.S.me.y=k.y;L.S.me.look=k.look;L.S.me.posVer=k.posVer;if(kind==='monster'){k.cd.lights=0;L.act('lights');L.act('transform');if(!k.monster)throw Error('Host transform failed');}L.act('blade');if(kind==='monster'&&k.grab?.v!==1)throw Error('Host monster grab failed');if(kind!=='monster'&&L.state.chars[1].alive)throw Error('Host knife failed');},kind);
  }
  await g.waitForFunction(()=>deathCapture.ended,null,{timeout:25000});
  const row=await g.evaluate(()=>structuredClone(deathCapture));row.kind=kind;
  row.wire=await h.evaluate(()=>({recipients:[...new Set(deathWire.map(m=>m.id))],pubLeak:deathWire.some(m=>m.pubLeak),held:deathHeld.length,released:deathReleased,heldMs:deathReleasedAt-deathHeldAt,delivery:deathReleased?'fresh complete host snapshot after held deltas':'ordinary packed snapshots'}));
  row.observer=await w.evaluate(()=>({active:__lastCall.scene().death.active,snapshot:__lastCall.view.priv.deathScene,pubLeak:__lastCall.view.pub.chars.some(c=>'deathScene'in c||'killer'in c)}));
  if(kind==='delayed-last-player'){await g.locator('#over').waitFor({state:'visible',timeout:10000});row.overAfter=true;}
  else{await g.keyboard.press('c');await g.waitForFunction(()=>__lastCall.view.priv.cameraFeed==='floor');row.ghostCamera=true;}
  await g.evaluate(()=>{deathTrack=false;});await h.evaluate(()=>restoreDeathSend());
  for(const frame of row.frames)fs.writeFileSync(`${out}/${kind}-${frame.phase}.png`,Buffer.from(frame.png.split(',')[1],'base64'));delete row.frames;
  report.rows.push(row);fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
  assert.deepEqual(row.phases,['reveal','jumpscare','collapse'],kind);assert.equal(row.keys.length,1,kind);assert.equal(row.overDuring,false,kind);
  assert.match(row.first.caption,/Killed by DeathHost/);assert.equal(row.first.paused,false);assert.equal(row.first.pauseVisible,false);
  assert.deepEqual(row.wire.recipients,[1]);assert.equal(row.wire.pubLeak,false);assert.equal(row.observer.active,false);assert.equal(row.observer.snapshot,null);assert.equal(row.observer.pubLeak,false);
  if(kind==='monster'){assert.equal(row.first.snapshot.cause,'monster');assert.equal(row.first.snapshot.attacker.monster,true);}
  if(kind==='rigged-game')assert.equal(row.first.snapshot.cause,'trap');
  if(kind==='delayed-last-player'){assert.ok(row.first.age>3.4,'first snapshot is older than the full cinematic');assert.ok(row.wire.heldMs>=4900,'actual transport held at least 4.9 seconds');assert.ok(row.wire.held>1);assert.equal(row.wire.released,true);}
  console.log('PASS:',kind,JSON.stringify({phases:row.phases,age:row.first.age,privateRecipients:row.wire.recipients}));
 }
 assert.deepEqual(report.errors,[]);
 console.log('PASS: four actual three-browser deaths, victim-only identity, complete cinematics and ghost/end-screen handoff.');
}catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
