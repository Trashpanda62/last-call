// The Space HUD replaces start buttons and obsolete hidden rigs. Blackjack has dedicated physical hand actions.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const {OBSTACLES}=await import('./src/map.js'),L=__lastCall;L.noLock();L.start('killer',{players:6});for(const c of L.state.chars)c.isHuman=true;L.step(.1);L.S.paused=true;L.render();
  const controls=[];L.scene().scene.traverse(o=>{
   if(!o.isMesh)return;const p=o.geometry?.parameters;
   const dormant=['btn:cash','btn:spin'].includes(o.userData.part),decor=p?.radiusTop===.1&&p.height===.04&&OBSTACLES.some(d=>d.kind==='wheelDesk'&&Math.abs(o.position.x-(d.x+d.w/2)/60)<1e-6&&Math.abs(o.position.z-(d.y+d.h/2)/60)<1e-6&&Math.abs(o.position.y-.78)<1e-6);
   if(dormant||decor){let visible=true;for(let n=o;n;n=n.parent)visible&&=n.visible;controls.push({kind:dormant?'dormant':'decor',visible,geometry:o.geometry.type,vertices:o.geometry.attributes.position.count});}
  });
  const games=[];
  for(const game of ['crash','wheel']){
   if(L.view.priv.seat){L.act('leave');L.step(.1);L.render();}
   const seat=L.state.seats.find(s=>s.game===game&&!s.occ&&!s.claim);L.look(seat.face,-.3);L.place(seat.x-Math.cos(seat.face)*30,seat.y-Math.sin(seat.face)*30);L.step(1.7);L.S.paused=false;L.render();
   const seated=L.table()?.game,placed=L.press('spot:main');L.render();const start=document.querySelector('#gameControls button'),prompt={text:start?.textContent,enabled:start&&!start.disabled};
   window.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));window.dispatchEvent(new KeyboardEvent('keyup',{key:' '}));L.step(.02);L.render();L.S.paused=true;
   games.push({game,seated,placed,prompt,started:game==='wheel'?!!L.table()?.view?.spin:L.view.pub.crash.bets.some(b=>b[0]===L.view.priv.me),parts:L.parts().map(p=>p.part)});
  }
  return {controls,games,gfx:L.gfx()};
 });
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/table-controls.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),result,errors},null,2));console.log(JSON.stringify({...result,errors}));
 assert.deepEqual(errors,[]);for(const game of result.games){assert.equal(game.seated,game.game);assert.equal(game.placed,true);assert.equal(game.prompt.enabled,true);assert.equal(game.started,true);assert.ok(!game.parts.some(p=>['btn:cash','btn:spin'].includes(p)));}
 if(!process.argv.includes('--baseline'))assert.deepEqual(result.controls,[],'physical/dormant table controls must be removed');
 console.log('PASS: rocket and wheel accept chips and start with the Space HUD; no physical action parts'+(process.argv.includes('--baseline')?' (retained legacy objects measured).':' or unused hidden control meshes.'));
}finally{await browser.close();}
