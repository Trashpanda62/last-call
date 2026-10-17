// Real canvas input for blackjack's physical controls, shortcuts and prepared GPU resources.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const out='shots/blackjack-buttons';fs.mkdirSync(out,{recursive:true});const report={at:new Date().toISOString(),rows:[],errors:[]};
try{
 for(const fallback of[false,true]){
  const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}});p.on('pageerror',e=>report.errors.push(e.stack||e.message));
  await p.route('**/src/tables.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nexport const __feedback = () => tb;\n'});});
  await p.goto('https://10.42.0.37:3161/'+(fallback?'?noprops':''));await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  await p.evaluate(async()=>{
   const T=await import('./src/tables.js'),Gm=await import('./src/games.js'),L=__lastCall;L.noLock();L.start('gambler',{players:6});L.step(.1);L.state.target=1e12;
   for(const c of L.state.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;c.x=1320;c.y=550+c.id*40;}
   const s=L.state.seats.filter(s=>s.game==='bj')[2];s.occ=s.claim=null;L.place(s.x,s.y);L.look(s.face,-.7);L.S.disp={};L.render();
   let renderer;const scene=L.scene().scene,before=scene.onBeforeRender;scene.onBeforeRender=function(r,...args){renderer=r;return before.call(this,r,...args);};L.render();scene.onBeforeRender=before;
   const gl=renderer.getContext(),link=gl.linkProgram,buffer=gl.bufferData;window.buttonGpu={links:0,staticBuffers:0};
   gl.linkProgram=function(...a){buttonGpu.links++;return link.apply(this,a);};gl.bufferData=function(...a){if(a[2]===gl.STATIC_DRAW)buttonGpu.staticBuffers++;return buffer.apply(this,a);};
   window.setupButtonHand=(pair=false)=>{const t=T.__feedback();t.bet=1000;t.bets={main:1000};t.res={text:'',cls:''};t.fx=null;t.flash=null;t.s=Gm.bjDeal(1000,()=>.2);t.s.hands[0].cards=(pair?[8,8]:[4,3]).map(rank=>({rank:String(rank),suit:'♥'}));t.s.dealer=[{rank:'10',suit:'♣'},{rank:'8',suit:'♣'}];let n=0;t.s.r=()=>n++%2===0?8/13+.001:.25;t.g.sync();L.S.paused=false;L.look(s.face,-.7);L.S.disp={};L.render();return L.parts();};
   window.buttonState=()=>{const t=T.__feedback();return{over:t.s.over,total:__lastCall.table().view.hands[0].total,hands:t.s.hands.length,staked:t.s.staked,on:__lastCall.table().on,actions:t.s.actions,screen:__lastCall.S.screen,paused:__lastCall.S.paused};};
  });
  const input=[];
  // Actual mouse release on a world-space cap, with no DOM action button.
  for(const id of['hit','stand','double','split']){
   await p.evaluate(pair=>setupButtonHand(pair),id==='split');
   const point=await p.evaluate(id=>__lastCall.parts().find(p=>p.part==='btn:'+id),id);assert.ok(point?.on);
   await p.mouse.click(point.x,point.y);const state=await p.evaluate(()=>buttonState());
   if(id==='hit'){assert.equal(state.total,16);assert.equal(state.over,false);}
   if(id==='stand')assert.equal(state.over,true);
   if(id==='double'){assert.equal(state.over,true);assert.equal(state.staked,2);}
   if(id==='split')assert.equal(state.hands,2);
   input.push({kind:'mouse',id,point:[point.x,point.y],state});
  }
  for(const[key,id]of[['h','hit'],['j','stand'],['k','double']]){
   await p.evaluate(()=>setupButtonHand());await p.keyboard.press(key);const state=await p.evaluate(()=>buttonState());
   assert.equal(state.over,id!=='hit');if(id==='hit')assert.equal(state.total,16);if(id==='double')assert.equal(state.staked,2);input.push({kind:'keyboard',id,key,state});
  }
  // Standard controller face buttons keep the existing action shortcuts.
  await p.evaluate(()=>{window.testPad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[testPad]});});
  for(const[index,id]of[[2,'hit'],[3,'stand'],[1,'double']]){
   await p.evaluate(()=>setupButtonHand());await p.evaluate(i=>{testPad.buttons[i]={pressed:true,value:1};},index);
   await p.waitForFunction(id=>{const s=buttonState();return s.actions.at(-1)?.action===id&&(id==='hit'?s.total===16:s.over);},id);
   const state=await p.evaluate(()=>buttonState());await p.evaluate(async i=>{testPad.buttons[i]={pressed:false,value:0};await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));},index);
   if(id==='double')assert.equal(state.staked,2,JSON.stringify({fallback,state,input}));input.push({kind:'standard-controller',id,index,state});
  }
  // Right trigger also presses whichever physical key the crosshair aims at.
  await p.evaluate(async()=>{await setupButtonHand();if(!__lastCall.aimAt('btn:stand'))throw Error('Cannot aim at physical Stand');testPad.buttons[7]={pressed:true,value:1};});
  await p.waitForFunction(()=>buttonState().over);await p.evaluate(()=>{testPad.buttons[7]={pressed:false,value:0};});input.push({kind:'controller-trigger',id:'stand',state:await p.evaluate(()=>buttonState())});
  await p.evaluate(()=>setupButtonHand());await p.waitForTimeout(900);await p.screenshot({path:`${out}/${fallback?'fallback':'normal'}-desktop.png`});
  await p.setViewportSize({width:740,height:420});await p.evaluate(()=>setupButtonHand());await p.waitForTimeout(900);
  const compact=await p.evaluate(()=>({parts:__lastCall.parts(),overflow:document.documentElement.scrollWidth>innerWidth,panel:!!document.querySelector('#bjActions'),actions:[...document.querySelectorAll('#gameControls button')].map(b=>b.dataset.play),aim:document.querySelector('#aim').textContent}));
  assert.ok(!compact.overflow&&!compact.panel);assert.equal(compact.aim,'');assert.ok(!compact.actions.some(a=>['btn:hit','btn:stand','btn:double','btn:split'].includes(a)));
  await p.screenshot({path:`${out}/${fallback?'fallback':'normal'}-compact.png`});
  const stand=compact.parts.find(p=>p.part==='btn:stand');assert.ok(stand.on);await p.mouse.click(stand.x,stand.y);assert.equal((await p.evaluate(()=>buttonState())).over,true);
  // Other games have neither these physical keys nor their screen controls.
  await p.evaluate(()=>{const L=__lastCall;L.act('leave');L.step(.05);const s=L.state.seats.find(s=>s.game==='roulette'&&!s.occ);L.place(s.x,s.y);L.look(s.face,-.7);L.render();});
  const elsewhere=await p.evaluate(()=>({game:__lastCall.table().game,keys:__lastCall.scene().scene.getObjectByName('blackjack-action-buttons').visible,parts:__lastCall.parts().map(p=>p.part),gpu:buttonGpu}));assert.equal(elsewhere.game,'roulette');assert.equal(elsewhere.keys,false);assert.ok(!elsewhere.parts.some(p=>['btn:hit','btn:stand','btn:double','btn:split'].includes(p)));
  assert.equal(elsewhere.gpu.links,0);assert.equal(elsewhere.gpu.staticBuffers,0);
  report.rows.push({fallback,input,compact,elsewhere,controllerHardware:'simulated standard controller; physical hardware untested'});await p.close();
 }
 assert.deepEqual(report.errors,[]);fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log('PASS: actual physical Hit/Stand/Double/Split mouse clicks, H/J/K keys, standard controller X/Y/B and crosshair/trigger, compact click and no blackjack actions at roulette; zero first-use links/static buffers in both graphics modes.');
}finally{await browser.close();}
