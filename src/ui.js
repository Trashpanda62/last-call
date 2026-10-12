// DOM side: HUD, table-game panels, meetings and the results screen. Reads views, sends actions through act().
import { CFG } from './config.js';
import { money, pick, rand, esc, clamp } from './util.js';
import { sfx } from './audio.js';

export const $ = id => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle('hidden', !on);
export { show };

export function toast(text, bad) {
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = text;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), 4200);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
export function splash(text) {
  $('splashText').textContent = text; show('splash', true);
  const el = $('splashText'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(splash.t); splash.t = setTimeout(() => show('splash', false), 1400);
}

// ---------- HUD ----------
let lastRole = '';
export function updateHud(v) {
  const { pub, priv } = v;
  $('bankText').textContent = money(pub.bank) + ' / ' + money(pub.target);
  const ct = pub.closeT; $('closeT').textContent = `· closes ${Math.floor(ct / 60)}:${String(ct % 60).padStart(2, '0')}`; $('closeT').classList.toggle('late', ct <= 120);
  $('bankFill').style.transform = `scaleX(${clamp(pub.bank / pub.target, 0, 1)})`;
  $('thirstFill').style.transform = `scaleX(${priv.thirst / 100})`;
  $('thirstFill').style.background = priv.thirst < 25 ? '#e8443a' : '#6ac0e8';
  $('lucky').textContent = priv.lucky > 0 ? `Lucky ${priv.lucky}s` : '';
  const d = priv.drink;
  $('drinkInfo').textContent = !priv.alive ? "You're a ghost. Drift around and watch."
    : d ? `Your ${d.kind}: ${d.sips} sips${d.held ? ' (in hand)' : ' (set down)'}` : priv.thirst <= 0 ? 'Parched! Get a drink at the bar.' : 'No drink. The bar is west of the casino floor.';
  $('hint').textContent = priv.ctx ? 'E · ' + priv.ctx : '';
  $('useBtn').textContent = priv.ctx ? shortCtx(priv.ctx) : 'Use';
  $('useBtn').classList.toggle('ready', !!priv.ctx);
  const roleKey = priv.isKiller + ':' + pub.nk + ':' + pub.target;
  if (roleKey !== lastRole) {
    lastRole = roleKey;
    const r = $('role');
    if (priv.isKiller) {
      r.className = 'killer';
      const mates = pub.chars.filter(c => priv.killers.includes(c.id) && c.id !== priv.me).map(c => c.name);
      r.innerHTML = `<b>You are ${mates.length ? 'a KILLER' : 'the KILLER'}.</b> ${mates.length ? `Your partner: ${esc(mates.join(', '))}. ` : ''}Poison, stab, cut the lights. Don't get seen.`;
    } else { r.className = ''; r.innerHTML = `<b>You are a GAMBLER.</b> Win the crew ${money(pub.target)} or vote out the killer. Watch your drink.`; }
  }
  show('killerBar', priv.isKiller && priv.alive);
  if (priv.isKiller) {
    const set = (k, cd, label) => { const b = document.querySelector(`#killerBar [data-act=${k}]`); b.textContent = label + (cd > 0 ? ` (${cd}s)` : ''); b.disabled = cd > 0; };
    set('poison', priv.cd.poison, '1 · Poison'); set('shiv', priv.cd.shiv, '2 · Shiv'); set('lights', priv.cd.lights, '3 · Lights');
  }
}
function shortCtx(s) {
  if (s.startsWith('Report')) return 'Report'; if (s.startsWith('Sit')) return 'Sit'; if (s.startsWith('Stand')) return 'Stand';
  if (s.startsWith('Order')) return 'Order'; if (s.startsWith('Ring')) return 'Bell'; if (s.startsWith('Pick')) return 'Pick up'; if (s.startsWith('Eat')) return 'Snack';
  return 'Use';
}

// ---------- Table games ----------
let panel = null;
export const panelGame = () => panel && panel.game;
export function closePanel() { panel = null; show('panel', false); $('panel').innerHTML = ''; }
export function openPanel(game, act) {
  panel = { game, act };
  const el = $('panel'); show('panel', true);
  const tip = '<div class="small muted">Your drink is on the rail behind you. <span class="kb">Hold <kbd>Space</kbd></span><span class="tb">Hold Look back</span> to check it.</div>';
  const bet = CFG.playerBet;
  if (game === 'bj') {
    el.innerHTML = `<h3>Blackjack</h3><div>Dealer: <span class="cards" id="bjD"></span></div><div>You: <span class="cards" id="bjP"></span></div>
      <div class="row"><button id="bjDeal">Deal ${money(bet)}</button><button id="bjHit" disabled>Hit</button><button id="bjStand" disabled>Stand</button></div><div class="res" id="bjR"></div>${tip}`;
    $('bjDeal').onclick = bjDeal; $('bjHit').onclick = bjHit; $('bjStand').onclick = bjStand;
  } else if (game === 'roulette') {
    el.innerHTML = `<h3>Roulette</h3><div class="cards" id="rlN">-</div>
      <div class="row"><button data-c="red" style="border-color:#e8443a">Red ×2</button><button data-c="black">Black ×2</button><button data-c="green" style="border-color:#3ddc97">Green ×14</button></div><div class="res" id="rlR">Bet ${money(bet)}.</div>${tip}`;
    el.querySelectorAll('[data-c]').forEach(b => { b.onclick = () => rlSpin(b.dataset.c); });
  } else if (game === 'race') {
    const horses = ['Gravy Train', 'Lucky Lou', 'Big Debt', 'Nine Lives'];
    el.innerHTML = `<h3>The races</h3>${horses.map((h, i) => `<div class="small">${h}</div><div class="track"><i id="h${i}" style="background:${['#e8443a', '#3ddc97', '#4a7dff', '#f4e04d'][i]}"></i></div>`).join('')}
      <div class="row">${horses.map((h, i) => `<button data-h="${i}">${h}</button>`).join('')}</div><div class="res" id="raceR">Bet ${money(bet)} on a horse. Pays ×4.</div>${tip}`;
    el.querySelectorAll('[data-h]').forEach(b => { b.onclick = () => raceRun(+b.dataset.h, horses); });
  } else if (game === 'slots') {
    el.innerHTML = `<h3>Slots</h3><div class="reels"><span id="r0">🍒</span><span id="r1">🔔</span><span id="r2">7</span></div>
      <div class="row"><button id="spinBtn">Pull ${money(CFG.slotBet)}</button></div><div class="res" id="slR">Three of a kind pays big. Any cherry pays a little.</div>${tip}`;
    $('spinBtn').onclick = slotSpin;
  } else {
    el.innerHTML = `<h3>VIP lounge</h3><div>No games here. Just you, a velvet couch, and whoever is behind you.</div>${tip}`;
  }
}
const bank = (delta) => { if (panel) panel.act('bank', delta); sfx(delta > 0 ? 'coin' : 'click'); };
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const draw = () => pick(RANKS) + pick(SUITS);
const val = c => { const r = c.slice(0, -1); return r === 'A' ? 11 : 'JQK'.includes(r) ? 10 : +r; };
function total(h) { let t = h.reduce((s, c) => s + val(c), 0), a = h.filter(c => c[0] === 'A').length; while (t > 21 && a--) t -= 10; return t; }
function bjShow(hide) {
  const b = panel.bj;
  $('bjD').textContent = hide ? b.d[0] + ' ??' : b.d.join(' ') + ' (' + total(b.d) + ')';
  $('bjP').textContent = b.p.join(' ') + ' (' + total(b.p) + ')';
}
function bjDeal() {
  if (!panel || panel.game !== 'bj') return;
  panel.bj = { p: [draw(), draw()], d: [draw(), draw()] };
  $('bjDeal').disabled = true; $('bjHit').disabled = false; $('bjStand').disabled = false; $('bjR').textContent = '';
  bjShow(true); sfx('click');
  if (total(panel.bj.p) === 21) bjEnd(Math.round(CFG.playerBet * 1.5), 'Blackjack!');
}
function bjHit() { if (!panel || !panel.bj) return; const b = panel.bj; b.p.push(draw()); bjShow(true); sfx('click'); if (total(b.p) > 21) bjEnd(-CFG.playerBet, 'Bust.'); }
function bjStand() {
  if (!panel || !panel.bj) return;
  const b = panel.bj; while (total(b.d) < 17) b.d.push(draw());
  const pt = total(b.p), dt = total(b.d);
  if (dt > 21 || pt > dt) bjEnd(CFG.playerBet, 'You win.'); else if (pt === dt) bjEnd(0, 'Push.'); else bjEnd(-CFG.playerBet, 'Dealer wins.');
}
function bjEnd(delta, text) {
  bjShow(false); $('bjR').textContent = text + (delta ? ' ' + (delta > 0 ? '+' : '') + money(delta) : '');
  $('bjDeal').disabled = false; $('bjHit').disabled = true; $('bjStand').disabled = true; panel.bj = null;
  bank(delta);
}
function rlSpin(color) {
  const el = $('panel'); el.querySelectorAll('[data-c]').forEach(b => { b.disabled = true; });
  const iv = setInterval(() => { if ($('rlN')) $('rlN').textContent = Math.floor(Math.random() * 15); }, 70);
  setTimeout(() => {
    clearInterval(iv); if (!panel || panel.game !== 'roulette') return;
    const n = Math.floor(Math.random() * 15), c = n === 0 ? 'green' : n % 2 ? 'red' : 'black';
    $('rlN').textContent = n + ' ' + c;
    const delta = c === color ? CFG.playerBet * (c === 'green' ? 13 : 1) : -CFG.playerBet;
    $('rlR').textContent = delta > 0 ? 'Winner! +' + money(delta) : 'House wins. ' + money(delta);
    bank(delta);
    el.querySelectorAll('[data-c]').forEach(b => { b.disabled = false; });
  }, 2000);
}
function raceRun(h, horses) {
  const el = $('panel'); el.querySelectorAll('[data-h]').forEach(b => { b.disabled = true; });
  const pos = [0, 0, 0, 0]; let winner = -1;
  const iv = setInterval(() => {
    if (!panel || panel.game !== 'race') { clearInterval(iv); return; }
    for (let i = 0; i < 4; i++) { pos[i] += rand(0, 4.2); $('h' + i).style.left = Math.min(pos[i], 100) * 0.9 + '%'; if (pos[i] >= 100 && winner < 0) winner = i; }
    if (winner >= 0) {
      clearInterval(iv);
      const delta = winner === h ? CFG.playerBet * 3 : -CFG.playerBet;
      $('raceR').textContent = `${horses[winner]} wins! ` + (delta > 0 ? '+' + money(delta) : money(delta));
      bank(delta);
      el.querySelectorAll('[data-h]').forEach(b => { b.disabled = false; });
    }
  }, 60);
}
const SYMS = ['🍒', '🔔', '7', '🍋', '💎'];
function slotSpin() {
  $('spinBtn').disabled = true; sfx('click');
  let n = 0;
  const iv = setInterval(() => {
    if (!panel || panel.game !== 'slots') { clearInterval(iv); return; }
    for (let i = 0; i < 3; i++) if (n < 8 + i * 4) $('r' + i).textContent = pick(SYMS);
    if (++n >= 18) {
      clearInterval(iv);
      const r = [0, 1, 2].map(i => $('r' + i).textContent);
      let delta = -CFG.slotBet, msg = 'Nothing.';
      if (r[0] === r[1] && r[1] === r[2]) { delta = r[0] === '💎' ? CFG.slotBet * 20 : r[0] === '7' ? CFG.slotBet * 12 : CFG.slotBet * 6; msg = 'JACKPOT!'; }
      else if (r.includes('🍒')) { delta = CFG.slotBet; msg = 'Cherry.'; }
      else if (r[0] === r[1] || r[1] === r[2]) { delta = CFG.slotBet; msg = 'A pair.'; }
      $('slR').textContent = msg + ' ' + (delta > 0 ? '+' : '') + money(delta);
      bank(delta); $('spinBtn').disabled = false;
    }
  }, 70);
}

// ---------- Meeting ----------
let mKey = '', mLines = 0, mVoteKey = '';
export function resetMeeting() { mKey = ''; mLines = 0; mVoteKey = ''; $('mChat').innerHTML = ''; show('ejectStrip', false); }
export function renderMeeting(v, act, multi) {
  const { pub, priv } = v; const m = pub.meeting;
  const key = m.title + m.reason;
  if (key !== mKey) {
    resetMeeting(); mKey = key;
    $('mTitle').textContent = m.title; $('mReason').textContent = m.reason;
    const notes = priv.notes;
    $('mNotes').innerHTML = priv.alive
      ? '<b>Your notes</b><br>' + (notes.length ? notes.slice(-8).map(n => `<div class="${n.hard ? 'hard' : ''}">· ${n.text}</div>`).join('') : 'You saw nothing useful.')
      : "<b>You're a ghost.</b> Ghosts can't vote, but they can watch.";
    show('chatForm', multi && priv.alive);
  }
  while (mLines < m.lines.length) {
    const l = m.lines[mLines++]; const c = pub.chars[l.who];
    const p = document.createElement('p'); p.innerHTML = `<span class="who" style="color:${c.color}">${esc(c.name)}${c.id === priv.me ? ' (you)' : ''}</span>: ${esc(l.text)}`;
    $('mChat').appendChild(p); $('mChat').scrollTop = 1e6;
  }
  const vk = [m.phase, priv.voted, priv.accused, m.voted.join(','), JSON.stringify(m.tally)].join('|');
  if (vk !== mVoteKey) {
    mVoteKey = vk;
    const box = $('mVotes'); box.innerHTML = '';
    const canAct = priv.alive && m.phase !== 'result' && priv.voted === null;
    for (const c of pub.chars.filter(c => c.alive)) {
      const row = document.createElement('div'); row.className = 'vrow';
      const vb = document.createElement('button');
      vb.innerHTML = `<span class="dot" style="background:${c.color}"></span>${esc(c.name)}${c.id === priv.me ? ' (you)' : ''}${m.voted.includes(c.id) ? ' <span class="voted-tag">voted</span>' : ''}`;
      vb.disabled = !canAct || c.id === priv.me || m.phase === 'talk'; vb.onclick = () => act('vote', c.id);
      row.appendChild(vb);
      if (c.id !== priv.me) {
        const ab = document.createElement('button'); ab.className = 'acc'; ab.textContent = 'Accuse';
        ab.disabled = !priv.alive || priv.accused || m.phase === 'result'; ab.onclick = () => act('accuse', c.id);
        row.appendChild(ab);
      }
      const t = document.createElement('span'); t.className = 'tally';
      t.textContent = m.tally && m.tally[c.id] ? '●'.repeat(m.tally[c.id]) : '';
      row.appendChild(t); box.appendChild(row);
    }
    const sk = document.createElement('button'); sk.textContent = priv.voted === -1 ? 'Skipped' : 'Skip vote';
    sk.disabled = !canAct || m.phase === 'talk'; sk.onclick = () => act('vote', -1);
    box.appendChild(sk);
    if (m.phase === 'result' && m.ejected !== null) {
      show('ejectStrip', true); $('ejectDot').style.background = pub.chars[m.ejected].color;
    }
  }
  $('mTimer').innerHTML = m.phase === 'talk' ? 'Everyone is talking...' : m.phase === 'vote' ? (priv.alive ? (priv.voted === null ? `Vote now: ${m.voteT}s` : `You voted. ${m.voteT}s left.`) : `Votes close in ${m.voteT}s`) : `<b>${esc(m.result)}</b>`;
}

// ---------- Results ----------
export function renderOver(v, isHost, solo) {
  const { pub, priv } = v; const o = pub.over;
  $('oTitle').textContent = priv.won ? 'You win' : 'You lose';
  $('oTitle').style.color = priv.won ? 'var(--gold)' : 'var(--red)';
  $('oText').textContent = o.text;
  const mins = Math.floor(o.t / 60), secs = Math.floor(o.t % 60);
  $('oStats').textContent = `${mins}:${String(secs).padStart(2, '0')} long · ${o.stats.poisonings} poisoning${o.stats.poisonings === 1 ? '' : 's'} · ${o.stats.stabs} stab${o.stats.stabs === 1 ? '' : 's'} · ${o.stats.meetings} meeting${o.stats.meetings === 1 ? '' : 's'} · bankroll ${money(pub.bank)}`;
  show('againBtn', solo || isHost); show('overWait', !solo && !isHost);
  $('againBtn').textContent = solo ? 'Play again' : 'Back to lobby';
}
