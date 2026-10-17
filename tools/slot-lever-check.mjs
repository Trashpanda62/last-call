// Real slot bets/pulls, original geometry bytes, GPU uploads and replacement lifetime.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const baseline=process.argv.includes('--baseline'),rebuilds=process.argv.includes('--rebuilds');
const maskBaseline=baseline||process.argv.includes('--mask-baseline');
const out=process.argv.find(a=>a.endsWith('.json'))||'shots/slot-levers.json';
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const rows=[],errors=[];
 for(const fallback of [false,true]){
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/3d/machines.js',async route=>{
   const response=await route.fetch(),source=await response.text(),needle='const slotModels = {};';assert.ok(source.includes(needle));
   await route.fulfill({response,body:source.replace(needle,needle+' window.__slotLeverActors=RC.slotLevers;')});
  });
  await page.route('**/src/3d/rig.js',async route=>{
   const response=await route.fetch(),source=await response.text(),needle='const t = T.tex(c, false); t.colorSpace = THREE.NoColorSpace; return t;';assert.ok(source.includes(needle));
   await route.fulfill({response,body:source.replace(needle,'const t = T.tex(c, false); t.colorSpace = THREE.NoColorSpace; (window.__slotChipMasks ||= []).push(t); return t;')});
  });
  if(rebuilds)await page.route('**/src/3d/render3d.js',async route=>{
   const response=await route.fetch(),source=await response.text();assert.ok(source.includes('function rebuildWorld() {'));
   await route.fulfill({response,body:source+'\nwindow.__rebuildSlotWorld=rebuildWorld;'});
  });
  await page.addInitScript(()=>{
   window.slotLeverUploads=[];window.slotLeverLinks=[];window.slotMaskUploads=[];const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(kind,...a){
    const gl=original.call(this,kind,...a);if(kind!=='webgl2'||!gl||gl.slotLeverHook)return gl;gl.slotLeverHook=true;
    const data=gl.bufferData,link=gl.linkProgram;
    gl.bufferData=function(target,array,...rest){
     const levers=Object.values(window.__slotLeverActors||{});
     if(levers.some(l=>l.children.some(o=>[...Object.values(o.geometry.attributes),o.geometry.index].some(a=>a?.array===array))))slotLeverUploads.push({bytes:array.byteLength,at:performance.now()});
     return data.call(this,target,array,...rest);
    };
    gl.linkProgram=function(...a){slotLeverLinks.push(performance.now());return link.apply(this,a);};return gl;
   };
   const get=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(kind,...a){
    const gl=get.call(this,kind,...a);if(kind!=='webgl2'||!gl||gl.slotMaskHook)return gl;gl.slotMaskHook=true;
    for(const method of ['texImage2D','texSubImage2D']){const fn=gl[method];gl[method]=function(...a){const i=(window.__slotChipMasks||[]).findIndex(t=>t.image===a.at(-1));if(i>=0)slotMaskUploads.push({index:i,at:performance.now(),bytes:a.at(-1).width*a.at(-1).height*4});return fn.apply(this,a);};}return gl;
   };
  });
  await page.goto('https://10.42.0.37:3161/'+(fallback?'?noprops':''));await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  rows.push(await page.evaluate(async({fallback,rebuilds})=>{
   const {cyl,sph}=await import('/src/3d/world.js'),L=__lastCall,actors=Object.entries(__slotLeverActors),ready=performance.now();
   const hash=async g=>{
    const attrs=[];for(const [key,a]of [...Object.entries(g.attributes),['index',g.index]])if(a){
     const bytes=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength),digest=await crypto.subtle.digest('SHA-256',bytes);
     attrs.push({key,type:a.array.constructor.name,itemSize:a.itemSize,normalized:a.normalized,hash:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')});
    }
    return JSON.stringify({attrs,groups:g.groups,range:[g.drawRange.start,String(g.drawRange.count)]});
   };
   const reference=await Promise.all([cyl(.02,.02,.5,8),sph(.055,12)].map(hash)),hashes=await Promise.all(actors.map(async([id,l])=>({id,hashes:await Promise.all(l.children.map(o=>hash(o.geometry))),positions:l.children.map(o=>o.position.toArray()),casts:l.children.map(o=>o.castShadow)})));
   const geometryCounts=[0,1].map(i=>new Set(actors.map(([,l])=>l.children[i].geometry)).size),uploads=slotLeverUploads.slice(),preparedMasks=slotMaskUploads.slice();
   L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;for(const c of L.state.chars)c.isHuman=true;
   const now=performance.now;let frozen=now.call(performance);performance.now=()=>frozen;
   const pulls=[];
   try{
    for(const [id,lever]of actors){
     if(L.view.priv.seat){L.act('leave');L.render();}
     const seat=L.state.seats.find(s=>s.id===Number(id));if(seat.occ)seat.occ.seat=null;seat.occ=seat.claim=null;
     L.place(seat.x,seat.y);L.look(seat.face,-.35);L.S.paused=false;L.render();
     const active=L.table()?.seat,placed=L.press('spot:main');L.render();
     window.dispatchEvent(new KeyboardEvent('keydown',{key:' '}));window.dispatchEvent(new KeyboardEvent('keyup',{key:' '}));L.render();L.S.paused=true;
     const view=L.table(),started=!!view?.view?.spin,samples=[];
     if(started)for(const age of [0,.15,.3,.45,.61]){
      frozen=(view.extra.pull+age)*1000;L.render();
      const expected=age<.6?Math.sin(age/.6*Math.PI)*.9:0;
      samples.push({age,actual:lever.rotation.x,expected,otherMoved:actors.filter(([other,o])=>other!==id&&Math.abs(o.rotation.x)>1e-12).length});
     }
     pulls.push({id:Number(id),active,placed,started,samples});
    }
   }finally{performance.now=now;L.S.paused=true;}
   if(L.view.priv.seat){L.act('leave');L.render();}
   const lateLeverUploads=slotLeverUploads.slice(uploads.length),lateLinks=slotLeverLinks.filter(t=>t>=ready).length,lateMaskUploads=slotMaskUploads.slice(preparedMasks.length);
   const cycles=[];
   if(rebuilds){const D=await import('/src/3d/render3d.js');for(let i=0;i<3;i++){
    const previous=new Set(Object.values(__slotLeverActors).flatMap(l=>l.children.map(o=>o.geometry))),retired=new Set();for(const g of previous)g.addEventListener('dispose',()=>retired.add(g));
    const oldMasks=__slotChipMasks.slice(-2),retiredMasks=new Set();for(const t of oldMasks)t.addEventListener('dispose',()=>retiredMasks.add(t));
    L.S.screen='briefing';__rebuildSlotWorld();await D.warmup({pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'});L.S.screen='game';L.render();
    const current=new Set(Object.values(__slotLeverActors).flatMap(l=>l.children.map(o=>o.geometry)));
    cycles.push({previous:previous.size,retired:retired.size,current:current.size,reusedOld:[...current].some(g=>previous.has(g)),retiredMasks:retiredMasks.size,gfx:L.gfx()});
   }}
   return{fallback,levers:actors.length,geometryCounts,reference,hashes,uploads,pulls,preparedMasks,lateMaskUploads,lateLeverUploads,lateLinks,cycles,gfx:L.gfx()};
  },{fallback,rebuilds}));
  await page.close();
 }
 fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),rows,errors},null,2));assert.deepEqual(errors,[]);
 for(const r of rows){
  assert.equal(r.levers,10);assert.deepEqual(r.geometryCounts,baseline?[10,10]:[1,1]);
  for(const h of r.hashes){assert.deepEqual(h.hashes,r.reference);assert.deepEqual(h.positions,[[0,.25,0],[0,.52,0]]);assert.deepEqual(h.casts,[false,true]);}
  for(const p of r.pulls){assert.equal(p.active,p.id);assert.equal(p.placed,true);assert.equal(p.started,true);assert.equal(p.samples.length,5);for(const s of p.samples){assert.ok(Math.abs(s.actual-s.expected)<1e-10,JSON.stringify(s));assert.equal(s.otherMoved,0);}}
  assert.deepEqual(r.lateLeverUploads,[]);assert.equal(r.lateLinks,0);
  assert.equal(r.preparedMasks.length,maskBaseline?0:2);assert.equal(r.lateMaskUploads.length,maskBaseline?2:0);
  for(const c of r.cycles){assert.equal(c.previous,c.retired);assert.equal(c.current,2);assert.equal(c.reusedOld,false);}if(rebuilds)assert.equal(new Set(r.cycles.map(c=>c.gfx.geos)).size,1);
  for(const c of r.cycles)assert.equal(c.retiredMasks,maskBaseline?0:2);
  if(rebuilds&&!maskBaseline)assert.ok(Math.max(...r.cycles.map(c=>c.gfx.tex))-Math.min(...r.cycles.map(c=>c.gfx.tex))<=1,'chip mask textures retire across actual world replacements');
 }
 console.log('PASS: ten actual chip-first Space spins and 50 lever poses per variant; exact original geometry, independent pivots, no late lever allocations/links.',JSON.stringify(rows.map(r=>({fallback:r.fallback,geometries:r.geometryCounts,uploads:r.uploads.length,bytes:r.uploads.reduce((n,u)=>n+u.bytes,0),cycles:r.cycles.map(c=>({previous:c.previous,retired:c.retired,current:c.current,geos:c.gfx.geos}))}))));
}finally{await browser.close();}
