// Same-build pixels and alternating CPU samples with only fixed-scenery culling bypassed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const out = process.argv.find(a=>a.endsWith('.json')) || 'shots/offscreen-scenery-check.json';
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/3d/render3d.js',async route=>{
  const response=await route.fetch();let source=await response.text();const needle='function cullOffscreenScenery(cam) {';assert.ok(source.includes(needle));
  source=source.replace(needle,needle+'\n  if(window.__sceneryEnabled===false)return [];')+'\nwindow.__offActorR=()=>R;';
  await route.fulfill({response,body:source});
 });
 await page.goto(process.env.LC_URL||'https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  const L=__lastCall;let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;
  const clock=performance.now,now=clock.call(performance);performance.now=()=>now;
  const view=document.querySelector('#view'),cv=document.createElement('canvas');cv.width=view.width;cv.height=view.height;const ctx=cv.getContext('2d',{willReadFrequently:true});
  const read=()=>{ctx.drawImage(view,0,0);return ctx.getImageData(0,0,cv.width,cv.height).data;};
  const diff=(a,b)=>{let changed=0,sum=0,max=0;for(let i=0;i<a.length;i+=4){const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));if(d)changed++;sum+=d;max=Math.max(max,d);}return{changed,mean:sum/(a.length/4),max};};
  const rows=[],failures=[],timings=[];
  const sample=(name,x,y,look,pitch=0)=>{
   L.place(x,y);L.look(look,pitch);window.__sceneryEnabled=false;L.render();L.render();const a=read(),before=L.gfx();const R=__offActorR(),visible=[...R.beans].filter(([id,b])=>b.root.visible).map(([id])=>id);
   window.__sceneryEnabled=true;L.render();const after=L.gfx(),b=read(),work={hidden:R.sceneryCull?.hidden.length||0},hidden=visible.filter(id=>!R.beans.get(id).root.visible);const delta=diff(a,b),candidateImage=delta.changed?cv.toDataURL():null;
   window.__sceneryEnabled=false;L.render();const baselineRepeat=diff(a,read());
   rows.push({name,before:{calls:before.calls,tris:before.tris,posed:before.actorWork.posed},after:{calls:after.calls,tris:after.tris,posed:after.actorWork.posed},work,hidden,delta,baselineRepeat});
   if(delta.changed)failures.push({name,candidate:candidateImage,baseline:cv.toDataURL()});
  };
  try {
   for(const [name,x,y,look]of [['floor',1300,600,Math.PI/2],['north',1110,303,Math.PI/2],['bar',350,400,-Math.PI/2],['rest',330,1000,Math.PI],['arcade',2530,430,-Math.PI/2],['race',2180,960,Math.PI],['slots',1300,1480,Math.PI/2],['vip',2500,1500,Math.PI/2]])sample(name,x,y,look,-.05);
   for(let i=0;i<24;i++)sample('floor-turn-'+i,1300,600,i*Math.PI/12,(i%3-1)*.45);
   const {setPreset}=await import('./src/settings.js');
   for(const preset of ['low','ultra']){setPreset(preset);L.render();for(const [name,x,y,look]of [['floor',1300,600,Math.PI/2],['north',1110,303,Math.PI/2],['bar',350,400,-Math.PI/2],['arcade',2530,430,-Math.PI/2]])sample(preset+'-'+name,x,y,look,-.05);}
   setPreset('high');L.render();
   const R=__offActorR(),baseFov=R.baseFov;
   for(const fov of [55,90,110]){R.baseFov=fov;for(let i=0;i<8;i++)sample('fov-'+fov+'-turn-'+i,1300,600,i*Math.PI/4,(i%3-1)*.35);}R.baseFov=baseFov;
   for(const c of L.state.chars.slice(1)){c.seat=null;c.held=null;c.alive=true;c.monster=false;c.isHuman=true;c.name='TARGET WITH A LONG NAME '+c.id;}
   const actor=L.state.chars[1],start=actor.x;
   for(let i=0;i<16;i++){actor.x=950+i*30;actor.y=650;actor.eating=i%3?1.8:0;actor.snack=i%3;actor.lucky=true;L.step(.001);sample('moving-boundary-'+i,1300,600,Math.PI/2,(i%3-1)*.45);}actor.x=start;

   for(const [name,x,y,look]of [['floor',1300,600,Math.PI/2],['north',1110,303,Math.PI/2],['bar',350,400,-Math.PI/2]]){
    L.place(x,y);L.look(look,-.05);const pairs=[];
    for(let i=0;i<17;i++){const pair={};for(const enabled of i%2?[true,false]:[false,true]){window.__sceneryEnabled=enabled;L.render();const t=clock.call(performance);for(let k=0;k<16;k++)L.render();pair[enabled?'candidate':'baseline']=clock.call(performance)-t;}pairs.push(pair);}
    const median=vs=>vs.slice().sort((a,b)=>a-b)[Math.floor(vs.length/2)];timings.push({name,framesPerSample:16,pairs,baselineMedianMs:median(pairs.slice(2).map(p=>p.baseline)),candidateMedianMs:median(pairs.slice(2).map(p=>p.candidate))});
   }
   L.state.backrooms=true;sample('backrooms',1300,600,Math.PI/2,-.05);L.state.backrooms=false;
   L.state.chars[0].alive=false;L.act('cameras');sample('ghost-cctv',1300,600,Math.PI/2,-.05);
  }finally{performance.now=clock;window.__sceneryEnabled=false;}
  return {rows,timings,failures,width:cv.width,height:cv.height};
 });
 fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});for(const f of result.failures){for(const side of ['baseline','candidate'])fs.writeFileSync(out.replace('.json','-'+f.name+'-'+side+'.png'),Buffer.from(f[side].split(',')[1],'base64'));}delete result.failures;
 fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),...result,errors},null,2));console.log(JSON.stringify({views:result.rows.length,changedPixels:result.rows.reduce((n,r)=>n+r.delta.changed,0),timings:result.timings.map(({name,baselineMedianMs,candidateMedianMs})=>({name,baselineMedianMs,candidateMedianMs})),floor:result.rows[0]}));
 assert.deepEqual(errors,[]);for(const row of result.rows){assert.equal(row.baselineRepeat.changed,0,'stable original '+row.name);assert.equal(row.delta.changed,0,'pixel equality '+row.name);}assert.ok(result.rows.some(r=>r.after.calls<r.before.calls));
 console.log('PASS: cached fixed-scenery body and shadow bounds preserve exact pixels and reduce off-view submissions.');
}finally{await browser.close();}
