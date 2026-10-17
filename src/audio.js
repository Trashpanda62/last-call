// ElevenLabs room ambience, quiet casino score, and a spatial bar jukebox.
import { BJ_TABLES, RL_TABLE, roomOf, los, STAFF_DOORS } from './map.js';
import { createCasinoCues } from './casino-cues.js';
import { soundCatalog } from './sound-catalog.js';
let ac = null, master = null, gameMix = null, musicBus = null, sfxBus = null, ambBus = null, musicOn = true, sfxOn = true, mood = 'menu', timer = null;
const load = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage is optional */ } };
const mutedFiles = new Set();
try { const list = JSON.parse(load('lc.mutedSounds') || '[]'); if (Array.isArray(list)) for (const f of list) if (typeof f === 'string') mutedFiles.add(f); } catch {}
const bufferFiles = new WeakMap(), fileBuffers = new Map(), available = new Map(), oneShots = new Set();
const kept = file => !mutedFiles.has(file);
const rememberBuffer = (file, buffer) => { if (buffer) { bufferFiles.set(buffer, file); fileBuffers.set(file, buffer); } return buffer; };
function buffersFor(kind) {
  if (!available.has(kind)) available.set(kind, (BUF[kind] || []).filter(b => kept(bufferFiles.get(b))));
  return available.get(kind);
}
musicOn = load('lc.music') !== '0'; sfxOn = load('lc.sfx') !== '0';
// The sound settings levels (0..1): master, casino effects and ambience.
const vol = { master: 0.9, music: 0.5, sfx: 1 };
try { Object.assign(vol, JSON.parse(load('lc.vol') || '{}')); } catch (e) { /* the defaults stand */ }

export function unlock(preload = false) {
  if (ac) { if (!preload) { ac.resume().catch(() => {}); if (!timer) timer = setInterval(ambientTick, 1000); for (const stream of Object.values(streams)) if (stream) { const d = stream.decks[stream.cur]; if (d.src) d.el.play().catch(() => {}); } } return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = vol.master; master.connect(ac.destination);
    gameMix = ac.createGain(); gameMix.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = musicOn ? vol.music : 0; musicBus.connect(gameMix);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? vol.sfx : 0; sfxBus.connect(gameMix);
    ambBus = ac.createGain(); ambBus.gain.value = 0.9; ambBus.connect(sfxBus);
    if (!preload) timer = setInterval(ambientTick, 1000);
    libReady = loadLibrary();
  } catch (e) { ac = null; }
}
export const settings = () => ({ music: musicOn, sfx: sfxOn });
export function setMusic(on) { musicOn = !!on; save('lc.music', on ? '1' : '0'); if (musicBus) musicBus.gain.setTargetAtTime(on ? vol.music : 0, ac.currentTime, 0.05); }
export function setSfx(on) { sfxOn = on; save('lc.sfx', on ? '1' : '0'); if (sfxBus) sfxBus.gain.setTargetAtTime(on ? vol.sfx : 0, ac.currentTime, 0.05); if (!on) stopCueVoices(); }
export const volumes = () => ({ ...vol });
export function setVolumes(v) {
  Object.assign(vol, v); save('lc.vol', JSON.stringify(vol));
  if (!ac) return;
  master.gain.setTargetAtTime(vol.master, ac.currentTime, 0.05);
  musicBus.gain.setTargetAtTime(musicOn ? vol.music : 0, ac.currentTime, 0.05); sfxBus.gain.setTargetAtTime(sfxOn ? vol.sfx : 0, ac.currentTime, 0.05);
}
// The game's own output, for the voice chat to join at the same master level.
export const context = () => ac;

