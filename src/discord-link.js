// The game host's line to the Discord voice bot (server/discord-voice; protocol v1 in its README). The bot moves linked
// players into the voice channel of the room they stand in. This reconnects on its own and catches the bot up.
const RETRY = [1000, 2000, 5000, 10000]; // waits between attempts; the last one repeats
const RESEND = 2000; // the last state goes again after this long without a change
const STEADY = 5000; // a socket that stayed open this long starts the retry waits over

export function createDiscordLink({ url, room, onChange }) {
  let ws = null, stopped = false, tries = 0, wait = null, resend = null, openedAt = 0;
  let roster = null, rosterKey = null, state = null, stateKey = null;
  let status = { conn: 'connecting', ready: false, guild: null, lobby: null, error: null, codes: {}, linked: {}, inVoice: {} };
  // Each change makes a new status object, so a caller can keep the old one to compare.
  const set = patch => { status = { ...status, ...patch }; if (onChange) onChange(status); };
  const send = msg => {
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(msg)); return true; } catch (e) { return false; }
  };
  const sendState = () => { clearTimeout(resend); if (state && send(state)) resend = setTimeout(sendState, RESEND); };

  function connect() {
    wait = null;
    let sock;
    try { sock = new WebSocket(url); } catch (e) { stopped = true; set({ conn: 'closed', error: 'The Discord bot address is not valid.' }); return; }
    ws = sock;
    if (status.conn !== 'connecting') set({ conn: 'connecting' });
    sock.onopen = () => {
      if (ws !== sock) return;
      openedAt = Date.now();
      // The bot sends everything again after hello (ready, codes, links, voice), so start this connection clean.
      set({ conn: 'open', ready: false, guild: null, lobby: null, error: null, codes: {}, linked: {}, inVoice: {} });
      send({ t: 'hello', room, v: 1 });
      if (roster) send({ t: 'roster', players: roster });
      sendState();
    };
    sock.onmessage = e => { if (ws === sock) receive(e.data); };
    sock.onerror = () => {}; // a close event follows
    sock.onclose = e => {
      if (ws !== sock) return;
      ws = null; clearTimeout(resend);
      const was = openedAt; openedAt = 0;
      if (stopped) return;
      // 4000: a newer socket said hello for this room. Fighting it would bounce the room between two hosts.
      if (e.code === 4000) { stopped = true; set({ conn: 'closed', ready: false, error: 'Another window took over Discord voice for this room.' }); return; }
      if (was && Date.now() - was >= STEADY) tries = 0;
      wait = setTimeout(connect, RETRY[Math.min(tries++, RETRY.length - 1)]);
      set({ conn: 'connecting', ready: false, error: was ? 'Lost the Discord bot. Reconnecting...' : "Can't reach the Discord bot." });
    };
  }

  function receive(data) {
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ready') set({ ready: true, guild: m.guild ?? null, lobby: m.lobby ?? null, error: null }); // a later ready clears an error
    else if (m.t === 'codes') set({ codes: { ...m.codes } });
    else if (m.t === 'linked') set({ linked: { ...status.linked, [m.key]: m.user } });
    else if (m.t === 'unlinked') {
      const linked = { ...status.linked }, inVoice = { ...status.inVoice };
      delete linked[m.key]; delete inVoice[m.key];
      set({ linked, inVoice });
    } else if (m.t === 'voice') set({ inVoice: { ...status.inVoice, [m.key]: !!m.inVoice } });
    else if (m.t === 'error') set({ error: String(m.why) });
  }

  connect();
  return {
    get status() { return status; },
    // [{ key, name }] whenever the lobby list changes; repeats are dropped.
    roster(list) {
      const players = (list || []).map(p => ({ key: String(p.key), name: String(p.name ?? '') }));
      const key = JSON.stringify(players);
      if (key === rosterKey) return;
      rosterKey = key; roster = players;
      send({ t: 'roster', players });
    },
    // Fine to call every frame: only a change goes out, and the last state again every 2 s.
    state(phase, players) {
      let key = phase;
      for (const p of players || []) key += '|' + p.key + ',' + (p.room || '') + ',' + (p.alive === false ? 0 : 1);
      if (key === stateKey) return;
      stateKey = key;
      state = { t: 'state', phase, players: (players || []).map(p => ({ key: p.key, room: p.room || null, alive: p.alive !== false })) };
      sendState();
    },
    // The room is closing on purpose: say bye (the bot gathers and unlinks everyone now, not after 90 s) and stop.
    close() {
      const sock = ws;
      stopped = true; ws = null;
      clearTimeout(wait); clearTimeout(resend);
      if (sock) {
        if (sock.readyState === 1) try { sock.send(JSON.stringify({ t: 'bye' })); } catch (e) { /* closing anyway */ }
        try { sock.close(1000, 'bye'); } catch (e) { /* already closed */ }
      }
      if (status.conn !== 'closed' || status.ready) set({ conn: 'closed', ready: false });
    },
  };
}
