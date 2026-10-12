// Canvas-painted textures for the plush Art Deco casino. Everything is generated here: no image files.
import * as THREE from 'three';

let maxAniso = 4;
export function setAniso(n) { maxAniso = n; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());
function noiseFill(g, w, h, alpha, n = 2200) {
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * alpha})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
}

// Deep red carpet with gold Art Deco fans and diamonds. One tile = 1.6 m.
export const carpet = (base = '#7a1424', ink = '#e8c46a', alt = '#5c0e1b') => once('carpet' + base, () => {
  const [c, g] = canvas(512, 512);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  noiseFill(g, 512, 512, 0.08, 6000);
  g.strokeStyle = ink; g.globalAlpha = 0.55; g.lineWidth = 5;
  for (const [x, y] of [[0, 0], [512, 0], [0, 512], [512, 512], [256, 256]]) {
    g.beginPath(); g.moveTo(x, y - 128); g.lineTo(x + 128, y); g.lineTo(x, y + 128); g.lineTo(x - 128, y); g.closePath(); g.stroke();
    g.fillStyle = alt; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(x, y - 96); g.lineTo(x + 96, y); g.lineTo(x, y + 96); g.lineTo(x - 96, y); g.fill(); g.globalAlpha = 0.55;
    for (let i = 0; i < 7; i++) { // fan
      const a = -Math.PI + (i / 6) * Math.PI;
      g.beginPath(); g.moveTo(x, y + 40); g.lineTo(x + Math.cos(a) * 70, y + 40 + Math.sin(a) * 70); g.stroke();
    }
    g.beginPath(); g.arc(x, y + 40, 70, Math.PI, 0); g.stroke();
  }
  g.globalAlpha = 0.35; g.lineWidth = 2;
  for (let i = 0; i < 512; i += 64) { g.beginPath(); g.arc(i + 32, 128, 6, 0, 7); g.arc(i + 32, 384, 6, 0, 7); g.fillStyle = ink; g.fill(); }
  g.globalAlpha = 1;
  return tex(c);
});

