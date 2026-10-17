// Exercise both new arcade cabinets using actual physical-button mouse clicks.
// Supports --url, --out and --fallback; captures desktop, compact and claw-release views.
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ARG = arg('url', ''), OUT = arg('out', 'shots/arcade-view'), FALLBACK = process.argv.includes('--fallback'), CAB = +arg('cab', '0');
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
try {
 const page=await browser.newPage({viewport:{width:1280,height:720},ignoreHTTPSErrors:true});page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.goto(base+(FALLBACK?'?noprops':''));await page.waitForFunction(()=>__lastCall?.S.ready,null,{timeout:120000});
 await page.evaluate(()=>{const L=__lastCall;L.noLock();L.start('killer',{players:4,killers:1});for(const c of L.state.chars){c.isHuman=true;if(c.seat)c.seat.occ=null;c.seat=null;}L.state.target=1e12;L.step(.1);});
 const click=async part=>{const p=await page.evaluate(part=>{const L=__lastCall;L.aimAt(part);L.render();return L.parts().find(p=>p.part===part);},part);if(!p)throw Error('no '+part);await page.mouse.click(p.x,p.y);await page.waitForTimeout(120);};
 for(const game of ['pusher','claw']) {
  await page.evaluate(game=>{const L=__lastCall;if(L.view.priv.seat){L.act('leave');L.step(.1);}const s=L.state.seats.find(s=>s.game===game);s.occ=s.claim=null;L.place(s.x,s.y);L.look(s.face,-.2);L.render();L.render();},game);
  await click('spot:main');await click('btn:start');
  await page.waitForFunction(game=>__lastCall.view.pub.arcade[game]?.phase==='aim',game);
  await click('btn:left');await page.waitForFunction(game=>__lastCall.view.pub.arcade[game].x<0,game);
  await click('btn:right');
  if(game==='claw'){await click('btn:back');await page.waitForFunction(()=>__lastCall.view.pub.arcade.claw.z<0);await click('btn:forward');}
  // Arrange a protected pusher cycle so the physical test verifies a positive payout; native rules also cover an unassisted one-coin return.
  if(game==='pusher')await page.evaluate(()=>{__lastCall.state.arcade.pusher.hot=true;});
  const count=1;const bankBefore=await page.evaluate(()=>__lastCall.state.bank);
  for(let n=1;n<=count;n++){
   await click('btn:drop');await page.waitForFunction(({game,n})=>__lastCall.view.pub.arcade[game].used===n,{game,n});
   await page.evaluate(()=>{const L=__lastCall;L.look(L.view.priv.seat.face,-.12);L.render();});
   await page.waitForTimeout(1100);
   if(n===1){await page.screenshot({path:path.join(OUT,game+'-live.jpg'),type:'jpeg',quality:90});if(game==='claw'){await page.waitForTimeout(1900);await page.screenshot({path:path.join(OUT,'claw-release.jpg'),type:'jpeg',quality:90});}}
   await page.waitForFunction(game=>['aim','done'].includes(__lastCall.view.pub.arcade[game].phase),game,{timeout:10000});
  }
  const row=await page.evaluate(game=>{const L=__lastCall,r=L.view.pub.arcade[game];return {game,phase:r.phase,used:r.used,score:r.score,mult:r.mult,paid:L.state.arcade[game].paid,round:r.id,assist:r.assist,bet:r.bet,net:r.net,bank:L.state.bank,status:L.bar()?.status};},game);
  row.bankBefore=bankBefore;if(Math.abs(row.bank-bankBefore-row.net)>.01)errors.push(game+': posted payout differs from real bank delta');if(row.net<=0)errors.push(game+': arranged winning cycle did not credit the bank');if(row.phase!=='done'||!row.paid)errors.push(game+': not settled');rows.push(row);await page.screenshot({path:path.join(OUT,game+'-paid.jpg'),type:'jpeg',quality:90});
  await page.setViewportSize({width:740,height:420});await page.evaluate(()=>__lastCall.render());await page.screenshot({path:path.join(OUT,game+'-compact.jpg'),type:'jpeg',quality:88});await page.setViewportSize({width:1280,height:720});
 }
}catch(e){errors.push(String(e.stack||e));}
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({at:new Date().toISOString(),fallback:FALLBACK,rows,errors},null,2));await browser.close();if(server)server.close();console.log(JSON.stringify({rows,errors}));process.exit(errors.length?1:0);
