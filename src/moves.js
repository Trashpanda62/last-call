// The HUD for the v4 moves: the killer bar (6 moves), the name picker for drinks and haunts, the security desk card,
// the ghost's haunt button and the poison warning. Everything goes to the sim through act().
import { money, esc } from './util.js';
import { $ } from './ui.js';

const KILL_KEYS = ['order', 'rig', 'blade', 'accident', 'disguise', 'lights'];
const LABELS = { order: 'Poison order', rig: 'Rig', blade: 'Knife', accident: 'Accident', disguise: 'Disguise', lights: 'Lights' };
const TIPS = {
  order: 'At the bar: send a poisoned drink "on the house" to anyone.',
  rig: 'Next to an empty seat or a snack bowl: the next gambler to use it dies.',
  blade: 'Right behind someone: they scream, and anyone nearby hears it.',
  accident: 'Shove someone by the duck pond in, or loosen a chandelier with people under it.',
  disguise: 'Look like your last victim for 30 seconds.',
  lights: 'Cut the lights for everyone.',
};
const FEEDS = [['floor', 'Floor'], ['bar', 'Bar'], ['arcade', 'Arcade'], ['race', 'Pond'], ['slots', 'Slots'], ['alley', 'Alley'], ['vip', 'VIP']];

let act = () => {}, unlock = () => {}, relock = () => {}, picker = null, last = null;

export function initMoves(opts) {
  ({ act, unlock, relock } = opts);
  const bar = $('killerBar');
  bar.innerHTML = KILL_KEYS.map((k, i) => `<button data-move="${k}" title="${esc(TIPS[k])}"><b>${i + 1}</b> ${LABELS[k]}<i></i></button>`).join('');
  bar.querySelectorAll('[data-move]').forEach(b => { b.onclick = () => move(b.dataset.move); });
  const hud = $('hud');
  const el = (id, cls, html = '') => { const d = document.createElement('div'); d.id = id; if (cls) d.className = cls; d.innerHTML = html; hud.appendChild(d); return d; };
  el('picker', 'hidden', '<div class="pk-title"></div><div class="pk-list"></div><button class="pk-x">Cancel</button>');
  $('picker').querySelector('.pk-x').onclick = closePicker;
  el('secCard', 'hidden');
  el('ghostBar', 'hidden', '<button id="hauntBtn">H · Haunt someone</button>');
  $('hauntBtn').onclick = () => move('haunt');
  el('sickBar', 'hidden');
  el('sendBtn', 'hidden', 'G · Send a drink');
  $('sendBtn').onclick = () => move('send');
}

// Keys 1-6, G and H. Returns true when the key was ours.
export function keyMove(k) {
  if (picker && k === 'escape') { closePicker(); return true; }
  if (picker && /^[0-9]$/.test(k)) { const b = $('picker').querySelectorAll('.pk-list button')[(+k + 9) % 10]; if (b) b.click(); return true; }
  const i = '123456'.indexOf(k);
  if (i >= 0) { move(KILL_KEYS[i]); return true; }
  if (k === 'g') { move('send'); return true; }
  if (k === 'h') { move('haunt'); return true; }
  return false;
}

function move(k) {
  const v = last; if (!v) return;
  const { pub, priv } = v;
  if (k === 'order' || k === 'send') {
    if (!priv.alive || (k === 'order' && !priv.isKiller)) return;
    if (!priv.atBar) return act(k); // the sim says where to go
    const who = pub.chars.filter(c => c.alive && c.id !== priv.me && !(k === 'order' && priv.killers.includes(c.id)));
    openPicker(k === 'order' ? 'Poison a drink for...' : 'Send a free drink to...', who, id => act(k, id));
  } else if (k === 'haunt') {
    if (priv.alive || priv.hauntUsed) return;
    openPicker('Haunt...', pub.chars.filter(c => c.alive), id => act('haunt', id));
  } else if (priv.isKiller && priv.alive) act(k);
}

function openPicker(title, chars, pick) {
  const p = $('picker');
  p.querySelector('.pk-title').textContent = title;
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
export const pickerOpen = () => !!picker;

export function updateMoves(v) {
  last = v;
  const { pub, priv } = v;
  const play = pub.mode === 'play' && !pub.over;
  if (!play && picker) closePicker();
  // killer bar
  $('killerBar').classList.toggle('hidden', !(priv.isKiller && priv.alive));
  if (priv.isKiller && priv.alive) for (const k of KILL_KEYS) {
    const b = document.querySelector(`#killerBar [data-move=${k}]`), cd = priv.cd[k] || 0;
    b.disabled = cd > 0; b.querySelector('i').textContent = cd > 0 ? ` ${cd}s` : k === 'disguise' && priv.disguise ? ` ${priv.disguise.t}s on` : '';
  }
  $('sendBtn').classList.toggle('hidden', !(play && priv.alive && priv.atBar && !priv.seat));
  // ghosts
  $('ghostBar').classList.toggle('hidden', !(play && !priv.alive));
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
    const S = pub.security, key = [S.cams, S.feed, !!pub.guard, pub.guard && pub.guard.t, S.camsPrice, S.guardPrice, pub.bank > S.camsPrice * 2, pub.bank > S.guardPrice * 2].join();
    if (card.dataset.key !== key) {
      card.dataset.key = key;
      card.innerHTML = `<b>Security desk</b>
        <p>Paid from the crew bank.</p>
        <button data-buy="cams" ${S.cams || pub.bank < S.camsPrice * 2 ? 'disabled' : ''}>${S.cams ? 'Cameras on' : `Cameras · ${money(S.camsPrice)}`}</button>
        <button data-buy="guard" ${pub.guard || pub.bank < S.guardPrice * 2 ? 'disabled' : ''}>${pub.guard ? `Guard on patrol · ${Math.ceil(pub.guard.t / 60)} min` : `Guard (2 min) · ${money(S.guardPrice)}`}</button>
        ${S.cams ? `<div class="feeds">${FEEDS.map(([k, n]) => `<button data-feed="${k}" class="${S.feed === k ? 'on' : ''}">${n}</button>`).join('')}</div><p>Live: ${esc(FEEDS.find(f => f[0] === S.feed)[1])}. You see anything that happens in that room.</p>` : ''}`;
      card.querySelectorAll('[data-buy]').forEach(b => { b.onclick = () => act('buy', b.dataset.buy); });
      card.querySelectorAll('[data-feed]').forEach(b => { b.onclick = () => act('feed', b.dataset.feed); });
    }
  } else card.dataset.key = '';
  document.body.classList.toggle('cctv', !!(desk && pub.security.cams));
}
