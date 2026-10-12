// Canvas-painted textures for the plush Art Deco casino. Everything is generated here: no image files.
import * as THREE from 'three';

let maxAniso = 4;
export function setAniso(n) { maxAniso = n; }

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
export function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());
// Seeded random so a texture paints the same way every load.
function srand(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function noiseFill(g, w, h, alpha, n = 2200, r = Math.random) {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * alpha})`; g.fillRect(r() * w, r() * h, 2, 2); }
}
const FONT = 'Georgia, "Times New Roman", serif';

// ---------- Floors ----------
// Casino carpet: deep red with dark swirls, gold fans and little diamonds. One tile = 1.6 m.
export const carpet = (base = '#7a1424', ink = '#e8c46a', alt = '#4e0a16') => once('carpet' + base, () => {
  const [c, g] = canvas(512, 512), r = srand(7);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  noiseFill(g, 512, 512, 0.07, 9000, r);
  // swirls
  g.strokeStyle = alt; g.lineWidth = 10; g.lineCap = 'round';
  for (const [x, y, s] of [[128, 128, 1], [384, 384, 1], [384, 128, -1], [128, 384, -1]]) {
    g.beginPath();
    for (let a = 0; a < Math.PI * 3.2; a += 0.1) { const rr = 8 + a * 13; g.lineTo(x + Math.cos(a * s) * rr, y + Math.sin(a * s) * rr); }
    g.stroke();
  }
  g.strokeStyle = ink; g.globalAlpha = 0.6; g.lineWidth = 4;
  for (const [x, y] of [[0, 0], [512, 0], [0, 512], [512, 512], [256, 256]]) {
    for (let i = 0; i < 9; i++) { const a = -Math.PI + (i / 8) * Math.PI; g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x + Math.cos(a) * 62, y + 30 + Math.sin(a) * 62); g.stroke(); }
    g.beginPath(); g.arc(x, y + 30, 62, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(x, y + 30, 74, Math.PI, 0); g.stroke();
  }
  g.fillStyle = ink;
  for (const [x, y] of [[256, 0], [0, 256], [512, 256], [256, 512], [128, 256], [384, 256], [256, 128], [256, 384]]) { g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 8, y); g.lineTo(x, y + 12); g.lineTo(x - 8, y); g.fill(); }
  g.globalAlpha = 1;
  return tex(c);
});
// The arcade's carpet: midnight blue with neon triangles, squiggles and rings, like every bowling alley ever.
export const arcadeCarpet = () => once('arcade', () => {
  const [c, g] = canvas(512, 512), r = srand(11);
  g.fillStyle = '#10123a'; g.fillRect(0, 0, 512, 512);
  noiseFill(g, 512, 512, 0.08, 6000, r);
  const cols = ['#ff3fa4', '#3fe0ff', '#ffe23f', '#8a5cff', '#3fff8a'];
  for (let i = 0; i < 46; i++) {
    const x = r() * 512, y = r() * 512, col = cols[i % cols.length], k = i % 3;
    g.strokeStyle = g.fillStyle = col; g.lineWidth = 5; g.globalAlpha = 0.85;
    for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
      g.save(); g.translate(x + ox, y + oy); g.rotate(r() * 6.28);
      if (k === 0) { g.beginPath(); g.moveTo(0, -14); g.lineTo(13, 10); g.lineTo(-13, 10); g.closePath(); g.stroke(); }
      else if (k === 1) { g.beginPath(); for (let j = 0; j <= 4; j++) g.lineTo(-24 + j * 12, j % 2 ? 8 : -8); g.stroke(); }
      else { g.beginPath(); g.arc(0, 0, 9, 0, 7); g.stroke(); }
      g.restore();
    }
  }
  g.globalAlpha = 1;
  return tex(c);
});
// VIP: plum carpet with a gold diamond lattice.
export const vipCarpet = () => once('vip', () => {
  const [c, g] = canvas(256, 256), r = srand(3);
  g.fillStyle = '#3a1446'; g.fillRect(0, 0, 256, 256);
  noiseFill(g, 256, 256, 0.07, 3000, r);
  g.strokeStyle = 'rgba(232,196,106,0.55)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(128, 0); g.lineTo(256, 128); g.lineTo(128, 256); g.closePath(); g.stroke();
  g.strokeStyle = 'rgba(232,196,106,0.25)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(256, 256); g.moveTo(256, 0); g.lineTo(0, 256); g.stroke();
  g.fillStyle = '#e8c46a'; g.beginPath(); g.arc(128, 128, 7, 0, 7); g.fill();
  return tex(c);
});
export const wood = (base = '#5a3220', dark = '#3a1e12') => once('wood' + base, () => {
  const [c, g] = canvas(512, 512), r = srand(5);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) {
    const shade = (r() - 0.5) * 0.12; g.fillStyle = shade > 0 ? `rgba(255,220,180,${shade})` : `rgba(0,0,0,${-shade})`; g.fillRect(0, y, 512, 64);
    g.fillStyle = dark; g.fillRect(0, y, 512, 3);
    const off = (y / 64) % 2 ? 256 : 0; g.fillRect(off, y, 3, 64); g.fillRect(off + 256, y, 3, 64);
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`; g.lineWidth = 1 + r() * 2;
      const yy = y + 6 + r() * 54; g.beginPath(); g.moveTo(0, yy);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, yy + Math.sin(x * 0.02 + i) * 2);
      g.stroke();
    }
  }
  noiseFill(g, 512, 512, 0.05, 2200, r);
  return tex(c);
});
export const tiles = (a = '#cfe0de', b = '#9fc1c0') => once('tiles' + a, () => {
  const [c, g] = canvas(256, 256), r = srand(9);
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * 64, y * 64, 64, 64); }
  g.strokeStyle = 'rgba(40,60,60,0.5)'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  noiseFill(g, 256, 256, 0.05, 800, r);
  return tex(c);
});
// Wet asphalt for the back alley, with a painted line and a few cracks.
export const asphalt = () => once('asphalt', () => {
  const [c, g] = canvas(512, 512), r = srand(13);
  g.fillStyle = '#2a2a30'; g.fillRect(0, 0, 512, 512);
  noiseFill(g, 512, 512, 0.16, 26000, r);
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) { let x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 8; j++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 3; i++) { const rg = g.createRadialGradient(0, 0, 4, 0, 0, 70); rg.addColorStop(0, 'rgba(20,24,40,0.6)'); rg.addColorStop(1, 'rgba(20,24,40,0)'); g.save(); g.translate(r() * 512, r() * 512); g.scale(1.6, 1); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 70, 0, 7); g.fill(); g.restore(); }
  return tex(c);
});
export const marbleFloor = (a = '#e8e0d4', b = '#20181a') => once('marble' + a, () => {
  const [c, g] = canvas(512, 512), r = srand(17);
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
    g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * 256, y * 256, 256, 256);
    g.strokeStyle = (x + y) % 2 ? 'rgba(120,100,90,0.25)' : 'rgba(255,255,255,0.08)'; g.lineWidth = 2;
    for (let i = 0; i < 5; i++) { let px = x * 256 + r() * 256, py = y * 256 + r() * 256; g.beginPath(); g.moveTo(px, py); for (let j = 0; j < 10; j++) { px += (r() - 0.3) * 40; py += (r() - 0.5) * 40; g.lineTo(px, py); } g.stroke(); }
  }
  g.strokeStyle = '#c8963a'; g.lineWidth = 4; g.strokeRect(0, 0, 512, 512); g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
  return tex(c);
});

