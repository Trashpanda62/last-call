// Headless check that table rounds reach the crew bank: node tools/settle-check.mjs [trials]
// Drives the real table code (src/tables.js) against the real sim, the way main.js wires them, in three cases:
//   meeting  - a roulette spin or a slot pull is in the air when a meeting starts; the table closes and the round must settle;
//              a crash cash-out as a meeting starts that breaks the bank must not crash the sim or end the game before the vote
//   standup  - a round left open (blackjack, coin pot, dice point, mines, tower) when you stand up is played out and settled
//   death    - a round decided before you die still settles
//   autoslots- leaving during auto spin never starts a round that can't pay; a four-max-bet blackjack loss settles in full
//   over     - once the verdict is in, no settlement (direct, flushed from a closing table, or later in a crash loop)
//              may move the bank
// Exits 1 if any trial fails. The DOM is stubbed; nothing here opens a browser.
globalThis.document ??= { querySelector: () => null, getElementById: () => null };
// The tables' clock (performance.now) runs on our time, so rounds in the air land when we say.
let clock = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock * 1000 }, configurable: true });
const { createGame } = await import('../src/sim.js');
const { CFG } = await import('../src/config.js');
const T = await import('../src/tables.js');
const Gm = await import('../src/games.js');

const trials = +(process.argv[2] || 25);

// A game with the one human seated at a free seat of `game`, sat down through the sim's own 'use' action.
function seated(game) {
  const g = createGame({ humans: [{ name: 'Me', key: 'me' }], players: 6, killers: 1, difficulty: 'normal', forceRole: 'gambler' });
  const c = g.G.chars.find(o => o.isHuman), seat = g.G.seats.find(s => s.game === game && !s.occ);
  c.x = seat.x; c.y = seat.y; c.lucky = 0;
  g.action(c.id, 'use');
  if (c.seat !== seat) throw new Error('could not sit at ' + game);
  const calls = [];
  const act = (k, arg) => { if (k === 'bank') calls.push({ ...arg, mode: g.G.mode, over: !!g.G.over }); g.action(c.id, k, arg); };
  T.openTable(seat, act, g.view(c.id));
  return { g, c, seat, calls };
}
// What the sim adds for an accepted settlement { d, b } (no lucky pretzels).
const expectNet = a => Math.round(a.d + a.b * CFG.comp);
// Start a meeting from where the human sits: a body at their feet, reported with 'use'.
function meeting(g, c) {
  const other = g.G.chars.find(o => !o.isHuman && o.alive);
  g.G.bodies.push({ x: c.x, y: c.y, id: other.id, cause: 'blade', by: null, reported: false, t: g.G.t, seenBy: new Set() });
  g.action(c.id, 'use');
  if (g.G.mode !== 'meeting') throw new Error('meeting did not start');
}

const out = {};
function run(name, fn) {
  const r = { pass: 0, fail: 0, errors: 0, examples: [] };
  for (let i = 0; i < trials; i++) {
    try { const why = fn(); if (why) { r.fail++; if (r.examples.length < 3) r.examples.push(why); } else r.pass++; }
    catch (e) { r.errors++; if (r.examples.length < 3) r.examples.push('error: ' + e.message); }
    T.closeTable();
  }
  out[name] = r;
}

// 1. Rounds decided when a meeting starts.
for (const [game, start] of [['roulette', () => { T.press('spot:red'); T.press('btn:spin'); }], ['slots', () => T.press('btn:lever')]]) {
  run('meeting:' + game, () => {
    const { g, c, calls } = seated(game);
    start();
    if (calls.length) return 'settled before the meeting';
    const bank0 = g.G.bank;
    meeting(g, c);
    T.closeTable(); // main.js closes the table when the mode leaves 'play'
    if (calls.length !== 1) return `expected 1 settlement, got ${calls.length}`;
    const want = bank0 + expectNet(calls[0]);
    return g.G.bank === want ? null : `bank ${g.G.bank}, want ${want} (d ${calls[0].d}, b ${calls[0].b}, in ${calls[0].mode})`;
  });
}

// 2. An unfinished blackjack hand when you stand up.
run('standup:bj', () => {
  const { g, c, calls } = seated('bj');
  let live = false;
  for (let i = 0; i < 20 && !live; i++) { T.press('btn:deal'); live = !!T.tableView().view?.hide; }
  if (!live) return 'no live hand in 20 deals';
  const n0 = calls.length, bank0 = g.G.bank;
  g.action(c.id, 'use'); // stand up
  if (c.seat) return 'did not stand up';
  T.closeTable();        // main.js closes the table when the seat goes
  if (calls.length !== n0 + 1) return `expected the hand to settle on leaving, got ${calls.length - n0} settlements`;
  const a = calls[n0], want = bank0 + expectNet(a);
  if (!(a.b > 0)) return 'settled with no stake';
  return g.G.bank === want ? null : `bank ${g.G.bank}, want ${want} (d ${a.d}, b ${a.b})`;
});

