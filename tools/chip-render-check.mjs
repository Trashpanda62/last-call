// Compare real chip materials/geometry with the original separate-face path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const baseline = process.argv.includes('--baseline');
const out = process.argv.find(a => a.endsWith('.json')) || 'shots/chip-render.json';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/src/3d/machines.js', async route => {
    const response = await route.fetch(), source = await response.text(), needle = 'const rig = buildRig(RC, seats, felts);';
    assert.ok(source.includes(needle));
    await route.fulfill({ response, body: source.replace(needle, needle + ' window.__tableRig = rig;') });
  });
  await page.goto('https://10.42.0.37:3161/');
  await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const THREE = await import('three'), T = await import('./src/3d/textures.js'), { CHIP_COL } = await import('./src/3d/rig.js'), L = __lastCall;
    L.noLock(); L.start('killer', { players: 6 }); L.step(.1); L.S.paused = true; L.render();
    const world = L.scene().scene; let renderer, live;
    const before = world.onBeforeRender;
    world.onBeforeRender = function(r, ...a) { renderer = r; return before.call(this, r, ...a); }; L.render(); world.onBeforeRender = before;
    world.traverse(o => { if (o.name === 'player-bet-chips') live = o; });
    // Independent original painters/materials. Each face used a separate mask
    // and a UUID-based program key even though the shader source was identical.
    const masks = [];
    const oldMaterial = side => {
      const [c, g] = T.canvas(128, side ? 16 : 128);
      g.fillStyle = '#000'; g.fillRect(0, 0, 128, c.height); g.fillStyle = '#fff';
      if (side) for (let k = 0; k < 8; k++) g.fillRect(k * 16 + 4, 0, 7, 16);
      else {
        for (let k = 0; k < 8; k++) { g.save(); g.translate(64, 64); g.rotate(k * Math.PI / 4); g.fillRect(-8, -63, 16, 15); g.restore(); }
        g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 38, 0, 7); g.stroke();
      }
      const mask = T.tex(c, false); mask.colorSpace = THREE.NoColorSpace; masks.push(mask);
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .42 }); m.defines = { USE_UV: '' };
      m.onBeforeCompile = sh => {
        sh.uniforms.uStripe = { value: mask };
        sh.fragmentShader = 'uniform sampler2D uStripe;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.9, 0.85), texture2D(uStripe, vUv).r);');
      };
      m.customProgramCacheKey = () => 'chipStack' + mask.uuid; return m;
    };
    const oldGeo = new THREE.CylinderGeometry(.03, .03, .0095, 24), oldMats = [oldMaterial(true), oldMaterial(false), oldMaterial(false)];
    let geometryError = 0;
    for (const key of ['position', 'normal', 'uv']) {
      const a = oldGeo.attributes[key].array, b = live.geometry.attributes[key].array;
      if (a.length !== b.length) throw new Error(key + ' length');
      for (let i = 0; i < a.length; i++) geometryError = Math.max(geometryError, Math.abs(a[i] - b[i]));
    }
    if (oldGeo.index.array.some((v, i) => v !== live.geometry.index.array[i])) throw new Error('chip indices changed');
    const meshes = [new THREE.InstancedMesh(oldGeo, oldMats, 18), new THREE.InstancedMesh(live.geometry, live.material, 18)];
    for (const mesh of meshes) { mesh.castShadow = true; mesh.frustumCulled = false; }
    const stage = new THREE.Scene(); stage.environment = world.environment; stage.environmentIntensity = .6;
    stage.add(new THREE.AmbientLight(0xffffff, .8));
    const light = new THREE.DirectionalLight(0xffddbb, 3); light.position.set(1, 2, 1); stage.add(light);
    const camera = new THREE.PerspectiveCamera(35, 1, .001, 10), rt = new THREE.WebGLRenderTarget(512, 512);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const savedTarget = renderer.getRenderTarget(), savedColor = renderer.getClearColor(new THREE.Color()), savedAlpha = renderer.getClearAlpha();
    const pixels = [], matrix = new THREE.Matrix4(), color = new THREE.Color(), draws = [];
    try {
      renderer.setClearColor(0x09101b, 0);
      for (const scale of [1, 2.5]) for (const height of [1, 3]) {
        for (const mesh of meshes) {
          mesh.count = 6 * height;
          for (let k = 0; k < 6; k++) for (let j = 0; j < height; j++) {
            matrix.makeScale(scale, scale, scale); matrix.setPosition((k % 3 - 1) * .15 * scale, j * .0095 * scale, (Math.floor(k / 3) - .5) * .15 * scale);
            mesh.setMatrixAt(k * height + j, matrix); mesh.setColorAt(k * height + j, color.set(CHIP_COL[k]));
          }
          mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
        }
        for (const [name, x, y, z] of [['top', .25, .55, .35], ['bottom', .25, -.55, .35], ['edge', .45, .025, .55], ['reverse', -.4, .3, -.5]]) {
          camera.position.set(x * scale, y * scale, z * scale); camera.lookAt(0, .01 * scale, 0);
          const frames = [];
          for (const mesh of meshes) {
            stage.add(mesh); renderer.setRenderTarget(rt); renderer.info.reset(); renderer.render(stage, camera);
            draws.push(renderer.info.render.calls);
            const data = new Uint8Array(512 * 512 * 4); renderer.readRenderTargetPixels(rt, 0, 0, 512, 512, data); frames.push(data); stage.remove(mesh);
          }
          let maxChannel = 0, changed = 0, coverage = 0;
          for (let i = 0; i < frames[0].length; i++) { const d = Math.abs(frames[0][i] - frames[1][i]); maxChannel = Math.max(maxChannel, d); if (d) changed++; if (i % 4 === 3 && frames[0][i]) coverage++; }
          pixels.push({ name, scale, height, maxChannel, changed, coverage });
        }
      }
    } finally { renderer.setRenderTarget(savedTarget); renderer.setClearColor(savedColor, savedAlpha); rt.dispose(); }
    const actual = { groups: live.geometry.groups, materials: new Set(live.material).size, programKeys: new Set(live.material.map(m => m.customProgramCacheKey())).size };
    const table = [];
    for (const game of ['bj', 'roulette', 'dice', 'wheel']) {
      const seat = L.state.seats.find(s => s.game === game);
      const my = { seat: seat.id, game, hist: [], view: null, extra: {}, stacks: [{ spot: game === 'roulette' ? 'red' : game === 'dice' ? 'field' : 'main', amount: 1230, slot: 0, anim: '', u: 0, add: 0 }] };
      __tableRig.update(50, 0, my);
      const geo = live.geometry, mats = live.material, called = live.onBeforeRender, seen = [];
      try {
        live.onBeforeRender = (...a) => seen.push(a.at(-1)?.materialIndex);
        for (const legacy of [true, false]) {
          live.geometry = legacy ? oldGeo : geo; live.material = legacy ? oldMats : mats;
          L.scene().camera.position.copy(seat ? new THREE.Vector3(seat.x / 60, 1.5, seat.y / 60) : new THREE.Vector3());
          L.scene().camera.lookAt(live.matrixWorld.elements[12], .7, live.matrixWorld.elements[14]);
          seen.length = 0; renderer.render(world, L.scene().camera); table.push({ game, legacy, groupsDrawn: seen.length, count: live.count });
        }
      } finally { live.geometry = geo; live.material = mats; live.onBeforeRender = called; }
    }
    oldGeo.dispose(); for (const m of oldMats) m.dispose(); for (const t of masks) t.dispose();
    return { geometryError, actual, pixels, draws, table };
  });
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), result, errors }, null, 2));
  assert.deepEqual(errors, []); assert.equal(result.geometryError, 0);
  for (const row of result.pixels) { assert.equal(row.maxChannel, 0, JSON.stringify(row)); assert.ok(row.coverage > 500, 'chips are visible in comparison'); }
  assert.equal(result.actual.materials, baseline ? 3 : 2); assert.equal(result.actual.groups.length, baseline ? 3 : 2); assert.equal(result.actual.programKeys, baseline ? 3 : 1);
  for (let i = 0; i < result.draws.length; i += 2) { assert.equal(result.draws[i], 3); assert.equal(result.draws[i + 1], baseline ? 3 : 2); }
  for (const row of result.table) { assert.ok(row.count > 0); assert.equal(row.groupsDrawn, row.legacy || baseline ? 3 : 2, row.game); }
  console.log(JSON.stringify({ ...result, pixels: result.pixels.length + ' exact comparisons', draws: result.draws.slice(0, 2) }));
  console.log('PASS: original chip vertices/normals/UVs/indices and all six denomination colors; exact top/bottom/edge pixels and actual table material draws.');
} finally { await browser.close(); }
