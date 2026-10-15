// Player settings: graphics, voice and controls, kept in this browser (sound levels live in audio.js). Graphics come
// in presets; changing any one of the preset's options makes it Custom.
const KEY = 'lc.settings';

// What each preset sets. scale: the render resolution as a share of the display's (FSR or bilinear fills the rest).
// aa: off | fxaa | smaa | msaa (4x) | msaa8. shadows: off | low | high | ultra. ao: off | half | full. bloom: off |
// subtle | strong. lights: the point lights that follow you round the casino. beams: the soft light cones over tables
// (off everywhere by default: from below they read as grey haze, Steve's glare).
export const PRESETS = {
  low: { scale: 0.59, upscaler: 'fsr', aa: 'fxaa', shadows: 'off', ao: 'off', ssr: false, bloom: 'off', aniso: 2, lights: 4, beams: false },
  medium: { scale: 0.77, upscaler: 'fsr', aa: 'smaa', shadows: 'low', ao: 'off', ssr: false, bloom: 'off', aniso: 4, lights: 6, beams: false },
  high: { scale: 1, upscaler: 'fsr', aa: 'msaa', shadows: 'high', ao: 'half', ssr: false, bloom: 'off', aniso: 8, lights: 8, beams: false },
  ultra: { scale: 1, upscaler: 'fsr', aa: 'smaa', shadows: 'ultra', ao: 'full', ssr: true, bloom: 'off', aniso: 16, lights: 12, beams: false },
};
export const PRESET_KEYS = Object.keys(PRESETS.high);

const DEFAULTS = () => ({
  gfx: {
    preset: 'high', ...PRESETS.high,
    sharpness: 0.25,   // FSR's RCAS, in stops: 0 is the sharpest, 2 the softest
    tone: 'agx',       // agx | aces | neutral
    exposure: 1,       // brightness
    fov: 72,
    fpsCap: 0,         // 0: as fast as the display refreshes
    dynres: 0,         // a frame-rate target the render scale drops to hold (0: off)
    showFps: false,
  },
  voice: { mode: 'game', micId: '', ptt: false, pttKey: 't', volume: 1, discordUrl: '' }, // mode: off | game | discord
  controls: { sens: 1, invertY: false },
});

let S = DEFAULTS();
const subs = new Set();
// Saved settings carry a version. 2 (2026-10-14): bloom and the light cones go off once for everyone, saved choices
// included (Steve: "get rid of glare completely"); either can be turned back on afterwards.
const VERSION = 2;
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!v) return;
    for (const k of Object.keys(S)) if (v[k] && typeof v[k] === 'object') Object.assign(S[k], v[k]);
    if (PRESETS[S.gfx.preset]) Object.assign(S.gfx, PRESETS[S.gfx.preset]); // a named preset means its values as they are today
    if (!(v.v >= VERSION)) { S.gfx.bloom = 'off'; S.gfx.beams = false; S.gfx.preset = matchPreset(); save(); }
  } catch (e) { /* bad or blocked storage: the defaults stand */ }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify({ ...S, v: VERSION })); } catch (e) { /* storage is optional */ } }
load();

export const settings = () => S;
export function onSettings(fn) { subs.add(fn); return () => subs.delete(fn); }
const emit = part => { save(); for (const f of subs) f(S, part); };

// set('gfx', 'bloom', 'off'): a preset option turns the preset Custom.
export function set(part, key, value) {
  if (!S[part] || S[part][key] === value) return;
  S[part][key] = value;
  if (part === 'gfx' && PRESET_KEYS.includes(key)) S.gfx.preset = matchPreset();
  emit(part);
}
export function setPreset(name) {
  if (!PRESETS[name]) return;
  Object.assign(S.gfx, PRESETS[name], { preset: name });
  emit('gfx');
}
function matchPreset() {
  for (const [name, p] of Object.entries(PRESETS)) if (PRESET_KEYS.every(k => S.gfx[k] === p[k])) return name;
  return 'custom';
}
// Phones and tablets start on Low, the first time only, but at 100% render resolution (Steve, 2026-10-15: "very low
// resolution and blurry on mobile"): their savings come from Low's effects, not its 59% scale. A phone already saved
// below 100% goes to 100% once; a lower scale picked after that stays.
export function firstRun(lowPower) {
  let seen = false; try { seen = localStorage.getItem(KEY) !== null; } catch (e) { /* ignore */ }
  if (!seen && lowPower) setPreset('low');
  if (!lowPower) return;
  let fixed = false; try { fixed = localStorage.getItem('lc.phoneRes') === '1'; } catch (e) { /* ignore */ }
  if (fixed) return;
  if (S.gfx.scale < 1) set('gfx', 'scale', 1);
  try { localStorage.setItem('lc.phoneRes', '1'); } catch (e) { /* storage is optional */ }
}
export function resetGfx() { const d = DEFAULTS().gfx; Object.assign(S.gfx, d); emit('gfx'); }
