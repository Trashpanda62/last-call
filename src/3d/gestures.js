// Gestures the plush beans play (clips in assets/anim, tools/v4_anims.py) and when: wins and losses at the tables,
// bodies found, a knife in the back, chips put down at a game, sips, meeting lines, idle moments and the staff at work. Read from the view each
// frame; purely visual, the sim never knows.
import { los, makeSeats } from '../map.js';
import { prepareClips } from './plush.js';

export const GESTURES = ['cheer', 'despair', 'gasp', 'point', 'shrug', 'cry', 'laugh', 'stab', 'pour', 'sip', 'wave', 'dance', 'lever', 'tap',
  'clap', 'facepalm', 'nervous', 'lookaround', 'thinking', 'bow', 'chips', 'push'];
const SEATS = makeSeats();
const MOOD = { anger: ['point', 'point', 'facepalm'], fear: ['nervous', 'gasp', 'lookaround'], grief: ['cry', 'despair'], smug: ['laugh', 'bow', 'shrug'],
  calm: ['shrug', 'thinking', 'lookaround', null, null] };
const SEATED = { slots: ['lever', 'lever', 'tap'], bj: ['tap', 'thinking'], roulette: ['tap', 'thinking', 'clap'], dice: ['tap', 'clap'],
  vip: ['laugh', 'tap'], race: ['clap', 'cheer'], crash: ['thinking', 'nervous'] };
const STANDING = ['lookaround', 'wave', 'laugh', 'dance', 'thinking', 'shrug'];
const DEALER_GESTURES = ['tap', 'tap', 'wave', 'thinking'];
const BARTENDER_GESTURES = ['pour', 'pour', 'wave', 'laugh'];
const pickOf = a => a[Math.floor(Math.random() * a.length)];

export function* prepareGestures() {
  yield* prepareClips([...GESTURES, 'snatched'], ['bean', 'round']);
  yield* prepareClips(DEALER_GESTURES, ['croupier']);
  yield* prepareClips(BARTENDER_GESTURES, ['bartender']);
}

