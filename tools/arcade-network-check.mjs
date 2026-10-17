// Real three-browser PeerJS transport: two skee lanes plus a spectator.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding'],ignoreDefaultArgs:['--disable-gpu']});
const pages=[],errors=[],report={at:new Date().toISOString()};const read=p=>p.evaluate(()=>__lastCall.view.pub.arcade);
try{
 for(const name of ['LaneHost','LaneGuest','LaneWatch']){const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:960,height:640}});pages.push(p);p.on('pageerror',e=>errors.push({name,error:e.stack}));await p.addInitScript(()=>localStorage.setItem('lc.settings',JSON.stringify({v:2,gfx:{preset:'low'},voice:{mode:'off'}})));await p.goto(process.env.LC_URL||'https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});await p.evaluate(name=>{__lastCall.noLock();document.querySelector('#nameIn').value=name;},name);}
 const [h,g,w]=pages;await h.locator('#hostBtn').click();await h.waitForFunction(()=>__lastCall.S.code?.length===4,null,{timeout:45000});const code=await h.evaluate(()=>__lastCall.S.code);
 for(const p of[g,w]){await p.locator('#joinToggle').click();await p.locator('#codeIn').fill(code);await p.locator('#joinBtn').click();}await h.waitForFunction(()=>__lastCall.S.guests.size===2,null,{timeout:45000});
 await h.locator('#optPlayers').selectOption('6');await h.locator('#startBtn').click();for(const p of pages){await p.waitForFunction(()=>!document.querySelector('#levelContinue').disabled,null,{timeout:120000});await p.locator('#levelContinue').click();}
 await h.evaluate(()=>{__lastCall.state.pickT=.01;});for(const p of pages)await p.waitForFunction(()=>__lastCall.view?.pub.mode==='play',null,{timeout:20000});
 await h.evaluate(()=>{const G=__lastCall.state;G.target=1e12;for(const c of G.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;c.x=1300;c.y=500+c.id*40;c.posVer++;}for(const id of[0,1]){const s=G.seats.find(s=>s.game===(id===0?'pusher':'claw')),c=G.chars[id];c.x=s.x;c.y=s.y;c.look=c.face=s.face;c.posVer++;}});

 const games=['pusher','claw'];
 for(const [i,p]of[h,g].entries())await p.waitForFunction(game=>__lastCall.view.priv.seat?.game===game,games[i],{timeout:15000});
 for(const p of[h,g])await p.evaluate(()=>{const L=__lastCall;L.render();if(!L.press('spot:main')||!L.press('btn:start'))throw Error('physical start failed');});
 await w.waitForFunction(()=>Object.values(__lastCall.view.pub.arcade).every(r=>r?.phase==='aim'));
 report.started=await Promise.all(pages.map(read));const original=report.started[2];
 await w.evaluate(r=>{for(const v of Object.values(r))__lastCall.act('arcade',{kind:'drop',round:v.id,sequence:1});__lastCall.act('bank',{d:999999,b:100});},original);
 await h.waitForTimeout(250);for(const r of Object.values(await read(h)))assert.equal(r.used,0);
 for(let n=1;n<=5;n++){
  for(const [i,p]of[h,g].entries())if(n<=(i===0?5:3)){
   const game=games[i];await p.waitForFunction(game=>__lastCall.view.pub.arcade[game].phase==='aim',game);
   await p.evaluate(game=>{const r=__lastCall.view.pub.arcade[game],a={kind:'drop',round:r.id,sequence:r.seq+1};__lastCall.act('arcade',a);__lastCall.act('arcade',a);},game);
  }
  await h.waitForFunction(n=>__lastCall.state.arcade.pusher.used===n&&(n>3||__lastCall.state.arcade.claw.used===n),n);
  await h.evaluate(()=>{for(let i=0;i<540;i++)__lastCall.step(1/120);});
  for(const p of[g,w])await p.waitForFunction(n=>__lastCall.view.pub.arcade.pusher.used===n&&['aim','done'].includes(__lastCall.view.pub.arcade.pusher.phase)&&['aim','done'].includes(__lastCall.view.pub.arcade.claw.phase),n);
 }
 report.finished=await Promise.all(pages.map(read));assert.deepEqual(report.finished[0],report.finished[1]);assert.deepEqual(report.finished[0],report.finished[2]);
 for(const r of Object.values(report.finished[0])){assert.equal(r.phase,'done');assert.ok(r.assist?r.mult>1:r.mult>=0);assert.ok(!('policy' in r));}
 const bank=await h.evaluate(()=>__lastCall.state.bank);
 await g.evaluate(r=>__lastCall.act('arcade',{kind:'start',after:r.claw.id-1,bet:100}),original);await h.waitForTimeout(200);assert.equal(await h.evaluate(()=>__lastCall.state.bank),bank);
 await g.evaluate(()=>{const r=__lastCall.view.pub.arcade.claw;__lastCall.act('arcade',{kind:'start',after:r.id,bet:100});});
 await h.waitForFunction(()=>__lastCall.state.arcade.claw.phase==='aim');await g.close();await h.waitForFunction(()=>!__lastCall.state.chars[1].isHuman,null,{timeout:15000});
 await h.evaluate(()=>{for(let i=0;i<1800;i++)__lastCall.step(1/120);});assert.equal((await read(h)).claw.phase,'done');
 report.disconnect={bot:true,round:(await read(h)).claw};assert.deepEqual(errors,[]);report.errors=errors;
 fs.writeFileSync('shots/arcade-network.json',JSON.stringify(report,null,2)+'\n');console.log('PASS: two game owners and spectator match across real PeerJS; duplicate/foreign/stale actions rejected; disconnected owner completes as bot.');
}catch(error){report.failure=error.stack;fs.writeFileSync('shots/arcade-network.json',JSON.stringify(report,null,2)+'\n');throw error;}finally{await browser.close();}
