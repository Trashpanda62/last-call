// DOM side: HUD, meetings and the results screen. Reads views, sends actions through act().
import { money, esc, clamp } from './util.js';
import { CAST } from './config.js';
import { BREAKERS, ROOMS, STAFF_DOORS, roomOf } from './map.js';
import { PERKS, PERK, PERK_ICONS } from './perks.js';

export const $ = id => document.getElementById(id);
// Your marks on other players (Space while walking), by how they look: colour -> 'sus' | 'ok'.
export const marks = new Map();
const markTag = c => marks.get(c.color) === 'sus' ? ' <span class="mk sus">suspect</span>' : marks.get(c.color) === 'ok' ? ' <span class="mk ok">trusted</span>' : '';
const show = (id, on) => $(id).classList.toggle('hidden', !on);
export { show };

// Messages (Steve, 2026-10-15: "too many pop ups to pay attention to"): one at a time, in one place (top centre).
// Chatter the HUD already shows is dropped, and so is a repeat within 15 s. An alert (a scream near you, poison, the
// lights, a meeting) pushes an ordinary message off and otherwise waits its turn for a few seconds; an ordinary message
// (the answer to something you did) never pushes an alert off and is dropped if it can't show within 2.5 s.
const DROP = [
  / left\. A bot took their place\.$/, /^A breaker clunks back on/, /^The security guard's shift is over/, // (the blackout bar ticks breakers off)
  /^Your edge: |^No edge picked/, /^You are (a|the) killer[,.]|of them (is a killer|are killers)\. Watch your drink\.$/, // (the role card says these)
  /^One .+, coming up\.$/, // (the drink line names it)
  /^Your disguise slipped/, /^(Lights out )?[Rr]eady in /, /^You need a victim first/, // (the killer bar shows each move's wait)
  /^(Sniffing|Checking it over)\.\.\. hold still\.$/, // (the line under the crosshair says it; phones: the Check button)
];
const NOT_ALERT = /^Crashed at |Your duck didn't\.$/; // a lost bet is not an emergency
const seenAt = new Map();
let cur = null, waiting = [], toastT = 0;
export let lastToastAt = -1e9; // tips wait for a quiet screen (main.js)
// The quiet answers: an all-clear check and a Space mark show for a moment where you are looking (under the crosshair,
// at a game in the aim line; phones: on the Check button) instead of popping up. A bad check is still an alert.
const QUIET = /^Smells like a perfectly normal |^Just salty pretzels\.$| looks? fine\.$/;
let quiet = null;
export function whisper(text, ms = 2600) { quiet = { text: text.replace(/\.$/, ''), until: performance.now() + ms }; }
export const quietNote = () => quiet && performance.now() < quiet.until ? quiet.text : '';
export function toast(text, bad, tip) {
  const now = performance.now();
  if (!text || DROP.some(r => r.test(text))) return false;
  if (QUIET.test(text)) { whisper(text); return true; }
  const key = text.replace(/\d+/g, '#'); // ("the same message" ignores its numbers)
  if (now - (seenAt.get(key) ?? -1e9) < 15000) return false;
  if (seenAt.size > 200) seenAt.clear();
  seenAt.set(key, now);
  const m = { text, bad: !!bad && !NOT_ALERT.test(text), tip: !!tip, at: now };
  if (!cur || (m.bad && !cur.bad) || (!m.bad && !cur.bad && !m.tip)) { showToast(m); return true; } // the newest answer replaces the last
  if (m.tip) return false;
  waiting = [...waiting.filter(q => q.bad), m].sort((a, b) => b.bad - a.bad).slice(0, 2); // (at most two waiting, alerts first)
  return true;
}
function showToast(m) {
  const touch = document.body.classList.contains('touch'), box = $('toasts'), dur = m.bad ? (touch ? 3400 : 4200) : (touch ? 2400 : 3000);
  const t = document.createElement('div'); t.className = 'toast' + (m.bad ? ' bad' : ''); t.textContent = m.text; t.style.animationDuration = dur + 'ms';
  box.replaceChildren(t); cur = m; lastToastAt = performance.now();
  clearTimeout(toastT); toastT = setTimeout(nextToast, dur);
}
function nextToast() {
  cur = null; $('toasts').replaceChildren(); lastToastAt = performance.now();
  const now = performance.now();
  waiting = waiting.filter(q => now - q.at < (q.bad ? 8000 : 2500)).sort((a, b) => b.bad - a.bad);
  const m = waiting.shift(); if (m) showToast(m);
}
// Leaving a game: nothing waits to pop up over the menu.
export function clearToasts() { clearTimeout(toastT); cur = null; waiting = []; seenAt.clear(); $('toasts').replaceChildren(); }
export function splash(text) {
  $('splashText').textContent = text; show('splash', true);
  const el = $('splashText'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(splash.t); splash.t = setTimeout(() => show('splash', false), 1400);
}

// ---------- HUD ----------
let lastRole = '', bankWas = null, bankFade = 0;
// The HUD runs every frame; touching the DOM only when a value changes keeps the browser from restyling every frame.
const hudLast = new Map();
const put = (id, k, v, set) => { const key = id + k; if (hudLast.get(key) !== v) { hudLast.set(key, v); set($(id), v); } };
const txt = (id, v) => { const e = $(id); if (e.textContent !== v) e.textContent = v; }; // compared with the page itself: main.js clears the hint too
const sty = (id, p, v) => put(id, ':' + p, v, (e, x) => { e.style[p] = x; });
const cls = (id, c, on) => put(id, '.' + c, on, (e, x) => e.classList.toggle(c, x));
export function updateHud(v) {
  const { pub, priv } = v;
  txt('personalAmt', money(priv.wallet || 0));
  txt('phoneStatus', `${pub.chars.filter(c => c.alive).length} alive · ${pub.killersCaught || 0}/${pub.nk} killers caught`);
  const safety = priv.alive && pub.mode === 'play' && !pub.over && !priv.cameraFeed && !priv.monster;
  show('safetyActions', safety && (!!priv.drink || priv.canInspect));
  for (const b of $('safetyActions').querySelectorAll('[data-safety]')) {
    b.classList.toggle('hidden', b.dataset.safety === 'inspect' ? !priv.canInspect : !priv.drink);
    b.disabled = priv.inspectT > 0;
  }
  // the crew's money, big (Steve: the amount left should be very obvious); each change flashes as + or -
  const dk = pub.darkT;
  const gearLine = pub.escape && !priv.isKiller && priv.alive ? ` · your winnings ${money(priv.wallet || 0)} · B: gear${priv.gear && priv.gear.length ? ' (' + priv.gear.length + ')' : ''}` : '';
  txt('bankAmt', money(pub.bank)); txt('bankGoal', !pub.escape ? 'break the bank at ' + money(pub.target) : (dk !== null && dk !== undefined ? `the power goes out in ${Math.floor(dk / 60)}:${String(dk % 60).padStart(2, '0')}` : 'escape') + gearLine); cls('bankAmt', 'low', pub.bank < pub.target * 0.15);
  if (bankWas !== null && pub.bank !== bankWas) {
    const d = pub.bank - bankWas, el = $('bankDelta');
    el.textContent = (d > 0 ? '+' : '-') + money(Math.abs(d)); el.className = 'on ' + (d > 0 ? 'up' : 'down');
    clearTimeout(bankFade); bankFade = setTimeout(() => el.classList.remove('on'), 1600);
  }
  bankWas = pub.bank;
  const ct = pub.closeT; txt('closeT', pub.escape ? '' : `· closes ${Math.floor(ct / 60)}:${String(ct % 60).padStart(2, '0')}`); cls('closeT', 'late', ct <= 120);
  sty('bankFill', 'transform', `scaleX(${clamp(pub.bank / pub.target, 0, 1).toFixed(3)})`);
  sty('thirstFill', 'transform', `scaleX(${(priv.thirst / 100).toFixed(3)})`);
  sty('thirstFill', 'background', priv.thirst < 25 ? '#e8443a' : '#6ac0e8');
  sty('hungerFill', 'transform', `scaleX(${(priv.hunger / 100).toFixed(3)})`);
  sty('hungerFill', 'background', priv.hunger < 25 ? '#e8443a' : '#e0a95b');
  // thirst and hunger: two small icons that grow and name themselves only when low (Steve, 2026-10-15: "more things to keep track of")
  cls('thirst', 'lowT', priv.thirst < 30); cls('thirst', 'lowH', priv.hunger < 30);
  txt('lucky', priv.lucky > 0 ? `Lucky ${priv.lucky}s` : '');
  // the drink line: the drink in your hand, or where to go when it is urgent; nothing otherwise (the click prompt covers the bar)
  const d = priv.drink;
  txt('drinkInfo', !priv.alive ? ''
    : priv.hunger <= 0 ? 'Starving: pretzels at a SNACKS stand'
    : d ? `${d.kind[0].toUpperCase() + d.kind.slice(1)} · ${d.sips} sip${d.sips === 1 ? '' : 's'}` : priv.thirst <= 0 && !priv.atBar ? 'Parched: drinks at the bar (north-west)' : '');
  // the top winners, under the bankroll
  const lk = (pub.lead || []).map(l => l.id + ':' + l.won + ':' + l.alive + ':' + (l.id === priv.me)).join('|');
  if (lk !== hudLast.get('lead')) {
    hudLast.set('lead', lk);
    $('lead').innerHTML = pub.lead && pub.lead.length ? '<div class="label">Top winners</div>' + pub.lead.map((l, i) =>
      `<div class="lr${l.alive ? '' : ' dead'}${l.id === priv.me ? ' me' : ''}"><span class="li">${i + 1}</span><span class="ld" style="background:${l.color}"></span><span class="ln">${esc(l.name)}${l.id === priv.me ? ' (you)' : ''}</span><span class="lw ${l.won < 0 ? 'neg' : ''}">${l.won < 0 ? '−' : '+'}${money(Math.abs(l.won))}</span></div>`).join('') : '';
  }
  // the blackout: the breakers left to reset and what you can do in the dark
  const B = pub.blackout && pub.mode === 'play' && !pub.over ? pub.blackout : null;
  let bh = '';
  if (B) {
    const s = Math.floor(B.t);
    const brs = B.br.map(([i, p, done]) => `<span${done ? ' class="ok"' : ''}>${esc(ROOMS[roomOf(BREAKERS[i])].name)}${done ? ' ✓' : `<i><b style="width:${Math.round(p * 100)}%"></b></i>`}</span>`).join('');
    const at = priv.breaker !== null && priv.breaker !== undefined ? B.br.find(r => r[0] === priv.breaker) : null;
    const me = !priv.alive ? '<div class="me">You are a ghost. Watch the dark.</div>'
      : priv.held ? '<div class="me held">THE MONSTER HAS YOU</div>'
      : priv.monster ? `<div class="me mon">YOU ARE THE MONSTER · ${document.body.classList.contains('touch') ? 'Murder grabs anyone in reach · Pounce leaps' : 'Left-click grabs anyone in reach · Shift leaps'}${priv.leap ? '' : priv.leapCd > 0 ? ` (${priv.leapCd}s)` : ' (ready)'} · lit flashlights give them away</div>`
      : priv.canTransform ? '<div class="me mon big">PRESS Q TO TURN INTO THE MONSTER</div>'
      : priv.isKiller ? '<div class="me">Your partner is the monster. Stay out of its way. Nobody can see you either.</div>'
      : at ? `<div class="me big">RESETTING THE BREAKER ${Math.round(at[1] * 100)}%</div>`
      : `<div class="me">F flashlight: <b>${priv.flash ? 'ON' : 'OFF'}</b> · ${priv.flash ? 'the monster sees a lit flashlight from far away' : 'hidden in the dark, but you can barely see'} · reset a breaker: stand at it, facing it</div>`;
    bh = `<div class="bt">POWER OUT<span>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</span></div><div class="br">${brs}</div>${me}`;
  }
  // escape mode: the exits, once the power is back
  const X = pub.exits && !pub.exits.closed && pub.mode === 'play' && !pub.over ? pub.exits : null;
  if (X) {
    const doors = X.ids.map(i => `<span class="ok">${esc(ROOMS[STAFF_DOORS[i].room].name)}</span>`).join('');
    const me = priv.escaped ? '<div class="me">You got out. Play the games while you wait.</div>'
      : !priv.alive ? '<div class="me">You are a ghost. Watch them run.</div>'
      : priv.isKiller ? '<div class="me mon">Stop them before they reach the doors.</div>'
      : priv.exitT ? `<div class="me big">OPENING THE DOOR ${Math.round(priv.exitT * 100)}% · it is loud</div>`
      : '<div class="me big">GET OUT: stand at a STAFF ONLY door with a green EXIT sign until it opens</div>';
    const xh = `<div class="bt">EXITS OPEN<span>${Math.floor(X.t / 60)}:${String(X.t % 60).padStart(2, '0')}</span></div><div class="br">${doors}</div>`;
    bh = B ? bh.replace(/<div class="me[^]*$/, '') + xh + (priv.monster || priv.held ? bh.match(/<div class="me[^]*$/)[0] : me) : xh + me; // (in the dark, under the power-out lines)
  }
  if (bh !== hudLast.get('blk')) { hudLast.set('blk', bh); $('blackoutHud').innerHTML = bh; show('blackoutHud', !!bh); $('blackoutHud').classList.toggle('exits', !!X); document.body.classList.toggle('blackout', !!bh); document.body.classList.toggle('tallHud', !!(B && X)); }
  // a killer's suggested target
  const pr = priv.prey && !priv.seat && !priv.cameraFeed && pub.mode === 'play' && !pub.over ? `<b>TARGET</b> ${esc(priv.prey.name)} · ${esc(priv.prey.room)} · ${esc(priv.prey.why)}` : '';
  if (pr !== hudLast.get('prey')) { hudLast.set('prey', pr); $('prey').innerHTML = pr; show('prey', !!pr); }
  // a killer's edge: the witness meter by the crosshair, and a reminder of the edge over the killer bar
  const play = pub.mode === 'play' && !pub.over, w = play && priv.alive ? priv.watchers : null, seen = w === null || w === undefined ? null : w > 0;
  cls('eyes', 'hidden', seen === null); cls('eyes', 'seen', !!seen);
  if (seen !== null) txt('eyesN', seen ? `SEEN BY ${w}` : 'UNSEEN');
  // (the edge is named on the role card now, one line fewer over the killer bar)
  const pk = priv.isKiller && priv.alive && play && priv.perk ? PERK[priv.perk] : null;
  if (hudLast.get('edge') !== '') { hudLast.set('edge', ''); $('edge').innerHTML = ''; show('edge', false); }
  txt('hint', quietNote() || (priv.inspectT > 0 ? 'Checking... hold still' : priv.ctx ? 'CLICK · ' + priv.ctx : '')); // at a game, what you aim at takes over: main.js seatedHud
  txt('useBtn', priv.ctx ? shortCtx(priv.ctx) : 'Use');
  cls('useBtn', 'ready', !!priv.ctx);
  const roleKey = priv.isKiller + ':' + pub.nk + ':' + pub.target + ':' + priv.killers.join() + ':' + !!pub.escape + ':' + (pk ? pk.name : '');
  if (roleKey !== lastRole) {
    lastRole = roleKey;
    const r = $('role'), brief = r.classList.contains('brief');
    if (priv.isKiller) {
      r.className = 'killer';
      const mates = pub.chars.filter(c => priv.killers.includes(c.id) && c.id !== priv.me).map(c => c.name);
      r.innerHTML = `<b>You are ${mates.length ? 'a KILLER' : 'the KILLER'}.</b> <span class="rl-more">${mates.length ? `Your partner${mates.length > 1 ? 's' : ''}: ${esc(andList(mates))}. ` : ''}` + (pub.escape
        ? 'Get them all before they get out. Cut the power (6), then Q turns you into the monster.'
        : "Poison orders, rigged machines, a knife from behind, accidents. Don't get seen.") + '</span>'
        + (pk ? ` <span class="rl-edge">Edge: ${esc(pk.name)}${pk.key ? ' (' + esc(pk.key) + ')' : ''}</span>` : '');
    } else { r.className = ''; r.innerHTML = pub.escape
      ? `<b>You are a GAMBLER.</b> <span class="rl-more">No meetings tonight. Win money: <b>B</b> spends your winnings on gear (sneakers, a fuse kit, a crowbar, a lucky rabbit foot). When the power goes out, reset the breakers by flashlight: they power an exit door. Then get out before they get you all.</span>`
      : `<b>You are a GAMBLER.</b> <span class="rl-more">Win the crew ${money(pub.target)} or vote out the killer. Check a game before you play it, sniff before you sip.</span>`; }
    r.classList.toggle('brief', brief);
  }
  // the role card says it all for the first 15 s of the night, then shrinks to one line (the menu's How to play has the rest)
  const rb = play && (pub.t > 15 || !!priv.seat); if (rb !== $('role').classList.contains('brief')) $('role').classList.toggle('brief', rb);
}
function shortCtx(s) {
  if (s.startsWith('Report')) return 'Report'; if (s.startsWith('Sit')) return 'Sit'; if (s.startsWith('Play')) return 'Play'; if (s.startsWith('Stand') || s.startsWith('Step')) return 'Leave';
  if (s.startsWith('Take the staff')) return 'Door'; if (s === 'Talk to the bartender') return 'Bar'; if (s === 'Talk to the shady guy') return 'Shady'; if (s.startsWith('Take')) return 'Antidote'; if (s.startsWith('Ring')) return 'Bell'; if (s.startsWith('Pick')) return 'Pick up'; if (s.startsWith('Eat')) return 'Snack';
  return 'Use';
}

