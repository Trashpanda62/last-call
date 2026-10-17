// Preserve falling/settled corpse transforms while measuring duplicate posing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const baseline = process.argv.includes('--baseline'), out = process.argv.find(a => a.endsWith('.json')) || 'shots/body-poses.json';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const variants = [];
  for (const toy of [false, true]) {
    const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (baseline) await page.route('**/src/3d/items.js', async route => {
      const response = await route.fetch(); let source = (await response.text()).replaceAll('\r\n', '\n');
      const start = source.indexOf('      const fall = THREE.MathUtils.smoothstep(t - e.born, 0, .65);');
      if (start >= 0) {
        const end = source.indexOf('\n    }\n    for (const [k, e]', start); assert.ok(end > start);
        source = source.slice(0, start) + `      e.bean.update({ x: b.x * M, z: b.y * M, face: e.face, look: e.face, t, dt });
      const fall = THREE.MathUtils.smoothstep(t - e.born, 0, .65), model = e.bean.model;
      if (model && fall < 1) { model.rotation.x *= fall; model.position.y *= fall; model.position.z *= fall; }
      e.pud.scale.set(1.3 * Math.max(.05, fall), .8 * Math.max(.05, fall), 1);` + source.slice(end);
      }
      await route.fulfill({ response, body: source });
    });
    await page.goto('https://10.42.0.37:3161/' + (toy ? '?toy' : '')); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
    const result = await page.evaluate(async () => {
      const { Items } = await import('./src/3d/items.js'), { CAST } = await import('./src/config.js'), THREE = await import('three'), L = __lastCall;
      let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      L.noLock(); L.start('killer', { players: 32 }); L.step(.1); L.S.paused = true;
      seed = 42;
      const stage = new THREE.Scene(), items = new Items(stage), beans = new Map(), camera = L.scene().camera;
      const priv = { ...L.view.priv, me: 0, spiked: [], alive: false }, pub = { ...L.view.pub, drinks: [], bowls: [], fx: [], floats: [], chars: Array.from({ length: 32 }, (_, id) => ({ ...CAST[id % CAST.length], id, alive: false, eating: 0 })) };
      const bodies = n => Array.from({ length: n }, (_, i) => ({ id: i, x: 1200 + i * 12, y: 600 + i % 4 * 20, cause: ['poison', 'trap', 'drown', 'blade'][i % 4] }));
      pub.bodies = bodies(8); const snapshots = [];
      const update = (t, deathActive = false) => items.update(pub, priv, beans, t, 1 / 60, { firstPerson: true, camera, deathActive });
      const snapshot = name => {
        stage.updateMatrixWorld(true); const values = [], types = [];
        for (const [key, entry] of items.bodies) {
          types.push(key);
          for (const root of [entry.bean.root, entry.pud]) root.traverse(o => {
            types.push([o.type, o.name, o.visible]); values.push(...o.matrixWorld.elements);
            if (o.isSkinnedMesh) values.push(...o.bindMatrix.elements, ...o.bindMatrixInverse.elements);
          });
        }
        snapshots.push({ name, bodies: items.bodies.size, types, bytes: new Float64Array(values).buffer });
      };
      for (const t of [10, 10.01, 10.1, 10.3, 10.649, 10.65, 10.651, 11, 12]) { update(t); snapshot('time-' + t); }
      update(12, true); snapshot('private-cinematic'); update(12, false); snapshot('cinematic-return');
      update(9); snapshot('clock-rewind'); update(10.1); snapshot('after-rewind'); update(12); snapshot('resettled');
      pub.bodies[0].x += 10; update(13); snapshot('body-moved'); update(14); snapshot('moved-settled');
      pub.bodies.splice(2, 3); update(15); snapshot('removed-three'); pub.bodies = []; update(16); snapshot('clear');
      pub.bodies = bodies(8); update(20); snapshot('return'); update(21); snapshot('return-settled');
      pub.bodies = []; update(99); pub.bodies = bodies(31); update(100); update(101);
      let calls = 0;
      const wrap = () => { for (const { bean } of items.bodies.values()) { const original = bean.update; bean.update = function(...args) { calls++; return original.apply(this, args); }; } };
      wrap(); const start = performance.now(); for (let i = 0; i < 120; i++) update(102 + i / 60);
      const settled = { bodies: items.bodies.size, frames: 120, calls, ms: performance.now() - start };
      pub.bodies = []; update(199); pub.bodies = bodies(31); update(200); calls = 0; wrap();
      for (let i = 1; i <= 30; i++) update(200 + i * .01);
      const falling = { bodies: items.bodies.size, frames: 30, calls };
      pub.bodies = []; update(201);
      const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
      const cases = []; for (const row of snapshots) { const { bytes, ...data } = row; cases.push({ ...data, hash: await hash(bytes) }); }
      return { cases, settled, falling, remainingBodies: items.bodies.size };
    });
    assert.deepEqual(errors, []); assert.equal(result.remainingBodies, 0); assert.equal(result.falling.calls, 930); assert.equal(result.settled.calls, baseline ? 3720 : 0);
    variants.push({ toy, ...result, errors }); await page.close();
  }
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), variants }, null, 2));
  if (!baseline) {
    const original = JSON.parse(fs.readFileSync('docs/performance/2026-10-16-body-poses-before.json'));
    for (let i = 0; i < variants.length; i++) for (let j = 0; j < variants[i].cases.length; j++) assert.deepEqual(variants[i].cases[j], original.variants[i].cases[j], 'original transforms, bind matrices and visibility: toy=' + variants[i].toy + ', ' + variants[i].cases[j].name);
  }
  console.log(JSON.stringify(variants.map(v => ({ toy: v.toy, cases: v.cases.length, settled: v.settled, falling: v.falling }))));
  console.log('PASS: corpse fall, settling, private-cinematic visibility, clock rewind, relocation, clearing and return for potato and fallback characters' + (baseline ? ' (original transforms recorded).' : '; exact original transform hashes with no repeated settled posing.'));
} finally { await browser.close(); }
