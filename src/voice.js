// In-game proximity voice: a WebRTC mesh of PeerJS media calls on the game's own Peer, mixed in WebAudio by where
// everyone stands. Game units: 60 px = 1 m; x runs east, y south; look = atan2(dy, dx).
const META = 'voice'; // call metadata { lc: 'voice' }; calls without it are left alone
const FULL = 2.5 * 60, GONE = 14 * 60; // full volume up to 2.5 m, fading to silence at 14 m
const WALL = 0.4, WALL_HZ = 1000, OPEN_HZ = 20000; // no line of sight: quieter and muffled
const PAN = 0.8; // how far to one side a voice can pan (1 would be one ear only)
const TAU = 0.05; // time constant (s) of every gain, pan and filter change
const PENDING_MS = 15000; // an unknown caller waits this long for the roster to name them
const CONNECT_MS = 15000, DOWN_MS = 6000; // a call that never connects, or stays disconnected, is dropped
const RETRY = [1000, 2000, 4000, 8000, 15000]; // the caller's waits before calling again; the last one repeats
// They hung up on us (left, turned voice off): wait longer than the host takes to drop a closed tab (net.js, 9 s), so
// the roster drops them first. Calling a Peer that is gone makes PeerJS raise peer-unavailable on the game's Peer.
const HUNG_UP_MS = 10000;

