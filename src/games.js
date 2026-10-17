// Every table game's math, shared by the tables (players) and the sim (bots), so both get exactly the same odds.
// No DOM. Each game is player-friendly on purpose (return to player 102-110%); the house rules say so on the table.
// A result's `mult` is what comes back per $1 bet (0 = lost it all, 2 = doubled), so the bank change is bet * (mult - 1).

const rnd = () => Math.random();
const pickW = (items, w, r = rnd) => { let s = 0; for (const x of w) s += x; let u = r() * s; for (let i = 0; i < items.length; i++) { u -= w[i]; if (u < 0) return items[i]; } return items[items.length - 1]; };

// ---------- Bets ----------
export const BET = { min: 10, frac: 0.25, floor: 1000, chips: [10, 100, 1000, 10000, 100000, 1000000] };
// The most anyone can bet right now: a quarter of the crew bank, never less than $1,000.
export function maxBet(bank) { const m = Math.max(BET.floor, bank * BET.frac); return niceDown(m); }
export function clampBet(b, bank) { return Math.max(BET.min, Math.min(maxBet(bank), Math.round(b) || BET.min)); }
// Round down to 2 significant figures so limits read cleanly ($37,000 not $37,412).
// A round goal: the nearest $100,000 under $2,000,000, $250,000 under $5,000,000, $500,000 above ($3,000,000, not $3,100,000).
export function roundGoal(v) { const step = v < 2e5 ? 1e4 : v < 2e6 ? 1e5 : v < 5e6 ? 2.5e5 : 5e5; return Math.max(step, Math.round(v / step) * step); }
export function niceDown(v) { if (v < 100) return Math.floor(v); const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.floor(v / p) * p; }
// The biggest single payout a game can make, as a multiple of the bet (used to sanity-check reported results).
export const MAX_MULT = 120000;

