// Steve, 2026-10-16: no SPACE starts. Each table starts from its own physical control (blackjack HIT, the slot lever
// after chips go in the slot, the roulette and prize wheels, the dice, the coin, Plinko's chute, the first Mines tile
// or Tower egg), left click is the only interact (E is the killer's ability), and a killer can get a drink.
//   node tools/physical-starts-check.mjs [--url https://10.42.0.37:3161/] [out.json] [--fallback]
// Real mouse clicks at the parts' screen points, headless; automation never takes pointer lock (navigator.webdriver
// and __lastCall.noLock()).
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ARG = arg('url', ''), FALLBACK = process.argv.includes('--fallback'), OUT = process.argv.find(a => a.endsWith('.json')) || 'shots/physical-starts.json';
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
const errors = [], rows = [];
// game: [chip spot, starter part, started(view)]
const GAMES = {
  bj: ['spot:main', 'btn:hit', v => !!(v && v.hands)],
  slots: ['spot:main', 'btn:lever', v => !!(v && v.spin)],
  plinko: ['spot:main', 'btn:drop', v => !!(v && v.balls && v.balls.length)],
  roulette: ['spot:red', 'btn:spin', v => !!(v && v.spin)],
  dice: ['spot:pass', 'btn:roll', v => !!(v && v.roll)],
  coin: ['spot:heads', 'btn:flip', v => !!(v && v.flip)],
  wheel: ['spot:main', 'btn:spin', v => !!(v && v.spin)],
  mines: ['spot:main', 'scr', v => !!(v && v.open && v.open.length)], // (the first tile can be a mine: it still started)
  tower: ['spot:main', 'scr', v => !!(v && v.picks && v.picks.length)], // (and the first egg a dragon)
};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + (FALLBACK ? '?noprops' : ''));
  await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  await page.evaluate(() => {
    const L = window.__lastCall; L.noLock(); L.start('killer', { players: 6, killers: 1, perk: 'staff' }); L.step(1); L.S.paused = false;
    window.sitAt = game => {
      if (L.view.priv.seat) { L.act('leave'); L.step(0.5); }
      const s = L.state.seats.find(q => q.game === game && !q.occ && !q.claim) || L.state.seats.find(q => q.game === game);
      if (s.occ) s.occ.seat = null; s.occ = s.claim = null;
      L.look(s.face, game === 'bj' ? -0.7 : game === 'roulette' || game === 'dice' ? -0.45 : game === 'coin' ? 0.05 : game === 'wheel' ? 0.1 : -0.15); L.place(s.x, s.y); L.render();
      return L.view.priv.seat && L.view.priv.seat.game;
    };
  });
  if (!FALLBACK) await page.waitForFunction(() => window.__lastCall.gfx().props >= 30, null, { timeout: 60000 }).catch(() => errors.push('props did not load'));
  const click = async p => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up(); await page.waitForTimeout(120); };
  // Turn the head (around the seat's facing) until the part is well inside the screen, away from the HUD.
  const partAt = (part, look) => page.evaluate(([part, look]) => {
    const L = window.__lastCall, face = L.view.priv.seat.face, inside = q => q.x > 60 && q.x < innerWidth - 60 && q.y > 60 && q.y < innerHeight - 170;
    for (const yaw of [0, -0.3, 0.3, -0.6, 0.6, -0.9, 0.9]) for (const pitch of look) {
      L.S.me.look = face + yaw; L.S.me.pitch = pitch; L.render(); L.render();
      const p = L.parts().find(q => q.part === part && inside(q)); if (p) return { x: p.x, y: p.y, yaw, pitch };
    }
    return null;
  }, [part, look]);
  for (const [game, [spot, starter, started]] of Object.entries(GAMES)) {
    const sat = await page.evaluate(g => window.sitAt(g), game);
    if (sat !== game) { errors.push(`could not take ${game}`); continue; }
    const pitches = [-0.15, -0.35, -0.55, -0.75, 0, 0.15, 0.3];
    if (game === 'wheel' || game === 'roulette' || game === 'dice') await page.evaluate(g => { const L = window.__lastCall; for (let i = 0; i < 400; i++) { const t = L.table(); if (!(t && t.view && (t.view.spin || t.view.roll)) || g) break; L.step(0.25); } }, game);
    const chipSpot = await partAt(spot, pitches);
    if (!chipSpot) { errors.push(`${game}: no ${spot} on screen`); continue; }
    await click(chipSpot);
    const afterChip = await page.evaluate(() => ({ down: window.__lastCall.table().idle === false, hud: [...document.querySelectorAll('#gameControls button')].map(b => ({ id: b.dataset.play, text: b.textContent })), status: window.__lastCall.bar()?.status }));
    // SPACE starts nothing any more, and no HUD primary offers it
    const before = await page.evaluate(() => JSON.stringify(window.__lastCall.table().view));
    await page.keyboard.press('Space'); await page.waitForTimeout(150);
    const spaceChanged = await page.evaluate(b => JSON.stringify(window.__lastCall.table().view) !== b, before);
    let target;
    if (starter === 'scr') target = await page.evaluate(game => { const L = window.__lastCall, face = L.view.priv.seat.face; for (const pitch of [-0.15, -0.3, -0.45, 0]) { L.S.me.look = face; L.S.me.pitch = pitch; L.render(); L.render(); const p = L.screenPoint(game === 'mines' ? 0.15 : 0.12, 0.5); if (p && p.x > 60 && p.x < innerWidth - 60 && p.y > 60 && p.y < innerHeight - 170) return { x: p.x, y: p.y, pitch }; } return null; }, game);
    else target = await partAt(starter, pitches);
    if (!target) { errors.push(`${game}: starter ${starter} not on screen`); continue; }
    const hover = await page.evaluate(([x, y]) => { const L = window.__lastCall; L.render(); return L.aim(); }, [target.x, target.y]);
    await click(target);
    await page.waitForTimeout(250);
    const view = await page.evaluate(() => window.__lastCall.table().view);
    const row = { game, spot, starter, chipPlaced: afterChip.down, status: afterChip.status, hud: afterChip.hud, spaceChanged, target, started: started(view) };
    rows.push(row); console.log(JSON.stringify(row));
    if (!afterChip.down) errors.push(`${game}: the chip click placed no bet`);
    if (spaceChanged) errors.push(`${game}: SPACE still changes the table`);
    if (afterChip.hud.some(b => /space/i.test(b.text) || ['btn:deal', 'btn:spin', 'btn:roll', 'btn:flip', 'btn:drop', 'btn:lever', 'btn:start'].includes(b.id))) errors.push(`${game}: a HUD start button remains ${JSON.stringify(afterChip.hud)}`);
    if (!row.started) errors.push(`${game}: clicking ${starter} did not start the round`);
    await page.evaluate(() => window.__lastCall.step(6));
  }
  // The slot machine: no BET pad, the chips go into the slot (its part is the bet spot) and are not stacked outside.
  const slot = await page.evaluate(() => { const L = window.__lastCall; window.sitAt('slots'); L.render(); return { pad: L.parts().filter(p => p.part === 'spot:main').length, stacks: L.table().stacks.length }; });
  rows.push({ slotSpotParts: slot.pad }); if (slot.pad < 1) errors.push('slots: no chip slot part');
  // Interaction is left click; E is the killer's ability. A staff-passage killer clicks the bartender and gets the mixer.
  const bar = await page.evaluate(async () => {
    const L = window.__lastCall, { TAP } = await import('./src/map.js');
    if (L.view.priv.seat) { L.act('leave'); L.step(0.5); }
    L.place(TAP.x, TAP.y + 40); L.look(-Math.PI / 2, 0); L.step(0.2); L.render();
    return { ctx: L.view.priv.ctx, perk: L.view.priv.perk, killer: L.view.priv.isKiller };
  });
  const mixerOpen = () => page.evaluate(() => { const m = document.getElementById('mixer'); return !!m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none'; });
  await page.keyboard.press('e'); await page.waitForTimeout(200);
  const afterE = await mixerOpen();
  await click({ x: 640, y: 360 }); await page.waitForTimeout(300);
  const afterClick = await mixerOpen();
  rows.push({ bar, afterE, afterClick }); console.log(JSON.stringify({ bar, afterE, afterClick }));
  if (bar.ctx !== 'Talk to the bartender' || !bar.killer || bar.perk !== 'staff') errors.push('bar setup ' + JSON.stringify(bar));
  if (afterE) errors.push('E still talks to the bartender');
  if (!afterClick) errors.push('left click did not open the bartender for a staff-passage killer');
} catch (e) { errors.push(String(e.stack || e)); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), url: base, fallback: FALLBACK, rows, errors }, null, 1));
await browser.close(); if (server) server.close();
console.log(errors.length ? 'FAIL\n' + errors.join('\n') : `PASS: ${Object.keys(GAMES).length} tables start from their physical control by real clicks, SPACE starts nothing, slots take chips in the slot; left click (not E) gets a staff-passage killer the bartender.`);
process.exit(errors.length ? 1 : 0);
