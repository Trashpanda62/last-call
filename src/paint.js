// 2D painters for the machine screens in the 3D casino (and the touch buttons on them). Pure canvas drawing; no DOM
// lookups, no three.js.
import * as Gm from './games.js';

export const ARC = '900 {s}px "Arial Black", Impact, system-ui, sans-serif';
export const SER = 'bold {s}px Georgia, "Times New Roman", serif';
export const f = (tpl, s) => tpl.replace('{s}', Math.round(s));
export function short(n) {
  const a = Math.abs(n), s = n < 0 ? '-$' : '$';
  if (a >= 1e9) return s + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
  if (a >= 1e4) return s + Math.round(a / 1e3) + 'K';
  return s + Math.round(a).toLocaleString('en-US');
}
export const xfmt = x => (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + 'x';
const ease = u => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

// Sorceress art (assets/art2: slot symbols, screen backdrops), filled in by textures.js once it loads; the painters draw
// their own shapes until then.
export const ART = {};
function bg(g, w, h, top = '#141030', bot = '#05040c', art = null) {
  const im = art && ART['screen-' + art];
  if (im) { // cover the screen, darkened so the game reads on top
    const k = Math.max(w / im.width, h / im.height), iw = im.width * k, ih = im.height * k;
    g.drawImage(im, (w - iw) / 2, (h - ih) / 2, iw, ih); g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, 0, w, h); return;
  }
  const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, top); lg.addColorStop(1, bot); g.fillStyle = lg; g.fillRect(0, 0, w, h);
}
function text(g, s, x, y, size, color, font = ARC, align = 'center', base = 'middle') {
  g.font = f(font, size); g.textAlign = align; g.textBaseline = base; g.fillStyle = color; g.fillText(s, x, y);
}
function glowText(g, s, x, y, size, color, font = ARC) {
  g.save(); g.shadowColor = color; g.shadowBlur = size * 0.5; text(g, s, x, y, size, color, font); g.restore(); text(g, s, x, y, size, '#fff', font);
}

