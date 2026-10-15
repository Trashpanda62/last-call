// The bar's mixer (Steve, 2026-10-15: "talk to the bartender ... choose what to put in the drink at what ratios so you can
// mix whatever you want. everyone should have the option of putting poison in it"). Shared by the sim (what a drink does)
// and the mixer screen (bar.js), so both read a mix the same way. No DOM.
//   q: thirst quenched per sip (times CFG.sipGain), f: hunger filled per sip (times CFG.mixFood), a: alcohol (a sip of
//   it makes you lucky at the tables for CFG.boozeLuck * a seconds), m: how much of a poison's bitter-almond smell it hides,
//   s: how strongly it colours the glass (the clear ones hardly do).
// Poison changes nothing you can see: not the colour, not the name. More of it kills faster but smells stronger.
export const INGREDIENTS = [
  { id: 'vodka', name: 'Vodka', color: '#eef4f8', q: 0.6, f: 0, a: 1, m: 0.1, s: 0.15 },
  { id: 'gin', name: 'Gin', color: '#e2efe6', q: 0.6, f: 0, a: 1, m: 0.3, s: 0.15 },
  { id: 'rum', name: 'Rum', color: '#c27a35', q: 0.6, f: 0.05, a: 1, m: 0.4 },
  { id: 'whiskey', name: 'Whiskey', color: '#b8692a', q: 0.5, f: 0, a: 1, m: 0.7 },
  { id: 'tequila', name: 'Tequila', color: '#f2e2a0', q: 0.6, f: 0, a: 1, m: 0.3, s: 0.15 },
  { id: 'vermouth', name: 'Vermouth', color: '#d8c890', q: 0.6, f: 0.05, a: 0.6, m: 0.5 },
  { id: 'beer', name: 'Beer', color: '#e8b440', q: 1.1, f: 0.15, a: 0.35, m: 0.3 },
  { id: 'cola', name: 'Cola', color: '#4a2416', q: 1.2, f: 0.1, a: 0, m: 0.5 },
  { id: 'tonic', name: 'Tonic', color: '#e6f4fc', q: 1.2, f: 0, a: 0, m: 0.5, s: 0.15 },
  { id: 'soda', name: 'Soda water', color: '#f0fbff', q: 1.4, f: 0, a: 0, m: 0, s: 0.15 },
  { id: 'lime', name: 'Lime juice', color: '#b6e05a', q: 1, f: 0.05, a: 0, m: 0.3, s: 0.35 },
  { id: 'cranberry', name: 'Cranberry', color: '#d0203a', q: 1.2, f: 0.1, a: 0, m: 0.2 },
  { id: 'orange', name: 'Orange juice', color: '#ffa526', q: 1.2, f: 0.3, a: 0, m: 0.1 },
  { id: 'tomato', name: 'Tomato juice', color: '#c8301e', q: 0.9, f: 0.8, a: 0, m: 0.4 },
  { id: 'cream', name: 'Cream', color: '#fff4dc', q: 0.4, f: 1, a: 0, m: 0.3 },
  { id: 'coffee', name: 'Coffee', color: '#3a2014', q: 0.8, f: 0.2, a: 0, m: 0.9 },
  { id: 'grenadine', name: 'Grenadine', color: '#e0153c', q: 0.5, f: 0.2, a: 0, m: 0.2 },
  { id: 'mint', name: 'Mint', color: '#5ac85a', q: 0.6, f: 0, a: 0, m: 0.3, s: 0.5 },
  { id: 'poison', name: 'Poison', color: '#7dff5a', q: 0, f: 0, a: 0, m: 0, poison: true },
];
export const ING = Object.fromEntries(INGREDIENTS.map(i => [i.id, i]));
export const MAX_PART = 6, MAX_PARTS = 12; // a part is one pour of the jigger; a glass holds 12

