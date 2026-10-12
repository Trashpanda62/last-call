// DOM side: HUD, meetings and the results screen. Reads views, sends actions through act().
import { money, esc, clamp } from './util.js';
import { CAST } from './config.js';

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
    : d ? `Your ${d.kind}: ${d.sips} sips` : priv.thirst <= 0 ? 'Parched! Get a drink at the bar.' : 'No drink. The bar is in the north-west corner.';
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
      r.innerHTML = `<b>You are ${mates.length ? 'a KILLER' : 'the KILLER'}.</b> ${mates.length ? `Your partner: ${esc(mates.join(', '))}. ` : ''}Poison orders, rigged machines, a knife from behind, accidents. Don't get seen.`;
    } else { r.className = ''; r.innerHTML = `<b>You are a GAMBLER.</b> Win the crew ${money(pub.target)} or vote out the killer. Check before you sit, sniff before you sip.`; }
  }
}
function shortCtx(s) {
  if (s.startsWith('Report')) return 'Report'; if (s.startsWith('Sit')) return 'Sit'; if (s.startsWith('Stand')) return 'Stand';
  if (s.startsWith('Order')) return 'Order'; if (s.startsWith('Take')) return 'Antidote'; if (s.startsWith('Ring')) return 'Bell'; if (s.startsWith('Pick')) return 'Pick up'; if (s.startsWith('Eat')) return 'Snack';
  return 'Use';
}

const CAUSES = [['poison', 'poisoned'], ['trap', 'rigged'], ['blade', 'knifed'], ['chandelier', 'crushed'], ['drown', 'drowned']];
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
export function resetMeeting() { mKey = ''; mLines = 0; mVoteKey = ''; mMood = {}; $('mChat').innerHTML = ''; show('ejectStrip', false); }
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
    show('chatForm', priv.alive); // the bots read the chat too
  }
  while (mLines < m.lines.length) {
    const l = m.lines[mLines++]; const c = pub.chars[l.who];
    const p = document.createElement('p'); p.className = 'emo-' + (l.emo || 'calm');
    const tag = MOOD_TAG[l.emo] ? `<span class="mood">${MOOD_TAG[l.emo]}</span>` : '';
    p.innerHTML = `${faceImg(c, l.emo)}<span class="txt"><span class="who" style="color:${c.color}">${esc(c.name)}${c.id === priv.me ? ' (you)' : ''}</span>:${tag} ${esc(l.text)}</span>`;
    mMood[c.id] = l.emo || 'calm';
    $('mChat').appendChild(p); $('mChat').scrollTop = 1e6;
  }
  const vk = [m.phase, priv.voted, priv.accused, m.voted.join(','), JSON.stringify(m.tally), JSON.stringify(mMood)].join('|');
  if (vk !== mVoteKey) {
    mVoteKey = vk;
    const box = $('mVotes'); box.innerHTML = '';
    const many = pub.chars.filter(c => c.alive).length > 8; box.classList.toggle('many', many); $('mSide').classList.toggle('many', many);
    const canAct = priv.alive && m.phase !== 'result' && priv.voted === null;
    for (const c of pub.chars.filter(c => c.alive)) {
      const row = document.createElement('div'); row.className = 'vrow';
      const vb = document.createElement('button');
      vb.innerHTML = `${faceImg(c, mMood[c.id])}${esc(c.name)}${c.id === priv.me ? ' (you)' : ''}${m.voted.includes(c.id) ? ' <span class="voted-tag">voted</span>' : ''}`;
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
      show('ejectStrip', true); const ej = pub.chars[m.ejected]; $('ejectDot').style.background = ej.color; $('ejectDot').innerHTML = faceImg(ej, 'grief');
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
  $('oStats').textContent = `${mins}:${String(secs).padStart(2, '0')} long · ${deaths(o.stats)} · ${o.stats.meetings} meeting${o.stats.meetings === 1 ? '' : 's'} · bankroll ${money(pub.bank)}`;
  show('againBtn', solo || isHost); show('overWait', !solo && !isHost);
  $('againBtn').textContent = solo ? 'Play again' : 'Back to lobby';
}
