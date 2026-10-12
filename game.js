'use strict';
// Last Call: a casino social-deduction game. One gambler is a killer who poisons drinks and
// stabs loners, but only when nobody is looking. Everyone else wins the crew bankroll or votes them out.
(() => {
  // ---------- Tuning ----------
  const CFG = {
    startBank: 3000, targetBank: 9000,
    playerSpeed: 150, ghostSpeed: 220, botSpeed: 118, radius: 15,
    viewRange: 290, darkRange: 120, coneHalf: Math.PI / 3, nearSense: 28,
    thirstDrain: 1.1, sipGain: 30, drinkSips: 4, parched: 0.6,
    poisonDelay: 7, botSniffChance: 0.25,
    poisonCd: 45, shivCd: 60, lightsCd: 60, lightsDur: 10, startCd: 30, sharedCd: 30,
    reach: 40,
    bot: { bjBet: 300, bjEvery: 4, rlEvery: 5, raceEvery: 8, bjWin: 0.56, bjPush: 0.1, rlWin: 0.54 },
    playerBet: 250,
    meetingVote: 25, chatGap: 0.9, voteThreshold: 24,
  };

  // ---------- Helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const $ = id => document.getElementById(id);

  // ---------- Map ----------
  const W = 1800, H = 1200;
  const ROOMS = {
    bar: { x: 20, y: 20, w: 500, h: 580, name: 'the bar', floor: '#3a281d' },
    rest: { x: 20, y: 620, w: 500, h: 560, name: 'the restrooms', floor: '#26343a' },
    floor: { x: 540, y: 20, w: 720, h: 1160, name: 'the casino floor', floor: '#4a1622' },
    race: { x: 1280, y: 20, w: 500, h: 570, name: 'the race lounge', floor: '#1d2742' },
    vip: { x: 1280, y: 610, w: 500, h: 570, name: 'the VIP lounge', floor: '#35203f' },
  };
  const WALLS = [
    { x: 0, y: 0, w: W, h: 20 }, { x: 0, y: H - 20, w: W, h: 20 }, { x: 0, y: 0, w: 20, h: H }, { x: W - 20, y: 0, w: 20, h: H },
    { x: 20, y: 600, w: 200, h: 20 }, { x: 320, y: 600, w: 200, h: 20 },
    { x: 520, y: 20, w: 20, h: 230 }, { x: 520, y: 370, w: 20, h: 480 }, { x: 520, y: 970, w: 20, h: 210 },
    { x: 1260, y: 20, w: 20, h: 230 }, { x: 1260, y: 370, w: 20, h: 480 }, { x: 1260, y: 970, w: 20, h: 210 },
    { x: 1280, y: 590, w: 200, h: 20 }, { x: 1580, y: 590, w: 200, h: 20 },
    // restroom stall dividers
    { x: 260, y: 1050, w: 10, h: 110 }, { x: 380, y: 1050, w: 10, h: 110 },
  ];
  const OBSTACLES = [
    { x: 60, y: 60, w: 400, h: 50, kind: 'counter' },
    { x: 800, y: 280, w: 200, h: 80, kind: 'bj' },
    { x: 790, y: 800, w: 220, h: 100, kind: 'roulette' },
    { x: 30, y: 700, w: 40, h: 260, kind: 'sinks' },
  ];
  const SOLIDS = WALLS.concat(OBSTACLES);
  const DOORS = [
    { a: 'bar', b: 'floor', pa: { x: 490, y: 310 }, pb: { x: 570, y: 310 } },
    { a: 'rest', b: 'floor', pa: { x: 490, y: 910 }, pb: { x: 570, y: 910 } },
    { a: 'bar', b: 'rest', pa: { x: 270, y: 570 }, pb: { x: 270, y: 650 } },
    { a: 'floor', b: 'race', pa: { x: 1230, y: 310 }, pb: { x: 1310, y: 310 } },
    { a: 'floor', b: 'vip', pa: { x: 1230, y: 910 }, pb: { x: 1310, y: 910 } },
    { a: 'race', b: 'vip', pa: { x: 1530, y: 560 }, pb: { x: 1530, y: 640 } },
  ];
  const TAP = { x: 260, y: 145 };
  const BELL = { x: 900, y: 590 };
  const REST_SPOTS = [{ x: 100, y: 760 }, { x: 100, y: 900 }, { x: 320, y: 1110 }, { x: 440, y: 1110 }, { x: 200, y: 1110 }];
  const SEATS = [];
  function addSeat(game, x, y, face, dy) {
    SEATS.push({ id: SEATS.length, game, x, y, face, drink: { x, y: y + dy }, approach: { x, y: y + dy * 1.45 }, occ: null });
  }
  [815, 875, 935, 995].forEach((x, i) => addSeat('bj', x, i === 0 || i === 3 ? 392 : 402, -Math.PI / 2, 42));
  [815, 875, 935, 995].forEach((x, i) => addSeat('roulette', x, i === 0 || i === 3 ? 778 : 770, Math.PI / 2, -42));
  [1360, 1460, 1560, 1660].forEach(x => addSeat('race', x, 330, -Math.PI / 2, 42));
  [1400, 1530, 1660].forEach(x => addSeat('vip', x, 800, -Math.PI / 2, 42));
  const GAME_NAMES = { bj: 'blackjack', roulette: 'roulette', race: 'the races', vip: 'the VIP lounge' };

  const CAST = [
    { name: 'Red', color: '#e8443a' }, { name: 'Mint', color: '#3ddc97' }, { name: 'Biscuit', color: '#e0a95b' },
    { name: 'Lola', color: '#ff7ac8' }, { name: 'Duke', color: '#4a7dff' }, { name: 'Pip', color: '#f4e04d' },
  ];
  const DRINKS = [
    { kind: 'martini', color: '#d9f0c8' }, { kind: 'beer', color: '#e8b440' },
    { kind: 'whiskey', color: '#b8692a' }, { kind: 'mojito', color: '#9be08a' }, { kind: 'cosmo', color: '#ff6f9a' },
  ];

  // ---------- Geometry ----------
  function segRect(x1, y1, x2, y2, r) {
    let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
    const p = [-dx, dx, -dy, dy], q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  function los(a, b) { for (const w of WALLS) if (segRect(a.x, a.y, b.x, b.y, w)) return false; return true; }
  function collide(c) {
    const R = CFG.radius;
    for (const r of SOLIDS) {
      const nx = clamp(c.x, r.x, r.x + r.w), ny = clamp(c.y, r.y, r.y + r.h);
      const dx = c.x - nx, dy = c.y - ny, d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      if (d2 > 1e-4) { const d = Math.sqrt(d2); c.x += dx / d * (R - d); c.y += dy / d * (R - d); }
      else {
        const l = c.x - r.x, rr = r.x + r.w - c.x, t = c.y - r.y, b = r.y + r.h - c.y, m = Math.min(l, rr, t, b);
        if (m === l) c.x = r.x - R; else if (m === rr) c.x = r.x + r.w + R; else if (m === t) c.y = r.y - R; else c.y = r.y + r.h + R;
      }
    }
  }
  function roomOf(p) {
    for (const k in ROOMS) { const r = ROOMS[k]; if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return k; }
    for (const k in ROOMS) { const r = ROOMS[k]; if (p.x >= r.x - 30 && p.x <= r.x + r.w + 30 && p.y >= r.y - 30 && p.y <= r.y + r.h + 30) return k; }
    return 'floor';
  }
  function route(from, to) {
    const a = roomOf(from), b = roomOf(to);
    if (a === b) return [{ x: to.x, y: to.y }];
    const prev = { [a]: null }, q = [a];
    while (q.length) {
      const r = q.shift(); if (r === b) break;
      for (const d of DOORS) {
        const n = d.a === r ? d.b : d.b === r ? d.a : null;
        if (n && !(n in prev)) { prev[n] = { r, d }; q.push(n); }
      }
    }
    const pts = []; let cur = b;
    while (prev[cur]) { const { r, d } = prev[cur]; const near = d.a === r ? [d.pa, d.pb] : [d.pb, d.pa]; pts.unshift(...near); cur = r; }
    pts.push({ x: to.x, y: to.y });
    return detour(from, pts.map(p => ({ x: p.x, y: p.y })));
  }
  // Insert corner waypoints so straight legs never cut through a table or the bar counter.
  const inflate = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
  function blockedBy(a, b) { return OBSTACLES.find(o => segRect(a.x, a.y, b.x, b.y, inflate(o, CFG.radius - 1))) || null; }
  function detour(from, pts) {
    const out = []; let cur = from;
    for (const p of pts) {
      for (let guard = 0; guard < 4; guard++) {
        const o = blockedBy(cur, p); if (!o) break;
        const r = inflate(o, CFG.radius + 10);
        const corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
        let best = null, bl = Infinity;
        for (const c of corners) {
          if (blockedBy(cur, c) === o) continue;
          const l = dist(cur, c) + dist(c, p) + (blockedBy(c, p) === o ? 1e4 : 0);
          if (l < bl) { bl = l; best = c; }
        }
        if (!best) break;
        out.push(best); cur = best;
      }
      out.push(p); cur = p;
    }
    return out;
  }

  // ---------- State ----------
  let S = null;
  const view = $('view'), ctx = view.getContext('2d');
  const dark = document.createElement('canvas'), dctx = dark.getContext('2d');
  const keys = {}; const mouse = { x: 0, y: 0 };
  let cam = { x: 0, y: 0, z: 1 };

  function newGame(roleChoice) {
    const killerIdx = roleChoice === 'killer' ? 0 : roleChoice === 'gambler' ? 1 + Math.floor(Math.random() * 5) : Math.floor(Math.random() * 6);
    const chars = CAST.map((c, i) => ({
      id: i, name: c.name, color: c.color, isPlayer: i === 0, isKiller: i === killerIdx,
      x: BELL.x + Math.cos(i / 6 * Math.PI * 2) * 120, y: BELL.y + Math.sin(i / 6 * Math.PI * 2) * 120,
      face: 0, look: 0, alive: true, thirst: rand(55, 90), drink: null, seat: null, state: 'idle', path: [], wait: 0,
      poisonT: 0, poisonBy: null, poisonDrink: null, stuckT: 0, lastPos: { x: 0, y: 0 },
      cd: { poison: CFG.startCd, shiv: CFG.startCd + 10, lights: CFG.startCd + 20 },
      glanceT: rand(3, 8), glancing: 0, glanceOff: 0, gameT: rand(1, 4), sipT: rand(3, 8), sitT: 0,
      sus: {}, witnessed: [], lastSeen: {}, touches: {}, huntT: rand(4, 8), hunt: null, lies: 0, bellUsed: false,
    }));
    S = {
      mode: 'play', t: 0, bank: CFG.startBank, chars, drinks: [], bodies: [], floats: [], lightsT: 0,
      nextDrinkId: 1, obsT: 0, pending: null, meeting: null, notes: [], sniff: null, deaths: [], ejected: [],
      raceT: 0,
    };
    S.player = chars[0];
    S.killer = chars[killerIdx];
    for (const c of chars) for (const o of chars) c.sus[o.id] = 0;
    $('title').classList.add('hidden'); $('over').classList.add('hidden'); $('hud').classList.remove('hidden');
    const role = $('role');
    if (S.player.isKiller) {
      role.className = 'killer';
      role.innerHTML = '<b>You are the KILLER.</b> Poison drinks and stab loners when nobody is looking. Win when only one gambler is left.';
      $('killerBar').classList.remove('hidden');
    } else {
      role.className = '';
      role.innerHTML = '<b>You are a GAMBLER.</b> Win the crew ' + money(CFG.targetBank) + ' or vote out the killer. Watch your drink.';
      $('killerBar').classList.add('hidden');
    }
    closePanel();
    toast(S.player.isKiller ? 'You are the killer. Nobody can know.' : 'One of these five is a killer. Keep your eyes open.', S.player.isKiller);
    sfx('start');
  }

  // ---------- Vision & witnesses ----------
  function viewRange() { return S.lightsT > 0 ? CFG.darkRange : CFG.viewRange; }
  function canSee(v, p) {
    if (!v.alive) return false;
    const d = dist(v, p);
    if (d > viewRange()) return false;
    if (d > CFG.nearSense) {
      const a = Math.atan2(p.y - v.y, p.x - v.x);
      if (Math.abs(angDiff(a, v.look)) > CFG.coneHalf) return false;
    }
    return los(v, p);
  }
  // Who would see `actor` right now. `careless` lets bot killers misjudge the player's gaze.
  function witnessesOf(actor, ignore, careless) {
    return S.chars.filter(c => c !== actor && c !== ignore && c.alive && canSee(c, actor) &&
      !(careless && Math.random() < (c.isPlayer ? 0.3 : 0.12)));
  }
  function playerSees(p) { return !S.player.alive || p === S.player || canSee(S.player, p); }

  // ---------- Drinks ----------
  function pourFor(c) {
    const k = pick(DRINKS);
    const d = { id: S.nextDrinkId++, owner: c.id, holder: c.id, x: c.x, y: c.y, sips: CFG.drinkSips, poisoned: false, poisonBy: null, kind: k.kind, color: k.color, placedAt: 0 };
    S.drinks.push(d); c.drink = d; sfx('pour');
    return d;
  }
  function placeDrink(c, spot) {
    const d = c.drink; if (!d) return;
    d.holder = null; d.x = spot.x; d.y = spot.y; d.placedAt = S.t; c.drink = null;
    for (const o of S.chars) o.touches[d.id] = new Set();
  }
  function pickUpDrink(c, d) { d.holder = c.id; c.drink = d; }
  function ownRailDrink(c) {
    return S.drinks.find(d => d.owner === c.id && !d.holder && d.sips > 0 && c.seat && dist(d, c.seat.drink) < 5) || null;
  }
  function removeDrink(d) {
    S.drinks = S.drinks.filter(x => x !== d);
    for (const c of S.chars) if (c.drink === d) c.drink = null;
  }
  function sip(c, d) {
    d.sips--; c.thirst = Math.min(100, c.thirst + CFG.sipGain);
    if (c.isPlayer) sfx('sip');
    if (d.poisoned && !c.poisonT) { c.poisonT = CFG.poisonDelay; c.poisonBy = d.poisonBy; c.poisonDrink = d.id; c.poisonKind = d.kind; }
    if (d.sips <= 0) removeDrink(d);
  }

  // ---------- Killer actions ----------
  function doPoison(k, d) {
    if (k.cd.poison > 0 || !d || d.holder || d.poisoned || d.owner === k.id) return false;
    d.poisoned = true; d.poisonBy = k.id; k.cd.poison = CFG.poisonCd; k.cd.shiv = Math.max(k.cd.shiv, CFG.sharedCd);
    const owner = S.chars[d.owner];
    noteWitnesses(k, 'poison', owner, `tip something into ${owner.name}'s ${d.kind}`);
    if (k.isPlayer) { toast(`You spiked ${owner.name}'s ${d.kind}.`); sfx('poison'); }
    return true;
  }
  function doShiv(k, v) {
    if (k.cd.shiv > 0 || !v || !v.alive || v === k || dist(k, v) > CFG.reach + 5) return false;
    noteWitnesses(k, 'shiv', v, `stab ${v.name}`);
    k.cd.shiv = CFG.shivCd; k.cd.poison = Math.max(k.cd.poison, CFG.sharedCd);
    kill(v, 'shiv', k);
    return true;
  }
  function doLights(k) {
    if (k.cd.lights > 0) return false;
    k.cd.lights = CFG.lightsCd; S.lightsT = CFG.lightsDur;
    toast('The lights cut out!', true); sfx('lights');
    return true;
  }
  function noteWitnesses(k, what, victim, phrase) {
    for (const w of witnessesOf(k, victim)) {
      if (w.isPlayer) {
        S.notes.push({ t: S.t, text: `You saw <b>${k.name}</b> ${phrase}.`, who: k.id });
        toast(`You saw ${k.name} ${phrase}!`, true);
      } else {
        w.witnessed.push({ who: k.id, what, victim: victim.id, phrase, t: S.t });
        w.sus[k.id] += 120;
      }
    }
  }
  function kill(v, cause, by) {
    v.alive = false; v.poisonT = 0;
    if (v.seat) { v.seat.occ = null; v.seat = null; }
    if (v.drink) { v.drink.holder = null; v.drink.x = v.x + 18; v.drink.y = v.y + 6; v.drink = null; }
    S.bodies.push({ x: v.x, y: v.y, id: v.id, cause, by: by ? by.id : null, drinkId: v.poisonDrink, kind: v.poisonKind, reported: false, t: S.t });
    S.deaths.push(v.id);
    if (v.isPlayer) {
      closePanel();
      toast(cause === 'poison' ? `Your ${v.poisonKind} was poisoned. You're a ghost now.` : 'Someone stabbed you. You\'re a ghost now.', true);
      sfx('die');
    } else if (playerSees(v)) {
      toast(cause === 'poison' ? `${v.name} collapsed!` : `${v.name} was stabbed!`, true);
      sfx('die');
    }
    checkOver();
  }

  // ---------- Bots ----------
  function setGoal(c, p) { c.path = route(c, p); c.stuckT = 0; }
  function followPath(c, dt, speed) {
    if (!c.path.length) return true;
    const p = c.path[0], dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
    if (d < 5) { c.path.shift(); return !c.path.length; }
    const s = Math.min(d, speed * dt);
    c.x += dx / d * s; c.y += dy / d * s; c.face = Math.atan2(dy, dx);
    collide(c);
    c.stuckT += dt;
    if (c.stuckT > 1) {
      if (dist(c, c.lastPos) < 12) { c.x += rand(-14, 14); c.y += rand(-14, 14); collide(c); c.path = route(c, c.path[0]).concat(c.path.slice(1)); }
      c.lastPos = { x: c.x, y: c.y }; c.stuckT = 0;
    }
    return false;
  }
  function standUp(c) {
    if (!c.seat) return;
    const rd = ownRailDrink(c);
    if (rd && !c.drink) pickUpDrink(c, rd);
    c.x = c.seat.approach.x; c.y = c.seat.approach.y;
    c.seat.occ = null; c.seat = null;
  }
  function freeSeats(c) { return SEATS.filter(s => !s.occ && !(s.claim && s.claim !== c.id)); }
  function botChoose(c) {
    const hasDrink = c.drink || S.drinks.some(d => d.owner === c.id && d.sips > 0);
    if (c.thirst < 50 && !hasDrink) { c.state = 'getDrink'; setGoal(c, { x: TAP.x + rand(-80, 80), y: TAP.y + 10 }); return; }
    const r = Math.random();
    if (r < 0.12) { c.state = 'rest'; setGoal(c, pick(REST_SPOTS)); return; }
    if (r < 0.2) { c.state = 'wander'; const room = ROOMS[pick(['floor', 'vip', 'race', 'bar'])]; setGoal(c, { x: rand(room.x + 60, room.x + room.w - 60), y: rand(room.y + 140, room.y + room.h - 60) }); return; }
    // Prefer the seat where their drink is waiting.
    const mine = S.drinks.find(d => d.owner === c.id && !d.holder && d.sips > 0);
    let seat = mine && SEATS.find(s => !s.occ && dist(s.drink, mine) < 5);
    if (!seat) { const free = freeSeats(c).filter(s => !S.drinks.some(d => !d.holder && d.owner !== c.id && dist(d, s.drink) < 5)); seat = free.length ? pick(free) : null; }
    if (!seat) { c.state = 'wander'; setGoal(c, { x: rand(600, 1200), y: rand(480, 700) }); return; }
    seat.claim = c.id; c.target = seat; c.state = 'toSeat';
    setGoal(c, seat.approach); c.path.push({ x: seat.x, y: seat.y });
  }
  function botPlay(c) {
    const B = CFG.bot; let delta = 0; const g = c.seat.game;
    if (g === 'bj') { const r = Math.random(); delta = r < B.bjWin ? B.bjBet : r < B.bjWin + B.bjPush ? 0 : -B.bjBet; c.gameT = B.bjEvery; }
    else if (g === 'roulette') { delta = Math.random() < B.rlWin ? 250 : -250; c.gameT = B.rlEvery; }
    else if (g === 'race') { delta = Math.random() < 0.27 ? 600 : -200; c.gameT = B.raceEvery; }
    else { c.gameT = 99; return; }
    addBank(delta, c.x, c.y - 30);
  }
  function addBank(delta, x, y) {
    if (!delta) { S.floats.push({ x, y, text: 'push', color: '#b9ab90', t: 1.6 }); return; }
    S.bank = Math.max(0, S.bank + delta);
    S.floats.push({ x, y, text: (delta > 0 ? '+' : '') + money(delta), color: delta > 0 ? '#e8c46a' : '#e8443a', t: 1.6 });
    checkOver();
  }
  function botTick(c, dt) {
    // Glances: seated bots look around now and then, which is what makes poisoning a gamble.
    c.glanceT -= dt;
    if (c.glancing > 0) { c.glancing -= dt; } else if (c.glanceT <= 0) { c.glancing = rand(0.8, 1.8); c.glanceOff = rand(-1, 1) * Math.PI; c.glanceT = rand(3, 8); }
    if (c.isKiller && killerBrain(c, dt)) { c.look = c.face; return; }
    switch (c.state) {
      case 'idle': botChoose(c); break;
      case 'getDrink':
        if (followPath(c, dt, CFG.botSpeed)) { c.face = -Math.PI / 2; c.wait += dt; if (c.wait > 1.2) { c.wait = 0; pourFor(c); c.state = 'idle'; } }
        break;
      case 'rest':
        if (followPath(c, dt, CFG.botSpeed)) { c.wait += dt; if (c.wait > rand(3, 7)) { c.wait = 0; c.state = 'idle'; } }
        break;
      case 'wander':
        if (followPath(c, dt, CFG.botSpeed)) { c.wait += dt; if (c.wait > 2) { c.wait = 0; c.state = 'idle'; } }
        break;
      case 'toSeat': {
        const s = c.target;
        if (s.occ && s.occ !== c) { s.claim = null; c.state = 'idle'; break; }
        if (followPath(c, dt, CFG.botSpeed)) {
          s.occ = c; s.claim = null; c.seat = s; c.x = s.x; c.y = s.y; c.face = s.face;
          if (c.drink) placeDrink(c, s.drink);
          c.sitT = rand(22, 45); c.gameT = rand(1, 3); c.state = 'seated';
        }
        break;
      }
      case 'seated': {
        const s = c.seat; c.face = s.face; c.sitT -= dt; c.gameT -= dt; c.sipT -= dt;
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
  function botSip(c, d) {
    if (d.poisoned && !c.isKiller && Math.random() < CFG.botSniffChance) {
      removeDrink(d);
      callMeeting(c, null, `${c.name} sniffed their ${d.kind} and smelled bitter almonds. Someone spiked it.`, { drinkId: d.id, owner: c.id, kind: d.kind });
      return;
    }
    sip(c, d);
  }
  // Returns true while the killer is busy hunting (skips the gambler routine).
  function killerBrain(k, dt) {
    if (k.hunt) {
      const h = k.hunt; h.t -= dt;
      let target = null;
      if (h.kind === 'poison') {
        target = S.drinks.find(d => d.id === h.drinkId);
        if (!target || target.holder || target.poisoned || !S.chars[target.owner].alive) { k.hunt = null; k.state = 'idle'; return false; }
      } else {
        target = S.chars[h.victim];
        if (!target.alive) { k.hunt = null; k.state = 'idle'; return false; }
        h.repath -= dt; if (h.repath <= 0) { h.repath = 0.8; setGoal(k, target); }
      }
      const close = dist(k, target) < CFG.reach - 4;
      if (!close) followPath(k, dt, CFG.botSpeed * (h.kind === 'shiv' ? 1.15 : 1));
      else {
        k.face = Math.atan2(target.y - k.y, target.x - k.x);
        if (witnessesOf(k, h.kind === 'shiv' ? target : null, true).length === 0) {
          if (h.kind === 'poison') doPoison(k, target); else doShiv(k, target);
          k.hunt = null; k.state = 'idle'; return false;
        }
        h.linger += dt; k.face += Math.sin(S.t * 2) * 0.02;
      }
      if (h.t <= 0 || h.linger > 5) { k.hunt = null; k.state = 'idle'; return false; }
      return true;
    }
    k.huntT -= dt;
    if (k.huntT > 0) return false;
    k.huntT = rand(4, 8);
    const gamblers = S.chars.filter(c => c.alive && !c.isKiller);
    let plan = null;
    if (k.cd.shiv <= 0) {
      const loners = gamblers.filter(v => S.chars.filter(o => o.alive && o !== v && o !== k && dist(o, v) < 330 && los(o, v)).length === 0);
      if (loners.length && Math.random() < 0.65) plan = { kind: 'shiv', victim: pick(loners).id };
    }
    if (!plan && k.cd.poison <= 0) {
      const ds = S.drinks.filter(d => !d.holder && !d.poisoned && d.owner !== k.id && S.chars[d.owner].alive);
      if (ds.length && Math.random() < 0.75) { ds.sort((a, b) => dist(a, k) - dist(b, k)); plan = { kind: 'poison', drinkId: ds[Math.floor(Math.random() * Math.min(2, ds.length))].id }; }
    }
    if (!plan) return false;
    if (k.seat) standUp(k);
    if (k.target && k.target.claim === k.id) k.target.claim = null;
    k.state = 'hunting';
    k.hunt = Object.assign(plan, { t: 18, linger: 0, repath: 0 });
    const tgt = plan.kind === 'poison' ? S.drinks.find(d => d.id === plan.drinkId) : S.chars[plan.victim];
    setGoal(k, tgt);
    if (k.cd.lights <= 0 && Math.random() < 0.35) doLights(k);
    return true;
  }

  // ---------- Observation (what each character remembers) ----------
  function observe() {
    for (const v of S.chars) {
      if (!v.alive) continue;
      for (const c of S.chars) {
        if (c === v || !c.alive || !canSee(v, c)) continue;
        const room = roomOf(c);
        v.lastSeen[c.id] = { t: S.t, room, with: S.chars.filter(o => o !== c && o !== v && o.alive && dist(o, c) < 90).map(o => o.id) };
        for (const d of S.drinks) {
          if (d.holder || d.owner === c.id || dist(c, d) > 45) continue;
          (v.touches[d.id] || (v.touches[d.id] = new Set())).add(c.id);
          if (v.isPlayer) {
            const key = c.id + ':' + d.id;
            if (!S.notes.some(n => n.key === key)) S.notes.push({ key, t: S.t, text: `${c.name} hung around ${S.chars[d.owner].name}'s ${d.kind}.`, who: c.id, soft: true });
          }
        }
      }
      for (const b of S.bodies) {
        if (b.reported || !canSee(v, b)) continue;
        if (v.isPlayer) { b.seenByPlayer = true; continue; }
        if (v.isKiller && Math.random() > 0.15) continue;
        if (!S.pending) S.pending = { t: 0.5, caller: v, body: b };
      }
    }
  }

  // ---------- Meetings ----------
  function callMeeting(caller, body, reason, spiked) {
    if (S.mode !== 'play') return;
    closePanel();
    S.mode = 'meeting'; S.pending = null; sfx('meeting');
    const victims = S.bodies.filter(b => !b.cleared);
    victims.forEach(b => { b.reported = true; });
    const lines = buildStatements(victims, spiked, caller);
    S.meeting = { caller, lines, shown: 0, chatT: 0.4, voteT: CFG.meetingVote, votes: {}, playerVote: null, playerAccused: false, victims, done: false, extra: [] };
    $('mTitle').textContent = body ? 'Body reported' : spiked ? 'Spiked drink!' : 'Emergency meeting';
    $('mReason').textContent = reason;
    $('mChat').innerHTML = '';
    const notes = S.notes.filter(n => !n.soft).slice(-4).concat(S.notes.filter(n => n.soft).slice(-5));
    $('mNotes').innerHTML = S.player.alive ? '<b>Your notes</b><br>' + (notes.length ? notes.map(n => '· ' + n.text).join('<br>') : 'You saw nothing useful.') : '<b>You are a ghost.</b> Ghosts can\'t vote.';
    $('meeting').classList.remove('hidden');
    renderVotes();
  }
  function nameSpan(c) { return `<span class="who" style="color:${c.color}">${c.name}</span>`; }
  function buildStatements(victims, spiked, caller) {
    const out = []; const alive = S.chars.filter(c => c.alive && !c.isPlayer);
    const order = alive.slice().sort(() => Math.random() - 0.5);
    if (caller && !caller.isPlayer) { order.splice(order.indexOf(caller), 1); order.unshift(caller); }
    const poisonCases = victims.filter(v => v.cause === 'poison').map(v => ({ drinkId: v.drinkId, owner: v.id, kind: v.kind }));
    if (spiked) poisonCases.push(spiked);
    for (const b of order) {
      const acc = {}; let text = '';
      if (b.isKiller) {
        // The killer lies: frame someone, or play it cool.
        const others = S.chars.filter(c => c.alive && c !== b);
        const accusedMe = out.find(l => l.acc[b.id] > 0);
        if (accusedMe && Math.random() < 0.7) { const liar = S.chars[accusedMe.speaker]; acc[liar.id] = 40; text = `That's a lie. ${liar.name} is trying to pin this on me. I was at ${pick(Object.values(ROOMS)).name}.`; }
        else if (Math.random() < 0.6 && others.length) {
          const x = pick(others); const pc = poisonCases[0];
          if (pc) { acc[x.id] = 35; text = `I saw ${x.name} hanging around ${S.chars[pc.owner].name}'s ${pc.kind}.`; }
          else { acc[x.id] = 25; text = `${x.name} was alone with them right before. Just saying.`; }
          b.lies++;
        } else text = pick(['I was at the tables the whole time. Didn\'t see a thing.', 'I was getting a drink. This is terrifying.', 'Can we skip? We have no proof.']);
      } else {
        const seen = b.witnessed.filter(w => !w.used);
        for (const w of seen) { w.used = true; acc[w.who] = (acc[w.who] || 0) + 120; text += `I SAW ${S.chars[w.who].name} ${w.phrase}! `; }
        if (!seen.length) {
          for (const pc of poisonCases) {
            const t = b.touches[pc.drinkId];
            const sus = t ? [...t].filter(id => id !== b.id && id !== pc.owner) : [];
            if (sus.length) { const x = S.chars[pick(sus)]; acc[x.id] = (acc[x.id] || 0) + 35; text += `I saw ${x.name} hanging around ${S.chars[pc.owner].name}'s ${pc.kind}. `; }
          }
          for (const v of victims.filter(v => v.cause === 'shiv')) {
            const ls = b.lastSeen[v.id];
            if (ls && ls.with.length && S.t - ls.t < 60) { const x = S.chars[pick(ls.with)]; if (x !== b) { acc[x.id] = (acc[x.id] || 0) + 25; text += `Last I saw ${S.chars[v.id].name}, ${x.name} was right next to them in ${ROOMS[ls.room].name}. `; } }
          }
        }
        if (!text) {
          const top = Object.entries(b.sus).filter(([id]) => +id !== b.id && S.chars[id].alive).sort((x, y) => y[1] - x[1])[0];
          if (top && top[1] > 20) { acc[top[0]] = 15; text = `I still don't trust ${S.chars[top[0]].name}.`; }
          else text = pick([`I was at ${b.seat ? GAME_NAMES[b.seat.game] : 'the tables'}. Didn't see anything.`, 'I was busy losing money, sorry.', 'No idea. Somebody start talking.', 'I didn\'t see it. Watch your drinks, people.']);
        }
      }
      out.push({ speaker: b.id, text: text.trim(), acc });
    }
    return out;
  }
  function trust(listener, speaker) {
    if (listener === speaker) return 0;
    if (listener.witnessed.some(w => w.who === speaker.id)) return 0;
    return clamp(0.6 - listener.sus[speaker.id] / 200, 0, 0.8);
  }
  function meetingTick(dt) {
    const m = S.meeting; if (m.done) return;
    if (m.shown < m.lines.length) {
      m.chatT -= dt;
      if (m.chatT <= 0) { m.chatT = CFG.chatGap; const l = m.lines[m.shown++]; addChat(S.chars[l.speaker], l.text); }
      return;
    }
    m.voteT -= dt;
    $('mTimer').textContent = S.player.alive ? `Voting closes in ${Math.ceil(m.voteT)}s` : `Votes are in soon (${Math.ceil(m.voteT)}s)`;
    if (m.voteT <= 0 || (!S.player.alive && m.voteT < CFG.meetingVote - 3) || m.playerVote !== null) resolveVotes();
  }
  function addChat(c, text) {
    const p = document.createElement('p'); p.innerHTML = nameSpan(c) + ': ' + text;
    $('mChat').appendChild(p); $('mChat').scrollTop = 1e6; sfx('chat');
  }
  function renderVotes() {
    const m = S.meeting; const box = $('mVotes'); box.innerHTML = '';
    const canAct = S.player.alive && m.playerVote === null;
    for (const c of S.chars.filter(c => c.alive)) {
      const row = document.createElement('div'); row.className = 'vrow';
      const vb = document.createElement('button');
      vb.innerHTML = `<span class="dot" style="background:${c.color}"></span>Vote ${c.name}${c.isPlayer ? ' (you)' : ''}`;
      vb.disabled = !canAct || c.isPlayer; vb.onclick = () => { m.playerVote = c.id; };
      row.appendChild(vb);
      if (!c.isPlayer) {
        const ab = document.createElement('button'); ab.textContent = 'Accuse'; ab.disabled = !canAct || m.playerAccused;
        ab.onclick = () => { m.playerAccused = true; m.extra.push({ speaker: 0, acc: { [c.id]: 40 } }); addChat(S.player, `I think it's ${c.name}.`); renderVotes(); };
        row.appendChild(ab);
      }
      const t = document.createElement('span'); t.className = 'tally'; t.id = 'tally' + c.id; row.appendChild(t);
      box.appendChild(row);
    }
    const sk = document.createElement('button'); sk.textContent = 'Skip vote'; sk.disabled = !canAct; sk.onclick = () => { m.playerVote = -1; };
    box.appendChild(sk);
  }
  function resolveVotes() {
    const m = S.meeting; m.done = true;
    const alive = S.chars.filter(c => c.alive);
    const statements = m.lines.concat(m.extra);
    const tally = {}; let skips = 0;
    for (const b of alive.filter(c => !c.isPlayer)) {
      const score = {};
      for (const c of alive) score[c.id] = c === b ? -999 : b.sus[c.id];
      for (const st of statements) {
        const sp = S.chars[st.speaker]; const tr = trust(b, sp);
        for (const id in st.acc) {
          if (+id === b.id && !b.isKiller) { b.sus[sp.id] += 45; continue; } // they know that's a lie
          if (score[id] !== undefined) score[id] += st.acc[id] * tr;
        }
      }
      if (b.isKiller) score[b.id] = -999;
      for (const id in score) score[id] += rand(-8, 8);
      const best = Object.entries(score).sort((x, y) => y[1] - x[1])[0];
      if (best && best[1] >= CFG.voteThreshold) tally[best[0]] = (tally[best[0]] || 0) + 1; else skips++;
      // Accusations leave a residue of suspicion for the next meeting.
      for (const st of statements) for (const id in st.acc) if (+id !== b.id) b.sus[id] += st.acc[id] * trust(b, S.chars[st.speaker]) * 0.3;
    }
    if (S.player.alive) { if (m.playerVote >= 0 && m.playerVote !== null) tally[m.playerVote] = (tally[m.playerVote] || 0) + 1; else skips++; }
    for (const c of alive) { const el = $('tally' + c.id); if (el) el.textContent = tally[c.id] ? '●'.repeat(tally[c.id]) : ''; }
    const sorted = Object.entries(tally).sort((x, y) => y[1] - x[1]);
    let ej = null;
    if (sorted.length && sorted[0][1] > skips && !(sorted[1] && sorted[1][1] === sorted[0][1])) ej = S.chars[sorted[0][0]];
    let msg;
    if (!ej) msg = `No one was thrown out (${skips} skipped).`;
    else {
      ej.alive = false; S.ejected.push(ej.id);
      if (ej.seat) { ej.seat.occ = null; ej.seat = null; }
      msg = ej.isKiller ? `${ej.name} got thrown out by security. ${ej.name} WAS the killer.` : `${ej.name} got thrown out by security. ${ej.name} was NOT the killer.`;
    }
    $('mTimer').innerHTML = '<b style="color:var(--gold)">' + msg + '</b>';
    [...$('mVotes').querySelectorAll('button')].forEach(b => { b.disabled = true; });
    setTimeout(() => endMeeting(msg), 3200);
  }
  function endMeeting(msg) {
    $('meeting').classList.add('hidden');
    for (const b of S.bodies) b.cleared = true;
    S.bodies = [];
    const alive = S.chars.filter(c => c.alive);
    alive.forEach((c, i) => {
      if (c.seat) { c.seat.occ = null; c.seat = null; }
      c.x = BELL.x + Math.cos(i / alive.length * Math.PI * 2) * 120; c.y = BELL.y + Math.sin(i / alive.length * Math.PI * 2) * 120;
      c.state = 'idle'; c.path = []; c.hunt = null; c.cd.shiv = Math.max(c.cd.shiv, 15);
    });
    if (!S.player.alive) { S.player.x = BELL.x; S.player.y = BELL.y - 60; }
    SEATS.forEach(s => { s.claim = null; });
    S.mode = 'play'; S.meeting = null;
    toast(msg);
    checkOver();
  }

  // ---------- Win / lose ----------
  function checkOver() {
    if (!S || S.mode === 'over') return;
    const killerAlive = S.killer.alive;
    const gamblers = S.chars.filter(c => c.alive && !c.isKiller).length;
    let win = null, text = '';
    if (!killerAlive) { win = 'gamblers'; text = `${S.killer.name} was the killer, and security dragged them out.`; }
    else if (gamblers <= 1) { win = 'killer'; text = `${S.killer.name} was the killer. Last call came for everyone.`; }
    else if (S.bank >= CFG.targetBank) { win = 'gamblers'; text = `The crew broke the bank with ${money(S.bank)}. ${S.killer.name} was the killer, and it didn't matter.`; }
    if (!win) return;
    if (S.mode === 'meeting' && !S.meeting.done) return;
    S.mode = 'over';
    const youWon = (win === 'killer') === S.player.isKiller;
    setTimeout(() => {
      $('meeting').classList.add('hidden'); closePanel();
      $('oTitle').textContent = youWon ? 'You win' : 'You lose';
      $('oTitle').style.color = youWon ? 'var(--gold)' : 'var(--red)';
      $('oText').textContent = text;
      $('over').classList.remove('hidden');
      sfx(youWon ? 'win' : 'lose');
    }, 600);
  }

  // ---------- Player ----------
  function nearest(list, p, max) { let best = null, bd = max; for (const o of list) { const d = dist(o, p); if (d < bd) { bd = d; best = o; } } return best; }
  function playerContext() {
    const p = S.player;
    if (!p.alive) return null;
    const body = S.bodies.find(b => !b.reported && dist(b, p) < 90 && canSee(p, b));
    if (body) return { label: 'E · Report body', act: () => callMeeting(p, body, `${p.name} found ${S.chars[body.id].name}'s body.`) };
    if (p.seat) return { label: 'E · Stand up', act: () => { standUp(p); closePanel(); } };
    if (!p.drink && dist(p, TAP) < 75) return { label: 'E · Order a drink', act: () => { pourFor(p); toast(`One ${p.drink.kind}, on the house.`); } };
    if (dist(p, BELL) < 60 && !p.bellUsed) return { label: 'E · Ring the pit bell (meeting)', act: () => { p.bellUsed = true; callMeeting(p, null, `${p.name} rang the pit bell.`); } };
    const seat = SEATS.find(s => !s.occ && dist(s, p) < 45);
    if (seat) return { label: `E · Sit at ${GAME_NAMES[seat.game]}`, act: () => sitPlayer(seat) };
    const mine = S.drinks.find(d => d.owner === p.id && !d.holder && dist(d, p) < CFG.reach);
    if (mine && !p.drink) return { label: `E · Pick up your ${mine.kind}`, act: () => pickUpDrink(p, mine) };
    return null;
  }
  function sitPlayer(seat) {
    const p = S.player;
    seat.occ = p; p.seat = seat; p.x = seat.x; p.y = seat.y; p.face = seat.face;
    if (p.drink) placeDrink(p, seat.drink);
    openPanel(seat.game);
  }
  function playerSipTarget() {
    const p = S.player;
    if (p.drink) return p.drink;
    return S.drinks.find(d => d.owner === p.id && !d.holder && dist(d, p) < CFG.reach + 15) || null;
  }
  function onKey(k) {
    if (!S || S.mode !== 'play') return;
    const p = S.player;
    if (k === 'e') { const c = playerContext(); if (c) c.act(); }
    if (!p.alive) return;
    if (k === 'f') { const d = playerSipTarget(); if (d) sip(p, d); else toast('You have nothing to drink. The bar is to the west.'); }
    if (k === 'r') {
      const d = p.drink || nearest(S.drinks.filter(d => !d.holder), p, CFG.reach + 15);
      if (d) { S.sniff = { d, t: 1.5, x: p.x, y: p.y }; toast('Sniffing... hold still.'); } else toast('No drink within reach to sniff.');
    }
    if (k === 'x') {
      const d = p.drink || S.drinks.find(d => d.owner === p.id && !d.holder && dist(d, p) < CFG.reach + 15);
      if (d) { removeDrink(d); toast(`You poured out your ${d.kind}.`); }
    }
    if (p.isKiller) {
      if (k === '1') {
        const d = nearest(S.drinks.filter(d => !d.holder && d.owner !== p.id && !d.poisoned), p, CFG.reach);
        if (p.cd.poison > 0) toast(`Poison ready in ${Math.ceil(p.cd.poison)}s.`); else if (!d) toast('Get next to someone else\'s unattended drink.'); else doPoison(p, d);
      }
      if (k === '2') {
        const v = nearest(S.chars.filter(c => c.alive && c !== p), p, CFG.reach + 5);
        if (p.cd.shiv > 0) toast(`Shiv ready in ${Math.ceil(p.cd.shiv)}s.`); else if (!v) toast('Get right next to someone.'); else { doShiv(p, v); sfx('stab'); }
      }
      if (k === '3') { if (!doLights(p)) toast(`Lights out ready in ${Math.ceil(p.cd.lights)}s.`); }
    }
  }
  function playerTick(dt) {
    const p = S.player;
    let mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    let my = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    if (p.seat) {
      p.look = p.face + (keys[' '] ? Math.PI : 0);
      if (mx || my) { standUp(p); closePanel(); }
      return;
    }
    const wm = screenToWorld(mouse.x, mouse.y);
    p.look = p.face = Math.atan2(wm.y - p.y, wm.x - p.x);
    if (mx || my) {
      const l = Math.hypot(mx, my); mx /= l; my /= l;
      const sp = !p.alive ? CFG.ghostSpeed : p.thirst <= 0 ? CFG.playerSpeed * CFG.parched : CFG.playerSpeed;
      p.x += mx * sp * dt; p.y += my * sp * dt;
      if (p.alive) collide(p); else { p.x = clamp(p.x, 0, W); p.y = clamp(p.y, 0, H); }
      if (S.sniff) { S.sniff = null; toast('Sniff interrupted.'); }
    }
    if (S.sniff) {
      S.sniff.t -= dt;
      if (S.sniff.t <= 0) {
        const d = S.sniff.d; S.sniff = null;
        if (!S.drinks.includes(d)) return;
        const owner = S.chars[d.owner];
        const whose = owner === p ? 'your' : owner.name + "'s";
        if (d.poisoned) { toast(`Bitter almonds. ${whose} ${d.kind} is POISONED.`, true); sfx('poison'); if (!p.isKiller) S.notes.push({ t: S.t, text: `${whose} ${d.kind} was poisoned.` }); }
        else toast(`Smells like a perfectly normal ${d.kind}.`);
      }
    }
  }

  // ---------- Table games (player panel) ----------
  let panel = null;
  function closePanel() { panel = null; $('panel').classList.add('hidden'); $('panel').innerHTML = ''; }
  function openPanel(game) {
    panel = { game };
    const el = $('panel'); el.classList.remove('hidden');
    const tip = '<div class="small">Your drink is on the rail behind you. Hold <kbd>Space</kbd> to look back.</div>';
    if (game === 'bj') {
      el.innerHTML = `<h3>Blackjack</h3><div>Dealer: <span class="cards" id="bjD"></span></div><div>You: <span class="cards" id="bjP"></span></div>
        <div class="row"><button id="bjDeal">Deal ${money(CFG.playerBet)}</button><button id="bjHit" disabled>Hit</button><button id="bjStand" disabled>Stand</button></div><div class="res" id="bjR"></div>${tip}`;
      $('bjDeal').onclick = bjDeal; $('bjHit').onclick = bjHit; $('bjStand').onclick = bjStand;
    } else if (game === 'roulette') {
      el.innerHTML = `<h3>Roulette</h3><div class="cards" id="rlN">-</div>
        <div class="row"><button data-c="red" style="border-color:#e8443a">Red ×2</button><button data-c="black">Black ×2</button><button data-c="green" style="border-color:#3ddc97">Green ×14</button></div><div class="res" id="rlR"></div>${tip}`;
      el.querySelectorAll('[data-c]').forEach(b => { b.onclick = () => rlSpin(b.dataset.c); });
    } else if (game === 'race') {
      const horses = ['Gravy Train', 'Lucky Lou', 'Big Debt', 'Nine Lives'];
      el.innerHTML = `<h3>The races</h3>${horses.map((h, i) => `<div class="small">${h}</div><div class="track"><i id="h${i}" style="background:${['#e8443a', '#3ddc97', '#4a7dff', '#f4e04d'][i]}"></i></div>`).join('')}
        <div class="row">${horses.map((h, i) => `<button data-h="${i}">${h}</button>`).join('')}</div><div class="res" id="raceR">Bet ${money(CFG.playerBet)} on a horse. Pays ×4.</div>${tip}`;
      el.querySelectorAll('[data-h]').forEach(b => { b.onclick = () => raceRun(+b.dataset.h, horses); });
    } else {
      el.innerHTML = `<h3>VIP lounge</h3><div>No games here. Just you, a velvet couch, and whoever is behind you.</div>${tip}`;
    }
  }
  const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const draw = () => pick(RANKS) + pick(SUITS);
  const val = c => { const r = c.slice(0, -1); return r === 'A' ? 11 : 'JQK'.includes(r) ? 10 : +r; };
  function total(h) { let t = h.reduce((s, c) => s + val(c), 0), a = h.filter(c => c[0] === 'A').length; while (t > 21 && a--) t -= 10; return t; }
  function bjShow(hideHole) {
    const b = panel.bj;
    $('bjD').textContent = hideHole ? b.d[0] + ' ??' : b.d.join(' ') + ' (' + total(b.d) + ')';
    $('bjP').textContent = b.p.join(' ') + ' (' + total(b.p) + ')';
  }
  function bjDeal() {
    if (!panel || panel.game !== 'bj') return;
    panel.bj = { p: [draw(), draw()], d: [draw(), draw()] };
    $('bjDeal').disabled = true; $('bjHit').disabled = false; $('bjStand').disabled = false; $('bjR').textContent = '';
    bjShow(true);
    if (total(panel.bj.p) === 21) bjEnd(Math.round(CFG.playerBet * 1.5), 'Blackjack!');
  }
  function bjHit() { const b = panel.bj; b.p.push(draw()); bjShow(true); if (total(b.p) > 21) bjEnd(-CFG.playerBet, 'Bust.'); }
  function bjStand() {
    const b = panel.bj; while (total(b.d) < 17) b.d.push(draw());
    const pt = total(b.p), dt = total(b.d);
    if (dt > 21 || pt > dt) bjEnd(CFG.playerBet, 'You win.'); else if (pt === dt) bjEnd(0, 'Push.'); else bjEnd(-CFG.playerBet, 'Dealer wins.');
  }
  function bjEnd(delta, text) {
    bjShow(false); $('bjR').textContent = text + (delta ? ' ' + (delta > 0 ? '+' : '') + money(delta) : '');
    $('bjDeal').disabled = false; $('bjHit').disabled = true; $('bjStand').disabled = true;
    addBank(delta, S.player.x, S.player.y - 30); sfx(delta > 0 ? 'coin' : 'chat');
  }
  function rlSpin(color) {
    const el = $('panel'); el.querySelectorAll('[data-c]').forEach(b => { b.disabled = true; });
    let n = 0; const iv = setInterval(() => { $('rlN').textContent = Math.floor(Math.random() * 15); }, 70);
    setTimeout(() => {
      clearInterval(iv); if (!panel || panel.game !== 'roulette') return;
      n = Math.floor(Math.random() * 15); const c = n === 0 ? 'green' : n % 2 ? 'red' : 'black';
      $('rlN').textContent = n + ' ' + c;
      const delta = c === color ? CFG.playerBet * (c === 'green' ? 13 : 1) : -CFG.playerBet;
      $('rlR').textContent = (delta > 0 ? 'Winner! +' : 'House wins. ') + money(Math.abs(delta) * (delta > 0 ? 1 : -1));
      addBank(delta, S.player.x, S.player.y - 30); sfx(delta > 0 ? 'coin' : 'chat');
      el.querySelectorAll('[data-c]').forEach(b => { b.disabled = false; });
    }, 2200);
  }
  function raceRun(h, horses) {
    const el = $('panel'); el.querySelectorAll('[data-h]').forEach(b => { b.disabled = true; });
    const pos = [0, 0, 0, 0]; let winner = -1;
    const iv = setInterval(() => {
      if (!panel || panel.game !== 'race') { clearInterval(iv); return; }
      for (let i = 0; i < 4; i++) { pos[i] += rand(0, 4.2); $('h' + i).style.left = Math.min(pos[i], 100) * 0.9 + '%'; if (pos[i] >= 100 && winner < 0) winner = i; }
      if (winner >= 0) {
        clearInterval(iv);
        const delta = winner === h ? CFG.playerBet * 3 : -CFG.playerBet;
        $('raceR').textContent = `${horses[winner]} wins! ` + (delta > 0 ? '+' + money(delta) : money(delta));
        addBank(delta, S.player.x, S.player.y - 30); sfx(delta > 0 ? 'coin' : 'chat');
        el.querySelectorAll('[data-h]').forEach(b => { b.disabled = false; });
      }
    }, 60);
  }

  // ---------- Main loop ----------
  function tick(dt) {
    if (S.mode === 'meeting') { meetingTick(dt); return; }
    if (S.mode !== 'play') return;
    S.t += dt; S.raceT += dt;
    if (S.lightsT > 0) S.lightsT -= dt;
    for (const c of S.chars) {
      if (!c.alive) continue;
      for (const k in c.cd) c.cd[k] = Math.max(0, c.cd[k] - dt);
      c.thirst = Math.max(0, c.thirst - CFG.thirstDrain * dt);
      if (c.poisonT > 0) { c.poisonT -= dt; if (c.poisonT <= 0) { kill(c, 'poison', S.chars[c.poisonBy]); continue; } }
      if (c.isPlayer) playerTick(dt); else botTick(c, dt);
      if (c.drink) { c.drink.x = c.x + Math.cos(c.face + 0.9) * 16; c.drink.y = c.y + Math.sin(c.face + 0.9) * 16; }
    }
    if (!S.player.alive) playerTick(dt);
    S.obsT -= dt; if (S.obsT <= 0) { S.obsT = 0.25; observe(); }
    if (S.pending) { S.pending.t -= dt; if (S.pending.t <= 0) { const { caller, body } = S.pending; if (caller.alive && S.mode === 'play') callMeeting(caller, body, `${caller.name} found ${S.chars[body.id].name}'s body.`); S.pending = null; } }
    for (const f of S.floats) { f.t -= dt; f.y -= 18 * dt; }
    S.floats = S.floats.filter(f => f.t > 0);
  }

  // ---------- Rendering ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = Math.max(1, Math.round(innerWidth * dpr)); view.height = Math.max(1, Math.round(innerHeight * dpr));
    dark.width = view.width; dark.height = view.height;
    cam.z = Math.min(view.width / 1150, view.height / 760);
  }
  function screenToWorld(sx, sy) {
    const dpr = view.width / innerWidth;
    return { x: (sx * dpr - view.width / 2) / cam.z + cam.x, y: (sy * dpr - view.height / 2) / cam.z + cam.y };
  }
  function drawScene() {
    if (view.width !== Math.max(1, Math.round(innerWidth * Math.min(window.devicePixelRatio || 1, 2)))) resize();
    const p = S ? S.player : { x: W / 2, y: H / 2 };
    const vw = view.width / cam.z, vh = view.height / cam.z;
    cam.x = clamp(p.x, vw / 2 - 40, W - vw / 2 + 40); cam.y = clamp(p.y, vh / 2 - 40, H - vh / 2 + 40);
    if (vw > W) cam.x = W / 2; if (vh > H) cam.y = H / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0709'; ctx.fillRect(0, 0, view.width, view.height);
    ctx.setTransform(cam.z, 0, 0, cam.z, view.width / 2 - cam.x * cam.z, view.height / 2 - cam.y * cam.z);
    drawMap();
    if (!S) return;
    for (const d of S.drinks) if (!d.holder) drawDrink(d);
    for (const b of S.bodies) if (!S.player.alive || b.seenByPlayer || canSee(S.player, b)) drawBody(b);
    const order = S.chars.filter(c => c.alive || (c.isPlayer && !c.alive)).sort((a, b) => a.y - b.y);
    for (const c of order) {
      if (!c.alive && !c.isPlayer) continue;
      if (!playerSees(c)) continue;
      drawChar(c);
      if (c.drink) drawDrink(c.drink);
    }
    for (const f of S.floats) if (!S.player.alive || dist(f, S.player) < viewRange()) {
      ctx.font = 'bold 16px Georgia'; ctx.textAlign = 'center'; ctx.fillStyle = f.color; ctx.globalAlpha = Math.min(1, f.t);
      ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1;
    }
    if (S.player.alive) drawDark();
    if (S.sniff) { ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(S.player.x, S.player.y, 24, -Math.PI / 2, -Math.PI / 2 + (1 - S.sniff.t / 1.5) * Math.PI * 2); ctx.stroke(); }
  }
  function drawMap() {
    for (const k in ROOMS) {
      const r = ROOMS[k]; ctx.fillStyle = r.floor; ctx.fillRect(r.x, r.y, r.w, r.h);
      if (k === 'floor') {
        ctx.fillStyle = 'rgba(232,196,106,0.06)';
        for (let x = r.x + 20; x < r.x + r.w; x += 40) for (let y = r.y + 20; y < r.y + r.h; y += 40) { ctx.beginPath(); ctx.arc(x + ((y / 40) % 2) * 20, y, 3, 0, 7); ctx.fill(); }
      }
      if (k === 'rest') { ctx.strokeStyle = 'rgba(255,255,255,0.05)'; for (let x = r.x; x < r.x + r.w; x += 30) { ctx.beginPath(); ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); ctx.stroke(); } for (let y = r.y; y < r.y + r.h; y += 30) { ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke(); } }
      ctx.fillStyle = 'rgba(243,234,216,0.18)'; ctx.font = 'italic 22px Georgia'; ctx.textAlign = 'center';
      ctx.fillText(r.name.replace('the ', '').toUpperCase(), r.x + r.w / 2, r.y + r.h - 24);
    }
    // doorways
    for (const d of DOORS) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect((d.pa.x + d.pb.x) / 2 - 20, (d.pa.y + d.pb.y) / 2 - 20, 40, 40); }
    for (const o of OBSTACLES) {
      if (o.kind === 'counter') { ctx.fillStyle = '#6b4128'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.fillStyle = '#8a5835'; ctx.fillRect(o.x, o.y + o.h - 10, o.w, 10); }
      if (o.kind === 'bj') { ctx.fillStyle = '#5a3420'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y, o.w / 2 + 8, o.h + 8, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#1d5c3a'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y, o.w / 2, o.h, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = 'rgba(232,196,106,0.5)'; ctx.font = '12px Georgia'; ctx.fillText('BLACKJACK PAYS 3 TO 2', o.x + o.w / 2, o.y + 40); }
      if (o.kind === 'roulette') { ctx.fillStyle = '#5a3420'; ctx.fillRect(o.x - 6, o.y - 6, o.w + 12, o.h + 12); ctx.fillStyle = '#1d5c3a'; ctx.fillRect(o.x, o.y, o.w, o.h); const cx = o.x + 50, cy = o.y + 50; for (let i = 0; i < 15; i++) { ctx.fillStyle = i === 0 ? '#3ddc97' : i % 2 ? '#c0302a' : '#111'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 38, i / 15 * 6.283 + S_t(), (i + 1) / 15 * 6.283 + S_t()); ctx.fill(); } ctx.fillStyle = '#8a5835'; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 7); ctx.fill(); for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#c0302a' : '#111'; ctx.fillRect(o.x + 100 + (i % 6) * 18, o.y + 22 + Math.floor(i / 6) * 30, 16, 26); } }
      if (o.kind === 'sinks') { ctx.fillStyle = '#c8d2d6'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.fillStyle = '#7f8f96'; for (let y = o.y + 30; y < o.y + o.h; y += 65) { ctx.beginPath(); ctx.ellipse(o.x + 20, y, 13, 18, 0, 0, 7); ctx.fill(); } }
    }
    // taps and bottles
    ctx.fillStyle = '#e8c46a'; for (let x = 120; x <= 400; x += 70) ctx.fillRect(x, 66, 8, 18);
    ctx.fillStyle = 'rgba(232,196,106,0.7)'; ctx.font = '13px Georgia'; ctx.textAlign = 'center'; ctx.fillText('BAR · E to order', TAP.x, 128);
    // race screen
    ctx.fillStyle = '#0d1430'; ctx.fillRect(1330, 30, 400, 120); ctx.strokeStyle = '#e8c46a'; ctx.strokeRect(1330, 30, 400, 120);
    const rt = S ? S.raceT % 10 : 0;
    ['#e8443a', '#3ddc97', '#4a7dff', '#f4e04d'].forEach((col, i) => { const prog = clamp(rt / 8 * (0.8 + ((i * 37 + Math.floor((S ? S.raceT : 0) / 10) * 13) % 10) / 25), 0, 1); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(1350 + prog * 360, 52 + i * 26, 8, 0, 7); ctx.fill(); });
    // VIP TV and couch
    ctx.fillStyle = '#0d1430'; ctx.fillRect(1440, 625, 180, 14);
    ctx.fillStyle = '#5a2a5e'; ctx.fillRect(1360, 860, 340, 30);
    // bell
    ctx.fillStyle = '#6b4128'; ctx.beginPath(); ctx.arc(BELL.x, BELL.y, 22, 0, 7); ctx.fill();
    ctx.fillStyle = (S && S.player.bellUsed) ? '#6b5a3a' : '#e8c46a'; ctx.beginPath(); ctx.arc(BELL.x, BELL.y, 14, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(232,196,106,0.7)'; ctx.font = '12px Georgia'; ctx.fillText('PIT BELL', BELL.x, BELL.y + 38);
    // seats
    for (const s of SEATS) { ctx.fillStyle = '#2a1b22'; ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(232,196,106,0.18)'; ctx.fillRect(s.drink.x - 14, s.drink.y - 4, 28, 8); }
    // walls
    for (const w of WALLS) { ctx.fillStyle = '#120c10'; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeStyle = 'rgba(232,196,106,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1); }
  }
  function S_t() { return S ? S.t * 0.6 : 0; }
  function drawDrink(d) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(d.x, d.y, 7, 0, 7); ctx.fill();
    ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(d.x, d.y, 5 * Math.max(0.3, d.sips / CFG.drinkSips), 0, 7); ctx.fill();
    if (S.player.isKiller && d.poisoned) { ctx.strokeStyle = '#7dff5a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(d.x, d.y, 10, 0, 7); ctx.stroke(); }
    if (d.owner === S.player.id) { ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(d.x, d.y, 9, 0, 7); ctx.stroke(); }
  }
  function drawChar(c) {
    const ghost = !c.alive;
    ctx.globalAlpha = ghost ? 0.45 : 1;
    let col = c.color;
    if (c.poisonT > 0 && c.poisonT < CFG.poisonDelay - 2) col = mix(c.color, '#7dff5a', 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 12, 15, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(c.x, c.y, CFG.radius, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    // visor shows where they are looking
    const lx = c.x + Math.cos(c.look) * 8, ly = c.y + Math.sin(c.look) * 8;
    ctx.fillStyle = '#bfe6ff'; ctx.beginPath(); ctx.ellipse(lx, ly, 7, 4.5, c.look, 0, 7); ctx.fill();
    // fedora
    ctx.fillStyle = '#1a1116'; ctx.beginPath(); ctx.ellipse(c.x, c.y - 12, 13, 4, 0, 0, 7); ctx.fill(); ctx.fillRect(c.x - 7, c.y - 22, 14, 10);
    ctx.globalAlpha = 1;
    ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'center'; ctx.fillStyle = '#f3ead8';
    ctx.fillText(c.isPlayer ? 'You' : c.name, c.x, c.y - 28);
    if (c.isKiller && S.player.isKiller && !c.isPlayer) { /* only one killer */ }
  }
  function drawBody(b) {
    const c = S.chars[b.id];
    ctx.fillStyle = b.cause === 'poison' ? 'rgba(125,255,90,0.25)' : 'rgba(150,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(b.x + 6, b.y + 6, 26, 14, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.ellipse(b.x, b.y, 18, 11, 0.3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath();
    for (const ox of [-5, 5]) { ctx.moveTo(b.x + ox - 3, b.y - 3); ctx.lineTo(b.x + ox + 3, b.y + 3); ctx.moveTo(b.x + ox + 3, b.y - 3); ctx.lineTo(b.x + ox - 3, b.y + 3); }
    ctx.stroke();
  }
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = s => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
    const A = ch(pa), B = ch(pb);
    return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')';
  }
  function drawDark() {
    const p = S.player, r = viewRange();
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, dark.width, dark.height);
    dctx.fillStyle = S.lightsT > 0 ? 'rgba(2,1,4,0.96)' : 'rgba(6,3,8,0.78)';
    dctx.fillRect(0, 0, dark.width, dark.height);
    dctx.setTransform(cam.z, 0, 0, cam.z, dark.width / 2 - cam.x * cam.z, dark.height / 2 - cam.y * cam.z);
    dctx.globalCompositeOperation = 'destination-out';
    const g = dctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.8, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g; dctx.beginPath(); dctx.moveTo(p.x, p.y); dctx.arc(p.x, p.y, r, p.look - CFG.coneHalf, p.look + CFG.coneHalf); dctx.closePath(); dctx.fill();
    dctx.beginPath(); dctx.arc(p.x, p.y, CFG.nearSense + 18, 0, 7); dctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, 0, 0);
  }

  // ---------- HUD ----------
  function hud() {
    if (!S) return;
    const p = S.player;
    $('bankText').textContent = money(S.bank) + ' / ' + money(CFG.targetBank);
    $('bankFill').style.transform = `scaleX(${clamp(S.bank / CFG.targetBank, 0, 1)})`;
    $('thirstFill').style.transform = `scaleX(${p.thirst / 100})`;
    $('thirstFill').style.background = p.thirst < 25 ? '#e8443a' : '#6ac0e8';
    const d = p.drink || S.drinks.find(x => x.owner === p.id);
    $('drinkInfo').textContent = !p.alive ? 'You are a ghost. Drift around and watch.' : d ? `Your ${d.kind}: ${d.sips} sips left${d.holder ? ' (in hand)' : ' (set down)'} · F sip · R sniff · X pour out` : p.thirst <= 0 ? 'Parched! Get a drink at the bar.' : 'No drink. The bar is west of the casino floor.';
    const c = S.mode === 'play' ? playerContext() : null;
    $('hint').textContent = c ? c.label : '';
    if (p.isKiller) {
      const set = (id, cd, label) => { const b = $(id); b.textContent = label + (cd > 0 ? ` (${Math.ceil(cd)}s)` : ''); b.disabled = cd > 0 || !p.alive; };
      set('kPoison', p.cd.poison, '1 · Poison drink'); set('kShiv', p.cd.shiv, '2 · Shiv'); set('kLights', p.cd.lights, '3 · Lights out');
    }
  }
  function toast(text, bad) {
    const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = text;
    $('toasts').appendChild(t); setTimeout(() => t.remove(), 4000);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }

  // ---------- Sound ----------
  let actx = null;
  function sfx(kind) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = { start: [[392, 0.1], [523, 0.15]], pour: [[700, 0.05], [600, 0.05]], sip: [[300, 0.06]], poison: [[180, 0.2]], die: [[220, 0.15], [150, 0.3]],
        stab: [[900, 0.04], [120, 0.2]], lights: [[120, 0.4]], meeting: [[660, 0.12], [660, 0.12], [880, 0.2]], chat: [[520, 0.03]], coin: [[988, 0.05], [1319, 0.1]],
        win: [[523, 0.12], [659, 0.12], [784, 0.25]], lose: [[392, 0.15], [311, 0.15], [262, 0.3]] }[kind] || [];
      let t = actx.currentTime;
      for (const [f, d] of notes) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === 'die' || kind === 'lights' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d); t += d;
      }
    } catch (e) { /* audio is optional */ }
  }

  // ---------- Input & boot ----------
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); if (k === ' ') e.preventDefault();
    if (!keys[k]) onKey(k);
    keys[k] = true;
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  addEventListener('resize', resize);
  document.querySelectorAll('[data-role]').forEach(b => { b.onclick = () => newGame(b.dataset.role); });
  $('again').onclick = () => { $('over').classList.add('hidden'); $('title').classList.remove('hidden'); $('hud').classList.add('hidden'); S = null; SEATS.forEach(s => { s.occ = null; s.claim = null; }); };
  document.querySelectorAll('#killerBar button').forEach(b => { b.onclick = () => onKey(b.dataset.k); });

  resize();
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(0.25, (now - last) / 1000); last = now;
    while (acc >= 1 / 60) { if (S) tick(1 / 60); acc -= 1 / 60; }
    drawScene(); hud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Test hook: inspect state and fast-forward the sim from automation.
  window.__lastCall = {
    get state() { return S; }, CFG, SEATS,
    start: role => newGame(role),
    step(seconds) { for (let i = 0; i < seconds * 60 && S; i++) tick(1 / 60); },
    vote(id) { if (S && S.meeting) S.meeting.playerVote = id; },
    render() { drawScene(); hud(); },
  };
})();
