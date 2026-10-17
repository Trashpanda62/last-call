// Sparse world foley, independent of the continuous room ambience.
export function createCasinoCues({play, roomOf, clearLine, vents, random = () => Math.random()}) {
  const actors = new Map(); let nextTick = 0, nextScare = 0, nextVoice = 0, lastTime = -1, enabled = false;
  const delay = (a, b) => a + random() * (b - a);
  function reset() { actors.clear(); nextTick = nextScare = nextVoice = 0; lastTime = -1; enabled = false; }
  function update({time, chars, me, look, active, alive, blackout}) {
    if (!active) { enabled = false; return; }
    if (time < lastTime) reset(); lastTime = time;
    if (!enabled) { enabled = true; actors.clear(); nextTick = 0; nextScare = time + delay(35, 70); nextVoice = time + 10; }
    if (time < nextTick) return; nextTick = time + .1;
    if (!nextScare) nextScare = time + delay(35, 70);
    const mine = roomOf(me), present = new Set(), nearby = [];
    for (const c of chars) {
      if (c.id === me.id || !c.alive || c.monster) continue;
      present.add(c.id); let state = actors.get(c.id);
      if (!state) { state = {voice: time + delay(35, 85)}; actors.set(c.id, state); }
      const distance = Math.hypot(c.x - me.x, c.y - me.y); if (distance <= 840) nearby.push({c, state, distance});
    }
    for (const id of actors.keys()) if (!present.has(id)) actors.delete(id);
    nearby.sort((a, b) => a.distance - b.distance);
    for (const {c, state, distance} of nearby) {
      const sameRoom = roomOf(c) === mine;
      if (sameRoom && distance < 480 && time >= state.voice && time >= nextVoice) {
        state.voice = time + delay(45, 100); nextVoice = time + delay(10, 18);
        const type = random(); play(type < .6 ? 'potatoMutter' : type < .8 ? 'potatoSigh' : 'potatoChuckle', c, .24, {priority: 0});
      }
    }
    if (alive && time >= nextScare) {
      nextScare = time + (blackout ? delay(30, 60) : delay(45, 95));
      const type = random();
      if (type < .22) {
        const available = vents.filter(v => v.room === mine);
        if (available.length) { const v = available[Math.floor(random() * available.length)]; play('ventKnock', {x: v.sx, y: v.sy}, .32, {height: 1.6, priority: 1}); }
      } else {
        const side = random() < .5 ? -25 : 25;
        const source = {x: me.x - Math.cos(look) * 78 - Math.sin(look) * side, y: me.y - Math.sin(look) * 78 + Math.cos(look) * side};
        if (!clearLine(me, source)) { source.x = me.x - Math.cos(look) * 24; source.y = me.y - Math.sin(look) * 24; }
        play(type > .86 ? 'whisperBehind' : 'breathBehind', source, blackout ? .36 : .28, {priority: 1});
      }
    }
  }
  return {update, reset, info: () => ({actors: actors.size, nextScare, nextVoice})};
}
