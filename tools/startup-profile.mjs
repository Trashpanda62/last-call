// Sample startup CPU work and progress markers without changing game initialization.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PW||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-angle=vulkan','--enable-features=Vulkan','--ignore-gpu-blocklist','--enable-gpu-rasterization'],ignoreDefaultArgs:['--disable-gpu']});
try {
 const p=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}});
 await p.addInitScript(()=>{
  window.startupLong=[]; window.startupStages=[]; window.startupUploads=[]; window.startupPrograms=[]; window.startupGPUCalls=[];
  const getContext=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){
   const context=getContext.call(this,type,...args);
   if(type==='webgl2'&&context&&!context.startupHook){
    context.startupHook=true;const upload=context.texSubImage2D,link=context.linkProgram,use=context.useProgram,kinds=new WeakMap();let kind='';
    context.linkProgram=function(program){const stages=context.getAttachedShaders(program).map(shader=>{const source=context.getShaderSource(shader);return {type:context.getShaderParameter(shader,context.SHADER_TYPE),flags:(source.match(/^#define (?:SHADER_TYPE|SHADER_NAME|USE_INSTANCING(?:_COLOR)?|USE_SKINNING|USE_COLOR|USE_FOG|USE_SHADOWMAP|SHADOWMAP_TYPE_\w+|TONE_MAPPING|OPAQUE)\b.*$/gm)||[])};});kinds.set(program,stages[0].flags.filter(f=>/SHADER_TYPE|SHADER_NAME/.test(f)).join(' / '));startupPrograms.push({at:performance.now(),stage:document.querySelector('#bootStatus')?.textContent,shaders:stages});return link.call(this,program);};
    context.useProgram=function(program){kind=kinds.get(program)||'';return use.call(this,program);};
    for(const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','texStorage2D','renderbufferStorage','renderbufferStorageMultisample','blitFramebuffer']){
     const fn=context[method];context[method]=function(...a){const at=performance.now(),result=fn.apply(this,a),ms=performance.now()-at;if(ms>.75)startupGPUCalls.push({at,ms,method,kind,stage:document.querySelector('#bootStatus')?.textContent});return result;};
    }
    context.texSubImage2D=function(...args){const began=performance.now();const result=upload.apply(this,args),ms=performance.now()-began,source=args.at(-1);
     if(ms>1)startupUploads.push({at:began,ms,kind:source?.constructor?.name,width:source?.width,height:source?.height,src:source?.src?.replace(location.origin,'')});return result;
    };
   }return context;
  };
  new PerformanceObserver(l=>startupLong.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({entryTypes:['longtask']});
  new MutationObserver(()=>{const text=document.querySelector('#bootStatus')?.textContent;if(text&&startupStages.at(-1)?.text!==text)startupStages.push({at:performance.now(),text});}).observe(document,{subtree:true,childList:true,characterData:true});
 });
 const cdp=await p.context().newCDPSession(p); await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
 await p.goto('https://10.42.0.37:3161/');await p.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
 const {profile}=await cdp.send('Profiler.stop');
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map();for(const n of profile.nodes)for(const child of n.children||[])parents.set(child,n.id);
 const sums=new Map(),self=new Map();
 for(let i=0;i<profile.samples.length;i++){let id=profile.samples[i],us=profile.timeDeltas[i];self.set(id,(self.get(id)||0)+us);while(id){sums.set(id,(sums.get(id)||0)+us);id=parents.get(id);}}
 const rank=m=>[...m].map(([id,us])=>{const n=nodes.get(id);return {ms:Math.round(us/1000),fn:n.callFrame.functionName,url:n.callFrame.url.replace('https://10.42.0.37:3161/',''),line:n.callFrame.lineNumber+1};}).filter(x=>x.fn!=='(idle)'&&x.fn!=='(root)').sort((a,b)=>b.ms-a.ms).slice(0,35);
 const data={at:new Date().toISOString(),...(await p.evaluate(()=>({readyMs:__lastCall.S.boot.ms,longTasks:startupLong,stages:startupStages,uploads:startupUploads,programs:startupPrograms,gpuCalls:startupGPUCalls}))),self:rank(self),inclusive:rank(sums)};
 const out=process.argv[2]||'shots/startup-profile.json';fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(out,JSON.stringify(data,null,2));console.log(JSON.stringify(data));
}finally{await browser.close();}
