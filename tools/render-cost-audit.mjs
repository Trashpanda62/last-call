// Attribute real WebGL submissions to scene objects and render passes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.LC_URL||'https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const rows=[];
  for(const [name,x,y,look] of [['floor',1300,600,Math.PI/2],['north',1110,303,Math.PI/2],['bar',350,400,-Math.PI/2],['ghost',1300,600,Math.PI/2]]) {
    rows.push(await page.evaluate(({name,x,y,look})=>{
      let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
      const L=__lastCall;L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.place(x,y);L.look(look,-.05);
      if(name==='ghost'){L.state.chars[0].alive=false;L.act('cameras');}L.render();
      const scene=L.scene().scene, saved=[], objects=new Map(),observed=new Set(),programSelections={},programObjects=new Map();let current=null,renderer=null,capture=false,draws=[];
      const before=scene.onBeforeRender;scene.onBeforeRender=function(r,...args){renderer=r;return before.call(this,r,...args);};L.render();scene.onBeforeRender=before;
      const observeMaterial=m=>{if(observed.has(m))return;observed.add(m);const own=Object.hasOwn(m,'customProgramCacheKey'),key=m.customProgramCacheKey;saved.push(()=>{if(own)m.customProgramCacheKey=key;else delete m.customProgramCacheKey;});m.customProgramCacheKey=function(){if(capture){const pass=current?.pass||'unknown';programSelections[pass]=(programSelections[pass]||0)+1;const id=[pass,current?.object,m.id].join('/'),row=programObjects.get(id)||{pass,object:current?.object,material:m.id,type:m.type,count:0};row.count++;programObjects.set(id,row);}return key.call(this);};};
      function describe(o,material,shadow=false){
        if(!objects.has(o.id)){
          const path=[];for(let p=o;p&&p!==scene;p=p.parent)path.unshift(p.name||p.type);
          const m=Array.isArray(o.material)?o.material[0]:o.material;
          objects.set(o.id,{id:o.id,name:o.name,path:path.join('/'),kind:o.userData.propName||(o.isSkinnedMesh?'character':o.isSprite?'sprite':o.isInstancedMesh?'instanced':o.geometry?.type||o.type),room:o.userData.room||null,material:m?.type,mat:m?.id,map:m?.map?.image?.src?.replace(location.origin,'')||null,instances:o.count||1,cast:o.castShadow});
        }
        return {object:o.id,pass:shadow?'shadow':material.isMeshNormalMaterial?'ao-normal':'color'};
      }
      scene.traverse(o=>{if(!o.isMesh&&!o.isSprite&&!o.isPoints&&!o.isLine)return;
        const b=o.onBeforeRender,a=o.onAfterRender,s=o.onBeforeShadow,as=o.onAfterShadow;saved.push(()=>{o.onBeforeRender=b;o.onAfterRender=a;o.onBeforeShadow=s;o.onAfterShadow=as;});
        o.onBeforeRender=function(r,sc,cam,geo,mat,...rest){current=describe(o,mat);observeMaterial(mat);return b.call(this,r,sc,cam,geo,mat,...rest);};
        o.onAfterRender=function(...args){current=null;return a.call(this,...args);};
        o.onBeforeShadow=function(r,sc,cam,shadowCam,geo,mat,...rest){current=describe(o,mat,true);observeMaterial(mat);return s.call(this,r,sc,cam,shadowCam,geo,mat,...rest);};
        o.onAfterShadow=function(...args){current=null;return as.call(this,...args);};
      });
      const skeletons=new Map();scene.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.boneTexture)skeletons.set(o.skeleton,o.skeleton.boneTexture.version);});
      const gl=renderer.getContext(), originals=new Map();
      const direct=renderer.renderBufferDirect;renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){observeMaterial(material);return direct.call(this,camera,scene,geometry,material,object,group);};saved.push(()=>{renderer.renderBufferDirect=direct;});
      for(const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
        const original=gl[method];originals.set(method,original);gl[method]=function(...args){if(capture)draws.push({...current,pass:current?.pass||'post',tris:args[0]===gl.TRIANGLES?args[method.startsWith('drawElements')?1:2]/3*(method.endsWith('Instanced')?args.at(-1):1):0});return original.apply(this,args);};
      }
      try {capture=true;L.render();capture=false;}finally{for(const [key,fn]of originals)gl[key]=fn;saved.forEach(f=>f());}
      const group=key=>{const groups=new Map();for(const d of draws){const k=key(d),v=groups.get(k)||{key:k,calls:0,tris:0};v.calls++;v.tris+=d.tris;groups.set(k,v);}return [...groups.values()].sort((a,b)=>b.calls-a.calls);};
      const byObject=group(d=>d.object||'post').map(r=>({...r,...objects.get(r.key)}));
      const boneUpdates=[...skeletons].map(([s,v])=>s.boneTexture.version-v).filter(n=>n>0);
      return {name,gfx:L.gfx(),draws:draws.length,boneUpdates,programSelections,programObjects:[...programObjects.values()].map(r=>({...r,object:objects.get(r.object)||r.object})),passes:group(d=>d.pass),kinds:group(d=>objects.get(d.object)?.kind||'post'),objects:byObject};
    },{name,x,y,look}));
    assert.equal(rows.at(-1).draws,rows.at(-1).gfx.calls,'instrumented calls must account for all renderer submissions');
    assert.equal(rows.at(-1).passes.reduce((n,p)=>n+p.tris,0),rows.at(-1).gfx.tris,'instrumented triangles must account for all renderer submissions');
    console.log(name,JSON.stringify({...rows.at(-1),objects:rows.at(-1).objects.slice(0,15)}));
  }
  assert.deepEqual(errors,[]);const out=process.argv[2]||'shots/render-cost.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),rows,errors},null,2));
}finally{await browser.close();}