export function createVoice({ peer, onState }) {
  const prefs = { enabled: false, ptt: false, talking: false, micId: '', outVol: 1 };
  const roster = new Map(); // peerId -> character id (null in the lobby)
  const peers = new Map(), list = []; // the other roster members by peerId, and the same in an array for frame()
  const pending = new Map(); // peerId -> { mc, at }: calls from people the roster has not named yet
  const out = new Map(); // levels() reuses it
  const st = { mic: 'off', peers: 0, error: '' };
  let ctx = null, master = null, silent = null, track = null, local = null, mine = null, micN = 0, closed = false;
  let selfId = peer.id || null, phase = 'lobby';

  const shut = mc => { try { mc.close(); } catch (e) { /* already closed */ } };
  const sending = () => !prefs.ptt || !!prefs.talking;
  const vol = () => { const v = +prefs.outVol; return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1; };
  function report(mic = st.mic, error = st.error) {
    let n = 0;
    for (const r of list) if (r.live) n++;
    if (mic === st.mic && n === st.peers && error === st.error) return;
    st.mic = mic; st.peers = n; st.error = error;
    if (onState) onState(error ? { mic, peers: n, error } : { mic, peers: n });
  }

  // ---- Audio ----
  function audio() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = vol(); master.connect(ctx.destination);
      } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  // What we send when there is no microphone (denied, missing, or not yet allowed): we still hear everyone.
  function quiet() {
    if (!silent && audio()) silent = ctx.createMediaStreamDestination().stream.getAudioTracks()[0];
    return silent;
  }
  // Puts a track on every call without calling again (and into the stream new calls are made with).
  function useTrack(t) {
    const old = track;
    if (t) t.enabled = sending();
    if (t === old) return;
    track = t;
    if (!local) local = new MediaStream();
    if (old) local.removeTrack(old);
    if (t) local.addTrack(t);
    for (const r of list) {
      const pc = r.call && r.call.peerConnection;
      if (pc) for (const s of pc.getSenders()) if (!s.track || s.track.kind === 'audio') s.replaceTrack(t).catch(() => {});
    }
    if (old && old !== silent) old.stop();
    meter();
  }
  // My own level, after push-to-talk (a disabled track is silence).
  function meter() {
    if (mine) { try { mine.src.disconnect(); } catch (e) { /* gone */ } mine = null; }
    if (!track || track === silent || !ctx) return;
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    src.connect(an);
    mine = { src, an, buf: new Float32Array(an.fftSize), lv: 0, at: 0 };
  }
  async function openMic() {
    const n = ++micN, md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) { report('none', 'The microphone needs a secure (https) page.'); return; }
    report('asking', '');
    const c = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    let s = null, err = null;
    // exact: Chrome keeps the device it already has open when the id is only ideal. A device that is gone falls back.
    if (prefs.micId) try { s = await md.getUserMedia({ audio: { ...c, deviceId: { exact: prefs.micId } } }); } catch (e) { err = e; }
    if (!s && (!err || err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) {
      err = null;
      try { s = await md.getUserMedia({ audio: c }); } catch (e) { err = e; }
    }
    const t = s && s.getAudioTracks()[0];
    if (n !== micN || closed || !prefs.enabled) { if (s) s.getTracks().forEach(x => x.stop()); return; }
    if (!t) {
      const why = err && err.name;
      useTrack(quiet());
      if (why === 'NotAllowedError' || why === 'SecurityError') report('denied', 'The microphone is blocked. Allow it for this site to talk.');
      else report('none', why === 'NotFoundError' || why === 'OverconstrainedError' || !why ? 'No microphone found.' : "Couldn't open the microphone.");
      return;
    }
    t.onended = () => { if (track === t) { useTrack(quiet()); report('none', 'The microphone was disconnected.'); } };
    useTrack(t);
    report('on', '');
  }

  // ---- Calls ----
  const remote = (peerId, id) => ({ peerId, id, call: null, since: 0, down: 0, live: false, tries: 0, retryAt: 0,
    el: null, src: null, filter: null, gain: null, pan: null, an: null, buf: null, g: 0, p: 0, hz: OPEN_HZ, lv: 0, at: 0 });
  const retry = r => { r.retryAt = Date.now() + RETRY[Math.min(r.tries++, RETRY.length - 1)]; };

  // The roster decides who talks to whom; of each pair, the smaller peerId calls.
  function sync() {
    if (closed) return;
    selfId = peer.id || selfId; // peer.id is null while PeerJS reconnects to its server; the calls keep going
    const on = prefs.enabled && !!local && !!selfId && roster.has(selfId);
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (on && roster.has(r.peerId)) { r.id = roster.get(r.peerId); continue; }
      hangUp(r); drop(r); list.splice(i, 1); peers.delete(r.peerId);
    }
    if (on) {
      const now = Date.now();
      for (const [pid, id] of roster) {
        if (pid === selfId) continue;
        let r = peers.get(pid);
        if (!r) { r = remote(pid, id); peers.set(pid, r); list.push(r); }
        const p = pending.get(pid);
        if (p) { pending.delete(pid); answer(r, p.mc); } else if (!r.call && selfId < pid && now >= r.retryAt) dial(r);
      }
    }
    report();
  }
  function dial(r) {
    if (!peer.open || peer.disconnected || peer.destroyed) return; // PeerJS would raise an error on the game's Peer
    let mc = null;
    try { mc = peer.call(r.peerId, local, { metadata: { lc: META } }); } catch (e) { mc = null; }
    if (mc) wire(r, mc); else retry(r);
  }
  function answer(r, mc) {
    if (r.call) hangUp(r); // a new call from them replaces the old one
    wire(r, mc);
    try { mc.answer(local); } catch (e) { hangUp(r); return; }
    if (mc.remoteStream && r.call === mc && !r.src) hear(r, mc.remoteStream);
  }
  function wire(r, mc) {
    r.call = mc; r.since = Date.now(); r.down = 0; r.live = false;
    mc.on('stream', s => { if (r.call === mc) hear(r, s); });
    mc.on('close', () => { if (r.call === mc) lost(r, true); }); // a close without an error: the other side hung up
    mc.on('error', () => { if (r.call === mc) lost(r); });
  }
  function lost(r, hungUp) {
    hangUp(r);
    if (selfId >= r.peerId) return; // the caller calls again; the other side waits for it
    if (hungUp) r.retryAt = Date.now() + HUNG_UP_MS; else retry(r);
  }
  function hangUp(r) {
    const mc = r.call;
    r.call = null; r.live = false; r.down = 0;
    if (mc) shut(mc);
    unhear(r);
    report();
  }
  function onCall(mc) {
    if (!mc || !mc.metadata || mc.metadata.lc !== META) return; // not voice: the game's business
    if (closed || !prefs.enabled || !local) { shut(mc); return; }
    const r = peers.get(mc.peer);
    if (r) { answer(r, mc); return; }
    const old = pending.get(mc.peer);
    if (old) shut(old.mc);
    pending.set(mc.peer, { mc, at: Date.now() });
  }
  peer.on('call', onCall);

  // A remote voice: stream -> lowpass -> gain -> pan -> master, with an analyser after the gain (so a level shows only
  // what I can hear: a ghost's level is 0 for the living).
  function hear(r, s) {
    if (!audio()) return;
    unhear(r);
    const el = new Audio(); // Chrome only feeds a remote WebRTC stream to WebAudio while a media element plays it
    el.muted = true; el.srcObject = s;
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
    r.el = el;
    if (!r.gain) build(r);
    r.src = ctx.createMediaStreamSource(s);
    r.src.connect(r.filter);
  }
  function build(r) {
    r.filter = ctx.createBiquadFilter(); r.filter.type = 'lowpass'; r.filter.frequency.value = r.hz = OPEN_HZ;
    r.gain = ctx.createGain();
    r.g = r.gain.gain.value = phase === 'play' || phase === 'meeting' ? 0 : 1; // in a game: silent until frame() places them
    r.an = ctx.createAnalyser(); r.an.fftSize = 1024; r.buf = new Float32Array(r.an.fftSize);
    r.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    r.p = 0;
    r.filter.connect(r.gain); r.gain.connect(r.an);
    if (r.pan) { r.gain.connect(r.pan); r.pan.connect(master); } else r.gain.connect(master);
  }
  function unhear(r) {
    if (r.src) { try { r.src.disconnect(); } catch (e) { /* gone */ } r.src = null; }
    if (r.el) { r.el.pause(); r.el.srcObject = null; r.el = null; }
    r.lv = 0;
  }
  function drop(r) {
    for (const n of [r.filter, r.gain, r.an, r.pan]) if (n) try { n.disconnect(); } catch (e) { /* gone */ }
    r.filter = r.gain = r.an = r.pan = null;
  }

  // Housekeeping twice a second: pending calls expire, dead calls are dropped (the caller calls again), due calls go out.
  const timer = setInterval(() => {
    if (closed) return;
    const now = Date.now();
    for (const [pid, p] of pending) if (now - p.at > PENDING_MS) { pending.delete(pid); shut(p.mc); }
    for (const r of list) {
      if (!r.call) continue;
      const pc = r.call.peerConnection, s = !pc ? 'closed' : pc.connectionState || pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') { r.down = 0; if (!r.live) { r.live = true; r.tries = 0; } }
      else if (s === 'failed' || s === 'closed') lost(r);
      else if (s === 'disconnected') { if (!r.down) r.down = now; else if (now - r.down > DOWN_MS) lost(r); }
      else if (!r.live && now - r.since > CONNECT_MS) lost(r);
    }
    sync();
  }, 500);

  function enable() {
    if (!quiet()) { report('none', 'This browser cannot play voice chat.'); return; }
    useTrack(track || silent); // listen at once; the microphone joins the calls when it opens
    openMic();
    sync();
  }
  function disable() {
    micN++; // a microphone still opening is released when it arrives
    for (const r of list) { hangUp(r); drop(r); }
    list.length = 0; peers.clear();
    for (const p of pending.values()) shut(p.mc);
    pending.clear();
    useTrack(null);
    report('off', '');
  }

  // ---- Mixing ----
  function charOf(chars, id) {
    if (id === null || id === undefined || !chars) return null;
    const c = chars[id];
    if (c && c.id === id) return c;
    for (let i = 0; i < chars.length; i++) if (chars[i] && chars[i].id === id) return chars[i];
    return null;
  }
  function put(r, g, p, hz, t) {
    if (g !== r.g && (g === 0 || g === 1 || Math.abs(g - r.g) > 0.002)) { r.g = g; r.gain.gain.setTargetAtTime(g, t, TAU); }
    if (r.pan && p !== r.p && (p === 0 || Math.abs(p - r.p) > 0.01)) { r.p = p; r.pan.pan.setTargetAtTime(p, t, TAU); }
    if (hz !== r.hz) { r.hz = hz; r.filter.frequency.setTargetAtTime(hz, t, TAU); }
  }
  function frame(f) {
    if (closed || !f) return;
    phase = f.phase;
    if (!ctx || ctx.state !== 'running' || !list.length) return;
    const t = ctx.currentTime, me = f.me, chars = f.chars, los = f.los, game = phase === 'play' || phase === 'meeting';
    const meAlive = !me || me.alive !== false, look = me && Number.isFinite(me.look) ? me.look : 0;
    const cl = Math.cos(look), sl = Math.sin(look);
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r.gain) continue;
      let g = 1, p = 0, hz = OPEN_HZ; // lobby, pick and over: everyone, full and centred
      if (game) {
        const c = charOf(chars, r.id);
        if (!c) g = 0;
        else if (c.alive === false) g = meAlive ? 0 : 1; // the living never hear the dead; ghosts hear ghosts anywhere
        else if (phase === 'play') { // the living are heard by where they stand, by the living and the dead alike
          const dx = c.x - (me ? me.x : NaN), dy = c.y - (me ? me.y : NaN), d = Math.sqrt(dx * dx + dy * dy);
          if (!(d < GONE)) g = 0;
          else {
            if (d > FULL) { const u = (GONE - d) / (GONE - FULL); g = u * u; }
            if (d > 1) p = PAN * (dy * cl - dx * sl) / d; // + is to my right
            if (los && !los(me, c)) { g *= WALL; hz = WALL_HZ; }
          }
        } // meeting: the living are heard by everyone, full and centred
      }
      put(r, g, p, hz, t);
    }
  }

  // ---- Levels ----
  function level(o, now) {
    o.an.getFloatTimeDomainData(o.buf);
    const b = o.buf;
    let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    const db = 10 * Math.log10(s / b.length + 1e-12); // RMS in dBFS
    const raw = Math.min(1, Math.max(0, (db + 60) / 60)); // a plain meter: -60 dBFS is 0, full scale is 1
    o.lv = Math.max(raw, o.lv - Math.min(1, (now - o.at) / 1000) * 2.5); // up at once, down over 0.4 s
    o.at = now;
    return o.lv;
  }

  return {
    // [{ peerId, id }]: everyone in the room with in-game voice on, me included. id: character id, null in the lobby.
    setRoster(items) {
      if (closed) return;
      roster.clear();
      for (const x of items || []) if (x && x.peerId) roster.set(String(x.peerId), x.id ?? null);
      sync();
    },
    // Any of { enabled, ptt, talking, micId, outVol }. enabled false hangs up and releases the microphone. micId switches
    // the microphone on the live calls ('' is the default); passing it while the mic is denied or none tries again.
    setPrefs(p) {
      if (closed || !p) return;
      const wasOn = prefs.enabled, wasMic = prefs.micId, wasVol = vol();
      for (const k in p) if (k in prefs && p[k] !== undefined) prefs[k] = p[k];
      prefs.enabled = !!prefs.enabled; prefs.micId = prefs.micId || '';
      if (ctx) audio(); // usually called from a click: resume a context that started suspended
      if (!prefs.enabled) { if (wasOn) disable(); return; }
      if (!wasOn) enable();
      else if (prefs.micId !== wasMic || (p.micId !== undefined && (st.mic === 'denied' || st.mic === 'none'))) openMic();
      if (track) track.enabled = sending();
      if (master && vol() !== wasVol) master.gain.setTargetAtTime(vol(), ctx.currentTime, TAU);
    },
    // Call from a user gesture (the game's first click): an AudioContext made without one starts suspended.
    unlock() {
      if (closed) return;
      if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); } else if (prefs.enabled) audio();
    },
    frame,
    // Who is talking right now, as I hear them (after distance, walls and ghost rules), keyed by character id (or
    // peerId while id is null); my own entry is my microphone after push-to-talk. The same Map every call.
    levels() {
      out.clear();
      const now = performance.now();
      for (let i = 0; i < list.length; i++) { const r = list[i]; if (r.src) out.set(r.id ?? r.peerId, level(r, now)); }
      if (mine) out.set(roster.get(selfId) ?? selfId, level(mine, now));
      return out;
    },
    async devices() {
      try {
        let n = 0;
        return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone ' + ++n }));
      } catch (e) { return []; }
    },
    // For checks: the state of every call and the mix targets.
    info() {
      return { ctx: ctx ? ctx.state : null, self: selfId, mic: st.mic, peers: st.peers, error: st.error || null, phase,
        sending: !track ? null : track === silent ? 'silent' : track.label + (track.enabled ? '' : ' (muted)'),
        pending: [...pending].map(([peerId, p]) => ({ peerId, ms: Date.now() - p.at })),
        remotes: list.map(r => ({ peerId: r.peerId, id: r.id, caller: selfId < r.peerId, call: r.call ? r.call.connectionId : null,
          state: r.call && r.call.peerConnection ? r.call.peerConnection.connectionState : null, live: r.live, heard: !!r.src,
          gain: r.g, pan: r.p, lowpass: r.hz, tries: r.tries })) };
    },
    close() {
      if (closed) return;
      disable();
      closed = true;
      clearInterval(timer);
      peer.off('call', onCall);
      if (silent) { silent.stop(); silent = null; }
      if (ctx) { ctx.close().catch(() => {}); ctx = null; }
    },
  };
}
