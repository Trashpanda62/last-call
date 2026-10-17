// Plinko: film a real drop at a cabinet, standing at the seat, frame by frame (the ball has to be seen falling and
// landing in its channel), at each risk.
//   node tools/plinko-drop-film.mjs [--url https://10.42.0.37:3161/] [--out shots/plinko-film] [--fallback] [--cab 0]
// Without --url it serves this checkout. Headless only; automation never takes pointer lock (navigator.webdriver and
// __lastCall.noLock()).
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ARG = arg('url', ''), OUT = arg('out', 'shots/plinko-film'), FALLBACK = process.argv.includes('--fallback'), CAB = +arg('cab', '0');
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
const errors = [], rows = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + (FALLBACK ? '?noprops' : ''));
  await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  await page.evaluate(cab => {
    const L = window.__lastCall; L.noLock(); L.start('gambler', { players: 4, killers: 1 }); L.step(1); L.S.paused = false;
    const s = L.state.seats.filter(q => q.game === 'plinko')[cab]; if (s.occ) s.occ.seat = null; s.occ = s.claim = null;
    L.look(s.face, 0.12); L.place(s.x, s.y); L.render();
  }, CAB);
  if (!FALLBACK) await page.waitForFunction(() => window.__lastCall.gfx().props >= 30, null, { timeout: 60000 }).catch(() => errors.push('props did not load'));
  for (const risk of ['low', 'medium', 'high']) {
    const info = await page.evaluate(risk => {
      const L = window.__lastCall; L.press('spot:main'); L.press('btn:risk:' + risk); L.press('btn:drop');
      const v = L.table().view; return { seat: L.view.priv.seat && L.view.priv.seat.game, balls: v && v.balls ? v.balls.length : 0, path: v && v.balls && v.balls[0] ? v.balls[0].path.reduce((a, b) => a + b, 0) : null };
    }, risk);
    rows.push({ risk, ...info });
    const t0 = Date.now();
    for (const at of [0.25, 0.9, 1.5, 1.85, 2.05, 2.4, 3.2]) {
      const wait = at * 1000 - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
      await page.screenshot({ path: path.join(OUT, `${FALLBACK ? 'fb-' : ''}cab${CAB}-${risk}-${String(at).replace('.', '_')}.jpg`), type: 'jpeg', quality: 80 });
    }
    await page.waitForTimeout(800);
  }
} catch (e) { errors.push(String(e.stack || e)); }
fs.writeFileSync(path.join(OUT, 'film.json'), JSON.stringify({ rows, errors }, null, 1));
await browser.close(); if (server) server.close();
console.log(JSON.stringify(rows)); console.log(errors.length ? 'FAIL\n' + errors.join('\n') : 'PASS: filmed');
process.exit(errors.length ? 1 : 0);
