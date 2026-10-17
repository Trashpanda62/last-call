// Independent regression for the player's blocked doorway and repeated derby pedestals.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright'),root=process.env.LC_URL||'http://127.0.0.1:8301/';
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const out='shots/layout-review';fs.mkdirSync(out,{recursive:true});const report={at:new Date().toISOString(),variants:[],errors:[]};
try{
 for(const fallback of [false,true]){
  const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}});p.on('pageerror',e=>report.errors.push(e.message));
  await p.goto(root+(fallback?'?noprops':''));await p.waitForFunction(()=>__lastCall?.S.ready,null,{timeout:120000});
  const row=await p.evaluate(async()=>{
   const L=__lastCall,M=await import('./src/map.js'),T=await import('three');L.noLock();L.start('gambler',{players:6});L.step(.1);L.S.paused=true;
   for(const c of L.state.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;if(c.id!==L.S.myId){c.x=1300;c.y=400+c.id*40;}}
   L.place(2500,640);L.look(Math.PI/2,0);L.render();L.render();
   const scene=L.scene().scene,tote=scene.getObjectByName('race-tote-board'),bounds=new T.Box3().setFromObject(tote),door=M.DOOR_GAPS.find(d=>d.y===700&&d.x===2440),objects=[];
   scene.traverseVisible(o=>{if(o.isMesh&&!o.isSprite)objects.push(o);});
   const rays=[];for(const x of [2460,2500,2540])for(const y of [1.1,1.8,2.5]){const eye=new T.Vector3(2500/60,y,650/60),target=new T.Vector3(x/60,y,750/60),ray=new T.Raycaster(eye,target.clone().sub(eye).normalize(),0,eye.distanceTo(target));
    const hits=ray.intersectObjects(objects,false).filter(h=>{const mat=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex||0]:h.object.material;return mat?.visible!==false&&(mat?.opacity??1)>.65&&!(mat?.transmission>.5);});rays.push({x,height:y,blockers:hits.map(h=>h.object.name||h.object.type)});}
   return {raceStations:M.makeSeats().filter(s=>s.game==='race').length,bettingSockets:objects.filter(o=>/^bet-circle-\d+-duck\d+$/.test(o.name)).length,toteX:[bounds.min.x*60,bounds.max.x*60],doorX:[door.x,door.x+door.w],rays,highLimitRooms:M.makeSeats().filter(s=>s.game==='slots'&&s.tier==='high').map(M.roomOf)};
  });
  assert.equal(row.raceStations,1);assert.equal(row.bettingSockets,6);assert.ok(row.toteX[0]>row.doorX[1]+20,'actual tote stays entirely off the doorway');assert.ok(row.rays.every(r=>!r.blockers.length),'all nine doorway rays must remain clear');assert.deepEqual(row.highLimitRooms,['vip','vip','vip','vip']);
  const views=[['doorway',2500,640,Math.PI/2,0],['derby',2600,1120,-Math.PI/2,.08],['table-pit',1290,760,Math.PI/2,-.12],['vip',1940,1540,Math.PI,0]];
  for(const [name,x,y,face,pitch]of views){await p.evaluate(({x,y,face,pitch})=>{const L=__lastCall;L.act('leave');L.place(x,y);L.look(face,pitch);L.render();L.render();},{x,y,face,pitch});await p.screenshot({path:`${out}/${fallback?'fallback':'normal'}-${name}.jpg`,type:'jpeg',quality:90});}
  report.variants.push({fallback,...row});await p.close();
 }
 assert.deepEqual(report.errors,[]);fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('PASS: one six-choice pedestal, actual tote off doorway, nine clear doorway rays, four high-limit seats in VIP, both graphics variants.');
}finally{await browser.close();}
