// Screens, modes (solo, host, guest), input and the main loop.
import { initLoading, loadingProgress, showBriefing, briefingReady, preloadInterface } from './loading.js';
import { createGamepad } from './gamepad.js';
import { CFG, DEATH_SOUNDS } from './config.js';
import { clamp } from './util.js';
import { collide, roomOf, los, W, H } from './map.js';
import { PERKS, PERK } from './perks.js';
import { createGame } from './sim.js';
import { DEATH_SECONDS } from './3d/death-scene.js';
import { init as init3d, preloadAssets, warmup, draw, playHand, gesture, info as gfxInfo, debugScene, deathPlaying as sceneDeathPlaying, pick, pickNear, partsOnScreen, screenPointOf, consolePointOf, setHover, camPos, applyGfx, gfxState } from './3d/render3d.js';
import { settings, onSettings, firstRun, set as setSetting } from './settings.js';
import { initSettings, openSettings, closeSettings, settingsOpen } from './settings-ui.js';
import * as audio from './audio.js';
import { $, show, toast, clearToasts, lastToastAt, whisper, quietNote, splash, updateHud, renderMeeting, resetMeeting, renderOver, renderPick, marks } from './ui.js';
import { initMoves, updateMoves, keyMove, mouseMove, pickerOpen, resetMoves, cameraMouse, cameraView } from './moves.js';
import { openMixer, openShop } from './bar.js';
import { resetTableLuck, openTable, closeTable, closeAllTables, tablesBusy, tableViews, tableGame, tableSeat, tableView, tableTick, tableBar, cycleChip, chipHud, setHandHook, press as pressPart, partInfo, tableStart, spaceTable, releaseTable, tableLook } from './tables.js';
import { CHIP_COL } from './3d/rig.js';
import { hostRoom, joinRoom } from './net.js';
import { packPub, packFor, unpackSnap, resetWire } from './wire.js';
import { createVoice } from './voice.js';
import { createDiscordLink } from './discord-link.js';

const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* optional */ } } };
const S = {
  screen: 'boot', ready: false, role: null, sim: null, myId: 0, view: null, paused: false, room: null, code: '', guests: new Map(),
  me: { x: 0, y: 0, look: 0, pitch: 0, moving: false, posVer: -1 }, demo: null, lastMode: null, overShown: false, sendT: 0, acc: 0, disp: {}, standReq: false, opts: null,
};
const keys = {}; const mouse = { x: 0, y: 0 };
const stick = { id: null, active: false, x: 0, y: 0, ox: 0, oy: 0 };
let touchMode = false, inputMode = 'keyboard', padDispatch = false;
const lowPower = matchMedia('(pointer: coarse)').matches;
firstRun(lowPower); initLoading();
applyGfx(settings().gfx); onSettings((s, part) => { if (part === 'gfx') applyGfx(s.gfx); if (part === 'voice') { voiceSync(); showVoiceLine(); } });
let pressAt = null; // where on screen the current press happened (the hand reaches there)
setHandHook(kind => playHand(kind, pressAt));

// ---------- Names, settings, stats ----------
const NAMES = ['Ace', 'Lucky', 'Dice', 'Vegas', 'Chip', 'Jinx', 'Rook', 'Mabel', 'Sal', 'Trixie'];
$('nameIn').value = store.get('lc.name', NAMES[Math.floor(Math.random() * NAMES.length)]);
const myName = () => { const n = $('nameIn').value.replace(/[^\w .'-]/g, '').trim().slice(0, 12) || 'Player'; store.set('lc.name', n); return n; };
// The death sound everyone hears when you die: your own recording, made here with your name (Steve, 2026-10-14), or one
// of the ready-made ones (bots draw one of those). The host checks both.
const PRESET = () => DEATH_SOUNDS.some(d => d.id === store.get('lc.death', '')) ? store.get('lc.death', '') : 'scream';
function deathOptions() {
  const rec = audio.okRec(store.get('lc.deathRec', '')), cur = rec && store.get('lc.deathUse', 'rec') === 'rec' ? 'rec' : PRESET();
  $('deathIn').innerHTML = (rec ? '<option value="rec">My recording</option>' : '') + DEATH_SOUNDS.map(d => `<option value="${d.id}">${d.label}</option>`).join('');
  $('deathIn').value = cur;
}
deathOptions();
const myDeath = () => $('deathIn').value === 'rec' ? PRESET() : $('deathIn').value; // (the sim's id; a recording plays over it)
const myRec = () => $('deathIn').value === 'rec' ? store.get('lc.deathRec', null) : null;
const hearMine = () => { audio.unlock(); if (myRec()) audio.playRec(myRec()); else audio.death(myDeath()); };
$('deathIn').onchange = () => { const v = $('deathIn').value; store.set('lc.deathUse', v === 'rec' ? 'rec' : 'preset'); if (v !== 'rec') store.set('lc.death', v); hearMine(); };
$('deathPlay').onclick = hearMine;
$('deathRec').onclick = recordDeath;
// 2.5 s from the microphone, small enough to send to everyone in the room (opus at 16 kbit/s, about 7 KB as text).
async function recordDeath() {
  const btn = $('deathRec'), note = t => { $('deathNote').textContent = t; };
  if (btn.classList.contains('on')) return;
  audio.unlock();
  if (!window.isSecureContext || !navigator.mediaDevices || !window.MediaRecorder) { note('Recording needs the https link (the microphone is off on http).'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } }); }
  catch (e) { note('No microphone: ' + (e.name === 'NotAllowedError' ? 'the browser said no.' : e.message)); return; }
  const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 16000 }), parts = [];
  mr.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
  const done = new Promise(r => { mr.onstop = r; });
  btn.classList.add('on'); mr.start();
  for (let t = 2.5; t > 0; t -= 0.5) { btn.textContent = `● ${t.toFixed(1)}s`; note('Recording: scream now!'); await new Promise(r => setTimeout(r, 500)); }
  mr.stop(); await done; stream.getTracks().forEach(t => t.stop());
  btn.classList.remove('on'); btn.innerHTML = '&#9679; Record';
  const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(new Blob(parts, { type: mr.mimeType || mime })); });
  if (!audio.okRec(url)) { note('That recording did not work. Try again.'); return; }
  store.set('lc.deathRec', url); store.set('lc.deathUse', 'rec'); deathOptions();
  note('Saved. Everyone hears this when you die.'); audio.playRec(url);
}
function refreshSettings() {
  const s = audio.settings();
  $('sfxBtn').textContent = $('pSfx').textContent = 'Sounds: ' + (s.sfx ? 'on' : 'off');
}
const toggleSfx = () => { audio.unlock(); audio.setSfx(!audio.settings().sfx); refreshSettings(); };
function refreshStats() {
  const st = store.get('lc.stats', { games: 0, wins: 0, killerGames: 0, killerWins: 0 });
  $('statsLine').textContent = st.games ? `Played ${st.games} · won ${st.wins} · as killer ${st.killerWins}/${st.killerGames}` : '';
}
refreshSettings(); refreshStats();
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) $('codeIn').value = joinParam.toUpperCase().slice(0, 4);