// ---------- Crash ----------
// state: pub.crash, plus optional `me` (my id) to highlight my bet.
export function paintCrash(g, w, h, t, C, me) {
  bg(g, w, h, '#071b2d', '#020710');
  // A clean flight display, with sharp stars instead of the old plush backdrop.
  for (let i = 0; i < 72; i++) { const x = ((i * 174.37) % 1) * w, y = ((i * 83.17) % 1) * h; g.fillStyle = i % 5 ? '#608aa0' : '#dbe9ef'; g.fillRect(x, y, i % 5 ? 1 : 2, i % 5 ? 1 : 2); }
  text(g, 'ROCKET RUN / LIVE FLIGHT', w * .035, h * .045, h * .032, '#b7ced7', ARC, 'left');
  if (!C) return;
  const pad = h * 0.08, gx0 = pad * 1.4, gy0 = h - pad, gw = w - gx0 - pad, gh = h - pad * 2.2;
  // grid
  g.strokeStyle = 'rgba(120,100,255,0.18)'; g.lineWidth = Math.max(1, h / 300);
  for (let i = 0; i <= 8; i++) { const x = gx0 + gw * i / 8; g.beginPath(); g.moveTo(x, gy0); g.lineTo(x, gy0 - gh); g.stroke(); }
  for (let i = 0; i <= 4; i++) { const y = gy0 - gh * i / 4; g.beginPath(); g.moveTo(gx0, y); g.lineTo(gx0 + gw, y); g.stroke(); }
  const fly = C.phase === 'fly' || C.phase === 'boom';
  const tNow = C.phase === 'fly' ? C.t : C.phase === 'boom' ? Gm.crashTime(Math.max(1.0001, C.point || C.mult)) : 0;
  const tMax = Math.max(8, tNow * 1.15), mMax = Math.max(2, Gm.crashAt(tMax));
  const X = tt => gx0 + gw * tt / tMax, Y = m => gy0 - gh * (m - 1) / (mMax - 1);
  for (let i = 1; i <= 4; i++) { const m = 1 + (mMax - 1) * i / 4; text(g, xfmt(m), gx0 - pad * 0.2, Y(m), h * 0.035, 'rgba(200,190,255,0.6)', ARC, 'right'); }
  if (fly) {
    const boom = C.phase === 'boom';
    g.lineWidth = h * 0.012; g.lineCap = 'round';
    const lg = g.createLinearGradient(gx0, 0, X(tNow), 0); lg.addColorStop(0, boom ? '#ff2a4a' : '#7a5cff'); lg.addColorStop(1, boom ? '#ff6a3a' : '#3fe0ff');
    g.strokeStyle = lg; g.beginPath();
    for (let i = 0; i <= 60; i++) { const tt = tNow * i / 60; const m = Math.min(Gm.crashAt(tt), C.point || 1e9); i ? g.lineTo(X(tt), Y(m)) : g.moveTo(X(tt), Y(m)); }
    g.stroke();
    g.fillStyle = boom ? 'rgba(255,40,60,0.12)' : 'rgba(80,200,255,0.10)'; g.lineTo(X(tNow), gy0); g.lineTo(gx0, gy0); g.fill();
    const rx = X(tNow), ry = Y(Math.min(C.mult, mMax));
    if (boom) {
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r = h * (0.04 + ((t * 3 + i) % 1) * 0.08); g.fillStyle = i % 2 ? '#ffd040' : '#ff3a2a'; g.beginPath(); g.arc(rx + Math.cos(a) * r, ry + Math.sin(a) * r, h * 0.012, 0, 7); g.fill(); }
    } else rocket(g, rx, ry, h * 0.11, Math.atan2(-(Y(Gm.crashAt(tNow)) - Y(Gm.crashAt(Math.max(0, tNow - 0.3)))), X(tNow) - X(tNow - 0.3)), t);
    glowText(g, xfmt(C.mult), w / 2, h * 0.36, h * 0.2, boom ? '#ff4a5a' : '#3fe0ff');
    if (boom) glowText(g, 'CRASHED', w / 2, h * 0.55, h * 0.08, '#ff4a5a');
  } else {
    const left = Math.max(0, Gm.CRASH.betTime - C.t), any = (C.bets || []).length > 0; // (the countdown waits for the first bet)
    glowText(g, 'NEXT ROCKET', w / 2, h * 0.3, h * 0.09, '#ff3fa4');
    glowText(g, any ? left.toFixed(1) + 's' : 'BET TO LAUNCH', w / 2, h * 0.48, any ? h * 0.16 : h * 0.1, '#ffd040');
    rocket(g, w / 2, h * 0.72, h * 0.14, -Math.PI / 2, t);
  }
  // bettors down the right side
  const bets = (C.bets || []).slice(0, 8);
  bets.forEach(([id, bet, out], i) => {
    const y = h * 0.12 + i * h * 0.06, col = out ? '#3fff8a' : id === me ? '#ffd040' : 'rgba(255,255,255,0.75)';
    text(g, (id === me ? 'YOU ' : '') + short(bet) + (out ? ' @ ' + xfmt(out) : ''), w - pad * 0.6, y, h * 0.036, col, ARC, 'right');
  });
}
function rocket(g, x, y, s, ang, t) {
  g.save(); g.translate(x, y); g.rotate(ang); g.lineJoin = 'round';
  // Layered exhaust, metallic fuselage, swept fins and a blue pressure window.
  for (let i = 0; i < 3; i++) { g.fillStyle = ['#f66b26','#ffbd50','#fff4c8'][i]; g.beginPath(); g.moveTo(-s * .48, -s * (.22 - i * .055)); g.quadraticCurveTo(-s * (1.75 - i * .34 + Math.sin(t * 32) * .12), 0, -s * .48, s * (.22 - i * .055)); g.fill(); }
  g.fillStyle = '#bf3b22'; for (const side of [-1, 1]) { g.beginPath(); g.moveTo(-s * .1, side * s * .2); g.lineTo(-s * .65, side * s * .55); g.lineTo(-s * .54, side * s * .13); g.fill(); }
  const steel = g.createLinearGradient(0,-s*.28,0,s*.28); steel.addColorStop(0,'#fcfcf3'); steel.addColorStop(.45,'#ccdbe0'); steel.addColorStop(1,'#536877');
  g.fillStyle = steel; g.strokeStyle = '#223948'; g.lineWidth = s * .025; g.beginPath(); g.moveTo(-s*.55,-s*.23); g.lineTo(s*.35,-s*.23); g.quadraticCurveTo(s*.85,-s*.16,s*.98,0); g.quadraticCurveTo(s*.85,s*.16,s*.35,s*.23); g.lineTo(-s*.55,s*.23); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#e75a2e'; g.beginPath(); g.moveTo(s*.49,-s*.20); g.quadraticCurveTo(s*.88,-s*.13,s*.98,0); g.quadraticCurveTo(s*.88,s*.13,s*.49,s*.20); g.closePath(); g.fill();
  g.strokeStyle = '#b18d55'; g.lineWidth = s*.055; g.fillStyle = '#163f5d'; g.beginPath(); g.arc(s*.17,0,s*.13,0,Math.PI*2); g.fill(); g.stroke();
  g.fillStyle = '#a5eeff'; g.beginPath(); g.arc(s*.14,-s*.035,s*.045,0,Math.PI*2); g.fill();
  g.fillStyle = '#344a55'; g.fillRect(-s*.58,-s*.18,s*.13,s*.36); g.restore();
}

