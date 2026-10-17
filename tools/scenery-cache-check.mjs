// Cache invalidation, original visibility and renderer-error recovery for fixed scenery.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const rows=[],errors=[];
try {
 for(const fallback of [false,true]) {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/3d/render3d.js',async route=>{
   const response=await route.fetch(),original=await response.text(),needle='function cullOffscreenScenery(cam) {';
   assert.ok(original.includes(needle));
   const source=original.replace(needle,needle+'\n  if(window.__sceneryEnabled===false)return [];')+`
window.__sceneryProbe={R:()=>R,cull:cullOffscreenScenery,rebuild:rebuildWorld,checks:0};
const originalSceneryIntersects=sceneryFrustum.intersectsBox;
sceneryFrustum.intersectsBox=function(...args){__sceneryProbe.checks++;return originalSceneryIntersects.apply(this,args);};`;
   await route.fulfill({response,body:source});
  });
  await page.goto((process.env.LC_URL||'https://10.42.0.37:3161/')+(fallback?'?noprops&nomats':''));
  await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const result=await page.evaluate(async()=>{
   const L=__lastCall,D=await import('/src/3d/render3d.js'),T=await import('three'),{setPreset}=await import('/src/settings.js');
   let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
   L.noLock();L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.place(1300,600);L.look(Math.PI/2,-.05);L.render();
   const R=__sceneryProbe.R(),cases=[],failures=[];
   const reference=()=>{
    const fr=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(R.camera.projectionMatrix,R.camera.matrixWorldInverse)),hidden=[];
    const shadows=R.renderer.shadowMap.enabled&&R.key.castShadow,direction=R.key.target.position.clone().sub(R.key.position);
    for(const {object:o}of R.sceneryCull.entries){
     if(!o.visible)continue;const local=o.isInstancedMesh?o.boundingBox:o.geometry.boundingBox;if(!local||local.isEmpty())continue;
     const body=local.clone().applyMatrix4(o.matrixWorld);if(fr.intersectsBox(body))continue;
     if(shadows&&o.castShadow){if(direction.y>=0)continue;const footprint=body.clone();
      for(const x of [body.min.x,body.max.x])for(const y of [body.min.y,body.max.y])for(const z of [body.min.z,body.max.z]){
       const corner=new T.Vector3(x,y,z),distance=Math.max(0,y+.5)/-direction.y;footprint.expandByPoint(corner.addScaledVector(direction,distance));
      }
      footprint.expandByVector(new T.Vector3(.15,0,.15));if(fr.intersectsBox(footprint))continue;
     }
     hidden.push(o.id);
    }
    return hidden.sort((a,b)=>a-b);
   };
   const sample=name=>{
    window.__sceneryEnabled=false;L.render();const original=R.sceneryCull.entries.map(e=>e.object.visible),expected=reference();
    window.__sceneryEnabled=true;L.render();const actual=R.sceneryCull.hidden.map(o=>o.id).sort((a,b)=>a-b),restored=R.sceneryCull.entries.every((e,i)=>e.object.visible===original[i]);
    const before=__sceneryProbe.checks;L.render();const repeated=__sceneryProbe.checks-before;
    if(JSON.stringify(actual)!==JSON.stringify(expected)||!restored||repeated)failures.push({name,expected,actual,restored,repeated});
    cases.push({name,hidden:actual.length,restored,repeated,epoch:R.sceneryCull.epoch});
   };
   sample('unchanged');
   L.look(Math.PI/3,-.2);sample('turn');L.place(1304,607);sample('translate');
   const fov=R.baseFov;R.baseFov=110;sample('fov-110');R.baseFov=55;sample('fov-55');R.baseFov=fov;
   for(const preset of ['low','ultra','high']){setPreset(preset);sample('preset-'+preset);}
   const object=R.sceneryCull.entries.find(e=>e.object.visible&&e.object.castShadow).object,cast=object.castShadow;
   object.castShadow=false;sample('shadow-flag-off');object.castShadow=cast;sample('shadow-flag-return');
   R.world.group.position.set(.4,.1,-.3);sample('moved-parent');R.world.group.position.set(0,0,0);sample('parent-return');
   L.state.backrooms=true;sample('backrooms');L.state.backrooms=false;sample('casino-return');
   for(let i=0;i<12;i++){L.look(i*Math.PI/6,(i%3-1)*.3);sample('return-turn-'+i);}
   L.place(1300,600);L.look(Math.PI/2,-.05);window.__sceneryEnabled=false;L.render();
   const visibility=R.sceneryCull.entries.map(e=>e.object.visible),render=R.composer.render;let caught=false;
   window.__sceneryEnabled=true;R.composer.render=()=>{throw Error('scenery fixture render');};
   try{L.render();}catch(error){caught=error.message==='scenery fixture render';}finally{R.composer.render=render;}
   const errorRestored=R.sceneryCull.entries.every((e,i)=>e.object.visible===visibility[i]);sample('after-render-error');
   const oldWorld=R.world,oldCache=R.sceneryCull;L.S.screen='briefing';__sceneryProbe.rebuild();
   await D.warmup({pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'});L.S.screen='game';L.render();sample('world-replacement');
   const replacement={worldChanged:R.world!==oldWorld,cacheChanged:R.sceneryCull!==oldCache,oldObjectsRetained:R.sceneryCull.entries.some(e=>oldCache.entries.some(old=>old.object===e.object)),entries:R.sceneryCull.entries.length};
   return {cases,failures,caught,errorRestored,replacement,gfx:L.gfx()};
  });
  assert.deepEqual(result.failures,[]);assert.equal(result.caught,true);assert.equal(result.errorRestored,true);
  assert.equal(result.replacement.worldChanged,true);assert.equal(result.replacement.cacheChanged,true);assert.equal(result.replacement.oldObjectsRetained,false);
  rows.push({fallback,...result});console.log(JSON.stringify({fallback,cases:result.cases.length,replacement:result.replacement,errorRestored:result.errorRestored}));await page.close();
 }
 assert.deepEqual(errors,[]);
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/scenery-cache-check.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),rows,errors},null,2));
 console.log('PASS: independent ray-projection oracle, visibility restoration, zero unchanged-view box tests, parent/projection/shadow/world invalidation and render-error recovery.');
}finally{await browser.close();}