// ---------- Blackjack ----------
// House rules: dealer stands on all 17s, blackjack pays 2 to 1, ties pay half, double any two cards, split once.
export const BJ = { bjPays: 3, tiePays: 1.5, label: 'BLACKJACK PAYS 2 TO 1 · TIES PAY HALF · DEALER STANDS ON 17' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUITS = ['♠', '♥', '♦', '♣'];
export function card(r = rnd) { return { rank: RANKS[Math.floor(r() * 13)], suit: SUITS[Math.floor(r() * 4)] }; }
const cval = c => c.rank === 'A' ? 11 : 'JQK'.includes(c.rank) || c.rank === '10' ? 10 : +c.rank;
export function bjTotal(cards) {
  let t = 0, a = 0; for (const c of cards) { t += cval(c); if (c.rank === 'A') a++; }
  while (t > 21 && a) { t -= 10; a--; }
  return { t, soft: a > 0 };
}
const isBJ = cards => cards.length === 2 && bjTotal(cards).t === 21;
// A round: { hands: [{cards, bet, done, doubled, fromSplit}], dealer: [up, hole], i, over, mult, lines }
export function bjDeal(bet, r = rnd, hot = false) {
  const s = { bet, hands: [{ cards: [card(r), card(r)], bet: 1, done: false, doubled: false, fromSplit: false }], dealer: [card(r), card(r)], i: 0, over: false, r, actions: [] };
  s.hot = hot;
  // A lucky hand plays out like any other: one of a few starts with the next cards stacked so hitting, standing or
  // doubling all win (only one in four is a blackjack; it used to be the same 10-A against 9-8 every time).
  if (hot) {
    const [p, d, next] = HOT_HANDS[Math.floor(r() * HOT_HANDS.length)], c = rank => ({ rank, suit: SUITS[Math.floor(r() * 4)] });
    s.hands[0].cards = p.map(c); s.dealer = d.map(c); s.stack = next.map(c);
  }
  if (isBJ(s.hands[0].cards) || isBJ(s.dealer)) bjFinish(s);
  return s;
}
// [player, dealer, stacked next cards]: hit to 21 or stand, the dealer ends under the player or busts
const HOT_HANDS = [[['10', 'A'], ['9', '8'], []], [['J', '9'], ['7', '9'], ['2', '10']], [['10', '9'], ['5', '10'], ['2', '9']], [['6', '5'], ['6', 'J'], ['10', '10']]];
const draw = s => s.stack && s.stack.length ? s.stack.shift() : card(s.r);
export function bjCan(s) {
  if (s.over) return {};
  const h = s.hands[s.i], two = h.cards.length === 2;
  return { hit: true, stand: true, double: two && !(h.fromSplit && h.cards[0].rank === 'A'), split: two && s.hands.length === 1 && cval(h.cards[0]) === cval(h.cards[1]) };
}
export function bjAct(s, a) {
  if (s.over) return s;
  const h = s.hands[s.i], can = bjCan(s);
  if (!can[a]) return s;
  s.actions.push({ action: a, hand: s.i, before: bjTotal(h.cards).t });
  if (a === 'hit') { h.cards.push(draw(s)); if (bjTotal(h.cards).t >= 21) h.done = true; }
  else if (a === 'stand') h.done = true;
  else if (a === 'double') { h.bet = 2; h.doubled = true; h.cards.push(draw(s)); h.done = true; }
  else if (a === 'split') {
    const b = { cards: [h.cards.pop(), card(s.r)], bet: 1, done: false, doubled: false, fromSplit: true };
    h.cards.push(card(s.r)); h.fromSplit = true;
    s.hands.push(b);
    if (h.cards[0].rank === 'A') { h.done = true; b.done = true; } // split aces get one card each
    for (const x of [h, b]) if (bjTotal(x.cards).t === 21) x.done = true; // a made 21 stands by itself
  }
  while (s.i < s.hands.length && s.hands[s.i].done) s.i++;
  if (s.i >= s.hands.length) bjFinish(s);
  return s;
}
function bjFinish(s) {
  s.over = true; s.i = Math.min(s.i, s.hands.length - 1);
  const dBJ = isBJ(s.dealer);
  const live = s.hands.some(h => bjTotal(h.cards).t <= 21) && !(s.hands.length === 1 && isBJ(s.hands[0].cards));
  if (live && !dBJ) while (bjTotal(s.dealer).t < 17) s.dealer.push(draw(s));
  const d = bjTotal(s.dealer).t;
  let ret = 0; s.lines = [];
  for (const h of s.hands) {
    const p = bjTotal(h.cards).t, natural = isBJ(h.cards) && !h.fromSplit;
    let m;
    const who = s.hands.length > 1 ? `Hand ${s.hands.indexOf(h) + 1}` : 'You';
    if (natural && !dBJ) { m = BJ.bjPays; s.lines.push(`${who}: blackjack! Dealer checks: ${d}, no blackjack.`); }
    else if (dBJ) { m = natural ? BJ.tiePays : 0; s.lines.push(natural ? 'Both blackjack. Tie pays half.' : `${who}: ${p}. Dealer blackjack.`); }
    else if (p > 21) { m = 0; s.lines.push(`${who}: ${p}, bust.`); }
    else if (d > 21) { m = 2; s.lines.push(`${who}: ${p}. Dealer ${d}, busts!`); }
    else if (p > d) { m = 2; s.lines.push(`${who}: ${p} beats dealer ${d}.`); }
    else if (p === d) { m = BJ.tiePays; s.lines.push(`${who}: ${p}, dealer ${d}. Tie pays half.`); }
    else { m = 0; s.lines.push(`${who}: ${p}. Dealer ${d} wins.`); }
    ret += m * h.bet;
  }
  s.mult = ret; // per unit of the original bet (doubles and splits add units)
  s.staked = s.hands.reduce((a, h) => a + h.bet, 0);
  return s;
}
// Basic strategy for these rules (infinite deck, stand on 17, double after split).
export function bjAdvice(s) {
  const h = s.hands[s.i], can = bjCan(s), up = cval(s.dealer[0]) === 11 ? 1 : cval(s.dealer[0]);
  const { t, soft } = bjTotal(h.cards);
  const dbl = a => can.double ? 'double' : a;
  if (can.split) {
    const v = cval(h.cards[0]);
    if (v === 11 || v === 8) return 'split';
    if ((v === 2 || v === 3 || v === 7) && up >= 2 && up <= 7) return 'split';
    if (v === 6 && up >= 2 && up <= 6) return 'split';
    if (v === 9 && ((up >= 2 && up <= 6) || up === 8 || up === 9)) return 'split';
    if (v === 4 && (up === 5 || up === 6)) return 'split';
  }
  if (soft) {
    if (t >= 19) return 'stand';
    if (t === 18) return up >= 3 && up <= 6 ? dbl('stand') : up === 2 || up === 7 || up === 8 ? 'stand' : 'hit';
    if (t === 17) return up >= 3 && up <= 6 ? dbl('hit') : 'hit';
    if (t >= 15) return up >= 4 && up <= 6 ? dbl('hit') : 'hit';
    return up >= 5 && up <= 6 ? dbl('hit') : 'hit';
  }
  if (t >= 17) return 'stand';
  if (t >= 13) return up >= 2 && up <= 6 ? 'stand' : 'hit';
  if (t === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (t === 11) return dbl('hit');
  if (t === 10) return up >= 2 && up <= 9 ? dbl('hit') : 'hit';
  if (t === 9) return up >= 3 && up <= 6 ? dbl('hit') : 'hit';
  return 'hit';
}
export function bjAuto(r = rnd) {
  const s = bjDeal(1, r);
  for (let g = 0; !s.over && g < 30; g++) bjAct(s, bjAdvice(s));
  return { mult: s.mult, staked: s.staked };
}

// ---------- Roulette (single zero) ----------
// House rules: zero gives outside bets back. Each spin lights up to 3 lucky numbers: a straight bet on one pays its
// lucky multiplier, and any winning bet pays double if the ball lands on a lucky number.
export const RL = { label: 'ZERO GIVES OUTSIDE BETS BACK · LUCKY NUMBERS PAY UP TO 500x' };
export const RL_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const RL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RL_BETS = {
  red: { label: 'Red', pays: 2, win: n => RL_RED.has(n) }, black: { label: 'Black', pays: 2, win: n => n > 0 && !RL_RED.has(n) },
  odd: { label: 'Odd', pays: 2, win: n => n % 2 === 1 }, even: { label: 'Even', pays: 2, win: n => n > 0 && n % 2 === 0 },
  low: { label: '1-18', pays: 2, win: n => n >= 1 && n <= 18 }, high: { label: '19-36', pays: 2, win: n => n >= 19 },
  d1: { label: '1st 12', pays: 3, win: n => n >= 1 && n <= 12 }, d2: { label: '2nd 12', pays: 3, win: n => n >= 13 && n <= 24 }, d3: { label: '3rd 12', pays: 3, win: n => n >= 25 },
};
export function rlLucky(r = rnd) {
  const k = 1 + Math.floor(r() * 3), out = [];
  while (out.length < k) { const n = Math.floor(r() * 37); if (!out.some(o => o.n === n)) out.push({ n, x: pickW([50, 100, 200, 500], [50, 30, 15, 5], r) }); }
  return out;
}
// Column bets (2 to 1) on the hands-on layout; same pay and zero rule as the dozens. Bots keep to RL_BETS.
export const RL_COLS = {
  c1: { label: '1st column', pays: 3, win: n => n > 0 && n % 3 === 1 }, c2: { label: '2nd column', pays: 3, win: n => n > 0 && n % 3 === 2 },
  c3: { label: '3rd column', pays: 3, win: n => n > 0 && n % 3 === 0 },
};
export const rlBall = (r = rnd) => Math.floor(r() * 37);
// What one bet returns per $1 when the ball lands on n. bet: 'red' ... 'c1' ... or a number 0-36 (a straight-up bet).
export function rlMult(bet, n, lucky) {
  const L = lucky.find(o => o.n === n);
  if (typeof bet === 'number') return bet === n ? (L ? L.x : 36) : 0;
  const b = Object.hasOwn(RL_BETS, bet) ? RL_BETS[bet] : Object.hasOwn(RL_COLS, bet) ? RL_COLS[bet] : null; if (!b) return 0;
  return b.win(n) ? b.pays * (L ? 2 : 1) : n === 0 ? 1 : 0;
}
export function rlSpin(bet, lucky, r = rnd) {
  const n = rlBall(r), mult = rlMult(bet, n, lucky);
  return { n, mult, lucky: !!lucky.find(o => o.n === n) };
}
// Several bets on one spin: bets { red: 100, 17: 50, d2: 10 } (number keys are straight-ups). Returns the total back.
export function rlSettle(bets, n, lucky) {
  let back = 0;
  for (const k in bets) back += bets[k] * rlMult(/^\d+$/.test(k) ? +k : k, n, lucky);
  return back;
}

// ---------- Slots ----------
export const SLOT_SYMS = ['💎', '7', 'BAR', '🔔', '🍒', '🍋'];
const SLOT_W = [1, 2, 3, 4, 6, 6];
export const SLOT_TIERS = {
  penny: { name: 'Penny slots', minBet: 2, pays: { '💎': 250, '7': 75, BAR: 30, '🔔': 15, '🍒': 8, '🍋': 5 }, two: 2, one: 0.5 },
  high: { name: 'High limit', minBet: 1000, pays: { '💎': 1000, '7': 100, BAR: 30, '🔔': 15, '🍒': 8, '🍋': 5 }, two: 1.5, one: 0.5 },
};
export function slotSpin(tier, r = rnd, hot = false) {
  const T = Object.hasOwn(SLOT_TIERS, tier) ? SLOT_TIERS[tier] : SLOT_TIERS.penny;
  const reels = hot ? Array(3).fill(pickW(['🍋', '🍒', '🔔', 'BAR', '7'], [45, 30, 15, 8, 2], r)) : [0, 1, 2].map(() => pickW(SLOT_SYMS, SLOT_W, r));
  return { reels, ...slotPay(T, reels) };
}
function slotPay(T, reels) {
  if (reels[0] === reels[1] && reels[1] === reels[2]) return { mult: T.pays[reels[0]], line: reels[0] === '💎' ? 'JACKPOT!' : 'Three of a kind!' };
  const ch = reels.filter(s => s === '🍒').length;
  if (ch === 2) return { mult: T.two, line: 'Two cherries.' };
  if (ch === 1) return { mult: T.one, line: 'A cherry. Half back.' };
  return { mult: 0, line: 'Nothing.' };
}
export function slotRTP(tier) {
  const T = SLOT_TIERS[tier], tot = SLOT_W.reduce((a, b) => a + b, 0); let ev = 0;
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) {
    const p = SLOT_W[a] * SLOT_W[b] * SLOT_W[c] / tot ** 3;
    ev += p * slotPay(T, [SLOT_SYMS[a], SLOT_SYMS[b], SLOT_SYMS[c]]).mult;
  }
  return ev;
}

// ---------- Plinko (16 rows) ----------
export const PLINKO_ROWS = 16;
// Lower risk gates the board (Steve, 2026-10-16: "I want to see spots get gated off for lower risk"): brass gates stand
// PLINKO_GATE channels either side of the middle, the ball bounces off them, and the channels outside are closed (0).
// Low plays the middle 9 channels, medium 13, high all 17; each keeps its return (plinkoRTP: about 1.04).
export const PLINKO_GATE = { low: 4, medium: 6, high: 8 };
export const PLINKO = {
  low: [0, 0, 0, 0, 2.9, 1.5, 1.05, 0.85, 0.5, 0.85, 1.05, 1.5, 2.9, 0, 0, 0, 0],
  medium: [0, 0, 24, 8, 3.2, 1.5, 0.85, 0.5, 0.3, 0.5, 0.85, 1.5, 3.2, 8, 24, 0, 0],
  high: [1000, 130, 26, 9, 4, 2, 0.4, 0.2, 0.2, 0.2, 0.4, 2, 4, 9, 26, 130, 1000],
};
const gateOf = risk => Object.hasOwn(PLINKO_GATE, risk) ? PLINKO_GATE[risk] : PLINKO_GATE.low;
// path: 16 left/right bounces (1 = right); the bucket is the number of rights. At a gate the bounce goes back in.
// The ball sits at x = rights - rows/2 channels from the middle; a gate at g lets it reach |x| <= g.
export function plinkoDrop(risk, r = rnd, hot = false) {
  const g = gateOf(risk), pays = Object.hasOwn(PLINKO, risk) ? PLINKO[risk] : PLINKO.low, n = PLINKO_ROWS, path = [];
  // hot: a modest winner (over 1x, at most 10x), reached by a gated path that still looks random
  const want = hot ? (w => w[Math.floor(r() * w.length)])(pays.map((x, i) => x > 1 && x <= 10 ? i : -1).filter(i => i >= 0)) : -1;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x = k - i / 2, left = n - i;
    let canR = x + 0.5 <= g, canL = x - 0.5 >= -g;
    if (want >= 0) { const need = want - k; canR = canR && need > 0; canL = canL && need < left; }
    const right = canR && canL ? r() < 0.5 : canR;
    path.push(right ? 1 : 0); k += right ? 1 : 0;
  }
  return { path, bucket: k, mult: pays[k] };
}
export function plinkoDist(risk) { // the chance of each channel, the gates included
  const g = gateOf(risk), n = PLINKO_ROWS; let p = new Array(n + 1).fill(0); p[0] = 1;
  for (let i = 0; i < n; i++) {
    const q = new Array(n + 1).fill(0);
    for (let k = 0; k <= i; k++) if (p[k]) { const x = k - i / 2, R = x + 0.5 <= g, L = x - 0.5 >= -g, w = p[k] / ((R ? 1 : 0) + (L ? 1 : 0)); if (R) q[k + 1] += w; if (L) q[k] += w; }
    p = q;
  }
  return p;
}
export function plinkoRTP(risk) { return plinkoDist(risk).reduce((ev, p, k) => ev + p * PLINKO[risk][k], 0); }