// The title screen keeps the play choices in one column; secondary details
// open in an accessible side panel without changing the selected mode.
let menuPanel = null;
function closeMenuPanel() {
  for (const id of ['joinPanel', 'profilePanel']) show(id, false);
  $('joinToggle').setAttribute('aria-expanded', 'false'); $('profileBtn').setAttribute('aria-expanded', 'false');
  menuPanel = null;
}
function openMenuPanel(id) {
  const toggle = menuPanel === id; closeMenuPanel(); if (toggle) return;
  menuPanel = id; show(id, true); $(id === 'joinPanel' ? 'joinToggle' : 'profileBtn').setAttribute('aria-expanded', 'true');
  $(id === 'joinPanel' ? 'codeIn' : 'nameIn').focus(); audio.unlock();
}
$('joinToggle').onclick = () => openMenuPanel('joinPanel');
$('profileBtn').onclick = () => openMenuPanel('profilePanel');
document.querySelectorAll('[data-close-panel]').forEach(b => b.onclick = closeMenuPanel);
const profileName = () => { $('profileName').textContent = $('nameIn').value.trim() || 'Guest'; };
$('nameIn').addEventListener('input', profileName); profileName();
// ---------- Screens ----------
const OVERLAYS = ['menu', 'setup', 'how', 'pause', 'over', 'pick', 'settings']; // (the meeting is the phone: setPhone)
function only(...ids) { if (!ids.includes('settings') && settingsOpen()) closeSettings(); for (const o of OVERLAYS) show(o, ids.includes(o)); }
// The meeting is on your phone (Steve, 2026-10-15): a notification when a murder is found, Tab (or the phone badge)
// brings it up and puts it away, and the night goes on behind it, so you can ignore it and keep playing.
function setPhone(on) {
  on = !!(on && S.view && !S.view.pub.over);
  if (on === !!S.phone) return;
  S.phone = on; show('meeting', on);
  if (on) { releaseLock(); renderMeeting(S.view, act, S.view.pub.chars.filter(c => c.human).length > 1); }
  else { if (document.activeElement && document.activeElement.id === 'chatIn') document.activeElement.blur(); if (S.screen === 'game' && !S.paused) requestLock(); }
}
$('phoneOpen').onclick = () => setPhone(!S.phone);
$('phoneClose').onclick = () => setPhone(false);
document.querySelectorAll('[data-safety]').forEach(b => b.onclick = () => { audio.unlock(); act(b.dataset.safety); });
function toMenu(err) {
  closeAllTables(); // first, while the game and the line to the host are still there: an open round is settled, not dropped
  voiceOff();
  if (S.room) { try { S.room.close(); } catch (e) { /* ignore */ } }
  releaseLock(); setPhone(false); show('meeting', false); S.phone = false;
  Object.assign(S, { screen: 'menu', role: null, sim: null, view: null, room: null, paused: false, guests: new Map() });
  S.briefingToken = null; show('levelLoading', false);
  show('hud', false); only('menu'); $('menuErr').textContent = err || ''; refreshStats(); audio.setMood('menu'); clearGameUI();
}
// Whatever a game left on the page: the name picker, the camera filter, the table cursor.
function clearGameUI() { resetMoves(); clearToasts(); document.body.classList.remove('cctv', 'tablecam', 'seated'); view.style.cursor = ''; show('how', false); }
// Players 4-32 (CFG.maxPlayers); the killer choices follow the player count.
// The line under the lobby: progress and tips in grey, real errors in red.
function setupNote(text, err = false) { const e = $('setupErr'); e.textContent = text; e.classList.toggle('info', !err); }
function syncKillers() {
  const n = +$('optPlayers').value, max = CFG.maxKillers(n), recommended = CFG.recommendedKillers(n);
  $('optKillers').innerHTML = Array.from({ length: max }, (_, i) => i + 1).map(k => `<option value="${k}" ${k === recommended ? 'selected' : ''}>${k}${k === recommended ? ' (recommended)' : k < recommended ? ' (easier)' : ' (harder)'}</option>`).join('');
}
$('optPlayers').innerHTML = Array.from({ length: CFG.maxPlayers - 3 }, (_, i) => i + 4).map(n => `<option ${n === 10 ? 'selected' : ''}>${n}</option>`).join('');
$('optKillers').innerHTML = '<option value="2" selected>2</option>';
$('optPlayers').onchange = syncKillers; syncKillers();
function openSetup(mode) {
  S.screen = mode === 'solo' ? 'setup' : 'lobby';
  closeMenuPanel(); only('setup');
  $('setupTitle').textContent = (mode === 'solo' ? 'Solo game' : mode === 'host' ? 'Your room' : 'Joined room') + (mode === 'guest' ? '' : ' · ' + MODE_NAME[S.gameMode]);
  show('roomBox', mode !== 'solo'); show('opts', mode !== 'guest'); show('roleField', mode === 'solo');
  show('guestWait', mode === 'guest'); show('startBtn', mode !== 'guest'); $('setupErr').textContent = '';
  $('startBtn').textContent = mode === 'solo' ? 'Deal me in' : 'Start the game';
}
function readOpts() {
  return { players: +$('optPlayers').value, killers: +$('optKillers').value, difficulty: $('optDiff').value, forceRole: $('optRole').value, mode: S.gameMode };
}
// The main menu's game mode (Steve, 2026-10-15): Murder Mystery (the meetings and votes) or Escape (no meetings: the
// blackout, then the exits). Remembered here; the host's choice is the room's.
const MODE_NAME = { classic: 'Murder Mystery', escape: 'Escape' };
S.gameMode = store.get('lc-mode', 'classic') === 'escape' ? 'escape' : 'classic';
function setMode(m) {
  S.gameMode = m === 'escape' ? 'escape' : 'classic'; store.set('lc-mode', S.gameMode);
  $('menu').dataset.mode = S.gameMode;
  $('modeDescription').textContent = S.gameMode === 'escape' ? 'Restore the power. Find the exit. Don’t look back.' : 'Find the killers. Break the bank. Survive the night.';
  document.querySelectorAll('#modePick .mode').forEach(b => { const on = b.dataset.mode === S.gameMode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
}
document.querySelectorAll('#modePick .mode').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
setMode(S.gameMode);
function enterGame(skipBriefing = false) {
  S.overToken = null; S.deathKey = null; S.deathUntil = 0;
  audio.resetSceneCues();
  S.screen = 'game'; S.view = null; S.tips = 0; S.peekT = 0; S.peekButton = false; S.stamina = CFG.stamina; S.sprinting = false; marks.clear(); S.me.pitch = 0; S.wasSeated = false; S.me.posVer = -1; S.lastMode = null; S.overShown = false; S.paused = false; S.disp = {}; S.acc = 0;
  only(); show('hud', true); closeAllTables(); resetMeeting(); audio.setMood('lounge'); clearGameUI();
  if (!skipBriefing) beginBriefing();
}

// ---------- Solo ----------
function startSolo(opts, skipBriefing = false) {
  S.role = 'solo'; S.opts = opts; S.myId = 0;
  resetTableLuck();
  S.sim = createGame({ humans: [{ name: myName(), key: 'me', death: myDeath() }], pick: 'solo', ...opts });
  audio.setRecs(myRec() ? { 0: myRec() } : {});
  enterGame(skipBriefing);
}

// ---------- Hosting ----------
function lobbyNames() { return [myName() + ' (host)', ...[...S.guests.values()].map(g => g.name)]; }
function renderLobby(names, code) {
  $('roomCode').textContent = code || '····';
  $('lobbyList').innerHTML = names.length ? names.map(n => `<span>${n.replace(/[<>&]/g, '')}</span>`).join('') + `<span class="lcount">${names.length} of ${CFG.maxPlayers}</span>` : '<span>Connecting...</span>';
  $('lobbyList').classList.toggle('big', names.length > 16);
}
function broadcastLobby() { const names = lobbyNames(); renderLobby(names, S.code); if (S.room) S.room.broadcast({ t: 'lobby', names, code: S.code, mode: S.gameMode }); hostVoiceRoster(); linkRoster(); relayLinks(); }
function startHosting() {
  S.role = 'host'; S.code = ''; S.guests = new Map();
  openSetup('host'); renderLobby([myName() + ' (host)'], '');
  setupNote('Opening a room...');
  S.room = hostRoom({
    onOpen: code => { S.code = code; setupNote('Share the code or the invite link.'); voiceSync(); broadcastLobby(); },
    onData: hostData,
    onLeave: conn => {
      const g = S.guests.get(conn); S.guests.delete(conn); V.on.delete(conn.peer);
      if (g && S.sim && g.id !== null) S.sim.dropHuman(g.id);
      if (S.screen === 'lobby') broadcastLobby(); else { hostVoiceRoster(); linkRoster(); }
    },
    onError: err => { if (S.screen === 'lobby') setupNote(err, true); else toast(err, true); },
  });
}
function hostData(conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  const g = S.guests.get(conn);
  if (msg.t === 'hello') {
    if (S.screen !== 'lobby') { S.room.send(conn, { t: 'busy', why: 'That game already started. Ask the host to go back to the lobby.' }); setTimeout(() => conn.close(), 300); return; }
    if (S.guests.size >= CFG.maxPlayers - 1) { S.room.send(conn, { t: 'busy', why: `That room is full (${CFG.maxPlayers} players).` }); setTimeout(() => conn.close(), 300); return; }
    let name = String(msg.name || 'Guest').replace(/[^\w .'-]/g, '').trim().slice(0, 10) || 'Guest';
    const taken = new Set([myName().toLowerCase(), ...[...S.guests.values()].map(g => g.name.toLowerCase())]);
    if (taken.has(name.toLowerCase())) { let i = 2; while (taken.has((name + i).toLowerCase())) i++; name = name + i; }
    S.guests.set(conn, { name, id: null, death: typeof msg.death === 'string' ? msg.death.slice(0, 12) : null, rec: audio.okRec(msg.rec) ? msg.rec : null }); broadcastLobby();
    return;
  }
  if (msg.t === 'vmode' && g) { V.on.set(conn.peer, !!msg.on); hostVoiceRoster(); return; } // who has in-game voice on
  if (!g || g.id === null || !S.sim) return;
  if (msg.t === 'in') S.sim.setInput(g.id, msg, true);
  else if (msg.t === 'act') S.sim.action(g.id, msg.k, msg.arg);
}
let startWait = null;
function hostStart() {
  // A guest whose link just opened has not said hello yet; give them a moment instead of turning them away.
  const joining = S.room ? [...S.room.conns].some(c => !S.guests.has(c)) : false;
  if (joining && !startWait) {
    setupNote('Someone is still joining...');
    startWait = setTimeout(() => { if (S.role === 'host' && S.screen === 'lobby') hostStart(); startWait = null; }, 1200);
    return;
  }
  if (startWait) { clearTimeout(startWait); startWait = null; }
  const opts = readOpts();
  const guests = [...S.guests.entries()];
  const humans = [{ name: myName(), key: 'host', death: myDeath() }, ...guests.map(([conn, g]) => ({ name: g.name, key: conn.peer, death: g.death }))];
  const players = Math.max(opts.players, humans.length);
  resetTableLuck();
  S.sim = createGame({ humans, players, killers: opts.killers, difficulty: opts.difficulty, mode: opts.mode, pick: 'timed' }); // the killers pick their edges first
  S.myId = 0;
  guests.forEach(([conn, g], i) => { g.id = i + 1; g.wire = {}; S.room.send(conn, { t: 'start', id: g.id }); });
  // Guests need their own initial view to prepare the level while the host is
  // still reading the controls. Regular snapshots wait for the host to Continue.
  if (guests.length) sendSnapshots(S.sim.pubView());
  const recs = {}; if (myRec()) recs[0] = myRec(); for (const [, g] of guests) if (g.rec) recs[g.id] = g.rec; // everyone's own death sound, once
  audio.setRecs(recs); // one recording per message: 32 of them at up to 90 KB each would pass a data channel's message limit together
  for (const [conn] of guests) { S.room.send(conn, { t: 'recs', recs: {} }); for (const [id, url] of Object.entries(recs)) S.room.send(conn, { t: 'recs', recs: { [id]: url }, add: true }); }
  enterGame(); hostVoiceRoster();
}
function hostBackToLobby() {
  S.sim = null; S.view = null;
  for (const g of S.guests.values()) g.id = null;
  closeAllTables(); show('hud', false); openSetup('host'); broadcastLobby(); clearGameUI(); audio.setMood('menu');
}

// ---------- Joining ----------
function startJoin(code) {
  code = code.toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) { $('menuErr').textContent = 'Room codes are 4 letters.'; return; }
  S.role = 'guest'; S.code = code;
  openSetup('guest'); renderLobby([], code); setupNote('Connecting...');
  S.room = joinRoom(code, {
    onOpen: () => { $('setupErr').textContent = ''; S.room.send({ t: 'hello', name: myName(), death: myDeath(), rec: myRec() }); voiceSync(); },
    onData: guestData,
    onClose: () => { if (S.role === 'guest') toMenu('The host closed the room.'); },
    onError: err => { if (S.role === 'guest') toMenu(err); },
  });
}
function guestData(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'lobby') { if (S.screen !== 'lobby') { closeAllTables(); show('hud', false); openSetup('guest'); clearGameUI(); audio.setMood('menu'); } renderLobby(msg.names, msg.code); $('setupTitle').textContent = 'Joined room' + (MODE_NAME[msg.mode] ? ' · ' + MODE_NAME[msg.mode] : ''); }
  else if (msg.t === 'busy') toMenu(msg.why);
  else if (msg.t === 'start') { S.myId = msg.id; resetWire(); enterGame(); }
  else if (msg.t === 'recs') audio.setRecs(msg.recs && typeof msg.recs === 'object' ? msg.recs : {}, !!msg.add);
  else if (msg.t === 'snap') { const v = unpackSnap(msg); if (v && (S.screen === 'game' || S.screen === 'briefing')) { S.view = v; inbox(v.priv.inbox); } } // (wire.js)
  else if (msg.t === 'vroster') { V.roster = Array.isArray(msg.list) ? msg.list : []; if (V.voice) V.voice.setRoster(V.roster); }
  else if (msg.t === 'dlink') linkNews(msg);
}

// ---------- Voice chat ----------
// In-game: proximity voice over a WebRTC mesh on the room's own Peer (voice.js); the host keeps the roster of who has it
// on. Discord: the host's browser drives the bot (discord-link.js), which moves linked players between voice channels
// room by room, and passes each guest their link code.
const V = { voice: null, peer: null, link: null, linkSt: null, mine: null, on: new Map(), roster: [], talk: false, talking: new Set(), state: null };
const voicePrefs = () => { const v = settings().voice; return { enabled: true, ptt: !!v.ptt, talking: V.talk, micId: v.micId || '', outVol: Math.min(1, (v.volume ?? 1) * audio.volumes().master / 0.9) }; };
// The microphone needs a secure page: on the NAS preview that is the https port next to the http one.
const httpsUrl = () => 'https://' + location.hostname + (location.port === '3160' ? ':3161' : location.port ? ':' + location.port : '') + location.pathname;
function voiceSync() {
  const want = !!(S.room && S.room.peer && S.room.peer.id && settings().voice.mode === 'game' && window.isSecureContext);
  if (V.voice && (!want || V.peer !== S.room.peer)) { V.voice.close(); V.voice = null; V.state = null; } // hostRoom swaps its Peer when the id was taken
  if (want && !V.voice) { V.peer = S.room.peer; V.voice = createVoice({ peer: V.peer, onState: st => { V.state = st; } }); V.voice.setRoster(V.roster); }
  if (V.voice) V.voice.setPrefs(voicePrefs());
  if (S.role === 'guest' && S.room) S.room.send({ t: 'vmode', on: want });
  if (S.role === 'host' && S.room) { V.on.set(S.room.peer.id, want); hostVoiceRoster(); }
  linkSync();
}
function voiceOff() {
  if (V.voice) V.voice.close(); if (V.link) V.link.close();
  Object.assign(V, { voice: null, peer: null, link: null, linkSt: null, mine: null, roster: [], talk: false, state: null }); V.on.clear(); V.talking.clear();
}
// The host: everyone with voice on, by character id once the game is on.
function hostVoiceRoster() {
  if (S.role !== 'host' || !S.room || !S.room.peer.id) return;
  const game = S.screen === 'game' || S.screen === 'briefing', list = [];
  if (V.on.get(S.room.peer.id)) list.push({ peerId: S.room.peer.id, id: game ? 0 : null });
  for (const [conn, g] of S.guests) if (V.on.get(conn.peer)) list.push({ peerId: conn.peer, id: game ? g.id : null });
  V.roster = list; S.room.broadcast({ t: 'vroster', list });
  if (V.voice) V.voice.setRoster(list);
}
function setTalk(on) { if (V.talk === on) return; V.talk = on; if (V.voice) V.voice.setPrefs({ talking: on }); }
// Every frame: place the voices, note who is talking (their name tags), and keep the Discord bot up to date.
function voiceFrame() {
  const v = S.screen === 'game' ? S.view : null;
  if (V.voice) {
    const phase = !v ? 'lobby' : v.pub.over ? 'over' : v.pub.mode;
    V.voice.frame({ phase, me: v ? { id: v.priv.me, x: S.me.x, y: S.me.y, look: effLook(), alive: v.priv.alive } : null, chars: v ? v.pub.chars : [], los });
    V.talking.clear();
    for (const [id, lv] of V.voice.levels()) if (lv > 0.3 && typeof id === 'number') V.talking.add(id);
  } else if (V.talking.size) V.talking.clear();
  if (V.link && S.role === 'host') {
    if (!S.sim || S.screen !== 'game') V.link.state('lobby', []);
    else { const G = S.sim.G; V.link.state(G.over ? 'over' : G.mode, G.chars.filter(c => c.isHuman).map(c => ({ key: c.netKey, room: roomOf(c), alive: c.alive }))); }
  }
}
// Discord, the host's side: open the line to the bot when the host picks Discord voice, send the lobby, relay codes.
function linkSync() {
  const want = S.role === 'host' && !!S.code && settings().voice.mode === 'discord';
  if (want && !V.link) {
    const url = settings().voice.discordUrl || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/discord';
    V.link = createDiscordLink({ url, room: S.code, onChange: st => { V.linkSt = st; relayLinks(); } });
    linkRoster();
  }
  if (!want && V.link) { V.link.close(); V.link = null; V.linkSt = null; relayLinks(); }
}
function linkRoster() {
  if (!V.link) return;
  V.link.roster([{ key: 'host', name: myName() }, ...[...S.guests].map(([conn, g]) => ({ key: conn.peer, name: g.name }))]);
}
const linkFor = (st, key) => !st ? { off: true } : { code: st.codes[key] || null, user: st.linked[key] || null, inVoice: !!st.inVoice[key], ready: st.ready, error: st.error, lobby: st.lobby, conn: st.conn };
function relayLinks() {
  if (S.role !== 'host' || !S.room) return;
  for (const [conn] of S.guests) S.room.send(conn, { t: 'dlink', ...linkFor(V.linkSt, conn.peer) });
  linkNews(linkFor(V.linkSt, 'host'));
}
function linkNews(L) {
  const was = V.mine; V.mine = L;
  if (L && L.user && !(was && was.user)) toast(`Discord voice: linked to ${L.user}.`);
  showVoiceLine();
}
// The status line (lobby, and the Voice tab in settings).
function voiceStatus() {
  const m = settings().voice.mode;
  if (m === 'off') return 'Voice chat is off.';
  if (m === 'game') {
    if (!window.isSecureContext) return `Browsers only give the microphone to secure pages: open ${httpsUrl()} for voice.`;
    if (!S.room) return 'Voice works in online rooms: host or join one.';
    const st = V.state; if (!st) return 'Starting voice...';
    const mic = { off: 'Mic off', asking: 'Asking for the microphone...', on: settings().voice.ptt ? `Hold ${pttName()} to talk` : 'Mic on', denied: 'Microphone blocked (allow it in the address bar); you can still listen', none: 'No microphone found; you can still listen' }[st.mic] || st.mic;
    return `${mic} · ${st.peers} connected${st.error ? ' · ' + st.error : ''}`;
  }
  const L = V.mine;
  if (!S.room) return 'Discord voice works in online rooms: the host turns it on.';
  if (!L || L.off) return S.role === 'host' ? 'Connecting to the Discord bot...' : "The host hasn't turned on Discord voice.";
  if (L.error && !L.ready) return L.error;
  if (L.user) return `Linked to ${L.user}` + (L.inVoice ? ', in voice.' : `: join ${L.lobby || "the room's Lobby voice channel"} in Discord.`);
  if (L.code) return `In Discord, join ${L.lobby || "the room's Lobby voice channel"} and type /lastcall link code:${L.code}`;
  return 'Waiting for the Discord bot...';
}
const pttName = () => ({ capslock: 'Caps Lock', mouse4: 'Mouse 4', mouse5: 'Mouse 5' })[settings().voice.pttKey] || settings().voice.pttKey.toUpperCase();
function showVoiceLine() {
  const e = $('voiceLine'); if (!e) return;
  const t = settings().voice.mode === 'off' || !S.room ? '' : 'Voice: ' + voiceStatus();
  if (e.textContent !== t) e.textContent = t;
}
// The mic badge in a game: open mic, push to talk, talking.
function micHud() {
  const on = !!V.voice && S.screen === 'game', st = V.state, el = $('micHud');
  if (!on) { if (!el.classList.contains('hidden')) show('micHud', false); return; }
  const v = settings().voice, talking = !v.ptt || V.talk, live = st && st.mic === 'on';
  const t = !live ? 'MIC OFF' : v.ptt ? (V.talk ? 'TALKING' : 'HOLD ' + pttName().toUpperCase() + ' TO TALK') : 'MIC ON';
  if (el.textContent !== t) el.textContent = t;
  el.classList.toggle('talk', live && talking); show('micHud', true);
}

// ---------- Actions and input ----------
function act(k, arg) {
  audio.unlock();
  const p = S.view && S.view.priv;
  if (k === 'use' && arg === undefined && p && p.ctx === 'Talk to the bartender') { openMixer(); return; } // the mixer (bar.js)
  if (k === 'use' && arg === undefined && p && p.ctx === 'Talk to the shady guy') { openShop(); return; }
  if (S.sim) S.sim.action(S.myId, k, arg);
  else if (S.role === 'guest' && S.room) S.room.send({ t: 'act', k, arg });
}
const HAND_SFX = new Set(['sip', 'stab', 'crunch', 'pour']);
// A murder found: the phone buzzes with it at the top right; it stays a small badge until the meeting ends.
function phoneBuzz(title, text) {
  const n = $('phoneNote'), el = (tag, s) => { const e = document.createElement(tag); e.textContent = s; return e; };
  n.replaceChildren(el('b', '📱 ' + title.toUpperCase()), el('span', text), el('i', touchMode ? 'Tap to open the meeting' : 'Tab to open the meeting, or keep playing'));
  n.onclick = () => setPhone(true); // (phones: tap it)
  n.classList.remove('hidden', 'small'); clearTimeout(S.buzzT); S.buzzT = setTimeout(() => n.classList.add('small'), 6000);
}
function phoneBadge(m) {
  const n = $('phoneNote'), on = !!m && !S.phone && S.screen === 'game';
  n.classList.toggle('hidden', !on);
  if (on && n.classList.contains('small')) { const t = m.phase === 'vote' ? `vote · ${m.voteT}s` : m.phase === 'result' ? 'the verdict' : 'talking'; const h = `<b>📱 MEETING</b><span>${t}</span><i>${touchMode ? 'Tap' : 'Tab'}</i>`; if (n.innerHTML !== h) n.innerHTML = h; }
}
function inbox(items) {
  for (const m of items || []) {
    if (m.phone) phoneBuzz(m.phone, m.text);
    else if (m.text) toast(m.text, m.bad);
    if (m.sfx === 'death') audio.death(m.voice, m.vol, m.muffle, m.who, {at: m.at, distant: m.distant, event: m.event}); else if (m.sfx) audio.sfx(m.sfx, m.vol ?? 1, !!m.muffle);
    if (HAND_SFX.has(m.sfx)) playHand(m.sfx === 'pour' ? 'click' : m.sfx);
    if (m.sfx === 'gun' && m.mine) playHand('shoot'); // (your own shot: the revolver in your hand)
    if (m.sfx === 'poison' && S.view && S.view.priv.isKiller && /on its way|You rigged/.test(m.text || '')) playHand('poison');
  }
}
// The head direction the sim sees: where you aim.
const effLook = () => S.me.look;
const inputPayload = () => ({ x: S.me.x, y: S.me.y, look: effLook(), moving: S.me.moving, sprint: S.sprinting, peek: S.peekT > 0.5, posVer: S.me.posVer }); // peek: the host slows its speed check to match

const SENS = 0.0024;
function lookBy(dx, dy) {
  const c = settings().controls, k = SENS * (c.sens || 1);
  S.me.look += dx * k;
  S.me.pitch = clamp(S.me.pitch - dy * k * (c.invertY ? -1 : 1), -1.25, 1.25);
  tableLook(S.me.look);
}
function moveMe(dt) {
  const v = S.view; if (!v) return;
  const p = v.priv, me = S.me;
  // you stand at the games (nothing moves you); the security desk and the VIP sofas are real seats
  const sitting = !!(p.seat && SIT[p.seat.game]);
  if (p.posVer !== me.posVer) {
    me.x = p.x; me.y = p.y; me.posVer = p.posVer; S.standReq = false;
    if (sitting) { me.look = p.seat.face; me.pitch = SIT[p.seat.game]; } else if (S.wasSeated) me.pitch = 0;
    else if (!p.seat) { const c = v.pub.chars[p.me]; if (c) me.look = c.look; me.pitch = 0; }
    S.wasSeated = sitting;
  }
  const sid = p.seat ? p.seat.id : null;
  if (sid !== S.seatId) { S.seatId = sid; S.standReq = false; if (sid !== null) { S.atGameT = performance.now(); if (p.seat.game === 'bj' && !locked()) me.pitch = -0.66; } } // the how-to line shows for a few seconds
  me.moving = false; S.sprinting = false;
  // A killer's over-the-shoulder camera (hold E) eases out behind you and slows your walk.
  const peek = !!((keys.e || S.peekButton) && p.perk === 'peek' && p.alive && !p.monster && !p.seat && v.pub.mode === 'play' && !v.pub.over && !S.paused && !pickerOpen());
  S.peekT = clamp(S.peekT + (peek ? dt : -dt) * 4, 0, 1);
  if (v.pub.mode !== 'play' || v.pub.over || S.paused || pickerOpen() || p.cameraFeed || deathPlaying()) return;
  if (padInput.lookX || padInput.lookY) { me.look += padInput.lookX * dt * 2.1; me.pitch = clamp(me.pitch - padInput.lookY * dt * 1.7, -1.25, 1.25); }
  let f = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
  let r = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  r += padInput.x; f -= padInput.y;
  if (stick.active && Math.hypot(stick.x, stick.y) > 0.2) { r += stick.x; f -= stick.y; }
  if (sitting) {
    me.x = p.seat.x; me.y = p.seat.y;
    if (Math.hypot(f, r) > 0.6 && !S.standReq) { S.standReq = true; act('leave'); }
    return;
  }
  if (p.held || p.leap) return; // in the monster's hands (or the monster mid-pounce: the host flies it)
  if (f || r) {
    const l = Math.hypot(f, r); if (l > 1) { f /= l; r /= l; }
    const a = me.look;
    const mx = Math.cos(a) * f - Math.sin(a) * r, my = Math.sin(a) * f + Math.cos(a) * r;
    // Shift sprints while there is stamina (forward or sideways, not backing up); thirst and hunger slow you down
    S.sprinting = !!(keys.shift && p.alive && !p.monster && f >= 0 && S.stamina > 0);
    const sp = !p.alive ? CFG.ghostSpeed : CFG.playerSpeed * (p.thirst <= 0 ? CFG.parched : 1) * (p.hunger <= 0 ? CFG.starving : 1) * (S.sprinting ? CFG.sprint : 1) * (S.peekT > 0.5 ? CFG.peekSlow : 1) * (p.monster ? CFG.monsterSpeed : 1) * (p.gear && p.gear.includes('sneakers') ? CFG.sneakers : 1);
    me.x += mx * sp * dt; me.y += my * sp * dt; me.moving = true;
    if (p.alive && (S.stepD = (S.stepD || 0) + sp * dt) > 62) { S.stepD = 0; audio.sfx('step'); }
    if (p.alive) collide(me);
    me.x = clamp(me.x, 0, W); me.y = clamp(me.y, 0, H);
  }
  const smax = p.staminaMax || CFG.stamina; // light feet: a longer sprint that comes back faster
  S.stamina = S.sprinting ? Math.max(0, S.stamina - dt) : Math.min(smax, S.stamina + (p.perk === 'legs' ? CFG.legsRegen : CFG.staminaRegen) * dt);
}
// Space while walking: mark whoever is under the crosshair suspicious, again trusted, again nothing. Only you see it,
// over their head and in the meeting. A mark follows how someone looks (a disguise wears its victim's marks).
const MARK_NEXT = { undefined: 'sus', sus: 'ok', ok: undefined };
function markAim() {
  const v = S.view; if (!v || v.pub.mode !== 'play' || v.pub.over) return;
  let best = null, bd = 1e9;
  for (const c of v.pub.chars) {
    if (!c.alive || c.id === v.priv.me) continue;
    const dx = c.x - S.me.x, dy = c.y - S.me.y, d = Math.hypot(dx, dy); if (d > 900 || d < 1) continue;
    let a = Math.atan2(dy, dx) - S.me.look; a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    if (a > Math.max(0.06, 26 / d) || !los(S.me, c)) continue; // about a body's width either side of the crosshair
    if (a * d < bd) { bd = a * d; best = c; }
  }
  if (!best) { toast('Aim at someone and press Space to mark them.'); return; }
  const m = MARK_NEXT[marks.get(best.color)];
  if (m) marks.set(best.color, m); else marks.delete(best.color);
  whisper(m === 'sus' ? `${best.name}: suspect (Space again: trusted)` : m === 'ok' ? `${best.name}: trusted (Space again: no mark)` : `${best.name}: no mark`); // (under the crosshair; the mark shows on their name tag too)
  audio.sfx('click');
}

// The real seats and how far the camera tilts down when you sit in one.
const SIT = { cams: -0.25, vip: -0.2 };
const seatedPlay = () => S.screen === 'game' && !S.paused && S.view && S.view.priv.seat && S.view.pub.mode === 'play' && !S.view.pub.over;
const deathPlaying = () => performance.now() < (S.deathUntil || 0) || sceneDeathPlaying();
const playing = () => S.screen === 'game' && !deathPlaying() && !S.paused && S.view && S.view.pub.mode === 'play' && !S.view.pub.over; // (ghosts play the games too)
// At a game you stand where you like and play it with the crosshair, free to look round and walk off. Phones play it
// the same way (Steve, 2026-10-15): no table camera or table bar, a tap on the felt is a click at that point, and the
// chip buttons by the chip stand in for the scroll wheel. (The table camera mode is off everywhere.)
const tableMode = () => false;
// Press the part of your table under a screen point (NDC). alt: take chips back. near: phones snap to the
// nearest part within that many px. Returns true if something was there.
let aim = null, tapShow = null;
function pressAtNdc(nx, ny, alt, near) {
  if (!seatedPlay() || !tableGame()) return false;
  if (!alt && pressHudAt((nx + 1) * innerWidth / 2, (1 - ny) * innerHeight / 2)) return true;
  const h = pick(nx, ny) || (near ? pickNear(nx, ny, near) : null);
  if (!h) return false;
  audio.unlock(); pressAt = { x: nx, y: ny };
  pressPart(h.part, h.uv, alt); pressAt = null;
  if (touchMode) tapShow = { h, t: performance.now() };
  return true;
}
const ndcOf = (x, y) => [x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1];

// Pointer lock: mouse look while walking and while seated. Never under automation (it would grab the real cursor).
const view = $('view'), stickEl = $('stick'), knob = $('knob');
const lockOK = () => !navigator.webdriver && !S.noLock && !touchMode;
const locked = () => document.pointerLockElement === view;
function wantLock() {
  const v = S.view;
  return S.screen === 'game' && !S.paused && !S.phone && !!v && v.pub.mode === 'play' && !v.pub.over && !deathPlaying() && !pickerOpen() && !v.priv.cameraFeed && !(v.priv.seat && v.priv.seat.game === 'cams');
}
function requestLock(force) {
  if (!lockOK() || locked() || !(force ? S.screen === 'game' && !S.paused : wantLock())) return;
  try { const p = view.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed right now */ }
}
function releaseLock() { if (locked()) { S.expectUnlock = true; document.exitPointerLock(); } }
document.addEventListener('pointerlockchange', () => {
  if (locked()) return;
  if (S.expectUnlock) { S.expectUnlock = false; return; }
  if (wantLock()) { S.unlockAt = performance.now(); togglePause(); } // Esc while walking opens the menu
});
let drag = null;
view.addEventListener('mousedown', e => {
  audio.unlock();
  if (deathPlaying()) return;
  if (!S.paused && cameraMouse(e.button)) { e.preventDefault(); return; }
  if (touchMode) return;
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (tableMode() && !locked()) { if (e.button === 0 || e.button === 2) pressAtNdc(...ndcOf(e.clientX, e.clientY), e.button === 2); return; } // click the felt
  if (locked()) {
    if (seatedPlay() && (e.button === 0 || e.button === 2) && pressAtNdc(0, 0, e.button === 2)) return; // at a game: click presses what the crosshair is on
    if (!S.paused && mouseMove(e.button)) return;
    if (e.button === 0 && S.view && S.view.priv.ctx) act('use'); return;
  }
  if (wantLock() && lockOK()) { requestLock(); return; }
  drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, b: e.button }; // no pointer lock: drag to look, click to press
});
addEventListener('mouseup', e => {
  if (drag && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) {
    if (seatedPlay()) pressAtNdc(...ndcOf(e.clientX, e.clientY), drag.b === 2);
    else if (!S.paused && !mouseMove(drag.b) && drag.b === 0 && S.view && S.view.priv.ctx) act('use'); // (left click interacts here too)
  }
  drag = null;
});
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('wheel', e => { inputMode = 'keyboard'; if (playing()) { e.preventDefault(); cycleChip(e.deltaY > 0 ? -1 : 1, S.view.pub.maxBet); } }, { passive: false }); // the wheel changes your chip, at a game or on the way to one
// The table bar's buttons and chips.
$('tableBar').addEventListener('click', e => {
  const b = e.target.closest('[data-p]'); if (!b || !tableMode()) return;
  audio.unlock(); pressAt = null; pressPart(b.dataset.p);
});
$('tableBar').addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  inputMode = 'keyboard';
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (locked()) { lookBy(e.movementX, e.movementY); return; }
  if (drag && S.screen === 'game') { lookBy(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; }
});

