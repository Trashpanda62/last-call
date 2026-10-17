// Bounded skee-ball rules and lane physics, shared by the host and independent checks.
// Cabinet-local metres: +x right, +z toward the roller, y up. No DOM or random state.
export const SKEE = Object.freeze({ balls: 9, seconds: 90, step: 1 / 120, radius: .040,
  laneY: .638, rise: .32, front: 1.91, tip: -.82, boardZ: -1.50, boardY: 1.25, slope: .28, halfWidth: .49 });
export const SKEE_POCKETS = Object.freeze([
  { value: 10, x: 0, y: .84, radius: .095 }, { value: 20, x: 0, y: 1.04, radius: .092 },
  { value: 30, x: 0, y: 1.24, radius: .087 }, { value: 40, x: 0, y: 1.44, radius: .082 },
  { value: 50, x: 0, y: 1.64, radius: .078 },
  { value: 100, x: -.35, y: 1.64, radius: .082 }, { value: 100, x: .35, y: 1.64, radius: .082 },
].map(p => Object.freeze({ ...p, z: SKEE.boardZ - SKEE.slope * (p.y - SKEE.boardY) })));
export function skeeMultiplier(score) { return score < 120 ? 0 : score < 200 ? .5 : score < 300 ? 1 : score < 400 ? 1.5 : score < 550 ? 2 : 3; }
export function skeeNew(id, seat, player, bet, hot = false) {
  return { id, seat, player, bet, hot, phase: 'aim', launched: 0, score: 0, last: null, ball: null,
    time: SKEE.seconds, wait: 0, acc: 0, paid: false, abandoned: false, history: [] };
}
export function skeeLaunch(r, aim, power, sequence) {
  if (!r || r.phase !== 'aim' || r.abandoned || r.launched >= SKEE.balls || sequence !== r.launched + 1 || !Number.isFinite(aim) || !Number.isFinite(power)) return false;
  aim = Math.max(-1, Math.min(1, aim)); power = Math.max(0, Math.min(1, power));
  // Launch velocity follows the same curved ramp as the visible lane. A protected
  // roll chooses a launch energy up front; nothing steers the ball during flight.
  let speed = 3.40 + power * 1.66, lateral = aim * .40;
  if(r.hot) {
    const p=SKEE_POCKETS[4+((r.launched+1)%3)], distance=SKEE.tip-p.z;
    const tangent=2*.32/.44, needed=Math.sqrt(4.9*distance*distance/(tangent*distance-(p.y-(SKEE.laneY+SKEE.radius+SKEE.rise))));
    speed=Math.sqrt(needed*needed*(1+tangent*tangent)+2*9.8*SKEE.rise+2*.12*(SKEE.front-SKEE.tip));
    let z=SKEE.front,time=0;while(z>SKEE.tip){const v=laneVelocity(z,speed);z+=v*SKEE.step;time+=SKEE.step;}
    lateral=p.x/(time+distance/needed);
  }
  r.launched++; r.phase = 'roll'; r.wait = 0;
  r.ball = { x: 0, y: SKEE.laneY+SKEE.radius, z: SKEE.front, vx: lateral, vy: 0, vz: -speed, age: 0, stage: 'lane', launchSpeed:speed, power, aim, assist: false, spin: 0, bounces: 0 };
  return true;
}
function laneVelocity(z,speed){
  const u=Math.max(0,Math.min(1,(-z-.38)/.44)),slope=2*SKEE.rise*u/.44;
  return -Math.sqrt(Math.max(.04,(speed*speed-2*9.8*SKEE.rise*u*u-2*.12*(SKEE.front-z))/(1+slope*slope)));
}
const plane = b => b.z - SKEE.boardZ + SKEE.slope * (b.y - SKEE.boardY);
function caught(r, pocket) {
  const b = r.ball; r.last = pocket?.value || 0; r.score += r.last; r.history.push(r.last);
  b.stage = pocket ? 'pocket' : 'return'; b.from = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz }; b.age = 0;
  r.phase = 'result'; r.wait = pocket ? .65 : 1.05;
}
function step(r, dt) {
  const b = r.ball;
  if (r.phase === 'roll' && b) {
    b.age += dt;
    if (b.stage === 'lane') {
      // Conserve launch energy along the curved track. Euler acceleration at
      // the lip made adjacent power values leave at wildly different speeds.
      const v=laneVelocity(b.z,b.launchSpeed);
      const midpoint=b.z+v*dt/2;
      b.vz=laneVelocity(midpoint,b.launchSpeed);
      if(b.vz>=-.21){caught(r,null);return;}
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.y = SKEE.laneY+SKEE.radius + SKEE.rise * Math.max(0, Math.min(1, (-b.z - .38) / .44)) ** 2;
      b.spin += Math.hypot(b.vx,b.vz) * dt / SKEE.radius;
      if (Math.abs(b.x) > SKEE.halfWidth - SKEE.radius) { b.x = Math.sign(b.x) * (SKEE.halfWidth-SKEE.radius); b.vx *= -.65; b.bounces++; }
      if (b.z <= SKEE.tip) {
        b.z = SKEE.tip; b.y = SKEE.laneY+SKEE.radius+SKEE.rise;
        b.vz=laneVelocity(SKEE.tip,b.launchSpeed);
        b.vy = -b.vz * (2 * .32 / .44); b.stage = 'flight'; b.age = 0;
      }
    } else {
      const before = { x: b.x, y: b.y, z: b.z }, old = plane(b);
      b.x += b.vx * dt; b.y += b.vy * dt - 4.9 * dt * dt; b.vy -= 9.8 * dt; b.z += b.vz * dt;
      b.spin += Math.hypot(b.vx,b.vy,b.vz) * dt / SKEE.radius;
      const contact = SKEE.radius * Math.sqrt(1 + SKEE.slope ** 2);
      if (!b.opening && old > contact && plane(b) <= contact && b.stage === 'flight') {
        // Test the trajectory at the actual hole plane, not where the front of
        // the sphere first touches the board. Those heights differ substantially
        // on a rising throw. A clear sphere continues freely through the opening.
        const a = -4.9*SKEE.slope, v = b.vz + SKEE.slope*b.vy;
        const t = (-v - Math.sqrt(v*v - 4*a*plane(b))) / (2*a);
        const x = b.x + b.vx*t, y = b.y + b.vy*t - 4.9*t*t;
        b.opening = SKEE_POCKETS.find(p => Math.hypot(x-p.x,(y-p.y)*Math.sqrt(1+SKEE.slope**2)) <= p.radius-SKEE.radius);
        if (!b.opening) {
          const f = (old - contact) / (old - plane(b));
          b.x = before.x + (b.x - before.x) * f; b.y = before.y + (b.y - before.y) * f; b.z = before.z + (b.z - before.z) * f;
          // Solid target face: reflect velocity about the inclined board normal.
          const dot = (b.vz + SKEE.slope * b.vy) / (1 + SKEE.slope ** 2);
          b.vz -= 1.48 * dot; b.vy -= 1.48 * dot * SKEE.slope;
          b.z += .004; b.stage='rebound'; b.bounces++;
        }
      }
      if (b.opening && plane(b) <= 0) { caught(r,b.opening); return; }
      if (Math.abs(b.x) > SKEE.halfWidth-SKEE.radius) { b.x=Math.sign(b.x)*(SKEE.halfWidth-SKEE.radius); b.vx *= -.6; b.bounces++; }
      if (b.y < SKEE.laneY+SKEE.radius) {
        b.y=SKEE.laneY+SKEE.radius;
        if (b.vy < -.7 && b.bounces < 4) { b.vy *= -.38; b.vz *= .72; b.bounces++; }
        else { caught(r,null); return; }
      }
      if (b.age > 2.5 || b.z > SKEE.front) caught(r,null);
    }
  } else if (r.phase === 'result') {
    r.wait -= dt;
    if (b) {
      b.age += dt;
      const u = Math.min(1, b.age / (b.stage === 'pocket' ? .65 : 1.05));
      if (b.stage === 'pocket') {
        // Preserve entry momentum until behind the target, then let the hidden
        // return collect it. Dropping vertically at the lip looked like a miss.
        const t = Math.min(.20,b.age);
        b.x=b.from.x+b.from.vx*t; b.y=b.from.y+b.from.vy*t-4.9*t*t; b.z=b.from.z+b.from.vz*t;
      } else {
        b.x=b.from.x*(1-u); b.y=.64+Math.sin(u*Math.PI)*.08; b.z=b.from.z+(SKEE.front-b.from.z)*u;
      }
    }
    if (r.wait <= 0) { r.ball = null; r.phase = r.launched >= SKEE.balls || r.abandoned ? 'done' : 'aim'; }
  }
}
export function skeeTick(r, dt) {
  if (!r || r.phase === 'done' || !(dt > 0) || !Number.isFinite(dt)) return;
  r.time = Math.max(0, r.time - dt);
  if (!r.time) r.abandoned = true;
  if (r.abandoned && r.phase === 'aim') { r.phase = 'done'; return; }
  // Hosts tick at 60 Hz. Cap pathological single inputs, but retain fixed-step carry.
  r.acc += Math.min(dt, 1);
  for (let n = 0; r.acc >= SKEE.step && n < 120 && r.phase !== 'done'; n++) { step(r, SKEE.step); r.acc -= SKEE.step; }
}
export function skeeView(r) {
  return r && { id: r.id, seat: r.seat, player: r.player, bet: r.bet, phase: r.phase, launched: r.launched, score: r.score, last: r.last,
    seconds: Math.ceil(r.time), mult: r.phase === 'done' ? skeeMultiplier(r.score) : null,
    ball: r.ball && { x: r.ball.x, y: r.ball.y, z: r.ball.z, stage: r.ball.stage, assist: r.ball.assist, spin: r.ball.spin, bounces: r.ball.bounces } };
}
