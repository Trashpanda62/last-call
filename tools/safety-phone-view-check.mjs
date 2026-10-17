import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'],ignoreDefaultArgs:['--disable-gpu']});
const report={at:new Date().toISOString(),variants:[],errors:[]};fs.mkdirSync('shots/safety-phone',{recursive:true});
try {for(const variant of ['normal','noprops']) {
 const p=await browser.newPage({viewport:{width:1440,height:900},ignoreHTTPSErrors:true});p.on('pageerror',e=>report.errors.push(e.stack||e.message));
 await p.goto((process.env.LC_URL||'http://127.0.0.1:8319/')+(variant==='noprops'?'?noprops':''));await p.waitForFunction(()=>__lastCall?.S.ready,null,{timeout:120000});
 await p.evaluate(()=>{const L=__lastCall;L.noLock();L.start('gambler',{players:6});L.step(.1);L.S.paused=false;L.state.target=1e12;for(const c of L.state.chars)c.isHuman=true;L.state.chars[0].won=1234;L.render();});
 assert.match(await p.locator('#personalAmt').textContent(),/1,234/);
 await p.locator('#phoneOpen').click();assert.ok(await p.locator('#meeting').isVisible());assert.match(await p.locator('#phoneStatus').textContent(),/6 alive/);await p.locator('#phoneClose').click();
 const heights=await p.evaluate(async()=>{const L=__lastCall,rows=[];for(const game of ['slots','bj','roulette','flappy','skee','plinko']){L.act('leave');L.step(.01);const s=L.state.seats.find(s=>s.game===game);L.place(s.x,s.y);L.look(s.face,0);L.render();const before=L.scene().camera.position.y;L.act('use');L.step(.01);for(let i=0;i<30;i++){L.render();await new Promise(r=>requestAnimationFrame(r));}rows.push({game,before,after:L.scene().camera.position.y,seat:L.view.priv.seat?.game});}return rows;});
 assert.ok(heights.every(h=>Math.abs(h.after-1.12)<.015),JSON.stringify(heights));
 await p.screenshot({path:`shots/safety-phone/${variant}-machine.jpg`,type:'jpeg',quality:90});
 await p.evaluate(()=>{const L=__lastCall;L.act('leave');L.step(.01);const s=L.state.seats.find(s=>s.game==='slots');L.place(s.x,s.y);L.look(s.face,0);const c=L.state.chars[0],d={id:998,kind:'whiskey',glass:'whiskey',sips:3,poisoned:true,from:null,holder:c.id,owner:c.id,x:c.x,y:c.y,color:'#bd8844'};c.drink=d;L.state.drinks.push(d);L.render();});
 await p.locator('[data-safety=sniff]').click();assert.equal(await p.evaluate(()=>__lastCall.state.chars[0].inspect?.kind),'drink');await p.evaluate(()=>{__lastCall.step(4);__lastCall.render();});await p.locator('[data-safety=pour]').click();assert.equal(await p.evaluate(()=>__lastCall.state.chars[0].drink),null);
 await p.evaluate(()=>{const L=__lastCall,s=L.state.seats.find(s=>s.game==='slots');L.state.traps.push({kind:'seat',id:s.id,by:1,label:'the slot machine',t:L.state.t});L.render();});
 await p.locator('[data-safety=inspect]').click();assert.equal(await p.evaluate(()=>__lastCall.state.chars[0].inspect?.kind),'seat');await p.evaluate(()=>{__lastCall.step(4);__lastCall.render();});assert.equal(await p.evaluate(()=>__lastCall.state.traps.length),0);

 await p.evaluate(()=>{const L=__lastCall,c=L.state.chars[0];c.alive=false;c.cameraFeed='floor';L.step(.01);L.render();});await p.locator('#phoneOpen').click();assert.match(await p.locator('#mTitle').textContent(),/Spectator/);assert.ok(!await p.locator('#chatForm').isVisible());
 const ghostMeeting=await p.evaluate(async()=>{const {renderMeeting}=await import('./src/ui.js'),L=__lastCall;const v={pub:{...L.view.pub,meeting:{title:'Test meeting',reason:'Spectator test',phase:'vote',lines:[],voted:[],tally:{},voteT:12,ejected:null}},priv:L.view.priv};renderMeeting(v,()=>{throw Error('ghost action');},true);return [...document.querySelectorAll('#mVotes button')].every(b=>b.disabled)&&document.getElementById('chatForm').classList.contains('hidden');});assert.ok(ghostMeeting);

 await p.screenshot({path:`shots/safety-phone/${variant}-ghost-phone.jpg`,type:'jpeg',quality:90});await p.locator('#phoneClose').click();
 const breaker=await p.evaluate(async()=>{const L=__lastCall,{BREAKERS}=await import('./src/map.js'),T=await import('three'),b=BREAKERS[4];L.state.chars[0].alive=true;L.state.chars[0].cameraFeed=null;L.place(b.x,b.y);L.look(b.face,0);L.step(.01);L.render();const from=new T.Vector3(b.x/60,1.35,b.y/60),dir=new T.Vector3(Math.cos(b.face),0,Math.sin(b.face));const ray=new T.Raycaster(from,dir,0,27/60);ray.camera=L.scene().camera;const meshes=[];L.scene().scene.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});const hits=ray.intersectObjects(meshes,false).filter(h=>h.object.visible&&!h.object.material?.transparent&&!function(o){for(;o;o=o.parent)if(o.name==='breaker-panel-4')return true;return false;}(h.object));return {position:b,blockers:hits.map(h=>({name:h.object.name,distance:h.distance,parents:[h.object.parent?.name,h.object.parent?.parent?.name,h.object.parent?.parent?.parent?.name]}))};});await p.screenshot({path:`shots/safety-phone/${variant}-vip-diagnostic.jpg`,type:'jpeg',quality:90});assert.equal(breaker.blockers.length,0,JSON.stringify(breaker));
 await p.screenshot({path:`shots/safety-phone/${variant}-vip-breaker.jpg`,type:'jpeg',quality:90});
 await p.setViewportSize({width:740,height:420});
 const hudLayout=await p.evaluate(()=>{const a=document.getElementById('personalBalance').getBoundingClientRect(),b=document.getElementById('topRight').getBoundingClientRect();return a.right<=b.left;});assert.ok(hudLayout,'personal balance clears compact role/menu');
 await p.locator('#phoneOpen').click();assert.ok(await p.locator('#phoneClose').isVisible());await p.screenshot({path:`shots/safety-phone/${variant}-compact.jpg`,type:'jpeg',quality:90});
 report.variants.push({variant,heights,breaker,physicalActions:true,ghostPhone:true});await p.close();
}assert.deepEqual(report.errors,[]);fs.writeFileSync('docs/performance/2026-10-17-safety-phone-views.json',JSON.stringify(report,null,2)+'\n');console.log('PASS safety/phone/height/breaker normal and no-props');}finally{await browser.close();}