const KEYMAP = { u: 'use', f: 'sip', n: 'sniff', r: 'inspect', x: 'pour' }; // (left click interacts; E is the killer's ability)
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
addEventListener('keydown', e => {
  if (!padDispatch) inputMode = 'keyboard';
  const k = e.key.toLowerCase();
  if (S.screen === 'boot' || S.screen === 'briefing') return;
  if (k === 'escape' && S.screen === 'menu' && menuPanel) { const from = menuPanel; closeMenuPanel(); $(from === 'joinPanel' ? 'joinToggle' : 'profileBtn').focus(); return; }
  if (e.target && e.target.tagName === 'INPUT' && k !== 'tab') { if (k === 'escape') e.target.blur(); return; }
  if (deathPlaying() && k !== 'escape') return;
  if (settingsOpen()) { if (k === 'escape') closeSettings(); return; } // (Esc there goes back to the menu or the pause screen)
  if (k === 'tab' && S.screen === 'game') { e.preventDefault(); if (!e.repeat) setPhone(!S.phone); return; } // the phone (the meeting)
  if (k === 'escape' && S.phone) { setPhone(false); return; }
  if (k === settings().voice.pttKey && V.voice) { setTalk(true); if (!keys[k]) keys[k] = true; return; } // push to talk
  if ((k === ' ' || k.startsWith('arrow')) && S.screen === 'game' && !(e.target && /^(BUTTON|SELECT)$/.test(e.target.tagName))) e.preventDefault();
  if (!keys[k]) {
    const seated = S.screen === 'game' && S.view && S.view.priv.seat && S.view.pub.mode === 'play', sitting = seated && !!SIT[S.view.priv.seat.game];
    const picking = S.screen === 'game' && S.view && S.view.pub.mode === 'pick';
    if (picking) { const p = PERKS['1234567'.indexOf(k)]; if (p && S.view.priv.isKiller) act('perk', p.id); else if (S.role === 'solo' && !S.view.priv.isKiller && (k === 'enter' || k === ' ' || k === 'e')) act('ready'); } // 1-7 pick an edge (solo gamblers: Enter starts the night)
    else if (S.screen === 'game' && !S.paused && tableGame() === 'bj' && ['h','j','k'].includes(k)) { pressPart({ h: 'btn:hit', j: 'btn:stand', k: 'btn:double' }[k]); }
    else if (S.screen === 'game' && !S.paused && keyMove(k)) { /* a v4 move or the name picker took it */ }
    else if (k === 'escape' && S.screen === 'game') { if (performance.now() - (S.unlockAt || 0) > 400) togglePause(); }
    else if (k === ' ' && S.screen === 'game' && !S.paused) { if (seatedPlay() && tableGame() && !pickerOpen()) { e.preventDefault(); spaceTable(); } else markAim(); }
    else if (k === 'f' && S.screen === 'game' && !S.paused && S.view && S.view.pub.blackout && S.view.priv.alive && !S.view.priv.isKiller) act('flash'); // in a blackout F is your flashlight
    else if (S.screen === 'game' && KEYMAP[k] && !S.paused) { act(KEYMAP[k]); if (KEYMAP[k] === 'use' && sitting) requestLock(true); }
    if (MOVE_KEYS.has(k) && S.screen === 'game' && !S.paused) {
      if (sitting && !S.standReq) { S.standReq = true; act('leave'); requestLock(true); } else requestLock();
    }
  }
  keys[k] = true;
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys[k] = false; if (k === ' ') releaseTable(!playing()); if (k === settings().voice.pttKey) setTalk(false); });
addEventListener('blur', () => { releaseTable(true); for (const k in keys) keys[k] = false; S.peekButton = false; drag = null; setTalk(false); });
// The side mouse buttons: push to talk if picked, and never the browser's Back in a game (it would leave the room).
const SIDE = { 3: 'mouse4', 4: 'mouse5' };
addEventListener('mousedown', e => { if (SIDE[e.button] && S.screen === 'game') { e.preventDefault(); if (settings().voice.pttKey === SIDE[e.button]) setTalk(true); } });
addEventListener('mouseup', e => { if (SIDE[e.button] && S.screen === 'game') { e.preventDefault(); if (settings().voice.pttKey === SIDE[e.button]) setTalk(false); } });
addEventListener('pagehide', () => { closeAllTables(); voiceOff(); if (S.room) S.room.close(); }); // settles an open round, then tells the other side now instead of after the heartbeat gives up
addEventListener('pointerdown', () => { inputMode = 'keyboard'; audio.unlock(); if (V.voice) V.voice.unlock(); }, { passive: true });