// 2b. The other games that keep a round open between presses: walk away mid-round and it must still settle.
// live(): press until the round is open and undecided (status text says so); a round that ends on the way restarts.
const wait = (g, c, s) => { clock += s; T.tableTick(g.view(c.id)); };
const OPEN = {
  coin: { live: /^POT /, step: (g, c) => { T.press('spot:heads'); T.press('btn:flip'); wait(g, c, 3); } },
  dice: { live: /THE POINT IS/, step: (g, c) => { T.press('spot:pass'); T.press('btn:roll'); wait(g, c, 2); } },
  mines: { live: /NEXT GEM .* OR CASH OUT/, step: () => { if (!/NEXT GEM/.test(T.tableBar().status || '')) T.press('btn:start'); T.press('scr', { x: 0.8, y: 0.15 }); } },
  tower: { live: /OR CASH OUT/, step: () => { if (!/FLOOR/.test(T.tableBar().status || '')) T.press('btn:start'); T.press('scr', { x: 0.1, y: 0.5 }); } },
};
for (const game in OPEN) {
  run('standup:' + game, () => {
    const { g, c, calls } = seated(game), o = OPEN[game];
    let live = false;
    for (let i = 0; i < 60 && !live; i++) { o.step(g, c); live = o.live.test(T.tableBar().status || ''); }
    if (!live) return 'no open round in 60 tries';
    const n0 = calls.length, bank0 = g.G.bank;
    g.action(c.id, 'use');
    if (c.seat) return 'did not stand up';
    T.closeTable();
    if (calls.length !== n0 + 1) return `expected the round to settle on leaving, got ${calls.length - n0} settlements`;
    const a = calls[n0], want = bank0 + expectNet(a);
    if (!(a.b > 0)) return 'settled with no stake';
    return g.G.bank === want ? null : `bank ${g.G.bank}, want ${want} (d ${a.d}, b ${a.b})`;
  });
}

// 2c. A round decided before you die still counts: a roulette spin in the air when the poison lands.
run('death:roulette', () => {
  const { g, c, calls } = seated('roulette');
  T.press('spot:red'); T.press('btn:spin');
  c.poisonT = 0.001; c.poisonBy = g.G.killerIds[0];
  g.tick(1 / 60);
  if (c.alive || c.seat) return 'the poison did not kill';
  if (g.G.over) return 'the game ended on one death';
  const bank0 = g.G.bank, n0 = calls.length;
  T.closeTable(); // main.js closes the table when the seat goes
  if (calls.length !== n0 + 1) return `expected 1 settlement after death, got ${calls.length - n0}`;
  const want = bank0 + expectNet(calls[n0]);
  return g.G.bank === want ? null : `bank ${g.G.bank}, want ${want} (d ${calls[n0].d}, b ${calls[n0].b})`;
});

// 2d. Auto spin at the slots: leaving between one spin's payout and the next spin must not start a round it can't pay.
// Every lever pull the table makes has to reach the bank.
let pulls = 0;
T.setHandHook(k => { if (k === 'pull') pulls++; });
for (const gap of [0.5, 1.8, 2.2]) {
  run('autoslots:' + gap, () => {
    const { g, c, calls } = seated('slots');
    pulls = 0;
    T.press('btn:auto');
    wait(g, c, gap); // 0.5: reels turning; 1.8 and 2.2: paid, the next auto spin queued
    g.action(c.id, 'use'); T.closeTable();
    return calls.length === pulls ? null : `${pulls} spins started, ${calls.length} settled`;
  });
}

// 2e. A blackjack hand split and both halves doubled at the max bet stakes four max bets: all of it settles.
run('bj:fourunits', () => {
  const { g, c, calls } = seated('bj');
  const bank0 = g.G.bank, mb = Gm.maxBet(bank0);
  g.action(c.id, 'bank', { d: -4 * mb, b: 4 * mb }); // what the table sends for that hand lost (tables.js bj.finish)
  const want = bank0 - 4 * mb + Math.round(4 * mb * CFG.comp);
  return g.G.bank === want ? null : `bank ${g.G.bank}, want ${want} (4 max bets of ${mb} lost)`;
});

