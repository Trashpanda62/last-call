// Online rooms over WebRTC with PeerJS's free broker. The host's browser runs the game; guests send input.
const PREFIX = 'lastcall-v1-';
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const ready = () => typeof window.Peer === 'function';
// A tab that is closed (not left) never sends a goodbye and PeerJS never fires 'close', so both sides ping every 2 s
// and give up on a link that has been silent too long (a hidden host tab still ticks about once a second).
const PING = 2000, HOST_GIVE_UP = 9000, GUEST_GIVE_UP = 15000;
const dead = conn => { const pc = conn.peerConnection; return !!pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed'); };

export function hostRoom(h, tries = 0) {
  if (!ready()) { h.onError('Online play could not load. Check your connection.'); return null; }
  const code = newCode();
  const peer = new window.Peer(PREFIX + code, { debug: 0 });
  const conns = new Set(), seen = new Map();
  const drop = conn => { if (conns.delete(conn)) { seen.delete(conn); try { conn.close(); } catch (e) { /* ignore */ } h.onLeave(conn); } };
  const beat = setInterval(() => {
    const now = Date.now();
    for (const c of [...conns]) { if (dead(c) || now - (seen.get(c) || now) > HOST_GIVE_UP) drop(c); else room.send(c, { t: 'ping' }); }
  }, PING);
  const room = {
    code, peer, conns,
    send(conn, msg) { if (conn.open) { try { conn.send(msg); } catch (e) { /* closed mid-send */ } } },
    broadcast(msg) { for (const c of conns) room.send(c, msg); },
    close() { clearInterval(beat); for (const c of conns) try { c.close(); } catch (e) { /* ignore */ } try { peer.destroy(); } catch (e) { /* ignore */ } },
  };
  peer.on('open', () => h.onOpen(code));
  peer.on('connection', conn => {
    conn.on('open', () => { conns.add(conn); seen.set(conn, Date.now()); });
    conn.on('data', msg => { seen.set(conn, Date.now()); if (!(msg && msg.t === 'ping')) h.onData(conn, msg); });
    conn.on('close', () => drop(conn));
    conn.on('error', () => drop(conn));
  });
  peer.on('error', err => {
    if (err.type === 'unavailable-id' && tries < 4) { clearInterval(beat); peer.destroy(); const r = hostRoom(h, tries + 1); Object.assign(room, r); return; }
    if (err.type === 'peer-unavailable') return;
    if (err.type === 'webrtc') { console.warn('webrtc', err.message); return; } // one call's setup failed (a voice call or a guest's link); the guest side retries
    h.onError('Connection problem: ' + (err.type || err.message));
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
  return room;
}

export function joinRoom(code, h) {
  if (!ready()) { h.onError('Online play could not load. Check your connection.'); return null; }
  const peer = new window.Peer(undefined, { debug: 0 });
  let conn = null, opened = false, last = 0, beat = null, gone = false;
  const lost = () => { if (gone) return; gone = true; clearInterval(beat); h.onClose(); };
  const room = {
    peer,
    send(msg) { if (conn && conn.open) { try { conn.send(msg); } catch (e) { /* closed */ } } },
    close() { gone = true; clearInterval(beat); try { conn && conn.close(); } catch (e) { /* ignore */ } try { peer.destroy(); } catch (e) { /* ignore */ } },
  };
  const timeout = setTimeout(() => { if (!opened) h.onError(`Couldn't reach room ${code}. Check the code and that the host is still in the lobby.`); }, 12000);
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      opened = true; clearTimeout(timeout); last = Date.now(); h.onOpen();
      beat = setInterval(() => { if (dead(conn) || Date.now() - last > GUEST_GIVE_UP) lost(); else room.send({ t: 'ping' }); }, PING);
    });
    conn.on('data', msg => { last = Date.now(); if (!(msg && msg.t === 'ping')) h.onData(msg); });
    conn.on('close', lost);
    conn.on('error', lost);
  });
  peer.on('error', err => {
    clearTimeout(timeout);
    if (opened && conn && conn.open && !dead(conn)) return; // the broker blinked (Wi-Fi change, its restart); the line to the host is still up
    h.onError(err.type === 'peer-unavailable' ? `No room called ${code.toUpperCase()}. Check the code.` : 'Connection problem: ' + (err.type || err.message));
  });
  peer.on('disconnected', () => { if (!gone) try { peer.reconnect(); } catch (e) { /* the game link doesn't need the broker */ } });
  return room;
}
