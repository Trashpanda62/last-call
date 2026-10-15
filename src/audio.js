// Sounds: ElevenLabs effects, room ambience and music (assets/audio, made by tools/v4_audio.py; no voices). The old
// synthesized effects and lounge loop play until the files load, and stand in for any that fail.
let ac = null, master = null, musicBus = null, sfxBus = null, ambBus = null, musicOn = true, sfxOn = true, mood = 'menu', timer = null, step = 0, nextT = 0;
const load = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage is optional */ } };
musicOn = load('lc.music') !== '0'; sfxOn = load('lc.sfx') !== '0';
// The sound settings' levels (0..1): everything, the music, the effects and ambience.
const vol = { master: 0.9, music: 0.5, sfx: 1 };
try { Object.assign(vol, JSON.parse(load('lc.vol') || '{}')); } catch (e) { /* the defaults stand */ }

export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = vol.master; master.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = musicOn ? vol.music : 0; musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? vol.sfx : 0; sfxBus.connect(master);
    ambBus = ac.createGain(); ambBus.gain.value = 0.9; ambBus.connect(sfxBus);
    nextT = ac.currentTime + 0.1;
    timer = setInterval(schedule, 50);
    libReady = loadLibrary();
  } catch (e) { ac = null; }
}
export const settings = () => ({ music: musicOn, sfx: sfxOn });
export function setMusic(on) { musicOn = on; save('lc.music', on ? '1' : '0'); if (musicBus) musicBus.gain.setTargetAtTime(on ? vol.music : 0, ac.currentTime, 0.1); }
export function setSfx(on) { sfxOn = on; save('lc.sfx', on ? '1' : '0'); if (sfxBus) sfxBus.gain.setTargetAtTime(on ? vol.sfx : 0, ac.currentTime, 0.05); }
export const volumes = () => ({ ...vol });
export function setVolumes(v) {
  Object.assign(vol, v); save('lc.vol', JSON.stringify(vol));
  if (!ac) return;
  master.gain.setTargetAtTime(vol.master, ac.currentTime, 0.05);
  musicBus.gain.setTargetAtTime(musicOn ? vol.music : 0, ac.currentTime, 0.05); sfxBus.gain.setTargetAtTime(sfxOn ? vol.sfx : 0, ac.currentTime, 0.05);
}
// The game's own output, for the voice chat to join at the same master level.
export const context = () => ac;

