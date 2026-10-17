import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright'),before=process.argv.includes('--before'),out=before?'shots/vip-before':'shots/vip-clearance',root=process.env.LC_URL||'http://127.0.0.1:8301/';
fs.mkdirSync(out,{recursive:true});const report={at:new Date().toISOString(),before,variants:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{for(const fallback of before?[false]:[false,true]){
 const page=await browser.newPage({viewport:{width:1440,height:900},ignoreHTTPSErrors:true});page.on('pageerror',e=>report.errors.push(e.message));await page.goto(root+(fallback?'?noprops':''));await page.waitForFunction(()=>__lastCall?.S.ready,null,{timeout:120000});
 await page.evaluate(()=>{const L=__lastCall;L.noLock();L.start('gambler',{players:6});L.step(.1);L.S.paused=true;for(const c of L.state.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;if(c.id!==L.S.myId){c.x=1300;c.y=400+c.id*40;}}});
 const row=await page.evaluate(async()=>{
  const L=__lastCall,M=await import('./src/map.js'),T=await import('three'),scene=L.scene().scene;
  const views=[['shop',M.SHADY.stand.x-60,M.SHADY.stand.y,0,.03],['east-corner',2650,1450,.45,-.03],['wheel',2200,1610,Math.PI/2,-.05],['high-limit',1880,1570,Math.PI,0],['entrance',1740,1250,.27,-.04],['lounge',2250,1460,0,-.04]];
  const bounds={};scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isMesh&&o.userData.room==='vip'&&o.userData.propName){const n=o.userData.propName,b=new T.Box3().setFromObject(o);if(!bounds[n])bounds[n]=b;else bounds[n].union(b);}});
  const boxes=Object.fromEntries(Object.entries(bounds).map(([n,b])=>[n,{min:b.min.toArray(),max:b.max.toArray()}]));
  const P=await import('./src/3d/props.js'),info=P.propInfo('palm'),canopyRadius=info?Math.ceil(Math.hypot(info.size[0],info.size[2])*(1.94/info.size[1])/2*60):null;
  return {views,canopyRadius,shop:M.SHADY,stock:M.OBSTACLES.find(o=>o.kind==='crates'),piano:M.OBSTACLES.find(o=>o.kind==='piano'),plants:M.PLANTS.filter(([x,y])=>M.roomOf({x,y})==='vip'),boxes};
 });
 for(const [name,x,y,face,pitch]of row.views){await page.evaluate(({x,y,face,pitch})=>{const L=__lastCall;L.act('leave');L.place(x,y);L.look(face,pitch);L.render();L.render();},{x,y,face,pitch});await page.screenshot({path:`${out}/${fallback?'fallback':'normal'}-${name}.jpg`,type:'jpeg',quality:90});}
 if(!before){
  assert.equal(row.plants.length,0,'VIP foliage must not crowd the wheel, slots or entrances');assert.equal(row.boxes.palm,undefined,'no imported VIP palm remains');
  const b=row.boxes.piano?{x:row.boxes.piano.min[0]*60,y:row.boxes.piano.min[2]*60,w:(row.boxes.piano.max[0]-row.boxes.piano.min[0])*60,h:(row.boxes.piano.max[2]-row.boxes.piano.min[2])*60}:row.piano;
  const c=row.stock;row.stockPianoGap=Math.hypot(Math.max(b.x-c.x-c.w,c.x-b.x-b.w,0),Math.max(b.y-c.y-c.h,c.y-b.y-b.h,0));assert.ok(row.stockPianoGap>=30,'stock must stay at least half a metre from the actual piano bounds');
  row.shopAccess=await page.evaluate(async()=>{const L=__lastCall,M=await import('./src/map.js');L.place(M.SHADY.stand.x,M.SHADY.stand.y);L.look(0,0);L.step(.01);L.render();return {standable:M.standable(M.SHADY.stand),distance:Math.hypot(M.SHADY.x-M.SHADY.stand.x,M.SHADY.y-M.SHADY.stand.y),insurance:L.view.priv.shop?.some(i=>i.id==='insurance')===true};});
  assert.ok(row.shopAccess.standable);assert.ok(row.shopAccess.insurance,'shop inventory must be available from its real approach');
  await page.evaluate(()=>{__lastCall.S.paused=false;});await page.keyboard.press('u');await page.locator('#shop').waitFor({state:'visible',timeout:3000});await page.locator('#shop .bc-x').click();row.shopAccess.openedWithUse=true;
 }
 report.variants.push({fallback,...row});await page.close();
}assert.deepEqual(report.errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log('PASS: twelve VIP first-person views, no VIP palms, stock separated from actual piano bounds, reachable shop inventory and real use input in both graphics modes.');}catch(error){report.errors.push(String(error.stack||error));fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');throw error;}finally{await browser.close();}
