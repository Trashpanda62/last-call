// Exercise the real first-person item/ghost paths after the actual level warmup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
const out = process.argv[2] || 'shots/inventory-loading.json';
fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (process.argv.includes('--baseline') || process.argv.includes('--shared-snacks')) await page.route('**/src/3d/items.js', async route => {
    const response = await route.fetch(), source = await response.text();
    let body = source.replace(/function heldSnack\(kind\) \{[\s\S]*?\n\}\n/, 'function heldSnack(kind) { return makeSnack(kind, .25); }\n');
    if (process.argv.includes('--baseline')) body = body.replace(/    \/\/ This marker is otherwise[\s\S]*?    this\.group\.add\(inventory\);\n/, '')
      .replace(/    if \(this\.inventoryAssets !== assets\) \{[\s\S]*?^    \}\n/m, '')
      .replace('const glow = new THREE.Mesh(drinkGlowGeo, spikeMat);', 'const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), spikeMat);');
    assert.notEqual(body, source, 'baseline must restore deferred per-drink geometry and world materials');
    await route.fulfill({ response, body });
  });
  const url = new URL(process.env.LC_URL || 'https://10.42.0.37:3161/');
  if (process.argv.includes('--fallback')) url.searchParams.set('noprops', '');
  await page.goto(url.href);
  await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const D = await import('./src/3d/render3d.js'), L = __lastCall;
    L.noLock(); L.start('killer', { players: 32 }); L.step(.1); L.S.paused = true; L.place(1300, 600); L.look(Math.PI / 2); L.render();
    await D.warmup({ pub: L.view.pub, priv: L.view.priv, me: L.S.me, mode: 'fp' });
    const scene = L.scene().scene; let renderer;
    const before = scene.onBeforeRender;
    scene.onBeforeRender = function(r, ...a) { renderer = r; return before.call(this, r, ...a); }; L.render(); scene.onBeforeRender = before;
    let handScene; const render = renderer.render;
    renderer.render = function(s, camera, ...a) { if (s.isScene && camera.isPerspectiveCamera && camera !== L.scene().camera) handScene = s; return render.call(this, s, camera, ...a); }; L.render(); renderer.render = render;
    const gl = renderer.getContext(), link = gl.linkProgram, buffer = gl.bufferData, upload = gl.texSubImage2D, direct = renderer.renderBufferDirect;
    let links = 0, buffers = [], uploads = [], linkedMaterials = [], drawing, selections = 0, snackSelections = 0, selectionMaterials = [];
    const observed = new Map();
    renderer.renderBufferDirect = function(...a) {
      const prior = drawing, material = a[3]; drawing = { material, object: a[4] };
      if (!observed.has(material)) {
        const own = Object.hasOwn(material, 'customProgramCacheKey'), key = material.customProgramCacheKey;
        observed.set(material, { own, key }); material.customProgramCacheKey = function() {
          let snack = false; for (let o = drawing?.object; o; o = o.parent) if (o.name.startsWith('snack-tray-') || o.userData.assets !== undefined && o.userData.kind !== undefined) { snack = true; break; }
          selections++; if (snack) snackSelections++; selectionMaterials.push({ type: this.type, name: this.name, object: drawing?.object?.type, instanced: !!drawing?.object?.isInstancedMesh, snack });
          return key.call(this);
        };
      }
      try { return direct.apply(this, a); } finally { drawing = prior; }
    };
    gl.linkProgram = function(...a) {
      links++;
      const m = drawing?.material, o = drawing?.object;
      linkedMaterials.push({ material: m?.type, name: m?.name, color: m?.color?.getHexString(), object: o?.type, geometry: o?.geometry?.type,
        defines: gl.getAttachedShaders(a[0])?.map(s => gl.getShaderSource(s).split('\n').filter(l => l.startsWith('#define')).join('\n')) });
      return link.apply(this, a);
    };
    gl.bufferData = function(target, data, ...a) { buffers.push(typeof data === 'number' ? data : data?.byteLength || 0); return buffer.call(this, target, data, ...a); };
    gl.texSubImage2D = function(...a) { const im = a.at(-1); if (im?.width && im?.height) uploads.push([im.constructor.name, im.width, im.height]); return upload.apply(this, a); };
    const rows = [], memory = [], capture = (name, setup = () => {}) => {
      links = 0; buffers = []; uploads = []; linkedMaterials = []; selections = 0; snackSelections = 0; selectionMaterials = []; const at = performance.now(); setup(); L.render();
      const ms = performance.now() - at, visible = []; handScene.traverseVisible(o => visible.push([o, o.matrixWorld.elements.slice()]));
      const inverse = handScene.children.find(o => o.isCamera).matrixWorldInverse.elements.slice(); handScene.updateMatrixWorld(true);
      let matrixError = 0; for (const [o, matrix] of visible) for (let i = 0; i < 16; i++) matrixError = Math.max(matrixError, Math.abs(matrix[i] - o.matrixWorld.elements[i]));
      const camera = handScene.children.find(o => o.isCamera); for (let i = 0; i < 16; i++) matrixError = Math.max(matrixError, Math.abs(inverse[i] - camera.matrixWorldInverse.elements[i]));
      rows.push({ name, ms, matrixError, links, linkedMaterials: linkedMaterials.slice(), selections, snackSelections, selectionMaterials: selectionMaterials.slice(), buffers: buffers.length, bytes: buffers.reduce((a, b) => a + b, 0), uploads: uploads.slice() });
    };
    const drink = (glass, id = 100, holder = 0) => ({ id, glass, kind: 'beer', color: '#d0a050', sips: 4, owner: holder, holder, x: 1300, y: 600 });
    try {
      capture('ready gameplay');
      for (const action of ['poison', 'stab', 'shoot']) capture(action, () => D.playHand(action));
      for (let kind = 0; kind < 3; kind++) capture('snack ' + kind, () => { L.state.chars[0].snack = kind; L.state.chars[0].eatAt = L.state.t; });
      L.state.chars[0].eatAt = -99;
      const eater = L.state.chars[1], oldEater = { x: eater.x, y: eater.y, seat: eater.seat, face: eater.face, look: eater.look, eatAt: eater.eatAt, snack: eater.snack };
      Object.assign(eater, { x: 1300, y: 700, seat: null, face: -Math.PI / 2, look: -Math.PI / 2 });
      for (let cycle = 0; cycle < 2; cycle++) for (let kind = 0; kind < 3; kind++) {
        capture(`other snack ${cycle} ${kind}`, () => { eater.snack = kind; eater.eatAt = L.state.t; });
        capture(`other snack repeat ${cycle} ${kind}`);
        capture(`other snack repeat ${cycle} ${kind}`);
        capture('other snack discard', () => { eater.eatAt = -99; });
      }
      Object.assign(eater, oldEater);
      for (const glass of ['martini', 'cosmo', 'beer', 'whiskey', 'mojito']) capture('drink ' + glass, () => { const d = drink(glass); L.state.drinks = [d]; L.state.chars[0].drink = d; });
      L.state.drinks = []; L.state.chars[0].drink = null;
      // Poison markers are hidden on ordinary drinks. Place each poisoned style
      // on an actual rail in view so the first visible marker really uploads.
      const rail = L.state.seats.find(s => s.game === 'bj').drink;
      const oldPlace = { ...L.S.me };
      L.place(rail.x, rail.y + 100); L.look(-Math.PI / 2, -.15); L.render();
      for (let cycle = 0; cycle < 2; cycle++) for (const glass of ['martini', 'cosmo', 'beer', 'whiskey', 'mojito']) {
        capture(`poisoned placed ${cycle} ${glass}`, () => {
          const d = drink(glass, 200 + cycle, null); Object.assign(d, { owner: 0, x: rail.x, y: rail.y, poisoned: true, poisonBy: 0 }); L.state.drinks = [d];
        });
        capture('poisoned discard', () => { L.state.drinks = []; });
      }
      L.place(oldPlace.x, oldPlace.y); L.look(oldPlace.look, oldPlace.pitch); L.render();
      capture('free ghost', () => { L.state.chars[0].alive = false; L.state.chars[0].cameraFeed = null; });
      capture('ghost repeat');
      L.state.chars[0].alive = true;
      // Switching and discarding drinks must keep already-prepared shared
      // garnishes alive, including when another character holds the same style.
      for (let cycle = 0; cycle < 8; cycle++) {
        for (const glass of ['martini', 'cosmo', 'beer', 'whiskey', 'mojito']) {
          capture(`cycle ${cycle} ${glass}`, () => {
            const d = drink(glass), other = drink(glass, 101, 1);
            L.state.drinks = [d, other]; L.state.chars[0].drink = d; L.state.chars[1].drink = other;
          });
          capture(`cycle ${cycle} discard`, () => { L.state.drinks = []; L.state.chars[0].drink = null; L.state.chars[1].drink = null; });
        }
        memory.push({ ...renderer.info.memory, programs: renderer.info.programs.length });
      }
    } finally {
      gl.linkProgram = link; gl.bufferData = buffer; gl.texSubImage2D = upload; renderer.renderBufferDirect = direct;
      for (const [m, { own, key }] of observed) { if (own) m.customProgramCacheKey = key; else delete m.customProgramCacheKey; }
    }
    // Compare the cached hand materials with the original shared-material path
    // under identical hand-scene lighting, including transparent ghost gloves.
    const THREE = await import('three'), { Hands } = await import('./src/3d/hands.js'), { Items } = await import('./src/3d/items.js');
    const hands = [new Hands(), new Hands()]; hands[0].prepareItem = g => g;
    for (const h of hands) { h.scene.environment = scene.environment; h.scene.environmentIntensity = .3; h.setAspect(16 / 9, 72); h.setSuit('#9a3460'); }
    const target = renderer.getRenderTarget(), rt = new THREE.WebGLRenderTarget(640, 360), color = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha(), pixels = [];
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    try {
      renderer.setClearColor(0x000000, 0);
      for (const item of [...[0, 1, 2].map(snack => ({ name: 'snack ' + snack, snack, eating: 1.8 })), ...['martini', 'cosmo', 'beer', 'whiskey', 'mojito'].map(kind => ({ name: kind, drink: { kind, color: '#d0a050', sips: 3 } })), { name: 'ghost', ghost: true }]) {
        const frames = [];
        for (const h of hands) {
          h.update({ dt: 0, light: 1, ...item }); renderer.setRenderTarget(rt); renderer.render(h.scene, h.camera);
          const data = new Uint8Array(640 * 360 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 640, 360, data); frames.push(data);
        }
        let maxChannel = 0, coverage = 0;
        for (let i = 0; i < frames[0].length; i++) { maxChannel = Math.max(maxChannel, Math.abs(frames[0][i] - frames[1][i])); if (i % 4 === 3 && frames[1][i]) coverage++; }
        pixels.push({ name: item.name, maxChannel, coverage });
      }
    } finally { renderer.setRenderTarget(target); renderer.setClearColor(color, alpha); }
    // Compare the actual shared marker with an independent per-drink plane,
    // under world lighting/fog and at three points in its opacity animation.
    const fixture = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 16 / 9, .01, 20);
    fixture.environment = scene.environment; fixture.environmentIntensity = scene.environmentIntensity; fixture.fog = scene.fog;
    fixture.add(new THREE.HemisphereLight(0xfff0dc, 0x40202a, .7));
    const keyLight = new THREE.DirectionalLight(0xffe6c8, 1.5); keyLight.position.set(.6, 1, .5); fixture.add(keyLight);
    const items = new Items(fixture), markerPixels = [], snackPixels = [], shared = new Set(), originalPlane = new THREE.PlaneGeometry(.16, .16);
    const pub = { bowls: [], chars: [], drinks: [], bodies: [], fx: [], floats: [] }, priv = { me: 0, alive: true, spiked: [400] };
    camera.position.set(.35, .48, .85); camera.lookAt(0, .17, 0); camera.updateMatrixWorld(true);
    try {
      renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(rt);
      for (const kind of ['martini', 'cosmo', 'beer', 'whiskey', 'mojito']) for (const t of [0, .2, .7]) {
        pub.drinks = [{ id: 400, kind, color: '#d0a050', holder: null, owner: 0, sips: 3, x: 0, y: 0 }];
        items.update(pub, priv, new Map(), t, 0, { firstPerson: true, camera });
        const glow = items.drinks.get(400).userData.glow, geo = glow.geometry; shared.add(geo);
        for (const name of ['position', 'normal', 'uv']) assertArray(geo.attributes[name].array, originalPlane.attributes[name].array);
        assertArray(geo.index.array, originalPlane.index.array);
        const frames = [];
        for (const geometry of [originalPlane, geo]) {
          glow.geometry = geometry; renderer.render(fixture, camera);
          const data = new Uint8Array(640 * 360 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 640, 360, data); frames.push(data);
        }
        glow.geometry = geo;
        let maxChannel = 0, coverage = 0; for (let i = 0; i < frames[0].length; i++) { maxChannel = Math.max(maxChannel, Math.abs(frames[0][i] - frames[1][i])); if (i % 4 === 3 && frames[1][i]) coverage++; }
        markerPixels.push({ kind, t, maxChannel, coverage });
        pub.drinks = []; items.update(pub, priv, new Map(), t, 0, { firstPerson: true, camera });
      }
      const { makeSnack } = await import('./src/3d/snacks.js'), root = new THREE.Group(), hand = new THREE.Group(); root.add(hand); fixture.add(root);
      const beans = new Map([[1, { root, rightHand: hand }]]);
      camera.position.set(.3, .3, .55); camera.lookAt(0, .04, .02); camera.updateMatrixWorld(true);
      for (let kind = 0; kind < 3; kind++) for (const eating of [2.4, 1.5, .3]) {
        pub.chars = [{ id: 1, alive: true, eating, snack: kind }]; items.update(pub, priv, beans, .2, 0, { firstPerson: true, camera });
        const reference = new Map(); makeSnack(kind, .25).traverse(o => { if (o.isMesh) reference.set(o.geometry, o.material); });
        const food = items.snacks.get(1), saved = []; let sharedMaps = true, sharedGeometry = true, hooks = true;
        food.traverse(o => {
          if (!o.isMesh) return; const material = reference.get(o.geometry); sharedGeometry &&= !!material; saved.push([o, o.material, material]);
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap']) sharedMaps &&= o.material[key] === material[key];
          hooks &&= o.material.onBeforeCompile === material.onBeforeCompile && o.material.customProgramCacheKey === material.customProgramCacheKey;
        });
        const frames = [];
        for (const original of [true, false]) {
          for (const [o, material, ref] of saved) o.material = original ? ref : material;
          renderer.render(fixture, camera); const data = new Uint8Array(640 * 360 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 640, 360, data); frames.push(data);
        }
        let maxChannel = 0, coverage = 0; for (let i = 0; i < frames[0].length; i++) { maxChannel = Math.max(maxChannel, Math.abs(frames[0][i] - frames[1][i])); if (i % 4 === 3 && frames[1][i]) coverage++; }
        snackPixels.push({ kind, eating, maxChannel, coverage, sharedMaps, sharedGeometry, hooks });
      }
    } finally { renderer.setRenderTarget(target); renderer.setClearColor(color, alpha); originalPlane.dispose(); rt.dispose(); }
    function assertArray(a, b) { if (a.length !== b.length || a.some((value, i) => value !== b[i])) throw new Error('drink marker geometry differs from the original plane'); }
    return { rows, memory, pixels, markerPixels, snackPixels, sharedMarkerGeometries: shared.size };
  });
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), ...result, errors }, null, 2));
  assert.deepEqual(errors, []);
  for (const row of result.rows) { if(!process.argv.includes('--baseline')||!row.name.startsWith('poisoned ')&&!row.name.startsWith('other snack')) { assert.equal(row.links, 0, row.name + ': no deferred shader compilation'); assert.equal(row.buffers, 0, row.name + ': no repeated geometry uploads'); } assert.ok(row.matrixError < 1e-8, row.name + ': visible hand/item matrices and camera inverse match an independent full update'); }
  if (!process.argv.includes('--baseline') && !process.argv.includes('--shared-snacks')) for (const row of result.rows.filter(r => r.name.startsWith('other snack repeat'))) assert.equal(row.snackSelections, 0, row.name + ': repeated snacks do not alternate shader features with trays');
  for (const field of ['geometries', 'textures', 'programs']) assert.ok(Math.max(...result.memory.map(r => r[field])) - Math.min(...result.memory.map(r => r[field])) <= 1, field + ': stable repeated-use allocations');
  for (const view of result.pixels) { assert.equal(view.maxChannel, 0, view.name + ': cached hand materials retain pixel-identical shading'); assert.ok(view.coverage > 1000, view.name + ': exercise visible hands/items'); }
  if (!process.argv.includes('--baseline')) assert.equal(result.sharedMarkerGeometries, 1, 'all repeated drink markers retain one geometry');
  for (const view of result.markerPixels) { assert.equal(view.maxChannel, 0, 'world ' + view.kind + ': shared marker retains original pixels'); assert.ok(view.coverage > 1000, 'world ' + view.kind + ': exercise visible drink and marker'); }
  for (const view of result.snackPixels) { assert.equal(view.maxChannel, 0, 'world snack ' + view.kind + ': separate shader selection retains original pixels'); assert.ok(view.coverage > 80 && view.sharedMaps && view.sharedGeometry && view.hooks, 'world snack ' + view.kind + ': visible food retains geometry, maps and shader hooks'); }
  console.log('PASS: snacks/drinks/weapons/ghosts use prepared shaders/buffers; repeated world snacks retain shader selections; 40 drink/discard pairs and ten poisoned placements retain shared resources; nine hand, 15 marker and nine held-food views match exactly.', JSON.stringify(result.memory));
} finally { await browser.close(); }
