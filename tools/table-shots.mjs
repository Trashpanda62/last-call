// Screenshots of every table game under the table camera, headless, with the HUD and the table bar.
//   node tools/table-shots.mjs [--url http://10.42.0.37:3160/] [--out shots] [--only roulette,bj] [--size 1280x720]
// Runs on the ml350's P100s through tools/shots-ml350.sh (Playwright from ~/ptd-runner there) against the dev preview
// on TrueNAS; without --url it serves this checkout itself. Automation never takes pointer lock (navigator.webdriver,
// and __lastCall.noLock()).
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ARG = arg('url', ''), OUT = arg('out', 'shots'), ONLY = arg('only', ''), [W, H] = arg('size', '1280x720').split('x').map(Number);
const { chromium } = require(process.env.PW || 'playwright');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
const root = path.resolve('.');
const server = URL_ARG ? null : http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const url = URL_ARG || await new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/`)));

const gpu = process.env.LC_GPU === 'vulkan' ? ['--use-angle=vulkan', '--enable-features=Vulkan'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: [...gpu, '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'], ignoreDefaultArgs: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, ignoreHTTPSErrors: !!URL_ARG });
await page.addInitScript(() => localStorage.setItem('lc.settings', JSON.stringify({ gfx: { preset: 'low' } })));
const errors = [], states=[];
page.on('pageerror', e => errors.push(String(e.message)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
await page.evaluate(() => {
  const L = window.__lastCall; L.noLock(); L.start('killer', { players: 6, killers: 1 }); L.step(1); // the only killer: nobody kills you during the long fast-forwards
  // walk up to a free spot at that game, facing it (the next free one if a bot beats you to it)
  window.sitAt = (game, idx = 0) => {
    if (L.view.priv.seat) { L.act('leave'); L.step(0.5); }
    const high=game==='slots'&&idx===12;if(high)idx=0;const free = L.state.seats.filter(s => s.game === game && (!high||s.tier==='high') && !s.occ && !s.claim);
    for (const seat of free.slice(idx).concat(free.slice(0, idx))) {
      L.look(seat.face, -0.3); L.place(seat.x - Math.cos(seat.face) * 30, seat.y - Math.sin(seat.face) * 30); L.step(1.7);
      if (L.view.priv.seat && L.view.priv.seat.game === game) return game;
    }
    return L.view.priv.seat && L.view.priv.seat.game;
  };
});
await page.waitForFunction(() => window.__lastCall.gfx().props >= 30, null, { timeout: 60000 }).catch(() => errors.push('props did not load'));
await page.waitForTimeout(1500);

const ev = (f, a) => page.evaluate(f, a);
const press = (...ps) => ev(ps => { window.__lastCall.render(); return ps.map(p => window.__lastCall.press(p)); }, ps);
// a key on the station's betting console (it is a part of its own, like the felt's spots)
const bar = async id => { const r = await ev(id => { window.__lastCall.render(); return window.__lastCall.press(id); }, id); if (r !== true) errors.push('no console key ' + id + ' (' + r + ')'); };
const sit = async (g, i = 0) => { const r = await ev(([g, i]) => window.sitAt(g, i), [g, i]); if (r !== g) errors.push(`could not sit at ${g}`); await page.waitForTimeout(1300); };
const shot = async name => { states.push({name,...await ev(()=>({game:__lastCall.table()?.game,status:__lastCall.bar()?.status,controls:document.querySelector('#gameControls')?.textContent}))});await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 85 }); console.log('shot', name, JSON.stringify(await ev(() => { const L = window.__lastCall, b = L.bar(); return [b && b.status, L.state.mode, L.view.priv.alive, L.view.priv.seat && L.view.priv.seat.game, L.state.over ? "OVER " + L.state.over.text : "t " + Math.round(L.state.t)].join(" / "); }))); };
const step = s => ev(s => window.__lastCall.step(s), s);

const SCENES = {
  roulette: async () => { await sit('roulette'); await press('spot:n17', 'spot:n17', 'spot:red', 'spot:d2', 'spot:c1', 'spot:n0'); await shot('roulette-bets'); await bar('btn:spin'); await page.waitForTimeout(1600); await shot('roulette-spin'); await page.waitForTimeout(3200); await shot('roulette-result'); },
  bj: async () => { await sit('bj', 2); await press('spot:main'); await bar('btn:hit'); await page.waitForTimeout(800); await shot('bj'); },
  slots: async () => { await sit('slots'); await press('spot:main'); await bar('btn:lever'); await page.waitForTimeout(2300); await shot('slots'); },
  slotsHigh: async () => { await sit('slots', 12); await press('spot:main'); await bar('btn:lever'); await page.waitForTimeout(2300); await shot('slots-high'); },
  plinko: async () => { await sit('plinko'); await press('spot:main'); await bar('btn:risk:high'); await bar('btn:drop'); await bar('btn:drop'); await page.waitForTimeout(900); await shot('plinko'); },
  mines: async () => { await sit('mines'); await press('spot:main'); await ev(() => window.__lastCall.pressScreen(0.2, 0.3)); await page.waitForTimeout(500); await shot('mines'); },
  tower: async () => { await sit('tower'); await press('spot:main'); await ev(() => window.__lastCall.pressScreen(0.2, 0.87)); await page.waitForTimeout(500); await shot('tower'); },
  crash: async () => { await sit('crash'); await press('spot:main'); await page.keyboard.press('Space'); await step(9); await page.waitForTimeout(1000); await shot('crash'); },
  coin: async () => { await sit('coin'); await press('spot:heads'); await bar('btn:flip'); await page.waitForTimeout(600); await shot('coin'); },
  wheel: async () => { await sit('wheel'); await press('spot:main'); await bar('btn:spin'); await page.waitForTimeout(1500); await shot('wheel'); },
  dice: async () => { await sit('dice'); await press('spot:pass', 'spot:field'); await bar('btn:roll'); await page.waitForTimeout(500); await shot('dice'); },
  // a real mouse click (press, 120 ms, release) on CASH OUT while the multiplier ticks: the bar must not swap the button
  cashout: async () => {
    await sit('crash');
    for (let tries = 0; tries < 8; tries++) {
      const ok = await ev(() => { const L = window.__lastCall; for (let i = 0; i < 900; i++) { const C = L.state.crash; if (C.phase === 'bet' && C.t < 1 && C.point >= 2.2) return true; L.step(0.1); } return false; });
      if (!ok) continue;
      await press('spot:main'); await page.keyboard.press('Space'); // chips in the circle are the bet for this rocket
      await page.waitForFunction(() => { const C = window.__lastCall.state.crash; return C.phase === 'fly' && C.mult > 1.25; }, null, { timeout: 30000 });
      const key=await ev(()=>{const L=__lastCall;L.aimAt('btn:cash');L.render();return L.parts().find(p=>p.part==='btn:cash');});if(!key)throw Error('no physical cash key');await page.mouse.click(key.x,key.y,{delay:120});
      await page.waitForTimeout(300);
      const r = await ev(() => { const L = window.__lastCall, b = L.state.crash.bets.get(L.view.priv.me); return b ? { out: b.out || null, mult: +L.state.crash.mult.toFixed(2), point: +L.state.crash.point.toFixed(2) } : null; });
      console.log('cashout', JSON.stringify(r));
      if (!r || !r.out) errors.push('CASH OUT click missed'); await shot('crash-cashout'); return;
    }
    errors.push('no rocket for the cash-out test');
  },
  race: async () => {
    // wait for a fresh betting window so the bet lands and the run follows it
    await ev(() => { const L = window.__lastCall; for (let i = 0; i < 400 && !(L.state.race.phase === 'bet' && L.state.race.t < 2); i++) L.step(0.25); });
    await sit('race'); await shot('race-bet'); await press('spot:duck2'); await press('btn:bet'); // START commits the staged chips for this race
    await ev(() => { const L = window.__lastCall; for (let i = 0; i < 400 && L.state.race.phase === 'bet'; i++) L.step(0.25); L.step(3); });
    await page.waitForTimeout(2500); await shot('race-run');
  },
};
for (const [k, f] of Object.entries(SCENES)) {
  if (ONLY && !ONLY.split(',').includes(k)) continue;
  try { await f(); } catch (e) { errors.push(k + ': ' + e.message); }
}
console.log('renderer', await ev(() => { const g = document.createElement('canvas').getContext('webgl2'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; }));
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({at:new Date().toISOString(),states,errors},null,2));
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no errors');
await browser.close(); if (server) server.close();
process.exit(errors.length ? 1 : 0);
