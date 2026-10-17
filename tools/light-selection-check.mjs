// Pooled lights must match a fresh stable distance sort after every mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const baseline = process.argv.includes('--baseline'), out = process.argv.find(a => a.endsWith('.json')) || 'shots/light-selection.json';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/src/3d/render3d.js', async route => {
    const response = await route.fetch(); let source = await response.text();
    const needle = 'function placeLights(cam, lit) {'; assert.ok(source.includes(needle)); source = source.replace(needle, 'function placeLightsImpl(cam, lit) {');
    source += `
let lightCheckActive = false;
window.__lightSelection = { distances: 0, sorts: 0, calls: 0, maxError: 0, ms: 0 };
const lightDistance = THREE.Vector3.prototype.distanceToSquared, lightSort = Array.prototype.sort;
THREE.Vector3.prototype.distanceToSquared = function(...a) { if (lightCheckActive) __lightSelection.distances++; return lightDistance.apply(this, a); };
Array.prototype.sort = function(...a) { if (lightCheckActive) __lightSelection.sorts++; return lightSort.apply(this, a); };
function placeLights(cam, lit) {
 const spots = R.world.lightSpots, ranked = spots.map((s, i) => { const x=s.p.x-cam.x, y=s.p.y-cam.y, z=s.p.z-cam.z; return [x*x+y*y+z*z, i]; }).sort((a,b)=>a[0]-b[0]);
 const n=R.lightN, edge=ranked.length>n?Math.sqrt(ranked[n][0]):1e9;
 const expected=Array.from({length:n},(_,k)=>{const e=ranked[k];if(!e)return {intensity:0};const s=spots[e[1]],d=Math.sqrt(e[0]);return {position:s.p.toArray(),color:new THREE.Color(s.color).toArray(),distance:s.range,intensity:s.power*Math.min(1,Math.max(0,(edge-d)/4))*lit};});
 const began=performance.now();lightCheckActive=true;
 try { placeLightsImpl(cam,lit); } finally { lightCheckActive=false; __lightSelection.ms+=performance.now()-began; }
 for(let k=0;k<n;k++){const a=R.pool[k],e=expected[k];__lightSelection.maxError=Math.max(__lightSelection.maxError,Math.abs(a.intensity-e.intensity));if(!e.position)continue;
  for(let i=0;i<3;i++)__lightSelection.maxError=Math.max(__lightSelection.maxError,Math.abs(a.position.toArray()[i]-e.position[i]),Math.abs(a.color.toArray()[i]-e.color[i]));
  __lightSelection.maxError=Math.max(__lightSelection.maxError,Math.abs(a.distance-e.distance));
 }
 __lightSelection.calls++;window.__lightR=R;
}
`;
    await route.fulfill({ response, body: source });
  });
  await page.goto('https://10.42.0.37:3161/'); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const THREE = await import('three'), L = __lastCall;
    L.noLock(); L.start('killer', { players: 32 }); L.step(.1); L.S.paused = true; L.place(1300, 600); L.look(Math.PI / 2); L.render();
    const clock = performance.now, frozen = clock.call(performance); performance.now = () => frozen;
    const R = __lightR, original = R.world.lightSpots, saved = original.map(s => ({ s, p: s.p.clone(), color: s.color, power: s.power, range: s.range })), rows = [];
    const reset = () => { __lightSelection = { distances: 0, sorts: 0, calls: 0, maxError: 0, ms: 0 }; };
    const capture = (name, run) => { reset(); run(); rows.push({ name, ...__lightSelection }); };
    const frames = n => { for (let i = 0; i < n; i++) L.render(); };
    try {
      capture('stationary', () => frames(30));
      capture('moving', () => { for (let i = 0; i < 20; i++) { L.place(1300 + i * 3, 600 + i * 2); L.render(); } });
      capture('power color range', () => { for (let i = 0; i < 10; i++) { for (const s of original) { s.power = i * .4; s.color = i % 2 ? 0xff0000 : 0x00ff00; s.range = i + 2; } L.render(); } });
      capture('moving source', () => { for (let i = 0; i < 10; i++) { original[0].p.x += .05; L.render(); } });
      const extra = { p: new THREE.Vector3(21, 1, 10), color: 0x80ff40, power: 6, range: 8 };
      capture('add move remove', () => { original.push(extra); L.render(); extra.p.z += 2; L.render(); original.pop(); L.render(); });
      capture('equal distance order', () => { for (const s of original) s.p.set(21, 2, 10); L.render(); original.reverse(); L.render(); original.reverse(); L.render(); });
      capture('replace list and change light count', () => { R.world.lightSpots = original.slice(); L.render(); const n = R.lightN; R.lightN = 2; L.render(); R.lightN = n; L.render(); R.world.lightSpots = original; L.render(); });
      for (const e of saved) { e.s.p.copy(e.p); e.s.color = e.color; e.s.power = e.power; e.s.range = e.range; }
      L.render(); capture('restored stationary', () => frames(30));
      capture('Backrooms and return', () => { L.state.backrooms = true; frames(3); L.state.backrooms = false; frames(3); });
      capture('empty and restored list', () => { R.world.lightSpots = []; frames(2); R.world.lightSpots = original; L.render(); });
    } finally { R.world.lightSpots = original; for (const e of saved) { e.s.p.copy(e.p); e.s.color = e.color; e.s.power = e.power; e.s.range = e.range; } performance.now = clock; }
    return { sources: original.length, rows };
  });
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), ...result, errors }, null, 2));
  assert.deepEqual(errors, []); assert.ok(result.sources > 30);
  for (const r of result.rows) { assert.ok(r.calls > 0); assert.equal(r.maxError, 0, r.name + ': fresh stable-sort light reference'); }
  if (!baseline) for (const r of result.rows.filter(r => ['stationary', 'power color range', 'restored stationary', 'Backrooms and return'].includes(r.name))) { assert.equal(r.distances, 0, r.name); assert.equal(r.sorts, 0, r.name); }
  console.log('PASS: pooled lights match fresh stable distance sorting across camera/source motion, property changes, ties, reordering, replacement, counts and Backrooms.', JSON.stringify(result));
} finally { await browser.close(); }
