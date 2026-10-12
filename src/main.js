// Screens, modes (solo, host, guest), input and the main loop.
import { CFG } from './config.js';
import { clamp } from './util.js';
import { collide } from './map.js';
import { createGame } from './sim.js';
import { draw, screenToWorld, cam } from './render.js';
import * as audio from './audio.js';
import { $, show, toast, splash, updateHud, openPanel, closePanel, panelGame, renderMeeting, resetMeeting, renderOver } from './ui.js';
import { hostRoom, joinRoom } from './net.js';

const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* optional */ } } };
const S = {
  screen: 'menu', role: null, sim: null, myId: 0, view: null, paused: false, room: null, code: '', guests: new Map(),
  me: { x: 0, y: 0, look: 0, moving: false, posVer: -1 }, lastMode: null, overShown: false, sendT: 0, acc: 0, disp: {}, standReq: false, opts: null,
};
const keys = {}; const mouse = { x: 0, y: 0 };
const stick = { id: null, active: false, x: 0, y: 0, ox: 0, oy: 0 };
let touchMode = false, tapLook = false, touchBack = false;

// ---------- Names, settings, stats ----------
const NAMES = ['Ace', 'Lucky', 'Dice', 'Vegas', 'Chip', 'Jinx', 'Rook', 'Mabel', 'Sal', 'Trixie'];
$('nameIn').value = store.get('lc.name', NAMES[Math.floor(Math.random() * NAMES.length)]);
const myName = () => { const n = $('nameIn').value.replace(/[^\w .'-]/g, '').trim().slice(0, 12) || 'Player'; store.set('lc.name', n); return n; };
function refreshSettings() {
  const s = audio.settings();
  $('musicBtn').textContent = $('pMusic').textContent = 'Music: ' + (s.music ? 'on' : 'off');
  $('sfxBtn').textContent = $('pSfx').textContent = 'Sounds: ' + (s.sfx ? 'on' : 'off');
}
const toggleMusic = () => { audio.unlock(); audio.setMusic(!audio.settings().music); refreshSettings(); };
const toggleSfx = () => { audio.unlock(); audio.setSfx(!audio.settings().sfx); refreshSettings(); };
function refreshStats() {
  const st = store.get('lc.stats', { games: 0, wins: 0, killerGames: 0, killerWins: 0 });
  $('statsLine').textContent = st.games ? `Played ${st.games} · won ${st.wins} · as killer ${st.killerWins}/${st.killerGames}` : '';
}
refreshSettings(); refreshStats();
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) $('codeIn').value = joinParam.toUpperCase().slice(0, 4);

// ---------- Screens ----------
const OVERLAYS = ['menu', 'setup', 'how', 'meeting', 'pause', 'over'];
function only(...ids) { for (const o of OVERLAYS) show(o, ids.includes(o)); }
function toMenu(err) {
  if (S.room) { try { S.room.close(); } catch (e) { /* ignore */ } }
  Object.assign(S, { screen: 'menu', role: null, sim: null, view: null, room: null, paused: false, guests: new Map() });
  closePanel(); show('hud', false); only('menu'); $('menuErr').textContent = err || ''; refreshStats(); audio.setMood('lounge');
}
function openSetup(mode) {
  S.screen = mode === 'solo' ? 'setup' : 'lobby';
  only('setup');
  $('setupTitle').textContent = mode === 'solo' ? 'Solo game' : mode === 'host' ? 'Your room' : 'Joined room';
  show('roomBox', mode !== 'solo'); show('opts', mode !== 'guest'); show('roleField', mode === 'solo');
  show('guestWait', mode === 'guest'); show('startBtn', mode !== 'guest'); $('setupErr').textContent = '';
  $('startBtn').textContent = mode === 'solo' ? 'Deal me in' : 'Start the game';
}
function readOpts() {
  return { players: +$('optPlayers').value, killers: +$('optKillers').value, difficulty: $('optDiff').value, forceRole: $('optRole').value };
}
function enterGame() {
  S.screen = 'game'; S.view = null; S.me.posVer = -1; S.lastMode = null; S.overShown = false; S.paused = false; S.disp = {}; S.acc = 0;
  only(); show('hud', true); closePanel(); resetMeeting(); audio.setMood('lounge');
}

// ---------- Solo ----------
function startSolo(opts) {
  S.role = 'solo'; S.opts = opts; S.myId = 0;
  S.sim = createGame({ humans: [{ name: myName(), key: 'me' }], ...opts });
  enterGame();
}

// ---------- Hosting ----------
function lobbyNames() { return [myName() + ' (host)', ...[...S.guests.values()].map(g => g.name)]; }
function renderLobby(names, code) {
  $('roomCode').textContent = code || '····';
  $('lobbyList').innerHTML = names.map(n => `<span>${n.replace(/[<>&]/g, '')}</span>`).join('') || '<span>Connecting...</span>';
}
function broadcastLobby() { const names = lobbyNames(); renderLobby(names, S.code); if (S.room) S.room.broadcast({ t: 'lobby', names, code: S.code }); }
function startHosting() {
  S.role = 'host'; S.code = ''; S.guests = new Map();
  openSetup('host'); renderLobby([myName() + ' (host)'], '');
  $('setupErr').textContent = 'Opening a room...';
  S.room = hostRoom({
    onOpen: code => { S.code = code; $('setupErr').textContent = 'Share the code or the invite link. Empty seats get bots.'; broadcastLobby(); },
    onData: hostData,
    onLeave: conn => {
      const g = S.guests.get(conn); S.guests.delete(conn);
      if (g && S.sim && g.id !== null) S.sim.dropHuman(g.id);
      if (S.screen === 'lobby') broadcastLobby();
    },
    onError: err => { if (S.screen === 'lobby') $('setupErr').textContent = err; else toast(err, true); },
  });
}
function hostData(conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  const g = S.guests.get(conn);
  if (msg.t === 'hello') {
    if (S.screen !== 'lobby') { S.room.send(conn, { t: 'busy', why: 'That game already started. Ask the host to go back to the lobby.' }); setTimeout(() => conn.close(), 300); return; }
    if (S.guests.size >= 7) { S.room.send(conn, { t: 'busy', why: 'That room is full.' }); setTimeout(() => conn.close(), 300); return; }
    const name = String(msg.name || 'Guest').replace(/[^\w .'-]/g, '').trim().slice(0, 12) || 'Guest';
    S.guests.set(conn, { name, id: null }); broadcastLobby();
    return;
  }
  if (!g || g.id === null || !S.sim) return;
  if (msg.t === 'in') S.sim.setInput(g.id, msg);
  else if (msg.t === 'act') S.sim.action(g.id, msg.k, msg.arg);
}
function hostStart() {
  const opts = readOpts();
  const guests = [...S.guests.entries()];
  const humans = [{ name: myName(), key: 'host' }, ...guests.map(([conn, g]) => ({ name: g.name, key: conn.peer }))];
  const players = Math.max(opts.players, humans.length);
  S.sim = createGame({ humans, players, killers: opts.killers, difficulty: opts.difficulty });
  S.myId = 0;
  guests.forEach(([conn, g], i) => { g.id = i + 1; S.room.send(conn, { t: 'start', id: g.id }); });
  enterGame();
}
function hostBackToLobby() {
  S.sim = null; S.view = null;
  for (const g of S.guests.values()) g.id = null;
  closePanel(); show('hud', false); openSetup('host'); broadcastLobby();
}

// ---------- Joining ----------
function startJoin(code) {
  code = code.toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) { $('menuErr').textContent = 'Room codes are 4 letters.'; return; }
  S.role = 'guest'; S.code = code;
  openSetup('guest'); renderLobby([], code); $('setupErr').textContent = 'Connecting...';
  S.room = joinRoom(code, {
    onOpen: () => { $('setupErr').textContent = ''; S.room.send({ t: 'hello', name: myName() }); },
    onData: guestData,
    onClose: () => { if (S.role === 'guest') toMenu('The host closed the room.'); },
    onError: err => { if (S.role === 'guest') toMenu(err); },
  });
}
function guestData(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'lobby') { if (S.screen !== 'lobby') { closePanel(); show('hud', false); openSetup('guest'); } renderLobby(msg.names, msg.code); }
  else if (msg.t === 'busy') toMenu(msg.why);
  else if (msg.t === 'start') { S.myId = msg.id; enterGame(); }
  else if (msg.t === 'snap' && S.screen === 'game') { S.view = { pub: msg.pub, priv: msg.priv }; inbox(msg.priv.inbox); }
}

// ---------- Actions and input ----------
function act(k, arg) {
  audio.unlock();
  if (S.sim) S.sim.action(S.myId, k, arg);
  else if (S.role === 'guest' && S.room) S.room.send({ t: 'act', k, arg });
}
function inbox(items) {
  for (const m of items || []) { if (m.text) toast(m.text, m.bad); if (m.sfx) audio.sfx(m.sfx); }
}
const inputPayload = () => ({ x: S.me.x, y: S.me.y, look: S.me.look, moving: S.me.moving, lookBack: !!(keys[' '] || touchBack), posVer: S.me.posVer });

function moveMe(dt) {
  const v = S.view; if (!v) return;
  const p = v.priv, me = S.me;
  if (p.posVer !== me.posVer) { me.x = p.x; me.y = p.y; me.posVer = p.posVer; S.standReq = false; }
  me.moving = false;
  if (v.pub.mode !== 'play' || v.pub.over || S.paused) return;
  let mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  let my = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (stick.active && Math.hypot(stick.x, stick.y) > 0.25) { mx += stick.x; my += stick.y; }
  if (p.seat) {
    me.x = p.seat.x; me.y = p.seat.y; me.look = p.seat.face + (keys[' '] || touchBack ? Math.PI : 0);
    if (Math.hypot(mx, my) > 0.6 && !S.standReq) { S.standReq = true; act('use'); }
    return;
  }
  if (!touchMode || tapLook) { const w = screenToWorld(mouse.x, mouse.y); me.look = Math.atan2(w.y - me.y, w.x - me.x); }
  if (mx || my) {
    if (touchMode) { tapLook = false; me.look = Math.atan2(my, mx); }
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    const sp = !p.alive ? CFG.ghostSpeed : p.thirst <= 0 ? CFG.playerSpeed * CFG.parched : CFG.playerSpeed;
    me.x += mx * sp * dt; me.y += my * sp * dt; me.moving = true;
    if (p.alive) collide(me);
    me.x = clamp(me.x, 0, 1800); me.y = clamp(me.y, 0, 1200);
  }
}

const KEYMAP = { e: 'use', f: 'sip', r: 'sniff', x: 'pour', 1: 'poison', 2: 'shiv', 3: 'lights' };
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (e.target && e.target.tagName === 'INPUT') { if (k === 'escape') e.target.blur(); return; }
  if (k === ' ') e.preventDefault();
  if (!keys[k]) {
    if (k === 'escape' && S.screen === 'game') togglePause();
    else if (S.screen === 'game' && KEYMAP[k] && !S.paused) act(KEYMAP[k]);
  }
  keys[k] = true;
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
addEventListener('pointerdown', () => audio.unlock(), { passive: true });

const view = $('view'), stickEl = $('stick'), knob = $('knob');
function setTouch() { if (!touchMode) { touchMode = true; document.body.classList.add('touch'); } }
addEventListener('touchstart', setTouch, { passive: true });
view.addEventListener('touchstart', e => {
  e.preventDefault(); setTouch(); audio.unlock();
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.45 && stick.id === null) {
      Object.assign(stick, { id: t.identifier, ox: t.clientX, oy: t.clientY, active: true, x: 0, y: 0 });
      stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px'; stickEl.classList.add('on'); knob.style.transform = '';
    } else { mouse.x = t.clientX; mouse.y = t.clientY; tapLook = true; }
  }
}, { passive: false });
view.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier !== stick.id) { mouse.x = t.clientX; mouse.y = t.clientY; tapLook = true; continue; }
    let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy; const l = Math.hypot(dx, dy), max = 50;
    if (l > max) { dx *= max / l; dy *= max / l; }
    stick.x = dx / max; stick.y = dy / max; knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}, { passive: false });