// ---------- Mines (5 x 5) ----------
export const MINES = { tiles: 25, rtp: 1.03, cap: 10000 };
export function minesNew(m, r = rnd, hot = false) {
  m = Math.max(1, Math.min(24, m | 0));
  const all = [...Array(25).keys()];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return { hot, m, mines: new Set(all.slice(0, m)), open: [], dead: false, over: false };
}
export function minesMult(m, k) {
  if (k <= 0) return 1;
  let x = MINES.rtp; for (let i = 0; i < k; i++) x *= (25 - i) / (25 - m - i);
  return Math.min(MINES.cap, Math.floor(x * 100) / 100);
}
export function minesPick(s, tile) {
  if (s.over || !Number.isInteger(tile) || tile < 0 || tile >= MINES.tiles || s.open.includes(tile)) return s;
  if (s.hot && s.mines.has(tile)) {
    s.mines.delete(tile);
    const spare = [...Array(25).keys()].find(i => i !== tile && !s.open.includes(i) && !s.mines.has(i));
    s.mines.add(spare);
  }
  s.open.push(tile);
  if (s.mines.has(tile)) { s.dead = true; s.over = true; s.mult = 0; }
  else if (s.open.length >= 25 - s.m) { s.over = true; s.mult = minesMult(s.m, s.open.length); }
  return s;
}
export function minesCash(s) { if (!s.over && s.open.length) { s.over = true; s.mult = minesMult(s.m, s.open.length); } return s; }

