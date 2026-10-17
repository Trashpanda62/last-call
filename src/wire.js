// Snapshots on the wire, host to guest. A guest's view (sim.view) is 10-14 KB of JSON at 32 players and the host sends
// one to every guest CFG.netHz times a second: with 31 guests that was 40-50 Mbit/s up from the host's browser. Packed
// here it is the same view in about a quarter of that: the gamblers as short rows (how each one looks, the name, colour
// and hat, goes in a table sent only when it changes; a row the guest already has as it is goes as a 0), the drinks and
// chandeliers as rows, each guest only the meeting lines it has not had yet, and the parts that seldom change (the
// seats, the leaders, the snack bowls, a guest's notes and cooldowns...) only when they do. The guest unpacks it into
// exactly the view the sim made. The game's DataConnection is reliable and in order (net.js), so what a guest already has
// stays valid until the host says otherwise.
import { DRINKS } from './config.js';

const KINDS = DRINKS.map(d => d.kind); // the glasses (a drink's colour is its mix's: mix.js)
const FLAGS = ['alive', 'ejected', 'moving', 'pale', 'human', 'lucky', 'inspecting', 'bet', 'monster', 'flash', 'held', 'maul', 'escaped', 'leap', 'staffInside', 'hidden']; // bet: chips just went on the felt (a gesture); the rest: the blackout (leap: the monster mid-pounce)
const CH_STATE = ['up', 'falling', 'down'];
const STICKY = ['bowls', 'chandeliers', 'seatsOcc', 'lead', 'security', 'haunts', 'bodies', 'crash', 'race', 'skee', 'arcade', 'guard', 'lure']; // sent when changed
const PSTICKY = ['notes', 'cd', 'crew', 'seat', 'prey', 'spiked', 'rigged', 'killers', 'disguise', 'shop', 'items', 'insurance'];

// The host, once a tick: the parts every guest shares.
export function packPub(pub) {
  const looks = [], at = new Map();
  const chars = pub.chars.map(c => {
    const k = c.name + '\n' + c.color + '\n' + c.hat;
    let j = at.get(k); if (j === undefined) { at.set(k, j = looks.length); looks.push([c.name, c.color, c.hat]); }
    let f = 0; FLAGS.forEach((n, i) => { if (c[n]) f |= 1 << i; });
    return [c.id, j, c.x, c.y, c.look, c.face, c.seat, f, c.eating || 0, c.snack || 0];
  });
  const w = { ...pub, chars, drinks: pub.drinks.map(d => [d.id, d.owner, d.holder, d.x, d.y, d.sips, KINDS.indexOf(d.kind), d.color, d.barTable ?? null]),
    chandeliers: pub.chandeliers.map(ch => [ch.id, ch.x, ch.y, CH_STATE.indexOf(ch.state), ch.t]) };
  const keys = {}; for (const f of STICKY) keys[f] = JSON.stringify(w[f]);
  return { w, looks, looksKey: JSON.stringify(looks), rowKeys: chars.map(r => r.join()), keys };
}

// The host, for each guest: st is that guest's own record (a fresh {} at the start of every game), meeting the sim's
// meeting object (a new one each meeting).
export function packFor(base, priv, st, meeting) {
  const w = { ...base.w };
  if (st.looksKey !== base.looksKey) { st.looksKey = base.looksKey; w.looks = base.looks; }
  const rk = base.rowKeys;
  if (st.rows && st.rows.length === rk.length) w.chars = w.chars.map((r, i) => st.rows[i] === rk[i] ? 0 : r);
  st.rows = rk;
  const keys = st.keys || (st.keys = {});
  for (const f of STICKY) { if (keys[f] === base.keys[f]) delete w[f]; else keys[f] = base.keys[f]; }
  const m = base.w.meeting;
  if (m) {
    if (st.meeting !== meeting) { st.meeting = meeting; st.sent = 0; }
    const from = Math.max(st.sent, m.lineBase || 0);
    w.meeting = { ...m, lines: m.lines.slice(from - (m.lineBase || 0)), lineBase: from };
    st.sent = from + w.meeting.lines.length;
  } else st.meeting = null;
  const p = { ...priv }, pk = st.pkeys || (st.pkeys = {});
  for (const f of PSTICKY) { const k = JSON.stringify(priv[f]); if (pk[f] === k) delete p[f]; else pk[f] = k; }
  return { w: 1, pub: w, priv: p };
}

// The guest: back to the view. Call resetWire() when a game starts. (A test can keep a cache per guest: wireCache().)
export const wireCache = () => ({ looks: null, rows: null, pub: {}, priv: {} });
let MINE = wireCache();
export function resetWire() { MINE = wireCache(); }
export function unpackSnap(msg, mine = MINE) {
  if (!msg.w) return { pub: msg.pub, priv: msg.priv }; // sent as it is
  const w = msg.pub;
  if (w.looks) mine.looks = w.looks;
  const L = mine.looks; if (!L) return null;
  const pub = { ...w }; delete pub.looks;
  const rows = w.chars.map((r, i) => r === 0 ? mine.rows[i] : r); mine.rows = rows;
  pub.chars = rows.map(([id, j, x, y, look, face, seat, f, eating = 0, snack = 0]) => {
    const c = { id, eating, snack, name: L[j][0], color: L[j][1], hat: L[j][2], x, y, look, face, alive: false, ejected: false, seat, moving: false, pale: false, human: false, lucky: false, inspecting: false, bet: false, monster: false, flash: false, held: false, maul: false };
    FLAGS.forEach((n, i) => { c[n] = !!(f & (1 << i)); });
    return c;
  });
  pub.drinks = w.drinks.map(([id, owner, holder, x, y, sips, k, color, barTable]) => ({ id, owner, holder, x, y, sips, color, barTable:barTable ?? undefined, kind: KINDS[k] }));
  if ('chandeliers' in w) w.chandeliers = w.chandeliers.map(([id, x, y, s, t]) => ({ id, x, y, state: CH_STATE[s], t }));
  for (const f of STICKY) { if (f in w) mine.pub[f] = w[f]; pub[f] = mine.pub[f]; }
  const priv = msg.priv;
  for (const f of PSTICKY) { if (f in priv) mine.priv[f] = priv[f]; else priv[f] = mine.priv[f]; }
  return { pub, priv };
}
