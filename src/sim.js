// The authoritative game. No DOM: the host (or solo client) runs it; every human sees it through view(id).
import { CFG, DIFF, CAST, DRINKS, DEATH_SOUNDS } from './config.js';
import { rand, pick, clamp, dist, angDiff, money, shuffle, secs } from './util.js';
import { mixInfo, BOT_RECIPES } from './mix.js';
import { ROOMS, TAP, BELL, SHADY, REST_SPOTS, BOWL_SPOTS, GAME_NAMES, OBSTACLES, POND, CHANDELIERS, STAFF_DOORS, JACKPOT, BREAKERS, W, H, makeSeats, los, collide, roomOf, route, openSpot, clearSpot } from './map.js';
import { PERKS, PERK } from './perks.js';
import * as Gm from './games.js';
import { makeTalk } from './talk.js';
import { createLuck } from './luck.js';
import { createInsuranceBook } from './insurance.js';
import { createFootsteps } from './character-foley.js';
import { arcadeNew, arcadeMove, arcadeDrop, arcadeTick, arcadeView, arcadeMultiplier } from './arcade.js';
import { SKEE, skeeNew, skeeLaunch, skeeTick, skeeView, skeeMultiplier } from './skee.js';

// "Red", "Red and Mint", "Red, Mint and Pip"
export const nameList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
export const ringRadius = _n => 270; // clears the central game cluster while keeping the gathering in the main room
// Where the i-th of n stands round the pit bell (the start, and after every meeting), facing it. Up to 16 the circle
// above; past 16 an oval with the same spacing (about 1.4 m at 32), equal steps along it, as wide as the casino floor
// allows between the blackjack tables and the central game cluster.
const RING_RY = 270, ovals = {};
function oval(n) {
  if (ovals[n]) return ovals[n];
  const rx = Math.min(600, RING_RY + (n - 16) * 22), K = 720, len = [0];
  const P = k => { const a = k / K * Math.PI * 2; return { x: Math.cos(a) * rx, y: Math.sin(a) * RING_RY }; };
  for (let k = 1; k <= K; k++) { const p = P(k - 1), q = P(k); len.push(len[k - 1] + Math.hypot(q.x - p.x, q.y - p.y)); }
  const out = [];
  for (let i = 0, k = 0; i < n; i++) {
    const want = i / n * len[K]; while (len[k + 1] < want) k++;
    const u = (want - len[k]) / (len[k + 1] - len[k] || 1), p = P(k), q = P(k + 1), x = BELL.x + p.x + (q.x - p.x) * u, y = BELL.y + p.y + (q.y - p.y) * u;
    out.push({ x, y, face: Math.atan2(BELL.y - y, BELL.x - x) });
  }
  return (ovals[n] = out);
}
export function ringSpot(i, n) {
  if (n > 16) return oval(n)[i];
  const a = i / n * Math.PI * 2, r = ringRadius(n);
  return { x: BELL.x + Math.cos(a) * r, y: BELL.y + Math.sin(a) * r, face: a + Math.PI };
}
const ringTop = n => n > 16 ? RING_RY : ringRadius(n); // how far north of the bell the ring reaches
const rectDist = (p, r) => Math.hypot(Math.max(r.x - p.x, 0, p.x - r.x - r.w), Math.max(r.y - p.y, 0, p.y - r.y - r.h));
// Drinks, the antidote and sending a round work anywhere along the bar counter, not just at the tap.
const COUNTER = OBSTACLES.find(o => o.kind === 'counter');
const atBar = p => rectDist(p, COUNTER) < CFG.barReach;
const KILLS = ['order', 'rig', 'blade', 'accident'];
// What a killer actually tampers with at each kind of seat.
const RIG_LABEL = {
  bj: 'the blackjack chips', roulette: 'the roulette chips', slots: "the slot machine's lever", plinko: 'the Plinko cabinet', skee: 'the skee-ball return', mines: 'the Mines console',
  tower: 'the Dragon Tower console', coin: 'the coin podium', wheel: "the prize wheel's handle", dice: 'the dice', crash: 'the Crash desk', race: 'the duck race betting desk',
};

export function createGame(opts) {
  const n = clamp(opts.players || 6, 4, CFG.maxPlayers);
  const humans = opts.humans.slice(0, n);
  const nk = clamp(opts.killers || 1, 1, CFG.maxKillers(n));
  const all = [...Array(n).keys()];
  let killerIds;
  if (opts.forceRole === 'killer') killerIds = [0, ...shuffle(all.slice(1)).slice(0, nk - 1)];
  else if (opts.forceRole === 'gambler') killerIds = shuffle(all.slice(1)).slice(0, nk);
  else killerIds = shuffle(all).slice(0, nk);
  const usedNames = new Set(humans.map(h => h.name.toLowerCase()));
  const spare = ['Vinnie', 'Rosa', 'Hank', 'Fifi', 'Gus', 'Dot', 'Sly', 'Bea', 'Moe', 'Lulu', 'Rex', 'Opal', 'Ziggy', 'Nell', 'Bo', 'Tex',
    'Mack', 'Ida', 'Lou', 'Kiki', 'Abe', 'Tess', 'Fritz', 'Lottie', 'Cy', 'Mimi', 'Hugo', 'Edie', 'Sid', 'Wally', 'Gigi', 'Ned'].filter(nm => !usedNames.has(nm.toLowerCase()));
  const G = {
    t: 0, mode: 'play', pickT: 0, pickEarly: false, pickReady: false, lure: null, bank: CFG.startBank, target: Gm.roundGoal(CFG.startBank * CFG.targets[n] * CFG.killerBank[nk]),
    diff: Object.hasOwn(DIFF, opts.difficulty) ? DIFF[opts.difficulty] : DIFF.normal, bankLog: [{ t: 0, bank: CFG.startBank }],
    chars: [], drinks: [], bodies: [], floats: [], fx: [], lightsT: 0, blackout: null, afterDark: null, backrooms: !!opts.backrooms, backroomsChance: opts.backroomsChance ?? CFG.backroomsChance, escape: opts.mode === 'escape', exits: null, nextId: 1, obsT: 0, pending: null, meetEnd: 0, big: n > CFG.bigRoom, meeting: null, over: null,
    arcade: {pusher:null,claw:null,flappy:null}, arcadeSeq: 0, skee: [null, null], skeeSeq: 0, seats: makeSeats(), held: new Map(), bowls: BOWL_SPOTS.map((p, i) => ({ id: i, x: p.x, y: p.y })), deaths: 0, traps: [],
    chandeliers: CHANDELIERS.map(([x, y], i) => ({ id: i, x, y, state: 'up', t: 0, by: null })).filter(ch => !['race', 'arcade'].includes(roomOf(ch))), guard: null, guardSaw: null, haunts: [],
    // (the pond and arcade have plain lamps, nothing to drop)
    antidotes: CFG.antidotes, security: { cams: false, feed: 'floor', feedT: 0 },
    killerIds, stats: { poisonings: 0, stabs: 0, meetings: 0, traps: 0, accidents: 0 },
  };
  for (let i = 0; i < n; i++) {
    const look = CAST[i];
    const h = humans[i];
    const botName = h ? null : usedNames.has(look.name.toLowerCase()) ? spare.shift() : look.name;
    const sp = ringSpot(i, n);
    G.chars.push({
      id: i, name: h ? h.name : botName, color: look.color, hat: look.hat, isHuman: !!h, netKey: h ? h.key : null,
      isKiller: killerIds.includes(i), alive: true, x: sp.x, y: sp.y,
      face: sp.face, look: sp.face, thirst: rand(60, 90), hunger: rand(70, 95), stamina: CFG.stamina, won: 0, drink: null, seat: null, state: 'idle', path: [], wait: 0,
      poisonT: 0, poisonBy: null, poisonDrink: null, poisonKind: null, stuckT: 0, lastPos: { x: 0, y: 0 },
      cd: { order: CFG.startCd, rig: CFG.startCd, blade: CFG.startCd + 10, accident: CFG.startCd + 15, disguise: 0, lights: CFG.startCd + 20, sense: 20, lure: 45, staff: 0 },
      glanceT: rand(3, 8), glancing: 0, glanceOff: 0, gameT: rand(1, 4), sipT: rand(3, 8), sitT: 0, lucky: 0,
      sus: {}, witnessed: [], lastSeen: {}, touches: {}, huntT: rand(4, 8), hunt: null, bellUsed: false,
      notes: [], inbox: [], gear: new Set(), items: new Set(), bullets: 0, mixCd: 0, poisonMax: 0, posVer: 0, moving: false, lookBack: false, inspect: null, voted: null, accused: false, target: null,
      heard: [], hauntUsed: false, disguise: null, trapT: 0, killedBy: null, perk: null, senseT: 0, monster: false, flash: false, grab: null, grabbed: null, mCd: 0,
      deathSfx: h && DEATH_SOUNDS.some(d => d.id === h.death) ? h.death : pick(DEATH_SOUNDS).id, // the player's pick; bots draw one
    });
  }
  for (const c of G.chars) { for (const o of G.chars) c.sus[o.id] = 0; c.friend = pick(G.chars.filter(o => o !== c)).id; c.trail = [{ t: 0, room: roomOf(c) }]; c.seenLog = {}; }
  const api = makeApi(G);
  G.crash = api.newCrash(); G.race = api.newRace();
  // The killers pick their edges first, and everyone sees the edges on offer. Online (pick: 'timed') everyone waits the
  // whole pickTime whoever they are; solo the night starts when you pick (a killer), say you're ready (a gambler), or at
  // the end of pickTime. Without a pick screen (tests) a human killer has opts.perk, or none.
  const pickers = G.chars.filter(c => c.isHuman && c.isKiller);
  if (opts.pick === 'timed' || opts.pick === 'solo') { G.mode = 'pick'; G.pickT = CFG.pickTime; G.pickEarly = opts.pick === 'solo'; }
  else { for (const c of pickers) c.perk = Object.hasOwn(PERK, opts.perk) ? opts.perk : null; api.startPlay(); }
  return api;
}

