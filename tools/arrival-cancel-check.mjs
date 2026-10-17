// A real host departure during guest preparation must retire the old arrival.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const baseline = process.argv.includes('--baseline'), out = process.argv.find(a => a.endsWith('.json')) || 'shots/arrival-cancel.json';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'], ignoreDefaultArgs: ['--disable-gpu'] });
const report = { at: new Date().toISOString(), baseline, cases: [] }, errors = [];
try {
  const pages = [];
  for (const name of ['CancelHost', 'CancelGuest']) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 960, height: 640 } }), page = await context.newPage(); pages.push(page);
    page.on('pageerror', e => errors.push({ name, message: e.message }));
    await page.addInitScript(() => {
      localStorage.setItem('lc.settings', JSON.stringify({ v: 2, gfx: { preset: 'low' }, voice: { mode: 'off' } }));
      window.arrivalRuns = []; window.arrivalDraws = []; window.arrivalMonsters = [];
    });
    await page.route('**/src/3d/render3d.js', async route => {
      const response = await route.fetch(); let body = await response.text();
      const signature = body.match(/export async function warmup\(frame, progress = \(\) => \{\}(?:, current = \(\) => true)?\) \{/)[0];
      const gate = "progress(.14, 'Preparing scene bounds'); await " + (body.includes("progress(.14, 'Preparing scene bounds'); await paint();") ? 'paint' : 'nextPaint') + '();';
      const draw = 'export function draw(frame, { prepareOnly = false } = {}) {';
      const monster = (body.includes('const monster = makeMonster();') ? 'const ' : '') + 'monster = makeMonster(); if (monster) R.scene.add(monster.obj);';
      for (const needle of [signature, gate, draw, monster]) assert.ok(body.includes(needle), needle);
      body = body.replace(signature, signature.replace('export async function warmup', 'async function arrivalWarmup'))
        .replace(gate, `progress(.14, 'Preparing scene bounds');
          if (window.holdArrival) { window.holdArrival = false; window.arrivalHeld = true; await new Promise(ok => window.releaseArrival = ok); }
          await ${gate.includes('await paint()') ? 'paint' : 'nextPaint'}();`)
        .replace(draw, draw + " if (window.__lastCall) arrivalDraws.push({ screen: __lastCall.S.screen, players: frame.pub?.chars.length, prepareOnly });")
        .replace(monster, monster + ` if (monster) { const record = { disposed: false }; arrivalMonsters.push(record); const dispose = monster.dispose; monster.dispose = function() { record.disposed = true; return dispose.call(this); }; }`);
      body += `
window.arrivalRendererState = () => ({ target: R.renderer.getRenderTarget()?.uuid || null, sort: R.renderer.sortObjects,
  ghost: [R.hands.gloveMat.transparent, R.hands.sleeveMat.transparent, R.hands.cuffMat.transparent], backrooms: R.br.on,
  depth: [...(R.depthWarmupMaterials || [])].map(m => m.id).sort((a,b) => a-b),
  materials: (() => { const a=[]; for (const s of [R.scene,R.hands.scene]) s.traverse(o => { if (o.material) a.push([o.id,[].concat(o.material).map(m => m.id)]); }); return a.sort((a,b) => a[0]-b[0]); })() });
export async function warmup(frame, progress = () => {}, ...options) {
  const run = { players: frame.pub?.chars.length, stages: [], ended: false }; arrivalRuns.push(run);
  try { return await arrivalWarmup(frame, (n, text) => { run.stages.push({ n, text, screen: window.__lastCall?.S.screen }); progress(n, text); }, ...options); }
  finally { run.ended = true; }
}
`;
      await route.fulfill({ response, body });
    });
    await page.goto(process.env.LC_URL || 'https://10.42.0.37:3161/');
    await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
    await page.evaluate(name => { __lastCall.noLock(); document.querySelector('#nameIn').value = name; }, name);
  }
  const [host, guest] = pages;
  for (const replacement of [false, true]) {
    await host.locator('#hostBtn').click(); await host.waitForFunction(() => __lastCall.S.code?.length === 4, null, { timeout: 45000 });
    const code = await host.evaluate(() => __lastCall.S.code);
    await guest.locator('#joinToggle').click(); await guest.locator('#codeIn').fill(code); await guest.locator('#joinBtn').click();
    await host.waitForFunction(() => __lastCall.S.guests.size === 1, null, { timeout: 45000 });
    await guest.evaluate(() => { window.holdArrival = true; window.arrivalHeld = false; arrivalRuns.length = arrivalDraws.length = arrivalMonsters.length = 0; });
    await host.locator('#optPlayers').selectOption('6'); await host.locator('#optKillers').selectOption('1'); await host.locator('#startBtn').click();
    await guest.waitForFunction(() => window.arrivalHeld, null, { timeout: 90000 });
    await host.waitForFunction(() => !document.querySelector('#levelContinue').disabled, null, { timeout: 90000 });
    await host.locator('#levelContinue').click(); await host.locator('#menuBtn').click(); await host.locator('#quitBtn').click();
    await guest.waitForFunction(() => __lastCall.S.screen === 'menu', null, { timeout: 20000 });
    const canceled = await guest.evaluate(() => ({ frames: __lastCall.gfx().frames, stages: arrivalRuns[0].stages.length, monsters: arrivalMonsters.map(m => ({ ...m })) }));
    if (replacement) {
      await guest.locator('#soloBtn').click(); await guest.locator('#optPlayers').selectOption('32'); await guest.locator('#startBtn').click();
      await guest.waitForTimeout(300);
    }
    const beforeRelease = await guest.evaluate(() => ({ frames: __lastCall.gfx().frames, runs: arrivalRuns.map(r => ({ players: r.players, ended: r.ended, stages: r.stages.length })) }));
    await guest.evaluate(() => releaseArrival());
    await guest.waitForFunction(() => arrivalRuns.every(r => r.ended), null, { timeout: 90000 });
    if (replacement) await guest.waitForFunction(() => !document.querySelector('#levelContinue').disabled, null, { timeout: 90000 });
    await guest.waitForTimeout(250);
    const after = await guest.evaluate(() => ({ screen: __lastCall.S.screen, frames: __lastCall.gfx().frames, runs: arrivalRuns, draws: arrivalDraws, monsters: arrivalMonsters, ready: !document.querySelector('#levelContinue').disabled, status: document.querySelector('#levelStatus').textContent }));
    report.cases.push({ replacement, canceled, beforeRelease, after });
    if (!baseline) {
      assert.ok(after.monsters.every(m => m.disposed), 'all temporary preparation monsters retire');
      assert.equal(after.runs[0].stages.length, canceled.stages, 'canceled preparation emits no stale progress');
      assert.equal(after.draws.filter(d => !d.prepareOnly && d.players === 6).length, 0, 'canceled arrival never renders its stale scene');
      if (!replacement) { assert.equal(after.screen, 'menu'); assert.equal(after.frames, canceled.frames, 'menu performs no hidden scene render'); }
      else { assert.equal(after.screen, 'briefing'); assert.equal(after.ready, true); assert.equal(after.draws.at(-1).players, 32); }
    }
    if (replacement) {
      await guest.locator('#levelContinue').click(); await guest.locator('#menuBtn').click(); await guest.locator('#quitBtn').click();
    }
  }
  if (!baseline) report.partialCleanup = await guest.evaluate(async () => {
    const L=__lastCall,D=await import('./src/3d/render3d.js'),{setPreset}=await import('./src/settings.js');
    setPreset('ultra');L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.render();L.S.screen='briefing';
    const frame={pub:L.view.pub,priv:L.view.priv,me:L.S.me,mode:'fp'},rows=[];
    // Exercise cancellation on either side of geometry/shader temporary-state
    // changes, including the shadow-material retention stage on Ultra.
    for(const cut of [.02,.14,.64,.7,.8,.82,.85,.87,.88,.9]) {
      const before=arrivalRendererState(),stages=[];let current=true;
      await D.warmup(frame,(n,text)=>{stages.push({n,text});if(n>=cut)current=false;},()=>current);
      rows.push({cut,before,after:arrivalRendererState(),stages,monsters:arrivalMonsters.map(m=>({...m}))});
    }
    const queue=[],failure=new Error('Expected preparation fixture failure');
    const first=D.warmup(frame,n=>{queue.push(['failed',n]);if(n>=.87)throw failure;}).then(()=>({caught:false}),e=>({caught:e===failure}));
    const second=D.warmup(frame,n=>{queue.push(['replacement',n]);if(n===.02&&!arrivalMonsters.every(m=>m.disposed))throw Error('prior temporary monster still alive');});
    const obsolete=D.warmup(frame,()=>{throw Error('obsolete queued arrival emitted progress');},()=>false);
    const [result]=await Promise.all([first,second,obsolete]);
    return{rows,queue,failure:result,final:arrivalRendererState(),monsters:arrivalMonsters,draws:arrivalDraws};
  });
  if (!baseline) {
    for(const row of report.partialCleanup.rows) {
      assert.deepEqual(row.after,row.before,'cancel at '+row.cut+': renderer target, materials, ghost state, room variant, sorting and retained depth owners restore');
      assert.ok(row.monsters.every(m=>m.disposed),'cancel at '+row.cut+': temporary monsters disposed');
      assert.ok(row.stages.at(-1).n>=row.cut);assert.ok(row.stages.at(-1).n<1,'canceled preparation cannot announce readiness');
    }
    assert.equal(report.partialCleanup.failure.caught,true,'real preparation failures propagate to their caller');
    assert.equal(report.partialCleanup.queue.at(-1)[0],'replacement');assert.equal(report.partialCleanup.queue.at(-1)[1],1,'a failed preparation does not poison its queued replacement');
    assert.ok(report.partialCleanup.monsters.every(m=>m.disposed));
  }
  assert.deepEqual(errors, []);
  console.log(baseline ? 'RECORDED: actual host departure during guest preparation, with menu and immediate solo replacement.' : 'PASS: actual host departures retire canceled preparations, preserve an idle menu, safely prepare an immediate 32-player replacement; 10 partial cancellations restore renderer/material state, and a failed preparation leaves its queued replacement usable.');
} catch (error) { report.failure = error.stack; throw error; }
finally { report.errors = errors; fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2)); await browser.close(); }
