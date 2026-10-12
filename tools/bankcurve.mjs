// How fast the crew bank grows with nobody dying: median bank / start at each minute. node tools/bankcurve.mjs [games]
import { createGame } from '../src/sim.js';
import { CFG } from '../src/config.js';
Object.assign(CFG, { poisonCd: 1e9, shivCd: 1e9, lightsCd: 1e9, startCd: 1e9, closingTime: 1e9 });
const games = +(process.argv[2] || 30);
for (const n of [4, 6, 8, 10, 12, 16]) {
  const at = [[], [], [], [], [], []];
  for (let g = 0; g < games; g++) {
    const s = createGame({ humans: [{ name: 'Idle', key: 'me' }], players: n, killers: 1, forceRole: 'gambler' });
    s.G.target = 1e15;
    for (let m = 0; m < 6; m++) { for (let i = 0; i < 3600; i++) s.tick(1 / 60); at[m].push(s.G.bank / CFG.startBank); }
  }
  const med = a => a.sort((x, y) => x - y)[a.length >> 1];
  console.log(n, at.map(a => med(a).toFixed(2)).join('  '), ' p25@3m', at[2][Math.floor(games / 4)].toFixed(2), ' p75@3m', at[2][Math.floor(games * 3 / 4)].toFixed(2));
}
