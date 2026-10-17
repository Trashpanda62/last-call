// Production loads generated maps directly; explicit fallback modes still paint them.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
  for(const mode of ['', '?nomats', '?toy']) {
    const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('https://10.42.0.37:3161/'+mode);await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
    const maps=await page.evaluate(async()=>{
      const {roomMats,MAT}=await import('/src/3d/world.js');
      return Object.values(roomMats).flatMap(r=>[r.wall,r.floor,r.ceil].filter(Boolean)).concat(MAT.darkWood).map(m=>({kind:m.map?.image?.constructor?.name,src:m.map?.image?.src}));
    });
    assert.equal(maps.length,22);assert.ok(maps.every(m=>m.kind===(mode?'HTMLCanvasElement':'HTMLImageElement')),JSON.stringify(maps));
    if(!mode)assert.ok(maps.every(m=>m.src.includes('/assets/mats/')));
    assert.deepEqual(errors,[]);await page.close();console.log('PASS:',mode||'production','room and wood materials, startup barrier, no shader errors.');
  }
}finally{await browser.close();}
