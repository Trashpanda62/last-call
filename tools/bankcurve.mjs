// How fast the crew bank grows with nobody dying: median bank / start at minutes 1 to 10, and the spread at minute 3.
// node tools/bankcurve.mjs [games] [players,...]   (CFG='{...}' in the environment overrides the config)
import { createGame } from '../src/sim.js';
import { CFG } from '../src/config.js';
if (process.env.CFG) Object.assign(CFG, JSON.parse(process.env.CFG));
Object.assign(CFG, { orderCd: 1e9, rigCd: 1e9, bladeCd: 1e9, accidentCd: 1e9, lightsCd: 1e9, startCd: 1e9, closingTime: 1e9 });
const games = +(process.argv[2] || 30), ns = (process.argv[3] || '4,6,8,10,12,16').split(',').map(Number);
for (const n of ns) {
  const at = Array.from({ length: 10 }, () => []);
  for (let g = 0; g < games; g++) {
    const s = createGame({ humans: [{ name: 'Idle', key: 'me' }], players: n, killers: 1, forceRole: 'gambler' });
    s.G.target = 1e15;
    for (let m = 0; m < 10; m++) { for (let i = 0; i < 3600; i++) s.tick(1 / 60); at[m].push(s.G.bank / CFG.startBank); }
  }
  for (const a of at) a.sort((x, y) => x - y);
  const q = (a, f) => a[Math.min(a.length - 1, Math.floor(a.length * f))].toFixed(2);
  console.log(n, at.map(a => q(a, 0.5)).join(' '), ' @3m p10', q(at[2], 0.1), 'p90', q(at[2], 0.9), ' @9m p10', q(at[8], 0.1), 'p90', q(at[8], 0.9));
}
