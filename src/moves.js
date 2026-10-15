// The HUD for the v4 moves: the killer bar (6 moves and 7 for a pressed edge), the name picker for drinks and haunts, the security desk card,
// the ghost's haunt button and the poison warning. Everything goes to the sim through act().
import { money, esc, secs } from './util.js';
import { CFG } from './config.js';
import { $, quietNote } from './ui.js';
import { PERK, ACTIVE } from './perks.js';
import { ROOMS } from './map.js';
import { initBar, openMixer, barOpen, barKey, updateBar, resetBar } from './bar.js';

const KILL_KEYS = ['order', 'rig', 'blade', 'accident', 'disguise', 'lights'];
const LABELS = { order: 'Poison', rig: 'Rig', blade: 'Knife', accident: 'Accident', disguise: 'Disguise', lights: 'Blackout' };
const TIPS = {
  order: 'At the bar: mix a poisoned drink and send it to anyone.',
  rig: 'Next to a game nobody is playing, or a snack bowl: the next gambler to use it dies.',
  blade: 'Right behind someone: they scream, and anyone nearby hears it.',
  accident: 'Shove someone by the duck pond in, or loosen a chandelier with people under it.',
  disguise: 'Look like your last victim for 30 seconds.',
  lights: 'Cut the power. While it is out, T turns you into a giant monster that kills everyone it catches, no limit, until they reset the breakers: 3 grabs whoever is within reach, E pounces.',
};
const FEEDS = [['floor', 'Floor'], ['bar', 'Bar'], ['arcade', 'Arcade'], ['race', 'Pond'], ['slots', 'Slots'], ['vip', 'VIP']];

let act = () => {}, unlock = () => {}, relock = () => {}, picker = null, last = null;

export function initMoves(opts) {
  ({ act, unlock, relock } = opts);
  const bar = $('killerBar');
  bar.innerHTML = KILL_KEYS.map((k, i) => `<button data-move="${k}" title="${esc(TIPS[k])}"><b>${i + 1}</b><span> ${LABELS[k]}</span><i></i></button>`).join('') +
    '<button data-move="perk" class="edge hidden"><b>7</b> <span></span><i></i></button><span class="kb-wait hidden"></span>'; // (the moves that wait, folded into one chip)
  bar.querySelectorAll('[data-move]').forEach(b => { b.onclick = () => { move(b.dataset.move); if (document.body.classList.contains('touch')) movesFan(false); }; });
  // phones: the killer bar folds into one Moves button by the thumb; a tap fans the moves out above it
  const mb = $('movesBtn');
  mb.addEventListener('touchstart', e => { e.preventDefault(); movesFan(!document.body.classList.contains('movesOpen')); }, { passive: false });
  mb.addEventListener('click', () => movesFan(!document.body.classList.contains('movesOpen')));
  const hud = $('hud');
  const el = (id, cls, html = '') => { const d = document.createElement('div'); d.id = id; if (cls) d.className = cls; d.innerHTML = html; hud.appendChild(d); return d; };
  el('picker', 'hidden', '<div class="pk-title"></div><div class="pk-list"></div><button class="pk-x">Cancel</button>');
  $('picker').querySelector('.pk-x').onclick = closePicker;
  el('secCard', 'hidden');
  el('ghostBar', 'hidden', '<button id="hauntBtn">H · Haunt someone</button>');
  $('hauntBtn').onclick = () => move('haunt');
  el('sickBar', 'hidden');
  initBar({ act, unlock, relock });
}

