// Every tunable number lives here.
export const CFG = {
  // The crew bank. Every bet also earns the crew a comp (a share of the bet, win or lose).
  startBank: 500000, comp: 0.1,
  // The target is the start bank times this, by player count (more players play more tables at once). Tuned with the
  // kill cooldowns below (2026-10-15, meetings on the phone so the night never pauses): over 2,900 bot games at 4-32
  // players, killers win 52% and a night runs 14.6 minutes on average (Steve: about half, about 15 minutes).
  targets: { 4: 3.18, 5: 4.27, 6: 5.72, 7: 6.46, 8: 8.24, 9: 10.54, 10: 12.18, 11: 13.1, 12: 15.77, 13: 16.1, 14: 18.04, 15: 21.35, 16: 23.4,
    17: 25.34, 18: 28.05, 19: 31.45, 20: 34.07, 21: 35.35, 22: 38.63, 23: 43.94, 24: 48.67, 25: 50.91, 26: 54.56, 27: 58.42, 28: 61.41, 29: 66.17, 30: 71.31, 31: 74.33, 32: 80.02 },
  killerBank: { 1: 1, 2: 0.7, 3: 0.55, 4: 0.45, 5: 0.37, 6: 0.32, 7: 0.28, 8: 0.25 }, // more killers, a smaller target
  cdScale: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 }, // (Steve, 2026-10-16: a kill is ready every 60 s however many killers are alive)
  // Recommend one killer per eight players; the optional maximum remains about one per four.
  // Maximum: 1 at 4-6, 2 at 7+, 3 at 11+, 4 at 13+, 5 at 17+, 6 at 21+, 7 at 25+, 8 at 29+
  recommendedKillers: n => Math.max(1, Math.ceil(n / 8)),
  maxKillers: n => n >= 29 ? 8 : n >= 25 ? 7 : n >= 21 ? 6 : n >= 17 ? 5 : n >= 13 ? 4 : n >= 11 ? 3 : n >= 7 ? 2 : 1,
  maxPlayers: 32,
  playerSpeed: 180, ghostSpeed: 260, botSpeed: 142, radius: 15, // (Steve, 2026-10-16: everyone 20% faster)
  viewRange: 380, darkRange: 120, coneHalf: Math.PI / 3, nearSense: 28,
  thirstDrain: 1.1, sipGain: 30, drinkSips: 4, parched: 0.6,
  // Hunger empties in about four minutes; a handful of pretzels at a snack stand fills most of it. Starving slows you down.
  hungerDrain: 0.42, snackGain: 65, starving: 0.7,
  // Shift sprints: up to stamina seconds at sprint times walking speed, refilling at staminaRegen per second.
  sprint: 1.6, stamina: 5, staminaRegen: 0.55,
  preyEvery: 40, // how often a killer's suggested target is picked again
  // Killer edges (perks.js), picked before the game: pickTime seconds online (everyone waits the same, so the wait gives
  // nobody away). Sense and the lure are pressed (7); the rest just work.
  pickTime: 15, senseCd: 90, senseDur: 3, lureCd: 120, lureDur: 10, lurePull: 0.7, staffCd: 12,
  legsStamina: 8, legsRegen: 1.1, peekSlow: 0.6, nightLights: 0.7,
  poisonDelay: 15, sickAfter: 3, luckyTime: 30, luckyBonus: 0.5,
  // Killer moves (cooldowns in seconds; any kill also holds the others for sharedCd). Steve, 2026-10-16: a kill is
  // ready every 60 s (it was 520 s, stretched further with several killers).
  orderCd: 60, rigCd: 60, bladeCd: 60, accidentCd: 60, disguiseCd: 80, disguiseDur: 30, lightsCd: 280, lightsDur: 10, startCd: 60, sharedCd: 60,
  // The blackout (Steve, 2026-10-15): the killer who cuts the power turns into a giant monster that kills anyone it
  // catches, until the crew resets the lit breakers (breakerWork seconds standing at each, facing it; each extra pair of
  // hands adds half again), finding their way by flashlight. blackoutMax: the power company resets it if nobody does.
  // monsterSpeed: times a player's walk (sprinting still outruns it); monsterSight: how far it spots a lit flashlight;
  // monsterNear: someone in the dark with theirs off, or moving; monsterHold: the kill, the victim in its hands.
  // backroomsChance: when the lights come back on, the casino is the backrooms casino for the rest of the night (Steve, 2026-10-15)
  backroomsChance: 0.01,
  // Escape mode (Steve, 2026-10-15): no meetings and no votes. The power goes out by escapeDarkAt at the latest (a killer
  // can cut it sooner). The breakers power CFG.exits staff doors, not the lights: they open as the way out for exitOpen
  // seconds, in the dark, with the monster still loose. (Left alone, the power company gets the lights and the doors on.)
  // Escape mode's gear (Steve, 2026-10-15: "there needs to be a reason to gamble"): your own winnings buy it, B, any
  // time. sneakers: faster on your feet; fuse: resets breakers twice as fast; crowbar: an exit door opens in 2 s, not
  // exitHold; charm: the monster's first grab, you slip out of it.
  gear: {
    sneakers: { name: 'Sneakers', price: 60000, tip: 'You move 15% faster.' },
    fuse: { name: 'Fuse kit', price: 80000, tip: 'You reset a breaker twice as fast.' },
    crowbar: { name: 'Crowbar', price: 100000, tip: 'You get an exit door open in 2 seconds.' },
    charm: { name: 'Lucky rabbit foot', price: 150000, tip: 'The first time the monster grabs you, you slip free.' },
  },
  sneakers: 1.15, crowbarHold: 2,
  escapeDarkAt: 300, escapeBreakers: 3, escapeBlackoutMax: 210, exitOpen: 90, exits: 1, exitHold: 5, monsterGuard: 0.6,
  breakers: 2, breakerWork: 6, blackoutMax: 150, monsterSpeed: 1.5, monsterReach: 52, monsterHold: 2.2, monsterSight: 560, monsterNear: 130, monsterCd: 4, fixers: 2,
  // The monster kills as often as it catches someone (no limit; monsterCd after each). Its pounce (E, Steve 2026-10-15):
  // leapDist in leapTime toward the nearest gambler within leapCone of where it faces (else straight ahead), stopped by
  // walls; it takes whoever it lands within monsterReach of. A miss winds it for leapMiss; leapCd between pounces. A
  // sprinter more than about four metres ahead (leapDist + monsterReach) is out of reach of it.
  leapDist: 200, leapTime: 0.45, leapCone: 0.6, leapCd: 5.5, leapMiss: 0.9,
  rigDelay: 4, inspectTime: 2, hearWall: 110, hearFaint: 0.22, behind: 1.9, chandelierFall: 1.6, chandelierRadius: 90, chandelierMax: 2, chandelierReach: 150, pondReach: 110,
  // Crew tools: antidotes at the bar, and a security guard hired with crew-bank money (a share of the target).
  antidotes: 3, guardPrice: 0.05, guardTime: 120, guardSpeed: 110, hauntTime: 8, hauntSus: 25,
  sendSus: 12, treat: 0.35, // how much a witness makes of a drink sent from the bar, and how often bots buy a round
  // The mixer (mix.js): a sip fills hunger by mixFood times the mix's food value and makes you lucky for boozeLuck times
  // its alcohol. Poison is anyone's to add; a gambler waits mixPoisonCd between poisoned pours (a killer: orderCd).
  mixFood: 25, boozeLuck: 25, mixPoisonCd: 300,
  // The shady guy in the VIP alcove (Steve, 2026-10-15): he sells for your own winnings, priced as a share of the
  // crew's target (frac) so a revolver takes about a jackpot. What you spend leaves the crew bank too.
  shop: {
    dice: { name: 'Loaded dice', frac: 0.01, tip: 'You are lucky at the tables for 90 seconds: wins pay 50% more.' },
    antidote: { name: 'Pocket antidote', frac: 0.03, tip: 'It cures poison the moment you feel it. Once.' },
    insurance: { name: 'House Insurance', frac: 0.04, tip: 'Arm before a round to return its net lost stake once. Wins and ties keep it armed. I to arm; right-stick click at a table.' },
    vest: { name: 'Kevlar vest', frac: 0.08, tip: 'It stops one knife or one bullet.' },
    gun: { name: 'Revolver', frac: 0.3, tip: 'One bullet. Q shoots whoever is in your sights.' },
  },
  shadyReach: 95, diceLuck: 90, gunBullets: 1, gunRange: 900, gunWidth: 16, gunStun: 6, gunSus: 110,
  reach: 40, closingTime: 1200, closingWarn: 120,
  // At the games you stand: walking up within joinReach of a free game, facing it (within joinFace radians), puts you at
  // it, and walking more than leaveReach off leaves it (10 ft, Steve 2026-10-16: a hand settles there; a spin keeps going).
  // barReach: how far from the counter the bar still serves you.
  joinReach: 62, joinFace: 1.25, leaveReach: 183, barReach: 80,
  // A player's table rounds reach the bank no faster than the table deals them (games.ROUND_MIN), with a burst of
  // paceBurst (a round settled early as you walk off); Plinko counts the stake riding, at least 1/plinkoBalls a ball.
  // Rounds over that wait their turn; owedMax caps the queue (far over what a night of the fastest real play builds).
  paceBurst: 4, plinkoBalls: 30, owedMax: 5000,
  // The pit boss (human killers): a killer's net losses in any cutoffTime seconds stay under cutoff of the bank as it stood
  // when they began; the loss that would pass it is cut to fit, then their losses don't count for cutoffTime.
  cutoff: 0.15, cutoffTime: 60,
  // Bots bet frac of the bank (counted up to ceil starting banks), every so many seconds per game, on the same game math as
  // players. One bot result pays back at most maxWin times the stake, plus a comp of comp: the bank climbs steadily instead
  // of a lucky straight up ending the night in a minute.
  bot: { frac: 0.02, ceil: 1, maxWin: 1, comp: 0.4, every: { bj: 5, roulette: 7, slots: 2.5, skee: 18, flappy: 18, pusher: 18, claw: 18, plinko: 2.5, mines: 5, tower: 5, coin: 4, wheel: 5, dice: 6 } },
  talkGap: 0.9, voteTime: 30, resultTime: 4, voteThreshold: 38, voteThresholdPer: 4,
  chatMax: 25, linesMax: 200, // meeting chat lines one player may send, and the lines a snapshot carries
  // Pacing for rooms of more than bigRoom players (17-32), off: a bot that finds a body or foils a plot would wait until
  // reportCalm seconds of play have passed since the last meeting before calling one, and the talk before the vote would be
  // budgeted at most bigTalk lines (26 everywhere now). Made when meetings stopped the game (a 32-player night ran 30-37
  // minutes with 13-18 meetings); since meetings run alongside play they change little (2026-10-15 sweeps).
  bigRoom: 16, reportCalm: 0, bigTalk: 26,
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
  // 17-32 (2026-10-15): every colour at least CIEDE2000 12.7 from every other, each with a hat of its own
  { name: 'Navy', color: '#22306e', hat: 'captain' },
  { name: 'Fudge', color: '#6b3f22', hat: 'viking' },
  { name: 'Plum', color: '#6a2c70', hat: 'wizard' },
  { name: 'Fern', color: '#1f7a3e', hat: 'mortarboard' },
  { name: 'Diva', color: '#d61f8f', hat: 'jester' },
  { name: 'Goldie', color: '#b08a00', hat: 'bow' },
  { name: 'Scoop', color: '#5f6b7c', hat: 'deerstalker' },
  { name: 'Lilac', color: '#c9b0f2', hat: 'nightcap' },
  { name: 'Dash', color: '#3ee8e8', hat: 'plume' },
  { name: 'Clover', color: '#f3e2b3', hat: 'bunny' },
  { name: 'Rusty', color: '#a8471c', hat: 'ushanka' },
  { name: 'Brick', color: '#5e1424', hat: 'hardhat' },
  { name: 'Presto', color: '#2fbf3f', hat: 'fez' },
  { name: 'Drizzle', color: '#155e6e', hat: 'umbrella' },
  { name: 'Mittens', color: '#9a5f86', hat: 'catears' },
  { name: 'Sunny', color: '#a3a8b0', hat: 'bucket' },
];

export const DRINKS = [
  { kind: 'martini', color: '#d9f0c8' }, { kind: 'beer', color: '#e8b440' },
  { kind: 'whiskey', color: '#b8692a' }, { kind: 'mojito', color: '#9be08a' }, { kind: 'cosmo', color: '#ff6f9a' },
];

// The death sounds a player picks at the start (assets/audio/death, tools/v5_death.py); bots get one at random.
export const DEATH_SOUNDS = [
  { id: 'scream', label: 'Scream' }, { id: 'wail', label: 'Long wail' }, { id: 'gasp', label: 'Gasp and thud' },
  { id: 'squeak', label: 'Toy squeak' }, { id: 'duck', label: 'Rubber duck' }, { id: 'trombone', label: 'Sad trombone' },
  { id: 'whistle', label: 'Slide whistle' }, { id: 'pop', label: 'Pop' }, { id: 'ghost', label: 'Ghost' },
  { id: 'organ', label: 'Organ' }, { id: 'slots', label: 'Slot machine' }, { id: 'glass', label: 'Broken glass' },
];