// ---------- Dragon Tower (9 floors) ----------
export const TOWER = {
  rows: 9, rtp: 1.03, cap: 100000,
  modes: { easy: { eggs: 4, dragons: 1, label: 'Easy' }, medium: { eggs: 3, dragons: 1, label: 'Medium' }, hard: { eggs: 2, dragons: 1, label: 'Hard' }, expert: { eggs: 3, dragons: 2, label: 'Expert' }, master: { eggs: 4, dragons: 3, label: 'Master' } },
};
export function towerNew(mode, r = rnd, hot = false) {
  if (!Object.hasOwn(TOWER.modes, mode)) mode = 'medium';
  const M = TOWER.modes[mode];
  const rows = [];
  for (let i = 0; i < TOWER.rows; i++) { const idx = [...Array(M.eggs).keys()]; for (let j = idx.length - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1)); [idx[j], idx[k]] = [idx[k], idx[j]]; } rows.push(new Set(idx.slice(0, M.dragons))); }
  return { hot, mode, eggs: M.eggs, rows, row: 0, picks: [], dead: false, over: false };
}
export function towerMult(mode, rows) {
  const M = Object.hasOwn(TOWER.modes, mode) ? TOWER.modes[mode] : TOWER.modes.medium; if (rows <= 0) return 1;
  return Math.min(TOWER.cap, Math.floor(TOWER.rtp * Math.pow(M.eggs / (M.eggs - M.dragons), rows) * 100) / 100);
}
export function towerPick(s, egg) {
  if (s.over || !Number.isInteger(egg) || egg < 0 || egg >= s.eggs) return s;
  if (s.hot && s.rows[s.row].has(egg)) {
    s.rows[s.row].delete(egg);
    s.rows[s.row].add([...Array(s.eggs).keys()].find(i => i !== egg && !s.rows[s.row].has(i)));
  }
  s.picks.push(egg);
  if (s.rows[s.row].has(egg)) { s.dead = true; s.over = true; s.mult = 0; return s; }
  s.row++;
  if (s.row >= TOWER.rows) { s.over = true; s.mult = towerMult(s.mode, s.row); }
  return s;
}
export function towerCash(s) { if (!s.over && s.row > 0) { s.over = true; s.mult = towerMult(s.mode, s.row); } return s; }

