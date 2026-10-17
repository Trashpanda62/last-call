// Compare whole-material room ownership or shared identical lacquer materials.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const candy=process.argv.includes('--candy'),passes=process.argv.includes('--passes'),labels=process.argv.includes('--labels'),post=process.argv.includes('--post'),ssr=process.argv.includes('--ssr'),hands=process.argv.includes('--hands'),bounds=process.argv.includes('--bounds'),poses=process.argv.includes('--poses'),staged=process.argv.includes('--scene'),out=candy?'shots/candy-batches':passes?'shots/pass-materials':labels?'shots/label-matrices':post?'shots/post-warmup':ssr?'shots/ssr-materials':hands?'shots/hand-matrices':bounds?'shots/bounds-warmup':poses?'shots/bone-rotations':staged?'shots/scene-warmup':'shots/static-batches';fs.mkdirSync(out,{recursive:true});
try {
  const rows=[],shots=[];
  for(const global of [true,false]) {
    const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>{let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);});
    await page.goto('https://10.42.0.37:3161/'+(global?(candy?'?uncachedCandy':passes?'?legacyPassMaterials':labels?'?legacyLabelMatrices':post?'?legacyPostWarmup':ssr?'?legacySsrMaterials':hands?'?legacyHandMatrices':bounds?'?legacyBoundsWarmup':poses?'?legacyBoneRotations':staged?'?legacySceneWarmup':'?globalBatches'):''));await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
    if(ssr)await page.evaluate(async()=>{const {setPreset}=await import('./src/settings.js');setPreset('ultra');});
    const geometry=await page.evaluate(async({players,settle})=>{
      const {MAT}=await import('./src/3d/world.js');
      let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
      const L=__lastCall;L.noLock();let frozen=90000;performance.now=()=>frozen;
      L.start('killer',{players});L.step(.1);L.S.paused=true;
      // Let interval-based marquee lights reach the same frozen phase instead
      // of inheriting whichever chase step startup happened to finish on.
      if(settle){frozen+=150;L.render();frozen+=50;L.render();}
      // Replace demo actors before reseeding: otherwise their randomized gait
      // phases inherit the different number of material UUID allocations.
      for(const c of L.state.chars)c.color='#123abc';L.render();seed=42;
      L.start('killer',{players});L.step(.1);L.S.paused=true;
      const hashes=[],surfaces=new Map(),images=new WeakMap();let owned=0;
      const imageKey=im=>{if(!im)return null;if(im.src)return im.src.replace(location.origin,'');if(im===MAT.wood.map.image)return ['procedural wood grain',im.width,im.height];if(!images.has(im)){const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);let h=2166136261;for(const v of g.getImageData(0,0,c.width,c.height).data)h=Math.imul(h^v,16777619)>>>0;images.set(im,[c.width,c.height,h]);}return images.get(im);};
      L.scene().scene.traverse(o=>{
        if(!o.name.startsWith('static-'))return;const a=o.geometry.attributes.position.array,words=new Uint32Array(a.buffer,a.byteOffset,a.byteLength/4);let hash=2166136261;
        for(const n of words)hash=Math.imul(hash^n,16777619)>>>0;hashes.push([a.length,hash]);if(o.userData.room)owned++;
        const data=o.material.toJSON({textures:{},images:{}});delete data.metadata;delete data.uuid;delete data.name;
        for(const [k,t]of Object.entries(o.material))if(t?.isTexture&&k in data)data[k]={image:imageKey(t.image),repeat:t.repeat.toArray(),offset:t.offset.toArray(),rotation:t.rotation,wrap:[t.wrapS,t.wrapT],filter:[t.minFilter,t.magFilter],colorSpace:t.colorSpace,flipY:t.flipY};
        const key=JSON.stringify(data),s=surfaces.get(key)||[0,0,0];
        const attrs=['position','normal','uv'].map(k=>o.geometry.attributes[k]).filter(Boolean),bits=new Float32Array(1),ints=new Uint32Array(bits.buffer);
        for(let i=0;i<o.geometry.attributes.position.count;i++){let h=2166136261;for(const a of attrs)for(let j=0;j<a.itemSize;j++){bits[0]=a.array[i*a.itemSize+j];h=Math.imul(h^ints[0],16777619)>>>0;}s[0]++;s[1]=(s[1]+h)>>>0;s[2]=(s[2]+Math.imul(h,h))>>>0;}surfaces.set(key,s);
      });
      return {hashes:hashes.sort((a,b)=>a[1]-b[1]),owned,surfaces:[...surfaces].sort((a,b)=>a[0].localeCompare(b[0]))};
    },{players:labels||post||ssr||hands||bounds||poses||staged?32:6,settle:true});
    if(candy)await page.evaluate(()=>{
      // Compare static dressing without randomized actor breathing/gestures.
      // Actor matrix/pose correctness is exercised by runtime-perf-check.
      const scene=__lastCall.scene().scene;
      scene.onBeforeRender=()=>{const roots=new Set();scene.traverseVisible(o=>{if(!o.isSkinnedMesh)return;let root=o;while(root.parent&&root.parent!==scene)root=root.parent;roots.add(root);});for(const root of roots)root.visible=false;};
    });
    const views=[];shots.push([]);
    for(const [name,x,y,look]of [['floor',1300,600,Math.PI/2],['bar',350,400,-Math.PI/2],['rest',330,1000,Math.PI],['arcade',2530,430,-Math.PI/2],['race',2180,960,Math.PI],['slots',1300,1480,Math.PI/2],['vip',2500,1500,Math.PI/2],...(candy||passes||labels||post||ssr||hands||bounds||poses||staged?[['backrooms',1300,600,Math.PI/2]]:[])]) {
      await page.evaluate(([name,x,y,look])=>{const L=__lastCall;L.place(x,y);L.look(look,-.05);if(name==='backrooms')L.state.backrooms=true;L.render();L.render();},[name,x,y,look]);
      shots.at(-1).push((await page.screenshot({path:`${out}/${global?'global':'rooms'}-${name}.png`})).toString('base64'));views.push({name,gfx:await page.evaluate(()=>__lastCall.gfx())});
    }
    assert.deepEqual(errors,[]);rows.push({global,geometry,views});await page.close();
  }
  if(candy){assert.deepEqual(rows[0].geometry.surfaces,rows[1].geometry.surfaces,'retain static vertices, normals, UVs and material properties');assert.ok(rows[1].geometry.hashes.length<rows[0].geometry.hashes.length,'identical materials should batch together');}
  else{assert.deepEqual(rows[0].geometry.hashes,rows[1].geometry.hashes,'retain exactly the same static geometry and batch count');if(!passes&&!labels&&!post&&!ssr&&!hands&&!bounds&&!poses&&!staged)assert.equal(rows[0].geometry.owned,0);}
  assert.ok(rows[1].geometry.owned>20);
  const comparison=await browser.newPage();
  const pixels=await comparison.evaluate(async shots=>{
    const decode=async b=>{const im=new Image();im.src='data:image/png;base64,'+b;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);return g.getImageData(0,0,c.width,c.height).data;};
    const rows=[];for(let i=0;i<shots[0].length;i++){const a=await decode(shots[0][i]),b=await decode(shots[1][i]);let changed=0,sum=0;for(let k=0;k<a.length;k+=4){const d=Math.max(Math.abs(a[k]-b[k]),Math.abs(a[k+1]-b[k+1]),Math.abs(a[k+2]-b[k+2]));if(d>16)changed++;sum+=d;}rows.push({changedFraction:changed/(a.length/4),meanMaxChannel:sum/(a.length/4)});}return rows;
  },shots);
  const data={at:new Date().toISOString(),rows,pixels};fs.writeFileSync(`${out}/report.json`,JSON.stringify(data,null,2));
  console.log(JSON.stringify({owned:rows[1].geometry.owned,views:rows[1].views.map((r,i)=>({name:r.name,before:rows[0].views[i].gfx.calls,after:r.gfx.calls,...pixels[i]}))}));
  for(const p of pixels)assert.ok(p.changedFraction<.005,'room culling should preserve rendered surfaces; inspect comparison screenshots for any larger difference');
  if(labels||post||ssr||hands||bounds||poses||staged)for(const p of pixels)assert.equal(p.meanMaxChannel,0,'preparation/cached transforms must preserve pixel-identical renders');
  console.log(candy?'PASS: fewer batches with identical surfaces/materials; casino and Backrooms renders preserved.':passes?'PASS: same geometry/batch count; cached shadow/AO materials preserve all casino and Backrooms renders.':labels?'PASS: cached name-tag matrices preserve pixel-identical casino and Backrooms renders.':post?'PASS: staged screen-effect preparation preserves pixel-identical casino and Backrooms renders.':ssr?'PASS: cached reflection materials preserve pixel-identical Ultra casino and Backrooms renders.':hands?'PASS: visible hand-scene updates preserve pixel-identical casino and Backrooms renders.':bounds?'PASS: staged bounds preserve pixel-identical casino and Backrooms renders.':poses?'PASS: cached bone rotations preserve pixel-identical casino and Backrooms renders.':staged?'PASS: staged actor/room preparation preserves pixel-identical casino and Backrooms renders.':'PASS: unchanged static geometry/batch count, all room renders preserved, conservative ownership.');
}finally{await browser.close();}