export const wood = (base = '#5a3220', dark = '#3a1e12') => once('wood' + base, () => {
  const [c, g] = canvas(512, 512);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) {
    g.fillStyle = dark; g.fillRect(0, y, 512, 3);
    const off = (y / 64) % 2 ? 256 : 0; g.fillRect(off, y, 3, 64); g.fillRect(off + 256, y, 3, 64);
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`; g.lineWidth = 1 + Math.random() * 2;
      const yy = y + 6 + Math.random() * 54; g.beginPath(); g.moveTo(0, yy);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, yy + Math.sin(x * 0.02 + i) * 2);
      g.stroke();
    }
  }
  noiseFill(g, 512, 512, 0.05);
  return tex(c);
});

export const tiles = (a = '#cfe0de', b = '#9fc1c0') => once('tiles' + a, () => {
  const [c, g] = canvas(256, 256);
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * 64, y * 64, 64, 64); }
  g.strokeStyle = 'rgba(40,60,60,0.5)'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  noiseFill(g, 256, 256, 0.05, 800);
  return tex(c);
});

// Wallpaper: vertical deco stripes with stepped fans. Tile = 1.2 m wide, 1.2 m tall.
export const wallpaper = (base = '#6a1a2a', ink = '#e8c46a') => once('wp' + base, () => {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const grd = g.createLinearGradient(0, 0, 256, 0); grd.addColorStop(0, 'rgba(0,0,0,0.18)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.04)'); grd.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = ink; g.globalAlpha = 0.45; g.lineWidth = 3;
  g.beginPath(); g.moveTo(4, 0); g.lineTo(4, 256); g.moveTo(14, 0); g.lineTo(14, 256); g.stroke();
  for (let r = 30; r <= 90; r += 20) { g.beginPath(); g.arc(128, 170, r, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
  g.beginPath(); g.moveTo(128, 170); g.lineTo(128, 70); g.stroke();
  g.beginPath(); g.moveTo(98, 256); g.lineTo(128, 200); g.lineTo(158, 256); g.stroke();
  g.globalAlpha = 1;
  noiseFill(g, 256, 256, 0.06, 900);
  return tex(c);
});

export const ceiling = (base = '#2a1418') => once('ceil' + base, () => {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(232,196,106,0.4)'; g.lineWidth = 4; g.strokeRect(16, 16, 224, 224);
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 10; g.strokeRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(28, 28, 200, 200);
  return tex(c);
});

// Blackjack felt, mapped 0..1 over the half-ellipse's bounding box (flat dealer edge at v=0).
export const bjFelt = () => once('bj', () => {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#1b6a40'; g.fillRect(0, 0, 1024, 512);
  const rg = g.createRadialGradient(512, 0, 50, 512, 0, 560); rg.addColorStop(0, 'rgba(255,255,255,0.10)'); rg.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = rg; g.fillRect(0, 0, 1024, 512);
  noiseFill(g, 1024, 512, 0.06, 5000);
  g.strokeStyle = '#e8c46a'; g.lineWidth = 4;
  g.beginPath(); g.ellipse(512, 0, 380, 330, 0, 0, Math.PI); g.stroke();
  g.beginPath(); g.ellipse(512, 0, 300, 250, 0, 0, Math.PI); g.stroke();
  g.fillStyle = '#e8c46a'; g.font = 'bold 30px Georgia'; g.textAlign = 'center';
  g.fillText('BLACKJACK PAYS 3 TO 2', 512, 140);
  g.font = 'italic 22px Georgia'; g.fillText('Dealer must stand on 17 and draw to 16', 512, 180);
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * (0.18 + i * 0.213), x = 512 + Math.cos(a) * 420, y = Math.sin(a) * 380;
    g.save(); g.translate(x, y); g.rotate(a - Math.PI / 2); g.strokeRect(-36, -26, 72, 52); g.beginPath(); g.arc(0, 50, 18, 0, 7); g.stroke(); g.restore();
  }
  return tex(c, false);
});

export const rouletteFelt = () => once('rl', () => {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#1b6a40'; g.fillRect(0, 0, 1024, 512);
  noiseFill(g, 1024, 512, 0.06, 5000);
  const x0 = 470, y0 = 90, cw = 44, ch = 100;
  g.font = 'bold 26px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#1e8f55'; g.fillRect(x0 - 50, y0, 48, ch * 3); g.fillStyle = '#fff'; g.fillText('0', x0 - 26, y0 + ch * 1.5);
  for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) {
    const n = col * 3 + (3 - row);
    const red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(n);
    const x = x0 + col * cw, y = y0 + row * ch;
    g.strokeStyle = '#e8c46a'; g.lineWidth = 2; g.strokeRect(x, y, cw, ch);
    g.fillStyle = red ? '#c0302a' : '#151515'; g.beginPath(); g.ellipse(x + cw / 2, y + ch / 2, 17, 26, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 18px Georgia'; g.fillText(String(n), x + cw / 2, y + ch / 2);
  }
  g.strokeStyle = '#e8c46a'; g.strokeRect(x0, y0 + ch * 3, cw * 6, 60); g.strokeRect(x0 + cw * 6, y0 + ch * 3, cw * 6, 60);
  g.fillStyle = '#c0302a'; g.fillRect(x0 + 20, y0 + ch * 3 + 14, 80, 32); g.fillStyle = '#151515'; g.fillRect(x0 + cw * 6 + 20, y0 + ch * 3 + 14, 80, 32);
  g.fillStyle = '#e8c46a'; g.font = 'bold 22px Georgia'; g.fillText('RED', x0 + 200, y0 + ch * 3 + 30); g.fillText('BLACK', x0 + cw * 6 + 190, y0 + ch * 3 + 30);
  return tex(c, false);
});

export const wheelTex = () => once('wheel', () => {
  const [c, g] = canvas(512, 512);
  const n = 37;
  g.fillStyle = '#3a1e12'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i === 0 ? '#1e8f55' : i % 2 ? '#c0302a' : '#151515';
    g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 250, i / n * Math.PI * 2, (i + 1) / n * Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#e8c46a'; g.lineWidth = 3;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.beginPath(); g.moveTo(256 + Math.cos(a) * 150, 256 + Math.sin(a) * 150); g.lineTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250); g.stroke(); }
  const rg = g.createRadialGradient(256, 256, 20, 256, 256, 160); rg.addColorStop(0, '#e8c46a'); rg.addColorStop(0.3, '#8a5835'); rg.addColorStop(1, '#5a3220');
  g.fillStyle = rg; g.beginPath(); g.arc(256, 256, 150, 0, 7); g.fill();
  g.strokeStyle = '#e8c46a'; g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 150, 0, 7); g.stroke();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + Math.cos(a) * 120, 256 + Math.sin(a) * 120); g.stroke(); }
  return tex(c, false);
});

// Labels and floating text as sprites.
export function textSprite(text, { color = '#f3ead8', size = 44, bg = 'rgba(10,6,8,0.55)', font = 'bold', h = 0.22, screen = false } = {}) {
  const [c, g] = canvas(16, 16);
  g.font = `${font} ${size}px Georgia`;
  const w = Math.ceil(g.measureText(text).width) + size;
  c.width = w; c.height = Math.ceil(size * 1.5);
  g.font = `${font} ${size}px Georgia`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (bg) { g.fillStyle = bg; const r = c.height / 2; g.beginPath(); g.roundRect(0, 0, w, c.height, r); g.fill(); }
  g.lineWidth = size / 7; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(text, w / 2, c.height / 2);
  g.fillStyle = color; g.fillText(text, w / 2, c.height / 2);
  const t = tex(c, false);
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, sizeAttenuation: !screen });
  const s = new THREE.Sprite(m); s.scale.set(h * w / c.height, h, 1);
  return s;
}

// Neon sign: bright core on black so bloom does the glow.
export function neonTexture(text, color = '#ff5c8a', w = 1024, h = 256, font = 'bold italic 150px Georgia') {
  const [c, g] = canvas(w, h);
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 30; g.strokeStyle = color; g.lineWidth = 14; g.strokeText(text, w / 2, h / 2);
  g.shadowBlur = 0; g.lineWidth = 5; g.strokeStyle = '#fff'; g.strokeText(text, w / 2, h / 2);
  return tex(c, false);
}

// Animated canvases: the race screen and the slot reels repaint a few times a second.
export function liveCanvas(w, h, paint) {
  const [c, g] = canvas(w, h);
  const t = tex(c, false);
  return { tex: t, update(time) { paint(g, w, h, time); t.needsUpdate = true; } };
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
export const cardTex = (label, red) => once('card' + label, () => {
  const [c, g] = canvas(128, 180);
  g.fillStyle = '#fbf6ea'; g.beginPath(); g.roundRect(0, 0, 128, 180, 12); g.fill();
  g.strokeStyle = '#c8b890'; g.lineWidth = 3; g.stroke();
  g.fillStyle = red ? '#c0302a' : '#151515'; g.font = 'bold 44px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 64, 90); g.font = 'bold 26px Georgia'; g.fillText(label, 22, 22);
  return tex(c, false);
});
export const cardBack = () => once('cardback', () => {
  const [c, g] = canvas(128, 180);
  g.fillStyle = '#8a1a2a'; g.beginPath(); g.roundRect(0, 0, 128, 180, 12); g.fill();
  g.strokeStyle = '#e8c46a'; g.lineWidth = 4; g.strokeRect(12, 12, 104, 156);
  for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(12 + i * 13, 12); g.lineTo(116, 168 - i * 20); g.stroke(); }
  return tex(c, false);
});
