// Real PeerJS data/media links between three isolated browsers: concurrent loading,
// independent Continue, live input, positional voice, private ghost cameras and cleanup.
// Run on ml350 with PW set. --baseline records the pre-fix loading/roster behavior.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const baseline=process.argv.includes('--baseline'),out=process.argv.find(a=>a.endsWith('.json'))||'shots/multiplayer-arrival.json';
const url=process.env.LC_URL||'https://10.42.0.37:3161/';
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],ignoreDefaultArgs:['--disable-gpu']});
const pages=[],errors=[],report={at:new Date().toISOString(),baseline};
const snapshot=page=>page.evaluate(()=>({role:__lastCall.S.role,screen:__lastCall.S.screen,hasView:!!__lastCall.view,ready:!document.querySelector('#levelContinue').disabled,t:__lastCall.state?.t??__lastCall.view?.pub.t,pickT:__lastCall.state?.pickT??__lastCall.view?.pub.pickT,mode:__lastCall.view?.pub.mode,frames:__lastCall.gfx().frames,voice:__lastCall.voice()}));
const sample=()=>Promise.all(pages.map(snapshot));
try {
 for(const name of ['AuditHost','AuditGuestA','AuditGuestB']) {
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:960,height:640},permissions:['microphone']}),page=await context.newPage();pages.push(page);
  page.on('pageerror',e=>errors.push({name,message:e.message}));
  await page.addInitScript(()=>localStorage.setItem('lc.settings',JSON.stringify({v:2,gfx:{preset:'low'},voice:{mode:'game'}})));
  await page.addInitScript(()=>{window.auditMicStreams=[];const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await gum(options);auditMicStreams.push(stream);return stream;};});
  await page.goto(url);await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  await page.evaluate(name=>{__lastCall.noLock();document.querySelector('#nameIn').value=name;},name);
 }
 const [host,a,b]=pages;
 await host.locator('#hostBtn').click();await host.waitForFunction(()=>__lastCall.S.code?.length===4,null,{timeout:45000});
 const code=await host.evaluate(()=>__lastCall.S.code);
 for(const page of [a,b]) {await page.locator('#joinToggle').click();await page.locator('#codeIn').fill(code);await page.locator('#joinBtn').click();}
 await host.waitForFunction(()=>__lastCall.S.guests.size===2,null,{timeout:45000});
 report.lobby=await sample();
 await host.locator('#optPlayers').selectOption('6');await host.locator('#optKillers').selectOption('1');await host.locator('#startBtn').click();
 await host.waitForFunction(()=>!document.querySelector('#levelContinue').disabled,null,{timeout:120000});
 if(baseline)await a.waitForTimeout(1800);
 else for(const page of [a,b])await page.waitForFunction(()=>!document.querySelector('#levelContinue').disabled,null,{timeout:120000});
 report.beforeHostContinue=await sample();
 assert.equal(report.beforeHostContinue[0].t,0);assert.equal(report.beforeHostContinue[0].screen,'briefing');
 if(!baseline) {
  for(const row of report.beforeHostContinue){assert.ok(row.ready&&row.hasView);assert.equal(row.screen,'briefing');assert.equal(row.voice.roster.length,3);assert.deepEqual(row.voice.roster.map(r=>r.id).sort(),[0,1,2]);}
  await a.locator('#levelContinue').click();await a.waitForTimeout(800);
  report.guestFirst=await sample();
  assert.equal(report.guestFirst[0].t,0);assert.equal(report.guestFirst[0].pickT,report.beforeHostContinue[0].pickT);assert.equal(report.guestFirst[1].screen,'game');assert.equal(report.guestFirst[2].screen,'briefing');
  assert.equal(report.guestFirst[2].frames,report.beforeHostContinue[2].frames,'prepared briefing performs no background scene rendering');
 }
 await host.locator('#levelContinue').click();
 for(const page of [a,b])if(await page.evaluate(()=>__lastCall.S.screen==='briefing')){await page.waitForFunction(()=>!document.querySelector('#levelContinue').disabled,null,{timeout:120000});await page.locator('#levelContinue').click();}
 // Shorten only this fixture's pick timer; transition through the real simulation tick.
 await host.evaluate(()=>{__lastCall.state.pickT=.01;});
 for(const page of pages)await page.waitForFunction(()=>__lastCall.view?.pub.mode==='play',null,{timeout:20000});
 for(const page of pages)await page.waitForFunction(()=>__lastCall.voice().info?.remotes.length===2&&__lastCall.voice().info.remotes.every(r=>r.live&&r.heard),null,{timeout:45000});
 const placeHumans=async far=>{
  await host.evaluate(far=>{for(let id=0;id<3;id++){const c=__lastCall.state.chars[id];c.x=far&&id===2?2600:1300+id*45;c.y=600;c.posVer++;}},far);
  for(let id=0;id<3;id++)await pages[id].waitForFunction(({id,far})=>{const p=__lastCall.view?.priv;return p&&Math.abs(__lastCall.S.me.x-(far&&id===2?2600:1300+id*45))<15;},{id,far},{timeout:15000});
  await host.waitForTimeout(400);
 };
 await placeHumans(false);report.near=await sample();
 if(!baseline)for(const row of report.near){assert.deepEqual(row.voice.roster.map(r=>r.id).sort(),[0,1,2]);assert.ok(row.voice.info.remotes.every(r=>r.gain>.9),'nearby living players hear each other');}
 if(!baseline) {
  await placeHumans(true);
  await host.waitForFunction(()=>__lastCall.voice().info.remotes.find(r=>r.id===2)?.gain===0,null,{timeout:10000});
  report.far=await sample();assert.equal(report.far[2].voice.info.remotes.filter(r=>r.gain===0).length,2);
  await placeHumans(false);
  const position=()=>host.evaluate(()=>({x:__lastCall.state.chars[1].x,y:__lastCall.state.chars[1].y})),before=await position();
  await a.keyboard.down('w');await a.waitForTimeout(500);await a.keyboard.up('w');await host.waitForTimeout(300);const after=await position();
  report.input={before,after,distance:Math.hypot(after.x-before.x,after.y-before.y)};assert.ok(report.input.distance>5,'real guest input reaches the host');
  // Kill a non-killer guest without ending the round, then use the actual private camera action.
  const dead=await host.evaluate(()=>{const G=__lastCall.state,id=[1,2].find(i=>!G.killerIds.includes(i));G.chars[id].alive=false;return id;});
  const ghost=pages[dead];await ghost.waitForFunction(()=>!__lastCall.view.priv.alive,null,{timeout:10000});
  await ghost.keyboard.press('c');await ghost.waitForFunction(()=>!!__lastCall.view.priv.cameraFeed,null,{timeout:10000});
  await host.waitForFunction(id=>__lastCall.voice().info.remotes.find(r=>r.id===id)?.gain===0,dead,{timeout:10000});
  report.ghost=await sample();for(let id=0;id<3;id++)assert.equal(await pages[id].evaluate(()=>!!__lastCall.view.priv.cameraFeed),id===dead,'ghost feed remains private');
  await ghost.keyboard.press('c');await ghost.waitForFunction(()=>!__lastCall.view.priv.cameraFeed,null,{timeout:10000});
  await b.locator('#menuBtn').click();await b.locator('#quitBtn').click();
  await host.waitForFunction(()=>__lastCall.S.guests.size===1&&__lastCall.voice().info?.remotes.length===1,null,{timeout:15000});
  await a.waitForFunction(()=>__lastCall.voice().info?.remotes.length===1,null,{timeout:15000});
  report.afterGuestLeave=await sample();
  assert.equal(report.afterGuestLeave[2].screen,'menu');assert.equal(report.afterGuestLeave[2].voice.info,null);
  assert.deepEqual(report.afterGuestLeave[0].voice.roster.map(r=>r.id).sort(),[0,1]);
  await host.locator('#menuBtn').click();await host.locator('#quitBtn').click();
  await a.waitForFunction(()=>__lastCall.S.screen==='menu',null,{timeout:15000});
  report.cleanup=await Promise.all(pages.map(page=>page.evaluate(()=>({screen:__lastCall.S.screen,voice:__lastCall.voice().info,room:!!__lastCall.S.room,streams:auditMicStreams.length,tracks:auditMicStreams.flatMap(s=>s.getTracks().map(t=>t.readyState))}))));
  for(const row of report.cleanup){assert.equal(row.screen,'menu');assert.equal(row.voice,null);assert.equal(row.room,false);assert.ok(row.streams>0);assert.ok(row.tracks.every(s=>s==='ended'),'leaving stops each acquired microphone track');}
 }
 report.errors=errors;assert.deepEqual(errors,[]);
 console.log(baseline?'RECORDED: actual three-peer arrival and voice baseline.':'PASS: three actual data/media peers prepare before host Continue; staggered starts, live input, near/far/ghost voice, private ghost cameras and departure/microphone cleanup pass.');
} catch(error) {report.failure=error.stack;throw error;}
finally {report.errors=errors;fs.writeFileSync(out,JSON.stringify(report,null,2));await browser.close();}
