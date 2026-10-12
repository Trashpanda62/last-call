// The table-game consoles: bet controls plus a live canvas view of the round. All odds come from games.js (the same
// maths the bots use) and the canvas painters from paint.js (the same ones the 3D machines use), so the machine in
// front of you shows exactly what your console shows.
import * as Gm from './games.js';
import * as P from './paint.js';
import { money, esc } from './util.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);
const now = () => performance.now() / 1000;
const NAMES = { bj: 'Blackjack', roulette: 'Roulette', slots: 'Slots', plinko: 'Plinko', mines: 'Mines', tower: 'Dragon Tower', coin: 'Coin Flip', wheel: 'Prize Wheel', dice: 'Street Dice', crash: 'Crash', race: 'Duck Race', vip: 'VIP Lounge' };
const RULES = {
  bj: Gm.BJ.label, roulette: Gm.RL.label, coin: Gm.COIN.label, wheel: Gm.WHEEL.label, dice: Gm.DICE.label,
  plinko: 'PICK YOUR RISK · THE EDGES PAY UP TO 1000x', mines: 'EVERY GEM RAISES THE PAYOUT · CASH OUT ANY TIME',
  tower: 'CLIMB 9 FLOORS · CASH OUT ANY TIME', crash: 'ONE ROCKET FOR THE WHOLE CASINO · CASH OUT BEFORE IT BLOWS',
  race: 'PICK A DUCK · NEW ODDS EVERY RACE', vip: 'NO GAMES HERE',
};
const CHIPS = [10, 100, 1000, 10000, 100000, 1000000];
const chipLabel = c => c >= 1e6 ? c / 1e6 + 'M' : c >= 1e3 ? c / 1e3 + 'K' : String(c);

let pn = null;          // the open console
let betAmt = 1000;      // remembered between tables
let hand = () => {};    // first-person hand animation hook (main.js)
export function setHandHook(fn) { hand = fn; }
export const panelGame = () => pn && pn.game;
// What the 3D machine at my seat should show.
export function panelView() { return pn ? { game: pn.game, seat: pn.seat, view: pn.view } : null; }

export function closePanel() {
  if (pn) for (const j of pn.jobs.splice(0)) j.fn(); // rounds already decided still pay out
  pn = null; $('panel').classList.add('hidden'); $('panel').innerHTML = '';
}

// seat: priv.seat ({ id, game, tier }); v: the current view
export function openPanel(seat, act, v) {
  const game = seat.game;
  pn = { game, seat: seat.id, tier: seat.tier || 'penny', act, view: null, busy: false, jobs: [], key: '', maxBet: 0, me: v.priv.me };
  const el = $('panel'); el.classList.remove('hidden');
  el.innerHTML = `<div class="ph"><h3>${NAMES[game] || game}</h3><div class="rules">${esc(game === 'slots' ? Gm.SLOT_TIERS[pn.tier].name.toUpperCase() + ' · 💎 PAYS ' + Gm.SLOT_TIERS[pn.tier].pays['💎'] + 'x' : RULES[game] || '')}</div></div>
    <canvas id="pc"></canvas><div id="pctl"></div><div class="res" id="pres"></div>
    ${game === 'vip' ? '' : `<div class="betbar" id="betbar">
      <div class="betrow"><span class="lbl">BET</span><button class="betamt" id="betAmt" title="Type a bet"></button><span class="small muted" id="betMax"></span></div>
      <div class="chips">${CHIPS.map(c => `<button data-chip="${c}" class="chip c${c}">+${chipLabel(c)}</button>`).join('')}</div>
      <div class="chips"><button data-bm="min">MIN</button><button data-bm="half">½</button><button data-bm="dbl">×2</button><button data-bm="max">MAX</button></div>
      <div class="keypad hidden" id="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'].map(k => `<button data-k="${k}">${k}</button>`).join('')}<button data-k="ok" class="ok">OK</button></div>
    </div>`}
    <div class="small muted tip">Your drink is on the rail behind you. <span class="kb">Hold <kbd>Space</kbd></span><span class="tb">Hold Look back</span> to check it.</div>`;
  const c = $('pc'); pn.g = c.getContext('2d');
  c.addEventListener('pointerdown', e => { const r = c.getBoundingClientRect(); canvasTap((e.clientX - r.left) / r.width * c.width, (e.clientY - r.top) / r.height * c.height); });
  if (game !== 'vip') wireBet(v);
  (SETUP[game] || SETUP.vip)();
  panelTick(v);
}

