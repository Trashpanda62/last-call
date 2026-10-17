// Verify actual table/input states and prompt layout, including switching devices without reconnecting.
import assert from 'node:assert/strict';import fs from 'node:fs';import{createRequire}from'node:module';
const{chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const out=process.argv[2]||'shots/contextual-controls';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const report={at:new Date().toISOString(),variants:[],errors:[]};
try{
 for(const fallback of[false,true]){
  const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720},hasTouch:true});p.on('pageerror',e=>report.errors.push(e.stack||e.message));
  await p.goto('https://10.42.0.37:3161/'+(fallback?'?noprops':''));await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const rows=[];
  for(const game of['bj','roulette','slots','plinko','mines','tower','coin','wheel','dice','crash','race','skee']){
   const row=await p.evaluate(async game=>{
    const L=__lastCall;L.noLock();L.start('killer',{players:6});for(const c of L.state.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;if(c.id){c.x=1850;c.y=700+c.id*40;}}L.step(.1);L.S.paused=true;
    const s=L.state.seats.find(s=>s.game===game);s.occ=s.claim=null;L.look(s.face,game==='bj'?-.7:-.25);L.place(s.x,s.y);L.step(.02);L.S.paused=false;L.render();
    const read=()=>({game:L.table()?.game,status:document.querySelector('#chipStatus').textContent,actions:[...document.querySelectorAll('#gameControls:not(.hidden) button')].map(b=>({id:b.dataset.play,text:b.textContent,disabled:b.disabled}))});
    const before=read(),part=game==='roulette'?'spot:red':game==='dice'?'spot:pass':game==='coin'?'spot:heads':game==='race'?'spot:duck0':'spot:main';
    if(L.press(part)!==true)throw Error(game+': actual chip failed');L.render();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {game,before,placed:read(),hint:document.querySelector('#hint').textContent,legacy:document.querySelectorAll('#bjActions:not(.hidden) button').length};
   },game);
   if(process.env.DEBUG_ROWS)console.log(JSON.stringify(row));rows.push(row);report.current={fallback,rows};assert.equal(row.before.game,game);assert.ok(row.before.actions.every(a=>!a.text.includes('SPACE')),'primary waits for a stake');
   assert.equal(row.placed.actions.filter(a=>a.text.includes('SPACE')).length,['crash','skee'].includes(game)?1:0,game+(['crash','skee'].includes(game)?': one keyboard primary':': starts from its physical control (tools/physical-starts-check.mjs), no SPACE primary'));assert.equal(row.hint,'');assert.equal(row.legacy,0);
  }
  // Current fixture is skee-ball; a controller A must start and hold/release the same round.
  await p.evaluate(()=>{
   window.testPad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[testPad]});
   __lastCall.S.paused=false;
  });
  const primary=p.locator('#gameControls button').first();
  await p.waitForTimeout(100);assert.match(await primary.textContent(),/SPACE/,'idle connected pad keeps keyboard hints');
  await p.evaluate(()=>{testPad.axes[2]=.1;});await p.waitForTimeout(100);assert.match(await primary.textContent(),/SPACE/,'stick drift stays below modality threshold');
  await p.evaluate(()=>{testPad.axes[2]=.25;});await p.waitForFunction(()=>document.querySelector('#gameControls button')?.textContent.includes('A ·'));
  await p.evaluate(()=>{testPad.axes[2]=0;});await p.keyboard.press('Control');await p.waitForFunction(()=>document.querySelector('#gameControls button')?.textContent.includes('SPACE'));
  await p.evaluate(()=>{testPad.buttons[0]={pressed:true,value:1};});await p.waitForFunction(()=>__lastCall.view?.pub?.skee?.[0]?.phase==='aim');
  await p.evaluate(()=>{testPad.buttons[0]={pressed:false,value:0};});await p.waitForFunction(()=>document.querySelector('#gameControls button')?.textContent.includes('A ·'));
  await p.evaluate(()=>{testPad.buttons[0]={pressed:true,value:1};});await p.waitForTimeout(250);await p.evaluate(()=>{testPad.buttons[0]={pressed:false,value:0};});
  await p.waitForFunction(()=>__lastCall.view?.pub?.skee?.[0]?.launched===1);
  // Wait until the real ball returns before testing the next enabled primary prompt.
  await p.waitForFunction(()=>__lastCall.view?.pub?.skee?.[0]?.phase==='aim',null,{timeout:15000});
  await p.setViewportSize({width:740,height:420});await p.waitForTimeout(150);await p.screenshot({path:`${out}/${fallback?'fallback':'model'}-controller.png`});
  assert.doesNotMatch(await p.locator('#chipHud').textContent(),/SCROLL|CLICK|PRESS SPACE/,'chip summary must not advertise keyboard instructions to controller users');
  const padLabel=await primary.textContent();assert.match(padLabel,/A · Hold to roll/);assert.doesNotMatch(padLabel,/SPACE/);
  await p.mouse.move(12,12);await p.waitForFunction(()=>document.querySelector('#gameControls button')?.textContent.includes('SPACE'));
  await p.evaluate(()=>{testPad.axes[2]=.25;});await p.waitForFunction(()=>document.querySelector('#gameControls button')?.textContent.includes('A ·'));await p.evaluate(()=>{testPad.axes[2]=0;testPad.connected=false;});await p.waitForFunction(()=>document.querySelector('#gameControls button')?.textContent.includes('SPACE'));
  await p.touchscreen.tap(12,12);await p.waitForFunction(()=>document.body.classList.contains('touch')&&!document.querySelector('#gameControls button')?.textContent.match(/SPACE|A ·/));
  const touchLabel=await primary.textContent(),bounds=await primary.boundingBox();assert.match(touchLabel,/Hold to roll/);assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=740&&bounds.y+bounds.height<=420);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.screenshot({path:`${out}/${fallback?'fallback':'model'}-touch.png`});
  await p.keyboard.press('Control');await p.waitForFunction(()=>document.querySelector('#gameControls button')?.textContent.includes('SPACE')); // keyboard use also works after touch without changing the layout
  report.variants.push({fallback,rows,devices:{padLabel,touchLabel,controllerRoll:true,disconnect:true,idleAndDrift:true,keyboardAndMouseReturn:true,compact:bounds,physicalController:'untested'}});await p.close();
 }
 assert.deepEqual(report.errors,[]);console.log('PASS: 12 actual betting games × normal/fallback, one primary after a stake at crash/skee and none at the physically started tables or the duck race (chips on a duck are the bet), idle/drift/device changes, controller A start/hold/release, touch action labels and compact containment.');
}catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