// The settings browser previews the same prepared bytes as gameplay. Explicit previews
// bypass the per-file/category switches, respect master volume, and solo the recording.
let preview = null, previewToken = 0;
const previewSubs = new Set();
let previewState = {file: null, loading: false, error: ''};
const emitPreview = () => { for (const fn of previewSubs) fn({...previewState}); };
export const soundList = () => soundCatalog(LIB).map(s => ({...s, kept: kept(s.file)}));
export const soundPreviewState = () => ({...previewState});
export function onSoundPreview(fn) { previewSubs.add(fn); return () => previewSubs.delete(fn); }
export function stopSoundPreview() {
  previewToken++;
  if (preview) { preview.stop(); preview = null; }
  if (gameMix) gameMix.gain.setTargetAtTime(1, ac.currentTime, .04);
  previewState = {file: null, loading: false, error: ''}; emitPreview();
}
function applySoundChoices() {
  available.clear();
  for (const v of [...cueVoices, ...oneShots]) if (!kept(v.file)) { try { v.source.stop(); } catch {} v.cleanup(); }
  if (!kept('monster/growl.mp3')) { if (growlGain) growlGain.gain.value = 0; growl(0); }
  if (!kept('generated/backroom-hum')) { if (humGain) humGain.gain.value = 0; hum(0); }
  save('lc.mutedSounds', JSON.stringify([...mutedFiles].sort())); playMood();
}
export function setSoundKept(file, enabled) {
  if (!soundList().some(s => s.file === file)) return;
  if (enabled) mutedFiles.delete(file); else mutedFiles.add(file);
  applySoundChoices();
}
export function restoreSounds() { mutedFiles.clear(); applySoundChoices(); }
export async function previewSound(file) {
  if (!soundList().some(s => s.file === file)) return;
  stopSoundPreview(); const token = previewToken;
  unlock(); previewState = {file, loading: true, error: ''}; emitPreview();
  try {
    await preloadAudio(); await ac.resume(); if (token !== previewToken) return;
    if (ac.state !== 'running') throw new Error('Audio is blocked. Click Play to try again.');
    gameMix.gain.setTargetAtTime(0, ac.currentTime, .025);
    const finish = () => { if (token === previewToken) stopSoundPreview(); };
    const buffer = fileBuffers.get(file);
    if (buffer) {
      const source = ac.createBufferSource(), gain = ac.createGain(); source.buffer = buffer;
      gain.gain.value = .65; source.connect(gain).connect(master);
      preview = {stop() { source.onended = null; try { source.stop(); } catch {} source.disconnect(); gain.disconnect(); }};
      source.onended = finish; source.start();
    } else {
      const url = MEDIA.get('assets/audio/' + file); if (!url) throw new Error('This recording is not ready. Try again after loading.');
      const el = new Audio(url), source = ac.createMediaElementSource(el), gain = ac.createGain();
      gain.gain.value = .65; source.connect(gain).connect(master);
      preview = {stop() { el.onended = el.onerror = null; el.pause(); el.removeAttribute('src'); el.load(); source.disconnect(); gain.disconnect(); }};
      el.onended = finish;
      el.onerror = () => { if (token === previewToken) { stopSoundPreview(); previewState.error = 'Playback failed. Try this recording again.'; emitPreview(); } };
      await el.play(); if (token !== previewToken) return;
    }
    previewState.loading = false; emitPreview();
  } catch (e) {
    if (token !== previewToken) return;
    stopSoundPreview(); previewState.error = e.message || 'Playback failed. Try again.'; emitPreview();
  }
}

