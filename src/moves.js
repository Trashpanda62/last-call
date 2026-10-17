// The killer controls, the name picker for drinks and haunts, the security desk card,
// the ghost's haunt button and the poison warning. Everything goes to the sim through act().
import { money, esc, secs } from './util.js';
import { CFG } from './config.js';
import { $, quietNote } from './ui.js';
import { PERK, ACTIVE } from './perks.js';
import { ROOMS } from './map.js';
import { initBar, openMixer, barOpen, barKey, updateBar, resetBar } from './bar.js';

const KILL_KEYS = ['order', 'rig', 'blade', 'accident', 'disguise', 'lights'];
const LABELS = { order: 'Poison', rig: 'Rig', blade: 'Murder', accident: 'Accident', disguise: 'Disguise', lights: 'Blackout' };
const ICONS = { order: 0, rig: 1, blade: 2, accident: 3, disguise: 4, lights: 5, transform: 6, leap: 7, eyes: 8, peek: 9, sense: 10, staff: 11, legs: 12, night: 13, lure: 14, haunt: 15 };
const icon = k => `<em class="ability-icon" data-icon="${ICONS[k] ?? 10}" aria-hidden="true"></em>`;
const KILL_HINTS = ['1', '2', 'LMB', '4', 'RMB', '6'];
const TIPS = {
  order: 'At the bar: mix a poisoned drink and send it to anyone.',
  rig: 'Next to a game nobody is playing, or a snack bowl: the next gambler to use it dies.',
  blade: 'Right behind someone: they scream, and anyone nearby hears it.',
  accident: 'Shove someone by the duck pond in, or loosen a chandelier with people under it.',
  disguise: 'Look like your last victim for 30 seconds.',
  lights: 'Cut the power. While it is out, Q turns you into a giant monster until they reset the breakers: left-click grabs whoever is within reach, Shift leaps.',
};
const FEEDS = [['floor', 'Floor'], ['bar', 'Bar'], ['arcade', 'Arcade'], ['race', 'Pond'], ['slots', 'Slots'], ['vip', 'VIP']];

let act = () => {}, unlock = () => {}, relock = () => {}, picker = null, last = null;
const controls = new Map();
const control = selector => {
  if (!controls.has(selector)) controls.set(selector, document.querySelector(selector));
  return controls.get(selector);
};
const text = (el, value) => { if (el.textContent !== value) el.textContent = value; };
const disabled = (el, on) => { if (el.disabled !== !!on) el.disabled = !!on; };
const title = (el, value) => { if (el.title !== value) el.title = value; };
export const cameraView = () => last?.pub.mode === 'play' && !last.pub.over ? last.priv.cameraFeed || (last.priv.seat?.game === 'cams' && last.pub.security.cams ? last.pub.security.feed : null) : null;