// ---------- Coin flip ----------
export const COIN = { p: 0.51, maxRide: 16, label: 'LUCKY COIN · LANDS YOUR WAY 51% OF THE TIME' };
export function coinFlip(call, r = rnd, hot = false) { const win = hot || r() < COIN.p; const side = win ? call : call === 'heads' ? 'tails' : 'heads'; return { side, win }; }

// ---------- Prize wheel (50 segments) ----------
export const WHEEL = (() => {
  // 17 prizes spread evenly around 50 segments (the rest pay nothing): 1.5x nine times, 2x four, 3x two, 5x, 20x.
  const order = [20, 1.5, 2, 1.5, 3, 1.5, 2, 1.5, 5, 1.5, 2, 1.5, 3, 1.5, 2, 1.5, 1.5];
  const segs = new Array(50).fill(0);
  order.forEach((v, i) => { segs[Math.round(i * 50 / order.length)] = v; });
  return { segs, label: 'SPIN TO WIN · TOP PRIZE 20x' };
})();
// The most each table game can pay back for a stake (the host caps reported results with it; Crash and the duck race
// are settled by the host itself).
export const GAME_MAX = { bj: BJ.bjPays, roulette: 500, slots: Math.max(...Object.values(SLOT_TIERS).map(T => T.pays['💎'])), plinko: 1000,
  mines: MINES.cap, tower: TOWER.cap, coin: 2 ** COIN.maxRide, wheel: Math.max(...WHEEL.segs), dice: 5 };
