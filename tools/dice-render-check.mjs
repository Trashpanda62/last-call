// Keep the displayed die faces identical while batching them into one material.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('https://10.42.0.37:3161/');await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const result=await page.evaluate(async()=>{
    const L=__lastCall,{RoundedBoxGeometry}=await import('/vendor/three/addons/geometries/RoundedBoxGeometry.js'),{Vector3}=await import('three');
    L.noLock();L.start('killer',{players:6});L.step(.1);L.S.paused=true;
    const seat=L.state.seats.find(s=>s.game==='dice'&&!s.occ);L.place(seat.x,seat.y);L.look(seat.face,-.65);L.step(.1);L.render();
    L.press('spot:field');L.press('btn:roll');L.render();
    const dice=[];L.scene().scene.traverse(o=>{if(o.name.startsWith('street-die-'))dice.push(o);});
    const ref=new RoundedBoxGeometry(.07,.07,.07,2,.012),geo=dice[0].geometry,uv=geo.attributes.uv,values=[3,4,1,6,2,5];
    const normals=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],pips=[[],[[0,0]],[[-1,-1],[1,1]],[[-1,-1],[0,0],[1,1]],[[-1,-1],[1,-1],[-1,1],[1,1]],[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]];
    let pixelMismatches=0,maxUvError=0;
    for(const group of ref.groups){
      const i=group.materialIndex,x=i%4*128+32,y=Math.floor(i/4)*128+32,c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
      g.fillStyle='#f8f4ec';g.fillRect(0,0,64,64);g.fillStyle='#c0302a';for(const [a,b]of pips[values[i]]){g.beginPath();g.arc(32+a*17,32+b*17,6,0,7);g.fill();}
      const expected=g.getImageData(0,0,64,64).data,actual=dice[0].material.map.image.getContext('2d').getImageData(x,y,64,64).data;
      for(let n=0;n<expected.length;n++)if(expected[n]!==actual[n])pixelMismatches++;
      for(let n=group.start;n<group.start+group.count;n++)maxUvError=Math.max(maxUvError,Math.abs(uv.getX(n)-(x+ref.attributes.uv.getX(n)*64)/512),Math.abs(uv.getY(n)-(1-(y+(1-ref.attributes.uv.getY(n))*64)/256)));
    }
    const faces=[];
    for(let value=1;value<=6;value++){
      const roll=L.table().view.roll;roll.t0=performance.now()/1000-2;roll.dice=[value,7-value];L.render();
      faces.push(dice.map(d=>values[normals.map(n=>new Vector3(...n).applyQuaternion(d.quaternion).y).reduce((best,y,i,ys)=>y>ys[best]?i:best,0)]));
    }
    return {dice:dice.length,singleMaterial:dice.every(d=>!Array.isArray(d.material)),groups:geo.groups.length,sharedGeometry:geo===dice[1].geometry,positions:[...geo.attributes.position.array],referencePositions:[...ref.attributes.position.array],pixelMismatches,maxUvError,faces};
  });
  assert.equal(result.dice,2);assert.ok(result.singleMaterial&&result.sharedGeometry);assert.equal(result.groups,0);
  assert.deepEqual(result.positions,result.referencePositions);assert.equal(result.pixelMismatches,0);assert.ok(result.maxUvError<1e-7);
  assert.deepEqual(result.faces,[[1,6],[2,5],[3,4],[4,3],[5,2],[6,1]]);
  fs.mkdirSync('shots/dice-render',{recursive:true});await page.screenshot({path:'shots/dice-render/settled-dice.png'});
  assert.deepEqual(errors,[]);console.log('PASS: original pip pixels, UV orientation, rounded geometry, all six landed values, one shared geometry/material, and no shader errors.');
}finally{await browser.close();}