export function initMoves(opts) {
  ({ act, unlock, relock } = opts);
  const bar = $('killerBar');
  bar.innerHTML = KILL_KEYS.map((k, i) => `<button data-move="${k}" title="${esc(TIPS[k])}">${icon(k)}<b>${KILL_HINTS[i]}</b><span> ${LABELS[k]}</span><i></i></button>`).join('') +
    '<button data-move="perk" class="edge hidden"><em class="ability-icon" data-icon="10" aria-hidden="true"></em><b>E</b> <span></span><i></i></button>' +
    '<button data-move="transform" class="hidden"><em class="ability-icon" data-icon="6" aria-hidden="true"></em><b>Q</b> <span>Transform</span><i></i></button>' +
    '<button data-move="leap" class="hidden"><em class="ability-icon" data-icon="7" aria-hidden="true"></em><b>Shift</b> <span>Leap</span><i></i></button><span class="kb-wait hidden"></span>';
  bar.querySelectorAll('[data-move]').forEach(b => { b.onclick = () => { move(b.dataset.move); if (document.body.classList.contains('touch')) movesFan(false); }; });
  const edge = bar.querySelector('[data-move=perk]');
  edge.addEventListener('pointerdown', () => { if (last && last.priv.perk === 'peek') opts.peek(true); });
  addEventListener('pointerup', () => opts.peek(false));
  addEventListener('pointercancel', () => opts.peek(false));
  // phones: the killer bar folds into one Moves button by the thumb; a tap fans the moves out above it
  const mb = $('movesBtn');
  mb.addEventListener('touchstart', e => { e.preventDefault(); movesFan(!document.body.classList.contains('movesOpen')); }, { passive: false });
  mb.addEventListener('click', () => movesFan(!document.body.classList.contains('movesOpen')));
  const hud = $('hud');
  const el = (id, cls, html = '') => { const d = document.createElement('div'); d.id = id; if (cls) d.className = cls; d.innerHTML = html; hud.appendChild(d); return d; };
  el('picker', 'hidden', '<div class="pk-title"></div><div class="pk-list"></div><button class="pk-x">Cancel</button>');
  $('picker').querySelector('.pk-x').onclick = closePicker;
  el('secCard', 'hidden');
  el('ghostBar', 'hidden', '<button id="ghostCamsBtn">C · Cameras</button><button id="hauntBtn">H · Haunt someone</button>');
  $('ghostCamsBtn').onclick = () => act('cameras');
  $('hauntBtn').innerHTML = icon('haunt') + '<span>H · Haunt</span>';
  $('hauntBtn').onclick = () => move('haunt');
  el('sickBar', 'hidden');
  $('insuranceBtn').onclick = () => act('insurance');
  initBar({ act, unlock, relock });
}

// Mouse actions are kept off menus, camera previews and the table's controls.
export function mouseMove(button) {
  if (!last || pickerOpen() || cameraView() || last.priv.seat || !last.priv.alive || !last.priv.isKiller || last.pub.mode !== 'play' || last.pub.over) return false;
  if (button !== 0 && button !== 2) return false;
  // Left click is also the interact button: with something to use in reach (the bartender, a snack, a body...), it
  // stabs only a gambler right in front of the crosshair, so a drink order never knifes the person beside you.
  if (button === 0 && last.priv.ctx && !bladeAimed()) return false;
  move(button === 0 ? 'blade' : 'disguise'); return true;
}
function bladeAimed() {
  const me = last.pub.chars.find(c => c.id === last.priv.me); if (!me) return false;
  return last.pub.chars.some(c => {
    if (!c.alive || c.id === me.id || last.priv.killers.includes(c.id)) return false;
    const d = Math.hypot(c.x - me.x, c.y - me.y); if (d > CFG.reach + 5) return false;
    const a = Math.atan2(c.y - me.y, c.x - me.x) - me.look; return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < Math.max(0.25, 30 / Math.max(d, 1));
  });
}