// A compass-rose medallion for the floor around the pit bell.
export const medallion = () => once('medallion', () => {
  const [c, g] = canvas(1024, 1024);
  g.translate(512, 512);
  const rg = g.createRadialGradient(0, 0, 40, 0, 0, 512); rg.addColorStop(0, '#2a1a20'); rg.addColorStop(1, '#120a0e'); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 512, 0, 7); g.fill();
  for (const [r, w] of [[500, 10], [440, 4], [300, 6]]) { g.strokeStyle = '#e8c46a'; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, long = i % 4 === 0, r = long ? 430 : i % 2 ? 260 : 340;
    g.save(); g.rotate(a); g.fillStyle = i % 2 ? '#b8923a' : '#f0d58a';
    g.beginPath(); g.moveTo(0, -r); g.lineTo(long ? 46 : 30, 0); g.lineTo(0, 30); g.lineTo(long ? -46 : -30, 0); g.closePath(); g.fill(); g.restore();
  }
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; g.fillStyle = '#e8c46a'; g.beginPath(); g.arc(Math.cos(a) * 470, Math.sin(a) * 470, 8, 0, 7); g.fill(); }
  g.fillStyle = '#e8c46a'; g.beginPath(); g.arc(0, 0, 60, 0, 7); g.fill();
  return tex(c, false);
});

