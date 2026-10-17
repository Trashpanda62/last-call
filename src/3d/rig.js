// The parts of the game you are playing that you click: betting spots, the roulette and dice layouts on the felt, chips
// stacked where you bet, blackjack action buttons, the slot lever and the touch screens. Starts use the HUD. Only the game you are at
// gets these parts; every part carries userData.part (or a uv
// mapper) that main.js raycasts and src/tables.js understands. focus() tells the phone's table camera what to frame.
import * as THREE from 'three';
import * as T from './textures.js';
import * as Gm from '../games.js';
import { CHIPS } from '../tables.js';
import { MAT, v3, cyl, yawOf } from './world.js';
import { RL_TABLE, DICE_TABLE, BJ_TABLES, COIN, POND } from '../map.js';
import { BJ_LAYOUT, blackjackSpot } from './blackjack-layout.js';

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
  if (!T.feltsReady()) T.onFelts(() => { paint(); rlTex.needsUpdate = true; });
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
  if (!T.feltsReady()) T.onFelts(() => { paint(); diceTex.needsUpdate = true; });
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
  // Keep custom-uniform textures discoverable by staged material preparation.
  // Each mask belongs to this material and retires with the replaced table.
  m.stripeMask = mask;
  m.addEventListener('dispose', () => mask.dispose());
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = sh => {
    sh.uniforms.uStripe = { value: mask };
    sh.fragmentShader = 'uniform sampler2D uStripe;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.9, 0.85), texture2D(uStripe, vUv).r);');
  };
  // The mask is a per-material uniform; both surfaces use the same shader.
  m.customProgramCacheKey = () => 'chipStack';
  return m;
}
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
function liveLabel(w, h, paint) { const lc = T.liveCanvas(w, h, paint); lc.key = ''; return lc; }

// Where each game's parts sit, in the seat's frame: [ahead, right, height, tilt].
const AT = {
  skee: { pad: [.62, 0, .789] },
  slots: {}, // the chips go in the machine's slot (machines.js)
  plinko: { pad: [0.58, 0, 0.662] }, // on a betting stand (machines.js), the keys behind it
  mines: { pad: [0.62, 0, 0.92] }, // the BET pad rides on the keys' block (the deck is too low to see)
  tower: { pad: [0.62, 0, 0.92] },
  crash: { pad: [0.55, 0, 0.812] }, // the keys behind them, at the desk's far edge
  race: { lanes: [0.82, 0, 0.693] },
  coin: { heads: [0.64, -0.17, 0.725], tails: [0.64, 0.17, 0.725] }, // the keys behind them
  wheel: { pad: [0.55, 0, 0.752] },
};
// The table camera: how steeply it looks down (radians) and its narrowest field of view (degrees; it widens when the
// ceiling is in the way).
const SHOT = { roulette: [-1.1, 44], bj: [-0.92, 46], dice: [-0.95, 46], slots: [-0.12, 44], plinko: [-0.22, 46], mines: [-0.3, 40], tower: [-0.3, 40],
  crash: [-0.22, 50], race: [-0.62, 50], coin: [-0.55, 46], wheel: [-0.16, 50] };
