// The table games. You click the felt, the betting pads and the touch screens in 3D (src/3d/rig.js) and the buttons on
// the table bar (main.js, from tableBar()); both send presses here (press(id, uv)). The machine screens and the chips
// on the felt read tableView().
// DOM-free. Every odd comes from games.js, the same maths the bots use; finished rounds go to the sim as
// act('bank', { d, b }) and the shared rounds as act('crash' | 'cashout' | 'race').
import * as Gm from './games.js';
import * as P from './paint.js';
import { money } from './util.js';
import { sfx } from './audio.js';

const now = () => performance.now() / 1000;
const S = n => P.short(n);
const cap = s => s[0].toUpperCase() + s.slice(1);
export const CHIPS = Gm.BET.chips;
export const chipLabel = c => c >= 1e6 ? c / 1e6 + 'M' : c >= 1e3 ? c / 1e3 + 'K' : String(c);
export const CRASH_AUTOS = [0, 1.5, 2, 3, 5, 10, 100];
const LADDER = [10, 20, 50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8];
const RL_RED = Gm.RL_RED;
export const RL_SPOTS = new Set([...Array(37).keys()].map(n => 'n' + n).concat(Object.keys(Gm.RL_BETS), Object.keys(Gm.RL_COLS)));

let tb = null;            // the table I'm at
let chip = 1000;          // the chip in hand, remembered between tables
let betAmt = 1000;        // the last stake on a one-spot game, remembered between tables
let crashAuto = 2;        // auto cash-out, remembered
const rlHist = [];        // the last roulette numbers you saw land, newest first
let hand = () => {};      // first-person hand animation hook: hand(kind)
export function setHandHook(fn) { hand = fn; }
export const tableGame = () => tb && tb.game;
export const tableSeat = () => tb ? tb.seat : -1;

// ---------- Open, close, tick ----------
export function openTable(seat, act, v) {
  tb = { game: seat.game, seat: seat.id, tier: seat.tier || 'penny', act, me: v.priv.me, view: null, jobs: [], maxBet: v.pub.maxBet || Gm.maxBet(v.pub.bank),
    bets: {}, adds: {}, undo: [], last: null, res: { text: '', cls: '' }, fx: null, pressed: null, flash: null, placed: null };
  tb.g = GAMES[tb.game] || GAMES.vip;
  // a big chip from the last table steps down here, so a first click doesn't put most of the max down
  if (chip > tb.maxBet / 4) chip = CHIPS.filter(v => v <= tb.maxBet / 4).pop() || CHIPS[0];
  const kb = document.querySelector('#tableBar .tb-foot .kb'); // only layout games take a bet back with a right-click
  if (kb) kb.textContent = '[E] or [Q] stand up · ' + (tb.g.noChips ? '' : 'wheel changes your chip · ') + (tb.g.main || tb.g.noChips ? '' : 'right-click takes chips back · ') + 'hold Space to look behind you';
  if (tb.g.init) tb.g.init();
  if (tb.g.main) { tb.bets.main = Math.max(minBet(), Math.min(tb.maxBet, betAmt)); tb.last = 'main'; }
  if (tb.g.live) tb.g.live(v);
}
export function closeTable() {
  if (tb) {
    tb.closing = true; // nothing new starts now (an auto spin waiting in the queue stays put)
    // rounds already decided still pay out, including a payment a flushed job queues on its way
    for (let n = 0; n < 8 && tb.jobs.length; n++) for (const j of tb.jobs.splice(0)) j.fn();
    if (tb.g.abandon) tb.g.abandon();          // and a round you walk away from is played out, not cancelled
  }
  tb = null;
}
export function tableTick(v) {
  if (!tb) return;
  const t = now();
  for (let i = 0; i < tb.jobs.length; i++) if (tb.jobs[i].at <= t) { const j = tb.jobs.splice(i--, 1)[0]; j.fn(); if (!tb) return; }
  const mb = v.pub.maxBet || Gm.maxBet(v.pub.bank);
  if (mb !== tb.maxBet || stake() > mb) { tb.maxBet = mb; fit(); } // also trims bets that were locked when the max fell
  if (tb.g.live) tb.g.live(v);
  if (tb.fx && t - tb.fx.t0 > 2.6) tb.fx = null;
}

// ---------- Bets ----------
const minBet = () => tb.game === 'slots' ? Math.max(Gm.BET.min, Gm.SLOT_TIERS[tb.tier].minBet) : Gm.BET.min;
const stake = () => { let s = 0; for (const k in tb.bets) s += tb.bets[k]; return s; };
const locked = spot => !!(tb.g.locked && tb.g.locked(spot));
function remember() { if (tb.g.main && tb.bets.main) betAmt = tb.bets.main; }
// UNDO steps back through the layouts you made (spots the dealer has locked can't come back).
function save() { tb.undo.push({ ...tb.bets }); if (tb.undo.length > 40) tb.undo.shift(); }
function undo() {
  const prev = tb.undo[tb.undo.length - 1];
  if (!prev) return flash('Nothing to undo');
  for (const s of new Set([...Object.keys(prev), ...Object.keys(tb.bets)])) if (locked(s) && prev[s] !== tb.bets[s]) return flash('No more bets');
  tb.undo.pop(); tb.bets = prev; fit(); sfx('chip'); hand('press'); remember();
}
// Keep the chips on the table under the max bet (the max moves with the crew bank).
function fit() {
  const tot = stake();
  if (tot > tb.maxBet) { const k = tb.maxBet / tot; for (const s in tb.bets) if (!locked(s)) { tb.bets[s] = Math.floor(tb.bets[s] * k / 10) * 10; if (tb.bets[s] < Gm.BET.min) delete tb.bets[s]; } }
  if (tb.bets.main !== undefined && tb.bets.main < minBet() && !locked('main')) tb.bets.main = Math.min(minBet(), tb.maxBet);
}
function flash(text) { tb.flash = { text, t: now() }; sfx('click'); }
function result(text, cls = '') { tb.res = { text, cls }; }
function later(sec, fn) { tb.jobs.push({ at: now() + sec, fn }); }
// A finished round: `st` went in, `back` came out. The sim adds the comp and checks the numbers.
// per: { spot: { stake, back } } drives the chips: losers get swept, winners get paid beside their stack.
function pay(st, back, line, per) {
  tb.act('bank', { d: back - st, b: st });
  const net = back - st;
  result((line ? line + ' ' : '') + (net > 0 ? '+' + money(net) : net < 0 ? '−' + money(-net) : 'Even.'), net > 0 ? 'win' : net < 0 ? 'lose' : '');
  sfx(net > 0 ? (back >= st * 5 ? 'win' : 'coin') : net < 0 ? 'lose' : 'click');
  if (back >= st * 20 && st > 0) sfx('jackpot');
  if (per) tb.fx = { t0: now(), per };
}
function dropChip(spot) {
  const g = tb.g;
  if (g.spotPress && g.spotPress(spot)) return;
  if (locked(spot)) return flash('No more bets');
  if (g.excl) { // one spot at a time: tapping another spot moves the bet there
    const cur = Object.keys(tb.bets).find(k => tb.bets[k] > 0);
    if (cur && cur !== spot) { save(); tb.bets = { [spot]: tb.bets[cur] }; tb.last = spot; tb.adds[spot] = now(); sfx('chip'); hand('press'); return; }
  }
  let c = chip; if (c > tb.maxBet) c = CHIPS.filter(v => v <= tb.maxBet).pop() || Gm.BET.min;
  const room = tb.maxBet - stake();
  if (room < Gm.BET.min) return flash('Table max ' + S(tb.maxBet));
  save();
  const add = Math.min(c, room);
  tb.bets[spot] = (tb.bets[spot] || 0) + add; tb.last = spot; tb.adds[spot] = now(); tb.placed = { amt: add, t: now() };
  sfx('chip'); hand('press'); remember();
}
function takeBack(spot) {
  if (!tb.bets[spot]) return;
  if (locked(spot)) return flash('No more bets');
  save(); delete tb.bets[spot]; fit(); sfx('chip'); hand('press'); remember();
}
function rail(k) {
  if (k === 'undo') return undo();
  const free = Object.keys(tb.bets).filter(s => !locked(s));
  if (!free.length && k !== 'max') return flash(Object.keys(tb.bets).length ? 'No more bets' : 'No chips on the table');
  const ms = k === 'max' ? (tb.last && tb.bets[tb.last] !== undefined ? tb.last : tb.g.main || free[0]) : null;
  if (k === 'max' && !ms) return flash('Put a chip on a spot first');
  if (k === 'max' && locked(ms)) return flash('No more bets');
  save();
  if (k === 'clear') { for (const s of free) delete tb.bets[s]; fit(); }
  else if (k === 'half') for (const s of free) { const v = Math.floor(tb.bets[s] / 2 / 10) * 10; if (v >= Gm.BET.min) tb.bets[s] = v; else if (s !== 'main') delete tb.bets[s]; }
  else if (k === 'dbl') { for (const s of free) tb.bets[s] *= 2; fit(); }
  else if (k === 'max') {
    const s = ms;
    tb.bets[s] = Math.max(Gm.BET.min, tb.maxBet - (stake() - (tb.bets[s] || 0))); tb.last = s; tb.adds[s] = now();
  }
  if (tb.bets.main !== undefined && tb.bets.main < minBet()) tb.bets.main = minBet();
  sfx('chip'); hand('press'); remember();
}
const need = () => flash(tb.g.needs || 'Put chips down first');