// ---------- The recorded library ----------
// audio.json: { sfx: { kind: [files] }, amb: { room: [file] }, music: { name: [takes] } }. Effects are decoded up front
// (small); ambience and music stream from <audio> elements.
let LIB = null;
const BUF = {};
// Steve's pick of each music piece's two takes (0 = the first); the review page sets lc.take.<name> to compare.
const TAKE = {};
const PICKS = { bar: 1, eject: 1 }; // Steve's picks, 2026-10-13; the rest take A
async function loadLibrary() {
  if (/[?&]synth\b/.test(location.search)) return; // the synthesized set (comparisons)
  try {
    LIB = await (await fetch('assets/audio/audio.json')).json();
    for (const k in LIB.music) { const s = load('lc.take.' + k), t = s == null ? PICKS[k] || 0 : +s; TAKE[k] = t >= 0 && t < LIB.music[k].length ? t : 0; }
    playMood();
    await Promise.all(Object.entries(LIB.sfx).map(async ([k, files]) => {
      BUF[k] = (await Promise.all(files.map(f => fetch('assets/audio/' + f).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).catch(() => null)))).filter(Boolean);
    }));
    // the blackout monster's sounds (tools/v5_monster.py): played as effects; its footfall is 'mstep'
    await Promise.all(Object.entries(LIB.monster || {}).map(async ([k, f]) => {
      const b = await fetch('assets/audio/' + f).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).catch(() => null);
      if (b) BUF[k === 'step' ? 'mstep' : k] = [b];
    }));
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
      try { return await ac.decodeAudioData(await (await fetch('assets/audio/' + f)).arrayBuffer()); } catch (e) { return null; }
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
function playDeath(b, vol, muffle) {
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = b; g.gain.value = 0.9 * vol;
  if (muffle) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.5; s.connect(lp).connect(g); } else s.connect(g);
  g.connect(sfxBus); s.start(0, b.lead || 0);
}
// A death as one hears it: vol is the host's (by room and wall, sim.js hearKill); through a wall it is also muffled.
// who: the victim, whose own recording plays if they made one.
export function death(id, vol = 1, muffle = false, who = null) {
  if (!ac || !(vol > 0)) return;
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

// Two decks per stream so a change crossfades: music follows the mood and the room, ambience the room.
function deck(bus) {
  const el = new Audio(); el.loop = true; el.preload = 'auto';
  const g = ac.createGain(); g.gain.value = 0; ac.createMediaElementSource(el).connect(g).connect(bus);
  return { el, g, src: '' };
}
const streams = { music: null, amb: null };
function stream(kind, file, vol = 1) {
  if (!ac || !LIB) return;
  const S = streams[kind] || (streams[kind] = { decks: [deck(kind === 'music' ? musicBus : ambBus), deck(kind === 'music' ? musicBus : ambBus)], cur: 0 });
  const cur = S.decks[S.cur], url = file ? 'assets/audio/' + file : '';
  if (cur.src === url) { cur.g.gain.setTargetAtTime(url ? vol : 0, ac.currentTime, 0.4); return; }
  cur.g.gain.setTargetAtTime(0, ac.currentTime, 0.6); // the old one fades out and stops
  const old = cur; setTimeout(() => { if (old !== S.decks[S.cur]) { old.el.pause(); } }, 3000);
  if (!url) { cur.src = ''; return; }
  S.cur = 1 - S.cur; const d = S.decks[S.cur];
  d.src = url; d.el.src = url; d.el.currentTime = 0; d.el.play().catch(() => {});
  d.g.gain.setValueAtTime(0, ac.currentTime); d.g.gain.setTargetAtTime(vol, ac.currentTime + 0.1, 0.8);
}
const ROOM_MUSIC = { floor: 'floor', slots: 'floor', bar: 'bar', rest: 'bar', vip: 'vip', arcade: 'arcade', race: 'race' };
let room = null;
const pieceFile = n => LIB && LIB.music[n] ? LIB.music[n][TAKE[n] || 0] : null;
function playMood() {
  if (!LIB) return;
  if (mood === 'menu') stream('music', pieceFile('menu'), 0.9);
  else if (mood === 'meeting') stream('music', pieceFile('meeting'), 0.8);
  else if (mood === 'over') stream('music', null);
  else stream('music', pieceFile(ROOM_MUSIC[room] || 'floor'), room === 'rest' ? 0.35 : 0.75);
  stream('amb', mood === 'lounge' && room && LIB.amb[room] ? LIB.amb[room][0] : null, mood === 'lounge' ? 1 : 0);
}
export function setMood(m) { if (m === mood) return; mood = m; playMood(); }
// where you are; music and ambience follow it during play
export function setRoom(r) { if (r === room) return; room = r; if (mood === 'lounge') playMood(); }
// a one-shot piece over the music (win, lose, eject, gamblersWin, killersWin)
export function sting(name, vol = 0.9) {
  const f = pieceFile(name); if (!ac || !f || !musicOn) return;
  const el = new Audio('assets/audio/' + f), g = ac.createGain(); g.gain.value = vol;
  const src = ac.createMediaElementSource(el); src.connect(g).connect(musicBus);
  el.onended = () => { src.disconnect(); g.disconnect(); }; // a long table session plays hundreds of these
  el.play().catch(() => {});
}

// ---------- The synthesized fallback ----------
function tone(bus, f, t, d, type, vol, attack = 0.01) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(bus); o.start(t); o.stop(t + d + 0.05);
  return o;
}
function noise(bus, t, d, vol, hp) {
  const len = Math.max(1, Math.floor(ac.sampleRate * d)), buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(bus); s.start(t);
}

