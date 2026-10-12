// Draws one frame from a view (public state + this player's private state). Works the same for host, guest and solo.
import { CFG } from './config.js';
import { clamp, dist, angDiff } from './util.js';
import { W, H, ROOMS, WALLS, OBSTACLES, DOORS, TAP, BELL, makeSeats, los } from './map.js';

const SEATS = makeSeats();
const view = document.getElementById('view'), ctx = view.getContext('2d');
const dark = document.createElement('canvas'), dctx = dark.getContext('2d');
export const cam = { x: W / 2, y: H / 2, z: 1 };
let floorTex = null;

export function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(innerWidth * dpr)), h = Math.max(1, Math.round(innerHeight * dpr));
  if (view.width === w && view.height === h) return;
  view.width = w; view.height = h; dark.width = w; dark.height = h;
  const portrait = innerHeight > innerWidth;
  cam.z = dpr * (portrait ? Math.min(innerWidth / 620, innerHeight / 900) : Math.min(innerWidth / 1150, innerHeight / (innerHeight < 560 ? 520 : 760)));
}
export function screenToWorld(sx, sy) {
  const dpr = view.width / Math.max(1, innerWidth);
  return { x: (sx * dpr - view.width / 2) / cam.z + cam.x, y: (sy * dpr - view.height / 2) / cam.z + cam.y };
}

export function canSeeFrom(v, p, lightsT) {
  const d = dist(v, p), range = lightsT > 0 ? CFG.darkRange : CFG.viewRange;
  if (d > range) return false;
  if (d > CFG.nearSense && Math.abs(angDiff(Math.atan2(p.y - v.y, p.x - v.x), v.look)) > CFG.coneHalf) return false;
  return los(v, p);
}

// Pre-render the static floor once: carpet, tiles, wood.
function buildFloor() {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  for (const k in ROOMS) {
    const r = ROOMS[k]; g.fillStyle = r.floor; g.fillRect(r.x, r.y, r.w, r.h);
    g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    if (k === 'floor') {
      for (let x = r.x; x < r.x + r.w; x += 48) for (let y = r.y; y < r.y + r.h; y += 48) {
        g.fillStyle = ((x + y) / 48) % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.02)';
        g.beginPath(); g.moveTo(x + 24, y); g.lineTo(x + 48, y + 24); g.lineTo(x + 24, y + 48); g.lineTo(x, y + 24); g.fill();
        g.fillStyle = 'rgba(232,196,106,0.12)'; g.beginPath(); g.arc(x + 24, y + 24, 2.5, 0, 7); g.fill();
      }
    } else if (k === 'bar') {
      for (let y = r.y; y < r.y + r.h; y += 22) { g.fillStyle = (y / 22) % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.03)'; g.fillRect(r.x, y, r.w, 21); }
      g.strokeStyle = 'rgba(0,0,0,0.25)'; for (let y = r.y; y < r.y + r.h; y += 22) for (let x = r.x + ((y / 22) % 2) * 60; x < r.x + r.w; x += 120) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 22); g.stroke(); }
    } else if (k === 'rest') {
      for (let x = r.x; x < r.x + r.w; x += 30) for (let y = r.y; y < r.y + r.h; y += 30) { g.fillStyle = ((x + y) / 30) % 2 ? '#2b3a40' : '#233035'; g.fillRect(x, y, 30, 30); }
    } else if (k === 'race') {
      g.strokeStyle = 'rgba(120,150,255,0.07)'; g.lineWidth = 2; for (let x = r.x - r.h; x < r.x + r.w; x += 26) { g.beginPath(); g.moveTo(x, r.y); g.lineTo(x + r.h, r.y + r.h); g.stroke(); }
    } else if (k === 'vip') {
      g.fillStyle = 'rgba(232,196,106,0.06)'; for (let x = r.x + 30; x < r.x + r.w; x += 60) for (let y = r.y + 30; y < r.y + r.h; y += 60) { g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); }
      g.fillStyle = '#4a2a55'; g.fillRect(r.x + 60, r.y + 120, r.w - 120, r.h - 200);
      g.strokeStyle = 'rgba(232,196,106,0.4)'; g.lineWidth = 3; g.strokeRect(r.x + 70, r.y + 130, r.w - 140, r.h - 220);
    }
    g.restore();
    g.fillStyle = 'rgba(243,234,216,0.16)'; g.font = 'italic 22px Georgia'; g.textAlign = 'center';
    g.fillText(r.name.replace('the ', '').toUpperCase(), r.x + r.w / 2, r.y + r.h - 24);
  }
  for (const d of DOORS) { g.fillStyle = '#2a1b22'; g.fillRect((d.pa.x + d.pb.x) / 2 - 30, (d.pa.y + d.pb.y) / 2 - 30, 60, 60); }
  return c;
}