const endTouch = e => { for (const t of e.changedTouches) if (t.identifier === stick.id) { Object.assign(stick, { id: null, active: false, x: 0, y: 0 }); stickEl.classList.remove('on'); } };
view.addEventListener('touchend', endTouch); view.addEventListener('touchcancel', endTouch);
document.querySelectorAll('#touchBtns [data-act]').forEach(b => {
  const a = b.dataset.act;
  b.addEventListener('touchstart', e => { e.preventDefault(); setTouch(); if (a === 'back') touchBack = true; else act(a); }, { passive: false });
  b.addEventListener('touchend', e => { e.preventDefault(); if (a === 'back') touchBack = false; });
  b.addEventListener('click', () => { if (a !== 'back') act(a); });
});
document.querySelectorAll('#killerBar [data-act]').forEach(b => { b.onclick = () => act(b.dataset.act); });

// ---------- Buttons ----------
$('soloBtn').onclick = () => { audio.unlock(); openSetup('solo'); };
$('hostBtn').onclick = () => { audio.unlock(); startHosting(); };
$('joinBtn').onclick = () => { audio.unlock(); startJoin($('codeIn').value); };
$('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });
$('howBtn').onclick = () => show('how', true);
$('howClose').onclick = () => show('how', false);
$('musicBtn').onclick = $('pMusic').onclick = toggleMusic;
$('sfxBtn').onclick = $('pSfx').onclick = toggleSfx;
$('startBtn').onclick = () => {
  if (S.role === 'host') { if (!S.code) return; hostStart(); }
  else startSolo(readOpts());
};
$('setupBack').onclick = () => toMenu();
$('shareBtn').onclick = async () => {
  const url = location.origin + location.pathname + '?join=' + S.code;
  try { if (navigator.share) await navigator.share({ title: 'Last Call', text: `Join my Last Call room: ${S.code}`, url }); else { await navigator.clipboard.writeText(url); $('setupErr').textContent = 'Invite link copied.'; } }
  catch (e) { $('setupErr').textContent = url; }
};
function togglePause() {
  S.paused = !S.paused;
  show('pause', S.paused);
  document.querySelector('#pause h2').textContent = S.role === 'solo' ? 'Paused' : 'Menu (the game keeps going)';
}
$('menuBtn').onclick = togglePause;
$('resumeBtn').onclick = () => { S.paused = false; show('pause', false); };
$('pHow').onclick = () => show('how', true);
$('quitBtn').onclick = () => toMenu();
$('againBtn').onclick = () => { if (S.role === 'solo') startSolo(S.opts); else if (S.role === 'host') hostBackToLobby(); };
$('overMenuBtn').onclick = () => toMenu();
$('chatForm').onsubmit = e => { e.preventDefault(); const t = $('chatIn').value.trim(); if (t) act('chat', t); $('chatIn').value = ''; };

// ---------- Loop ----------
function smooth(pub, dt) {
  const k = Math.min(1, dt * 14);
  return { ...pub, chars: pub.chars.map(c => {
    let d = S.disp[c.id];
    if (!d || Math.hypot(d.x - c.x, d.y - c.y) > 90) d = S.disp[c.id] = { x: c.x, y: c.y };
    else { d.x += (c.x - d.x) * k; d.y += (c.y - d.y) * k; }
    return { ...c, x: d.x, y: d.y };
  }) };
}
function simStep(dt) {
  if (!S.sim || S.screen !== 'game') return;
  if (S.view) S.sim.setInput(S.myId, inputPayload());
  if (!S.paused || S.role !== 'solo') {
    S.acc += Math.min(0.25, dt);
    while (S.acc >= 1 / 60) { S.sim.tick(1 / 60); S.acc -= 1 / 60; }
  }
  const pub = S.sim.pubView();
  S.view = S.sim.view(S.myId, pub);
  inbox(S.view.priv.inbox);
  if (S.role === 'host' && S.room) {
    S.sendT += dt;
    if (S.sendT >= 1 / CFG.netHz) {
      S.sendT = 0;
      for (const [conn, g] of S.guests) if (g.id !== null) S.room.send(conn, { t: 'snap', ...S.sim.view(g.id, pub) });
    }
  }
}
function frameGame(dt) {
  moveMe(dt);
  if (S.sim) simStep(dt);
  else if (S.role === 'guest' && S.room) { S.sendT += dt; if (S.sendT >= 0.05) { S.sendT = 0; S.room.send({ t: 'in', ...inputPayload() }); } }
  const v = S.view; if (!v) { draw({ pub: null }); return; }
  const { pub, priv } = v;
  if (priv.seat && pub.mode === 'play' && !pub.over && panelGame() !== priv.seat.game) openPanel(priv.seat.game, act);
  if ((!priv.seat || pub.mode !== 'play' || pub.over) && panelGame()) closePanel();
  if (pub.mode !== S.lastMode) {
    if (pub.mode === 'meeting') { splash(pub.meeting.title.toUpperCase()); only('meeting'); audio.setMood('meeting'); S.paused = false; }
    else if (S.lastMode === 'meeting') { only(); resetMeeting(); audio.setMood('lounge'); }
    S.lastMode = pub.mode;
  }
  if (pub.mode === 'meeting' && pub.meeting) renderMeeting(v, act, pub.chars.filter(c => c.human).length > 1);
  if (pub.over && !S.overShown) {
    S.overShown = true;
    const st = store.get('lc.stats', { games: 0, wins: 0, killerGames: 0, killerWins: 0 });
    st.games++; if (priv.won) st.wins++; if (priv.isKiller) { st.killerGames++; if (priv.won) st.killerWins++; }
    store.set('lc.stats', st);
    setTimeout(() => { if (S.screen === 'game') { only('over'); renderOver(v, S.role === 'host', S.role === 'solo'); } }, 900);
  }
  updateHud(v);
  draw({ pub: smooth(pub, dt), priv, me: S.me });
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.screen === 'game') frameGame(dt); else draw({ pub: null });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// A hidden host tab still has to run the game for its guests.
setInterval(() => { if (document.hidden && S.role === 'host' && S.screen === 'game') { const now = performance.now(); simStep(Math.min(0.25, (now - last) / 1000)); last = now; } }, 50);

// Test hook for automation: drive a solo game without the screen.
window.__lastCall = {
  start(role, extra) { startSolo({ players: 6, killers: 1, difficulty: 'normal', forceRole: role || 'random', ...(extra || {}) }); },
  step(seconds) { for (let i = 0; i < seconds * 60 && S.sim; i++) { S.sim.tick(1 / 60); } if (S.sim) { S.view = S.sim.view(S.myId); } },
  render() { frameGame(0); },
  act, get state() { return S.sim && S.sim.G; }, get view() { return S.view; }, get S() { return S; },
  vote(id) { act('vote', id); }, cam,
  place(x, y) { S.me.x = x; S.me.y = y; if (S.sim) { S.me.posVer = S.sim.G.chars[S.myId].posVer; S.sim.setInput(S.myId, inputPayload()); S.view = S.sim.view(S.myId); } },
};
