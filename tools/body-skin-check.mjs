// Measure corpse bone uploads and verify cached matrices against full skinning.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const baseline = process.argv.includes('--baseline'), legacyWorld = process.argv.includes('--legacy-world'), out = process.argv.find(a => a.endsWith('.json')) || 'shots/body-skin.json';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/src/3d/render3d.js', async route => {
    const response = await route.fetch(); let source = await response.text();
    const actor = 'R.scene.add(b.root); R.beans.set(c.id, b);'; assert.ok(source.includes(actor));
    source = source.replace(actor, actor + ' b.root.userData.playtestActorId = c.id;');
    if (legacyWorld) {
      const needle = 'if (sameParent && bodyCache.version === bodyState.version && bodyCache.gfx === R.gfx) return;';
      assert.ok(source.includes(needle)); source = source.replace(needle, 'if (false) return;');
    }
    await route.fulfill({ response, body: source });
  });
  await page.goto('https://10.42.0.37:3161/'); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const { Items } = await import('./src/3d/items.js'), THREE = await import('three'), L = __lastCall;
    const random = Math.random;
    let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    L.noLock(); L.start('killer', { players: 32 }); L.step(.1); L.S.paused = true; L.place(1300, 600); L.look(Math.PI / 2, -.2);
    L.state.fx = []; L.state.haunts = []; L.state.bodies = [];
    L.render();
    window.__deadAvatarRefs = L.scene().scene.children.filter(o => o.userData.playtestActorId >= 1).map(o => new WeakRef(o));
    for (let i = 1; i < 32; i++) { L.state.chars[i].alive = false; L.state.bodies.push({ id: i, x: 1180 + (i - 1) % 8 * 35, y: 680 + Math.floor((i - 1) / 8) * 45, cause: 'blade' }); }
    let items, renderer;
    const itemUpdate = Items.prototype.update;
    Items.prototype.update = function(...a) { items = this; return itemUpdate.apply(this, a); };
    const scene = L.scene().scene, before = scene.onBeforeRender;
    scene.onBeforeRender = function(r, ...a) { renderer = r; return before.call(this, r, ...a); }; L.render(); scene.onBeforeRender = before; Items.prototype.update = itemUpdate;
    const deadAvatars = L.scene().actors.filter(a => !L.state.chars[a.id].alive).length;
    const clock = performance.now, frozen = clock.call(performance), began = L.state.t; performance.now = () => frozen;
    const skeletons = () => { const out = new Set(); for (const e of items.bodies.values()) e.bean.root.traverse(o => { if (o.isSkinnedMesh) out.add(o.skeleton); }); return [...out]; };
    const gl = renderer.getContext(), upload = gl.texSubImage2D, data = new WeakMap(); let uploads = [];
    const refresh = () => { for (const s of skeletons()) if (s.boneTexture) data.set(s.boneTexture.image.data, s); };
    gl.texSubImage2D = function(...a) { const source = a.at(-1); if (data.has(source)) uploads.push(source.byteLength); return upload.apply(this, a); };
    const checks = [], check = name => {
      const transforms = [];
      for (const e of items.bodies.values()) e.bean.root.traverseVisible(o => transforms.push([o, o.matrixWorld.elements.slice(), o.isSkinnedMesh ? o.bindMatrixInverse.elements.slice() : null]));
      scene.updateMatrixWorld(true);
      let worldError = 0;
      for (const [o, matrix, bind] of transforms) for (let i = 0; i < 16; i++) { worldError = Math.max(worldError, Math.abs(matrix[i] - o.matrixWorld.elements[i])); if (bind) worldError = Math.max(worldError, Math.abs(bind[i] - o.bindMatrixInverse.elements[i])); }
      let maxError = 0, tested = 0;
      for (const s of skeletons()) {
        if (!s.boneTexture) continue; const saved = s.boneMatrices.slice(); Object.getPrototypeOf(s).update.call(s);
        for (let i = 0; i < saved.length; i++) maxError = Math.max(maxError, Math.abs(saved[i] - s.boneMatrices[i])); tested++;
      }
      checks.push({ name, skeletons: tested, maxError, worldError, nodes: transforms.length });
    };
    let steady;
    try {
      for (const age of [.1, .3, .64, .65, 1]) { L.state.t = began + age; L.render(); check('fall-' + age); }
      refresh(); L.render(); uploads = []; const versions = skeletons().map(s => [s, s.boneTexture.version]);
      const bodyNodes = new Set(); for (const e of items.bodies.values()) e.bean.root.traverse(o => bodyNodes.add(o));
      const localUpdate = THREE.Object3D.prototype.updateMatrix; let matrixUpdates = 0;
      THREE.Object3D.prototype.updateMatrix = function(...a) { if (bodyNodes.has(this)) matrixUpdates++; return localUpdate.apply(this, a); };
      try { for (let i = 0; i < 30; i++) L.render(); } finally { THREE.Object3D.prototype.updateMatrix = localUpdate; bodyNodes.clear(); }
      steady = { bodies: items.bodies.size, frames: 30, updates: versions.map(([s, v]) => s.boneTexture.version - v), uploads: uploads.length, bytes: uploads.reduce((a, b) => a + b, 0), matrixUpdates }; check('settled');
      for (const age of [.3, .5, .8, 2]) { L.state.t = began + age; L.render(); check('rewind-' + age); }
      L.state.bodies[0].x += 15; L.render(); check('relocated-start'); L.state.t += 1; L.render(); check('relocated-settled');
      L.place(350, 400); L.look(-Math.PI / 2); L.render(); L.place(1300, 600); L.look(Math.PI / 2, -.2); L.render(); check('camera-return');
      items.group.position.x = .25; L.render(); check('parent-moved'); items.group.position.x = 0; L.render(); check('parent-restored');
      window.__removedBodyRefs = [...items.bodies.values()].flatMap(e => [new WeakRef(e.bean.root), ...[...e.skeletons].map(s => new WeakRef(s))]);
      L.state.bodies = []; L.render();
    } finally { gl.texSubImage2D = upload; performance.now = clock; Math.random = random; }
    return { steady, checks, remainingBodies: items.bodies.size, deadAvatars };
  });
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100); }
  result.lifetime = await page.evaluate(() => ({ tracked: __removedBodyRefs.length, retained: __removedBodyRefs.filter(r => r.deref()).length, avatarsTracked: __deadAvatarRefs.length, avatarsRetained: __deadAvatarRefs.filter(r => r.deref()).length }));
  result.revival = await page.evaluate(() => {
    const L = __lastCall, scene = L.scene().scene, before = scene.onBeforeRender;
    let renderer;
    scene.onBeforeRender = function(r, ...a) { renderer = r; return before.call(this, r, ...a); };
    L.render(); scene.onBeforeRender = before;
    const gl = renderer.getContext(), link = gl.linkProgram, buffer = gl.bufferData;
    let links = 0, buffers = 0;
    gl.linkProgram = function(...a) { links++; return link.apply(this, a); };
    gl.bufferData = function(...a) { buffers++; return buffer.apply(this, a); };
    try {
      L.state.chars[1].alive = true; L.render();
      const alive = L.scene().actors.find(a => a.id === 1);
      L.state.chars[1].alive = false; L.render();
      return { present: !!alive, visible: !!alive?.visible, removedAgain: !L.scene().actors.some(a => a.id === 1), links, buffers };
    } finally { gl.linkProgram = link; gl.bufferData = buffer; }
  });
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), result, errors }, null, 2));
  assert.deepEqual(errors, []); assert.equal(result.remainingBodies, 0); assert.equal(result.steady.bodies, 31);
  assert.ok(result.lifetime.tracked >= 62); assert.equal(result.lifetime.retained, 0, 'removed corpse roots/skeletons remain collectible');
  for (const row of result.checks) { assert.ok(row.skeletons >= 30); assert.ok(row.maxError < 1e-8, row.name + ': independent complete skinning'); assert.ok(row.worldError < 1e-8, row.name + ': complete world/bind update'); }
  if (!baseline) { assert.equal(result.steady.uploads, 0); assert.ok(result.steady.updates.every(v => v === 0)); }
  if (!baseline && !legacyWorld) assert.equal(result.steady.matrixUpdates, 0, 'settled corpse hierarchies skip unchanged local/world updates');
  if (!baseline) { assert.equal(result.deadAvatars, 0, 'no duplicate hidden living avatars for dead characters'); assert.equal(result.lifetime.avatarsRetained, 0); }
  assert.ok(result.revival.present && result.revival.visible, 'revived characters rebuild a visible actor');
  assert.equal(result.revival.links, 0, 'revival reuses prepared shader programs'); assert.equal(result.revival.buffers, 0, 'revival reuses prepared geometry');
  if (!baseline) assert.ok(result.revival.removedAgain, 'another death releases the replacement actor');
  console.log(JSON.stringify(result)); console.log('PASS: real corpse bone matrices match complete native skinning during falls, settling, rewind, relocation and camera return' + (baseline ? ' (settled uploads measured).' : '; settled poses avoid bone texture updates/uploads.'));
} finally { await browser.close(); }
