// The hands-on parts of the station you sit at: a chip tray, a keypad with its display, the rail buttons (CLEAR, ½,
// ×2, MAX), big game buttons, betting spots, the roulette and dice layouts on the felt, chips stacked where you bet,
// the slot lever, the Crash plunger, the wheel handle and the touch screens. Only your own station gets them; every
// part carries userData.part (or a uv mapper) that main.js raycasts and src/tables.js understands.
import * as THREE from 'three';
import * as T from './textures.js';
import * as Gm from '../games.js';
import { CHIPS, chipLabel, RAIL, RAIL_LABEL, KEYS, CRASH_AUTOS } from '../tables.js';
import { MAT, v3, rbox, cyl, yawOf } from './world.js';
import { RL_TABLE, DICE_TABLE, BJ_TABLES } from '../map.js';
import { paintUI } from '../paint.js';

const M = 1 / 60;
const ARC = s => `900 ${Math.round(s)}px "Arial Black", Impact, system-ui, sans-serif`;
export const CHIP_COL = ['#ece6da', '#c8302a', '#202024', '#6a2ac0', '#e8a830', '#22b066'];
const CHIP_INK = ['#3a3030', '#fff', '#ffd040', '#fff', '#3a1a04', '#fff'];
const RED = Gm.RL_RED;

