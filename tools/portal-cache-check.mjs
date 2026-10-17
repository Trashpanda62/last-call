// Compare every visibility decision with the original uncached doorway walk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW || 'playwright');
const legacyCull = "function cullRooms(cam, all) {\r\n  if (!R.roomProps || R.roomProps.world !== R.world) { const list = []; R.world.group.traverse(o => { if (o.userData.room) list.push(o); }); R.roomProps = { world: R.world, list }; }\r\n  let seen = null, start = null; const windows = new Map();\r\n  if (!all) {\r\n    cullFr.setFromProjectionMatrix(cullVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));\r\n    start = roomOf({ x: cam.position.x / M, y: cam.position.z / M });\r\n    seen = new Set([start]); windows.set(start, [[-1, -1, 1, 1]]);\r\n    for (const q = [[start, [-1, -1, 1, 1], null]]; q.length;) {\r\n      const [r, win, via] = q.pop();\r\n      for (const p of PORTALS) {\r\n        if (p === via) continue;\r\n        const o = p.a === r ? p.b : p.b === r ? p.a : null; if (!o || o === start) continue;\r\n        const pr = portalRect(p.box, cam); if (!pr) continue;\r\n        const cut = [Math.max(pr[0], win[0]), Math.max(pr[1], win[1]), Math.min(pr[2], win[2]), Math.min(pr[3], win[3])];\r\n        if (cut[0] >= cut[2] || cut[1] >= cut[3]) continue;\r\n        if (!windows.has(o)) windows.set(o, []);\r\n        if (windows.get(o).some(w => w[0] <= cut[0] && w[1] <= cut[1] && w[2] >= cut[2] && w[3] >= cut[3])) continue;\r\n        windows.get(o).push(cut); seen.add(o); q.push([o, cut, p]);\r\n      }\r\n    }\r\n  }\r\n  // A visible doorway exposes only its projected window, not every object behind that room's walls.\r\n  const visible = (room, bounds) => {\r\n    if (!seen || room === start) return true;\r\n    if (!seen.has(room)) return false;\r\n    if (coarseCull) return true;\r\n    if (!bounds) return true;\r\n    const rect = portalRect(bounds, cam); if (!rect) return false;\r\n    return windows.get(room).some(w => rect[0] <= w[2] && rect[2] >= w[0] && rect[1] <= w[3] && rect[3] >= w[1]);\r\n  };\r\n  const actorVisible = b => {\r\n    actorCenter.copy(b.root.position); actorCenter.y += 1.3; actorBox.setFromCenterAndSize(actorCenter, actorSize);\r\n    return visible(roomOf({ x: b.root.position.x / M, y: b.root.position.z / M }), actorBox);\r\n  };\r\n  for (const o of R.roomProps.list) o.visible = visible(o.userData.room, o.boundingBox);\r\n  if (seen) for (const b of R.beans.values()) if (b.root.visible) b.root.visible = actorVisible(b);\r\n  R.dealers.forEach(b => { b.root.visible = actorVisible(b); });\r\n  if (R.bartender) R.bartender.root.visible = actorVisible(R.bartender);\r\n  if (R.shady) R.shady.root.visible = actorVisible(R.shady);\r\n  R.roomsSeen = seen ? [...seen] : null;\r\n}\r\n\r";
const baseline = process.argv.includes('--baseline'), out = process.argv.find(a => a.endsWith('.json')) || 'shots/portal-cache.json';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'], ignoreDefaultArgs: ['--disable-gpu'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/src/3d/render3d.js', async route => {
    const response = await route.fetch(); let source = await response.text();
    for (const name of ['cullRooms', 'portalRect']) {
      const needle = 'function ' + name + '('; assert.ok(source.includes(needle)); source = source.replace(needle, 'function ' + name + 'Impl(');
    }
    source += '\n' + legacyCull.replace('function cullRooms(', 'function legacyCullRooms(') + `
let portalCapture=false;
window.__portalCheck={calls:0,doors:0,props:0,actors:0,mismatches:0,decisions:0};
const portalBoxes=new Set(PORTALS.map(p=>p.box));
function portalRect(box,cam){
 if(portalCapture){if(portalBoxes.has(box))__portalCheck.doors++;else if(box===actorBox)__portalCheck.actors++;else __portalCheck.props++;}
 return portalRectImpl(box,cam);
}
function cullRooms(cam,all){
 const objects=[...(R.roomProps?.list||[]),...[...R.beans.values(),...R.dealers,R.bartender,R.shady].filter(Boolean).map(b=>b.root)];
 const before=objects.map(o=>o.visible),fr=cullFr.clone(),vp=cullVP.clone();
 legacyCullRooms(cam,all);const expected=objects.map(o=>o.visible),rooms=JSON.stringify(R.roomsSeen);
 for(let i=0;i<objects.length;i++)objects[i].visible=before[i];cullFr.copy(fr);cullVP.copy(vp);
 portalCapture=true;try{cullRoomsImpl(cam,all);}finally{portalCapture=false;}
 for(let i=0;i<objects.length;i++){__portalCheck.decisions++;if(objects[i].visible!==expected[i])__portalCheck.mismatches++;}
 if(JSON.stringify(R.roomsSeen)!==rooms)__portalCheck.mismatches++;
 __portalCheck.calls++;window.__portalR=R;window.__portalCullAll=()=>cullRooms(R.camera,true);
}
`;
    await route.fulfill({ response, body: source });
  });
  await page.goto('https://10.42.0.37:3161/'); await page.waitForFunction(() => window.__lastCall?.S.ready, null, { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const L = __lastCall; L.noLock(); L.start('killer', { players: 32 }); L.step(.1); L.S.paused = true; L.place(1300, 600); L.look(Math.PI / 2); L.render();
    const R = __portalR, clock = performance.now, frozen = clock.call(performance); performance.now = () => frozen;
    const motionVisibility=new Set();const rows = [], capture = (name, run) => { __portalCheck = { calls: 0, doors: 0, props: 0, actors: 0, mismatches: 0, decisions: 0 }; run(); rows.push({ name, ...__portalCheck }); };
    const frames = n => { for (let i = 0; i < n; i++) L.render(); };
    try {
      capture('stationary floor', () => frames(30));
      L.place(2180,960);L.look(Math.PI,0);frames(2);capture('moving actors', () => { const c=L.state.chars[1],saved={x:c.x,y:c.y,isHuman:c.isHuman};c.isHuman=true;for(let i=0;i<30;i++){c.x=1900;c.y=i%2?960:700;c.seat=null;c.alive=true;c.monster=false;c.moving=false;c.held=null;L.step(.001);L.render();motionVisibility.add(L.scene().actors.find(a=>a.id===1)?.visible);}Object.assign(c,saved); });L.place(1300,600);L.look(Math.PI/2);frames(2);
      capture('rotating camera', () => { for (let i = 0; i < 24; i++) { L.look(i * Math.PI / 12, (i % 3 - 1) * .3); L.render(); } });
      capture('room transitions', () => { for (const [x,y,a] of [[350,400,-Math.PI/2],[330,1000,Math.PI],[2530,430,-Math.PI/2],[2180,960,Math.PI],[1300,1480,Math.PI/2],[2500,1500,Math.PI/2],[1300,600,Math.PI/2]]) { L.place(x,y); L.look(a); frames(2); } });
      capture('projection changes', () => { const f=R.baseFov,n=R.camera.near; for(const v of [55,90,110,f]){R.baseFov=v;frames(2);} R.camera.near=.3;R.camera.updateProjectionMatrix();frames(2);R.camera.near=n;R.camera.updateProjectionMatrix();frames(2); });
      frames(2); capture('stationary return', () => frames(30));
      capture('Backrooms and return', () => { L.state.backrooms=true;frames(2);L.state.backrooms=false;frames(2); });
      capture('actor removed and revived', () => { L.state.chars[1].alive=false;L.step(.001);frames(2);L.state.chars[1].alive=true;L.step(.001);frames(2); });
      capture('world identity replacement', () => { const world=R.world;R.world={...world};frames(2);R.world=world;frames(2); });
      capture('orbit visibility and return', () => { __portalCullAll();L.render();__portalCullAll();L.render(); });
    } finally { performance.now = clock; }
    return { rows, motionVisibility:[...motionVisibility].sort() };
  });
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true }); fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), ...result, errors }, null, 2));
  assert.deepEqual(errors, []);assert.deepEqual(result.motionVisibility,[false,true],'moving actor crosses the doorway visibility boundary');
  for (const r of result.rows) { assert.ok(r.calls > 0 && r.decisions > 0); assert.equal(r.mismatches, 0, r.name); }
  if (!baseline) for (const r of result.rows.filter(r => ['stationary floor', 'moving actors', 'stationary return', 'Backrooms and return', 'actor removed and revived'].includes(r.name))) { assert.equal(r.doors, 0, r.name); assert.equal(r.props, 0, r.name); }
  console.log('PASS: all original prop/actor/room visibility decisions match through motion, projection, room/world changes, Backrooms and orbit visibility.', JSON.stringify(result));
} finally { await browser.close(); }
