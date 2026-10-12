// Every tunable number lives here.
export const CFG = {
  // The crew bank. Every bet also earns the crew a comp (a share of the bet, win or lose).
  startBank: 500000, comp: 0.2,
  // The target is the start bank times this, by player count (more players play more tables at once).
  targets: { 4: 1.4, 5: 2.8, 6: 4.8, 7: 3.3, 8: 5, 9: 8.8, 10: 23.7, 11: 30.4, 12: 15.6, 13: 29.9, 14: 17, 15: 28, 16: 54.6 },
  killerBank: { 1: 1, 2: 0.7, 3: 0.55, 4: 0.45 }, // more killers, a smaller target
  cdScale: { 1: 1, 2: 1.6, 3: 2.1, 4: 2.6 },      // cooldowns stretch while several killers are alive
  maxKillers: n => n >= 14 ? 4 : n >= 12 ? 3 : n >= 7 ? 2 : 1,
  playerSpeed: 150, ghostSpeed: 230, botSpeed: 118, radius: 15,
  viewRange: 380, darkRange: 120, coneHalf: Math.PI / 3, nearSense: 28,
  thirstDrain: 1.1, sipGain: 30, drinkSips: 4, parched: 0.6,
  poisonDelay: 15, sickAfter: 3, luckyTime: 30, luckyBonus: 0.5,
  // Killer moves (cooldowns in seconds; any kill also holds the others for sharedCd).
  orderCd: 35, rigCd: 35, bladeCd: 45, accidentCd: 50, disguiseCd: 80, disguiseDur: 30, lightsCd: 60, lightsDur: 10, startCd: 20, sharedCd: 15,
  rigDelay: 4, inspectTime: 2, hearRange: 360, behind: 1.9, chandelierFall: 1.6, chandelierRadius: 90, chandelierMax: 2, chandelierReach: 150, pondReach: 110,
  // Crew tools: antidotes at the bar, and security bought with crew-bank money (a share of the target).
  antidotes: 3, camsPrice: 0.06, guardPrice: 0.05, guardTime: 120, guardSpeed: 110, hauntTime: 8, hauntSus: 25,
  sendSus: 12, treat: 0.35, // how much a witness makes of a drink sent from the bar, and how often bots buy a round
  reach: 40, closingTime: 720, closingWarn: 120,
  // Bots bet this share of the bank, every so many seconds per game, on the same game math as players.
  bot: { frac: 0.06, every: { bj: 5, roulette: 7, slots: 2.5, plinko: 2.5, mines: 5, tower: 5, coin: 4, wheel: 5, dice: 6 } },
  talkGap: 0.9, voteTime: 30, resultTime: 4, voteThreshold: 32, voteThresholdPer: 4,
  social: 2.5, // how strongly bots pick seats and rooms where other people are
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
  { name: 'Teal', color: '#1fb5b0', hat: 'cap' },
  { name: 'Snow', color: '#eef0f4', hat: 'party' },
  { name: 'Moss', color: '#7a9a2a', hat: 'pirate' },
  { name: 'Ruby', color: '#a3123a', hat: 'flower' },
  { name: 'Sky', color: '#7cc8ff', hat: 'propeller' },
  { name: 'Peach', color: '#ffb48a', hat: 'chef' },
  { name: 'Ink', color: '#2a2a3a', hat: 'headphones' },
  { name: 'Lime', color: '#a8e63a', hat: 'sombrero' },
];

export const DRINKS = [
  { kind: 'martini', color: '#d9f0c8' }, { kind: 'beer', color: '#e8b440' },
  { kind: 'whiskey', color: '#b8692a' }, { kind: 'mojito', color: '#9be08a' }, { kind: 'cosmo', color: '#ff6f9a' },
];
