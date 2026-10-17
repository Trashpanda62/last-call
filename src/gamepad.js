// Standard Gamepad mapping (Xbox labels; equivalent PlayStation positions work too).
const zero = () => ({ x: 0, y: 0, lookX: 0, lookY: 0 });
const dead = n => Math.abs(n || 0) < .18 ? 0 : Math.sign(n) * (Math.abs(n) - .18) / .82;
export function createGamepad({ key, click, chip, context, onUse = () => {}, onDisconnect = () => {} }) {
  let connected = false, previous = [], held = new Set(), navAt = 0, chosenAbility = null;
  const ability = direction => {
    const choices = [...document.querySelectorAll('#killerBar button:not(.hidden)')].filter(b => b.getClientRects().length);
    if (!choices.length) return null;
    const i = choices.indexOf(chosenAbility);
    if (direction) { chosenAbility?.classList.remove('pad-selected'); chosenAbility = choices[i < 0 ? 0 : (i + direction + choices.length) % choices.length]; chosenAbility.classList.add('pad-selected'); }
    return choices.includes(chosenAbility) ? chosenAbility : choices[0];
  };
  const hold = (name, on) => { if (on && !held.has(name)) { held.add(name); key(name, true); } else if (!on && held.delete(name)) key(name, false); };
  const tap = name => { key(name, true); key(name, false); };
  return { poll(now) {
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p?.connected && p.mapping === 'standard');
    if (!pad) { if (connected) onDisconnect(); connected = false; for (const name of [...held]) hold(name, false); chosenAbility?.classList.remove('pad-selected'); chosenAbility = null; previous = []; return zero(); }
    connected = true;
    const b = pad.buttons.map(v => v.pressed || v.value > .55);
    if (b.some(Boolean) || pad.axes.some(v => Math.abs(v) > .18)) onUse();
    const edge = i => b[i] && !previous[i], c = context();
    if (c.menu) {
      for (const name of [...held]) hold(name, false);
      const scope = ['levelLoading', 'settings', 'picker', 'secCard', 'mixer', 'shop', 'pick', 'pause', 'setup', 'menu'].map(id => document.getElementById(id)).find(el => el && !el.classList.contains('hidden') && el.getClientRects().length);
      const choices = scope ? [...scope.querySelectorAll('button:not(:disabled), input, select')].filter(e => e.getClientRects().length && !e.closest('.hidden') && e.getAttribute('tabindex') !== '-1') : [];
      const direction = b[13] || pad.axes[1] > .6 ? 1 : b[12] || pad.axes[1] < -.6 ? -1 : 0;
      if (direction && now > navAt && choices.length) { const i = choices.indexOf(document.activeElement); choices[(i + direction + choices.length) % choices.length].focus(); navAt = now + 230; }
      if (now > navAt && document.activeElement?.tagName === 'SELECT' && (b[14] || b[15] || Math.abs(pad.axes[0]) > .6)) {
        const select = document.activeElement, step = b[14] || pad.axes[0] < -.6 ? -1 : 1;
        select.selectedIndex = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + step)); select.dispatchEvent(new Event('change', { bubbles: true })); navAt = now + 230;
      }
      if (edge(0)) { const button = (choices.includes(document.activeElement) ? document.activeElement : null) || document.querySelector('#levelLoading:not(.hidden) #levelContinue:not(:disabled)') || choices[0]; button?.click(); }
      if (edge(1) || edge(9)) tap('escape');
    } else {
      hold('shift', !!(b[4] || b[10])); hold('e', !!b[5]);
      if (edge(7)) click(false); if (edge(6)) click(true);
      if (c.skee) hold(' ', !!b[0]); else { hold(' ', false); if (edge(0)) { if (c.table && !c.start) click(false); else tap(c.table ? ' ' : 'u'); } } // (A presses the aimed starter: Hit, the lever, the wheel...)
      if (edge(2)) tap(c.blackjack || c.dead ? 'h' : 'f');
      if (edge(3)) tap(c.blackjack ? 'j' : 'q');
      if (edge(1)) tap(c.blackjack ? 'k' : 'escape');
      if (edge(11) && c.table && !c.dead) tap('i');
      if (edge(11) && !c.table && !c.dead) tap(c.killer ? 'j' : 'q');
      if (edge(8)) tap('tab'); if (edge(9)) tap('escape');
      if (edge(12)) tap('r');
      if (edge(13)) { if (c.killer && !c.table) ability(0)?.click(); else tap('c'); }
      if (edge(14)) { if (c.killer && !c.table) ability(-1); else chip(-1); }
      if (edge(15)) { if (c.killer && !c.table) ability(1); else chip(1); }
    }
    previous = b;
    return c.menu ? zero() : { x: dead(pad.axes[0]), y: dead(pad.axes[1]), lookX: dead(pad.axes[2]), lookY: dead(pad.axes[3]) };
  } };
}
