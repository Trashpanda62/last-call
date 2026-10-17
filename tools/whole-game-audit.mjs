// Gameplay CPU/layout/resource audit. Compare reports on the same GPU and browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const url = process.env.LC_URL || 'https://10.42.0.37:3161/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'], ignoreDefaultArgs: ['--disable-gpu'] });
function rank(profile) {
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), parents = new Map(), totals = new Map(), self = new Map();
  for (const n of nodes.values()) for (const id of n.children || []) parents.set(id, n.id);
  for (let i = 0; i < profile.samples.length; i++) {
    let id = profile.samples[i]; const us = profile.timeDeltas[i];
    self.set(id, (self.get(id) || 0) + us);
    while (id) { totals.set(id, (totals.get(id) || 0) + us); id = parents.get(id); }
  }
  const rows = map => [...map].map(([id, us]) => {
    const f = nodes.get(id).callFrame;
    return { ms: +(us / 1000).toFixed(1), fn: f.functionName, url: f.url.replace(url, ''), line: f.lineNumber + 1 };
  }).filter(r => !['(root)', '(idle)'].includes(r.fn)).sort((a, b) => b.ms - a.ms).slice(0, 24);
  return { self: rows(self), inclusive: rows(totals) };
}
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable'); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  const report = { at: new Date().toISOString(), url, viewport: [1280, 720], preset: 'high', seed: 42, scenarios: [] };
  const scenarios = [
    ['floor', 1300, 600, Math.PI / 2], ['bar', 350, 400, -Math.PI / 2],
    ['rest', 330, 1000, Math.PI], ['arcade', 2530, 430, -Math.PI / 2],
    ['race', 2520, 1000, -Math.PI / 2], ['slots', 1300, 1480, Math.PI / 2],
    ['vip', 2500, 1500, Math.PI / 2], ['floor-north', 1110, 303, Math.PI / 2],
    ['blackjack', 1110, 303, Math.PI / 2], ['skee', 2754, 396, -Math.PI / 2], ['plinko', 2115, 213, -Math.PI / 2], ['pusher',2338,405,0], ['claw',2335,540,0], ['meeting-phone', 1300, 600, Math.PI / 2],
    ['blackout', 1300, 600, Math.PI / 2], ['monster', 1300, 600, Math.PI / 2], ['backrooms', 1300, 600, Math.PI / 2],
    ['ghost-camera', 1300, 600, Math.PI / 2], ['crowd-running', 1300, 600, Math.PI / 2],
    ['escape-night', 1300, 600, Math.PI / 2], ['escape-exits', 1300, 600, Math.PI / 2],
  ];
  for (const [name, x, y, look] of scenarios.filter(([name]) => !process.env.LC_SCENARIOS || process.env.LC_SCENARIOS.split(',').includes(name))) {
    await page.evaluate(({ name, x, y, look }) => {
      let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const L = __lastCall; L.noLock(); L.start('killer', { players: 32, mode: name.startsWith('escape-') ? 'escape' : 'classic' }); L.step(.1); L.S.paused = true;
      L.place(x, y); L.look(look, -.05);
      if (name === 'blackjack') { const s = L.state.seats.find(s => s.game === 'bj'); if (s.occ) s.occ.seat = null; s.occ = s.claim = null; L.look(s.face, -.66); L.place(s.x, s.y); L.render(); if (L.view.priv.seat?.game !== 'bj') throw new Error('Blackjack setup failed'); }
      if(['pusher','claw'].includes(name)){const s=L.state.seats.find(s=>s.game===name);if(s.occ)s.occ.seat=null;s.occ=s.claim=null;L.look(s.face,-.15);L.place(s.x,s.y);L.render();L.press('spot:main');L.press('btn:start');L.step(.1);const r=L.state.arcade[name];if(!r)throw Error(name+' start failed');L.act('arcade',{kind:'drop',round:r.id,sequence:1});L.step(.5);}
      if (name === 'skee' || name === 'plinko') { const s=L.state.seats.find(s=>s.game===name); if(s.occ)s.occ.seat=null; s.occ=s.claim=null; L.look(s.face,-.15);L.place(s.x,s.y);L.render();if(L.view.priv.seat?.game!==name)throw Error(name+' setup failed');L.press('spot:main');if(name==='skee'){L.act('skee',{kind:'start',after:0,bet:100});L.step(.1);const r=L.state.skee[0];L.act('skee',{kind:'roll',round:r.id,sequence:1,aim:0,power:.41});L.step(.1);}}
      if (name === 'meeting-phone') { L.act('leave'); L.place(1268, 600); L.act('use'); L.render(); if (!L.state.meeting) throw new Error('Meeting setup failed'); }
      if (name === 'blackout' || name === 'monster') { L.state.chars[0].cd.lights = 0; L.act('lights'); L.step(.1); if (!L.state.blackout) throw new Error('Blackout setup failed'); if (name === 'monster') { L.act('transform'); L.step(.1); if (!L.view.priv.monster) throw new Error('Monster setup failed'); } }
      if (name === 'backrooms') L.state.backrooms = true;
      if (name.startsWith('escape-')) {
        L.state.chars[0].cd.lights = 0; L.act('lights'); L.step(.1);
        if (name === 'escape-exits') { for (const b of L.state.blackout.br) b.done = true; L.step(.1); }
        if (!L.view.pub.escape || !L.state.blackout || (name === 'escape-exits' && !L.state.exits)) throw new Error('Escape setup failed');
      }
      if (name === 'ghost-camera') { L.state.chars[0].alive = false; L.act('cameras'); }
      L.render();
      if (name === 'backrooms' && !L.scene().br.on) throw new Error('Backrooms setup failed');
      if (name === 'ghost-camera' && !L.view.priv.cameraFeed) throw new Error('Ghost camera setup failed');
      if (name === 'crowd-running') L.S.paused = false;
    }, { name, x, y, look });
    if (name === 'meeting-phone') await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.auditMutations = {}; window.auditObserver?.disconnect();
      window.auditObserver = new MutationObserver(records => {
        for (const r of records) { const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
          const key = (el?.id || el?.closest('[id]')?.id || el?.tagName) + ':' + r.type;
          auditMutations[key] = (auditMutations[key] || 0) + 1;
        }
      }); auditObserver.observe(document.body, { attributes: true, childList: true, characterData: true, subtree: true });
    });
    const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    await cdp.send('Profiler.start');
    const sample = await page.evaluate(async () => {
      const times = [], end = performance.now() + 2400, first = __lastCall.gfx().frames; let prev;
      await new Promise(ok => { function frame(now) { if (prev) times.push(now - prev); prev = now; if (now < end) requestAnimationFrame(frame); else ok(); } requestAnimationFrame(frame); });
      times.sort((a,b) => a-b);
      auditObserver.disconnect();
      const v = __lastCall.view;
      return { frames: __lastCall.gfx().frames - first, medianMs: times[Math.floor(times.length * .5)], p95Ms: times[Math.floor(times.length * .95)], gfx: __lastCall.gfx(), state: { mode: v.pub.mode, escape: v.pub.escape, blackout: !!v.pub.blackout, exits: !!v.pub.exits, backrooms: __lastCall.scene().br.on, cameraFeed: v.priv.cameraFeed || null }, mutations: Object.entries(auditMutations).sort((a,b) => b[1]-a[1]).slice(0,16) };
    });
    const { profile } = await cdp.send('Profiler.stop');
    const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const metrics = {}; for (const k of ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration']) metrics[k] = +(after[k] - before[k]).toFixed(5);
    report.scenarios.push({ name, ...sample, metrics, profile: rank(profile) });
    console.log(name, JSON.stringify({ ...sample.gfx, metrics, p95Ms: sample.p95Ms, top: rank(profile).self.slice(0, 4) }));
  }
  // Rendered GPU allocations should settle after repeated appearance changes/restarts.
  report.restartMemory = [];
  for (let i = 0; i < 6; i++) {
    await page.evaluate(i => { const L = __lastCall; L.start('gambler', { players: 32 }); L.step(.1); L.S.paused = true; L.place(1300, 600); L.look(Math.PI/2); for (const c of L.state.chars) c.color = i % 2 ? '#3a9070' : '#a04a60'; L.render(); }, i);
    await page.waitForTimeout(150); await cdp.send('HeapProfiler.collectGarbage');
    report.restartMemory.push(await page.evaluate(() => ({ ...__lastCall.gfx(), heap: performance.memory?.usedJSHeapSize })));
  }
  report.resources = await page.evaluate(() => {
    const grouped = new Map();
    for (const r of performance.getEntriesByType('resource')) { const key = r.name.replace(location.origin, ''); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push({ bytes: r.transferSize, at: r.startTime }); }
    return { requests: [...grouped.values()].reduce((s, rows) => s + rows.length, 0), repeated: [...grouped].filter(([k, rows]) => rows.length > 1 && /\/assets\//.test(k)), bytes: [...grouped.values()].flat().reduce((s, r) => s + r.bytes, 0) };
  });
  report.errors = errors; assert.deepEqual(errors, []);
  const out = process.argv[2] || 'shots/whole-game-audit.json'; fs.mkdirSync(out.split('/').slice(0,-1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('Report:', out, 'memory textures:', report.restartMemory.map(r => r.tex), 'repeated asset URLs:', report.resources.repeated.map(r => r[0]));
} finally { await browser.close(); }