// ---------- Felt layouts (metres from the felt's top-left corner, as a player on the south side sees it) ----------
export const RL_FELT = { w: (RL_TABLE.w - 110) * M, d: RL_TABLE.h * M - 0.05 };
const RX = 0.14, ZW = 0.22, CW = 0.19, RY = 0.42, RH = 0.3, DH = 0.22, EH = 0.22, NX = RX + ZW, CX = NX + 12 * CW;
export const RL_CELLS = (() => {
  const c = [{ id: 'n0', x: RX, y: RY, w: ZW, h: RH * 3 }];
  for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) c.push({ id: 'n' + (col * 3 + 3 - row), x: NX + col * CW, y: RY + row * RH, w: CW, h: RH });
  ['c3', 'c2', 'c1'].forEach((id, row) => c.push({ id, x: CX, y: RY + row * RH, w: 0.2, h: RH }));
  ['d1', 'd2', 'd3'].forEach((id, k) => c.push({ id, x: NX + k * 4 * CW, y: RY + 3 * RH, w: 4 * CW, h: DH }));
  ['low', 'even', 'red', 'black', 'odd', 'high'].forEach((id, k) => c.push({ id, x: NX + k * 2 * CW, y: RY + 3 * RH + DH, w: 2 * CW, h: EH }));
  return c;
})();
const RL_LABELS = { d1: '1st 12', d2: '2nd 12', d3: '3rd 12', low: '1-18', even: 'EVEN', odd: 'ODD', high: '19-36', c1: '2 to 1', c2: '2 to 1', c3: '2 to 1' };
let rlTex = null;
export function rouletteLayoutTex() {
  if (rlTex) return rlTex;
  const P = 512, W = Math.round(RL_FELT.w * P), H = Math.round(RL_FELT.d * P), [c, g] = T.canvas(W, H);
  feltBase(g, W, H, '#17643c');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const cl of RL_CELLS) {
    const x = cl.x * P, y = cl.y * P, w = cl.w * P, h = cl.h * P, cx = x + w / 2, cy = y + h / 2;
    if (cl.id[0] === 'n') {
      const n = +cl.id.slice(1);
      g.fillStyle = n === 0 ? '#1f9a5a' : RED.has(n) ? '#b8282a' : '#161616';
      g.beginPath(); g.roundRect(x + 7, y + 7, w - 14, h - 14, 10); g.fill();
      g.fillStyle = '#fff'; g.font = ARC(n === 0 ? 74 : 50); g.fillText(String(n), cx, cy + 2);
    } else if (cl.id === 'red' || cl.id === 'black') {
      g.fillStyle = cl.id === 'red' ? '#c0302a' : '#111'; g.strokeStyle = '#e8c46a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy - h * 0.36); g.lineTo(cx + w * 0.3, cy); g.lineTo(cx, cy + h * 0.36); g.lineTo(cx - w * 0.3, cy); g.closePath(); g.fill(); g.stroke();
    } else { g.fillStyle = '#f3e6c0'; g.font = ARC(cl.id[0] === 'c' ? 30 : 40); g.fillText(RL_LABELS[cl.id], cx, cy + 2); }
    g.strokeStyle = '#e8c46a'; g.lineWidth = 5; g.strokeRect(x, y, w, h);
  }
  g.fillStyle = '#ffd040'; g.font = `bold italic 50px Georgia, serif`; g.fillText('LUCKY NUMBERS PAY UP TO 500x', (NX + 6 * CW) * P, 0.2 * P);
  g.fillStyle = 'rgba(243,230,192,0.8)'; g.font = `italic 30px Georgia, serif`; g.fillText('Zero gives outside bets back · Columns and dozens pay 3x', (NX + 6 * CW) * P, 0.32 * P);
  rlTex = T.tex(c, false); rlTex.center.set(0.5, 0.5);
  return rlTex;
}
// Street dice: the point boxes down the middle, a FIELD and a PASS LINE on each long side (the far one upside down).
export const DICE_FELT = { w: DICE_TABLE.w * M - 0.36, d: DICE_TABLE.h * M - 0.36 };
const DF = DICE_FELT, PB = 0.52, PX0 = (DF.w - 6 * PB) / 2, MID = { y: DF.d / 2 - 0.19, h: 0.38 };
export const DICE_RECTS = [
  { id: 'field', side: 1, x: 0.45, y: 1.29, w: DF.w - 0.9, h: 0.3 }, { id: 'pass', side: 1, x: 0.18, y: 1.63, w: DF.w - 0.36, h: 0.3 },
  { id: 'field', side: -1, x: 0.45, y: DF.d - 1.29 - 0.3, w: DF.w - 0.9, h: 0.3 }, { id: 'pass', side: -1, x: 0.18, y: DF.d - 1.63 - 0.3, w: DF.w - 0.36, h: 0.3 },
];
export const DICE_POINTS = [4, 5, 6, 8, 9, 10].map((n, i) => ({ n, x: PX0 + i * PB, y: MID.y, w: PB, h: MID.h }));
let diceTex = null;
export function diceLayoutTex() {
  if (diceTex) return diceTex;
  const P = 300, W = Math.round(DF.w * P), H = Math.round(DF.d * P), [c, g] = T.canvas(W, H);
  feltBase(g, W, H, '#1a5a8a');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeStyle = '#fff'; g.lineWidth = 4;
  for (const p of DICE_POINTS) { g.strokeRect(p.x * P, p.y * P, p.w * P, p.h * P); g.fillStyle = '#fff'; g.font = ARC(56); g.fillText(p.n === 6 ? 'SIX' : p.n === 9 ? 'NINE' : String(p.n), (p.x + p.w / 2) * P, (p.y + p.h / 2) * P); }
  for (const half of [1, -1]) {
    g.save(); if (half < 0) { g.translate(W, H); g.rotate(Math.PI); }
    const f = DICE_RECTS[0], ps = DICE_RECTS[1];
    g.strokeStyle = '#fff'; g.lineWidth = 5;
    g.strokeRect(f.x * P, f.y * P, f.w * P, f.h * P); g.strokeRect(ps.x * P, ps.y * P, ps.w * P, ps.h * P);
    g.fillStyle = '#fff'; g.font = ARC(38); g.fillText('FIELD', (f.x + 0.5) * P, (f.y + f.h / 2) * P);
    g.font = `bold 40px Georgia, serif`; g.fillText('2  ·  3  ·  4  ·  9  ·  10  ·  11  ·  12', (f.x + f.w / 2) * P, (f.y + f.h / 2) * P);
    g.fillStyle = '#ffd040'; g.font = `bold italic 26px Georgia, serif`; g.fillText('2 and 12 pay 5x', (f.x + f.w - 0.5) * P, (f.y + f.h / 2) * P);
    g.fillStyle = '#fff'; g.font = ARC(60); g.fillText('PASS LINE', (ps.x + ps.w / 2) * P, (ps.y + ps.h / 2) * P);
    g.fillStyle = '#ffd040'; g.font = `bold italic 26px Georgia, serif`; g.fillText('12 WINS ON THE COME-OUT · 2x', (ps.x + ps.w / 2) * P, (ps.y + ps.h + 0.07) * P);
    g.restore();
  }
  diceTex = T.tex(c, false); diceTex.center.set(0.5, 0.5);
  return diceTex;
}
function feltBase(g, W, H, col) {
  g.fillStyle = col; g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W * 0.5, H * 0.5, 40, W * 0.5, H * 0.5, W * 0.7); rg.addColorStop(0, 'rgba(255,255,255,0.1)'); rg.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  let s = 7; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < W * H / 120; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.06})`; g.fillRect(r() * W, r() * H, 2, 2); }
}

// ---------- Painted bits ----------
function label(text, w, d, { ink = '#1a1014', bg = null, size = 0.55, sub = '' } = {}) {
  const W = 256, H = Math.max(32, Math.round(256 * d / w)), [c, g] = T.canvas(W, H);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
  let fs = H * size; g.font = ARC(fs); while (g.measureText(text).width > W * 0.88 && fs > 8) { fs *= 0.9; g.font = ARC(fs); }
  g.fillText(text, W / 2, sub ? H * 0.4 : H / 2 + fs * 0.04);
  if (sub) { g.font = ARC(H * 0.2); g.globalAlpha = 0.8; g.fillText(sub, W / 2, H * 0.78); g.globalAlpha = 1; }
  return T.tex(c, false);
}
function chipTop(i) {
  const [c, g] = T.canvas(128, 128), col = CHIP_COL[i];
  g.fillStyle = col; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.92)';
  for (let k = 0; k < 8; k++) { g.save(); g.translate(64, 64); g.rotate(k * Math.PI / 4); g.fillRect(-9, -63, 18, 17); g.restore(); }
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 40, 0, 7); g.stroke();
  g.fillStyle = CHIP_INK[i]; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = ARC(i >= 4 ? 30 : 34); g.fillText(chipLabel(CHIPS[i]), 64, 67);
  return T.tex(c, false);
}
// One grey stripe mask for the stacked chips; the instance colour fills the rest (see stackMat).
function stripes(side) {
  const [c, g] = T.canvas(128, side ? 16 : 128);
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, c.height); g.fillStyle = '#fff';
  if (side) for (let k = 0; k < 8; k++) g.fillRect(k * 16 + 4, 0, 7, 16);
  else { for (let k = 0; k < 8; k++) { g.save(); g.translate(64, 64); g.rotate(k * Math.PI / 4); g.fillRect(-8, -63, 16, 15); g.restore(); } g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 38, 0, 7); g.stroke(); }
  const t = T.tex(c, false); t.colorSpace = THREE.NoColorSpace; return t;
}
function stackMat(mask) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42 });
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = sh => {
    sh.uniforms.uStripe = { value: mask };
    sh.fragmentShader = 'uniform sampler2D uStripe;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.9, 0.85), texture2D(uStripe, vUv).r);');
  };
  m.customProgramCacheKey = () => 'chipStack' + mask.uuid;
  return m;
}
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
function liveLabel(w, h, paint) { const lc = T.liveCanvas(w, h, paint); lc.key = ''; return lc; }

// Where each game's parts sit, in the seat's frame: [ahead, right, height, tilt]. The kit is the chip tray, keypad,
// rail and game buttons on one slab.
const AT = {
  bj: { kit: [0.72, 0, 0.885, 0.05] },
  roulette: { kit: [0.47, 0, 0.885, 0.1] },
  dice: { kit: [0.5, 0, 0.99, 0.1] },
  plinko: { kit: [0.97, 0, 0.84, 0.1], pad: [1.3, -0.5, 0.805], scr: [1.24, 0, 1.04, 0.4] },
  mines: { kit: [0.6, 0, 0.9, 0.1], pad: [0.9, 0, 0.952] },
  tower: { kit: [0.6, 0, 0.9, 0.1], pad: [0.9, 0, 0.952] },
  crash: { kit: [0.5, 0, 0.95, 0.12], pad: [0.8, -0.17, 1.012], plunger: [0.8, 0.17, 1.012], autos: [1.0, 0, 1.012] },
  race: { kit: [0.4, 0, 0.86, 0.1], lanes: [0.82, 0, 0.893] },
  coin: { kit: [0.56, 0, 0.925, 0.06], heads: [0.88, -0.17, 0.925], tails: [0.88, 0.17, 0.925] },
  wheel: { kit: [0.46, 0, 0.92, 0.1], pad: [0.8, -0.14, 0.952], handle: [0.86, 0.17, 0.952] },
  slots: { bar: [0.64, 0, 1.08, 0.5] },
};
// The big buttons in the kit's front row: [id, label, colour]
const GAME_BTNS = {
  bj: [['deal', 'DEAL', 0xe8b440], ['hit', 'HIT', 0x2ac070], ['stand', 'STAND', 0xd83a3a], ['double', 'DOUBLE', 0x3a7ae8], ['split', 'SPLIT', 0xa04ae8]],
  roulette: [['spin', 'SPIN', 0xe8b440]], dice: [['roll', 'ROLL', 0xe8b440]], plinko: [['drop', 'DROP', 0xff3fa4]],
  mines: [['start', 'START', 0x2ac070], ['cash', 'CASH OUT', 0xe8b440]], tower: [['start', 'CLIMB', 0x2ac070], ['cash', 'CASH OUT', 0xe8b440]],
  crash: [['bet', 'BET', 0x2ac070]], race: [['bet', 'BET', 0x2ac070]], coin: [['flip', 'FLIP', 0xe8b440], ['take', 'TAKE', 0x2ac070]], wheel: [['spin', 'SPIN', 0xe8b440]],
};
export const SCALE = { desk: 0.86, touch: 1.15 }; // the kit's size: smaller with a mouse, bigger for thumbs
export const LANE = { w: 0.98, d: 0.36 }; // the duck-race desk card

// ctx.seatScreens: seat id -> the console screen mesh (Mines, Dragon Tower); ctx.slotLevers: seat id -> lever pivot;
// ctx.lanePlates: seat id -> the duck-race desk card; ctx.deco: seat id -> meshes to hide while you sit there.
export function buildRig(ctx, seats, felts) {
  const root = new THREE.Group(); ctx.group.add(root);
  const parts = [];      // what the crosshair can hit this frame
  const hit = [];        // [mesh, id] for every part mesh, filled per station
  let cur = null;        // { seat, game, frame }

  // ----- a button: a lit rounded body and a painted cap -----
  function button(id, text, w, d, color, { h = 0.028, ink = '#1a1014', size = 0.55, sub = '' } = {}) {
    const g = new THREE.Group(), base = new THREE.Color(color);
    const glow = base.r * 0.3 + base.g * 0.55 + base.b * 0.15 > 0.6 ? 0.06 : 0.38; // pale keys would bloom white
    const bodyMat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.32, metalness: 0.05, emissive: base.clone(), emissiveIntensity: glow });
    const body = new THREE.Mesh(rbox(w, h, d, Math.min(0.012, w / 4)), bodyMat); body.position.y = h / 2; g.add(body);
    const capMat = new THREE.MeshBasicMaterial({ map: label(text, w, d, { ink, size, sub }), transparent: true, depthWrite: false });
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, d * 0.9), capMat); cap.rotation.x = -Math.PI / 2; cap.position.y = h + 0.0012; g.add(cap);
    body.castShadow = true;
    g.userData = { id, body, bodyMat, capMat, base, glow };
    body.userData.part = cap.userData.part = id;
    return g;
  }
  function light(b, on, hover, sel) {
    const u = b.userData;
    u.bodyMat.color.copy(u.base).multiplyScalar(on ? 1 : 0.28);
    u.bodyMat.emissiveIntensity = on ? (sel ? 1.1 : u.glow) + (hover ? 0.3 + u.glow : 0) : hover ? 0.1 : 0.02;
    u.capMat.opacity = on ? 1 : 0.4;
  }

  // ----- the kit: slab, keypad and display, chips, rail buttons; game buttons per game -----
  const kit = new THREE.Group(); root.add(kit);
  kit.add(at(new THREE.Mesh(rbox(0.88, 0.024, 0.36, 0.012), MAT.blackGloss), -0.014, -0.012, -0.024));
  kit.add(at(new THREE.Mesh(rbox(0.9, 0.012, 0.38, 0.006), MAT.gold), -0.014, -0.022, -0.024));
  // 7 8 9 C / 4 5 6 OK / 1 2 3 OK / 0 000 OK: [column, row, columns wide, rows tall]
  const KP = 0.066, KX = -0.395, KZ = -0.075, keys = [];
  const KPOS = { 7: [0, 0], 8: [1, 0], 9: [2, 0], C: [3, 0], 4: [0, 1], 5: [1, 1], 6: [2, 1], OK: [3, 1, 1, 3], 1: [0, 2], 2: [1, 2], 3: [2, 2], 0: [0, 3], '000': [1, 3, 2, 1] };
  KEYS.forEach(k => {
    const [c, r, cw = 1, rh = 1] = KPOS[k], w = KP * cw - 0.008, d = KP * rh - 0.008, x = KX + (c + (cw - 1) / 2) * KP, z = KZ + (r + (rh - 1) / 2) * KP;
    const b = button('key:' + k, k, w, d, k === 'OK' ? 0x2ac070 : k === 'C' ? 0xd83a3a : 0xe8e0cc, { size: k.length > 1 ? 0.42 : 0.6, h: 0.022 });
    b.position.set(x, 0, z); kit.add(b); keys.push(b);
  });
  const disp = liveLabel(256, 56, (g, w, h, t, s) => {
    g.fillStyle = '#0a1408'; g.fillRect(0, 0, w, h); g.fillStyle = s.typing ? '#ffe070' : '#7dff8a';
    g.font = ARC(34); g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(s.text, w - 10, h / 2 + 2);
    g.font = ARC(13); g.textAlign = 'left'; g.fillStyle = 'rgba(125,255,138,0.6)'; g.fillText(s.typing ? 'TYPE · OK' : 'BET', 8, 14);
  });
  const dispMesh = new THREE.Mesh(new THREE.PlaneGeometry(KP * 4 - 0.008, 0.052), new THREE.MeshBasicMaterial({ map: disp.tex, toneMapped: false }));
  dispMesh.rotation.x = -Math.PI / 2; dispMesh.position.set(KX + 1.5 * KP, 0.004, KZ - 0.068); kit.add(dispMesh);
  // chips: little stacks of three, the top one painted with its value
  const chipGeo = cyl(0.034, 0.034, 0.013, 28), chipBtns = [];
  CHIPS.forEach((v, i) => {
    const g = new THREE.Group(), col = new THREE.Color(CHIP_COL[i]);
    const side = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, emissive: col.clone(), emissiveIntensity: 0 }), top = new THREE.MeshStandardMaterial({ map: chipTop(i), roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0 });
    for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(chipGeo, [side, top, side]); m.position.y = 0.0065 + k * 0.0135; m.castShadow = true; m.userData.part = 'chip:' + v; g.add(m); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.004, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffe080, toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.002; g.add(ring);
    g.position.set(-0.06 + i * 0.083, 0, -0.125); kit.add(g);
    g.userData = { id: 'chip:' + v, v, side, top, ring };
    chipBtns.push(g);
  });
  const rails = RAIL.map((k, i) => { const b = button('rail:' + k, RAIL_LABEL[k], 0.112, 0.064, k === 'clear' ? 0xc8c0b0 : 0x8a7aa8, { size: k === 'clear' ? 0.4 : 0.62 }); b.position.set(-0.0375 + i * 0.125, 0, -0.033); kit.add(b); return b; });
  const gameRows = {};
  function gameRow(game) {
    if (gameRows[game]) return gameRows[game];
    const list = GAME_BTNS[game] || [], n = list.length, g = new THREE.Group(), w = 0.5 / Math.max(1, n);
    const btns = list.map(([id, text, col], i) => { const b = button('btn:' + id, text, w - 0.012, 0.094, col, { size: n > 3 ? 0.36 : 0.5, h: 0.032 }); b.position.set(-0.1 + (i + 0.5) * w, 0, 0.078); g.add(b); return b; });
    g.userData.btns = btns; kit.add(g);
    return (gameRows[game] = g);
  }

  // ----- betting spots that are meshes: a disc with a gold ring (a blackjack circle, a machine's BET pad, heads/tails) -----
  function padTex(text, ring = '#e8c46a', fill = 'rgba(0,0,0,0.25)') {
    const [c, g] = T.canvas(256, 256);
    g.fillStyle = fill; g.beginPath(); g.arc(128, 128, 122, 0, 7); g.fill();
    g.strokeStyle = ring; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 116, 0, 7); g.stroke();
    g.setLineDash([14, 10]); g.lineWidth = 4; g.beginPath(); g.arc(128, 128, 96, 0, 7); g.stroke();
    g.fillStyle = ring; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = ARC(text.length > 4 ? 40 : 54); g.fillText(text, 128, 132);
    return T.tex(c, false);
  }
  function pad(id, text, r = 0.075, ring) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ map: padTex(text, ring), transparent: true, depthWrite: false, color: 0xffffff }));
    m.rotation.x = -Math.PI / 2; m.userData.part = 'spot:' + id; m.userData.r = r; root.add(m); m.visible = false;
    return m;
  }
  const pads = { main: pad('main', 'BET'), circle: pad('main', '', 0.13), heads: pad('heads', 'HEADS', 0.12, '#ffd040'), tails: pad('tails', 'TAILS', 0.12, '#ffd040') };
  pads.circle.material.color.setRGB(1, 1, 1);

  // ----- Crash: the plunger and the auto cash-out row; the wheel handle; the slot bar; the Plinko touch screen -----
  const plunger = new THREE.Group(); root.add(plunger);
  { const base = new THREE.Mesh(cyl(0.07, 0.08, 0.04, 24), MAT.chrome); base.position.y = 0.02; plunger.add(base);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0202a, emissive: 0xff2030, emissiveIntensity: 0.6, roughness: 0.25 }));
    cap.scale.y = 0.6; cap.position.y = 0.05; plunger.add(cap);
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ map: label('CASH OUT', 0.16, 0.05, { ink: '#fff', bg: '#5a0a10', size: 0.6 }) }));
    lb.rotation.x = -Math.PI / 2; lb.position.set(0, 0.002, 0.11); plunger.add(lb);
    base.userData.part = cap.userData.part = lb.userData.part = 'btn:cash';
    plunger.userData = { cap, capMat: cap.material }; }
  const autos = new THREE.Group(); root.add(autos);
  const autoBtns = CRASH_AUTOS.map((a, i) => { const b = button('btn:auto:' + a, a ? a + 'x' : 'OFF', 0.074, 0.06, 0x3fe0ff, { size: 0.5 }); b.position.set((i - 3) * 0.085, 0, 0); autos.add(b); return b; });
  const autoTitle = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.035), new THREE.MeshBasicMaterial({ map: label('AUTO CASH-OUT', 0.4, 0.035, { ink: '#3fe0ff', size: 0.75 }), transparent: true, depthWrite: false }));
  autoTitle.rotation.x = -Math.PI / 2; autoTitle.position.set(0, 0.002, 0.058); autos.add(autoTitle);
  const handle = new THREE.Group(); root.add(handle);
  { const base = new THREE.Mesh(rbox(0.1, 0.05, 0.1, 0.02), MAT.gold); base.position.y = 0.025; handle.add(base);
    const arm = new THREE.Group(); arm.position.y = 0.05; handle.add(arm);
    const stick = new THREE.Mesh(cyl(0.012, 0.012, 0.26, 10), MAT.chrome); stick.position.y = 0.13; arm.add(stick);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 12), new THREE.MeshStandardMaterial({ color: 0xffd040, emissive: 0xffa020, emissiveIntensity: 0.5, roughness: 0.3 })); knob.position.y = 0.27; arm.add(knob);
    base.userData.part = stick.userData.part = knob.userData.part = 'btn:spin';
    handle.userData = { arm, knob }; }
  const slotBar = new THREE.Group(); root.add(slotBar);
  const slotBtns = [['betdn', 'BET −', 0xe8e0cc], ['betup', 'BET +', 0xe8e0cc], ['maxbet', 'MAX BET', 0xe8b440], ['auto', 'AUTO', 0x3fe0ff]].map(([id, t, c], i) => {
    const b = button('btn:' + id, t, 0.13, 0.085, c, { size: 0.42, h: 0.03 }); b.position.set((i - 1.5) * 0.145, 0, 0); slotBar.add(b); return b; });
  slotBar.add(at(new THREE.Mesh(rbox(0.62, 0.02, 0.12, 0.01), MAT.blackGloss), 0, -0.01, 0));
  const plScr = liveLabel(512, 248, (g, w, h, t, my) => {
    const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, '#0a1a3a'); lg.addColorStop(1, '#020610'); g.fillStyle = lg; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#9fd0ff'; g.font = ARC(h * 0.11); g.fillText('PICK YOUR RISK', w / 2, h * 0.14);
    if (my.ui) paintUI(g, w, h, my.ui, '#ff3fa4');
    const x = my.extra || {}; g.fillStyle = '#ffd040'; g.font = ARC(h * 0.09);
    g.fillText('EDGES PAY ' + Gm.PLINKO[x.risk || 'medium'][0] + 'x', w / 2, h * 0.81);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = ARC(h * 0.075); g.fillText((x.hist || []).join('  '), w / 2, h * 0.93);
  });
  const plScrMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.26), new THREE.MeshBasicMaterial({ map: plScr.tex, toneMapped: false }));
  plScrMesh.userData.scr = true; root.add(plScrMesh);

  // ----- chip stacks: one instanced mesh for every chip on the table -----
  const MAXC = 900, sGeo = cyl(0.026, 0.026, 0.0085, 24);
  const stackMesh = new THREE.InstancedMesh(sGeo, [stackMat(stripes(true)), stackMat(stripes(false)), stackMat(stripes(false))], MAXC);
  stackMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stackMesh.count = 0; stackMesh.castShadow = true; stackMesh.frustumCulled = false;
  const chipCols = CHIP_COL.map(c => new THREE.Color(c));
  for (let i = 0; i < MAXC; i++) stackMesh.setColorAt(i, chipCols[0]);
  root.add(stackMesh);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = v3(1, 1, 1), pp = v3(0, 0, 0);
  function chipsFor(a) { const out = []; for (let i = CHIPS.length - 1; i >= 0 && out.length < 18; i--) { let n = Math.floor(a / CHIPS[i] + 1e-9); a -= n * CHIPS[i]; while (n-- > 0 && out.length < 18) out.push(i); } return out.length ? out : [0]; }

  // ----- felt highlight, roulette lucky markers, the dolly, the dice puck -----
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hlMat); hl.rotation.order = 'YXZ'; hl.visible = false; root.add(hl);
  const luckyMarks = [0, 1, 2].map(() => {
    const lc = liveLabel(128, 64, (g, w, h, t, x) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(255,208,64,0.92)'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 14); g.fill(); g.fillStyle = '#2a1404'; g.font = ARC(34); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(x + 'x', w / 2, h / 2 + 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.085), new THREE.MeshBasicMaterial({ map: lc.tex, transparent: true, depthWrite: false, toneMapped: false })); m.rotation.order = 'YXZ'; m.visible = false; root.add(m);
    m.userData.lc = lc; return m;
  });
  const dolly = new THREE.Mesh(cyl(0.03, 0.04, 0.07, 20), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.6, thickness: 0.04, emissive: 0xffe0a0, emissiveIntensity: 0.4 })); dolly.visible = false; root.add(dolly);
  const puckTex = on => { const [c, g] = T.canvas(128, 128); g.fillStyle = on ? '#fff' : '#151515'; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill(); g.fillStyle = on ? '#151515' : '#fff'; g.font = ARC(40); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(on ? 'ON' : 'OFF', 64, 68); return T.tex(c, false); };
  const puckOn = new THREE.MeshStandardMaterial({ map: puckTex(true), roughness: 0.3 }), puckOff = new THREE.MeshStandardMaterial({ map: puckTex(false), roughness: 0.3 });
  const puck = new THREE.Mesh(cyl(0.07, 0.07, 0.025, 28), [MAT.black, puckOn, MAT.black]); puck.castShadow = true; puck.visible = false; root.add(puck);

  // ----- the station frame -----
  function frameOf(seat) {
    const f = v3(Math.cos(seat.face), 0, Math.sin(seat.face)), r = v3(-f.z, 0, f.x), o = v3(seat.x * M, 0, seat.y * M);
    return { f, r, o, yaw: yawOf(seat.face + Math.PI), at: (d, l, y) => o.clone().addScaledVector(f, d).addScaledVector(r, l).setY(y) };
  }
  const place = (obj, F, a, scale = 1) => { obj.position.copy(F.at(a[0], a[1], a[2])); obj.rotation.set(a[3] || 0, F.yaw, 0, 'YXZ'); obj.scale.setScalar(scale); obj.visible = true; };
  // felt maths: layout metres <-> uv <-> world. flip: the roulette felt turned for the north side.
  const rl = felts.roulette, dc = felts.dice;
  const feltWorld = (fm, W, D, lx, ly, flip) => { let u = lx / W, v = 1 - ly / D; if (flip) { u = 1 - u; v = 1 - v; } return v3(fm.position.x + (u - 0.5) * W, fm.position.y, fm.position.z - (v - 0.5) * D); };
  const feltLayout = (W, D, uv, flip) => { let u = uv.x, v = uv.y; if (flip) { u = 1 - u; v = 1 - v; } return { x: u * W, y: (1 - v) * D }; };
  const inR = (p, c) => p.x >= c.x && p.x < c.x + c.w && p.y >= c.y && p.y < c.y + c.h;
  let rlFlip = false, dcFlip = false;
  rl.userData.uvPart = uv => { const p = feltLayout(RL_FELT.w, RL_FELT.d, uv, rlFlip), c = RL_CELLS.find(c => inR(p, c)); return c ? 'spot:' + c.id : null; };
  dc.userData.uvPart = uv => { const p = feltLayout(DF.w, DF.d, uv, dcFlip), c = DICE_RECTS.find(c => inR(p, c)); return c ? 'spot:' + c.id : null; };
  // a felt rect -> { center, w, d } for the hover glow
  const rlRect = c => ({ p: feltWorld(rl, RL_FELT.w, RL_FELT.d, c.x + c.w / 2, c.y + c.h / 2, rlFlip), w: c.w, d: c.h });
  const dcRect = c => ({ p: feltWorld(dc, DF.w, DF.d, c.x + c.w / 2, c.y + c.h / 2, dcFlip), w: c.w, d: c.h });

  // Where a spot's chips sit (top of the surface).
  function spotPos(spot) {
    const g = cur.game, F = cur.F;
    if (g === 'roulette') { const c = RL_CELLS.find(c => c.id === spot); return c ? feltWorld(rl, RL_FELT.w, RL_FELT.d, c.x + c.w / 2, c.y + c.h / 2, rlFlip).setY(0.887) : null; }
    if (g === 'dice') {
      const c = DICE_RECTS.find(c => c.id === spot && c.side === 1); if (!c) return null; // your own half (the felt turns for the north side)
      const p = feltWorld(dc, DF.w, DF.d, c.x + c.w / 2, c.y + c.h / 2, dcFlip); p.x = Math.max(dc.position.x - DF.w / 2 + c.x + 0.25, Math.min(dc.position.x - DF.w / 2 + c.x + c.w - 0.25, F.o.x)); return p.setY(0.892);
    }
    if (g === 'race') { const i = +spot.slice(4); if (!(i >= 0)) return null; return cur.lanes.localToWorld(v3(((i + 0.5) / 6 - 0.5) * LANE.w, 0, 0.002)); }
    if (g === 'coin') return (spot === 'heads' ? pads.heads : pads.tails).position.clone();
    const p = g === 'bj' ? pads.circle : pads.main; return p.visible ? p.position.clone() : null;
  }

  // Set up the parts for the seat I just sat at.
  function setup(my) {
    const seat = seats[my.seat], F = frameOf(seat), A = AT[my.game] || {}, sc = document.body.classList.contains('touch') ? SCALE.touch : SCALE.desk;
    cur = { seat: my.seat, game: my.game, F, A, lanes: null, scr: null, lever: null };
    root.visible = true;
    for (const o of [kit, plunger, autos, handle, slotBar, plScrMesh, ...Object.values(pads)]) o.visible = false;
    for (const g in gameRows) gameRows[g].visible = false;
    hit.length = 0;
    const addHits = (obj) => obj.traverse(m => { if (m.isMesh && (m.userData.part || m.userData.uvPart || m.userData.scr)) hit.push(m); });
    if (A.kit) {
      place(kit, F, A.kit, sc);
      for (const b of keys) addHits(b); for (const c of chipBtns) addHits(c); for (const b of rails) addHits(b);
      const row = gameRow(my.game); row.visible = true; addHits(row);
    }
    if (my.game === 'bj') { // the painted box in front of the seat is the betting circle
      const tb = BJ_TABLES[seat.table], a = Math.atan2((seat.y - tb.y) / 152, (seat.x - tb.x) / 168);
      pads.circle.position.set(tb.x * M + Math.cos(a) * 1.68, 0.878, tb.y * M + Math.sin(a) * 1.305); pads.circle.rotation.set(-Math.PI / 2, F.yaw, 0, 'YXZ'); pads.circle.visible = true; addHits(pads.circle);
    }
    if (A.pad) { place(pads.main, F, A.pad); pads.main.rotation.set(-Math.PI / 2, F.yaw, 0, 'YXZ'); pads.main.position.y += 0.002; addHits(pads.main); }
    if (A.heads) for (const k of ['heads', 'tails']) { place(pads[k], F, A[k]); pads[k].rotation.set(-Math.PI / 2, F.yaw, 0, 'YXZ'); pads[k].position.y += 0.002; addHits(pads[k]); }
    if (A.plunger) { place(plunger, F, A.plunger, sc); addHits(plunger); }
    if (A.autos) { place(autos, F, A.autos, sc); for (const b of autoBtns) addHits(b); }
    if (A.handle) { place(handle, F, A.handle, sc); addHits(handle); }
    if (A.bar) { place(slotBar, F, A.bar, sc); for (const b of slotBtns) addHits(b); }
    if (A.scr) { place(plScrMesh, F, A.scr); plScrMesh.rotation.set(-Math.PI / 2 + (A.scr[3] || 0), F.yaw, 0, 'YXZ'); plScrMesh.position.y += 0.012; hit.push(plScrMesh); cur.scr = plScrMesh; }
    if (my.game === 'roulette') { rlFlip = seat.face > 0; rouletteLayoutTex().rotation = rlFlip ? Math.PI : 0; hit.push(rl); }
    if (my.game === 'dice') { dcFlip = seat.face > 0; diceLayoutTex().rotation = dcFlip ? Math.PI : 0; hit.push(dc); }
    const scr = ctx.seatScreens[my.seat]; if (scr) { scr.userData.scr = true; hit.push(scr); cur.scr = scr; }
    const lane = ctx.lanePlates[my.seat]; if (lane) { lane.userData.uvPart = uv => 'spot:duck' + Math.max(0, Math.min(5, Math.floor(uv.x * 6))); hit.push(lane); cur.lanes = lane; }
    const lever = ctx.slotLevers[my.seat]; if (lever) { lever.traverse(m => { if (m.isMesh) m.userData.part = 'btn:lever'; }); addHits(lever); cur.lever = lever; }
    cur.hidden = ctx.deco[my.seat] || []; for (const m of cur.hidden) m.visible = false;
  }
  function teardown() {
    if (!cur) return;
    for (const m of cur.hidden) m.visible = true;
    if (cur.lever) cur.lever.rotation.x = 0;
    cur = null; root.visible = false; hit.length = 0; hover = null;
  }

  let hover = null, hoverId = '';
  return {
    get parts() { return hit; },
    get active() { return cur; },
    // A raycast hit -> { part, uv }
    resolve(h) {
      if (!h) return null;
      const u = h.object.userData;
      if (u.part) return { part: u.part, uv: null, point: h.point };
      if (u.uvPart && h.uv) { const p = u.uvPart(h.uv); return p ? { part: p, uv: h.uv, point: h.point } : null; }
      if (u.scr && h.uv) return { part: 'scr', uv: h.uv.clone(), point: h.point };
      return null;
    },
    setHover(h) { hover = h; hoverId = h ? h.part : ''; },
    // Every pressable thing with a point in the world (tests, and tap help on phones).
    centers() {
      if (!cur) return [];
      const out = [], seen = new Set();
      for (const m of hit) {
        const id = m.userData.part; if (!id || seen.has(id) || !m.visible || (m.parent && !m.parent.visible)) continue;
        seen.add(id); out.push({ part: id, p: m.getWorldPosition(v3(0, 0, 0)) });
      }
      if (cur.game === 'roulette') for (const c of RL_CELLS) out.push({ part: 'spot:' + c.id, p: rlRect(c).p });
      if (cur.game === 'dice') for (const c of DICE_RECTS) if (c.side === 1) out.push({ part: 'spot:' + c.id, p: spotPos(c.id) });
      if (cur.lanes) for (let i = 0; i < 6; i++) out.push({ part: 'spot:duck' + i, p: spotPos('duck' + i) });
      return out;
    },
    // The screen point for a touch-screen button (tests).
    screenPoint(x, y) { const s = cur && cur.scr; if (!s) return null; const g = s.geometry.parameters; return s.localToWorld(v3((x - 0.5) * g.width, (0.5 - y) * g.height, 0.001)); },
    update(t, dt, my) {
      if (!my || my.game === 'vip') { teardown(); return; }
      if (!cur || cur.seat !== my.seat) { teardown(); setup(my); }
      const on = my.on || {}, pr = my.pressed && t - my.pressed.t < 0.16 ? my.pressed.id : '';
      const dip = (b, id) => { b.children[0].position.y = b.userData.body.geometry.parameters.height / 2 - (pr === id ? 0.012 : 0); b.children[1].position.y = b.userData.body.geometry.parameters.height + 0.0012 - (pr === id ? 0.012 : 0); };
      // buttons light up when they do something
      if (kit.visible) {
        for (const b of keys) { light(b, true, hoverId === b.userData.id); dip(b, b.userData.id); }
        for (const b of rails) { light(b, true, hoverId === b.userData.id); dip(b, b.userData.id); }
        for (const b of gameRow(my.game).userData.btns) { const id = b.userData.id; light(b, !!on[id.slice(4)], hoverId === id); dip(b, id); }
        for (const c of chipBtns) {
          const u = c.userData, ok = u.v <= my.maxBet, sel = u.v === my.chip;
          c.visible = ok; c.position.y = sel ? 0.012 + Math.sin(t * 4) * 0.003 : 0; u.ring.visible = sel;
          u.top.emissiveIntensity = (hoverId === u.id ? 0.35 : 0) + (sel ? 0.15 : 0);
        }
        const key = my.display + my.typing;
        if (disp.key !== key) { disp.key = key; disp.update(t, { text: my.display, typing: my.typing }); }
      }
      for (const b of autoBtns) { if (!autos.visible) break; const id = b.userData.id, a = +id.slice(9); light(b, !!on[id.slice(4)], hoverId === id, my.extra && my.extra.auto === a); dip(b, id); }
      for (const b of slotBtns) { if (!slotBar.visible) break; const id = b.userData.id; light(b, !!on[id.slice(4)], hoverId === id, id === 'btn:auto' && my.extra && my.extra.auto); dip(b, id); }
      if (plunger.visible) { const ok = !!on.cash, pu = plunger.userData; pu.capMat.emissiveIntensity = ok ? 0.9 + Math.sin(t * 10) * 0.4 + (hoverId === 'btn:cash' ? 0.5 : 0) : 0.08; pu.cap.position.y = pr === 'btn:cash' ? 0.03 : 0.05; }
      if (handle.visible) { const pull = my.extra ? t - my.extra.pull : 9, u = pull < 0.7 ? Math.sin(pull / 0.7 * Math.PI) : 0; handle.userData.arm.rotation.x = u * 1.0; handle.userData.knob.material.emissiveIntensity = on.spin ? 0.6 + (hoverId === 'btn:spin' ? 0.6 : 0) : 0.05; }
      if (cur.lever) { const pull = my.extra ? t - my.extra.pull : 9; cur.lever.rotation.x = pull < 0.6 ? Math.sin(pull / 0.6 * Math.PI) * 0.9 : 0; }
      for (const k of ['main', 'circle', 'heads', 'tails']) { const m = pads[k]; if (m.visible) m.material.color.setScalar(hoverId === m.userData.part ? 1.6 : 1); }
      if (cur.scr === plScrMesh) { const key = JSON.stringify([my.ui, my.extra]); if (plScr.key !== key) { plScr.key = key; plScr.update(t, my); } }
      // hover glow on felt spots
      hl.visible = false;
      if (hover && hover.part && hover.part.startsWith('spot:')) {
        const id = hover.part.slice(5); let R = null;
        if (cur.game === 'roulette') { const c = RL_CELLS.find(c => c.id === id); if (c) R = rlRect(c); }
        else if (cur.game === 'dice') { const c = DICE_RECTS.find(c => c.id === id && c.side === 1); if (c) R = dcRect(c); }
        else if (cur.game === 'race' && cur.lanes) R = { p: spotPos(id), w: LANE.w / 6, d: LANE.d, yaw: cur.F.yaw };
        if (R) { hl.position.copy(R.p).setY(R.p.y + 0.004); hl.scale.set(R.w, R.d, 1); hl.rotation.set(-Math.PI / 2, R.yaw || 0, 0, 'YXZ'); hl.visible = true; hlMat.opacity = 0.22 + Math.sin(t * 6) * 0.06; }
      }
      // roulette: lucky numbers and the dolly on the winner
      const x = my.extra;
      luckyMarks.forEach((m, i) => {
        const L = cur.game === 'roulette' && x && x.lucky && x.lucky[i];
        m.visible = !!L; if (!L) return;
        const c = RL_CELLS.find(c => c.id === 'n' + L.n), R = rlRect(c);
        if (m.userData.key !== L.x) { m.userData.key = L.x; m.userData.lc.update(t, L.x); }
        m.position.copy(R.p).setY(0.9 + Math.abs(Math.sin(t * 3 + i)) * 0.02); m.rotation.set(-Math.PI / 2 + 0.5, cur.F.yaw, 0, 'YXZ');
      });
      dolly.visible = cur.game === 'roulette' && x && x.n !== null && x.n !== undefined;
      if (dolly.visible) { const c = RL_CELLS.find(c => c.id === 'n' + x.n); dolly.position.copy(rlRect(c).p).setY(0.925); }
      puck.visible = cur.game === 'dice';
      if (puck.visible) {
        const pt = x && x.point, P = DICE_POINTS.find(p => p.n === pt);
        puck.material[1] = P ? puckOn : puckOff;
        puck.position.copy(P ? feltWorld(dc, DF.w, DF.d, P.x + P.w / 2, P.y + 0.1, dcFlip) : feltWorld(dc, DF.w, DF.d, PX0 - 0.25, MID.y + MID.h / 2, dcFlip)).setY(0.905);
      }
      // the chips on the table
      let n = 0;
      for (const s of my.stacks || []) {
        const base = spotPos(s.spot); if (!base) continue;
        const list = chipsFor(s.amount), F = cur.F;
        if (s.slot) base.addScaledVector(F.r, 0.062);
        let k = 1, dy = 0;
        if (s.anim === 'sweep') { base.addScaledVector(F.f, 0.5 * s.u); k = s.u > 0.6 ? 1 - (s.u - 0.6) / 0.4 : 1; }
        else if (s.anim === 'collect') { base.addScaledVector(F.f, -0.4 * s.u); dy = Math.sin(s.u * Math.PI) * 0.05; k = 1 - s.u * s.u; }
        else if (s.anim === 'drop') dy = (1 - s.u) * 0.12;
        if (k <= 0.02) continue;
        const fresh = s.add ? t - s.add : 9;
        for (let j = 0; j < list.length && n < MAXC; j++, n++) {
          const top = j === list.length - 1 && fresh < 0.2 ? (1 - fresh / 0.2) * 0.07 : 0;
          pp.copy(base); pp.y += 0.0045 + j * 0.0087 + dy + top;
          sc.set(k, k, k); q.setFromAxisAngle(Y, j * 0.7 + s.spot.length);
          mtx.compose(pp, q, sc); stackMesh.setMatrixAt(n, mtx); stackMesh.setColorAt(n, chipCols[list[j]]);
        }
      }
      stackMesh.count = n; stackMesh.instanceMatrix.needsUpdate = true; if (stackMesh.instanceColor) stackMesh.instanceColor.needsUpdate = true;
    },
  };
}
const Y = new THREE.Vector3(0, 1, 0);