export function draw(frame) {
  resize();
  if (!floorTex) floorTex = buildFloor();
  const { pub, priv, me } = frame;
  const vw = view.width / cam.z, vh = view.height / cam.z;
  const fx = me ? me.x : W / 2, fy = me ? me.y : H / 2;
  cam.x = vw > W ? W / 2 : clamp(fx, vw / 2 - 40, W - vw / 2 + 40);
  cam.y = vh > H ? H / 2 : clamp(fy, vh / 2 - 40, H - vh / 2 + 40);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0709'; ctx.fillRect(0, 0, view.width, view.height);
  ctx.setTransform(cam.z, 0, 0, cam.z, view.width / 2 - cam.x * cam.z, view.height / 2 - cam.y * cam.z);
  const t = pub ? pub.t : performance.now() / 1000;
  ctx.drawImage(floorTex, 0, 0);
  drawProps(pub, priv, t);
  if (!pub) { drawWalls(); return; }
  const ghost = !priv.alive;
  const sees = p => ghost || canSeeFrom(me, p, pub.lightsT);
  const spiked = new Set(priv.spiked || []);
  for (const b of pub.bowls) drawBowl(b, spiked.has('bowl' + b.id));
  for (const d of pub.drinks) if (d.holder === null) drawDrink(d, priv, spiked);
  for (const b of pub.bodies) if (sees(b)) drawBody(b, pub.chars[b.id]);
  const order = pub.chars.slice().sort((a, b) => a.y - b.y);
  for (const c of order) {
    const isMe = c.id === priv.me;
    if (!c.alive && !isMe) continue;
    if (!isMe && !sees(c)) continue;
    const pos = isMe ? me : c;
    drawChar(c, pos, isMe, t, priv);
    const held = pub.drinks.find(d => d.holder === c.id);
    if (held) { const look = isMe ? me.look : c.look; drawDrink({ ...held, x: pos.x + Math.cos(look + 0.9) * 16, y: pos.y + Math.sin(look + 0.9) * 16 }, priv, spiked); }
  }
  for (const f of pub.fx) if (sees(f)) drawFx(f);
  for (const f of pub.floats) if (ghost || dist(f, me) < CFG.viewRange) {
    ctx.font = 'bold 16px Georgia'; ctx.textAlign = 'center'; ctx.fillStyle = f.color; ctx.globalAlpha = Math.min(1, f.t);
    ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1;
  }
  drawWalls();
  drawChandeliers(t);
  if (!ghost) drawDark(me, pub.lightsT);
  if (priv.sniffT > 0) {
    ctx.setTransform(cam.z, 0, 0, cam.z, view.width / 2 - cam.x * cam.z, view.height / 2 - cam.y * cam.z);
    ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(me.x, me.y, 26, -Math.PI / 2, -Math.PI / 2 + (1 - priv.sniffT / 1.5) * Math.PI * 2); ctx.stroke();
  }
}

