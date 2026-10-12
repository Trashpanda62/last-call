// The authoritative game. No DOM: the host (or solo client) runs it; every human sees it through view(id).
import { CFG, DIFF, CAST, DRINKS } from './config.js';
import { rand, pick, clamp, dist, angDiff, money, shuffle } from './util.js';
import { ROOMS, TAP, BELL, REST_SPOTS, BOWL_SPOTS, GAME_NAMES, OBSTACLES, POND, CHANDELIERS, W, H, makeSeats, los, collide, roomOf, route } from './map.js';
import * as Gm from './games.js';
import { makeTalk } from './talk.js';

// "Red", "Red and Mint", "Red, Mint and Pip"
export const nameList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
export const ringRadius = n => n > 10 ? 175 : n > 7 ? 150 : 130;
const rectDist = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.w), Math.max(r.y - p.y, 0, p.y - r.y - r.h));
const KILLS = ['order', 'rig', 'blade', 'accident'];
// What a killer actually tampers with at each kind of seat.
const RIG_LABEL = {
  bj: 'the blackjack chips', roulette: 'the roulette chips', slots: "the slot machine's lever", plinko: "the Plinko cabinet's button", mines: 'the Mines console',
  tower: 'the Dragon Tower console', coin: 'the coin podium', wheel: "the prize wheel's handle", dice: 'the dice', crash: 'the Crash desk', race: 'the duck race betting desk',
};

export function createGame(opts) {
  const n = clamp(opts.players || 6, 4, 16);
  const humans = opts.humans.slice(0, n);
  const nk = clamp(opts.killers || 1, 1, CFG.maxKillers(n));
  const all = [...Array(n).keys()];
  let killerIds;
  if (opts.forceRole === 'killer') killerIds = [0, ...shuffle(all.slice(1)).slice(0, nk - 1)];
  else if (opts.forceRole === 'gambler') killerIds = shuffle(all.slice(1)).slice(0, nk);
  else killerIds = shuffle(all).slice(0, nk);
  const usedNames = new Set(humans.map(h => h.name.toLowerCase()));
  const spare = ['Vinnie', 'Rosa', 'Hank', 'Fifi', 'Gus', 'Dot', 'Sly', 'Bea', 'Moe', 'Lulu', 'Rex', 'Opal', 'Ziggy', 'Nell', 'Bo', 'Tex'].filter(nm => !usedNames.has(nm.toLowerCase()));
  const G = {
    t: 0, mode: 'play', bank: CFG.startBank, target: Gm.niceDown(CFG.startBank * CFG.targets[n] * CFG.killerBank[nk]), diff: DIFF[opts.difficulty] || DIFF.normal,
    chars: [], drinks: [], bodies: [], floats: [], fx: [], lightsT: 0, nextId: 1, obsT: 0, pending: null, meeting: null, over: null,
    seats: makeSeats(), bowls: BOWL_SPOTS.map((p, i) => ({ id: i, x: p.x, y: p.y })), deaths: 0, traps: [],
    chandeliers: CHANDELIERS.map(([x, y], i) => ({ id: i, x, y, state: 'up', t: 0, by: null })).filter(ch => !['alley', 'race', 'arcade'].includes(roomOf(ch))), guard: null, guardSaw: null, haunts: [],
    // (the alley, pond and arcade have plain lamps, nothing to drop)
    antidotes: CFG.antidotes, security: { cams: false, feed: 'floor', feedT: 0 },
    killerIds, stats: { poisonings: 0, stabs: 0, meetings: 0, traps: 0, accidents: 0 },
  };
  for (let i = 0; i < n; i++) {
    const look = CAST[i];
    const h = humans[i];
    const botName = h ? null : usedNames.has(look.name.toLowerCase()) ? spare.shift() : look.name;
    const ang = i / n * Math.PI * 2, rr = ringRadius(n);
    G.chars.push({
      id: i, name: h ? h.name : botName, color: look.color, hat: look.hat, isHuman: !!h, netKey: h ? h.key : null,
      isKiller: killerIds.includes(i), alive: true, x: BELL.x + Math.cos(ang) * rr, y: BELL.y + Math.sin(ang) * rr,
      face: ang + Math.PI, look: ang + Math.PI, thirst: rand(60, 90), drink: null, seat: null, state: 'idle', path: [], wait: 0,
      poisonT: 0, poisonBy: null, poisonDrink: null, poisonKind: null, stuckT: 0, lastPos: { x: 0, y: 0 },
      cd: { order: CFG.startCd, rig: CFG.startCd, blade: CFG.startCd + 10, accident: CFG.startCd + 15, disguise: 0, lights: CFG.startCd + 20 },
      glanceT: rand(3, 8), glancing: 0, glanceOff: 0, gameT: rand(1, 4), sipT: rand(3, 8), sitT: 0, lucky: 0,
      sus: {}, witnessed: [], lastSeen: {}, touches: {}, huntT: rand(4, 8), hunt: null, bellUsed: false,
      notes: [], inbox: [], posVer: 0, moving: false, lookBack: false, inspect: null, voted: null, accused: false, target: null,
      heard: [], hauntUsed: false, disguise: null, trapT: 0, killedBy: null,
    });
  }
  for (const c of G.chars) { for (const o of G.chars) c.sus[o.id] = 0; c.friend = pick(G.chars.filter(o => o !== c)).id; c.trail = [{ t: 0, room: roomOf(c) }]; c.seenLog = {}; }
  const api = makeApi(G);
  G.crash = api.newCrash(); G.race = api.newRace();
  for (const c of G.chars) if (c.isHuman) {
    const partners = G.chars.filter(o => o.isKiller && o !== c).map(o => o.name);
    if (c.isKiller) api.tell(c, partners.length ? `You are a killer, with ${nameList(partners)}. Nobody can know.` : 'You are the killer. Nobody can know.', true, 'start');
    else api.tell(c, `${nk > 1 ? ['', '', 'Two', 'Three', 'Four'][nk] + ' of them are killers' : 'One of them is a killer'}. Watch your drink.`, false, 'start');
  }
  return api;
}

