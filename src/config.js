// Every tunable number lives here.
export const CFG = {
  // The crew bank. Every bet also earns the crew a comp (a share of the bet, win or lose).
  startBank: 500000, comp: 0.1,
  // The target is the start bank times this, by player count (more players play more tables at once).
  // Tuned (Steve, 2026-10-14: games about 15 minutes) so killers win about half the time with the bank pace below.
  targets: { 4: 2.3, 5: 3.3, 6: 4.6, 7: 4.45, 8: 5.75, 9: 7, 10: 8.9, 11: 8.2, 12: 10.5, 13: 10.1, 14: 11.9, 15: 13.5, 16: 15.5 },
  killerBank: { 1: 1, 2: 0.7, 3: 0.55, 4: 0.45 }, // more killers, a smaller target
  cdScale: { 1: 1, 2: 1.45, 3: 1.85, 4: 2.25 },      // cooldowns stretch while several killers are alive
  maxKillers: n => n >= 13 ? 4 : n >= 11 ? 3 : n >= 7 ? 2 : 1,
  playerSpeed: 150, ghostSpeed: 230, botSpeed: 118, radius: 15,
  viewRange: 380, darkRange: 120, coneHalf: Math.PI / 3, nearSense: 28,
  thirstDrain: 1.1, sipGain: 30, drinkSips: 4, parched: 0.6,
  poisonDelay: 15, sickAfter: 3, luckyTime: 30, luckyBonus: 0.5,
  // Killer moves (cooldowns in seconds; any kill also holds the others for sharedCd). A kill every few minutes keeps a
  // night near 15 minutes, meetings included.
  orderCd: 210, rigCd: 210, bladeCd: 210, accidentCd: 210, disguiseCd: 80, disguiseDur: 30, lightsCd: 126, lightsDur: 10, startCd: 105, sharedCd: 168,
  rigDelay: 4, inspectTime: 2, hearRange: 360, behind: 1.9, chandelierFall: 1.6, chandelierRadius: 90, chandelierMax: 2, chandelierReach: 150, pondReach: 110,
  // Crew tools: antidotes at the bar, and security bought with crew-bank money (a share of the target).
  antidotes: 3, camsPrice: 0.06, guardPrice: 0.05, guardTime: 120, guardSpeed: 110, hauntTime: 8, hauntSus: 25,
  sendSus: 12, treat: 0.35, // how much a witness makes of a drink sent from the bar, and how often bots buy a round
  reach: 40, closingTime: 1200, closingWarn: 120,
  // Bots bet frac of the bank (counted up to ceil starting banks), every so many seconds per game, on the same game math as
  // players. One bot result pays back at most maxWin times the stake, plus a comp of comp: the bank climbs steadily instead
  // of a lucky straight up ending the night in a minute.
  bot: { frac: 0.02, ceil: 1, maxWin: 1, comp: 0.4, every: { bj: 5, roulette: 7, slots: 2.5, plinko: 2.5, mines: 5, tower: 5, coin: 4, wheel: 5, dice: 6 } },
  talkGap: 0.9, voteTime: 30, resultTime: 4, voteThreshold: 38, voteThresholdPer: 4,
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
