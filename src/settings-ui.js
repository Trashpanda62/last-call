// The settings screen: Graphics, Sound, Voice and Controls tabs over the menu or the pause screen. Every change
// applies at once and is kept in this browser.
import { settings, onSettings, set, setPreset, resetGfx } from './settings.js';
import { $, show } from './ui.js';

const pct = v => Math.round(v * 100) + '%';
const OPT = (...pairs) => pairs.map(p => Array.isArray(p) ? p : [p, String(p)]);
// Each row: k (the setting), label, type (select | range | toggle | button), opts or min/max/step, fmt, note, when (shown if).
const TABS = {
  gfx: { title: 'Graphics', part: 'gfx', rows: [
    { k: 'preset', label: 'Quality preset', type: 'select', opts: OPT(['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'], ['custom', 'Custom']),
      note: 'Sets everything below at once. Change any of those and it becomes Custom.' },
    { head: 'Resolution' },
    { k: 'scale', label: 'Render resolution', type: 'range', min: 0.5, max: 2, step: 0.01, fmt: pct, live: false, note: g => resNote(g) },
    { k: 'upscaler', label: 'Upscaler', type: 'select', opts: OPT(['fsr', 'AMD FSR 1.0'], ['bilinear', 'Bilinear']),
      note: 'Fills the screen when the render resolution is under 100%. DLSS needs NVIDIA\'s driver, which no browser can reach; FSR 1 is AMD\'s open upscaler and runs anywhere.' },
    { k: 'sharpness', label: 'FSR sharpening', type: 'range', min: 0, max: 2, step: 0.05, fmt: v => pct(1 - v / 2), invert: true, when: g => g.upscaler === 'fsr' },
    { k: 'dynres', label: 'Dynamic resolution', type: 'select', opts: OPT([0, 'Off'], [45, 'Hold 45 FPS'], [60, 'Hold 60 FPS'], [90, 'Hold 90 FPS'], [120, 'Hold 120 FPS'], [144, 'Hold 144 FPS']), num: true,
      note: 'Lowers the render resolution (down to 50%) while the frame rate is under the target, and raises it again when there is room.' },
    { head: 'Image' },
    { k: 'aa', label: 'Anti-aliasing', type: 'select', opts: OPT(['off', 'Off'], ['fxaa', 'FXAA (fast)'], ['smaa', 'SMAA'], ['msaa', 'MSAA 4x'], ['msaa8', 'MSAA 8x']) },
    { k: 'shadows', label: 'Shadows', type: 'select', opts: OPT(['off', 'Off'], ['low', 'Low (1024)'], ['high', 'High (2048, soft)'], ['ultra', 'Ultra (4096, softer)']) },
    { k: 'ao', label: 'Ambient occlusion', type: 'select', opts: OPT(['off', 'Off'], ['half', 'GTAO, half resolution'], ['full', 'GTAO, full resolution']),
      note: 'Soft contact shadows where things meet: under tables, in corners, round the machines.' },
    { k: 'ssr', label: 'Reflections', type: 'toggle', note: 'Screen-space reflections on the hard floors, polished wood and gloss. Browsers can\'t use ray tracing hardware yet; this is the same look done on the finished frame. Heavy (Ultra turns it on).' },
    { k: 'lights', label: 'Lights near you', type: 'select', opts: OPT(4, 6, 8, 12), num: true, note: 'How many of the casino\'s lamps light the room round you at once.' },
    { k: 'aniso', label: 'Texture filtering', type: 'select', opts: OPT([1, 'Off'], [2, '2x'], [4, '4x'], [8, '8x'], [16, '16x']), num: true },
    { head: 'Light and colour' },
    { k: 'bloom', label: 'Glow (bloom)', type: 'select', opts: OPT(['off', 'Off'], ['subtle', 'Subtle'], ['strong', 'Strong']), note: 'The halo round neon and bulbs. Off for no glare at all.' },
    { k: 'beams', label: 'Light cones', type: 'toggle', note: 'The soft cones of light over the tables.' },
    { k: 'tone', label: 'Tone mapping', type: 'select', opts: OPT(['agx', 'AgX (soft highlights)'], ['aces', 'ACES (punchy)'], ['neutral', 'Neutral (true colour)']) },
    { k: 'exposure', label: 'Brightness', type: 'range', min: 0.6, max: 1.6, step: 0.02, fmt: pct },
    { head: 'Display' },
    { k: 'fov', label: 'Field of view', type: 'range', min: 60, max: 100, step: 1, fmt: v => v + '°' },
    { k: 'fpsCap', label: 'Frame rate limit', type: 'select', opts: OPT([0, 'Off (display refresh)'], [30, '30'], [60, '60'], [90, '90'], [120, '120'], [144, '144'], [165, '165'], [240, '240']), num: true },
    { k: 'showFps', label: 'Show FPS', type: 'toggle' },
    { k: '_fullscreen', label: 'Fullscreen', type: 'button', text: () => document.fullscreenElement ? 'Leave fullscreen' : 'Go fullscreen',
      act: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); },
      note: 'FreeSync and G-Sync: turn variable refresh on in your graphics driver (and in Windows display settings), then play fullscreen with the frame rate limit off. The browser always waits for the display, so there is no V-Sync switch.' },
    { k: '_reset', label: '', type: 'button', text: () => 'Reset graphics', act: () => resetGfx() },
  ] },
  sound: { title: 'Sound', rows: [
    { k: 'master', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct, audio: true },
    { k: 'music', label: 'Music', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct, audio: true },
    { k: 'sfx', label: 'Effects', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct, audio: true },
    { k: '_musicOn', label: 'Music on', type: 'toggle', get: A => A.settings().music, put: (A, v) => A.setMusic(v) },
    { k: '_sfxOn', label: 'Sounds on', type: 'toggle', get: A => A.settings().sfx, put: (A, v) => A.setSfx(v) },
  ] },
  voice: { title: 'Voice', part: 'voice', rows: [
    { k: 'mode', label: 'Voice chat', type: 'select', opts: OPT(['off', 'Off'], ['game', 'In-game proximity'], ['discord', 'Discord']),
      note: v => v.mode === 'discord' ? 'The bot moves you between voice channels as you walk from room to room. Join the room\'s Lobby channel in Discord, then link with the code below.'
        : v.mode === 'game' ? 'Hear the players near you, quieter with distance and muffled through walls. The dead hear everyone; only the dead hear them.' : 'No voice chat.' },
    { k: 'micId', label: 'Microphone', type: 'select', opts: () => mics, when: v => v.mode === 'game' },
    { k: 'ptt', label: 'Talk', type: 'select', opts: OPT([false, 'Open mic'], [true, 'Push to talk']), bool: true, when: v => v.mode === 'game' },
    { k: 'pttKey', label: 'Push-to-talk key', type: 'select', opts: OPT(['t', 'T'], ['b', 'B'], ['c', 'C'], ['z', 'Z'], ['capslock', 'Caps Lock'], ['mouse4', 'Mouse 4'], ['mouse5', 'Mouse 5']), when: v => v.mode === 'game' && v.ptt },
    { k: 'volume', label: 'Voice volume', type: 'range', min: 0, max: 1, step: 0.01, fmt: pct, when: v => v.mode === 'game' },
    { k: '_status', label: 'Status', type: 'info', text: () => voiceStatus() },
    { k: 'discordUrl', label: 'Discord bot address', type: 'text', when: v => v.mode === 'discord', note: 'Only the host needs it, e.g. wss://your-server/discord. Empty: the default.' },
  ] },
  controls: { title: 'Controls', part: 'controls', rows: [
    { k: 'sens', label: 'Mouse sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: v => v.toFixed(2) + 'x' },
    { k: 'invertY', label: 'Invert mouse Y', type: 'toggle' },
    { k: '_keys', label: 'Keys', type: 'info', text: () => 'WASD walk · Shift sprint · E or click use · F sip · R check · X pour · G send a drink · Space mark · wheel: chip size · 1-7 killer moves · V hold: killer view · H haunt · Esc menu' },
  ] },
};
let mics = [['', 'Default']];
let voiceStatus = () => 'Off';
let tab = 'gfx', built = null, ctx = null;

