// Bounded, deterministic host simulations. Cabinet-local metres, +z toward the player.
export const ARCADE = Object.freeze({ step: 1 / 120, pusherTokens: 5, clawTries: 3, seconds: 60 });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function arcadeNew(game, id, seat, player, bet, hot = false) {
  const r = { game, id, seat, player, bet, hot, phase: 'aim', used: 0, score: 0, time: ARCADE.seconds,
    elapsed: 0, acc: 0, seq: 0, paid: false, abandoned: false, x: 0, z: 0, timer: 0, shelf: -.42, grabbed: -1, coins: [], prizes: [] };
  if (game === 'pusher') for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
    r.coins.push({ id: r.coins.length, x: (col - 3) * .115 + (row % 2) * .025, z: -.14 + row * .115, y: .86, paid: false, falling: false });
  }
  else for (let i = 0; i < 9; i++) r.prizes.push({ id: i, x: (i % 3 - 1) * .29, z: (Math.floor(i / 3) - 1) * .26, value: i % 3 + 1, taken: false });
  return r;
}
export const arcadeMultiplier = r => r.game === 'claw' ? r.score / 3 : r.score < 2 ? 0 : r.score < 4 ? .5 : r.score < 6 ? 1 : r.score < 9 ? 1.5 : r.score < 12 ? 2 : 3;
export function arcadeMove(r, dx, dz, seq) {
  if (!r || r.phase !== 'aim' || r.abandoned || seq !== r.seq + 1 || !Number.isFinite(dx) || !Number.isFinite(dz)) return false;
  // A message moves one detent; sending a large value cannot teleport the carriage.
  r.x = clamp(r.x + clamp(dx, -1, 1) * .075, -.43, .43);
  if (r.game === 'claw') r.z = clamp(r.z + clamp(dz, -1, 1) * .075, -.36, .36);
  r.seq = seq; return true;
}
export function arcadeDrop(r, seq) {
  if (!r || r.phase !== 'aim' || r.abandoned || seq !== r.seq + 1 || r.used >= (r.game === 'pusher' ? ARCADE.pusherTokens : ARCADE.clawTries)) return false;
  r.seq = seq; r.used++; r.timer = 0; r.phase = 'drop';
  if (r.game === 'pusher') r.coins.push({ id: r.coins.length, x: r.x, z: -.31, y: 1.65, paid: false, falling: true });
  else r.grabbed = -1;
  return true;
}
function step(r, dt) {
  r.elapsed += dt; r.timer += dt;
  if (r.game === 'pusher') {
    const prev = r.shelf; r.shelf = -.42 + (1 - Math.cos(r.elapsed * Math.PI)) * .115;
    const push = Math.max(0, r.shelf - prev);
    for (const c of r.coins) {
      if (c.paid) { c.y = Math.max(.38, c.y - dt * 1.1); continue; }
      if (c.falling) { c.y -= dt * 1.8; if (c.y <= .86) { c.y = .86; c.falling = false; } continue; }
      if (c.z < r.shelf + .16) c.z += push;
    }
    // Non-overlapping discs transmit a shelf's push through a finite pile.
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < r.coins.length; i++) {
      const a = r.coins[i]; if (a.paid || a.falling) continue;
      for (let j = i + 1; j < r.coins.length; j++) {
        const b = r.coins[j]; if (b.paid || b.falling) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d < .108) {
          const front = dz >= 0 ? b : a;
          front.z += Math.sqrt(Math.max(0, .108 ** 2 - dx ** 2)) - Math.abs(dz);
        }
      }
    }
    // Gold assistance visibly advances the coin bed during a protected drop.
    if (r.hot && r.phase === 'drop' && r.timer > .6) for (const c of r.coins) if (!c.paid && !c.falling) c.z += dt * .09;
    for (const c of r.coins) if (!c.paid && !c.falling && c.z >= .49) { c.paid = true; r.score++; }
    if (r.phase === 'drop' && r.timer >= 2.2) r.phase = r.used >= ARCADE.pusherTokens || r.abandoned ? 'settle' : 'aim';
    if (r.phase === 'settle' && r.timer >= 4.2) r.phase = 'done';
  } else if (r.phase === 'drop') {
    // Protected rounds visibly draw a prize under the magnet before the claw closes.
    if (r.hot && r.timer < .9) {
      const p = r.prizes.filter(p => !p.taken).sort((a, b) => Math.hypot(a.x-r.x,a.z-r.z)-Math.hypot(b.x-r.x,b.z-r.z))[0];
      if (p) { const f = Math.min(1, dt * 8); p.x += (r.x - p.x) * f; p.z += (r.z - p.z) * f; p.value = Math.max(2, p.value); }
    }
    if (r.timer >= 1 && r.grabbed === -1) {
      const p = r.prizes.filter(p => !p.taken && Math.hypot(p.x-r.x,p.z-r.z) <= .125).sort((a,b)=>Math.hypot(a.x-r.x,a.z-r.z)-Math.hypot(b.x-r.x,b.z-r.z))[0];
      r.grabbed = p ? p.id : -2; if (p) p.taken = true;
    }
    if (r.timer >= 3.2) {
      if (r.grabbed >= 0) r.score += r.prizes[r.grabbed].value;
      r.phase = r.used >= ARCADE.clawTries || r.abandoned ? 'done' : 'aim'; r.timer = 0; r.grabbed = -1;
    }
  }
}
export function arcadeTick(r, dt) {
  if (!r || r.phase === 'done' || !(dt > 0) || !Number.isFinite(dt)) return;
  r.time = Math.max(0, r.time - dt); if (!r.time) r.abandoned = true;
  if (r.abandoned && r.phase === 'aim') { r.phase = 'done'; return; }
  r.acc += Math.min(dt, 1);
  for (let n = 0; r.acc >= ARCADE.step && n < 120 && r.phase !== 'done'; n++) { step(r, ARCADE.step); r.acc -= ARCADE.step; }
}
export function arcadeView(r) {
  if (!r) return null;
  const { policy, paid, hot, acc, abandoned, ...out } = r;
  return { ...out, assist: hot, mult: arcadeMultiplier(r) };
}
