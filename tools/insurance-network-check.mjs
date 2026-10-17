// Actual shop, policy HUD/keys/controller and accepted-stake transport through three browsers.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding'],ignoreDefaultArgs:['--disable-gpu']});
const pages=[],errors=[],report={at:new Date().toISOString()};const read=p=>p.evaluate(()=>({bank:__lastCall.view.pub.bank,policy:__lastCall.view.priv.insurance,items:__lastCall.view.priv.items}));
try{
 for(const name of ['PolicyHost','PolicyGuest','PolicyWatch']){const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:960,height:640}});pages.push(p);p.on('pageerror',e=>errors.push({name,error:e.stack}));await p.addInitScript(()=>localStorage.setItem('lc.settings',JSON.stringify({v:2,gfx:{preset:'low'},voice:{mode:'off'}})));await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});await p.evaluate(name=>{__lastCall.noLock();document.querySelector('#nameIn').value=name;},name);}
 const [h,g,w]=pages;await h.locator('#hostBtn').click();await h.waitForFunction(()=>__lastCall.S.code?.length===4,null,{timeout:45000});const code=await h.evaluate(()=>__lastCall.S.code);
 for(const p of[g,w]){await p.locator('#joinToggle').click();await p.locator('#codeIn').fill(code);await p.locator('#joinBtn').click();}await h.waitForFunction(()=>__lastCall.S.guests.size===2,null,{timeout:45000});
 await h.locator('#optPlayers').selectOption('6');await h.locator('#startBtn').click();for(const p of pages){await p.waitForFunction(()=>!document.querySelector('#levelContinue').disabled,null,{timeout:120000});await p.locator('#levelContinue').click();}
 await h.evaluate(()=>{__lastCall.state.pickT=.01;});for(const p of pages)await p.waitForFunction(()=>__lastCall.view?.pub.mode==='play',null,{timeout:20000});

 await h.evaluate(async()=>{const L=__lastCall,G=L.state,{SHADY}=await import('./src/map.js');G.target=3000000;
  for(const c of G.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;c.x=1300;c.y=500+c.id*40;c.posVer++;c.cd.blade=999;c.cd.rig=999;}
  const c=G.chars[1];c.won=200000;c.x=SHADY.stand.x;c.y=SHADY.stand.y;c.posVer++;
 });
 await g.waitForFunction(()=>!!__lastCall.view.priv.shop);await g.keyboard.press('u');await g.locator('#shop').waitFor({state:'visible'});
 report.price=await g.evaluate(()=>__lastCall.view.priv.shop.find(i=>i.id==='insurance').price);assert.equal(report.price,120000);
 await g.locator('#shop [data-buy="insurance"]').click();await g.waitForFunction(()=>__lastCall.view.priv.items.includes('insurance'));
 await g.locator('#shop .bc-x').click();await g.locator('#insuranceBtn').waitFor({state:'visible'});assert.equal(await g.evaluate(()=>__lastCall.view.priv.wallet),80000);
 await g.locator('#insuranceBtn').click();await g.waitForFunction(()=>__lastCall.view.priv.insurance?.state==='armed');report.purchased=await Promise.all(pages.map(read));
 assert.equal(report.purchased[2].policy,null);assert.equal(report.purchased[0].bank,380000);
 await h.evaluate(()=>{const L=__lastCall,c=L.state.chars[1],s=L.state.seats.find(s=>s.game==='bj'&&!s.occ);c.x=s.x;c.y=s.y;c.look=c.face=s.face;c.posVer++;});
 await g.waitForFunction(()=>__lastCall.view.priv.seat?.game==='bj');await g.evaluate(()=>{const L=__lastCall;L.look(L.view.priv.seat.face,-.7);L.render();if(L.press('spot:main')!==true)throw Error('actual chip placement failed');const send=L.S.room.send;window.policyMessages=[];L.S.room.send=function(m){if(m.t==='act')policyMessages.push(structuredClone(m));return send.call(this,m);};});
 // Deterministic losing hand: actual table deals 10+7 against 10+10, then the guest clicks the physical red Stand cap.
 await g.evaluate(()=>{const old=Math.random,seq=[.70,.1,.50,.1,.70,.1,.70,.1];Math.random=()=>seq.length?seq.shift():old();try{window.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));window.dispatchEvent(new KeyboardEvent('keyup',{key:' '}));}finally{Math.random=old;}});
 await g.waitForFunction(()=>__lastCall.view.priv.insurance?.state==='round');report.hand=await g.evaluate(()=>__lastCall.table().view);assert.deepEqual(report.hand.hands[0].cards.map(c=>c.rank),['10','7']);
 const stand=await g.evaluate(()=>{__lastCall.render();return __lastCall.parts().find(p=>p.part==='btn:stand');});assert.ok(stand?.on);await g.mouse.click(stand.x,stand.y);await g.waitForFunction(()=>!__lastCall.view.priv.items.includes('insurance'));await w.waitForFunction(()=>__lastCall.view.pub.bank===380100);
 report.settled=await Promise.all(pages.map(read));assert.ok(report.settled.every(r=>r.bank===380100));
 const packet=await g.evaluate(()=>policyMessages.find(m=>m.k==='bank'));assert.ok(packet.arg.tickets.length===1);
 await g.evaluate(m=>{__lastCall.S.room.send(m);__lastCall.S.room.send({...m,arg:{b:m.arg.b,d:m.arg.d}});},packet);await w.evaluate(m=>__lastCall.S.room.send(m),packet);await h.waitForTimeout(350);assert.equal(await h.evaluate(()=>__lastCall.state.bank),380100);
 // Keyboard and standard-controller commands must reach the same host policy action.
 await h.evaluate(()=>{__lastCall.state.chars[0].items.add('insurance');__lastCall.state.chars[1].items.add('insurance');});await g.waitForFunction(()=>__lastCall.view.priv.insurance?.state==='owned');
 await h.keyboard.press('i');await h.waitForFunction(()=>__lastCall.view.priv.insurance?.state==='armed');
 await g.evaluate(()=>{window.testPad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[testPad]});testPad.buttons[11]={pressed:true,value:1};});
 await g.waitForFunction(()=>__lastCall.view.priv.insurance?.state==='armed');await g.evaluate(()=>{testPad.buttons[11]={pressed:false,value:0};});
 await g.setViewportSize({width:740,height:420});await g.waitForTimeout(200);const hud=await g.locator('#insuranceBtn').boundingBox();assert.ok(hud.x>=0&&hud.y>=0&&hud.x+hud.width<=740&&hud.y+hud.height<=420);assert.equal(await g.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 fs.mkdirSync('shots/insurance',{recursive:true});await g.screenshot({path:'shots/insurance/compact.png'});
 assert.equal(await g.locator('#bjActions:not(.hidden) button').count(),0);assert.equal(await g.locator('#chipStatus').textContent(),'');
 report.controls={mouse:'real purchase, policy shield and physical Stand cap',keyboard:'I arms host policy',controller:'standard right-stick click arms guest policy at a table',compact:hud,physicalController:'untested'};report.errors=errors;
 assert.deepEqual(errors,[]);fs.writeFileSync('shots/insurance/report.json',JSON.stringify(report,null,2)+'\n');console.log('PASS: real guest shop purchase, pointer/keyboard/controller activation, physical Stand, 17 versus 20 loss/refund, all three banks agree, replay/foreign packet rejected and compact HUD contained.');
}finally{await browser.close();}
