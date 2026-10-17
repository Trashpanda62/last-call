import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const out = 'shots/casino-refresh'; fs.mkdirSync(out, { recursive: true });
const gpu = process.env.LC_GPU === 'vulkan' ? ['--use-angle=vulkan', '--enable-features=Vulkan'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: [...gpu, '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
 const errors = [], snacks = []; page.on('pageerror', e => errors.push(e.message));
 await page.addInitScript(() => { localStorage.setItem('lc.settings', JSON.stringify({ v: 2, gfx: { preset: 'low' }, voice: { mode: 'off' } })); });
 await page.goto((process.env.LC_URL||'https://10.42.0.37:3161/')); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 90000 });
 const shot = async name => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
 await shot('menu-mystery');
 await page.locator('#modePick [data-mode="escape"]').click(); await page.waitForTimeout(950); await shot('menu-escape');
 await page.locator('#joinToggle').click(); await page.locator('#codeIn').fill('TEST'); assert.equal(await page.locator('#codeIn').inputValue(), 'TEST'); await shot('menu-join'); await page.keyboard.press('Escape');
 assert.equal(await page.locator('#joinToggle').getAttribute('aria-expanded'), 'false');
 await page.locator('#profileBtn').click(); await page.locator('#nameIn').fill('Night Owl'); await page.keyboard.press('Escape');
 assert.equal(await page.locator('#profileName').textContent(), 'Night Owl');
 await page.locator('#soloBtn').click(); assert.match(await page.locator('#setupTitle').textContent(), /Escape/); await page.locator('#setupBack').click();
 await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150); await shot('menu-phone');
 const mobile = await page.locator('#soloBtn').boundingBox(); assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 390);
 await page.setViewportSize({ width: 1280, height: 720 });
 await page.evaluate(() => { const L = window.__lastCall; L.noLock(); L.start('killer'); L.step(.1); L.render(); });
 await page.evaluate(() => { window.mockLocked = true; window.releaseCount = 0; Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => window.mockLocked ? document.querySelector('#view') : null }); document.exitPointerLock = () => { window.releaseCount++; window.mockLocked = false; }; });
 await page.evaluate(() => { const L = window.__lastCall, s = L.state.seats.find(s => s.game === 'bj' && !s.occ); L.place(s.x, s.y); L.look(s.face, -.66); L.step(.1); L.render(); });
 await page.waitForTimeout(900);
 assert.equal(await page.evaluate(() => window.releaseCount), 0, 'walking up to a table must keep mouse look locked');
 const lookBefore = await page.evaluate(() => window.__lastCall.S.me.look);
 await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { movementX: 5, movementY: 0 })));
 assert.notEqual(await page.evaluate(() => window.__lastCall.S.me.look), lookBefore, 'mouse movement must keep changing the camera');
 await page.evaluate(() => { window.mockLocked = false; });
 assert.equal(await page.locator('#gameControls button').count(), 0, 'the start prompt stays hidden until chips are placed');
 assert.equal(await page.evaluate(() => window.__lastCall.table().view), null);
 await page.evaluate(() => { window.__lastCall.press('spot:main'); window.__lastCall.render(); });
 assert.equal(await page.locator('#gameControls button').count(), 0, 'blackjack has no SPACE/Deal prompt: HIT deals');
 await page.evaluate(() => { const saved = Math.random, deck = [3.1 / 13,0,2.1 / 13,0,9.1 / 13,0,6.1 / 13,0]; Math.random = () => deck.length ? deck.shift() : .7; try { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'h' })); } finally { Math.random = saved; } }); await page.waitForTimeout(250);
 const hud = await page.evaluate(() => { const L = window.__lastCall, parts = L.parts(), spot = parts.find(p => p.part === 'spot:main'), keys = parts.filter(p => ['btn:hit','btn:stand','btn:double'].includes(p.part)), cards = []; L.scene().scene.traverse(o => { if (o.visible && o.name === 'blackjack-player-card') cards.push({ width: o.geometry.parameters.width, dist: o.getWorldPosition(o.position.clone()).distanceTo(L.scene().camera.position) }); }); return { spot, keys, panel: !!document.querySelector('#bjActions'), cards, parts: parts.map(p => p.part) }; });
 assert.equal(hud.panel, false, 'no screen blackjack action panel');
 assert.equal(hud.keys.length, 3);
 assert.ok(hud.keys.every(k => k.on && k.y > hud.spot.y), 'physical hand controls must be visible below the chip circle');
 assert.ok(hud.cards.length >= 2 && hud.cards.every(c => c.width >= .19 && c.dist < 1.8));
 assert.ok(!hud.parts.includes('btn:deal'), 'HIT deals; there is no Deal control');
 await shot('blackjack-buttons'); await page.keyboard.press('h'); assert.equal(await page.evaluate(() => window.__lastCall.table().view.hands[0].cards.length), 3); console.log('BJ geometry', JSON.stringify(hud));
 // Framed generated portraits and rebuilt jukebox; actual raster sources must be the new crisp paintings.
 const portraitSources = await page.evaluate(() => { const src = []; window.__lastCall.scene().scene.traverse(o => { const m = o.material; if (m?.map?.image?.src?.includes('portrait-')) src.push(m.map.image.src); }); return src; });
 assert.ok(portraitSources.length >= 11);
 const views = [ ['jukebox', 445, 570, Math.PI / 2, .03], ['portrait', 110, 290, Math.PI, .4], ['rocket', 2450, 340, -Math.PI / 2, .12], ['coin', 1855, 1515, -Math.PI / 2, .15], ['duck-guide', 2180, 805, Math.PI, .23] ];
 for (const [name, x, y, look, pitch] of views) {
  await page.evaluate(([x, y, look, pitch]) => { const L = window.__lastCall; L.act('leave'); L.step(.2); L.place(x, y); L.look(look, pitch); L.render(); }, [x, y, look, pitch]);
  await page.waitForTimeout(450); await shot(name);
 }
 await page.evaluate(() => { const L = window.__lastCall; const s = L.state.seats.find(s => s.game === 'vip' && !s.occ), c = L.state.chars[1]; c.isHuman = true; c.x = s.x; c.y = s.y; c.face = c.look = s.face; c.seat = s; s.occ = c.id; L.act('leave'); L.place(s.x + Math.cos(s.face + .65) * 120, s.y + Math.sin(s.face + .65) * 120); L.look(s.face + .65 + Math.PI, -.25); L.step(.1); L.render(); });
 await page.waitForTimeout(1000); await shot('seated-potato');
 for (let kind = 0; kind < 6; kind++) {
  const access = await page.evaluate(async kind => { const L = window.__lastCall, { BOWL_SPOTS } = await import('/src/map.js'), b = BOWL_SPOTS[kind]; L.act('leave'); L.step(.1); L.place(b.x, b.y + 30); L.look(-Math.PI / 2, -.25); const c = L.state.chars[0]; c.hunger = 20; c.lucky = 0; L.step(.02); const ctx = L.view.priv.ctx, drift = Math.hypot(c.x - b.x, c.y - b.y - 30); L.act('use'); L.render(); return { ctx, drift, kind: c.snack }; }, kind);
  assert.match(access.ctx || '', /^Eat /, 'snack stand must remain usable after layout changes'); assert.ok(access.drift < .01, 'snack approach must stay clear of collision'); assert.equal(access.kind, kind % 3); snacks.push({ id: kind, ...access });
  await page.waitForTimeout(600); assert.ok(await page.evaluate(() => window.__lastCall.view.pub.chars[0].eating > 0)); await shot(`snack-${kind}-bite`);
  await page.waitForTimeout(2000);
 }
 // A real poison death enters the third-person cinematic and then unlocks private ghost cameras.
 await page.evaluate(() => { const L = window.__lastCall; L.start('gambler'); L.step(.1); L.place(750, 550); const c = L.state.chars[0]; c.poisonT = .001; c.poisonBy = L.state.killerIds[0]; L.step(.02); L.render(); });
 await page.waitForFunction(() => window.__lastCall.scene().death.active);
 await page.waitForFunction(() => window.__lastCall.scene().death.phase === 'jumpscare');
 const scare = await page.evaluate(() => { const L = window.__lastCall; return { death: L.scene().death, pos: L.scene().camera.position.toArray(), me: [L.view.priv.x / 60, L.view.priv.y / 60], private: !!L.view.priv.deathScene, leaked: 'deathScene' in L.view.pub.chars[0], hands: document.querySelector('#cross').className }; });
 assert.equal(scare.private, true); assert.equal(scare.leaked, false); assert.ok(Math.hypot(scare.pos[0] - scare.me[0], scare.pos[2] - scare.me[1]) > 1.5);
 await shot('death-jumpscare');
 await page.waitForFunction(() => window.__lastCall.scene().death.phase === 'collapse'); await page.waitForTimeout(500); await shot('death-collapse');
 await page.waitForFunction(() => !window.__lastCall.scene().death.active, null, { timeout: 30000 });
 await page.keyboard.press('c'); await page.waitForFunction(() => window.__lastCall.view.priv.cameraFeed === 'floor');
 await shot('ghost-camera-after-death');
 assert.deepEqual(errors, []); fs.writeFileSync(`${out}/report.json`, JSON.stringify({ at: new Date().toISOString(), blackjack: hud, snacks, scare, errors }, null, 2)); console.log('PASS: chip-first HIT deal (no Space prompt), close readable cards, physical blackjack hand controls, crisp portraits, all six snack interactions/bites, private 3D jumpscare/collapse and ghost-camera return.');
} finally { await browser.close(); }
