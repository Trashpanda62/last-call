// Plinko: film a real drop at a cabinet, standing at the seat, frame by frame (the ball has to be seen falling and
// landing in its channel), at each risk.
//   node tools/plinko-drop-film.mjs [--url https://10.42.0.37:3161/] [--out shots/plinko-film] [--fallback] [--cab 0]
// Without --url it serves this checkout. Headless only; automation never takes pointer lock (navigator.webdriver and
// __lastCall.noLock()).
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ARG = arg('url', ''), OUT = arg('out', 'shots/machine-bets'), FALLBACK = process.argv.includes('--fallback'), CAB = +arg('cab', '0');
const { chromium } = require(process.env.PW || 'playwright');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const root = path.resolve('.');
const server = URL_ARG ? null : http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(p).pipe(res);
});
const base = URL_ARG || await new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/`)));
const gpu = process.env.LC_GPU === 'vulkan' ? ['--use-angle=vulkan', '--enable-features=Vulkan'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: [...gpu, '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
const errors = [], rows = [], supports = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.goto(base+(FALLBACK?'?noprops':''));
  await page.waitForFunction(()=>window.__lastCall?.S.ready,null,{timeout:120000});
  await page.evaluate(()=>{const L=__lastCall;L.noLock();L.start('killer',{players:4,killers:1});for(const c of L.state.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;}L.state.target=1e12;L.step(.1);});
  const surfaces = await page.evaluate(async()=>{
    const THREE=await import('three'),L=__lastCall,{scene}=L.scene();scene.updateMatrixWorld(true);
    const sockets=[],objects=[];scene.traverse(o=>{if(o.userData.betSocket)sockets.push(o);if(o.isMesh&&(o.visible||o.userData.fixedScenery)&&!o.userData.betSocket)objects.push(o);});
    const ray=new THREE.Raycaster();return sockets.map(m=>{const p=m.getWorldPosition(new THREE.Vector3());p.y+=.3;ray.set(p,new THREE.Vector3(0,-1,0));ray.far=.65;const hits=ray.intersectObjects(objects,false).filter(h=>{let o=h.object;if(!o.userData.fixedScenery)while(o){if(!o.visible)return false;o=o.parent;}const mat=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;return mat.visible!==false&&!(mat.transparent&&mat.opacity<.5);});return {name:m.name,...m.userData.betSocket,support:hits[0] ? .3-hits[0].distance : null};});
  });
  supports.push(...surfaces);for(const s of surfaces)if(s.support===null||s.support>-.003||s.support<-.03)errors.push('unsupported '+s.name);
  const games=['crash','plinko','race','slots','mines','tower','wheel','coin','skee','bj','roulette','dice','pusher','claw'];
  for(const game of games){
    await page.evaluate(game=>{const L=__lastCall;if(L.view.priv.seat){L.act('leave');L.step(.1);}const s=L.state.seats.find(s=>s.game===game);if(s.occ)s.occ.seat=null;s.occ=s.claim=null;L.look(s.face,-.65);L.place(s.x,s.y);L.render();L.render();},game);
    const part=game==='race'?'spot:duck2':game==='coin'?'spot:heads':game==='roulette'?'spot:red':game==='dice'?'spot:pass':'spot:main';
    const point=await page.evaluate(part=>{const L=__lastCall;L.aimAt(part);L.render();return L.parts().find(p=>p.part===part);},part);
    if(!point){errors.push(game+': no betting circle');continue;}
    await page.mouse.click(point.x,point.y);await page.waitForTimeout(250);
    const row=await page.evaluate(async({game,part})=>{const THREE=await import('three'),L=__lastCall,{scene}=L.scene(),chips=scene.getObjectByName('player-bet-chips'),socket=scene.getObjectByName('bet-circle-'+L.view.priv.seat.id+'-'+part.slice(5));const out={game,seat:L.view.priv.seat.id,stacks:L.table().stacks.length,instances:chips.count,socket:socket?.name||'felt',error:null};if(!chips.count)out.error='no physical chips';if(socket&&chips.count){const m=new THREE.Matrix4();chips.getMatrixAt(0,m);const v=new THREE.Vector3().setFromMatrixPosition(m);chips.localToWorld(v);out.centerError=Math.hypot(v.x-socket.position.x,v.z-socket.position.z);out.bottomGap=v.y-.0095*1.25/2-socket.userData.betSocket.top;if(out.centerError>.001||out.bottomGap<0||out.bottomGap>.005)out.error='stack outside or above its socket';}if(socket){const {camera}=L.scene(),objects=[];scene.traverse(o=>{if(o.isMesh&&o.visible){let p=o;while(p){if(!p.visible)return;p=p.parent;}objects.push(o);}});const ray=new THREE.Raycaster();out.clear=0;out.blockers=[];for(const [x,z]of[[.065,0],[-.065,0],[0,.065],[0,-.065]]){const target=socket.position.clone().add(new THREE.Vector3(x,.006,z));ray.set(camera.position,target.clone().sub(camera.position).normalize());ray.far=camera.position.distanceTo(target)+.002;const h=ray.intersectObjects(objects,false).find(h=>{const m=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;return m.visible!==false&&!(m.transparent&&m.opacity<.5);});if(h?.object===socket||h?.object===chips)out.clear++;else out.blockers.push(h?.object.name||'none');}if(out.clear<4)out.error='circle obscured '+out.blockers.join(',');}return out;},{game,part});
    rows.push(row);if(row.error)errors.push(game+': '+row.error);
    await page.screenshot({path:path.join(OUT,game+'-chips.jpg'),type:'jpeg',quality:88});
  }
} catch(e){errors.push(String(e.stack||e));}
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({at:new Date().toISOString(),fallback:FALLBACK,rows,supports,errors},null,2));
await browser.close();if(server)server.close();console.log(JSON.stringify({rows,supports:supports.length,errors}));process.exit(errors.length?1:0);