// Touch: left thumb walks, right thumb drags to look, buttons on the right edge.
function setTouch() { inputMode = 'touch'; if (!touchMode) { touchMode = true; document.body.classList.add('touch'); } }
addEventListener('touchstart', setTouch, { passive: true });
addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && touchMode) { touchMode = false; document.body.classList.remove('touch'); } }, { passive: true, capture: true });
const looks = new Map();
const taps = new Map(); // touch id -> where and when it started (a short, still touch is a tap)
view.addEventListener('touchstart', e => {
  e.preventDefault(); setTouch(); audio.unlock();
  for (const t of e.changedTouches) {
    taps.set(t.identifier, { x: t.clientX, y: t.clientY, t: performance.now(), moved: 0 });
    if (t.clientX < innerWidth * 0.45 && stick.id === null) {
      Object.assign(stick, { id: t.identifier, ox: t.clientX, oy: t.clientY, active: true, x: 0, y: 0 });
      stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px'; stickEl.classList.add('on'); knob.style.transform = '';
    } else looks.set(t.identifier, { x: t.clientX, y: t.clientY });
  }
}, { passive: false });
view.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const tp = taps.get(t.identifier); if (tp) tp.moved = Math.max(tp.moved, Math.hypot(t.clientX - tp.x, t.clientY - tp.y));
    const l = looks.get(t.identifier);
    if (l) { lookBy((t.clientX - l.x) * 1.6, (t.clientY - l.y) * 1.6); l.x = t.clientX; l.y = t.clientY; continue; }
    if (t.identifier !== stick.id) continue;
    let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy; const len = Math.hypot(dx, dy), max = 50;
    if (len > max) { dx *= max / len; dy *= max / len; }
    stick.x = dx / max; stick.y = dy / max; knob.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
  }
}, { passive: false });
const endTouch = e => { for (const t of e.changedTouches) {
  const tp = taps.get(t.identifier); taps.delete(t.identifier);
  const held = tp ? performance.now() - tp.t : 0; // at a game: a tap is a click there, a still hold (half a second) a right-click
  if (e.type === 'touchend' && tp && tp.moved < 14 && (held < 450 || held > 500 && held < 1500)) pressAtNdc(...ndcOf(tp.x, tp.y), held > 500, 30);
  looks.delete(t.identifier); if (t.identifier === stick.id) { Object.assign(stick, { id: null, active: false, x: 0, y: 0 }); stickEl.classList.remove('on'); } } };