// Returns true when the key was ours. Number keys remain alternate bindings.
export function keyMove(k) {
  if (barKey(k)) return true;
  if (k === 'escape' && last?.priv.staffInside) { act('staffexit'); return true; }
  if (last && !last.priv.alive && (k === 'c' || (k === 'escape' && last.priv.cameraFeed))) { act('cameras'); return true; }
  if (picker && k === 'escape') { closePicker(); return true; }
  if (picker && /^[0-9]$/.test(k)) { const b = $('picker').querySelectorAll('.pk-list button')[(+k + 9) % 10]; if (b) b.click(); return true; }
  if (picker && ['q', 'e', 'shift'].includes(k)) return true;
  const killer = last && last.priv.isKiller && last.priv.alive && last.pub.mode === 'play' && !last.pub.over;
  if (k === 'q') { move(killer ? 'transform' : 'shoot'); return true; }
  if (k === 'j') { move('shoot'); return true; } // the killer's revolver, since Q transforms
  if (k === 'shift' && killer && last.priv.monster) { move('leap'); return true; }
  if (k === 'e' && killer && !last.priv.seat) {
    if (ACTIVE.has(last.priv.perk) || last.priv.perk === 'staff') { move('perk'); return true; }
    if (last.priv.perk === 'peek' && !last.priv.monster) return true; // held in main.js
  }
  const i = '123456'.indexOf(k);
  if (i >= 0) { move(KILL_KEYS[i]); return true; }
  if (k === '7') { move('perk'); return true; }
  if (k === 'g') { move('send'); return true; } // the mixer, at the bar
  if (k === 'h') { move('haunt'); return true; }
  if (k === 'i') { act('insurance'); return true; }
  if (k === 'b') { move('gear'); return true; } // escape mode: spend your winnings on gear
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
  } else if (k === 'perk') { // E: killer sense, or the jackpot lure (pick a room)
    if (!priv.isKiller || !priv.alive) return;
    if (priv.perk === 'staff') { act('staff'); return; }
    if (!ACTIVE.has(priv.perk)) return;
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
// Camera clicks are handled before world interaction so they cannot attack or use props.
export function cameraMouse(button) {
  if (!last || last.pub.mode !== 'play' || last.pub.over) return false;
  const {priv,pub} = last, desk = priv.seat?.game === 'cams';
  if (!priv.cameraFeed && !desk) return false;
  if (button === 2) { act(priv.staffInside ? 'staffexit' : desk ? 'use' : 'cameras'); return true; }
  if (button === 0) {
    const feeds = priv.staffInside ? ['bar','rest','floor','arcade','vip','slots'] : FEEDS.map(f=>f[0]);
    const current = priv.cameraFeed || pub.security.feed;
    act('feed',feeds[(feeds.indexOf(current)+1)%feeds.length]); return true;
  }
  return false;
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
export function resetMoves() { resetBar(); picker = null; last = null; $('picker').classList.add('hidden'); document.body.classList.remove('sick', 'ghost', 'cctv'); movesFan(false); }

export function updateMoves(v) {
  last = v;
  const { pub, priv } = v;
  const play = pub.mode === 'play' && !pub.over;
  if (!play && picker) closePicker();
  // killer bar
  $('killerBar').classList.toggle('hidden', !(play && priv.isKiller && priv.alive && !priv.seat && !priv.cameraFeed));
  if (priv.isKiller && priv.alive) for (const k of KILL_KEYS) {
    const b = control(`#killerBar [data-move=${k}]`), cd = priv.cd[k] || 0;
    const noVictim = k === 'disguise' && !priv.disguise && !priv.canDisguise; // a disguise is your last victim's look
    const mon = priv.monster && k === 'blade'; // the monster's grab never uses the knife's cooldown
    disabled(b, (cd > 0 && !mon) || noVictim); title(b, noVictim ? 'Needs a victim first' : TIPS[k]);
    text(control(`#killerBar [data-move=${k}] i`), mon ? '' : k === 'disguise' && priv.disguise ? ` ${priv.disguise.t}s on` : cd > 0 ? ' ' + secs(cd) : noVictim ? ' no victim' : ''); // while it's on, the time left beats the cooldown
    b.classList.toggle('cool', b.disabled && !(k === 'disguise' && priv.disguise)); // a move that isn't ready folds to its key and the wait
  }
  // PC: the moves that aren't ready fold into one chip: their keys and the soonest wait (phones: the Moves fan shows them all)
  if (priv.isKiller && priv.alive) {
    const cool = [...KILL_KEYS.map((k, i) => [k, KILL_HINTS[i], priv.cd[k] || 0]), ['perk', 'E', priv.cd[priv.perk] || 0]].filter(([k]) => { const b = control(`#killerBar [data-move=${k}]`); return !b.classList.contains('hidden') && b.classList.contains('cool'); });
    const soon = Math.min(...cool.map(c => c[2]).filter(t => t > 0)), w = cool.length ? `<b>${cool.map(c => c[1]).join(' ')}</b> ${isFinite(soon) ? 'next ready ' + secs(soon) : 'need a victim'}` : '';
    const kw = control('#killerBar .kb-wait'); if (kw.innerHTML !== w) { kw.innerHTML = w; kw.classList.toggle('hidden', !w); }
  }
  const eb = control('#killerBar [data-move=perk]'), active = priv.isKiller && priv.alive && (ACTIVE.has(priv.perk) || priv.perk === 'peek' || priv.perk === 'staff');
  eb.classList.toggle('hidden', !(priv.isKiller && priv.alive && priv.perk));
  text(control('#killerBar [data-move=perk] b'), active ? 'E' : 'PASSIVE');
  if (priv.perk) { const e = control('#killerBar [data-move=perk] .ability-icon'), value = String(ICONS[priv.perk] ?? 10); if (e.dataset.icon !== value) e.dataset.icon = value; }
  if (!active && priv.perk) {
    disabled(eb, true); eb.classList.remove('cool');
    title(eb, PERK[priv.perk].text); text(control('#killerBar [data-move=perk] span'), PERK[priv.perk].name); text(control('#killerBar [data-move=perk] i'), 'Always on');
  }
  if (active) {
    const cd = priv.cd[priv.perk] || 0, on = priv.perk === 'sense' && priv.senseT > 0;
    disabled(eb, cd > 0 && !on); title(eb, PERK[priv.perk].text); eb.classList.toggle('cool', eb.disabled);
    const lab = priv.perk === 'sense' ? 'Sense' : priv.perk === 'lure' ? 'Lure' : priv.perk === 'peek' ? 'Hold to peek' : 'Vents · at a door', left = on ? ' on' : cd > 0 ? ' ' + secs(cd) : '';
    text(control('#killerBar [data-move=perk] span'), lab);
    text(control('#killerBar [data-move=perk] i'), left);
  }
  const transform = control('#killerBar [data-move=transform]');
  transform.classList.toggle('hidden', !(play && priv.alive && priv.isKiller && pub.blackout && !priv.monster));
  const leap = control('#killerBar [data-move=leap]');
  leap.classList.toggle('hidden', !(play && priv.alive && priv.monster));
  disabled(leap, priv.leap || priv.leapCd > 0); text(control('#killerBar [data-move=leap] i'), priv.leapCd > 0 ? ' ' + secs(priv.leapCd) : '');
  updateBar(v);
  const insurance = play && priv.alive && !priv.monster && priv.insurance;
  const policy = $('insuranceBtn'); policy.classList.toggle('hidden', !insurance);
  if (insurance) {
    const state = insurance.state;
    text(policy.querySelector('span'), state === 'round' ? 'Protected' : state === 'armed' ? 'Armed' : 'I · Insure');
    disabled(policy, state !== 'owned'); policy.classList.toggle('armed', state !== 'owned');
    title(policy, state === 'owned' ? 'Arm before your next round: I or right-stick click at a table. Returns net lost stake once.' : state === 'armed' ? 'Next round protected. Wins and ties keep insurance armed.' : 'This round is protected. All its results settle together.');
  }
  const gun = play && priv.alive && priv.bullets > 0;
  $('gunHud').classList.toggle('hidden', !gun); $('shootBtn').classList.toggle('hidden', !gun);
  if (gun) { const t = `REVOLVER ×${priv.bullets} · ${document.body.classList.contains('touch') ? 'SHOOT' : priv.isKiller ? 'J' : 'Q'}`; if ($('gunHud').textContent !== t) $('gunHud').textContent = t; }
  // phones: the buttons by the right thumb only when they can do something (Steve, 2026-10-15: "too many buttons at the
  // bottom"): Use always; Sip and Pour with a drink in hand; Check with a drink, at a game or by a snack bowl; Light in a
  // blackout, Shoot with a bullet, Moves for a killer, Pounce for the monster
  const alive = play && priv.alive && !priv.monster, held = alive && !!priv.drink; // (the monster's hands are full)
  for (const [a, on] of [['sip', held], ['pour', held], ['inspect', alive && (held || (!!priv.seat && priv.seat.game !== 'cams' && priv.seat.game !== 'vip') || /^Eat/.test(priv.ctx || ''))]]) {
    const b = control(`#touchBtns [data-act=${a}]`); if (b && b.classList.contains('hidden') === on) b.classList.toggle('hidden', !on);
  }
  const ck = control('#touchBtns [data-act=inspect]'), ckt = priv.inspectT > 0 ? 'Checking' : quietNote() ? 'Fine' : 'Check'; if (ck) text(ck, ckt); // (the check in progress)
  const killer = play && priv.alive && priv.isKiller && !priv.seat && !priv.cameraFeed, mb = $('movesBtn'); // seated controls belong to the current game
  if (mb.classList.contains('hidden') === killer) mb.classList.toggle('hidden', !killer);
  if (!killer && document.body.classList.contains('movesOpen')) movesFan(false);
  if (killer) { const n = [...KILL_KEYS, 'perk', 'transform', 'leap'].map(k => control(`#killerBar [data-move=${k}]`)).filter(b => !b.classList.contains('hidden') && !b.disabled).length, t = n ? `Moves ${n}` : 'Moves'; text(mb, t); }
  $('flashBtn').classList.toggle('hidden', !(play && priv.alive && !priv.isKiller && pub.blackout)); $('flashBtn').classList.toggle('on', !!priv.flash);
  const lb = $('leapBtn'); if (lb) { lb.classList.toggle('hidden', !(play && priv.alive && priv.monster)); disabled(lb, priv.leap || priv.leapCd > 0); }
  // ghosts
  $('ghostBar').classList.toggle('hidden', !(play && !priv.alive));
  $('hauntBtn').classList.toggle('hidden', !!priv.isKiller);
  text($('ghostCamsBtn'), priv.cameraFeed ? 'C · Close cameras' : 'C · Cameras');
  if (!priv.alive) { disabled($('hauntBtn'), priv.hauntUsed); text(control('#hauntBtn span'), priv.hauntUsed ? 'Haunted (again after the next meeting)' : 'H · Haunt someone'); }
  // poison
  const sick = play && priv.alive && priv.sick;
  $('sickBar').classList.toggle('hidden', !sick);
  if (sick) text($('sickBar'), pub.antidotes > 0 ? `POISONED · ${priv.poisonT}s · antidote at the bar (${pub.antidotes} left)` : `POISONED · ${priv.poisonT}s · no antidote left`);
  // the security desk
  const passage = play && !!priv.staffInside;
  const ghostCams = play && !priv.alive && !!priv.cameraFeed;
  const desk = play && (passage || ghostCams || (priv.alive && priv.seat && priv.seat.game === 'cams'));
  const card = $('secCard');
  card.classList.toggle('hidden', !desk);
  if (desk) {
    const S = ghostCams || passage ? { ...pub.security, cams: true, feed: priv.cameraFeed } : pub.security, key = [passage, ghostCams, S.cams, S.feed, !!pub.guard, pub.guard && pub.guard.t, S.guardPrice, pub.bank > S.guardPrice * 2].join();
    if (card.dataset.key !== key) {
      card.dataset.key = key;
      card.innerHTML = `<b>${passage ? 'Staff passage' : ghostCams ? 'Ghost cameras' : 'Security cameras'}</b>
        <p>Live: ${esc(ROOMS[S.feed]?.name || S.feed)} · Left click: next camera · Right click: exit</p>
        <button data-next-camera>Next camera</button><button data-close-cams>Exit${passage ? ' into this room' : ''}</button>
        ${!passage && !ghostCams ? `<button data-buy="guard" ${pub.guard || pub.bank < S.guardPrice * 2 ? 'disabled' : ''}>${pub.guard ? `Guard on patrol · ${Math.ceil(pub.guard.t / 60)} min` : `Hire a guard (2 min) · ${money(S.guardPrice)} from the crew bank`}</button>` : ''}`;
      card.querySelector('[data-next-camera]').onclick = () => cameraMouse(0);
      card.querySelector('[data-close-cams]').onclick = () => cameraMouse(2);
      card.querySelectorAll('[data-buy]').forEach(b => { b.onclick = () => act('buy', b.dataset.buy); });
      card.querySelectorAll('[data-feed]').forEach(b => { b.onclick = () => act('feed', b.dataset.feed); });
    }
  } else if (card.dataset.key) card.dataset.key = '';
  document.body.classList.toggle('cctv', play && !!(cameraView() || (desk && pub.security.cams)));
  document.body.classList.toggle('sick', !!sick);
  document.body.classList.toggle('ghost', play && !priv.alive);
}
