// Resource lifetime, hidden actor work and same-frame matrix correctness.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const p = await b.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  if (process.argv.includes('--baseline-scenery')) await p.route('**/src/3d/render3d.js', async route => {
    const response = await route.fetch(), source = await response.text(), needle = 'function cullOffscreenScenery(cam) {';
    assert.ok(source.includes(needle));
    await route.fulfill({ response, body: source.replace(needle, needle + '\n  return [];') });
  });
  await p.goto(process.env.LC_URL || 'https://10.42.0.37:3161/');
  await p.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  await p.evaluate(() => { const L = __lastCall; L.noLock(); L.start('killer', { players: 32 }); L.step(.1); L.S.paused = true; });
  const memory = [];
  for (let i = 0; i < 7; i++) {
    await p.evaluate(i => {
      // Repeat two known appearance/seat populations. Unseeded rounds can show
      // different numbers of first-used bone textures without leaking anything.
      let seed = 42 + i % 2; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const L = __lastCall; L.start('gambler', { players: 32 }); L.step(.1); L.S.paused = true;
      L.place(1300, 600); L.look(Math.PI / 2);
      for (const c of L.state.chars) c.color = i % 2 ? '#3a9070' : '#a04a60'; L.render();
    }, i);
    await p.waitForTimeout(120); memory.push(await p.evaluate(() => __lastCall.gfx().tex));
  }
  assert.ok(Math.max(...memory.slice(2)) - Math.min(...memory.slice(2)) <= 2, `textures must plateau across restarts: ${memory}`);
  const checks = await p.evaluate(() => {
    const L = __lastCall, rows = [];
    for (const [x,y,look] of [[350,400,-Math.PI/2],[1300,600,Math.PI/2],[2520,950,-Math.PI/2],[330,1000,Math.PI],[2500,1500,0]]) {
      L.place(x,y); L.look(look); L.render();
      const scene = L.scene().scene, visible = [];
      scene.traverseVisible(o => { if (o.matrixWorldAutoUpdate) visible.push([o, o.matrixWorld.clone(), o.isSkinnedMesh ? o.bindMatrixInverse.clone() : null]); });
      // The optimized matrices must match Three's exhaustive update, including
      // the first frame after teleporting between previously hidden rooms.
      scene.updateMatrixWorld(true);
      let error = 0; for (const [o,m,bind] of visible) for (let i=0;i<16;i++) {
        error = Math.max(error,Math.abs(m.elements[i]-o.matrixWorld.elements[i]));
        if (bind) error = Math.max(error,Math.abs(bind.elements[i]-o.bindMatrixInverse.elements[i]));
      }
      rows.push({ x,y,error,skins:visible.filter(([, ,bind])=>bind).length,work:L.gfx().actorWork });
    }
    return rows;
  });
  for (const row of checks) assert.ok(row.error < 1e-8, `same-frame visible matrices: ${JSON.stringify(row)}`);
  assert.ok(checks[1].skins > 0, 'the matrix comparison must include visible skinned characters');
  assert.ok(checks[0].work.posed < checks[0].work.total / 3, 'bar skips the hidden crowd poses');
  assert.ok(checks[1].work.posed > checks[0].work.posed, 'returning to the crowd restores its poses immediately');
  const bones = await p.evaluate(() => {
    const L = __lastCall; L.place(1300,600); L.look(Math.PI/2); L.render();
    const skeletons=new Map();L.scene().scene.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.boneTexture)skeletons.set(o.skeleton,o.skeleton.boneTexture.version);});
    L.render();const updates=[];let error=0;
    for(const [s,version]of skeletons){const n=s.boneTexture.version-version;if(!n)continue;updates.push(n);const matrices=s.boneMatrices.slice();Object.getPrototypeOf(s).update.call(s);for(let i=0;i<matrices.length;i++)error=Math.max(error,Math.abs(matrices[i]-s.boneMatrices[i]));}
    return {updates,error};
  });
  assert.ok(bones.updates.length>10,'exercise the crowded scene with AO and shadows');
  assert.ok(bones.updates.every(n=>n===1),`one bone texture update per displayed pose: ${bones.updates}`);
  assert.ok(bones.error<1e-8,'bone matrices match an independent full skeleton update');
  const stopped = await p.evaluate(() => {
    const L=__lastCall,now=performance.now,at=now.call(performance);performance.now=()=>at;
    try {
      L.render();const saved=[];L.scene().scene.traverseVisible(o=>{if(o.isSkinnedMesh)saved.push([o,o.matrixWorld.elements.slice(),o.skeleton.boneMatrices.slice()]);});
      L.render();let error=0;for(const [o,world,bones]of saved){for(let i=0;i<world.length;i++)error=Math.max(error,Math.abs(world[i]-o.matrixWorld.elements[i]));for(let i=0;i<bones.length;i++)error=Math.max(error,Math.abs(bones[i]-o.skeleton.boneMatrices[i]));}return {skins:saved.length,error};
    }finally{performance.now=now;}
  });
  assert.ok(stopped.skins>10);assert.ok(stopped.error<1e-8,'a zero-elapsed render keeps character pose and matrices fixed');
  const snacks = await p.evaluate(() => {
    const L = __lastCall; L.place(700,500); const me = L.state.chars[0]; me.snack = 2; const rows=[];
    for(let i=0;i<8;i++){ me.eatAt=L.state.t;L.render();rows.push(L.gfx().geos);me.eatAt=-99;L.render(); }
    return rows;
  });
  assert.ok(Math.max(...snacks.slice(1))-Math.min(...snacks.slice(1)) <= 1, `repeated hot dogs reuse geometry: ${snacks}`);
  const mutations = await p.evaluate(async () => {
    const L=__lastCall;L.start('killer',{players:32});L.step(.1);L.S.paused=true;L.place(350,400);L.look(-Math.PI/2);L.render();
    let count=0;const ob=new MutationObserver(rs=>count+=rs.length);ob.observe(document.getElementById('killerBar'),{subtree:true,childList:true,attributes:true});
    for(let i=0;i<10;i++)L.render();await new Promise(r=>setTimeout(r,0));ob.disconnect();return count;
  });
  assert.equal(mutations,0,'unchanged killer HUD does not rewrite text/attributes');
  const repeated = await p.evaluate(() => {
    const count=new Map();for(const e of performance.getEntriesByType('resource'))if(e.name.includes('/assets/'))count.set(e.name,(count.get(e.name)||0)+1);return [...count].filter(([,n])=>n>1);
  });
  assert.deepEqual(repeated, [], 'startup/static assets are requested once');
  assert.deepEqual(errors, []);
  console.log('PASS: restart GPU texture plateau',memory,'; repeated hot-dog geometry plateau',snacks,'; hidden poses, immediate return, visible world/bind matrices, one upload per skeleton pose, unchanged HUD, unique asset requests; no page errors.');
} finally { await b.close(); }