// ---------- Duck race tote board ----------
export function toteFrameKey(t, R, me) {
  if (!R) return 'empty';
  if (R.phase === 'run') return undefined;
  const bets = R.bets || [];
  return JSON.stringify([R.phase, R.pays, R.winner, R.seed,
    R.phase === 'bet' && bets.length ? Math.ceil(Gm.RACE.betTime - R.t) : null,
    bets.filter(b => b[0] === me)]);
}
export function paintTote(g, w, h, t, R, me) {
  bg(g, w, h, '#06263a', '#020c14');
  if (!R) return;
  const head = R.phase === 'bet' ? ((R.bets || []).length ? `BETS CLOSE IN ${Math.ceil(Gm.RACE.betTime - R.t)}` : 'DUCK DERBY / PICK A DUCK, PRESS START') : R.phase === 'run' ? "THEY'RE OFF!" : `WINNER: ${Gm.DUCKS[R.winner].name.toUpperCase()}`;
  glowText(g, head, w / 2, h * 0.11, h * 0.09, R.phase === 'show' ? '#ffd040' : '#7fe8ff');
  const lanes = R.phase === 'bet' ? null : Gm.raceLanes(R.phase === 'run' ? R.t : Gm.RACE.runTime, R.winner, R.seed);
  Gm.DUCKS.forEach((d, i) => {
    const y = h * (0.26 + i * 0.12), mine = (R.bets || []).find(b => b[0] === me && b[1] === i);
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'; g.fillRect(w * 0.03, y - h * 0.055, w * 0.94, h * 0.11);
    g.fillStyle = d.color; g.beginPath(); g.arc(w * 0.07, y, h * 0.035, 0, 7); g.fill();
    text(g, d.name, w * 0.11, y, h * 0.05, '#fff', ARC, 'left');
    text(g, xfmt(R.pays[i]), w * 0.48, y, h * 0.055, '#ffd040', ARC, 'right');
    if (mine) text(g, 'YOU ' + short(mine[2]), w * 0.5, y, h * 0.04, '#3fff8a', ARC, 'left');
    if (lanes) {
      const x0 = w * 0.62, x1 = w * 0.95;
      g.fillStyle = 'rgba(127,232,255,0.15)'; g.fillRect(x0, y - 2, x1 - x0, 4);
      g.fillStyle = d.color; g.beginPath(); g.arc(x0 + (x1 - x0) * lanes[i], y, h * 0.03, 0, 7); g.fill();
    } else text(g, Math.round(1 / R.pays[i] * Gm.RACE.rtp * 100) + '%', w * 0.8, y, h * 0.04, 'rgba(255,255,255,0.5)');
    if (R.phase === 'show' && i === R.winner) { g.strokeStyle = '#ffd040'; g.lineWidth = 4; g.strokeRect(w * 0.03, y - h * 0.055, w * 0.94, h * 0.11); }
  });
}