// "Red", "Red and Mint", "Red, Mint and Pip" (up to seven partners at 29-32 players)
const andList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const CAUSES = [['poison', 'poisoned'], ['trap', 'rigged'], ['blade', 'knifed'], ['chandelier', 'crushed'], ['drown', 'drowned'], ['monster', 'taken by the monster'], ['shot', 'shot']];
function deaths(st) { const p = CAUSES.filter(([k]) => st[k]).map(([k, w]) => `${st[k]} ${w}`); return p.length ? p.join(', ') : 'nobody died'; }

// ---------- Meeting ----------
const MOOD_TAG = { anger: 'angry', fear: 'scared', grief: 'upset', smug: 'smug' };
// Meeting portraits (assets/portraits): one per cast member and mood; the cast is known by colour.
const FACE = { anger: 'angry', fear: 'nervous', grief: 'crying', smug: 'smug' };
const CAST_NAME = Object.fromEntries(CAST.map(k => [k.color, k.name]));
function faceImg(c, emo) {
  const n = CAST_NAME[c.color];
  return n ? `<img class="pf" src="assets/portraits/${n}-${FACE[emo] || 'calm'}.webp" alt="" style="border-color:${c.color}">` : `<span class="dot" style="background:${c.color}"></span>`;
}
let mKey = '', mLines = 0, mVoteKey = '', mMood = {};
export function resetMeeting() { mKey = ''; mLines = 0; mVoteKey = ''; mMood = {}; $('mChat').innerHTML = ''; show('ejectStrip', false); $('meeting').classList.remove('ejected'); }
export function renderMeeting(v, act, multi) {
  const { pub, priv } = v; const m = pub.meeting;
  if (!m) {
    const idleKey = 'idle:' + priv.me + ':' + priv.alive + ':' + JSON.stringify(priv.notes);
    if (mKey === idleKey) return;
    resetMeeting(); mKey = idleKey;
    $('meeting').classList.remove('ejected');
    $('mTitle').textContent = priv.alive ? 'Your phone' : 'Spectator phone';
    $('mReason').textContent = 'No meeting in progress.';
    $('mNotes').textContent = priv.alive ? 'Your notes: ' + (priv.notes.map(n => n.text).join(' · ') || 'Nothing recorded yet.') : 'You can watch meetings. Ghosts cannot chat, accuse or vote.';
    $('mChat').replaceChildren(); $('mVotes').replaceChildren(); $('mTimer').textContent = '';
    show('chatForm', false); show('ejectStrip', false); return;
  }
  $('meeting').classList.toggle('ejected', m.phase === 'result' && m.ejected !== null && m.ejected !== undefined);
  const key = m.title + m.reason + priv.alive;
  if (key !== mKey) {
    resetMeeting(); mKey = key;
    $('mTitle').textContent = m.title; $('mReason').textContent = m.reason;
    const notes = priv.notes;
    $('mNotes').innerHTML = priv.alive
      ? '<b>Your notes</b><br>' + (notes.length ? notes.slice(-8).map(n => `<div class="${n.hard ? 'hard' : ''}">· ${n.text}</div>`).join('') : 'You saw nothing useful.')
      : "<b>You're a ghost.</b> Ghosts can't vote, but they can watch.";

  }
  const base = m.lineBase || 0; // the snapshot holds the meeting's last lines only, from line number base on
  if (mLines < base) mLines = base;
  while (mLines < base + m.lines.length) {
    const l = m.lines[mLines++ - base]; const c = pub.chars[l.who];
    const p = document.createElement('p'); p.className = 'emo-' + (l.emo || 'calm');
    const tag = MOOD_TAG[l.emo] ? `<span class="mood">${MOOD_TAG[l.emo]}</span>` : '';
    p.innerHTML = `${faceImg(c, l.emo)}<span class="txt"><span class="who" style="color:${c.color}">${esc(c.name)}${c.id === priv.me ? ' (you)' : ''}</span>:${tag} ${esc(l.text)}</span>`;
    mMood[c.id] = l.emo || 'calm';
    $('mChat').appendChild(p); $('mChat').scrollTop = 1e6;
  }
  show('chatForm', priv.alive && m.phase !== 'result'); // the bots read the chat too; the thrown-out player loses it at once
  const vk = [priv.alive, m.phase, priv.voted, priv.accused, m.voted.join(','), JSON.stringify(m.tally), JSON.stringify(mMood), [...marks].join()].join('|');
  if (vk !== mVoteKey) {
    mVoteKey = vk;
    const box = $('mVotes'); box.innerHTML = '';
    // over 8 alive: two columns; over 16 (up to 32): three, on a wider card
    const nAlive = pub.chars.filter(c => c.alive).length, many = nAlive > 8, lots = nAlive > 16;
    box.classList.toggle('many', many); $('mSide').classList.toggle('many', many);
    box.classList.toggle('lots', lots); $('mSide').classList.toggle('lots', lots); $('meeting').classList.toggle('lots', lots);
    const canAct = priv.alive && m.phase !== 'result' && priv.voted === null;
    // the verdict keeps the one thrown out on the list, with the votes that did it
    for (const c of pub.chars.filter(c => c.alive || (m.phase === 'result' && c.id === m.ejected))) {
      const row = document.createElement('div'); row.className = 'vrow' + (priv.voted === c.id ? ' mine' : '');
      const vb = document.createElement('button');
      vb.innerHTML = `${faceImg(c, mMood[c.id])}${esc(c.name)}${c.id === priv.me ? ' (you)' : ''}${markTag(c)}${m.voted.includes(c.id) ? ' <span class="voted-tag">voted</span>' : ''}`;
      vb.disabled = !canAct || c.id === priv.me || m.phase === 'talk'; vb.onclick = () => act('vote', c.id);
      row.appendChild(vb);
      const ab = document.createElement('button'); ab.className = 'acc'; ab.textContent = 'Accuse';
      if (c.id !== priv.me) { ab.disabled = !priv.alive || priv.accused || m.phase === 'result'; ab.onclick = () => act('accuse', c.id); }
      else { ab.style.visibility = 'hidden'; ab.disabled = true; } // keeps your row as wide as the others
      row.appendChild(ab);
      const t = document.createElement('span'); t.className = 'tally';
      const n = m.tally && m.tally[c.id] || 0; t.textContent = n > 5 ? n + ' ●' : '●'.repeat(n); // (a big room's tally as a number)
      row.appendChild(t); box.appendChild(row);
    }
    const sk = document.createElement('button'); sk.textContent = priv.voted === -1 ? 'Skipped' : 'Skip vote'; if (priv.voted === -1) sk.className = 'mine';
    sk.disabled = !canAct || m.phase === 'talk'; sk.onclick = () => act('vote', -1);
    box.appendChild(sk);
    if (m.phase === 'result' && m.ejected !== null) {
      show('ejectStrip', true); const ej = pub.chars[m.ejected]; $('ejectDot').style.background = ej.color; $('ejectDot').innerHTML = faceImg(ej, 'grief');
    }
    if (m.phase === 'result') requestAnimationFrame(() => $('mTimer').scrollIntoView({ block: 'nearest', behavior: 'smooth' })); // phones: the verdict is below the fold
  }
  const timer = m.phase === 'talk' ? 'Everyone is talking...' : m.phase === 'vote' ? (priv.alive ? (priv.voted === null ? `Vote now: ${m.voteT}s` : `You voted. ${m.voteT}s left.`) : `Votes close in ${m.voteT}s`) : `<b>${esc(m.result)}</b>`;
  if ($('mTimer').innerHTML !== timer) $('mTimer').innerHTML = timer;
}

