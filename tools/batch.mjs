// Headless balance check: node tools/batch.mjs [games] [players] [killers] [difficulty]
// The one human seat idles (never moves, never votes), so this is the killer's best case.
import { createGame } from '../src/sim.js';
import { CFG } from '../src/config.js';
if (process.env.CFG) Object.assign(CFG, JSON.parse(process.env.CFG));

const [games = 40, players = 6, killers = 1, difficulty = 'normal'] = process.argv.slice(2).map((v, i) => i < 3 ? +v : v);
const res = { killers: 0, gamblers: 0, timeout: 0, bankWins: 0, ejectWins: 0, len: [], meetings: 0, ejectsRight: 0, ejectsWrong: 0, errors: 0 };
for (let i = 0; i < games; i++) {
  try {
    const g = createGame({ humans: [{ name: 'Idle', key: 'me' }], players, killers, difficulty, forceRole: 'gambler' });
    let steps = 0;
    while (!g.G.over && steps < 60 * 60 * 30) { g.tick(1 / 60); steps++; }
    const o = g.G.over;
    if (!o) { res.timeout++; continue; }
    if (o.killersWin) res.killers++; else { res.gamblers++; if (g.G.bank >= g.G.target) res.bankWins++; else res.ejectWins++; }
    res.len.push(o.t); res.meetings += o.stats.meetings; for (const k of ['poison', 'trap', 'blade', 'chandelier', 'drown']) res[k] = (res[k] || 0) + (o.stats[k] || 0); res.saved = (res.saved || 0) + (CFG.antidotes - g.G.antidotes); res.cams = (res.cams || 0) + (g.G.security.cams ? 1 : 0); res.bankRatio = (res.bankRatio || 0) + g.G.bank / g.G.target; if (!o.killersWin && g.G.bank >= g.G.target) (res.bankT = res.bankT || []).push(o.t);
    for (const c of g.G.chars) if (c.ejected) c.isKiller ? res.ejectsRight++ : res.ejectsWrong++;
  } catch (e) { res.errors++; console.error(e.stack); }
}
const avg = a => a.length ? (a.reduce((s, x) => s + x, 0) / a.length) : 0;
console.log(JSON.stringify({
  games, players, killers, difficulty,
  killerWinRate: +(res.killers / games).toFixed(2), gamblerWins: res.gamblers, bankWins: res.bankWins, ejectWins: res.ejectWins,
  timeouts: res.timeout, errors: res.errors, avgMinutes: +(avg(res.len) / 60).toFixed(1), meetingsPerGame: +(res.meetings / games).toFixed(1),
  ejectsRight: res.ejectsRight, ejectsWrong: res.ejectsWrong, endBankOfTarget: +((res.bankRatio || 0) / games).toFixed(2), bankWinMinutes: +(avg(res.bankT || []) / 60).toFixed(1),
  kills: { poison: res.poison, trap: res.trap, blade: res.blade, chandelier: res.chandelier, drown: res.drown }, antidotes: res.saved, camsGames: res.cams,
}));