// ---------- Presses from the 3D parts ----------
// id: 'chip:1000' | 'spot:red' | 'rail:undo' | 'btn:deal' | 'btn:auto:2' | 'scr' (uv: the touch screen point)
// alt: right-click (take the chips on a spot back).
export function press(id, uv, alt) {
  if (!tb || !id) return false;
  const i = id.indexOf(':'), kind = i < 0 ? id : id.slice(0, i), arg = i < 0 ? '' : id.slice(i + 1);
  tb.pressed = { id, t: now() };
  if (kind === 'chip') { const v = +arg; if (v > tb.maxBet) return flash('Over the max bet'), true; chip = v; sfx('chip'); hand('press'); }
  else if (kind === 'spot') { if (alt) takeBack(arg); else dropChip(arg); }
  else if (kind === 'rail') rail(arg);
  else if (kind === 'btn') { if (tb.g.press) tb.g.press(arg); }
  else if (kind === 'scr' && uv) screenTap(uv.x, 1 - uv.y);
  else return false;
  return true;
}
function screenTap(x, y) {
  const g = tb.g;
  for (const b of g.ui ? g.ui() : []) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
    if (b.on === false) return flash(b.off || 'Not now');
    hand('press'); sfx('click'); g.tapUI(b.id); return;
  }
  if (g.tap) g.tap(x, y);
}
// What the crosshair says over a part: { label, on }.
export function partInfo(id, uv) {
  if (!tb || !id) return null;
  const i = id.indexOf(':'), kind = i < 0 ? id : id.slice(0, i), arg = i < 0 ? '' : id.slice(i + 1), g = tb.g;
  if (kind === 'chip') { const v = +arg; return { label: S(v) + ' CHIP' + (v === chip ? ' · IN HAND' : ''), on: v <= tb.maxBet }; }
  if (kind === 'spot') {
    const a = (g.show ? g.show() : tb.bets)[arg], lk = locked(arg);
    return { label: (g.spotLabel ? g.spotLabel(arg) : 'BET') + (a ? ' · ' + S(a) + ' ON IT' : ' · DROP ' + S(chipNow())) + (lk ? ' · NO MORE BETS' : ''), on: !lk };
  }
  if (kind === 'rail') return { label: { undo: 'UNDO · YOUR LAST CHIP', clear: 'CLEAR · TAKE YOUR CHIPS BACK', half: '½ · HALVE YOUR BETS', dbl: '×2 · DOUBLE YOUR BETS', max: 'MAX · ' + S(tb.maxBet) }[arg], on: true };
  if (kind === 'btn') return { label: g.label ? g.label(arg) : arg.toUpperCase(), on: g.on ? !!g.on(arg) : true };
  if (kind === 'scr' && uv) {
    const x = uv.x, y = 1 - uv.y;
    for (const b of g.ui ? g.ui() : []) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { label: b.tip || b.label, on: b.on !== false };
    return g.tapLabel ? g.tapLabel(x, y) : null;
  }
  return null;
}
// The chip in hand, never over the max bet.
const chipNow = () => chip <= tb.maxBet ? chip : CHIPS.filter(v => v <= tb.maxBet).pop() || CHIPS[0];
// The mouse wheel walks through the chips.
export function cycleChip(dir) {
  if (!tb || tb.g.noChips) return;
  const ok = CHIPS.filter(v => v <= tb.maxBet), i = ok.indexOf(chipNow());
  const v = ok[Math.max(0, Math.min(ok.length - 1, i + dir))];
  if (v !== undefined && v !== chip) { chip = v; sfx('chip'); }
}
// The table bar's buttons: [label, tone]. Tones: go (green), red, blue, violet, gold, plain.
const BTN = { deal: ['DEAL', 'go'], hit: ['HIT', 'go'], stand: ['STAND', 'red'], double: ['DOUBLE', 'blue'], split: ['SPLIT', 'violet'], spin: ['SPIN', 'go'],
  roll: ['ROLL', 'go'], drop: ['DROP', 'go'], start: ['START', 'go'], cash: ['CASH OUT', 'gold'], bet: ['BET', 'go'], flip: ['FLIP', 'go'], take: ['TAKE', 'gold'],
  lever: ['SPIN', 'go'], betdn: ['BET −', 'plain'], betup: ['BET +', 'plain'], maxbet: ['MAX BET', 'plain'], auto: ['AUTO', 'plain'], autonext: ['AUTO', 'plain'] };
