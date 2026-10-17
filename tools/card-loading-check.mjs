// Exercise every blackjack face after readiness, measuring deferred card painting/uploads.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const b=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto(process.env.LC_URL||'https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const result=await p.evaluate(async()=>{
  const L=__lastCall,T=await import('./src/3d/textures.js');L.noLock();L.start('killer');L.step(.1);L.S.paused=true;
  const seat=L.state.seats.find(s=>s.game==='bj'&&!s.occ);L.place(seat.x,seat.y);L.look(seat.face,-.5);L.step(.1);L.render();L.press('spot:main');L.press('btn:deal');L.render();
  const view=L.table().view;if(!view)throw new Error('blackjack setup failed');view.dealer=[];view.hide=false;
  let renderer;const scene=L.scene().scene,before=scene.onBeforeRender;scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;
  const gl=renderer.getContext(),sub=gl.texSubImage2D,paint=CanvasRenderingContext2D.prototype.fillText;let uploads=0,painted=new Set();
  gl.texSubImage2D=function(...a){const im=a.at(-1);if(im?.width===256&&im?.height===360)uploads++;return sub.apply(this,a);};
  CanvasRenderingContext2D.prototype.fillText=function(...a){if(this.canvas.width===256&&this.canvas.height===360)painted.add(this.canvas);return paint.apply(this,a);};
  const cards=['♠','♥','♦','♣'].flatMap(suit=>['A','2','3','4','5','6','7','8','9','10','J','Q','K'].map(rank=>({rank,suit}))),rows=[];
  let first,repeat;
  try {
   for(let pass=0;pass<2;pass++) {
    uploads=0;painted=new Set();
    for(const c of cards){view.hands=[{cards:[c],total:1,bet:1,active:true}];L.render();if(pass===0){let mesh;scene.traverseVisible(o=>{if(o.name==='blackjack-player-card')mesh=o;});rows.push({label:c.rank+c.suit,correctMap:mesh?.material.map===T.cardTex(c.rank+c.suit,c.suit==='♥'||c.suit==='♦'),size:[mesh?.geometry.parameters.width,mesh?.geometry.parameters.height]});}}
    if(pass===0)first={painted:painted.size,uploads};else repeat={painted:painted.size,uploads};
   }
  }finally{gl.texSubImage2D=sub;CanvasRenderingContext2D.prototype.fillText=paint;}
  return {first,repeat,rows,gfx:L.gfx()};
 });
 const out=process.argv.find(a=>a.endsWith('.json'))||'shots/card-loading.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),result,errors},null,2));
 console.log(JSON.stringify({first:result.first,repeat:result.repeat,faces:result.rows.length}));assert.deepEqual(errors,[]);assert.equal(result.rows.length,52);assert.ok(result.rows.every(r=>r.correctMap&&r.size[0]===.2&&r.size[1]===.29),'all faces retain the original full-resolution card texture and geometry');
 assert.deepEqual(result.repeat,{painted:0,uploads:0});if(!process.argv.includes('--baseline'))assert.deepEqual(result.first,{painted:0,uploads:0},'every card face must already be prepared at readiness');
 console.log(process.argv.includes('--baseline')?'PASS: all 52 faces measured; repeated use prepared.':'PASS: all 52 blackjack faces prepared before readiness, with no deferred painting or image uploads.');
}finally{await b.close();}
