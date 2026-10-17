import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createGame } from '../src/sim.js';
import { STAFF_DOORS } from '../src/map.js';

const g = createGame({ humans: [{ name: 'Ghost', key: 'me' }], players: 6, killers: 1, forceRole: 'gambler' });
const c = g.G.chars[0], liveFeed = g.G.security.feed, bank = g.G.bank;
g.action(0, 'cameras'); assert.equal(g.view(0).priv.cameraFeed, null);
c.alive = false;
g.action(0, 'cameras'); assert.equal(g.view(0).priv.cameraFeed, 'floor');
g.action(0, 'feed', 'bar'); assert.equal(g.view(0).priv.cameraFeed, 'bar');
assert.equal(g.G.security.feed, liveFeed, 'ghosts must not change the security desk feed');
g.action(0, 'buy', 'guard'); assert.equal(g.G.bank, bank);
g.action(0, 'use'); assert.equal(g.view(0).priv.cameraFeed, null);
const desk = g.G.seats.find(s => s.game === 'cams'); c.x = desk.x; c.y = desk.y;
g.action(0, 'use'); assert.equal(g.view(0).priv.cameraFeed, 'floor');
console.log('PASS: ghost camera permissions, private feeds, desk access, closing, and no guard purchases.');

if (process.argv.includes('--sim-only')) process.exit(0);
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const urlIndex = process.argv.indexOf('--url'), remoteUrl = urlIndex < 0 ? '' : process.argv[urlIndex + 1];
const root = path.resolve('.'), types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const server = remoteUrl ? null : http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
const url = remoteUrl || await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
let browser;
try {
  const gpu = process.env.LC_GPU === 'vulkan' ? ['--use-angle=vulkan', '--enable-features=Vulkan'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  browser = await chromium.launch({ headless: true, args: [...gpu, '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, ignoreHTTPSErrors: !!remoteUrl });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('lc.settings', JSON.stringify({ v: 2, gfx: { preset: 'low' }, voice: { mode: 'off' } })));
  await page.goto(url); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  // Exercise real input handlers, and record the commands they send to the host.
  await page.evaluate(() => {
    const L = window.__lastCall; L.noLock(); L.start('killer', { perk: 'sense' }); L.step(0.1);
    const sim = L.S.sim, original = sim.action;
    window.controlActions = [];
    sim.action = (...args) => { window.controlActions.push(args[1]); return original(...args); };
    const c = L.state.chars[0]; c.cd.blade = 0; c.cd.sense = 0; c.cd.lights = 0;
    L.place(700, 500); L.step(0.1); L.render();
  });
  const canvasClick = async button => page.locator('#view').dispatchEvent('mousedown', { button, clientX: 480, clientY: 270 }).then(() => page.dispatchEvent('body', 'mouseup', { button, clientX: 480, clientY: 270 }));
  await canvasClick(0); await canvasClick(2);
  await page.keyboard.press('e'); await page.keyboard.press('q'); await page.keyboard.press('u');
  assert.deepEqual(await page.evaluate(() => window.controlActions), ['blade', 'disguise', 'sense', 'transform', 'use']);
  assert.ok(await page.evaluate(() => window.__lastCall.state.chars[0].senseT > 0));
  await page.evaluate(() => { const L = window.__lastCall; L.act('lights'); L.step(0.1); L.render(); window.controlActions = []; });
  await page.keyboard.press('q');
  await page.waitForFunction(() => window.__lastCall.view.priv.monster);
  await page.keyboard.press('Shift');
  assert.deepEqual(await page.evaluate(() => window.controlActions), ['transform', 'leap']);
  assert.ok(await page.evaluate(() => { const c = window.__lastCall.state.chars[0]; return c.leap || c.leapCd > 0; }), 'Shift must actually leap');
  assert.match(await page.locator('#blackoutHud').textContent(), /Shift leaps/);
  // Escape menus and drag-to-look must never send combat actions.
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.controlActions = []; });
  await canvasClick(0); await canvasClick(2); await page.keyboard.press('q');
  assert.deepEqual(await page.evaluate(() => window.controlActions), []);
  await page.keyboard.press('Escape');
  await page.locator('#view').dispatchEvent('mousedown', { button: 0, clientX: 480, clientY: 270 });
  await page.dispatchEvent('body', 'mouseup', { button: 0, clientX: 530, clientY: 270 });
  assert.deepEqual(await page.evaluate(() => window.controlActions), []);
  // E opens the selected lure; Q cannot transform through its room picker.
  await page.evaluate(() => { const L = window.__lastCall; L.start('killer', { perk: 'lure' }); L.step(0.1); L.state.chars[0].cd.lure = 0; L.place(700, 500); L.step(0.1); L.render(); });
  await page.keyboard.press('e'); await page.waitForSelector('#picker:not(.hidden)');
  await page.keyboard.press('q');
  assert.equal(await page.evaluate(() => window.__lastCall.state.chars[0].monster), false);
  await page.locator('#picker .pk-list button').first().click();
  assert.ok(await page.evaluate(() => window.__lastCall.state.chars[0].cd.lure > 0));
  // Holding E controls the peek camera; releasing it restores the normal view.
  await page.evaluate(() => { const L = window.__lastCall; L.start('killer', { perk: 'peek' }); L.step(0.1); L.place(700, 500); L.step(0.1); L.render(); });
  await page.keyboard.down('e');
  await page.waitForFunction(() => window.__lastCall.S.peekT > 0.8);
  assert.ok(await page.evaluate(() => window.__lastCall.scene().camera.position.toArray().every(Number.isFinite)), 'peek camera must render with a valid eye height');
  await page.keyboard.up('e');
  await page.waitForFunction(() => window.__lastCall.S.peekT === 0);
  // Q still fires the gambler's gun; killer Q always transforms and J fires.
  for (const role of ['gambler', 'killer']) {
    await page.evaluate(role => { const L = window.__lastCall; L.start(role); L.step(0.1); L.state.chars[0].bullets = 1; L.step(0.1); L.render(); const original = L.S.sim.action; window.controlActions = []; L.S.sim.action = (...args) => { window.controlActions.push(args[1]); return original(...args); }; }, role);
    await page.keyboard.press(role === 'killer' ? 'j' : 'q');
    assert.deepEqual(await page.evaluate(() => window.controlActions), ['shoot']);
  }
  console.log('PASS: killer mouse controls, Q transform, E sense/lure/held peek, Shift leap, pause/picker/drag guards, and role-specific revolver keys.');
  const hit = await page.evaluate(() => {
    const L = window.__lastCall; L.noLock(); L.start('killer'); L.step(0.1);
    const seat = L.state.seats.find(s => s.game === 'bj' && !s.occ);
    L.place(seat.x, seat.y); L.look(seat.face, -0.3); L.step(0.1); L.render();
    L.press('spot:main');
    const saved = Math.random, deck = [3.1 / 13, 0, 2.1 / 13, 0, 9.1 / 13, 0, 6.1 / 13, 0];
    Math.random = () => deck.length ? deck.shift() : 0.7;
    try { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'h', bubbles: true })); } finally { Math.random = saved; }
    L.render(); const before = L.table().view.hands[0].cards.map(c => c.rank);
    const aimed = L.parts().some(p=>p.part==='btn:hit');
    Math.random = () => 0.7;
    let clicked;
    try { clicked = L.press('btn:hit'); } finally { Math.random = saved; }
    const after = L.table();
    return { aimed, clicked, before, cards: after.view.hands[0].cards.map(c => c.rank), live: after.view.hide, action: after.pressed.id, status: L.bar().status };
  });
  console.log('Physical HIT regression', JSON.stringify(hit));
  assert.deepEqual(hit.before, ['4', '3']); assert.equal(hit.action, 'btn:hit'); assert.ok(hit.live && hit.cards.length === 3);
  assert.match(hit.status, /YOU 4♠ 3♠ 10♦ = 17/);
  assert.match(hit.status, /DEALER 10♠ \+ \?/);
  assert.ok(!hit.status.includes('7♠'), 'the hidden dealer card must stay hidden');
  const longHand = await page.evaluate(() => {
    const L = window.__lastCall, v = L.table().view;
    // Two split ten-card hands plus the dealer exceed the original sixteen-card pool.
    v.hands = [0, 1].map(() => ({ cards: Array.from({ length: 10 }, (_, i) => ({ rank: i ? 'A' : '2', suit: '♠' })), total: 21, bet: 1, active: false }));
    L.render(); const scene = L.scene().scene, cards = [];
    scene.traverse(o => { if (o.visible && /^blackjack-(player|dealer)-card$/.test(o.name)) cards.push(o); });
    return { player: cards.filter(c => c.name === 'blackjack-player-card').length, dealer: cards.filter(c => c.name === 'blackjack-dealer-card').length };
  });
  assert.deepEqual(longHand, { player: 20, dealer: 2 }, 'every card in a long split hand must render');
  const completed = await page.evaluate(() => {
    const L = window.__lastCall; L.press('btn:stand'); L.render(); return { view: L.table().view, status: L.bar().status };
  });
  assert.equal(completed.view.hide, false);
  assert.match(completed.status, /YOU 4♠ 3♠ 10♦ = 17 · DEALER 10♠ 7♠ = 17/);
  await page.waitForTimeout(4500);
  assert.deepEqual(await page.evaluate(() => window.__lastCall.table().view), completed.view, 'finished blackjack hands must remain visible until DEAL is pressed');
  console.log('PASS: readable blackjack cards and totals, concealed dealer card, long split hands, and persistent completed hands.');
  await page.evaluate(() => {
    const L = window.__lastCall; L.act('leave'); L.step(0.1);
    const seat = L.state.seats.find(s => s.game === 'roulette' && !s.occ);
    L.place(seat.x, seat.y); L.look(seat.face, -0.3); L.step(0.1); L.render(); L.press('spot:red');
  });
  await page.waitForTimeout(6500);
  assert.equal(await page.evaluate(() => window.__lastCall.table().view), null, 'placing chips waits for physical spin');
  await page.evaluate(()=>__lastCall.press('btn:spin'));
  await page.waitForTimeout(4300);
  const stopped = await page.evaluate(() => {
    const L = window.__lastCall; L.render(); L.press('rail:clear');
    const scene = L.scene().scene;
    return { wheel: scene.getObjectByName('roulette-rotor').rotation.y, ball: scene.getObjectByName('roulette-ball').position.toArray() };
  });
  await page.waitForTimeout(500);
  const stillStopped = await page.evaluate(() => {
    const L = window.__lastCall; L.render(); const scene = L.scene().scene;
    return { wheel: scene.getObjectByName('roulette-rotor').rotation.y, ball: scene.getObjectByName('roulette-ball').position.toArray() };
  });
  assert.deepEqual(stillStopped, stopped, 'roulette wheel and ball must come to a complete stop');
  console.log('PASS: roulette wheel and ball hold their final transforms.');
  await page.evaluate(() => { const L = window.__lastCall; L.noLock(); L.start('gambler'); L.step(0.1); L.state.chars[0].alive = false; L.step(0.1); L.render(); });
  await page.keyboard.press('c');
  await page.waitForFunction(() => window.__lastCall.view.priv.cameraFeed === 'floor');
  await canvasClick(0);
  await page.waitForFunction(() => window.__lastCall.view.priv.cameraFeed === 'bar');
  const ghostCam = await page.evaluate(() => window.__lastCall.scene().camera.position.toArray());
  assert.ok(ghostCam[0] < 2 && ghostCam[2] < 2);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__lastCall.view.priv.cameraFeed);
  await page.evaluate(door => {
    const L = window.__lastCall; L.start('killer', { perk: 'staff' }); L.step(0.1); L.look(door.face); L.place(door.sx, door.sy);
    const c = L.state.chars[0], victim = L.state.chars[1]; victim.alive = false;
    L.state.bodies.push({ id: victim.id, x: c.x + Math.cos(c.look) * 12, y: c.y + Math.sin(c.look) * 12, cause: 'shiv', by: c.id, reported: false, t: L.state.t, seenBy: new Set() });
    L.step(0.01); L.render();
  }, STAFF_DOORS[0]);
  assert.equal(await page.evaluate(() => window.__lastCall.view.priv.ctx), 'Report body');
  await page.keyboard.press('e'); // selected ability must take priority over the nearby body's generic use action
  await page.waitForFunction(()=>__lastCall.view.priv.staffInside);
  assert.equal(await page.locator('#picker').isVisible(),false);
  const before = await page.evaluate(()=>[__lastCall.state.chars[0].x,__lastCall.state.chars[0].y]);
  await canvasClick(0);
  await page.waitForFunction(()=>__lastCall.view.priv.cameraFeed==='rest');
  assert.deepEqual(await page.evaluate(()=>[__lastCall.state.chars[0].x,__lastCall.state.chars[0].y]),before);
  await canvasClick(2);
  await page.waitForFunction(door=>Math.hypot(__lastCall.state.chars[0].x-door.sx,__lastCall.state.chars[0].y-door.sy)<2,STAFF_DOORS[1]);
  await page.waitForFunction(()=>!__lastCall.view.priv.staffInside);
  await page.waitForFunction(() => window.__lastCall.audio().lib && window.__lastCall.audio().sfx > 0);
  assert.match(await page.evaluate(() => window.__lastCall.audio().music), /house-after-hours/);
  assert.deepEqual(errors, []);
  // Ending a round clears the camera UI immediately.
  await page.evaluate(door=>{const L=__lastCall;L.start('killer',{perk:'staff'});L.step(.1);L.place(door.sx,door.sy);L.step(.1);L.act('staff');L.step(.01);L.render();},STAFF_DOORS[0]);
  await page.waitForFunction(()=>document.body.classList.contains('cctv'));
  await page.evaluate(()=>{__lastCall.state.over={text:'Test round complete',killersWin:true};__lastCall.step(.01);__lastCall.render();});
  await page.waitForFunction(()=>!document.body.classList.contains('cctv'));
  assert.deepEqual(errors, []);
  console.log('PASS: ghost camera mouse controls, E-selected staff passage beside a body, direct entry, click cycling/exit and round-end cleanup.');
} finally { if (browser) await browser.close(); if (server) server.close(); }