function resNote(g) {
  const s = ctx.gfxState && ctx.gfxState(); if (!s) return '';
  const [iw, ih] = s.internal, [ow, oh] = s.out;
  return `${iw}×${ih} drawn, ${ow}×${oh} on screen` + (s.dyn < 1 ? ` (dynamic: ${pct(s.scale)})` : '') + (g.scale > 1 ? ' · supersampled' : '');
}
function partOf(t) { return TABS[t].part ? settings()[TABS[t].part] : null; }
function value(t, r) {
  if (r.audio) return ctx.audio.volumes()[r.k];
  if (r.get) return r.get(ctx.audio);
  return partOf(t)[r.k];
}
function put(t, r, v) {
  if (r.audio) { ctx.audio.unlock(); ctx.audio.setVolumes({ [r.k]: v }); refresh(); return; }
  if (r.put) { ctx.audio.unlock(); r.put(ctx.audio, v); refresh(); ctx.onAudio && ctx.onAudio(); return; }
  if (t === 'gfx' && r.k === 'preset') { if (v !== 'custom') setPreset(v); refresh(); return; }
  set(TABS[t].part, r.k, v);
}
function build() {
  const body = $('setBody'); body.innerHTML = ''; built = [];
  for (const b of document.querySelectorAll('#setTabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const r of TABS[tab].rows) {
    if (r.head) { const h = document.createElement('div'); h.className = 'set-head'; h.textContent = r.head; body.appendChild(h); built.push({ r, row: h }); continue; }
    const row = document.createElement('div'); row.className = 'set-row';
    const lab = document.createElement('label'); lab.textContent = r.label; row.appendChild(lab);
    const box = document.createElement('div'); box.className = 'set-ctl'; row.appendChild(box);
    let el, out = null;
    if (r.type === 'select') {
      el = document.createElement('select');
      el.onchange = () => put(tab, r, r.num ? +el.value : r.bool ? el.value === 'true' : el.value);
    } else if (r.type === 'range') {
      el = document.createElement('input'); el.type = 'range'; el.min = r.min; el.max = r.max; el.step = r.step;
      out = document.createElement('span'); out.className = 'set-val';
      const read = () => r.invert ? +r.max + +r.min - +el.value : +el.value;
      el.oninput = () => { out.textContent = r.fmt ? r.fmt(read()) : read(); if (r.live !== false) put(tab, r, read()); };
      el.onchange = () => put(tab, r, read());
    } else if (r.type === 'toggle') {
      el = document.createElement('button'); el.className = 'set-tog';
      el.onclick = () => put(tab, r, !value(tab, r));
    } else if (r.type === 'button') {
      el = document.createElement('button'); el.onclick = () => { r.act(); setTimeout(refresh, 150); };
    } else if (r.type === 'text') {
      el = document.createElement('input'); el.type = 'text'; el.spellcheck = false; el.autocomplete = 'off';
      el.onchange = () => put(tab, r, el.value.trim());
    } else { el = document.createElement('span'); el.className = 'set-info'; }
    box.appendChild(el); if (out) box.appendChild(out);
    let note = null;
    if (r.note) { note = document.createElement('div'); note.className = 'set-note'; row.appendChild(note); }
    body.appendChild(row);
    built.push({ r, row, el, out, note });
  }
  refresh();
}
function refresh() {
  if (!built) return;
  const part = partOf(tab);
  for (const b of built) {
    const r = b.r; if (!b.el) { b.row.hidden = false; continue; }
    b.row.hidden = !!(r.when && part && !r.when(part));
    if (b.row.hidden) continue;
    const v = r.type === 'button' || r.type === 'info' ? null : value(tab, r);
    if (r.type === 'select') {
      const opts = typeof r.opts === 'function' ? r.opts() : r.opts, sig = opts.map(o => o[0] + ':' + o[1]).join('|');
      if (b.el.dataset.sig !== sig) { b.el.dataset.sig = sig; b.el.innerHTML = opts.map(([k, l]) => `<option value="${String(k).replace(/"/g, '&quot;')}">${l}</option>`).join(''); }
      if (document.activeElement !== b.el) b.el.value = String(v);
    } else if (r.type === 'range') {
      if (document.activeElement !== b.el) b.el.value = r.invert ? +r.max + +r.min - v : v;
      b.out.textContent = r.fmt ? r.fmt(v) : v;
    } else if (r.type === 'toggle') { b.el.textContent = v ? 'On' : 'Off'; b.el.classList.toggle('on', !!v); }
    else if (r.type === 'button') b.el.textContent = r.text();
    else if (r.type === 'text') { if (document.activeElement !== b.el) b.el.value = v || ''; }
    else b.el.textContent = r.text();
    if (b.note) { const n = typeof r.note === 'function' ? r.note(part || {}) : r.note; if (b.note.textContent !== n) b.note.textContent = n; }
  }
}

// ctx: { audio, gfxState, mics(): Promise<[[id, label]]>, voiceStatus(): string, onOpen, onClose, onAudio }
export function initSettings(c) {
  ctx = c;
  if (c.voiceStatus) voiceStatus = c.voiceStatus;
  $('setTabs').innerHTML = Object.entries(TABS).map(([k, t]) => `<button data-tab="${k}">${t.title}</button>`).join('');
  $('setTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; if (tab === 'voice') loadMics(); build(); };
  $('setClose').onclick = closeSettings;
  onSettings(() => { if (built) refresh(); });
  document.addEventListener('fullscreenchange', () => { if (built) refresh(); });
  setInterval(() => { if (built && (tab === 'gfx' || tab === 'voice')) refresh(); }, 1000); // the resolution line and the voice status move
}
async function loadMics() {
  if (!ctx.mics) return;
  try { const list = await ctx.mics(); mics = [['', 'Default'], ...list]; if (built) refresh(); } catch (e) { /* keep Default */ }
}
export function openSettings(which) {
  if (which) tab = which;
  show('settings', true); build();
  if (ctx.onOpen) ctx.onOpen();
}
export function closeSettings() {
  show('settings', false); built = null;
  if (ctx.onClose) ctx.onClose();
}
export const settingsOpen = () => !$('settings').classList.contains('hidden');