// The shortest honest round at each table (tables.js): its animation (roulette 4 s, slots 1.75, a Plinko ball's 16-row
// fall 1.97, a coin flip 1.25, the wheel 5, dice 0.95), or two presses where nothing animates (blackjack, Mines, Dragon
// Tower). The host paces reported rounds by it.
export const ROUND_MIN = { bj: 0.15, roulette: 4, slots: 1.75, plinko: 1.97, mines: 0.15, tower: 0.15, coin: 1.25, wheel: 5, dice: 0.95 };
export function wheelSpin(r = rnd, hot = false) { const winners = WHEEL.segs.map((x, i) => x > 1 ? i : -1).filter(i => i >= 0); const i = hot ? winners[Math.floor(r() * winners.length)] : Math.floor(r() * WHEEL.segs.length); return { i, mult: WHEEL.segs[i] }; }
export const wheelRTP = () => WHEEL.segs.reduce((a, b) => a + b, 0) / WHEEL.segs.length;

// ---------- Street dice ----------
// Pass line: 7 or 11 wins on the come-out, and so does 12; 2 or 3 loses; anything else sets the point, then
// roll the point again before a 7. Field: one roll, 3 4 9 10 11 pay 2x, 2 and 12 pay 5x.
export const DICE = { label: '12 WINS ON THE COME-OUT · FIELD 2 AND 12 PAY 5x' };
export const roll2 = (r = rnd) => [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)];
export function passNew() { return { point: 0, rolls: [], over: false, mult: 0 }; }
export function passRoll(s, r = rnd, hot = false) {
  if (s.over) return s;
  const target = s.point || 11;
  const d = hot ? [Math.min(6, target - 1), target - Math.min(6, target - 1)] : roll2(r), t = d[0] + d[1]; s.rolls.push(d);
  if (!s.point) {
    if (t === 7 || t === 11 || t === 12) { s.over = true; s.mult = 2; s.line = t === 12 ? 'Boxcars! Twelve wins.' : `${t}! Winner.`; }
    else if (t === 2 || t === 3) { s.over = true; s.mult = 0; s.line = t === 2 ? 'Snake eyes. Craps.' : 'Three. Craps.'; }
    else { s.point = t; s.line = `The point is ${t}.`; }
  } else if (t === s.point) { s.over = true; s.mult = 2; s.line = `${t}! Made the point.`; }
  else if (t === 7) { s.over = true; s.mult = 0; s.line = 'Seven out.'; }
  else s.line = `${t}. Roll again for ${s.point}.`;
  return s;
}
export const fieldMult = t => t === 2 || t === 12 ? 5 : [3, 4, 9, 10, 11].includes(t) ? 2 : 0;
export function fieldRoll(r = rnd) {
  const d = roll2(r), t = d[0] + d[1];
  return { dice: d, total: t, mult: fieldMult(t) };
}
export function passAuto(r = rnd) { const s = passNew(); for (let g = 0; !s.over && g < 200; g++) passRoll(s, r); return s.mult; }

