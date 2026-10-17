// Count actual transfers for the eight particle pools and retain original bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const baseline = process.argv.includes('--baseline'), out = process.argv.find(a => a.endsWith('.json')) || 'shots/particle-uploads.json';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (baseline) for (const file of ['items', 'hazards']) await page.route('**/src/3d/' + file + '.js', async route => {
    const response = await route.fetch(); let source = await response.text();
    const start = source.indexOf('    for (const k in this.fx) {\n');
    if (start >= 0) {
      const end = source.indexOf('\n    }', start) + '\n    }'.length;
      const original = file === 'items'
        ? '    for (const k in this.fx) { const m = this.fx[k]; m.count = counts[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }'
        : '    for (const k in this.fx) { const m = this.fx[k]; m.count = counts[k]; m.instanceMatrix.needsUpdate = true; }';
      source = source.slice(0, start) + original + source.slice(end);
    }
    source = source.replaceAll(' m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);', '');
    source = source.replace('    this.fx.chips.setColorAt(0, this.fx.chips.material.color);', '').replace('    this.fx.chips.instanceColor.setUsage(THREE.DynamicDrawUsage);', '');
    await route.fulfill({ response, body: source });
  });
  await page.goto('https://10.42.0.37:3161/'); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  const result = await page.evaluate(async baseline => {
    const { Items } = await import('./src/3d/items.js'), { Hazards } = await import('./src/3d/hazards.js'), L = __lastCall;
    let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    L.noLock(); L.start('killer', { players: 32 }); L.step(.1); L.S.paused = true; L.state.fx = []; L.state.haunts = [];
    let items, hazards, renderer, rigged = [], overflows = [];
    const originalItem = Items.prototype.update, originalHazard = Hazards.prototype.update;
    const limit = pool => { for (const [kind, m] of Object.entries(pool)) if (m.count > m.instanceMatrix.count) { overflows.push({ kind, requested: m.count, capacity: m.instanceMatrix.count }); if (baseline) m.count = m.instanceMatrix.count; } };
    Items.prototype.update = function(...args) { items = this; const r = originalItem.apply(this, args); limit(this.fx); return r; };
    Hazards.prototype.update = function(pub, priv, ...args) { hazards = this; const r = originalHazard.call(this, pub, { ...priv, rigged }, ...args); limit(this.fx); return r; };
    const scene = L.scene().scene, before = scene.onBeforeRender;
    scene.onBeforeRender = function(r, ...a) { renderer = r; return before.call(this, r, ...a); }; L.render(); scene.onBeforeRender = before;
    const pools = [...Object.entries(items.fx).map(([k, m]) => ['items/' + k, m]), ...Object.entries(hazards.fx).map(([k, m]) => ['hazards/' + k, m])];
    const gl = renderer.getContext(), sub = gl.bufferSubData, link = gl.linkProgram, allocate = gl.bufferData, sources = new Map(), callbacks = [], snapshots = [], bench = [], firstUse = [];
    const gpu = { checks: 0, maxError: 0 }, matrices = new Float32Array(160 * 16), colors = new Float32Array(160 * 3);
    let writes = [], checking = true, links = [], allocations = [];
    const refreshSources = () => { for (const [name, m] of pools) for (const key of ['instanceMatrix', 'instanceColor']) if (m[key]) sources.set(m[key].array, { name, key }); };
    refreshSources();
    gl.linkProgram = function(program) { links.push(gl.getAttachedShaders(program).map(shader => gl.getShaderSource(shader).match(/^#define (?:SHADER_TYPE|SHADER_NAME|USE_INSTANCING(?:_COLOR)?)\b.*$/gm))); return link.call(this, program); };
    gl.bufferData = function(target, data, ...a) { allocations.push(typeof data === 'number' ? data : data.byteLength); return allocate.call(this, target, data, ...a); };
    gl.bufferSubData = function(...a) { const source = a[2], match = sources.get(source); if (match) writes.push({ ...match, bytes: (a.length > 4 ? a[4] : source.length - (a[3] || 0)) * source.BYTES_PER_ELEMENT }); return sub.apply(this, a); };
    for (const [name, m] of pools) {
      const after = m.onAfterRender; callbacks.push(() => { m.onAfterRender = after; });
      m.onAfterRender = function(...a) {
        if (checking && m.count) {
          const program = gl.getParameter(gl.CURRENT_PROGRAM), saved = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
          try { for (const [key, attr, data] of [['instanceMatrix', 'instanceMatrix', matrices], ['instanceColor', 'instanceColor', colors]]) {
            const attribute = m[key]; if (!attribute) continue;
            const loc = gl.getAttribLocation(program, attr);
            if (loc < 0 && key === 'instanceColor' && a[4].isMeshNormalMaterial) continue;
            if (loc < 0) throw new Error(name + ': attribute ' + attr);
            const buffer = gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING), prefix = data.subarray(0, m.count * attribute.itemSize);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.getBufferSubData(gl.ARRAY_BUFFER, 0, prefix);
            for (let i = 0; i < prefix.length; i++) gpu.maxError = Math.max(gpu.maxError, Math.abs(prefix[i] - attribute.array[i]));
          } } finally { gl.bindBuffer(gl.ARRAY_BUFFER, saved); } gpu.checks++;
        }
        return after.apply(this, a);
      };
    }
    const state = (kind, count = 1, age = .6) => Array.from({ length: count }, (_, i) => ({ kind, x: 1260 + i % 4 * 10, y: 700 + i % 3 * 15, t: age }));
    const draw = () => { refreshSources(); L.render(); if (gl.getError() !== gl.NO_ERROR) throw new Error('particle GL error'); };
    const snapshot = name => { for (const [pool, m] of pools) {
      // Missing instance colors mean white in the original renderer. Normalize
      // that implicit default when comparing a newly prepared color buffer.
      const color = m.instanceColor?.array || (pool === 'items/chips' ? new Float32Array(m.instanceMatrix.count * 3).fill(1) : null);
      snapshots.push({ name: name + '/' + pool, count: m.count, matrix: m.instanceMatrix.array.slice().buffer, color: color?.slice().buffer || null });
    } };
    try {
      for (const [name, setup] of [
        ['empty', () => { L.state.fx = []; L.state.haunts = []; rigged = []; }],
        ...['chips', 'bubbles', 'splat', 'crumbs', 'sparks', 'splash', 'smash'].flatMap(kind => [.1, .6, 1.1].map(age => [kind + '-' + age, () => { L.state.fx = state(kind, 1, age); } ])),
        ['haunt', () => { L.state.fx = []; L.state.haunts = [{ on: 1, t: 5 }]; }],
        ['rigged', () => { L.state.haunts = []; rigged = [L.state.seats[0].id, L.state.seats[1].id]; }],
        ['combined', () => { rigged = []; L.state.fx = ['chips', 'bubbles', 'splat', 'crumbs', 'sparks', 'splash', 'smash'].flatMap(k => state(k, 2)); L.state.haunts = [{ on: 1, t: 5 }, { on: 2, t: 5 }]; }],
        ['overflow', () => { L.state.fx = ['chips', 'bubbles', 'splat', 'crumbs', 'sparks', 'splash', 'smash'].flatMap(k => state(k, 32)); L.state.haunts = Array.from({ length: 31 }, (_, i) => ({ on: i + 1, t: 5 })); }],
        ['shrink', () => { L.state.fx = state('chips'); L.state.haunts = []; }],
        ['empty-return', () => { L.state.fx = []; }],
        ['expand-return', () => { L.state.fx = state('chips', 4); }],
      ]) { setup(); links = []; allocations = []; draw(); snapshot(name); firstUse.push({ name, links, allocations }); }
      // Pending uploads must retain previously changed prefixes across shrink
      // and expansion when several simulation states arrive before one draw.
      const pub = L.view.pub, priv = L.view.priv, beans = new Map();
      for (const n of [12, 1, 6]) originalItem.call(items, { ...pub, drinks: [], bodies: [], floats: [], fx: state('chips', n), chars: [] }, priv, beans, 55, 0, { firstPerson: true, camera: L.scene().camera });
      draw(); snapshot('pending-return');
      checking = false;
      for (const active of [false, true, false]) {
        L.state.fx = active ? state('chips') : []; L.state.haunts = []; rigged = []; draw(); writes = [];
        for (let i = 0; i < 30; i++) { if (active) L.state.fx[0].t = 1 - i / 60; draw(); }
        bench.push({ name: active ? 'single-chips' : bench.length ? 'empty-return' : 'empty', frames: 30, writes: writes.length, bytes: writes.reduce((n, w) => n + w.bytes, 0), pools: [...new Set(writes.map(w => w.name))] });
      }
    } finally { Items.prototype.update = originalItem; Hazards.prototype.update = originalHazard; gl.bufferSubData = sub; gl.linkProgram = link; gl.bufferData = allocate; callbacks.forEach(f => f()); }
    const hash = async b => b && [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
    const cases = [];
    for (const row of snapshots) cases.push({ ...row, matrix: await hash(row.matrix), color: await hash(row.color) });
    return { cases, bench, gpu, overflows, firstUse };
  }, baseline);
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), result, errors }, null, 2));
  assert.deepEqual(errors, []); assert.ok(result.gpu.checks > 50); assert.equal(result.gpu.maxError, 0);
  if (!baseline) {
    const original = JSON.parse(fs.readFileSync('docs/performance/2026-10-16-particle-uploads-before.json'));
    assert.deepEqual(result.cases, original.result.cases, 'original particle matrices/colors/live counts'); assert.deepEqual(result.overflows, [], 'draw counts stay within allocated instance capacity');
    for (const row of result.bench) if (row.name.startsWith('empty')) assert.equal(row.bytes, 0, row.name); else assert.ok(row.bytes < 30000, 'single burst only uploads live prefixes');
    for (const row of result.firstUse) { assert.equal(row.links.length, 0, row.name + ': shaders prepared'); assert.deepEqual(row.allocations, [], row.name + ': geometry/instance buffers prepared'); }
  }
  console.log(JSON.stringify({ cases: result.cases.length, bench: result.bench, gpu: result.gpu, overflows: result.overflows, firstUse: result.firstUse.filter(r => r.links.length || r.allocations.length) }));
  console.log('PASS: real particle pool buffers, GPU prefixes, empty/active/return states and capacity stress' + (baseline ? ' (original bytes recorded; unsafe draw counts clamped by test only).' : '; exact original bytes with bounded transfers and valid draw counts.'));
} finally { await browser.close(); }