// ---------- The pick screen ----------
// Killers pick their edge (click or 1-7); gamblers see the same list, so they know what to watch for. Online everyone
// waits out the same timer.
let pickKey = '';
export function renderPick(v, act, solo) {
  const { pub, priv } = v, k = priv.isKiller;
  const crew = k ? priv.crew.filter(c => c.id !== priv.me) : [];
  const key = [k, priv.perk, pub.pickT, crew.map(c => c.perk).join()].join('|');
  if (key === pickKey) return; pickKey = key;
  const mates = crew.map(c => pub.chars[c.id].name);
  $('pkTitle').textContent = k ? 'Pick your edge' : 'The killers are picking';
  $('pkTitle').style.color = k ? 'var(--red)' : '';
  $('pkSub').innerHTML = k ? `You are ${mates.length ? `a <b>KILLER</b>, with ${esc(andList(mates))}` : 'the <b>KILLER</b>'}. Pick one edge for tonight (click it, or press 1-7).`
    : `You are a <b>GAMBLER</b>. Each killer picks one of these. Watch for them.`;
  $('pkList').innerHTML = PERKS.map((p, i) => `<button data-perk="${p.id}" class="pk-card${priv.perk === p.id ? ' sel' : ''}${k ? '' : ' ro'}"${k ? '' : ' tabindex="-1"'}>
    <em class="ability-icon" data-icon="${PERK_ICONS[p.id]}" aria-hidden="true"></em><span class="pk-n">${i + 1}</span><b>${esc(p.name)}</b>${p.key ? `<span class="pk-key">${esc(p.key)}</span>` : ''}<span class="pk-t">${esc(p.text)}</span></button>`).join('');
  if (k) $('pkList').querySelectorAll('[data-perk]').forEach(b => { b.onclick = () => act('perk', b.dataset.perk); });
  $('pkCrew').innerHTML = crew.map(c => `${esc(pub.chars[c.id].name)}: ${c.perk ? esc(PERK[c.perk].name) : c.human ? 'still picking' : 'a bot, no edge'}`).join(' · ');
  $('pkTimer').textContent = pub.pickT !== null && pub.pickT !== undefined ? `The night starts in ${pub.pickT}s${k && !priv.perk ? ' (no pick: a random edge)' : ''}` : solo && k ? 'The night starts when you pick.' : '';
  // solo, a gambler reads the list and starts the night when ready (Enter or Space too)
  show('pkGo', !!solo && !k); $('pkGo').onclick = () => act('ready');
}

// ---------- Results ----------
export function renderOver(v, isHost, solo) {
  const { pub, priv } = v; const o = pub.over;
  $('over').classList.toggle('killers', !!o.killersWin);
  $('oTitle').textContent = o.escape && !priv.isKiller ? (priv.escaped ? 'You got out' : priv.won ? 'You survived' : 'You never got out') : priv.won ? 'You win' : 'You lose';
  $('oTitle').style.color = priv.won ? 'var(--gold)' : 'var(--red)';
  $('oText').textContent = o.text + (o.edges && o.edges.length ? ' ' + o.edges.map(e => `${e.name}'s edge: ${PERK[e.perk].name}.`).join(' ') : '');
  const mins = Math.floor(o.t / 60), secs = Math.floor(o.t % 60);
  $('oStats').textContent = `${mins}:${String(secs).padStart(2, '0')} long · ${deaths(o.stats)} · ` + (o.escape ? `${o.out.length} got out` : `${o.stats.meetings} meeting${o.stats.meetings === 1 ? '' : 's'} · bankroll ${money(pub.bank)}`);
  show('againBtn', solo || isHost); show('overWait', !solo && !isHost);
  $('againBtn').textContent = solo ? 'Play again' : 'Back to lobby';
}