// ii-V-I-vi in F, brushed swing at 92 bpm, until the recorded music loads. The meeting mood is a low pulse instead.
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [[55, 58, 62, 65], [48, 52, 55, 58], [53, 57, 60, 64], [50, 53, 57, 60]]; // Gm7 C7 Fmaj7 Dm7
const BASS = [[43, 46, 50, 48], [36, 40, 43, 45], [41, 45, 48, 50], [38, 41, 45, 44]];
function schedule() {
  if (!ac) return;
  const beat = 60 / 92;
  while (nextT < ac.currentTime + 0.25) {
    const bar = Math.floor(step / 4) % 4, b = step % 4;
    if (LIB) { /* recorded music is playing */ }
    else if (mood === 'lounge' || mood === 'menu') {
      if (b === 0 || b === 2) for (const n of CHORDS[bar]) tone(musicBus, midi(n + 12), nextT + (b === 2 ? beat * 0.66 : 0), beat * 1.6, 'triangle', 0.035, 0.02);
      tone(musicBus, midi(BASS[bar][b]), nextT, beat * 0.9, 'sine', 0.12, 0.01);
      noise(musicBus, nextT, 0.08, 0.035, 6000); noise(musicBus, nextT + beat * 0.66, 0.05, 0.02, 7000);
      if (Math.random() < 0.3) tone(musicBus, midi(CHORDS[bar][Math.floor(Math.random() * 4)] + 24), nextT + beat * 0.33, beat * 0.5, 'sine', 0.025);
    } else if (mood === 'meeting') {
      tone(musicBus, midi(b % 2 ? 38 : 37), nextT, beat * 0.9, 'sawtooth', 0.025, 0.05);
      if (b === 0) tone(musicBus, midi(61), nextT, beat * 3, 'triangle', 0.02, 0.4);
    }
    nextT += beat; step++;
  }
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
const VOL = { step: 0.16, click: 0.35, chip: 0.5, chips: 0.5, card: 0.6, flip: 0.6, chat: 0.3, peg: 0.25, reelStop: 0.55, coin: 0.55, vote: 0.7,
  rouletteSpin: 0.55, wheelSpin: 0.55, reels: 0.5, sip: 0.6, pour: 0.6, gasp: 0.75, lights: 0.8, meeting: 0.75, roar: 1, maul: 1, breaker: 0.8, powerup: 0.9, mstep: 0.9, hum: 0.9 };
const FLOOR = { floor: 'fallCarpet', slots: 'fallCarpet', vip: 'fallCarpet', arcade: 'fallCarpet', bar: 'fallWood', rest: 'fallTile', race: 'fallTile' };
const STINGS = new Set(['win', 'lose']); // the recorded music stings stand in for these
const lastAt = {};
export function sfx(kind, vol = 1, muffle = false) {
  if (!ac || !kind) return;
  if (STINGS.has(kind) && pieceFile(kind) && musicOn) { sting(kind, kind === 'win' ? 0.7 : 0.6); return; } // music off: the plain effect
  const k = kind === 'step' ? FLOOR[room] || 'fallCarpet' : kind, bufs = BUF[k];
  if (!bufs || !bufs.length) { synth(kind); return; }
  if (ac.currentTime - (lastAt[k] || -1) < 0.03) return; lastAt[k] = ac.currentTime; // a burst of the same sound in one frame
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = bufs[Math.floor(Math.random() * bufs.length)];
  s.playbackRate.value = 0.95 + Math.random() * 0.1;
  g.gain.value = (VOL[kind] ?? 0.8) * vol;
  if (muffle) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; s.connect(lp).connect(g); } else s.connect(g); // through a wall
  g.connect(sfxBus); s.start();
}
// The monster's growl, looped while it is out, as loud as render3d says (by how near it is); 0 stops it.
let growlSrc = null, growlGain = null;
export function growl(v) {
  if (!ac) return;
  const b = BUF.growl && BUF.growl[0];
  if (v > 0.001 && b && !growlSrc) { growlSrc = ac.createBufferSource(); growlSrc.buffer = b; growlSrc.loop = true; growlGain = ac.createGain(); growlGain.gain.value = 0; growlSrc.connect(growlGain).connect(sfxBus); growlSrc.start(); }
  if (growlGain) growlGain.gain.setTargetAtTime(Math.min(1, v), ac.currentTime, 0.08);
  if (v <= 0.001 && growlSrc) { const s = growlSrc; growlSrc = null; setTimeout(() => { try { s.stop(); } catch (e) { /* stopped */ } }, 400); }
}
// The fluorescent tubes (the backrooms casino, backrooms.js): a 120 Hz mains buzz with its harmonics through a band
// pass, the ballast's whine on top and a slow beat, made once. 4 s holds a whole number of every cycle, so it loops
// without a seam.
let humB = null;
function humBuffer() {
  if (humB) return humB;
  const sr = ac.sampleRate, len = Math.round(sr * 4), b = ac.createBuffer(1, len, sr), d = b.getChannelData(0), P = Math.PI * 2;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr, beat = 1 + 0.18 * Math.sin(P * 0.5 * t) + 0.08 * Math.sin(P * 1.25 * t);
    const saw = ((t * 120) % 1) * 2 - 1; // the buzz: a sawtooth's edge, softened below
    lp += (saw - lp) * 0.08;
    d[i] = beat * (0.34 * Math.sin(P * 120 * t) + 0.22 * Math.sin(P * 240 * t + 0.4) + 0.12 * Math.sin(P * 360 * t + 1.1) + 0.07 * Math.sin(P * 480 * t) + 0.16 * lp)
      + 0.025 * Math.sin(P * 7680 * t) * (1 + Math.sin(P * 0.75 * t)) + (Math.random() * 2 - 1) * 0.012;
  }
  return (humB = b);
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
let humSrc = null, humGain = null;
export function hum(v) {
  if (!ac) return;
  if (v > 0.001 && !humSrc) {
    humSrc = ac.createBufferSource(); humSrc.buffer = humBuffer(); humSrc.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    humGain = ac.createGain(); humGain.gain.value = 0; humSrc.connect(lp).connect(humGain).connect(ambBus); humSrc.start();
  }
  if (humGain) humGain.gain.setTargetAtTime(Math.min(1, v) * 0.16, ac.currentTime, 0.15); // quiet: under the room
  if (v <= 0.001 && humSrc) { const s = humSrc; humSrc = null; humGain = null; setTimeout(() => { try { s.stop(); } catch (e) { /* stopped */ } }, 800); }
}
// for checks: what has loaded and what is playing
export const audioInfo = () => ({ ctx: ac ? ac.state : null, lib: !!LIB, sfx: Object.values(BUF).reduce((n, b) => n + b.length, 0), mood, room, deaths: deathLog.slice(),
  music: streams.music ? streams.music.decks[streams.music.cur].src : '', amb: streams.amb ? streams.amb.decks[streams.amb.cur].src : '', hum: !!humSrc });
