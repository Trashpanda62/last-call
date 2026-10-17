// Actual risk controls, independent original pixels and first-use texture traffic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const browser = await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/3d/machines.js',async route=>{
    const response=await route.fetch(),source=await response.text(),needle='bucket.rotation.y = yaw; add(bucket);';
    assert.ok(source.includes(needle));
    await route.fulfill({response,body:source.replace('const screens = [];','const screens = []; window.__plinkoBuckets = [];').replace(needle,needle+' window.__plinkoBuckets.push({seat:s.id,mesh:bucket});')});
  });
  await page.addInitScript(()=>{
    window.plinkoUploads=[];window.plinkoPaints=0;window.plinkoLinks=0;
    const get=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind,...a){
      // Repeated oracle reads must not switch a live canvas from GPU to CPU
      // rasterization halfway through the fixture. Use one path from creation;
      // separate paired room captures check the ordinary production context.
      const args=kind==='2d'&&this.width===1024&&this.height===96?[{...a[0],willReadFrequently:true}]:a;
      const ctx=get.call(this,kind,...args);if(!ctx||ctx.plinkoHook)return ctx;ctx.plinkoHook=true;
      if(kind==='webgl2'){
        const sub=ctx.texSubImage2D,link=ctx.linkProgram;
        ctx.texSubImage2D=function(...a){const image=a.at(-1);if(image?.width===1024&&image.height===96)plinkoUploads.push({at:performance.now(),stage:document.querySelector('#bootStatus')?.textContent});return sub.apply(this,a);};
        ctx.linkProgram=function(...a){plinkoLinks++;return link.apply(this,a);};
      }else if(kind==='2d'){
        const text=ctx.fillText;ctx.fillText=function(...a){if(this.canvas.width===1024&&this.canvas.height===96)plinkoPaints++;return text.apply(this,a);};
      }return ctx;
    };
  });
  await page.goto('https://10.42.0.37:3161/'+(process.argv.includes('--fallback')?'?noprops':''));
  await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const data=await page.evaluate(async()=>{
    const L=__lastCall,Gm=await import('./src/games.js');L.noLock();L.start('gambler',{players:32});L.step(.1);L.S.paused=false;L.render();
    let renderer;const scene=L.scene().scene,before=scene.onBeforeRender;scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;
    const buckets=__plinkoBuckets,ready={paints:plinkoPaints,uploads:plinkoUploads.length,uniqueMaps:new Set(buckets.map(b=>b.mesh.material.map)).size},rows=[];
    const original=risk=>{
      const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=96;const bg=canvas.getContext('2d');
      bg.clearRect(0,0,1024,96);
      Gm.PLINKO[risk].forEach((m,j)=>{
        // the L03 face pilot's channel strip: ivory value fitted to the cell over a heat bar
        const hot=Math.abs(j-Gm.PLINKO_ROWS/2)/(Gm.PLINKO_ROWS/2),cw=1024/17,x=j*cw,label=m>=1000?m/1000+'K':m>=1?String(m):String(m).replace(/^0/,'');
        bg.textAlign='center';bg.textBaseline='alphabetic';
        if(!m){bg.fillStyle='#0b0f0e';bg.beginPath();bg.roundRect(x+2,2,cw-4,92,6);bg.fill();bg.strokeStyle='#8a6a2e';bg.lineWidth=5;bg.beginPath();bg.moveTo(x+12,14);bg.lineTo(x+cw-12,82);bg.moveTo(x+cw-12,14);bg.lineTo(x+12,82);bg.stroke();return;} // a channel the risk's gates close
        bg.fillStyle='#142d28';bg.beginPath();bg.roundRect(x+2,2,cw-4,92,6);bg.fill();
        bg.fillStyle=`hsl(${46-hot*46},85%,${44+hot*8}%)`;bg.beginPath();bg.roundRect(x+5,78,cw-10,12,4);bg.fill();
        let px=46;bg.font=`bold ${px}px Arial, sans-serif`;const fit=(cw-8)/bg.measureText(label).width;if(fit<1){px=Math.floor(px*fit);bg.font=`bold ${px}px Arial, sans-serif`;}
        bg.fillStyle='#f8edc9';bg.fillText(label,x+cw/2,50+px*.36);
      });
      return bg.getImageData(0,0,1024,96).data;
    };
    const expected=new Map(Object.keys(Gm.PLINKO).map(r=>[r,original(r)]));
    const pixels=(b,risk)=>{
      const canvas=b.mesh.material.map.image,actual=canvas.getContext('2d').getImageData(0,0,1024,96).data,wanted=expected.get(risk);
      let different=0;for(let i=0;i<actual.length;i++)if(actual[i]!==wanted[i])different++;
      return different;
    };
    const maps=new Map();
    for(const target of buckets){
      if(L.view.priv.seat)L.act('leave');
      const seat=L.state.seats[target.seat];if(seat.occ)seat.occ.seat=null;seat.occ=seat.claim=null;
      L.place(seat.x,seat.y);L.look(seat.face,-.35);L.render();
      for(const risk of ['low','high','medium','high','low','medium']){
        const button=document.querySelector(`#gameControls button[data-play="btn:risk:${risk}"]`);
        if(!button||button.disabled)throw Error('Missing active risk control '+risk+' '+JSON.stringify({seat:seat.id,active:L.table()?.game,screen:L.S.screen,controls:document.querySelector('#gameControls')?.innerHTML}));
        const paints=plinkoPaints,uploads=plinkoUploads.length,links=plinkoLinks;button.click();L.render();L.render();
        const map=target.mesh.material.map;let sameMap=true;
        if(maps.has(risk))sameMap=maps.get(risk)===map;else maps.set(risk,map);
        rows.push({seat:seat.id,risk,selected:L.table().extra.risk,paints:plinkoPaints-paints,uploads:plinkoUploads.length-uploads,links:plinkoLinks-links,different:pixels(target,risk),otherDifferent:buckets.filter(b=>b!==target).map(b=>pixels(b,'medium')),map:map.id,sameMap});
      }
      L.act('leave');L.render();
    }
    // Selecting a new risk while a ball is falling remains blocked.
    const seat=L.state.seats[buckets[0].seat];L.place(seat.x,seat.y);L.look(seat.face,-.35);L.render();
    const placed=L.press('spot:main');L.render();L.press('btn:drop');L.render(); // (the drop chute is the start now; no HUD Drop button)
    const riskButtons=[...document.querySelectorAll('#gameControls button[data-play^="btn:risk:"]')].map(b=>({id:b.dataset.play,disabled:b.disabled}));
    const busy={placed,balls:L.table().view.balls.length,riskButtons},finalDifferences=buckets.map(b=>pixels(b,'medium'));
    const T=await import('./src/3d/textures.js'),filtering=[];
    if(T.preparePlinkoTextures){
      L.act('leave');L.S.paused=true;L.S.screen='briefing';
      const D=await import('./src/3d/render3d.js'),initial=T.aniso(),textures=[...T.preparePlinkoTextures()];
      for(const anisotropy of [initial===2?4:2,initial]){
        const versions=textures.map(t=>t.version),paints=plinkoPaints,uploads=plinkoUploads.length;T.setAniso(anisotropy);
        const revised=textures.map((t,i)=>t.version-versions[i]);
        await D.warmup({pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'});
        filtering.push({anisotropy,revised,values:textures.map(t=>t.anisotropy),same:textures.every((t,i)=>t===[...T.preparePlinkoTextures()][i]),prepared:textures.map(t=>!!renderer.properties.get(t).__webglTexture),paints:plinkoPaints-paints,uploads:plinkoUploads.length-uploads});
      }
      L.S.screen='game';
    }
    return {ready,rows,uniqueRiskMaps:new Set(maps.values()).size,finalDifferences,busy,filtering,gfx:L.gfx()};
  });
  const out=process.argv.find(a=>a.endsWith('.json'))||'shots/plinko-textures.json';fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),...data,errors},null,2));
  assert.deepEqual(errors,[]);const cabinets=data.finalDifferences.length;assert.equal(cabinets,2);assert.equal(data.rows.length,cabinets*6);assert.ok(data.busy.placed&&data.busy.balls>0);
  for(const row of data.rows){assert.equal(row.selected,row.risk);assert.equal(row.different,0);assert.deepEqual(row.otherDifferent,Array(cabinets-1).fill(0));assert.equal(row.links,0);}
  assert.deepEqual(data.finalDifferences,Array(cabinets).fill(0));
  assert.ok(data.busy.riskButtons.filter(b=>!b.id.endsWith(':medium')).every(b=>b.disabled));
  if(!process.argv.includes('--baseline')){assert.equal(data.ready.uniqueMaps,1);assert.equal(data.uniqueRiskMaps,3);for(const row of data.rows){assert.equal(row.paints,0);assert.equal(row.uploads,0);assert.ok(row.sameMap);}}
  for(const row of data.filtering){assert.ok(row.revised.length===4&&row.revised.every(v=>v===1));assert.ok(row.values.every(v=>v===row.anisotropy));assert.ok(row.same&&row.prepared.every(Boolean));assert.equal(row.paints,0);assert.equal(row.uploads,3);}
  console.log(JSON.stringify({ready:data.ready,rows:data.rows,uniqueRiskMaps:data.uniqueRiskMaps,busy:data.busy,errors}));
  console.log(process.argv.includes('--baseline')?'PASS: original risk strip behavior and traffic recorded.':'PASS: all risks reuse prepared exact textures at both cabinets, with zero risk-change paints/uploads/links; the readout atlas is prepared with them.');
}finally{await browser.close();}