// Keys 1-7, G and H. Returns true when the key was ours.
export function keyMove(k) {
  if (barKey(k)) return true;
  if (picker && k === 'escape') { closePicker(); return true; }
  if (picker && /^[0-9]$/.test(k)) { const b = $('picker').querySelectorAll('.pk-list button')[(+k + 9) % 10]; if (b) b.click(); return true; }
  const i = '123456'.indexOf(k);
  if (i >= 0) { move(KILL_KEYS[i]); return true; }
  if (k === '7') { move('perk'); return true; }
  if (k === 'g') { move('send'); return true; } // the mixer, at the bar
  if (k === 'q') { move('shoot'); return true; } // the revolver
  if (k === 'h') { move('haunt'); return true; }
  if (k === 'b') { move('gear'); return true; } // escape mode: spend your winnings on gear
  if (k === 't') { move('transform'); return true; } // in a blackout, the killer turns into the monster
  if (k === 'e' && last && last.priv.monster) { move('leap'); return true; } // the monster's pounce (E; the monster has nothing else to use)
  return false;
}

function move(k) {
  const v = last; if (!v) return;
  const { pub, priv } = v;
  if (k === 'order' || k === 'send') {
    if (!priv.alive || (k === 'order' && !priv.isKiller)) return;
    if (!priv.atBar || (k === 'order' && priv.cd.order > 0)) return act(k); // the sim says where to go, or how long to wait
    openMixer(k === 'order' ? { poison: 1 } : null); // (the bartender's mixer: bar.js)
  } else if (k === 'shoot') {
    if (priv.alive && priv.bullets > 0) act('shoot');
  } else if (k === 'perk') { // the edge on key 7: killer sense, or the jackpot lure (pick a room)
    if (!priv.isKiller || !priv.alive || !ACTIVE.has(priv.perk)) return;
    if (priv.perk === 'lure' && !(priv.cd.lure > 0) && !priv.seat) openPicker('Set off a jackpot siren in...', Object.entries(ROOMS).map(([id, r]) => ({ id, name: cap(r.name), color: '#e8c46a' })), id => act('lure', id));
    else act(priv.perk);
  } else if (k === 'haunt') {
    if (priv.alive || priv.hauntUsed || priv.isKiller) return;
    openPicker('Haunt...', pub.chars.filter(c => c.alive), id => act('haunt', id));
  } else if (k === 'gear') {
    if (!pub.escape || !priv.alive || priv.isKiller) return;
    const items = Object.entries(CFG.gear).filter(([id]) => !(priv.gear || []).includes(id))
      .map(([id, g]) => ({ id, name: `${g.name} · ${money(g.price)} · ${g.tip}`, color: priv.wallet >= g.price ? '#6aff9a' : '#806870' }));
    if (!items.length) return;
    openPicker(`Your winnings: ${money(priv.wallet)}. Buy...`, items, id => act('gear', id));
  } else if (priv.isKiller && priv.alive) act(k);
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// The staff passages: E at a STAFF ONLY door picks the door to come out of.
export function staffPicker(doors, here) {
  openPicker('Come out in...', doors.filter(d => d.id !== here).map(d => ({ id: d.id, name: cap(ROOMS[d.room].name), color: '#c8b890' })), id => act('staff', id));
}
function openPicker(title, chars, pick) {
  const p = $('picker');
  p.querySelector('.pk-title').textContent = title;
  p.classList.toggle('many', chars.length > 12); // a big room's names in five columns
  const list = p.querySelector('.pk-list'); list.innerHTML = '';
  chars.forEach((c, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="pk-dot" style="background:${c.color}"></span>${i < 10 ? `<b>${(i + 1) % 10}</b> ` : ''}${esc(c.name)}`;
    b.onclick = () => { closePicker(); pick(c.id); };
    list.appendChild(b);
  });
  p.classList.remove('hidden'); picker = { pick }; unlock();
}
function closePicker() { if (!picker) return; picker = null; $('picker').classList.add('hidden'); relock(); }
export const pickerOpen = () => !!picker || barOpen();
function movesFan(on) { document.body.classList.toggle('movesOpen', !!on); $('movesBtn').setAttribute('aria-expanded', on ? 'true' : 'false'); }
// Leaving a game: nothing it opened stays on screen.
export function resetMoves() { resetBar(); picker = null; last = null; $('picker').classList.add('hidden'); document.body.classList.remove('sick', 'ghost'); movesFan(false); }

export function updateMoves(v) {
  last = v;
  const { pub, priv } = v;
  const play = pub.mode === 'play' && !pub.over;
  if (!play && picker) closePicker();
  // killer bar
  $('killerBar').classList.toggle('hidden', !(priv.isKiller && priv.alive));
  if (priv.isKiller && priv.alive) for (const k of KILL_KEYS) {
    const b = document.querySelector(`#killerBar [data-move=${k}]`), cd = priv.cd[k] || 0;
    const noVictim = k === 'disguise' && !priv.disguise && !priv.canDisguise; // a disguise is your last victim's look
    const mon = priv.monster && k === 'blade'; // (the monster's grab: 3, never on the knife's cooldown)
    b.disabled = (cd > 0 && !mon) || noVictim; b.title = noVictim ? 'Needs a victim first' : '';
    b.querySelector('i').textContent = mon ? '' : k === 'disguise' && priv.disguise ? ` ${priv.disguise.t}s on` : cd > 0 ? ' ' + secs(cd) : noVictim ? ' no victim' : ''; // while it's on, the time left beats the cooldown
    b.classList.toggle('cool', b.disabled && !(k === 'disguise' && priv.disguise)); // a move that isn't ready folds to its key and the wait
  }
  // PC: the moves that aren't ready fold into one chip: their keys and the soonest wait (phones: the Moves fan shows them all)
  if (priv.isKiller && priv.alive) {
    const cool = [...KILL_KEYS.map((k, i) => [k, i + 1, priv.cd[k] || 0]), ['perk', 7, priv.cd[priv.perk] || 0]].filter(([k]) => { const b = document.querySelector(`#killerBar [data-move=${k}]`); return !b.classList.contains('hidden') && b.classList.contains('cool'); });
    const soon = Math.min(...cool.map(c => c[2]).filter(t => t > 0)), w = cool.length ? `<b>${cool.map(c => c[1]).join(' ')}</b> ${isFinite(soon) ? 'next ready ' + secs(soon) : 'need a victim'}` : '';
    const kw = document.querySelector('#killerBar .kb-wait'); if (kw.innerHTML !== w) { kw.innerHTML = w; kw.classList.toggle('hidden', !w); }
  }
  const eb = document.querySelector('#killerBar [data-move=perk]'), active = priv.isKiller && priv.alive && ACTIVE.has(priv.perk);
  eb.classList.toggle('hidden', !active);
  if (active) {
    const cd = priv.cd[priv.perk] || 0, on = priv.perk === 'sense' && priv.senseT > 0;
    eb.disabled = cd > 0 && !on; eb.title = PERK[priv.perk].text; eb.classList.toggle('cool', eb.disabled);
    const lab = priv.perk === 'sense' ? 'Sense' : 'Lure', left = on ? ' on' : cd > 0 ? ' ' + secs(cd) : '';
    if (eb.querySelector('span').textContent !== lab) eb.querySelector('span').textContent = lab;
    if (eb.querySelector('i').textContent !== left) eb.querySelector('i').textContent = left;
  }
  updateBar(v);
  const gun = play && priv.alive && priv.bullets > 0;
  $('gunHud').classList.toggle('hidden', !gun); $('shootBtn').classList.toggle('hidden', !gun);
  if (gun) { const t = `REVOLVER ×${priv.bullets} · ${document.body.classList.contains('touch') ? 'SHOOT' : 'Q'}`; if ($('gunHud').textContent !== t) $('gunHud').textContent = t; }
  // phones: the buttons by the right thumb only when they can do something (Steve, 2026-10-15: "too many buttons at the
  // bottom"): Use always; Sip and Pour with a drink in hand; Check with a drink, at a game or by a snack bowl; Light in a
  // blackout, Shoot with a bullet, Moves for a killer, Pounce for the monster
  const alive = play && priv.alive && !priv.monster, held = alive && !!priv.drink; // (the monster's hands are full)
  for (const [a, on] of [['sip', held], ['pour', held], ['inspect', alive && (held || (!!priv.seat && priv.seat.game !== 'cams' && priv.seat.game !== 'vip') || /^Eat/.test(priv.ctx || ''))]]) {
    const b = document.querySelector(`#touchBtns [data-act=${a}]`); if (b && b.classList.contains('hidden') === on) b.classList.toggle('hidden', !on);
  }
  const ck = document.querySelector('#touchBtns [data-act=inspect]'), ckt = priv.inspectT > 0 ? 'Checking' : quietNote() ? 'Fine' : 'Check'; if (ck && ck.textContent !== ckt) ck.textContent = ckt; // (the check in progress)
  const killer = play && priv.alive && priv.isKiller, mb = $('movesBtn'); // (the monster keeps it: its 3 grabs)
  if (mb.classList.contains('hidden') === killer) mb.classList.toggle('hidden', !killer);
  if (!killer && document.body.classList.contains('movesOpen')) movesFan(false);
  if (killer) { const n = [...document.querySelectorAll('#killerBar [data-move]')].filter(b => !b.classList.contains('hidden') && !b.disabled).length, t = n ? `Moves ${n}` : 'Moves'; if (mb.textContent !== t) mb.textContent = t; }
  $('flashBtn').classList.toggle('hidden', !(play && priv.alive && !priv.isKiller && pub.blackout)); $('flashBtn').classList.toggle('on', !!priv.flash);
  const lb = $('leapBtn'); if (lb) { lb.classList.toggle('hidden', !(play && priv.alive && priv.monster)); lb.disabled = !!(priv.leap || priv.leapCd > 0); } // the monster's pounce (E)
  // ghosts
  $('ghostBar').classList.toggle('hidden', !(play && !priv.alive && !priv.isKiller)); // killers' ghosts don't haunt
  if (!priv.alive) { $('hauntBtn').disabled = priv.hauntUsed; $('hauntBtn').textContent = priv.hauntUsed ? 'Haunted (again after the next meeting)' : 'H · Haunt someone'; }
  // poison
  const sick = play && priv.alive && priv.sick;
  $('sickBar').classList.toggle('hidden', !sick);
  if (sick) $('sickBar').textContent = pub.antidotes > 0 ? `POISONED · ${priv.poisonT}s · antidote at the bar (${pub.antidotes} left)` : `POISONED · ${priv.poisonT}s · no antidote left`;
  // the security desk
  const desk = play && priv.alive && priv.seat && priv.seat.game === 'cams';
  const card = $('secCard');
  card.classList.toggle('hidden', !desk);
  if (desk) {
    const S = pub.security, key = [S.cams, S.feed, !!pub.guard, pub.guard && pub.guard.t, S.guardPrice, pub.bank > S.guardPrice * 2].join();
    if (card.dataset.key !== key) {
      card.dataset.key = key;
      card.innerHTML = `<b>Security desk</b>
        <p>The cameras run while you sit here. Pick a room to watch.</p>
        ${S.cams ? `<div class="feeds">${FEEDS.map(([k, n]) => `<button data-feed="${k}" class="${S.feed === k ? 'on' : ''}">${n}</button>`).join('')}</div><p>Live: ${esc(FEEDS.find(f => f[0] === S.feed)[1])}. You see anything that happens in that room.</p>` : '<p>The cameras are warming up...</p>'}
        <button data-buy="guard" ${pub.guard || pub.bank < S.guardPrice * 2 ? 'disabled' : ''}>${pub.guard ? `Guard on patrol · ${Math.ceil(pub.guard.t / 60)} min` : `Hire a guard (2 min) · ${money(S.guardPrice)} from the crew bank`}</button>`;
      card.querySelectorAll('[data-buy]').forEach(b => { b.onclick = () => act('buy', b.dataset.buy); });
      card.querySelectorAll('[data-feed]').forEach(b => { b.onclick = () => act('feed', b.dataset.feed); });
    }
  } else card.dataset.key = '';
  document.body.classList.toggle('cctv', !!(desk && pub.security.cams));
  document.body.classList.toggle('sick', !!sick);
  document.body.classList.toggle('ghost', play && !priv.alive);
}
