// Plinko face pilot: the same standing views of both cabinets before/after, normal and fallback graphics, 1280×720
// and 740×420, all three risks with real drops, plus the projected size of the payout digits and the landed readout.
//   node tools/plinko-face-shots.mjs [--url https://10.42.0.37:3161/] [--out shots/plinko] [--tag before]
// Without --url it serves this checkout. Headless only; automation never takes pointer lock (navigator.webdriver and
// __lastCall.noLock()).
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ARG = arg('url', ''), OUT = arg('out', 'shots/plinko'), TAG = arg('tag', 'view');
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
const browser = await chromium.launch({ headless: true, args: [...gpu, '--ignore-gpu-blocklist', '--enable-gpu-rasterization'], ignoreDefaultArgs: ['--disable-gpu'] });
const report = { at: new Date().toISOString(), tag: TAG, url: base, views: [], errors: [] };

async function run({ fallback, w, h, risks, machines, forced = false }) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true });
  page.on('pageerror', e => report.errors.push(`${fallback ? 'fallback' : 'normal'} ${w}x${h}: ${e.message}`));
  await page.goto(base + (fallback ? '?noprops' : ''));
  await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  await page.evaluate(() => { const L = window.__lastCall; L.noLock(); L.start('killer', { players: 6, killers: 1 }); L.step(1); });
  if (!fallback) await page.waitForFunction(() => window.__lastCall.gfx().props >= 30, null, { timeout: 60000 }).catch(() => report.errors.push('props did not load'));
  await page.waitForTimeout(800);
  for (const machine of machines) for (const risk of risks) {
    const info = await page.evaluate(async ({ machine, risk }) => {
      const L = window.__lastCall;
      if (L.view.priv.seat) { L.act('leave'); L.step(0.5); }
      const s = L.state.seats.find(q => q.game === 'plinko' && q.machine === machine);
      if (s.occ) s.occ.seat = null; s.occ = s.claim = null;
      L.look(s.face, -0.15); L.place(s.x, s.y); L.render();
      if (L.view.priv.seat?.game !== 'plinko') return { error: 'could not take plinko ' + machine };
      L.press('spot:main'); L.render();
      const r = L.press('btn:risk:' + risk); L.render();
      const drops = [L.press('btn:drop')]; L.step(0.35); L.render(); drops.push(L.press('btn:drop')); L.render();
      return { seat: s.id, risk: r, drops };
    }, { machine, risk });
    if (info.error) { report.errors.push(info.error); continue; }
    // mid-flight view, then the landed view (balls take 16 × 0.12 s)
    await page.waitForTimeout(700);
    const name = `${TAG}-${fallback ? 'fallback' : 'normal'}-${w}x${h}-m${machine}-${risk}`;
    await page.screenshot({ path: path.join(OUT, name + '-flight.jpg'), type: 'jpeg', quality: 88 });
    await page.waitForTimeout(1900);
    await page.screenshot({ path: path.join(OUT, name + '-landed.jpg'), type: 'jpeg', quality: 88 });
    const metrics = await page.evaluate(({ machine }) => {
      const L = window.__lastCall, sc = L.scene(), cam = sc.camera, scene = sc.scene, W = innerWidth, H = innerHeight;
      cam.updateMatrixWorld(); const out = {};
      const project = (o, x, y) => { const v = o.localToWorld(new o.position.constructor(x, y, 0)).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
      // The payout strip: named in the pilot, otherwise the old 1024×96 strip nearest the seat.
      const strips = []; scene.traverse(o => { if (o.isMesh && (o.name === 'plinko-payouts-' + machine || (!o.name && o.material?.map?.image?.width === 1024 && o.material.map.image.height === 96))) strips.push(o); });
      const seat = L.state.seats.find(q => q.game === 'plinko' && q.machine === machine), M = 1 / 60;
      strips.sort((a, b) => Math.hypot(a.position.x - seat.x * M, a.position.z - seat.y * M) - Math.hypot(b.position.x - seat.x * M, b.position.z - seat.y * M));
      const strip = strips[0];
      if (strip) {
        const g = strip.geometry.parameters, a = project(strip, -g.width / 2, 0), b = project(strip, g.width / 2, 0), t = project(strip, 0, g.height / 2), u = project(strip, 0, -g.height / 2);
        out.stripPx = { width: +Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(1), height: +Math.hypot(t[0] - u[0], t[1] - u[1]).toFixed(1) };
        out.cellPx = +(out.stripPx.width / 17).toFixed(1);
        // canvas digit cap height as a share of strip height (old strip: 27 px of 96; pilot reports its own)
        out.digitPx = +(out.stripPx.height * (strip.material.map?.userData?.digitShare || 27 * 0.72 / 96)).toFixed(1);
      }
      const readout = scene.getObjectByName('plinko-readout-' + machine);
      if (readout) { const g = readout.geometry.parameters, t = project(readout, 0, g.height / 2), u = project(readout, 0, -g.height / 2); out.readoutDigitPx = +(Math.hypot(t[0] - u[0], t[1] - u[1]) * (readout.userData.digitShare || 0)).toFixed(1); }
      const b = L.bar(); out.status = b && b.status; out.bank = L.view.priv.bank ?? null; out.calls = L.gfx().calls ?? null;
      return out;
    }, { machine });
    // Rays from the eye through 5 × 5 points of the payout strip and the readout: the first opaque hit must be that surface.
    const rays = await page.evaluate(async ({ machine }) => {
      const THREE = await import('three'), L = window.__lastCall, { scene, camera } = L.scene(), out = {};
      const opaque = []; scene.traverse(o => { if (o.isMesh && o.visible && !(o.material.transparent && o.material.opacity < 0.5)) opaque.push(o); });
      const ray = new THREE.Raycaster();
      for (const name of ['plinko-payouts-' + machine, 'plinko-readout-' + machine]) {
        const target = scene.getObjectByName(name); if (!target) continue;
        const g = target.geometry.parameters; let clear = 0, total = 0, blockers = new Set();
        for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
          const p = target.localToWorld(new THREE.Vector3((a / 4 - 0.5) * g.width * 0.94, (b / 4 - 0.5) * g.height * 0.9, 0));
          ray.set(camera.position, p.clone().sub(camera.position).normalize()); ray.far = camera.position.distanceTo(p) + 0.01;
          const hit = ray.intersectObjects(opaque, false).find(x => x.distance < ray.far); total++;
          if (hit && hit.object === target) clear++; else if (hit) blockers.add(hit.object.name || hit.object.userData.propName || hit.object.type);
        }
        out[name.replace(/-\d$/, '')] = { clear, total, blockers: [...blockers] };
      }
      return out;
    }, { machine });
    report.views.push({ name, fallback, size: `${w}x${h}`, machine, risk, ...info, ...metrics, rays });
    console.log(name, JSON.stringify(metrics), JSON.stringify(rays));
    for (const [k, v] of Object.entries(rays)) if (v.clear !== v.total) report.errors.push(`${name}: ${k} rays blocked ${v.total - v.clear}/${v.total} by ${v.blockers}`);
  }
  if (forced) {
    // Real Drop presses with the random path forced to an edge and to the centre; the readout and the channel frame
    // must name the bucket the ball actually landed in (a protected round may re-route it, so compare with the path).
    for (const [label, seq] of [['edge', [0.1]], ['centre', [0.1, 0.9]]]) {
      const r = await page.evaluate(async ({ seq }) => {
        const L = window.__lastCall, T = await import('./src/3d/textures.js'), Gm = await import('./src/games.js');
        const s = L.state.seats.find(q => q.game === 'plinko' && q.machine === 0);
        if (L.view.priv.seat?.id !== s.id) { if (L.view.priv.seat) { L.act('leave'); L.step(0.5); } if (s.occ) s.occ.seat = null; s.occ = s.claim = null; L.look(s.face, -0.15); L.place(s.x, s.y); L.render(); }
        L.press('spot:main'); L.press('btn:risk:high'); L.render();
        const random = Math.random; let i = 0; Math.random = () => seq[i++ % seq.length];
        try { L.press('btn:drop'); } finally { Math.random = random; }
        const ball = L.table().view.balls.at(-1); return { path: ball && ball.path.join('') };
      }, { seq });
      await page.waitForTimeout(2300);
      const check = await page.evaluate(async ({ path }) => {
        const L = window.__lastCall, T = await import('./src/3d/textures.js'), Gm = await import('./src/games.js'), { scene } = L.scene();
        const j = [...path].reduce((a, c) => a + +c, 0), readout = scene.getObjectByName('plinko-readout-0'), mark = scene.getObjectByName('plinko-mark-0'), strip = scene.getObjectByName('plinko-payouts-0');
        const uv = readout.geometry.attributes.uv.array, { cols, rows, keys } = T.PLINKO_READOUT, cell = Math.round(uv[0] * cols) + Math.round((1 - uv[1]) * rows) * cols;
        const local = strip.worldToLocal(mark.getWorldPosition(mark.position.clone())), sp = strip.geometry.parameters.width / 17;
        return { bucket: j, mult: Gm.PLINKO.high[j], readout: keys[cell], markVisible: mark.visible, markBucket: Math.round(local.x / sp + 8) };
      }, r);
      await page.screenshot({ path: path.join(OUT, `${TAG}-forced-${label}.jpg`), type: 'jpeg', quality: 88 });
      report.forced = report.forced || []; report.forced.push({ label, ...r, ...check });
      console.log('forced', label, JSON.stringify(check));
      if (check.readout !== check.mult || !check.markVisible || check.markBucket !== check.bucket) report.errors.push(`forced ${label}: readout/frame ${JSON.stringify(check)}`);
    }
  }
  await page.close();
}

try {
  await run({ fallback: false, w: 1280, h: 720, risks: ['low', 'medium', 'high'], machines: [0, 1], forced: true });
  await run({ fallback: true, w: 1280, h: 720, risks: ['high'], machines: [0, 1] });
  await run({ fallback: false, w: 740, h: 420, risks: ['medium'], machines: [0, 1] });
} catch (e) { report.errors.push(String(e.stack || e)); }
fs.writeFileSync(path.join(OUT, TAG + '.json'), JSON.stringify(report, null, 1));
console.log(report.errors.length ? 'ERRORS\n' + report.errors.join('\n') : `PASS: ${report.views.length} Plinko views`);
await browser.close(); if (server) server.close();
process.exit(report.errors.length ? 1 : 0);