// Everything the table bar shows (main.js draws it): the chips, the tools, the game's buttons, a status line, the
// last result, a short notice and the chip you just put down.
export function tableBar() {
  if (!tb || tb.game === 'vip') return null;
  const g = tb.g, sh = g.show ? g.show() : tb.bets; let tot = 0; for (const k in sh) tot += sh[k];
  const cn = chipNow(), t = now();
  const acts = (g.bar || g.btns).map(id => {
    const [label, tone] = BTN[id] || [id.toUpperCase(), 'plain'];
    return { id: 'btn:' + id, label: g.short ? g.short(id) || label : label, tone, on: g.on ? !!g.on(id) : true, sel: !!(g.sel && g.sel(id)), tip: g.label ? g.label(id) : label };
  });
  const anyLocked = Object.keys(sh).some(k => locked(k)) || (g.locked && g.locked());
  const go = acts.find(a => a.tone === 'go');
  const status = (g.status && g.status()) || (anyLocked ? 'NO MORE BETS' : stake() >= minBet() ? 'BET READY · PRESS ' + (go ? go.label : 'PLAY') : g.main ? 'CLICK THE BET CIRCLE TO PUT CHIPS DOWN' : 'CLICK THE LAYOUT TO PLACE YOUR CHIPS');
  return { game: tb.game, total: S(tot), max: S(tb.maxBet), status, acts, res: tb.res, flash: tb.flash && t - tb.flash.t < 1.8 ? tb.flash.text : '',
    chips: g.noChips ? null : CHIPS.map((v, i) => ({ v, i, label: chipLabel(v), on: v <= tb.maxBet, sel: v === cn })),
    tools: g.noChips ? null : [['rail:undo', 'UNDO', 'blue'], ['rail:clear', 'CLEAR', 'red'], ['rail:dbl', '×2', 'plain'], ['rail:max', 'MAX', 'plain']].map(([id, label, tone]) => ({ id, label, tone,
      on: !anyLocked && (id === 'rail:undo' ? tb.undo.length > 0 : id === 'rail:max' || tot > 0), tip: partInfo(id).label })),
    placed: tb.placed && t - tb.placed.t < 1.4 ? { amt: money(tb.placed.amt), k: tb.placed.t } : null,
    hist: tb.game === 'roulette' ? rlHist.slice(0, 10) : null };
}

// What the 3D table shows: the screens' painter state (view), the chips on the felt, the buttons' lights.
export function tableView() {
  if (!tb) return null;
  const g = tb.g, on = {};
  for (const b of g.btns || []) on[b] = g.on ? !!g.on(b) : true;
  return { game: tb.game, seat: tb.seat, tier: tb.tier, view: tb.view, chip: chipNow(), maxBet: tb.maxBet, on, stacks: stacks(), hist: rlHist,
    ui: g.ui ? g.ui() : null, extra: g.extra ? g.extra() : null, pressed: tb.pressed };
}
const k01 = x => Math.max(0, Math.min(1, x));
// Chip stacks: { spot, amount, slot (0 on the spot, 1 the payout beside it), anim: '' | 'sweep' | 'collect' | 'drop', u, add }
function stacks() {
  const out = [], t = now(), fx = tb.fx, u = fx ? t - fx.t0 : 0, sh = tb.g.show ? tb.g.show() : tb.bets;
  const seen = new Set();
  for (const spot in sh) {
    const a = sh[spot]; seen.add(spot);
    const r = fx && fx.per[spot];
    if (!r) { if (a > 0) out.push({ spot, amount: a, slot: 0, anim: '', u: 0, add: tb.adds[spot] || 0 }); continue; }
    pushFx(out, spot, a, r, u);
  }
  if (fx) for (const spot in fx.per) if (!seen.has(spot)) pushFx(out, spot, 0, fx.per[spot], u);
  return out;
}
function pushFx(out, spot, a, r, u) {
  const net = r.back - r.stake;
  if (net < 0) { // the dealer sweeps the chips, then your bet goes back down for the next round
    if (u < 1.0) out.push({ spot, amount: r.stake, slot: 0, anim: 'sweep', u: k01((u - 0.5) / 0.5) });
    else if (u > 1.9 && a > 0) out.push({ spot, amount: a, slot: 0, anim: 'drop', u: k01((u - 1.9) / 0.3) });
    if (r.back > 0 && u > 0.3 && u < 2.0) out.push({ spot, amount: r.back, slot: 1, anim: u > 1.5 ? 'collect' : 'drop', u: u > 1.5 ? k01((u - 1.5) / 0.5) : k01((u - 0.3) / 0.25) });
  } else {
    if (a > 0) out.push({ spot, amount: a, slot: 0, anim: '', u: 0 });
    if (net > 0 && u < 2.0) out.push({ spot, amount: net, slot: 1, anim: u > 1.5 ? 'collect' : 'drop', u: u > 1.5 ? k01((u - 1.5) / 0.5) : k01((u - 0.3) / 0.25) });
  }
}

