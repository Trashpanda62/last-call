// Online rooms over WebRTC with PeerJS's free broker. The host's browser runs the game; guests send input.
const PREFIX = 'lastcall-v1-';
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const ready = () => typeof window.Peer === 'function';

export function hostRoom(h, tries = 0) {
  if (!ready()) { h.onError('Online play could not load. Check your connection.'); return null; }
  const code = newCode();
  const peer = new window.Peer(PREFIX + code, { debug: 0 });
  const conns = new Set();
  const room = {
    code, peer, conns,
    send(conn, msg) { if (conn.open) { try { conn.send(msg); } catch (e) { /* closed mid-send */ } } },
    broadcast(msg) { for (const c of conns) room.send(c, msg); },
    close() { for (const c of conns) try { c.close(); } catch (e) { /* ignore */ } try { peer.destroy(); } catch (e) { /* ignore */ } },
  };
  peer.on('open', () => h.onOpen(code));
  peer.on('connection', conn => {
    conn.on('open', () => { conns.add(conn); });
    conn.on('data', msg => h.onData(conn, msg));
    conn.on('close', () => { if (conns.delete(conn)) h.onLeave(conn); });
    conn.on('error', () => { if (conns.delete(conn)) h.onLeave(conn); });
  });
  peer.on('error', err => {
    if (err.type === 'unavailable-id' && tries < 4) { peer.destroy(); const r = hostRoom(h, tries + 1); Object.assign(room, r); return; }
    if (err.type === 'peer-unavailable') return;
    h.onError('Connection problem: ' + (err.type || err.message));
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
  return room;
}

export function joinRoom(code, h) {
  if (!ready()) { h.onError('Online play could not load. Check your connection.'); return null; }
  const peer = new window.Peer(undefined, { debug: 0 });
  let conn = null, opened = false;
  const room = {
    peer,
    send(msg) { if (conn && conn.open) { try { conn.send(msg); } catch (e) { /* closed */ } } },
    close() { try { conn && conn.close(); } catch (e) { /* ignore */ } try { peer.destroy(); } catch (e) { /* ignore */ } },
  };
  const timeout = setTimeout(() => { if (!opened) h.onError(`Couldn't reach room ${code}. Check the code and that the host is still in the lobby.`); }, 12000);
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
    conn.on('open', () => { opened = true; clearTimeout(timeout); h.onOpen(); });
    conn.on('data', msg => h.onData(msg));
    conn.on('close', () => h.onClose());
    conn.on('error', () => h.onClose());
  });
  peer.on('error', err => {
    clearTimeout(timeout);
    h.onError(err.type === 'peer-unavailable' ? `No room called ${code.toUpperCase()}. Check the code.` : 'Connection problem: ' + (err.type || err.message));
  });
  return room;
}
