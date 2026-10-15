// The bar's two screens (Steve, 2026-10-15). The mixer: talk to the bartender and pour anything, any ingredients in any
// ratio (mix.js), for yourself or anyone, poison included for anyone who wants it; it shows everyone's thirst and hunger,
// so you know who a drink would tempt. The shady guy in the corner: your winnings buy what the house doesn't sell, up to
// a revolver that takes about a jackpot. Both go to the sim through act(); the sim checks everything again.
import { INGREDIENTS, RECIPES, ING, MAX_PART, MAX_PARTS, mixInfo, smellWord } from './mix.js';
import { CFG } from './config.js';
import { money, esc, secs } from './util.js';
import { $ } from './ui.js';

let act = () => {}, unlock = () => {}, relock = () => {}, open = null, parts = {}, to = null, last = null, peopleKey = '', shopKey = '';
const CLASSICS = RECIPES.slice(0, 15);

export function initBar(o) {
  ({ act, unlock, relock } = o);
  const hud = $('hud'), el = (id, html) => { const d = document.createElement('div'); d.id = id; d.className = 'barCard hidden'; d.innerHTML = html; hud.appendChild(d); return d; };
  const mx = el('mixer', `<div class="bc-head"><b>The bartender</b><span>"What'll it be? Anything you like, any way you like it."</span><button class="bc-x" aria-label="Close">&times;</button></div>
<div class="mx-body"><div class="mx-ings">${INGREDIENTS.map(i => `<div class="mx-ing${i.poison ? ' poison' : ''}" data-id="${i.id}"><i style="background:${i.color}"></i><span>${i.poison ? '☠ ' : ''}${esc(i.name)}</span><button class="dn" aria-label="Less ${esc(i.name)}">&minus;</button><b>0</b><button class="up" aria-label="More ${esc(i.name)}">+</button></div>`).join('')}</div>
<div class="mx-side"><div class="mx-glass"><div class="mx-fill"></div><div class="mx-shine"></div></div><div class="mx-name"></div><div class="mx-stats"></div><div class="mx-pz"></div>
<div class="mx-classics">${CLASSICS.map((r, i) => `<button data-r="${i}">${esc(r.name)}</button>`).join('')}</div></div></div>
<div class="mx-for"><div class="mx-lab">FOR <span>thirst · hunger</span></div><div class="mx-people"></div></div>
<div class="mx-foot"><button class="mx-clear">Empty the glass</button><button class="mx-pour">Pour it</button></div>`);
  mx.querySelector('.bc-x').onclick = closeBar;
  mx.querySelectorAll('.mx-ing').forEach(r => {
    const id = r.dataset.id;
    r.querySelector('.up').onclick = () => setPart(id, (parts[id] || 0) + 1);
    r.querySelector('.dn').onclick = () => setPart(id, (parts[id] || 0) - 1);
  });
  mx.querySelectorAll('.mx-classics button').forEach(b => { b.onclick = () => { const keep = parts.poison || 0; parts = { ...CLASSICS[+b.dataset.r].parts }; if (keep) parts.poison = keep; drawMix(); }; });
  mx.querySelector('.mx-clear').onclick = () => { parts = {}; drawMix(); };
  mx.querySelector('.mx-pour').onclick = pour;
  mx.querySelector('.mx-people').onclick = e => { const b = e.target.closest('[data-to]'); if (b) { to = +b.dataset.to; drawMix(); } };
  const sh = el('shop', `<div class="bc-head"><b>The shady guy</b><span>"Psst. Winnings only, and no questions."</span><button class="bc-x" aria-label="Close">&times;</button></div>
<div class="sh-wallet"></div><div class="sh-list"></div>`);
  sh.querySelector('.bc-x').onclick = closeBar;
  sh.querySelector('.sh-list').onclick = e => { const b = e.target.closest('[data-buy]'); if (b && !b.disabled) act('shop', b.dataset.buy); };
}

export const barOpen = () => !!open;
// preset: parts to start from (the killer's move 1 starts with a part of poison).
export function openMixer(preset) {
  if (!last || !last.priv.atBar) return;
  if (open) closeBar(true);
  open = 'mix'; parts = preset ? { ...preset } : {}; to = last.priv.me; peopleKey = '';
  $('mixer').classList.remove('hidden'); unlock(); drawMix();
}
export function openShop() {
  if (!last || !last.priv.shop) return;
  if (open) closeBar(true);
  open = 'shop'; shopKey = '';
  $('shop').classList.remove('hidden'); unlock(); drawShop();
}
export function closeBar(quiet) {
  if (!open) return;
  $(open === 'mix' ? 'mixer' : 'shop').classList.add('hidden'); open = null;
  if (!quiet) relock();
}
export function resetBar() { if (open) closeBar(true); last = null; }
// Keys while a screen is open: Esc closes it, Enter pours. Everything else (walking) goes on as usual.
export function barKey(k) {
  if (!open) return false;
  if (k === 'escape') { closeBar(); return true; }
  if (k === 'enter' && open === 'mix') { pour(); return true; }
  return false;
}

export function updateBar(v) {
  last = v;
  if (!open) return;
  const { pub, priv } = v, play = pub.mode === 'play' && !pub.over && priv.alive;
  if (!play || (open === 'mix' && !priv.atBar) || (open === 'shop' && !priv.shop)) { closeBar(); return; } // (walked off)
  if (open === 'mix') drawPeople(); else drawShop();
}