// ---------- Crash (one shared rocket per round) ----------
// 3% of rockets blow up on the pad; the rest reach x with chance 1.07 / x. So every cash-out target is worth the same
// on average (about 1.04x the bet) and nothing is a sure thing.
export const CRASH = { pad: 0.03, k: 1.07, cap: 1000, rate: 0.11, betTime: 7, boomTime: 3.5 };
export function crashPoint(r = rnd) {
  if (r() < CRASH.pad) return 1;
  const u = r(); const x = CRASH.k / (1 - u);
  return Math.min(CRASH.cap, Math.max(1, Math.floor(x * 100) / 100));
}
export const crashAt = t => Math.floor(Math.exp(CRASH.rate * t) * 100) / 100; // multiplier after t seconds of flight
export const crashTime = x => Math.log(x) / CRASH.rate;

// ---------- Duck race (shared rounds) ----------
export const DUCKS = [
  { name: 'Quackers', color: '#f4e04d' }, { name: 'Big Bill', color: '#ff8c2e' }, { name: 'Puddles', color: '#6ac0e8' },
  { name: 'Lucky Lou', color: '#3ddc97' }, { name: 'Sir Waddles', color: '#ff7ac8' }, { name: 'Long Shot', color: '#a066ff' },
];
export const RACE = { rtp: 1.06, betTime: 15, runTime: 12, showTime: 5 };
// Each round the ducks get a new form: win chances that sum to 1, posted as odds (pays = rtp / chance).
export function raceForm(r = rnd) {
  const raw = DUCKS.map(() => 0.25 + r() * r() * 2.2);
  const s = raw.reduce((a, b) => a + b, 0);
  const p = raw.map(x => x / s);
  return { p, pays: p.map(x => Math.max(1.2, Math.floor(RACE.rtp / x * 10) / 10)) };
}
export function raceWinner(form, r = rnd) { return pickW(DUCKS.map((_, i) => i), form.p, r); }
// Where each duck is (0..1) t seconds into the run, finishing in the winner's favour.
export function raceLanes(t, winner, seed) {
  const T = RACE.runTime, out = [];
  for (let i = 0; i < DUCKS.length; i++) {
    const h = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453, f = h - Math.floor(h);
    const end = i === winner ? 1 : 0.8 + f * 0.17;
    const u = Math.min(1, t / T), wob = Math.sin(t * (1.5 + f * 2) + i * 2.1) * 0.025 * Math.sin(u * Math.PI);
    const curve = i === winner ? u * u * (3 - 2 * u) * 0.6 + u * 0.4 : Math.pow(u, 0.85 + f * 0.3);
    out.push(Math.max(0, Math.min(1, curve * end + wob)));
  }
  return out;
}
export function raceBetMult(form, duck, winner) { return duck === winner ? form.pays[duck] : 0; }
