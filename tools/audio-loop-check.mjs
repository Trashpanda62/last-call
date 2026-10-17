// Compare loop gain envelopes with the original per-frame automation schedule.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/audio-loop-check.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Audio loop regression</title>'}));
  await page.goto('https://10.42.0.37:3161/audio-loop-check.html');
  const result=await page.evaluate(async()=>{
    const A=await import('/src/audio.js');await A.preloadAudio();A.unlock();A.setMood('over');
    const ac=A.context(),base=ac.currentTime+.1,createGain=ac.createGain.bind(ac),target=AudioParam.prototype.setTargetAtTime,rows=[];
    let clock=base,capture=null;
    Object.defineProperty(ac,'currentTime',{configurable:true,get:()=>clock});
    ac.createGain=function(){const node=createGain();if(capture)capture.nodes.push({param:node.gain,born:clock-base,events:[]});return node;};
    AudioParam.prototype.setTargetAtTime=function(value,time,tau){const node=capture?.nodes.find(n=>n.param===this);if(node)node.events.push({value,time:time-base,tau});return target.call(this,value,time,tau);};
    try {
      for(const [kind,scale,tau,tail]of [['growl',1,.08,.4],['hum',.16,.15,.8]]){
        const calls=[],segments=[['steady',120,.25],['moving',24,i=>[.25,.4,.4,.7,1,1.5,2,.6][i%8]],['silent',120,0],['restart',60,.25],['silent-again',120,0]];
        capture={nodes:[]};let tick=0;
        const counts=[];
        for(const [name,n,level]of segments){const before=capture.nodes.reduce((s,n)=>s+n.events.length,0);for(let i=0;i<n;i++){const v=typeof level==='function'?level(i):level;clock=base+tick++/60;calls.push({time:clock-base,value:Math.min(1,v)*scale,input:v});A[kind](v);}counts.push({name,calls:n,events:capture.nodes.reduce((s,n)=>s+n.events.length,0)-before});}
        const nodes=capture.nodes;capture=null;
        // Each real loop starts at zero, follows the requested volume and fades
        // for its existing stop delay. Render actual and original schedules in
        // two offline channels, including re-entry and clamped volume changes.
        const rate=48000,end=tick/60+tail+.1,offline=new OfflineAudioContext(2,Math.ceil(end*rate),rate);
        const add=(events,born,stop,channel)=>{
          const source=offline.createConstantSource(),gain=offline.createGain(),merger=offline.createChannelMerger(2);gain.gain.value=0;
          for(const e of events)gain.gain.setTargetAtTime(e.value,Math.max(0,e.time),e.tau);
          source.connect(gain).connect(merger,0,channel);merger.connect(offline.destination);source.start(Math.max(0,born));source.stop(stop);
        };
        const data=[];
        for(const node of nodes){
          const stopCall=calls.find(c=>c.time>=node.born-1e-8&&c.input<=.001),stop=(stopCall?.time??tick/60)+tail;
          const last=kind==='hum'&&stopCall?stopCall.time:stop;
          const expected=calls.filter(c=>c.time>=node.born-1e-8&&c.time<=last+1e-8).map(c=>({value:c.value,time:c.time,tau}));
          add(node.events,node.born,stop,0);add(expected,node.born,stop,1);
          data.push({born:node.born,stop,events:node.events});
        }
        const rendered=await offline.startRendering(),actual=rendered.getChannelData(0),expected=rendered.getChannelData(1);let max=0,sum=0;
        for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-expected[i]);max=Math.max(max,d);sum+=d*d;}
        // Redundant native automation boundaries quantize exponential ramps at
        // sample edges. Bound that difference by two samples at maximum slope.
        rows.push({kind,counts,nodes:data,maxSampleError:max,rmsError:Math.sqrt(sum/actual.length),sampleTolerance:2*scale/(rate*tau),samples:actual.length});
        clock+=2;
      }
    }finally{AudioParam.prototype.setTargetAtTime=target;delete ac.currentTime;ac.createGain=createGain;}
    return {rows,audio:A.audioInfo()};
  });
  const out=process.argv.find(a=>a.endsWith('.json'))||'shots/audio-loops.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),result,errors},null,2));
  console.log(JSON.stringify({rows:result.rows.map(r=>({...r,nodes:r.nodes.map(n=>({born:n.born,stop:n.stop,events:n.events.length}))})),errors}));
  assert.deepEqual(errors,[]);
  for(const row of result.rows){assert.equal(row.nodes.length,2,'one source per entry');assert.ok(row.maxSampleError<row.sampleTolerance,'preserve gain envelope within two samples of the maximum exponential slope');if(!process.argv.includes('--baseline')){
    assert.equal(row.counts.find(c=>c.name==='steady').events,1);assert.equal(row.counts.find(c=>c.name==='restart').events,1);
    assert.equal(row.counts.find(c=>c.name==='silent').events,1);assert.equal(row.counts.find(c=>c.name==='silent-again').events,1);
  }}
  console.log('PASS: growl/hum start, clamped volume changes, fades and re-entry match original offline gain envelopes'+(process.argv.includes('--baseline')?' (baseline measured).':'; steady and stopped loops avoid repeated automation.'));
}finally{await browser.close();}
