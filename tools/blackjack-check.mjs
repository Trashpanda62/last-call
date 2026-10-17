import assert from 'node:assert/strict';
import * as G from '../src/games.js';
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const cards = a => a.map(rank => ({ rank, suit: '♠' }));
const total = hand => {
  let sum = hand.reduce((s, c) => s + (c.rank === 'A' ? 1 : Number(c.rank) || 10), 0);
  if (hand.some(c => c.rank === 'A') && sum + 10 <= 21) sum += 10;
  return sum;
};
const deck = sequence => { const values = sequence.flatMap(rank => [(ranks.indexOf(rank) + 0.1) / 13, 0]); return () => values.length ? values.shift() : 0.7; };
for (const rank of ranks) {
  const s = G.bjDeal(100, deck(['4', '3', '10', '7', rank]));
  G.bjAct(s, 'hit');
  assert.equal(s.over, false, '4 + 3 + ' + rank + ' must stay playable');
  assert.equal(s.hands[0].cards.length, 3);
  assert.equal(s.dealer.length, 2);
  assert.ok(G.bjTotal(s.hands[0].cards).t <= 18);
  assert.equal(s.actions.at(-1).action, 'hit');
}
let combinations = 0;
for (const a of ranks) for (const b of ranks) for (const c of ranks) for (const d of ranks) {
  const s = G.bjDeal(100, deck([a, b, c, d]));
  if (!s.over) G.bjAct(s, 'stand');
  const p = total(s.hands[0].cards), dealer = total(s.dealer);
  const natural = p === 21 && s.hands[0].cards.length === 2, dBJ = dealer === 21 && s.dealer.length === 2;
  const expected = natural && !dBJ ? 3 : dBJ ? natural ? 1.5 : 0 : p > 21 ? 0 : dealer > 21 || p > dealer ? 2 : p === dealer ? 1.5 : 0;
  assert.equal(s.mult, expected, `${a},${b} vs ${c},${d}`);
  assert.equal(G.bjTotal(s.dealer).t, dealer);
  combinations++;
}
assert.equal(G.bjTotal(cards(['A', 'A', '9'])).t, 21);
const split = G.bjDeal(100, deck(['8', '8', '10', '7', '3', '2', '10', '10']));
G.bjAct(split, 'split'); G.bjAct(split, 'double'); G.bjAct(split, 'double');
assert.equal(split.staked, 4); assert.equal(split.mult, 8);
assert.equal(split.hands.length, 2);
console.log(`PASS: 4 + 3 with all 13 hit ranks, ${combinations} starting hands against independent scoring, soft aces, splits, and doubles.`);
