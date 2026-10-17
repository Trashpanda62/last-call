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
 await h.evaluate(()=>{const G=__lastCall.state;G.target=1e12;for(const c of G.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;c.x=1300;c.y=500+c.id*40;c.posVer++;}for(const id of[0,1]){const s=G.seats.find(s=>s.game===(id===0?'pusher':'flappy')),c=G.chars[id];c.x=s.x;c.y=s.y;c.look=c.face=s.face;c.posVer++;}});


 await g.waitForFunction(()=>__lastCall.view.priv.seat?.game==='flappy',null,{timeout:15000});
 await g.evaluate(()=>{const L=__lastCall;L.render();L.press('spot:main');L.press('btn:start');});
 await h.waitForFunction(()=>__lastCall.state.arcade.flappy?.phase==='aim');
 const first=await h.evaluate(()=>__lastCall.state.arcade.flappy.id);
 await g.keyboard.press('Space');await h.waitForFunction(()=>__lastCall.state.arcade.flappy.seq===1);
 await w.evaluate(id=>__lastCall.act('arcade',{kind:'drop',round:id,sequence:2}),first);await h.waitForTimeout(150);assert.equal(await h.evaluate(()=>__lastCall.state.arcade.flappy.seq),1);
 await h.evaluate(()=>{const L=__lastCall,r=L.state.arcade.flappy;L.S.paused=true;for(let i=0;i<1500&&r.phase!=='done';i++){L.step(1/120);}});
 await w.waitForFunction(()=>__lastCall.view.pub.arcade.flappy.phase==='done');
 report.finished=await Promise.all(pages.map(async p=> (await read(p)).flappy));assert.deepEqual(report.finished[0],report.finished[1]);assert.deepEqual(report.finished[0],report.finished[2]);assert.ok(!('policy'in report.finished[0]));
 const bank=await h.evaluate(()=>__lastCall.state.bank);await g.evaluate(id=>{__lastCall.act('arcade',{kind:'drop',round:id,sequence:1});__lastCall.act('arcade',{kind:'start',after:0,bet:1000});},first);await h.waitForTimeout(200);assert.equal(await h.evaluate(()=>__lastCall.state.bank),bank);assert.equal(await h.evaluate(()=>__lastCall.state.arcade.flappy.id),first);
 await h.evaluate(()=>__lastCall.S.paused=false);await g.evaluate(id=>__lastCall.act('arcade',{kind:'start',after:id,bet:1000}),first);await h.waitForFunction(id=>__lastCall.state.arcade.flappy.id!==id,first);await g.close();await h.waitForFunction(()=>!__lastCall.state.chars[1].isHuman,null,{timeout:15000});await h.evaluate(()=>{for(let i=0;i<6000;i++)__lastCall.step(1/120);});assert.equal(await h.evaluate(()=>__lastCall.state.arcade.flappy.phase),'done');assert.equal(await h.evaluate(()=>__lastCall.state.arcade.flappy.paid),true);
 report.disconnect={bot:true,paid:true};report.keyboardFlap=true;report.foreignReplayRejected=true;assert.deepEqual(errors,[]);report.errors=errors;fs.writeFileSync('shots/flappy-network.json',JSON.stringify(report,null,2)+'\n');console.log('PASS: Flappy guest keyboard control, host/guest/spectator snapshots, settlement, replay/foreign rejection and disconnect takeover.');
}catch(error){report.failure=error.stack;fs.writeFileSync('shots/flappy-network.json',JSON.stringify(report,null,2)+'\n');throw error;}finally{await browser.close();}
