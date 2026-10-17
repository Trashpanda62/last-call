import {
  BR_HIDES,
  brLos,
  brRoute,
  brClear,
  brCollide,
} from "./backrooms-map.js";
import { STAFF_DOORS, makeSeats } from "./map.js";
const TYPES = [
  { kind: "bacteria", name: "Bacteria", speed: 158, sight: 560 },
  { kind: "hound", name: "Hound", speed: 205, sight: 430 },
  { kind: "smiler", name: "Smiler", speed: 180, sight: 660 },
  { kind: "skinstealer", name: "Skin-Stealer", speed: 172, sight: 510 },
];
export const SURVIVAL = {
  grace: 90,
  interval: 55,
  exitAt: 30,
  limit: 900,
  maxEntities: 8,
};
export function createSurvival(G, { kill, tell, standUp, getOut }) {
  G.survival = {
    entities: [],
    nextSpawn: SURVIVAL.grace,
    spawned: 0,
    mimics: new Map(),
    reveals: [],
    exitAt: SURVIVAL.exitAt,
    limit: SURVIVAL.limit,
  };
  const S = G.survival;
  // One physical cabinet is one mimic, including every seat at that cabinet. Never publish dormant identities.
  const candidates = G.seats.filter(
    (s) =>
      ![
        "cams",
        "vip",
        "race",
        "crash",
        "bj",
        "roulette",
        "dice",
        "coin",
        "wheel",
      ].includes(s.game),
  );
  const keys = new Set();
  for (const s of candidates.sort(() => Math.random() - 0.5)) {
    const key = s.game + ":" + s.machine;
    if (keys.has(key)) continue;
    keys.add(key);
    if (S.mimics.size < 6) S.mimics.set(key, { seat: s.id, used: false });
  }
  function trigger(c, s) {
    const m = S.mimics.get(s.game + ":" + s.machine);
    if (!m || m.used || !c.alive || c.hidden != null || G.t < SURVIVAL.grace)
      return;
    m.used = true;
    S.reveals.push({
      seat: s.id,
      x: s.x + Math.cos(s.face) * 42,
      y: s.y + Math.sin(s.face) * 42,
      t: 2.4,
      player: c.id,
    });
    tell(c, "That machine is breathing. BACK AWAY!", true, "gasp");
  }
  function hide(c) {
    if (c.hidden !== undefined && c.hidden !== null) {
      delete c.hidden;
      c.posVer++;
      return;
    }
    const h = BR_HIDES.find(
      (h) => Math.hypot(h.x - c.x, h.y - c.y) < 65 && brLos(c, h),
    );
    if (!h) return;
    if (G.chars.some((o) => o !== c && o.alive && o.hidden === h.id)) {
      tell(c, "Someone is already hiding here.");
      return;
    }
    standUp(c);
    c.state = "idle";
    c.wait = 0;
    c.hidden = h.id;
    c.hideSeen = S.entities.some(
      (e) =>
        e.target === c.id &&
        brLos(e, c) &&
        Math.hypot(e.x - c.x, e.y - c.y) < 500,
    );
    c.moving = false;
    c.sprinting = false;
    c.path = [];
    c.posVer++;
    tell(
      c,
      c.hideSeen
        ? "It saw you hide. Get out and RUN."
        : "Hidden. Left click to leave.",
      c.hideSeen,
    );
  }
  function spawn() {
    const type = TYPES[S.spawned % TYPES.length];
    const points = [
      { x: 120, y: 1140 },
      { x: 2890, y: 780 },
      { x: 1450, y: 1800 },
      { x: 80, y: 780 },
      { x: 2850, y: 1100 },
      { x: 1900, y: 160 },
    ].filter((p) => brClear(p));
    const players = G.chars.filter((c) => c.alive);
    const p = points.sort(
      (a, b) =>
        Math.min(...players.map((c) => Math.hypot(c.x - b.x, c.y - b.y))) -
        Math.min(...players.map((c) => Math.hypot(c.x - a.x, c.y - a.y))),
    )[0];
    if (!p) return;
    S.entities.push({
      ...type,
      id: -100 - S.spawned,
      x: p.x,
      y: p.y,
      face: 0,
      path: [],
      target: null,
      memory: 0,
      repath: 0,
      alert: false,
    });
    S.spawned++;
    for (const c of G.chars)
      if (c.isHuman && c.alive)
        tell(
          c,
          S.spawned === 1
            ? "The humming changed. Something has arrived."
            : "More footsteps in the walls.",
          true,
          "mstep",
        );
  }
  function tick(dt) {
    if (G.t >= S.exitAt && !G.exits)
      G.exits = {
        ids: [0, 3, 4].filter((i) => STAFF_DOORS[i]),
        t: S.limit - G.t,
        closed: false,
      };
    if (G.exits) {
      G.exits.t = Math.max(0, S.limit - G.t);
      if (!G.exits.closed)
        for (const c of G.chars) {
          if (!c.alive || (c.hidden !== undefined && c.hidden !== null))
            continue;
          const d = G.exits.ids
            .map((i) => STAFF_DOORS[i])
            .find((d) => Math.hypot(c.x - d.sx, c.y - d.sy) < 44);
          c.exitT = d ? (c.exitT || 0) + dt : 0;
          if (c.exitT >= (c.gear.has("crowbar") ? 2 : 3)) {
            c.extracted = Math.max(0, Math.round(c.won));
            getOut(c);
          }
        }
      if (G.t >= S.limit) G.exits.closed = true;
    }
    if (G.t >= S.nextSpawn && S.entities.length < SURVIVAL.maxEntities) {
      spawn();
      S.nextSpawn += SURVIVAL.interval;
    }
    for (const r of S.reveals) {
      r.t -= dt;
      if (r.t <= 0 && !r.done) {
        r.done = true;
        const c = G.chars[r.player];
        if (
          c?.alive &&
          Math.hypot(c.x - r.x, c.y - r.y) < 110 &&
          brLos(c, G.seats[r.seat])
        ) {
          if (c.gear.has("charm")) {
            c.gear.delete("charm");
            tell(c, "Your charm broke. RUN!", true, "gasp");
          } else
            kill(c, "monster", {
              id: -500 - r.seat,
              name: "Machine Mimic",
              kind: "mimic",
              color: "#45402a",
            });
        }
      }
    }
    S.reveals = S.reveals.filter((r) => r.t > -5);
    for (const e of S.entities) {
      if (e.stunned > 0) {
        e.stunned -= dt;
        continue;
      }
      e.repath -= dt;
      const visible = G.chars.filter(
        (c) =>
          c.alive &&
          (c.hidden == null || c.hideSeen) &&
          brLos(e, c) &&
          Math.hypot(e.x - c.x, e.y - c.y) < e.sight + (c.sprinting ? 180 : 0),
      );
      const heard =
        e.kind === "hound"
          ? G.chars.filter(
              (c) =>
                c.alive &&
                c.hidden == null &&
                c.moving &&
                Math.hypot(e.x - c.x, e.y - c.y) < (c.sprinting ? 700 : 360),
            )
          : [];
      let target = [...visible, ...heard].sort(
        (a, b) =>
          Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y),
      )[0];
      if (target) {
        e.target = target.id;
        e.last =
          target.seat && !brClear(target)
            ? { ...target.seat.approach }
            : { x: target.x, y: target.y };
        e.memory = 6;
        e.alert = true;
      } else {
        e.memory -= dt;
        e.alert = false;
        target = G.chars[e.target];
        if (e.memory <= 0 || !target?.alive) {
          e.target = null;
          target = null;
        }
      }
      if (e.repath <= 0) {
        e.repath = 0.8;
        if (e.target !== null && e.memory > 0) e.path = brRoute(e, e.last);
        else {
          const way = makeSeats().filter((s) => brClear(s));
          const p =
            way[
              (S.spawned * 17 + Math.floor(G.t / 7) + e.id * -3) % way.length
            ];
          if (p) e.path = brRoute(e, p);
        }
      }
      const watched =
        e.kind === "smiler" &&
        visible.some(
          (c) =>
            Math.abs(
              Math.atan2(
                Math.sin(Math.atan2(e.y - c.y, e.x - c.x) - c.look),
                Math.cos(Math.atan2(e.y - c.y, e.x - c.x) - c.look),
              ),
            ) < 0.6,
        );
      e.moving = false;
      if (e.path.length && !watched) {
        const p = e.path[0],
          d = Math.hypot(p.x - e.x, p.y - e.y),
          step = Math.min(
            d,
            e.speed *
              (e.alert ? 1 : 0.58) *
              (1 + Math.min(0.22, G.t / 4000)) *
              dt,
          );
        if (d < 5) e.path.shift();
        else {
          e.face = Math.atan2(p.y - e.y, p.x - e.x);
          e.x += Math.cos(e.face) * step;
          e.y += Math.sin(e.face) * step;
          brCollide(e);
          e.moving = true;
        }
      }
      for (const c of G.chars)
        if (
          c.alive &&
          (c.hidden == null || c.hideSeen) &&
          Math.hypot(c.x - e.x, c.y - e.y) < 30 &&
          brLos(e, c)
        ) {
          if (c.gear.has("charm")) {
            c.gear.delete("charm");
            e.path = [];
            e.memory = 0;
            e.target = null;
            e.repath = 3;
            e.stunned = 3;
            tell(c, "Your charm broke. RUN!", true, "gasp");
          } else kill(c, "monster", e);
        }
    }
  }
  function bot(c, dt) {
    if (c.hidden != null) {
      c.hideT = (c.hideT || 0) + dt;
      if (
        c.hideT > 10 &&
        !S.entities.some((e) => Math.hypot(c.x - e.x, c.y - e.y) < 300)
      ) {
        hide(c);
        c.hideT = 0;
      }
      return true;
    }
    const threat = S.entities.find(
      (e) => Math.hypot(c.x - e.x, c.y - e.y) < 380 && brLos(e, c),
    );
    if (threat) {
      standUp(c);
      if (c.target?.claim === c.id) c.target.claim = null;
      c.target = null;
      c.state = "wander";
      c.wait = 0;
      const h = BR_HIDES.filter(
        (h) => !G.chars.some((o) => o.alive && o.hidden === h.id),
      ).sort(
        (a, b) =>
          Math.hypot(c.x - a.x, c.y - a.y) - Math.hypot(c.x - b.x, c.y - b.y),
      )[0];
      if (
        h &&
        Math.hypot(c.x - h.x, c.y - h.y) < 60 &&
        !S.entities.some((e) => e.target === c.id && e.alert)
      ) {
        hide(c);
        return true;
      }
      const p = h || {
        x: Math.max(60, Math.min(2940, c.x + (c.x - threat.x))),
        y: Math.max(60, Math.min(1840, c.y + (c.y - threat.y))),
      };
      if (!c.path.length || Math.random() < dt) c.path = brRoute(c, p);
      const q = c.path[0];
      if (q) {
        const d = Math.hypot(q.x - c.x, q.y - c.y);
        if (d < 6) c.path.shift();
        else {
          c.face = c.look = Math.atan2(q.y - c.y, q.x - c.x);
          c.x += Math.cos(c.face) * 210 * dt;
          c.y += Math.sin(c.face) * 210 * dt;
          brCollide(c);
          c.moving = true;
        }
      }
      return true;
    }
    return false;
  }
  return {
    tick,
    trigger,
    hide,
    bot,
    public: () => ({
      grace: Math.max(0, Math.ceil(SURVIVAL.grace - G.t)),
      next: Math.max(0, Math.ceil(S.nextSpawn - G.t)),
      limit: Math.max(0, Math.ceil(S.limit - G.t)),
      entities: S.entities.map((e) => ({
        id: e.id,
        kind: e.kind,
        name: e.name,
        x: e.x,
        y: e.y,
        face: e.face,
        moving: e.moving,
        alert: e.alert,
      })),
      mimics: S.reveals.map(({ seat, x, y, t }) => ({ seat, x, y, t })),
      hides: BR_HIDES.map(({ id, x, y }) => ({ id, x, y })),
    }),
  };
}
