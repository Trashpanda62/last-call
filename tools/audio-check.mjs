// Verify streamed music, room-specific casino beds, spatial jukebox and independent mute buses.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const gpu = process.env.LC_GPU === 'vulkan' ? ['--use-angle=vulkan', '--enable-features=Vulkan'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: [...gpu, '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true }); const errors = [], failed = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (/\/assets\/audio\//.test(r.url()) && !r.ok()) failed.push(r.url()); });
  await page.addInitScript(() => {
    localStorage.clear(); localStorage.setItem('lc.settings', JSON.stringify({ v: 2, gfx: { preset: 'low' }, voice: { mode: 'off' } }));
    const connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (target, ...rest) { if (target === this.context.destination) window.masterCheck = this; return connect.call(this, target, ...rest); };
    const play = HTMLMediaElement.prototype.play; window.mediaCheck = []; HTMLMediaElement.prototype.play = function (...args) { if (!window.mediaCheck.includes(this)) window.mediaCheck.push(this); return play.apply(this, args); };
  });
  await page.goto('https://10.42.0.37:3161/'); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  await page.evaluate(async () => {
    const A = window.A = await import('/src/audio.js'); A.unlock(); A.setMusic(true); A.setSfx(true); A.setVolumes({ master: .9, music: .5, sfx: 1 }); A.setMood('lounge'); A.setRoom('floor'); A.setListener(960, 350);
    const analyser = A.context().createAnalyser(); analyser.fftSize = 2048; window.masterCheck.connect(analyser);
    window.level = () => { const f = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(f); return Math.sqrt(f.reduce((s, x) => s + x * x, 0) / f.length); };
  });
  await page.waitForFunction(() => window.A.audioInfo().sfx > 90 && window.level() > .0001);
  for (const [x, y, bed] of [[960, 350, 'card-room'], [1320, 920, 'roulette-room'], [1870, 620, 'mixed-tables']]) {
    await page.evaluate(([x, y]) => window.A.setListener(x, y), [x, y]);
    await page.waitForFunction(bed => window.mediaCheck.some(el => el.dataset.asset?.includes('floor-' + bed) && !el.paused && el.currentTime > .4), bed);
    assert.match(await page.evaluate(() => window.A.audioInfo().amb), new RegExp(bed));
  }
  for (const [choice, track] of [['0', 'after-hours'], ['1', 'empty-chairs'], ['2', 'last-wager']]) {
    await page.evaluate(choice => window.A.setSoundscape('music', choice), choice);
    await page.waitForFunction(track => window.mediaCheck.some(el => el.dataset.asset?.includes('house-' + track) && !el.paused && el.currentTime > .4 && el.duration > 58 && el.loop), track);
  }
  // Music remains audible when casino effects are muted; both buses together can be silent.
  await page.evaluate(() => window.A.setSfx(false)); await page.waitForTimeout(3400);
  await page.waitForFunction(() => window.level() > .0001);
  await page.evaluate(() => window.A.setMusic(false)); await page.waitForFunction(() => window.level() < .00001);
  // The physical jukebox plays the old quiet menu track only inside the bar.
  await page.evaluate(() => { window.A.setMusic(true); window.A.setRoom('bar'); window.A.setListener(445, 630); });
  await page.waitForFunction(() => window.A.audioInfo().jukebox?.playing && window.A.audioInfo().jukebox.time > .5);
  const near = await page.evaluate(() => window.A.audioInfo().jukebox); assert.ok(near.distance < 1);
  await page.evaluate(() => window.A.setListener(200, 230));
  assert.ok((await page.evaluate(() => window.A.audioInfo().jukebox.distance)) > 7);
  await page.evaluate(() => window.A.setRoom('floor')); await page.waitForFunction(() => !window.A.audioInfo().jukebox.playing);
  await page.evaluate(() => { window.A.setMusic(false); window.A.setSfx(true); window.A.setMood('over'); });
  await page.waitForTimeout(3500); await page.waitForFunction(() => window.level() < .00001);
  await page.evaluate(() => window.A.sfx('cough')); await page.waitForFunction(() => window.level() > .0001); await page.waitForTimeout(3600);
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  console.log('PASS: three audible 60-second looping scores, nearby card/roulette/mixed beds, independent mute buses, spatial bar jukebox, and isolated cough.', JSON.stringify(near));
} finally { await browser.close(); }
