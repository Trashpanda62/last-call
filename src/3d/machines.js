// Every game's station in 3D: tables, cabinets, consoles, the duck pond and the big screens.
// Screens repaint from the shared painters (paint.js). The station you are sitting at shows your own game and gets
// the hands-on parts (rig.js): state.my comes from the table controller (tables.js tableView()).
import * as THREE from 'three';
import * as T from './textures.js';
import * as P from '../paint.js';
import * as Gm from '../games.js';
import { MAT, GLOWS, glowMat, basicGlow, v3, box, rbox, cyl, sph, lathe, torus, yawOf, uvScale } from './world.js';
import { buildRig, rouletteLayoutTex, diceLayoutTex, LANE } from './rig.js';
import { BJ_TABLES, RL_TABLE, CRASH_SCREEN, PLINKO_YS, MINES_XS, TOWER_XS, POND, RACE_XS, SLOT_WEST_YS, SLOT_SOUTH_XS, JACKPOT, DICE_TABLE, WHEEL_X, COIN, OBSTACLES } from '../map.js';

const M = 1 / 60;

export function buildMachines(ctx, seats) {
  const { group, B, lightSpots, bulbs } = ctx;
  const screens = [];  // live canvases: { live, center, every, acc, arg(state) -> painter state, seat? }
  const updaters = []; // f(t, dt, state)
  const add = o => { group.add(o); return o; };
  const RC = { group, seatScreens: {}, slotLevers: {}, lanePlates: {}, deco: {} }, felts = {}; // for the rig
  // A live screen: a glowing plane showing a painter. Returns the mesh.
  function screen({ w, h, cw, ch, paint, pos, yaw = 0, tilt = 0, every = 0.2, strength = 1.15, seat = null, arg = () => null, far = 22 }) {
    const live = T.liveCanvas(cw, ch, paint);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basicGlow(live.tex, strength));
    m.position.copy(pos); m.rotation.set(-tilt, yaw, 0, 'YXZ'); add(m);
    screens.push({ live, center: pos.clone(), every, acc: Math.random() * every, arg, seat, far, mesh: m });
    return m;
  }
  const seatOf = (game, machine) => seats.find(s => s.game === game && s.machine === machine);
  const beamTex = (() => { const [c, g] = T.canvas(4, 256); const lg = g.createLinearGradient(0, 0, 0, 256); lg.addColorStop(0, 'rgba(255,255,255,0.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.fillRect(0, 0, 4, 256); return T.tex(c, false); })();
  // A soft cone of light from the ceiling (fake volumetric spotlight).
  function beam(x, z, color = 0xffe0b0, rb = 1.3, top = 3.5, bottom = 0.9) {
    const mat = new THREE.MeshBasicMaterial({ map: beamTex, color: new THREE.Color(color).multiplyScalar(0.16), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    GLOWS.push({ m: mat, k: 'color', v: 0.16, base: new THREE.Color(color) });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, rb, top - bottom, 28, 1, true), mat);
    m.position.set(x, (top + bottom) / 2, z); add(m);
    const lamp = new THREE.Mesh(cyl(0.18, 0.14, 0.12, 16), glowMat(color, 3)); lamp.position.set(x, top + 0.04, z); add(lamp);
  }

  // ---------- Blackjack ----------
  const bjCards = { mine: [], dealer: [] };
  const cardGeo = new THREE.PlaneGeometry(0.11, 0.155);
  const cardMats = {};
  const cardMat = c => { const k = c ? c.rank + c.suit : 'back'; return cardMats[k] || (cardMats[k] = new THREE.MeshStandardMaterial({ map: c ? T.cardTex(c.rank + c.suit, c.suit === '♥' || c.suit === '♦') : T.cardBack(), roughness: 0.55 })); };
  const cardPool = []; const takeCard = () => { const m = new THREE.Mesh(cardGeo, cardMat(null)); m.rotation.x = -Math.PI / 2; m.castShadow = true; add(m); cardPool.push(m); return m; };
  for (let i = 0; i < 16; i++) takeCard().visible = false;
  const decoCards = []; // two cards in front of each occupied blackjack seat
  BJ_TABLES.forEach((tb, ti) => {
    const cx = tb.x * M, z0 = tb.y * M, rx = 2.0, rz = 1.67;
    const half = (ax, az) => { const s = new THREE.Shape(); for (let i = 0; i <= 40; i++) { const t = Math.PI * i / 40; s.lineTo(Math.cos(t) * ax, -Math.sin(t) * az); } s.closePath(); return s; };
    const rail = new THREE.ExtrudeGeometry(half(rx + 0.2, rz + 0.2), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.07, bevelSegments: 5, curveSegments: 40 });
    B.add(rail, MAT.leather, v3(cx, 0.74, z0), 0, null, -Math.PI / 2);
    const top = new THREE.ShapeGeometry(half(rx, rz), 48);
    const pos = top.attributes.position, uv = top.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + rx) / (2 * rx), 1 + pos.getY(i) / rz);
    const felt = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ map: T.bjFelt(ti ? '#1a3a7a' : '#1b6a40'), roughness: 0.95 }));
    felt.rotation.x = -Math.PI / 2; felt.position.set(cx, 0.875, z0); felt.receiveShadow = true; add(felt);
    B.add(cyl(0.45, 0.6, 0.74, 24), MAT.darkWood, v3(cx, 0.37, z0 + rz * 0.4));
    B.add(rbox(rx * 2 + 0.4, 0.14, 0.32, 0.04), MAT.darkWood, v3(cx, 0.82, z0 - 0.1));
    B.add(rbox(0.8, 0.05, 0.22, 0.02), MAT.black, v3(cx, 0.895, z0 + 0.15));
    B.add(rbox(0.22, 0.13, 0.32, 0.02), MAT.blackGloss, v3(cx + 0.75, 0.94, z0 + 0.22), -0.4);
    chipRack(B, cx, z0 + 0.15);
    beam(cx, z0 + 0.8, 0xffe0b0, 1.9);
    lightSpots.push({ p: v3(cx, 2.6, z0 + 0.8), color: 0xffe2c0, power: 5, range: 6 });
    // table limit plaque
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), basicGlow(T.plaque(ti ? 'HIGH ROLLERS' : 'BLACKJACK', { w: 512, h: 120, font: 'bold 54px Georgia' }), 1.1));
    pl.position.set(cx, 1.15, z0 - 0.24); add(pl);
    for (const s of seats.filter(s => s.game === 'bj' && s.table === ti)) {
      const f = v3(Math.cos(s.face), 0, Math.sin(s.face)), at = v3(s.x * M, 0.879, s.y * M).addScaledVector(f, 0.62);
      const pair = [takeCard(), takeCard()];
      pair.forEach((m, k) => { m.position.set(at.x + (k - 0.5) * 0.07, 0.879 + k * 0.001, at.z); m.rotation.z = yawOf(s.face) + (k - 0.5) * 0.3; m.material = cardMat(k ? Gm.card() : null); });
      decoCards.push({ seat: s.id, pair, at, yaw: yawOf(s.face) });
    }
  });
  updaters.push((t, dt, st) => {
    const occ = st.pub ? st.pub.seatsOcc : [];
    const my = st.my && st.my.game === 'bj' ? st.my : null;
    for (const d of decoCards) { const show = occ[d.seat] !== null && occ[d.seat] !== undefined && !(my && my.seat === d.seat); d.pair.forEach(m => { m.visible = show; }); }
    // my hand and the dealer's on the felt
    const used = new Set(decoCards.flatMap(d => d.pair));
    const free = cardPool.filter(m => !used.has(m)); let k = 0;
    if (my && my.view) {
      const s = seats[my.seat], tb = BJ_TABLES[s.table], f = v3(Math.cos(s.face), 0, Math.sin(s.face)), r = v3(-f.z, 0, f.x);
      const a = Math.atan2((s.y - tb.y) / 152, (s.x - tb.x) / 168);
      const base = v3(tb.x * M + Math.cos(a) * 1.68, 0.88, tb.y * M + Math.sin(a) * 1.305).addScaledVector(f, 0.24); // just past the betting circle
      my.view.hands.forEach((hd, j) => hd.cards.forEach((c, i) => {
        const m = free[k++]; if (!m) return; m.visible = true; m.material = cardMat(c);
        const off = (my.view.hands.length > 1 ? (j ? 0.17 : -0.17) : 0) + (i - (hd.cards.length - 1) / 2) * 0.075;
        m.position.copy(base).addScaledVector(r, off).addScaledVector(f, i * 0.02); m.position.y = 0.881 + i * 0.001; m.rotation.z = yawOf(s.face) + Math.PI;
      }));
      my.view.dealer.forEach((c, i) => {
        const m = free[k++]; if (!m) return; m.visible = true; m.material = cardMat(my.view.hide && i === 1 ? null : c);
        m.position.set(tb.x * M + (i - (my.view.dealer.length - 1) / 2) * 0.12, 0.881 + i * 0.001, tb.y * M + 0.42); m.rotation.z = 0;
      });
    }
    for (; k < free.length; k++) free[k].visible = false;
  });

  // ---------- Roulette ----------
  {
    const o = RL_TABLE, cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M, w = o.w * M, d = o.h * M;
    B.add(rbox(w + 0.3, 0.14, d + 0.3, 0.07), MAT.leather, v3(cx, 0.81, cz));
    B.add(rbox(w - 0.3, 0.74, d - 0.5, 0.05), MAT.darkWood, v3(cx, 0.37, cz));
    const fw = (o.w - 110) * M;
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(fw, d - 0.05), new THREE.MeshStandardMaterial({ map: rouletteLayoutTex(), roughness: 0.95 }));
    felt.rotation.set(-Math.PI / 2, 0, 0); felt.position.set(o.x * M + fw / 2 + 0.05, 0.885, cz); felt.receiveShadow = true; add(felt); felts.roulette = felt;
    const wx = (o.x + o.w - 55) * M, wz = cz;
    B.add(cyl(0.78, 0.66, 0.16, 48), MAT.darkWood, v3(wx, 0.93, wz)); B.add(torus(0.72, 0.04, 8, 56), MAT.gold, v3(wx, 1.01, wz), 0, null, Math.PI / 2);
    const wheel = new THREE.Group(); wheel.position.set(wx, 1.0, wz); add(wheel);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.64, 64), new THREE.MeshStandardMaterial({ map: T.wheelTex(), roughness: 0.3, metalness: 0.2 }));
    disc.rotation.x = -Math.PI / 2; wheel.add(disc);
    const hub = new THREE.Mesh(lathe([[0, 0.13], [0.03, 0.13], [0.02, 0.06], [0.08, 0.02], [0.12, 0]], 16), MAT.gold); wheel.add(hub);
    for (let i = 0; i < 4; i++) { const arm = new THREE.Mesh(cyl(0.012, 0.012, 0.22, 6), MAT.gold); arm.rotation.z = Math.PI / 2; arm.rotation.y = i * Math.PI / 2; arm.position.y = 0.06; arm.position.x = Math.cos(i * Math.PI / 2) * 0.11; arm.position.z = -Math.sin(i * Math.PI / 2) * 0.11; wheel.add(arm); }
    const ball = add(new THREE.Mesh(sph(0.025, 12), MAT.porcelain));
    beam(cx, cz, 0xffe0b0, 2.2); lightSpots.push({ p: v3(cx, 2.6, cz), color: 0xffe2c0, power: 5, range: 6 });
    let rot = 0;
    updaters.push((t, dt, st) => {
      const my = st.my && st.my.game === 'roulette' ? st.my : null, sp = my && my.view && my.view.spin;
      const u = sp ? Math.min(1, (t - sp.t0) / sp.dur) : 1;
      rot += dt * (0.9 + (sp ? (1 - u) * 5 : 0)); wheel.rotation.y = rot;
      if (sp) {
        const idx = Gm.RL_ORDER.indexOf(sp.n), e = 1 - Math.pow(1 - u, 3);
        const land = (idx + 0.5) / 37 * Math.PI * 2 - rot;
        const a = land + (1 - e) * 40, r = 0.5 + (1 - e) * 0.13;
        ball.position.set(wx + Math.cos(a) * r, 1.0 + (u < 1 ? 0.02 : 0.005), wz + Math.sin(a) * r);
      } else { const a = -t * 1.7, r = 0.52 + Math.sin(t * 0.3) * 0.05; ball.position.set(wx + Math.cos(a) * r, 1.02, wz + Math.sin(a) * r); }
    });
  }

  // ---------- Slots ----------
  const slotColors = [0xb01828, 0x6a1ab0, 0x1a8a9a, 0xd0306a, 0x2a50c0, 0xb06a10];
  const slotDefs = [
    ...SLOT_WEST_YS.map((y, i) => ({ x: 45, y, face: 0, machine: i })),
    ...SLOT_SOUTH_XS.map((x, i) => ({ x, y: 1855, face: -Math.PI / 2, machine: 5 + i })),
  ];
  for (const sd of slotDefs) {
    const s = seatOf('slots', sd.machine), high = s.tier === 'high';
    const yaw = yawOf(sd.face), fwd = v3(Math.sin(yaw), 0, Math.cos(yaw)), right = v3(Math.cos(yaw), 0, -Math.sin(yaw));
    const at = (f, u, y) => v3(sd.x * M, y, sd.y * M).addScaledVector(fwd, f).addScaledVector(right, u);
    const body = high ? MAT.blackGloss : MAT.candy(slotColors[sd.machine % slotColors.length]);
    const trim = high ? MAT.gold : MAT.chrome;
    B.add(rbox(0.78, 1.05, 0.62, 0.06), body, at(0, 0, 0.525), yaw);
    B.add(rbox(0.76, 0.06, 0.66, 0.02), trim, at(0.01, 0, 1.06), yaw);
    B.add(rbox(0.74, 0.22, 0.34, 0.04), body, at(0.2, 0, 1.15), yaw, null, 0.35); // button deck
    B.add(rbox(0.78, 0.95, 0.5, 0.06), body, at(-0.05, 0, 1.6), yaw);
    B.add(rbox(0.82, 0.08, 0.54, 0.03), trim, at(-0.05, 0, 2.09), yaw);
    const arch = new THREE.CylinderGeometry(0.39, 0.39, 0.4, 32, 1, false, -Math.PI / 2, Math.PI);
    B.add(arch, body, at(-0.05, 0, 2.13), yaw, null, 0, Math.PI / 2);
    // topper glow and label
    const topMat = glowMat(high ? 0xffc040 : slotColors[sd.machine % slotColors.length], 1.6);
    B.add(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 32, 1, false, -Math.PI / 2, Math.PI), topMat, at(0.16, 0, 2.13), yaw, null, 0, Math.PI / 2);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.16), basicGlow(T.neonTexture(high ? '$ HIGH $' : sd.machine % 2 ? '777' : 'LUCKY', high ? '#ffd040' : '#ff7ac8', 512, 150, 'bold italic 100px Georgia'), 1.6, { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    lbl.position.copy(at(0.21, 0, 2.27)); lbl.rotation.y = yaw; add(lbl);
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(cyl(0.035, 0.035, 0.02, 14), glowMat([0xff3a3a, 0xffd040, 0x3fff8a][k], 2)); b.position.copy(at(0.3, (k - 1) * 0.18, 1.21)); b.rotation.set(0.35, yaw, 0, 'YXZ'); add(b); }
    // the lever pivots at its foot; pulling it swings the ball toward you
    const lever = new THREE.Group(); lever.position.copy(at(0, 0.44, 1.1)); lever.rotation.set(0, yaw, 0, 'YXZ'); add(lever);
    const stick = new THREE.Mesh(cyl(0.02, 0.02, 0.5, 8), MAT.chrome); stick.position.y = 0.25; lever.add(stick);
    const knob = new THREE.Mesh(sph(0.055, 12), MAT.candy(0xe0203a)); knob.position.y = 0.52; knob.castShadow = true; lever.add(knob);
    B.add(cyl(0.045, 0.05, 0.08, 14), MAT.chrome, at(0, 0.42, 1.1), yaw, null, 0, Math.PI / 2);
    RC.slotLevers[s.id] = lever;
    screen({ w: 0.62, h: 0.48, cw: 384, ch: 300, paint: (g, w, h, t, a) => P.paintSlots(g, w, h, t, a), pos: at(0.205, 0, 1.62), yaw, tilt: 0, every: 0.25, seat: s.id, arg: st => st.my && st.my.seat === s.id ? { tier: s.tier, ...st.my.view, bet: st.my.extra && st.my.extra.bet } : { tier: s.tier } });
    for (let k = 0; k < 9; k++) bulbs.push({ p: at(0.2, Math.cos(Math.PI * k / 8) * 0.43, 2.13 + Math.sin(Math.PI * k / 8) * 0.43), phase: k + sd.machine });
  }
  lightSpots.push({ p: v3(110 * M, 2.6, 1520 * M), color: 0xff70c0, power: 4, range: 7 }, { p: v3(620 * M, 2.6, 1790 * M), color: 0xffc040, power: 4, range: 7 });
  // The jackpot tower: the crew bank and the target on four screens.
  {
    const x = JACKPOT.x * M, z = JACKPOT.y * M;
    B.add(rbox(1.25, 0.3, 1.25, 0.06), MAT.gold, v3(x, 0.15, z)); B.add(rbox(1.1, 2.6, 1.1, 0.08), MAT.blackGloss, v3(x, 1.6, z)); B.add(rbox(1.3, 0.2, 1.3, 0.06), MAT.gold, v3(x, 2.95, z));
    const live = T.liveCanvas(512, 320, (g, w, h, t, pub) => P.paintBankBoard(g, w, h, t, pub));
    const mat = basicGlow(live.tex, 1.15);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), mat); m.position.set(x + Math.sin(a) * 0.56, 2.1, z + Math.cos(a) * 0.56); m.rotation.y = a; add(m); }
    screens.push({ live, center: v3(x, 2.1, z), every: 0.3, acc: 0, arg: st => st.pub, far: 30 });
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; bulbs.push({ p: v3(x + Math.cos(a) * 0.72, 3.08, z + Math.sin(a) * 0.72), phase: i }); }
  }

  // ---------- Crash ----------
  {
    const w = (CRASH_SCREEN.x1 - CRASH_SCREEN.x0) * M * 0.9, h = 2.7, cx = (CRASH_SCREEN.x0 + CRASH_SCREEN.x1) / 2 * M, z = 20 * M + 0.08;
    B.add(rbox(w + 0.3, h + 0.3, 0.14, 0.06), MAT.blackGloss, v3(cx, 1.95, z - 0.02));
    B.add(box(w + 0.36, 0.04, 0.04), glowMat(0xff3fa4, 2.6), v3(cx, 1.95 + h / 2 + 0.17, z + 0.05)); B.add(box(w + 0.36, 0.04, 0.04), glowMat(0x3fe0ff, 2.6), v3(cx, 1.95 - h / 2 - 0.17, z + 0.05));
    screen({ w, h, cw: 1024, ch: 384, paint: (g, W, H, t, a) => P.paintCrash(g, W, H, t, a && a.C, a && a.me), pos: v3(cx, 1.95, z + 0.06), every: 1 / 20, strength: 1.2, far: 40, arg: st => st.pub && { C: st.pub.crash, me: st.priv ? st.priv.me : -1 } });
    for (const o of OBSTACLES.filter(o => o.kind === 'crashDesk')) {
      const x = (o.x + o.w / 2) * M, dz = (o.y + o.h / 2) * M;
      B.add(rbox(0.7, 0.95, 0.42, 0.05), MAT.candy(0x2a1a5a), v3(x, 0.475, dz)); B.add(rbox(0.72, 0.06, 0.48, 0.02), MAT.chrome, v3(x, 0.98, dz));
      const btn = new THREE.Mesh(cyl(0.09, 0.09, 0.04, 20), glowMat(0x3fff8a, 2.2)); btn.position.set(x, 1.02, dz + 0.08); add(btn);
      const cs = seats.find(q => q.game === 'crash' && Math.abs(q.x * M - x) < 0.3); if (cs) RC.deco[cs.id] = [btn];
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.12), basicGlow(T.plaque('CASH OUT', { w: 512, h: 120, bg: '#0a2a14', ink: '#3fff8a', font: '900 64px Arial Black, sans-serif' }), 1.2));
      lbl.position.set(x, 0.75, dz + 0.215); add(lbl);
    }
    lightSpots.push({ p: v3(cx, 2.4, z + 2.5), color: 0xff70d0, power: 6, range: 9 });
  }

  // ---------- Plinko ----------
  const pegGeo = sph(0.013, 8), ballGeo = sph(0.028, 14);
  const pegMat = glowMat(0xcfe4ff, 1.4), ballMat = new THREE.MeshStandardMaterial({ color: 0xff3fa4, emissive: 0xff3fa4, emissiveIntensity: 0.8, roughness: 0.2 });
  PLINKO_YS.forEach((y, i) => {
    const s = seatOf('plinko', i), yaw = yawOf(Math.PI), fwd = v3(Math.sin(yaw), 0, Math.cos(yaw)), right = v3(Math.cos(yaw), 0, -Math.sin(yaw));
    const base = v3(2955 * M, 0, y * M);
    const at = (f, u, yy) => base.clone().addScaledVector(fwd, f).addScaledVector(right, u).setY(yy);
    B.add(rbox(1.5, 0.8, 0.9, 0.06), MAT.candy(0x1a2a8a), at(0, 0, 0.4), yaw);
    B.add(rbox(1.5, 1.9, 0.3, 0.06), MAT.candy(0x1a2a8a), at(-0.3, 0, 1.75), yaw);
    B.add(rbox(1.56, 0.1, 0.36, 0.03), MAT.chrome, at(-0.3, 0, 2.72), yaw);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 1.75), new THREE.MeshStandardMaterial({ color: 0x050a20, roughness: 0.6 })); back.position.copy(at(-0.14, 0, 1.75)); back.rotation.y = yaw; add(back);
    const rows = Gm.PLINKO_ROWS, sp = 0.078, topY = 2.48;
    const pegs = []; for (let r = 0; r < rows; r++) for (let k = 0; k <= r + 2; k++) pegs.push([(k - (r + 2) / 2) * sp, topY - r * sp]);
    const im = new THREE.InstancedMesh(pegGeo, pegMat, pegs.length);
    pegs.forEach(([u, yy], j) => im.setMatrixAt(j, new THREE.Matrix4().makeTranslation(at(-0.12, u, yy))));
    add(im);
    const bucketY = topY - rows * sp - 0.02;
    const [bc, bg] = T.canvas(1024, 64);
    const mults = Gm.PLINKO.high;
    mults.forEach((m, j) => { const hot = Math.abs(j - rows / 2) / (rows / 2); bg.fillStyle = `hsl(${50 - hot * 50},95%,${45 + hot * 10}%)`; bg.fillRect(j * 1024 / 17 + 3, 4, 1024 / 17 - 6, 56); bg.fillStyle = '#1a0a00'; bg.font = '900 22px Arial Black, sans-serif'; bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.fillText(m >= 100 ? m : m + 'x', j * 1024 / 17 + 30, 32); });
    const bucket = new THREE.Mesh(new THREE.PlaneGeometry(sp * 17, 0.07), basicGlow(T.tex(bc, false), 1.2)); bucket.position.copy(at(-0.12, 0, bucketY)); bucket.rotation.y = yaw; add(bucket);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 1.75), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.08, clearcoat: 1 })); glass.position.copy(at(-0.06, 0, 1.75)); glass.rotation.y = yaw; add(glass);
    for (const side of [-1, 1]) B.add(box(0.03, 1.8, 0.03), glowMat(0x3fe0ff, 2.4), at(-0.08, side * 0.72, 1.75), yaw);
    B.add(rbox(0.6, 0.18, 0.3, 0.04), MAT.candy(0x1a2a8a), at(0.38, 0, 0.92), yaw, null, 0.4);
    const go = new THREE.Mesh(cyl(0.07, 0.07, 0.03, 20), glowMat(0xff3fa4, 2.4)); go.position.copy(at(0.45, 0, 1.0)); add(go); RC.deco[s.id] = [go];
    const balls = []; for (let k = 0; k < 6; k++) { const b = add(new THREE.Mesh(ballGeo, ballMat)); b.visible = false; balls.push(b); }
    let idle = [];
    updaters.push((t, dt, st) => {
      const my = st.my && st.my.seat === s.id && st.my.view ? st.my.view.balls : null;
      let list = my;
      if (!list) { idle = idle.filter(b => t - b.t0 < rows * P.PLINKO_ROW_T + 0.5); if (!idle.length || t - idle[idle.length - 1].t0 > 1.8 + i * 0.3) idle.push({ path: Gm.plinkoDrop('medium').path, t0: t }); list = idle; }
      balls.forEach((b, k) => {
        const it = list[list.length - 1 - k];
        if (!it) { b.visible = false; return; }
        const p = P.plinkoPos(it.path, (t - it.t0) / P.PLINKO_ROW_T);
        b.visible = true; b.position.copy(at(-0.1, p.x * sp, topY + sp * 0.6 - (p.y + 0.4) * sp));
      });
    });
    lightSpots.push({ p: at(1.2, 0, 2.4), color: 0x60d0ff, power: 3, range: 5 });
  });

  // ---------- Mines and Dragon Tower consoles ----------
  const consoles = [...MINES_XS.map((x, i) => ({ x, game: 'mines', i, col: 0x0e6a3a, glow: 0x3fff8a })), ...TOWER_XS.map((x, i) => ({ x, game: 'tower', i, col: 0x8a3a0e, glow: 0xffa040 }))];
  for (const c of consoles) {
    const s = seatOf(c.game, c.i), yaw = yawOf(-Math.PI / 2);
    const x = c.x * M, z = 676 * M;
    B.add(rbox(0.8, 0.95, 0.55, 0.06), MAT.candy(c.col), v3(x, 0.475, z), yaw);
    B.add(rbox(0.86, 0.6, 0.12, 0.05), MAT.candy(c.col), v3(x, 1.3, z + 0.08), yaw, null, -0.45);
    B.add(box(0.84, 0.03, 0.03), glowMat(c.glow, 2.4), v3(x, 0.97, z - 0.29), yaw);
    const pt = c.game === 'mines' ? P.paintMines : P.paintTower;
    RC.seatScreens[s.id] = screen({ w: 0.74, h: 0.46, cw: 512, ch: 320, paint: (g, w, h, t, a) => { pt(g, w, h, t, a && a.v); if (a && a.ui) P.paintUI(g, w, h, a.ui, c.game === 'mines' ? '#3fff8a' : '#ffa040'); }, pos: v3(x, 1.3, z + 0.0), yaw, tilt: 0.45, every: 0.3, seat: s.id, arg: st => st.my && st.my.seat === s.id ? { v: st.my.view, ui: st.my.ui } : null });
  }
  lightSpots.push({ p: v3(2210 * M, 2.5, 560 * M), color: 0x60ffa0, power: 3, range: 6 }, { p: v3(2770 * M, 2.5, 560 * M), color: 0xffa060, power: 3, range: 6 });

  // ---------- Duck pond ----------
  {
    const x0 = POND.x * M, x1 = (POND.x + POND.w) * M, z0 = POND.y * M, z1 = (POND.y + POND.h) * M, cz = (z0 + z1) / 2, W = x1 - x0, D = z1 - z0;
    const tileRim = new THREE.MeshStandardMaterial({ map: T.tiles('#d4e2e0', '#4fa8b8'), roughness: 0.3 });
    for (const [x, z, w, d] of [[(x0 + x1) / 2, z0, W + 0.2, 0.2], [(x0 + x1) / 2, z1, W + 0.2, 0.2], [x0, cz, 0.2, D], [x1, cz, 0.2, D]]) B.add(uvScale(box(w, 0.55, d), w / 0.5, 1), tileRim, v3(x, 0.275, z));
    const [wc, wg] = T.canvas(256, 256);
    const waterTex = T.tex(wc); waterTex.repeat.set(W / 1.5, D / 1.5);
    const paintWater = t => { wg.fillStyle = '#1aa0c8'; wg.fillRect(0, 0, 256, 256); wg.strokeStyle = 'rgba(255,255,255,0.35)'; wg.lineWidth = 3; for (let i = 0; i < 9; i++) { wg.beginPath(); for (let x = 0; x <= 256; x += 8) wg.lineTo(x, i * 30 + Math.sin(x * 0.05 + t * 2 + i) * 6); wg.stroke(); } waterTex.needsUpdate = true; };
    paintWater(0);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, D - 0.1), new THREE.MeshPhysicalMaterial({ map: waterTex, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, color: 0xffffff, emissive: 0x0a4a6a, emissiveIntensity: 0.4 }));
    water.rotation.x = -Math.PI / 2; water.position.set((x0 + x1) / 2, 0.42, cz); water.receiveShadow = true; add(water);
    screens.push({ live: { update: t => paintWater(t) }, center: water.position.clone(), every: 0.1, acc: 0, arg: () => null, far: 25 });
    const lanes = Gm.DUCKS.length, lw = D / lanes;
    // lane ropes: a thin line with a float every 0.6 m
    const buoys = []; for (let k = 1; k < lanes; k++) { B.add(cyl(0.008, 0.008, W - 0.5, 6), MAT.rope, v3((x0 + x1) / 2, 0.435, z0 + k * lw), 0, null, 0, Math.PI / 2); for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.6) buoys.push([x, z0 + k * lw]); }
    const bm = new THREE.InstancedMesh(sph(0.03, 10), new THREE.MeshStandardMaterial({ roughness: 0.35 }), buoys.length);
    buoys.forEach(([x, z], j) => { bm.setMatrixAt(j, new THREE.Matrix4().compose(v3(x, 0.435, z), new THREE.Quaternion(), v3(1.6, 0.8, 0.8))); bm.setColorAt(j, new THREE.Color(j % 2 ? 0xf4f0e8 : 0xd8382e)); }); add(bm);
    // start gate and finish arch
    for (const [x, col, txt] of [[x0 + 0.5, 0x3fe0ff, 'START'], [x1 - 0.6, 0xffd040, 'FINISH']]) {
      for (const z of [z0 - 0.1, z1 + 0.1]) B.add(cyl(0.05, 0.05, 2.2, 10), MAT.chrome, v3(x, 1.1, z));
      B.add(box(0.08, 0.3, D + 0.3), glowMat(col, 1.6), v3(x, 2.15, cz));
      const lb = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.26), basicGlow(T.plaque(txt, { w: 512, h: 110, bg: '#04121a', ink: '#' + new THREE.Color(col).getHexString(), font: '900 70px Arial Black, sans-serif' }), 1.2));
      lb.position.set(x - 0.05, 2.15, cz); lb.rotation.y = -Math.PI / 2; add(lb);
    }
    // the ducks
    const ducks = Gm.DUCKS.map((d, i) => {
      const g = new THREE.Group(), body = MAT.candy(new THREE.Color(d.color).getHex());
      const b = new THREE.Mesh(sph(0.16, 18), body); b.scale.set(1.25, 0.8, 1); b.castShadow = true; g.add(b);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 10), body); tail.position.set(-0.2, 0.08, 0); tail.rotation.z = 0.9; g.add(tail);
      const head = new THREE.Mesh(sph(0.1, 16), body); head.position.set(0.12, 0.17, 0); g.add(head);
      const beak = new THREE.Mesh(sph(0.05, 10), MAT.candy(0xff8a1a)); beak.scale.set(1.4, 0.45, 1); beak.position.set(0.22, 0.15, 0); g.add(beak);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(sph(0.02, 8), MAT.black); e.position.set(0.18, 0.21, s * 0.055); g.add(e); }
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), basicGlow(T.plaque(String(i + 1), { w: 64, h: 64, bg: '#fff', ink: '#111', font: '900 44px Arial Black, sans-serif', border: false }), 1));
      tag.position.set(-0.02, 0.05, 0.17); g.add(tag);
      g.position.set(x0 + 0.6, 0.45, z0 + (i + 0.5) * lw); add(g);
      return g;
    });
    let rt = 0, lastT = -1;
    updaters.push((t, dt, st) => {
      const R = st.pub && st.pub.race; if (!R) return;
      if (R.t !== lastT) { rt = R.t; lastT = R.t; } else rt += dt;
      const L = R.phase === 'run' ? Gm.raceLanes(Math.min(rt, Gm.RACE.runTime), R.winner, R.seed) : R.phase === 'show' ? Gm.raceLanes(Gm.RACE.runTime, R.winner, R.seed) : null;
      ducks.forEach((g, i) => {
        const u = L ? L[i] : 0;
        g.position.x = x0 + 0.55 + u * (W - 1.3);
        g.position.y = 0.45 + Math.sin(t * 4 + i) * 0.015;
        g.rotation.z = R.phase === 'run' ? Math.sin(t * 9 + i * 2) * 0.12 : Math.sin(t * 2 + i) * 0.05;
        if (R.phase === 'show' && i === R.winner) g.position.y += Math.abs(Math.sin(t * 6)) * 0.15;
      });
    });
    // tote board on the east wall
    const bw = 2.8, bh = 1.75, bz = cz;
    B.add(rbox(0.1, bh + 0.2, bw + 0.2, 0.04), MAT.blackGloss, v3(2980 * M - 0.05, 2.15, bz));
    screen({ w: bw, h: bh, cw: 640, ch: 400, paint: (g, w, h, t, a) => P.paintTote(g, w, h, t, a && a.R, a && a.me), pos: v3(2980 * M - 0.11, 2.15, bz), yaw: -Math.PI / 2, every: 1 / 10, far: 30, arg: st => st.pub && { R: st.pub.race, me: st.priv ? st.priv.me : -1 } });
    // each betting desk carries a race card: six duck lanes with this race's odds (you drop chips on a lane)
    const card = T.liveCanvas(768, 280, (g, w, h, t, R) => {
      g.fillStyle = '#062a3a'; g.fillRect(0, 0, w, h);
      Gm.DUCKS.forEach((d, i) => {
        const x = i * w / 6;
        g.fillStyle = i % 2 ? '#0a3a50' : '#0c4660'; g.fillRect(x, 0, w / 6, h);
        g.fillStyle = d.color; g.fillRect(x + 6, 6, w / 6 - 12, 26);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#04121a'; g.font = '900 20px "Arial Black", Impact, sans-serif'; g.fillText(String(i + 1), x + w / 12, 20);
        g.fillStyle = '#fff'; g.font = '900 19px "Arial Black", Impact, sans-serif'; g.fillText(d.name.toUpperCase(), x + w / 12, 52);
        g.fillStyle = '#ffd040'; g.font = '900 34px "Arial Black", Impact, sans-serif'; g.fillText(R ? P.xfmt(R.pays[i]) : '', x + w / 12, h - 36);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.setLineDash([10, 8]); g.lineWidth = 3; g.beginPath(); g.arc(x + w / 12, h * 0.52, 34, 0, 7); g.stroke(); g.setLineDash([]);
        if (i) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x - 1, 0, 2, h); }
      });
    });
    let cardRound = -1;
    screens.push({ live: { update: (t, R) => { if (R && R.round !== cardRound) { cardRound = R.round; card.update(t, R); } } }, center: v3(2500 * M, 0.9, 849 * M), every: 0.5, acc: 0, arg: st => st.pub && st.pub.race, far: 14 });
    const cardMat = new THREE.MeshStandardMaterial({ map: card.tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: card.tex, emissiveIntensity: 0.35 });
    for (const x of RACE_XS) {
      const dx = x * M, dz = (838 + 11) * M;
      B.add(rbox(1.1, 0.1, 0.45, 0.03), MAT.polished, v3(dx, 0.84, dz)); B.add(rbox(1.0, 0.8, 0.1, 0.03), MAT.candy(0x1a6a8a), v3(dx, 0.4, dz + 0.12));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(LANE.w, LANE.d), cardMat); m.position.set(dx, 0.893, dz); m.rotation.set(-Math.PI / 2, Math.PI, 0, 'YXZ'); add(m);
      const rs = seats.find(q => q.game === 'race' && q.x === x); if (rs) RC.lanePlates[rs.id] = m;
    }
    lightSpots.push({ p: v3((x0 + x1) / 2 - 3, 2.6, cz), color: 0x9fe8ff, power: 5, range: 8 }, { p: v3((x0 + x1) / 2 + 3, 2.6, cz), color: 0x9fe8ff, power: 5, range: 8 });
  }

  // ---------- Street dice ----------
  {
    const o = DICE_TABLE, cx = (o.x + o.w / 2) * M, cz = (o.y + o.h / 2) * M, w = o.w * M, d = o.h * M;
    B.add(rbox(w, 0.88, d, 0.3), MAT.darkWood, v3(cx, 0.44, cz));
    for (const [x, z, ww, dd] of [[cx, cz - d / 2 + 0.09, w - 0.1, 0.18], [cx, cz + d / 2 - 0.09, w - 0.1, 0.18], [cx - w / 2 + 0.09, cz, 0.18, d - 0.1], [cx + w / 2 - 0.09, cz, 0.18, d - 0.1]]) B.add(rbox(ww, 0.12, dd, 0.05), MAT.leather, v3(x, 0.92, z));
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.36, d - 0.36), new THREE.MeshStandardMaterial({ map: diceLayoutTex(), roughness: 0.95 }));
    felt.rotation.x = -Math.PI / 2; felt.position.set(cx, 0.89, cz); felt.receiveShadow = true; add(felt); felts.dice = felt;
    const pip = v => { const [c, g] = T.canvas(64, 64); g.fillStyle = '#f8f4ec'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#c0302a'; const P2 = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[v]; for (const [a, b] of P2) { g.beginPath(); g.arc(32 + a * 17, 32 + b * 17, 6, 0, 7); g.fill(); } return new THREE.MeshStandardMaterial({ map: T.tex(c, false), roughness: 0.3 }); };
    const faceMats = [3, 4, 1, 6, 2, 5].map(pip); // +x -x +y -y +z -z
    const dice = [0, 1].map(() => { const m = new THREE.Mesh(rbox(0.07, 0.07, 0.07, 0.012), faceMats); m.rotation.order = 'YXZ'; m.castShadow = true; add(m); return m; });
    const upRot = { 1: [0, 0], 6: [Math.PI, 0], 2: [-Math.PI / 2, 0], 5: [Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2] };
    dice.forEach((m, i) => { m.position.set(cx + 0.9 + i * 0.12, 0.93, cz + 0.1); });
    updaters.push((t, dt, st) => {
      const my = st.my && st.my.game === 'dice' && st.my.view && st.my.view.roll ? st.my : null;
      if (!my) return;
      const r = my.view.roll, s = seats[my.seat], u = Math.min(1, (t - r.t0) / 0.9), e = 1 - Math.pow(1 - u, 2);
      const from = v3(s.x * M, 1.15, s.y * M), to = v3(cx + (s.x * M < cx ? 1 : -1) * 0.2, 0.925, cz + (s.y * M < cz ? 0.5 : -0.5));
      dice.forEach((m, i) => {
        const p = from.clone().lerp(to, e); p.x += (i - 0.5) * 0.14; p.y = 0.925 + Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * 0.35 + (1 - e) * 0.2;
        m.position.copy(p);
        const [rx, rz] = upRot[r.dice[i]];
        m.rotation.set(rx + (1 - e) * 14 * (i ? 1 : -1), (i ? 0.4 : -0.3) + (1 - e) * 9, rz + (1 - e) * 11);
      });
    });
    beam(cx, cz, 0xffe0b0, 2.0, 3.6, 0.85);
    lightSpots.push({ p: v3(cx, 2.8, cz), color: 0xffd8a0, power: 5, range: 7 });
  }

  // ---------- Prize wheel ----------
  {
    const cx = WHEEL_X * M, z = 1880 * M - 0.25, cy = 2.0, R = 1.5;
    B.add(cyl(R + 0.15, R + 0.15, 0.2, 64), MAT.candy(0x3a1a5a), v3(cx, cy, z + 0.08), 0, null, Math.PI / 2);
    B.add(box(0.3, cy, 0.3), MAT.gold, v3(cx, cy / 2, z + 0.1));
    const wheel = new THREE.Group(); wheel.position.set(cx, cy, z - 0.05); wheel.rotation.y = Math.PI; add(wheel);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ map: T.prizeWheel(Gm.WHEEL.segs), roughness: 0.35, emissive: 0xffffff, emissiveMap: T.prizeWheel(Gm.WHEEL.segs), emissiveIntensity: 0.35 }));
    wheel.add(disc);
    const rim = new THREE.Mesh(torus(R, 0.06, 10, 96), MAT.gold); wheel.add(rim);
    const ptr = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 3), MAT.gold); ptr.position.set(cx, cy + R + 0.1, z - 0.15); ptr.rotation.z = Math.PI; add(ptr);
    for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; bulbs.push({ p: v3(cx + Math.cos(a) * (R + 0.12), cy + Math.sin(a) * (R + 0.12), z - 0.12), phase: k }); }
    for (const o of OBSTACLES.filter(o => o.kind === 'wheelDesk')) {
      const x = (o.x + o.w / 2) * M, dz = (o.y + o.h / 2) * M;
      B.add(rbox(0.6, 0.95, 0.45, 0.05), MAT.candy(0x3a1a5a), v3(x, 0.475, dz));
      const btn = new THREE.Mesh(cyl(0.1, 0.1, 0.04, 20), glowMat(0xffd040, 2.4)); btn.position.set(x, 0.98, dz); add(btn);
      const ws = seats.find(q => q.game === 'wheel' && Math.abs(q.x * M - x) < 0.3); if (ws) RC.deco[ws.id] = [btn];
    }
    updaters.push((t, dt, st) => {
      const my = st.my && st.my.game === 'wheel' && st.my.view ? st.my.view : null;
      wheel.children[0].rotation.z = -P.wheelAngle(my, t); wheel.children[1].rotation.z = wheel.children[0].rotation.z;
    });
    beam(cx, z - 1.2, 0xffd040, 1.6, 3.9, 0.3);
    lightSpots.push({ p: v3(cx, 2.8, z - 2), color: 0xffd080, power: 5, range: 7 });
  }

  // ---------- Coin flip ----------
  {
    const x = COIN.x * M, z = COIN.y * M;
    B.add(cyl(0.7, 0.8, 0.15, 8), MAT.gold, v3(x, 0.075, z)); B.add(cyl(0.55, 0.62, 0.85, 8), MAT.marble, v3(x, 0.55, z)); B.add(cyl(0.7, 0.6, 0.1, 8), MAT.gold, v3(x, 1.02, z));
    const coin = new THREE.Mesh(cyl(0.42, 0.42, 0.05, 48), [MAT.gold, new THREE.MeshStandardMaterial({ map: T.coinFace(true), metalness: 0.7, roughness: 0.3 }), new THREE.MeshStandardMaterial({ map: T.coinFace(false), metalness: 0.7, roughness: 0.3 })]);
    coin.castShadow = true; add(coin);
    for (const s of seats.filter(q => q.game === 'coin')) { // a betting stand in front of each coin seat
      const f = v3(Math.cos(s.face), 0, Math.sin(s.face)), p = v3(s.x * M, 0, s.y * M).addScaledVector(f, 0.74), yw = yawOf(s.face);
      B.add(rbox(0.92, 0.9, 0.56, 0.05), MAT.candy(0x3a1a5a), p.clone().setY(0.45), yw); B.add(rbox(0.96, 0.03, 0.6, 0.012), MAT.gold, p.clone().setY(0.91), yw);
    }
    updaters.push((t, dt, st) => {
      const my = st.my && st.my.game === 'coin' && st.my.view && st.my.view.flip ? st.my.view.flip : null;
      if (my) {
        const u = Math.min(1, (t - my.t0) / 1.2), e = 1 - Math.pow(1 - u, 3);
        coin.position.set(x, 1.1 + Math.sin(u * Math.PI) * 1.3, z); coin.rotation.set(e * Math.PI * 14 + (my.side === 'tails' ? Math.PI : 0), 0.3, 0);
      } else { coin.position.set(x, 1.6 + Math.sin(t * 1.5) * 0.08, z); coin.rotation.set(Math.PI / 2 - 0.2, t * 0.8, 0, 'YXZ'); }
    });
    beam(x, z, 0xffd040, 1.0, 3.6, 1.1);
    lightSpots.push({ p: v3(x, 2.8, z), color: 0xffd080, power: 4, range: 6 });
  }

  // ---------- The VIP TV shows the races and the rocket ----------
  if (ctx.vipTv) {
    const tv = ctx.vipTv;
    screen({ w: tv.w, h: tv.h, cw: 640, ch: 360, paint: (g, w, h, t, a) => a && a.crash ? P.paintCrash(g, w, h, t, a.C, a.me) : P.paintTote(g, w, h, t, a && a.R, a && a.me), pos: v3(tv.x, tv.y, tv.z), yaw: -Math.PI / 2, every: 1 / 10, far: 20, arg: st => st.pub && { crash: Math.floor(st.t / 20) % 2 === 0, C: st.pub.crash, R: st.pub.race, me: st.priv ? st.priv.me : -1 } });
  }

  const dealerSpots = [
    ...BJ_TABLES.map(t => ({ x: t.x, y: t.y - 32, a: Math.PI / 2 })),
    { x: RL_TABLE.x + RL_TABLE.w + 34, y: RL_TABLE.y + RL_TABLE.h / 2, a: Math.PI },
    { x: DICE_TABLE.x + DICE_TABLE.w + 34, y: DICE_TABLE.y + DICE_TABLE.h / 2, a: Math.PI },
  ];

  const rig = buildRig(RC, seats, felts);
  return {
    dealerSpots, rig,
    update(t, dt, state) {
      state.t = t;
      const cam = state.cam;
      for (const s of screens) {
        const mine = s.seat !== null && s.seat !== undefined && state.my && state.my.seat === s.seat;
        if (!mine && cam && s.center.distanceTo(cam) > s.far) continue;
        s.acc += dt;
        if (s.acc < (mine ? 1 / 30 : s.every)) continue;
        s.acc = 0; s.live.update(t, s.arg(state));
      }
      for (const u of updaters) u(t, dt, state);
      rig.update(t, dt, state.my);
    },
  };
}

function chipRack(B, x, z) {
  const chip = cyl(0.03, 0.03, 0.012, 14);
  const cols = [0xe8443a, 0x2a2a2a, 0x3ddc97, 0x4a7dff, 0xe8c46a, 0xa066ff];
  cols.forEach((c, i) => {
    const mat = MAT['chip' + i] || (MAT['chip' + i] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
    for (let k = 0; k < 6 + (i * 5) % 7; k++) B.add(chip, mat, v3(x - 0.22 + i * 0.075, 0.905 + k * 0.0125, z));
  });
}