// ---------- Walls ----------
// Damask wallpaper with deco fans. Tile = 1.2 m.
export const wallpaper = (base = '#6a1a2a', ink = '#e8c46a') => once('wp' + base + ink, () => {
  const [c, g] = canvas(256, 256), r = srand(19);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const grd = g.createLinearGradient(0, 0, 256, 0); grd.addColorStop(0, 'rgba(0,0,0,0.16)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.05)'); grd.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  // damask medallion
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (const [x, y] of [[128, 128], [0, 0], [256, 0], [0, 256], [256, 256]]) {
    g.save(); g.translate(x, y);
    for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(30, -10, 40, -50, 0, -62); g.bezierCurveTo(-40, -50, -30, -10, 0, 0); g.fill(); }
    g.restore();
  }
  g.strokeStyle = ink; g.globalAlpha = 0.4; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(3, 0); g.lineTo(3, 256); g.moveTo(10, 0); g.lineTo(10, 256); g.stroke();
  for (let rr = 18; rr <= 54; rr += 12) { g.beginPath(); g.arc(128, 150, rr, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
  g.globalAlpha = 1;
  noiseFill(g, 256, 256, 0.05, 900, r);
  return tex(c);
});
export const brick = (base = '#7a3a2a') => once('brick' + base, () => {
  const [c, g] = canvas(512, 512), r = srand(23);
  g.fillStyle = '#3a2a24'; g.fillRect(0, 0, 512, 512);
  const bw = 64, bh = 32;
  for (let y = 0; y < 512; y += bh) for (let x = -bw; x < 512; x += bw) {
    const ox = (y / bh) % 2 ? bw / 2 : 0, v = 0.75 + r() * 0.4;
    const col = new THREE.Color(base).multiplyScalar(v);
    g.fillStyle = '#' + col.getHexString(); g.fillRect(x + ox + 3, y + 3, bw - 6, bh - 6);
    g.fillStyle = `rgba(0,0,0,${r() * 0.2})`; g.fillRect(x + ox + 3, y + bh - 9, bw - 6, 6);
  }
  noiseFill(g, 512, 512, 0.12, 9000, r);
  // a bit of graffiti
  g.save(); g.translate(170, 300); g.rotate(-0.12);
  g.font = `bold 70px ${FONT}`; g.lineWidth = 10; g.strokeStyle = 'rgba(20,20,30,0.6)'; g.strokeText('LUCKY', 0, 0);
  g.fillStyle = 'rgba(80,220,255,0.55)'; g.fillText('LUCKY', 0, 0);
  g.restore();
  return tex(c);
});
// Ceiling: coffers with gold edges and a soft centre. One tile = 2 m.
export const ceiling = (base = '#2a1418') => once('ceil' + base, () => {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, 256, 18); g.fillRect(0, 0, 18, 256);
  const rg = g.createRadialGradient(137, 137, 10, 137, 137, 130); rg.addColorStop(0, 'rgba(255,230,190,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = rg; g.fillRect(18, 18, 238, 238);
  g.strokeStyle = 'rgba(232,196,106,0.55)'; g.lineWidth = 3; g.strokeRect(30, 30, 214, 214);
  g.strokeStyle = 'rgba(232,196,106,0.25)'; g.lineWidth = 2; g.strokeRect(44, 44, 186, 186);
  return tex(c);
});

// ---------- Tables ----------
// Blackjack felt, mapped 0..1 over the half-ellipse's bounding box (flat dealer edge at v=0).
export const bjFelt = (color = '#1b6a40') => once('bj' + color, () => {
  const [c, g] = canvas(1024, 512), r = srand(29);
  g.fillStyle = color; g.fillRect(0, 0, 1024, 512);
  const rg = g.createRadialGradient(512, 0, 50, 512, 0, 560); rg.addColorStop(0, 'rgba(255,255,255,0.12)'); rg.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = rg; g.fillRect(0, 0, 1024, 512);
  noiseFill(g, 1024, 512, 0.06, 5000, r);
  g.strokeStyle = '#e8c46a'; g.lineWidth = 4;
  g.beginPath(); g.ellipse(512, 0, 380, 330, 0, 0, Math.PI); g.stroke();
  g.beginPath(); g.ellipse(512, 0, 300, 250, 0, 0, Math.PI); g.stroke();
  g.fillStyle = '#e8c46a'; g.textAlign = 'center';
  g.font = `bold 34px ${FONT}`; g.fillText('BLACKJACK PAYS 2 TO 1', 512, 120);
  g.font = `italic 24px ${FONT}`; g.fillText('Ties pay half · Dealer stands on 17', 512, 160);
  g.font = `bold 20px ${FONT}`; g.fillText('INSURANCE IS FOR QUITTERS', 512, 200);
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (1 / 6 + i / 6), x = 512 + Math.cos(a) * 430, y = Math.sin(a) * 400;
    g.save(); g.translate(x, y); g.rotate(a - Math.PI / 2); g.strokeRect(-36, -26, 72, 52); g.beginPath(); g.arc(0, 52, 18, 0, 7); g.stroke(); g.restore();
  }
  return tex(c, false);
});
export const rouletteFelt = () => once('rl', () => {
  const [c, g] = canvas(1024, 512), r = srand(31);
  g.fillStyle = '#1b6a40'; g.fillRect(0, 0, 1024, 512);
  noiseFill(g, 1024, 512, 0.06, 5000, r);
  const x0 = 170, y0 = 90, cw = 52, ch = 96;
  const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#1e8f55'; g.fillRect(x0 - 56, y0, 54, ch * 3); g.fillStyle = '#fff'; g.font = `bold 30px ${FONT}`; g.fillText('0', x0 - 29, y0 + ch * 1.5);
  for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) {
    const n = col * 3 + (3 - row), x = x0 + col * cw, y = y0 + row * ch;
    g.strokeStyle = '#e8c46a'; g.lineWidth = 2; g.strokeRect(x, y, cw, ch);
    g.fillStyle = RED.includes(n) ? '#c0302a' : '#151515'; g.beginPath(); g.ellipse(x + cw / 2, y + ch / 2, 19, 27, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = `bold 20px ${FONT}`; g.fillText(String(n), x + cw / 2, y + ch / 2);
  }
  const yb = y0 + ch * 3;
  ['1st 12', '2nd 12', '3rd 12'].forEach((t, i) => { g.strokeRect(x0 + i * cw * 4, yb, cw * 4, 50); g.fillStyle = '#e8c46a'; g.font = `bold 22px ${FONT}`; g.fillText(t, x0 + i * cw * 4 + cw * 2, yb + 25); });
  ['1-18', 'EVEN', 'RED', 'BLACK', 'ODD', '19-36'].forEach((t, i) => {
    g.strokeRect(x0 + i * cw * 2, yb + 50, cw * 2, 50);
    if (t === 'RED' || t === 'BLACK') { g.fillStyle = t === 'RED' ? '#c0302a' : '#151515'; g.beginPath(); g.moveTo(x0 + i * cw * 2 + cw, yb + 58); g.lineTo(x0 + i * cw * 2 + cw + 30, yb + 75); g.lineTo(x0 + i * cw * 2 + cw, yb + 92); g.lineTo(x0 + i * cw * 2 + cw - 30, yb + 75); g.fill(); }
    else { g.fillStyle = '#e8c46a'; g.fillText(t, x0 + i * cw * 2 + cw, yb + 75); }
  });
  g.fillStyle = '#ffd040'; g.font = `bold italic 26px ${FONT}`; g.fillText('LUCKY NUMBERS PAY UP TO 500x', x0 + cw * 6, 50);
  return tex(c, false);
});
export const wheelTex = () => once('wheel', () => {
  const [c, g] = canvas(512, 512);
  const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const n = 37;
  g.fillStyle = '#3a1e12'; g.fillRect(0, 0, 512, 512);
  g.translate(256, 256);
  for (let i = 0; i < n; i++) {
    const num = ORDER[i];
    g.fillStyle = num === 0 ? '#1e8f55' : RED.has(num) ? '#c0302a' : '#151515';
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 250, i / n * Math.PI * 2, (i + 1) / n * Math.PI * 2); g.fill();
    g.save(); g.rotate((i + 0.5) / n * Math.PI * 2); g.fillStyle = '#fff'; g.font = `bold 20px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.translate(225, 0); g.rotate(Math.PI / 2); g.fillText(String(num), 0, 0); g.restore();
  }
  g.strokeStyle = '#e8c46a'; g.lineWidth = 3;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 150, Math.sin(a) * 150); g.lineTo(Math.cos(a) * 250, Math.sin(a) * 250); g.stroke(); }
  const rg = g.createRadialGradient(0, 0, 20, 0, 0, 160); rg.addColorStop(0, '#e8c46a'); rg.addColorStop(0.3, '#8a5835'); rg.addColorStop(1, '#5a3220');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 150, 0, 7); g.fill();
  g.strokeStyle = '#e8c46a'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 150, 0, 7); g.stroke();
  return tex(c, false);
});
export const diceFelt = () => once('dice', () => {
  const [c, g] = canvas(1024, 512), r = srand(37);
  g.fillStyle = '#1a5a8a'; g.fillRect(0, 0, 1024, 512);
  noiseFill(g, 1024, 512, 0.06, 6000, r);
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(30, 30, 964, 452);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.strokeRect(60, 330, 904, 120); g.font = `bold 64px ${FONT}`; g.fillText('PASS LINE', 512, 390);
  g.strokeRect(220, 160, 584, 140);
  g.font = `bold 40px ${FONT}`; g.fillText('FIELD', 512, 195);
  g.font = `bold 38px ${FONT}`; g.fillText('2 · 3 · 4 · 9 · 10 · 11 · 12', 512, 255);
  g.fillStyle = '#ffd040'; g.font = `bold italic 28px ${FONT}`; g.fillText('12 WINS ON THE COME-OUT · 2 AND 12 PAY 5x', 512, 90);
  return tex(c, false);
});

// The prize wheel's face: 50 segments, the prizes in bright colours, the blanks in dark ones.
export const prizeWheel = (segs) => once('prize', () => {
  const [c, g] = canvas(1024, 1024);
  const n = segs.length, R = 500;
  g.translate(512, 512);
  const colOf = v => v >= 20 ? '#ffd040' : v >= 5 ? '#ff3fa4' : v >= 3 ? '#8a5cff' : v >= 2 ? '#3fe0ff' : v > 0 ? '#3fff8a' : null;
  for (let i = 0; i < n; i++) {
    const v = segs[i], a0 = i / n * Math.PI * 2 - Math.PI / 2, a1 = (i + 1) / n * Math.PI * 2 - Math.PI / 2;
    g.fillStyle = colOf(v) || (i % 2 ? '#2a1e3a' : '#3a2650');
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a1); g.fill();
    g.strokeStyle = '#e8c46a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); g.stroke();
    g.save(); g.rotate((a0 + a1) / 2); g.translate(R - 70, 0); g.rotate(Math.PI / 2);
    g.fillStyle = colOf(v) ? '#1a1020' : 'rgba(255,255,255,0.35)'; g.font = `bold ${v >= 10 ? 40 : 34}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(v ? v + 'x' : '·', 0, 0); g.restore();
  }
  g.strokeStyle = '#e8c46a'; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, R - 6, 0, 7); g.stroke();
  const rg = g.createRadialGradient(0, 0, 10, 0, 0, 150); rg.addColorStop(0, '#fff3c0'); rg.addColorStop(0.5, '#e8b440'); rg.addColorStop(1, '#8a5a20');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 140, 0, 7); g.fill();
  g.fillStyle = '#3a1e12'; g.font = `bold italic 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SPIN', 0, 0);
  return tex(c, false);
});
export const coinFace = (heads) => once('coin' + heads, () => {
  const [c, g] = canvas(256, 256);
  const rg = g.createRadialGradient(110, 100, 10, 128, 128, 128); rg.addColorStop(0, '#fff3c0'); rg.addColorStop(0.6, '#e8b440'); rg.addColorStop(1, '#8a5a20');
  g.fillStyle = rg; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
  g.strokeStyle = '#8a5a20'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 110, 0, 7); g.stroke();
  g.fillStyle = '#7a4a18'; g.font = `bold ${heads ? 120 : 110}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(heads ? 'H' : 'T', 128, 136);
  return tex(c, false);
});

