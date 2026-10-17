// Payout labels share painted pixels while retaining independent fades/sizes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const baseline = process.argv.includes('--baseline'), out = process.argv.find(a => a.endsWith('.json')) || 'shots/float-cache.json';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/src/3d/items.js', async route => {
    const response = await route.fetch(); let source = (await response.text()).replaceAll('\r\n', '\n');
    if (baseline) {
      const begin = source.indexOf('    // floating money text'), end = source.lastIndexOf('\n  }\n}'); assert.ok(begin > 0 && end > begin);
      source = source.slice(0, begin) + `    // floating money text
    this.floatPool.forEach(s => { s.visible = false; });
    let fi = 0;
    for (const f of pub.floats) {
      const key = f.text + f.color + (f.big ? '!' : '');
      let s = this.floatPool[fi];
      if (!s || s.userData.key !== key) {
        if (!this.floatCache.has(key)) {
          if (this.floatCache.size > 80) for (const [k0, m0] of this.floatCache) {
            if (this.floatPool.some(sp => sp.visible && sp.material === m0)) continue;
            for (const sp of this.floatPool) if (sp.material === m0) sp.userData.key = null;
            m0.map.dispose(); m0.dispose(); this.floatCache.delete(k0); break;
          }
          this.floatCache.set(key, T.textSprite(f.text, { color: f.color, size: 56, bg: null, h: 0.3 }).material);
        }
        if (!s) { s = new THREE.Sprite(); this.group.add(s); this.floatPool[fi] = s; }
        s.material = this.floatCache.get(key); s.userData.key = key;
        const img = s.material.map.image, hh = f.big ? 0.5 : 0.3; s.userData.w = hh * img.width / img.height; s.userData.h = hh;
      }
      const life = 1.6 - f.t;
      s.position.set(f.x * M, 2.35 + life * 0.4, (f.y + 18 * life) * M);
      const near = opts.camera ? Math.min(1, Math.max(0, (s.position.distanceTo(opts.camera.position) - 1.2) / 2)) : 1;
      s.scale.set(s.userData.w * (0.5 + near / 2), s.userData.h * (0.5 + near / 2), 1);
      s.material.opacity = Math.min(1, f.t) * near; s.visible = near > 0; fi++;
    }` + source.slice(end);
    }
    const needle = 'T.textSprite(f.text,'; assert.ok(source.includes(needle));
    source = source.replace(needle, '(window.__floatPaints++, T.textSprite)(f.text,');
    source += `\nwindow.__floatPaints = 0;
const floatUpdate = Items.prototype.update;
Items.prototype.update = function(...a) { const result = floatUpdate.apply(this, a); window.__floatItems = this; return result; };`;
    await route.fulfill({ response, body: source });
  });
  await page.goto('https://10.42.0.37:3161/'); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const THREE = await import('three'), L = __lastCall;
    L.noLock(); L.start('killer', { players: 6 }); L.step(.1); L.S.paused = true; L.render();
    let renderer; const world = L.scene().scene, before = world.onBeforeRender;
    world.onBeforeRender = function(r, ...a) { renderer = r; return before.call(this, r, ...a); }; L.render(); world.onBeforeRender = before;
    const items = __floatItems, camera = new THREE.PerspectiveCamera(45, 2, .1, 30);
    camera.position.set(0, 2.8, 0); camera.lookAt(0, 2.8, -4); camera.updateMatrixWorld();
    const pub = { chars: [], drinks: [], bodies: [], fx: [], floats: [], bowls: [] }, priv = { me: -1, alive: true, spiked: [] };
    const update = floats => { pub.floats = floats; items.update(pub, priv, new Map(), 20, 0, { camera, firstPerson: true }); };
    const make = (text, x, depth, t, big = false, color = '#e8c46a') => ({ text, color, x: x * 60, y: -depth * 60, t, big });
    const cases = [
      ['different ages', [make('+100', -.7, 4, 1.5), make('+100', .7, 4, .2)]],
      ['different distances', [make('+100', -.6, 1.5, 1.3), make('+100', .7, 5, 1.3)]],
      ['big and small', [make('+500', -.7, 4, 1.5), make('+500', .7, 4, .3, true)]],
      ['resize same pool', [make('+500', -.7, 4, .6, true), make('+500', .7, 4, 1.2)]],
      ['loss and color', [make('-100', -.7, 4, .6, false, '#e8443a'), make('-100', .7, 4, 1.4, false, '#e8c46a')]],
      ['hide near camera', [make('+100', -.1, .5, .4), make('+100', .7, 4, 1.4)]],
      ['return visible', [make('+100', -.7, 4, 1.4), make('+100', .1, .5, .4)]],
    ];
    const stage = new THREE.Scene(), rt = new THREE.WebGLRenderTarget(512, 256); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const savedTarget = renderer.getRenderTarget(), savedColor = renderer.getClearColor(new THREE.Color()), savedAlpha = renderer.getClearAlpha();
    const rows = [];
    try {
      renderer.setClearColor(0x08101a, 0);
      for (const [name, floats] of cases) {
        update(floats);
        const actual = [], reference = []; let opacityError = 0, transformError = 0;
        for (let i = 0; i < floats.length; i++) {
          const f = floats[i], sprite = items.floatPool[i], s = new THREE.Sprite(sprite.material.clone());
          const life = 1.6 - f.t; s.position.set(f.x / 60, 2.35 + life * .4, (f.y + 18 * life) / 60);
          const near = Math.min(1, Math.max(0, (s.position.distanceTo(camera.position) - 1.2) / 2)), image = s.material.map.image, h = f.big ? .5 : .3;
          s.scale.set(h * image.width / image.height * (.5 + near / 2), h * (.5 + near / 2), 1);
          s.material.opacity = Math.min(1, f.t) * near; s.visible = near > 0;
          opacityError = Math.max(opacityError, Math.abs(sprite.material.opacity - s.material.opacity));
          transformError = Math.max(transformError, sprite.position.distanceTo(s.position), sprite.scale.distanceTo(s.scale), Number(sprite.visible !== s.visible));
          reference.push(s); const copy = sprite.clone(); copy.material = sprite.material.clone(); actual.push(copy);
        }
        const frames = [];
        for (const list of [actual, reference]) {
          stage.add(...list); renderer.setRenderTarget(rt); renderer.render(stage, camera);
          const pixels = new Uint8Array(512 * 256 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 512, 256, pixels); frames.push(pixels); stage.remove(...list);
        }
        let changed = 0, maxChannel = 0, covered = 0;
        for (let i = 0; i < frames[0].length; i++) { const d = Math.abs(frames[0][i] - frames[1][i]); if (d) changed++; maxChannel = Math.max(maxChannel, d); if (i % 4 === 3 && frames[1][i]) covered++; }
        rows.push({ name, opacityError, transformError, changed, maxChannel, covered });
        for (const s of [...actual, ...reference]) s.material.dispose();
      }
      renderer.render(stage, camera); // Clear the test renderer's last sprite list.
    } finally { renderer.setRenderTarget(savedTarget); renderer.setClearColor(savedColor, savedAlpha); rt.dispose(); }
    const paintsBefore = __floatPaints;
    update([make('+unique-size', -.7, 4, 1), make('+unique-size', .7, 4, .5, true)]);
    const sharing = { paints: __floatPaints - paintsBefore, sameMap: items.floatPool[0].material.map === items.floatPool[1].material.map, separateMaterials: items.floatPool[0].material !== items.floatPool[1].material };
    const maps = new Set(); let disposed = 0;
    const track = () => { for (const m of items.floatCache.values()) if (!maps.has(m.map)) { maps.add(m.map); m.map.addEventListener('dispose', () => disposed++); } };
    track(); let maxCache = items.floatCache.size;
    for (let i = 0; i < 120; i++) { update([make('+' + (1000 + i), -.7, 4, .5), make('+' + (2000 + i), .7, 4, .8)]); track(); maxCache = Math.max(maxCache, items.floatCache.size); }
    const steady = __floatPaints; for (let i = 0; i < 60; i++) update(pub.floats);
    const repeatedPaints = __floatPaints - steady;
    maps.clear();
    const cache = { max: maxCache, final: items.floatCache.size, disposed, repeatedPaints, pooled: items.floatPool.length };
    // An evicted texture still held by a hidden pool slot must be detached.
    update(Array.from({ length: 12 }, (_, i) => make('wide-' + i, (i - 6) * .2, 4, 1)));
    track();
    window.__floatRetired = [...maps].map(m => new WeakRef(m));
    for (let i = 0; i < 100; i++) { update([make('end-' + i, 0, 4, 1)]); track(); }
    let retiredPoolMaps = 0; const currentMaps = new Set([...items.floatCache.values()].map(m => m.map));
    for (const s of items.floatPool) if (s.material.map && !currentMaps.has(s.material.map)) retiredPoolMaps++;
    maps.clear();
    let hiddenWarmup;
    if (!retiredPoolMaps) {
      // Loading can compile hidden materials after their old maps were evicted.
      // Reusing that pool slot must restore the textured shader as well as its map.
      const s = items.floatPool[11];
      if (s.material.map) throw new Error('Expected an evicted hidden slot');
      stage.add(s); s.visible = true; renderer.compile(stage, camera); stage.remove(s); items.group.add(s); s.visible = false;
      update(Array.from({ length: 12 }, (_, i) => make('after-hidden-' + i, .4, 4, 1)));
      const ref = s.clone(); ref.material = s.material.clone();
      const target = new THREE.WebGLRenderTarget(512, 256); target.texture.colorSpace = THREE.SRGBColorSpace;
      const frames = [];
      try {
        renderer.setClearColor(0x08101a, 0);
        for (const sprite of [s, ref]) {
          stage.add(sprite); renderer.setRenderTarget(target); renderer.render(stage, camera);
          const pixels = new Uint8Array(512 * 256 * 4); renderer.readRenderTargetPixels(target, 0, 0, 512, 256, pixels); frames.push(pixels); stage.remove(sprite);
        }
        let changed = 0; for (let i = 0; i < frames[0].length; i++) if (frames[0][i] !== frames[1][i]) changed++;
        hiddenWarmup = { changed, covered: frames[1].filter((v, i) => i % 4 === 3 && v).length };
        renderer.render(stage, camera);
      } finally { items.group.add(s); ref.material.dispose(); renderer.setRenderTarget(savedTarget); renderer.setClearColor(savedColor, savedAlpha); target.dispose(); }
    }
    update(Array.from({ length: 100 }, (_, i) => make('simultaneous-' + i, 0, 4, 1)));
    const saturation = { active: items.floatPool.filter(s => s.visible).length, cache: items.floatCache.size, maps: new Set(items.floatPool.slice(0, 100).map(s => s.material.map)).size };
    update([]); saturation.afterEmpty = items.floatCache.size;
    return { rows, sharing, cache, retiredPoolMaps, saturation, hiddenWarmup };
  });
  const cdp = await page.context().newCDPSession(page); for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100); }
  result.mapsRetained = await page.evaluate(() => __floatRetired.filter(r => r.deref()).length);
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), result, errors }, null, 2));
  assert.deepEqual(errors, []); assert.equal(result.cache.repeatedPaints, 0); assert.ok(result.cache.disposed > 150);
  assert.ok(result.rows.every(r => r.transformError < 1e-12), 'position/scale/visibility match independent payout math');
  if (!baseline) {
    for (const r of result.rows) { assert.equal(r.opacityError, 0, r.name + ': independent fade'); assert.equal(r.changed, 0, r.name + ': independent rendered pixels'); }
    assert.deepEqual(result.sharing, { paints: 1, sameMap: true, separateMaterials: true });
    assert.ok(result.cache.max <= 80); assert.equal(result.retiredPoolMaps, 0); assert.equal(result.mapsRetained, 0, 'evicted maps are collectible');
    assert.deepEqual(result.saturation, { active: 100, cache: 100, maps: 100, afterEmpty: 80 }, 'protect all simultaneous labels, then trim unused text');
    assert.equal(result.hiddenWarmup.changed, 0, 'restoring an evicted texture after hidden shader preparation'); assert.ok(result.hiddenWarmup.covered > 100);
  }
  console.log('PASS: payout cache/fade fixture' + (baseline ? ' baseline measured' : ' preserves independent fades and sizes, shares one painted texture, and releases evictions'), JSON.stringify(result));
} finally { await browser.close(); }
