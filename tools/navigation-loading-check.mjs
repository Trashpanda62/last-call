// First real UI arrival must reuse an exact, already-prepared navigation graph.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const report={at:new Date().toISOString()},errors=[];
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.navFrame=0;const tick=()=>{navFrame++;requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 await page.route(/\/src\/map\.js(?:\?.*)?$/,async route=>{
  const response=await route.fetch(),source=await response.text();await route.fulfill({response,body:source+`
const navProbe={starts:0,steps:[],coldRoutes:0};
const navOriginalBuild=buildCorners;buildCorners=function(){navProbe.starts++;const steps=navOriginalBuild();return{next(){const at=performance.now(),result=steps.next();navProbe.steps.push({at,ms:performance.now()-at,frame:navFrame,done:result.done,row:result.done?null:result.value});return result;}};};
const navOriginalCorners=corners;corners=function(){if(!CORNERS)navProbe.coldRoutes++;return navOriginalCorners();};
window.navSnapshot=()=>({...navProbe,ready:!!CORNERS,graph:CORNERS});
// Original synchronous algorithm, independent of the shared staged iterator.
window.navReference=()=>{
 const pts=[];const roomy=p=>![...IN_ROOM,...WALLS].some(o=>inside(p,inflate(o,CFG.radius+1)));
 for(const o of IN_ROOM)for(const[sx,sy]of[[0,0],[1,0],[1,1],[0,1]]){
  const p=[10,3].map(m=>{const q=inflate(o,CFG.radius+m);return{x:q.x+sx*q.w,y:q.y+sy*q.h};}).find(roomy);if(p)pts.push(p);
 }
 const adj=pts.map(()=>[]);
 for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
  if(!free(pts[i],pts[j]))continue;const d=dist(pts[i],pts[j]);adj[i].push([j,d]);adj[j].push([i,d]);
 }
 return{pts,adj};
};
`});
 });
 await page.goto(process.env.LC_URL||'https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const menu=await page.evaluate(()=>navSnapshot());
 assert.equal(menu.ready,true);assert.equal(menu.starts,1);assert.equal(menu.coldRoutes,0);
 const grouped=new Map();for(const s of menu.steps)grouped.set(s.frame,(grouped.get(s.frame)||0)+s.ms);
 assert.ok(grouped.size>1,'graph construction must yield across loading frames');assert.equal(menu.steps.filter(s=>!s.done).length,menu.graph.pts.length);
 const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
 report.menu={...menu,graph:undefined,points:menu.graph.pts.length,links:menu.graph.adj.reduce((n,a)=>n+a.length,0),graphHash:hash(menu.graph),frameWork:[...grouped].map(([frame,ms])=>({frame,ms}))};
 await page.evaluate(()=>__lastCall.noLock());await page.locator('#soloBtn').click();await page.locator('#optPlayers').selectOption('32');await page.locator('#optRole').selectOption('killer');await page.locator('#startBtn').click();
 await page.waitForFunction(()=>!document.querySelector('#levelContinue').disabled,null,{timeout:90000});
 report.briefing=await page.evaluate(()=>({ready:navSnapshot().ready,starts:navSnapshot().starts,coldRoutes:navSnapshot().coldRoutes}));
 await page.locator('#levelContinue').click();await page.locator('#pkList [data-perk]').first().click();
 await page.waitForFunction(()=>__lastCall.view?.pub.mode==='play');await page.waitForTimeout(1500);
 const play=await page.evaluate(()=>{__lastCall.S.paused=true;return navSnapshot();});
 assert.equal(play.starts,1);assert.equal(play.coldRoutes,0,'first gameplay path must not build navigation');assert.deepEqual(play.graph,menu.graph);
 const reference=await page.evaluate(()=>navReference());assert.deepEqual(menu.graph,reference,'every ordered point, edge and distance matches the original algorithm');
 report.play={ready:play.ready,starts:play.starts,coldRoutes:play.coldRoutes,graphHash:hash(play.graph),referenceHash:hash(reference)};
 report.overlap=await page.evaluate(async()=>{
  const M=await import('./src/map.js?navigation-overlap-check');
  const first=M.prepareNavigation(),second=M.prepareNavigation();first.next();second.next();
  const initial=navSnapshot(),pending={ready:initial.ready,starts:initial.starts,steps:initial.steps.length},r=M.OBSTACLES.find(r=>r.kind==='roulette');
  const path=M.route({x:r.x-80,y:r.y+r.h/2},{x:r.x+r.w+80,y:r.y+r.h/2});
  const a=first.next(),b=second.next(),repeat=M.prepareNavigation().next(),done=navSnapshot();
  return{pending,done:{ready:done.ready,starts:done.starts,steps:done.steps.length,coldRoutes:done.coldRoutes},path,firstDone:a.done,secondDone:b.done,repeatDone:repeat.done,same:a.value===b.value&&a.value===repeat.value,graph:done.graph};
 });
 assert.equal(report.overlap.pending.ready,false);assert.equal(report.overlap.pending.starts,1);assert.equal(report.overlap.pending.steps,2);
 assert.equal(report.overlap.done.ready,true);assert.equal(report.overlap.done.starts,1);assert.equal(report.overlap.done.coldRoutes,1);
 for(const k of ['firstDone','secondDone','repeatDone','same'])assert.equal(report.overlap[k],true,k);
 assert.deepEqual(report.overlap.graph,reference);report.overlap.graphHash=hash(report.overlap.graph);delete report.overlap.graph;
 assert.deepEqual(errors,[]);
 console.log('PASS: exact navigation graph prepares once across loading frames before menu; first actual 32-player arrival never builds it, and overlapping preparation/synchronous fallback share one result.',JSON.stringify({points:report.menu.points,links:report.menu.links,frames:grouped.size,maximumNavigationWorkMs:Math.max(...grouped.values()),coldGameplayBuilds:play.coldRoutes}));
}catch(error){report.failure=error.stack;throw error;}
finally{report.errors=errors;const out=process.argv.find(a=>a.endsWith('.json'))||'shots/navigation-loading.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));await browser.close();}