// Chips on the felt are drawn bigger than life so they read from the table camera.
const CHIP_SCALE = { roulette: 2.5, dice: 2.2, bj: 2.3 };
export const STANDS = { plinko: [0.68, 0.96, 0.62, 0.66] }; // betting stands in front of these seats: [ahead, width, depth, height]
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
  const pads = { main: pad('main', 'BET', 0.12), circle: pad('main', '', 0.13), heads: pad('heads', 'HEADS', 0.12, '#ffd040'), tails: pad('tails', 'TAILS', 0.12, '#ffd040') };
  pads.circle.material.color.setRGB(1, 1, 1);

  // Small physical keys on the player side of the blackjack circle. Build once
  // so their geometry, labels and materials are prepared before entering play.
  const bjKeys = new THREE.Group(); bjKeys.name = 'blackjack-action-buttons'; bjKeys.visible = false; root.add(bjKeys);
  const keyRimGeo = cyl(.065, .067, .016, 32), keyCapGeo = cyl(.054, .057, .022, 32);
  // The underside is buried in the mount; only the side and labeled top draw.
  keyCapGeo.groups.length = 2;
  const keyRimMat = new THREE.MeshStandardMaterial({ color: 0x302c26, metalness: .65, roughness: .38 });
  const bjButtons = [['hit', 'HIT', '#25965c', -.15], ['stand', 'STAND', '#be453d', 0], ['double', 'DOUBLE', '#357aca', .15], ['split', 'SPLIT', '#9063b9', .30]].map(([id, text, color, offset]) => {
    const button = new THREE.Group(); button.name = 'blackjack-' + id; bjKeys.add(button);
    const rim = new THREE.Mesh(keyRimGeo, keyRimMat); rim.position.y = .008; button.add(rim);
    const [canvas, g] = T.canvas(256, 256);
    g.fillStyle = color; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#ffffff55'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 117, 0, Math.PI * 2); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = ARC(text.length > 4 ? 40 : 48);
    g.lineWidth = 5; g.strokeStyle = '#142321aa'; g.strokeText(text, 128, 130); g.fillStyle = '#fff7e8'; g.fillText(text, 128, 130);
    const face = new THREE.MeshBasicMaterial({ map: T.tex(canvas, false), toneMapped: false });
    const side = new THREE.MeshStandardMaterial({ color, roughness: .36, metalness: .15 });
    const cap = new THREE.Mesh(keyCapGeo, [side, face]); cap.name = 'blackjack-' + id + '-cap'; cap.position.y = .023;
    cap.rotation.y = Math.PI / 2; cap.userData.part = 'btn:' + id; button.add(cap);
    return { id, offset, button, cap, face, side };
  });

  // ----- chip stacks: one instanced mesh for every chip on the table -----
  const MAXC = 900, sGeo = cyl(0.03, 0.03, 0.0095, 24);
  // Both caps have the same paint. Their adjacent index ranges can share one
  // draw, material and mask without changing vertices, UVs or triangle order.
  sGeo.groups[1].count += sGeo.groups[2].count; sGeo.groups.length = 2;
  const stackMesh = new THREE.InstancedMesh(sGeo, [stackMat(stripes(true)), stackMat(stripes(false))], MAXC);
  stackMesh.name = 'player-bet-chips'; stackMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); stackMesh.count = 0; stackMesh.castShadow = true; stackMesh.frustumCulled = false;
  const chipCols = CHIP_COL.map(c => new THREE.Color(c));
  for (let i = 0; i < MAXC; i++) stackMesh.setColorAt(i, chipCols[0]);
  const chipKinds = new Uint8Array(MAXC); // matches the initial denomination above
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
    if (g === 'roulette') { const c = RL_CELLS.find(c => c.id === spot); return c ? feltWorld(rl, RL_FELT.w, RL_FELT.d, c.x + c.w / 2, c.y + c.h / 2, rlFlip).setY(0.687) : null; }
    if (g === 'dice') {
      const c = DICE_RECTS.find(c => c.id === spot && c.side === 1); if (!c) return null; // your own half (the felt turns for the north side)
      const p = feltWorld(dc, DF.w, DF.d, c.x + c.w / 2, c.y + c.h / 2, dcFlip); p.x = Math.max(dc.position.x - DF.w / 2 + c.x + 0.25, Math.min(dc.position.x - DF.w / 2 + c.x + c.w - 0.25, F.o.x)); return p.setY(0.692);
    }
    if (g === 'race') { const i = +spot.slice(4); if (!(i >= 0)) return null; return cur.lanes.localToWorld(v3(((i + 0.5) / 6 - 0.5) * LANE.w, 0, 0.002)); }
    if (g === 'coin') return (spot === 'heads' ? pads.heads : pads.tails).position.clone();
    const p = g === 'bj' ? pads.circle : pads.main; return p.visible ? p.position.clone().setY(p.position.y + (p.userData.lift || 0)) : null;
  }

  // Set up the parts of the game I just took.
  function setup(my) {
    const seat = seats[my.seat], F = frameOf(seat), A = AT[my.game] || {};
    cur = { seat: my.seat, game: my.game, F, A, lanes: null, scr: null, lever: null };
    root.visible = true;
    for (const o of [boardMesh, bjKeys, ...Object.values(pads)]) o.visible = false;
    hit.length = 0;
    const addHits = (obj) => obj.traverse(m => { if (m.isMesh && (m.userData.part || m.userData.uvPart || m.userData.scr)) hit.push(m); });
    if (my.game === 'bj') {
      const { bet } = blackjackSpot(seat, BJ_TABLES[seat.table]);
      pads.circle.position.set(bet.x, 0.695, bet.z); pads.circle.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
      // The printed circle is the signifier; this invisible mesh is its hit target.
      pads.circle.scale.set(BJ_LAYOUT.betRadius * 4 / 1024 / 0.13, BJ_LAYOUT.betRadius * BJ_LAYOUT.depth / 512 / 0.13, 1);
      pads.circle.material.opacity = 0; pads.circle.visible = true; addHits(pads.circle);
      bjKeys.position.copy(pads.circle.position).addScaledVector(F.f, -.15).setY(.675);
      bjKeys.rotation.y = F.yaw; bjKeys.visible = true;
      // Local +X is the player's right; rotate the printed faces toward them.
      for (const b of bjButtons) { b.button.position.x = b.offset; b.button.visible = b.id !== 'split' || !!my.on.split; }
      addHits(bjKeys);
    }
    if (A.pad) { pads.main.userData.lift = 0; place(pads.main, F, A.pad); pads.main.rotation.set(-Math.PI / 2, F.yaw, 0, 'YXZ'); pads.main.position.y += 0.002; addHits(pads.main); }
    if (A.heads) for (const k of ['heads', 'tails']) { place(pads[k], F, A[k]); pads[k].rotation.set(-Math.PI / 2, F.yaw, 0, 'YXZ'); pads[k].position.y += 0.002; addHits(pads[k]); }
    if (my.game === 'roulette') {
      rlFlip = seat.face > 0; rouletteLayoutTex().rotation = rlFlip ? Math.PI : 0; hit.push(rl);
      boardMesh.position.copy(feltWorld(rl, RL_FELT.w, RL_FELT.d, BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h / 2, rlFlip)).setY(0.688);
      boardMesh.rotation.set(-Math.PI / 2, rlFlip ? Math.PI : 0, 0, 'YXZ'); boardMesh.visible = true; board.key = '';
    }
    if (my.game === 'dice') { dcFlip = seat.face > 0; diceLayoutTex().rotation = dcFlip ? Math.PI : 0; hit.push(dc); }
    const scr = ctx.seatScreens[my.seat]; if (scr) { scr.userData.scr = true; hit.push(scr); cur.scr = scr; }
    const lane = ctx.lanePlates[my.seat]; if (lane) { lane.userData.uvPart = uv => 'spot:duck' + Math.max(0, Math.min(5, Math.floor(uv.x * 6))); hit.push(lane); cur.lanes = lane; }
    const lever = ctx.slotLevers[my.seat]; if (lever) { lever.traverse(m => { if (m.isMesh) m.userData.part = 'btn:lever'; }); addHits(lever); cur.lever = lever; }
    // The game's own physical starter: the roulette wheel, the dice, the coin, the prize wheel, Plinko's drop chute, a
    // slot machine's chip slot. Clicking it is the start (there is no SPACE prompt).
    for (const [obj, part] of ctx.starters[my.seat] || []) { obj.traverse(m => { if (m.isMesh) m.userData.part = part; }); addHits(obj); }
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
      for (const dx of [-0.42, 0.42]) core.push(v3(tb.x * M + dx, 0.68, tb.y * M + 0.3), v3(tb.x * M + dx, 0.68, tb.y * M + 0.55));
      for (const d of [-0.12, 0.42]) for (const l of [-0.3, 0.3]) core.push(pads.circle.position.clone().addScaledVector(F.f, d).addScaledVector(F.r, l));
    } else if (g === 'coin') for (const dy of [0.75, 2.3]) for (const d of [-0.5, 0.5]) core.push(v3(COIN.x * M, dy, COIN.y * M).addScaledVector(F.r, d)); // up to the top of the toss
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
    // A point on the betting console in its 0..1 units, from the top left (tests).
    consolePoint() { return null; },
    // The screen point for a touch-screen button (tests).
    screenPoint(x, y) { const s = cur && cur.scr; if (!s) return null; const g = s.geometry.parameters; return s.localToWorld(v3((x - 0.5) * g.width, (0.5 - y) * g.height, 0.001)); },
    update(t, dt, my) {
      if (!my || my.game === 'vip') { teardown(); return; }
      if (!cur || cur.seat !== my.seat) { teardown(); setup(my); }
      if (cur.lever) { const pull = my.extra ? t - my.extra.pull : 9; cur.lever.rotation.x = pull < 0.6 ? Math.sin(pull / 0.6 * Math.PI) * 0.9 : 0; }
      // the betting spots pulse while nothing is down, so a first bet knows where to go (never past full brightness: no glare)
      const pulse = my.idle ? 0.82 + Math.sin(t * 5) * 0.18 : 0.9;
      for (const k of ['main', 'circle', 'heads', 'tails']) { const m = pads[k]; if (m.visible) m.material.color.setScalar(hoverId === m.userData.part ? 1 : pulse); }
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
        m.position.copy(R.p).setY(0.7 + Math.abs(Math.sin(t * 3 + i)) * 0.02); m.rotation.set(-Math.PI / 2 + 0.5, cur.F.yaw, 0, 'YXZ');
      });
      dolly.visible = cur.game === 'roulette' && x && x.n !== null && x.n !== undefined;
      if (dolly.visible) { const c = RL_CELLS.find(c => c.id === 'n' + x.n); dolly.position.copy(rlRect(c).p).setY(0.725); }
      puck.visible = cur.game === 'dice';
      if (puck.visible) {
        const pt = x && x.point, P = DICE_POINTS.find(p => p.n === pt);
        puck.material[1] = P ? puckOn : puckOff;
        puck.position.copy(P ? feltWorld(dc, DF.w, DF.d, P.x + P.w / 2, P.y + 0.1, dcFlip) : feltWorld(dc, DF.w, DF.d, PX0 - 0.25, MID.y + MID.h / 2, dcFlip)).setY(0.705);
      }
      if (bjKeys.visible) for (const b of bjButtons) {
        const enabled = !!my.on[b.id], aimed = enabled && hoverId === b.cap.userData.part;
        b.button.visible = b.id !== 'split' || enabled;
        b.face.color.setScalar(enabled ? aimed ? 1.18 : 1 : .30);
        b.side.emissive.set(b.side.color).multiplyScalar(aimed ? .25 : 0);
        const age = my.pressed?.id === b.cap.userData.part ? t - my.pressed.t : 9;
        b.cap.position.y = .023 - (age >= 0 && age < .18 ? Math.sin(age / .18 * Math.PI) * .008 : 0);
      }
      // the chips on the table
      const stacks = my.stacks || [], stackKey = JSON.stringify(stacks.map(s => [s.spot, s.amount, s.slot, s.anim, s.u, s.add && t - s.add < 0.2 ? t - s.add : null]));
      if (cur.stackKey === stackKey) return;
      cur.stackKey = stackKey;
      let n = 0, colorStart = MAXC, colorEnd = 0; const cs = CHIP_SCALE[cur.game] || 1.25;
      for (const s of stacks) {
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
          mtx.compose(pp, q, sc); stackMesh.setMatrixAt(n, mtx);
          if (chipKinds[n] !== list[j]) { chipKinds[n] = list[j]; stackMesh.setColorAt(n, chipCols[list[j]]); colorStart = Math.min(colorStart, n); colorEnd = n + 1; }
        }
      }
      stackMesh.count = n;
      // Preserve pending ranges if more than one update precedes a draw. Three
      // merges/clears them after uploading, including color changes in old tails.
      if (n) { stackMesh.instanceMatrix.addUpdateRange(0, n * 16); stackMesh.instanceMatrix.needsUpdate = true; }
      if (colorEnd) { stackMesh.instanceColor.addUpdateRange(colorStart * 3, (colorEnd - colorStart) * 3); stackMesh.instanceColor.needsUpdate = true; }
    },
  };
}
const Y = new THREE.Vector3(0, 1, 0);
