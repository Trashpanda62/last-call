import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PW);
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
    "--ignore-gpu-blocklist",
  ],
  ignoreDefaultArgs: ["--disable-gpu"],
});
const out = "shots/backrooms-survival";
fs.mkdirSync(out, { recursive: true });
const report = { at: new Date().toISOString(), errors: [], variants: [] };
try {
  for (const variant of ["normal", "noprops"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });
    page.on("pageerror", (e) => report.errors.push(e.stack || e.message));
    await page.goto(
      "https://10.42.0.37:3161/" + (variant === "noprops" ? "?noprops" : ""),
    );
    await page.waitForFunction(() => window.__lastCall?.S.ready, null, {
      timeout: 120000,
    });
    await page.evaluate(() => {
      window.__backroomsMasks = [];
      __lastCall.scene().scene.traverse((o) => {
        if (o.userData.fixedScenery)
          __backroomsMasks.push({
            id: o.uuid,
            mask: o.layers.mask,
            material: o.material?.uuid,
          });
      });
    });
    await page.locator("#modePick [data-mode=classic]").click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: out + "/" + variant + "-menu-mystery.jpg" });
    await page.locator("#modePick [data-mode=escape]").click();
    await page.waitForTimeout(1000);
    assert.equal(
      await page.locator("#menu").getAttribute("data-mode"),
      "escape",
    );
    await page.screenshot({
      path: out + "/" + variant + "-menu-backrooms.jpg",
    });
    for (const width of [740, 420]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: out + "/" + variant + "-menu-" + width + ".jpg",
      });
      const fit = await page.evaluate(() => ({
        w: innerWidth,
        body: document.documentElement.scrollWidth,
        buttons: [...document.querySelectorAll("#modePick .mode")].map((b) => ({
          w: b.getBoundingClientRect().width,
          h: b.getBoundingClientRect().height,
        })),
      }));
      assert.ok(fit.body <= fit.w);
      assert.ok(fit.buttons.every((b) => b.w > 140 && b.h > 44));
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#soloBtn").click();
    assert.equal(await page.locator("#optKillers").isVisible(), false);
    assert.equal(await page.locator("#roleField").isVisible(), false);
    await page.evaluate(() => {
      const L = __lastCall;
      L.noLock();
      L.start("gambler", { mode: "escape", players: 6 });
      for (const c of L.state.chars) c.isHuman = true;
      L.step(0.1);
      L.render();
    });
    assert.equal(
      await page.evaluate(() => __lastCall.view.pub.backrooms),
      true,
    );
    assert.equal(
      await page.evaluate(() => __lastCall.view.priv.isKiller),
      false,
    );
    const geometry = await page.evaluate(() => {
      const L = __lastCall;
      return {
        br: L.scene().br,
        entities: L.view.pub.survival.entities.length,
        inspect: L.view.priv.canInspect,
      };
    });
    assert.equal(geometry.entities, 0);
    assert.equal(geometry.inspect, false);
    assert.doesNotMatch(await page.locator("#mouseActionsHint").textContent(), /trap/i);
    assert.equal(await page.locator('#touchBtns [data-act=inspect]').isVisible(), false);
    assert.ok(geometry.br.on);
    for (const [name, x, y, look] of [
      ["arrival", 1500, 600, Math.PI],
      ["arcade", 2520, 580, -Math.PI / 2],
      ["slots", 820, 1510, 0],
      ["yellow-halls", 1850, 1090, Math.PI],
    ]) {
      await page.evaluate(
        ({ x, y, look }) => {
          const L = __lastCall;
          L.act("leave");
          L.place(x, y);
          L.look(look, 0);
          L.render();
        },
        { x, y, look },
      );
      await page.waitForTimeout(350);
      await page.screenshot({
        path: out + "/" + variant + "-" + name + ".jpg",
      });
    }
    // Actual world left-click enters and leaves the locker; prediction cannot move it.
    const hide = await page.evaluate(
      () => __lastCall.view.pub.survival.hides[0],
    );
    await page.evaluate((h) => {
      const L = __lastCall;
      L.act("leave");
      L.place(h.x, h.y);
      L.look(-Math.PI / 2, 0);
      L.render();
    }, hide);
    assert.equal(
      await page.evaluate(() => __lastCall.view.priv.ctx),
      "Hide in locker",
    );
    await page.mouse.click(720, 450);
    await page.waitForFunction(() => __lastCall.view.priv.hidden);
    const hidden = await page.evaluate(() => {
      const L = __lastCall;
      L.render();
      return {
        hidden: L.view.pub.chars[0].hidden,
        actor: L.scene().actors.find((c) => c.id === 0),
        pos: [L.S.me.x, L.S.me.y],
      };
    });
    assert.ok(hidden.hidden);
    await page.keyboard.down("w");
    await page.waitForTimeout(200);
    await page.keyboard.up("w");
    assert.deepEqual(
      await page.evaluate(() => [__lastCall.S.me.x, __lastCall.S.me.y]),
      hidden.pos,
    );
    await page.screenshot({ path: out + "/" + variant + "-hidden.jpg" });
    await page.mouse.click(720, 450);
    await page.waitForFunction(() => !__lastCall.view.priv.hidden);
    // The first real timed spawn, then all four animated bodies in a clear sightline for visual inspection.
    await page.evaluate(() => {
      const L = __lastCall;
      L.state.t = 89.9;
      L.state.survival.nextSpawn = 90;
      L.step(0.2);
      L.render();
    });
    assert.equal(
      await page.evaluate(() => __lastCall.view.pub.survival.entities.length),
      1,
    );
    await page.evaluate(() => {
      const L = __lastCall;
      L.state.survival.nextSpawn = 1e9;
      L.place(1400, 600);
      L.look(Math.PI, 0);
      const S = L.state.survival;
      S.entities = [
        ...["bacteria", "hound", "smiler", "skinstealer"].map((kind, i) => ({
          id: -100 - i,
          kind,
          name: kind,
          x: 1100,
          y: 420 + i * 120,
          face: 0,
          moving: true,
          speed: 0,
          sight: 0,
          path: [],
          repath: 100,
          target: null,
          memory: 0,
        })),
      ];
      L.step(0.02);
      L.render();
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: out + "/" + variant + "-entities.jpg" });
    const creatures = await page.evaluate(() => {
      const L = __lastCall;
      return ["bacteria", "hound", "smiler", "skinstealer"].map(
        (k) => !!L.scene().scene.getObjectByName("backrooms-" + k)?.visible,
      );
    });
    assert.ok(creatures.every(Boolean));
    // A real guest wire snapshot is checked by native rules. Here validate live mimic mouth and escape state rendering.
    await page.evaluate(() => {
      const L = __lastCall;
      L.state.survival.entities = [];
      const m = L.state.survival.mimics.values().next().value,
        s = L.state.seats[m.seat];
      L.state.t = 91;
      L.act("leave");
      L.look(s.face, -0.15);
      L.place(s.x, s.y);
      L.render();
      L.act("tableBet", { seat: s.id, round: 1, bet: 100 });
      L.step(0.02);
      L.render();
    });
    assert.equal(
      await page.evaluate(() => __lastCall.view.pub.survival.mimics.length),
      1,
    );
    await page.screenshot({ path: out + "/" + variant + "-mimic.jpg" });
    await page.evaluate(async () => {
      const L = __lastCall,
        { STAFF_DOORS } = await import("./src/map.js");
      L.act("leave");
      const d = STAFF_DOORS[0];
      L.place(d.sx, d.sy);
      L.state.chars[0].won = 12345;
      L.look(Math.PI, 0);
      L.render();
    });
    await page.screenshot({ path: out + "/" + variant + "-exit.jpg" });
    await page.evaluate(() => {
      __lastCall.step(3.2);
      __lastCall.render();
    });
    assert.equal(await page.evaluate(() => __lastCall.view.priv.escaped), true);
    assert.equal(await page.evaluate(() => __lastCall.view.priv.wallet), 12345);
    // Private death uses the actual creature body, including the cinematic close-up.
    await page.evaluate(() => {
      const L = __lastCall;
      L.start("gambler", { mode: "escape" });
      for (const c of L.state.chars) c.isHuman = true;
      L.state.t = 100;
      L.state.survival.nextSpawn = 1e9;
      L.place(1500, 600);
      L.look(Math.PI, 0);
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
      L.step(0.05);
      L.render();
    });
    await page.waitForFunction(() => !__lastCall.view.priv.alive);
    await page.waitForTimeout(350);
    assert.equal(
      await page.evaluate(
        () => __lastCall.view.priv.deathScene.attacker.entity,
      ),
      "hound",
    );
    assert.equal(
      await page.evaluate(
        () =>
          __lastCall.scene().scene.getObjectByName("death-jumpscare-attacker")
            ?.userData.entityKind,
      ),
      "hound",
    );
    await page.screenshot({ path: out + "/" + variant + "-hound-death.jpg" });
    // Returning to murder mode restores the original shell and killer rules.
    await page.evaluate(() => {
      const L = __lastCall;
      L.start("gambler", { mode: "classic" });
      L.step(0.02);
      L.render();
    });
    assert.equal(await page.evaluate(() => __lastCall.scene().br.on), false);
    assert.equal(
      await page.evaluate(() => __lastCall.state.killerIds.length),
      1,
    );
    const restored = await page.evaluate(() => {
      const objects = new Map();
      __lastCall.scene().scene.traverse((o) => objects.set(o.uuid, o));
      return __backroomsMasks.filter((b) => {
        const o = objects.get(b.id);
        return (
          !o || o.layers.mask !== b.mask || o.material?.uuid !== b.material
        );
      });
    });
    assert.deepEqual(restored, [], "original masks and materials restored");
    report.variants.push({
      variant,
      geometry,
      leftClickHide: true,
      hiddenMovementBlocked: true,
      creatures: true,
      mimic: true,
      extraction: 12345,
      classicRestored: true,
      originalMaterialsAndLayersRestored: true,
      correctHoundCinematic: true,
    });
    await page.close();
  }
  assert.deepEqual(report.errors, []);
  console.log("PASS", report);
} catch (e) {
  report.failure = e.stack;
  throw e;
} finally {
  fs.writeFileSync(
    out + "/report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
