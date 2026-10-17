// Actual eating SFX and selector must share the prepared waveform without per-bite buffers.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const baseline=process.argv.includes('--baseline'),out=process.argv.find(s=>s.endsWith('.json'))||'shots/crunch-audio.json';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
 const rows=[],errors=[];
 for(const rate of [44100,48000]) {
  const p=await browser.newPage({ignoreHTTPSErrors:true});p.on('pageerror',e=>errors.push(e.stack||e.message));
  await p.route('**/crunch-check.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Eating sound check</title>'}));
  await p.goto('https://10.42.0.37:3161/crunch-check.html');
  rows.push(await p.evaluate(async rate=>{
   const Native=window.AudioContext;window.AudioContext=class extends Native {constructor(o){super({...o,sampleRate:rate});}};
   const proto=BaseAudioContext.prototype,create=proto.createBuffer,source=proto.createBufferSource,buffers=[],starts=[],stops=[];
   proto.createBuffer=function(...args){const buffer=create.apply(this,args);buffers.push({buffer,offline:this instanceof OfflineAudioContext});return buffer;};
   proto.createBufferSource=function(...args){const node=source.apply(this,args),start=node.start,stop=node.stop;node.start=function(...a){starts.push({buffer:this.buffer,offline:node.context instanceof OfflineAudioContext});return start.apply(this,a);};node.stop=function(...a){stops.push(this);return stop.apply(this,a);};return node;};
   try {
    const A=await import('./src/audio.js');await A.preloadAudio();A.setMood('over');A.restoreSounds();
    const before=buffers.length;starts.length=0;
    for(let i=0;i<8;i++){A.sfx('crunch');const next=A.context().currentTime+.055;while(A.context().currentTime<next)await new Promise(r=>setTimeout(r,5));}
    const bites=starts.filter(s=>!s.offline),biteBuffers=new Set(bites.map(s=>s.buffer)),allocated=buffers.length-before;
    starts.length=0;await A.previewSound('generated/eating-crunch');const preview=starts.find(s=>!s.offline)?.buffer;
    const samePreview=!!preview&&bites.length===8&&[...biteBuffers].every(b=>b===preview);
    A.stopSoundPreview();await new Promise(r=>setTimeout(r,80));stops.length=0;A.sfx('crunch');
    const active=A.audioInfo().activeEffects;A.setSoundKept('generated/eating-crunch',false);const afterMute=A.audioInfo().activeEffects,stopped=stops.length;
    starts.length=0;await new Promise(r=>setTimeout(r,35));A.sfx('crunch');const mutedStarts=starts.filter(s=>!s.offline).length;
    A.restoreSounds();
    // Independent original pair of noise bursts and filters, using the generated input samples.
    const inputs=buffers.filter(s=>s.offline&&[.12,.1].some(d=>s.buffer.length===Math.floor(rate*d))).slice(0,2);
    let waveform=null;
    if(inputs.length===2&&preview){
     const ctx=new OfflineAudioContext(1,Math.ceil(rate*.22),rate);
     for(let i=0;i<2;i++){
      const input=inputs[i].buffer,b=ctx.createBuffer(1,input.length,rate);b.copyToChannel(input.getChannelData(0),0);
      const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=b;f.type='highpass';f.frequency.value=i?1800:1500;g.gain.value=i?.2:.25;s.connect(f).connect(g).connect(ctx.destination);s.start(i?.1:0);
     }
     const expected=await ctx.startRendering(),a=preview.getChannelData(0),b=expected.getChannelData(0);let maxError=a.length===b.length?0:Infinity;
     for(let i=0;i<Math.min(a.length,b.length);i++)maxError=Math.max(maxError,Math.abs(a[i]-b[i]));
     const hash=async d=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',d))].map(x=>x.toString(16).padStart(2,'0')).join('');
     waveform={maxError,samples:a.length,actualHash:await hash(a),expectedHash:await hash(b)};
    }
    return{rate,bites:8,starts:bites.length,uniqueBiteBuffers:biteBuffers.size,allocated,samePreview,active,afterMute,stopped,mutedStarts,waveform};
   }finally{proto.createBuffer=create;proto.createBufferSource=source;window.AudioContext=Native;}
  },rate));await p.close();
 }
 fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),baseline,rows,errors},null,2));
 assert.deepEqual(errors,[]);
 if(!baseline)for(const r of rows){assert.equal(r.allocated,0);assert.equal(r.starts,r.bites);assert.equal(r.uniqueBiteBuffers,1);assert.ok(r.samePreview);assert.ok(r.active.includes('generated/eating-crunch'));assert.ok(!r.afterMute.includes('generated/eating-crunch'));assert.ok(r.stopped>0);assert.equal(r.mutedStarts,0);assert.equal(r.waveform.maxError,0);assert.equal(r.waveform.actualHash,r.waveform.expectedHash);}
 console.log(baseline?'BASELINE:':'PASS:',JSON.stringify(rows));
}finally{await browser.close();}
