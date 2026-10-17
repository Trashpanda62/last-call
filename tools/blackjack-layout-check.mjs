// Occupied tables, all ten seats, real actions and shared felt/card/chip coordinates.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const out='shots/blackjack-layout';fs.mkdirSync(out,{recursive:true});
try {
 const report={at:new Date().toISOString(),rows:[],errors:[]};
 for(const fallback of [false,true])for(const viewport of [{width:1280,height:900},{width:740,height:420}]){
  const p=await browser.newPage({ignoreHTTPSErrors:true,viewport});p.on('pageerror',e=>report.errors.push(e.stack||e.message));
  await p.route('**/src/tables.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nexport const __feedback = () => tb;\n'});});
  await p.route('**/src/3d/render3d.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('id, visible: b.root.visible','id, uuid: b.root.uuid, pos: b.root.position.toArray(), visible: b.root.visible')});});
  await p.route('**/src/3d/machines.js',async route=>{const r=await route.fetch(),body=await r.text();assert.ok(body.includes('let free = null;'));await route.fulfill({response:r,body:body.replace('let free = null;','window.__bjCards={cardPool,decoCards}; let free = null;')});});
  await p.goto('https://10.42.0.37:3161/'+(fallback?'?noprops':''));await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const rows=await p.evaluate(async fallback=>{
   const D=await import('./src/3d/render3d.js'),THREE=await import('three'),Gm=await import('./src/games.js'),T=await import('./src/tables.js'),{BJ_TABLES}=await import('./src/map.js'),{blackjackSpot,BJ_LAYOUT}=await import('./src/3d/blackjack-layout.js');
   const L=__lastCall;L.noLock();L.start('killer',{players:12,killers:1});L.step(.1);
   for(const c of L.state.chars)c.isHuman=true;
   const clock=performance.now.bind(performance);let time=clock();performance.now=()=>time;
   const rows=[];const card=(rank,suit='♥')=>({rank:String(rank),suit});
   for(let index=0;index<10;index++){
    L.S.paused=false;if(L.view.priv.seat){L.act('leave');L.step(0);L.render();}
    for(const s of L.state.seats.filter(s=>s.game==='bj')){if(s.occ)s.occ.seat=null;s.occ=s.claim=null;}
    for(const c of L.state.chars)if(c.id!==L.view.priv.me){c.seat=null;c.x=1320;c.y=550+c.id*30;}
    const seat=L.state.seats.filter(s=>s.game==='bj')[index];
    L.state.seats.filter(s=>s.game==='bj'&&s!==seat).forEach((s,i)=>{const c=L.state.chars[i+1];c.seat=s;s.occ=c;c.x=s.x;c.y=s.y;c.look=c.face=s.face;});
    L.place(seat.x,seat.y);L.look(seat.face,-.7);L.step(.02);L.S.disp={};L.render();
    if(L.view.priv.seat?.id!==seat.id)throw Error('Wrong seat '+index);
    L.press('spot:main');time+=1000;L.render();
    const t=T.__feedback(),spot=blackjackSpot(seat,BJ_TABLES[seat.table]),camera=L.scene().camera;
    function setup(ranks,dealer=[9,8],next=9){
     t.bet=1000;t.bets={main:1000};t.s=Gm.bjDeal(1000,()=>.22);t.s.hands[0].cards=ranks.map(r=>card(r));t.s.dealer=dealer.map(r=>card(r,'♣'));
     let n=0;t.s.r=()=>n++%2===0?(next==='A'?0:next==='K'?12:+next-1)/13+.001:.25;
     t.g.sync();time+=1000;L.render();
    }
    const inspect=label=>{
     time+=1000;L.render();const view=L.table().view, visible=__bjCards.cardPool.filter(m=>m.visible), live=visible.filter(m=>!__bjCards.decoCards.some(d=>d.pair.includes(m)));
     const ownDecor=__bjCards.decoCards.filter(d=>L.state.seats[d.seat].table===seat.table&&d.pair.some(m=>m.visible)).length;
     const expected=view.hands.reduce((n,h)=>n+h.cards.length,view.dealer.length);
     const chips=L.scene().scene.getObjectByName('player-bet-chips'),positions=[], matrix=new THREE.Matrix4(), pos=new THREE.Vector3();
     for(let i=0;i<chips.count;i++){chips.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix).applyMatrix4(chips.matrixWorld);positions.push(pos.toArray());}
     const maxChipOffset=Math.max(0,...positions.map(p=>Math.hypot((p[0]-spot.bet.x)/(4*BJ_LAYOUT.betRadius/BJ_LAYOUT.width),(p[2]-spot.bet.z)/(BJ_LAYOUT.depth*BJ_LAYOUT.betRadius/BJ_LAYOUT.height))));
     const players=live.filter(m=>m.name==='blackjack-player-card'),box=new THREE.Box3();for(const m of players)box.expandByObject(m);
     const center=box.getCenter(new THREE.Vector3()),distance=center.distanceTo(camera.position);
     const projected=players.map(m=>{const v=m.position.clone().project(camera);return{x:v.x,y:v.y,z:v.z};});
     const controls=[...document.querySelectorAll('#bjActions button')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent,rect:[e.getBoundingClientRect().x,e.getBoundingClientRect().y,e.getBoundingClientRect().width,e.getBoundingClientRect().height]}));
     const result={fallback,viewport:[innerWidth,innerHeight],seat:seat.id,index,label,expected,live:live.length,ownDecor,chips:positions.length,maxChipOffset,distance,projected,controls,view,parts:L.parts(),killerBar:document.getElementById('killerBar').getClientRects().length,hint:document.getElementById('hint').textContent};
     const keys=L.scene().scene.getObjectByName('blackjack-action-buttons'),buttonParts=L.parts().filter(p=>p.part.startsWith('btn:'));
     result.buttons=buttonParts.map(p=>({part:p.part,on:p.on,screen:[p.x,p.y],ray:D.pick(p.x/innerWidth*2-1,1-p.y/innerHeight*2)?.part,enabled:L.table().on[p.part.slice(4)]}));
     if(document.querySelector('#bjActions')||document.querySelector('#gameControls [data-play="btn:hit"],#gameControls [data-play="btn:stand"],#gameControls [data-play="btn:double"],#gameControls [data-play="btn:split"]'))throw Error('Blackjack screen buttons remain');
     if(!keys.visible||!['hit','stand','double'].every(id=>result.buttons.some(b=>b.part==='btn:'+id&&b.on&&b.ray===b.part)))throw Error('Physical button not visible/raycastable '+JSON.stringify(result.buttons));
     if(buttonParts.some(p=>p.part==='btn:split')!==!!L.table().on.split)throw Error('Split button not conditional');
     if(label==='4+3 deal'){
      const scene=L.scene().scene,meshes=[];scene.traverseVisible(m=>{if(m.isMesh)meshes.push(m);});
      result.buttonVisibility=buttonParts.map(p=>{const target=new THREE.Vector3(...p.p),dst=target.distanceTo(camera.position),ray=new THREE.Raycaster(camera.position,target.sub(camera.position).normalize(),0,dst+.01),first=ray.intersectObjects(meshes,false)[0];return{part:p.part,front:first?.object.name,frontPart:first?.object.userData.part};});
      if(result.buttonVisibility.some(b=>b.frontPart!==b.part))throw Error('3D button obstructed '+JSON.stringify(result.buttonVisibility));
     }

     if(index===2&&label==='4+3 hit 9'){
      const objects=[];L.scene().scene.traverseVisible(o=>{if(o.isMesh)objects.push(o);});const ray=new THREE.Raycaster(camera.position,center.clone().sub(camera.position).normalize(),0,distance+.01);
      result.obstructions=ray.intersectObjects(objects,false).slice(0,6).map(hit=>{const ancestors=[];for(let o=hit.object;o;o=o.parent)ancestors.push({name:o.name,uuid:o.uuid,position:o.position.toArray()});return{distance:hit.distance,ancestors,mat:hit.object.material.name,point:hit.point.toArray()};});result.actors=L.scene().actors;result.me=L.view.priv.me;result.camera=camera.position.toArray();
     }
     if(live.length!==expected||ownDecor)throw Error('Card mismatch '+JSON.stringify(result));
     if(maxChipOffset>.55)throw Error('Chips miss circle '+maxChipOffset);
     if(label==='4+3 hit 9'&&(t.s.over||view.hands[0].total!==16))throw Error('7 plus 9 must stay in play');
     if(index===2&&label==='4+3 hit 9'&&result.obstructions[0]?.ancestors[0]?.name!=='blackjack-player-card')throw Error('Actual card view obstructed');
     return result;
    };
    setup([4,3]);rows.push(inspect('4+3 deal'));L.press('btn:hit');rows.push(inspect('4+3 hit 9'));
    if(index===2&&!fallback)rows.at(-1).png=document.getElementById('view').toDataURL('image/png');
    L.press('btn:stand');rows.push(inspect('stand result'));
    setup([4,3]);L.press('btn:double');rows.push(inspect('double result'));
    setup([10,9]);L.press('btn:hit');rows.push(inspect('bust'));
    setup([8,8],[9,8],2);L.press('btn:split');rows.push(inspect('split'));
    if(t.s.hands.length!==2)throw Error('Split failed');
    t.s.hands[0].cards=[2,2,2,2,2,2,2].map(r=>card(r));t.s.hands[1].cards=[2,2,2,2,2,2,2].map(r=>card(r));t.g.sync();rows.push(inspect('long split fans'));
    if(index===2&&!fallback)rows.at(-1).png=document.getElementById('view').toDataURL('image/png');
   }
   // Keep the clock monotonic until this isolated page closes.
   return rows;
  },fallback);
  for(const row of rows){if(row.png){fs.writeFileSync(`${out}/${row.viewport[0]}-${row.label.replaceAll(' ','-')}.png`,Buffer.from(row.png.split(',')[1],'base64'));delete row.png;}report.rows.push(row);}
  await p.close();
 }
 fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));assert.deepEqual(report.errors,[]);
 for(const row of report.rows){assert.equal(row.killerBar,0);assert.ok(!row.hint.includes('HIT'));assert.ok(row.distance<1.5);assert.ok(row.projected.every(p=>Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z<1));}
 console.log('PASS: 280 occupied desktop/compact seat/action states, one mesh per real card, no active-table decor, chips centered in printed circles, 4+3 hit remains live, all player cards visible and killer HUD absent; physical blackjack buttons are visible/raycastable in all ten seats and no screen action panel remains.');
}finally{await browser.close();}