// ---------- Bets ----------
const minBet = () => pn.game === 'slots' ? Math.max(Gm.BET.min, Gm.SLOT_TIERS[pn.tier].minBet) : Gm.BET.min;
const curBet = () => Math.max(minBet(), Math.min(pn.maxBet || Gm.BET.floor, betAmt));
function wireBet() {
  const el = $('betbar'); let typed = '';
  el.querySelectorAll('[data-chip]').forEach(b => { b.onclick = () => { setBet(curBet() <= minBet() ? +b.dataset.chip : curBet() + +b.dataset.chip); sfx('click'); }; });
  el.querySelectorAll('[data-bm]').forEach(b => {
    b.onclick = () => { const m = b.dataset.bm; setBet(m === 'min' ? minBet() : m === 'max' ? pn.maxBet : m === 'half' ? Math.floor(curBet() / 2) : curBet() * 2); sfx('click'); };
  });
  $('betAmt').onclick = () => { typed = ''; $('keypad').classList.toggle('hidden'); };
  el.querySelectorAll('[data-k]').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'ok') { $('keypad').classList.add('hidden'); if (typed) setBet(+typed); return; }
      typed = k === '⌫' ? typed.slice(0, -1) : (typed + k).replace(/^0+/, '').slice(0, 12);
      $('betAmt').textContent = typed ? money(+typed) : '$0'; sfx('click');
    };
  });
}
function setBet(b) { betAmt = Math.max(minBet(), Math.min(pn.maxBet, Math.round(b) || minBet())); refreshBet(); }
function refreshBet() {
  if (!$('betAmt')) return;
  if ($('keypad').classList.contains('hidden')) $('betAmt').textContent = money(curBet());
  $('betMax').textContent = 'max ' + P.short(pn.maxBet);
  $('betbar').classList.toggle('locked', pn.busy);
  $('betbar').querySelectorAll('button').forEach(b => { b.disabled = pn.busy; });
  $('betbar').querySelectorAll('[data-chip]').forEach(b => b.classList.toggle('hidden', +b.dataset.chip > pn.maxBet));
}
function busy(on) { pn.busy = on; refreshBet(); }

// A finished round: `stake` went in, `back` came out. The sim adds the comp and checks the numbers.
function pay(stake, back, line) {
  pn.act('bank', { d: back - stake, b: stake });
  const net = back - stake;
  result((line ? line + ' ' : '') + (net > 0 ? '+' + money(net) : net < 0 ? '−' + money(-net) : 'Even.'), net > 0 ? 'win' : net < 0 ? 'lose' : '');
  sfx(net > 0 ? (back >= stake * 5 ? 'win' : 'coin') : net < 0 ? 'lose' : 'click');
}
function result(text, cls = '') { const r = $('pres'); if (r) { r.textContent = text; r.className = 'res ' + cls; } }
function later(sec, fn) { pn.jobs.push({ at: now() + sec, fn }); }
const ctl = html => { $('pctl').innerHTML = html; return $('pctl'); };
const on = (sel, fn) => $('pctl').querySelectorAll(sel).forEach(b => { b.onclick = () => fn(b); });