// ---------- The recorded library ----------
// audio.json: { sfx: { kind: [files] }, amb: { room: [file] }, music: { name: [takes] } }. Effects are decoded up front
// (small); room ambience streams from <audio> elements.
let LIB = null;
const BUF = {};
async function loadLibrary() {
  if (/[?&]synth\b/.test(location.search)) return; // the synthesized set (comparisons)
  try {
    LIB = await (await fetch('assets/audio/audio.json')).json();
    if (!preloading) playMood();
    await Promise.all(Object.entries(LIB.sfx).map(async ([k, files]) => {
      BUF[k] = (await Promise.all(files.map(f => fetch('assets/audio/' + f).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(b => rememberBuffer(f, b)).catch(() => null)))).filter(Boolean);
    }));
    // the blackout monster's sounds (tools/v5_monster.py): played as effects; its footfall is 'mstep'
    await Promise.all(Object.entries(LIB.monster || {}).map(async ([k, f]) => {
      const b = await fetch('assets/audio/' + f).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).catch(() => null);
      if (b) BUF[k === 'step' ? 'mstep' : k] = [rememberBuffer(f, b)];
    }));
    await Promise.all(Object.entries(LIB.cues || {}).map(async ([kind, files]) => {
      BUF[kind] = await Promise.all(files.map(async f => {
        const r = await fetch('assets/audio/' + f); if (!r.ok) throw new Error('Cue failed: ' + f);
        return rememberBuffer(f, await ac.decodeAudioData(await r.arrayBuffer()));
      }));
    }));
    available.clear();
    for (const id of Object.keys(LIB.death || {})) deathBuf(id); // (not awaited: a preview may be waiting on this load)
  } catch (e) { LIB = null; }
}
// The death sounds (each player's pick, tools/v5_death.py), decoded once each; the menu's preview may ask before the
// library has loaded.
const DEATH = {};
let libReady = null;
function deathBuf(id) {
  if (!DEATH[id]) {
    DEATH[id] = (async () => {
      if (!LIB) await libReady;
      const f = LIB && LIB.death && LIB.death[id]; if (!f) return null;
      try { return rememberBuffer(f, await ac.decodeAudioData(await (await fetch('assets/audio/' + f)).arrayBuffer())); } catch (e) { return null; }
    })();
    DEATH[id].then(b => { if (!b) delete DEATH[id]; }); // (a failed fetch tries again next time)
  }
  return DEATH[id];
}
// Each player's own death sound, recorded on the menu (Steve, 2026-10-14), by character id for this game: data URLs,
// decoded when first needed. A player with none has the picked one (deathBuf).
const REC_URL = {}, REC = {};
export const okRec = u => typeof u === 'string' && u.length < 90000 && /^data:audio\/[\w.+-]+(;[\w=.+-]+)*;base64,[\w+/=]+$/.test(u);
export function setRecs(map, add = false) { // add: one more to the set (online they come one per message)
  if (!add) { for (const k in REC_URL) delete REC_URL[k]; for (const k in REC) delete REC[k]; }
  for (const [id, url] of Object.entries(map || {})) if (okRec(url)) REC_URL[id] = url;
}
async function decodeRec(url) {
  try {
    const b = await ac.decodeAudioData(await (await fetch(url)).arrayBuffer()), d = b.getChannelData(0);
    let i = 0; while (i < d.length && Math.abs(d[i]) < 0.03) i++; // start on the sound, not on the click of the button
    b.lead = Math.max(0, i / b.sampleRate - 0.03);
    return b;
  } catch (e) { return null; }
}
const recBuf = who => REC_URL[who] ? (REC[who] || (REC[who] = decodeRec(REC_URL[who]))) : Promise.resolve(null);
function trackShot(source, gain, filter, file) {
  const shot = {source, file, cleanup() { if (!oneShots.delete(shot)) return; source.disconnect(); gain.disconnect(); filter?.disconnect(); }};
  oneShots.add(shot); source.onended = shot.cleanup;
}
function playDeath(b, vol, muffle) {
  if (!kept(bufferFiles.get(b))) return;
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = b; g.gain.value = 0.9 * vol;
  const lp = muffle ? ac.createBiquadFilter() : null;
  if (lp) { lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.5; s.connect(lp).connect(g); } else s.connect(g);
  trackShot(s, g, lp, bufferFiles.get(b));
  g.connect(sfxBus); s.start(0, b.lead || 0);
}
// A death as one hears it: vol is the host's (by room and wall, sim.js hearKill); through a wall it is also muffled.
// who: the victim, whose own recording plays if they made one.
export function death(id, vol = 1, muffle = false, who = null, cue = null) {
  if (!ac || !(vol > 0)) return;
  if (cue?.distant && cue.at && BUF.distantDeath?.length) {
    if (cue.event && heardCueDeaths.has(cue.event)) return;
    if (cue.event) { heardCueDeaths.add(cue.event); if (heardCueDeaths.size > 128) heardCueDeaths.delete(heardCueDeaths.values().next().value); }
    positionalCue('distantDeath', {x: cue.at[0], y: cue.at[1]}, Math.min(.65, vol), {muffle, priority: 2, distant: true});
    return;
  }
  recBuf(who).then(async r => {
    const b = r || (id ? await deathBuf(id) : null);
    if (!b) { synth('die'); return; }
    playDeath(b, vol, muffle);
    deathLog.push({ id: r ? 'rec' : id, who, vol: +vol.toFixed(2), muffle: !!muffle, len: +b.duration.toFixed(2) }); if (deathLog.length > 10) deathLog.shift();
  });
}
// The menu's play button: a recording just made.
export function playRec(url) { unlock(); if (!ac || !okRec(url)) return; decodeRec(url).then(b => { if (b) { playDeath(b, 1, false); deathLog.push({ id: 'rec', who: 'menu', vol: 1, muffle: false, len: +b.duration.toFixed(2) }); } }); }
const deathLog = [];