function makeApi(G) {
  const D = () => G.diff;
  const chars = () => G.chars;
  const byId = id => G.chars[id];
  const humans = () => G.chars.filter(c => c.isHuman);
  const gamblersAlive = () => G.chars.filter(c => c.alive && !c.isKiller);
  const killersAlive = () => G.chars.filter(c => c.alive && c.isKiller);
  const cdScale = () => CFG.cdScale[killersAlive().length] || 1;

  function tell(c, text, bad, sfx) { if (c.isHuman) c.inbox.push({ text, bad: !!bad, sfx: sfx || null }); }
  function tellAll(text, bad, sfx) { for (const c of humans()) tell(c, text, bad, sfx); }
  function sfxTo(c, sfx) { if (c.isHuman) c.inbox.push({ sfx }); }
  function note(c, text, extra) { if (c.isHuman) c.notes.push(Object.assign({ t: G.t, text }, extra || {})); }

  // ---------- Vision ----------
  const viewRange = () => G.lightsT > 0 ? CFG.darkRange : CFG.viewRange;
  function canSee(v, p) {
    if (!v.alive) return false;
    // the security desk's camera feed shows one room at a time, wherever it is
    if (v.seat && v.seat.game === 'cams' && G.security.cams && roomOf(p) === G.security.feed) return true;
    const d = dist(v, p);
    if (d > viewRange()) return false;
    if (d > CFG.nearSense && Math.abs(angDiff(Math.atan2(p.y - v.y, p.x - v.x), v.look)) > CFG.coneHalf) return false;
    return los(v, p);
  }
  // Fellow killers never count as witnesses. A careless bot killer misjudges some gazes.
  function witnessesOf(actor, ignore, careless) {
    return G.chars.filter(c => c !== actor && c !== ignore && c.alive && !(actor.isKiller && c.isKiller) && canSee(c, actor) &&
      !(careless && Math.random() < (c.isHuman ? D().careless * 2.5 : D().careless))).concat(G.guard && canSee(G.guard, actor) ? [G.guard] : []);
  }

  // ---------- Drinks, snacks and the antidote ----------
  // Drinks are always in someone's hand. Anyone at the bar can send a drink "on the house" to anyone; a killer's can be
  // poisoned, so a free drink is a gift or a death sentence and nobody can tell which by looking.
  function pourFor(c, from = null, poisonBy = null) {
    const k = pick(DRINKS);
    if (c.drink) removeDrink(c.drink);
    const d = { id: G.nextId++, owner: c.id, holder: c.id, x: c.x, y: c.y, sips: CFG.drinkSips, poisoned: poisonBy !== null, poisonBy, from, kind: k.kind, color: k.color };
    G.drinks.push(d); c.drink = d; sfxTo(c, 'pour');
    return d;
  }
  function removeDrink(d) { G.drinks = G.drinks.filter(x => x !== d); for (const c of G.chars) if (c.drink === d) c.drink = null; }
  function poisonChar(c, by, what, kind) {
    if (c.poisonT) return;
    c.poisonT = CFG.poisonDelay; c.poisonBy = by; c.poisonDrink = what; c.poisonKind = kind; c.sickTold = false;
  }
  function sip(c, d) {
    d.sips--; c.thirst = Math.min(100, c.thirst + CFG.sipGain); sfxTo(c, 'sip');
    if (d.poisoned) poisonChar(c, d.poisonBy, d.id, d.kind);
    if (d.sips <= 0) removeDrink(d);
  }
  function eatSnack(c, b) {
    c.lucky = CFG.luckyTime; sfxTo(c, 'crunch');
    tell(c, `Lucky pretzels! Your table wins pay ${Math.round(CFG.luckyBonus * 100)}% more for ${CFG.luckyTime}s.`);
    const trap = trapAt('bowl', b.id);
    if (trap && !c.isKiller) { poisonChar(c, trap.by, 'bowl' + b.id, 'pretzels'); removeTrap(trap); }
    G.fx.push({ kind: 'crumbs', x: b.x, y: b.y, t: 0.8 });
  }
  function takeAntidote(c) {
    if (!c.poisonT || G.antidotes <= 0) return false;
    G.antidotes--; c.poisonT = 0; c.poisonBy = null; sfxTo(c, 'sip');
    tell(c, `The antidote burns all the way down, but you'll live. ${G.antidotes} left behind the bar.`);
    if (c.poisonDrink !== null) note(c, `Your ${c.poisonKind} was poisoned. The antidote saved you.`, { hard: true });
    return true;
  }
  function sendDrink(c, to, poisoned) {
    const d = pourFor(to, c.id, poisoned ? c.id : null);
    tell(to, `A ${d.kind} arrived from a secret admirer.`, false, 'pour');
    if (!poisoned) tell(c, `You sent ${to.name} a ${d.kind}.`);
    for (const w of witnessesOf(c, to)) remember(w, c, 'send', to, `send ${to.name} a ${d.kind}`, CFG.sendSus, false);
    return d;
  }

  // ---------- What a witness takes away ----------
  // A disguised killer is remembered as whoever they look like.
  const appearAs = c => c.disguise && c.disguise.t > 0 ? byId(c.disguise.as) : c;
  function remember(w, actor, what, victim, phrase, sus, hard = true) {
    const seen = appearAs(actor);
    if (w.isGuard) { if (hard && !G.guardSaw) G.guardSaw = { who: seen.id, phrase, real: actor.id }; return; }
    if (w.isHuman) {
      note(w, `You saw <b>${seen.name}</b> ${phrase}.${!seen.alive ? ` But ${seen.name} is dead...` : ''}`, { who: seen.id, hard });
      if (hard) tell(w, `You saw ${seen.name} ${phrase}!`, true, 'gasp');
    } else {
      w.witnessed.push({ who: seen.id, real: actor.id, what, victim: victim ? victim.id : null, phrase, t: G.t, hard, fake: !seen.alive || seen.id !== actor.id });
      if (seen.alive) w.sus[seen.id] += sus;
    }
  }
  function witnessAll(k, what, victim, phrase, sus) { for (const w of witnessesOf(k, victim)) remember(w, k, what, victim, phrase, sus); }

  // ---------- Traps ----------
  const trapAt = (kind, id) => G.traps.find(t => t.kind === kind && t.id === id) || null;
  function removeTrap(t) { G.traps = G.traps.filter(x => x !== t); }
  // What a killer can rig from here: an empty seat (its machine or chips) or a snack bowl.
  function rigTarget(c) {
    const s = nearest(G.seats.filter(s => !s.occ && s.game !== 'vip' && s.game !== 'cams' && !trapAt('seat', s.id)), c, CFG.reach + 20);
    if (s) return { kind: 'seat', id: s.id, x: s.x, y: s.y, label: RIG_LABEL[s.game] || GAME_NAMES[s.game] };
    const b = nearest(G.bowls.filter(b => !trapAt('bowl', b.id)), c, CFG.reach + 10);
    return b ? { kind: 'bowl', id: b.id, x: b.x, y: b.y, label: 'the snack bowl' } : null;
  }

  // ---------- Killer moves ----------
  function cdHold(k, key, base) { k.cd[key] = base * cdScale(); for (const o of KILLS) if (o !== key) k.cd[o] = Math.max(k.cd[o], CFG.sharedCd); }
  // 1. A poisoned drink on the house, ordered at the bar for anyone in the casino.
  function doOrder(k, v) {
    if (k.cd.order > 0 || !v || !v.alive || v.isKiller || dist(k, TAP) > 90) return false;
    const d = sendDrink(k, v, true); cdHold(k, 'order', CFG.orderCd); G.stats.poisonings++;
    tell(k, `A poisoned ${d.kind} is on its way to ${v.name}.`, false, 'poison');
    return true;
  }
  // 2. Rig an empty seat's machine or chips, or a snack bowl. The next gambler to use it dies.
  function doRig(k, t) {
    if (k.cd.rig > 0 || !t || trapAt(t.kind, t.id)) return false;
    G.traps.push({ kind: t.kind, id: t.id, by: k.id, t: G.t, label: t.label });
    witnessAll(k, 'rig', null, `fiddle with ${t.label}`, 70);
    cdHold(k, 'rig', CFG.rigCd); G.stats.traps++;
    tell(k, `You rigged ${t.label}. The next gambler to use it is done.`, false, 'poison');
    return true;
  }
  // 3. A close kill. Only from behind: if they can see you coming, it fails.
  const behind = (k, v) => Math.abs(angDiff(Math.atan2(k.y - v.y, k.x - v.x), v.look)) > CFG.behind;
  function doBlade(k, v) {
    if (k.cd.blade > 0 || !v || !v.alive || v === k || v.isKiller || dist(k, v) > CFG.reach + 5) return false;
    if (!behind(k, v)) { tell(k, `${v.name} can see you coming. Get behind them.`); return false; }
    witnessAll(k, 'blade', v, `strangle ${v.name}`, 120);
    cdHold(k, 'blade', CFG.bladeCd); sfxTo(k, 'stab'); G.stats.stabs++;
    kill(v, 'blade', k);
    scream(v);
    return true;
  }
  // 4. Accidents: shove someone by the duck pond in, or loosen a chandelier over a table.
  function pondVictim(k) { return nearest(G.chars.filter(v => v.alive && !v.isKiller && v !== k && rectDist(v, POND) < CFG.pondReach), k, CFG.reach + 8); }
  function chandelierNear(k) { return nearest(G.chandeliers.filter(ch => ch.state === 'up' && dist(ch, k) > 40), k, CFG.chandelierReach); }
  function doAccident(k) {
    if (k.cd.accident > 0) return false;
    const v = pondVictim(k);
    if (v) {
      witnessAll(k, 'push', v, `shove ${v.name} into the duck pond`, 120);
      cdHold(k, 'accident', CFG.accidentCd); G.stats.accidents++;
      G.fx.push({ kind: 'splash', x: v.x, y: v.y, t: 1.2 });
      kill(v, 'drown', k); scream(v);
      return true;
    }
    const ch = chandelierNear(k);
    if (!ch) return false;
    ch.state = 'falling'; ch.t = CFG.chandelierFall; ch.by = k.id;
    witnessAll(k, 'chandelier', null, `mess with the chandelier's chain in ${ROOMS[roomOf(ch)].name}`, 90);
    for (const h of humans()) if (h.alive && roomOf(h) === roomOf(ch)) tell(h, 'The chandelier creaks...', true, 'gasp');
    cdHold(k, 'accident', CFG.accidentCd); G.stats.accidents++;
    return true;
  }
  function dropChandelier(ch) {
    ch.state = 'down';
    G.fx.push({ kind: 'smash', x: ch.x, y: ch.y, t: 1.5 });
    const hit = G.chars.filter(v => v.alive && !v.isKiller && dist(v, ch) < CFG.chandelierRadius).sort((a, b) => dist(a, ch) - dist(b, ch)).slice(0, CFG.chandelierMax);
    for (const v of hit) kill(v, 'chandelier', byId(ch.by));
    for (const h of humans()) if (h.alive && roomOf(h) === roomOf(ch)) tell(h, hit.length ? `The chandelier came down on ${nameList(hit.map(v => v.name))}!` : 'The chandelier crashed down. Nobody under it, luckily.', true, 'die');
  }
  // 5. Disguise: wear your last victim's look for a while.
  function doDisguise(k) {
    if (k.cd.disguise > 0) return false;
    const v = k.lastVictim !== undefined ? byId(k.lastVictim) : null;
    if (!v) { tell(k, 'You need a victim first. Their look is your disguise.'); return false; }
    k.disguise = { as: v.id, t: CFG.disguiseDur }; k.cd.disguise = CFG.disguiseCd;
    tell(k, `You look like ${v.name} for ${CFG.disguiseDur} seconds.`, false, 'lights');
    return true;
  }
  // 6. Lights out.
  function doLights(k) {
    if (k.cd.lights > 0) return false;
    for (const o of killersAlive()) o.cd.lights = CFG.lightsCd;
    G.lightsT = CFG.lightsDur;
    tellAll('The lights cut out!', true, 'lights');
    return true;
  }
  // Everyone within earshot hears a scream, through walls.
  function scream(v) {
    const room = ROOMS[roomOf(v)].name;
    for (const c of G.chars) {
      if (!c.alive || c === v || dist(c, v) > CFG.hearRange || canSee(c, v)) continue;
      if (c.isHuman) { tell(c, `A scream from ${room}!`, true, 'gasp'); note(c, `You heard a scream from ${room}.`, { hard: false }); }
      else c.heard.push({ t: G.t, room: roomOf(v), victim: v.id });
    }
  }
  const DEATH = {
    poison: v => [`Your ${v.poisonKind} was poisoned. You're a ghost now. Drift around and watch.`, `${v.name} collapsed!`],
    trap: v => [`${v.trapItem ? v.trapItem[0].toUpperCase() + v.trapItem.slice(1) : 'It'} was rigged. You're a ghost now.`, `${v.name} was electrocuted by ${v.trapItem || 'a machine'}!`],
    blade: () => ["Someone got you from behind. You're a ghost now.", null],
    chandelier: () => ["A chandelier fell on you. You're a ghost now.", null],
    drown: (v, by) => [`${by ? appearAs(by).name : 'Someone'} shoved you into the duck pond. You're a ghost now.`, `${v.name} went into the pond!`],
  };
  function kill(v, cause, by) {
    const knew = by && v.alive && canSee(v, by);
    v.alive = false; v.poisonT = 0; v.trapT = 0; v.inspect = null;
    v.killedBy = knew ? appearAs(by).id : null;
    if (by) by.lastVictim = v.id;
    if (v.seat) { v.seat.occ = null; v.seat = null; v.posVer++; }
    if (v.drink) { v.drink.holder = null; v.drink.x = v.x + 18; v.drink.y = v.y + 6; v.drink = null; }
    G.bodies.push({ x: v.x, y: v.y, id: v.id, cause, by: by ? by.id : null, drinkId: v.poisonDrink, kind: v.poisonKind, item: v.trapItem || null, reported: false, t: G.t, seenBy: new Set() });
    G.deaths++; G.stats[cause] = (G.stats[cause] || 0) + 1;
    G.fx.push({ kind: cause === 'poison' ? 'bubbles' : cause === 'trap' ? 'sparks' : 'splat', x: v.x, y: v.y, t: 1.5 });
    const [mine, seen] = (DEATH[cause] || DEATH.blade)(v, by);
    if (v.isHuman) tell(v, mine, true, 'die');
    if (seen) for (const h of humans()) if (h !== v && h.alive && canSee(h, v)) tell(h, seen, true, 'die');
    checkOver();
  }

  // ---------- Bots ----------
  function setGoal(c, p) { c.path = route(c, p); c.stuckT = 0; c.stalls = 0; }
  const clear = p => !OBSTACLES.some(o => p.x > o.x - 30 && p.x < o.x + o.w + 30 && p.y > o.y - 30 && p.y < o.y + o.h + 30);
  function openSpot(room) { for (let i = 0; i < 20; i++) { const p = { x: rand(room.x + 60, room.x + room.w - 60), y: rand(room.y + 160, room.y + room.h - 60) }; if (clear(p)) return p; } return { x: room.x + room.w / 2, y: room.y + room.h / 2 }; }
  function followPath(c, dt, speed) {
    if (!c.path.length) return true;
    const p = c.path[0], dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
    if (d < 5) { c.path.shift(); return !c.path.length; }
    const s = Math.min(d, speed * dt);
    c.x += dx / d * s; c.y += dy / d * s; c.face = Math.atan2(dy, dx); c.moving = true;
    collide(c);
    c.stuckT += dt;
    if (c.stuckT > 1) {
      if (dist(c, c.lastPos) < 12) {
        c.x += rand(-14, 14); c.y += rand(-14, 14); collide(c);
        if (++c.stalls > 4) { c.path = []; if (c.target && c.target.claim === c.id) c.target.claim = null; c.state = 'idle'; return false; }
        c.path = route(c, c.path[0]).concat(c.path.slice(1));
      }
      c.lastPos = { x: c.x, y: c.y }; c.stuckT = 0;
    }
    return false;
  }
  function standUp(c) {
    if (!c.seat) return;
    c.x = c.seat.approach.x; c.y = c.seat.approach.y;
    c.leftSeatT = G.t; c.seat.occ = null; c.seat = null; c.posVer++;
  }
  function sit(c, seat) {
    if (c.target && c.target.claim === c.id) c.target.claim = null;
    seat.occ = c; seat.claim = null; c.seat = seat; c.x = seat.x; c.y = seat.y; c.face = c.look = seat.face; c.posVer++;
    const trap = trapAt('seat', seat.id);
    if (trap && !c.isKiller) { removeTrap(trap); c.trapT = CFG.rigDelay; c.trapBy = trap.by; c.trapItem = trap.label; }
  }
  function botChoose(c) {
    if (sick(c) && G.antidotes > 0 && dist(c, TAP) / CFG.botSpeed < c.poisonT - 1) { c.state = 'antidote'; setGoal(c, { x: TAP.x + rand(-40, 40), y: TAP.y + 10 }); return; }
    if (c.thirst < 45 && !c.drink) { c.state = 'getDrink'; setGoal(c, { x: TAP.x + rand(-80, 80), y: TAP.y + 10 }); return; }
    const r = Math.random();
    if (r < 0.1) { c.state = 'rest'; setGoal(c, pick(REST_SPOTS)); return; }
    if (r < 0.18 && !c.lucky) { const b = pick(G.bowls); c.state = 'snack'; c.target = b; setGoal(c, { x: b.x, y: b.y }); return; }
    if (r < 0.24) { c.state = 'wander'; setGoal(c, openSpot(ROOMS[busyRoom(c)])); return; }
    // People drift toward the action: a seat counts more for every other gambler in its room.
    const free = G.seats.filter(s => !s.occ && !s.claim && (s.game !== 'cams' || G.security.cams || G.deaths > 0));
    const crowd = roomCrowd(c);
    const seat = free.length ? free[pickIdx(free.map(s => (s.game === 'cams' ? 0.6 : 1) + CFG.social * (crowd[roomOf(s)] || 0)))] : null;
    if (!seat) { c.state = 'wander'; setGoal(c, openSpot(ROOMS[busyRoom(c)])); return; }
    seat.claim = c.id; c.target = seat; c.state = 'toSeat';
    setGoal(c, seat.approach); c.path.push({ x: seat.x, y: seat.y });
  }
  // How many other living people are in each room (seated or on the way to a seat there).
  function roomCrowd(me) {
    const n = {};
    for (const o of G.chars) if (o !== me && o.alive) { const k = roomOf(o.state === 'toSeat' && o.target ? o.target : o); n[k] = (n[k] || 0) + 1; }
    return n;
  }
  function busyRoom(me) { const n = roomCrowd(me), ks = Object.keys(ROOMS); return ks[pickIdx(ks.map(k => 1 + CFG.social * (n[k] || 0)))]; }
  // Bots play the very same games as players, betting a share of the bank.
  const botBet = () => Gm.clampBet(G.bank * CFG.bot.frac * rand(0.5, 1.5), G.bank);
  function botPlay(c) {
    const s = c.seat, every = CFG.bot.every[s.game];
    if (!every) { c.gameT = 99; return; }
    c.gameT = every * rand(0.7, 1.3);
    let b = botBet(), m = 0, units = 1;
    switch (s.game) {
      case 'bj': { const r = Gm.bjAuto(); m = r.mult; units = r.staked; break; }
      case 'roulette': { const bet = Math.random() < 0.25 ? Math.floor(Math.random() * 37) : pick(Object.keys(Gm.RL_BETS)); m = Gm.rlSpin(bet, Gm.rlLucky()).mult; break; }
      case 'slots': if (s.tier === 'penny') b = Math.max(Gm.SLOT_TIERS.penny.minBet, Math.round(b / 10)); m = Gm.slotSpin(s.tier).mult; break;
      case 'plinko': m = Gm.plinkoDrop(pick(['low', 'low', 'medium', 'high'])).mult; break;
      case 'mines': {
        const st = Gm.minesNew(pick([1, 3, 3, 5, 10])), order = shuffle([...Array(25).keys()]), k = 1 + Math.floor(Math.random() * 5);
        for (let i = 0; i < k && !st.over; i++) Gm.minesPick(st, order[i]);
        m = Gm.minesCash(st).mult; break;
      }
      case 'tower': {
        const st = Gm.towerNew(pick(['easy', 'medium', 'medium', 'hard'])), k = 1 + Math.floor(Math.random() * 4);
        for (let i = 0; i < k && !st.over; i++) Gm.towerPick(st, Math.floor(Math.random() * st.eggs));
        m = Gm.towerCash(st).mult; break;
      }
      case 'coin': { const rides = pick([0, 0, 1, 2]); m = 2 ** (rides + 1); for (let i = 0; i <= rides; i++) if (!Gm.coinFlip('heads').win) { m = 0; break; } break; }
      case 'wheel': m = Gm.wheelSpin().mult; break;
      case 'dice': m = Math.random() < 0.6 ? Gm.passAuto() : Gm.fieldRoll().mult; break;
      default: return;
    }
    settle(c, b * units, b * m);
  }
  // A bet of `staked` came back as `back`. The crew bank takes the difference plus the comp on the bet.
  function settle(c, staked, back) { addBank(back - staked, c, staked); }
  function addBank(delta, c, staked = 0) {
    if (c && c.lucky > 0 && delta > 0) delta = delta * (1 + CFG.luckyBonus);
    const net = Math.round(delta + staked * CFG.comp);
    const x = c ? c.x : BELL.x, y = c ? c.y - 30 : BELL.y;
    if (!net) { G.floats.push({ x, y, text: 'push', color: '#b9ab90', t: 1.6 }); return; }
    G.bank = Math.max(0, G.bank + net);
    G.floats.push({ x, y, text: (net > 0 ? '+' : '') + money(net), color: net > 0 ? '#e8c46a' : '#e8443a', t: 1.6, big: Math.abs(net) > G.bank * 0.1 });
    if (net > 0) G.fx.push({ kind: 'chips', x, y: y + 20, t: 1 });
    checkOver();
  }

  // ---------- Shared rounds: one Crash rocket and one duck race for the whole casino ----------
  function newCrash() { return { phase: 'bet', t: 0, point: Gm.crashPoint(), mult: 1, bets: new Map(), round: G.crash ? G.crash.round + 1 : 1 }; }
  function crashCash(id, b, x) { b.out = x; const c = byId(id); settle(c, b.bet, b.bet * x); if (c.isHuman) tell(c, `Cashed out at ${x.toFixed(2)}x: +${money(b.bet * (x - 1))}`, false, 'coin'); }
  function crashTick(dt) {
    const C = G.crash; C.t += dt;
    if (C.phase === 'bet') {
      for (const s of G.seats) {
        const c = s.occ;
        if (s.game === 'crash' && c && !c.isHuman && c.alive && !C.bets.has(c.id) && C.t > 1 + (c.id % 4)) C.bets.set(c.id, { bet: botBet(), auto: pick([1.3, 1.5, 1.5, 2, 2, 3, 5, 10]), out: 0 });
      }
      if (C.t >= Gm.CRASH.betTime) { C.phase = 'fly'; C.t = 0; }
    } else if (C.phase === 'fly') {
      C.mult = Math.min(Gm.crashAt(C.t), C.point);
      for (const [id, b] of C.bets) if (!b.out && b.auto && b.auto <= C.mult) crashCash(id, b, b.auto);
      if (C.mult >= C.point) {
        C.phase = 'boom'; C.t = 0;
        for (const [id, b] of C.bets) if (!b.out) { settle(byId(id), b.bet, 0); if (byId(id).isHuman) tell(byId(id), `Crashed at ${C.point.toFixed(2)}x. Lost ${money(b.bet)}.`, true); }
      }
    } else if (C.t >= Gm.CRASH.boomTime) G.crash = newCrash();
  }
  function newRace() { const form = Gm.raceForm(); return { phase: 'bet', t: 0, form, winner: Gm.raceWinner(form), seed: Math.floor(Math.random() * 1000), bets: new Map(), round: G.race ? G.race.round + 1 : 1 }; }
  function raceTick(dt) {
    const R = G.race; R.t += dt;
    if (R.phase === 'bet') {
      for (const s of G.seats) {
        const c = s.occ;
        if (s.game === 'race' && c && !c.isHuman && c.alive && !R.bets.has(c.id) && R.t > 2 + (c.id % 6)) {
          R.bets.set(c.id, { duck: pickIdx(R.form.p.map(p => Math.sqrt(p))), bet: botBet() });
        }
      }
      if (R.t >= Gm.RACE.betTime) { R.phase = 'run'; R.t = 0; }
    } else if (R.phase === 'run') {
      if (R.t >= Gm.RACE.runTime) {
        R.phase = 'show'; R.t = 0;
        for (const [id, b] of R.bets) {
          const m = Gm.raceBetMult(R.form, b.duck, R.winner), c = byId(id);
          settle(c, b.bet, b.bet * m);
          if (c.isHuman) tell(c, m ? `${Gm.DUCKS[b.duck].name} wins! You get ${money(b.bet * m)}.` : `${Gm.DUCKS[R.winner].name} wins. Your duck didn't.`, !m, m ? 'coin' : null);
        }
      }
    } else if (R.t >= Gm.RACE.showTime) G.race = newRace();
  }
  function pickIdx(w) { let s = 0; for (const x of w) s += x; let u = Math.random() * s; for (let i = 0; i < w.length; i++) { u -= w[i]; if (u < 0) return i; } return w.length - 1; }
  function botSip(c, d) {
    // A free drink from nobody-knows-who gets a sniff more often than your own order.
    if (d.poisoned && !c.isKiller && Math.random() < D().sniff * (d.from !== null ? 2 : 1)) {
      removeDrink(d);
      callMeeting(c, null, `${c.name} sniffed a free ${d.kind} and smelled bitter almonds. Somebody sent it to kill.`, { drinkId: d.id, owner: c.id, kind: d.kind });
      return;
    }
    sip(c, d);
  }
  // A bot at the security desk spends crew money on cameras or a guard once people start dying.
  function botSecurity(c, dt) {
    c.secT = (c.secT ?? rand(3, 8)) - dt;
    if (c.secT > 0) return;
    c.secT = rand(15, 30);
    if (c.isKiller) return;
    if (!G.security.cams && G.deaths >= 1 && G.bank > price('cams') * 4 && Math.random() < 0.5) buy(c, 'cams');
    else if (!G.guard && G.deaths >= 2 && G.bank > price('guard') * 4 && Math.random() < 0.4) buy(c, 'guard');
  }
  function botTick(c, dt) {
    c.moving = false;
    c.glanceT -= dt;
    if (c.glancing > 0) c.glancing -= dt;
    else if (c.glanceT <= 0) { c.glancing = rand(0.8, 1.8); c.glanceOff = rand(-1, 1) * Math.PI; c.glanceT = rand(...D().glance); }
    if (c.isKiller && killerBrain(c, dt)) { c.look = c.face; return; }
    if (sick(c) && c.state !== 'antidote' && c.state !== 'seated' && G.antidotes > 0 && !c.isKiller) { c.path = []; c.state = 'idle'; }
    switch (c.state) {
      case 'idle': botChoose(c); break;
      case 'getDrink':
        if (followPath(c, dt, CFG.botSpeed)) { c.face = -Math.PI / 2; c.wait += dt; if (c.wait > 1.2) { c.wait = 0; pourFor(c); c.state = 'idle'; maybeTreat(c); } }
        break;
      case 'antidote':
        if (followPath(c, dt, CFG.botSpeed * 1.2)) {
          const kind = c.poisonKind, what = c.poisonDrink; c.state = 'idle';
          if (takeAntidote(c)) callMeeting(c, null, `${c.name} was poisoned by their ${kind} and only just made it to the antidote.`, { owner: c.id, drinkId: what, kind });
        }
        break;
      case 'snack':
        if (followPath(c, dt, CFG.botSpeed)) {
          const b = c.target, trap = trapAt('bowl', b.id); c.state = 'idle'; c.target = null;
          if (trap && !c.isKiller && Math.random() < D().sniff) {
            removeTrap(trap); callMeeting(c, null, `${c.name} smelled bitter almonds on the pretzels. Someone laced the snack bowl.`, { trap: 'the snack bowl' });
          } else if (!(trap && c.isKiller)) eatSnack(c, b);
        }
        break;
      case 'rest': case 'wander':
        if (followPath(c, dt, CFG.botSpeed)) { c.wait += dt; if (c.wait > (c.state === 'rest' ? 5 : 2)) { c.wait = 0; c.state = 'idle'; } }
        break;
      case 'toSeat': {
        const s = c.target;
        if (s.occ && s.occ !== c) { s.claim = null; c.state = 'idle'; break; }
        if (followPath(c, dt, CFG.botSpeed)) {
          // careful gamblers check the machine first, more so once people have died
          if (!c.isKiller && s.game !== 'cams' && Math.random() < D().sniff * (G.deaths ? 1.6 : 0.5)) { c.state = 'inspect'; c.inspectT = CFG.inspectTime; break; }
          sit(c, s); c.sitT = rand(22, 45); c.gameT = rand(1, 3); c.state = 'seated'; c.secT = rand(3, 8);
        }
        break;
      }
      case 'inspect': {
        const s = c.target; c.inspectT -= dt;
        if (s.occ && s.occ !== c) { c.state = 'idle'; break; }
        if (c.inspectT <= 0) {
          const trap = trapAt('seat', s.id);
          if (trap) { removeTrap(trap); s.claim = null; c.state = 'idle'; callMeeting(c, null, `${c.name} checked ${trap.label} and found it rigged to kill.`, { trap: trap.label }); break; }
          sit(c, s); c.sitT = rand(22, 45); c.gameT = rand(1, 3); c.state = 'seated'; c.secT = rand(3, 8);
        }
        break;
      }
      case 'seated': {
        c.face = c.seat.face; c.sitT -= dt; c.gameT -= dt;
        if (c.gameT <= 0) botPlay(c);
        if (c.seat.game === 'cams') botSecurity(c, dt);
        if (c.sitT <= 0 || (!c.drink && c.thirst < 35) || (sick(c) && G.antidotes > 0 && !c.isKiller)) { standUp(c); c.state = 'idle'; }
        break;
      }
    }
    if (c.drink && c.thirst < 70) { c.sipT -= dt; if (c.sipT <= 0) { c.sipT = rand(5, 10); if (c.drink) botSip(c, c.drink); } }
    c.look = c.face + (c.glancing > 0 ? c.glanceOff : 0);
  }
  // Now and then a bot at the bar buys someone a round. It gives cover to the killers' poisoned orders.
  function maybeTreat(c) {
    if (Math.random() > CFG.treat) return;
    const friends = G.chars.filter(o => o.alive && o !== c && !o.drink);
    if (friends.length) sendDrink(c, pick(friends), false);
  }
  // True while the bot killer is busy hunting (skips the gambler routine).
  function killerBrain(k, dt) {
    if (k.hunt) {
      const h = k.hunt; h.t -= dt; h.repath -= dt;
      let goal = null, ready = false, tgt = null;
      if (h.kind === 'blade' || h.kind === 'push') {
        const v = tgt = byId(h.victim);
        if (!v.alive || (h.kind === 'push' && rectDist(v, POND) >= CFG.pondReach)) return endHunt(k);
        goal = h.kind === 'blade' ? { x: v.x - Math.cos(v.look) * 26, y: v.y - Math.sin(v.look) * 26 } : v;
        ready = dist(k, v) < CFG.reach && (h.kind === 'push' || behind(k, v));
      } else if (h.kind === 'chandelier') {
        const ch = tgt = G.chandeliers.find(c => c.id === h.ch);
        if (ch.state !== 'up' || !underChandelier(ch).length) return endHunt(k);
        goal = h.spot; ready = dist(k, h.spot) < 30;
      } else if (h.kind === 'rig') {
        const t = tgt = h.target;
        if (trapAt(t.kind, t.id) || (t.kind === 'seat' && (G.seats[t.id].occ || (G.seats[t.id].claim !== null && G.seats[t.id].claim !== k.id)))) return endHunt(k);
        goal = t; ready = dist(k, t) < CFG.reach + 10;
      } else {
        if (!byId(h.victim).alive) return endHunt(k);
        goal = h.spot; tgt = TAP; ready = dist(k, TAP) < 80;
      }
      if (!ready) {
        if (h.repath <= 0 || !k.path.length) { h.repath = 0.8; setGoal(k, goal); }
        followPath(k, dt, CFG.botSpeed * (h.kind === 'blade' ? 1.15 : 1));
      } else {
        k.face = Math.atan2(tgt.y - k.y, tgt.x - k.x);
        const victim = h.kind === 'blade' || h.kind === 'push' ? byId(h.victim) : null;
        // ordering a drink is not suspicious in itself; a careless killer misses one pair of eyes for the whole attempt
        if (witnessesOf(k, victim).length <= (h.kind === 'order' ? 1 : 0) + (h.blind ? 1 : 0)) {
          let done = false;
          if (h.kind === 'blade') done = doBlade(k, victim);
          else if (h.kind === 'push' || h.kind === 'chandelier') done = doAccident(k);
          else if (h.kind === 'rig') done = doRig(k, h.target);
          else done = doOrder(k, byId(h.victim));
          if (done && victim && k.cd.disguise <= 0 && Math.random() < 0.5) doDisguise(k);
          if (done || h.kind !== 'blade') return endHunt(k);
        }
        h.linger += dt;
      }
      if (h.t <= 0 || h.linger > 5) return endHunt(k);
      return true;
    }
    k.huntT -= dt;
    if (k.huntT > 0) return false;
    k.huntT = rand(4, 8);
    const prey = gamblersAlive(), plans = [];
    if (k.cd.blade <= 0) {
      // seated gamblers have their backs to the room; loners have nobody watching
      const open = prey.filter(v => v.seat || !G.chars.some(o => o.alive && o !== v && !o.isKiller && canSee(o, v)));
      if (open.length) plans.push([3, { kind: 'blade', victim: pick(open).id }]);
    }
    if (k.cd.accident <= 0) {
      const pv = prey.filter(v => rectDist(v, POND) < CFG.pondReach);
      if (pv.length) plans.push([2, { kind: 'push', victim: pick(pv).id }]);
      const chs = G.chandeliers.filter(ch => ch.state === 'up' && underChandelier(ch).length);
      if (chs.length) { const ch = pick(chs); plans.push([1 + underChandelier(ch).length, { kind: 'chandelier', ch: ch.id, spot: chandelierSpot(ch) }]); }
    }
    if (k.cd.rig <= 0) {
      const crowd = roomCrowd(k);
      const seats = G.seats.filter(s => !s.occ && s.claim === null && s.game !== 'vip' && s.game !== 'cams' && !trapAt('seat', s.id));
      if (seats.length) { const s = seats[pickIdx(seats.map(s => 0.2 + (crowd[roomOf(s)] || 0)))]; plans.push([2, { kind: 'rig', target: { kind: 'seat', id: s.id, x: s.x, y: s.y, label: RIG_LABEL[s.game] || GAME_NAMES[s.game] } }]); }
      const b = pick(G.bowls); if (!trapAt('bowl', b.id)) plans.push([0.5, { kind: 'rig', target: { kind: 'bowl', id: b.id, x: b.x, y: b.y, label: 'the snack bowl' } }]);
    }
    if (k.cd.order <= 0 && prey.length) plans.push([2, { kind: 'order', victim: pick(prey).id, spot: { x: TAP.x + rand(-60, 60), y: TAP.y + 30 } }]);
    if (!plans.length || Math.random() < 0.25) return false;
    const plan = plans[pickIdx(plans.map(p => p[0]))][1];
    if (k.seat) standUp(k);
    if (k.target && k.target.claim === k.id) k.target.claim = null;
    k.state = 'hunting'; k.path = [];
    k.hunt = Object.assign(plan, { t: plan.kind === 'order' ? 35 : 20, linger: 0, repath: 0, blind: Math.random() < D().careless });
    if ((plan.kind === 'blade' || plan.kind === 'push') && k.cd.lights <= 0 && Math.random() < 0.3) doLights(k);
    return true;
  }
  function endHunt(k) { k.hunt = null; k.state = 'idle'; return false; }
  const underChandelier = ch => G.chars.filter(v => v.alive && !v.isKiller && dist(v, ch) < CFG.chandelierRadius * 0.85);
  function chandelierSpot(ch) {
    for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2, p = { x: ch.x + Math.cos(a) * 115, y: ch.y + Math.sin(a) * 115 }; if (clear(p) && roomOf(p) === roomOf(ch)) return p; }
    return { x: ch.x + 115, y: ch.y };
  }

  // ---------- What everyone remembers ----------
  function observe() {
    for (const v of G.chars) {
      if (!v.alive) continue;
      for (const c of G.chars) {
        if (c === v || !c.alive || !canSee(v, c)) continue;
        const a = appearAs(c);
        const room = roomOf(c);
        v.lastSeen[a.id] = { t: G.t, room, with: G.chars.filter(o => o !== c && o !== v && o.alive && dist(o, c) < 90).map(o => appearAs(o).id) };
        const log = v.seenLog[a.id] || (v.seenLog[a.id] = []), le = log[log.length - 1];
        if (!le || le.room !== room || G.t - le.t > 5) { log.push({ t: G.t, room }); if (log.length > 40) log.shift(); }
        for (const b of G.bowls) {
          if (dist(c, b) > 40) continue;
          const key = a.id + ':bowl' + b.id + ':' + Math.floor(G.t / 30);
          (v.touches['bowl' + b.id] || (v.touches['bowl' + b.id] = new Set())).add(a.id);
          if (v.isHuman && !v.notes.some(n => n.key === key)) note(v, `${a.name} was at the snack bowl in ${ROOMS[roomOf(b)].name}.`, { key, who: a.id });
        }
      }
      for (const b of G.bodies) {
        if (b.reported || !canSee(v, b)) continue;
        if (v.isHuman) { b.seenBy.add(v.id); continue; }
        if (v.isKiller && Math.random() > 0.15) continue;
        if (!G.pending) G.pending = { t: 0.5, caller: v, body: b };
      }
    }
    // the guard reports a body or a kill straight away
    if (G.guard && !G.pending) {
      const b = G.bodies.find(b => !b.reported && canSee(G.guard, b));
      if (G.guardSaw || b) G.pending = { t: 0.3, guard: true, body: b || null };
    }
  }
  // Ghosts can haunt one living person a round: a cold chill that makes the bots near them uneasy.
  function haunt(g, target) {
    if (g.alive || g.hauntUsed || !target || !target.alive) return false;
    g.hauntUsed = true;
    G.haunts.push({ by: g.id, on: target.id, t: CFG.hauntTime });
    for (const o of G.chars) {
      if (!o.alive || o === target || dist(o, target) > CFG.viewRange || !los(o, target)) continue;
      if (o.isHuman) tell(o, `A chill runs through the room. The candles around ${appearAs(target).name} flicker.`, false, 'lights');
      else if (!o.isKiller) o.sus[target.id] += CFG.hauntSus;
    }
    if (target.isHuman) tell(target, 'Something cold brushes your neck.', true, 'gasp');
    return true;
  }
  function botGhost(g) {
    if (g.hauntUsed || g.isKiller || Math.random() > 0.01) return;
    let t = g.killedBy !== null && g.killedBy !== undefined ? byId(g.killedBy) : null;
    if (!t || !t.alive) { const top = Object.entries(g.sus).filter(([id]) => byId(id).alive && +id !== g.id).sort((x, y) => y[1] - x[1])[0]; t = top && top[1] > 30 ? byId(top[0]) : null; }
    if (t) haunt(g, t);
  }

  // ---------- Meetings ----------
  function callMeeting(caller, body, reason, spiked) {
    if (G.mode !== 'play') return;
    G.mode = 'meeting'; G.pending = null; G.stats.meetings++;
    const victims = G.bodies.filter(b => !b.reported);
    victims.forEach(b => { b.reported = true; });
    for (const c of G.chars) { c.voted = null; c.accused = false; c.inspect = null; if (c.disguise) c.disguise.t = 0; }
    // the guard's word counts for a lot with everyone who isn't in on it
    const gs = G.guardSaw;
    if (gs) for (const c of G.chars) if (c.alive && !c.isKiller && c.id !== gs.who) c.sus[gs.who] += 200;
    G.guardSaw = null;
    G.meeting = {
      title: body ? 'Body reported' : spiked ? 'Murder plot!' : gs ? 'Security report' : 'Emergency meeting', reason,
      lines: [], extra: [], phase: 'talk', talkT: 0.6, voteT: CFG.voteTime, resultT: CFG.resultTime,
      result: '', tally: null, victims: victims.map(v => v.id),
    };
    talk.open(G.meeting, victims, spiked, caller);
    for (const h of humans()) sfxTo(h, 'meeting');
  }
  function guardMeeting(body) {
    const gs = G.guardSaw;
    const what = gs ? `The security guard saw ${byId(gs.who).name} ${gs.phrase}.` : '';
    const found = body ? `The security guard found ${byId(body.id).name}'s body.` : '';
    callMeeting(null, body, [found, what].filter(Boolean).join(' '), null);
  }
  function trust(listener, speaker) {
    if (listener === speaker) return 0;
    if (listener.witnessed.some(w => w.who === speaker.id)) return 0;
    return clamp(0.6 - listener.sus[speaker.id] / 200, 0, 0.8);
  }
  const talk = makeTalk(G, { byId, trust, humans, sfxTo, tell, GAME_NAMES });
  // Lines come one at a time; longer ones stay up longer.
  function pushLine(m, l) {
    m.lines.push({ who: l.who, text: l.text, emo: l.emo || 'calm' });
    if (l.acc && Object.keys(l.acc).length) m.extra.push({ who: l.who, acc: l.acc });
    m.talkT = clamp(0.35 + l.text.length / 60, 0.8, 3) * CFG.talkGap / 0.9;
    for (const h of humans()) sfxTo(h, 'chat');
  }
  function meetingTick(dt) {
    const m = G.meeting;
    m.talkT -= dt;
    if (m.phase === 'talk') {
      if (m.talkT > 0) return;
      const l = talk.next(m);
      if (l) pushLine(m, l); else { m.phase = 'vote'; talk.startVote(m); }
      return;
    }
    if (m.phase === 'vote') {
      m.voteT -= dt;
      talk.voteTick(m, dt);
      if (m.talkT <= 0) { const l = talk.next(m, true); if (l) pushLine(m, l); }
      if (m.voteT <= 0 || talk.allVoted()) resolveVotes();
      return;
    }
    m.resultT -= dt;
    if (m.talkT <= 0) { const l = talk.next(m, true); if (l) pushLine(m, l); }
    if (m.resultT <= 0) endMeeting();
  }
  function resolveVotes() {
    const m = G.meeting; m.phase = 'result';
    const alive = G.chars.filter(c => c.alive);
    for (const b of alive) if (!b.isHuman && b.voted === null) b.voted = talk.decide(b);
    for (const b of alive.filter(c => !c.isHuman)) for (const st of m.extra) for (const id in st.acc) if (+id !== b.id && byId(st.who)) b.sus[id] += st.acc[id] * trust(b, byId(st.who)) * 0.3;
    const tally = {}; let skips = 0;
    for (const c of alive) { if (c.voted !== null && c.voted >= 0 && byId(c.voted).alive) tally[c.voted] = (tally[c.voted] || 0) + 1; else skips++; }
    const sorted = Object.entries(tally).sort((x, y) => y[1] - x[1]);
    let ej = null;
    if (sorted.length && sorted[0][1] > skips && !(sorted[1] && sorted[1][1] === sorted[0][1])) ej = byId(sorted[0][0]);
    m.tally = tally; m.skips = skips;
    if (!ej) m.result = `No one was thrown out (${skips} skipped).`;
    else {
      ej.alive = false; ej.ejected = true;
      if (ej.seat) { ej.seat.occ = null; ej.seat = null; }
      const left = killersAlive().length;
      m.ejected = ej.id; m.ejectedKiller = ej.isKiller;
      m.result = ej.isKiller
        ? `${ej.name} got thrown out by security. ${ej.name} WAS ${G.killerIds.length > 1 ? 'a' : 'the'} killer.${left ? ` ${left} killer remains.` : ''}`
        : `${ej.name} got thrown out by security. ${ej.name} was NOT ${G.killerIds.length > 1 ? 'a' : 'the'} killer.`;
      if (ej.isHuman) tell(ej, "Security threw you out. You're a ghost now.", true);
    }
    talk.after(m, ej);
    m.talkT = 1.2; m.resultT = CFG.resultTime + m.talk.replies.length * 1.8;
    for (const h of humans()) sfxTo(h, ej ? (ej.isKiller ? 'cheer' : 'boo') : 'chat');
  }
  function endMeeting() {
    const msg = G.meeting.result;
    G.bodies = [];
    const alive = G.chars.filter(c => c.alive);
    alive.forEach((c, i) => {
      if (c.seat) { c.seat.occ = null; c.seat = null; }
      const a = i / alive.length * Math.PI * 2, rr = ringRadius(alive.length);
      c.x = BELL.x + Math.cos(a) * rr; c.y = BELL.y + Math.sin(a) * rr; c.face = c.look = a + Math.PI; c.posVer++;
      c.state = 'idle'; c.path = []; c.hunt = null; c.cd.blade = Math.max(c.cd.blade, 15);
    });
    for (const c of G.chars) { c.hauntUsed = false; if (!c.alive && c.isHuman) { c.x = BELL.x; c.y = BELL.y - 70; c.posVer++; } }
    G.haunts = [];
    G.seats.forEach(s => { s.claim = null; });
    G.mode = 'play'; G.meeting = null;
    tellAll(msg);
    checkOver();
  }

  // ---------- Win ----------
  function checkOver() {
    if (G.over) return;
    const k = killersAlive().length, g = gamblersAlive().length;
    const kn = nameList(G.killerIds.map(id => byId(id).name));
    const was = G.killerIds.length > 1 ? 'were the killers' : 'was the killer';
    let killersWin = null, text = '';
    if (!k) { killersWin = false; text = `${kn} ${was}, and security dragged ${G.killerIds.length > 1 ? 'them' : 'them'} out.`; }
    else if (k >= g) { killersWin = true; text = `${kn} ${was}. Last call came for everyone.`; }
    else if (G.closed) { killersWin = true; text = `Closing time. The crew never broke the bank, and ${kn} walked out free.`; }
    else if (G.bank >= G.target) { killersWin = false; text = `The crew broke the bank with ${money(G.bank)}. ${kn} ${was}, and it didn't matter.`; }
    if (killersWin === null) return;
    if (G.mode === 'meeting' && G.meeting.phase !== 'result') return;
    G.over = { killersWin, text, killers: G.killerIds.slice(), t: G.t, stats: Object.assign({}, G.stats) };
    for (const h of humans()) sfxTo(h, (killersWin === h.isKiller) ? 'win' : 'lose');
  }

  // ---------- Security: bought with crew-bank money at the security desk ----------
  const price = item => Gm.niceDown(G.target * CFG[item + 'Price']);
  function buy(c, item) {
    const p = price(item);
    if ((item === 'cams' && G.security.cams) || (item === 'guard' && G.guard)) return tell(c, item === 'cams' ? 'The cameras are already on.' : 'The guard is already on patrol.');
    if (G.bank < p * 2) return tell(c, `The crew bank can't spare ${money(p)} right now.`);
    G.bank -= p;
    G.floats.push({ x: c.x, y: c.y - 30, text: '-' + money(p), color: '#e8443a', t: 1.6 });
    const who = appearAs(c).name;
    if (item === 'cams') { G.security.cams = true; tellAll(`${who} switched on the security cameras (${money(p)} from the crew bank). Whoever sits at the security desk can watch one room at a time.`, false, 'coin'); }
    else {
      const sp = { x: c.x + 60, y: c.y };
      G.guard = { id: -1, isGuard: true, alive: true, name: 'the guard', x: sp.x, y: sp.y, face: 0, look: 0, path: [], t: CFG.guardTime, stuckT: 0, stalls: 0, lastPos: { x: 0, y: 0 }, wait: 0, moving: false };
      tellAll(`${who} hired a security guard for ${CFG.guardTime / 60} minutes (${money(p)} from the crew bank). The guard reports anything they see.`, false, 'coin');
    }
    return true;
  }
  const FEEDS = ['floor', 'bar', 'arcade', 'race', 'slots', 'alley', 'vip'];
  function guardTick(dt) {
    const g = G.guard; g.t -= dt; g.moving = false;
    if (g.t <= 0) { G.guard = null; tellAll("The security guard's shift is over."); return; }
    if (followPath(g, dt, CFG.guardSpeed)) { g.wait += dt; if (g.wait > 3) { g.wait = 0; setGoal(g, openSpot(ROOMS[pick(FEEDS)])); } }
    g.look = g.face + Math.sin(G.t * 1.3) * 0.9; // the guard sweeps the room
  }

  // ---------- Human actions ----------
  function nearest(list, p, max) { let best = null, bd = max; for (const o of list) { const d = dist(o, p); if (d < bd) { bd = d; best = o; } } return best; }
  function contextFor(c) {
    if (!c.alive || G.mode !== 'play') return null;
    const body = G.bodies.find(b => !b.reported && dist(b, c) < 90 && canSee(c, b));
    if (body) return { label: 'Report body', act: () => callMeeting(c, body, `${c.name} found ${byId(body.id).name}'s body.`) };
    if (c.seat) return { label: 'Stand up', act: () => standUp(c) };
    if (dist(c, TAP) < 90) {
      if (c.poisonT > 0 && G.antidotes > 0) return { label: `Take the antidote (${G.antidotes} left)`, act: () => takeAntidote(c) };
      if (!c.drink) return { label: 'Order a drink', act: () => { pourFor(c); tell(c, `One ${c.drink.kind}, on the house.`); } };
    }
    if (dist(c, BELL) < 60 && !c.bellUsed) return { label: 'Ring the pit bell', act: () => { c.bellUsed = true; callMeeting(c, null, `${c.name} rang the pit bell.`); } };
    const seat = G.seats.find(s => !s.occ && dist(s, c) < 45);
    if (seat) return { label: `Sit at ${GAME_NAMES[seat.game]}`, act: () => sit(c, seat) };
    const bowl = G.bowls.find(b => dist(b, c) < CFG.reach + 5);
    if (bowl && !c.lucky) return { label: 'Eat a pretzel', act: () => eatSnack(c, bowl) };
    return null;
  }
  // Inspect: what's within reach to check (your drink, a machine you're at or next to, a snack bowl).
  function inspectTarget(c) {
    if (c.drink) return { kind: 'drink', d: c.drink };
    const s = c.seat || nearest(G.seats.filter(s => !s.occ && s.game !== 'cams' && s.game !== 'vip'), c, CFG.reach + 20);
    if (s) return { kind: 'seat', s };
    const b = nearest(G.bowls, c, CFG.reach + 10);
    return b ? { kind: 'bowl', b } : null;
  }
  function finishInspect(c, x) {
    if (x.kind === 'drink') {
      if (!G.drinks.includes(x.d)) return;
      if (x.d.poisoned) { tell(c, `Bitter almonds. Your ${x.d.kind} is POISONED.${x.d.from !== null ? ' It came from the bar, "on the house".' : ''}`, true, 'poison'); if (!c.isKiller) note(c, `Your ${x.d.kind} was poisoned${x.d.from !== null ? ', sent from the bar' : ''}.`, { hard: true }); }
      else tell(c, `Smells like a perfectly normal ${x.d.kind}.`);
    } else if (x.kind === 'seat') {
      const trap = trapAt('seat', x.s.id);
      if (trap) { removeTrap(trap); tell(c, `A wire where no wire should be: ${trap.label} was rigged to kill. You pulled it out.`, true, 'poison'); if (!c.isKiller) note(c, `${trap.label[0].toUpperCase() + trap.label.slice(1)} was rigged. You disarmed it.`, { hard: true }); }
      else tell(c, `${(RIG_LABEL[x.s.game] || GAME_NAMES[x.s.game]).replace(/^the /, 'The ')} looks fine.`);
    } else {
      const trap = trapAt('bowl', x.b.id);
      if (trap) { removeTrap(trap); tell(c, 'Bitter almonds. These pretzels are POISONED. You tipped them out.', true, 'poison'); if (!c.isKiller) note(c, 'The snack bowl was poisoned.', { hard: true }); }
      else tell(c, 'Just salty pretzels.');
    }
  }
  const living = id => { const o = byId(id); return o && o.alive ? o : null; };
  function action(id, k, arg) {
    const c = byId(id); if (!c || !c.isHuman) return;
    if (G.mode === 'meeting') {
      const m = G.meeting;
      if (k === 'chat' && c.alive && typeof arg === 'string') {
        const text = arg.replace(/\s+/g, ' ').trim().slice(0, 140);
        if (text) { m.lines.push({ who: c.id, text, emo: 'calm' }); for (const h of humans()) sfxTo(h, 'chat'); if (m.phase !== 'result') talk.hear(m, c, text); }
      }
      if (m.phase === 'result' || !c.alive) return;
      if (k === 'vote' && c.voted === null && (arg === -1 || (byId(arg) && byId(arg).alive && arg !== c.id))) c.voted = arg;
      if (k === 'accuse' && !c.accused && byId(arg) && byId(arg).alive && arg !== c.id) {
        c.accused = true; m.lines.push({ who: c.id, text: `I think it's ${byId(arg).name}.`, emo: 'anger' }); talk.hear(m, c, `${byId(arg).name} is the killer`);
      }
      return;
    }
    if (G.mode !== 'play') return;
    if (k === 'haunt' && !c.alive) {
      if (c.hauntUsed) return tell(c, 'You can haunt again after the next meeting.');
      if (!haunt(c, living(arg))) tell(c, 'Pick someone alive to haunt.');
      return;
    }
    if (k === 'use') { const x = contextFor(c); if (x) x.act(); return; }
    if (!c.alive) return;
    if (k === 'sip') {
      if (c.drink) sip(c, c.drink); else tell(c, 'You have nothing to drink. The bar is in the north-west corner.');
    } else if (k === 'sniff' || k === 'inspect') {
      const x = inspectTarget(c);
      if (x) { c.inspect = Object.assign(x, { t: CFG.inspectTime }); tell(c, x.kind === 'drink' ? 'Sniffing... hold still.' : 'Checking it over... hold still.'); } else tell(c, 'Nothing within reach to check.');
    } else if (k === 'pour') {
      if (c.drink) { const d = c.drink; removeDrink(d); tell(c, `You poured out your ${d.kind}.`, false, 'pour'); }
    } else if (k === 'antidote') {
      if (dist(c, TAP) > 90) tell(c, 'The antidote is behind the bar.'); else if (!takeAntidote(c)) tell(c, c.poisonT > 0 ? 'The antidote is gone.' : "You don't need it. Yet.");
    } else if (k === 'send') {
      const to = living(arg);
      if (dist(c, TAP) > 90) tell(c, 'Drinks are sent from the bar.'); else if (!to || to === c) tell(c, 'Pick someone to send a drink to.'); else sendDrink(c, to, false);
    } else if (k === 'feed' && c.seat && c.seat.game === 'cams' && G.security.cams && FEEDS.includes(arg)) {
      G.security.feed = arg; G.security.feedT = 12;
    } else if (k === 'buy' && (arg === 'cams' || arg === 'guard')) {
      if (!c.seat || c.seat.game !== 'cams') tell(c, 'Security is bought at the security desk.'); else buy(c, arg);
    } else if (k === 'bank' && (c.seat || G.t - (c.leftSeatT ?? -99) < 8) && c.alive && arg && isFinite(arg.d) && isFinite(arg.b)) {
      // a finished round at a table: d is what came back minus the stake, b the stake (doubles and splits count)
      const b = clamp(arg.b, 0, Gm.maxBet(G.bank) * 6);
      addBank(clamp(arg.d, -b, b * Gm.MAX_MULT), c, b);
    } else if (k === 'crash' && c.seat && c.seat.game === 'crash' && G.crash.phase === 'bet' && !G.crash.bets.has(c.id) && arg && isFinite(arg.bet)) {
      const auto = isFinite(arg.auto) && arg.auto >= 1.01 ? Math.min(arg.auto, Gm.CRASH.cap) : 0;
      G.crash.bets.set(c.id, { bet: Gm.clampBet(arg.bet, G.bank), auto, out: 0 }); sfxTo(c, 'chip');
    } else if (k === 'cashout' && G.crash.phase === 'fly') {
      const b = G.crash.bets.get(c.id); if (b && !b.out) crashCash(c.id, b, G.crash.mult);
    } else if (k === 'race' && c.seat && c.seat.game === 'race' && G.race.phase === 'bet' && !G.race.bets.has(c.id) && arg && isFinite(arg.bet) && arg.duck >= 0 && arg.duck < Gm.DUCKS.length) {
      G.race.bets.set(c.id, { duck: arg.duck | 0, bet: Gm.clampBet(arg.bet, G.bank) }); sfxTo(c, 'chip');
    } else if (c.isKiller && KILLS.concat(['disguise', 'lights']).includes(k)) {
      if (c.cd[k] > 0) return tell(c, `Ready in ${Math.ceil(c.cd[k])}s.`);
      if (k === 'order') {
        const v = living(arg);
        if (dist(c, TAP) > 90) tell(c, 'Poisoned drinks are ordered at the bar.');
        else if (!v || v.isKiller) tell(c, 'Pick a gambler to send it to.');
        else doOrder(c, v);
      } else if (k === 'rig') { const t = rigTarget(c); if (!t) tell(c, 'Get next to an empty seat, a machine or a snack bowl.'); else doRig(c, t); }
      else if (k === 'blade') {
        const v = nearest(G.chars.filter(o => o.alive && o !== c && !o.isKiller), c, CFG.reach + 5);
        if (v) doBlade(c, v); else tell(c, 'Get right behind someone.');
      } else if (k === 'accident') { if (!doAccident(c)) tell(c, 'Get next to someone by the duck pond, or under a chandelier\'s chain (stand near one with someone under it).'); }
      else if (k === 'disguise') doDisguise(c);
      else if (!doLights(c)) tell(c, `Lights out ready in ${Math.ceil(c.cd.lights)}s.`);
    }
  }
  function setInput(id, inp) {
    const c = byId(id); if (!c || !c.isHuman || !inp) return;
    if (inp.posVer !== c.posVer) return; // client hasn't caught up with a teleport yet
    if (!c.seat && typeof inp.x === 'number' && typeof inp.y === 'number' && isFinite(inp.x) && isFinite(inp.y)) {
      if (c.inspect && c.inspect.kind !== 'drink' && dist(c, inp) > 3) { c.inspect = null; tell(c, 'Interrupted.'); }
      c.x = clamp(inp.x, 0, W); c.y = clamp(inp.y, 0, H);
      if (c.alive) collide(c);
    }
    c.moving = !!inp.moving;
    if (typeof inp.look === 'number' && isFinite(inp.look)) c.look = c.face = inp.look;
    if (c.seat) { c.face = c.seat.face; if (typeof inp.look !== 'number') c.look = c.seat.face + (inp.lookBack ? Math.PI : 0); } // seated humans turn their head freely
  }
  function humanTick(c, dt) {
    if (c.inspect) { c.inspect.t -= dt; if (c.inspect.t <= 0) { const x = c.inspect; c.inspect = null; finishInspect(c, x); } }
  }
  function dropHuman(id) {
    const c = byId(id); if (!c || !c.isHuman) return;
    c.isHuman = false; c.netKey = null; c.path = []; c.inspect = null;
    if (c.seat) { c.state = 'seated'; c.sitT = rand(5, 15); c.gameT = 2; } else c.state = 'idle';
    tellAll(`${c.name} left. A bot took their seat.`);
  }

  // ---------- Tick ----------
  const sick = c => c.poisonT > 0 && CFG.poisonDelay - c.poisonT > CFG.sickAfter;
  function tick(dt) {
    if (G.over) { G.t += dt; return; }
    if (G.mode === 'meeting') { meetingTick(dt); return; }
    G.t += dt;
    if (G.lightsT > 0) G.lightsT -= dt;
    if (!G.warned && G.t > CFG.closingTime - CFG.closingWarn) { G.warned = true; tellAll(`Last call! The casino closes in ${CFG.closingWarn / 60} minutes. Break the bank or catch the killer.`, true, 'meeting'); }
    if (G.t >= CFG.closingTime) { G.closed = true; checkOver(); if (G.over) return; }
    const S = G.security;
    if (S.cams && (S.feedT -= dt) <= 0) { S.feedT = 4; S.feed = FEEDS[(FEEDS.indexOf(S.feed) + 1) % FEEDS.length]; }
    for (const c of G.chars) {
      if (!c.alive) { if (!c.isHuman) botGhost(c); continue; }
      for (const k in c.cd) c.cd[k] = Math.max(0, c.cd[k] - dt);
      c.thirst = Math.max(0, c.thirst - CFG.thirstDrain * dt);
      if (c.lucky > 0) c.lucky = Math.max(0, c.lucky - dt);
      if (c.disguise && c.disguise.t > 0 && (c.disguise.t -= dt) <= 0) tell(c, 'Your disguise slipped. You look like yourself again.');
      if (c.trapT > 0 && (c.trapT -= dt) <= 0) { kill(c, 'trap', byId(c.trapBy)); continue; }
      if (c.poisonT > 0) {
        c.poisonT -= dt;
        if (c.poisonT <= 0) { kill(c, 'poison', byId(c.poisonBy)); continue; }
        if (!c.sickTold && sick(c)) { c.sickTold = true; tell(c, G.antidotes > 0 ? `You feel sick. Poison! Get the antidote at the bar in ${Math.floor(c.poisonT)} seconds.` : 'You feel sick. Poison, and the antidote is gone.', true, 'poison'); }
      }
      if (c.isHuman) humanTick(c, dt); else botTick(c, dt);
      const room = roomOf(c), tr = c.trail; if (tr[tr.length - 1].room !== room) { tr.push({ t: G.t, room }); if (tr.length > 60) tr.shift(); }
      if (c.drink) { c.drink.x = c.x + Math.cos(c.face + 0.9) * 16; c.drink.y = c.y + Math.sin(c.face + 0.9) * 16; }
      if (G.mode !== 'play') break;
    }
    if (G.mode !== 'play') return;
    for (const ch of G.chandeliers) if (ch.state === 'falling' && (ch.t -= dt) <= 0) { dropChandelier(ch); if (G.over) return; }
    if (G.guard) guardTick(dt);
    for (const h of G.haunts) h.t -= dt;
    G.haunts = G.haunts.filter(h => h.t > 0);
    crashTick(dt); raceTick(dt);
    G.obsT -= dt; if (G.obsT <= 0) { G.obsT = 0.25; observe(); }
    if (G.pending) {
      G.pending.t -= dt;
      if (G.pending.t <= 0) {
        const { caller, body, guard } = G.pending; G.pending = null;
        if (guard) guardMeeting(body);
        else if (caller.alive && G.mode === 'play') callMeeting(caller, body, `${caller.name} found ${byId(body.id).name}'s body.`);
      }
    }
    for (const f of G.floats) { f.t -= dt; f.y -= 18 * dt; }
    G.floats = G.floats.filter(f => f.t > 0);
    for (const f of G.fx) f.t -= dt;
    G.fx = G.fx.filter(f => f.t > 0);
  }

  // ---------- Views ----------
  function pubView() {
    const m = G.meeting;
    return {
      t: G.t, mode: G.mode, bank: G.bank, target: G.target, closeT: Math.max(0, Math.ceil(CFG.closingTime - G.t)), lightsT: G.lightsT, nk: G.killerIds.length,
      chars: G.chars.map(c => { const a = appearAs(c); return { id: c.id, name: a.name, color: a.color, hat: a.hat, x: Math.round(c.x), y: Math.round(c.y), look: +c.look.toFixed(2), face: +c.face.toFixed(2),
        alive: c.alive, ejected: !!c.ejected, seat: c.seat ? c.seat.id : null, moving: c.moving, pale: sick(c), human: c.isHuman, lucky: c.lucky > 0, inspecting: !!c.inspect }; }),
      drinks: G.drinks.map(d => ({ id: d.id, owner: d.owner, holder: d.holder, x: Math.round(d.x), y: Math.round(d.y), sips: d.sips, color: d.color, kind: d.kind })),
      bodies: G.bodies.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), cause: b.cause })),
      bowls: G.bowls.map(b => ({ id: b.id, x: b.x, y: b.y })),
      chandeliers: G.chandeliers.map(ch => ({ id: ch.id, x: ch.x, y: ch.y, state: ch.state, t: +ch.t.toFixed(2) })),
      guard: G.guard && { x: Math.round(G.guard.x), y: Math.round(G.guard.y), look: +G.guard.look.toFixed(2), moving: G.guard.moving, t: Math.ceil(G.guard.t) },
      haunts: G.haunts.map(h => ({ on: h.on, t: +h.t.toFixed(2) })),
      security: { cams: G.security.cams, feed: G.security.cams ? G.security.feed : null, camsPrice: price('cams'), guardPrice: price('guard') }, antidotes: G.antidotes,
      floats: G.floats.map(f => ({ x: Math.round(f.x), y: Math.round(f.y), text: f.text, color: f.color, t: +f.t.toFixed(2), big: !!f.big })),
      fx: G.fx.map(f => ({ kind: f.kind, x: Math.round(f.x), y: Math.round(f.y), t: +f.t.toFixed(2) })),
      seatsOcc: G.seats.map(s => s.occ ? s.occ.id : null), maxBet: Gm.maxBet(G.bank),
      crash: { phase: G.crash.phase, t: +G.crash.t.toFixed(2), mult: G.crash.mult, point: G.crash.phase === 'boom' ? G.crash.point : null, round: G.crash.round,
        bets: [...G.crash.bets].map(([id, b]) => [id, b.bet, b.out]) },
      race: { phase: G.race.phase, t: +G.race.t.toFixed(2), pays: G.race.form.pays, winner: G.race.phase === 'bet' ? null : G.race.winner, seed: G.race.seed, round: G.race.round,
        bets: [...G.race.bets].map(([id, b]) => [id, b.duck, b.bet]) },
      meeting: m && { title: m.title, reason: m.reason, phase: m.phase, lines: m.lines.slice(), voteT: Math.ceil(m.voteT), result: m.result, tally: m.tally, skips: m.skips,
        ejected: m.ejected ?? null, ejectedKiller: !!m.ejectedKiller, voted: G.chars.filter(c => c.alive && c.voted !== null).map(c => c.id) },
      over: G.over,
    };
  }
  function view(id, pub) {
    const c = byId(id);
    const ctx = contextFor(c);
    const myDrink = c.drink;
    const cd = {}; for (const k in c.cd) cd[k] = Math.ceil(c.cd[k]);
    const priv = {
      me: c.id, isKiller: c.isKiller, killers: c.isKiller ? G.killerIds.slice() : [], alive: c.alive,
      thirst: Math.round(c.thirst), cd,
      notes: c.notes.slice(-12).map(n => ({ text: n.text, hard: !!n.hard })), inbox: c.inbox.splice(0),
      ctx: ctx ? ctx.label : null, posVer: c.posVer, x: c.x, y: c.y, seat: c.seat ? { id: c.seat.id, x: c.seat.x, y: c.seat.y, face: c.seat.face, game: c.seat.game, tier: c.seat.tier || null } : null,
      drink: myDrink ? { kind: myDrink.kind, sips: myDrink.sips, held: true } : null,
      sniffT: c.inspect ? c.inspect.t : 0, inspectT: c.inspect ? c.inspect.t : 0, bellUsed: c.bellUsed, voted: c.voted, accused: c.accused, lucky: Math.ceil(c.lucky),
      sick: sick(c), poisonT: sick(c) ? Math.ceil(c.poisonT) : 0, hauntUsed: !!c.hauntUsed, atBar: dist(c, TAP) < 90,
      disguise: c.disguise && c.disguise.t > 0 ? { as: c.disguise.as, t: Math.ceil(c.disguise.t) } : null,
      spiked: c.isKiller ? G.drinks.filter(d => d.poisoned).map(d => d.id).concat(G.traps.filter(t => t.kind === 'bowl').map(t => 'bowl' + t.id)) : [],
      rigged: c.isKiller ? G.traps.filter(t => t.kind === 'seat').map(t => t.id) : [],
    };
    if (G.over) priv.won = G.over.killersWin === c.isKiller;
    return { pub: pub || pubView(), priv };
  }

  return { G, tick, action, setInput, view, pubView, dropHuman, tell, canSee, chars, byId, newCrash, newRace };
}
