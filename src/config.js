// Every tunable number lives here.
export const CFG = {
  startBank: 3000, targets: { 4: 5100, 5: 7000, 6: 9900, 7: 11500, 8: 15000 }, duoCdScale: 2, duoBankScale: 0.6,
  playerSpeed: 150, ghostSpeed: 230, botSpeed: 118, radius: 15,
  viewRange: 290, darkRange: 120, coneHalf: Math.PI / 3, nearSense: 28,
  thirstDrain: 1.1, sipGain: 30, drinkSips: 4, parched: 0.6,
  poisonDelay: 7, luckyTime: 30, luckyBonus: 0.5,
  poisonCd: 45, shivCd: 60, lightsCd: 60, lightsDur: 10, startCd: 30, sharedCd: 30,
  reach: 40,
  bot: { bjBet: 300, bjEvery: 4, rlEvery: 5, raceEvery: 8, slotEvery: 3, bjWin: 0.56, bjPush: 0.1, rlWin: 0.54, slotWin: 0.32, luckyEdge: 0.08 },
  playerBet: 250, slotBet: 100,
  talkGap: 0.9, voteTime: 30, resultTime: 4, voteThreshold: 24,
  netHz: 15,
};

// Bot smarts: how often bots look around, how often they sniff a drink first, how careless a bot killer is.
export const DIFF = {
  easy: { glance: [5, 12], sniff: 0.1, careless: 0.25, label: 'Easy' },
  normal: { glance: [3, 8], sniff: 0.25, careless: 0.12, label: 'Normal' },
  sharp: { glance: [2, 5], sniff: 0.4, careless: 0.05, label: 'Sharp' },
};

export const CAST = [
  { name: 'Red', color: '#e8443a', hat: 'fedora' },
  { name: 'Mint', color: '#3ddc97', hat: 'tophat' },
  { name: 'Biscuit', color: '#e0a95b', hat: 'cowboy' },
  { name: 'Lola', color: '#ff7ac8', hat: 'beret' },
  { name: 'Duke', color: '#4a7dff', hat: 'bowler' },
  { name: 'Pip', color: '#f4e04d', hat: 'visor' },
  { name: 'Coco', color: '#a066ff', hat: 'crown' },
  { name: 'Ozzie', color: '#ff8c2e', hat: 'beanie' },
];

export const DRINKS = [
  { kind: 'martini', color: '#d9f0c8' }, { kind: 'beer', color: '#e8b440' },
  { kind: 'whiskey', color: '#b8692a' }, { kind: 'mojito', color: '#9be08a' }, { kind: 'cosmo', color: '#ff6f9a' },
];
