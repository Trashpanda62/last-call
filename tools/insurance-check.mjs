// Real table clients, host queue, shared games and policy abuse/lifecycle checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.document ??= { querySelector: () => null, getElementById: () => null };
let clock = 0; Object.defineProperty(globalThis, 'performance', { value: { now: () => clock * 1000 }, configurable: true });
const { createGame } = await import('../src/sim.js');
const { CFG } = await import('../src/config.js');
const { SHADY } = await import('../src/map.js');
const { packPub, packFor, unpackSnap, wireCache } = await import('../src/wire.js');
const T = await import('../src/tables.js');
const Gm = await import('../src/games.js');
const report = { at: new Date().toISOString(), cases: [], tables: [] };
function fixture(game, owned = true, armed = true) {
  T.closeAllTables(); T.resetTableLuck();
  const g = createGame({ humans: [{ name: 'Policy holder', key: 'p' }], players: 6, killers: 1, forceRole: 'gambler' });
  g.G.target = 1e12; for (const c of g.G.chars) c.isHuman = true;
  const c = g.G.chars[0], s = g.G.seats.find(s => s.game === game && !s.occ), calls = [];
  c.lucky = 0; g.setInput(0, { x: s.x, y: s.y, look: s.face, posVer: c.posVer }); assert.equal(c.seat, s);
  if (owned) c.items.add('insurance'); if (armed) g.action(0, 'insurance');
  const act = (k, arg) => { calls.push({ k, arg }); g.action(0, k, arg); };
  T.openTable(s, act, g.view(0));
  return { g, c, s, calls, act, bank: g.G.bank };
}
function advance(f, seconds) {
  for (let t = 0; t < seconds - 1e-8; t += 1 / 60) { clock += 1 / 60; f.g.tick(1 / 60); T.tableTick(f.g.view(0)); }
}
function expect(f, tag) {
  const pay = f.calls.filter(c => c.k === 'bank').map(c => c.arg);
  assert.ok(pay.length, tag + ' reported a result');
  const delta = pay.reduce((v, p) => v + p.d, 0), refund = Math.max(0, -delta);
  const ordinary = pay.reduce((v, p) => v + Math.round(p.d + p.b * CFG.comp), 0);
  assert.equal(f.g.G.bank, f.bank + ordinary + refund, tag);
  assert.equal(f.c.items.has('insurance'), !refund, tag + ' consume once only on net round loss');
  assert.equal(f.g.view(0).priv.insurance?.state || null, refund ? null : 'armed');
  const before = f.g.G.bank; for (const p of pay) { f.g.action(0, 'bank', p); f.g.action(0, 'bank', { d: p.d, b: p.b }); } assert.equal(f.g.G.bank, before, tag + ' payout replay, including stripped receipts');
  report.tables.push({ game: tag, parts: pay.length, delta, refund, bankDelta: ordinary + refund });
}
// Each test commits through the production table before it computes its outcome.
for (let trial = 0; trial < 12; trial++) for (const game of ['bj', 'roulette', 'slots', 'plinko', 'mines', 'tower', 'coin', 'wheel', 'dice']) {
  const f = fixture(game);
  if (['bj','slots','plinko','mines','tower','wheel'].includes(game)) T.press('spot:main');
  if (game === 'bj') { T.press('btn:deal'); T.closeTable(); }
  if (game === 'roulette') { T.press('spot:red'); T.press('spot:black'); T.press('btn:spin'); T.closeTable(); advance(f, 6); } // (a spin walked away from lands in the background)
  if (game === 'slots') { T.press('btn:lever'); T.closeTable(); advance(f, 6); }
  if (game === 'plinko') { for (let i = 0; i < 3; i++) T.press('btn:drop'); T.closeTable(); advance(f, 6); }
  if (game === 'mines' || game === 'tower') { T.press('btn:start'); T.closeTable(); }
  if (game === 'coin') { T.press('spot:heads'); T.press('btn:flip'); T.closeTable(); }
  if (game === 'wheel') { T.press('btn:spin'); T.closeTable(); advance(f, 7); }
  if (game === 'dice') { T.press('spot:pass'); T.press('spot:field'); T.press('btn:roll'); T.closeTable(); }
  expect(f, game + ':' + trial);
}
function check(name, fn) { fn(); report.cases.push(name); }
let serial = 100000;
function begin(f, b = 1000, group = null) { const id = ++serial; f.g.action(0, 'tableBet', { id, group: group ?? id, b }); return id; }
const result = (f, id, b, d, last = true) => f.g.action(0, 'bank', { tickets: [id], b, d, last });
check('real shop price / personal winnings / duplicate ownership', () => {
  const f = fixture('bj', false, false); f.g.G.target = 3000000; f.c.won = 200000;
  f.g.setInput(0, { ...SHADY.stand, look: 0, posVer: f.c.posVer }); assert.ok(f.g.view(0).priv.shop);
  f.g.action(0, 'shop', 'insurance'); assert.ok(f.c.items.has('insurance')); assert.equal(f.c.won, 80000); assert.equal(f.g.G.bank, f.bank - 120000);
  f.g.action(0, 'shop', 'insurance'); assert.equal(f.g.G.bank, f.bank - 120000);
});
check('late activation rejected, win/tie retain policy, exact loss refund once', () => {
  const f = fixture('bj', true, false); const id = begin(f); f.g.action(0, 'insurance'); assert.equal(f.g.view(0).priv.insurance.state, 'owned');
  result(f, id, 1000, -1000); assert.equal(f.g.G.bank, f.bank - 900); assert.ok(f.c.items.has('insurance'));
  f.g.action(0, 'insurance'); for (const d of [0, 1000]) { const id = begin(f); result(f, id, 1000, d); assert.equal(f.g.view(0).priv.insurance.state, 'armed'); }
  const last = begin(f); result(f, last, 1000, -1000); assert.equal(f.g.G.bank, f.bank + 400); assert.equal(f.c.items.has('insurance'), false);
  const before = f.g.G.bank; result(f, last, 1000, -1000); assert.equal(f.g.G.bank, before);
});
check('split/double four units aggregate and only net stake is returned', () => {
  const f = fixture('bj'); const id = begin(f); f.g.action(0, 'tableStake', { id, b: 4000 }); result(f, id, 4000, -2000);
  assert.equal(f.g.G.bank, f.bank + 400); assert.equal(f.c.items.has('insurance'), false);
});
check('unknown/duplicate/mismatched/oversized receipts rejected', () => {
  const f = fixture('bj'), id = begin(f); result(f, id + 1, 1000, -1000); result(f, id, 900, -900);
  f.g.action(0, 'bank', { tickets: [id, id], b: 2000, d: -2000, last: true });
  f.g.action(0, 'tableStake', { id, b: 5000 }); result(f, id, 5000, -5000); assert.equal(f.g.G.bank, f.bank);
  result(f, id, 1000, -1000); assert.equal(f.g.G.bank, f.bank + 100);
});
check('uninsured queued loss cannot acquire later activation', () => {
  const f = fixture('bj', true, false); f.c.bankAllow = 0; f.c.bankT = 0;
  const old = begin(f); result(f, old, 1000, -1000); assert.equal(f.g.G.bank, f.bank);
  f.g.action(0, 'insurance'); const id = begin(f); result(f, id, 1000, -1000);
  assert.equal(f.g.view(0).priv.insurance.state, 'round'); f.c.lucky = 999;
  f.g.G.rt = 10; f.g.action(0, 'bank', null); assert.equal(f.g.G.bank, f.bank - 800); assert.equal(f.c.items.has('insurance'), false);
});
check('mixed Plinko partial results await the final outstanding ball', () => {
  const f = fixture('plinko'), one = begin(f), two = begin(f, 1000, one);
  result(f, one, 1000, -1000, true); assert.equal(f.g.view(0).priv.insurance.state, 'round'); assert.equal(f.g.G.bank, f.bank - 900);
  result(f, two, 1000, 1000, true); assert.equal(f.g.G.bank, f.bank + 200); assert.equal(f.g.view(0).priv.insurance.state, 'armed');
});
check('death and leaving finish an already covered accepted round', () => {
  const f = fixture('bj'), id = begin(f); f.g.action(0, 'leave'); f.c.alive = false; result(f, id, 1000, -1000);
  assert.equal(f.g.G.bank, f.bank + 100); assert.equal(f.c.items.has('insurance'), false);
});
check('final verdict blocks subsequent refund or payment', () => {
  const f = fixture('bj'), id = begin(f); f.g.G.over = { killersWin: false }; result(f, id, 1000, -1000); assert.equal(f.g.G.bank, f.bank);
});
for (const game of ['crash', 'race']) check(game + ': accepted shared bet / edits / withdrawal / loss / replay', () => {
  const f = fixture(game), amount = 1000, send = b => f.g.action(0, game, game === 'crash' ? { bet: b, auto: 0 } : { bet: b, duck: 0 });
  send(amount); const first = f.g.G[game].bets.get(0).policy; send(2000); assert.equal(f.g.G[game].bets.get(0).policy, first);
  send(0); assert.equal(f.g.view(0).priv.insurance.state, 'armed'); send(amount);
  if (game === 'crash') { f.g.G.crash.phase = 'fly'; f.g.G.crash.point = 1; }
  else { f.g.G.race.phase = 'run'; f.g.G.race.t = Gm.RACE.runTime; f.g.G.race.winner = 1; }
  f.g.tick(1 / 60); assert.equal(f.g.G.bank, f.bank + 100); assert.equal(f.c.items.has('insurance'), false);
  const before = f.g.G.bank; f.g.action(0, 'cashout'); f.g.tick(.01); assert.equal(f.g.G.bank, before);
});
check('shared round already placed blocks late arming', () => {
  const f = fixture('crash', true, false); f.g.action(0, 'crash', { bet: 1000, auto: 0 }); f.g.action(0, 'insurance'); assert.equal(f.g.view(0).priv.insurance.state, 'owned');
});
check('skee-ball loss after leaving / one host payout / policy consumed', () => {
  const f = fixture('skee'); f.g.action(0, 'skee', { kind: 'start', after: 0, bet: 1000 }); f.g.action(0, 'leave');
  for (let i = 0; i < 10; i++) f.g.tick(.02);
  assert.equal(f.g.G.bank, f.bank + 100); assert.equal(f.c.items.has('insurance'), false); assert.equal(f.g.G.skee[f.s.machine].paid, true);
});
check('queued covered result retains its owner after bot takeover', () => {
  const f = fixture('bj'); f.c.bankAllow = 0; f.c.bankT = 0; const id = begin(f); result(f, id, 1000, -1000);
  f.g.dropHuman(0); f.g.G.rt = 10; f.g.tick(.001); assert.equal(f.g.G.bank, f.bank + 100); assert.equal(f.c.items.has('insurance'), false);
});
check('killer pit-boss loss cap cannot multiply reimbursement', () => {
  const f = fixture('bj'); f.c.isKiller = true; f.g.G.bank = 1000; f.bank = 1000; const id = begin(f);
  result(f, id, 1000, -1000); assert.equal(f.g.G.bank, f.bank + 100); assert.equal(f.c.items.has('insurance'), false);
});
check('shared winning cashout retains armed policy and applies luck only to the win', () => {
  const f = fixture('crash'); f.c.lucky = 20; f.g.action(0, 'crash', { bet: 1000, auto: 0 }); f.g.G.crash.phase = 'fly'; f.g.G.crash.mult = 2;
  f.g.action(0, 'cashout'); assert.equal(f.g.G.bank, f.bank + 1600); assert.equal(f.g.view(0).priv.insurance.state, 'armed');
});
check('policy private to owner and survives actual wire deltas', () => {
  const f = fixture('bj'), cache = wireCache(), wire = {}; for (const state of ['armed','round',null]) {
    if (state === 'round') f.id = begin(f); if (state === null) result(f, f.id, 1000, -1000);
    const v = f.g.view(0), message = packFor(packPub(v.pub), v.priv, wire, f.g.G.meeting), restored = unpackSnap(JSON.parse(JSON.stringify(message)), cache);
    assert.equal(restored.priv.insurance?.state || null, state); assert.equal(f.g.view(1).priv.insurance, null); assert.equal('insurance' in v.pub, false);
  }
});
T.closeAllTables(); assert.ok(report.tables.some(r => r.refund > 0));
fs.writeFileSync('docs/performance/2026-10-16-insurance-rules.json', JSON.stringify(report, null, 2) + '\n');
console.log(`PASS: ${report.tables.length} real table rounds and ${report.cases.length} host/queue/shared-game/abuse/privacy cases.`);