// Two decks let room ambience crossfade without a hard cut.
function deck(bus) {
  const el = new Audio(); el.loop = true; el.preload = 'auto';
  const g = ac.createGain(); g.gain.value = 0; ac.createMediaElementSource(el).connect(g).connect(bus);
  return { el, g, src: '' };
}
const streams = { music: null, amb: null };
function stream(kind, file, vol = 1) {
  if (!ac || !LIB) return;
  if (file && !kept(file)) file = null;
  const S = streams[kind] || (streams[kind] = { decks: [deck(kind === 'music' ? musicBus : ambBus), deck(kind === 'music' ? musicBus : ambBus)], cur: 0 });
  const cur = S.decks[S.cur], url = file ? 'assets/audio/' + file : '';
  if (cur.src === url) { cur.g.gain.setTargetAtTime(url ? vol : 0, ac.currentTime, 0.4); return; }
  cur.g.gain.setTargetAtTime(0, ac.currentTime, 0.6); // the old one fades out and stops
  const old = cur; setTimeout(() => { if (old !== S.decks[S.cur] || !old.src) old.el.pause(); }, 3000);
  if (!url) { cur.src = ''; return; }
  S.cur = 1 - S.cur; const d = S.decks[S.cur];
  d.src = url; d.el.dataset.asset = url; d.el.src = mediaURL(url); d.el.currentTime = 0; d.el.play().catch(() => {});
  d.g.gain.setValueAtTime(0, ac.currentTime); d.g.gain.setTargetAtTime(vol, ac.currentTime + 0.1, 0.8);
}
let room = null;
function playMood() {
  if (!LIB || preloading) return;
  const score = LIB.music?.casino || [];
  stream('music', mood !== 'over' && score.length ? score[scoreChoice] || score[0] : null, room === 'bar' && mood === 'lounge' ? 0.045 : 0.18);
  const inCasino = mood !== 'over';
  const key = mood === 'lounge' && room ? room : 'floor';
  const f = key === 'floor' && LIB.amb[nearTables] ? LIB.amb[nearTables] : LIB.amb[key] || LIB.amb.floor;
  stream('amb', inCasino && f ? f[0] : null, mood === 'lounge' ? 0.72 : 0.38);
  updateJukebox();
}
export function setMood(m) { if (m === mood) return; mood = m; if (m !== 'lounge') resetSceneCues(); playMood(); }
// Room ambience follows the player during play.
export function setRoom(r) { if (r === room) return; room = r; if (mood === 'lounge') playMood(); }
// Local table beds prevent slot-machine noise following you around the pits.
let nearTables = 'tables', listener = { x: 0, y: 0, look: 0 }, listenerContext = null, jukebox = null;
let scoreChoice = Math.max(0, Math.min(2, +(load('lc.score') || 0))), floorChoice = load('lc.floorBed') || 'auto';
export const soundscape = () => ({ music: String(scoreChoice), floor: floorChoice });
export function setSoundscape(kind, value) {
  if (kind === 'music') { scoreChoice = Math.max(0, Math.min(2, +value || 0)); save('lc.score', String(scoreChoice)); }
  if (kind === 'floor' && ['auto','tables','blackjack','roulette'].includes(value)) { floorChoice = value; save('lc.floorBed', value); }
  setListener(listener.x, listener.y, listener.look); playMood();
}
export function setListener(x, y, look = 0) {
  const moved = listener.x !== x || listener.y !== y || listener.look !== look;
  listener.x = x; listener.y = y; listener.look = look;
  const bj = Math.min(...BJ_TABLES.map(t => Math.hypot(x - t.x, y - t.y)));
  const rl = Math.hypot(x - (RL_TABLE.x + RL_TABLE.w / 2), y - (RL_TABLE.y + RL_TABLE.h / 2));
  const next = floorChoice !== 'auto' ? floorChoice : bj < 290 && bj < rl ? 'blackjack' : rl < 300 ? 'roulette' : 'tables';
  if (next !== nearTables) { nearTables = next; if (mood === 'lounge' && room === 'floor') playMood(); }
  updateJukebox();
  if (!ac || (!moved && listenerContext === ac)) return;
  listenerContext = ac;
  const l = ac.listener;
  if (l.positionX) { l.positionX.value = x / 60; l.positionY.value = 1.5; l.positionZ.value = y / 60; l.forwardX.value = Math.cos(look); l.forwardY.value = 0; l.forwardZ.value = Math.sin(look); l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
  else { l.setPosition(x / 60, 1.5, y / 60); l.setOrientation(Math.cos(look), 0, Math.sin(look), 0, 1, 0); }
}
function updateJukebox() {
  if (!ac || !LIB) return;
  const active = mood === 'lounge' && room === 'bar' && kept('music/menu-1.mp3');
  if (!jukebox && active) {
    const el = new Audio(mediaURL('assets/audio/music/menu-1.mp3')); el.loop = true; el.preload = 'auto';
    const g = ac.createGain(), p = ac.createPanner(), filter = ac.createBiquadFilter();
    g.gain.value = 0; p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.3; p.maxDistance = 10; p.rolloffFactor = 1.6;
    p.setPosition(445 / 60, 0.95, 675 / 60); filter.type = 'lowpass'; filter.frequency.value = 3500;
    ac.createMediaElementSource(el).connect(filter).connect(g).connect(p).connect(musicBus);
    jukebox = { el, g, p, active: false };
  }
  if (!jukebox || jukebox.active === active) return;
  jukebox.active = active; jukebox.g.gain.setTargetAtTime(active ? 0.32 : 0, ac.currentTime, 0.35);
  if (active) jukebox.el.play().catch(() => {});
  else setTimeout(() => { if (!jukebox.active) jukebox.el.pause(); }, 2500);
}
// Legacy event hooks now play physical casino sounds.
export function sting(name, vol = 0.9) {
  if (name === 'win' || name === 'gamblersWin') sfx('cashout', vol);
  else if (name === 'eject') sfx('door', vol);
}
let nextAmbient = 0;
function ambientTick() {
  if (!ac || mood !== 'lounge' || !room || room === 'alley' || ac.currentTime < nextAmbient) return;
  nextAmbient = ac.currentTime + 12 + Math.random() * 22;
  sfx(Math.random() < 0.55 ? 'cough' : room === 'slots' ? 'reelStop' : nearTables === 'blackjack' ? 'shuffle' : 'chips', 0.12 + Math.random() * 0.14, true);
}

// World positions remain fixed as the listener turns; finished sources release their graph.
const cueVoices = new Set(), cueLog = [], heardCueDeaths = new Set();
let cueActive = false, footstepSeq = 0;
function stopCueVoices() { for (const v of [...cueVoices]) { try { v.source.stop(); } catch {} v.cleanup(); } }
function positionalCue(kind, position, volume, {height = 1.35, muffle = false, priority = 0, distant = false} = {}) {
  const buffers = buffersFor(kind); if (!ac || !sfxOn || !vol.sfx || !buffers.length) return false;
  if (cueVoices.size >= 5) {
    const victim = [...cueVoices].find(v => v.priority < priority); if (!victim) return false;
    victim.source.stop(); victim.cleanup();
  }
  const source = ac.createBufferSource(), gain = ac.createGain(), panner = ac.createPanner();
  source.buffer = buffers[Math.floor(Math.random() * buffers.length)]; source.playbackRate.value = .97 + Math.random() * .06;
  gain.gain.value = volume; panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
  panner.refDistance = distant ? 10 : 1.5; panner.maxDistance = distant ? 45 : 18; panner.rolloffFactor = distant ? .6 : 1;
  panner.positionX.value = position.x / 60; panner.positionY.value = height; panner.positionZ.value = position.y / 60;
  const filter = muffle ? ac.createBiquadFilter() : null;
  if (filter) { filter.type = 'lowpass'; filter.frequency.value = distant ? 1100 : 850; source.connect(filter).connect(gain); } else source.connect(gain);
  gain.connect(panner).connect(sfxBus);
  const voice = {source, priority, file: bufferFiles.get(source.buffer), cleanup() { if (!cueVoices.delete(voice)) return; source.disconnect(); filter?.disconnect(); gain.disconnect(); panner.disconnect(); }};
  cueVoices.add(voice); source.onended = voice.cleanup;
  source.start(); cueLog.push({kind, at: ac.currentTime, x: position.x, y: position.y, volume, muffle}); if (cueLog.length > 64) cueLog.shift();
  return true;
}
const casinoCues = createCasinoCues({play: positionalCue, roomOf, clearLine: los, vents: STAFF_DOORS});
export function resetSceneCues() { stopCueVoices(); casinoCues.reset(); heardCueDeaths.clear(); cueLog.length = 0; cueActive = false; footstepSeq = 0; }
export function sceneCues(v, active) {
  if (!ac) return;
  active = active && sfxOn && vol.sfx > 0;
  if (!active && cueActive) stopCueVoices(); cueActive = active;
  casinoCues.update({time: ac.currentTime, chars: v.pub.chars, me: {...listener, id: v.priv.me}, look: listener.look, active, alive: v.priv.alive, blackout: !!v.pub.blackout});
  const steps = v.priv.footsteps;
  if (!steps || steps.seq === footstepSeq) return; footstepSeq = steps.seq;
  if (!active) return; // consume muted/paused packets without queuing a later burst
  const mine = roomOf(listener);
  v.pub.chars.filter(c => c.alive && steps.ids.includes(c.id))
    .sort((a, b) => Math.hypot(a.x-listener.x,a.y-listener.y) - Math.hypot(b.x-listener.x,b.y-listener.y)).slice(0,2)
    .forEach(c => positionalCue(['bar','rest','race'].includes(roomOf(c)) ? 'potatoStepTile' : 'potatoStepCarpet', c, .32, {height: .12, muffle: roomOf(c) !== mine}));
}
export const cueInfo = () => ({...casinoCues.info(), active: cueActive, voices: cueVoices.size, loaded: Object.fromEntries(Object.keys(LIB?.cues || {}).map(k => [k, BUF[k]?.length || 0])), recent: cueLog.slice()});

// ---------- The synthesized fallback ----------
function tone(bus, f, t, d, type, vol, attack = 0.01) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(bus); o.start(t); o.stop(t + d + 0.05);
  return o;
}
function noise(bus, t, d, vol, hp, ctx = ac) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * d)), buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(bus); s.start(t);
}

