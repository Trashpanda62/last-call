import assert from 'node:assert/strict';
import * as G from '../src/games.js';
import { createLuck } from '../src/luck.js';

for (const r of [() => 0, () => 0.999, Math.random]) {
  const luck = createLuck(r);
  let cold = 0, hot = 0, maxCold = 0;
  for (let i = 0; i < 500; i++) {
    const protectedRound = luck.next();
    if (protectedRound) { hot++; cold = 0; } else cold++;
    maxCold = Math.max(maxCold, cold);
    luck.settle(100, protectedRound ? 200 : 0);
  }
  assert.ok(hot > 200 && maxCold <= 3, 'losses must trigger recurring streaks');
}
for (let trial = 0; trial < 100; trial++) {
  for (const tier of Object.keys(G.SLOT_TIERS)) assert.ok(G.slotSpin(tier, undefined, true).mult > 1);
  for (const risk of Object.keys(G.PLINKO)) {
    const p = G.plinkoDrop(risk, undefined, true);
    assert.equal(p.path.reduce((a, b) => a + b, 0), p.bucket);
    assert.equal(G.PLINKO[risk][p.bucket], p.mult);
    assert.ok(p.mult > 1);
  }
  for (let m = 1; m <= 24; m++) {
    const s = G.minesNew(m, undefined, true);
    const order = Array.from({ length: 25 }, (_, i) => i).sort(() => Math.random() - 0.5);
    for (const i of order) { if (s.over) break; G.minesPick(s, i); assert.ok(!s.dead); }
    assert.ok(s.over && s.mult > 1);
    assert.equal(s.mines.size, m);
    assert.ok(s.open.every(i => !s.mines.has(i)));
  }
  for (const mode of Object.keys(G.TOWER.modes)) {
    const s = G.towerNew(mode, undefined, true);
    while (!s.over) G.towerPick(s, Math.floor(Math.random() * s.eggs));
    assert.ok(!s.dead && s.mult > 1);
    s.rows.forEach((row, i) => { assert.equal(row.size, G.TOWER.modes[mode].dragons); assert.ok(!row.has(s.picks[i])); });
  }
  for (const call of ['heads', 'tails']) assert.equal(G.coinFlip(call, undefined, true).side, call);
  assert.ok(G.wheelSpin(undefined, true).mult > 1);
  // every lucky blackjack start wins whether you hit, stand, double or follow the book
  for (let v = 0; v < 4; v++) for (const play of ['stand', 'hit', 'double', 'book']) {
    let n = 0; const r = () => n++ === 0 ? (v + .5) / 4 : .3, bj = G.bjDeal(100, r, true);
    for (let i = 0; i < 6 && !bj.over; i++) { const can = G.bjCan(bj), a = play === 'book' ? G.bjAdvice(bj) : play; G.bjAct(bj, can[a] ? a : 'stand'); }
    assert.ok(bj.over && bj.mult > bj.staked, `lucky blackjack ${v} ${play}: ${bj.lines}`);
  }
  for (const point of [0, 4, 5, 6, 8, 9, 10]) {
    const s = G.passNew(); s.point = point; G.passRoll(s, undefined, true);
    assert.ok(s.over && s.mult > 1);
  }
}
globalThis.document ??= { querySelector: () => null, getElementById: () => null };
let clock = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock * 1000 }, configurable: true });
const T = await import('../src/tables.js');
for (const spots of [['n17'], ['red'], ['red', 'black'], ['d1', 'd2', 'd3'], Array.from({ length: 37 }, (_, n) => 'n' + n)]) {
  T.resetTableLuck();
  const settled = [];
  const v = { priv: { me: 0 }, pub: { bank: 500000, maxBet: 125000 } };
  T.openTable({ game: 'roulette', id: 0 }, (kind, a) => { if (kind === 'bank') settled.push(a); }, v);
  for (const spot of spots) T.press('spot:' + spot);
  let cold = 0;
  for (let round = 0; round < 60; round++) {
    T.press('btn:spin'); clock += 2; T.tableTick(v); clock += 2.01; T.tableTick(v);
    assert.equal(settled.length, round + 1);
    const a = settled.at(-1), spin = T.tableView().view.spin;
    assert.equal(a.d + a.b, spots.reduce((back, key) => back + 1000 * G.rlMult(key[0] === 'n' ? +key.slice(1) : key, spin.n, spin.lucky), 0));
    cold = a.d > 0 ? 0 : cold + 1;
    assert.ok(cold <= 3, 'roulette must break losing runs even for hedged layouts');
  }
  T.closeTable();
}

const { createGame } = await import('../src/sim.js');
for (const game of ['race', 'crash']) {
  const sim = createGame({ humans: [{ name: 'Me', key: 'me' }], players: 6, killers: 1, forceRole: 'gambler' });
  const c = sim.G.chars.find(c => c.isHuman);
  const seat = sim.G.seats.find(s => s.game === game && !s.occ);
  sim.setInput(c.id, { x: seat.x, y: seat.y, look: seat.face, posVer: c.posVer });
  assert.equal(c.seat, seat);
  let cold = 0, protectedRounds = 0;
  for (let round = 0; round < 14; round++) {
    const R = sim.G[game]; R.bets.clear(); R.phase = 'bet'; R.t = (game === 'race' ? G.RACE.betTime : G.CRASH.betTime) - 0.01;
    if (game === 'race') R.winner = 1; else R.point = 1;
    sim.action(c.id, game, { bet: 10, duck: 0, auto: 0 });
    const bank = sim.G.bank;
    sim.tick(0.02);
    const b = R.bets.get(c.id); assert.ok(b);
    if (game === 'race') {
      protectedRounds += b.hot ? 1 : 0; R.t = G.RACE.runTime - 0.01; sim.tick(0.02);
      const v = sim.view(c.id), reported = v.pub.race.bets.find(b => b[0] === c.id);
      assert.equal(reported[3], b.back, 'the client must receive the actual race payout');
      T.openTable(seat, () => {}, v);
      const display = T.tableBar();
      assert.equal(display.res.cls, b.back > b.bet ? 'win' : 'lose');
      if (b.hot && R.winner !== b.duck) { assert.match(display.res.text, /Hot-streak bonus!/); assert.match(display.status, /HOT-STREAK BONUS/); }
      T.closeTable();
    }
    else { protectedRounds += b.auto ? 1 : 0; R.t = G.crashTime(R.point) + 0.01; sim.tick(0.02); }
    cold = sim.G.bank > bank ? 0 : cold + 1;
    assert.ok(cold <= 3, game + ' must interrupt losses');
  }
  assert.ok(protectedRounds >= 3);
}
console.log('PASS: recurring streaks, loss protection, legal winning layouts, interactive picks, roulette settlements, and shared Crash/race protection.');
