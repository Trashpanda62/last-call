// Exercise visible/hidden held props against independent world-transform getters.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire}from'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/3d/items.js',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
let attachmentProbeActive=false,attachmentCounts={};window.__attachmentRows=[];
for(const key of ['updateMatrix','updateWorldMatrix','getWorldQuaternion','getWorldScale']){
 const fn=THREE.Object3D.prototype[key];THREE.Object3D.prototype[key]=function(...args){
  if(attachmentProbeActive){let hidden=false;for(let o=this;o;o=o.parent)hidden||=!o.visible;const label=(hidden?'hidden/':'visible/')+key;attachmentCounts[label]=(attachmentCounts[label]||0)+1;}
  return fn.apply(this,args);
 };
}
const attachmentUpdate=Items.prototype.update;Items.prototype.update=function(...args){
 attachmentCounts={};attachmentProbeActive=true;
 try{return attachmentUpdate.apply(this,args);}finally{
  attachmentProbeActive=false;window.__attachmentItems=this;window.__attachmentBeans=args[2];
  window.__attachmentRows.push({counts:attachmentCounts,snacks:this.snacks.size});
 }
};
`});
 });
 await page.goto('https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const THREE=await import('three'),L=__lastCall;L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;
  for(const c of L.state.chars){if(!c.id)continue;c.x=1150+(c.id%8)*35;c.y=760+Math.floor(c.id/8)*40;c.face=c.look=-Math.PI/2;c.seat=null;}
  const validate=()=>{
   let error=0,checked=0;const inv=new THREE.Quaternion(),root=new THREE.Quaternion(),scale=new THREE.Vector3(),expected=new THREE.Vector3();
   const check=(prop,holder,drink)=>{
    if(prop.parent!==holder.rightHand){error=Infinity;return;}
    holder.rightHand.getWorldQuaternion(inv).invert();holder.root.getWorldQuaternion(root);holder.rightHand.getWorldScale(scale);
    const q=inv.clone().multiply(root);for(const axis of ['x','y','z','w'])error=Math.max(error,Math.abs(q[axis]-prop.quaternion[axis]));
    if(drink)expected.set(0,-.08,0).applyQuaternion(inv).divide(scale);else expected.set(0,.035,.02);
    error=Math.max(error,expected.distanceTo(prop.position));checked++;
   };
   for(const [id,food]of __attachmentItems.snacks){const bean=__attachmentBeans.get(id);if(bean?.root.visible)check(food,bean,false);}
   for(const d of L.view.pub.drinks){const bean=__attachmentBeans.get(d.holder),glass=__attachmentItems.drinks.get(d.id);if(bean?.root.visible&&glass?.parent)check(glass,bean,true);}
   return{error,checked};
  };
  const rows=[];
  for(const [name,mode,x,y,look]of [['hidden new snacks','snack',350,400,-Math.PI/2],['crowd snacks','snack',1300,600,Math.PI/2],['hidden snacks','snack',350,400,-Math.PI/2],['crowd drinks','drink',1300,600,Math.PI/2],['hidden drinks','drink',350,400,-Math.PI/2]]){
   L.state.drinks=[];
   for(const c of L.state.chars){c.eatAt=mode==='snack'?L.state.t:-99;c.snack=c.id%3;c.drink=null;if(mode==='drink'&&c.id){const d={id:100+c.id,owner:c.id,holder:c.id,x:c.x,y:c.y,sips:4,glass:'beer',color:'#d0a050',kind:'beer'};L.state.drinks.push(d);c.drink=d;}}
   L.place(x,y);L.look(look);L.render();L.render();rows.push({name,...__attachmentRows.at(-1),...validate()});
  }
  L.state.drinks=[];for(const c of L.state.chars){c.drink=null;c.eatAt=-99;}
  const c=L.state.chars[1];c.eatAt=L.state.t;c.snack=0;L.place(1300,600);L.look(Math.PI/2);L.render();
  const food=__attachmentItems.snacks.get(1),oldParent=food.parent;c.color='#123456';L.render();
  const appearance={sameProp:food===__attachmentItems.snacks.get(1),movedParent:food.parent!==oldParent,...validate()};
  L.place(350,400);L.look(-Math.PI/2);c.color='#654321';c.snack=2;L.render();
  const hiddenReparent=food.parent===__attachmentBeans.get(1).rightHand;
  L.place(1300,600);L.look(Math.PI/2);L.render();
  const returned={kind:__attachmentItems.snacks.get(1).userData.kind,...validate()};
  c.eatAt=-99;L.render();const removed=!__attachmentItems.snacks.has(1);
  return{rows,appearance,hiddenReparent,returned,removed};
 });
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/item-attachment-check.json';fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),...result,errors},null,2));
 assert.deepEqual(errors,[]);
 for(const row of result.rows){assert.ok(row.error<1e-8,row.name+': independent hand/item transforms');assert.equal(row.counts['hidden/updateMatrix']||0,0,row.name+': no hidden ancestor updates');}
 for(const row of result.rows.filter(r=>r.name.startsWith('crowd'))){assert.equal(row.checked,31,'exercise the entire visible crowd');assert.equal(row.counts['visible/getWorldQuaternion']||0,0);assert.equal(row.counts['visible/getWorldScale']||0,0);assert.ok(row.counts['visible/updateMatrix']<400);}
 assert.equal(result.rows[0].snacks,0,'do not allocate props for hidden eaters');
 assert.ok(result.appearance.sameProp&&result.appearance.movedParent&&result.appearance.error<1e-8,'appearance changes retain and reattach the snack');
 assert.ok(result.hiddenReparent,'hidden appearance changes release the old character hierarchy');
 assert.equal(result.returned.kind,2);assert.ok(result.returned.error<1e-8,'first visible frame restores the correct snack and pose');assert.ok(result.removed,'finished eating removes the held prop');
 console.log('PASS: 31 visible snack/drink attachments match independent transforms; hidden eaters do no matrix work; snack ownership survives visible/hidden appearance changes and first room return.',JSON.stringify(result.rows));
}finally{await browser.close();}