const SYNTH = {
  start: [[392, 0.1], [523, 0.15]], pour: [[700, 0.05], [600, 0.05]], sip: [[300, 0.06]], poison: [[180, 0.25]], die: [[220, 0.15], [150, 0.35]],
  stab: [[900, 0.04], [120, 0.2]], lights: [[120, 0.5]], meeting: [[660, 0.12], [660, 0.12], [880, 0.25]], chat: [[520, 0.03]], coin: [[988, 0.05], [1319, 0.12]],
  win: [[523, 0.12], [659, 0.12], [784, 0.3]], lose: [[392, 0.15], [311, 0.15], [262, 0.35]], gasp: [[700, 0.05], [500, 0.1]], crunch: [], cheer: [[523, 0.1], [784, 0.2]], boo: [[200, 0.3]],
  click: [[880, 0.02]], roar: [[70, 0.5], [55, 0.7]], breaker: [[160, 0.05]], powerup: [[110, 0.2], [220, 0.2], [440, 0.4]],
};
function synth(kind) {
  let t = ac.currentTime;
  if (kind === 'step') { noise(sfxBus, t, 0.06, 0.035, 180); return; }
  if (kind === 'crunch') { noise(sfxBus, t, 0.12, 0.25, 1500); noise(sfxBus, t + 0.1, 0.1, 0.2, 1800); return; }
  if (kind === 'chip') { noise(sfxBus, t, 0.035, 0.14, 3500); tone(sfxBus, 2700, t, 0.06, 'sine', 0.05); tone(sfxBus, 3500, t + 0.035, 0.05, 'sine', 0.035); return; } // chips clink
  if (kind === 'mstep') { noise(sfxBus, t, 0.14, 0.3, 90); return; }
  if (kind === 'hum') { buzz(t); return; } // the backrooms: the tubes catch, stutter and settle into their hum
  if (kind === 'maul') { noise(sfxBus, t, 0.5, 0.35, 400); noise(sfxBus, t + 0.3, 0.3, 0.3, 1400); }
  if (kind === 'stab' || kind === 'die') noise(sfxBus, t, 0.15, 0.2, 800);
  for (const [f, d] of SYNTH[kind] || []) {
    tone(sfxBus, f, t, d, kind === 'die' || kind === 'lights' || kind === 'boo' || kind === 'roar' ? 'sawtooth' : 'triangle', kind === 'roar' ? 0.2 : 0.09);
    t += d;
  }
}

