import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PW);
const b = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
  ignoreDefaultArgs: ["--disable-gpu"],
});
const pages = [],
  report = { at: new Date().toISOString(), errors: [] };
fs.mkdirSync("shots/backrooms-survival", { recursive: true });
try {
  for (const name of ["MazeHost", "MazeGuest", "MazeWatch"]) {
    const p = await b.newPage({
      viewport: { width: 960, height: 640 },
      ignoreHTTPSErrors: true,
    });
    pages.push(p);
    p.on("pageerror", (e) => report.errors.push(e.message));
    await p.addInitScript(() =>
      localStorage.setItem(
        "lc.settings",
        JSON.stringify({
          v: 2,
          gfx: { preset: "low" },
          voice: { mode: "off" },
        }),
      ),
    );
    await p.goto("https://10.42.0.37:3161/");
    await p.waitForFunction(() => window.__lastCall?.S.ready, null, {
      timeout: 120000,
    });
    await p.evaluate((name) => {
      __lastCall.noLock();
      document.querySelector("#nameIn").value = name;
    }, name);
  }
  const [h, g, w] = pages;
  await h.locator("#modePick [data-mode=escape]").click();
  await h.locator("#hostBtn").click();
  await h.waitForFunction(() => __lastCall.S.code?.length === 4, null, {
    timeout: 45000,
  });
  const code = await h.evaluate(() => __lastCall.S.code);
  for (const p of [g, w]) {
    await p.locator("#joinToggle").click();
    await p.locator("#codeIn").fill(code);
    await p.locator("#joinBtn").click();
  }
  await h.waitForFunction(() => __lastCall.S.guests.size === 2, null, {
    timeout: 45000,
  });
  await h.locator("#optPlayers").selectOption("6");
  await h.locator("#startBtn").click();
  for (const p of pages) {
    await p.waitForFunction(
      () => !document.querySelector("#levelContinue").disabled,
      null,
      { timeout: 120000 },
    );
    await p.locator("#levelContinue").click();
    await p.waitForFunction(() => __lastCall.view?.pub.mode === "play", null, {
      timeout: 20000,
    });
    assert.equal(await p.evaluate(() => __lastCall.view.pub.escape), true);
    assert.equal(await p.evaluate(() => __lastCall.view.pub.nk), 0);
  }
  await h.evaluate(() => {
    const G = __lastCall.state;
    for (const c of G.chars) {
      c.isHuman = true;
      if (c.seat) c.seat.occ = null;
      c.seat = null;
    }
    G.survival.nextSpawn = 1e9;
  });
  await h.evaluate(() => {
    const L = __lastCall,
      c = L.state.chars[1],
      h = L.view.pub.survival.hides[0];
    Object.assign(c, { x: h.x, y: h.y, look: -Math.PI / 2 });
    c.posVer++;
  });
  await g.waitForFunction(() => __lastCall.view.priv.ctx === "Hide in locker");
  await g.evaluate(() => __lastCall.act("use"));
  await h.waitForFunction(() => __lastCall.state.chars[1].hidden != null);
  await w.waitForFunction(() => __lastCall.view.pub.chars[1].hidden);
  await g.waitForFunction(() => __lastCall.view.priv.hidden);
  const hidden = await h.evaluate(() => ({
    x: __lastCall.state.chars[1].x,
    y: __lastCall.state.chars[1].y,
  }));
  await g.keyboard.down("w");
  await g.waitForTimeout(200);
  await g.keyboard.up("w");
  assert.deepEqual(
    await h.evaluate(() => ({
      x: __lastCall.state.chars[1].x,
      y: __lastCall.state.chars[1].y,
    })),
    hidden,
  );
  report.guestHide = true;
  await h.evaluate(() => {
    const L = __lastCall;
    L.state.t = 89.9;
    L.state.survival.nextSpawn = 90;
    L.step(0.2);
  });
  for (const p of [g, w])
    await p.waitForFunction(
      () => __lastCall.view.pub.survival.entities.length === 1,
    );
  assert.equal(
    await g.evaluate(() => __lastCall.view.pub.survival.entities[0].kind),
    "bacteria",
  );
  assert.equal(await w.evaluate(() => __lastCall.view.priv.canInspect), false);
  report.spawnAcrossClients = true;
  await h.evaluate(() => {
    __lastCall.state.survival.entities = [];
    __lastCall.state.survival.nextSpawn = 1e9;
  });
  await g.evaluate(() => __lastCall.act("use"));
  await h.waitForFunction(() => __lastCall.state.chars[1].hidden == null);
  const seat = await h.evaluate(() => {
    const L = __lastCall,
      m = L.state.survival.mimics.values().next().value,
      s = L.state.seats[m.seat],
      c = L.state.chars[1];
    if (s.occ) {
      s.occ.seat = null;
      s.occ = null;
    }
    Object.assign(c, { x: s.x, y: s.y, look: s.face, face: s.face });
    c.posVer++;
    return s.id;
  });
  await g.waitForFunction((id) => __lastCall.view.priv.seat?.id === id, seat);
  await g.evaluate(
    (seat) => __lastCall.act("tableBet", { seat, round: 1, bet: 100 }),
    seat,
  );
  for (const p of [h, w])
    await p.waitForFunction(
      () => __lastCall.view.pub.survival.mimics.length === 1,
    );
  assert.equal(await g.evaluate(() => __lastCall.view.priv.canInspect), false);
  await g.evaluate(() => __lastCall.act("leave"));
  await h.evaluate(async () => {
    const L = __lastCall,
      { STAFF_DOORS } = await import("./src/map.js"),
      d = STAFF_DOORS[0],
      c = L.state.chars[1];
    if (c.seat) c.seat.occ = null;
    Object.assign(c, {
      seat: null,
      x: d.sx,
      y: d.sy,
      look: Math.PI,
      won: 12345,
    });
    c.posVer++;
  });
  await g.waitForFunction(() => __lastCall.view.priv.escaped, null, {
    timeout: 12000,
  });
  await w.waitForFunction(() => __lastCall.view.pub.chars[1].escaped);
  assert.equal(await g.evaluate(() => __lastCall.view.priv.wallet), 12345);
  assert.equal(await h.evaluate(() => __lastCall.state.chars[1].alive), false);
  assert.equal(
    await h.evaluate(() => __lastCall.state.chars[1].extracted),
    12345,
  );
  report.mimicRetreatAndExtraction = 12345;
  await h.evaluate(() => {
    const L = __lastCall,
      c = L.state.chars[2];
    if (c.seat) c.seat.occ = null;
    Object.assign(c, { seat: null, x: 1500, y: 600 });
    c.posVer++;
    L.state.survival.entities = [
      {
        id: -101,
        kind: "hound",
        name: "Hound",
        x: 1520,
        y: 600,
        face: Math.PI,
        speed: 0,
        sight: 430,
        path: [],
        repath: 100,
        memory: 0,
        target: null,
      },
    ];
  });
  await w.waitForFunction(() => !__lastCall.view.priv.alive);
  assert.equal(
    await w.evaluate(() => __lastCall.view.priv.deathScene.attacker.entity),
    "hound",
  );
  assert.equal(await g.evaluate(() => __lastCall.view.priv.deathScene), null);
  report.privateCreatureDeath = true;
  await h.evaluate(() => {
    for (const c of __lastCall.state.chars) if (c.id !== 1) c.alive = false;
    __lastCall.step(0.05);
  });
  for (const p of [g, w])
    await p.waitForFunction(() => !!__lastCall.view.pub.over);
  assert.equal(await g.evaluate(() => __lastCall.view.priv.won), true);
  assert.equal(await w.evaluate(() => __lastCall.view.priv.won), false);
  report.perPlayerResult = true;
  assert.deepEqual(report.errors, []);
  console.log("PASS Backrooms real three-browser PeerJS", report);
} catch (e) {
  report.failure = e.stack;
  throw e;
} finally {
  fs.writeFileSync(
    "shots/backrooms-survival/network.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await b.close();
}