// ---------- Each game ----------
// main: the one betting spot (machines, blackjack); spots in RL_SPOTS etc. come as 'spot:<id>'.
// btns: physical buttons ('btn:<id>'); on(id), label(id), press(id). ui(): touch-screen buttons in 0..1 screen
// units, tapUI(id); tap(x, y) for the rest of the screen. show(): the chips to draw when they differ from the bets.
const GAMES = {
  vip: { btns: [] },

  bj: {
    main: 'main', btns: ['deal', 'hit', 'stand', 'double', 'split'], needs: 'Put chips in your betting circle first',
    init() { tb.s = null; },
    locked() { return !!(tb.s && !tb.s.over); },
    spotLabel: () => 'BETTING CIRCLE',
    on(id) { const s = tb.s; if (id === 'deal') return !(s && !s.over) && stake() >= minBet(); return !!(s && Gm.bjCan(s)[id]); },
    label(id) {
      const s = tb.s, live = s && !s.over;
      if (id === 'deal') return live ? 'DEAL · HAND IN PLAY' : 'DEAL · ' + S(stake());
      if (!live) return id.toUpperCase();
      const tip = Gm.bjAdvice(s) === id ? ' · THE BOOK SAYS SO' : '', t = Gm.bjTotal(s.hands[s.i].cards).t;
      return id.toUpperCase() + (id === 'double' ? ' · ' + S(tb.bet) + ' MORE' : id === 'split' ? ' · ' + S(tb.bet) + ' MORE' : ' · YOU HAVE ' + t) + tip;
    },
    press(id) {
      const s = tb.s;
      if (id === 'deal') {
        if (!this.on('deal')) return s && !s.over ? flash('Finish this hand first') : need();
        tb.bet = stake(); tb.s = Gm.bjDeal(tb.bet); hand('press'); sfx('card'); later(0.14, () => sfx('card')); later(0.28, () => sfx('flip')); result(''); this.sync(); if (tb.s.over) this.finish(); return;
      }
      if (!s || s.over) return flash('Deal first');
      if (!this.on(id)) return flash("Can't " + id + ' now');
      Gm.bjAct(s, id); hand('press'); sfx(id === 'double' || id === 'split' ? 'chips' : id === 'hit' ? 'card' : 'click'); if (id === 'double' || id === 'split') later(0.15, () => sfx('card')); this.sync(); if (s.over) this.finish();
    },
    sync() { const s = tb.s; tb.view = s ? { dealer: s.dealer, hide: !s.over, hands: s.hands.map((h, i) => ({ cards: h.cards, active: !s.over && i === s.i, bet: h.bet })) } : null; },
    abandon() {
      const s = tb.s; if (!s || s.over) return;
      for (let i = 0; i < 40 && !s.over; i++) { const a = Gm.bjAdvice(s); Gm.bjAct(s, Gm.bjCan(s)[a] ? a : 'stand'); }
      this.finish();
    },
    finish() { const s = tb.s, b = tb.bet; this.sync(); pay(b * s.staked, b * s.mult, s.lines.join(' '), { main: { stake: b * s.staked, back: b * s.mult } }); },
    show() { const s = tb.s; return s && !s.over ? { main: tb.bet * s.hands.reduce((a, h) => a + h.bet, 0) } : tb.bets; }, // doubles and splits add units
    status() {
      const s = tb.s; if (!s || s.over) return null;
      const h = Gm.bjTotal(s.hands[s.i].cards), up = s.dealer[0];
      return `YOU HAVE ${h.soft && h.t < 21 ? 'SOFT ' : ''}${h.t}${s.hands.length > 1 ? ' (HAND ' + (s.i + 1) + ')' : ''} · DEALER SHOWS ${up.rank === 'A' ? 'AN ACE' : Gm.bjTotal([up]).t}`;
    },
  },

  roulette: {
    btns: ['spin'], needs: 'Put chips on the layout first',
    init() { tb.spinning = false; },
    locked() { return tb.spinning; },
    spotLabel(id) {
      if (id[0] === 'n') { const n = +id.slice(1); return (n === 0 ? '0 GREEN' : n + (RL_RED.has(n) ? ' RED' : ' BLACK')) + ' · 36x'; }
      const b = Gm.RL_BETS[id] || Gm.RL_COLS[id];
      return (id[0] === 'c' ? '2 TO 1 · ' : '') + b.label.toUpperCase() + ' · ' + b.pays + 'x';
    },
    on() { return !tb.spinning && stake() >= Gm.BET.min; },
    label() { return tb.spinning ? 'NO MORE BETS' : 'SPIN · ' + S(stake()) + ' ON THE TABLE'; },
    press() {
      if (!this.on()) return tb.spinning ? flash('No more bets') : need();
      const snap = { ...tb.bets }, bets = {};
      for (const k in snap) bets[k[0] === 'n' ? k.slice(1) : k] = snap[k];
      const lucky = Gm.rlLucky(), n = Gm.rlBall(), st = stake();
      tb.view = { spin: { t0: now(), dur: 4, n, lucky } }; tb.spinning = true; hand('press'); sfx('rouletteSpin'); later(3.2, () => sfx('ballDrop'));
      result('No more bets. Lucky: ' + lucky.map(l => `${l.n} (${l.x}x)`).join(', '));
      later(4, () => {
        tb.spinning = false;
        const per = {};
        for (const k in snap) per[k] = { stake: snap[k], back: snap[k] * Gm.rlMult(k[0] === 'n' ? +k.slice(1) : k, n, lucky) };
        rlHist.unshift(n); rlHist.length = Math.min(rlHist.length, 12);
        const col = n === 0 ? 'green' : RL_RED.has(n) ? 'red' : 'black', L = lucky.find(l => l.n === n);
        const onIt = Object.keys(snap).some(k => { const b = k[0] === 'n' ? +k.slice(1) : k; return snap[k] > 0 && Gm.rlMult(b, n, lucky) > Gm.rlMult(b, n, []); }); // a bet that the lucky number paid extra
        pay(st, Gm.rlSettle(bets, n, lucky), `${n} ${col}.${L ? (onIt ? ' LUCKY ' + L.x + 'x!' : ` It was lucky (${L.x}x), with no chip on it.`) : ''}`, per);
      });
    },
    extra() { const sp = tb.view && tb.view.spin; return sp ? { lucky: sp.lucky, n: now() - sp.t0 >= sp.dur ? sp.n : null } : null; },
    status() { return tb.spinning ? 'NO MORE BETS · THE BALL IS ROLLING' : stake() < Gm.BET.min ? 'CLICK THE LAYOUT TO BET · LUCKY NUMBERS PAY UP TO 500x' : null; },
  },

  slots: {
    main: 'main', btns: ['lever', 'betdn', 'betup', 'maxbet', 'auto'], bar: ['betdn', 'betup', 'maxbet', 'auto', 'lever'], noChips: true,
    short(id) { return id === 'auto' ? (tb.auto ? 'AUTO ON' : 'AUTO') : null; },
    status() { return tb.busy ? 'GOOD LUCK' : `BET ${S(stake())} · PULL THE LEVER OR PRESS SPIN`; },
    init() { tb.auto = false; tb.busy = false; tb.view = { tier: tb.tier }; },
    locked() { return tb.busy; },
    on(id) { return id === 'auto' ? true : !tb.busy; },
    label(id) {
      const b = S(stake());
      return { lever: tb.busy ? 'SPINNING' : 'PULL THE LEVER · ' + b, betdn: 'BET − · NOW ' + b, betup: 'BET + · NOW ' + b, maxbet: 'MAX BET · ' + S(tb.maxBet), auto: 'AUTO SPIN · ' + (tb.auto ? 'ON' : 'OFF') }[id];
    },
    press(id) {
      if (id === 'lever') return this.spin();
      if (id === 'auto') { tb.auto = !tb.auto; sfx('click'); hand('press'); if (tb.auto && !tb.busy) this.spin(); return; }
      if (tb.busy) return flash('Wait for the reels');
      const lad = [...new Set([minBet(), ...LADDER.filter(v => v > minBet() && v < tb.maxBet), tb.maxBet])], cur = stake();
      if (id === 'maxbet') tb.bets.main = tb.maxBet;
      else if (id === 'betup') tb.bets.main = lad.find(v => v > cur) || tb.maxBet;
      else tb.bets.main = [...lad].reverse().find(v => v < cur) || minBet();
      sfx('chip'); hand('press'); remember();
    },
    spin() {
      if (!tb || tb.game !== 'slots' || tb.busy || tb.closing) return;
      const bet = stake(); if (bet < minBet()) return need();
      const r = Gm.slotSpin(tb.tier);
      tb.view = { tier: tb.tier, reels: r.reels, spin: { t0: now() }, win: null, bet }; tb.busy = true; hand('pull'); sfx('lever'); sfx('reels');
      for (let i = 0; i < 3; i++) later(0.9 + i * 0.35, () => sfx('reelStop'));
      later(1.75, () => {
        tb.busy = false; tb.view.win = r.mult > 0 ? `${r.line.toUpperCase()} ${P.xfmt(r.mult)}` : null;
        pay(bet, bet * r.mult, r.line);
        if (tb.auto) later(0.7, () => this.spin());
      });
    },
    extra() { return { auto: tb.auto, bet: stake(), pull: tb.view && tb.view.spin ? tb.view.spin.t0 : -9 }; },
  },

  plinko: {
    main: 'main', btns: ['risk:low', 'risk:medium', 'risk:high', 'drop'],
    init() { tb.risk = 'medium'; tb.balls = []; tb.hist = []; tb.view = { risk: tb.risk, balls: tb.balls }; },
    spotLabel: () => 'BET',
    // balls still falling, and what is riding on them (all of it together stays under the table max)
    busy: () => tb.balls.some(b => !b.done),
    riding: () => tb.balls.reduce((a, b) => a + (b.done ? 0 : b.bet), 0),
    on(id) { if (id.startsWith('risk:')) return !this.busy() || tb.risk === id.slice(5); return stake() >= minBet() && this.riding() + stake() <= tb.maxBet; },
    sel(id) { return id === 'risk:' + tb.risk; },
    short(id) { return id.startsWith('risk:') ? { low: 'LOW', medium: 'MED', high: 'HIGH' }[id.slice(5)] : null; },
    label(id) { if (id.startsWith('risk:')) { const k = id.slice(5); return cap(k) + ' risk · edges pay ' + Gm.PLINKO[k][0] + 'x'; } return 'DROP A BALL · ' + S(stake()); },
    press(id) {
      if (id.startsWith('risk:')) { if (this.busy() && tb.risk !== id.slice(5)) return flash('Wait for the balls to land'); tb.risk = id.slice(5); tb.view.risk = tb.risk; sfx('click'); return; }
      const bet = stake(); if (bet < minBet()) return need();
      if (this.riding() + bet > tb.maxBet) return flash('Table max ' + S(tb.maxBet) + ': wait for a ball to land');
      const r = Gm.plinkoDrop(tb.risk), b = { path: r.path, t0: now(), bet };
      tb.balls.push(b); hand('press'); sfx('click');
      for (let i = 1; i <= Gm.PLINKO_ROWS; i++) later(i * P.PLINKO_ROW_T, () => sfx('peg'));
      later(Gm.PLINKO_ROWS * P.PLINKO_ROW_T + 0.05, () => {
        tb.hist.unshift(P.xfmt(r.mult)); tb.hist.length = Math.min(tb.hist.length, 6); b.done = true;
        pay(bet, bet * r.mult, P.xfmt(r.mult) + '.');
        later(0.6, () => { const i = tb.balls.indexOf(b); if (i >= 0) tb.balls.splice(i, 1); });
      });
    },
    extra() { return { risk: tb.risk, hist: tb.hist }; },
    status() { return stake() >= minBet() ? `${tb.risk.toUpperCase()} RISK · EDGES PAY ${Gm.PLINKO[tb.risk][0]}x · DROP AS MANY BALLS AS YOU LIKE` : null; },
  },

  mines: {
    main: 'main', btns: ['start', 'cash'],
    init() { tb.m = 3; tb.s = null; },
    locked() { return !!(tb.s && !tb.s.over); },
    spotLabel: () => 'BET',
    on(id) { const live = tb.s && !tb.s.over; return id === 'start' ? !live && stake() >= minBet() : !!(live && tb.s.open.length); },
    label(id) {
      const s = tb.s, live = s && !s.over, k = s ? s.open.length : 0;
      if (id === 'start') return live ? 'IN PLAY · TAP THE TILES' : `START · ${S(stake())} · ${tb.m} MINE${tb.m > 1 ? 'S' : ''}`;
      return live && k ? 'CASH OUT ' + S(tb.bet * Gm.minesMult(tb.m, k)) : 'CASH OUT · FIND A GEM FIRST';
    },
    press(id) {
      const s = tb.s, live = s && !s.over;
      if (id === 'start') { if (live) return flash('Tap the tiles on the screen'); if (stake() < minBet()) return need(); tb.bet = stake(); tb.s = Gm.minesNew(tb.m); hand('press'); sfx('click'); result(''); this.sync(); return; }
      if (!live || !s.open.length) return flash('Find a gem first');
      Gm.minesCash(s); hand('press'); pay(tb.bet, tb.bet * s.mult, `Cashed out at ${P.xfmt(s.mult)}.`, { main: { stake: tb.bet, back: tb.bet * s.mult } }); this.sync();
    },
    pick(i) {
      const s = tb.s; if (!s || s.over || s.open.includes(i)) return;
      Gm.minesPick(s, i); hand('press');
      if (s.dead) { sfx('mine'); pay(tb.bet, 0, 'BOOM.', { main: { stake: tb.bet, back: 0 } }); }
      else if (s.over) pay(tb.bet, tb.bet * s.mult, 'Cleared the board!', { main: { stake: tb.bet, back: tb.bet * s.mult } });
      else sfx('gem');
      this.sync();
    },
    sync() { const s = tb.s, k = s ? s.open.length : 0; tb.view = s ? { m: tb.m, open: s.open, mines: s.mines, over: s.over, dead: s.dead, mult: s.dead ? 0 : Gm.minesMult(tb.m, k), next: Gm.minesMult(tb.m, k + 1) } : null; },
    tile(x, y) { // the painter's grid (paint.js paintMines) on the 512 x 320 console screen
      const w = 512, h = 320, sz = Math.min(w * 0.62, h * 0.86) / 5, x0 = w * 0.05, y0 = (h - sz * 5) / 2;
      const cx = Math.floor((x * w - x0) / sz), cy = Math.floor((y * h - y0) / sz);
      return cx >= 0 && cx < 5 && cy >= 0 && cy < 5 ? cy * 5 + cx : -1;
    },
    tap(x, y) { const i = this.tile(x, y); if (i >= 0) { if (tb.s && !tb.s.over) this.pick(i); else flash('Press START first'); } },
    tapLabel(x, y) {
      const i = this.tile(x, y); if (i < 0) return null;
      const live = tb.s && !tb.s.over;
      return { label: live ? (tb.s.open.includes(i) ? 'OPEN' : `TILE ${i + 1} · NEXT GEM ${P.xfmt(Gm.minesMult(tb.m, tb.s.open.length + 1))}`) : 'PRESS START FIRST', on: !!live && !tb.s.open.includes(i) };
    },
    ui() {
      if (tb.s && !tb.s.over) return [{ id: 'rand', x: 0.71, y: 0.79, w: 0.27, h: 0.17, label: 'RANDOM', tip: 'A RANDOM TILE' }];
      // in the side panel, clear of the board so the last round's mines stay visible
      return [1, 3, 5, 10, 20, 24].map((n, i) => ({ id: 'm:' + n, x: 0.7 + (i % 3) * 0.097, y: 0.66 + Math.floor(i / 3) * 0.165, w: 0.088, h: 0.145, label: String(n), sel: tb.m === n,
        tip: `${n} MINE${n > 1 ? 'S' : ''} · FIRST GEM ${P.xfmt(Gm.minesMult(n, 1))} · UP TO ${P.xfmt(Gm.minesMult(n, Math.min(25 - n, 24)))}` }));
    },
    abandon() { // a board you walk away from: one random tile if none is open yet, then cash out what it found
      const s = tb.s; if (!s || s.over) return;
      if (!s.open.length) { const free = [...Array(25).keys()]; this.pick(free[Math.floor(Math.random() * free.length)]); }
      if (!s.over && s.open.length) this.press('cash');
    },
    status() { const s = tb.s; return s && !s.over ? (s.open.length ? `NEXT GEM ${P.xfmt(Gm.minesMult(tb.m, s.open.length + 1))} · OR CASH OUT ${S(tb.bet * Gm.minesMult(tb.m, s.open.length))}` : 'PICK A TILE ON THE SCREEN') : null; },
    tapUI(id) {
      if (id === 'rand') { const free = [...Array(25).keys()].filter(i => !tb.s.open.includes(i)); return this.pick(free[Math.floor(Math.random() * free.length)]); }
      tb.m = +id.split(':')[1];
      tb.view = { m: tb.m, open: [], mines: null, over: false, dead: false, mult: 1, next: Gm.minesMult(tb.m, 1) }; // a fresh board for the new count
    },
  },

  tower: {
    main: 'main', btns: ['start', 'cash'],
    init() { tb.mode = 'medium'; tb.s = null; },
    locked() { return !!(tb.s && !tb.s.over); },
    spotLabel: () => 'BET',
    on(id) { const live = tb.s && !tb.s.over; return id === 'start' ? !live && stake() >= minBet() : !!(live && tb.s.row); },
    label(id) {
      const s = tb.s, live = s && !s.over;
      if (id === 'start') return live ? 'CLIMBING · TAP AN EGG' : `CLIMB · ${S(stake())} · ${Gm.TOWER.modes[tb.mode].label.toUpperCase()}`;
      return live && s.row ? 'CASH OUT ' + S(tb.bet * Gm.towerMult(tb.mode, s.row)) : 'CASH OUT · CLIMB A FLOOR FIRST';
    },
    press(id) {
      const s = tb.s, live = s && !s.over;
      if (id === 'start') { if (live) return flash('Tap an egg on the screen'); if (stake() < minBet()) return need(); tb.bet = stake(); tb.s = Gm.towerNew(tb.mode); hand('press'); sfx('click'); result(''); this.sync(); return; }
      if (!live || !s.row) return flash('Climb a floor first');
      Gm.towerCash(s); hand('press'); pay(tb.bet, tb.bet * s.mult, `Cashed out at ${P.xfmt(s.mult)}.`, { main: { stake: tb.bet, back: tb.bet * s.mult } }); this.sync();
    },
    egg(x) { const s = tb.s, eggs = s ? s.eggs : Gm.TOWER.modes[tb.mode].eggs, e = Math.floor((x - 0.04) / (0.6 / eggs)); return x >= 0.04 && e >= 0 && e < eggs ? e : -1; },
    // Any tap in an egg's column picks that egg on the floor you are on (the rows are thin on a phone).
    tap(x) {
      const s = tb.s; if (!s || s.over) return flash('Press CLIMB first');
      const e = this.egg(x); if (e < 0) return;
      Gm.towerPick(s, e); hand('press');
      if (s.dead) { sfx('boom'); pay(tb.bet, 0, 'A dragon!', { main: { stake: tb.bet, back: 0 } }); }
      else if (s.over) pay(tb.bet, tb.bet * s.mult, 'Top of the tower!', { main: { stake: tb.bet, back: tb.bet * s.mult } });
      else sfx('step');
      this.sync();
    },
    tapLabel(x) { const e = this.egg(x); if (e < 0) return null; const live = tb.s && !tb.s.over; return { label: live ? `EGG ${e + 1} · FLOOR ${tb.s.row + 1} PAYS ${P.xfmt(Gm.towerMult(tb.mode, tb.s.row + 1))}` : 'PRESS CLIMB FIRST', on: !!live }; },
    sync() { const s = tb.s; tb.view = s ? { mode: tb.mode, eggs: s.eggs, row: s.row, picks: s.picks, rows: s.rows, over: s.over, dead: s.dead, mult: s.mult } : null; },
    short(id) { return id === 'start' ? 'CLIMB' : null; },
    abandon() { // a climb you walk away from: one random egg if you haven't climbed yet, then cash out
      const s = tb.s; if (!s || s.over) return;
      if (!s.row) this.tap(0.04 + (Math.floor(Math.random() * s.eggs) + 0.5) * 0.6 / s.eggs); // the middle of an egg's column (egg())
      if (!s.over && s.row) this.press('cash');
    },
    status() { const s = tb.s; return s && !s.over ? `FLOOR ${s.row + 1} PAYS ${P.xfmt(Gm.towerMult(tb.mode, s.row + 1))} · PICK AN EGG` + (s.row ? ` OR CASH OUT ${S(tb.bet * Gm.towerMult(tb.mode, s.row))}` : '') : null; },
    ui() {
      if (tb.s && !tb.s.over) return [];
      return Object.entries(Gm.TOWER.modes).map(([k, M], i) => ({ id: 'mode:' + k, x: 0.775, y: 0.56 + i * 0.086, w: 0.21, h: 0.076, label: M.label.toUpperCase(), sel: tb.mode === k,
        tip: `${M.label.toUpperCase()} · ${M.eggs} EGGS, ${M.dragons} DRAGON${M.dragons > 1 ? 'S' : ''} · TOP PAYS ${P.xfmt(Gm.towerMult(k, Gm.TOWER.rows))}` }));
    },
    tapUI(id) { // a fresh tower for the new mode, its multipliers up the side
      tb.mode = id.split(':')[1];
      tb.view = { mode: tb.mode, eggs: Gm.TOWER.modes[tb.mode].eggs, row: 0, picks: [], rows: null, over: true, dead: false, mult: 1 };
    },
  },

  coin: {
    excl: true, btns: ['flip', 'take'], needs: 'Put chips on HEADS or TAILS first',
    init() { tb.pot = 0; tb.flying = false; tb.side = null; },
    locked() { return tb.flying || tb.pot > 0; }, // a ride in progress: the layout under the pot can't change
    spotLabel: id => id.toUpperCase() + ' · 2x · 51% LUCKY COIN',
    side() { return tb.pot ? tb.side : Object.keys(tb.bets).find(k => tb.bets[k] > 0); },
    // In a ride, tapping the other side just moves your call.
    spotPress(id) { if (!tb.pot) return false; if (!tb.flying) { tb.side = id; sfx('chip'); hand('press'); } return true; },
    on(id) { return id === 'flip' ? !tb.flying && (tb.pot > 0 || stake() >= minBet()) : !tb.flying && tb.pot > 0; },
    label(id) {
      const side = this.side();
      if (id === 'take') return tb.pot ? 'TAKE ' + S(tb.pot) : 'TAKE · WIN A FLIP FIRST';
      return tb.pot ? `FLIP · DOUBLE ${S(tb.pot)} ON ${side.toUpperCase()}` : side ? `FLIP · ${S(stake())} ON ${side.toUpperCase()}` : 'FLIP';
    },
    press(id) {
      if (id === 'take') return this.take();
      if (!this.on('flip')) return tb.flying ? null : need();
      const call = this.side();
      if (!tb.pot) { tb.bet = stake(); tb.side = call; result(''); }
      const r = Gm.coinFlip(call); tb.flying = true;
      tb.view = { flip: { t0: now(), side: r.side } }; hand('press'); sfx('coinFlip');
      later(1.25, () => {
        tb.flying = false;
        if (!r.win) { const lost = tb.pot || tb.bet; tb.pot = 0; tb.ride = 0; pay(tb.bet, 0, cap(r.side) + '.', { [call]: { stake: lost, back: 0 } }); }
        else { tb.pot = (tb.pot || tb.bet) * 2; tb.ride = (tb.ride || 0) + 1; result(`${cap(r.side)}! Pot ${money(tb.pot)}. Flip again or TAKE it.`, 'win'); sfx('coin'); if (tb.ride >= Gm.COIN.maxRide) this.take(); }
      });
    },
    abandon() { this.take(); },
    take() { if (!tb.pot || tb.flying) return; const p = tb.pot, side = tb.side; tb.pot = 0; tb.ride = 0; hand('press'); pay(tb.bet, p, 'Took it.', { [side]: { stake: tb.bet, back: p } }); },
    show() { return tb.pot ? { [tb.side]: tb.pot } : tb.bets; },
    status() { return tb.flying ? 'IN THE AIR' : tb.pot ? `POT ${S(tb.pot)} ON ${tb.side.toUpperCase()} · FLIP TO DOUBLE IT OR TAKE IT` : null; },
  },

  wheel: {
    main: 'main', btns: ['spin'],
    init() { tb.busy = false; },
    locked() { return tb.busy; },
    spotLabel: () => 'BET · 17 PRIZES ON 50 SLOTS',
    on() { return !tb.busy && stake() >= minBet(); },
    label() { return tb.busy ? 'SPINNING' : 'SPIN THE WHEEL · ' + S(stake()); },
    press() {
      if (!this.on()) return tb.busy ? null : need();
      const bet = stake(), r = Gm.wheelSpin(), t = now(), a = P.wheelAngle(tb.view, t), TAU = Math.PI * 2;
      tb.view = { spin: { t0: t, from: ((a % TAU) + TAU) % TAU, to: r.i, dur: 5 } }; tb.busy = true; hand('pull'); sfx('wheelSpin'); result('');
      later(5, () => { tb.busy = false; pay(bet, bet * r.mult, r.mult ? P.xfmt(r.mult) + '!' : 'Blank.', { main: { stake: bet, back: bet * r.mult } }); });
    },
    extra() { return { pull: tb.view && tb.view.spin ? tb.view.spin.t0 : -9 }; },
  },

  dice: {
    btns: ['roll'], needs: 'Put chips on the PASS LINE or the FIELD first',
    init() { tb.s = null; tb.rolling = false; },
    locked(spot) { return tb.rolling || (spot === 'pass' && !!(tb.s && !tb.s.over)); },
    spotLabel: id => id === 'pass' ? 'PASS LINE · 2x · 7 11 12 WIN' : 'FIELD · ONE ROLL · 3 4 9 10 11 PAY 2x · 2 12 PAY 5x',
    on() { return !tb.rolling && (!!(tb.s && !tb.s.over) || stake() >= Gm.BET.min); },
    label() { const live = tb.s && !tb.s.over; return tb.rolling ? 'ROLLING' : live ? 'ROLL FOR ' + tb.s.point : 'ROLL · ' + S(stake()) + ' DOWN'; },
    press() {
      if (!this.on()) return tb.rolling ? null : need();
      const live = !!(tb.s && !tb.s.over), passB = live ? tb.passBet : tb.bets.pass || 0, fieldB = tb.bets.field || 0;
      let d;
      if (live || passB) { if (!live) { tb.s = Gm.passNew(); tb.passBet = passB; } Gm.passRoll(tb.s); d = tb.s.rolls[tb.s.rolls.length - 1]; }
      else d = Gm.roll2();
      const tot = d[0] + d[1], s = live || passB ? tb.s : null;
      tb.rolling = true; tb.view = { roll: { t0: now(), dice: d } }; hand('throw'); sfx('diceRoll');
      later(0.95, () => {
        tb.rolling = false;
        let st = 0, back = 0; const per = {};
        if (fieldB) { const m = Gm.fieldMult(tot); st += fieldB; back += fieldB * m; per.field = { stake: fieldB, back: fieldB * m }; }
        if (s && s.over) { st += tb.passBet; back += tb.passBet * s.mult; per.pass = { stake: tb.passBet, back: tb.passBet * s.mult }; }
        const line = s ? s.line : tot + '.';
        if (st) pay(st, back, (fieldB && !(s && s.over) ? tot + (Gm.fieldMult(tot) ? ' on the field.' : ', the field loses.') + ' ' : '') + line, per); else result(line);
      });
    },
    show() { return tb.s && !tb.s.over ? { ...tb.bets, pass: tb.passBet } : tb.bets; },
    extra() { return { point: tb.s && !tb.s.over ? tb.s.point : 0 }; },
    abandon() { // a pass-line point still open rolls out
      const s = tb.s; if (!s || s.over) return;
      for (let i = 0; i < 400 && !s.over; i++) Gm.passRoll(s);
      pay(tb.passBet, tb.passBet * s.mult, s.line, { pass: { stake: tb.passBet, back: tb.passBet * s.mult } });
    },
    status() { return tb.rolling ? 'DICE ARE ROLLING' : tb.s && !tb.s.over ? `THE POINT IS ${tb.s.point} · ROLL IT AGAIN BEFORE A 7` : null; },
  },

  crash: {
    main: 'main', btns: ['bet', 'cash', ...CRASH_AUTOS.map(a => 'auto:' + a)], bar: ['autonext', 'bet', 'cash'],
    short(id) { return id === 'autonext' ? 'AUTO ' + (crashAuto ? crashAuto + 'x' : 'OFF') : null; },
    status() {
      const C = tb.cr.C, m = tb.cr.mine; if (!C) return null;
      if (C.phase === 'bet') return m ? `IN FOR ${S(m[1])} · LAUNCH IN ${Math.max(0, Math.ceil(Gm.CRASH.betTime - C.t))}s` : `BETS OPEN · ${Math.max(0, Math.ceil(Gm.CRASH.betTime - C.t))}s`;
      const out = m && m[2] ? `YOU CASHED OUT AT ${P.xfmt(m[2])} (+${S(m[1] * (m[2] - 1))}) · ` : '';
      if (C.phase === 'fly') return m && !m[2] ? `${P.xfmt(C.mult)} · CASH OUT ${S(m[1] * C.mult)}` : `${out}ROCKET AT ${P.xfmt(C.mult)}` + (out ? '' : ' · NEXT ONE SOON');
      return `${out}CRASHED AT ${P.xfmt(C.point)} · NEXT ROCKET SOON`;
    },
    init() { tb.cr = { key: '' }; },
    live(v) {
      const C = v.pub.crash, mine = C.bets.find(b => b[0] === tb.me) || null, cr = tb.cr;
      cr.C = C; cr.mine = mine;
      const key = C.round + ':' + (mine ? mine[2] ? 'out' : C.phase : '-');
      if (key === cr.key) return; cr.key = key;
      if (mine && mine[2]) { result(`Cashed out at ${P.xfmt(mine[2])}: +${money(mine[1] * (mine[2] - 1))}`, 'win'); tb.fx = { t0: now(), per: { main: { stake: mine[1], back: mine[1] * mine[2] } } }; }
      else if (mine && C.phase === 'boom') { result(`Crashed at ${P.xfmt(C.point)}. Lost ${money(mine[1])}.`, 'lose'); tb.fx = { t0: now(), per: { main: { stake: mine[1], back: 0 } } }; }
      else if (mine && C.phase === 'fly') result('Rocket away! Cash out before it blows.');
    },
    locked() { const m = tb.cr.mine; return !!(m && !m[2] && tb.cr.C.phase !== 'boom'); },
    spotLabel: () => 'BET ON THE NEXT ROCKET',
    on(id) {
      const C = tb.cr.C, m = tb.cr.mine; if (!C) return false;
      if (id === 'bet') return C.phase === 'bet' && !m && stake() >= minBet();
      if (id === 'cash') return C.phase === 'fly' && !!m && !m[2];
      if (id === 'autonext') return !m;
      return !m || C.phase !== 'fly';
    },
    label(id) {
      const C = tb.cr.C, m = tb.cr.mine;
      if (id === 'autonext') return crashAuto ? 'AUTO CASH-OUT AT ' + crashAuto + 'x · CLICK TO CHANGE' : 'AUTO CASH-OUT OFF · CLICK TO CHANGE';
      if (id.startsWith('auto:')) { const a = +id.slice(5); return (a ? 'AUTO CASH-OUT AT ' + a + 'x' : 'AUTO CASH-OUT OFF') + (crashAuto === a ? ' · SET' : ''); }
      if (id === 'cash') return m && !m[2] && C.phase === 'fly' ? 'CASH OUT ' + S(m[1] * C.mult) : 'CASH OUT · WHEN YOUR ROCKET FLIES';
      if (C.phase !== 'bet') return 'BET · NEXT ROCKET SOON';
      return m ? 'IN FOR ' + S(m[1]) : `BET ${S(stake())} ON THIS ROCKET · ${Math.max(0, Math.ceil(Gm.CRASH.betTime - C.t))}s`;
    },
    press(id) {
      const C = tb.cr.C, m = tb.cr.mine;
      if (id === 'autonext') { if (!this.on(id)) return flash('Auto is set for this rocket'); crashAuto = CRASH_AUTOS[(CRASH_AUTOS.indexOf(crashAuto) + 1) % CRASH_AUTOS.length]; sfx('click'); return; }
      if (id.startsWith('auto:')) { crashAuto = +id.slice(5); sfx('click'); hand('press'); return; }
      if (id === 'cash') { if (!this.on('cash')) return flash(m ? 'Already out' : 'You have no bet on this rocket'); tb.act('cashout'); hand('press'); sfx('cashout'); return; }
      if (!this.on('bet')) return flash(m ? "You're in" : C.phase !== 'bet' ? 'Bets open after this rocket' : 'Put chips down first');
      tb.act('crash', { bet: stake(), auto: crashAuto }); hand('press'); sfx('chip');
      result(`In for ${money(stake())}${crashAuto ? `, auto cash-out at ${crashAuto}x` : ''}. Wait for launch.`);
    },
    show() { const m = tb.cr.mine; return m && !m[2] && tb.cr.C.phase !== 'boom' ? { main: m[1] } : tb.bets; },
    extra() { return { auto: crashAuto, phase: tb.cr.C && tb.cr.C.phase }; },
  },

  race: {
    excl: true, btns: ['bet'], needs: 'Put chips on a duck lane first',
    init() { tb.rc = { key: '' }; },
    live(v) {
      const R = v.pub.race, mine = R.bets.find(b => b[0] === tb.me) || null, rc = tb.rc;
      rc.R = R; rc.mine = mine;
      const key = R.round + ':' + R.phase + ':' + (mine ? 1 : 0);
      if (key === rc.key) return; rc.key = key;
      if (mine && R.phase === 'show') {
        const won = R.winner === mine[1], back = won ? mine[2] * R.pays[mine[1]] : 0;
        result(won ? `${Gm.DUCKS[mine[1]].name} wins! +${money(back - mine[2])}` : `${Gm.DUCKS[R.winner].name} wins. Not this time.`, won ? 'win' : 'lose');
        tb.fx = { t0: now(), per: { ['duck' + mine[1]]: { stake: mine[2], back } } };
      } else if (mine && R.phase === 'run') result("They're off!");
    },
    locked() { const m = tb.rc.mine; return !!(m && tb.rc.R.phase !== 'show'); },
    spotLabel(id) { const i = +id.slice(4), R = tb.rc.R; return `${i + 1} ${Gm.DUCKS[i].name.toUpperCase()}` + (R ? ' · PAYS ' + P.xfmt(R.pays[i]) : ''); },
    on() { const R = tb.rc.R; return !!R && R.phase === 'bet' && !tb.rc.mine && stake() >= minBet(); },
    label() {
      const R = tb.rc.R, m = tb.rc.mine; if (!R) return 'BET';
      if (m) return `IN FOR ${S(m[2])} ON ${Gm.DUCKS[m[1]].name.toUpperCase()}`;
      if (R.phase !== 'bet') return 'BET · NEXT RACE SOON';
      const lane = Object.keys(tb.bets).find(k => tb.bets[k] > 0);
      return lane ? `BET ${S(stake())} ON ${Gm.DUCKS[+lane.slice(4)].name.toUpperCase()} · ${Math.max(0, Math.ceil(Gm.RACE.betTime - R.t))}s` : 'BET · CHIPS ON A LANE FIRST';
    },
    press() {
      if (!this.on()) return flash(tb.rc.mine ? "You're in" : tb.rc.R && tb.rc.R.phase !== 'bet' ? 'Bets open after this race' : this.needs);
      const lane = Object.keys(tb.bets).find(k => tb.bets[k] > 0);
      tb.act('race', { duck: +lane.slice(4), bet: stake() }); hand('press'); sfx('chip');
      result(`${money(stake())} on ${Gm.DUCKS[+lane.slice(4)].name}. Waiting for the gates.`);
    },
    show() { const m = tb.rc.mine; return m && tb.rc.R.phase !== 'show' ? { ['duck' + m[1]]: m[2] } : tb.bets; },
    extra() { const R = tb.rc.R; return R ? { pays: R.pays, phase: R.phase, round: R.round, mine: tb.rc.mine ? tb.rc.mine[1] : -1 } : null; },
    status() {
      const R = tb.rc.R, m = tb.rc.mine; if (!R) return null;
      if (R.phase === 'bet') return m ? `IN ON ${Gm.DUCKS[m[1]].name.toUpperCase()} · GATES IN ${Math.max(0, Math.ceil(Gm.RACE.betTime - R.t))}s` : `BETS OPEN · ${Math.max(0, Math.ceil(Gm.RACE.betTime - R.t))}s · CLICK A DUCK LANE`;
      return R.phase === 'run' ? "THEY'RE OFF!" : `${Gm.DUCKS[R.winner].name.toUpperCase()} WINS · NEXT RACE SOON`;
    },
  },
};
