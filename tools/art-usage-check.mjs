// Trace actual generated-art consumers across the rooms and every betting game.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const baseline = process.argv.includes('--baseline'), probe = process.argv.includes('--probe');
const obsolete = ['screen-plinko', 'screen-wheel', 'screen-coin'];
const out = process.argv.find(a => a.endsWith('.json')) || 'shots/art-usage.json';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [], requested = [];
  await page.addInitScript(() => { performance.setResourceTimingBufferSize(2000); window.__artReads = new Map(); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/\/assets\/art2\/.*\.webp/.test(r.url())) requested.push(new URL(r.url()).pathname); });
  await page.route('**/src/paint.js', async route => {
    const response = await route.fetch(), body = await response.text(), needle = 'export const ART = {};';
    assert.ok(body.includes(needle));
    await route.fulfill({ response, body: body.replace(needle, `export const ART = new Proxy({}, { get(target, key, receiver) {
      if (typeof key === 'string') __artReads.set(key, (__artReads.get(key) || 0) + 1);
      return Reflect.get(target, key, receiver);
    } });`) });
  });
  if (baseline) await page.route('**/src/3d/textures.js', async route => {
    const response = await route.fetch(); let body = await response.text();
    const old = "...['mines', 'tower', 'plinko', 'wheel', 'coin'].map(k => 'screen-' + k)", current = "...['mines', 'tower'].map(k => 'screen-' + k)";
    assert.ok(body.includes(old) || body.includes(current));
    body = body.replace(current, old);
    await route.fulfill({ response, body });
  });
  // These retired images must not participate in the required-asset barrier.
  if (!baseline && !probe) for (const name of obsolete) await page.route('**/assets/art2/' + name + '.webp', route => route.abort());
  await page.goto((process.env.LC_URL || 'https://10.42.0.37:3161/') + (process.argv.includes('--fallback') ? '?noprops' : ''));
  await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const L = __lastCall; L.noLock(); L.start('gambler', { players: 32 }); L.step(.1); L.S.paused = true;
    const games = [], views = [];
    for (const game of ['slots', 'bj', 'roulette', 'dice', 'plinko', 'mines', 'tower', 'crash', 'race', 'coin', 'wheel']) {
      if (L.view.priv.seat) L.act('leave');
      const seat = L.state.seats.find(s => s.game === game); if (!seat) throw Error('Missing game ' + game);
      if (seat.occ) seat.occ.seat = null; seat.occ = seat.claim = null;
      L.place(seat.x, seat.y); L.look(seat.face, -.35); L.render();
      const active = L.table()?.game, part = L.parts().find(p => p.part.startsWith('spot:'))?.part;
      const placed = part ? L.press(part) : false; L.render(); L.render();
      games.push({ game, active, part, placed });
    }
    if (L.view.priv.seat) L.act('leave');
    for (const [name, x, y, look] of [['floor', 1300, 600, Math.PI / 2], ['bar', 350, 400, -Math.PI / 2], ['rest', 330, 1000, Math.PI], ['arcade', 2530, 430, -Math.PI / 2], ['race', 2180, 960, Math.PI], ['slots', 1300, 1480, Math.PI / 2], ['vip', 2500, 1500, Math.PI / 2], ['backrooms', 1300, 600, Math.PI / 2]]) {
      L.place(x, y); L.look(look, -.05); if (name === 'backrooms') L.state.backrooms = true; L.render(); L.render(); views.push(name);
    }
    const { ART } = await import('./src/paint.js'), { ART2_NAMES } = await import('./src/3d/textures.js');
    // Snapshot consumption before inspecting the inventory. Descriptors do not
    // invoke the Proxy get trap, so reporting images cannot create fake uses.
    const used = [...__artReads], reads = new Map(used), descriptors = Object.getOwnPropertyDescriptors(ART);
    const resources = performance.getEntriesByType('resource');
    const images = ART2_NAMES.map(name => {
      const im = descriptors[name]?.value;
      return { name, reads: reads.get(name) || 0, width: im?.width, height: im?.height,
        encodedBytes: resources.find(r => r.name.endsWith('/assets/art2/' + name + '.webp'))?.encodedBodySize,
        decodedImageBytesEstimate: (im?.width || 0) * (im?.height || 0) * 4 };
    });
    return { names: ART2_NAMES, used, unused: images.filter(im => !im.reads), images, games, views, gfx: L.gfx() };
  });
  const repeated = requested.filter((path, i) => requested.indexOf(path) !== i);
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), baseline, ...result, requested, repeated, errors }, null, 2));
  assert.deepEqual(errors, []); assert.deepEqual(repeated, []); assert.equal(result.views.length, 8);
  for (const row of result.games) { assert.equal(row.active, row.game); assert.ok(row.part && row.placed, row.game + ': exercise actual chip placement'); }
  if (!probe) {
    assert.deepEqual(result.unused.map(im => im.name).sort(), baseline ? [...obsolete].sort() : [], 'every prepared image must have an actual consumer');
    for (const name of obsolete) assert.equal(requested.some(path => path.endsWith('/' + name + '.webp')), baseline, 'only the baseline requests ' + name);
  }
  console.log('PASS: actual art consumers across 8 rooms and 11 betting games.', JSON.stringify({ images: result.names.length, unused: result.unused, repeated, errors }));
} finally { await browser.close(); }
