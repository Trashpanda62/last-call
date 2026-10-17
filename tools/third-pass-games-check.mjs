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
const URL_ARG = arg('url', ''), OUT = arg('out', 'shots/third-pass-games'), FALLBACK = process.argv.includes('--fallback'), CAB = +arg('cab', '0');
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
const errors=[],rows=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:720},ignoreHTTPSErrors:true});page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.goto(base+(FALLBACK?'?noprops':''));await page.waitForFunction(()=>__lastCall?.S.ready,null,{timeout:120000});
 await page.evaluate(()=>{const L=__lastCall;L.noLock();L.start('killer',{players:4,killers:1});for(const c of L.state.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;}L.state.target=1e12;L.step(.1);});
 const go=async(game,machine=0)=>page.evaluate(({game,machine})=>{const L=__lastCall;if(L.view.priv.seat){L.act('leave');L.step(.1);}const s=L.state.seats.filter(s=>s.game===game)[machine];if(s.occ)s.occ.seat=null;s.occ=s.claim=null;L.place(s.x,s.y);L.look(s.face,-.3);L.render();L.render();},{game,machine});
 const click=async part=>{const p=await page.evaluate(part=>{const L=__lastCall;L.aimAt(part);L.render();return L.parts().find(p=>p.part===part);},part);if(!p)throw Error('no '+part);await page.mouse.click(p.x,p.y);await page.waitForTimeout(100);};
 const ballState=()=>page.evaluate(async()=>{const THREE=await import('three'),L=__lastCall,{scene,camera}=L.scene(),seat=L.view.priv.seat,machine=L.state.seats[seat.id].machine,ball=scene.getObjectByName('plinko-live-ball-'+machine+'-0');const objects=[];scene.traverse(o=>{if(o.isMesh&&o.visible){let p=o;while(p){if(!p.visible)return;p=p.parent;}objects.push(o);}});const ray=new THREE.Raycaster(camera.position,ball.position.clone().sub(camera.position).normalize());ray.far=camera.position.distanceTo(ball.position)+.04;const hit=ray.intersectObjects(objects,false).find(h=>{const mat=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;return mat.visible!==false&&!(mat.transparent&&mat.opacity<.5);});const p=ball.position.clone().project(camera),v=L.table().view;return {risk:v.risk,ball:ball.visible,screen:[p.x,p.y,p.z],visible:hit?.object===ball,blocker:hit?.object?.name,position:ball.position.toArray(),path:v.balls[0]?.path,mark:scene.getObjectByName('plinko-mark-'+machine)?.visible,gates:['low','medium'].map(k=>({risk:k,visible:scene.getObjectByName('plinko-gate-'+k+'-'+machine).visible}))};});
 for(const machine of[0,1])for(const risk of['low','medium','high']){
  await go('plinko',machine);await click('btn:risk:'+risk);await click('btn:drop');
  const started=await page.evaluate(()=>__lastCall.table().view.balls.length);if(started!==1)errors.push('Plinko '+machine+'/'+risk+': real DROP failed');
  await page.evaluate(()=>{const L=__lastCall;L.look(L.view.priv.seat.face,.08);L.render();});
  const samples=[];let last=0;for(const at of[.35,1.0,2.05]){await page.waitForTimeout((at-last)*1000);last=at;const state=await ballState();samples.push(state);if(!state.visible||!state.ball||Math.abs(state.screen[0])>=1||Math.abs(state.screen[1])>=1)errors.push('Plinko '+machine+'/'+risk+': ball hidden at '+at+' by '+state.blocker);await page.screenshot({path:path.join(OUT,'plinko-'+machine+'-'+risk+'-'+at+'.jpg'),type:'jpeg',quality:86});}
  const landed=samples.at(-1);if(!landed.mark)errors.push('Plinko '+machine+'/'+risk+': no landed channel');if(landed.risk!==risk)errors.push('Plinko risk button failed');rows.push({game:'plinko',machine,risk,started,samples});await page.waitForTimeout(1600);
 }
 const stations=await page.evaluate(()=>__lastCall.state.seats.filter(s=>s.game==='race').length);if(stations!==1)errors.push('expected exactly one derby pedestal');
 for(let seat=0;seat<stations;seat++){
  await go('race',seat);await page.evaluate(()=>{const R=__lastCall.state.race;R.phase='bet';R.t=0;R.bets.clear();});await page.waitForTimeout(100);
  await click('spot:duck2');const pending=await page.evaluate(()=>__lastCall.state.race.bets.has(__lastCall.S.myId));if(pending)errors.push('race committed before START');
  await click('btn:bet');await page.waitForFunction(()=>__lastCall.state.race.bets.has(__lastCall.S.myId));
  await click('spot:duck5');await page.waitForFunction(()=>__lastCall.state.race.bets.get(__lastCall.S.myId)?.duck===5);
  await page.screenshot({path:path.join(OUT,'race-station-'+seat+'.jpg'),type:'jpeg',quality:86});
  const row=await page.evaluate(()=>{const L=__lastCall,R=L.state.race;return {game:'race',seat:L.view.priv.seat.id,bet:R.bets.get(L.S.myId),gates:L.scene().scene.getObjectByName('race-start-gate-0').rotation.z};});rows.push(row);
  await page.evaluate(()=>{const L=__lastCall;L.step(15);L.look(L.view.priv.seat.face,-.12);L.render();});await page.waitForTimeout(100);
  const pond=await page.evaluate(async()=>{const THREE=await import('three'),L=__lastCall,{scene,camera}=L.scene(),panels=[];scene.traverseVisible(o=>{if(o.isMesh&&/^race-odds-/.test(o.name))panels.push(o);});const ray=new THREE.Raycaster(),rows=[];for(let i=0;i<6;i++){const duck=scene.getObjectByName('derby-duck-'+i),target=duck.getWorldPosition(new THREE.Vector3()).setY(.73);ray.set(camera.position,target.clone().sub(camera.position).normalize());ray.far=camera.position.distanceTo(target);rows.push({duck:i,oddsBlockers:ray.intersectObjects(panels,false).map(h=>h.object.name)});}return{fold:scene.getObjectByName('race-odds-hinge-'+L.view.priv.seat.id).rotation.x,rows};});
  row.pond=pond;if(Math.abs(pond.fold-Math.PI/2)>.001||pond.rows.some(r=>r.oddsBlockers.length))errors.push('race odds obstruct pond at station '+seat);
  await page.screenshot({path:path.join(OUT,'race-running-'+seat+'.jpg'),type:'jpeg',quality:86});
 }
}catch(e){errors.push(String(e.stack||e));}
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({at:new Date().toISOString(),fallback:FALLBACK,rows,errors},null,2));await browser.close();if(server)server.close();console.log(JSON.stringify({rows:rows.length,errors}));process.exit(errors.length?1:0);