export class Gestures {
  constructor() { this.floats = new Map(); this.bodies = new Set(); this.sips = new Map(); this.meet = ''; this.lines = 0; this.queue = []; this.next = new Map(); this.staffT = 3; this.started = false; this.bets = new Map(); }
  // pub/priv: the view; beans: id -> bean; staff: { dealers, bartender }
  tick(pub, priv, beans, staff, _t, dt) {
    if (!pub) return;
    const t = (this.clock = (this.clock || 0) + dt); // its own clock: game time stands still in meetings
    const me = priv ? priv.me : -1, chars = pub.chars, first = !this.started; this.started = true;
    const play = (id, name, upper, delay = 0) => { if (!first && name) this.queue.push({ id, name, upper, at: t + delay }); };
    const nearest = (x, y, r, skip) => {
      let best = null, bd = r;
      for (const c of chars) { if (!c.alive || c.id === skip || c.id === me) continue; const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } }
      return best;
    };
    // chips on the felt: the 'bet' flag (a bot's round, a player's first chip and each round after) sets a stack down,
    // at most once every 7-12 s each so a quick slot machine doesn't make it twitch (your own hands are first person)
    for (const c of chars) {
      const was = this.bets.get(c.id); this.bets.set(c.id, !!c.bet);
      if (!c.bet || was || pub.meeting || c.id === me || !c.alive || c.seat === null || (this.next.get('bet' + c.id) || 0) > t) continue;
      this.next.set('bet' + c.id, t + 7 + Math.random() * 5);
      this.next.set(c.id, Math.max(this.next.get(c.id) || 0, t + 3)); // no idle gesture on top of it
      play(c.id, pickOf(['chips', 'chips', 'push']), true);
      this.next.set('end' + c.id, t + 1.9); // a bot's round is decided as the chips go down: its reaction waits for them
    }
    // a win or a loss pops a float over the gambler
    for (const f of pub.floats) {
      if (f.t < 1.3) continue;
      const key = f.x + ':' + f.text; if (this.floats.has(key)) continue; this.floats.set(key, t);
      const c = nearest(f.x, f.y + 30 + 18 * (1.6 - f.t), 45); if (!c) continue;
      const up = f.text[0] === '+', down = f.text[0] === '-';
      play(c.id, up ? (f.big ? 'cheer' : pickOf(['clap', 'bow', 'cheer'])) : down ? (f.big ? 'despair' : pickOf(['facepalm', 'shrug'])) : 'shrug', c.seat !== null, Math.max(0, (this.next.get('end' + c.id) || 0) - t));
    }
    for (const [k, at] of this.floats) if (t - at > 3) this.floats.delete(k);
    if (!pub.bodies.length) this.bodies.clear(); // a new game
    // a new body: the knife's follow-through, then gasps from whoever can see it
    for (const b of pub.bodies) {
      const key = b.id + ':' + b.x + ':' + b.y; if (this.bodies.has(key)) continue; this.bodies.add(key);
      const k = b.cause === 'blade' ? nearest(b.x, b.y, 90, b.id) : null;
      if (k) play(k.id, 'stab', k.seat !== null);
      for (const c of chars) {
        if (!c.alive || c.id === me || c.id === b.id || c === k || Math.hypot(c.x - b.x, c.y - b.y) > 340 || !los(c, b)) continue;
        play(c.id, pickOf(['gasp', 'gasp', 'nervous']), c.seat !== null, 0.2 + Math.random() * 0.6);
      }
    }
    // a sip
    const held = new Set();
    for (const d of pub.drinks) {
      if (d.holder === null) continue; held.add(d.id);
      const prev = this.sips.get(d.id); this.sips.set(d.id, d.sips);
      if (prev !== undefined && d.sips < prev && d.holder !== me) play(d.holder, 'sip', true);
    }
    for (const id of this.sips.keys()) if (!held.has(id)) this.sips.delete(id);
    // meeting lines: the speaker acts out the mood (everyone stands in the ring, the camera orbits)
    const m = pub.meeting;
    if (m) {
      // (the snapshot holds the lines from number lineBase on: a window of the last ones, or a guest's new ones)
      const key = m.title + m.reason, base = m.lineBase || 0, total = base + m.lines.length;
      if (key !== this.meet || total < this.lines) { this.meet = key; this.lines = first ? total : base; }
      if (this.lines < base) this.lines = base;
      while (this.lines < total) { const l = m.lines[this.lines++ - base]; play(l.who, pickOf(MOOD[l.emo] || MOOD.calm), false, 0.1); }
    } else this.meet = '';
    // idle moments, one gambler at a time
    if (!m && Math.random() < dt * 2) {
      const c = pickOf(chars);
      if (c && c.alive && c.id !== me && !c.moving && (this.next.get(c.id) || 0) < t) {
        this.next.set(c.id, t + 8 + Math.random() * 14);
        const seat = c.seat !== null ? SEATS[c.seat] : null;
        if (seat) play(c.id, pickOf(SEATED[seat.game] || ['thinking', 'tap']), true);
        else if (Math.random() < 0.5) play(c.id, pickOf(STANDING), false);
      }
    }
    // the staff at work
    this.staffT -= dt;
    if (this.staffT < 0 && staff) {
      this.staffT = 3 + Math.random() * 5;
      const d = staff.dealers && pickOf(staff.dealers);
      if (d && d.play && !d.busy) d.play(pickOf(DEALER_GESTURES), true);
      if (staff.bartender && Math.random() < 0.5 && !staff.bartender.busy) staff.bartender.play(pickOf(BARTENDER_GESTURES), true);
    }
    // due gestures; an event wins over an idle gesture already playing
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i]; if (q.at > t) continue;
      this.queue.splice(i, 1);
      const b = beans.get(q.id); if (b && b.play) b.play(q.name, q.upper);
    }
  }
}