view.addEventListener('touchend', endTouch); view.addEventListener('touchcancel', endTouch);
document.querySelectorAll('#touchBtns [data-act]').forEach(b => {
  const a = b.dataset.act;
  b.addEventListener('touchstart', e => { e.preventDefault(); setTouch(); act(a); }, { passive: false });
  b.addEventListener('touchend', e => e.preventDefault());
  b.addEventListener('click', () => act(a));
});
// Phones at a game: the chip buttons either side of the chip in hand (the PC's scroll wheel).
for (const [id, dir] of [['chipDn', -1], ['chipUp', 1]]) {
  const b = $(id), go = () => { if (playing()) { audio.unlock(); cycleChip(dir, S.view.pub.maxBet); } };
  b.addEventListener('touchstart', e => { e.preventDefault(); setTouch(); go(); }, { passive: false });
  b.addEventListener('touchend', e => e.preventDefault());
  b.addEventListener('click', go);
}
initMoves({ act: (k, arg) => act(k, arg), unlock: releaseLock, relock: () => requestLock(), peek: on => { S.peekButton = on; } });

// ---------- Buttons ----------
$('soloBtn').onclick = () => { audio.unlock(); openSetup('solo'); };
$('hostBtn').onclick = () => { audio.unlock(); startHosting(); };
$('joinBtn').onclick = () => { audio.unlock(); startJoin($('codeIn').value); };
$('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });
$('howBtn').onclick = () => show('how', true);
$('howClose').onclick = () => show('how', false);
$('sfxBtn').onclick = $('pSfx').onclick = toggleSfx;
$('startBtn').onclick = () => {
  if (S.role === 'host') { if (!S.code) return; hostStart(); }
  else startSolo(readOpts());
  if (S.sim && S.sim.G.mode === 'play') requestLock(true); // (not under the killers' pick screen)
};
$('setupBack').onclick = () => toMenu();
$('shareBtn').onclick = async () => {
  const url = location.origin + location.pathname + '?join=' + S.code;
  try { if (navigator.share) await navigator.share({ title: 'Last Call', text: `Join my Last Call room: ${S.code}`, url }); else { await navigator.clipboard.writeText(url); setupNote('Invite link copied.'); } }
  catch (e) { setupNote(url); }
};
function togglePause() {
  S.paused = !S.paused;
  if (S.paused) releaseTable(true);
  if (S.paused) releaseLock(); else { requestLock(); show('how', false); }
  show('pause', S.paused);
  document.querySelector('#pause h2').textContent = S.role === 'solo' ? 'Paused' : 'Menu (the game keeps going)';
}
$('menuBtn').onclick = togglePause;
$('resumeBtn').onclick = () => { S.paused = false; show('pause', false); show('how', false); requestLock(); };
$('pHow').onclick = () => show('how', true);
$('pSet').onclick = $('setBtn').onclick = () => { audio.unlock(); openSettings(); };
initSettings({ audio, gfxState, onClose: () => { refreshSettings(); if (V.voice) V.voice.setPrefs(voicePrefs()); }, voiceStatus,
  mics: async () => (V.voice ? await V.voice.devices() : []).map(d => [d.deviceId, d.label]) });
$('quitBtn').onclick = () => toMenu();
$('pkLeave').onclick = () => toMenu();
$('againBtn').onclick = () => { if (S.role === 'solo') { startSolo(S.opts); if (S.sim.G.mode === 'play') requestLock(true); } else if (S.role === 'host') hostBackToLobby(); };
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
function sendSnapshots(pub) {
  // Pack shared state once, retaining an independent delta/private cache per guest.
  let base = null;
  for (const [conn, g] of S.guests) if (g.id !== null) {
    base = base || packPub(pub);
    S.room.send(conn, { t: 'snap', ...packFor(base, S.sim.view(g.id, pub).priv, g.wire || (g.wire = {}), S.sim.G.meeting) });
  }
}
function simStep(dt) {
  if (!S.sim || S.screen !== 'game') return;
  if (S.view) S.sim.setInput(S.myId, inputPayload());
  if (!S.paused || S.role !== 'solo') {
    S.acc += Math.min(document.hidden ? 1.5 : 0.25, dt); // (a hidden tab may only get a tick a second)
    while (S.acc >= 1 / 60) { S.sim.tick(1 / 60); S.acc -= 1 / 60; }
  }
  const pub = S.sim.pubView();
  S.view = S.sim.view(S.myId, pub);
  inbox(S.view.priv.inbox);
  if (S.role === 'host' && S.room) {
    S.sendT += dt;
    if (S.sendT >= 1 / CFG.netHz) {
      S.sendT = Math.min(S.sendT - 1 / CFG.netHz, 1 / CFG.netHz); // (carried over: a 30 fps host still sends CFG.netHz a second)
      // packed (wire.js): at 32 players the plain views were 10-14 KB each, 40-50 Mbit/s up for 31 guests
      sendSnapshots(pub);
    }
  }
}
const TIPS = [
  // two per role, merged from eight (Steve, 2026-10-15: "too many pop ups")
  [6, 'Tip: walk up to a game to play it, scroll for your chip. R checks a game or a drink first: killers rig and poison them.', 'g'],
  [6, 'Tip: left-click murders from behind, right-click disguises. Q transforms during a blackout, Shift leaps as the monster. E uses your selected ability.', 'k'],
  [40, 'Tip: Space marks whoever you aim at as a suspect. Found a body? Left click reports it.', 'g'],
  [40, 'Tip: your suggested target is just above your moves.', 'k'],
];
function frameGame(dt) {
  moveMe(dt);
  if (S.sim) simStep(dt);
  else if (S.role === 'guest' && S.room) { S.sendT += dt; if (S.sendT >= 0.05) { S.sendT = 0; S.room.send({ t: 'in', ...inputPayload() }); } }
  const v = S.view; if (!v) { drawDemo(dt); return; }
  const { pub, priv } = v;
  const deathKey = priv.deathScene && !priv.alive ? `${priv.me}:${priv.deathScene.t}` : null;
  if (deathKey !== S.deathKey) { S.deathKey = deathKey; S.deathUntil = deathKey ? performance.now() + DEATH_SECONDS * 1000 : 0; if (deathKey) { S.paused = false; only(); releaseLock(); setPhone(false); } }
  const deathActive = deathPlaying();
  if (priv.seat && priv.seat.game !== 'cams' && pub.mode === 'play' && !pub.over && tableSeat() !== priv.seat.id) { closeTable(); openTable(priv.seat, act, v); } // the security desk has its own card
  if (pub.mode !== 'play' || pub.over || (S.wasAlive && !priv.alive)) closeAllTables(); // (games left running settle too)
  else if (!priv.seat && tableGame()) closeTable(); // walked off: a spin keeps going in the background, a hand settles
  S.wasAlive = priv.alive;
  if (pub.mode !== S.lastMode) {
    if (pub.mode === 'pick') { releaseLock(); only('pick'); }
    else if (S.lastMode === 'pick') { only(); S.paused = false; }
    S.lastMode = pub.mode;
  }
  // the meeting on the phone: a new one starts with the phone away (the notification says so); one that ends puts it away
  const mt = pub.meeting && !pub.over ? pub.meeting : null, mk = mt ? mt.title + mt.reason : '';
  if (mk !== (S.meetKey || '')) { S.meetKey = mk; setPhone(false); resetMeeting(); }
  if (S.phone) renderMeeting(v, act, pub.chars.filter(c => c.human).length > 1);
  phoneBadge(mt);
  if (pub.mode === 'pick') renderPick(v, act, S.role === 'solo');
  worldSounds(v);
  if (pub.over && !S.overShown) {
    S.overShown = true; releaseLock(); audio.setMood('over'); audio.sting(pub.over.killersWin ? 'killersWin' : 'gamblersWin');
    const st = store.get('lc.stats', { games: 0, wins: 0, killerGames: 0, killerWins: 0 });
    st.games++; if (priv.won) st.wins++; if (priv.isKiller) { st.killerGames++; if (priv.won) st.killerWins++; }
    store.set('lc.stats', st);
    const token = S.overToken = {};
    const finish = () => {
      if (S.screen !== 'game' || S.overToken !== token) return;
      if (deathPlaying()) { setTimeout(finish, 120); return; }
      only('over'); renderOver(v, S.role === 'host', S.role === 'solo');
    };
    setTimeout(finish, Math.max(900, (S.deathUntil || 0) - performance.now() + 120));
  }
  // a tip waits for a quiet screen: no message for 10 s (they used to stack four deep over the top of the screen)
  // (phones get none: they name keys, and phones had too many pop-ups, Steve 2026-10-15)
  if (!touchMode && S.tips < TIPS.length && pub.mode === 'play' && priv.alive && pub.t > TIPS[S.tips][0] && !$('toasts').children.length && performance.now() - lastToastAt > 10000) {
    const tip = TIPS[S.tips++]; if (store.get('lc.stats', { games: 0 }).games < 3 && (!tip[2] || priv.isKiller === (tip[2] === 'k'))) toast(tip[1], false, true);
  }
  updateHud(v); updateMoves(v); tableTick(v); tableLook(effLook());
  const fp = pub.mode === 'play' && !pub.over;
  show('cross', fp && !deathActive && !touchMode && !cameraView());
  if (cameraView() && locked()) releaseLock();
  show('lockHint', fp && !touchMode && lockOK() && !locked() && wantLock());
  const tm = tableMode();
  if (tm && locked()) releaseLock();
  document.body.classList.toggle('tablecam', tm);
  draw({ pub: smooth(pub, dt), priv, me: { ...S.me, look: effLook() }, mode: fp ? 'fp' : 'orbit', my: tableView(), bg: tableViews(), zoom: touchMode && seatedPlay() && !tm && innerWidth > innerHeight ? 0.74 : 1,
    table: tm, safe: tm ? hudSafe() : null, cameraFeed: cameraView(), marks, peek: S.peekT * S.peekT * (3 - 2 * S.peekT), talking: V.talking });
  // The timer covers the first frame; the rendered cinematic owns completion.
  // Its final frame must release input even if the two clocks differ slightly.
  if (S.deathUntil && !sceneDeathPlaying()) S.deathUntil = 0;
  updateNeeds(v, dt);
  seatedHud();
}
// The sprint bar under the crosshair, only while it is refilling (or running).
let stamShown = null, stamW = '';
function updateNeeds(v) {
  const f = S.stamina / (v.priv.staminaMax || CFG.stamina), on = f < 0.995 && v.priv.alive && v.pub.mode === 'play' && !(v.priv.seat && SIT[v.priv.seat.game]);
  if (on !== stamShown) { stamShown = on; show('stamina', on); }
  const w = `scaleX(${f.toFixed(2)})`; if (on && w !== stamW) { stamW = w; $('staminaFill').style.transform = w; $('stamina').classList.toggle('low', f < 0.25); }
}
// Sounds of the shared world: where you are, the rocket and the duck race when you are in their room, a meeting's votes
// and its verdict.
function worldSounds(v) {
  const { pub, priv } = v, room = pub.mode === 'play' && !pub.over ? roomOf(S.me) : null, was = S.heard || (S.heard = {});
  audio.setRoom(room); audio.setListener(S.me.x, S.me.y, S.me.look);
  audio.setPopulation(pub.chars.filter(c => c.alive && !c.staffInside && !c.escaped && roomOf(c) === room && c.id !== priv.me).length);
  audio.sceneCues(v, !!room && !S.paused && !deathPlaying() && !cameraView() && !pub.meeting && !document.hidden);
  const C = pub.crash, R = pub.race;
  if (C && C.phase !== was.crash) { if (room === 'arcade' && was.crash) audio.sfx(C.phase === 'fly' ? 'rocket' : C.phase === 'boom' ? 'boom' : null); was.crash = C.phase; }
  if (R && R.phase !== was.race) { if (room === 'race' && was.race) audio.sfx(R.phase === 'run' ? 'gun' : R.phase === 'show' ? 'splash' : null); was.race = R.phase; }
  const m = pub.meeting;
  if (m && !pub.over) {
    const votes = (m.voted || []).length;
    if (votes > (was.votes || 0)) audio.sfx('vote'); was.votes = votes;
    if (m.phase !== was.meet) { if (m.phase === 'result' && m.ejected !== null && m.ejected !== undefined) { audio.sting('eject'); audio.sfx('eject'); } was.meet = m.phase; }
  } else { was.votes = 0; was.meet = null; }
  void priv;
}
// The screen the HUD covers at the table (CSS px): the table camera keeps the game clear of it.
function hudSafe() {
  const H = innerHeight;
  let top = 0, low = H;
  for (const id of ['bank', 'topRight', 'bottom', 'tableBar']) {
    const r = $(id).getBoundingClientRect(); if (!r.height) continue;
    if (id !== 'tableBar' && r.top < H / 2) top = Math.max(top, r.bottom + 6); else low = Math.min(low, r.top - 6);
  }
  return { top: Math.min(top, H * 0.2), bottom: Math.min(H - low, H * 0.42) };
}
// Seated: name what the cursor (or crosshair) is on (phones: what you just tapped), and the table bar.
function seatedHud() {
  const seated = seatedPlay() && tableGame(), tm = tableMode();
  document.body.classList.toggle('seated', !!seated);
  drawGameControls(seated && !S.paused && !pickerOpen() && !S.view.priv.cameraFeed ? tableBar() : null);
  const overBar = tm && !touchMode && document.elementFromPoint(mouse.x, mouse.y) !== view;
  aim = seated && !touchMode && !overBar ? (tm ? pick(...ndcOf(mouse.x, mouse.y)) : pick(0, 0)) : null;
  const tap = touchMode && tapShow && performance.now() - tapShow.t < 900 ? tapShow.h : null;
  const h = aim || tap; setHover(seated ? h : null);
  const info = seated && h && !(tableGame() === 'bj' && h.part.startsWith('btn:')) ? partInfo(h.part, h.uv) : null;
  const al = $('aim'), qn = seated ? quietNote() : '', aimText = qn ? qn : !info ? '' : touchMode ? info.label.replace('RIGHT-CLICK', 'HOLD').replace(/\bCLICK/g, 'TAP') : info.label;
  const aimClass = (info && !info.on ? 'off' : '') + (tm && !touchMode ? ' follow' : '');
  if (al.textContent !== aimText) al.textContent = aimText; if (al.className !== aimClass) al.className = aimClass;
  if (tm && !touchMode) { al.style.left = Math.min(mouse.x + 18, innerWidth - al.offsetWidth - 8) + 'px'; al.style.top = mouse.y + 20 + 'px'; } else al.style.left = al.style.top = '';
  view.style.cursor = tm && !touchMode ? (h ? 'pointer' : 'default') : '';
  // Betting and round actions already have their own contextual prompts.
  // Walking up to a machine must not advertise another game's controls.
  if (seated || cameraView() || S.view.priv.seat?.game === 'cams') $('hint').textContent = '';
  drawBar(tm ? tableBar() : null);
  drawChip(tm || cameraView() || S.view.priv.seat?.game === 'cams' ? null : seated ? chipHud() : playing() && !touchMode ? chipHud(S.view.pub.maxBet) : null); // (the chip in hand shows on the way to a game too)
  $('chipHud').classList.toggle('walk', !seated); // (walking: just the coin, small)
}
const gameControls = document.createElement('div'); gameControls.id = 'gameControls'; gameControls.className = 'hidden'; $('bottom').prepend(gameControls);
for (const panel of [gameControls]) panel.addEventListener('click', e => {
  const button = e.target.closest('button[data-play]'); if (!button || button.disabled || !seatedPlay() || S.paused || pickerOpen()) return;
  if (performance.now() < (panel.skeeClickUntil || 0)) return;
  audio.unlock(); pressPart(button.dataset.play);
});
for (const panel of [gameControls]) {
  panel.addEventListener('pointerdown', e => { const b = e.target.closest('button[data-play]'); if (tableGame() !== 'skee' || b?.dataset.play !== 'btn:roll' || b.disabled || !playing()) return; e.preventDefault(); panel.skeePointer = e.pointerId; panel.setPointerCapture(e.pointerId); spaceTable(); });
  panel.addEventListener('pointerup', e => { if (panel.skeePointer !== e.pointerId) return; panel.skeePointer = null; panel.skeeClickUntil = performance.now() + 400; releaseTable(!playing()); });
  panel.addEventListener('pointercancel', () => { panel.skeePointer = null; panel.skeeClickUntil = performance.now() + 400; releaseTable(true); });
}
function pressHudAt(x, y) {
  for (const button of document.querySelectorAll('#gameControls:not(.hidden) button')) {
    const r = button.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { if (!button.disabled) pressPart(button.dataset.play); return true; }
  }
  return false;
}
function drawGameControls(bar) {
  const start = bar ? tableStart() : null;
  const extras = bar ? bar.acts.filter(a => bar.game !== 'bj' && a.id !== start?.id && !['btn:spin','btn:roll','btn:deal','btn:drop','btn:start','btn:lever','btn:flip','btn:cash','btn:bet'].includes(a.id)) : [];
  const update = (panel, actions) => {
    const key = actions.map(a => a.id).join('|');
    if (panel.dataset.actions !== key) { panel.dataset.actions = key; panel.replaceChildren(...actions.map(a => { const b = document.createElement('button'); b.dataset.play = a.id; return b; })); }
    [...panel.children].forEach((button, i) => { const a = actions[i]; if (button.disabled !== !a.on) button.disabled = !a.on; const tip = a.tip || a.label; if (button.title !== tip) button.title = tip; button.classList.toggle('selected', !!a.sel); const key = inputMode === 'gamepad' ? 'A' : inputMode === 'touch' ? '' : 'SPACE'; const label = a.space ? '◈  ' + (key ? key + ' · ' : '') + a.label : a.label; if (button.textContent !== label) button.textContent = label; });
    panel.classList.toggle('hidden', !actions.length);
  };
  update(gameControls, bar ? [...(start?.on ? [{ ...start, space: true }] : []), ...(bar.game === 'bj' ? [] : extras)] : []);
  for (const panel of [gameControls]) for (const button of panel.children) {
    let aimed = false;
    if (!button.disabled && locked() && !panel.classList.contains('hidden')) { const r = button.getBoundingClientRect(); aimed = r.left <= innerWidth / 2 && r.right >= innerWidth / 2 && r.top <= innerHeight / 2 && r.bottom >= innerHeight / 2; }
    button.classList.toggle('aimed', aimed);
  }
}
// The chip in hand at the bottom of the screen (the scroll wheel changes it), what is down, and the game's status line.
const chipKey = { k: '' };
function drawChip(c) {
  const el = $('chipHud'), k = c ? JSON.stringify(c) : '';
  if (k === chipKey.k) return; chipKey.k = k;
  el.classList.toggle('hidden', !c);
  if (!c) return;
  const col = CHIP_COL[Math.max(0, c.i)] || CHIP_COL[0];
  el.style.setProperty('--c', col); el.style.setProperty('--img', `url(assets/art/chip${Math.max(0, c.i)}.webp)`); // the chip faces from the felt
  $('chipVal').textContent = c.label;
  $('chipDown').textContent = c.down ? 'DOWN ' + c.down : 'MAX ' + c.max;
  $('chipStatus').textContent = touchMode ? (c.status || '').replace(/\bCLICK/g, 'TAP') : c.status || '';
  const n = $('chipNote'); n.className = c.note ? c.note[0] : ''; n.textContent = c.note ? c.note[1] : '';
}
// The bar along the bottom at the table: the chip in hand, UNDO, CLEAR, ×2, MAX, the game's buttons, a status line,
// the chips on the table and the last result. Redrawn only when it changes.
const CHIP_CSS = ['#ece6da', '#c8302a', '#202024', '#6a2ac0', '#e8a830', '#22b066'], CHIP_INK = ['#3a3030', '#fff', '#ffd040', '#fff', '#3a1a04', '#fff'];
function drawBar(b) {
  show('tableBar', !!b);
  if (!b) return;
  const set = (id, text) => { const e = $(id); if (e.textContent !== text) e.textContent = text; };
  set('tbStatus', b.status); set('tbTotal', b.total); set('tbMax', 'MAX ' + b.max);
  // The buttons are only rebuilt when the set of buttons changes; labels and states update in place, so a click
  // (press and release) always lands on the same button even while Crash's numbers tick many times a second.
  const fill = (id, items, html, cls) => {
    const el = $(id), ids = items.map(x => x.id).join('|');
    if (el.dataset.ids !== ids) { el.dataset.ids = ids; el.innerHTML = html(); }
    const bs = el.querySelectorAll('button');
    items.forEach((x, i) => {
      const e = bs[i]; if (!e) return;
      const c = cls(x); if (e.className !== c) e.className = c;
      if (x.label !== undefined && e.textContent !== x.label) e.textContent = x.label;
      const t = x.tip || x.label || ''; if (e.title !== t) e.title = t;
    });
  };
  const tone = (x, c) => `${c} ${x.tone}${x.on ? '' : ' off'}${x.sel ? ' sel' : ''}`;
  const btn = (x, c) => `<button data-p="${x.id}" class="${tone(x, c)}" title="${esc(x.tip || x.label)}">${esc(x.label)}</button>`;
  const chips = (b.chips || []).map(c => ({ ...c, id: 'chip:' + c.v, tip: '$' + c.v.toLocaleString() }));
  fill('tbChips', chips, () => chips.length ? '<span class="tb-k">CHIP VALUE</span>' + chips.map(c => `<button data-p="${c.id}" class="chip" style="--c:${CHIP_CSS[c.i]};--k:${CHIP_INK[c.i]}">${c.label}</button>`).join('') : '', c => `chip${c.sel ? ' sel' : ''}${c.on ? '' : ' off'}`);
  fill('tbTools', b.tools || [], () => (b.tools || []).map(x => btn(x, 'tool')).join(''), x => tone(x, 'tool'));
  fill('tbActs', b.acts, () => b.acts.map(x => btn(x, 'act')).join(''), x => tone(x, 'act'));
  const many = b.acts.length > 3 ? 'many' : ''; if ($('tbActs').className !== many) $('tbActs').className = many;
  const note = b.flash ? ['flash', b.flash] : b.res.text ? [b.res.cls, b.res.text] : null, nk = note ? note.join('|') : '';
  if (nk !== S.noteKey) { S.noteKey = nk; const n = $('tbNote'); n.className = note ? note[0] : ''; n.textContent = note ? note[1] : ''; }
  const pk = b.placed ? b.placed.k : 0;
  if (pk !== S.placedKey) { S.placedKey = pk; const p = $('tbPlaced'); if (b.placed) { p.innerHTML = `<b>−${esc(b.placed.amt)}</b><span>BET PLACED</span>`; p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop'); } }
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Behind the menus: an all-bot game plays out under a slow camera.
function drawDemo(dt) {
  if (!S.demo || S.demo.G.over) S.demo = createGame({ humans: [], players: 12, killers: 2, difficulty: 'normal' });
  S.demoAcc = (S.demoAcc || 0) + dt;
  while (S.demoAcc >= 1 / 30) { S.demo.tick(1 / 30); S.demoAcc -= 1 / 30; }
  draw({ pub: S.demo.pubView(), priv: null, mode: 'orbit' });
}
let padInput = { x: 0, y: 0, lookX: 0, lookY: 0 };
const gamepad = createGamepad({
  key: (key, down) => { padDispatch = true; try { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key })); } finally { padDispatch = false; } },
  onUse: () => { inputMode = 'gamepad'; },
  onDisconnect: () => { if (inputMode === 'gamepad') inputMode = touchMode ? 'touch' : 'keyboard'; },
  click: alt => { if (!playing()) return; audio.unlock(); if (seatedPlay() && pressAtNdc(0, 0, alt)) return; mouseMove(alt ? 2 : 0); },
  chip: dir => { if (playing()) cycleChip(dir, S.view.pub.maxBet); },
  context: () => ({ menu: S.screen !== 'game' || S.paused || pickerOpen() || !!S.view?.priv?.cameraFeed || S.view?.priv?.seat?.game === 'cams' || S.view?.pub.mode !== 'play', killer: !!(S.view?.priv?.isKiller && S.view?.priv?.alive), dead: !!S.view && !S.view.priv.alive, table: !!tableGame(), skee: tableGame() === 'skee', blackjack: tableGame() === 'bj', start: !!tableStart() }),
});
let last = performance.now(), due = 0;
const fpsN = { n: 0, t: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  // the frame rate limit: draw on the frames that keep the average at the cap (1 ms early is close enough)
  const cap = settings().gfx.fpsCap;
  if (cap) { const iv = 1000 / cap; if (now < due - 1) return; due = Math.max(due + iv, now - iv); } else due = now;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  padInput = gamepad.poll(now);
  if (S.screen === 'game') frameGame(dt);
  voiceFrame(); micHud();
  if ((fpsN.v = (fpsN.v || 0) + 1) % 30 === 0) showVoiceLine();
  fpsCount(now);
}
// The FPS readout (graphics settings): frames a second, the frame time and the resolutions drawn and shown.
function fpsCount(now) {
  fpsN.n++;
  if (now - fpsN.t < 500) return;
  const on = settings().gfx.showFps, fps = fpsN.n * 1000 / (now - fpsN.t); fpsN.n = 0; fpsN.t = now;
  show('fps', on); if (!on) return;
  const g = gfxState(); if (!g) return;
  $('fps').textContent = `${Math.round(fps)} FPS · ${(1000 / fps).toFixed(1)} ms · ${g.internal.join('×')}${g.internal[0] !== g.out[0] ? ' → ' + g.out.join('×') + (g.fsr ? ' FSR' : '') : ''}`;
}
requestAnimationFrame(frame);
// A hidden host tab still has to run the game for its guests, and a hidden tab's table still has to settle its rounds
// on time and close when the seat goes (a death, a meeting), as frameGame does when the tab is showing.
// The tick comes from a worker: a hidden tab's own timers run about once a second (and once a minute after a while),
// a worker's keep their pace, so the guests' game keeps its speed and its snapshots.
function hiddenTick() {
  if (!document.hidden || S.screen !== 'game') return;
  if (S.role === 'host') { const now = performance.now(); simStep(Math.min(1.5, (now - last) / 1000)); last = now; }
  const v = S.view; if (!v || !tablesBusy()) return;
  if (v.pub.mode !== 'play' || v.pub.over || (S.wasAlive && !v.priv.alive)) closeAllTables(); else { if (!v.priv.seat && tableGame()) closeTable(); tableTick(v); }
  S.wasAlive = v.priv.alive;
}
try { const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' }))); w.onmessage = hiddenTick; }
catch (e) { setInterval(hiddenTick, 50); }

// Test hook for automation: drive a solo game without the screen.
window.__lastCall = {
  cues: () => audio.cueInfo(),
  audio: () => audio.audioInfo(),
  // extra.perk gives a human killer that edge with no pick screen; extra.pick: 'solo' shows the pick screen
  start(role, extra) { startSolo({ players: 6, killers: 1, difficulty: 'normal', forceRole: role || 'random', pick: null, ...(extra || {}) }, true); },
  step(seconds) { for (let i = 0; i < seconds * 60 && S.sim; i++) { S.sim.tick(1 / 60); } if (S.sim) { S.view = S.sim.view(S.myId); } },
  render() { if (S.screen === 'game') frameGame(0); else drawDemo(0); },
  // The test pane can be hidden, where the canvas may not repaint: copy the frame into an <img> the screenshot sees.
  shot(name) {
    this.render();
    if (name) { const v = document.getElementById('view'), c = document.createElement('canvas'); c.width = 1000; c.height = Math.round(1000 * v.height / v.width); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); const url = c.toDataURL('image/jpeg', 0.88); return fetch('http://127.0.0.1:8932/shot?name=' + name, { method: 'POST', body: url }).then(r => r.text()); }
    let c = document.getElementById('dbgShot');
    if (!c) { c = document.createElement('canvas'); c.id = 'dbgShot'; c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:0'; document.body.insertBefore(c, document.getElementById('hud')); }
    const v = document.getElementById('view'); c.width = v.width; c.height = v.height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0);
    return 'shot';
  },
  act, get state() { return S.sim && S.sim.G; }, get view() { return S.view; }, get S() { return S; },
  vote(id) { act('vote', id); }, gfx: gfxInfo, scene: debugScene, gesture, noLock() { S.noLock = true; },
  voice: () => ({ info: V.voice ? V.voice.info() : null, status: voiceStatus(), link: V.mine, levels: V.voice ? Object.fromEntries(V.voice.levels()) : null, roster: V.roster }),
  look(a, pitch) { S.me.look = a; S.me.pitch = pitch || 0; },
  demo(seconds) { drawDemo(seconds || 0); },
  // Tables: press a part by name (as if aimed at and clicked), aim the crosshair at it, list what is on screen.
  press(part, alt) {
    const c = partsOnScreen().find(q => q.part === part); if (!c) return part.startsWith('btn:') && (tableBar()?.acts.some(a => a.id === part) || tableStart()?.id === part) ? pressPart(part, null, alt) : 'no part ' + part;
    pressAt = { x: c.x / innerWidth * 2 - 1, y: -(c.y / innerHeight) * 2 + 1 }; const ok = pressPart(part, null, alt); pressAt = null; return ok;
  },
  pressScreen(x, y) { const p = screenPointOf(x, y); if (!p) return 'no screen'; return pressAtNdc(...ndcOf(p.x, p.y), false) ? 'ok' : 'missed'; },
  aimAt(part) { // the eye sits a little behind the body, so it moves as you turn: aim, look, and aim again
    for (let i = 0; i < 3; i++) {
      const c = part === 'scr' ? screenPointOf(0.5, 0.5) : partsOnScreen().find(q => q.part === part), cam = camPos(); if (!c || !cam) return false;
      const d = c.p.map((v, i) => v - cam[i]); S.me.look = Math.atan2(d[2], d[0]); S.me.pitch = Math.atan2(d[1], Math.hypot(d[0], d[2])); this.render();
    }
    return true;
  },
  // the betting console: aim the crosshair at a point on it (0..1 from the top left), or at a button by id; click() presses what the crosshair is on
  aimCon(x, y) { const p = consolePointOf(x, y), cam = camPos(); if (!p || !cam) return false; const d = p.map((v, i) => v - cam[i]); S.me.look = Math.atan2(d[2], d[0]); S.me.pitch = Math.atan2(d[1], Math.hypot(d[0], d[2])); return true; },
  aimBtn(id) {
    for (let i = 0; i < 12; i++) {
      this.render(); if (partsOnScreen().some(p => p.part === id)) return this.aimAt(id);
      const b = [...document.querySelectorAll('#gameControls button')].find(b => b.dataset.play === id);
      if (!b || b.closest('.hidden')) return false;
      const r = b.getBoundingClientRect(), camera = debugScene().camera, tan = Math.tan(camera.fov * Math.PI / 360);
      const x = (r.left + r.width / 2 - innerWidth / 2) / (innerWidth / 2), y = (r.top + r.height / 2 - innerHeight / 2) / (innerHeight / 2);
      if (Math.abs(x) < .005 && Math.abs(y) < .005) return true;
      S.me.look += Math.atan(x * tan * camera.aspect); S.me.pitch = clamp(S.me.pitch - Math.atan(y * tan), -1.25, 1.25);
    }
    this.render(); return true;
  },
  click() { this.render(); return pressAtNdc(0, 0, false); },
  parts: () => partsOnScreen(), screenPoint: (x, y) => screenPointOf(x, y), table: () => tableView(), tables: () => tableViews(), hud: () => tableBar(), bar: () => tableBar(), aim: () => aim && aim.part,
  place(x, y) { S.me.x = x; S.me.y = y; if (S.sim) { S.me.posVer = S.sim.G.chars[S.myId].posVer; S.sim.setInput(S.myId, inputPayload()); S.view = S.sim.view(S.myId); } },
};

// ---------- Prepared arrivals ----------
async function beginBriefing() {
  const token = S.briefingToken = {}; S.screen = 'briefing'; S.paused = false;
  releaseLock(); show('hud', false); showBriefing();
  try {
    while (!S.view && !S.sim && S.screen === 'briefing' && S.briefingToken === token) await new Promise(ok => setTimeout(ok, 50));
    if (S.briefingToken !== token || S.screen !== 'briefing') return;
    const v = S.view || S.sim.view(S.myId); S.view = v;
    S.me.x = v.priv.x; S.me.y = v.priv.y; S.me.look = v.pub.chars[v.priv.me].look; S.me.posVer = v.priv.posVer;
    await warmup({ pub: v.pub, priv: v.priv, me: { ...S.me, pitch: 0 }, mode: 'fp' }, (n, text) => loadingProgress(n, text, true), () => S.briefingToken === token && S.screen === 'briefing');
    if (S.briefingToken === token && S.screen === 'briefing') briefingReady();
  } catch (e) {
    if (S.briefingToken !== token || S.screen !== 'briefing') return;
    $('levelStatus').textContent = 'Scene preparation failed. Return to the menu and try again.'; show('levelBack', true); console.error(e);
  }
}
$('levelBack').onclick = () => toMenu();
$('levelContinue').onclick = () => {
  if (S.screen !== 'briefing' || $('levelContinue').disabled) return;
  audio.unlock(); show('levelLoading', false); S.screen = 'game'; S.acc = 0; last = performance.now();
  show('hud', true); frameGame(0); requestLock();
};
async function boot() {
  const began = performance.now(); S.boot = { started: began, ready: false }; const failures = [];
  // GLTF subresources report through Three's manager; image and audio stages also reject explicitly.
  try {
    loadingProgress(.02, 'Loading art and sound');
    await Promise.all([
      preloadAssets(lowPower, (n, label) => loadingProgress(.05 + n * .55, label)),
      preloadInterface(), audio.preloadAudio(),
    ]);
    loadingProgress(.65, 'Building the casino'); await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
    await init3d($('view'), { lowPower, progress: (n, label) => loadingProgress(.65 + n * .03, label) }); applyGfx(settings().gfx);
    const demo = createGame({ humans: [], players: 32, killers: 2, difficulty: 'normal' });
    await warmup({ pub: demo.pubView(), priv: null, mode: 'orbit' }, (n, label) => loadingProgress(.68 + n * .32, label));
    S.ready = true; S.screen = 'menu'; S.boot = { started: began, ready: true, ms: performance.now() - began, failures };
    show('bootLoading', false); document.body.classList.remove('booting'); only('menu');
  } catch (e) { S.boot.error = e.message; loadingProgress(0, 'Unable to prepare the casino. ' + e.message); show('bootRetry', true); console.error(e); }
}
boot();
