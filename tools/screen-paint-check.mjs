// Exercise the real machine screen descriptors against uncached painter output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist'],ignoreDefaultArgs:['--disable-gpu']});
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/src/3d/machines.js',async route=>{
    const response=await route.fetch(),source=await response.text();
    assert.ok(source.includes('const screens = [];'));
    await route.fulfill({response,body:source.replace('const screens = [];','const screens = []; window.__machineScreens = screens;')});
  });
  await page.goto('https://10.42.0.37:3161/');
  await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  const result=await page.evaluate(async()=>{
    const P=await import('./src/paint.js'),Gm=await import('./src/games.js'),L=__lastCall;
    L.noLock();L.start('killer',{players:6});L.step(.1);L.S.paused=true;L.render();
    let renderer;const scene=L.scene().scene,before=scene.onBeforeRender;
    scene.onBeforeRender=function(r,...a){renderer=r;return before.call(this,r,...a);};L.render();scene.onBeforeRender=before;
    const screens=__machineScreens,seats=(await import('./src/map.js')).makeSeats(),consoleFor=game=>screens.find(s=>seats.find(q=>q.id===s.seat)?.game===game).live;
    const slot=tier=>screens.find(s=>s.seat!=null&&s.live.canvas?.width===384&&s.arg({}).tier===tier).live;
    const bank=screens.find(s=>!s.mesh&&s.live.canvas?.width===512&&s.live.canvas?.height===320).live;
    const tote=screens.find(s=>s.live.canvas?.width===1536).live,tv=screens.find(s=>s.live.canvas?.width===640).live;
    const race={phase:'bet',t:0,pays:[2,3,4,5,6,7],winner:null,seed:42,bets:[]};
    const slotPaint=(g,w,h,t,a)=>P.paintSlots(g,w,h,t,a),bankPaint=P.paintBankBoard;
    const totePaint=(g,w,h,t,a)=>P.paintTote(g,w,h,t,a&&a.R,a&&a.me);
    const tvPaint=(g,w,h,t,a)=>a?.crash?P.paintCrash(g,w,h,t,a.C,a.me):totePaint(g,w,h,t,a);
    const consolePaint=paint=>(g,w,h,t,a)=>{paint(g,w,h,t,a&&a.v);if(a&&a.ui)P.paintUI(g,w,h,a.ui,paint===P.paintMines?'#3fff8a':'#ffa040');};
    const mineState={m:3,open:[1,5],mines:new Set([3,7,15]),over:false,dead:false,mult:1.5,next:1.8};
    const towerState={mode:'medium',eggs:Gm.TOWER.modes.medium.eggs,row:1,picks:[0],rows:Array.from({length:Gm.TOWER.rows},()=>new Set([1])),over:false,dead:false};
    const fixtures=[
      {name:'settled-slot',live:slot('penny'),paint:slotPaint,n:120,dt:1/30,state:()=>({tier:'penny',reels:['7','BAR','🍒'],win:'WIN $25',spin:{t0:-4},bet:10})},
      {name:'idle-slot',live:slot('high'),paint:slotPaint,n:40,dt:.25,state:()=>({tier:'high'})},
      {name:'crew-bank',live:bank,paint:bankPaint,n:60,dt:.3,state:()=>({bank:1234,target:200000})},
      {name:'race-waiting',live:tote,paint:totePaint,n:100,dt:.1,state:t=>({R:{...race,t},me:0})},
      {name:'race-countdown',live:tote,paint:totePaint,n:60,dt:.1,state:t=>({R:{...race,t,bets:[[0,1,20]]},me:0})},
      {name:'race-result',live:tote,paint:totePaint,n:50,dt:.1,state:t=>({R:{...race,phase:'show',winner:2,t},me:0})},
      {name:'race-running',live:tote,paint:totePaint,n:20,dt:.1,state:t=>({R:{...race,phase:'run',winner:2,t},me:0})},
      {name:'slot-spinning',live:slot('penny'),paint:slotPaint,n:60,dt:1/30,state:()=>({tier:'penny',reels:['7','7','7'],spin:{t0:0},win:'JACKPOT',bet:10})},
      {name:'tv-race-waiting',live:tv,paint:tvPaint,n:100,dt:.1,state:t=>({crash:false,R:{...race,t},me:0})},
      {name:'tv-rocket',live:tv,paint:tvPaint,n:30,dt:.1,state:()=>({crash:true,C:L.view.pub.crash,me:0})},
      {name:'mines-selected',live:consoleFor('mines'),paint:consolePaint(P.paintMines),n:120,dt:1/30,state:()=>({v:mineState,ui:[]})},
      {name:'tower-selected',live:consoleFor('tower'),paint:consolePaint(P.paintTower),n:120,dt:1/30,state:()=>({v:towerState,ui:[]})},
      {name:'mines-idle',live:consoleFor('mines'),paint:consolePaint(P.paintMines),n:60,dt:1/30,state:()=>null},
      {name:'tower-idle',live:consoleFor('tower'),paint:consolePaint(P.paintTower),n:60,dt:1/30,state:()=>null}
    ];
    const gl=renderer.getContext(),sub=gl.texSubImage2D;let target,uploads=0;
    gl.texSubImage2D=function(...a){if(a.at(-1)===target)uploads++;return sub.apply(this,a);};
    const timing=[],pixels=[];
    try {
      for(const q of fixtures){
        q.live.update(-1000,null);renderer.initTexture(q.live.tex);target=q.live.canvas;uploads=0;
        const version=q.live.tex.version,start=performance.now();
        for(let i=0;i<q.n;i++){const t=i*q.dt;q.live.update(t,q.state(t));renderer.initTexture(q.live.tex);}
        timing.push({name:q.name,updates:q.n,paints:q.live.tex.version-version,uploads,ms:performance.now()-start});
      }
      // Explicit state/clock transitions, including mutable objects, disappearing
      // data, three separate reel stops, win reveal, countdown edges and TV swaps.
      const checks=[];
      for(const tier of ['penny','high']){
        const live=slot(tier);
        checks.push({name:'slot-'+tier,live,paint:slotPaint,states:[
          ...[0,.25,.89,.9,1.24,1.25,1.59,1.6,1.69,1.7,1.71,2,2.99,3,3.01,4.8,5.1,6,30].flatMap(t=>[
            [t,{tier}], [t,{tier,reels:['BAR','7','🍒'],spin:{t0:0},win:'WIN $90',bet:50}],
            [t,{tier,reels:['💎','💎','💎'],bet:100}], [t,null]
          ]),[4,{tier,reels:['7','7','7'],win:'JACKPOT'}],[4.1,{tier,reels:['7','7','7'],win:'JACKPOT'}]
        ]});
      }
      const mutable={bank:10,target:100};
      checks.push({name:'bank',live:bank,paint:bankPaint,states:[[0,null],[1,{}],[2,{bank:0,target:100}],[3,{bank:10,target:100}],[4,{bank:10,target:200}],[5,{bank:300,target:200}],[6,null],[7,mutable],[8,mutable]],mutate:(i)=>{if(i===8)mutable.bank=99;}});
      const raceStates=[null,...['bet','run','show'].flatMap(phase=>[0,.01,.99,1,1.01,5,11.99,12,14.99,15].map(t=>({R:{...race,phase,t,winner:phase==='bet'?null:2,bets:t>0?[[0,1,20],[1,3,50]]:[]},me:0}))),
        {R:{...race,pays:[3,3,4,5,6,7]},me:0},{R:{...race,bets:[[0,1,20]]},me:1},{R:{...race,bets:[[0,1,25]]},me:0},{R:{...race,bets:[[0,2,25]]},me:0}];
      checks.push({name:'race',live:tote,paint:totePaint,states:raceStates.map((a,i)=>[i/10,a])});
      checks.push({name:'tv',live:tv,paint:tvPaint,states:raceStates.flatMap((a,i)=>[[i/10,a&&{...a,crash:false}],[i/10,{crash:true,C:L.view.pub.crash,me:0}],[i/10,a&&{...a,crash:false}]])});
      const ui={x:.1,y:.1,w:.3,h:.15,label:'CASH OUT',on:true,sel:false};
      const mineMutable={...mineState,open:[2],over:true,mines:new Set([4])},towerMutable={...towerState,picks:[0],over:true,rows:Array.from({length:Gm.TOWER.rows},()=>new Set([1]))};
      for(const [game,paint,st,mutable]of [['mines',P.paintMines,mineState,mineMutable],['tower',P.paintTower,towerState,towerMutable]]){
        const states=[...[0,.32,.333,.334,.49,.5,.51,.66,.667,.668,.99,1,1.01,2,5,30].flatMap(t=>[[t,null],[t,{v:st,ui:[]}],[t,{v:{...st,over:true,dead:false},ui:[{...ui}]}],[t,{v:{...st,over:true,dead:true},ui:[{...ui,on:false}]}]]),
          [31,{v:st,ui:[{...ui,sel:true}]}],[31,{v:st,ui:[{...ui,label:'TAKE WINNINGS'}]}],[31,{v:st,ui:[{...ui,x:.2}]}],
          [32,{v:mutable,ui:[]}],[32.1,{v:mutable,ui:[]}],[32.2,{v:mutable,ui:[]}]];
        checks.push({name:game,live:consoleFor(game),paint:consolePaint(paint),states,mutate:i=>{if(i===states.length-2){if(game==='mines'){mutable.open.push(4);mutable.mines.add(2);}else{mutable.picks.push(1);mutable.rows[0].add(0);}}if(i===states.length-1){if(game==='mines')mutable.mines.clear();else mutable.rows[0].clear();}}});
      }
      for(const q of checks){
        const {g,canvas}=q.live;let max=0,channels=0;const differences=[];
        // Compare the saved cached frame to a fresh paint on the same context.
        // Separate canvases can take different GPU/CPU rasterization paths for
        // the rocket curves; this also preserves the TV's inherited stroke state.
        // Prime full-size reads and each initial primitive before measuring:
        // Chromium can migrate the canvas to CPU rasterization on the first
        // complex readback (the mine icon otherwise crosses that boundary).
        for(const [t,a]of q.states.slice(0,4)){q.live.update(t,a);g.getImageData(0,0,canvas.width,canvas.height);}
        for(let i=0;i<q.states.length;i++){
          q.mutate?.(i);const [t,a]=q.states[i];q.live.update(t,a);
          const actual=g.getImageData(0,0,canvas.width,canvas.height).data;
          q.paint(g,canvas.width,canvas.height,t,a);const expected=g.getImageData(0,0,canvas.width,canvas.height).data;
          let changed=0;for(let j=0;j<actual.length;j++){const d=Math.abs(actual[j]-expected[j]);if(d){channels++;changed++;max=Math.max(max,d);}}
          if(changed)differences.push({index:i,time:t,changed});
        }
        pixels.push({name:q.name,states:q.states.length,maxChannelError:max,changedChannels:channels,...differences.length?{differences}:{}});
      }
    } finally {gl.texSubImage2D=sub;}
    return {timing,pixels,raceRunTime:Gm.RACE.runTime,gfx:L.gfx()};
  });
  const out=process.argv.find(a=>a.endsWith('.json'))||'shots/screen-paints.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),result,errors},null,2));
  console.log(JSON.stringify({timing:result.timing,pixels:result.pixels,errors}));assert.deepEqual(errors,[]);
  for(const q of result.pixels)assert.equal(q.changedChannels,0,q.name+' must match uncached pixels');
  if(!process.argv.includes('--baseline')){
    for(const name of ['settled-slot','crew-bank','race-waiting','race-result','tv-race-waiting','mines-selected','tower-selected']){const q=result.timing.find(q=>q.name===name);assert.equal(q.paints,1,name);assert.equal(q.uploads,1,name+' GPU uploads');}
    for(const name of ['race-running','tv-rocket']){const q=result.timing.find(q=>q.name===name);assert.equal(q.paints,q.updates,name+' remains animated');}
    assert.ok(result.timing.find(q=>q.name==='idle-slot').paints<20);
    assert.ok(result.timing.find(q=>q.name==='race-countdown').paints<10);
    for(const name of ['mines-idle','tower-idle'])assert.ok(result.timing.find(q=>q.name===name).paints<10,name+' keeps timed highlights');
  }
  console.log('PASS: real screen states preserve exact uncached pixels, animated displays keep moving'+(process.argv.includes('--baseline')?' (baseline measured).':', unchanged canvases avoid repeated painting/GPU uploads.'));
} finally {await browser.close();}
