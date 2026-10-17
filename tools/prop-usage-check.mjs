// Track actual prop construction and retained unused model sources at startup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const out = process.argv.find(a => a.endsWith('.json')) || 'shots/prop-usage.json';
const baseline = process.argv.includes('--baseline');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [], requested = [];
  await page.addInitScript(() => performance.setResourceTimingBufferSize(2000));
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/\/assets\/props\/.*\.glb/.test(r.url())) requested.push(new URL(r.url()).pathname); });
  await page.route('**/src/3d/props.js', async route => {
    const response = await route.fetch(); let body = await response.text();
    const names = body.match(/export const PROP_NAMES = \[[\s\S]*?\];/)[0];
    if (baseline) {
      if (!names.includes("'snackBowl'")) body = body.replace("'snackDonut',", "'snackDonut', 'snackBowl',");
      if (!names.includes("'jukebox'")) body = body.replace("'poolTable',", "'poolTable', 'jukebox',");
    }
    const own = "export function propObject(name, o = {}) {", many = "export function placeProps(group, name, list, { cast = true } = {}) {";
    assert.ok(body.includes(own) && body.includes(many));
    body = body.replace(own, own + " __propUses.set(name, (__propUses.get(name) || 0) + 1);")
      .replace(many, many + " if (list.length) __propUses.set(name, (__propUses.get(name) || 0) + list.length);");
    body += `
const __propUses = new Map();
window.__propUsage = () => ({ names: PROP_NAMES, used: [...__propUses], unused: Object.entries(SRC).filter(([name]) => !__propUses.has(name)).map(([name, source]) => {
  const geometries = new Set(source.parts.map(p => p.geometry)), materials = new Set(source.parts.flatMap(p => [].concat(p.material))), textures = new Set(), images = new Set();
  for (const m of materials) for (const v of Object.values(m)) if (v?.isTexture) { textures.add(v); if (v.image) images.add(v.image); }
  return { name, geometries: geometries.size, materials: materials.size, textures: textures.size, images: [...images].map(im => [im.width, im.height]),
    geometryBytes: [...geometries].reduce((n, g) => n + Object.values(g.attributes).reduce((s, a) => s + a.array.byteLength, 0) + (g.index?.array.byteLength || 0), 0),
    decodedImageBytesEstimate: [...images].reduce((n, im) => n + im.width * im.height * 4, 0) };
}) });
`;
    await route.fulfill({ response, body });
  });
  // An obsolete optional prop must not enter the required-asset failure barrier.
  if (!baseline && !process.argv.includes('--probe')) for (const name of ['snackBowl', 'jukebox']) await page.route('**/assets/props/' + name + '.glb', route => route.abort());
  await page.goto(process.env.LC_URL || 'https://10.42.0.37:3161/');
  await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  const result = await page.evaluate(() => {
    const L = __lastCall; L.noLock(); L.start('killer', { players: 32 }); L.step(.1); L.S.paused = true; L.render();
    const usage = __propUsage(), resources = performance.getEntriesByType('resource');
    for (const unused of usage.unused) unused.encodedBytes = resources.find(r => r.name.endsWith('/assets/props/' + unused.name + '.glb'))?.encodedBodySize;
    return { ...usage, gfx: L.gfx() };
  });
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), baseline, ...result, requested, errors }, null, 2));
  assert.deepEqual(errors, []);
  if (!process.argv.includes('--probe')) {
    assert.deepEqual(result.unused.map(p => p.name).sort(), baseline ? ['jukebox', 'snackBowl'] : [], 'all prepared prop sources must have actual consumers');
    for (const name of ['snackBowl', 'jukebox']) assert.equal(requested.some(path => path.endsWith('/' + name + '.glb')), baseline, 'only the original baseline requests the obsolete ' + name + ' model');
  }
  console.log('PASS: actual prop consumers and unused source retention recorded.', JSON.stringify({ models: result.names.length, unused: result.unused, errors }));
} finally { await browser.close(); }
