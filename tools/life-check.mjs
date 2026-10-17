// Headless check that a table round in the air still reaches the bank through the page's own lifecycle (main.js):
//   leave  - a roulette spin is in the air and you press Leave game: the round settles before the game is dropped
//   hidden - a hidden host tab (rAF stopped, only the hidden-tab timer runs) whose player dies mid-spin: the table
//            closes and the round settles at once, not when the tab shows again after the 8 s grace has passed
// Solo games through the __lastCall hook; "host" is faked on a solo game (same tab code path, no guests).
//   node tools/life-check.mjs [--trials 3] [--url http://...]   (Playwright from $PW; serves this checkout without --url)
// Runs on the ml350, never Steve's PC. Automation never takes pointer lock (navigator.webdriver, __lastCall.noLock()).
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ARG = arg('url', ''), TRIALS = +arg('trials', 3);
const { chromium } = require(process.env.PW || 'playwright');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml' };
const root = path.resolve('.');
const server = URL_ARG ? null : http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
const url = URL_ARG || await new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/`)));
const gpu = process.env.LC_GPU === 'vulkan' ? ['--use-angle=vulkan', '--enable-features=Vulkan'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: [...gpu, '--autoplay-policy=no-user-gesture-required'] });

// A solo game at roulette with chips on red and the wheel spinning; sim.action logs each 'bank' with the bank
// either side of it.
async function spinning(page) {
  await page.goto(url);
  await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__lastCall.gfx().props >= 30, null, { timeout: 60000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const L = window.__lastCall; L.noLock(); L.start('gambler', { players: 6, killers: 1 }); L.step(1);
    const free = L.state.seats.filter(s => s.game === 'roulette' && !s.occ && !s.claim);
    for (const seat of free) {
      L.look(seat.face, -0.3); L.place(seat.x - Math.cos(seat.face) * 30, seat.y - Math.sin(seat.face) * 30); L.step(1.7); // walking up takes it
      if (L.view.priv.seat && L.view.priv.seat.game === 'roulette') break;
    }
    if (!(L.view.priv.seat && L.view.priv.seat.game === 'roulette')) return 'could not sit';
    const sim = L.S.sim, orig = sim.action;
    window.bankLog = [];
    sim.action = (id, k, a) => { const before = sim.G.bank; const out = orig(id, k, a); if (k === 'bank') window.bankLog.push({ ...a, before, after: sim.G.bank, t: sim.G.t }); return out; };
    window.lc = { sim, me: sim.G.chars[L.S.myId] };
    return 'ok';
  });
  if (r !== 'ok') return r;
  await page.waitForFunction(() => window.__lastCall.table(), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const ok = await page.evaluate(() => {
    const L = window.__lastCall; L.press('spot:red');
    L.press('btn:spin'); // the SPIN key on the station's betting console
    return !!(L.bar() && /NO MORE BETS/.test(L.bar().status || ''));
  });
  return ok ? 'ok' : 'the wheel did not spin';
}
// One settlement reached the sim and moved the bank by what it settled for (comp 10%; no lucky pretzels in play here).
const settled = log => {
  if (log.length !== 1) return `${log.length} settlements reached the sim`;
  const a = log[0], net = Math.round(a.d + a.b * 0.1);
  return a.after - a.before === net ? null : `settlement d ${a.d} b ${a.b} moved the bank ${a.after - a.before}, want ${net} (rejected)`;
};

const CASES = {
  async leave(page) {
    const r = await spinning(page); if (r !== 'ok') return r;
    await page.evaluate(() => { document.getElementById('quitBtn').click(); });
    await page.waitForTimeout(300);
    return settled(await page.evaluate(() => window.bankLog));
  },
  async hidden(page) {
    const r = await spinning(page); if (r !== 'ok') return r;
    await page.evaluate(() => {
      const L = window.__lastCall, lc = window.lc;
      L.S.role = 'host';                                                    // a host tab...
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); // ...that is hidden
      window.rafOrig = window.requestAnimationFrame;
      window.requestAnimationFrame = cb => { window.parked = cb; return 0; }; // its frame loop stops
      // the crowd stands still in the VIP lounge: no bot finds the body or rings the bell (a meeting would pause the grace)
      for (const c of lc.sim.G.chars) if (!c.isHuman) { c.state = 'rest'; c.path = []; c.wait = 1e5; c.x = 2600; c.y = 1700; c.posVer++; for (const k in c.cd) c.cd[k] = 1e5; }
      lc.me.poisonT = 0.001; lc.me.poisonBy = lc.sim.G.killerIds[0];        // and the player dies on the next tick
      // nobody reports the body, so play (and its clock) goes on: a meeting would pause the 8 s grace
      window.noReport = setInterval(() => { for (const b of lc.sim.G.bodies) b.reported = true; lc.sim.G.pending = null; }, 20);
    });
    await page.waitForTimeout(10000);                                        // longer than the 8 s grace
    const st = await page.evaluate(() => { clearInterval(window.noReport); return { alive: window.lc.me.alive, mode: window.lc.sim.G.mode }; }), dead = !st.alive && st.mode === 'play';
    await page.evaluate(() => { delete document.hidden; window.requestAnimationFrame = window.rafOrig; window.requestAnimationFrame(window.parked); });
    await page.waitForTimeout(1500);                                         // the tab shows again
    if (!dead) return `the player did not die while hidden, or a meeting started (alive ${st.alive}, ${st.mode})`;
    const log = await page.evaluate(() => window.bankLog);
    // in the hidden tick the player died in: one tick carries up to 1.5 s of play (main.js simStep), far short of the 8 s grace
    return settled(log) || (log[0].t - (await page.evaluate(() => window.lc.me.leftSeatT)) > 1.6 ? 'settled late' : null);
  },
};

const out = {};
for (const [name, fn] of Object.entries(CASES)) {
  const r = out[name] = { pass: 0, fail: 0, examples: [] };
  for (let i = 0; i < TRIALS; i++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: !!URL_ARG });
    await page.addInitScript(() => localStorage.setItem('lc.settings', JSON.stringify({ gfx: { preset: 'low' }, voice: { mode: 'off' } })));
    const errs = []; page.on('pageerror', e => errs.push(String(e.message)));
    let why;
    try { why = await fn(page); } catch (e) { why = 'error: ' + e.message; }
    if (!why && errs.length) why = 'page error: ' + errs[0];
    if (why) { r.fail++; if (r.examples.length < 3) r.examples.push(why); } else r.pass++;
    await page.close();
  }
}
await browser.close(); if (server) server.close();
const fail = Object.values(out).some(r => r.fail);
console.log(JSON.stringify({ trials: TRIALS, result: fail ? 'FAIL' : 'PASS', ...out }));
process.exit(fail ? 1 : 0);
