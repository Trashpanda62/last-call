// Steve, 2026-10-16: "the game you are on should continue regardless of if you are there or not, I should be able to run
// and have a row of slot machines all spinning at once"; "games like blackjack should continue to cancel the hand when
// you get more than 10 feet from the table". Also the duck race takes the chips on a duck as the bet (no SPACE), and
// Plinko's lower risks gate the outer channels.
//   node tools/background-tables-check.mjs [--url https://10.42.0.37:3161/] [out.json] [--fallback]
// Headless only; automation never takes pointer lock (navigator.webdriver and __lastCall.noLock()).
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ARG = arg('url', ''), FALLBACK = process.argv.includes('--fallback'), OUT = process.argv.find(a => a.endsWith('.json')) || 'shots/background-tables.json';
const { chromium } = require(process.env.PW || 'playwright');
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
const errors = [], rows = {};
const fail = m => { errors.push(m); console.log('FAIL ' + m); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.goto(base + (FALLBACK ? '?noprops' : ''));
  await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  await page.evaluate(() => {
    const L = window.__lastCall; L.noLock(); L.start('gambler', { players: 4, killers: 1 }); L.step(1); L.S.paused = false;
    L.state.target = 1e12; // nobody wins the night during the check
    window.go = (game, i = 0) => { // walk up to a free spot of a game, facing it
      const s = L.state.seats.filter(q => q.game === game)[i]; if (s.occ && s.occ !== L.state.chars[L.S.myId]) s.occ.seat = null; if (s.occ !== L.state.chars[L.S.myId]) s.occ = null; s.claim = null;
      L.look(s.face, -0.2); L.place(s.x, s.y); L.render(); return s;
    };
    window.away = (s, m) => { L.place(s.x - Math.cos(s.face) * m * 60, s.y - Math.sin(s.face) * m * 60); L.step(0.05); L.render(); }; // m metres back from the spot
  });
  // 1. A row of slots: pull three on AUTO, walk off; all keep spinning and paying, the machines stay yours.
  const slots = await page.evaluate(async () => {
    const L = window.__lastCall, out = [], bank0 = L.state.bank;
    for (let i = 0; i < 3; i++) { const s = go('slots', i); L.step(0.05); L.press('spot:main'); L.press('btn:auto'); out.push(s.id); }
    const last = L.state.seats[out[2]]; away(last, 5);
    await new Promise(r => setTimeout(r, 6000));
    const views = L.tables(), held = [...L.state.held.keys()];
    return { seats: out, seated: L.view.priv.seat ? L.view.priv.seat.game : null, running: views.map(v => ({ seat: v.seat, game: v.game, spin: !!(v.view && v.view.spin), auto: v.extra && v.extra.auto })), held, bankMoved: L.state.bank !== bank0 };
  });
  rows.slots = slots; console.log(JSON.stringify(slots));
  if (slots.seated) fail('still at a game after walking 5 m off');
  if (slots.running.length !== 3 || !slots.running.every(v => v.game === 'slots' && v.auto)) fail('three slots on AUTO should keep running away from them: ' + JSON.stringify(slots.running));
  if (!slots.seats.every(id => slots.held.includes(id))) fail('the host does not hold the running machines for you: ' + JSON.stringify(slots.held));
  if (!slots.bankMoved) fail('the background spins did not reach the bank');
  // back at one: it is the same game, AUTO still on; turning it off stops it after the spin
  const back = await page.evaluate(async id => {
    const L = window.__lastCall, s = L.state.seats[id]; go('slots', L.state.seats.filter(q => q.game === 'slots').indexOf(s)); L.step(0.05);
    const t = L.table(), resumed = t && t.seat === id && !!(t.extra && t.extra.auto);
    L.press('btn:auto'); return { resumed, bg: L.tables().length };
  }, slots.seats[0]);
  rows.back = back; if (!back.resumed || back.bg !== 2) fail('walking back did not resume the running machine: ' + JSON.stringify(back));
  // 2. A wheel spin keeps going when you walk off; a blackjack hand settles at 10 ft, not before.
  const bj = await page.evaluate(async () => {
    const L = window.__lastCall; for (const v of L.tables()) { /* leave the slots spinning */ }
    let s = go('bj', 0); L.step(0.05); L.press('spot:main');
    let live = false; for (let i = 0; i < 12 && !live; i++) { L.press('btn:hit'); const t = L.table(); live = !!(t.view && t.view.hide); if (!live) await new Promise(r => setTimeout(r, 300)); }
    away(s, 2.4); const near = L.view.priv.seat && L.view.priv.seat.game, nearLive = !!(L.table() && L.table().view && L.table().view.hide);
    away(s, 3.6); await new Promise(r => setTimeout(r, 300));
    return { live, near, nearLive, after: L.view.priv.seat ? L.view.priv.seat.game : null, bgBj: L.tables().some(v => v.game === 'bj') };
  });
  rows.bj = bj; console.log(JSON.stringify(bj));
  if (!bj.live) fail('no live blackjack hand');
  else {
    if (bj.near !== 'bj' || !bj.nearLive) fail('the hand ended within 10 ft: ' + JSON.stringify(bj));
    if (bj.after || bj.bgBj) fail('the hand did not settle past 10 ft: ' + JSON.stringify(bj));
  }
  const wheel = await page.evaluate(async () => {
    const L = window.__lastCall, s = go('wheel', 0); L.step(0.05);
    for (let i = 0; i < 40 && L.table().view && L.table().view.spin && L.table().on.spin === false; i++) await new Promise(r => setTimeout(r, 250));
    L.press('spot:main'); L.press('btn:spin'); const spun = !!(L.table().view && L.table().view.spin);
    away(s, 5); await new Promise(r => setTimeout(r, 400));
    const mid = L.tables().find(v => v.game === 'wheel');
    await new Promise(r => setTimeout(r, 5500));
    return { spun, runningAway: !!(mid && mid.view && mid.view.spin), stillThere: L.tables().some(v => v.game === 'wheel') };
  });
  rows.wheel = wheel; console.log(JSON.stringify(wheel));
  if (!wheel.spun || !wheel.runningAway) fail('the prize wheel did not keep spinning after walking off: ' + JSON.stringify(wheel));
  // 3. Duck race: chips on a duck's button are the bet, no SPACE and no HUD start.
  const race = await page.evaluate(async () => {
    const L = window.__lastCall; go('race', 1); L.step(0.05);
    for (let i = 0; i < 80 && L.state.race.phase !== 'bet'; i++) { L.step(0.5); await new Promise(r => setTimeout(r, 20)); }
    L.render(); const btn = L.parts().find(p => p.part === 'spot:duck2');
    const r = L.press('spot:duck2'); await new Promise(r => setTimeout(r, 400)); L.step(0.1);
    const me = L.S.myId;if(L.state.race.bets.has(me))throw Error('race committed before START');L.press('btn:bet');await new Promise(r=>setTimeout(r,100));const mine = L.state.race.bets.get ? L.state.race.bets.get(me) : null;
    return { phase: L.state.race.phase, button: !!btn, press: r, bet: mine ? { duck: mine.duck ?? mine[1], bet: mine.bet ?? mine[2] } : null, start: [...document.querySelectorAll('#gameControls button')].map(b => b.textContent), status: L.bar()?.status };
  });
  rows.race = race; console.log(JSON.stringify(race));
  if (!race.button) fail('no duck button part at the race desk');
  if (!race.bet) fail('chips on a duck did not place the bet: ' + JSON.stringify(race));
  if (race.start.some(t => /space|place bet/i.test(t))) fail('a SPACE / Place bet start remains at the race: ' + JSON.stringify(race.start));
  // 4. Plinko risks: low and medium balls only land inside their gates, whose brass walls show; high uses all 17.
  const plinko = await page.evaluate(async () => {
    const L = window.__lastCall, { PLINKO_GATE } = await import('./src/games.js'); go('plinko', 0); L.step(0.05);
    const out = {};
    for (const risk of ['low', 'medium', 'high']) {
      await new Promise(r => setTimeout(r, 2500));
      L.press('btn:risk:' + risk); const seen = new Set();
      for (let i = 0; i < 8; i++) { L.press('btn:drop'); for (const b of L.table().view.balls) seen.add(b.path.reduce((a, c) => a + c, 0)); }
      L.render(); const sc = L.scene(); const gates = []; sc.scene.traverse(o => { if (/^plinko-gate-.*-0$/.test(o.name) && o.visible) gates.push(o.name); }); // (this cabinet's)
      out[risk] = { gate: PLINKO_GATE[risk], channels: [...seen].sort((a, b) => a - b), gates };
    }
    return out;
  });
  rows.plinko = plinko; console.log(JSON.stringify(plinko));
  for (const [risk, r] of Object.entries(plinko)) {
    if (r.channels.some(k => Math.abs(k - 8) > r.gate)) fail(`plinko ${risk}: a ball landed outside the gates ${JSON.stringify(r.channels)}`);
    const want = risk === 'high' ? 0 : 2; // a gate either side
    if (r.gates.length !== want || (want && !r.gates.every(n => n.includes(risk)))) fail(`plinko ${risk}: gates shown ${JSON.stringify(r.gates)}`);
  }
} catch (e) { errors.push(String(e.stack || e)); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), url: base, fallback: FALLBACK, rows, errors }, null, 1));
await browser.close(); if (server) server.close();
console.log(errors.length ? 'FAIL\n' + errors.join('\n') : 'PASS: three slots on AUTO keep spinning and paying away from them (held for you, resumed on return); a wheel spin carries on; a blackjack hand lasts to 10 ft and settles past it; duck chips are the race bet with no SPACE; Plinko balls stay inside each risk\'s gates.');
process.exit(errors.length ? 1 : 0);