function setPart(id, n) {
  const total = Object.values(parts).reduce((a, b) => a + b, 0) - (parts[id] || 0);
  n = Math.max(0, Math.min(MAX_PART, n, MAX_PARTS - total));
  if (n) parts[id] = n; else delete parts[id];
  drawMix();
}
function pour() {
  if (!last || !mixInfo(parts) || to === null) return;
  if (parts.poison && to === last.priv.me) return;
  act('mix', { to, parts: { ...parts } }); closeBar();
}

function bar(label, v, color) { return `<div class="mx-stat"><span>${label}</span><i><b style="width:${Math.round(Math.min(1, v) * 100)}%;background:${color}"></b></i></div>`; }
function drawMix() {
  const card = $('mixer'), info = mixInfo(parts), total = Object.values(parts).reduce((a, b) => a + b, 0);
  card.querySelectorAll('.mx-ing').forEach(r => {
    const n = parts[r.dataset.id] || 0; r.querySelector('b').textContent = n; r.classList.toggle('on', n > 0);
    r.querySelector('.up').disabled = n >= MAX_PART || total >= MAX_PARTS;
    r.querySelector('.dn').disabled = n <= 0;
  });
  const fill = card.querySelector('.mx-fill');
  fill.style.height = Math.round(total / MAX_PARTS * 100) + '%'; fill.style.background = info ? info.color : 'transparent';
  card.querySelector('.mx-name').textContent = info ? info.name : 'Pick a classic, or pour your own.';
  // a sip, from CFG: thirst sipGain * q, hunger mixFood * f, luck boozeLuck * a seconds
  card.querySelector('.mx-stats').innerHTML = info ? bar('Quench', info.q / 1.4, '#6ac0e8') + bar('Fills', info.f, '#e0a95b') + bar('Luck', info.a, '#e8c46a') +
    `<div class="mx-sip">A sip: thirst +${Math.round(CFG.sipGain * info.q)}${info.f ? `, hunger +${Math.round(CFG.mixFood * info.f)}` : ''}${info.a >= 0.1 ? `, lucky ${Math.round(CFG.boozeLuck * info.a)}s` : ''}</div>` : '';
  drawPoison(info);
  drawPeople(true);
}
function drawPoison(info) {
  const p = last && last.priv, cd = p ? p.mixCd || 0 : 0, pz = $('mixer').querySelector('.mx-pz'), row = $('mixer').querySelector('.mx-ing.poison');
  row.querySelector('.up').disabled ||= cd > 0;
  row.title = cd > 0 ? `The bartender is watching you. Poison again in ${secs(cd)}.` : 'Nobody can see it, nobody can taste it. Somebody might smell it.';
  pz.innerHTML = info && info.poison ? `☠ Poisoned: kills in about ${Math.round(CFG.poisonDelay * info.speed)}s · ${smellWord(info.smell)}${p && to === p.me ? '<br><b>Pick someone else to send it to.</b>' : ''}`
    : cd > 0 ? `☠ Poison again in ${secs(cd)}` : '';
  pz.classList.toggle('on', !!(info && info.poison));
}
// Everyone alive, you first: who it's for, with their thirst and hunger (the sim sends them at the bar: priv.needs).
function drawPeople(force) {
  const { pub, priv } = last, needs = priv.needs || [];
  const byId = new Map(pub.chars.map(c => [c.id, c]));
  const rows = needs.map(([id, t, h]) => ({ id, t, h, c: byId.get(id) })).filter(r => r.c).sort((a, b) => (b.id === priv.me) - (a.id === priv.me) || a.id - b.id);
  if (to !== null && !rows.some(r => r.id === to)) to = priv.me;
  const key = rows.map(r => [r.id, r.t >> 2, r.h >> 2, r.c.name].join()).join('|') + '/' + to + '/' + (priv.mixCd || 0);
  if (!force && key === peopleKey) return;
  peopleKey = key;
  const lvl = (v, c) => `<i><b style="width:${v}%;background:${v < 25 ? '#e8443a' : c}"></b></i>`;
  $('mixer').querySelector('.mx-people').innerHTML = rows.map(r => `<button data-to="${r.id}" class="${r.id === to ? 'on' : ''}"><span class="pk-dot" style="background:${r.c.color}"></span><span class="nm">${r.id === priv.me ? 'Me' : esc(r.c.name)}</span>${lvl(r.t, '#6ac0e8')}${lvl(r.h, '#e0a95b')}</button>`).join('');
  const info = mixInfo(parts), pourBtn = $('mixer').querySelector('.mx-pour');
  pourBtn.disabled = !info || (!!info.poison && to === priv.me);
  pourBtn.textContent = !info ? 'Pour it' : to === priv.me ? 'Pour it for me' : `Send it to ${(byId.get(to) || { name: '?' }).name}`;
  drawPoison(info);
}

function itemOf(id) { return CFG.shop[id] || CFG.gear[id]; }
function drawShop() {
  const { priv } = last, w = priv.wallet || 0, list = priv.shop || [];
  const key = w + '/' + JSON.stringify(list);
  if (key === shopKey) return;
  shopKey = key;
  const card = $('shop');
  card.querySelector('.sh-wallet').innerHTML = `Your winnings: <b>${money(w)}</b>`;
  card.querySelector('.sh-list').innerHTML = list.map(s => {
    const it = itemOf(s.id), can = w >= s.price && !s.have;
    return `<div class="sh-item${s.id === 'gun' ? ' gun' : ''}"><div><b>${esc(it.name)}</b><span>${esc(it.tip)}</span></div><button data-buy="${s.id}"${can ? '' : ' disabled'}>${s.have ? 'Yours' : money(s.price)}</button></div>`;
  }).join('');
}