// ---------- Effects ----------
// Each kind's level against the others (the files peak alike), and footsteps by the floor underfoot.
const VOL = { crunch: 1, step: 0.16, click: 0.35, chip: 0.5, chips: 0.5, card: 0.6, flip: 0.6, chat: 0.3, peg: 0.25, reelStop: 0.55, coin: 0.55, vote: 0.7,
  rouletteSpin: 0.55, wheelSpin: 0.55, reels: 0.5, sip: 0.6, pour: 0.6, gasp: 0.75, lights: 0.8, meeting: 0.75, roar: 1, maul: 1, breaker: 0.8, powerup: 0.9, mstep: 0.9, hum: 0.9 };
const FLOOR = { floor: 'fallCarpet', slots: 'fallCarpet', vip: 'fallCarpet', arcade: 'fallCarpet', bar: 'fallWood', rest: 'fallTile', race: 'fallTile' };
const lastAt = {};
export function sfx(kind, vol = 1, muffle = false) {
  if (!ac || !kind) return;
  if (kind === 'win') kind = 'cashout';
  if (kind === 'lose') kind = 'chips';
  if (kind === 'gasp') kind = 'cough';
  const k = kind === 'step' ? FLOOR[room] || 'fallCarpet' : kind, bufs = buffersFor(k);
  if (!bufs.length) { if (!BUF[k]?.length && kept(kind === 'hum' ? 'generated/backroom-hum' : kind === 'crunch' ? 'generated/eating-crunch' : '')) synth(kind); return; }
  if (ac.currentTime - (lastAt[k] || -1) < 0.03) return; lastAt[k] = ac.currentTime; // a burst of the same sound in one frame
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = bufs[Math.floor(Math.random() * bufs.length)];
  s.playbackRate.value = kind === 'crunch' ? 1 : 0.95 + Math.random() * 0.1;
  g.gain.value = (VOL[kind] ?? 0.8) * vol;
  const lp = muffle ? ac.createBiquadFilter() : null;
  if (lp) { lp.type = 'lowpass'; lp.frequency.value = 650; s.connect(lp).connect(g); } else s.connect(g); // through a wall
  trackShot(s, g, lp, bufferFiles.get(s.buffer));
  g.connect(sfxBus); s.start();
  if (kind === 'rouletteSpin') s.stop(ac.currentTime + 4);
  if (kind === 'ballDrop') s.stop(ac.currentTime + 0.8);
}
// The monster's growl, looped while it is out, as loud as render3d says (by how near it is); 0 stops it.
let growlSrc = null, growlGain = null, growlLevel;
export function growl(v) {
  if (!ac) return;
  const b = buffersFor('growl')[0]; if (!b) v = 0;
  if (v > 0.001 && b && !growlSrc) { growlSrc = ac.createBufferSource(); growlSrc.buffer = b; growlSrc.loop = true; growlGain = ac.createGain(); growlGain.gain.value = 0; growlLevel = undefined; growlSrc.connect(growlGain).connect(sfxBus); growlSrc.start(); }
  const level = Math.min(1, v);
  if (growlGain && level !== growlLevel) { growlGain.gain.setTargetAtTime(level, ac.currentTime, 0.08); growlLevel = level; }
  if (v <= 0.001 && growlSrc) { const s = growlSrc; growlSrc = null; setTimeout(() => { try { s.stop(); } catch (e) { /* stopped */ } }, 400); }
}
// The fluorescent tubes (the backrooms casino, backrooms.js): a 120 Hz mains buzz with its harmonics through a band
// pass, the ballast's whine on top and a slow beat, made once. 4 s holds a whole number of every cycle, so it loops
// without a seam.
let humB = null, humFill = null;
function* fillHumBuffer(b) {
  const sr = b.sampleRate, len = b.length, d = b.getChannelData(0), P = Math.PI * 2;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr, beat = 1 + 0.18 * Math.sin(P * 0.5 * t) + 0.08 * Math.sin(P * 1.25 * t);
    const saw = ((t * 120) % 1) * 2 - 1; // the buzz: a sawtooth's edge, softened below
    lp += (saw - lp) * 0.08;
    d[i] = beat * (0.34 * Math.sin(P * 120 * t) + 0.22 * Math.sin(P * 240 * t + 0.4) + 0.12 * Math.sin(P * 360 * t + 1.1) + 0.07 * Math.sin(P * 480 * t) + 0.16 * lp)
      + 0.025 * Math.sin(P * 7680 * t) * (1 + Math.sin(P * 0.75 * t)) + (Math.random() * 2 - 1) * 0.012;
    if ((i & 2047) === 2047) yield;
  }
}
function beginHumBuffer() {
  if (humB) return;
  humB = ac.createBuffer(1, Math.round(ac.sampleRate * 4), ac.sampleRate); humFill = fillHumBuffer(humB);
}
function humBuffer() {
  beginHumBuffer();
  // An early caller can finish the same in-progress buffer without allocating
  // another copy or playing a partially filled loop.
  if (humFill) { for (const _ of humFill) {} humFill = null; }
  return humB;
}
async function prepareHumBuffer() {
  if (!ac) return;
  beginHumBuffer(); let began = performance.now();
  while (humFill) {
    if (humFill.next().done) { humFill = null; break; }
    if (performance.now() - began >= 8) {
      await new Promise(ok => setTimeout(ok, 0)); began = performance.now();
    }
  }
}
// The one-shot: the tubes kick on, stutter twice and catch (sfx 'hum').
function buzz(t) {
  const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = humBuffer(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
  g.gain.setValueAtTime(0.0001, t);
  for (const [at, v] of [[0, 0.7], [0.07, 0.05], [0.16, 0.6], [0.2, 0.04], [0.42, 0.75], [0.5, 0.1], [0.62, 0.55]]) g.gain.setValueAtTime(v, t + at);
  g.gain.setTargetAtTime(0.0001, t + 1.3, 0.35);
  src.connect(bp).connect(g).connect(sfxBus); src.start(t, Math.random() * 2); src.stop(t + 3);
  noise(sfxBus, t, 0.05, 0.25, 2500); noise(sfxBus, t + 0.42, 0.04, 0.2, 2500); // the starters' clicks
}
// The loop while the backrooms are in (render3d.js through backrooms.js, every frame): 0 stops it.
let humSrc = null, humGain = null, humLevel;
export function hum(v) {
  if (!ac) return;
  if (!kept('generated/backroom-hum')) v = 0;
  if (v > 0.001 && !humSrc) {
    humSrc = ac.createBufferSource(); humSrc.buffer = humBuffer(); humSrc.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    humGain = ac.createGain(); humGain.gain.value = 0; humLevel = undefined; humSrc.connect(lp).connect(humGain).connect(ambBus); humSrc.start();
  }
  const level = Math.min(1, v) * 0.16; // quiet: under the room
  if (humGain && level !== humLevel) { humGain.gain.setTargetAtTime(level, ac.currentTime, 0.15); humLevel = level; }
  if (v <= 0.001 && humSrc) { const s = humSrc; humSrc = null; humGain = null; setTimeout(() => { try { s.stop(); } catch (e) { /* stopped */ } }, 800); }
}
// for checks: what has loaded and what is playing
export const audioInfo = () => ({ ctx: ac ? ac.state : null, lib: !!LIB, sfx: Object.values(BUF).reduce((n, b) => n + b.length, 0), mood, room, deaths: deathLog.slice(), mutedSounds: [...mutedFiles], activeEffects: [...oneShots].map(s => s.file), preview: soundPreviewState(),
  music: streams.music ? streams.music.decks[streams.music.cur].src : '', amb: streams.amb ? streams.amb.decks[streams.amb.cur].src : '', hum: !!humSrc, tableBed: nearTables, scoreChoice, jukebox: jukebox ? { active: jukebox.active, playing: !jukebox.el.paused, time: jukebox.el.currentTime, distance: Math.hypot(listener.x - 445, listener.y - 675) / 60 } : null });

// Keep stream bytes in memory: changing rooms and score choices never starts a network download mid-game.
const MEDIA = new Map();
let preloading = false, preloadTask;
const mediaURL = path => MEDIA.get(path) || path;
// Render the original two filtered bursts once, then share the exact waveform
// between eating and the sound browser. No random buffer allocation per bite.
async function prepareCrunchBuffer() {
  if (!ac) return;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Offline(1, Math.ceil(ac.sampleRate * .22), ac.sampleRate);
  noise(ctx.destination, 0, .12, .25, 1500, ctx);
  noise(ctx.destination, .1, .1, .2, 1800, ctx);
  BUF.crunch = [rememberBuffer('generated/eating-crunch', await ctx.startRendering())];
  available.delete('crunch');
}
export function preloadAudio() {
  if (preloadTask) return preloadTask;
  preloading = true; unlock(true);
  return preloadTask = (async () => {
    await Promise.all([libReady, prepareHumBuffer().then(prepareCrunchBuffer)]);
    if (!LIB) { if (!/[?&]synth\b/.test(location.search)) throw new Error('Sound library failed to load'); return; }
    const paths = new Set(['music/menu-1.mp3', ...Object.values(LIB.amb || {}).flat(), ...Object.values(LIB.music || {}).flat()]);
    await Promise.all([...paths].map(async f => { const path = 'assets/audio/' + f; const r = await fetch(path); if (!r.ok) throw new Error('Audio failed: ' + path); MEDIA.set(path, URL.createObjectURL(await r.blob())); }));
    await Promise.all(Object.keys(LIB.death || {}).map(deathBuf));
    rememberBuffer('generated/backroom-hum', humB);

  })().finally(() => { preloading = false; playMood(); });
}
