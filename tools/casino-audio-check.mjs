// The actual preloaded library, listening page, positional graph and cue lifecycle.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium} = createRequire(import.meta.url)(process.env.PW || 'playwright');
const browser = await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'],ignoreDefaultArgs:['--disable-gpu']});
const out = 'shots/casino-audio'; fs.mkdirSync(out,{recursive:true});
const errors=[], failed=[], requests=[];
try {
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(!r.ok())failed.push([r.status(),r.url()]);});
 await page.goto('https://10.42.0.37:3161/audio-review.html');
 await page.locator('#cues button').last().waitFor();
 assert.equal(await page.locator('#cues button').count(),16);
 const previews=[];
 for(const button of await page.locator('#cues button').all()){
  await button.click();await page.waitForFunction(()=>player.readyState>=2&&!player.paused&&player.currentTime>0);
  previews.push(await page.evaluate(()=>({src:player.src.split('/').at(-1),duration:player.duration,time:player.currentTime,error:player.error?.message||null})));
 }
 await page.getByRole('button',{name:'Use Last Wager',exact:true}).click();
 await page.getByRole('button',{name:'Use Card room',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('lc.score'),localStorage.getItem('lc.floorBed')]),['2','blackjack']);
 await page.screenshot({path:`${out}/review.png`,fullPage:true});
 await page.evaluate(()=>player.pause());
 await page.goto('https://10.42.0.37:3161/design/casino-layout.html');
 await page.getByRole('button',{name:'Skee-ball 02',exact:true}).click();
 assert.match(await page.locator('#detail').textContent(),/side-by-side/);
 const proposed=await page.locator('svg .object').count();
 await page.screenshot({path:`${out}/layout-proposed.png`});
 await page.getByRole('button',{name:'Current',exact:true}).click();
 const current=await page.locator('svg .object').count();assert.ok(current>proposed);
 await page.getByRole('button',{name:'Proposed',exact:true}).click();
 await page.addInitScript(()=>{
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(to,...a){if(to instanceof AudioDestinationNode && !(this.context instanceof OfflineAudioContext))window.__audioMaster=this;return connect.call(this,to,...a);};
 });
 page.on('request',r=>{if(r.url().includes('/cues/'))requests.push(r.url());});
 await page.goto('https://10.42.0.37:3161/');
 await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const atReady=requests.length;
 const result=await page.evaluate(async()=>{
  const a=await import('./src/audio.js'), ac=a.context();a.unlock();await ac.resume();a.setMusic(false);a.setMood('over');
  const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(3500);
  const loaded=a.cueInfo().loaded, saved=a.soundscape();
  const analyser=ac.createAnalyser();analyser.fftSize=4096;__audioMaster.connect(analyser);
  const capture=ac.createMediaStreamDestination();__audioMaster.connect(capture);
  const chunks=[],rec=new MediaRecorder(capture.stream);rec.ondataavailable=e=>chunks.push(e.data);rec.start();
  const samples=new Float32Array(analyser.fftSize);let rms=0;
  let t=100;Object.defineProperty(ac,'currentTime',{configurable:true,get:()=>t});
  const rand=Math.random;Math.random=()=>.5;
  const v={pub:{chars:[],blackout:false},priv:{me:0,alive:true}};
  a.setListener(1320,600,0);a.resetSceneCues();a.sceneCues(v,true);t=154;a.sceneCues(v,true);
  const behind=a.cueInfo(), fixed=behind.recent.at(-1);a.setListener(1320,600,Math.PI/2);
  const listener={x:ac.listener.forwardX.value,z:ac.listener.forwardZ.value};
  for(let i=0;i<20;i++){await wait(100);analyser.getFloatTimeDomainData(samples);rms=Math.max(rms,Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length));}
  a.sceneCues(v,false);const paused=a.cueInfo();a.resetSceneCues();
  t=200;v.pub.chars=[{id:1,x:1380,y:620,alive:true,moving:true}];a.sceneCues(v,true);t=201;v.priv.footsteps={seq:1,ids:[1]};a.sceneCues(v,true);const walking=a.cueInfo();
  v.pub.chars[0].moving=false;for(let i=0;i<5;i++){t+=.2;a.sceneCues(v,true);}const still=a.cueInfo();
  a.setSfx(false);const muted=a.cueInfo();t=300;a.sceneCues(v,true);const afterMute=a.cueInfo();
  a.setSfx(true);a.resetSceneCues();
  a.death('scream',.3,true,4,{at:[1800,1200],distant:true,event:'4:1'});
  a.death('scream',.3,true,4,{at:[1800,1200],distant:true,event:'4:1'});
  const distant=a.cueInfo();a.resetSceneCues();const reset=a.cueInfo();
  delete ac.currentTime;Math.random=rand;analyser.disconnect();__audioMaster.disconnect(analyser);
  await new Promise(r=>{rec.onstop=r;rec.stop();});
  __audioMaster.disconnect(capture);capture.stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  return{loaded,saved,behind,fixed,listener,rms,paused,walking,still,muted,afterMute,distant,reset,audio:btoa(binary)};
 });
 fs.writeFileSync(`${out}/breathing-in-game.webm`,Buffer.from(result.audio,'base64'));delete result.audio;
 fs.writeFileSync(`${out}/report.json`,JSON.stringify({previews,proposed,current,atReady,requests:requests.length,...result,failed,errors},null,2));
 assert.equal(Object.values(result.loaded).reduce((a,b)=>a+b,0),16);
 assert.equal(atReady,16);assert.equal(requests.length,16,'cues must be prepared before menu');
 assert.equal(result.saved.music,'2');assert.equal(result.saved.floor,'blackjack');
 assert.equal(result.fixed.kind,'breathBehind');assert.ok(result.fixed.x<1320);
 assert.ok(result.listener.z>.99);assert.ok(result.rms>.0001,'actual cue output must contain sound');
 assert.equal(result.paused.voices,0);assert.equal(result.muted.voices,0);assert.equal(result.afterMute.voices,0);
 assert.ok(result.walking.recent.some(x=>x.kind==='potatoStepCarpet'));
 assert.equal(result.still.recent.length,result.walking.recent.length,'standing actor must stop footfalls');
 assert.equal(result.distant.recent.length,1,'one cry for one real death event');
 assert.equal(result.distant.recent[0].kind,'distantDeath');assert.equal(result.distant.recent[0].muffle,true);
 assert.equal(result.reset.voices,0);assert.equal(result.reset.actors,0);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 console.log('PASS: all 16 previews play and preload, selections persist, positional breathing has audible output, real moving-character steps, distant-death deduplication and mute/pause/reset cleanup.',JSON.stringify({rms:result.rms,atReady,proposed,current}));
} finally {await browser.close();}