// ---------- Labels, neon, live canvases ----------
export function textSprite(text, { color = '#f3ead8', size = 44, bg = 'rgba(10,6,8,0.55)', font = 'bold', h = 0.22, screen = false } = {}) {
  const [c, g] = canvas(16, 16);
  g.font = `${font} ${size}px ${FONT}`;
  const w = Math.ceil(g.measureText(text).width) + size;
  c.width = w; c.height = Math.ceil(size * 1.5);
  g.font = `${font} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (bg) { g.fillStyle = bg; const r = c.height / 2; g.beginPath(); g.roundRect(0, 0, w, c.height, r); g.fill(); }
  g.lineWidth = size / 7; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(text, w / 2, c.height / 2);
  g.fillStyle = color; g.fillText(text, w / 2, c.height / 2);
  const t = tex(c, false);
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, sizeAttenuation: !screen });
  const s = new THREE.Sprite(m); s.scale.set(h * w / c.height, h, 1);
  return s;
}
// Neon sign: bright core on black so bloom does the glow (drawn additively).
export function neonTexture(text, color = '#ff5c8a', w = 1024, h = 256, font = `bold italic 150px ${FONT}`) {
  const [c, g] = canvas(w, h);
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 30; g.strokeStyle = color; g.lineWidth = 14; g.strokeText(text, w / 2, h / 2);
  g.shadowBlur = 0; g.lineWidth = 5; g.strokeStyle = '#fff'; g.strokeText(text, w / 2, h / 2);
  return tex(c, false);
}
// A painted panel for signs that are lit but not neon (marquee boards, plaques).
export function plaque(text, { w = 512, h = 128, bg = '#1a0a10', ink = '#e8c46a', font = `bold 64px ${FONT}`, border = true } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = ink; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); }
  g.fillStyle = ink; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  return tex(c, false);
}
// Animated canvases repaint a few times a second; paint(g, w, h, time, state).
export function liveCanvas(w, h, paint) {
  const [c, g] = canvas(w, h);
  const t = tex(c, false);
  return { tex: t, canvas: c, g, update(time, state) { paint(g, w, h, time, state); t.needsUpdate = true; } };
}

// Soft round blob for contact shadows and glows.
export const blob = () => once('blob', () => {
  const [c, g] = canvas(128, 128);
  const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62); rg.addColorStop(0, 'rgba(0,0,0,0.7)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return tex(c, false);
});
export const glow = () => once('glow', () => {
  const [c, g] = canvas(128, 128);
  const rg = g.createRadialGradient(64, 64, 2, 64, 64, 62); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return tex(c, false);
});
// A soft cone of light seen from the side (spotlights over the tables).
export const beam = () => once('beam', () => {
  const [c, g] = canvas(128, 256);
  const lg = g.createLinearGradient(0, 0, 0, 256); lg.addColorStop(0, 'rgba(255,240,210,0.55)'); lg.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = lg; g.fillRect(0, 0, 128, 256);
  const sg = g.createLinearGradient(0, 0, 128, 0); sg.addColorStop(0, 'rgba(0,0,0,1)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = sg; g.fillRect(0, 0, 128, 256);
  return tex(c, false);
});
export const cardTex = (label, red) => once('card' + label, () => {
  const [c, g] = canvas(128, 180);
  g.fillStyle = '#fbf6ea'; g.beginPath(); g.roundRect(0, 0, 128, 180, 12); g.fill();
  g.strokeStyle = '#c8b890'; g.lineWidth = 3; g.stroke();
  g.fillStyle = red ? '#c0302a' : '#151515'; g.font = `bold 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 64, 90); g.font = `bold 26px ${FONT}`; g.fillText(label, 22, 22);
  return tex(c, false);
});
export const cardBack = () => once('cardback', () => {
  const [c, g] = canvas(128, 180);
  g.fillStyle = '#8a1a2a'; g.beginPath(); g.roundRect(0, 0, 128, 180, 12); g.fill();
  g.strokeStyle = '#e8c46a'; g.lineWidth = 4; g.strokeRect(12, 12, 104, 156);
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(12 + i * 13, 12); g.lineTo(116, 168 - i * 20); g.stroke(); }
  return tex(c, false);
});
