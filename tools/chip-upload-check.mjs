// Compare chip instance bytes to an original fixture and count actual GPU writes.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/3d/machines.js',async route=>{const response=await route.fetch(),source=await response.text();assert.ok(source.includes('const rig = buildRig(RC, seats, felts);'));await route.fulfill({response,body:source.replace('const rig = buildRig(RC, seats, felts);','const rig = buildRig(RC, seats, felts); window.__tableRig = rig;')});});
 await page.goto('https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const {makeSeats}=await import('./src/map.js'),{DICE_RECTS}=await import('./src/3d/rig.js'),seats=makeSeats(),L=__lastCall;
  L.noLock();L.start('killer',{players:6});L.step(.1);L.S.paused=true;L.render();
  const scene=L.scene().scene,camera=L.scene().camera;let renderer,mesh;
  const before=scene.onBeforeRender;scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;scene.traverse(o=>{if(o.name==='player-bet-chips')mesh=o;});
  const rig=__tableRig,gl=renderer.getContext(),sub=gl.bufferSubData,after=mesh.onAfterRender;let writes=[],buffers;const cases=[],bench=[],gpu={checks:0,maxMatrixError:0,maxColorError:0};
  mesh.onAfterRender=function(...args){
   if(!buffers){const program=gl.getParameter(gl.CURRENT_PROGRAM);buffers={};for(const [name,key]of [['instanceMatrix','matrix'],['instanceColor','color']]){const loc=gl.getAttribLocation(program,name);if(loc<0)throw new Error(name+' missing');buffers[key]=gl.getVertexAttrib(loc,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);}}
   return after.apply(this,args);
  };
  gl.bufferSubData=function(...a){const source=a[2],type=source===mesh.instanceMatrix.array?'matrix':source===mesh.instanceColor.array?'color':null;if(type)writes.push({type,bytes:(a.length>4?a[4]:source.length-(a[3]||0))*source.BYTES_PER_ELEMENT});return sub.apply(this,a);};
  const snapshots=[];
  const verifyGPU=()=>{
   if(!mesh.count)return;const bound=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
   try{for(const [key,attribute]of [['matrix',mesh.instanceMatrix],['color',mesh.instanceColor]]){
    gl.bindBuffer(gl.ARRAY_BUFFER,buffers[key]);const data=new Float32Array(mesh.count*attribute.itemSize);gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);
    const field=key==='matrix'?'maxMatrixError':'maxColorError';for(let i=0;i<data.length;i++)gpu[field]=Math.max(gpu[field],Math.abs(data[i]-attribute.array[i]));
   }}finally{gl.bindBuffer(gl.ARRAY_BUFFER,bound);}gpu.checks++;
  };
  const draw=(t,my,verify=true)=>{rig.update(t,1/60,my);renderer.render(scene,camera);if(verify)verifyGPU();};
  const snapshot=(name)=>snapshots.push({name,count:mesh.count,matrix:mesh.instanceMatrix.array.slice().buffer,color:mesh.instanceColor.array.slice().buffer});
  const myFor=(game,reverse=false)=>{
   const options=seats.filter(s=>s.game===game),seat=reverse?options.at(-1):options[0];
   const spots=game==='roulette'?['n0','n1','red']:game==='dice'?DICE_RECTS.filter(c=>c.side===1).slice(0,4).map(c=>c.id):game==='race'?['duck0','duck5']:game==='coin'?['heads','tails']:['main'];
   return {seat:seat.id,game,hist:[],view:null,extra:{},stacks:spots.map((spot,i)=>({spot,amount:[10,250,1000,5500][i%4],slot:i%2,anim:'',u:0,add:0}))};
  };
  try {
   for(const game of ['bj','roulette','dice','slots','plinko','mines','tower','crash','race','coin','wheel']){
    for(const reverse of [false,true]){
     const my=myFor(game,reverse),prefix=game+(reverse?'-last':'-first');
     draw(10,my);snapshot(prefix+'-settled');draw(11,my);snapshot(prefix+'-repeat');
     my.stacks[0].amount=9999900;draw(12,my);snapshot(prefix+'-changed');
     for(const anim of ['sweep','collect','drop'])for(const u of [0,.25,.6,.9,1]){my.stacks[0].anim=anim;my.stacks[0].u=u;draw(20+u,my);snapshot(prefix+'-'+anim+'-'+u);}
     my.stacks[0].anim='';my.stacks[0].u=0;my.stacks[0].add=30;
     for(const t of [30,30.05,30.19,30.2,30.3]){draw(t,my);snapshot(prefix+'-fresh-'+t);}
     my.stacks=[];draw(31,my);snapshot(prefix+'-empty');draw(32,null);draw(33,my);snapshot(prefix+'-return');
    }
   }
   // More than one state may arrive before a render. Color changes in a tail
   // must survive a smaller intervening stack and a later expansion.
   const pending=myFor('roulette');pending.stacks.forEach((s,i)=>s.amount=[1000,250,10][i]);
   rig.update(50,1/60,pending);rig.update(50.1,1/60,{...pending,stacks:pending.stacks.slice(0,1)});renderer.render(scene,camera);verifyGPU();draw(50.2,pending);
   for(const [name,game,animate]of [['settled','roulette',false],['single-drop','bj',true],['settled-return','wheel',false]]){
    const my=myFor(game);draw(100,my);writes=[];const version=mesh.instanceMatrix.version,colorVersion=mesh.instanceColor.version,began=performance.now();
    for(let i=0;i<30;i++){if(animate){my.stacks[0].anim='drop';my.stacks[0].u=i/30;}draw(101+i/60,my,false);}
    bench.push({name,frames:30,chipCount:mesh.count,matrixVersions:mesh.instanceMatrix.version-version,colorVersions:mesh.instanceColor.version-colorVersion,writes:writes.length,bytes:writes.reduce((n,w)=>n+w.bytes,0),ms:performance.now()-began});
   }
  }finally{gl.bufferSubData=sub;mesh.onAfterRender=after;}
  const hash=async buffer=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
  for(const row of snapshots)cases.push({name:row.name,count:row.count,matrix:await hash(row.matrix),color:await hash(row.color)});
  return {cases,bench,gpu,gfx:L.gfx()};
 });
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/chip-uploads.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),result,errors},null,2));console.log(JSON.stringify({cases:result.cases.length,bench:result.bench,gpu:result.gpu,errors}));assert.deepEqual(errors,[]);assert.ok(result.gpu.checks>400);assert.equal(result.gpu.maxMatrixError,0);assert.equal(result.gpu.maxColorError,0);
 if(!process.argv.includes('--baseline')){
  const reference=JSON.parse(fs.readFileSync('docs/performance/2026-10-16-chip-uploads-before.json'));assert.deepEqual(result.cases,reference.result.cases,'original chip matrices, colors and counts across all games/animations');
  for(const row of result.bench){if(row.name.startsWith('settled')){assert.equal(row.writes,0,row.name);assert.equal(row.matrixVersions,0);assert.equal(row.colorVersions,0);}else{assert.ok(row.writes>0);assert.ok(row.bytes<30000,'animated upload ranges cover the live chips');}}
 }
 console.log('PASS: chip instance matrices/colors/counts exercised across all games, animations and returns'+(process.argv.includes('--baseline')?' (original bytes recorded).':'; exact original bytes with no settled uploads and bounded animated writes.'));
}finally{await browser.close();}
