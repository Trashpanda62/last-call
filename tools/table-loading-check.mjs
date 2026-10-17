// First table entry must retain depth programs compiled behind the loading screen.
import fs from 'node:fs';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const{chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/3d/render3d.js',async route=>{const response=await route.fetch(),source=await response.text();await route.fulfill({response,body:source+'\nwindow.__tableDepthMaterials=()=>R.depthWarmupMaterials||new Set();window.__assignDepthForProbe=prepareShadowMaterial;\n'});});
 await page.addInitScript(()=>{
  const original=HTMLCanvasElement.prototype.getContext;window.tableProgramEvents=[];let next=0;
  HTMLCanvasElement.prototype.getContext=function(kind,...a){const gl=original.call(this,kind,...a);if(kind==='webgl2'&&gl&&!gl.tableDepthHook){
   gl.tableDepthHook=true;const ids=new WeakMap(),link=gl.linkProgram,remove=gl.deleteProgram;
   gl.linkProgram=function(program){if(!ids.has(program))ids.set(program,++next);tableProgramEvents.push({kind:'link',id:ids.get(program),at:performance.now(),stage:document.querySelector('#bootStatus')?.textContent,flags:gl.getAttachedShaders(program).map(s=>gl.getShaderSource(s).match(/^#define\s+.*$/gm)||[])});return link.call(this,program);};
   gl.deleteProgram=function(program){tableProgramEvents.push({kind:'delete',id:ids.get(program),at:performance.now()});return remove.call(this,program);};
  }return gl;};
 });
 await page.goto('https://10.42.0.37:3161/'+(process.argv.includes('--fallback')?'?noprops':''));await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const data=await page.evaluate(async repeated=>{
  const L=__lastCall;L.noLock();L.start('gambler',{players:32});L.step(.1);L.S.paused=true;L.place(1300,600);L.look(Math.PI/2);L.render();
  const THREE=await import('three'),nativeKey=THREE.Material.prototype.customProgramCacheKey;let depthSelections=0,measuring=false;
  THREE.Material.prototype.customProgramCacheKey=function(){if(measuring&&this.isMeshDepthMaterial)depthSelections++;return nativeKey.call(this);};
  const ready=performance.now(),rows=[];
  for(const game of ['slots','bj','roulette','dice','plinko','mines','tower','crash','race','coin','wheel']){
   if(L.view.priv.seat)L.act('leave');
   const seat=L.state.seats.find(s=>s.game===game);if(!seat)throw Error('Missing game '+game);
   if(seat.occ)seat.occ.seat=null;seat.occ=seat.claim=null;
   const before=tableProgramEvents.length;L.place(seat.x,seat.y);L.look(seat.face,-.35);L.render();
   const active=L.table()?.game,part=L.parts().find(p=>p.part.startsWith('spot:'))?.part;
   const placed=part?L.press(part):false;L.render();L.render();
   const selectionFrames=[];for(let i=0;i<3;i++){depthSelections=0;measuring=true;L.render();measuring=false;selectionFrames.push(depthSelections);}
   rows.push({game,active,part,placed,selectionFrames,events:tableProgramEvents.slice(before),gfx:L.gfx()});
  }
  const warmups=[];
  if(repeated){const D=await import('./src/3d/render3d.js');for(let i=0;i<3;i++){
   const previous=[...__tableDepthMaterials()];let disposed=0;for(const material of previous)material.addEventListener('dispose',()=>disposed++);
   const stages=[];L.S.screen='briefing';await D.warmup({pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'},(_n,text)=>stages.push(text));L.S.screen='game';
   warmups.push({retired:previous.length,disposed,retained:__tableDepthMaterials().size,stages,gfx:L.gfx()});
  }}
  const recompiled=rows.flatMap(r=>r.events.filter(e=>e.kind==='link').map(e=>{const key=JSON.stringify(e.flags),original=tableProgramEvents.find(o=>o.at<ready&&o.kind==='link'&&JSON.stringify(o.flags)===key);return{game:r.game,id:e.id,original:original?.id,deleted:original&&tableProgramEvents.some(d=>d.kind==='delete'&&d.id===original.id&&d.at<ready)};}));
  THREE.Material.prototype.customProgramCacheKey=nativeKey;
  const guards=[],geometry=new THREE.PlaneGeometry(1,1),one=new THREE.MeshStandardMaterial(),texture=new THREE.Texture();
  for(const[name,options,expected]of[['ordinary',{},true],['mixed sides',{side:THREE.DoubleSide},false],['alpha test',{alphaTest:.5},false],['alpha coverage',{alphaToCoverage:true},false],['alpha map',{alphaMap:texture},false],['displacement',{displacementMap:texture},false],['clipping',{clippingPlanes:[new THREE.Plane()]},false]]){
   const second=new THREE.MeshStandardMaterial(options),mesh=new THREE.Mesh(geometry,[one,second]);mesh.castShadow=true;__assignDepthForProbe(mesh);guards.push({name,expected,assigned:!!mesh.customDepthMaterial});second.dispose();
  }
  const second=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,[one,second]);mesh.castShadow=true;__assignDepthForProbe(mesh);const assigned=!!mesh.customDepthMaterial;second.alphaTest=.5;__assignDepthForProbe(mesh);guards.push({name:'became special',expected:false,assigned:!!mesh.customDepthMaterial,initiallyAssigned:assigned});
  const authored=new THREE.MeshDepthMaterial();mesh.customDepthMaterial=authored;__assignDepthForProbe(mesh);guards.push({name:'authored',retained:mesh.customDepthMaterial===authored});geometry.dispose();one.dispose();second.dispose();authored.dispose();texture.dispose();
  return{rows,ready,warmups,recompiled,guards,events:tableProgramEvents,retained:__tableDepthMaterials().size};
 },process.argv.includes('--warmup'));
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/table-loading.json';fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),...data,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(data.rows.length,11);for(const row of data.rows){assert.equal(row.active,row.game);assert.ok(row.part&&row.placed,row.game+': exercise an actual chip placement');if(!process.argv.includes('--baseline')){assert.equal(row.events.filter(e=>e.kind==='link').length,0,row.game+': no late table shaders');assert.deepEqual(row.selectionFrames,[0,0,0],row.game+': no repeated shadow selections');}}
 if(!process.argv.includes('--baseline'))for(const row of data.guards){if('expected'in row)assert.equal(row.assigned,row.expected,row.name);if(row.name==='became special')assert.equal(row.initiallyAssigned,true);if(row.name==='authored')assert.equal(row.retained,true);}
 for(const row of data.warmups){assert.equal(row.disposed,row.retired,'every previous preparation material retires');assert.ok(row.retained>0&&row.retained<40,'retained shadow preparation remains bounded');assert.equal(row.retained,data.warmups[0].retained);assert.ok(!row.stages.includes('Preparing the backrooms'),'unchanged graphics and world reuse Backrooms preparation');}
 console.log(process.argv.includes('--baseline')?'PASS: first table-entry baseline recorded.':'PASS: all 11 first table entries and chip placements reuse retained shaders; repeated shadow selections are zero and specialized arrays retain native handling.',JSON.stringify({games:data.rows.map(r=>({game:r.game,links:r.events.filter(e=>e.kind==='link').length,selections:r.selectionFrames})),recompiled:data.recompiled,warmups:data.warmups.map(({gfx,...r})=>r)}));
}finally{await browser.close();}