// 2g. A four-max-bet blackjack hand right after another settlement: the meter delays the overflow, never cuts it.
// (Wins, so the bank stays off its zero floor.)
run('bj:afterburst', () => {
  const { g, c } = seated('bj');
  const bank0 = g.G.bank, mb = Gm.maxBet(bank0), net = (d, b) => Math.round(d + b * CFG.comp);
  g.action(c.id, 'bank', { d: mb, b: mb });
  g.action(c.id, 'bank', { d: 4 * mb, b: 4 * mb });
  if (!c.owed || !c.owed.length) return `burst: nothing held back (bank ${g.G.bank})`; // five max bets at once: some waits
  g.G.rt = (g.G.rt || 0) + 5;
  g.action(c.id, 'bank', { d: 0, b: 0 });       // any later settlement (or the tick) pays what is owed first
  const want = bank0 + net(5 * mb, 5 * mb);      // all of both hands (partial payments round to whole dollars)
  if (Math.abs(g.G.bank - want) > 2) return `after: bank ${g.G.bank}, want ${want} (the overflow was cut)`;
  g.action(c.id, 'bank', { d: -4 * mb, b: 4 * mb });
  g.action(c.id, 'bank', { d: 4 * mb, b: 4 * mb });
  for (let i = 0; i < 300; i++) g.tick(1 / 60);  // and the tick pays the rest within a few seconds
  return c.owed.length ? `${c.owed.length} settlements still owed after 5 s of ticks` : null;
});

// 2h. The table max fell after the stake went down (the bank dropped): the stake still settles in full.
run('bj:shrunkmax', () => {
  const { g, c } = seated('bj');
  g.G.bank = 2.3e6; g.tick(1 / 60);              // a high max seen while seated
  const peak = Gm.maxBet(2.3e6);
  g.G.bank = 500000;                             // then the bank falls and the max with it
  g.action(c.id, 'bank', { d: peak, b: peak });  // a one-unit hand bet at the old max, won
  const want = 500000 + Math.round(peak + peak * CFG.comp);
  return g.G.bank === want ? null : `bank ${g.G.bank}, want ${want} (stake ${peak} cut to the new max ${Gm.maxBet(500000)})`;
});

// 2i. START at mines or CLIMB at the tower, then leave before the first pick: played out (one pick, then cash out).
for (const game of ['mines', 'tower']) {
  run('standup:' + game + '-unpicked', () => {
    const { g, c, calls } = seated(game);
    T.press('btn:start');
    if (!/PICK|NEXT GEM|FLOOR/.test(T.tableBar().status || '')) return 'the round did not start';
    const bank0 = g.G.bank;
    g.action(c.id, 'use'); T.closeTable();
    if (calls.length !== 1) return `expected 1 settlement, got ${calls.length}`;
    const want = bank0 + expectNet(calls[0]);
    return calls[0].b > 0 && g.G.bank === want ? null : `bank ${g.G.bank}, want ${want} (d ${calls[0].d}, b ${calls[0].b})`;
  });
}

// 2j. Money that waits is paid whole: no drift from paying it in slices, however often the meter ticks.
const nudge = (g, c, s) => { g.G.rt = (g.G.rt || 0) + s; g.action(c.id, 'bank', { d: 0, b: 0 }); };
run('owed:whole', () => {
  const { g, c } = seated('bj');
  const mb = Gm.maxBet(g.G.bank);
  g.action(c.id, 'bank', { d: 4 * mb, b: 4 * mb });   // the meter is spent
  const bank1 = g.G.bank, mb1 = Gm.maxBet(bank1);
  g.action(c.id, 'bank', { d: 1.5 * mb1 / 3, b: mb1 / 3 }); // an odd amount that has to wait
  for (let i = 0; i < 350 && c.owed.length; i++) nudge(g, c, 1 / 70); // slices that are not whole dollars
  if (c.owed.length) return 'still owed after 5 s';
  const want = bank1 + Math.round(1.5 * mb1 / 3 + mb1 / 3 * CFG.comp);
  return g.G.bank === want ? null : `bank ${g.G.bank}, want ${want} (paid in slices)`;
});

// 2k. Lucky pretzels count as they were when the round ended, not when the waiting money is paid.
for (const [then, later] of [[10, 0], [0, 10]]) {
  run(`owed:lucky${then ? 'Then' : 'Later'}`, () => {
    const { g, c } = seated('bj');
    const mb = Gm.maxBet(g.G.bank);
    g.action(c.id, 'bank', { d: 4 * mb, b: 4 * mb });
    const bank1 = g.G.bank, b = Gm.maxBet(bank1);
    c.lucky = then; g.action(c.id, 'bank', { d: b, b }); c.lucky = later;
    if (!c.owed.length) return 'the win did not wait';
    nudge(g, c, 5);
    const want = bank1 + Math.round(b * (then ? 1 + CFG.luckyBonus : 1) + b * CFG.comp);
    return g.G.bank === want ? null : `bank ${g.G.bank}, want ${want} (lucky ${then} when won, ${later} when paid)`;
  });
}

