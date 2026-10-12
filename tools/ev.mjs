// Return to player for every game, measured with the bots' own play. node tools/ev.mjs [rounds]
// Run it through the heavy-job scheduler like any sim run.
import * as Gm from '../src/games.js';

const N = +(process.argv[2] || 400000);
const out = {};
function mc(name, f) {
  let staked = 0, back = 0, top = 0, wins = 0;
  for (let i = 0; i < N; i++) { const { s = 1, m } = f(); staked += s; back += m; if (m > s) wins++; if (m / s > top) top = m / s; }
  out[name] = { rtp: +(back / staked).toFixed(4), winRate: +(wins / N).toFixed(3), top: +top.toFixed(1) };
}
mc('blackjack (basic strategy)', () => { const r = Gm.bjAuto(); return { s: r.staked, m: r.mult }; });
for (const b of ['red', 'd1', 7]) mc('roulette ' + b, () => ({ m: Gm.rlSpin(b, Gm.rlLucky()).mult }));
out['slots penny (exact)'] = { rtp: +Gm.slotRTP('penny').toFixed(4) };
out['slots high (exact)'] = { rtp: +Gm.slotRTP('high').toFixed(4) };
for (const k of ['low', 'medium', 'high']) out['plinko ' + k + ' (exact)'] = { rtp: +Gm.plinkoRTP(k).toFixed(4) };
for (const [m, k] of [[3, 3], [5, 4], [1, 10], [10, 3]]) mc(`mines ${m} mines, cash at ${k}`, () => { const s = Gm.minesNew(m); const order = [...Array(25).keys()].sort(() => Math.random() - 0.5); for (let i = 0; i < k && !s.over; i++) Gm.minesPick(s, order[i]); Gm.minesCash(s); return { m: s.mult }; });
for (const [mode, k] of [['medium', 3], ['hard', 5], ['master', 2]]) mc(`tower ${mode}, cash at ${k}`, () => { const s = Gm.towerNew(mode); for (let i = 0; i < k && !s.over; i++) Gm.towerPick(s, Math.floor(Math.random() * s.eggs)); Gm.towerCash(s); return { m: s.mult }; });
mc('coin, ride twice', () => { let pot = 1; for (let i = 0; i < 3; i++) { if (!Gm.coinFlip('heads').win) return { m: 0 }; pot *= 2; } return { m: pot }; });
out['wheel (exact)'] = { rtp: +Gm.wheelRTP().toFixed(4) };
mc('dice pass line', () => ({ m: Gm.passAuto() }));
mc('dice field', () => ({ m: Gm.fieldRoll().mult }));
for (const x of [1.5, 2, 10]) mc('crash cash at ' + x, () => ({ m: Gm.crashPoint() >= x ? x : 0 }));
mc('duck race (random duck)', () => { const f = Gm.raceForm(); const d = Math.floor(Math.random() * 6); return { m: Gm.raceBetMult(f, d, Gm.raceWinner(f)) }; });
console.table(out);
