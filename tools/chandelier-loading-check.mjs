// Generated chandeliers should not prepare unused fallback bulb meshes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const baseline = process.argv.includes('--baseline'), out = process.argv.find(a => a.endsWith('.json')) || 'shots/chandelier-loading.json';
const rebuilds = process.argv.includes('--rebuilds');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const rows = [], errors = [];
  for (const fallback of [false, true]) {
    const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }); page.on('pageerror', e => errors.push(e.message));
    if (rebuilds) await page.route('**/src/3d/render3d.js', async route => {
      const response = await route.fetch(), source = await response.text(); assert.ok(source.includes('function rebuildWorld() {'));
      await route.fulfill({ response, body: source + '\nwindow.__rebuildChandelierWorld = rebuildWorld;' });
    });
    await page.route('**/src/3d/world.js', async route => {
      const response = await route.fetch(); let source = await response.text();
      const needle = 'const list = ctx.chandeliers = [];'; assert.ok(source.includes(needle));
      source = source.replace(needle, 'const list = window.__chandelierActors = ctx.chandeliers = []; window.__chandelierContext = ctx;');
      await route.fulfill({ response, body: source });
    });
    await page.addInitScript(() => {
      const context = HTMLCanvasElement.prototype.getContext; window.__chandelierUploads = [];
      window.__chandelierMountUploads = [];
      HTMLCanvasElement.prototype.getContext = function(kind, ...a) {
        const gl = context.call(this, kind, ...a);
        if (kind === 'webgl2' && gl && !gl.chandelierHook) {
          gl.chandelierHook = true; const buffer = gl.bufferData;
          gl.bufferData = function(target, data, ...rest) {
            const entries = (window.__chandelierActors || []).filter(e => e?.bm);
            const instance = entries.some(e => e.bm.instanceMatrix.array === data), geometry = entries.some(e => [...Object.values(e.bm.geometry.attributes), e.bm.geometry.index].some(a => a?.array === data));
            if (instance || geometry) __chandelierUploads.push({ kind: instance ? 'instance' : 'geometry', bytes: data.byteLength });
            const mounts = (window.__chandelierActors || []).filter(e => e?.model).flatMap(e => e.g.children.filter(o => o.name === 'static-shared'));
            if (mounts.some(o => [...Object.values(o.geometry.attributes), o.geometry.index].some(a => a?.array === data))) __chandelierMountUploads.push({ bytes: data.byteLength });
            return buffer.call(this, target, data, ...rest);
          };
        }
        return gl;
      };
    });
    await page.goto('https://10.42.0.37:3161/' + (fallback ? '?noprops' : '')); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
    rows.push(await page.evaluate(async fallback => {
      const entries = __chandelierActors.filter(Boolean), step = __chandelierContext.anim.find(a => typeof a === 'function' && a.toString().includes('const chs ='));
      if (!step) throw new Error('Chandelier animation not captured');
      const mounts = entries.filter(e => e.model).map(e => e.g.children.find(o => o.name === 'static-shared'));
      if (mounts.some(o => !o)) throw new Error('Missing chandelier mount');
      const hash = async g => {
        const result = [];
        for (const [key, a] of [...Object.entries(g.attributes), ['index', g.index]]) if (a) {
          const bytes = new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength);
          result.push({ key, type: a.array.constructor.name, itemSize: a.itemSize, normalized: a.normalized, hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('') });
        }
        return JSON.stringify({ attributes: result, groups: g.groups, range: [g.drawRange.start, String(g.drawRange.count)] });
      };
      let mountReference = null;
      if (!fallback) {
        const { Batch, MAT, cyl, v3, WALL_H } = await import('/src/3d/world.js'), THREE = await import('three');
        const batch = new Batch(true), group = new THREE.Group();
        batch.add(cyl(.012, .012, .5, 6), MAT.gold, v3(0, WALL_H - .25, 0)); batch.add(cyl(.18, .12, .08, 16), MAT.gold, v3(0, WALL_H - .04, 0)); batch.build(group);
        mountReference = await hash(group.children[0].geometry);
      }
      const mountHashes = await Promise.all(mounts.map(o => hash(o.geometry)));
      __lastCall.S.paused = true;
      const checks = [], states = [['up', 0], ['falling', 1.4], ['falling', .8], ['falling', .3], ['falling', .05], ['down', 0], ['up', 0]];
      for (const [state, age] of states) {
        const t = 20; step(t, 0, { pub: { chandeliers: __chandelierActors.map((e, id) => e ? { id, state, t: age } : null).filter(Boolean) } });
        let error = 0, visibleBulbs = 0;
        for (const e of entries) {
          const shake = Math.min(1, (1.6 - age) / .8) * .06;
          const y = state === 'up' ? 0 : state === 'down' ? -e.drop : age < .35 ? -e.drop * (1 - (age / .35) ** 2) : 0;
          const rotation = state === 'up' ? [0, 0, 0] : state === 'down' ? [.12, e.seed % 3, .22] : [Math.sin(t * 31 + e.seed) * shake, 0, Math.cos(t * 27 + e.seed) * shake];
          const power = state === 'up' ? e.power : state === 'down' ? 0 : e.power * (.5 + .5 * Math.abs(Math.sin(t * 40)));
          error = Math.max(error, Math.abs(e.g.position.y - y), Math.abs(e.spot.power - power), ...rotation.map((v, i) => Math.abs(e.g.rotation[['x', 'y', 'z'][i]] - v)));
          if (e.bm?.visible) visibleBulbs++;
        }
        checks.push({ state, age, error, visibleBulbs });
      }
      const uploads = __chandelierUploads;
      return { fallback, entries: entries.length, models: entries.filter(e => e.model).length, bulbMeshes: entries.filter(e => e.bm).length, bulbInstances: entries.reduce((n, e) => n + (e.bm?.count || 0), 0), uploads, bytes: uploads.reduce((n, u) => n + u.bytes, 0), mountGeometryCount: new Set(mounts.map(o => o.geometry)).size, mountObjectCount: new Set(mounts).size, mountReference, mountHashes, mountUploads: __chandelierMountUploads, checks, gfx: __lastCall.gfx() };
    }, fallback));
    if (rebuilds) rows[rows.length - 1].rebuilds = await page.evaluate(async () => {
      const L = __lastCall, D = await import('/src/3d/render3d.js'), cycles = [];
      L.noLock(); L.start('killer', { players: 32 }); L.step(.1); L.S.paused = true;
      for (let i = 0; i < 3; i++) {
        const previous = new Set(__chandelierActors.filter(e => e?.model).flatMap(e => e.g.children.filter(o => o.name === 'static-shared').map(o => o.geometry))), retired = new Set();
        for (const g of previous) g.addEventListener('dispose', () => retired.add(g));
        L.S.screen = 'briefing'; __rebuildChandelierWorld();
        await D.warmup({ pub: L.view.pub, priv: L.view.priv, me: L.S.me, mode: 'fp' });
        L.S.screen = 'game'; L.place(1300, 600); L.look(Math.PI / 2); L.render();
        const current = new Set(__chandelierActors.filter(e => e?.model).flatMap(e => e.g.children.filter(o => o.name === 'static-shared').map(o => o.geometry)));
        cycles.push({ previous: previous.size, retired: retired.size, current: current.size, reusedOld: [...current].some(g => previous.has(g)), gfx: L.gfx() });
      }
      return cycles;
    });
    await page.close();
  }
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows, errors }, null, 2));
  assert.deepEqual(errors, []);
  for (const r of rows) { assert.ok(r.entries > 5); for (const c of r.checks) { assert.ok(c.error < 1e-12); assert.equal(c.visibleBulbs, r.fallback && c.state !== 'down' ? r.entries : 0); } }
  assert.equal(rows[0].models, rows[0].entries); assert.equal(rows[1].models, 0); assert.equal(rows[1].bulbMeshes, rows[1].entries); assert.ok(rows[1].bytes > 0);
  assert.equal(rows[0].mountObjectCount, rows[0].entries); assert.ok(rows[0].mountHashes.every(h => h === rows[0].mountReference));
  assert.equal(rows[0].mountGeometryCount, baseline ? rows[0].entries : 1);
  if (rebuilds) for (const row of rows) {
    for (const cycle of row.rebuilds) { assert.equal(cycle.retired, cycle.previous); assert.equal(cycle.current, row.fallback ? 0 : 1); assert.equal(cycle.reusedOld, false); }
    assert.equal(new Set(row.rebuilds.map(c => c.gfx.geos)).size, 1, 'geometry allocations plateau after actual world replacement');
    assert.ok(Math.max(...row.rebuilds.map(c => c.gfx.tex)) - Math.min(...row.rebuilds.map(c => c.gfx.tex)) <= 1, 'texture allocations plateau after actual world replacement');
  }
  if (!baseline) { assert.equal(rows[0].bulbMeshes, 0); assert.deepEqual(rows[0].uploads, []); }
  console.log('PASS: generated and no-model chandelier light/fall/down/reset states' + (baseline ? ' measured.' : ' retain original transforms; normal build prepares no unused bulb meshes/buffers.'), JSON.stringify(rows.map(({ checks, gfx, uploads, ...r }) => r)));
} finally { await browser.close(); }