// The classics: one tap in the mixer fills them in, and a mix close enough to one takes its name and glass. Bots order these.
export const RECIPES = [
  { name: 'Martini', glass: 'martini', parts: { gin: 5, vermouth: 1 } },
  { name: 'Beer', glass: 'beer', parts: { beer: 1 } },
  { name: 'Whiskey', glass: 'whiskey', parts: { whiskey: 1 } },
  { name: 'Mojito', glass: 'mojito', parts: { rum: 2, lime: 1, mint: 1, soda: 2 } },
  { name: 'Cosmo', glass: 'cosmo', parts: { vodka: 2, cranberry: 2, lime: 1 } },
  { name: 'Gin and tonic', glass: 'mojito', parts: { gin: 1, tonic: 2 } },
  { name: 'Rum and cola', glass: 'mojito', parts: { rum: 1, cola: 2 } },
  { name: 'Margarita', glass: 'cosmo', parts: { tequila: 2, lime: 1 } },
  { name: 'Tequila sunrise', glass: 'mojito', parts: { tequila: 2, orange: 4, grenadine: 1 } },
  { name: 'Screwdriver', glass: 'mojito', parts: { vodka: 1, orange: 2 } },
  { name: 'Bloody Mary', glass: 'mojito', parts: { vodka: 1, tomato: 3 } },
  { name: 'White Russian', glass: 'whiskey', parts: { vodka: 2, coffee: 1, cream: 1 } },
  { name: 'Irish coffee', glass: 'whiskey', parts: { whiskey: 1, coffee: 2, cream: 1 } },
  { name: 'Whiskey sour', glass: 'whiskey', parts: { whiskey: 2, lime: 1 } },
  { name: 'Shirley Temple', glass: 'mojito', parts: { soda: 4, grenadine: 1 } },
  { name: 'Cola', glass: 'mojito', parts: { cola: 1 } },
  { name: 'Orange juice', glass: 'mojito', parts: { orange: 1 } },
  { name: 'Glass of water', glass: 'mojito', parts: { soda: 1 } },
];
// What bots order (and what a random drink is): the cocktails, not the plain juice.
export const BOT_RECIPES = RECIPES.slice(0, 15);

// A clean copy of a mix from anywhere (the wire): known ingredients, whole parts, 0..MAX_PART each, MAX_PARTS in all.
export function cleanParts(p) {
  const out = {}; let n = 0;
  for (const i of INGREDIENTS) {
    const v = Math.max(0, Math.min(MAX_PART, Math.floor(+(p && p[i.id]) || 0)));
    if (v && n + v <= MAX_PARTS) { out[i.id] = v; n += v; }
  }
  return out;
}

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

// Everything about a mix: its name, glass and colour (poison left out of all three), and what a sip does.
export function mixInfo(parts) {
  const p = cleanParts(parts), ids = Object.keys(p), total = ids.reduce((n, k) => n + p[k], 0);
  if (!total) return null;
  const poison = p.poison || 0, base = total - poison;
  let q = 0, f = 0, a = 0, m = 0, tint = 0; const rgb = [0, 0, 0];
  for (const k of ids) {
    const i = ING[k], w = p[k] / total;
    q += i.q * w; f += i.f * w; a += i.a * w;
    if (!i.poison) { m += i.m * p[k] / base; tint += p[k] * (i.s ?? 1); hex(i.color).forEach((v, j) => { rgb[j] += v * v * p[k] * (i.s ?? 1); }); } // (mixed as light: squares)
  }
  const color = base ? toHex(rgb.map(v => Math.sqrt(v / tint))) : ING.poison.color;
  // a classic when every ingredient matches one's and each share is within 12% of the recipe's
  const plain = ids.filter(k => k !== 'poison');
  const r = RECIPES.find(r => {
    const rk = Object.keys(r.parts), rt = rk.reduce((n, k) => n + r.parts[k], 0);
    return rk.length === plain.length && rk.every(k => p[k] && Math.abs(p[k] / base - r.parts[k] / rt) <= 0.12);
  });
  const booze = plain.reduce((n, k) => n + ING[k].a * p[k], 0) / Math.max(1, base);
  const top = plain.slice().sort((x, y) => p[y] - p[x]);
  const name = !base ? 'Glass of poison' : r ? r.name : top.length === 1 ? ING[top[0]].name : top.length === 2 ? `${ING[top[0]].name} and ${ING[top[1]].name.toLowerCase()}` : `House special (${ING[top[0]].name.toLowerCase()})`;
  const glass = r ? r.glass : p.beer && p.beer / base >= 0.5 ? 'beer' : booze >= 0.7 ? (base <= 3 ? 'whiskey' : 'martini') : 'mojito';
  // poison: share of the glass, how fast it works (CFG.poisonDelay times this) and how strongly it smells (0 hidden .. 1+ reeks)
  const share = poison / total;
  return { parts: p, total, name, glass, color, q, f, a, poison: share,
    speed: poison ? Math.max(0.45, Math.min(1.3, 1.35 - share * 1.6)) : 0,
    smell: poison ? Math.max(0.1, Math.min(1.5, 0.45 + share * 3 - m * 0.6)) : 0 };
}
export const smellWord = s => s >= 1 ? 'reeks of almonds' : s >= 0.6 ? 'a strong smell' : s >= 0.3 ? 'a faint smell' : 'almost no smell';