function makeApi(G) {
  const footsteps = createFootsteps(roomOf);
  const sharedLuck = new Map();
  const luckFor = c => {
    if (!sharedLuck.has(c.id)) sharedLuck.set(c.id, createLuck());
    return sharedLuck.get(c.id);
  };

  const policyBooks = new Map();
  const policyFor = c => {
    if (!policyBooks.has(c.id)) policyBooks.set(c.id, createInsuranceBook({
      owns: () => c.items.has('insurance'), consume: () => c.items.delete('insurance'), comp: CFG.comp,
      refund: amount => {
        if (G.over) return;
        G.bank += amount; c.won += amount; logBank();
        G.floats.push({ x: c.x, y: c.y - 30, text: '+' + money(amount), color: '#9ccea9', t: 1.6 });
        tell(c, `Insurance returned ${money(amount)}.`, false, 'coin'); checkOver();
      },
    }));
    return policyBooks.get(c.id);
  };
  const D = () => G.diff;
  const chars = () => G.chars;
  const byId = id => G.chars[id];
  // A machine a player left running (tables.js bg: a slot on AUTO, a wheel still spinning) stays theirs while they live.
  const heldOff = (s, c) => { const h = G.held.get(s.id), o = h === undefined ? null : byId(h); return !!(o && o !== c && o.alive); };
  const humans = () => G.chars.filter(c => c.isHuman);
  const gamblersAlive = () => G.chars.filter(c => c.alive && !c.isKiller);
  const killersAlive = () => G.chars.filter(c => c.alive && c.isKiller);
  const cdScale = () => CFG.cdScale[killersAlive().length] || 1;

  function tell(c, text, bad, sfx) { if (c.isHuman) c.inbox.push({ text, bad: !!bad, sfx: sfx || null }); }
  function tellAll(text, bad, sfx) { for (const c of humans()) tell(c, text, bad, sfx); }
  function sfxTo(c, sfx) { if (c.isHuman) c.inbox.push({ sfx }); }
  function note(c, text, extra) { if (c.isHuman) c.notes.push(Object.assign({ t: G.t, text }, extra || {})); }

  // ---------- The pick screen, then the night starts ----------
  function startPlay(picked) {
    G.mode = 'play'; G.pickT = 0;
    const nk = G.killerIds.length;
    for (const c of humans()) {
      const partners = G.chars.filter(o => o.isKiller && o !== c).map(o => o.name);
      if (c.isKiller) {
        if (picked && !c.perk) { c.perk = pick(PERKS).id; tell(c, `No edge picked, so you got ${PERK[c.perk].name}.`); }
        tell(c, partners.length ? `You are a killer, with ${nameList(partners)}. Nobody can know.` : 'You are the killer. Nobody can know.', true, 'start');
        if (c.perk) tell(c, `Your edge: ${PERK[c.perk].name}${PERK[c.perk].key ? ` (${PERK[c.perk].key})` : ''}.`);
      } else tell(c, `${nk > 1 ? ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'][nk] + ' of them are killers' : 'One of them is a killer'}. Watch your drink.`, false, 'start');
    }
  }
  function pickTick(dt) {
    G.pickT -= dt;
    const pickers = G.chars.filter(c => c.isHuman && c.isKiller);
    const done = G.pickEarly && (G.pickReady || (pickers.length > 0 && pickers.every(c => c.perk)));
    if (G.pickT <= 0 || done) startPlay(true);
  }
  const staMax = c => c.perk === 'legs' ? CFG.legsStamina : CFG.stamina;

  // ---------- Vision ----------
  const viewRange = () => G.lightsT > 0 || G.blackout ? CFG.darkRange : CFG.viewRange;
  function canSee(v, p) {
    if (!v.alive || p.staffInside) return false;
    if (v.staffInside) return roomOf(p) === v.cameraFeed;
    // the security desk's camera feed shows one room at a time, wherever it is
    if (v.seat && v.seat.game === 'cams' && roomOf(p) === G.security.feed) return true;
    const d = dist(v, p);
    if (d > viewRange()) return false;
    if ((d > CFG.nearSense || p.perk === 'legs') && Math.abs(angDiff(Math.atan2(p.y - v.y, p.x - v.x), v.look)) > CFG.coneHalf) return false; // light feet: nobody hears you behind them
    return los(v, p);
  }
  // Fellow killers never count as witnesses. A careless bot killer misjudges some gazes.
  function witnessesOf(actor, ignore, careless) {
    return G.chars.filter(c => c !== actor && c !== ignore && c.alive && !(actor.isKiller && c.isKiller) && canSee(c, actor) &&
      !(careless && Math.random() < (c.isHuman ? D().careless * 2.5 : D().careless))).concat(G.guard && canSee(G.guard, actor) ? [G.guard] : []);
  }

  // ---------- Drinks, snacks and the antidote ----------
  // Drinks are always in someone's hand. Anyone at the bar mixes one (mix.js) for anyone, poison and all, so a free
  // drink is a gift or a death sentence and nobody can tell which by looking. parts: the mix; none, a classic at random
  // (with a part of poison when poisonBy is set). poisonBy: who answers for any poison in it.
  function pourFor(c, from = null, poisonBy = null, parts = null) {
    if (!parts) { parts = { ...pick(BOT_RECIPES).parts }; if (poisonBy !== null) parts.poison = 1; }
    const mx = mixInfo(parts);
    if (c.drink) removeDrink(c.drink);
    const d = { id: G.nextId++, owner: c.id, holder: c.id, x: c.x, y: c.y, sips: CFG.drinkSips, poisoned: !!mx.poison, poisonBy: mx.poison ? poisonBy : null, from, kind: mx.name.toLowerCase(), glass: mx.glass, color: mx.color, mx };
    G.drinks.push(d); c.drink = d; sfxTo(c, 'pour');
    return d;
  }
  function removeDrink(d) { G.drinks = G.drinks.filter(x => x !== d); for (const c of G.chars) if (c.drink === d) c.drink = null; }
  function poisonChar(c, by, what, kind, speed = 1) { // speed: a stronger dose works faster (mix.js)
    if (c.poisonT) return;
    c.poisonT = c.poisonMax = CFG.poisonDelay * speed; c.poisonBy = by; c.poisonDrink = what; c.poisonKind = kind; c.sickTold = false;
  }
  function sip(c, d) {
    const mx = d.mx;
    d.sips--; c.thirst = Math.min(100, c.thirst + CFG.sipGain * (mx ? mx.q : 1)); sfxTo(c, 'sip');
    if (mx && mx.f) c.hunger = Math.min(100, c.hunger + CFG.mixFood * mx.f); // cream, tomato juice...: a drink you can live on
    if (mx && mx.a >= 0.1) c.lucky = Math.max(c.lucky, CFG.boozeLuck * mx.a); // liquid courage
    if (d.poisoned) poisonChar(c, d.poisonBy, d.id, d.kind, mx ? mx.speed : 1);
    if (d.sips <= 0) removeDrink(d);
  }
  function eatSnack(c, b) {
    c.eatAt = G.t; c.snack = b.id % 3; c.lucky = CFG.luckyTime; c.hunger = Math.min(100, c.hunger + CFG.snackGain); sfxTo(c, 'crunch');
    tell(c, `${['Doughnuts', 'Pretzels', 'Hot dogs'][c.snack]}. That hits the spot, and they're lucky: your table wins pay ${Math.round(CFG.luckyBonus * 100)}% more for ${CFG.luckyTime}s.`);
    const trap = trapAt('bowl', b.id);
    if (trap && !c.isKiller) { poisonChar(c, trap.by, 'bowl' + b.id, 'pretzels'); removeTrap(trap); }
    G.fx.push({ kind: 'crumbs', x: b.x, y: b.y, t: 0.8 });
  }
  // Only once the poison is felt (sick): before that nothing at the bar gives it away. The poisoned drink in your hand
  // goes down the sink with it, or the next sip would undo the cure.
  function takeAntidote(c) {
    if (!sick(c) || G.antidotes <= 0) return false;
    G.antidotes--; c.poisonT = 0; c.poisonBy = null; sfxTo(c, 'sip');
    const d = c.drink && c.drink.poisoned ? c.drink : null; if (d) removeDrink(d);
    tell(c, `The antidote burns all the way down, but you'll live. ${G.antidotes} left behind the bar.${d ? ` You poured out the ${d.kind}.` : ''}`);
    if (c.poisonDrink !== null) note(c, `Your ${c.poisonKind} was poisoned. The antidote saved you.`, { hard: true });
    return true;
  }
  function sendDrink(c, to, poisoned, parts = null) {
    const d = pourFor(to, c.id, poisoned || parts ? c.id : null, parts);
    tell(to, `A ${d.kind} arrived from a secret admirer.`, false, 'pour');
    if (!d.poisoned) tell(c, `You sent ${to.name} a ${d.kind}.`);
    for (const w of witnessesOf(c, to)) remember(w, c, 'send', to, `send ${to.name} a ${d.kind}`, CFG.sendSus, false);
    return d;
  }

  // The mixer (Steve, 2026-10-15): anyone at the bar mixes anything, for themselves or for anyone, and anyone can put
  // poison in it. A killer's poisoned pour is their move 1 (its cooldown); anyone else's waits CFG.mixPoisonCd.
  function mixDrink(c, to, parts) {
    const mx = mixInfo(parts);
    if (!mx) return tell(c, 'Put something in the glass first.'), false;
    if (!atBar(c)) return tell(c, 'Drinks are mixed at the bar.'), false;
    if (!to || !to.alive) return tell(c, 'Pick who it is for.'), false;
    if (mx.poison) {
      if (to === c) return tell(c, "You're not drinking that yourself."), false;
      const cd = c.isKiller ? c.cd.order : c.mixCd;
      if (cd > 0) return tell(c, `The bartender is watching you. Poison again in ${secs(cd)}.`), false;
      if (c.isKiller) cdHold(c, 'order', CFG.orderCd); else c.mixCd = CFG.mixPoisonCd;
      G.stats.poisonings++;
    }
    if (to === c) { pourFor(c, null, null, parts); tell(c, `One ${c.drink.kind}, coming up.`); }
    else { const d = sendDrink(c, to, false, parts); if (d.poisoned) tell(c, `A poisoned ${d.kind} is on its way to ${to.name}.`, false, 'poison'); }
    return true;
  }

  // ---------- The shady guy in the VIP alcove (Steve, 2026-10-15): your own winnings buy what the house doesn't sell ----------
  const atShady = c => dist(c, SHADY) < CFG.shadyReach;
  const shopPrice = id => CFG.gear[id] ? CFG.gear[id].price : Gm.niceDown(G.target * CFG.shop[id].frac);
  const shopIds = () => Object.keys(CFG.shop).concat(G.escape ? Object.keys(CFG.gear) : []); // (escape mode's gear too)
  function spend(c, p) {
    c.won -= p; G.bank = Math.max(0, G.bank - p); logBank();
    G.floats.push({ x: c.x, y: c.y - 30, text: '-' + money(p), color: '#e8443a', t: 1.6 });
  }
  function shopBuy(c, id) {
    if (!shopIds().includes(id) || !c.alive || G.over || G.mode !== 'play' || c.monster) return false;
    if (!atShady(c)) return tell(c, 'The shady guy is in the VIP lounge alcove, by his crates.'), false;
    if (CFG.gear[id]) return buyGear(c, id);
    const it = CFG.shop[id], p = shopPrice(id);
    if (c.items.has(id)) return tell(c, `You already have the ${it.name.toLowerCase()}.`), false;
    if (c.won < p) return tell(c, `"${money(p)}. Come back when you've won it." You have ${money(Math.max(0, Math.round(c.won)))} in winnings.`), false;
    spend(c, p);
    if (id === 'dice') c.lucky = Math.max(c.lucky, CFG.diceLuck); else c.items.add(id);
    if (id === 'gun') c.bullets = CFG.gunBullets;
    tell(c, `You bought the ${it.name.toLowerCase()}. ${it.tip}`, false, 'coin');
    return true;
  }
  // The vest: one knife or one bullet, and it's done.
  function vested(v, by, what) {
    if (!v.items.has('vest')) return false;
    v.items.delete('vest');
    tell(v, `Your vest stopped the ${what}! RUN.`, true, 'gasp'); if (by) tell(by, `${v.name} was wearing a vest. The ${what} didn't go through.`, true);
    return true;
  }
  // The revolver: whoever is nearest in your sights (CFG.gunWidth either side, a little more far off), within
  // CFG.gunRange and in plain view. Everyone in earshot hears it. The monster only staggers.
  function shoot(c) {
    if (!c.items.has('gun') || c.bullets <= 0) return tell(c, 'You have no gun. The shady guy in the VIP alcove sells one.'), false;
    if (--c.bullets <= 0) c.items.delete('gun');
    const rx = Math.cos(c.look), ry = Math.sin(c.look);
    let hit = null, best = 1e9;
    for (const o of G.chars) {
      if (o === c || !o.alive || o.staffInside) continue;
      const dx = o.x - c.x, dy = o.y - c.y, along = dx * rx + dy * ry;
      if (along <= 0 || along > CFG.gunRange || Math.abs(dx * ry - dy * rx) > CFG.gunWidth + along * 0.02) continue;
      if (along < best && los(c, o)) { best = along; hit = o; }
    }
    for (const h of G.chars) { const lv = h.isHuman ? (h === c ? 1 : Math.max(0.3, hearing(h, c))) : 0; if (lv) h.inbox.push({ sfx: 'gun', vol: +lv.toFixed(2), muffle: roomOf(h) !== roomOf(c), mine: h === c }); }
    for (const h of humans()) if (h !== c && h.alive && !canSee(h, c)) tell(h, roomOf(h) === roomOf(c) ? 'A GUNSHOT!' : `A gunshot, from ${ROOMS[roomOf(c)].name}!`, true);
    G.fx.push({ kind: 'sparks', x: c.x + rx * 20, y: c.y + ry * 20, t: 0.4 });
    if (!hit) { tell(c, 'BANG. You missed.', true); witnessAll(c, 'shoot', null, 'fire a gun', 90); return true; }
    if (hit.monster) {
      hit.mCd = Math.max(hit.mCd, CFG.gunStun); hit.mHunt = null;
      if (hit.grab) { const v = byId(hit.grab.v); hit.grab = null; v.grabbed = null; collide(v); v.posVer++; tell(v, 'It dropped you! RUN.', true, 'gasp'); }
      tell(hit, 'Shot! It only staggers you.', true); tell(c, 'BANG. The bullet only staggers the monster. RUN.', true);
      return true;
    }
    if (vested(hit, c, 'bullet')) { witnessAll(c, 'shoot', hit, `shoot at ${hit.name}`, 200); return true; }
    witnessAll(c, 'shoot', hit, `shoot ${hit.name}`, 200);
    kill(hit, 'shot', c);
    return true;
  }
  // A bot with the gun shoots the one it is surest about, once it is sure enough and has a clear shot.
  function botGun(c) {
    const v = G.chars.filter(o => o.alive && !o.staffInside && o !== c && (c.sus[o.id] || 0) >= CFG.gunSus && dist(c, o) < CFG.gunRange && los(c, o)).sort((a, b) => c.sus[b.id] - c.sus[a.id])[0];
    if (!v) return false;
    c.face = c.look = Math.atan2(v.y - c.y, v.x - c.x); c.path = []; shoot(c);
    return true;
  }
  // What a bot gambler goes to the shady guy for: the revolver once it can pay for it; now and then a pocket antidote.
  function botWants(c) {
    if (c.isKiller || c.state === 'seated') return null;
    if (!c.items.has('gun') && c.won >= shopPrice('gun')) return 'gun';
    if (G.deaths && !c.items.has('antidote') && c.won >= shopPrice('antidote') * 3 && Math.random() < 0.15) return 'antidote';
    return null;
  }

  // ---------- What a witness takes away ----------
  // A disguised killer is remembered as whoever they look like.
  const MONSTER_LOOK = { id: -1, name: 'The monster', color: '#2a2224', hat: null, isHuman: false };
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
    const s = nearest(G.seats.filter(s => (!s.occ || s.occ === c) && s.game !== 'vip' && s.game !== 'cams' && !trapAt('seat', s.id)), c, CFG.reach + 20);
    if (s) return { kind: 'seat', id: s.id, x: s.x, y: s.y, label: RIG_LABEL[s.game] || GAME_NAMES[s.game] };
    const b = nearest(G.bowls.filter(b => !trapAt('bowl', b.id)), c, CFG.reach + 10);
    return b ? { kind: 'bowl', id: b.id, x: b.x, y: b.y, label: 'the snack bowl' } : null;
  }

  // ---------- Killer moves ----------
  function cdHold(k, key, base) { k.cd[key] = base * cdScale(); for (const o of KILLS) if (o !== key) k.cd[o] = Math.max(k.cd[o], CFG.sharedCd); }
  // 1. A poisoned drink on the house, ordered at the bar for anyone in the casino.
  function doOrder(k, v) {
    if (k.cd.order > 0 || !v || !v.alive || v.isKiller || !atBar(k)) return false;
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
    if (vested(v, k, 'knife')) return true;
    kill(v, 'blade', k);
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
      kill(v, 'drown', k);
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
    tell(k, `You look like ${v.name} for ${CFG.disguiseDur} seconds.`, false, 'haunt');
    return true;
  }
  // 6. Lights out: the blackout (Steve, 2026-10-15). The lights stay out until the crew resets the lit breakers, by
  // flashlight. While they're out a killer can turn into a giant monster (Q: transform) that kills anyone it catches; it
  // turns back into its own body in the same tick the power comes on (render3d.js swaps both from the one snapshot).
  // forced: escape mode's own blackout (CFG.escapeDarkAt), whatever the cooldowns.
  function doLights(k, forced) {
    if ((!forced && k.cd.lights > 0) || G.blackout || k.monster || G.exits) return false;
    for (const o of killersAlive()) o.cd.lights = CFG.lightsCd * (o.perk === 'night' ? CFG.nightLights : 1);
    if (k.seat) { standUp(k); if (k.state === 'seated') k.state = 'idle'; }
    if (k.disguise) k.disguise.t = 0;
    if (k.target && k.target.claim === k.id) k.target.claim = null;
    const rooms = new Set([roomOf(k)]), br = [];
    for (const b of shuffle(BREAKERS.map((b, i) => ({ ...b, i })))) {
      if (br.length >= (G.escape ? CFG.escapeBreakers : CFG.breakers) || rooms.has(roomOf(b))) continue;
      rooms.add(roomOf(b)); br.push({ ...b, room: roomOf(b), work: 0, done: false });
    }
    G.blackout = { by: null, cut: k.id, t: 0, br }; // by: the monster, once a killer turns
    for (const c of G.chars) { c.flash = c.alive && !c.isKiller; c.tfAt = null; }
    const where = nameList(br.map(b => ROOMS[b.room].name));
    for (const h of humans()) {
      if (h.isKiller) tell(h, `The power is out. Press Q to turn into the monster${killersAlive().length > 1 ? ' (one of you can)' : ''}. Breakers: ${where}.`, true, 'lights');
      else tell(h, `The power is out. Reset the breakers in ${where}${G.escape ? ' and the exits open' : ''}. F: flashlight.`, true, 'lights');
    }
    return true;
  }
  // Q: the killer turns into the monster (Steve, 2026-10-15: a button, not by itself), any time the power is out. One
  // monster at a time.
  function transform(k) {
    const B = G.blackout;
    if (!B || !k.isKiller || !k.alive || k.monster || B.by !== null) return false;
    if (k.seat) standUp(k);
    if (k.disguise) k.disguise.t = 0;
    if (k.target && k.target.claim === k.id) k.target.claim = null;
    B.by = k.id;
    k.monster = true; k.mCd = 0; k.hunt = null; k.mHunt = null; k.path = []; k.state = 'monster'; k.inspect = null; k.flash = false;
    for (const h of humans()) {
      if (h === k) tell(h, 'You are the monster. Left-click to grab, Shift to leap. Catch them before the power comes back on.', true, 'roar');
      else if (h.isKiller) tell(h, 'Your partner is the monster. Stay out of its way.', true, 'roar');
      else tell(h, 'Something huge is loose in the dark. Hide, or get those breakers reset.', true, 'roar');
    }
    return true;
  }
  // Escape mode: when the power comes back on, CFG.exits staff doors open for CFG.exitOpen seconds. A gambler who
  // reaches one is out (a ghost from then on, still free to play the games); the doors shut on anyone left inside.
  function openExits() {
    if (G.exits || G.over) return;
    const doors = shuffle(STAFF_DOORS.slice()).slice(0, CFG.exits);
    G.exits = { ids: doors.map(d => d.id), t: CFG.exitOpen, closed: false };
    tellAll(`${G.blackout ? 'The breakers are back. The exit doors have power, the lights do not' : 'The exits are open'}: the staff doors in ${nameList(doors.map(d => ROOMS[d.room].name))}. Get out! ${CFG.exitOpen} seconds.`, true, 'meeting');
  }
  const exitDoors = () => G.exits.ids.map(i => STAFF_DOORS[i]);
  const exitHoldOf = c => c.gear.has('crowbar') ? CFG.crowbarHold : CFG.exitHold;
  const gearSpeed = c => c.gear.has('sneakers') ? CFG.sneakers : 1;
  // Escape mode's gear, bought with your own winnings (CFG.gear)
  function buyGear(c, item) {
    const g = CFG.gear[item];
    if (!G.escape || !g || !c.alive || c.isKiller || G.over) return false;
    if (c.gear.has(item)) return tell(c, `You already have the ${g.name.toLowerCase()}.`), false;
    if (c.won < g.price) return tell(c, `The ${g.name.toLowerCase()} costs ${money(g.price)} of your winnings. You have ${money(Math.max(0, Math.round(c.won)))}.`), false;
    c.won -= g.price; c.gear.add(item);
    tell(c, `You bought the ${g.name.toLowerCase()}. ${g.tip}`, false, 'coin');
    return true;
  }
  // a bot gambler now and then spends its winnings on what it can afford
  function botGear(c, dt) {
    if ((c.gearT = (c.gearT ?? rand(20, 40)) - dt) > 0) return;
    c.gearT = rand(20, 40);
    const can = Object.keys(CFG.gear).filter(k => !c.gear.has(k) && c.won >= CFG.gear[k].price);
    if (can.length) buyGear(c, pick(can));
  }
  function exitsTick(dt) {
    const X = G.exits;
    X.t -= dt;
    for (const c of G.chars) {
      if (!c.alive || c.isKiller || c.grabbed !== null) continue;
      // the door takes CFG.exitHold seconds to get open, standing at it (and the monster hears it from across the room)
      const d = exitDoors().find(d => Math.hypot(c.x - d.sx, c.y - d.sy) < 44);
      c.exitT = d ? (c.exitT || 0) + dt : 0;
      if (c.exitT >= exitHoldOf(c)) getOut(c);
    }
    if (X.t <= 0) { X.closed = true; tellAll('The exits slam shut.', true, 'lights'); }
    checkOver();
  }
  function getOut(c) {
    if (c.seat) standUp(c);
    if (c.drink) removeDrink(c.drink);
    if (c.target && c.target.claim === c.id) c.target.claim = null;
    c.alive = false; c.escaped = true; c.flash = false; c.path = []; c.state = 'idle'; c.inspect = null; c.poisonT = 0; c.trapT = 0; c.hunt = null;
    tellAll(`${c.name} got out!`, false, 'cheer');
  }
  // A bot when the exits open: a moment to take it in, then for the nearest one, fast.
  function exitBrain(c, dt) {
    if (c.seat) standUp(c);
    if (c.target && c.target.claim === c.id) { c.target.claim = null; c.target = null; }
    if (c.exitAt == null) c.exitAt = G.exits.t - rand(0, 5);
    if (G.exits.t > c.exitAt) { c.moving = false; return; }
    c.flash = !!G.blackout;
    const d = nearest(exitDoors().map(d => ({ x: d.sx, y: d.sy })), c, 1e9);
    if (!c.path.length || !c.exitTo || c.exitTo.x !== d.x || c.exitTo.y !== d.y) { c.exitTo = d; setGoal(c, d); }
    followPath(c, dt, CFG.botSpeed * 1.25 * gearSpeed(c));
  }
  function endBlackout(why) {
    const B = G.blackout; if (!B) return;
    G.blackout = null;
    const m = B.by !== null ? byId(B.by) : null;
    if (m) { m.monster = false; m.mHunt = null; m.path = []; m.state = 'idle'; m.leap = null; m.leapCd = 0; }
    for (const c of G.chars) { c.flash = false; c.grab = null; c.grabbed = null; c.dark = null; c.tfAt = null; }
    for (const o of killersAlive()) o.cd.lights = Math.max(o.cd.lights, CFG.lightsCd * (o.perk === 'night' ? CFG.nightLights : 1));
    tellAll(why === 'fixed' ? 'The power is back on!' : 'The power company got the lights back on.', false, 'powerup');
    // one time in a hundred the lights come back on somewhere else: the backrooms casino (render3d.js swaps it in that frame)
    if (!G.backrooms && Math.random() < G.backroomsChance) { G.backrooms = true; tellAll('This is not the casino anymore.', true, 'hum'); }
    if (G.afterDark) { const a = G.afterDark; G.afterDark = null; callMeeting(...a); }
    if (G.escape) openExits();
  }
  const atBreaker = (c, b) => dist(c, b) < 46 && Math.abs(angDiff(c.look, b.face)) < 1.1;
  // The monster takes someone within reach: it holds them for monsterHold (its kill animation), then they're dead. If
  // the lights come on first they get away.
  function doMaul(m, v) {
    if (!m.monster || m.grab || m.mCd > 0 || !v || !v.alive || v.isKiller || v.grabbed !== null) return false;
    if (v.gear.has('charm')) { // the lucky rabbit foot: it slips out of the monster's claws once
      v.gear.delete('charm'); m.mCd = 3; m.mHunt = null;
      tell(v, 'Your lucky rabbit foot! You slip out of its claws. RUN.', true, 'gasp'); tell(m, 'They slipped out of your claws!', true);
      return true;
    }
    if (v.seat) standUp(v);
    if (v.target && v.target.claim === v.id) v.target.claim = null;
    v.inspect = null; v.path = []; v.grabbed = m.id; v.flash = false;
    m.grab = { v: v.id, t: 0 }; m.path = []; m.face = m.look = Math.atan2(v.y - m.y, v.x - m.x);
    tell(v, 'The monster has you!', true);
    for (const c of G.chars) { const lv = c.isHuman ? (c === v ? 1 : hearing(c, v)) : 0; if (lv) c.inbox.push({ sfx: 'maul', vol: +lv.toFixed(2), muffle: roomOf(c) !== roomOf(v) }); }
    return true;
  }
  // The pounce (Shift; CFG.leapDist and the rest): toward the nearest gambler it can see within leapCone of where it faces
  // (where they stand now, no leading them: a runner can dodge it), else straight ahead. leapTick flies it there; it can't leap while holding someone or
  // recovering from a kill (mCd).
  const leapable = (m, o) => o.alive && !o.isKiller && o.grabbed === null && los(m, o);
  function doLeap(m) {
    if (!m.monster || !m.alive || m.grab || m.leap || m.leapCd > 0 || m.mCd > 0) return false;
    if (m.seat) standUp(m);
    const v = nearest(G.chars.filter(o => leapable(m, o) && Math.abs(angDiff(Math.atan2(o.y - m.y, o.x - m.x), m.look)) < CFG.leapCone), m, CFG.leapDist + CFG.monsterReach);
    const a = v ? Math.atan2(v.y - m.y, v.x - m.x) : m.look;
    m.leap = { a, d: v ? Math.min(CFG.leapDist, dist(m, v) + 30) : CFG.leapDist, done: 0, t: 0, miss: null }; // (through where they stand: whoever it touches on the way is caught)
    m.leapCd = CFG.leapCd; m.face = m.look = a; m.path = []; m.posVer++;
    for (const c of G.chars) { const lv = c.isHuman && c !== m ? hearing(c, m) : 0; if (lv) c.inbox.push({ sfx: 'roar', vol: +(lv * 0.6).toFixed(2), muffle: roomOf(c) !== roomOf(m) }); }
    return true;
  }
  // in flight: small steps along the line, collide() at each, and a wall (no line of sight to the next step, or nowhere
  // left to go) ends it there; it takes the first gambler it comes within reach of. Landing on nobody winds it.
  function leapTick(m, dt) {
    const L = m.leap; L.t += dt; m.moving = false;
    if (L.miss !== null) { if ((L.miss -= dt) <= 0) m.leap = null; return; }
    const want = L.d * Math.min(1, L.t / CFG.leapTime), cx = Math.cos(L.a), cy = Math.sin(L.a);
    let stopped = false;
    while (L.done < want - 1e-6) {
      const s = Math.min(8, want - L.done), from = { x: m.x, y: m.y };
      const to = { x: clamp(m.x + cx * s, 20, W - 20), y: clamp(m.y + cy * s, 20, H - 20) };
      if (!los(from, to)) { stopped = true; break; }
      m.x = to.x; m.y = to.y; collide(m);
      if (dist(m, from) < s * 0.4 || !los(from, m)) { if (!los(from, m)) { m.x = from.x; m.y = from.y; } stopped = true; break; }
      L.done += s;
    }
    m.face = m.look = L.a; m.moving = true; m.posVer++;
    const v = nearest(G.chars.filter(o => leapable(m, o)), m, CFG.monsterReach);
    if (v) { m.leap = null; doMaul(m, v); return; }
    if (stopped || L.t >= CFG.leapTime) { L.miss = CFG.leapMiss; m.moving = false; if (m.isHuman) tell(m, 'Missed.'); }
  }
  function blackoutTick(dt) {
    const B = G.blackout; B.t += dt;
    const m = B.by !== null ? byId(B.by) : null;
    if (m && !m.alive) return endBlackout('fixed');
    if (m && m.mCd > 0) m.mCd -= dt;
    if (m && m.leapCd > 0) m.leapCd -= dt;
    if (m && m.leap) leapTick(m, dt);
    if (m && m.grab) {
      const v = byId(m.grab.v);
      if (!v.alive) { m.grab = null; v.grabbed = null; }
      else {
        m.grab.t += dt; m.moving = false;
        v.x = m.x + Math.cos(m.face) * 40; v.y = m.y + Math.sin(m.face) * 40; v.moving = false; v.face = v.look = m.face + Math.PI;
        if (m.grab.t >= CFG.monsterHold) {
          m.grab = null; v.grabbed = null; collide(v); v.posVer++; m.mCd = CFG.monsterCd;
          kill(v, 'monster', m);
          if (G.over || G.mode !== 'play') return;
        }
      }
    }
    for (const b of B.br) {
      if (b.done) continue;
      const hands = G.chars.filter(c => c.alive && !c.isKiller && c.grabbed === null && atBreaker(c, b)).reduce((n, c) => n + (c.gear.has('fuse') ? 2 : 1), 0); // (a fuse kit: twice the work)
      if (hands) b.work += dt * (1 + 0.5 * (hands - 1));
      if (b.work >= CFG.breakerWork) { b.done = true; for (const h of humans()) tell(h, `A breaker clunks back on in ${ROOMS[b.room].name}.`, false, 'breaker'); }
    }
    // escape mode: the breakers power the exit doors, not the lights; the run for the doors is in the dark, monster and all
    if (B.br.every(b => b.done)) { if (!G.escape) return endBlackout('fixed'); if (!G.exits) openExits(); }
    if (!G.exits && B.t >= (G.escape ? CFG.escapeBlackoutMax : CFG.blackoutMax)) return endBlackout('timeout');
  }
  // Who the monster can find: a lit flashlight a long way off, anyone close in the dark, someone moving a little further.
  function monsterFinds(m, v) {
    if (!v.alive || v.isKiller || v.grabbed !== null) return false;
    const d = dist(m, v);
    if (d > (v.flash || v.exitT > 0 ? CFG.monsterSight : v.moving ? CFG.monsterNear * 2 : CFG.monsterNear)) return false;
    return los(m, v);
  }
  // A bot monster: chases whoever it finds (to where it last saw them), else stalks a breaker someone is working (it
  // hears the hum) or a random room.
  function monsterBrain(m, dt) {
    if (m.leap) return; // (leapTick flies it)
    m.moving = false;
    if (m.grab) return;
    if (m.seat) standUp(m);
    const speed = CFG.playerSpeed * CFG.monsterSpeed;
    let best = null, bd = 1e9;
    for (const v of G.chars) if (monsterFinds(m, v)) { const d = dist(m, v); if (d < bd) { bd = d; best = v; } }
    if (best && (!m.mHunt || m.mHunt.id !== best.id)) m.mHunt = { id: best.id, x: best.x, y: best.y, t: 4, repath: 0 };
    const h = m.mHunt;
    if (h) {
      const v = byId(h.id);
      if (best === v) { h.x = v.x; h.y = v.y; h.t = 4; } else h.t -= dt;
      if (!v.alive || v.grabbed !== null || h.t <= 0) m.mHunt = null;
      else {
        if (best === v && bd < CFG.monsterReach) { m.face = Math.atan2(v.y - m.y, v.x - m.x); if (doMaul(m, v)) return; }
        // in pouncing range: it pounces, after a beat to size them up (about two thirds of a second)
        if (best === v && bd < CFG.leapDist * 0.8 && !(m.leapCd > 0) && !(m.mCd > 0) && Math.random() < dt * 1.5) { m.face = m.look = Math.atan2(v.y - m.y, v.x - m.x); if (doLeap(m)) return; }
        if ((h.repath -= dt) <= 0 || !m.path.length) { h.repath = 0.5; setGoal(m, { x: h.x, y: h.y }); }
        followPath(m, dt, speed);
        return;
      }
    }
    m.patrolT = (m.patrolT || 0) - dt;
    if (!m.path.length || m.patrolT <= 0) {
      m.patrolT = rand(6, 10);
      const b = Math.random() < 0.35 ? G.blackout.br.find(b => !b.done && b.work > 0) : null; // (now and then: it doesn't camp one)
      const x = G.exits && Math.random() < CFG.monsterGuard ? STAFF_DOORS[pick(G.exits.ids)] : null; // escape mode: it waits by the doors
      if (x) m.patrolT = rand(3, 6);
      setGoal(m, x ? { x: x.sx + rand(-120, 120), y: x.sy + rand(-120, 120) } : b ? { x: b.x, y: b.y } : openSpot(ROOMS[pick(Object.keys(ROOMS))]));
    }
    followPath(m, dt, speed * 0.75);
  }
  // A gambler bot in the dark: the CFG.fixers nearest each lit breaker go and reset it, flashlight on; the rest hide,
  // flashlight off. Anyone who sees the monster coming runs.
  function darkBrain(c, dt) {
    const B = G.blackout, m = B.by !== null ? byId(B.by) : null;
    if (c.seat) standUp(c);
    if (c.target && c.target.claim === c.id) { c.target.claim = null; c.target = null; }
    if (!c.dark || c.dark.b !== B) {
      c.path = []; c.state = 'idle';
      const mine = B.br.filter(b => !b.done && gamblersAlive().filter(o => !o.isHuman).sort((p, q) => dist(p, b) - dist(q, b)).slice(0, CFG.fixers).includes(c));
      c.dark = { b: B, fix: mine.length ? mine[0] : null, flee: 0, hide: null };
    }
    const D2 = c.dark, sees = !!m && dist(c, m) < 320 && los(c, m);
    if (D2.flee > 0 || sees) {
      if (sees && D2.flee <= 0) {
        D2.flee = 3; c.flash = false;
        const a = Math.atan2(c.y - m.y, c.x - m.x);
        let to = null;
        for (let i = 0; i < 8 && !to; i++) { const aa = a + rand(-0.9, 0.9), p = { x: clamp(c.x + Math.cos(aa) * 320, 30, W - 30), y: clamp(c.y + Math.sin(aa) * 320, 30, H - 30) }; if (clear(p)) to = p; }
        setGoal(c, to || openSpot(ROOMS[roomOf(c)]));
      }
      D2.flee -= dt;
      followPath(c, dt, CFG.botSpeed * (D2.flee > 0 ? 1.55 : 1) * gearSpeed(c));
      if (D2.flee <= 0) { c.path = []; D2.hide = null; }
      return true;
    }
    if (D2.fix && D2.fix.done) D2.fix = B.br.find(b => !b.done && dist(c, b) < 900) || null;
    // a lit breaker nobody is going to (its fixers caught): the nearest bot hiding goes instead
    if (!D2.fix && (D2.chk = (D2.chk || 0) - dt) <= 0) {
      D2.chk = 3;
      const lone = B.br.find(b => !b.done && !G.chars.some(o => o.alive && o.dark && o.dark.fix === b));
      if (lone && nearest(gamblersAlive().filter(o => !o.isHuman && o.dark && !o.dark.fix), lone, 1e9) === c) { D2.fix = lone; c.path = []; }
    }
    if (D2.fix) {
      c.flash = true;
      const b = D2.fix;
      if (dist(c, b) > 20) { if (!c.path.length) setGoal(c, b); followPath(c, dt, CFG.botSpeed * gearSpeed(c)); }
      else { c.face = b.face; c.moving = false; }
      return true;
    }
    c.flash = false;
    if (!D2.hide) { D2.hide = openSpot(ROOMS[roomOf(c)]); setGoal(c, D2.hide); }
    followPath(c, dt, CFG.botSpeed);
    return true;
  }
  // A killing is heard all over its own room, clearly, wherever you stand in it; through a wall only faintly, and only
  // standing within CFG.hearWall of that room; from the middle of the room next door, not at all (Steve, 2026-10-14).
  // What plays is the victim's own death sound, picked at the start.
  function hearing(c, v) {
    const r = roomOf(v);
    if (roomOf(c) === r) return 1 - 0.3 * Math.min(1, dist(c, v) / 900);
    const d = rectDist(c, ROOMS[r]);
    return d < CFG.hearWall ? CFG.hearFaint * (1 - d / CFG.hearWall) : 0;
  }
  // Those who heard it without seeing it remember where it came from (a note for the meeting; bots bring it up there).
  function hearKill(v, cause) {
    const r = roomOf(v), room = ROOMS[r].name;
    for (const c of G.chars) {
      if (c === v) continue;
      const lv = hearing(c, v), near = roomOf(c) === r, distance = dist(c, v);
      const volume = lv || (distance < 2200 ? .16 * (1 - distance / 2600) : 0);
      if (c.isHuman && volume > 0) c.inbox.push({ sfx: 'death', voice: v.deathSfx, who: v.id, vol: +volume.toFixed(3), muffle: !near, at: [v.x, v.y], distant: !near || distance > 540, event: `${v.id}:${G.t}` });
      if (!lv) continue;
      if (!c.alive || canSee(c, v)) continue;
      if (!c.isHuman) { c.heard.push({ t: G.t, room: r, victim: v.id }); continue; }
      if (!(near && cause === 'chandelier')) tell(c, near ? `A scream from ${room}!` : `A faint scream through the wall, from ${room}.`, near); // (under a chandelier the crash says it)
      note(c, `You heard a ${near ? '' : 'faint '}scream from ${room}.`, { hard: false });
    }
  }
  const DEATH = {
    poison: v => [`Your ${v.poisonKind} was poisoned. You're a ghost now. Drift around and watch.`, `${v.name} collapsed!`],
    trap: v => [`${v.trapItem ? v.trapItem[0].toUpperCase() + v.trapItem.slice(1) : 'It'} was rigged. You're a ghost now.`, `${v.name} was electrocuted by ${v.trapItem || 'a machine'}!`],
    blade: () => ["Someone got you from behind. You're a ghost now.", null],
    chandelier: () => ["A chandelier fell on you. You're a ghost now.", null],
    monster: v => ["The monster got you. You're a ghost now.", `The monster got ${v.name}!`],
    drown: (v, by) => [`${by ? appearAs(by).name : 'Someone'} shoved you into the duck pond. You're a ghost now.`, `${v.name} went into the pond!`],
    shot: (v, by) => [`${by ? appearAs(by).name : 'Someone'} shot you. You're a ghost now.`, `${v.name} was shot!`],
  };
  function kill(v, cause, by) {
    const knew = by && v.alive && cause !== 'monster' && canSee(v, by); // (nobody knows who the monster is)
    v.staffInside = null; v.cameraFeed = null; v.alive = false; v.poisonT = 0; v.trapT = 0; v.inspect = null;
    v.killedBy = knew ? appearAs(by).id : null;
    const seenAttacker = by && ['blade', 'monster', 'shiv', 'shot'].includes(cause) ? appearAs(by) : null;
    v.deathScene = { t: G.t, x: v.x, y: v.y, face: v.look ?? v.face, cause, killer: by ? {id: by.id, name: by.name} : null, attacker: seenAttacker ? { color: seenAttacker.color, hat: seenAttacker.hat, monster: cause === 'monster' } : null };
    if (by) by.lastVictim = v.id;
    if (v.seat) { v.seat.occ = null; v.seat = null; v.leftSeatT = G.t; v.posVer++; }
    if (v.target && v.target.claim === v.id) v.target.claim = null;
    if (v.drink) { v.drink.holder = null; v.drink.x = v.x + 18; v.drink.y = v.y + 6; v.drink.dropped = true; v.drink = null; }
    G.bodies.push({ x: v.x, y: v.y, id: v.id, cause, by: by ? by.id : null, drinkId: v.poisonDrink, kind: v.poisonKind, item: v.trapItem || null, reported: false, t: G.t, seenBy: new Set() });
    G.deaths++; G.stats[cause] = (G.stats[cause] || 0) + 1;
    G.fx.push({ kind: cause === 'poison' ? 'bubbles' : cause === 'trap' ? 'sparks' : 'splat', x: v.x, y: v.y, t: 1.5 });
    const [mine, seen] = (DEATH[cause] || DEATH.blade)(v, by);
    if (v.isHuman) { tell(v, mine, true); v.inbox.push({ sfx: 'death', voice: v.deathSfx, who: v.id, vol: 1 }); }
    if (seen) for (const h of humans()) if (h !== v && h.alive && canSee(h, v)) tell(h, seen, true);
    hearKill(v, cause);
    checkOver();
  }

  // ---------- Bots ----------
  function setGoal(c, p) { c.path = route(c, p); c.stuckT = 0; c.stalls = 0; }
  const clear = clearSpot; // standable, with a little room round it (map.js); openSpot(room) comes from there too
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
  // Players stand at the games: taking one doesn't move them, and walking off (CFG.leaveReach) leaves it. The security
  // desk and the VIP sofas are real seats, for players too; bots always take the spot.
  const sitsDown = (c, s) => !c.isHuman || s.game === 'cams' || s.game === 'vip';
  function standUp(c) {
    if (!c.seat) return;
    if (sitsDown(c, c.seat)) { c.x = c.seat.approach.x; c.y = c.seat.approach.y; c.posVer++; }
    c.leftSeatT = G.t; c.seat.occ = null; c.seat = null;
  }
  function sit(c, seat, walkUp = false) {
    if (c.target && c.target.claim === c.id) c.target.claim = null;
    // the game a player just left keeps its late rounds for 8 s, at the table max they saw there (tableRound)
    if (c.isHuman && c.lastGame) c.gone = (c.gone || []).filter(x => G.t - x.t < 8).concat({ game: c.lastGame, t: c.leftSeatT ?? G.t, mb: c.mbPeak || 0 });
    seat.occ = c; seat.claim = null; c.seat = seat; c.lastGame = seat.game; c.mbPeak = Gm.maxBet(G.bank);
    if (sitsDown(c, seat)) { c.x = seat.x; c.y = seat.y; c.face = c.look = seat.face; c.posVer++; }
    if (!walkUp) springTrap(c, seat);
  }
  // A rigged game goes off once someone plays it: a bot as it takes it, a player at their first chip or press there.
  function springTrap(c, seat) {
    const trap = trapAt('seat', seat.id);
    if (trap && !c.isKiller) { removeTrap(trap); c.trapT = CFG.rigDelay; c.trapBy = trap.by; c.trapItem = trap.label; c.trapSeat = seat.id; }
  }
  // Walking up to a free game you face puts you at it, no key (Steve, 2026-10-14): the nearest free spot within
  // joinReach, or from one game a free spot nearer than your own. Walking past one sideways doesn't.
  function walkUp(c) {
    if (c.monster || c.grabbed !== null) return;
    const s = nearest(G.seats.filter(s => !s.occ && !heldOff(s, c) && s.game !== 'cams' && s.game !== 'vip' && Math.abs(angDiff(c.look, s.face)) < CFG.joinFace), c, c.seat ? Math.min(CFG.joinReach, dist(c, c.seat) - 10) : CFG.joinReach);
    if (s) { standUp(c); sit(c, s, true); }
  }
  function botChoose(c) {
    if (sick(c) && G.antidotes > 0 && dist(c, TAP) / CFG.botSpeed < c.poisonT - 1) { c.state = 'antidote'; setGoal(c, { x: TAP.x + rand(-40, 40), y: TAP.y + 10 }); return; }
    if (c.thirst < 45 && !c.drink) { c.state = 'getDrink'; setGoal(c, { x: TAP.x + rand(-80, 80), y: TAP.y + 10 }); return; }
    if (c.hunger < 35) { const b = nearest(G.bowls, c, 1e9); c.state = 'snack'; c.target = b; setGoal(c, { x: b.x, y: b.y }); return; }
    const want = botWants(c);
    if (want) { c.state = 'shop'; c.shopFor = want; setGoal(c, SHADY.stand); return; }
    const r = Math.random();
    if (r < 0.1) { c.state = 'rest'; setGoal(c, pick(REST_SPOTS)); return; }
    if (r < 0.18 && !c.lucky) { const b = pick(G.bowls); c.state = 'snack'; c.target = b; setGoal(c, { x: b.x, y: b.y }); return; }
    if (r < 0.24) { c.state = 'wander'; setGoal(c, openSpot(ROOMS[busyRoom(c)])); return; }
    // People drift toward the action: a seat counts more for every other gambler in its room.
    const free = G.seats.filter(s => !s.occ && !s.claim && !heldOff(s, c) && (s.game !== 'cams' || G.deaths > 0));
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
  // Stakes follow the bank only up to bot.ceil starting banks, so a hot streak can't snowball the crew to the target in a minute.
  const botBet = () => Gm.clampBet(Math.min(G.bank, CFG.startBank * CFG.bot.ceil) * CFG.bot.frac * rand(0.5, 1.5), G.bank);
  function botPlay(c) {
    const s = c.seat, every = CFG.bot.every[s.game];
    if (!every) { c.gameT = 99; return; }
    c.gameT = every * rand(0.7, 1.3); c.betAt = G.t; // chips on the felt (the 'bet' flag in the view: everyone sees the gesture)
    let b = botBet(), m = 0, units = 1;
    switch (s.game) {
      case 'flappy': case 'pusher': case 'claw': { startArcade(c, b); return; }
      case 'skee': { startSkee(c, b); return; }
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
  // A bot wins the crew at most bot.maxWin times its stake, plus bot.comp of it, so the bank climbs steadily through the night
  // instead of one lucky straight up ending it in a minute.
  // Skee-ball is entirely host-owned: clients send only a bounded aim/power and
  // the current round/next-ball sequence. A repeated message cannot pay or roll twice.
  function startSkee(c, bet, after = null) {
    if (!c.seat || c.seat.game !== 'skee' || !Number.isFinite(bet) || bet < Gm.BET.min) return false;
    const lane = c.seat.machine, prior = G.skee[lane];
    if (after !== null && after !== (prior?.id || 0) || prior && prior.phase !== 'done') return false;
    springTrap(c, c.seat);
    G.skee[lane] = skeeNew(++G.skeeSeq, c.seat.id, c.id, Gm.clampBet(bet, G.bank), c.isHuman && luckFor(c).next());
    G.skee[lane].policy = policyFor(c).native('skee:' + G.skee[lane].id);
    c.betAt = G.t;
    return true;
  }
  function skeeGamesTick(dt) {
    for (const r of G.skee) {
      if (!r || r.paid) continue;
      const c = byId(r.player);
      if (!c || !c.seat || c.seat.id !== r.seat || (!c.alive && !c.isHuman)) r.abandoned = true;
      if (r.phase === 'aim' && c && !c.isHuman && !r.abandoned) {
        r.wait += dt;
        if (r.wait > .65) skeeLaunch(r, rand(-.8, .8), rand(.08, .68), r.launched + 1);
      }
      skeeTick(r, dt);
      if (r.phase === 'done' && !r.paid) {
        r.paid = true;
        const back = r.bet * skeeMultiplier(r.score);
        settle(c, r.bet, back, r.policy);
        if (c?.isHuman) { luckFor(c).settle(r.bet, back); tell(c, `${r.score} points · ${skeeMultiplier(r.score)}x return`, back < r.bet, back > r.bet ? 'coin' : back < r.bet ? 'lose' : 'click'); }
      }
    }
  }
  function startArcade(c, bet, after = null) {
    const game = c.seat?.game; if (!['pusher','claw','flappy'].includes(game) || !Number.isFinite(bet) || bet < Gm.BET.min) return false;
    const prior = G.arcade[game]; if ((after !== null && after !== (prior?.id || 0)) || prior && prior.phase !== 'done') return false;
    springTrap(c,c.seat); if (!c.seat) return false;
    const r = arcadeNew(game,++G.arcadeSeq,c.seat.id,c.id,Gm.clampBet(bet,G.bank),c.isHuman && luckFor(c).next());
    r.policy = policyFor(c).native('arcade:'+r.id);G.arcade[game]=r;c.betAt=G.t;return true;
  }
  function arcadeGamesTick(dt) {
    for (const r of Object.values(G.arcade)) {
      if (!r || r.paid) continue; const c = byId(r.player);
      if (!c?.seat || c.seat.id !== r.seat || (!c.alive && !c.isHuman)) r.abandoned = true;
      if (r.phase === 'aim' && c && !c.isHuman && !r.abandoned && r.timer > .8) {
        if(r.game!=='flappy'){arcadeMove(r,rand(-1,1),rand(-1,1),r.seq+1);arcadeDrop(r,r.seq+1);}
      }
      if(r.game==='flappy' && !c?.isHuman && !r.abandoned && (r.phase==='aim'||r.phase==='fly' && r.y < (r.pipes.filter(p=>p.x>.14).sort((a,b)=>a.x-b.x)[0]?.y||.5)-.04)) arcadeDrop(r,r.seq+1);
      arcadeTick(r,dt);
      if (r.phase === 'done' && !r.paid) { r.paid = true;const back=r.bet*arcadeMultiplier(r);r.net=settle(c,r.bet,back,r.policy);
        if(c?.isHuman){luckFor(c).settle(r.bet,back);tell(c,`Paid ${money(back)} / net ${r.net>0?'+':''}${money(r.net||0)}`,back<r.bet,back>r.bet?'coin':'click');}
      }
    }
  }
  function settle(c, staked, back, policy = null) {
    if (c && !c.isHuman) back = Math.min(back, staked * (1 + CFG.bot.maxWin)) + staked * CFG.bot.comp;
    const before = G.bank, net = addBank(back - staked, c, staked);
    if (c && policy) policyFor(c).settle(policy, staked, net);
    return G.bank - before;
  }
  function addBank(delta, c, staked = 0, lucky = !!(c && c.lucky > 0)) {
    if (G.over) return; // the verdict is final: a payout later in the same crash or race loop can't move the bank
    if (lucky && delta > 0) delta = delta * (1 + CFG.luckyBonus);
    let net = Math.round(delta + staked * CFG.comp);
    if (c && c.isHuman && c.isKiller && (net = pitBoss(c, net)) === null) return;
    const x = c ? c.x : BELL.x, y = c ? c.y - 30 : BELL.y;
    if (!net) { G.floats.push({ x, y, text: 'push', color: '#b9ab90', t: 1.6 }); return 0; }
    G.bank = Math.max(0, G.bank + net); logBank();
    if (c) c.won += net; // the leaderboard: what each gambler has won (or lost) the crew
    G.floats.push({ x, y, text: (net > 0 ? '+' : '') + money(net), color: net > 0 ? '#e8c46a' : '#e8443a', t: 1.6, big: Math.abs(net) > G.bank * 0.1 });
    if (net > 0) G.fx.push({ kind: 'chips', x, y: y + 20, t: 1 });
    checkOver(); return net;
  }
  // The bank as it stood at real time t within the last cutoffTime: G.bankLog keeps each change, the oldest that matters first.
  function bankAt(t) { const L = G.bankLog; while (L.length > 1 && L[1].t <= t) L.shift(); return L[0].bank; }
  function logBank() { const rt = G.rt || 0; G.bankLog.push({ t: rt, bank: G.bank }); bankAt(rt - CFG.cutoffTime); }
  // The pit boss (human killers; gamblers only win by growing the bank, so draining it is a killer's game): a killer's net
  // losses in any cutoffTime seconds stay under cutoff of the bank as it stood when they began. The loss that would pass
  // it counts only up to there, and the killer is cut off: for cutoffTime their losses don't count (wins still do).
  // null: refused.
  function pitBoss(c, net) {
    const rt = G.rt || 0, t0 = rt - CFG.cutoffTime, log = c.netLog || (c.netLog = []);
    while (log.length && log[0].t <= t0) log.shift();
    if (net < 0) {
      if (rt < (c.cutT ?? -1)) return null;
      // every window this loss falls in starts somewhere in [t0, now), and the bank holds still between its log's
      // entries: the one starting at t0, then one at each change, each with what this killer netted since it began
      bankAt(t0);
      const L = G.bankLog; let s = log.reduce((a, e) => a + e.net, 0), j = 0, room = CFG.cutoff * L[0].bank + s;
      for (let i = 1; i < L.length && L[i].t < rt; i++) {
        if (L[i + 1] && L[i + 1].t === L[i].t) continue; // (several changes at one moment: the bank once they're all in)
        while (j < log.length && log[j].t <= L[i].t) s -= log[j++].net;
        room = Math.min(room, CFG.cutoff * L[i].bank + s);
      }
      if (-net > room) {
        net = -Math.max(0, Math.floor(room)); c.cutT = rt + CFG.cutoffTime;
        tell(c, 'The pit boss cut you off for a minute: too much lost too fast.', true);
        if (!net) return null;
      }
    }
    log.push({ t: rt, net });
    return net;
  }

  // ---------- Shared rounds: one Crash rocket and one duck race for the whole casino ----------
  function newCrash() { return { phase: 'bet', t: 0, point: Gm.crashPoint(), mult: 1, bets: new Map(), round: G.crash ? G.crash.round + 1 : 1 }; }
  function crashCash(id, b, x) { b.out = x; const c = byId(id); settle(c, b.bet, b.bet * x, b.policy); if (c.isHuman) { luckFor(c).settle(b.bet, b.bet * x); tell(c, `Cashed out at ${x.toFixed(2)}x: +${money(b.bet * (x - 1))}`, false, 'coin'); } }
  function crashTick(dt) {
    const C = G.crash; C.t += dt;
    if (C.phase === 'bet') {
      C.open = (C.open || 0) + dt; // (the bots' clock, as at the race)
      for (const s of G.seats) {
        const c = s.occ;
        if (s.game === 'crash' && c && !c.isHuman && c.alive && !C.bets.has(c.id) && C.open > 1 + (c.id % 4)) C.bets.set(c.id, { bet: botBet(), auto: pick([1.3, 1.5, 1.5, 2, 2, 3, 5, 10]), out: 0 });
      }
      if (!C.bets.size) C.t = 0; // the launch countdown waits for the first bet
      if (C.t >= Gm.CRASH.betTime) {
        for (const [id, b] of C.bets) {
          const c = byId(id);
          if (c.isHuman && luckFor(c).next()) {
            C.point = Math.max(C.point, 1.5);
            b.auto = b.auto ? Math.min(b.auto, 1.5) : 1.5;
            tell(c, 'The house has your back. Hot-streak cash-out is armed.', false, 'chip');
          }
        }
        C.phase = 'fly'; C.t = 0;
      }
    } else if (C.phase === 'fly') {
      C.mult = Math.min(Gm.crashAt(C.t), C.point);
      for (const [id, b] of C.bets) if (!b.out && b.auto && b.auto <= C.mult) crashCash(id, b, b.auto);
      if (C.mult >= C.point) {
        C.phase = 'boom'; C.t = 0;
        for (const [id, b] of C.bets) if (!b.out) { const c = byId(id); settle(c, b.bet, 0, b.policy); if (c.isHuman) { luckFor(c).settle(b.bet, 0); tell(c, `Crashed at ${C.point.toFixed(2)}x. Lost ${money(b.bet)}.`, true); } }
      }
    } else if (C.t >= Gm.CRASH.boomTime) G.crash = newCrash();
  }
  function newRace() { const form = Gm.raceForm(); return { phase: 'bet', t: 0, form, winner: Gm.raceWinner(form), seed: Math.floor(Math.random() * 1000), bets: new Map(), round: G.race ? G.race.round + 1 : 1 }; }
  function launchRace(R) {
    for (const [id,b] of R.bets) { const c=byId(id); b.hot=!!c?.isHuman && luckFor(c).next(); }
    R.phase='run'; R.t=0;
  }
  function raceTick(dt) {
    const R = G.race; R.t += dt;
    if (R.phase === 'bet') {
      R.open = (R.open || 0) + dt; // how long betting has been open (the bots' clock)
      for (const s of G.seats) {
        const c = s.occ;
        if (s.game === 'race' && c && !c.isHuman && c.alive && !R.bets.has(c.id) && R.open > 2 + (c.id % 6)) {
          R.bets.set(c.id, { duck: pickIdx(R.form.p.map(p => Math.sqrt(p))), bet: botBet() });
        }
      }
      if (!R.bets.size) R.t = 0; // the gates wait for the first bet: the first player at the race starts it
      if (R.t >= Gm.RACE.betTime) {
        launchRace(R);
      }
    } else if (R.phase === 'run') {
      if (R.t >= Gm.RACE.runTime) {
        R.phase = 'show'; R.t = 0;
        for (const [id, b] of R.bets) {
          const rolled = Gm.raceBetMult(R.form, b.duck, R.winner), m = b.hot ? Math.max(2, rolled) : rolled, c = byId(id);
          b.back = b.bet * m;
          settle(c, b.bet, b.back, b.policy);
          if (c.isHuman) {
            luckFor(c).settle(b.bet, b.bet * m);
            if (b.hot && !rolled) tell(c, `Hot-streak bonus! Your duck pays 2x: +${money(b.bet)}.`, false, 'coin');
          }
          if (c.isHuman && !(b.hot && !rolled)) tell(c, m ? `${Gm.DUCKS[b.duck].name} wins! You get ${money(b.bet * m)}.` : `${Gm.DUCKS[R.winner].name} wins. Your duck didn't.`, !m, m ? 'coin' : null);
        }
      }
    } else if (R.t >= Gm.RACE.showTime) G.race = newRace();
  }
  function pickIdx(w) { let s = 0; for (const x of w) s += x; let u = Math.random() * s; for (let i = 0; i < w.length; i++) { u -= w[i]; if (u < 0) return i; } return w.length - 1; }
  function botSip(c, d) {
    // A free drink from nobody-knows-who gets a sniff more often than your own order.
    if (d.poisoned && !c.isKiller && Math.random() < D().sniff * (d.from !== null ? 2 : 1) * (d.mx ? d.mx.smell / 0.75 : 1)) { // (whiskey and coffee hide it; a big dose doesn't)
      removeDrink(d);
      callMeeting(c, null, `${c.name} sniffed a free ${d.kind} and smelled bitter almonds. Somebody sent it to kill.`, { drinkId: d.id, owner: c.id, kind: d.kind, sniffed: true });
      return;
    }
    sip(c, d);
  }
  // A bot at the security desk hires a guard with crew money once people start dying (the cameras come on by themselves).
  function botSecurity(c, dt) {
    c.secT = (c.secT ?? rand(3, 8)) - dt;
    if (c.secT > 0) return;
    c.secT = rand(15, 30);
    if (c.isKiller) return;
    if (!G.guard && G.deaths >= 2 && G.bank > price('guard') * 4 && Math.random() < 0.4) buy(c, 'guard');
  }
  function botTick(c, dt) {
    c.moving = false;
    c.glanceT -= dt;
    if (c.glancing > 0) c.glancing -= dt;
    else if (c.glanceT <= 0) { c.glancing = rand(0.8, 1.8); c.glanceOff = rand(-1, 1) * Math.PI; c.glanceT = rand(...D().glance); }
    if (c.grabbed !== null) { c.moving = false; return; }
    if (G.blackout && c.isKiller && G.blackout.by === null) {
      if (c.tfAt == null) c.tfAt = G.blackout.t + (killersAlive().some(o => o.isHuman) ? rand(12, 18) : rand(1.5, 5));
      if (G.blackout.t >= c.tfAt) transform(c);
    }
    if (c.monster) { monsterBrain(c, dt); c.look = c.face; return; }
    if (G.escape && !c.isKiller) botGear(c, dt);
    if (G.exits && !G.exits.closed && !c.isKiller) { exitBrain(c, dt); c.look = c.face; return; }
    if (G.blackout && !c.isKiller && darkBrain(c, dt)) { c.look = c.face; return; }
    if (c.isKiller && killerBrain(c, dt)) { c.look = c.face; return; }
    if (!c.isKiller && c.items.has('gun') && botGun(c)) return;
    if (sick(c) && c.state !== 'antidote' && c.state !== 'seated' && G.antidotes > 0 && !c.isKiller && dist(c, TAP) / CFG.botSpeed < c.poisonT - 1) {
      if (c.target && c.target.claim === c.id) c.target.claim = null;
      c.path = []; c.state = 'idle';
    }
    switch (c.state) {
      case 'idle': botChoose(c); break;
      case 'getDrink':
        if (followPath(c, dt, CFG.botSpeed)) { c.face = -Math.PI / 2; c.wait += dt; if (c.wait > 1.2) { c.wait = 0; pourFor(c); c.state = 'idle'; maybeTreat(c); } }
        break;
      case 'shop':
        if (followPath(c, dt, CFG.botSpeed)) { c.face = 0; c.state = 'idle'; shopBuy(c, c.shopFor); }
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
          } else eatSnack(c, b); // (a killer's own laced bowl doesn't hurt them)
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
        if (c.sitT <= 0 || (!c.drink && c.thirst < 35) || c.hunger < 20 || (sick(c) && G.antidotes > 0 && !c.isKiller)) { standUp(c); c.state = 'idle'; }
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
        goal = h.spot; tgt = TAP; ready = atBar(k); // the bar's own rule (doOrder), anywhere along the counter
      }
      if (!ready) {
        // re-aim at a moving victim without resetting the stuck check, so a blocked killer still recovers
        if (!k.path.length) { h.repath = 0.8; setGoal(k, goal); } else if (h.repath <= 0) { h.repath = 0.8; k.path = route(k, goal); }
        followPath(k, dt, CFG.botSpeed * (h.kind === 'blade' ? 1.15 : 1));
        if (k.state !== 'hunting') return endHunt(k); // stalled out: give the hunt up rather than stand there
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
  // A human killer's suggested target: whoever is closest to naming them (a bot that saw something or suspects them, a
  // player who saw them), else the crew's top winner, else someone nobody is watching. Picked again every preyEvery
  // seconds or when the target dies.
  function preyTick(k, dt) {
    k.preyT = (k.preyT ?? 0) - dt;
    if (k.prey && byId(k.prey.id).alive && k.preyT > 0) return;
    k.preyT = CFG.preyEvery;
    const prey = gamblersAlive(); if (!prey.length) { k.prey = null; return; }
    const top = prey.slice().sort((a, b) => b.won - a.won)[0];
    let best = null, bs = -1;
    for (const v of prey) {
      const saw = v.isHuman ? v.notes.some(n => n.hard && n.who === k.id) : v.witnessed.some(w => w.real === k.id && w.hard);
      const sus = v.isHuman ? 0 : v.sus[k.id] || 0;
      const alone = !G.chars.some(o => o.alive && o !== v && !o.isKiller && canSee(o, v));
      const why = saw ? 'saw you do something' : sus > 40 ? 'suspects you' : v === top && v.won > 0 ? 'winning big for the crew' : alone ? 'on their own right now' : 'nobody special';
      const s = (saw ? 300 : 0) + Math.min(200, sus * 2) + (v === top && v.won > 0 ? 80 : 0) + (alone ? 40 : 0) + Math.random() * 10;
      if (s > bs) { bs = s; best = { id: v.id, why }; }
    }
    k.prey = best;
  }
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
        if (c === v || !c.alive || c.monster || !canSee(v, c)) continue; // (the monster is nobody you know)
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
        if (G.big && G.t - G.meetEnd < CFG.reportCalm) continue; // a big room: the bots let a busy stretch pass first (CFG.reportCalm)
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
    if (g.alive || g.isKiller || g.hauntUsed || !target || !target.alive) return false;
    g.hauntUsed = true;
    G.haunts.push({ by: g.id, on: target.id, t: CFG.hauntTime });
    for (const o of G.chars) {
      if (!o.alive || o === target || dist(o, target) > CFG.viewRange || !los(o, target)) continue;
      if (o.isHuman) tell(o, `A chill runs through the room. The candles around ${appearAs(target).name} flicker.`, false, 'haunt');
      else if (!o.isKiller) o.sus[target.id] += CFG.hauntSus;
    }
    if (target.isHuman) tell(target, 'Something cold brushes your neck.', true, 'gasp');
    if (g.isHuman) tell(g, `You haunt ${appearAs(target).name}. Anyone who can see them feels the chill.`, false, 'haunt');
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
    if (G.mode !== 'play' || G.escape) return; // (escape mode has no meetings)
    // nobody gathers in the dark: the first meeting called in a blackout is held as the lights come back on (and it
    // takes in every body lying there by then)
    if (G.blackout) { if (!G.afterDark) G.afterDark = [caller, body, reason, spiked]; if (caller && caller.isHuman) tell(caller, 'Nobody can gather in the dark. Security comes when the power is back on.'); return; }
    if (G.big && caller && !caller.isHuman && !body && G.t - G.meetEnd < CFG.reportCalm) return; // a big room: a bot keeps a foiled plot to itself for now (CFG.reportCalm)
    // One meeting at a time. It no longer stops the night (Steve, 2026-10-15): it runs on everyone's phone (Tab) while
    // the casino carries on, and a player can ignore it and keep playing. A body found while one is on waits for the next.
    if (G.meeting) { if (caller && caller.isHuman) tell(caller, 'A meeting is already on. Tab opens it on your phone.'); return; }
    G.pending = null; G.stats.meetings++;
    const victims = G.bodies.filter(b => !b.reported);
    victims.forEach(b => { b.reported = true; });
    for (const c of G.chars) { c.voted = null; c.accused = false; c.chatN = 0; }
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
    // the notification on everyone's phone
    const dead = victims.map(v => byId(v.id).name);
    const what = dead.length ? `${nameList(dead)} ${dead.length > 1 ? 'were' : 'was'} found murdered.` : G.meeting.title + '.';
    for (const h of humans()) h.inbox.push({ text: what, bad: true, sfx: 'meeting', phone: G.meeting.title });
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
      ej.staffInside = null; ej.cameraFeed = null; ej.alive = false; ej.ejected = true; ej.poisonT = 0; ej.trapT = 0; ej.inspect = null;
      if (ej.seat) { ej.seat.occ = null; ej.seat = null; ej.leftSeatT = G.t; }
      if (ej.monster) endBlackout('fixed');
      if (ej.target && ej.target.claim === ej.id) ej.target.claim = null;
      if (ej.drink) { const d = ej.drink; ej.drink = null; removeDrink(d); }
      ej.posVer++;
      const left = killersAlive().length;
      m.ejected = ej.id; m.ejectedKiller = ej.isKiller;
      m.result = ej.isKiller
        ? `${ej.name} got thrown out by security. ${ej.name} WAS ${G.killerIds.length > 1 ? 'a' : 'the'} killer.${left ? ` ${left} killer${left > 1 ? 's remain' : ' remains'}.` : ''}`
        : `${ej.name} got thrown out by security. ${ej.name} was NOT ${G.killerIds.length > 1 ? 'a' : 'the'} killer.`;
      if (ej.isHuman) tell(ej, "Security threw you out. You're a ghost now.", true);
    }
    talk.after(m, ej);
    m.talkT = 1.2; m.resultT = CFG.resultTime + m.talk.replies.length * 1.8;
    for (const h of humans()) sfxTo(h, ej ? (ej.isKiller ? 'cheer' : 'boo') : 'chat');
  }
  // Nobody was moved for it, so nobody is moved back: the bodies it was about are taken away, and that's all.
  function endMeeting() {
    const m = G.meeting, msg = m.result;
    G.bodies = G.bodies.filter(b => !m.victims.includes(b.id));
    for (const d of G.drinks.filter(d => d.dropped && m.victims.includes(d.owner))) removeDrink(d);
    for (const c of G.chars) c.hauntUsed = false;
    G.haunts = [];
    G.meeting = null; G.meetEnd = G.t;
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
    if (G.escape) return escapeOver(k, g, kn, was);
    if (!k) { killersWin = false; text = `${kn} ${was}, and security dragged ${G.killerIds.length > 1 ? 'them' : 'them'} out.`; }
    else if (k >= g) { killersWin = true; text = `${kn} ${was}. Last call came for everyone.`; }
    else if (G.closed) { killersWin = true; text = `Closing time. The crew never broke the bank, and ${kn} walked out free.`; }
    else if (G.bank >= G.target) { killersWin = false; text = `The crew broke the bank with ${money(G.bank)}. ${kn} ${was}, and it didn't matter.`; }
    if (killersWin === null) return;
    G.over = { killersWin, text, killers: G.killerIds.slice(), edges: G.killerIds.filter(id => byId(id).perk).map(id => ({ name: byId(id).name, perk: byId(id).perk })), t: G.t, stats: Object.assign({}, G.stats) };
    for (const h of humans()) sfxTo(h, (killersWin === h.isKiller) ? 'win' : 'lose');
  }

  // Escape mode is over when nobody is left inside to get out, or the exits shut. The killers win only if nobody got out.
  function escapeOver(k, g, kn, was) {
    const out = G.chars.filter(c => c.escaped), all = G.chars.filter(c => !c.isKiller).length;
    if (k && g && !(G.exits && G.exits.closed)) return;
    const killersWin = !!k && !out.length;
    const text = !k ? `${kn} ${was}, and ${G.killerIds.length > 1 ? 'they are' : 'they are'} dead. Everyone left walks out.`
      : !out.length ? `${kn} ${was}. Nobody got out.`
      : `${nameList(out.map(c => c.name))} got out (${out.length} of ${all}). ${kn} ${was}.`;
    G.over = { killersWin, text, escape: true, out: out.map(c => c.id), killers: G.killerIds.slice(), edges: G.killerIds.filter(id => byId(id).perk).map(id => ({ name: byId(id).name, perk: byId(id).perk })), t: G.t, stats: Object.assign({}, G.stats) };
    for (const h of humans()) sfxTo(h, wonEscape(h) ? 'win' : 'lose');
  }
  const wonEscape = c => c.isKiller ? G.over.killersWin : !!c.escaped || (c.alive && !killersAlive().length);

  // ---------- Security: the cameras run whenever someone sits at the security desk; a guard is hired from the crew bank there ----------
  const price = item => Gm.niceDown(G.target * CFG[item + 'Price']);
  function buy(c, item) {
    if (G.over || item !== 'guard') return;
    const p = price(item);
    if (G.guard) return tell(c, 'The guard is already on patrol.');
    if (G.bank < p * 2) return tell(c, `The crew bank can't spare ${money(p)} right now.`);
    G.bank -= p; logBank();
    G.floats.push({ x: c.x, y: c.y - 30, text: '-' + money(p), color: '#e8443a', t: 1.6 });
    const who = appearAs(c).name, sp = { x: c.x + 60, y: c.y };
    G.guard = { id: -1, isGuard: true, alive: true, name: 'the guard', x: sp.x, y: sp.y, face: 0, look: 0, path: [], t: CFG.guardTime, stuckT: 0, stalls: 0, lastPos: { x: 0, y: 0 }, wait: 0, moving: false };
    tellAll(`${who} hired a security guard for ${CFG.guardTime / 60} minutes (${money(p)} from the crew bank). The guard reports anything they see.`, false, 'coin');
    return true;
  }
  const FEEDS = ['floor', 'bar', 'arcade', 'race', 'slots', 'vip'];
  function guardTick(dt) {
    const g = G.guard; g.t -= dt; g.moving = false;
    if (g.t <= 0) { G.guard = null; tellAll("The security guard's shift is over."); return; }
    if (followPath(g, dt, CFG.guardSpeed)) { g.wait += dt; if (g.wait > 3) { g.wait = 0; setGoal(g, openSpot(ROOMS[pick(FEEDS)])); } }
    g.look = g.face + Math.sin(G.t * 1.3) * 0.9; // the guard sweeps the room
  }

  // ---------- Human actions ----------
  function nearest(list, p, max) { let best = null, bd = max; for (const o of list) { const d = dist(o, p); if (d < bd) { bd = d; best = o; } } return best; }
  // ---------- Killer edges ----------
  const staffDoorAt = c => STAFF_DOORS.find(d => Math.hypot(c.x - d.sx, c.y - d.sy) < 50) || null;
  function usePerk(c, k, arg) {
    if (c.perk !== k) return;
    if (c.cd[k] > 0) return tell(c, `Ready in ${secs(c.cd[k])}.`);
    if (k === 'sense') { c.senseT = CFG.senseDur; c.cd.sense = CFG.senseCd; sfxTo(c, 'haunt'); return; }
    if (c.seat) return tell(c, 'Step away from the game first.');
    if (k === 'lure') { if (Object.hasOwn(ROOMS, arg)) lure(c, arg); else tell(c, 'Pick a room for the siren.'); return; }
    const from = staffDoorAt(c), to = STAFF_DOORS[+arg];
    if (arg === undefined && from && c.isHuman && !c.monster) {
      for (const w of witnessesOf(c)) remember(w,c,'staff',null,`slip through the STAFF ONLY door in ${ROOMS[from.room].name}`,15,false);
      c.staffInside = { from: from.id }; c.cameraFeed = from.room; c.path = []; c.inspect = null; c.moving = false; c.sprinting = false; c.posVer++;
      sfxTo(c,'door'); return;
    }
    if (!from) tell(c, 'Stand at a STAFF ONLY door.');
    else if (!to || to === from) tell(c, 'Pick another door.');
    else staffWalk(c, from, to);
  }
  // Through the staff corridors: in one door, out of another. Anyone who sees either end remembers it (not proof).
  function staffWalk(k, from, to, fromPassage = false) {
    if (!fromPassage) for (const w of witnessesOf(k)) remember(w, k, 'staff', null, `slip through the STAFF ONLY door in ${ROOMS[from.room].name}`, 15, false);
    if (k.drink) { k.drink.x = to.sx; k.drink.y = to.sy; }
    k.x = to.sx; k.y = to.sy; k.face = k.look = to.face; k.path = []; k.inspect = null; k.posVer++; k.cd.staff = CFG.staffCd;
    for (const w of witnessesOf(k)) remember(w, k, 'staff', null, `come out of the STAFF ONLY door in ${ROOMS[to.room].name}`, 15, false);
    for (const c of humans()) if (c.alive && (dist(c, from) < 300 || dist(c, to) < 300)) sfxTo(c, 'door');
  }
  // A jackpot siren in a room: a fake win on a machine there. Gamblers wander over to look; a few leave their games.
  function lure(k, room) {
    const r = ROOMS[room], seats = G.seats.filter(s => roomOf(s) === room && s.game !== 'cams');
    const at = room === 'slots' ? JACKPOT : seats.length ? pick(seats) : openSpot(r);
    G.lure = { room, x: at.x, y: at.y, t: CFG.lureDur }; k.cd.lure = CFG.lureCd;
    for (const c of humans()) tell(c, c === k ? `The siren is going off in ${r.name}. Watch them come.` : `JACKPOT! Sirens are going off in ${r.name}!`, false, 'jackpot');
    for (const c of G.chars) {
      if (!c.alive || c.isHuman || c.isKiller || roomOf(c) === room || ['antidote', 'getDrink', 'inspect'].includes(c.state)) continue;
      if (Math.random() > CFG.lurePull * (c.seat ? 0.4 : 1)) continue;
      if (c.seat) standUp(c);
      if (c.target && c.target.claim === c.id) c.target.claim = null;
      let spot = null;
      for (let i = 0; i < 12 && !spot; i++) { const p = { x: at.x + rand(-140, 140), y: at.y + rand(-140, 140) }; if (roomOf(p) === room && clearSpot(p)) spot = p; }
      c.state = 'wander'; c.wait = -6; c.target = null; setGoal(c, spot || openSpot(r)); // (and they hang about a while)
    }
  }
  function contextFor(c) {
    if (G.mode !== 'play' || G.over) return null;
    if (!c.alive) {
      if (c.cameraFeed) return { label: 'Close the cameras', act: () => { c.cameraFeed = null; } };
      const desk = nearest(G.seats.filter(s => s.game === 'cams'), c, CFG.joinReach);
      return desk ? { label: 'Watch the cameras', act: () => { c.cameraFeed = 'floor'; } } : null;
    }
    const body = G.bodies.find(b => !b.reported && dist(b, c) < 90 && canSee(c, b));
    if (body && !G.escape) return { label: 'Report body', act: () => callMeeting(c, body, `${c.name} found ${byId(body.id).name}'s body.`) };
    if (c.seat && sitsDown(c, c.seat)) return { label: 'Stand up', act: () => standUp(c) }; // (at a game E presses what you aim at)
    const door = c.isKiller && c.perk === 'staff' ? staffDoorAt(c) : null;
    if (door) return { label: 'Take the staff passage', act: () => usePerk(c, 'staff') }; // enters the private camera passage
    if (atBar(c)) {
      if (sick(c) && G.antidotes > 0) return { label: `Take the antidote (${G.antidotes} left)`, act: () => takeAntidote(c) }; // once it's felt
      return { label: 'Talk to the bartender', act: () => { if (!c.isHuman) pourFor(c); } }; // (a player's own screen opens the mixer: bar.js)
    }
    if (atShady(c)) return { label: 'Talk to the shady guy', act: () => {} }; // (his wares: bar.js)
    if (dist(c, BELL) < 60 && !c.bellUsed && !G.escape) return { label: 'Ring the pit bell', act: () => { c.bellUsed = true; callMeeting(c, null, `${c.name} rang the pit bell.`); } };
    // the security desk and the VIP sofas are real seats (the games take you as you walk up to them)
    const seat = nearest(G.seats.filter(s => !s.occ && (s.game === 'cams' || s.game === 'vip')), c, CFG.joinReach);
    if (seat) return { label: seat.game === 'cams' ? 'Sit at the security desk' : 'Sit down', act: () => { standUp(c); sit(c, seat); } };
    const bowl = G.bowls.find(b => dist(b, c) < CFG.reach + 5);
    if (bowl && (!c.lucky || c.hunger < 90)) return { label: 'Eat ' + ['a doughnut', 'a pretzel', 'a hot dog'][bowl.id % 3], act: () => eatSnack(c, bowl) };
    return null;
  }
  // Inspect: the game you play (wherever along it you stand), or a game or snack bowl in reach that you face, comes
  // first, then your drink, then any game or bowl in reach. (A game's machine stands 40 px in front of its spot.)
  function inspectTarget(c) {
    const facing = p => Math.abs(angDiff(Math.atan2(p.y - c.y, p.x - c.x), c.look)) < Math.PI / 4;
    const games = G.seats.filter(s => (!s.occ || s.occ === c) && s.game !== 'cams' && s.game !== 'vip');
    const atGame = s => facing({ x: s.x + Math.cos(s.face) * 40, y: s.y + Math.sin(s.face) * 40 });
    const s = (games.includes(c.seat) && c.seat) || nearest(games.filter(atGame), c, CFG.reach + 20), b = nearest(G.bowls.filter(facing), c, CFG.reach + 10);
    if (s || b) return s ? { kind: 'seat', s } : { kind: 'bowl', b };
    if (c.drink) return { kind: 'drink', d: c.drink };
    const s2 = nearest(games, c, CFG.reach + 20), b2 = nearest(G.bowls, c, CFG.reach + 10);
    return s2 ? { kind: 'seat', s: s2 } : b2 ? { kind: 'bowl', b: b2 } : null;
  }
  function finishInspect(c, x) {
    if (x.kind === 'drink') {
      if (!G.drinks.includes(x.d)) return;
      if (x.d.poisoned) { tell(c, `Bitter almonds. Your ${x.d.kind} is POISONED.${x.d.from !== null ? ' It came from the bar, "on the house".' : ''}`, true, 'poison'); if (!c.isKiller) note(c, `Your ${x.d.kind} was poisoned${x.d.from !== null ? ', sent from the bar' : ''}.`, { hard: true }); }
      else tell(c, `Smells like a perfectly normal ${x.d.kind}.`);
    } else if (x.kind === 'seat') {
      // a game you took has its fuse burning already (sit took the trap off it): checking it in time still saves you
      const trap = trapAt('seat', x.s.id) || (c.trapT > 0 && c.trapSeat === x.s.id ? { label: c.trapItem, lit: true } : null);
      if (trap) {
        if (trap.lit) c.trapT = 0; else removeTrap(trap);
        tell(c, `A wire where no wire should be: ${trap.label} was rigged to kill. You pulled it out.`, true, 'poison'); if (!c.isKiller) note(c, `${trap.label[0].toUpperCase() + trap.label.slice(1)} was rigged. You disarmed it.`, { hard: true });
      } else { const what = (RIG_LABEL[x.s.game] || GAME_NAMES[x.s.game]).replace(/^the /, 'The '); tell(c, `${what} ${/(chips|dice)$/.test(what) ? 'look' : 'looks'} fine.`); }
    } else {
      const trap = trapAt('bowl', x.b.id);
      if (trap) { removeTrap(trap); tell(c, 'Bitter almonds. These pretzels are POISONED. You tipped them out.', true, 'poison'); if (!c.isKiller) note(c, 'The snack bowl was poisoned.', { hard: true }); }
      else tell(c, 'Just salty pretzels.');
    }
  }
  const living = id => { const o = byId(id); return o && o.alive && !o.staffInside ? o : null; };
  const mbOf = c => Math.max(Gm.maxBet(G.bank), c.mbPeak || 0);
  // A player's settlements are metered: about one max bet a second reaches the bank (no real table turns faster), four
  // in a burst (a split blackjack hand with both halves doubled), and each table's rounds no faster than it deals them
  // (pace). A settlement over that waits its turn, in order, and is paid whole (one rounding, its lucky bonus as it
  // stood when the round ended) once the meter covers it (a full meter always pays the next one); tick calls this too,
  // meetings included. Nothing owed is paid after the verdict. A round counts in the max bet it was played under (o.mb):
  // counted in the max of the moment, a bank that fell meanwhile made one round drain the meter for minutes.
  function payOwed(c) {
    const mb = mbOf(c), rt = G.rt || 0;
    c.bankAllow = Math.min(4, (c.bankAllow ?? 4) + (rt - (c.bankT ?? rt))); c.bankT = rt;
    while (c.owed.length && !G.over) {
      const o = c.owed[0], u = o.mb || mb, p = o.g ? pace(c, o.g, rt) : null;
      const cost = !p ? 0 : o.g === 'plinko' ? Math.max(o.b / (u + Gm.BET.min), 1 / CFG.plinkoBalls) : 1;
      if (!(o.b <= c.bankAllow * u + 1e-6 || c.bankAllow >= 4 - 1e-9) || (p && p.n < cost - 1e-9)) break;
      c.owed.shift();
      c.bankAllow -= o.b / u; if (p) p.n -= cost;
      const net = addBank(o.d, c, o.b, o.lucky);
      if (o.receipt) policyFor(c).paid(o.receipt, net);
    }
  }
  // A table's pace: one round's worth comes back every Gm.ROUND_MIN seconds, up to CFG.paceBurst. Plinko's is a max bet
  // riding (its balls fall together), every other table's a round.
  function pace(c, g, rt) {
    const p = (c.pace || (c.pace = {}))[g] || (c.pace[g] = { n: CFG.paceBurst, t: rt });
    p.n = Math.min(CFG.paceBurst, p.n + (rt - p.t) / Gm.ROUND_MIN[g]); p.t = rt;
    return p;
  }
  // A finished round a player's table reports, { d: back - stake, b: stake }. Only what that table can really do counts:
  // a stake over nothing and within its max (blackjack: four of them, a split with both halves doubled; a dollar or ten
  // over from the MAX button), at most its top payout (and at blackjack only a one-bet hand pays 2 to 1), at a game the
  // player is at or left under 8 s ago (sit keeps the one before). It joins the queue; anything else is dropped.
  function tableRound(c, d, b, arg = {}) {
    if (!(b > 0) || !isFinite(b) || !isFinite(d) || d < -b || (c.owed && c.owed.length >= CFG.owedMax)) return false;
    if (!arg.tickets && policyBooks.get(c.id)?.requiresReceipt()) return false;
    const receipt = arg.tickets ? policyFor(c).inspect(arg.tickets, b) : null;
    if (arg.tickets && !receipt) return false;
    const near = c.seat ? c.seat.game : G.t - (c.leftSeatT ?? -99) < 8 ? c.lastGame : null;
    // (a receipt names its own game: a round from a machine left running in the background, tables.js bg)
    for (const { game: g, mb: seen } of [...(receipt ? [{ game: receipt.r.game }] : []), { game: near }, ...(c.gone || []).filter(x => G.t - x.t < 8)]) {
      const mb = Math.max(mbOf(c), seen || 0), m = mb + Gm.BET.min;
      if (receipt && receipt.r.game !== g) continue;
      if (!Gm.GAME_MAX[g] || b > (g === 'bj' ? 4 : 1) * m || d > (g === 'bj' && b > m ? b : b * (Gm.GAME_MAX[g] - 1))) continue;
      (c.owed || (c.owed = [])).push({ d, b, g, mb, lucky: c.lucky > 0, receipt: receipt ? policyFor(c).accept(receipt, !!arg.last) : null });
      return true;
    }
    return false;
  }
  const GHOST_PLAYS = new Set(['crash', 'cashout', 'race', 'play', 'cameras', 'feed', 'skee', 'arcade']);
  function action(id, k, arg) {
    const c = byId(id); if (!c || !c.isHuman || G.over) return;
    if (c.staffInside && c.alive && G.mode === 'play') {
      if (k === 'feed' && STAFF_DOORS.some(d=>d.room===arg)) c.cameraFeed = arg;
      if (k === 'staffexit') {
        const from = STAFF_DOORS[c.staffInside.from], to = STAFF_DOORS.find(d=>d.room===c.cameraFeed) || from;
        c.staffInside = null; c.cameraFeed = null; staffWalk(c,from,to,true);
      }
      return;
    }
    if (G.mode === 'pick') {
      if (k === 'perk' && c.isKiller && Object.hasOwn(PERK, arg)) c.perk = arg;
      else if (k === 'ready' && G.pickEarly) G.pickReady = true; // solo: start the night now
      return;
    }
    if (G.mode === 'play' && k === 'tableBet') { // at your game, or one of yours still running (tableHold)
      const at = arg && Number.isInteger(arg.seat) ? G.seats[arg.seat] : null, s = at && (at === c.seat || G.held.get(at.id) === c.id) ? at : c.seat;
      if (s && Gm.GAME_MAX[s.game] && arg) policyFor(c).begin(arg, s.game, mbOf(c) + Gm.BET.min);
      return;
    }
    if (G.mode === 'play' && k === 'tableHold') { // the machines you left running (at most 16), free ones only
      for (const [id, h] of G.held) if (h === c.id) G.held.delete(id);
      if (c.alive && arg && Array.isArray(arg.seats)) for (const id of arg.seats.slice(0, 16)) {
        const s = Number.isInteger(id) ? G.seats[id] : null;
        if (s && Gm.GAME_MAX[s.game] && (!s.occ || s.occ === c) && !heldOff(s, c)) G.held.set(id, c.id);
      }
      return;
    }
    if (G.mode === 'play' && k === 'tableStake') {
      if (arg) policyFor(c).increase(arg.id, arg.b, 4 * (mbOf(c) + Gm.BET.min));
      return;
    }
    if (G.mode === 'play' && k === 'insurance') {
      const busy = G.crash.bets.has(c.id) && !G.crash.bets.get(c.id).out && G.crash.phase !== 'boom' || G.race.bets.has(c.id) && G.race.phase !== 'show' || G.skee.some(r => r && r.player === c.id && r.phase !== 'done') || Object.values(G.arcade).some(r => r && r.player === c.id && r.phase !== 'done');
      if (c.alive && !c.monster && c.items.has('insurance')) {
        if (policyFor(c).view().state === 'armed') return;
        if (policyFor(c).activate(busy)) tell(c, 'Insurance armed for your next round.', false, 'chip');
        else tell(c, 'Finish this round before arming insurance.');
      }
      return;
    }
    if (k === 'bank') { // a finished round at a table (also one decided before you died)
      if (arg && G.mode === 'play') tableRound(c, +arg.d, +arg.b, arg);
      if (G.mode === 'play' && c.seat) c.betAt = G.t; // the chips that ride the next round
      if (c.owed && c.owed.length) payOwed(c);
      return;
    }
    if (typeof arg === 'string' && (k === 'vote' || k === 'accuse' || k === 'haunt') && arg !== '' && isFinite(arg)) arg = +arg;
    if (G.meeting && (k === 'chat' || k === 'vote' || k === 'accuse')) { // on the phone, while the night goes on
      const m = G.meeting;
      if (k === 'chat' && c.alive && typeof arg === 'string' && (c.chatN || 0) < CFG.chatMax) {
        const text = arg.replace(/\s+/g, ' ').trim().slice(0, 140);
        if (text) { c.chatN = (c.chatN || 0) + 1; m.lines.push({ who: c.id, text, emo: 'calm' }); for (const h of humans()) sfxTo(h, 'chat'); if (m.phase !== 'result') talk.hear(m, c, text); }
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
      if (c.isKiller) return tell(c, "Killers don't haunt. Watch the crew squirm.");
      if (c.hauntUsed) return tell(c, 'You can haunt again after the next meeting.');
      if (!haunt(c, living(arg))) tell(c, 'Pick someone alive to haunt.');
      return;
    }
    if (k === 'use') { if (c.monster || c.grabbed !== null) return; const x = contextFor(c); if (x) x.act(); return; }
    if (k === 'leave') { standUp(c); return; }
    if ((!c.alive && !GHOST_PLAYS.has(k)) || c.grabbed !== null) return; // ghosts keep playing the games (Steve, 2026-10-15)
    if (k === 'flash') { if (G.blackout && !c.isKiller) c.flash = !c.flash; return; }
    if (k === 'gear') { buyGear(c, arg); return; }
    if (k === 'shop') { shopBuy(c, arg); return; }
    if (k === 'transform') {
      if (c.isKiller && !transform(c) && !c.monster) tell(c, !G.blackout ? 'You can turn into the monster only while the power is out (6: Blackout).' : 'Your partner is already the monster.');
      return;
    }
    if (c.monster) { // the monster does one thing
      if (k === 'blade') {
        const v = nearest(G.chars.filter(o => o.alive && !o.isKiller && o.grabbed === null && (dist(o, c) < 30 || Math.abs(angDiff(Math.atan2(o.y - c.y, o.x - c.x), c.look)) < 1.2)), c, CFG.monsterReach + 12);
        if (!doMaul(c, v)) tell(c, c.grab ? 'Busy.' : c.leap ? 'Mid-pounce.' : 'Nobody within reach.');
      } else if (k === 'leap') {
        if (!doLeap(c) && !c.leap) tell(c, c.grab ? 'Busy.' : c.leapCd > 0 ? `Pounce ready in ${Math.ceil(c.leapCd)}s.` : 'Not yet.');
      } else tell(c, "You're the monster. Left-click to grab whoever you catch, Shift to leap.");
      return;
    }
    if (k === 'arcade' && arg && ['pusher','claw','flappy'].includes(c.seat?.game)) {
      if (arg.kind === 'start' && Number.isSafeInteger(arg.after) && arg.after >= 0) startArcade(c,arg.bet,arg.after);
      else { const r=G.arcade[c.seat.game];if(r && r.player===c.id && r.seat===c.seat.id && r.id===arg.round) {
        const ok=arg.kind==='move'&&r.game!=='flappy'?arcadeMove(r,arg.dx,arg.dz,arg.sequence):arg.kind==='drop'?arcadeDrop(r,arg.sequence):false;
        if(ok)c.betAt=G.t;
      }}
      return;
    }
    if (k === 'skee' && arg && c.seat?.game === 'skee') {
      if (arg.kind === 'start' && Number.isSafeInteger(arg.after) && arg.after >= 0) startSkee(c, arg.bet, arg.after);
      else if (arg.kind === 'roll') {
        const r = G.skee[c.seat.machine];
        if (r && r.player === c.id && r.id === arg.round && r.seat === c.seat.id) {
          if (skeeLaunch(r, arg.aim, arg.power, arg.sequence)) { c.betAt = G.t; sfxTo(c, 'dice'); }
        }
      }
      return;
    }
    if (k === 'mix') {
      if (arg && typeof arg === 'object') mixDrink(c, byId(arg.to), arg.parts);
    } else if (k === 'shoot') {
      if (c.seat && sitsDown(c, c.seat)) tell(c, 'Stand up first.'); else shoot(c);
    } else if (k === 'sip') {
      if (c.drink) sip(c, c.drink); else tell(c, 'You have nothing to drink. The bar is in the north-west corner.');
    } else if (k === 'sniff' || k === 'inspect') {
      const x = k === 'sniff' ? (c.drink ? { kind: 'drink', d: c.drink } : null) : inspectTarget(c);
      if (x) { c.inspect = Object.assign(x, { t: CFG.inspectTime }); tell(c, x.kind === 'drink' ? 'Sniffing... hold still.' : 'Checking it over... hold still.'); } else tell(c, 'Nothing within reach to check.');
    } else if (k === 'pour') {
      if (c.drink) { const d = c.drink; removeDrink(d); tell(c, `You poured out your ${d.kind}.`, false, 'pour'); }
    } else if (k === 'antidote') {
      if (!atBar(c)) tell(c, 'The antidote is behind the bar.'); else if (!takeAntidote(c)) tell(c, sick(c) ? 'The antidote is gone.' : "You don't need it. Yet.");
    } else if (k === 'send') {
      const to = living(arg);
      if (!atBar(c)) tell(c, 'Drinks are sent from the bar.'); else if (!to || to === c) tell(c, 'Pick someone to send a drink to.'); else sendDrink(c, to, false);
    } else if (k === 'cameras' && !c.alive) {
      c.cameraFeed = c.cameraFeed ? null : 'floor';
    } else if (k === 'feed' && FEEDS.includes(arg)) {
      if (!c.alive) c.cameraFeed = arg;
      else if (c.seat && c.seat.game === 'cams') { G.security.feed = arg; G.security.feedT = 12; }
    } else if (k === 'buy' && arg === 'guard') {
      if (!c.seat || c.seat.game !== 'cams') tell(c, 'The guard is hired at the security desk.'); else buy(c, arg);
    } else if (k === 'crash' && c.seat && c.seat.game === 'crash' && G.crash.phase === 'bet' && arg && isFinite(arg.bet)) {
      // the chips on the felt are the bet: they change until launch, and taking them back withdraws it
      if (!(arg.bet > 0)) { policyFor(c).cancel(G.crash.bets.get(c.id)?.policy); G.crash.bets.delete(c.id); return; }
      const auto = isFinite(arg.auto) && arg.auto >= 1.01 ? Math.min(arg.auto, Gm.CRASH.cap) : 0, had = G.crash.bets.has(c.id);
      springTrap(c, c.seat);
      G.crash.bets.set(c.id, { bet: Gm.clampBet(arg.bet, G.bank), auto, out: 0, policy: had ? G.crash.bets.get(c.id).policy : policyFor(c).native('crash:' + G.crash.round) }); if (!had) sfxTo(c, 'chip');
    } else if (k === 'cashout' && G.crash.phase === 'fly') {
      const b = G.crash.bets.get(c.id); if (b && !b.out) crashCash(c.id, b, G.crash.mult);
    } else if (k === 'race' && c.seat && c.seat.game === 'race' && G.race.phase === 'bet' && arg && isFinite(arg.bet) && arg.duck >= 0 && arg.duck < Gm.DUCKS.length) {
      if (!(arg.bet > 0)) { policyFor(c).cancel(G.race.bets.get(c.id)?.policy); G.race.bets.delete(c.id); return; } // (as at Crash: the chips on a lane are the bet until the gates)
      const had = G.race.bets.has(c.id); springTrap(c, c.seat);
      G.race.bets.set(c.id, { duck: arg.duck | 0, bet: Gm.clampBet(arg.bet, G.bank), policy: had ? G.race.bets.get(c.id).policy : policyFor(c).native('race:' + G.race.round) }); if (!had) sfxTo(c, 'chip');
      launchRace(G.race);
    } else if (k === 'play') { // the first chip or press at a game: a rigged one goes off now
      if (c.seat && !sitsDown(c, c.seat)) springTrap(c, c.seat);
      if (c.seat) c.betAt = G.t;
    } else if (c.isKiller && (k === 'sense' || k === 'lure' || k === 'staff')) {
      usePerk(c, k, arg);
    } else if (c.isKiller && KILLS.concat(['disguise', 'lights']).includes(k)) {
      if (c.cd[k] > 0) return tell(c, `Ready in ${secs(c.cd[k])}.`);
      if (k === 'order') {
        const v = living(arg);
        if (!atBar(c)) tell(c, 'Poisoned drinks are ordered at the bar.');
        else if (!v || v.isKiller) tell(c, 'Pick a gambler to send it to.');
        else doOrder(c, v);
      } else if (k === 'rig') { const t = rigTarget(c); if (!t) tell(c, 'Get next to a game nobody is playing, or a snack bowl.'); else doRig(c, t); }
      else if (k === 'blade') {
        const v = nearest(G.chars.filter(o => o.alive && o !== c && !o.isKiller), c, CFG.reach + 5);
        if (v) doBlade(c, v); else tell(c, 'Get right behind someone.');
      } else if (k === 'accident') { if (!doAccident(c)) tell(c, 'Get next to someone by the duck pond, or under a chandelier\'s chain (stand near one with someone under it).'); }
      else if (k === 'disguise') doDisguise(c);
      else if (!doLights(c)) tell(c, `Lights out ready in ${secs(c.cd.lights)}.`);
    }
  }
  function setInput(id, inp, remote = false) {
    const c = byId(id); if (!c || !c.isHuman || !inp || c.staffInside) return;
    if (inp.posVer !== c.posVer) return; // client hasn't caught up with a teleport yet
    if (remote && G.mode !== 'play') { c.inT = G.t; c.mvBudget = 60; return; }
    const seated = c.seat && sitsDown(c, c.seat);
    if (c.grabbed !== null) { c.moving = false; c.sprinting = false; return; } // in the monster's hands
    if (c.leap) { c.sprinting = false; return; } // the monster mid-pounce, or winded after a miss: the sim has it
    if (!seated && typeof inp.x === 'number' && typeof inp.y === 'number' && isFinite(inp.x) && isFinite(inp.y)) {
      const want = { x: inp.x, y: inp.y }, gap = Math.min(1, G.t - (c.inT ?? G.t));
      if (remote) { // guests: a walking budget that refills with time (a little slack for lag), so bursts of messages can't add up
        // thirst, hunger and the over-the-shoulder camera (the guest's peek flag) slow it just as they slow the walk (main.js moveMe)
        const slow = (Math.round(c.thirst) <= 0 ? CFG.parched : 1) * (Math.round(c.hunger) <= 0 ? CFG.starving : 1) * (inp.peek && c.perk === 'peek' ? CFG.peekSlow : 1);
        const reach = Math.min(60, (c.mvBudget ?? 60) + (c.alive ? CFG.playerSpeed * slow * gearSpeed(c) * (c.monster ? CFG.monsterSpeed : c.sprinting ? CFG.sprint : 1) : CFG.ghostSpeed) * 1.3 * gap), d = dist(c, inp);
        c.inT = G.t;
        if (d > reach) inp = { ...inp, x: c.x + (inp.x - c.x) * reach / d, y: c.y + (inp.y - c.y) * reach / d };
        c.mvBudget = Math.max(0, reach - Math.min(d, reach));
      }
      if (c.inspect && c.inspect.kind !== 'drink' && dist(c, inp) > 3) { c.inspect = null; tell(c, 'Interrupted.'); }
      const tx = clamp(inp.x, 0, W), ty = clamp(inp.y, 0, H);
      if (remote && c.alive) { // in short steps, so a guest's 60 px can't hop a 20 px wall
        const n = Math.max(1, Math.ceil(Math.hypot(tx - c.x, ty - c.y) / 8)), sx = (tx - c.x) / n, sy = (ty - c.y) / n;
        for (let i = 0; i < n; i++) { c.x += sx; c.y += sy; collide(c); }
      } else { c.x = tx; c.y = ty; if (c.alive) collide(c); }
      // a guest the host can't follow (a jump through a wall, a long hitch) is put back where the host has them
      if (remote) { c.farT = dist(c, want) > 150 ? (c.farT || 0) + gap : 0; if (c.farT > 0.6) { c.farT = 0; c.posVer++; } }
      if (c.seat && dist(c, c.seat) > CFG.leaveReach) standUp(c); // walked off from the game
    }
    c.moving = !!inp.moving; c.sprinting = !!inp.sprint && c.moving && c.alive && !seated && !c.monster && c.stamina > 0;
    if (typeof inp.look === 'number' && isFinite(inp.look)) c.look = c.face = Math.atan2(Math.sin(inp.look), Math.cos(inp.look)); // any angle, folded to -PI..PI
    if (seated) { c.face = c.seat.face; if (typeof inp.look !== 'number') c.look = c.seat.face + (inp.lookBack ? Math.PI : 0); } // seated humans turn their head freely
    else if (G.mode === 'play' && !G.over) walkUp(c); // (ghosts too: they keep playing)
  }
  function humanTick(c, dt) {
    if (c.inspect) { c.inspect.t -= dt; if (c.inspect.t <= 0) { const x = c.inspect; c.inspect = null; finishInspect(c, x); } }
  }
  function dropHuman(id) {
    const c = byId(id); if (!c || !c.isHuman) return;
    c.staffInside = null; c.cameraFeed = null; c.isHuman = false; c.netKey = null; c.path = []; c.inspect = null;
    if (c.seat) { c.x = c.seat.x; c.y = c.seat.y; c.face = c.look = c.seat.face; c.posVer++; c.state = 'seated'; c.sitT = rand(5, 15); c.gameT = 2; } else c.state = 'idle';
    tellAll(`${c.name} left. A bot took their place.`);
  }

  // ---------- Tick ----------
  const sick = c => c.poisonT > 0 && (c.poisonMax || CFG.poisonDelay) - c.poisonT > CFG.sickAfter;
  function tick(dt) {
    G.rt = (G.rt || 0) + dt; // real time, meetings included: the settlement meter refills on it
    if (G.mode === 'pick') { pickTick(dt); return; }
    if (G.over) { G.t += dt; return; }
    for (const c of G.chars) {
      if (c.isHuman && c.seat) c.mbPeak = Math.max(c.mbPeak || 0, Gm.maxBet(G.bank));
      if (c.owed && c.owed.length) payOwed(c); // (still paid if a bot has taken over the seat since)
    }
    if (G.over) return;
    G.t += dt;
    if (G.lightsT > 0) G.lightsT -= dt;
    if (G.blackout) { blackoutTick(dt); if (G.over || G.mode !== 'play') return; }
    if (G.escape && !G.blackout && !G.exits && G.t >= CFG.escapeDarkAt && killersAlive().length) doLights(pick(killersAlive()), true);
    if (G.exits && !G.exits.closed) { exitsTick(dt); if (G.over) return; }
    if (G.meeting) { meetingTick(dt); if (G.over) return; }
    if (!G.warned && !G.escape && G.t > CFG.closingTime - CFG.closingWarn) { G.warned = true; tellAll(`Last call! The casino closes in ${CFG.closingWarn / 60} minutes. Break the bank or catch the killer.`, true, 'meeting'); }
    if (G.t >= CFG.closingTime && !G.escape) { G.closed = true; checkOver(); if (G.over) return; }
    const S = G.security;
    S.cams = G.seats.some(s => s.game === 'cams' && s.occ); // the monitors wake up when someone sits down at the desk
    if (S.cams && (S.feedT -= dt) <= 0) { S.feedT = 4; S.feed = FEEDS[(FEEDS.indexOf(S.feed) + 1) % FEEDS.length]; }
    for (const c of G.chars) {
      if (G.mode !== 'play' || G.over) break; // a death or a payout can end the game partway through the crowd
      if (!c.alive) { if (!c.isHuman) botGhost(c); continue; }
      for (const k in c.cd) c.cd[k] = Math.max(0, c.cd[k] - dt);
      if (c.mixCd > 0) c.mixCd = Math.max(0, c.mixCd - dt);
      c.thirst = Math.max(0, c.thirst - CFG.thirstDrain * dt);
      c.hunger = Math.max(0, c.hunger - CFG.hungerDrain * dt);
      c.stamina = c.sprinting ? Math.max(0, c.stamina - dt) : Math.min(staMax(c), c.stamina + (c.perk === 'legs' ? CFG.legsRegen : CFG.staminaRegen) * dt);
      if (c.senseT > 0) c.senseT = Math.max(0, c.senseT - dt);
      if (c.isKiller && c.isHuman) preyTick(c, dt);
      if (c.lucky > 0) c.lucky = Math.max(0, c.lucky - dt);
      if (c.disguise && c.disguise.t > 0 && (c.disguise.t -= dt) <= 0) tell(c, 'Your disguise slipped. You look like yourself again.');
      if (c.trapT > 0 && (c.trapT -= dt) <= 0) { kill(c, 'trap', byId(c.trapBy)); continue; }
      if (c.poisonT > 0) {
        c.poisonT -= dt;
        if (c.poisonT <= 0) { kill(c, 'poison', byId(c.poisonBy)); continue; }
        if (sick(c) && c.items.has('antidote')) { // the pocket antidote, the moment it's felt
          c.items.delete('antidote'); c.poisonT = 0; c.poisonBy = null; sfxTo(c, 'sip');
          if (c.drink && c.drink.poisoned) removeDrink(c.drink);
          tell(c, `Poison! You downed your pocket antidote. You'll live.`, true);
          if (c.poisonDrink !== null) note(c, `Your ${c.poisonKind} was poisoned. Your pocket antidote saved you.`, { hard: true });
          continue;
        }
        if (!c.sickTold && sick(c)) { c.sickTold = true; tell(c, G.antidotes > 0 ? `You feel sick. Poison! Get the antidote at the bar in ${Math.floor(c.poisonT)} seconds.` : 'You feel sick. Poison, and the antidote is gone.', true, 'poison'); }
      }
      if (c.staffInside) continue;
      if (c.isHuman) humanTick(c, dt); else botTick(c, dt);
      const room = roomOf(c), tr = c.trail; if (tr[tr.length - 1].room !== room) { tr.push({ t: G.t, room }); if (tr.length > 60) tr.shift(); }
      if (c.drink) { c.drink.x = c.x + Math.cos(c.face + 0.9) * 16; c.drink.y = c.y + Math.sin(c.face + 0.9) * 16; }
    }
    if (G.mode !== 'play' || G.over) return;
    footsteps(G.t, G.chars);
    for (const ch of G.chandeliers) if (ch.state === 'falling' && (ch.t -= dt) <= 0) { dropChandelier(ch); if (G.over) return; }
    if (G.guard) guardTick(dt);
    if (G.lure && (G.lure.t -= dt) <= 0) G.lure = null;
    for (const h of G.haunts) h.t -= dt;
    G.haunts = G.haunts.filter(h => h.t > 0);
    crashTick(dt); raceTick(dt); skeeGamesTick(dt); arcadeGamesTick(dt);
    if (G.over) return;
    G.obsT -= dt; if (G.obsT <= 0) { G.obsT = 0.25; observe(); }
    if (G.pending && !G.blackout) { // (held through a blackout)
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
      t: G.t, mode: G.mode, pickT: G.mode === 'pick' ? Math.ceil(G.pickT) : null, bank: G.bank, target: G.target, closeT: Math.max(0, Math.ceil(CFG.closingTime - G.t)), lightsT: G.blackout ? 1 : G.lightsT, nk: G.killerIds.length, killersCaught: G.chars.filter(c => c.isKiller && c.ejected).length, killersCaught: G.chars.filter(c => c.isKiller && c.ejected).length, backrooms: G.backrooms, escape: G.escape,
      exits: G.exits && { ids: G.exits.ids, t: Math.max(0, Math.ceil(G.exits.t)), closed: G.exits.closed },
      darkT: G.escape && !G.blackout && !G.exits ? Math.max(0, Math.ceil(CFG.escapeDarkAt - G.t)) : null,
      blackout: G.blackout && { t: +G.blackout.t.toFixed(1), br: G.blackout.br.map(b => [b.i, +Math.min(1, b.work / CFG.breakerWork).toFixed(2), b.done ? 1 : 0]) },
      chars: G.chars.map(c => { const a = c.monster ? MONSTER_LOOK : appearAs(c); return { id: c.id, name: a.name, color: a.color, hat: a.hat, x: Math.round(c.x), y: Math.round(c.y), look: +c.look.toFixed(2), face: +c.face.toFixed(2),
        alive: c.alive, eating: Math.max(0, 2.4 - (G.t - (c.eatAt ?? -99))), snack: c.snack || 0, ejected: !!c.ejected, seat: c.seat ? c.seat.id : null, moving: c.moving, pale: sick(c), human: a === c ? c.isHuman : !!a.isHuman, lucky: c.lucky > 0, inspecting: !!c.inspect, bet: G.t - (c.betAt ?? -9) < 1.2,
        monster: c.monster, flash: c.flash, held: c.grabbed !== null, maul: !!c.grab, staffInside: !!c.staffInside, escaped: !!c.escaped, leap: !!(c.leap && c.leap.miss === null) }; }),
      drinks: G.drinks.map(d => ({ id: d.id, owner: d.owner, holder: d.holder, x: Math.round(d.x), y: Math.round(d.y), sips: d.sips, color: d.color, kind: d.glass })), // (kind: the glass it's in)
      bodies: G.bodies.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), cause: b.cause })),
      bowls: G.bowls.map(b => ({ id: b.id, x: b.x, y: b.y })),
      chandeliers: G.chandeliers.map(ch => ({ id: ch.id, x: ch.x, y: ch.y, state: ch.state, t: +ch.t.toFixed(2) })),
      guard: G.guard && { x: Math.round(G.guard.x), y: Math.round(G.guard.y), look: +G.guard.look.toFixed(2), moving: G.guard.moving, t: Math.ceil(G.guard.t) },
      haunts: G.haunts.map(h => ({ on: h.on, t: +h.t.toFixed(2) })), lure: G.lure && { room: G.lure.room, x: G.lure.x, y: G.lure.y, t: +G.lure.t.toFixed(1) },
      security: { cams: G.security.cams, feed: G.security.cams ? G.security.feed : null, guardPrice: price('guard') }, antidotes: G.antidotes,
      floats: G.floats.map(f => ({ x: Math.round(f.x), y: Math.round(f.y), text: f.text, color: f.color, t: +f.t.toFixed(2), big: !!f.big })),
      fx: G.fx.map(f => ({ kind: f.kind, x: Math.round(f.x), y: Math.round(f.y), t: +f.t.toFixed(2) })),
      seatsOcc: G.seats.map(s => s.occ ? s.occ.id : null), maxBet: Gm.maxBet(G.bank),
      lead: G.chars.filter(c => Math.round(c.won)).sort((a, b) => b.won - a.won).slice(0, 5).map(c => ({ id: c.id, name: c.name, color: c.color, won: Math.round(c.won), alive: c.alive })),
      crash: { phase: G.crash.phase, t: +G.crash.t.toFixed(2), mult: G.crash.mult, point: G.crash.phase === 'boom' ? G.crash.point : null, round: G.crash.round,
        bets: [...G.crash.bets].map(([id, b]) => [id, b.bet, b.out]) },
      arcade: Object.fromEntries(Object.entries(G.arcade).map(([k,r])=>[k,arcadeView(r)])),
      skee: G.skee.map(skeeView),
      race: { phase: G.race.phase, t: +G.race.t.toFixed(2), pays: G.race.form.pays, winner: G.race.phase === 'bet' ? null : G.race.winner, seed: G.race.seed, round: G.race.round,
        bets: [...G.race.bets].map(([id, b]) => [id, b.duck, b.bet, G.race.phase === 'show' ? b.back : null]) },
      // the last linesMax lines; lineBase is where they start in the whole meeting
      meeting: m && { title: m.title, reason: m.reason, phase: m.phase, lines: m.lines.slice(-CFG.linesMax), lineBase: Math.max(0, m.lines.length - CFG.linesMax), voteT: Math.ceil(m.voteT), result: m.result, tally: m.tally, skips: m.skips,
        ejected: m.ejected ?? null, ejectedKiller: !!m.ejectedKiller, voted: G.chars.filter(c => c.alive && c.voted !== null).map(c => c.id) },
      over: G.over,
    };
  }
  function view(id, pub) {
    const c = byId(id);
    if (c.isHuman && c.seat) c.mbPeak = Math.max(c.mbPeak || 0, Gm.maxBet(G.bank)); // every table max this player is shown counts
    const ctx = contextFor(c);
    const myDrink = c.drink;
    const cd = {}; for (const k in c.cd) cd[k] = Math.ceil(c.cd[k]);
    const priv = {
      me: c.id, isKiller: c.isKiller, killers: c.isKiller ? G.killerIds.slice() : [], alive: c.alive, deathScene: !c.alive ? c.deathScene || null : null, cameraFeed: !c.alive || c.staffInside ? c.cameraFeed || null : null, staffInside: !!c.staffInside,
      footsteps: c.footsteps?.length ? {seq: c.footstepSeq = (c.footstepSeq || 0) + 1, ids: c.footsteps.splice(0)} : null,
      thirst: Math.round(c.thirst), hunger: Math.round(c.hunger), stamina: +(c.stamina / staMax(c)).toFixed(2), staminaMax: staMax(c), cd,
      perk: c.perk, crew: c.isKiller ? G.killerIds.map(id => ({ id, perk: byId(id).perk, human: byId(id).isHuman })) : [], senseT: +c.senseT.toFixed(1),
      watchers: c.perk === 'eyes' && c.alive && G.mode === 'play' ? witnessesOf(c).length : null,
      staffAt: c.perk === 'staff' && c.alive && !c.seat && G.mode === 'play' ? (staffDoorAt(c) || { id: null }).id : null,
      prey: c.isKiller && c.alive && c.prey && byId(c.prey.id).alive ? { id: c.prey.id, name: byId(c.prey.id).name, room: ROOMS[roomOf(byId(c.prey.id))].name, why: c.prey.why } : null,
      notes: c.notes.slice(-12).map(n => ({ text: n.text, hard: !!n.hard })), inbox: c.inbox.splice(0),
      ctx: ctx ? ctx.label : null, posVer: c.posVer, x: c.x, y: c.y, seat: c.seat ? { id: c.seat.id, x: c.seat.x, y: c.seat.y, face: c.seat.face, game: c.seat.game, tier: c.seat.tier || null } : null,
      drink: myDrink ? { kind: myDrink.kind, glass: myDrink.glass, sips: myDrink.sips, held: true } : null,
      canInspect: c.alive && ['seat', 'bowl'].includes(inspectTarget(c)?.kind), sniffT: c.inspect ? c.inspect.t : 0, inspectT: c.inspect ? c.inspect.t : 0, bellUsed: c.bellUsed, voted: c.voted, accused: c.accused, lucky: Math.ceil(c.lucky),
      sick: sick(c), poisonT: sick(c) ? Math.ceil(c.poisonT) : 0, hauntUsed: !!c.hauntUsed, atBar: atBar(c),
      disguise: c.disguise && c.disguise.t > 0 ? { as: c.disguise.as, t: Math.ceil(c.disguise.t) } : null, canDisguise: c.lastVictim !== undefined,
      spiked: c.isKiller ? G.drinks.filter(d => d.poisoned).map(d => d.id).concat(G.traps.filter(t => t.kind === 'bowl').map(t => 'bowl' + t.id)) : G.drinks.filter(d => d.poisoned && d.poisonBy === c.id).map(d => d.id), // (anyone's own poisoned pours)
      rigged: c.isKiller ? G.traps.filter(t => t.kind === 'seat').map(t => t.id) : [],
      monster: c.monster, flash: c.flash, held: c.grabbed !== null, escaped: !!c.escaped,
      leap: c.monster ? (c.leap ? 1 : 0) : 0, leapCd: c.monster ? Math.ceil(Math.max(c.leapCd || 0, c.mCd || 0)) : 0, // (mid-pounce or winded; when the next pounce is ready)
      canTransform: c.isKiller && c.alive && !!G.blackout && G.blackout.by === null, exitT: c.exitT > 0 ? +Math.min(1, c.exitT / exitHoldOf(c)).toFixed(2) : 0, gear: [...c.gear], wallet: Math.max(0, Math.round(c.won)),
      // the mixer (at the bar): everyone's thirst and hunger, and how long until your next poisoned pour; the shady guy's wares
      needs: atBar(c) && c.alive ? G.chars.filter(o => o.alive).map(o => [o.id, Math.round(o.thirst), Math.round(o.hunger)]) : null,
      insurance: c.items.has('insurance') ? policyFor(c).view() : null,
      mixCd: Math.ceil(c.isKiller ? c.cd.order : c.mixCd), items: [...c.items], bullets: c.bullets,
      shop: atShady(c) && c.alive ? shopIds().map(id => ({ id, price: shopPrice(id), have: c.items.has(id) || c.gear.has(id) })) : null,
      breaker: G.blackout ? (G.blackout.br.find(b => !b.done && atBreaker(c, b)) || { i: null }).i : null,
    };
    if (G.over) priv.won = G.over.escape ? wonEscape(c) : G.over.killersWin === c.isKiller;
    return { pub: pub || pubView(), priv };
  }

  return { G, tick, action, setInput, view, pubView, dropHuman, tell, canSee, chars, byId, newCrash, newRace, startPlay };
}