// ---------- Slots ----------
// st: { reels: [sym, sym, sym], spin: { t0, stops } | null, win, tier }
const SYM_COL = { '💎': '#3fe0ff', '7': '#ff2a3a', BAR: '#151515', '🔔': '#ffb020', '🍒': '#e0203a', '🍋': '#f0d020' };
const SYM_ART = { '💎': 'sym-diamond', '7': 'sym-seven', BAR: 'sym-bar', '🔔': 'sym-bell', '🍒': 'sym-cherry', '🍋': 'sym-lemon' };
export function slotFrameKey(t, st) {
  // Reel motion and the delayed win reveal keep their existing paint cadence.
  if (st?.spin && t - st.spin.t0 < 1.7) return undefined;
  return JSON.stringify([st?.tier || 'penny', st?.reels || [0, 1, 2].map(i => Math.floor(t / 3 + i * 1.7) % 6), st?.win || null, st?.bet || 0]);
}
export function paintSlots(g, w, h, t, st) {
  const tier = st && st.tier || 'penny';
  bg(g, w, h, tier === 'high' ? '#2a1a04' : '#2a0418', '#080206');
  const head = tier === 'high' ? 'HIGH LIMIT · 💎 PAYS 1000x' : 'LUCKY 7s · 💎 PAYS 250x';
  text(g, head, w / 2, h * 0.1, h * 0.075, tier === 'high' ? '#ffd040' : '#ff7ac8');
  const rw = w * 0.27, rh = h * 0.62, y0 = h * 0.2;
  for (let i = 0; i < 3; i++) {
    const x = w * 0.06 + i * (rw + w * 0.035);
    const lg = g.createLinearGradient(0, y0, 0, y0 + rh); lg.addColorStop(0, '#a8a090'); lg.addColorStop(0.5, '#fffaf0'); lg.addColorStop(1, '#a8a090');
    g.fillStyle = lg; g.fillRect(x, y0, rw, rh);
    g.save(); g.beginPath(); g.rect(x, y0, rw, rh); g.clip();
    const spinning = st && st.spin && t - st.spin.t0 < 0.9 + i * 0.35;
    const syms = Gm.SLOT_SYMS;
    let base, off = 0;
    if (spinning) { const p = (t - st.spin.t0) * 14; base = Math.floor(p) + i * 2; off = (p % 1) * rh / 3; }
    else if (st && st.reels) base = null;
    else { base = Math.floor(t / 3 + i * 1.7); }
    for (let k = -2; k <= 2; k++) {
      let s;
      if (base === null) s = k === 0 ? st.reels[i] : syms[(syms.indexOf(st.reels[i]) + k + 6) % 6];
      else s = syms[((base + k) % 6 + 6) % 6];
      const yy = y0 + rh / 2 + k * rh / 3 + off, im = ART[SYM_ART[s]];
      if (im) { const sz = Math.min(rw * 0.9, rh * 0.31); g.drawImage(im, x + rw / 2 - sz / 2, yy - sz / 2, sz, sz); continue; }
      g.font = s === 'BAR' ? f(ARC, rh * 0.16) : s === '7' ? f(ARC, rh * 0.28) : `${Math.round(rh * 0.24)}px system-ui, "Segoe UI Emoji", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = SYM_COL[s] || '#000';
      if (s === 'BAR') { g.fillStyle = '#151515'; g.fillRect(x + rw * 0.15, yy - rh * 0.08, rw * 0.7, rh * 0.16); g.fillStyle = '#fff'; }
      g.fillText(s, x + rw / 2, yy);
    }
    g.restore();
    g.strokeStyle = '#e8c46a'; g.lineWidth = h * 0.012; g.strokeRect(x, y0, rw, rh);
  }
  g.fillStyle = 'rgba(255,40,60,0.7)'; g.fillRect(w * 0.03, y0 + rh / 2 - h * 0.006, w * 0.94, h * 0.012);
  if (st && st.win && !(st.spin && t - st.spin.t0 < 1.7)) glowText(g, st.win, w / 2, h * 0.9, h * 0.08, '#ffd040');
  else text(g, st && st.bet ? 'BET ' + short(st.bet) + ' · PULL THE LEVER' : st && st.reels ? 'PULL TO SPIN' : 'INSERT CHIPS', w / 2, h * 0.9, h * 0.06, 'rgba(255,255,255,0.6)');
}

// ---------- Mines ----------
// st: { m, open: [tiles], mines: Set|null (shown when over), over, dead, mult, next }
export function minesFrameKey(t, st, ui) {
  return JSON.stringify([st ? [st.m, st.open, st.over, st.dead, st.mult, st.next, st.over && st.mines ? [...st.mines] : null] : Math.floor(t * 3) % 11, ui]);
}
export function paintMines(g, w, h, t, st) {
  bg(g, w, h, '#06281a', '#020a06', 'mines');
  const n = 5, s = Math.min(w * 0.62, h * 0.86) / n, x0 = w * 0.05, y0 = (h - s * n) / 2;
  for (let i = 0; i < 25; i++) {
    const x = x0 + (i % 5) * s, y = y0 + Math.floor(i / 5) * s;
    const open = st && st.open.includes(i), mine = st && st.over && st.mines && st.mines.has(i);
    const idle = !st && ((i * 7 + Math.floor(t * 3)) % 11 === 0);
    g.fillStyle = open ? (mine ? '#ff2a3a' : '#0e4a2a') : mine ? '#4a1018' : idle ? '#3a6a4a' : '#24402e';
    g.beginPath(); g.roundRect(x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88, s * 0.12); g.fill();
    if (open && !mine) gem(g, x + s / 2, y + s / 2, s * 0.28);
    else if (mine) bomb(g, x + s / 2, y + s / 2, s * 0.26);
  }
  const rx = w * 0.72;
  if (st) {
    text(g, st.m + (st.m === 1 ? ' MINE' : ' MINES'), rx + w * 0.12, h * 0.18, h * 0.07, '#7fffb0');
    text(g, st.dead ? 'BOOM' : xfmt(st.mult || 1), rx + w * 0.12, h * 0.42, h * 0.14, st.dead ? '#ff4a5a' : '#ffd040');
    if (!st.over && st.next) text(g, 'next ' + xfmt(st.next), rx + w * 0.12, h * 0.6, h * 0.055, 'rgba(255,255,255,0.7)');
    if (st.over && !st.dead) glowText(g, 'CASHED', rx + w * 0.12, h * 0.58, h * 0.07, '#3fff8a');
  } else { glowText(g, 'MINES', rx + w * 0.12, h * 0.4, h * 0.12, '#3fff8a'); text(g, 'find the gems', rx + w * 0.12, h * 0.58, h * 0.05, 'rgba(255,255,255,0.6)'); }
}
function gem(g, x, y, r) {
  g.fillStyle = '#3fffb0'; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y - r * 0.2); g.lineTo(x, y + r); g.lineTo(x - r, y - r * 0.2); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.4, y - r * 0.2); g.lineTo(x - r * 0.4, y - r * 0.2); g.fill();
}
function bomb(g, x, y, r) {
  g.fillStyle = '#151515'; g.beginPath(); g.arc(x, y + r * 0.1, r, 0, 7); g.fill();
  g.strokeStyle = '#ffd040'; g.lineWidth = r * 0.2; g.beginPath(); g.moveTo(x + r * 0.5, y - r * 0.6); g.lineTo(x + r * 0.9, y - r * 1.0); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.2, r * 0.18, 0, 7); g.fill();
}

// ---------- Dragon Tower ----------
// st: { mode, eggs, row, picks, rows (Sets, shown when over), over, dead, mult }
export function towerFrameKey(t, st, ui) {
  return JSON.stringify([st ? [st.mode, st.eggs, st.row, st.picks, st.over, st.dead, st.over && st.rows ? st.rows.map(row => [...row]) : null] : Math.floor(t * 2) % 7, ui]);
}
export function paintTower(g, w, h, t, st) {
  bg(g, w, h, '#2a1006', '#0a0402', 'tower');
  const rows = Gm.TOWER.rows, eggs = st ? st.eggs : 3, rh = h * 0.86 / rows, y0 = h * 0.07, cw = w * 0.6 / eggs, x0 = w * 0.04;
  for (let r = 0; r < rows; r++) {
    const y = y0 + (rows - 1 - r) * rh, active = st && !st.over && r === st.row;
    for (let e = 0; e < eggs; e++) {
      const x = x0 + e * cw, picked = st && st.picks[r] === e, dragon = st && st.over && st.rows && st.rows[r].has(e);
      g.fillStyle = active ? '#9a5418' : r < (st ? st.row : 0) ? '#5a3e14' : '#3e2812'; // the floors read from across the room
      g.beginPath(); g.roundRect(x + cw * 0.06, y + rh * 0.08, cw * 0.88, rh * 0.84, rh * 0.2); g.fill();
      if (active) { g.strokeStyle = '#ffa040'; g.lineWidth = 2; g.stroke(); }
      const cx = x + cw / 2, cy = y + rh / 2;
      if (picked && !dragon) egg(g, cx, cy, rh * 0.32, '#ffd040');
      else if (dragon) { g.fillStyle = picked ? '#ff3a2a' : '#7a2a1a'; g.font = f(ARC, rh * 0.5); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🐉', cx, cy); }
      else if (!st && (r * 3 + e + Math.floor(t * 2)) % 7 === 0) egg(g, cx, cy, rh * 0.28, '#a06a2a');
    }
    if (st) text(g, xfmt(Gm.towerMult(st.mode, r + 1)), x0 + eggs * cw + w * 0.02, y + rh / 2, rh * 0.36, r < st.row ? '#ffd040' : 'rgba(255,255,255,0.45)', ARC, 'left');
  }
  const rx = w * 0.86;
  if (st) {
    text(g, Gm.TOWER.modes[st.mode].label.toUpperCase(), rx, h * 0.2, h * 0.055, '#ffa040');
    text(g, st.dead ? 'BURNT' : xfmt(st.row ? Gm.towerMult(st.mode, st.row) : 1), rx, h * 0.45, h * 0.1, st.dead ? '#ff4a5a' : '#ffd040');
  } else { glowText(g, 'DRAGON', rx, h * 0.4, h * 0.075, '#ffa040'); glowText(g, 'TOWER', rx, h * 0.52, h * 0.075, '#ffa040'); }
}
function egg(g, x, y, r, col) {
  g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r * 0.75, r, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.35, r * 0.18, r * 0.28, -0.4, 0, 7); g.fill();
}

// ---------- Plinko (panel board; the 3D cabinet uses geometry) ----------
// balls: [{ path, t0, mult }] ; a ball takes 0.12 s per row.
export const PLINKO_ROW_T = 0.12;
export function plinkoPos(path, u) { // u: rows travelled (float). Returns { col, row } in peg units.
  const rows = path.length; u = Math.max(0, Math.min(rows, u));
  const r = Math.floor(u), fr = u - r;
  let k = 0; for (let i = 0; i < r; i++) k += path[i];
  const k2 = r < rows ? k + path[r] : k;
  const col = k + (k2 - k) * fr, row = r + fr;
  const bounce = Math.sin(fr * Math.PI) * 0.35;
  return { x: col - row / 2, y: row - bounce };
}
export function paintPlinko(g, w, h, t, st) {
  bg(g, w, h, '#0a1a3a', '#020610', 'plinko');
  const risk = st ? st.risk : 'medium', rows = Gm.PLINKO_ROWS, mults = Gm.PLINKO[risk];
  const top = h * 0.08, sp = Math.min(w * 0.9 / (rows + 1), h * 0.78 / rows), cx = w / 2;
  g.fillStyle = '#cfe4ff';
  for (let r = 0; r < rows; r++) for (let k = 0; k <= r + 2; k++) { const x = cx + (k - (r + 2) / 2) * sp, y = top + r * sp; g.beginPath(); g.arc(x, y, sp * 0.1, 0, 7); g.fill(); }
  const by = top + rows * sp - sp * 0.2;
  mults.forEach((m, i) => {
    const x = cx + (i - rows / 2) * sp, hot = Math.abs(i - rows / 2) / (rows / 2);
    g.fillStyle = `hsl(${50 - hot * 50}, 95%, ${45 + hot * 10}%)`; g.beginPath(); g.roundRect(x - sp * 0.45, by, sp * 0.9, sp * 0.7, sp * 0.15); g.fill();
    text(g, m >= 100 ? String(m) : m + '', x, by + sp * 0.36, sp * (m >= 100 ? 0.26 : 0.3), '#1a0a00');
  });
  for (const b of (st && st.balls) || []) {
    const p = plinkoPos(b.path, (t - b.t0) / PLINKO_ROW_T);
    const x = cx + p.x * sp, y = top - sp * 0.6 + (p.y + 0.4) * sp;
    g.fillStyle = '#ff3fa4'; g.beginPath(); g.arc(x, y, sp * 0.22, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(x - sp * 0.06, y - sp * 0.06, sp * 0.07, 0, 7); g.fill();
  }
}

// ---------- Prize wheel (panel) ----------
export function paintWheel(g, w, h, t, st) {
  const segs = Gm.WHEEL.segs, n = segs.length, R = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2 + h * 0.02;
  bg(g, w, h, '#1a0a2a', '#06020a', 'wheel');
  const ang = wheelAngle(st, t);
  const colOf = v => v >= 20 ? '#ffd040' : v >= 5 ? '#ff3fa4' : v >= 3 ? '#8a5cff' : v >= 2 ? '#3fe0ff' : v > 0 ? '#3fff8a' : null;
  for (let i = 0; i < n; i++) {
    const a0 = ang + i / n * Math.PI * 2 - Math.PI / 2, a1 = a0 + Math.PI * 2 / n;
    g.fillStyle = colOf(segs[i]) || (i % 2 ? '#2a1e3a' : '#3a2650'); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a1); g.fill();
    if (segs[i]) { g.save(); g.translate(cx, cy); g.rotate((a0 + a1) / 2); text(g, segs[i] + 'x', R * 0.8, 0, R * 0.075, '#1a1020'); g.restore(); }
  }
  g.strokeStyle = '#e8c46a'; g.lineWidth = R * 0.04; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  g.fillStyle = '#e8b440'; g.beginPath(); g.arc(cx, cy, R * 0.2, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx, cy - R * 0.92); g.lineTo(cx - R * 0.07, cy - R * 1.08); g.lineTo(cx + R * 0.07, cy - R * 1.08); g.fill();
}
// The wheel's rotation (radians, clockwise) for a spin { t0, from, to (segment), dur }.
export function wheelAngle(st, t) {
  const n = Gm.WHEEL.segs.length;
  if (!st || !st.spin) return t * 0.1;
  const s = st.spin, u = ease((t - s.t0) / s.dur);
  const target = -(s.to + 0.5) / n * Math.PI * 2 - Math.PI * 2 * 6;
  return s.from + (target - s.from) * u;
}

// ---------- Roulette (panel) ----------
export function paintRoulette(g, w, h, t, st) {
  bg(g, w, h, '#0a2a1a', '#02080a');
  const R = Math.min(w * 0.5, h) * 0.46, cx = w * 0.3, cy = h / 2, n = 37;
  const spin = st && st.spin, u = spin ? Math.min(1, (t - spin.t0) / spin.dur) : 0;
  const wa = t * 0.6 + (spin ? ease(u) * 8 : 0);
  for (let i = 0; i < n; i++) {
    const num = Gm.RL_ORDER[i], a0 = wa + i / n * Math.PI * 2, a1 = a0 + Math.PI * 2 / n;
    const lucky = spin && spin.lucky.find(l => l.n === num);
    g.fillStyle = lucky ? '#ffd040' : num === 0 ? '#1e8f55' : Gm.RL_RED.has(num) ? '#c0302a' : '#151515';
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a1); g.fill();
    g.save(); g.translate(cx, cy); g.rotate((a0 + a1) / 2); text(g, String(num), R * 0.86, 0, R * 0.085, lucky ? '#1a0a00' : '#fff'); g.restore();
  }
  g.fillStyle = '#5a3220'; g.beginPath(); g.arc(cx, cy, R * 0.66, 0, 7); g.fill();
  g.strokeStyle = '#e8c46a'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  if (spin) { // the ball spirals in and lands in its pocket
    const idx = Gm.RL_ORDER.indexOf(spin.n);
    const land = wa + (idx + 0.5) / n * Math.PI * 2;
    const ba = u < 1 ? land + (1 - ease(u)) * 30 : land, br = R * (0.76 + (1 - ease(u)) * 0.18);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + Math.cos(ba) * br, cy + Math.sin(ba) * br, R * 0.045, 0, 7); g.fill();
  }
  const rx = w * 0.78;
  if (spin && spin.lucky) { text(g, 'LUCKY', rx, h * 0.12, h * 0.07, '#ffd040'); spin.lucky.forEach((l, i) => text(g, `${l.n} · ${l.x}x`, rx, h * (0.24 + i * 0.1), h * 0.065, '#ffd040')); }
  if (spin && u >= 1) { const c = spin.n === 0 ? '#3fff8a' : Gm.RL_RED.has(spin.n) ? '#ff4a5a' : '#fff'; glowText(g, String(spin.n), rx, h * 0.68, h * 0.24, c); }
}

// ---------- Coin, dice, cards (panel) ----------
export function paintCoin(g, w, h, t, st) {
  bg(g, w, h, '#2a1a04', '#0a0602', 'coin');
  const fl = st && st.flip, u = fl ? Math.min(1, (t - fl.t0) / 1.2) : 0;
  const cx = w / 2, cy = h * 0.55 - Math.sin(u * Math.PI) * h * 0.3, R = Math.min(w, h) * 0.26;
  const turns = fl ? ease(u) * 7 + (fl.side === 'tails' ? 0.5 : 0) : t * 0.3;
  const sq = Math.cos(turns * Math.PI * 2), face = sq >= 0 ? 'H' : 'T';
  g.save(); g.translate(cx, cy); g.scale(1, Math.max(0.06, Math.abs(sq)));
  const rg = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R); rg.addColorStop(0, '#fff3c0'); rg.addColorStop(0.6, '#e8b440'); rg.addColorStop(1, '#8a5a20');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
  g.strokeStyle = '#8a5a20'; g.lineWidth = R * 0.08; g.beginPath(); g.arc(0, 0, R * 0.85, 0, 7); g.stroke();
  text(g, face, 0, R * 0.05, R, '#7a4a18', SER);
  g.restore();
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(cx, h * 0.9, R * (0.8 - Math.sin(u * Math.PI) * 0.3), R * 0.12, 0, 0, 7); g.fill();
}
export function paintDice(g, w, h, t, st) {
  bg(g, w, h, '#0a2a4a', '#020a14');
  const r = st && st.roll, u = r ? Math.min(1, (t - r.t0) / 0.9) : 1;
  const vals = r ? (u < 1 ? [1 + Math.floor(t * 23) % 6, 1 + Math.floor(t * 19 + 3) % 6] : r.dice) : [6, 6];
  const s = Math.min(w, h) * 0.3;
  vals.forEach((v, i) => {
    const x = w / 2 + (i ? 1 : -1) * s * 0.65, y = h / 2 - Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * h * 0.2;
    g.save(); g.translate(x, y); g.rotate((1 - ease(u)) * (i ? 6 : -5));
    g.fillStyle = '#f8f4ec'; g.beginPath(); g.roundRect(-s / 2, -s / 2, s, s, s * 0.18); g.fill();
    g.fillStyle = i ? '#c0302a' : '#151515';
    const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[v];
    for (const [a, b] of P) { g.beginPath(); g.arc(a * s * 0.27, b * s * 0.27, s * 0.09, 0, 7); g.fill(); }
    g.restore();
  });
}
// Blackjack hands as cards. st: { dealer: [cards], hide, hands: [{cards, active}] }
export function paintCards(g, w, h, t, st) {
  bg(g, w, h, '#0e4a2a', '#03140a');
  if (!st) return;
  const cw = Math.min(w * 0.12, h * 0.3), ch = cw * 1.4;
  const row = (cards, y, hideSecond) => cards.forEach((c, i) => card(g, w / 2 + (i - (cards.length - 1) / 2) * cw * 0.62, y, cw, ch, hideSecond && i === 1 ? null : c));
  row(st.dealer, h * 0.22, st.hide);
  const n = st.hands.length;
  st.hands.forEach((hd, j) => {
    const off = n > 1 ? (j ? 1 : -1) * w * 0.22 : 0;
    hd.cards.forEach((c, i) => card(g, w / 2 + off + (i - (hd.cards.length - 1) / 2) * cw * 0.5, h * 0.7 - i * h * 0.02, cw, ch, c));
    if (n > 1 && hd.active) { g.strokeStyle = '#ffd040'; g.lineWidth = 3; g.strokeRect(w / 2 + off - cw * 1.1, h * 0.7 - ch * 0.7, cw * 2.2, ch * 1.4); }
  });
}
function card(g, x, y, cw, ch, c) {
  g.save(); g.translate(x, y);
  g.fillStyle = c ? '#fbf6ea' : '#8a1a2a'; g.beginPath(); g.roundRect(-cw / 2, -ch / 2, cw, ch, cw * 0.1); g.fill();
  g.strokeStyle = c ? '#c8b890' : '#e8c46a'; g.lineWidth = 2; g.stroke();
  if (c) {
    const red = c.suit === '♥' || c.suit === '♦';
    text(g, c.rank, -cw * 0.28, -ch * 0.32, cw * 0.32, red ? '#c0302a' : '#151515', SER);
    text(g, c.suit, 0, ch * 0.08, cw * 0.55, red ? '#c0302a' : '#151515', `{s}px system-ui, sans-serif`);
  }
  g.restore();
}

// ---------- The crew bank board (the jackpot tower) ----------
export const bankFrameKey = (t, pub) => pub ? JSON.stringify([pub.bank, pub.target]) : 'empty';
export function paintBankBoard(g, w, h, t, pub) {
  bg(g, w, h, '#1a0a2a', '#05020a');
  if (!pub) return;
  text(g, 'CREW BANK', w / 2, h * 0.15, h * 0.11, '#ff7ac8');
  glowText(g, short(pub.bank), w / 2, h * 0.42, h * 0.24, '#ffd040');
  const p = Math.min(1, pub.bank / pub.target);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(w * 0.08, h * 0.64, w * 0.84, h * 0.09);
  g.fillStyle = '#3fff8a'; g.fillRect(w * 0.08, h * 0.64, w * 0.84 * p, h * 0.09);
  text(g, 'TARGET ' + short(pub.target), w / 2, h * 0.86, h * 0.1, '#fff');
}

// ---------- Touch buttons on a machine screen ----------
// items: [{ x, y, w, h (0..1 of the screen), label, sel, on }] from tables.js ui(); the same boxes are hit-tested there.
export function paintUI(g, w, h, items, accent = '#ffd040') {
  for (const b of items) {
    const x = b.x * w, y = b.y * h, bw = b.w * w, bh = b.h * h, r = Math.min(bw, bh) * 0.18;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect(x - 2, y - 2, bw + 4, bh + 4, r); g.fill();
    const lg = g.createLinearGradient(0, y, 0, y + bh);
    if (b.sel) { lg.addColorStop(0, '#fff3b0'); lg.addColorStop(1, accent); } else { lg.addColorStop(0, '#4a4060'); lg.addColorStop(1, '#221c30'); }
    g.fillStyle = lg; g.beginPath(); g.roundRect(x, y, bw, bh, r); g.fill();
    g.strokeStyle = b.sel ? '#fff' : accent; g.lineWidth = Math.max(2, h * 0.008); g.stroke();
    g.globalAlpha = b.on === false ? 0.35 : 1;
    const fs = Math.min(bh * 0.42, bw * 1.5 / Math.max(2, b.label.length));
    text(g, b.label, x + bw / 2, y + bh / 2 + fs * 0.05, fs, b.sel ? '#1a1014' : '#fff');
    g.globalAlpha = 1;
  }
}