function drawProps(pub, priv, t) {
  for (const o of OBSTACLES) {
    if (o.kind === 'counter') {
      ctx.fillStyle = '#3a2214'; ctx.fillRect(20, 20, 500, 34);
      for (let x = 40; x < 500; x += 16) { ctx.fillStyle = ['#7a2a2a', '#2a6a3a', '#c8a050', '#5a3a8a', '#d9f0c8'][(x / 16) % 5]; ctx.fillRect(x, 26 + (x % 3) * 2, 9, 22); }
      ctx.fillStyle = '#6b4128'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.fillStyle = '#8a5835'; ctx.fillRect(o.x, o.y + o.h - 10, o.w, 10);
      ctx.fillStyle = '#e8c46a'; for (let x = 120; x <= 400; x += 70) { ctx.fillRect(x, 64, 8, 20); ctx.beginPath(); ctx.arc(x + 4, 64, 6, 0, 7); ctx.fill(); }
    }
    if (o.kind === 'bj') {
      ctx.fillStyle = '#5a3420'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y, o.w / 2 + 10, o.h + 10, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#1d5c3a'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y, o.w / 2, o.h, 0, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = 'rgba(232,196,106,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y, o.w / 2 - 22, o.h - 22, 0, 0, Math.PI); ctx.stroke();
      ctx.fillStyle = 'rgba(232,196,106,0.6)'; ctx.font = '11px Georgia'; ctx.textAlign = 'center'; ctx.fillText('BLACKJACK PAYS 3 TO 2', o.x + o.w / 2, o.y + 30);
      ctx.fillStyle = '#c0302a'; ctx.fillRect(o.x + o.w / 2 - 22, o.y + 4, 14, 20); ctx.fillStyle = '#f3ead8'; ctx.fillRect(o.x + o.w / 2 + 6, o.y + 4, 14, 20);
    }
    if (o.kind === 'roulette') {
      ctx.fillStyle = '#5a3420'; ctx.fillRect(o.x - 8, o.y - 8, o.w + 16, o.h + 16); ctx.fillStyle = '#1d5c3a'; ctx.fillRect(o.x, o.y, o.w, o.h);
      const cx = o.x + 50, cy = o.y + 50, spin = t * 0.8;
      for (let i = 0; i < 15; i++) { ctx.fillStyle = i === 0 ? '#2fae6a' : i % 2 ? '#c0302a' : '#111'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 40, i / 15 * 6.283 + spin, (i + 1) / 15 * 6.283 + spin); ctx.fill(); }
      ctx.fillStyle = '#8a5835'; ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + Math.cos(-spin * 1.7) * 33, cy + Math.sin(-spin * 1.7) * 33, 3, 0, 7); ctx.fill();
      for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#c0302a' : '#111'; ctx.fillRect(o.x + 104 + (i % 6) * 18, o.y + 20 + Math.floor(i / 6) * 32, 16, 28); }
    }
    if (o.kind === 'sinks') {
      ctx.fillStyle = '#c8d2d6'; ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#7f8f96'; for (let y = o.y + 30; y < o.y + o.h; y += 65) { ctx.beginPath(); ctx.ellipse(o.x + 20, y, 13, 18, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(190,230,255,0.25)'; ctx.fillRect(20, o.y, 8, o.h);
    }
    if (o.kind === 'slot') {
      ctx.fillStyle = '#5a1020'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.fillStyle = '#e8c46a'; ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, 6);
      ctx.fillStyle = '#111'; ctx.fillRect(o.x + 8, o.y + 14, o.w - 14, 24);
      const blink = Math.floor(t * 4 + o.y) % 3;
      ['#e8443a', '#e8c46a', '#3ddc97'].forEach((c, i) => { ctx.fillStyle = c; ctx.globalAlpha = i === blink ? 1 : 0.45; ctx.fillRect(o.x + 10 + i * 8, o.y + 18, 6, 16); });
      ctx.globalAlpha = 1; ctx.fillStyle = '#c0302a'; ctx.beginPath(); ctx.arc(o.x + o.w + 2, o.y + 12, 4, 0, 7); ctx.fill();
    }
    if (o.kind === 'coffee') {
      ctx.fillStyle = '#2a1410'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 1; ctx.strokeRect(o.x + 3, o.y + 3, o.w - 6, o.h - 6);
    }
  }
  ctx.fillStyle = 'rgba(232,196,106,0.75)'; ctx.font = '13px Georgia'; ctx.textAlign = 'center'; ctx.fillText('BAR', TAP.x, 128);
  // race screen
  ctx.fillStyle = '#0d1430'; ctx.fillRect(1330, 30, 400, 120); ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 2; ctx.strokeRect(1330, 30, 400, 120);
  const rt = t % 10, heat = Math.floor(t / 10);
  ['#e8443a', '#3ddc97', '#4a7dff', '#f4e04d'].forEach((col, i) => {
    const prog = clamp(rt / 8 * (0.8 + ((i * 37 + heat * 13) % 10) / 25), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(1345, 44 + i * 26, 370, 16);
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(1352 + prog * 356, 52 + i * 26, 10, 6, 0, 0, 7); ctx.fill();
  });
  // VIP TV and couches, plants
  ctx.fillStyle = '#0d1430'; ctx.fillRect(1440, 622, 180, 14); ctx.fillStyle = 'rgba(100,150,255,0.25)'; ctx.fillRect(1440, 636, 180, 30);
  ctx.fillStyle = '#5a2a5e'; ctx.fillRect(1350, 860, 120, 28); ctx.fillRect(1610, 860, 120, 28);
  for (const [px, py] of [[1300, 640], [1760, 640], [1300, 1160], [1760, 1160], [560, 40], [1240, 40]]) { ctx.fillStyle = '#2a5a2a'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(px + Math.cos(i) * 8, py + Math.sin(i) * 8, 10, 5, i, 0, 7); ctx.fill(); } }
  // neon sign on the floor's top wall
  ctx.font = 'bold 26px Georgia'; ctx.textAlign = 'center'; ctx.shadowColor = '#ff4f7a'; ctx.shadowBlur = 14 + Math.sin(t * 3) * 4; ctx.fillStyle = '#ffb3c6';
  ctx.fillText('LAST CALL', 900, 70); ctx.shadowBlur = 0;
  // bell
  ctx.fillStyle = '#6b4128'; ctx.beginPath(); ctx.arc(BELL.x, BELL.y, 22, 0, 7); ctx.fill();
  ctx.fillStyle = priv && priv.bellUsed ? '#6b5a3a' : '#e8c46a'; ctx.beginPath(); ctx.arc(BELL.x, BELL.y, 14, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(232,196,106,0.7)'; ctx.font = '12px Georgia'; ctx.fillText('PIT BELL', BELL.x, BELL.y + 38);
  // seats and drink rails
  const occ = pub ? pub.seatsOcc : [];
  for (const s of SEATS) {
    ctx.fillStyle = 'rgba(232,196,106,0.18)';
    if (s.game === 'slots') ctx.fillRect(s.drink.x - 4, s.drink.y - 14, 8, 28); else ctx.fillRect(s.drink.x - 14, s.drink.y - 4, 28, 8);
    if (occ[s.id] == null) { ctx.fillStyle = '#2a1b22'; ctx.beginPath(); ctx.arc(s.x, s.y, 13, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(232,196,106,0.35)'; ctx.lineWidth = 1; ctx.stroke(); }
  }
}
function drawWalls() {
  for (const w of WALLS) {
    ctx.fillStyle = '#120c10'; ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = 'rgba(232,196,106,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
  }
}
function drawChandeliers(t) {
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y] of [[900, 470], [900, 1040], [1530, 260], [270, 380]]) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, 160);
    g.addColorStop(0, `rgba(255,220,150,${0.16 + Math.sin(t * 1.3 + x) * 0.02})`); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 160, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawBowl(b, spiked) {
  ctx.fillStyle = '#d8d0c0'; ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, 7); ctx.fill();
  ctx.fillStyle = '#b8803a'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(b.x + Math.cos(i * 1.1) * 5, b.y + Math.sin(i * 1.1) * 5, 2.6, 0, 7); ctx.fill(); }
  if (spiked) { ctx.strokeStyle = '#7dff5a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x, b.y, 15, 0, 7); ctx.stroke(); }
}
function drawDrink(d, priv, spiked) {
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(d.x, d.y, 7, 0, 7); ctx.fill();
  ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(d.x, d.y, 5 * Math.max(0.3, d.sips / CFG.drinkSips), 0, 7); ctx.fill();
  if (spiked.has(d.id)) { ctx.strokeStyle = '#7dff5a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(d.x, d.y, 10, 0, 7); ctx.stroke(); }
  if (d.owner === priv.me) { ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(d.x, d.y, 9, 0, 7); ctx.stroke(); }
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 'rgb(' + ch.map(v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255)).join(',') + ')';
}
function drawHat(kind, x, y, look) {
  ctx.save(); ctx.translate(x, y);
  const dark = '#1a1116';
  switch (kind) {
    case 'tophat': ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill(); ctx.fillStyle = '#2d2228'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill(); ctx.strokeStyle = '#a03030'; ctx.lineWidth = 1.5; ctx.stroke(); break;
    case 'cowboy': ctx.fillStyle = '#6b4128'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 9, look, 0, 7); ctx.fill(); ctx.fillStyle = '#8a5835'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 5, look, 0, 7); ctx.fill(); break;
    case 'beret': ctx.fillStyle = '#c0302a'; ctx.beginPath(); ctx.ellipse(-1, -1, 8.5, 7.5, 0.4, 0, 7); ctx.fill(); ctx.fillStyle = '#7a1a1a'; ctx.beginPath(); ctx.arc(-1, -2, 1.6, 0, 7); ctx.fill(); break;
    case 'bowler': ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, 7); ctx.fill(); ctx.fillStyle = '#3a2e34'; ctx.beginPath(); ctx.arc(-1.5, -1.5, 5, 0, 7); ctx.fill(); break;
    case 'visor': ctx.fillStyle = '#3ddc97'; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(Math.cos(look) * 5, Math.sin(look) * 5, 8, look - 1.2, look + 1.2); ctx.lineTo(0, 0); ctx.fill(); ctx.globalAlpha = 1; break;
    case 'crown': ctx.fillStyle = '#e8c46a'; for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; ctx.beginPath(); ctx.arc(Math.cos(a) * 6, Math.sin(a) * 6, 2.6, 0, 7); ctx.fill(); } ctx.strokeStyle = '#e8c46a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.stroke(); break;
    case 'beanie': ctx.fillStyle = '#2a6a8a'; ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, 7); ctx.fill(); ctx.fillStyle = '#f3ead8'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill(); break;
    default: ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, 0, 12, 10, look, 0, 7); ctx.fill(); ctx.fillStyle = '#2d2228'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.fill(); ctx.strokeStyle = '#a03030'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, 7); ctx.stroke();
  }
  ctx.restore();
}
function drawChar(c, pos, isMe, t, priv) {
  const ghost = !c.alive;
  const look = isMe ? pos.look : c.look;
  const moving = isMe ? pos.moving : c.moving;
  const bob = moving ? Math.sin(t * 14 + c.id) * 1.6 : 0;
  const x = pos.x, y = pos.y + bob * 0.4;
  ctx.globalAlpha = ghost ? 0.4 : 1;
  const suit = c.pale ? shade(c.color, 0.45) : c.color;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 13, 16, 6, 0, 0, 7); ctx.fill();
  if (c.lucky) { ctx.strokeStyle = 'rgba(232,196,106,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 21 + Math.sin(t * 5) * 1.5, 0, 7); ctx.stroke(); }
  // shoulders turned toward the look direction
  ctx.save(); ctx.translate(x, y); ctx.rotate(look + Math.PI / 2);
  ctx.fillStyle = shade(suit, -0.25); ctx.beginPath(); ctx.ellipse(0, 2, 17, 10, 0, 0, 7); ctx.fill();
  ctx.fillStyle = suit; ctx.beginPath(); ctx.ellipse(0, 1, 15.5, 8.5, 0, 0, 7); ctx.fill();
  // arms swing while walking
  const sw = moving ? Math.sin(t * 14 + c.id) * 4 : 0;
  ctx.fillStyle = shade(suit, -0.15); ctx.beginPath(); ctx.arc(-15, 1 + sw, 4.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(15, 1 - sw, 4.2, 0, 7); ctx.fill();
  // lapels and tie on the front
  ctx.fillStyle = '#f3ead8'; ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(0, -1); ctx.lineTo(4, -7); ctx.fill();
  ctx.fillStyle = '#1a1116'; ctx.fillRect(-1, -6, 2, 5);
  ctx.restore();
  // head
  ctx.fillStyle = c.pale ? '#c8e8b0' : '#e8c0a0'; ctx.beginPath(); ctx.arc(x, y, 8.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#1a1116'; ctx.beginPath(); ctx.arc(x + Math.cos(look) * 6 + Math.cos(look + 1.57) * 2.5, y + Math.sin(look) * 6 + Math.sin(look + 1.57) * 2.5, 1.3, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x + Math.cos(look) * 6 - Math.cos(look + 1.57) * 2.5, y + Math.sin(look) * 6 - Math.sin(look + 1.57) * 2.5, 1.3, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(x - Math.cos(look) * 3.5, y - Math.sin(look) * 3.5); ctx.scale(0.78, 0.78); drawHat(c.hat, 0, 0, look); ctx.restore();
  ctx.fillStyle = '#d8a888'; ctx.beginPath(); ctx.arc(x + Math.cos(look) * 8.2, y + Math.sin(look) * 8.2, 2, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  if (c.pale && !ghost) { ctx.fillStyle = 'rgba(125,255,90,0.7)'; for (let i = 0; i < 3; i++) { const p = (t * 1.5 + i / 3) % 1; ctx.beginPath(); ctx.arc(x - 6 + i * 6, y - 18 - p * 16, 2.5 * (1 - p), 0, 7); ctx.fill(); } }
  ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(isMe ? 'You' : c.name, x + 1, y - 25);
  ctx.fillStyle = priv.killers && priv.killers.includes(c.id) && !isMe ? '#ff8a80' : '#f3ead8'; ctx.fillText(isMe ? 'You' : c.name, x, y - 26);
}
function drawBody(b, c) {
  ctx.fillStyle = b.cause === 'poison' ? 'rgba(125,255,90,0.22)' : 'rgba(150,0,0,0.55)';
  ctx.beginPath(); ctx.ellipse(b.x + 6, b.y + 6, 28, 15, 0.3, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(0.3);
  ctx.fillStyle = c.color; ctx.beginPath(); ctx.ellipse(0, 0, 19, 11, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#d8b090'; ctx.beginPath(); ctx.arc(-17, -2, 7, 0, 7); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.beginPath();
  for (const oy of [-4, 1]) { ctx.moveTo(-20, oy - 2); ctx.lineTo(-16, oy + 1); ctx.moveTo(-16, oy - 2); ctx.lineTo(-20, oy + 1); }
  ctx.stroke(); ctx.restore();
  drawHat(c.hat, b.x + 26, b.y - 14, 1);
}
function drawFx(f) {
  const a = clamp(f.t, 0, 1);
  if (f.kind === 'chips') {
    for (let i = 0; i < 6; i++) { const ang = i * 1.05, r = (1 - a) * 26; ctx.fillStyle = ['#e8c46a', '#e8443a', '#3ddc97'][i % 3]; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(f.x + Math.cos(ang) * r, f.y - 10 + Math.sin(ang) * r - (1 - a) * 10, 4, 0, 7); ctx.fill(); }
  } else if (f.kind === 'bubbles') {
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#7dff5a'; ctx.globalAlpha = a * 0.7; ctx.beginPath(); ctx.arc(f.x - 10 + i * 5, f.y - (1.5 - f.t) * 30 - i * 4, 3, 0, 7); ctx.fill(); }
  } else if (f.kind === 'splat') {
    ctx.fillStyle = '#b00'; ctx.globalAlpha = a; for (let i = 0; i < 7; i++) { const ang = i * 0.9; ctx.beginPath(); ctx.arc(f.x + Math.cos(ang) * (1.5 - f.t) * 24, f.y + Math.sin(ang) * (1.5 - f.t) * 24, 3, 0, 7); ctx.fill(); }
  } else if (f.kind === 'crumbs') {
    ctx.fillStyle = '#b8803a'; ctx.globalAlpha = a; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(f.x + Math.cos(i * 1.3) * (1 - a) * 18, f.y + Math.sin(i * 1.3) * (1 - a) * 18, 2, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}
function drawDark(me, lightsT) {
  const r = lightsT > 0 ? CFG.darkRange : CFG.viewRange;
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, dark.width, dark.height);
  dctx.fillStyle = lightsT > 0 ? 'rgba(2,1,4,0.96)' : 'rgba(6,3,8,0.76)';
  dctx.fillRect(0, 0, dark.width, dark.height);
  dctx.setTransform(cam.z, 0, 0, cam.z, dark.width / 2 - cam.x * cam.z, dark.height / 2 - cam.y * cam.z);
  dctx.globalCompositeOperation = 'destination-out';
  const g = dctx.createRadialGradient(me.x, me.y, 10, me.x, me.y, r);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.8, 'rgba(0,0,0,0.92)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  dctx.fillStyle = g; dctx.beginPath(); dctx.moveTo(me.x, me.y); dctx.arc(me.x, me.y, r, me.look - CFG.coneHalf, me.look + CFG.coneHalf); dctx.closePath(); dctx.fill();
  dctx.beginPath(); dctx.arc(me.x, me.y, CFG.nearSense + 18, 0, 7); dctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(dark, 0, 0);
}
