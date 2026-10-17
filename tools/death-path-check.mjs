// Real attacks, delayed delivery, seated/paused death, last-player end screen and private identity.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
const out=process.argv[2]||'shots/death-paths';fs.mkdirSync(out,{recursive:true});
try{
 const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack||e.message));
 await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const rows=await p.evaluate(async()=>{
  const {CFG}=await import('./src/config.js');
  const L=__lastCall;L.noLock();const clock=performance.now.bind(performance);let now=clock();performance.now=()=>now;const rows=[];
  try{
   for(const kind of ['knife','seated-paused','delayed-poison','rigged-game','monster','last-player']){
    L.start('gambler',{players:6,killers:1});L.step(.1);L.S.paused=true;
    const G=L.state,v=G.chars[0],k=G.chars[G.killerIds[0]];
    for(const c of G.chars){c.isHuman=true;c.x=1850;c.y=700+c.id*40;c.moving=false;}
    L.place(1320,600);L.look(0);L.step(0);now+=100;L.render();
    if(kind==='seated-paused'){
     const s=G.seats.find(s=>s.game==='bj');s.occ=s.claim=null;L.S.paused=false;L.place(s.x,s.y);L.look(s.face,-.7);L.step(.02);L.render();L.S.paused=true;document.getElementById('pause').classList.remove('hidden');
    }
    if(kind==='last-player')for(const c of G.chars)if(c!==v&&c!==k)c.alive=false;
    const seated=!!v.seat,face=v.look;k.x=v.x-Math.cos(face)*25;k.y=v.y-Math.sin(face)*25;k.look=face;k.cd.blade=0;
    // A disguise changes the visible actor; the victim must still learn the real killer's name.
    k.disguise={as:G.chars.find(c=>c!==v&&c!==k).id,t:30};
    let accepted=true;
    if(kind==='delayed-poison'){v.poisonT=.001;v.poisonBy=k.id;v.poisonKind='water';L.step(.02);G.t+=4;}
    else if(kind==='rigged-game'){
     const s=G.seats.find(s=>s.game==='bj');if(s.occ)s.occ.seat=null;s.occ=s.claim=null;
     k.x=s.x;k.y=s.y;k.cd.rig=0;L.S.sim.action(k.id,'rig');
     if(!G.traps.some(t=>t.kind==='seat'&&t.id===s.id))throw Error('Rig action did not arm the actual table');
     k.x=1850;k.y=700;L.place(s.x,s.y);L.look(s.face,-.7);L.step(.02);L.render();
     if(L.press('spot:main')!==true||!(v.trapT>0)||G.traps.some(t=>t.id===s.id))throw Error('Actual chip did not spring the trap');
     L.step(CFG.rigDelay+.1);accepted=!v.alive;
    }else if(kind==='monster'){
     k.cd.lights=0;L.S.sim.action(k.id,'lights');L.S.sim.action(k.id,'transform');
     if(!k.monster)throw Error('Real blackout/transform failed');
     L.S.sim.action(k.id,'blade');if(k.grab?.v!==v.id||v.grabbed!==k.id)throw Error('Monster did not grab the victim');
     L.step(CFG.monsterHold+.1);accepted=!v.alive;
    }else {L.S.sim.action(k.id,'blade');accepted=!v.alive;}
    L.step(0);const snapshot=L.view.priv.deathScene;
    const privateIdentity=G.chars.filter(c=>c!==v).every(c=>L.S.sim.view(c.id).priv.deathScene===null)&&L.S.sim.pubView().chars.every(c=>!('deathScene'in c)&&!('killer'in c));
    const phases=[],frames=[];let first;
    for(let i=0;i<38;i++){
     now+=100;L.S.paused=true;L.render();
     const d=L.scene().death;if(i===0)first={...d,paused:L.S.paused,pauseVisible:!document.getElementById('pause').classList.contains('hidden'),caption:document.getElementById('deathCaption').textContent};
     if(d.active&&!phases.includes(d.phase)){phases.push(d.phase);if(kind==='seated-paused')frames.push({phase:d.phase,png:document.getElementById('view').toDataURL('image/png')});}
    }
    rows.push({kind,cause:snapshot.cause,monster:snapshot.attacker?.monster===true,accepted,seated,alive:v.alive,age:G.t-snapshot.t,killer:k.name,sceneKiller:snapshot.killer,privateIdentity,over:!!G.over,first,phases,finished:!L.scene().death.active,deadline:L.S.deathUntil-now,frames});
   }
   return rows;
  }finally{/* Keep this isolated page's clock monotonic until the page closes. */}
 });
 await p.waitForFunction(()=>!document.getElementById('over').classList.contains('hidden'),null,{timeout:10000});
 for(const r of rows){for(const f of r.frames)fs.writeFileSync(`${out}/${r.kind}-${f.phase}.png`,Buffer.from(f.png.split(',')[1],'base64'));delete r.frames;}
 fs.writeFileSync(`${out}/report.json`,JSON.stringify({rows,errors},null,2));
 for(const r of rows){assert.equal(r.accepted,true,r.kind);assert.equal(r.alive,false,r.kind);assert.equal(r.first.active,true,r.kind);assert.equal(r.first.pauseVisible,false,r.kind);assert.equal(r.first.paused,false,r.kind);assert.match(r.first.caption,new RegExp(r.killer));assert.equal(r.privateIdentity,true);assert.equal(r.sceneKiller.name,r.killer);assert.deepEqual(r.phases,['reveal','jumpscare','collapse']);assert.equal(r.finished,true);assert.ok(r.deadline<=0);}
 assert.ok(rows.find(r=>r.kind==='delayed-poison').age>=4);assert.equal(rows.find(r=>r.kind==='seated-paused').seated,true);assert.equal(rows.find(r=>r.kind==='last-player').over,true);assert.equal(rows.find(r=>r.kind==='rigged-game').cause,'trap');assert.equal(rows.find(r=>r.kind==='monster').cause,'monster');assert.equal(rows.find(r=>r.kind==='monster').monster,true);assert.deepEqual(errors,[]);
 console.log('PASS: real knife, paused table kill, poison delayed four seconds, last-player kill, actual rig/chip/delay and blackout/transform/grab; every cinematic completes all three phases and privately names the real disguised attacker.');
}finally{await browser.close();}
