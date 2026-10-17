// Authored functional surfaces on the approved generated cabinet shell.
import * as THREE from 'three';
import * as T from './textures.js';
import { SKEE, SKEE_POCKETS } from '../skee.js';
import { SKEE_LANES } from '../map.js';
import { hasProp, placeProps } from './props.js';
import { MAT, v3, box, rbox, sph, basicGlow } from './world.js';

export function buildSkee(ctx, seats, screen, updaters) {
  const { group, B, lightSpots } = ctx, lean = -Math.atan(SKEE.slope), stretch = Math.sqrt(1 + SKEE.slope ** 2);
  const face = new THREE.Shape(); face.moveTo(-.54, -.64); face.lineTo(.54, -.64); face.lineTo(.54, .56); face.lineTo(-.54, .56); face.closePath();
  for (const p of SKEE_POCKETS) { const hole = new THREE.Path(); hole.absarc(p.x, (p.y - SKEE.boardY) * stretch, p.radius, 0, Math.PI * 2, true); face.holes.push(hole); }
  const boardGeo = new THREE.ExtrudeGeometry(face, { depth: .035, bevelEnabled: false, curveSegments: 32 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x193b35, roughness: .78 });
  const ballGeo = sph(SKEE.radius, 20), ballMat = new THREE.MeshStandardMaterial({ color: 0xeee3c8, roughness: .38, metalness: .08 });
  const ringGeos = new Map(), recessGeos = new Map(), labels = new Map(), labelGeos = [new THREE.PlaneGeometry(.16, .08), new THREE.PlaneGeometry(.19, .08)], powerGeo = box(.68, .013, .035);
  for (const p of SKEE_POCKETS) {
    if (!ringGeos.has(p.radius)) ringGeos.set(p.radius, new THREE.TorusGeometry(p.radius + .018, .018, 8, 36));
    if (!recessGeos.has(p.radius)) recessGeos.set(p.radius, new THREE.CircleGeometry(p.radius, 32));
    if (!labels.has(p.value)) labels.set(p.value, basicGlow(T.plaque(String(p.value), { w: 128, h: 64, font: '900 48px Arial', bg: '#142d28', ink: p.value === 100 ? '#ffdc82' : '#f8edc9', border: false }), 1.05));
  }
  const laneGeo = new THREE.PlaneGeometry(.96, 2.60, 1, 1), laneMat = new THREE.MeshStandardMaterial({ color: 0x88532d, roughness: .48, map: T.wood('#ad8251', '#694527') });
  const ramp = new THREE.BufferGeometry(), points = [], uv = [], indices = [];
  for (let i = 0; i <= 20; i++) { const z = -.38 - i / 20 * .44, y = .638 + .20 * (i / 20) ** 2; points.push(-.48, y, z, .48, y, z); uv.push(0, i / 20, 1, i / 20); if (i < 20) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); } }
  ramp.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); ramp.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ramp.setIndex(indices); ramp.computeVertexNormals();
  const arrowGeo = new THREE.ConeGeometry(.06, .19, 3), arrowMat = new THREE.MeshBasicMaterial({ color: 0xefd185 });
  const shells = [];
  for (const lane of SKEE_LANES) {
    const seat = seats.find(s => s.game === 'skee' && s.machine === lane.machine), x = lane.x / 60, z = lane.y / 60;
    const at = (dx, y, dz) => v3(x + dx, y, z + dz);
    if (hasProp('skeeCabinet')) shells.push({ x, z, scale: v3(1, 1, 1) });
    else {
      B.add(rbox(1.22, .56, 4.6, .04), MAT.darkWood, at(0, .28, 0));
      B.add(rbox(1.22, 1.4, .24, .05), MAT.darkWood, at(0, 1.28, -2.18));
      for (const side of [-1, 1]) B.add(rbox(.08, 1.4, 1.3, .025), MAT.gold, at(side * .57, 1.25, -1.65));
    }
    // A clean continuous lane covers the generated top; authored rails have consistent thickness.
    B.add(laneGeo, laneMat, at(0, .638, .90), 0, null, -Math.PI / 2);
    B.add(ramp, laneMat, at(0, 0, 0));
    for (const side of [-1, 1]) {
      B.add(rbox(.10, .12, 3.22, .025), MAT.darkWood, at(side * .54, .645, .64));
      B.add(rbox(.024, .025, 3.20, .008), MAT.gold, at(side * .54, .712, .64));
    }
    B.add(rbox(1.22, .11, .25, .035), MAT.darkWood, at(0, .725, 2.18));
    B.add(rbox(1.10, .015, .22, .015), MAT.gold, at(0, .785, 2.18));
    const root = new THREE.Group(); root.name = 'skee-lane-' + lane.machine; root.position.set(x, 0, z); root.userData.room = 'arcade'; group.add(root);
    const board = new THREE.Mesh(boardGeo, boardMat); board.name = 'skee-target-board'; board.rotation.x = lean;
    board.position.set(0, SKEE.boardY - Math.sin(-lean) * .035, SKEE.boardZ - Math.cos(lean) * .035); board.receiveShadow = true; root.add(board);
    for (const [i, p] of SKEE_POCKETS.entries()) {
      const ring = new THREE.Mesh(ringGeos.get(p.radius), MAT.gold); ring.name = 'skee-pocket-' + i; ring.position.set(p.x, p.y, p.z + .012); ring.rotation.x = lean; ring.userData.pocket = { ...p }; root.add(ring);
      // Black recessed backing makes each actual opening legible without drawing a false hole over solid art.
      const inside = new THREE.Mesh(recessGeos.get(p.radius), MAT.black); inside.position.set(p.x, p.y - .025, p.z - .09); inside.rotation.x = lean; root.add(inside);
      const label = new THREE.Mesh(labelGeos[p.value === 100 ? 1 : 0], labels.get(p.value)); label.name = 'skee-pocket-label-' + i;
      label.position.set(p.x + (i < 5 ? -.20 : 0), p.y + (i < 5 ? 0 : .15), p.z + (i < 5 ? .022 : -.015)); label.rotation.x = lean; root.add(label);
    }
    const rack = new THREE.InstancedMesh(ballGeo, ballMat, SKEE.balls); rack.name = 'skee-ball-rack'; rack.castShadow = true;
    const matrix = new THREE.Matrix4(); for (let i = 0; i < SKEE.balls; i++) rack.setMatrixAt(i, matrix.makeTranslation(.41, .777, 1.70 - i * .125)); root.add(rack);
    B.add(rbox(.15, .06, 1.18, .02), MAT.darkWood, at(.41, .69, 1.2));
    const moving = new THREE.Mesh(ballGeo, ballMat.clone()); moving.name = 'skee-live-ball'; moving.visible = false; moving.castShadow = true; root.add(moving);
    const arrow = new THREE.Mesh(arrowGeo, arrowMat); arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, .653, 1.4); arrow.visible = false; root.add(arrow);
    const power = new THREE.Mesh(powerGeo, arrowMat); power.position.set(0, .80, 2.18); power.visible = false; root.add(power);
    B.add(rbox(1.25, .30, .10, .025), MAT.darkWood, at(0, 1.99, -1.45));
    const score = screen({ w: 1.15, h: .24, cw: 768, ch: 160, pos: at(0, 1.99, -1.39), every: .1, far: 24, seat: seat.id,
      key: (_t, r) => r ? [r.id, r.score, r.launched, r.phase, r.last, r.seconds].join(':') : 'idle',
      paint: (g, w, h, _t, r) => {
        g.fillStyle = '#0c1816'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b68b43'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
        g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#edcc7c'; g.font = 'bold 43px Georgia'; g.fillText('SKEE-BALL', 22, 43);
        g.font = 'bold 24px Arial'; g.fillStyle = '#ece3c9'; g.fillText(r ? r.phase === 'done' ? r.mult + 'x RETURN' : (SKEE.balls - r.launched) + ' BALLS · ' + r.seconds + 's' : 'NINE BALLS', 22, 108);
        g.textAlign = 'right'; g.fillStyle = '#fff1c6'; g.font = 'bold 100px Arial'; g.fillText(String(r?.score || 0).padStart(3, '0'), w - 20, 84);
      }, arg: st => st.pub?.skee?.[lane.machine] || null });
    score.name = 'skee-score-' + lane.machine;
    const target = v3(0, 0, 0);
    let lastBall = '', prevPhase = '', lastAssist = false;
    updaters.push((_t, dt, st) => {
      const r = st.pub?.skee?.[lane.machine], b = r?.ball, my = st.my?.seat === seat.id ? st.my : null;
      rack.count = Math.max(0, SKEE.balls - (r?.launched || 0)); moving.visible = !!b;
      if (b) {
        const key = r.id + ':' + r.launched;
        if (key !== lastBall || b.stage !== prevPhase) moving.position.set(b.x, b.y, b.z);
        else moving.position.lerp(target.set(b.x, b.y, b.z), Math.min(1, dt * 35));
        moving.rotation.x -= dt * 5; lastBall = key; prevPhase = b.stage;
        if (lastAssist !== !!b.assist) { lastAssist = !!b.assist; moving.material.color.set(lastAssist ? 0xffcf5a : 0xeee3c8); }
      }
      arrow.visible = !!(my && r?.phase === 'aim'); power.visible = arrow.visible && my.extra?.power !== null;
      if (arrow.visible) { arrow.position.x = (my.extra?.aim || 0) * .12; arrow.rotation.z = -(my.extra?.aim || 0) * .13; }
      if (power.visible) { power.scale.x = Math.max(.01, my.extra.power); power.position.x = -.34 * (1 - my.extra.power); }
    });
    lightSpots.push({ p: at(0, 2.9, -.3), color: 0xffdc9c, power: 3, range: 5 });
  }
  if (shells.length) placeProps(group, 'skeeCabinet', shells);
}
