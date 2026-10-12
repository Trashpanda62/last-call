// Synthesized sound effects and a quiet lounge loop. No audio files.
let ac = null, master = null, musicBus = null, sfxBus = null, musicOn = true, sfxOn = true, mood = 'lounge', timer = null, step = 0, nextT = 0;
const load = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage is optional */ } };
musicOn = load('lc.music') !== '0'; sfxOn = load('lc.sfx') !== '0';

export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = musicOn ? 0.5 : 0; musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(master);
    nextT = ac.currentTime + 0.1;
    timer = setInterval(schedule, 50);
  } catch (e) { ac = null; }
}
export const settings = () => ({ music: musicOn, sfx: sfxOn });
export function setMusic(on) { musicOn = on; save('lc.music', on ? '1' : '0'); if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ac.currentTime, 0.1); }
export function setSfx(on) { sfxOn = on; save('lc.sfx', on ? '1' : '0'); if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.05); }
export function setMood(m) { mood = m; }

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

// ii-V-I-vi in F, brushed swing at 92 bpm. The meeting mood is a low pulse instead.
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [[55, 58, 62, 65], [48, 52, 55, 58], [53, 57, 60, 64], [50, 53, 57, 60]]; // Gm7 C7 Fmaj7 Dm7
const BASS = [[43, 46, 50, 48], [36, 40, 43, 45], [41, 45, 48, 50], [38, 41, 45, 44]];
function schedule() {
  if (!ac) return;
  const beat = 60 / 92;
  while (nextT < ac.currentTime + 0.25) {
    const bar = Math.floor(step / 4) % 4, b = step % 4;
    if (mood === 'lounge') {
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

const SFX = {
  start: [[392, 0.1], [523, 0.15]], pour: [[700, 0.05], [600, 0.05]], sip: [[300, 0.06]], poison: [[180, 0.25]], die: [[220, 0.15], [150, 0.35]],
  stab: [[900, 0.04], [120, 0.2]], lights: [[120, 0.5]], meeting: [[660, 0.12], [660, 0.12], [880, 0.25]], chat: [[520, 0.03]], coin: [[988, 0.05], [1319, 0.12]],
  win: [[523, 0.12], [659, 0.12], [784, 0.3]], lose: [[392, 0.15], [311, 0.15], [262, 0.35]], gasp: [[700, 0.05], [500, 0.1]], crunch: [], cheer: [[523, 0.1], [784, 0.2]], boo: [[200, 0.3]],
  click: [[880, 0.02]],
};
export function sfx(kind) {
  if (!ac || !kind) return;
  let t = ac.currentTime;
  if (kind === 'step') { noise(sfxBus, t, 0.06, 0.035, 180); return; }
  if (kind === 'crunch') { noise(sfxBus, t, 0.12, 0.25, 1500); noise(sfxBus, t + 0.1, 0.1, 0.2, 1800); return; }
  if (kind === 'chip') { noise(sfxBus, t, 0.035, 0.14, 3500); tone(sfxBus, 2700, t, 0.06, 'sine', 0.05); tone(sfxBus, 3500, t + 0.035, 0.05, 'sine', 0.035); return; } // chips clink
  if (kind === 'stab' || kind === 'die') noise(sfxBus, t, 0.15, 0.2, 800);
  for (const [f, d] of SFX[kind] || []) {
    tone(sfxBus, f, t, d, kind === 'die' || kind === 'lights' || kind === 'boo' ? 'sawtooth' : 'triangle', 0.09);
    t += d;
  }
}