// ---------- Each game ----------
const SETUP = {
  vip() { ctl('<p class="small">No games here. Just you, a velvet couch, and whoever is behind you. The screen shows the crew bank.</p>'); },

  bj() {
    let s = null;
    const draw = () => {
      const can = s ? Gm.bjCan(s) : {};
      ctl(`<div class="row"><button class="big" id="deal" ${s && !s.over ? 'disabled' : ''}>DEAL ${P.short(curBet())}</button>
        ${['hit', 'stand', 'double', 'split'].map(a => `<button data-a="${a}" ${can[a] ? '' : 'disabled'}>${a[0].toUpperCase() + a.slice(1)}</button>`).join('')}</div>
        <div class="small muted" id="advice">${s && !s.over ? 'The book says: <b>' + Gm.bjAdvice(s).toUpperCase() + '</b>' : 'Ties pay half. Blackjack pays 2 to 1.'}</div>`);
      $('deal').onclick = deal; on('[data-a]', b => move(b.dataset.a));
      pn.view = s ? { dealer: s.dealer, hide: !s.over, hands: s.hands.map((h, i) => ({ cards: h.cards, active: !s.over && i === s.i })) } : null;
    };
    const finish = () => { busy(false); const bet = s.bet; pay(bet * s.staked, bet * s.mult, s.lines.join(' ')); draw(); };
    function deal() { if (pn.busy) return; s = Gm.bjDeal(curBet()); busy(true); result(''); hand('press'); sfx('click'); draw(); if (s.over) finish(); }
    function move(a) { if (!s || s.over) return; Gm.bjAct(s, a); hand('press'); sfx('click'); draw(); if (s.over) finish(); }
    pn.redraw = () => { if (!pn.busy) draw(); };
    draw();
  },

  roulette() {
    let pick = 'red', num = 17;
    const draw = () => {
      ctl(`<div class="grid3">${Object.entries(Gm.RL_BETS).map(([k, b]) => `<button data-b="${k}" class="${pick === k ? 'on' : ''} ${k}">${b.label} <small>${b.pays}x</small></button>`).join('')}</div>
        <div class="row"><button data-b="num" class="${pick === 'num' ? 'on' : ''}">Number <small>36x</small></button><button data-n="-1">−</button><b class="numsel">${num}</b><button data-n="1">+</button>
        <button class="big" id="spin">SPIN</button></div>`);
      on('[data-b]', b => { if (!pn.busy) { pick = b.dataset.b; draw(); } });
      on('[data-n]', b => { if (!pn.busy) { num = (num + +b.dataset.n + 37) % 37; pick = 'num'; draw(); } });
      $('spin').onclick = spin; $('spin').disabled = pn.busy;
    };
    function spin() {
      if (pn.busy) return;
      const bet = curBet(), lucky = Gm.rlLucky(), r = Gm.rlSpin(pick === 'num' ? num : pick, lucky);
      pn.view = { spin: { t0: now(), dur: 4, n: r.n, lucky } }; busy(true); draw(); hand('press'); sfx('click');
      result('Lucky numbers: ' + lucky.map(l => `${l.n} (${l.x}x)`).join(', '));
      later(4, () => { busy(false); draw(); const col = r.n === 0 ? 'green' : Gm.RL_RED.has(r.n) ? 'red' : 'black'; pay(bet, bet * r.mult, `${r.n} ${col}.${r.lucky && r.mult ? ' LUCKY!' : ''}`); });
    }
    draw();
  },

  slots() {
    let auto = false;
    const T = Gm.SLOT_TIERS[pn.tier];
    const draw = () => {
      ctl(`<div class="row"><button class="big" id="spin" ${pn.busy ? 'disabled' : ''}>PULL ${P.short(curBet())}</button><button id="auto" class="${auto ? 'on' : ''}">Auto ${auto ? 'ON' : 'off'}</button></div>
        <div class="small muted">3 💎 ${T.pays['💎']}x · 3 sevens ${T.pays['7']}x · 3 BAR ${T.pays.BAR}x · 3 bells ${T.pays['🔔']}x · 3 cherries ${T.pays['🍒']}x · 3 lemons ${T.pays['🍋']}x · two cherries ${T.two}x · one cherry ${T.one}x</div>`);
      $('spin').onclick = spin; $('auto').onclick = () => { auto = !auto; draw(); if (auto && !pn.busy) spin(); };
    };
    function spin() {
      if (!pn || pn.busy || pn.game !== 'slots') return;
      const bet = curBet(), r = Gm.slotSpin(pn.tier);
      pn.view = { tier: pn.tier, reels: r.reels, spin: { t0: now() }, win: null }; busy(true); draw(); hand('pull'); sfx('click');
      later(1.75, () => {
        busy(false); pn.view.win = r.mult > 0 ? `${r.line.toUpperCase()} ${P.xfmt(r.mult)}` : null;
        pay(bet, bet * r.mult, r.line); draw();
        if (auto) later(0.7, spin);
      });
    }
    pn.redraw = draw; draw();
  },

  plinko() {
    let risk = 'medium'; const balls = [], last = [];
    const draw = () => {
      ctl(`<div class="row">${['low', 'medium', 'high'].map(k => `<button data-r="${k}" class="${risk === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
        <button class="big" id="drop">DROP ${P.short(curBet())}</button></div><div class="small muted">Edges pay ${Gm.PLINKO[risk][0]}x. Drop as many balls as you like.</div>`);
      on('[data-r]', b => { if (!balls.length) { risk = b.dataset.r; pn.view.risk = risk; draw(); } });
      $('drop').onclick = drop;
    };
    pn.view = { risk, balls };
    function drop() {
      const bet = curBet(), r = Gm.plinkoDrop(risk), b = { path: r.path, t0: now() };
      balls.push(b); hand('press'); sfx('click'); refreshBet();
      later(Gm.PLINKO_ROWS * P.PLINKO_ROW_T + 0.05, () => {
        last.unshift(P.xfmt(r.mult)); last.length = Math.min(last.length, 6);
        pay(bet, bet * r.mult, last.join(' · ') + ' ·');
        later(0.6, () => { const i = balls.indexOf(b); if (i >= 0) balls.splice(i, 1); });
      });
    }
    pn.redraw = draw; draw();
  },

  mines() {
    let m = 3, s = null, bet = 0;
    const draw = () => {
      const live = s && !s.over, k = s ? s.open.length : 0;
      ctl(live
        ? `<div class="row"><button class="big" id="cash" ${k ? '' : 'disabled'}>CASH OUT ${P.short(bet * Gm.minesMult(m, k))}</button><button id="rand">Random tile</button></div><div class="small muted">Tap a tile. Next gem: ${P.xfmt(Gm.minesMult(m, k + 1))}</div>`
        : `<div class="row">Mines: ${[1, 3, 5, 10, 20, 24].map(n => `<button data-m="${n}" class="${m === n ? 'on' : ''}">${n}</button>`).join('')}</div>
           <div class="row"><button class="big" id="start">START ${P.short(curBet())}</button></div><div class="small muted">First gem pays ${P.xfmt(Gm.minesMult(m, 1))}. Up to ${P.xfmt(Gm.minesMult(m, Math.min(25 - m, 24)))}.</div>`);
      if (live) { $('cash').onclick = cash; $('rand').onclick = () => { const free = [...Array(25).keys()].filter(i => !s.open.includes(i)); tap(free[Math.floor(Math.random() * free.length)]); }; }
      else { on('[data-m]', b => { m = +b.dataset.m; draw(); }); $('start').onclick = start; }
      pn.view = s ? { m, open: s.open, mines: s.mines, over: s.over, dead: s.dead, mult: s.dead ? 0 : Gm.minesMult(m, k), next: Gm.minesMult(m, k + 1) } : null;
    };
    function start() { if (pn.busy) return; bet = curBet(); s = Gm.minesNew(m); busy(true); result(''); hand('press'); draw(); }
    function tap(i) {
      if (!s || s.over || i === undefined) return;
      Gm.minesPick(s, i); hand('press');
      if (s.dead) { busy(false); pay(bet, 0, 'BOOM.'); }
      else if (s.over) { busy(false); pay(bet, bet * s.mult, 'Cleared the board!'); }
      else sfx('coin');
      draw();
    }
    function cash() { if (!s || s.over) return; Gm.minesCash(s); busy(false); pay(bet, bet * s.mult, `Cashed out at ${P.xfmt(s.mult)}.`); draw(); }
    pn.tap = (x, y, w, h) => {
      const sz = Math.min(w * 0.62, h * 0.86) / 5, x0 = w * 0.05, y0 = (h - sz * 5) / 2;
      const cx = Math.floor((x - x0) / sz), cy = Math.floor((y - y0) / sz);
      if (cx >= 0 && cx < 5 && cy >= 0 && cy < 5) tap(cy * 5 + cx);
    };
    pn.redraw = () => { if (!s || s.over) draw(); };
    draw();
  },

  tower() {
    let mode = 'medium', s = null, bet = 0;
    const draw = () => {
      const live = s && !s.over;
      ctl(live
        ? `<div class="row eggs">${[...Array(s.eggs).keys()].map(e => `<button data-e="${e}">🥚</button>`).join('')}</div>
           <div class="row"><button class="big" id="cash" ${s.row ? '' : 'disabled'}>CASH OUT ${P.short(bet * Gm.towerMult(mode, s.row))}</button><span class="small muted">Floor ${s.row + 1} pays ${P.xfmt(Gm.towerMult(mode, s.row + 1))}</span></div>`
        : `<div class="row">${Object.entries(Gm.TOWER.modes).map(([k, M]) => `<button data-mode="${k}" class="${mode === k ? 'on' : ''}">${M.label}</button>`).join('')}</div>
           <div class="row"><button class="big" id="start">CLIMB ${P.short(curBet())}</button><span class="small muted">Top floor pays ${P.xfmt(Gm.towerMult(mode, Gm.TOWER.rows))}</span></div>`);
      if (live) { on('[data-e]', b => pickEgg(+b.dataset.e)); $('cash').onclick = cash; }
      else { on('[data-mode]', b => { mode = b.dataset.mode; draw(); }); $('start').onclick = start; }
      pn.view = s ? { mode, eggs: s.eggs, row: s.row, picks: s.picks, rows: s.rows, over: s.over, dead: s.dead, mult: s.mult } : null;
    };
    function start() { if (pn.busy) return; bet = curBet(); s = Gm.towerNew(mode); busy(true); result(''); hand('press'); draw(); }
    function pickEgg(e) {
      if (!s || s.over) return;
      Gm.towerPick(s, e); hand('press');
      if (s.dead) { busy(false); pay(bet, 0, 'A dragon!'); }
      else if (s.over) { busy(false); pay(bet, bet * s.mult, 'Top of the tower!'); }
      else sfx('coin');
      draw();
    }
    function cash() { if (!s || s.over) return; Gm.towerCash(s); busy(false); pay(bet, bet * s.mult, `Cashed out at ${P.xfmt(s.mult)}.`); draw(); }
    pn.tap = (x, y, w, h) => {
      if (!s || s.over) return;
      const rh = h * 0.86 / Gm.TOWER.rows, y0 = h * 0.07, cw = w * 0.6 / s.eggs, x0 = w * 0.04, ry = y0 + (Gm.TOWER.rows - 1 - s.row) * rh;
      const e = Math.floor((x - x0) / cw);
      if (y >= ry && y < ry + rh && e >= 0 && e < s.eggs) pickEgg(e);
    };
    pn.redraw = () => { if (!s || s.over) draw(); };
    draw();
  },

  coin() {
    let pot = 0, bet = 0, ride = 0, flying = false;
    const draw = () => {
      ctl(pot
        ? `<div class="row"><button class="big" id="take" ${flying ? 'disabled' : ''}>TAKE ${P.short(pot)}</button></div><div class="row">Double it: <button data-c="heads" ${flying ? 'disabled' : ''}>Heads</button><button data-c="tails" ${flying ? 'disabled' : ''}>Tails</button></div>`
        : `<div class="row"><button class="big" data-c="heads" ${flying ? 'disabled' : ''}>HEADS</button><button class="big" data-c="tails" ${flying ? 'disabled' : ''}>TAILS</button></div><div class="small muted">A win doubles your money. Keep flipping to double it again, or take it.</div>`);
      on('[data-c]', b => flip(b.dataset.c));
      if (pot) $('take').onclick = take;
    };
    function flip(call) {
      if (flying) return;
      if (!pot) { bet = curBet(); busy(true); result(''); }
      const r = Gm.coinFlip(call); flying = true;
      pn.view = { flip: { t0: now(), side: r.side } }; hand('press'); sfx('click'); draw();
      later(1.25, () => {
        flying = false;
        if (!r.win) { pot = 0; ride = 0; busy(false); pay(bet, 0, `${r.side[0].toUpperCase() + r.side.slice(1)}.`); }
        else { pot = (pot || bet) * 2; ride++; result(`${r.side[0].toUpperCase() + r.side.slice(1)}! Pot ${money(pot)}.`, 'win'); sfx('coin'); if (ride >= Gm.COIN.maxRide) take(); }
        draw();
      });
    }
    function take() { if (!pot || flying) return; const p = pot; pot = 0; ride = 0; busy(false); pay(bet, p, 'Took it.'); draw(); }
    draw();
  },

  wheel() {
    const draw = () => { ctl(`<div class="row"><button class="big" id="spin" ${pn.busy ? 'disabled' : ''}>SPIN ${P.short(curBet())}</button></div><div class="small muted">17 prizes on 50 slots: 1.5x, 2x, 3x, 5x and one 20x.</div>`); $('spin').onclick = spin; };
    function spin() {
      if (pn.busy) return;
      const bet = curBet(), r = Gm.wheelSpin(), t = now(), a = P.wheelAngle(pn.view, t), TAU = Math.PI * 2;
      pn.view = { spin: { t0: t, from: ((a % TAU) + TAU) % TAU, to: r.i, dur: 5 } }; busy(true); draw(); hand('press'); sfx('click'); result('');
      later(5, () => { busy(false); pay(bet, bet * r.mult, r.mult ? P.xfmt(r.mult) + '!' : 'Blank.'); draw(); });
    }
    pn.redraw = draw; draw();
  },

  dice() {
    let s = null, bet = 0, rolling = false;
    const draw = () => {
      const live = s && !s.over;
      ctl(live
        ? `<div class="row"><button class="big" id="roll" ${rolling ? 'disabled' : ''}>ROLL FOR ${s.point}</button></div>`
        : `<div class="row"><button class="big" id="pass" ${rolling ? 'disabled' : ''}>PASS LINE ${P.short(curBet())}</button><button class="big alt" id="field" ${rolling ? 'disabled' : ''}>FIELD</button></div>
           <div class="small muted">Pass: 7, 11 or 12 wins, 2 or 3 loses, else roll your point again before a 7 (pays 2x). Field: one roll, 3 4 9 10 11 pay 2x, 2 and 12 pay 5x.</div>`);
      if (live) $('roll').onclick = rollPass; else { $('pass').onclick = () => { if (pn.busy) return; s = Gm.passNew(); bet = curBet(); busy(true); result(''); rollPass(); }; $('field').onclick = field; }
    };
    function throwDice(dice, then) { rolling = true; pn.view = { roll: { t0: now(), dice } }; hand('throw'); sfx('click'); draw(); later(0.95, () => { rolling = false; then(); draw(); }); }
    function rollPass() {
      if (!s || s.over || rolling) return;
      Gm.passRoll(s); const d = s.rolls[s.rolls.length - 1];
      throwDice(d, () => { if (s.over) { busy(false); pay(bet, bet * s.mult, s.line); } else result(s.line); });
    }
    function field() {
      if (pn.busy || rolling) return;
      const b = curBet(), r = Gm.fieldRoll(); busy(true); result('');
      throwDice(r.dice, () => { busy(false); pay(b, b * r.mult, `${r.total}.`); });
    }
    pn.redraw = () => { if (!rolling) draw(); };
    draw();
  },

  crash() {
    pn.auto = pn.auto ?? 2; pn.ckey = '';
    pn.live = v => {
      const C = v.pub.crash, mine = C.bets.find(b => b[0] === pn.me);
      const key = [C.phase, C.round, mine ? mine[2] : 'x', C.phase === 'fly' && mine && !mine[2] ? C.mult : ''].join('|');
      if (key === pn.ckey) return; pn.ckey = key;
      if (C.phase === 'bet' && !mine) {
        ctl(`<div class="row"><button class="big" id="cbet">BET ${P.short(curBet())}</button></div>
          <div class="row small">Auto cash-out: ${[0, 1.5, 2, 3, 5, 10, 100].map(a => `<button data-auto="${a}" class="${pn.auto === a ? 'on' : ''}">${a ? a + 'x' : 'Off'}</button>`).join('')}</div>`);
        $('cbet').onclick = () => { pn.act('crash', { bet: curBet(), auto: pn.auto }); hand('press'); sfx('click'); pn.ckey = ''; };
        on('[data-auto]', b => { pn.auto = +b.dataset.auto; pn.ckey = ''; });
      } else if (C.phase === 'fly' && mine && !mine[2]) {
        ctl(`<div class="row"><button class="big cash" id="cout">CASH OUT ${P.short(mine[1] * C.mult)}</button></div>`);
        $('cout').onclick = () => { pn.act('cashout'); hand('press'); };
      } else if (mine && mine[2]) ctl(`<div class="row win">Cashed out at ${P.xfmt(mine[2])}: +${money(mine[1] * (mine[2] - 1))}</div>`);
      else if (mine && C.phase === 'boom') ctl(`<div class="row lose">Crashed at ${P.xfmt(C.point)}. Lost ${money(mine[1])}.</div>`);
      else if (mine) ctl(`<div class="row">You're in for ${money(mine[1])}${pn.auto ? `, auto cash-out at ${pn.auto}x` : ''}. Wait for launch.</div>`);
      else ctl(`<div class="row muted">${C.phase === 'fly' ? 'In flight. Bet on the next rocket.' : 'Next rocket soon.'}</div>`);
    };
  },

  race() {
    pn.duck = pn.duck ?? 0; pn.rkey = '';
    pn.live = v => {
      const R = v.pub.race, mine = R.bets.find(b => b[0] === pn.me);
      const key = [R.phase, R.round, mine ? 1 : 0, pn.duck, R.phase === 'bet' ? Math.ceil(Gm.RACE.betTime - R.t) : ''].join('|');
      if (key === pn.rkey) return; pn.rkey = key;
      if (R.phase === 'bet' && !mine) {
        ctl(`<div class="grid2">${Gm.DUCKS.map((d, i) => `<button data-d="${i}" class="${pn.duck === i ? 'on' : ''}"><span class="dot" style="background:${d.color}"></span>${d.name} <small>${P.xfmt(R.pays[i])}</small></button>`).join('')}</div>
          <div class="row"><button class="big" id="rbet">BET ${P.short(curBet())} ON ${Gm.DUCKS[pn.duck].name.toUpperCase()}</button><span class="small muted">${Math.ceil(Gm.RACE.betTime - R.t)}s</span></div>`);
        on('[data-d]', b => { pn.duck = +b.dataset.d; pn.rkey = ''; });
        $('rbet').onclick = () => { pn.act('race', { duck: pn.duck, bet: curBet() }); hand('press'); sfx('click'); pn.rkey = ''; };
      } else if (mine) {
        const d = Gm.DUCKS[mine[1]], won = R.phase === 'show' && R.winner === mine[1];
        ctl(`<div class="row ${R.phase === 'show' ? (won ? 'win' : 'lose') : ''}">${money(mine[2])} on ${d.name} at ${P.xfmt(R.pays[mine[1]])}. ${R.phase === 'bet' ? 'Waiting for the gates.' : R.phase === 'run' ? "They're off!" : won ? 'WINNER! +' + money(mine[2] * (R.pays[mine[1]] - 1)) : 'Not this time.'}</div>`);
      } else ctl(`<div class="row muted">${R.phase === 'run' ? "They're off. Bet on the next race." : 'Next race soon.'}</div>`);
    };
  },
};

function canvasTap(x, y) { if (pn && pn.tap) { const c = $('pc'); pn.tap(x, y, c.width, c.height); } }

// Every frame while seated: run due jobs, track the bet limit, repaint the console screen.
export function panelTick(v) {
  if (!pn) return;
  const t = now();
  for (let i = 0; i < pn.jobs.length; i++) if (pn.jobs[i].at <= t) { const j = pn.jobs.splice(i--, 1)[0]; j.fn(); if (!pn) return; }
  const mb = v.pub.maxBet || Gm.maxBet(v.pub.bank);
  if (mb !== pn.maxBet) { pn.maxBet = mb; if (pn.game !== 'vip') { refreshBet(); if (pn.redraw) pn.redraw(); pn.ckey = pn.rkey = ''; } }
  if (pn.live) pn.live(v);
  const c = $('pc'); if (!c) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
  if (W && (c.width !== W || c.height !== H)) { c.width = W; c.height = H; }
  const g = pn.g, w = c.width, h = c.height, st = pn.view;
  switch (pn.game) {
    case 'bj': P.paintCards(g, w, h, t, st || { dealer: [], hide: true, hands: [] }); break;
    case 'roulette': P.paintRoulette(g, w, h, t, st); break;
    case 'slots': P.paintSlots(g, w, h, t, st || { tier: pn.tier }); break;
    case 'plinko': P.paintPlinko(g, w, h, t, st); break;
    case 'mines': P.paintMines(g, w, h, t, st); break;
    case 'tower': P.paintTower(g, w, h, t, st); break;
    case 'coin': P.paintCoin(g, w, h, t, st); break;
    case 'wheel': P.paintWheel(g, w, h, t, st); break;
    case 'dice': P.paintDice(g, w, h, t, st); break;
    case 'crash': P.paintCrash(g, w, h, t, v.pub.crash, pn.me); break;
    case 'race': P.paintTote(g, w, h, t, v.pub.race, pn.me); break;
    default: P.paintBankBoard(g, w, h, t, v.pub);
  }
}
