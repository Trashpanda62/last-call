// The parts of the station you sit at that you click: betting spots, the roulette and dice layouts on the felt, chips
// stacked where you bet, the slot lever, the Crash plunger, the wheel handle and the touch screens (the chips, UNDO,
// CLEAR and the game's buttons are on the table bar, main.js). Only your own station gets them; every part carries
// userData.part (or a uv mapper) that main.js raycasts and src/tables.js understands. focus() tells the renderer what
// the table camera has to frame.
import * as THREE from 'three';
import * as T from './textures.js';
import * as Gm from '../games.js';
import { CHIPS } from '../tables.js';
import { MAT, v3, rbox, cyl, yawOf } from './world.js';
import { RL_TABLE, DICE_TABLE, BJ_TABLES, COIN, POND } from '../map.js';

const M = 1 / 60;
const ARC = s => `900 ${Math.round(s)}px "Arial Black", Impact, system-ui, sans-serif`;
export const CHIP_COL = ['#ece6da', '#c8302a', '#202024', '#6a2ac0', '#e8a830', '#22b066'];
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
const RL_LABELS = { d1: '1ST 12', d2: '2ND 12', d3: '3RD 12', low: '1 TO 18', even: 'EVEN', odd: 'ODD', high: '19 TO 36', c1: '2 TO 1', c2: '2 TO 1', c3: '2 TO 1' };
export const RL_COLORS = { red: '#e0402c', black: '#171717', zero: '#1f9a4a', felt: '#166a32', line: '#f2f0e6' };
let rlTex = null;
// The layout as the table camera sees it: solid red and black numbers, a white grid, a pointed zero, the columns'
// 2 TO 1 turned on its side.
export function rouletteLayoutTex() {
  if (rlTex) return rlTex;
  const P = 512, W = Math.round(RL_FELT.w * P), H = Math.round(RL_FELT.d * P), [c, g] = T.canvas(W, H), C = RL_COLORS;
  const paint = () => {
    feltBase(g, W, H, C.felt);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const text = (s, x, y, size, col = '#fff') => { g.font = `900 ${size}px Impact, "Arial Black", sans-serif`; g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(s, x + 3, y + 5); g.fillStyle = col; g.fillText(s, x, y + 2); };
    for (const cl of RL_CELLS) {
      const x = cl.x * P, y = cl.y * P, w = cl.w * P, h = cl.h * P, cx = x + w / 2, cy = y + h / 2;
      g.strokeStyle = C.line; g.lineWidth = 7;
      if (cl.id === 'n0') { // a pentagon pointing away from the numbers
        g.fillStyle = C.zero; g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w * 0.42, y); g.lineTo(x, cy); g.lineTo(x + w * 0.42, y + h); g.lineTo(x + w, y + h); g.closePath(); g.fill(); g.stroke();
        g.save(); g.translate(cx + w * 0.1, cy); g.rotate(-Math.PI / 2); text('0', 0, 0, 92); g.restore(); continue;
      }
      if (cl.id[0] === 'n') {
        const n = +cl.id.slice(1);
        g.fillStyle = RED.has(n) ? C.red : C.black; g.fillRect(x + 6, y + 6, w - 12, h - 12);
        text(String(n), cx, cy, 78);
      } else if (cl.id === 'red' || cl.id === 'black') {
        g.fillStyle = cl.id === 'red' ? C.red : C.black; g.strokeStyle = C.line; g.lineWidth = 5;
        g.beginPath(); g.moveTo(cx, cy - h * 0.34); g.lineTo(cx + w * 0.26, cy); g.lineTo(cx, cy + h * 0.34); g.lineTo(cx - w * 0.26, cy); g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = C.line; g.lineWidth = 7;
      } else if (cl.id[0] === 'c') { g.save(); g.translate(cx, cy); g.rotate(-Math.PI / 2); text(RL_LABELS[cl.id], 0, 0, 46); g.restore(); }
      else text(RL_LABELS[cl.id], cx, cy, cl.id[0] === 'd' ? 60 : 50);
      g.strokeRect(x, y, w, h);
    }
  };
  paint();
  rlTex = T.tex(c, false); rlTex.center.set(0.5, 0.5);
  T.onFelts(() => { paint(); rlTex.needsUpdate = true; });
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
  const paint = () => {
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
  };
  paint();
  diceTex = T.tex(c, false); diceTex.center.set(0.5, 0.5);
  T.onFelts(() => { paint(); diceTex.needsUpdate = true; });
  return diceTex;
}
function feltBase(g, W, H, col) {
  T.feltFill(g, W, H, col);
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

// Where each game's parts sit, in the seat's frame: [ahead, right, height, tilt].
const AT = {
  plinko: { pad: [0.9, 0, 0.862] }, // on a betting stand (machines.js)
  mines: { pad: [0.9, 0, 0.952] },
  tower: { pad: [0.9, 0, 0.952] },
  crash: { pad: [0.8, -0.17, 1.012], plunger: [0.8, 0.17, 1.012] },
  race: { lanes: [0.82, 0, 0.893] },
  coin: { heads: [0.88, -0.17, 0.925], tails: [0.88, 0.17, 0.925] },
  wheel: { pad: [0.8, -0.14, 0.952], handle: [0.86, 0.17, 0.952] },
};
// The table camera: how steeply it looks down (radians) and its narrowest field of view (degrees; it widens when the
// ceiling is in the way).
const SHOT = { roulette: [-1.1, 44], bj: [-0.92, 46], dice: [-0.95, 46], slots: [-0.12, 44], plinko: [-0.22, 46], mines: [-0.3, 40], tower: [-0.3, 40],
  crash: [-0.22, 50], race: [-0.62, 50], coin: [-0.55, 46], wheel: [-0.16, 50] };
// Chips on the felt are drawn bigger than life so they read from the table camera.
const CHIP_SCALE = { roulette: 2.1, dice: 1.9, bj: 1.6 };
export const STANDS = { plinko: [0.68, 0.96, 0.62, 0.86] }; // betting stands in front of these seats: [ahead, width, depth, height]
export const LANE = { w: 0.98, d: 0.36 }; // the duck-race desk card

// ctx.seatScreens: seat id -> the console screen mesh (Mines, Dragon Tower); ctx.slotLevers: seat id -> lever pivot;
// ctx.lanePlates: seat id -> the duck-race desk card; ctx.deco: seat id -> meshes to hide while you sit there.
export function buildRig(ctx, seats, felts) {
  const root = new THREE.Group(); root.visible = false; ctx.group.add(root); // shown only while you sit at a table
  const parts = [];      // what the crosshair can hit this frame
  const hit = [];        // [mesh, id] for every part mesh, filled per station
  let cur = null;        // { seat, game, frame }

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

  // ----- Crash: the plunger; the wheel handle -----
  const plunger = new THREE.Group(); root.add(plunger);
  { const base = new THREE.Mesh(cyl(0.07, 0.08, 0.04, 24), MAT.chrome); base.position.y = 0.02; plunger.add(base);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0202a, emissive: 0xff2030, emissiveIntensity: 0.6, roughness: 0.25 }));
    cap.scale.y = 0.6; cap.position.y = 0.05; plunger.add(cap);
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ map: label('CASH OUT', 0.16, 0.05, { ink: '#fff', bg: '#5a0a10', size: 0.6 }) }));
    lb.rotation.x = -Math.PI / 2; lb.position.set(0, 0.002, 0.11); plunger.add(lb);
    base.userData.part = cap.userData.part = lb.userData.part = 'btn:cash';
    plunger.userData = { cap, capMat: cap.material }; }
  const handle = new THREE.Group(); root.add(handle);
  { const base = new THREE.Mesh(rbox(0.1, 0.05, 0.1, 0.02), MAT.gold); base.position.y = 0.025; handle.add(base);
    const arm = new THREE.Group(); arm.position.y = 0.05; handle.add(arm);
    const stick = new THREE.Mesh(cyl(0.012, 0.012, 0.26, 10), MAT.chrome); stick.position.y = 0.13; arm.add(stick);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 12), new THREE.MeshStandardMaterial({ color: 0xffd040, emissive: 0xffa020, emissiveIntensity: 0.5, roughness: 0.3 })); knob.position.y = 0.27; arm.add(knob);
    base.userData.part = stick.userData.part = knob.userData.part = 'btn:spin';
    handle.userData = { arm, knob }; }

  // ----- chip stacks: one instanced mesh for every chip on the table -----
  const MAXC = 900, sGeo = cyl(0.03, 0.03, 0.0095, 24);
  const stackMesh = new THREE.InstancedMesh(sGeo, [stackMat(stripes(true)), stackMat(stripes(false)), stackMat(stripes(false))], MAXC);
  stackMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stackMesh.count = 0; stackMesh.castShadow = true; stackMesh.frustumCulled = false;
  const chipCols = CHIP_COL.map(c => new THREE.Color(c));
  for (let i = 0; i < MAXC; i++) stackMesh.setColorAt(i, chipCols[0]);
  root.add(stackMesh);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = v3(1, 1, 1), pp = v3(0, 0, 0);
  function chipsFor(a) { const out = []; for (let i = CHIPS.length - 1; i >= 0 && out.length < 18; i--) { let n = Math.floor(a / CHIPS[i] + 1e-9); a -= n * CHIPS[i]; while (n-- > 0 && out.length < 18) out.push(i); } return out.length ? out : [0]; }

  // ----- roulette: the LAST SPINS board along the far edge of the layout (the lucky numbers while the ball rolls) -----
  const board = liveLabel(1024, 128, (g, w, h, t, x) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(10,52,26,0.96)'; g.beginPath(); g.roundRect(3, 3, w - 6, h - 6, 16); g.fill();
    g.strokeStyle = '#f4f0e0'; g.lineWidth = 5; g.stroke();
    g.textBaseline = 'middle'; g.textAlign = 'center';
    const hist = x.hist || [], lucky = x.lucky;
    g.fillStyle = lucky ? '#ffd040' : '#f4f0e0'; g.font = ARC(30); g.fillText(lucky ? 'LUCKY' : hist.length ? 'LAST SPINS' : 'NO LAST SPIN', 140, h / 2 - (lucky ? 0 : 12));
    if (!lucky) { g.font = ARC(13); g.globalAlpha = 0.75; g.fillText('0 RETURNS OUTSIDE BETS', 140, h / 2 + 22); g.globalAlpha = 1; }
    const bw = 76, gap = 8, x0 = 282;
    for (let i = 0; i < 9; i++) {
      const bx = x0 + i * (bw + gap), by = 18, bh = h - 36;
      const L = lucky ? lucky[i] : null, n = lucky ? (L ? L.n : null) : hist[i];
      g.strokeStyle = 'rgba(244,240,224,0.8)'; g.lineWidth = 4; g.strokeRect(bx, by, bw, bh);
      if (n === null || n === undefined) continue;
      g.fillStyle = n === 0 ? '#1f9a4a' : RED.has(n) ? '#e0402c' : '#141414'; g.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
      g.fillStyle = '#fff'; g.font = ARC(lucky ? 34 : 40); g.fillText(String(n), bx + bw / 2, by + bh / 2 - (lucky ? 12 : 0) + 2);
      if (lucky) { g.fillStyle = '#ffd040'; g.font = ARC(20); g.fillText(L.x + 'x', bx + bw / 2, by + bh / 2 + 22); }
      if (!lucky && i === 0) { g.strokeStyle = '#ffd040'; g.lineWidth = 6; g.strokeRect(bx - 3, by - 3, bw + 6, bh + 6); }
    }
  });
  const BOARD = { x: NX, y: 0.05, w: 12 * CW + 0.2, h: 0.3 };
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshBasicMaterial({ map: board.tex, transparent: true, depthWrite: false, toneMapped: false }));
  boardMesh.rotation.order = 'YXZ'; boardMesh.visible = false; root.add(boardMesh);

  // ----- felt highlight, roulette lucky markers, the dolly, the dice puck -----
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
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
    const seat = seats[my.seat], F = frameOf(seat), A = AT[my.game] || {}, sc = document.body.classList.contains('touch') ? 1.25 : 1;
    cur = { seat: my.seat, game: my.game, F, A, lanes: null, scr: null, lever: null };
    root.visible = true;
    for (const o of [plunger, handle, boardMesh, ...Object.values(pads)]) o.visible = false;
    hit.length = 0;
    const addHits = (obj) => obj.traverse(m => { if (m.isMesh && (m.userData.part || m.userData.uvPart || m.userData.scr)) hit.push(m); });
    if (my.game === 'bj') { // the painted box in front of the seat is the betting circle
      const tb = BJ_TABLES[seat.table], a = Math.atan2((seat.y - tb.y) / 152, (seat.x - tb.x) / 168);
      pads.circle.position.set(tb.x * M + Math.cos(a) * 1.68, 0.878, tb.y * M + Math.sin(a) * 1.305); pads.circle.rotation.set(-Math.PI / 2, F.yaw, 0, 'YXZ'); pads.circle.visible = true; addHits(pads.circle);
    }
    if (A.pad) { place(pads.main, F, A.pad); pads.main.rotation.set(-Math.PI / 2, F.yaw, 0, 'YXZ'); pads.main.position.y += 0.002; addHits(pads.main); }
    if (A.heads) for (const k of ['heads', 'tails']) { place(pads[k], F, A[k]); pads[k].rotation.set(-Math.PI / 2, F.yaw, 0, 'YXZ'); pads[k].position.y += 0.002; addHits(pads[k]); }
    if (A.plunger) { place(plunger, F, A.plunger, sc); addHits(plunger); }
    if (A.handle) { place(handle, F, A.handle, sc); addHits(handle); }
    if (my.game === 'roulette') {
      rlFlip = seat.face > 0; rouletteLayoutTex().rotation = rlFlip ? Math.PI : 0; hit.push(rl);
      boardMesh.position.copy(feltWorld(rl, RL_FELT.w, RL_FELT.d, BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h / 2, rlFlip)).setY(0.888);
      boardMesh.rotation.set(-Math.PI / 2, rlFlip ? Math.PI : 0, 0, 'YXZ'); boardMesh.visible = true; board.key = '';
    }
    if (my.game === 'dice') { dcFlip = seat.face > 0; diceLayoutTex().rotation = dcFlip ? Math.PI : 0; hit.push(dc); }
    const scr = ctx.seatScreens[my.seat]; if (scr) { scr.userData.scr = true; hit.push(scr); cur.scr = scr; }
    const lane = ctx.lanePlates[my.seat]; if (lane) { lane.userData.uvPart = uv => 'spot:duck' + Math.max(0, Math.min(5, Math.floor(uv.x * 6))); hit.push(lane); cur.lanes = lane; }
    const lever = ctx.slotLevers[my.seat]; if (lever) { lever.traverse(m => { if (m.isMesh) m.userData.part = 'btn:lever'; }); addHits(lever); cur.lever = lever; }
    cur.hidden = ctx.deco[my.seat] || []; for (const m of cur.hidden) m.visible = false;
    cur.focus = focusOf(my, seat, F);
    if (my.game === 'race') { // while they run: down the pond from the start toward the finish and the tote board
      const z = (POND.y + POND.h / 2) * M;
      cur.runFocus = { fixed: { pos: v3(POND.x * M - 1.5, 3.25, z), at: v3(POND.x * M + 5.2, 0.45, z), fov: 62 }, key: seat.id + 'run' };
    }
  }
  // What the table camera frames: the core points always, the extra ones when they fit under the ceiling.
  const corners = (obj, out, pad = 0) => {
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj).expandByScalar(pad);
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(v3(x, y, z));
  };
  function focusOf(my, seat, F) {
    const core = [], extra = [], g = my.game, [pitch, fov] = SHOT[g] || [-0.5, 46], f = ctx.focus[seat.id] || {};
    const add = (list, items) => { for (const it of items || []) if (it.isVector3) list.push(it.clone()); else corners(it, list); };
    for (const m of hit) if (m.visible && m !== rl && m !== dc) corners(m, core, 0.03);
    if (g === 'roulette') for (const lx of [RX - 0.05, CX + 0.25]) for (const ly of [0.02, RY + 3 * RH + DH + EH + 0.04]) core.push(feltWorld(rl, RL_FELT.w, RL_FELT.d, lx, ly, rlFlip));
    else if (g === 'dice') corners(dc, core);
    else if (g === 'bj') {
      const tb = BJ_TABLES[seat.table];
      for (const dx of [-0.42, 0.42]) core.push(v3(tb.x * M + dx, 0.88, tb.y * M + 0.3), v3(tb.x * M + dx, 0.88, tb.y * M + 0.55));
      for (const d of [-0.12, 0.42]) for (const l of [-0.3, 0.3]) core.push(pads.circle.position.clone().addScaledVector(F.f, d).addScaledVector(F.r, l));
    } else if (g === 'coin') for (const dy of [0.95, 2.5]) for (const d of [-0.5, 0.5]) core.push(v3(COIN.x * M, dy, COIN.y * M).addScaledVector(F.r, d)); // up to the top of the toss
    add(core, f.core); add(extra, f.extra);
    if (g === 'race') for (const dx of [-2.2, 2.2]) extra.push(v3(seat.x * M + dx, 0.45, POND.y * M + 0.4), v3(seat.x * M + dx, 0.45, (POND.y + POND.h) * M - 0.15)); // every lane, near to far, above the card
    // blackjack seats sit round an arc: look from yours toward the dealer's cards
    const look = g === 'bj' ? Math.atan2(BJ_TABLES[seat.table].y + 25 - seat.y, BJ_TABLES[seat.table].x - seat.x) : seat.face;
    return { core, extra, pitch, fov, look, key: seat.id, at: [seat.x, seat.y] };
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
    focus() { return cur && (cur.runFocus && cur.phase && cur.phase !== 'bet' ? cur.runFocus : cur.focus); },
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
      if (plunger.visible) { const ok = !!on.cash, pu = plunger.userData; pu.capMat.emissiveIntensity = ok ? 0.9 + Math.sin(t * 10) * 0.4 + (hoverId === 'btn:cash' ? 0.5 : 0) : 0.08; pu.cap.position.y = pr === 'btn:cash' ? 0.03 : 0.05; }
      if (handle.visible) { const pull = my.extra ? t - my.extra.pull : 9, u = pull < 0.7 ? Math.sin(pull / 0.7 * Math.PI) : 0; handle.userData.arm.rotation.x = u * 1.0; handle.userData.knob.material.emissiveIntensity = on.spin ? 0.6 + (hoverId === 'btn:spin' ? 0.6 : 0) : 0.05; }
      if (cur.lever) { const pull = my.extra ? t - my.extra.pull : 9; cur.lever.rotation.x = pull < 0.6 ? Math.sin(pull / 0.6 * Math.PI) * 0.9 : 0; }
      for (const k of ['main', 'circle', 'heads', 'tails']) { const m = pads[k]; if (m.visible) m.material.color.setScalar(hoverId === m.userData.part ? 1.6 : 1); }
      if (boardMesh.visible) {
        const lk = my.extra && my.extra.n === null ? my.extra.lucky : null, key = JSON.stringify([my.hist, lk]);
        if (board.key !== key) { board.key = key; board.update(t, { hist: my.hist, lucky: lk }); }
      }
      // hover glow on felt spots
      hl.visible = false;
      if (hover && hover.part && hover.part.startsWith('spot:')) {
        const id = hover.part.slice(5); let R = null;
        if (cur.game === 'roulette') { const c = RL_CELLS.find(c => c.id === id); if (c) R = rlRect(c); }
        else if (cur.game === 'dice') { const c = DICE_RECTS.find(c => c.id === id && c.side === 1); if (c) R = dcRect(c); }
        else if (cur.game === 'race' && cur.lanes) R = { p: spotPos(id), w: LANE.w / 6, d: LANE.d, yaw: cur.F.yaw };
        if (R) { hl.position.copy(R.p).setY(R.p.y + 0.004); hl.scale.set(R.w, R.d, 1); hl.rotation.set(-Math.PI / 2, R.yaw || 0, 0, 'YXZ'); hl.visible = true; hlMat.opacity = 0.26 + Math.sin(t * 6) * 0.06; }
      }
      // roulette: lucky numbers and the dolly on the winner
      const x = my.extra;
      cur.phase = cur.game === 'race' && x ? x.phase : null;
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
      let n = 0; const cs = CHIP_SCALE[cur.game] || 1.25;
      for (const s of my.stacks || []) {
        const base = spotPos(s.spot); if (!base) continue;
        const list = chipsFor(s.amount), F = cur.F;
        if (s.slot) base.addScaledVector(F.r, 0.062 * cs);
        let k = 1, dy = 0;
        if (s.anim === 'sweep') { base.addScaledVector(F.f, 0.5 * s.u); k = s.u > 0.6 ? 1 - (s.u - 0.6) / 0.4 : 1; }
        else if (s.anim === 'collect') { base.addScaledVector(F.f, -0.4 * s.u); dy = Math.sin(s.u * Math.PI) * 0.05; k = 1 - s.u * s.u; }
        else if (s.anim === 'drop') dy = (1 - s.u) * 0.12;
        if (k <= 0.02) continue;
        const fresh = s.add ? t - s.add : 9;
        for (let j = 0; j < list.length && n < MAXC; j++, n++) {
          const top = j === list.length - 1 && fresh < 0.2 ? (1 - fresh / 0.2) * 0.07 : 0;
          pp.copy(base); pp.y += (0.005 + j * 0.0097) * cs + dy + top;
          sc.set(k * cs, k * cs, k * cs); q.setFromAxisAngle(Y, j * 0.7 + s.spot.length);
          mtx.compose(pp, q, sc); stackMesh.setMatrixAt(n, mtx); stackMesh.setColorAt(n, chipCols[list[j]]);
        }
      }
      stackMesh.count = n; stackMesh.instanceMatrix.needsUpdate = true; if (stackMesh.instanceColor) stackMesh.instanceColor.needsUpdate = true;
    },
  };
}
const Y = new THREE.Vector3(0, 1, 0);
