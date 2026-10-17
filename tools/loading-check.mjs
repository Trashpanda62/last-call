// Startup assets, level preparation barrier, generated HUD art and actual controller input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
const out = 'shots/loading-controls'; fs.mkdirSync(out, { recursive: true });
try {
 const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
 const errors = [], failed = [], lateAssets = []; let ready = false;
 page.on('pageerror', e => errors.push(e.message));
 page.on('response', r => { if (r.url().includes('/assets/') && !r.ok()) failed.push(r.url()); });
 page.on('request', r => { if (ready && /\/assets\/.*\.(webp|jpg|png|glb|mp3|json|ttf)/.test(r.url())) lateAssets.push(r.url()); });
 await page.goto('https://10.42.0.37:3161/');
 assert.equal(await page.locator('#menu').isVisible(), false);
 await page.screenshot({ path: `${out}/arrival.png` });
 await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 }); ready = true;
 assert.equal(await page.locator('#bootLoading').isVisible(), false); assert.equal(await page.locator('#menu').isVisible(), true);
 const before = await page.evaluate(() => __lastCall.gfx().frames); await page.waitForTimeout(1200);
 assert.equal(await page.evaluate(() => __lastCall.gfx().frames), before, 'menu must not render a hidden 3D casino');
 await page.evaluate(() => __lastCall.noLock());
 await page.locator('#soloBtn').click(); await page.locator('#optPlayers').selectOption('6'); await page.locator('#optRole').selectOption('killer'); await page.locator('#startBtn').click();
 await page.waitForFunction(() => !document.querySelector('#levelContinue').disabled, null, { timeout: 90000 });
 assert.equal(await page.evaluate(() => __lastCall.S.screen), 'briefing');
 assert.equal(await page.locator('#controlsRows .control-row').count(), 12);
 const t = await page.evaluate(() => __lastCall.state.t);
 await page.keyboard.press('Space'); await page.keyboard.press('w'); await page.waitForTimeout(1800);
 assert.equal(await page.evaluate(() => __lastCall.state.t), t, 'solo game stays frozen until Continue');
 assert.equal(await page.evaluate(() => __lastCall.S.screen), 'briefing');
 const box = await page.locator('#levelContinue').boundingBox(); assert.ok(box.x > 900 && box.y > 600 && box.x + box.width <= 1280 && box.y + box.height <= 720);
 assert.equal(await page.locator('#keyboardDiagram .movement-key').count(), 4, 'WASD should be highlighted on the physical keyboard layout');
 const keyPositions = await page.locator('#keyboardDiagram .movement-key').evaluateAll(els => Object.fromEntries(els.map(e => [e.dataset.key, { x: e.querySelector('rect').x.baseVal.value, y: e.querySelector('rect').y.baseVal.value }])));
 assert.ok(keyPositions.W.y < keyPositions.S.y && keyPositions.A.x < keyPositions.S.x && keyPositions.S.x < keyPositions.D.x, 'W above the A-S-D row');
 for (const key of ['A', 'B', 'X', 'Y', 'LS', 'RS', 'LT', 'RT', 'LB', 'RB', 'D-pad', 'Menu', 'View']) assert.equal(await page.locator(`#controllerDiagram [data-pad="${key}"]`).count(), 1, `${key} should appear on the controller diagram`);
 const shell = await page.locator('#controllerDiagram .controller-shell').evaluate(el => { const b = el.getBBox(), m = el.transform.baseVal.consolidate().matrix; return { ratio: b.width / b.height, x: m.a, y: m.d }; });
 assert.ok(shell.ratio > 1.4 && shell.ratio < 1.5 && shell.x === shell.y, 'keep the reference controller proportions without flattening its grips');
 assert.ok(await page.locator('#controlsToggle').evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.briefing-content').getBoundingClientRect().bottom), 'both visual devices, table tip and disclosure fit on desktop');
 assert.equal(await page.locator('#allControls').isVisible(), false);
 // A on a focused guide button must open the guide instead of starting the game.
 await page.evaluate(() => {
  window.testPad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [testPad] });
 });
 await page.locator('#controlsToggle').focus();
 for (const open of [true, false]) {
  await page.evaluate(() => { testPad.buttons[0] = { pressed: true, value: 1 }; }); await page.waitForTimeout(100);
  await page.evaluate(() => { testPad.buttons[0] = { pressed: false, value: 0 }; }); await page.waitForTimeout(100);
  assert.equal(await page.locator('#allControls').isVisible(), open); assert.equal(await page.evaluate(() => __lastCall.S.screen), 'briefing');
 }
 await page.locator('#controlsToggle').evaluate(el => el.blur());
 await page.screenshot({ path: `${out}/controls-desktop.png` });
 await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250);
 const mobile = await page.locator('#levelContinue').boundingBox(); assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 390 && mobile.y + mobile.height <= 844);
 await page.screenshot({ path: `${out}/controls-phone.png` });
 await page.locator('#controllerTitle').scrollIntoViewIfNeeded();
 assert.equal(await page.locator('#controllerDiagram svg').isVisible(), true);
 assert.ok(await page.locator('.briefing-content').evaluate(el => el.scrollWidth <= el.clientWidth), 'mobile guide must not overflow horizontally');
 await page.screenshot({ path: `${out}/controls-phone-controller.png` });
 await page.setViewportSize({ width: 1280, height: 720 });
 await page.locator('#levelContinue').click(); await page.waitForFunction(() => __lastCall.S.screen === 'game');
 await page.locator('[data-perk="sense"]').click(); await page.waitForFunction(() => __lastCall.view.pub.mode === 'play');
 await page.evaluate(() => {
  const L = __lastCall, sim = L.S.sim, act = sim.action; window.padCommands = [];
  sim.action = (...a) => { padCommands.push(a[1]); return act(...a); };
  window.testPad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [testPad] });
 });
 for (const i of [7, 6, 3, 5]) { await page.evaluate(i => { testPad.buttons[i] = { pressed: true, value: 1 }; }, i); await page.waitForTimeout(100); await page.evaluate(i => { testPad.buttons[i] = { pressed: false, value: 0 }; }, i); await page.waitForTimeout(100); }
 await page.evaluate(() => { __lastCall.state.chars[0].bullets = 1; }); await page.waitForTimeout(100);
 await page.evaluate(() => { testPad.buttons[11] = { pressed: true, value: 1 }; }); await page.waitForTimeout(100); await page.evaluate(() => { testPad.buttons[11] = { pressed: false, value: 0 }; });
 assert.ok(await page.evaluate(() => padCommands.includes('shoot')), 'right-stick click fires the killer revolver');
 // Controller-only route to blackout: cycle the visible icon HUD, then activate it.
 await page.evaluate(() => { __lastCall.state.chars[0].cd.lights = 0; });
 for (let n = 0; n < 6; n++) { await page.evaluate(() => { testPad.buttons[15] = { pressed: true, value: 1 }; }); await page.waitForTimeout(70); await page.evaluate(() => { testPad.buttons[15] = { pressed: false, value: 0 }; }); await page.waitForTimeout(70); }
 await page.evaluate(() => { testPad.buttons[13] = { pressed: true, value: 1 }; }); await page.waitForTimeout(100); await page.evaluate(() => { testPad.buttons[13] = { pressed: false, value: 0 }; });
 const commands = await page.evaluate(() => padCommands); assert.ok(commands.includes('lights'), 'controller can trigger blackout from icon HUD'); for (const command of ['blade', 'disguise', 'transform', 'sense']) assert.ok(commands.includes(command), `controller should send ${command}: ${commands}`);
 const look = await page.evaluate(() => __lastCall.S.me.look); await page.evaluate(() => { testPad.axes[2] = .8; }); await page.waitForTimeout(250); await page.evaluate(() => { testPad.axes[2] = 0; });
 assert.notEqual(await page.evaluate(() => __lastCall.S.me.look), look, 'right stick controls the camera');
 const icons = await page.locator('#killerBar button:not(.hidden) .ability-icon').evaluateAll(els => els.map(e => ({ icon: e.dataset.icon, image: getComputedStyle(e).backgroundImage })));
 assert.ok(icons.length >= 5); assert.ok(icons.every(e => e.image.startsWith('url("blob:')));
 await page.screenshot({ path: `${out}/ability-hud.png` });
 // Freeze simulation before killing the fixture's only killer, so round-end logic cannot replace ghost controls.
 await page.evaluate(() => { __lastCall.S.sim.tick = () => {}; __lastCall.state.chars[0].alive = false; __lastCall.state.chars[0].isKiller = false; __lastCall.render(); }); await page.waitForTimeout(100);
 await page.evaluate(() => { testPad.buttons[2] = { pressed: true, value: 1 }; }); await page.waitForTimeout(100); await page.evaluate(() => { testPad.buttons[2] = { pressed: false, value: 0 }; });
 assert.equal(await page.locator('#picker').isVisible(), true, 'ghost X opens haunt targets'); await page.keyboard.press('Escape');
 assert.deepEqual(lateAssets, [], 'all static assets must be ready before menu'); assert.deepEqual(failed, []); assert.deepEqual(errors, []);
 // A failed required animation must leave startup gated with a retry, never open a partially loaded menu.
 const fault = await browser.newPage({ ignoreHTTPSErrors: true });
 await fault.route('**/assets/anim/snatched.json', route => route.abort());
 await fault.goto('https://10.42.0.37:3161/'); await fault.locator('#bootRetry').waitFor({ state: 'visible', timeout: 90000 });
 assert.equal(await fault.locator('#menu').isVisible(), false); assert.equal(await fault.evaluate(() => __lastCall.S.ready), false); await fault.close();
 console.log('PASS: startup barrier, no hidden menu renders, frozen briefing, bottom-right Continue, visual WASD keyboard/mouse and labelled controller, desktop/mobile layout, gamepad guide disclosure, generated icons, RT/LT/Y/RB commands, controller HUD selection/blackout, right-stick camera/revolver, ghost haunt, no late asset downloads, required-asset failure stays gated with Retry.');
} finally { await browser.close(); }
