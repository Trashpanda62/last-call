// Screenshots from chosen standing points (map units), for checking set dressing: signs, mirrors, a table's look.
//   node tools/view-shots.mjs views.json [--url https://10.42.0.37:3161/] [--out shots/views] [--fallback]
// views.json: [{ "name": "duck-sign", "x": 2500, "y": 900, "yaw": -1.5708, "pitch": 0.1 }, { "name": "race", "sit": "race", "pitch": -0.2 }]
// Without --url it serves this checkout. Headless only; automation never takes pointer lock (navigator.webdriver and
// __lastCall.noLock()).
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ARG = arg('url', ''), OUT = arg('out', 'shots/views'), FALLBACK = process.argv.includes('--fallback');
const VIEWS = JSON.parse(fs.readFileSync(process.argv.find(a => a.endsWith('.json') && !a.startsWith('--')), 'utf8'));
const { chromium } = require(process.env.PW || 'playwright');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const root = path.resolve('.');
const server = URL_ARG ? null : http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(p).pipe(res);
});
const base = URL_ARG || await new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/`)));
const gpu = process.env.LC_GPU === 'vulkan' ? ['--use-angle=vulkan', '--enable-features=Vulkan'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: [...gpu, '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + (FALLBACK ? '?noprops' : ''));
  await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  await page.evaluate(() => { const L = window.__lastCall; L.noLock(); L.start('gambler', { players: 4, killers: 1 }); L.step(1); L.S.paused = false; });
  if (!FALLBACK) await page.waitForFunction(() => window.__lastCall.gfx().props >= 30, null, { timeout: 60000 }).catch(() => errors.push('props did not load'));
  for (const v of VIEWS) {
    await page.evaluate(v => {
      const L = window.__lastCall;
      if (L.view.priv.seat) { L.act('leave'); L.step(0.3); }
      if (v.sit) {
        const s = L.state.seats.filter(q => q.game === v.sit)[v.i || 0]; if (s.occ) s.occ.seat = null; s.occ = s.claim = null;
        L.look(s.face + (v.yaw || 0), v.pitch || 0); L.place(s.x, s.y);
      } else { L.place(v.x, v.y); L.look(v.yaw, v.pitch || 0); }
      L.render();
    }, v);
    await page.waitForTimeout(v.wait ?? 700);
    await page.screenshot({ path: path.join(OUT, (FALLBACK ? 'fb-' : '') + v.name + '.jpg'), type: 'jpeg', quality: 82 });
  }
} catch (e) { errors.push(String(e.stack || e)); }
await browser.close(); if (server) server.close();
console.log(errors.length ? 'FAIL\n' + errors.join('\n') : `PASS: ${VIEWS.length} views in ${OUT}`);
process.exit(errors.length ? 1 : 0);
