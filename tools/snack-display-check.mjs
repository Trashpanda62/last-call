// Compare static tray instances with the original food meshes, including fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const out = process.argv.find(a => a.endsWith('.json')) || 'shots/snack-display.json';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const rows = [], errors = [];
  for (const fallback of [false, true]) {
    const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/3d/items.js', async route => {
      const response = await route.fetch(); let source = await response.text();
      const needle = 'this.bowls = [];'; assert.ok(source.includes(needle));
      source = source.replace(needle, 'window.__snackItems = this; ' + needle);
      await route.fulfill({ response, body: source });
    });
    await page.goto('https://10.42.0.37:3161/' + (fallback ? '?noprops' : ''));
    await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
    const result = await page.evaluate(async () => {
      const THREE = await import('three'), { makeSnack, batchSnackDisplay } = await import('./src/3d/snacks.js'), L = __lastCall;
      L.noLock(); L.start('killer', { players: 32 }); L.step(.1); L.S.paused = true; L.render();
      const canvas = document.createElement('canvas'), renderer = new THREE.WebGLRenderer({ canvas });
      renderer.setSize(512, 384); renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      const target = new THREE.WebGLRenderTarget(512, 384), scene = new THREE.Scene(); scene.background = new THREE.Color(0x101010);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x202040, 2));
      const light = new THREE.DirectionalLight(0xffddaa, 3); light.position.set(2, 3, 4); scene.add(light);
      const camera = new THREE.PerspectiveCamera(40, 512 / 384, .01, 10), fixtures = [];
      let maxMatrixError = 0, allShared = true, allFlags = true;
      const read = root => {
        scene.add(root); renderer.setRenderTarget(target); renderer.info.reset(); renderer.render(scene, camera);
        const pixels = new Uint8Array(512 * 384 * 4); renderer.readRenderTargetPixels(target, 0, 0, 512, 384, pixels);
        scene.remove(root); return { pixels, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      };
      for (let kind = 0; kind < 3; kind++) {
        const original = new THREE.Group(), expected = new Map();
        for (let i = 0; i < 3; i++) {
          const food = makeSnack(kind, .19); food.position.set(Math.cos(i * 2.1) * .105, .95 + .032 + i * .005, Math.sin(i * 2.1) * .105); food.rotation.y = i * 1.4; original.add(food);
        }
        original.updateMatrixWorld(true);
        original.traverse(o => {
          if (!o.isMesh) return;
          let materials = expected.get(o.geometry); if (!materials) expected.set(o.geometry, materials = new Map());
          let e = materials.get(o.material); if (!e) materials.set(o.material, e = { source: o, matrices: [] }); e.matrices.push(o.matrixWorld.clone());
        });
        const batched = batchSnackDisplay(original), matrix = new THREE.Matrix4();
        batched.traverse(o => {
          if (!o.isInstancedMesh) return;
          const e = expected.get(o.geometry)?.get(o.material); allShared &&= !!e;
          if (!e) return;
          allFlags &&= o.castShadow === e.source.castShadow && o.receiveShadow === e.source.receiveShadow && o.renderOrder === e.source.renderOrder && o.count === e.matrices.length;
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, matrix);
            for (let j = 0; j < 16; j++) maxMatrixError = Math.max(maxMatrixError, Math.abs(matrix.elements[j] - e.matrices[i].elements[j]));
          }
        });
        for (let angle = 0; angle < 4; angle++) {
          const a = angle * Math.PI / 2; camera.position.set(Math.sin(a) * .65, 1.32, Math.cos(a) * .65); camera.lookAt(0, 1, 0);
          const before = read(original), after = read(batched); let changed = 0, aboveOne = 0, maxChannel = 0, total = 0;
          for (let i = 0; i < before.pixels.length; i += 4) {
            const d = Math.max(...[0, 1, 2].map(k => Math.abs(before.pixels[i + k] - after.pixels[i + k])));
            if (d) changed++; if (d > 1) aboveOne++; total += d; maxChannel = Math.max(maxChannel, d);
          }
          fixtures.push({ kind, angle, before: before.calls, after: after.calls, trianglesBefore: before.triangles, trianglesAfter: after.triangles, changed, aboveOne, maxChannel, meanMaxChannel: total / (512 * 384) });
        }
        batched.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
      }
      renderer.dispose(); target.dispose();
      const items = __snackItems, bowls = L.state.bowls, shared = [], rebuilds = [];
      for (let i = 0; i < 8; i++) {
        let disposed = 0, expectedDisposals = 0;
        for (const root of items.bowls) root.traverse(o => { if (o.isInstancedMesh) { expectedDisposals++; o.addEventListener('dispose', () => disposed++); } });
        items.bowlsProp = 'force asset replacement'; items.ensureBowls(bowls); L.render();
        rebuilds.push({ disposed, expectedDisposals, geos: L.gfx().geos, textures: L.gfx().tex });
        shared.push({ dishes: new Set(items.bowls.map(g => g.children[0].geometry)).size, materials: new Set(items.bowls.map(g => g.children[0].material)).size, glows: new Set(items.bowls.map(g => g.userData.glow.geometry)).size });
      }
      return { fixtures, maxMatrixError, allShared, allFlags, shared, rebuilds };
    });
    rows.push({ fallback, ...result }); await page.close();
  }
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rows, errors }, null, 2));
  assert.deepEqual(errors, []);
  for (const r of rows) {
    assert.ok(r.allShared && r.allFlags); assert.ok(r.maxMatrixError < 1e-6);
    // Instance matrices use float32 attributes. The fallback's intersecting
    // pretzel loops/salt have a few changed edge pixels under that rounding;
    // bound both their area (<0.05%) and mean channel difference (<0.01/255).
    for (const f of r.fixtures) { assert.ok(f.after < f.before); assert.equal(f.trianglesBefore, f.trianglesAfter); assert.ok(f.aboveOne < 512 * 384 * .0005, JSON.stringify(f)); assert.ok(f.meanMaxChannel < .01, JSON.stringify(f)); }
    for (const s of r.shared) assert.deepEqual(s, { dishes: 1, materials: 1, glows: 1 });
    for (const b of r.rebuilds) assert.equal(b.disposed, b.expectedDisposals);
    assert.equal(new Set(r.rebuilds.map(b => b.geos)).size, 1);
  }
  console.log('PASS: original snack geometry/materials/shadow flags/triangles retained; tray draws reduced; eight replacements dispose instance buffers and retain shared resources.', JSON.stringify(rows.map(r => ({ fallback: r.fallback, maxMatrixError: r.maxMatrixError, fixtures: r.fixtures, rebuilds: r.rebuilds }))));
} finally { await browser.close(); }
