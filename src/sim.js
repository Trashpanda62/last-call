// The authoritative game. No DOM: the host (or solo client) runs it; every human sees it through view(id).
import { CFG, DIFF, CAST, DRINKS } from './config.js';
import { rand, pick, clamp, dist, angDiff, money, shuffle } from './util.js';
import { ROOMS, TAP, BELL, REST_SPOTS, BOWL_SPOTS, GAME_NAMES, OBSTACLES, W, H, makeSeats, los, collide, roomOf, route } from './map.js';
import * as Gm from './games.js';

// "Red", "Red and Mint", "Red, Mint and Pip"
export const nameList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
export const ringRadius = n => n > 10 ? 175 : n > 7 ? 150 : 130;

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
    seats: makeSeats(), bowls: BOWL_SPOTS.map((p, i) => ({ id: i, x: p.x, y: p.y, spiked: false, by: null })), deaths: 0,
    killerIds, stats: { poisonings: 0, stabs: 0, meetings: 0 },
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
      cd: { poison: CFG.startCd, shiv: CFG.startCd + 10, lights: CFG.startCd + 20 },
      glanceT: rand(3, 8), glancing: 0, glanceOff: 0, gameT: rand(1, 4), sipT: rand(3, 8), sitT: 0, lucky: 0,
      sus: {}, witnessed: [], lastSeen: {}, touches: {}, huntT: rand(4, 8), hunt: null, bellUsed: false,
      notes: [], inbox: [], posVer: 0, moving: false, lookBack: false, sniff: null, voted: null, accused: false, target: null,
    });
  }
  for (const c of G.chars) for (const o of G.chars) c.sus[o.id] = 0;
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
    const d = dist(v, p);
    if (d > viewRange()) return false;
    if (d > CFG.nearSense && Math.abs(angDiff(Math.atan2(p.y - v.y, p.x - v.x), v.look)) > CFG.coneHalf) return false;
    return los(v, p);
  }
  // Fellow killers never count as witnesses. A careless bot killer misjudges some gazes.
  function witnessesOf(actor, ignore, careless) {
    return G.chars.filter(c => c !== actor && c !== ignore && c.alive && !(actor.isKiller && c.isKiller) && canSee(c, actor) &&
      !(careless && Math.random() < (c.isHuman ? D().careless * 2.5 : D().careless)));
  }

  // ---------- Drinks and snacks ----------
  function pourFor(c) {
    const k = pick(DRINKS);
    const d = { id: G.nextId++, owner: c.id, holder: c.id, x: c.x, y: c.y, sips: CFG.drinkSips, poisoned: false, poisonBy: null, kind: k.kind, color: k.color, placedAt: 0 };
    G.drinks.push(d); c.drink = d; sfxTo(c, 'pour');
    return d;
  }
  function placeDrink(c, spot) {
    const d = c.drink; if (!d) return;
    d.holder = null; d.x = spot.x; d.y = spot.y; d.placedAt = G.t; c.drink = null;
    for (const o of G.chars) o.touches[d.id] = new Set();
  }
  function pickUpDrink(c, d) { d.holder = c.id; c.drink = d; }
  function ownRailDrink(c) { return c.seat ? G.drinks.find(d => d.owner === c.id && !d.holder && d.sips > 0 && dist(d, c.seat.drink) < 5) || null : null; }
  function removeDrink(d) { G.drinks = G.drinks.filter(x => x !== d); for (const c of G.chars) if (c.drink === d) c.drink = null; }
  function poisonChar(c, by, what, kind) {
    if (c.poisonT) return;
    c.poisonT = CFG.poisonDelay; c.poisonBy = by; c.poisonDrink = what; c.poisonKind = kind;
  }
  function sip(c, d) {
    d.sips--; c.thirst = Math.min(100, c.thirst + CFG.sipGain); sfxTo(c, 'sip');
    if (d.poisoned) poisonChar(c, d.poisonBy, d.id, d.kind);
    if (d.sips <= 0) removeDrink(d);
  }
  function eatSnack(c, b) {
    c.lucky = CFG.luckyTime; sfxTo(c, 'crunch');
    tell(c, `Lucky pretzels! Your table wins pay ${Math.round(CFG.luckyBonus * 100)}% more for ${CFG.luckyTime}s.`);
    if (b.spiked) { poisonChar(c, b.by, 'bowl' + b.id, 'pretzels'); b.spiked = false; b.by = null; }
    G.fx.push({ kind: 'crumbs', x: b.x, y: b.y, t: 0.8 });
  }

  // ---------- Killer actions ----------
  function phraseFor(k, what, victim, item) {
    return what === 'shiv' ? `stab ${victim.name}` : what === 'spike' ? 'sprinkle something into the snack bowl' : `tip something into ${victim.name}'s ${item}`;
  }
  function noteWitnesses(k, what, victim, item) {
    const phrase = phraseFor(k, what, victim, item);
    for (const w of witnessesOf(k, victim)) {
      if (w.isHuman) { note(w, `You saw <b>${k.name}</b> ${phrase}.`, { who: k.id, hard: true }); tell(w, `You saw ${k.name} ${phrase}!`, true, 'gasp'); }
      else { w.witnessed.push({ who: k.id, what, victim: victim ? victim.id : null, phrase, t: G.t }); w.sus[k.id] += 120; }
    }
  }
  function doPoison(k, d) {
    if (k.cd.poison > 0 || !d || d.holder || d.poisoned || d.owner === k.id || byId(d.owner).isKiller) return false;
    d.poisoned = true; d.poisonBy = k.id; k.cd.poison = CFG.poisonCd * cdScale(); k.cd.shiv = Math.max(k.cd.shiv, CFG.sharedCd);
    const owner = byId(d.owner);
    noteWitnesses(k, 'poison', owner, d.kind);
    tell(k, `You spiked ${owner.name}'s ${d.kind}.`, false, 'poison');
    G.stats.poisonings++;
    return true;
  }
  function doSpike(k, b) {
    if (k.cd.poison > 0 || !b || b.spiked) return false;
    b.spiked = true; b.by = k.id; k.cd.poison = CFG.poisonCd * cdScale(); k.cd.shiv = Math.max(k.cd.shiv, CFG.sharedCd);
    noteWitnesses(k, 'spike', null, 'snacks');
    tell(k, 'You laced the pretzels. Whoever eats next is done.', false, 'poison');
    G.stats.poisonings++;
    return true;
  }
  function doShiv(k, v) {
    if (k.cd.shiv > 0 || !v || !v.alive || v === k || v.isKiller || dist(k, v) > CFG.reach + 5) return false;
    noteWitnesses(k, 'shiv', v, null);
    k.cd.shiv = CFG.shivCd * cdScale(); k.cd.poison = Math.max(k.cd.poison, CFG.sharedCd);
    sfxTo(k, 'stab'); G.stats.stabs++;
    kill(v, 'shiv', k);
    return true;
  }
  function doLights(k) {
    if (k.cd.lights > 0) return false;
    for (const o of killersAlive()) o.cd.lights = CFG.lightsCd;
    G.lightsT = CFG.lightsDur;
    tellAll('The lights cut out!', true, 'lights');
    return true;
  }
  function kill(v, cause, by) {
    v.alive = false; v.poisonT = 0; v.sniff = null;
    if (v.seat) { v.seat.occ = null; v.seat = null; v.posVer++; }
    if (v.drink) { v.drink.holder = null; v.drink.x = v.x + 18; v.drink.y = v.y + 6; v.drink = null; }
    G.bodies.push({ x: v.x, y: v.y, id: v.id, cause, by: by ? by.id : null, drinkId: v.poisonDrink, kind: v.poisonKind, reported: false, t: G.t, seenBy: new Set() });
    G.deaths++;
    G.fx.push({ kind: cause === 'poison' ? 'bubbles' : 'splat', x: v.x, y: v.y, t: 1.5 });
    if (v.isHuman) tell(v, cause === 'poison' ? `Your ${v.poisonKind} was poisoned. You're a ghost now. Drift around and watch.` : "Someone stabbed you. You're a ghost now.", true, 'die');
    for (const h of humans()) if (h !== v && h.alive && canSee(h, v)) tell(h, cause === 'poison' ? `${v.name} collapsed!` : `${v.name} was stabbed!`, true, 'die');
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
    const rd = ownRailDrink(c);
    if (rd && !c.drink) pickUpDrink(c, rd);
    c.x = c.seat.approach.x; c.y = c.seat.approach.y;
    c.leftSeatT = G.t; c.seat.occ = null; c.seat = null; c.posVer++;
  }
  function sit(c, seat) {
    if (c.target && c.target.claim === c.id) c.target.claim = null;
    seat.occ = c; seat.claim = null; c.seat = seat; c.x = seat.x; c.y = seat.y; c.face = c.look = seat.face; c.posVer++;
    if (c.drink) placeDrink(c, seat.drink);
  }
  function botChoose(c) {
    const hasDrink = c.drink || G.drinks.some(d => d.owner === c.id && d.sips > 0);
    if ((c.thirst < 50 && !hasDrink) || (c.thirst < 20 && !c.drink)) { c.state = 'getDrink'; setGoal(c, { x: TAP.x + rand(-80, 80), y: TAP.y + 10 }); return; }
    const r = Math.random();
    if (r < 0.1) { c.state = 'rest'; setGoal(c, pick(REST_SPOTS)); return; }
    if (r < 0.18 && !c.lucky) { const b = pick(G.bowls); c.state = 'snack'; c.target = b; setGoal(c, { x: b.x, y: b.y + (b.y < 200 ? 0 : 0) }); return; }
    if (r < 0.24) { c.state = 'wander'; setGoal(c, openSpot(ROOMS[busyRoom(c)])); return; }
    const mine = G.drinks.find(d => d.owner === c.id && !d.holder && d.sips > 0);
    let seat = mine && G.seats.find(s => !s.occ && !s.claim && dist(s.drink, mine) < 5);
    if (!seat) {
      // People drift toward the action: a seat counts more for every other gambler in its room.
      const free = G.seats.filter(s => !s.occ && !s.claim && !G.drinks.some(d => !d.holder && d.owner !== c.id && dist(d, s.drink) < 5));
      const crowd = roomCrowd(c);
      seat = free.length ? free[pickIdx(free.map(s => 1 + CFG.social * (crowd[roomOf(s)] || 0)))] : null;
    }
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
    if (d.poisoned && !c.isKiller && Math.random() < D().sniff) {
      removeDrink(d);
      callMeeting(c, null, `${c.name} sniffed their ${d.kind} and smelled bitter almonds. Someone spiked it.`, { drinkId: d.id, owner: c.id, kind: d.kind });
      return;
    }
    sip(c, d);
  }
  function botTick(c, dt) {
    c.moving = false;
    c.glanceT -= dt;
    if (c.glancing > 0) c.glancing -= dt;
    else if (c.glanceT <= 0) { c.glancing = rand(0.8, 1.8); c.glanceOff = rand(-1, 1) * Math.PI; c.glanceT = rand(...D().glance); }
    if (c.isKiller && killerBrain(c, dt)) { c.look = c.face; return; }
    switch (c.state) {
      case 'idle': botChoose(c); break;
      case 'getDrink':
        if (followPath(c, dt, CFG.botSpeed)) { c.face = -Math.PI / 2; c.wait += dt; if (c.wait > 1.2) { c.wait = 0; pourFor(c); c.state = 'idle'; } }
        break;
      case 'snack':
        if (followPath(c, dt, CFG.botSpeed)) {
          const b = c.target; c.state = 'idle'; c.target = null;
          if (b.spiked && !c.isKiller && Math.random() < D().sniff) {
            b.spiked = false; callMeeting(c, null, `${c.name} smelled bitter almonds on the pretzels. Someone laced the snack bowl.`, null);
          } else if (!(b.spiked && c.isKiller)) eatSnack(c, b);
        }
        break;
      case 'rest': case 'wander':
        if (followPath(c, dt, CFG.botSpeed)) { c.wait += dt; if (c.wait > (c.state === 'rest' ? 5 : 2)) { c.wait = 0; c.state = 'idle'; } }
        break;
      case 'toSeat': {
        const s = c.target;
        if (s.occ && s.occ !== c) { s.claim = null; c.state = 'idle'; break; }
        if (followPath(c, dt, CFG.botSpeed)) { sit(c, s); c.sitT = rand(22, 45); c.gameT = rand(1, 3); c.state = 'seated'; }
        break;
      }
      case 'seated': {
        c.face = c.seat.face; c.sitT -= dt; c.gameT -= dt; c.sipT -= dt;
        if (c.gameT <= 0) botPlay(c);
        const d = ownRailDrink(c);
        if (d && c.thirst < 75 && c.sipT <= 0) { c.sipT = rand(6, 12); botSip(c, d); }
        if (c.sitT <= 0 || (!d && c.thirst < 40)) { standUp(c); c.state = 'idle'; }
        break;
      }
    }
    if (c.drink && c.state !== 'seated' && c.thirst < 60) { c.sipT -= dt; if (c.sipT <= 0) { c.sipT = rand(5, 9); botSip(c, c.drink); } }
    c.look = c.face + (c.glancing > 0 ? c.glanceOff : 0);
  }
  // True while the bot killer is busy hunting (skips the gambler routine).
  function killerBrain(k, dt) {
    if (k.hunt) {
      const h = k.hunt; h.t -= dt;
      let target = null;
      if (h.kind === 'poison') {
        target = G.drinks.find(d => d.id === h.drinkId);
        if (!target || target.holder || target.poisoned || !byId(target.owner).alive) return endHunt(k);
      } else if (h.kind === 'spike') {
        target = G.bowls[h.bowl]; if (target.spiked) return endHunt(k);
      } else {
        target = byId(h.victim);
        if (!target.alive) return endHunt(k);
        h.repath -= dt; if (h.repath <= 0) { h.repath = 0.8; setGoal(k, target); }
      }
      if (dist(k, target) >= CFG.reach - 4) followPath(k, dt, CFG.botSpeed * (h.kind === 'shiv' ? 1.15 : 1));
      else {
        k.face = Math.atan2(target.y - k.y, target.x - k.x);
        if (witnessesOf(k, h.kind === 'shiv' ? target : null, true).length === 0) {
          if (h.kind === 'poison') doPoison(k, target); else if (h.kind === 'spike') doSpike(k, target); else doShiv(k, target);
          return endHunt(k);
        }
        h.linger += dt;
      }
      if (h.t <= 0 || h.linger > 5) return endHunt(k);
      return true;
    }
    k.huntT -= dt;
    if (k.huntT > 0) return false;
    k.huntT = rand(4, 8);
    const prey = gamblersAlive();
    let plan = null;
    if (k.cd.shiv <= 0) {
      const loners = prey.filter(v => !G.chars.some(o => o.alive && o !== v && !o.isKiller && canSee(o, v)));
      if (loners.length && Math.random() < 0.65) plan = { kind: 'shiv', victim: pick(loners).id };
    }
    if (!plan && k.cd.poison <= 0) {
      if (Math.random() < 0.25) plan = { kind: 'spike', bowl: pick(G.bowls.filter(b => !b.spiked) || [G.bowls[0]])?.id ?? 0 };
      else {
        const ds = G.drinks.filter(d => !d.holder && !d.poisoned && !byId(d.owner).isKiller && byId(d.owner).alive);
        if (ds.length && Math.random() < 0.8) { ds.sort((a, b) => dist(a, k) - dist(b, k)); plan = { kind: 'poison', drinkId: ds[Math.floor(Math.random() * Math.min(2, ds.length))].id }; }
      }
    }
    if (!plan) return false;
    if (k.seat) standUp(k);
    if (k.target && k.target.claim === k.id) k.target.claim = null;
    k.state = 'hunting';
    k.hunt = Object.assign(plan, { t: 18, linger: 0, repath: 0 });
    setGoal(k, plan.kind === 'poison' ? G.drinks.find(d => d.id === plan.drinkId) : plan.kind === 'spike' ? G.bowls[plan.bowl] : byId(plan.victim));
    if (k.cd.lights <= 0 && Math.random() < 0.3) doLights(k);
    return true;
  }
  function endHunt(k) { k.hunt = null; k.state = 'idle'; return false; }

  // ---------- What everyone remembers ----------
  function observe() {
    for (const v of G.chars) {
      if (!v.alive) continue;
      for (const c of G.chars) {
        if (c === v || !c.alive || !canSee(v, c)) continue;
        v.lastSeen[c.id] = { t: G.t, room: roomOf(c), with: G.chars.filter(o => o !== c && o !== v && o.alive && dist(o, c) < 90).map(o => o.id) };
        for (const d of G.drinks) {
          if (d.holder || d.owner === c.id || dist(c, d) > 45) continue;
          (v.touches[d.id] || (v.touches[d.id] = new Set())).add(c.id);
          const key = c.id + ':' + d.id;
          if (v.isHuman && !v.notes.some(n => n.key === key)) note(v, `${c.name} hung around ${byId(d.owner).name}'s ${d.kind}.`, { key, who: c.id });
        }
        for (const b of G.bowls) {
          if (dist(c, b) > 40) continue;
          const key = c.id + ':bowl' + b.id + ':' + Math.floor(G.t / 30);
          (v.touches['bowl' + b.id] || (v.touches['bowl' + b.id] = new Set())).add(c.id);
          if (v.isHuman && !v.notes.some(n => n.key === key)) note(v, `${c.name} was at the snack bowl in ${ROOMS[roomOf(b)].name}.`, { key, who: c.id });
        }
      }
      for (const b of G.bodies) {
        if (b.reported || !canSee(v, b)) continue;
        if (v.isHuman) { b.seenBy.add(v.id); continue; }
        if (v.isKiller && Math.random() > 0.15) continue;
        if (!G.pending) G.pending = { t: 0.5, caller: v, body: b };
      }
    }
  }

  // ---------- Meetings ----------
  function callMeeting(caller, body, reason, spiked) {
    if (G.mode !== 'play') return;
    G.mode = 'meeting'; G.pending = null; G.stats.meetings++;
    const victims = G.bodies.filter(b => !b.reported);
    victims.forEach(b => { b.reported = true; });
    for (const c of G.chars) { c.voted = null; c.accused = false; c.sniff = null; }
    G.meeting = {
      title: body ? 'Body reported' : spiked ? 'Spiked drink!' : 'Emergency meeting', reason,
      queue: buildStatements(victims, spiked, caller), lines: [], extra: [], phase: 'talk', talkT: 0.6, voteT: CFG.voteTime, resultT: CFG.resultTime,
      result: '', tally: null, victims: victims.map(v => v.id),
    };
    for (const h of humans()) sfxTo(h, 'meeting');
  }
  function buildStatements(victims, spiked, caller) {
    const out = [];
    const order = shuffle(G.chars.filter(c => c.alive && !c.isHuman));
    if (caller && !caller.isHuman && order.includes(caller)) { order.splice(order.indexOf(caller), 1); order.unshift(caller); }
    const poisonCases = victims.filter(v => v.cause === 'poison').map(v => ({ drinkId: v.drinkId, owner: v.id, kind: v.kind }));
    if (spiked) poisonCases.push(spiked);
    for (const b of order) {
      const acc = {}; let text = '';
      if (b.isKiller) {
        const others = G.chars.filter(c => c.alive && c !== b && !c.isKiller);
        const accusedMe = out.find(l => l.acc[b.id] > 0);
        if (accusedMe && Math.random() < 0.7) { const liar = byId(accusedMe.who); acc[liar.id] = 40; text = `That's a lie. ${liar.name} is trying to pin this on me. I was at ${pick(Object.values(ROOMS)).name}.`; }
        else if (Math.random() < 0.6 && others.length) {
          const x = pick(others); const pc = poisonCases[0];
          if (pc) { acc[x.id] = 35; text = `I saw ${x.name} hanging around ${pc.owner !== undefined && byId(pc.owner) ? byId(pc.owner).name + "'s " + pc.kind : 'that drink'}.`; }
          else { acc[x.id] = 25; text = `${x.name} was alone with them right before. Just saying.`; }
        } else text = pick(["I was at the tables the whole time. Didn't see a thing.", 'I was getting a drink. This is terrifying.', 'Can we skip? We have no proof.']);
      } else {
        const seen = b.witnessed.filter(w => !w.used);
        for (const w of seen) { w.used = true; acc[w.who] = (acc[w.who] || 0) + 120; text += `I SAW ${byId(w.who).name} ${w.phrase}! `; }
        if (!seen.length) {
          for (const pc of poisonCases) {
            const key = typeof pc.drinkId === 'string' ? pc.drinkId : pc.drinkId;
            const t = b.touches[key];
            const sus = t ? [...t].filter(id => id !== b.id && id !== pc.owner) : [];
            if (sus.length) {
              const x = byId(pick(sus)); acc[x.id] = (acc[x.id] || 0) + 35;
              text += String(key).startsWith('bowl') ? `${x.name} was at that snack bowl. ` : `I saw ${x.name} hanging around ${byId(pc.owner).name}'s ${pc.kind}. `;
            }
          }
          for (const v of victims.filter(v => v.cause === 'shiv')) {
            const ls = b.lastSeen[v.id];
            if (ls && ls.with.length && G.t - ls.t < 60) { const x = byId(pick(ls.with)); if (x !== b) { acc[x.id] = (acc[x.id] || 0) + 25; text += `Last I saw ${byId(v.id).name}, ${x.name} was right next to them in ${ROOMS[ls.room].name}. `; } }
          }
        }
        if (!text) {
          const top = Object.entries(b.sus).filter(([id]) => +id !== b.id && byId(id).alive).sort((x, y) => y[1] - x[1])[0];
          if (top && top[1] > 20) { acc[top[0]] = 15; text = `I still don't trust ${byId(top[0]).name}.`; }
          else text = pick([`I was at ${b.seat ? GAME_NAMES[b.seat.game] : 'the tables'}. Didn't see anything.`, 'I was busy losing money, sorry.', 'No idea. Somebody start talking.', "I didn't see it. Watch your drinks, people."]);
        }
      }
      out.push({ who: b.id, text: text.trim(), acc });
    }
    return out;
  }
  function trust(listener, speaker) {
    if (listener === speaker) return 0;
    if (listener.witnessed.some(w => w.who === speaker.id)) return 0;
    return clamp(0.6 - listener.sus[speaker.id] / 200, 0, 0.8);
  }
  function meetingTick(dt) {
    const m = G.meeting;
    if (m.phase === 'talk') {
      m.talkT -= dt;
      if (m.talkT <= 0) {
        if (!m.queue.length) { m.phase = 'vote'; return; }
        const l = m.queue.shift(); m.lines.push({ who: l.who, text: l.text }); m.extra.push(l); m.talkT = CFG.talkGap;
        for (const h of humans()) sfxTo(h, 'chat');
      }
      return;
    }
    if (m.phase === 'vote') {
      m.voteT -= dt;
      const voters = humans().filter(h => h.alive);
      if (m.voteT <= 0 || (voters.length && voters.every(h => h.voted !== null)) || (!voters.length && m.voteT < CFG.voteTime - 3)) resolveVotes();
      return;
    }
    m.resultT -= dt;
    if (m.resultT <= 0) endMeeting();
  }
  function resolveVotes() {
    const m = G.meeting; m.phase = 'result';
    const alive = G.chars.filter(c => c.alive);
    const statements = m.extra;
    const tally = {}; let skips = 0;
    for (const b of alive.filter(c => !c.isHuman)) {
      const score = {};
      for (const c of alive) score[c.id] = c === b || (b.isKiller && c.isKiller) ? -999 : b.sus[c.id];
      for (const st of statements) {
        const sp = byId(st.who); const tr = trust(b, sp);
        for (const id in st.acc) {
          if (+id === b.id && !b.isKiller) { b.sus[sp.id] += 45; continue; } // they know that's a lie
          if (score[id] !== undefined && score[id] > -999) score[id] += st.acc[id] * tr;
        }
      }
      for (const id in score) score[id] += rand(-8, 8);
      const best = Object.entries(score).sort((x, y) => y[1] - x[1])[0];
      if (best && best[1] >= CFG.voteThreshold + Math.max(0, alive.length - 7) * CFG.voteThresholdPer) tally[best[0]] = (tally[best[0]] || 0) + 1; else skips++;
      for (const st of statements) for (const id in st.acc) if (+id !== b.id) b.sus[id] += st.acc[id] * trust(b, byId(st.who)) * 0.3;
    }
    for (const h of humans().filter(h => h.alive)) { if (h.voted !== null && h.voted >= 0) tally[h.voted] = (tally[h.voted] || 0) + 1; else skips++; }
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
      c.state = 'idle'; c.path = []; c.hunt = null; c.cd.shiv = Math.max(c.cd.shiv, 15);
    });
    for (const c of G.chars) if (!c.alive && c.isHuman) { c.x = BELL.x; c.y = BELL.y - 70; c.posVer++; }
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

  // ---------- Human actions ----------
  function nearest(list, p, max) { let best = null, bd = max; for (const o of list) { const d = dist(o, p); if (d < bd) { bd = d; best = o; } } return best; }
  function contextFor(c) {
    if (!c.alive || G.mode !== 'play') return null;
    const body = G.bodies.find(b => !b.reported && dist(b, c) < 90 && canSee(c, b));
    if (body) return { label: 'Report body', act: () => callMeeting(c, body, `${c.name} found ${byId(body.id).name}'s body.`) };
    if (c.seat) return { label: 'Stand up', act: () => standUp(c) };
    if (!c.drink && dist(c, TAP) < 75) return { label: 'Order a drink', act: () => { pourFor(c); tell(c, `One ${c.drink.kind}, on the house.`); } };
    if (dist(c, BELL) < 60 && !c.bellUsed) return { label: 'Ring the pit bell', act: () => { c.bellUsed = true; callMeeting(c, null, `${c.name} rang the pit bell.`); } };
    const seat = G.seats.find(s => !s.occ && dist(s, c) < 45);
    if (seat) return { label: `Sit at ${GAME_NAMES[seat.game]}`, act: () => sit(c, seat) };
    const mine = G.drinks.find(d => d.owner === c.id && !d.holder && dist(d, c) < CFG.reach);
    if (mine && !c.drink) return { label: `Pick up your ${mine.kind}`, act: () => pickUpDrink(c, mine) };
    const bowl = G.bowls.find(b => dist(b, c) < CFG.reach + 5);
    if (bowl && !c.lucky) return { label: 'Eat a pretzel', act: () => eatSnack(c, bowl) };
    return null;
  }
  function action(id, k, arg) {
    const c = byId(id); if (!c || !c.isHuman) return;
    if (G.mode === 'meeting') {
      const m = G.meeting;
      if (k === 'chat' && c.alive && typeof arg === 'string') {
        const text = arg.replace(/\s+/g, ' ').trim().slice(0, 140);
        if (text) { m.lines.push({ who: c.id, text }); for (const h of humans()) sfxTo(h, 'chat'); }
      }
      if (m.phase === 'result' || !c.alive) return;
      if (k === 'vote' && c.voted === null && (arg === -1 || (byId(arg) && byId(arg).alive && arg !== c.id))) c.voted = arg;
      if (k === 'accuse' && !c.accused && byId(arg) && byId(arg).alive && arg !== c.id) {
        c.accused = true; m.extra.push({ who: c.id, acc: { [arg]: 40 } }); m.lines.push({ who: c.id, text: `I think it's ${byId(arg).name}.` });
      }
      return;
    }
    if (G.mode !== 'play') return;
    if (k === 'use') { const x = contextFor(c); if (x) x.act(); return; }
    if (!c.alive) return;
    if (k === 'sip') {
      const d = c.drink || G.drinks.find(d => d.owner === c.id && !d.holder && dist(d, c) < CFG.reach + 15);
      if (d) sip(c, d); else tell(c, 'You have nothing to drink. The bar is west of the casino floor.');
    } else if (k === 'sniff') {
      const d = c.drink || nearest(G.drinks.filter(d => !d.holder), c, CFG.reach + 15);
      const b = !d && nearest(G.bowls, c, CFG.reach + 10);
      if (d || b) { c.sniff = { d: d || null, b: b || null, t: 1.5 }; tell(c, 'Sniffing... hold still.'); } else tell(c, 'Nothing within reach to sniff.');
    } else if (k === 'pour') {
      const d = c.drink || G.drinks.find(d => d.owner === c.id && !d.holder && dist(d, c) < CFG.reach + 15);
      if (d) { removeDrink(d); tell(c, `You poured out your ${d.kind}.`, false, 'pour'); }
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
    } else if (c.isKiller && k === 'poison') {
      if (c.cd.poison > 0) return tell(c, `Poison ready in ${Math.ceil(c.cd.poison)}s.`);
      const d = nearest(G.drinks.filter(d => !d.holder && d.owner !== c.id && !d.poisoned && !byId(d.owner).isKiller), c, CFG.reach);
      const b = !d && nearest(G.bowls.filter(b => !b.spiked), c, CFG.reach + 5);
      if (d) doPoison(c, d); else if (b) doSpike(c, b); else tell(c, "Get next to someone's unattended drink or a snack bowl.");
    } else if (c.isKiller && k === 'shiv') {
      if (c.cd.shiv > 0) return tell(c, `Shiv ready in ${Math.ceil(c.cd.shiv)}s.`);
      const v = nearest(G.chars.filter(o => o.alive && o !== c && !o.isKiller), c, CFG.reach + 5);
      if (v) doShiv(c, v); else tell(c, 'Get right next to someone.');
    } else if (c.isKiller && k === 'lights') {
      if (!doLights(c)) tell(c, `Lights out ready in ${Math.ceil(c.cd.lights)}s.`);
    }
  }
  function setInput(id, inp) {
    const c = byId(id); if (!c || !c.isHuman || !inp) return;
    if (inp.posVer !== c.posVer) return; // client hasn't caught up with a teleport yet
    if (!c.seat && typeof inp.x === 'number' && typeof inp.y === 'number' && isFinite(inp.x) && isFinite(inp.y)) {
      if (c.sniff && dist(c, inp) > 3) { c.sniff = null; tell(c, 'Sniff interrupted.'); }
      c.x = clamp(inp.x, 0, W); c.y = clamp(inp.y, 0, H);
      if (c.alive) collide(c);
    }
    c.moving = !!inp.moving;
    if (typeof inp.look === 'number' && isFinite(inp.look)) c.look = c.face = inp.look;
    if (c.seat) { c.face = c.seat.face; if (typeof inp.look !== 'number') c.look = c.seat.face + (inp.lookBack ? Math.PI : 0); } // seated humans turn their head freely
  }
  function humanTick(c, dt) {
    if (c.sniff) {
      c.sniff.t -= dt;
      if (c.sniff.t <= 0) {
        const { d, b } = c.sniff; c.sniff = null;
        if (b) { if (b.spiked) { tell(c, 'Bitter almonds. These pretzels are POISONED.', true, 'poison'); if (!c.isKiller) note(c, 'The snack bowl was poisoned.', { hard: true }); } else tell(c, 'Just salty pretzels.'); return; }
        if (!G.drinks.includes(d)) return;
        const owner = byId(d.owner); const whose = owner === c ? 'Your' : owner.name + "'s";
        if (d.poisoned) { tell(c, `Bitter almonds. ${whose} ${d.kind} is POISONED.`, true, 'poison'); if (!c.isKiller) note(c, `${whose} ${d.kind} was poisoned.`, { hard: true }); }
        else tell(c, `Smells like a perfectly normal ${d.kind}.`);
      }
    }
  }
  function dropHuman(id) {
    const c = byId(id); if (!c || !c.isHuman) return;
    c.isHuman = false; c.netKey = null; c.path = []; c.sniff = null;
    if (c.seat) { c.state = 'seated'; c.sitT = rand(5, 15); c.gameT = 2; } else c.state = 'idle';
    tellAll(`${c.name} left. A bot took their seat.`);
  }

  // ---------- Tick ----------
  function tick(dt) {
    if (G.over) { G.t += dt; return; }
    if (G.mode === 'meeting') { meetingTick(dt); return; }
    G.t += dt;
    if (G.lightsT > 0) G.lightsT -= dt;
    if (!G.warned && G.t > CFG.closingTime - CFG.closingWarn) { G.warned = true; tellAll(`Last call! The casino closes in ${CFG.closingWarn / 60} minutes. Break the bank or catch the killer.`, true, 'meeting'); }
    if (G.t >= CFG.closingTime) { G.closed = true; checkOver(); if (G.over) return; }
    for (const c of G.chars) {
      if (!c.alive) continue;
      for (const k in c.cd) c.cd[k] = Math.max(0, c.cd[k] - dt);
      c.thirst = Math.max(0, c.thirst - CFG.thirstDrain * dt);
      if (c.lucky > 0) c.lucky = Math.max(0, c.lucky - dt);
      if (c.poisonT > 0) { c.poisonT -= dt; if (c.poisonT <= 0) { kill(c, 'poison', byId(c.poisonBy)); continue; } }
      if (c.isHuman) humanTick(c, dt); else botTick(c, dt);
      if (c.drink) { c.drink.x = c.x + Math.cos(c.face + 0.9) * 16; c.drink.y = c.y + Math.sin(c.face + 0.9) * 16; }
      if (G.mode !== 'play') break;
    }
    if (G.mode !== 'play') return;
    crashTick(dt); raceTick(dt);
    G.obsT -= dt; if (G.obsT <= 0) { G.obsT = 0.25; observe(); }
    if (G.pending) {
      G.pending.t -= dt;
      if (G.pending.t <= 0) { const { caller, body } = G.pending; G.pending = null; if (caller.alive && G.mode === 'play') callMeeting(caller, body, `${caller.name} found ${byId(body.id).name}'s body.`); }
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
      chars: G.chars.map(c => ({ id: c.id, name: c.name, color: c.color, hat: c.hat, x: Math.round(c.x), y: Math.round(c.y), look: +c.look.toFixed(2), face: +c.face.toFixed(2),
        alive: c.alive, ejected: !!c.ejected, seat: c.seat ? c.seat.id : null, moving: c.moving, pale: c.poisonT > 0 && c.poisonT < CFG.poisonDelay - 2, human: c.isHuman, lucky: c.lucky > 0 })),
      drinks: G.drinks.map(d => ({ id: d.id, owner: d.owner, holder: d.holder, x: Math.round(d.x), y: Math.round(d.y), sips: d.sips, color: d.color, kind: d.kind })),
      bodies: G.bodies.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), cause: b.cause })),
      bowls: G.bowls.map(b => ({ id: b.id, x: b.x, y: b.y })),
      floats: G.floats.map(f => ({ x: Math.round(f.x), y: Math.round(f.y), text: f.text, color: f.color, t: +f.t.toFixed(2), big: !!f.big })),
      fx: G.fx.map(f => ({ kind: f.kind, x: Math.round(f.x), y: Math.round(f.y), t: +f.t.toFixed(2) })),
      seatsOcc: G.seats.map(s => s.occ ? s.occ.id : null), maxBet: Gm.maxBet(G.bank),
      crash: { phase: G.crash.phase, t: +G.crash.t.toFixed(2), mult: G.crash.mult, point: G.crash.phase === 'boom' ? G.crash.point : null, round: G.crash.round,
        bets: [...G.crash.bets].map(([id, b]) => [id, b.bet, b.out]) },
      race: { phase: G.race.phase, t: +G.race.t.toFixed(2), pays: G.race.form.pays, winner: G.race.phase === 'bet' ? null : G.race.winner, seed: G.race.seed, round: G.race.round,
        bets: [...G.race.bets].map(([id, b]) => [id, b.duck, b.bet]) },
      meeting: m && { title: m.title, reason: m.reason, phase: m.phase, lines: m.lines.slice(), voteT: Math.ceil(m.voteT), result: m.result, tally: m.tally, skips: m.skips,
        ejected: m.ejected ?? null, ejectedKiller: !!m.ejectedKiller, voted: G.chars.filter(c => c.alive && c.isHuman && c.voted !== null).map(c => c.id) },
      over: G.over,
    };
  }
  function view(id, pub) {
    const c = byId(id);
    const ctx = contextFor(c);
    const myDrink = c.drink || G.drinks.find(d => d.owner === c.id);
    const priv = {
      me: c.id, isKiller: c.isKiller, killers: c.isKiller ? G.killerIds.slice() : [c.id].filter(() => false), alive: c.alive,
      thirst: Math.round(c.thirst), cd: { poison: Math.ceil(c.cd.poison), shiv: Math.ceil(c.cd.shiv), lights: Math.ceil(c.cd.lights) },
      notes: c.notes.slice(-12).map(n => ({ text: n.text, hard: !!n.hard })), inbox: c.inbox.splice(0),
      ctx: ctx ? ctx.label : null, posVer: c.posVer, x: c.x, y: c.y, seat: c.seat ? { id: c.seat.id, x: c.seat.x, y: c.seat.y, face: c.seat.face, game: c.seat.game, tier: c.seat.tier || null } : null,
      drink: myDrink ? { kind: myDrink.kind, sips: myDrink.sips, held: myDrink.holder === c.id } : null,
      sniffT: c.sniff ? c.sniff.t : 0, bellUsed: c.bellUsed, voted: c.voted, accused: c.accused, lucky: Math.ceil(c.lucky),
      spiked: c.isKiller ? G.drinks.filter(d => d.poisoned).map(d => d.id).concat(G.bowls.filter(b => b.spiked).map(b => 'bowl' + b.id)) : [],
    };
    if (G.over) priv.won = G.over.killersWin === c.isKiller;
    return { pub: pub || pubView(), priv };
  }

  return { G, tick, action, setInput, view, pubView, dropHuman, tell, canSee, chars, byId, newCrash, newRace };
}