// 2f. A crash cash-out as a meeting starts that breaks the bank: no crash, and the verdict waits for the vote.
run('meeting:crashwin', () => {
  const { g, c } = seated('roulette');
  const bot = g.G.chars.find(o => !o.isHuman && o.alive); bot.lucky = 0;
  g.G.bank = g.G.target - 100;
  g.G.crash.phase = 'fly'; g.G.crash.mult = 2; g.G.crash.bets.set(bot.id, { bet: 1e7, auto: 0, out: 0 });
  meeting(g, c);
  if (!(g.G.bank >= g.G.target)) return 'the cash-out did not reach the bank';
  return g.G.over ? 'the verdict landed before the vote' : null;
});

// 3. After the verdict nothing moves the bank.
// 3b. The death that ends the game, then a bot at the security desk later in the same tick: no purchase.
run('over:security', () => {
  const g = createGame({ humans: [{ name: 'Me', key: 'me' }], players: 3, killers: 1, difficulty: 'normal', forceRole: 'gambler' });
  const me = g.G.chars.find(o => o.isHuman), i = g.G.chars.indexOf(me);
  const bot = g.G.chars.slice(i + 1).find(o => !o.isHuman && !o.isKiller);
  if (!bot) return 'skip: no gambler bot after the human';
  // leave you, that bot and the killer: your death leaves one of each, and the killers win
  for (const o of g.G.chars) if (o !== me && o !== bot && !o.isKiller) o.alive = false;
  const desk = g.G.seats.find(s => s.game === 'cams' && !s.occ);
  desk.occ = bot; bot.seat = desk; bot.state = 'seated'; bot.sitT = 99; bot.gameT = 99; bot.secT = -1; bot.thirst = 100; bot.x = desk.x; bot.y = desk.y;
  g.G.deaths = 1; me.poisonT = 0.001; me.poisonBy = g.G.killerIds[0];
  const bank0 = g.G.bank, rnd = Math.random;
  Math.random = () => 0.1;                       // the bot always decides to buy cameras
  try { g.tick(1 / 60); } finally { Math.random = rnd; }
  if (!g.G.over) return 'the death did not end the game';
  return g.G.bank === bank0 && !g.G.security.cams ? null : `bought after the verdict: bank ${bank0} -> ${g.G.bank}, cams ${g.G.security.cams}`;
});
// 3a. Two crash cash-outs in one tick: the first breaks the bank, the second must not count.
run('over:crashloop', () => {
  const { g } = seated('roulette');
  const [a, b] = g.G.chars.filter(o => !o.isHuman && o.alive); a.lucky = b.lucky = 0;
  g.G.bank = g.G.target - 100;
  g.G.crash = { ...g.G.crash, phase: 'fly', t: 30, point: 1e6, bets: new Map([[a.id, { bet: 1e7, auto: 1.01, out: 0 }], [b.id, { bet: 1e8, auto: 1.01, out: 0 }]]) };
  g.tick(1 / 60);
  if (!g.G.over) return 'the first cash-out did not end the game';
  return g.G.bank < g.G.target + 5e6 ? null : `the second cash-out counted after the verdict (bank ${g.G.bank}, target ${g.G.target})`;
});
run('over:bank', () => {
  const { g, c, calls } = seated('roulette');
  g.G.bank = g.G.target - 100;
  g.action(c.id, 'bank', { d: 1000, b: 1000 }); // breaks the bank: the crew wins
  if (!g.G.over) return 'the winning settlement did not end the game';
  const bank0 = g.G.bank, verdict = g.G.over;
  T.press('spot:red'); T.press('btn:spin');
  T.closeTable();                                // the table closes on the verdict, flushing the spin
  g.action(c.id, 'bank', { d: 50000, b: 50000 });
  g.action(c.id, 'bank', { d: -50000, b: 50000 });
  for (let i = 0; i < 600; i++) g.tick(1 / 60);
  if (g.G.over !== verdict) return 'the verdict changed';
  return g.G.bank === bank0 ? null : `bank moved after the verdict: ${bank0} -> ${g.G.bank} (${calls.length} settlements sent)`;
});

const fail = Object.values(out).some(r => r.fail || r.errors);
console.log(JSON.stringify({ trials, result: fail ? 'FAIL' : 'PASS', ...out }));
process.exit(fail ? 1 : 0);
