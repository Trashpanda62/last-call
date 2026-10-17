// Real three-browser PeerJS transport: two skee lanes plus a spectator.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding'],ignoreDefaultArgs:['--disable-gpu']});
const pages=[],errors=[],report={at:new Date().toISOString()};const read=p=>p.evaluate(()=>__lastCall.view.pub.arcade);
try{
 for(const name of ['AudioHost','AudioGuest','AudioWatch']){const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:960,height:640}});pages.push(p);p.on('pageerror',e=>errors.push({name,error:e.stack}));await p.addInitScript(()=>localStorage.setItem('lc.settings',JSON.stringify({v:2,gfx:{preset:'low'},voice:{mode:'off'}})));await p.goto(process.env.LC_URL||'https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});await p.evaluate(name=>{__lastCall.noLock();document.querySelector('#nameIn').value=name;},name);}
 const [h,g,w]=pages;await h.locator('#hostBtn').click();await h.waitForFunction(()=>__lastCall.S.code?.length===4,null,{timeout:45000});const code=await h.evaluate(()=>__lastCall.S.code);
 for(const p of[g,w]){await p.locator('#joinToggle').click();await p.locator('#codeIn').fill(code);await p.locator('#joinBtn').click();}await h.waitForFunction(()=>__lastCall.S.guests.size===2,null,{timeout:45000});
 await h.locator('#optPlayers').selectOption('6');await h.locator('#startBtn').click();for(const p of pages){await p.waitForFunction(()=>!document.querySelector('#levelContinue').disabled,null,{timeout:120000});await p.locator('#levelContinue').click();}
 await h.evaluate(()=>{__lastCall.state.pickT=.01;});for(const p of pages)await p.waitForFunction(()=>__lastCall.view?.pub.mode==='play',null,{timeout:20000});

 await h.evaluate(()=>{const G=__lastCall.state;G.target=1e12;for(const c of G.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;c.perk=null;c.x=1300+c.id*50;c.y=500;c.look=c.face=0;c.posVer++;}});
 await g.waitForTimeout(250);await h.keyboard.down('w');await h.waitForTimeout(1000);await h.keyboard.up('w');
 await g.waitForFunction(()=>__lastCall.cues().recent.some(c=>c.kind==='potatoStepCarpet'),null,{timeout:10000});
 report.guest=await g.evaluate(()=>({role:__lastCall.S.role,cues:__lastCall.cues()}));assert.equal(report.guest.role,'guest');assert.ok(report.guest.cues.recent.some(c=>c.kind==='potatoStepCarpet'));assert.equal(Object.values(report.guest.cues.loaded).reduce((a,b)=>a+b,0),16);
 await g.evaluate(()=>{__lastCall.S.paused=true;__lastCall.render();});await g.waitForTimeout(100);assert.equal(await g.evaluate(()=>__lastCall.cues().voices),0);
 await g.evaluate(()=>{__lastCall.S.paused=false;});
 await h.evaluate(()=>{__lastCall.state.t=1e6;__lastCall.state.closed=false;__lastCall.step(.2);});
 await h.waitForFunction(()=>__lastCall.view.pub.over,null,{timeout:10000});await h.locator('#againBtn').click();
 for(const p of pages)await p.waitForFunction(()=>__lastCall.S.screen==='lobby',null,{timeout:10000});
 report.lobby=await Promise.all(pages.map(p=>p.evaluate(()=>({voices:__lastCall.cues().voices,active:__lastCall.cues().active}))));for(const r of report.lobby)assert.equal(r.voices,0);
 await h.locator('#startBtn').click();for(const p of pages){await p.waitForFunction(()=>!document.querySelector('#levelContinue').disabled,null,{timeout:120000});await p.locator('#levelContinue').click();}
 report.restart=await Promise.all(pages.map(p=>p.evaluate(()=>({voices:__lastCall.cues().voices,recent:__lastCall.cues().recent,loaded:__lastCall.cues().loaded}))));for(const r of report.restart){assert.equal(r.voices,0);assert.deepEqual(r.recent,[]);assert.equal(Object.values(r.loaded).reduce((a,b)=>a+b,0),16);}
 assert.deepEqual(errors,[]);report.errors=errors;console.log('PASS: actual host footsteps reach guest positional sound graph; pause, lobby and real network restart release voices, reset event history and retain the 16 decoded cues.');
}catch(error){report.failure=error.stack;throw error;}finally{fs.writeFileSync('shots/audio-network.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
