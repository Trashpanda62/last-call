import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const before=process.argv.includes('--before'), out=`shots/casino-aesthetic-${before?'before':'after'}`;
const root=process.env.LC_URL||'http://127.0.0.1:8318/';
fs.mkdirSync(out,{recursive:true});
const report={at:new Date().toISOString(),before,variants:[],errors:[]};
const views=[['pit',1290,760,Math.PI/2,-.12],['main-wall',1800,250,-Math.PI/2,.12],['bar',470,570,-Math.PI/2,0],['arcade',2500,640,-Math.PI/2,-.06],['derby-door',2500,640,Math.PI/2,0],['derby',2600,1120,-Math.PI/2,.08],['slots',650,1410,Math.PI/2,-.05],['vip',2250,1460,0,-.04],['vip-shop',2650,1450,.45,-.03]];
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 for(const variant of before?['normal']:['normal','noprops','nomats']){
  const page=await browser.newPage({viewport:{width:1440,height:900},ignoreHTTPSErrors:true});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(root+(variant==='normal'?'':'?'+variant));
  await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const row=await page.evaluate(async()=>{
   const L=__lastCall,W=await import('./src/3d/world.js'),M=await import('./src/map.js');
   L.noLock();L.start('gambler',{players:6});L.step(.1);L.S.paused=true;
   for(const c of L.state.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;if(c.id!==L.S.myId){c.x=1300;c.y=400+c.id*40;}}
   return {rooms:Object.fromEntries(Object.entries(W.roomMats).map(([k,m])=>[k,{wall:m.wall.map?.image?.src||'canvas',floor:m.floor.map?.image?.src||'canvas',floorRough:m.floor.roughness}])),marble:W.MAT.marble.map?.image?.src||'canvas',seats:M.makeSeats().length,stations:M.makeSeats().filter(s=>s.game==='race').length,shopStandable:M.standable(M.SHADY.stand),vipPlants:M.PLANTS.filter(([x,y])=>M.roomOf({x,y})==='vip').length};
  });
  assert.equal(row.stations,1);assert.equal(row.vipPlants,0);assert.ok(row.shopStandable);
  if(!before&&variant!=='nomats')assert.ok(row.marble.includes('noirMarble'));
  row.views=[];
  for(const [name,x,y,face,pitch]of views){
   const stats=await page.evaluate(({x,y,face,pitch})=>{const L=__lastCall;L.act('leave');L.place(x,y);L.look(face,pitch);L.render();L.render();return L.gfx();},{x,y,face,pitch});
   row.views.push({name,stats});await page.screenshot({path:`${out}/${variant}-${name}.jpg`,type:'jpeg',quality:93});
  }
  report.variants.push({variant,...row});await page.close();
 }
 assert.deepEqual(report.errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
 console.log(`PASS: ${report.variants.length*views.length} actual room views, complete startup, accessible VIP shop and single derby station.`);
}catch(e){report.errors.push(e.stack||String(e));fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');throw e;}finally{await browser.close();}
