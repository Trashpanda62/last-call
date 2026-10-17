// Host-only hearing. Clients receive audible footfalls, never a hidden perk flag.
export function createFootsteps(roomOf) {
  let nextScan = 0;
  const nextStep = new Map();
  return (time, chars) => {
    if (time < nextScan) return; nextScan = time + .1;
    for (const c of chars) {
      if (!c.alive || !c.moving || c.seat || c.monster || c.perk === 'legs') { nextStep.delete(c.id); continue; }
      if (time < (nextStep.get(c.id) ?? time + .15)) { if (!nextStep.has(c.id)) nextStep.set(c.id, time + .15); continue; }
      nextStep.set(c.id, time + (c.sprinting ? .32 : .5));
      const room = roomOf(c);
      for (const h of chars) {
        if (!h.isHuman || h === c || h.escaped || Math.hypot(h.x - c.x, h.y - c.y) > (roomOf(h) === room ? 840 : 240)) continue;
        const queue = h.footsteps || (h.footsteps = []);
        if (!queue.includes(c.id) && queue.length < 32) queue.push(c.id);
      }
    }
  };
}
