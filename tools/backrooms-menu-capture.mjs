import fs from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PW);
const b = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
    "--ignore-gpu-blocklist",
  ],
  ignoreDefaultArgs: ["--disable-gpu"],
});
try {
  const p = await b.newPage({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  await p.goto("https://10.42.0.37:3161/");
  await p.waitForFunction(() => __lastCall?.S.ready, null, { timeout: 120000 });
  const image = await p.evaluate(async () => {
    const L = __lastCall;
    L.noLock();
    L.start("gambler", { mode: "escape" });
    for (const c of L.state.chars) c.isHuman = true;
    L.step(0.02);
    L.state.t = 100;
    const S = L.state.survival;
    S.nextSpawn = 1e9;
    S.entities = [
      {
        id: -100,
        kind: "bacteria",
        name: "Bacteria",
        x: 1300,
        y: 1240,
        face: Math.PI,
        moving: false,
        speed: 0,
        sight: 0,
        path: [],
        repath: 100,
        memory: 0,
        target: null,
      },
    ];
    L.place(680, 1240);
    L.look(0, 0);
    L.render();
    const { draw } = await import("./src/3d/render3d.js");
    const v = L.view;
    v.pub.chars.forEach((c) => {
      if (c.id) c.alive = false;
    });
    draw({
      pub: v.pub,
      priv: v.priv,
      me: { x: 680, y: 1240, look: 0, pitch: 0, moving: false },
      mode: "fp",
      hideHands: true,
    });
    return document.querySelector("#view").toDataURL("image/png");
  });
  fs.mkdirSync("shots/backrooms-survival", { recursive: true });
  fs.writeFileSync(
    "shots/backrooms-survival/menu-backrooms-world.png",
    Buffer.from(image.split(",")[1], "base64"),
  );
} finally {
  await b.close();
}
