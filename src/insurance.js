// Host-only policy and accepted-stake ledger. No client result can arm a past round.
export function createInsuranceBook({ owns, consume, refund, comp }) {
  let armed = false, bound = null, lastTicket = 0, current = null;
  const tickets = new Map(), groups = new Map();
  const view = () => owns() ? { state: bound ? 'round' : armed ? 'armed' : 'owned' } : null;
  const activate = blocked => {
    if (!owns() || armed || bound || blocked || current?.open) return false;
    armed = true; return true;
  };
  function group(key, game) {
    const r = { key, game, open: true, pending: 0, left: 0, stake: 0, delta: 0, covered: owns() && armed && !bound };
    if (r.covered) bound = r;
    return r;
  }
  function finish(r) {
    if (!r || r.open || r.pending || r.left) return;
    groups.delete(r.key);
    if (current === r) current = null;
    if (bound !== r) return;
    bound = null;
    const loss = Math.round(Math.max(0, Math.min(r.stake, -r.delta)));
    if (loss && owns()) { armed = false; consume(); refund(loss); }
  }
  function begin({ id, group: key, b }, game, max) {
    if (!Number.isSafeInteger(id) || id <= lastTicket || !Number.isSafeInteger(key) || key > id || key < 1 || !Number.isFinite(b) || b <= 0 || b > max || tickets.size >= 512) return false;
    let r;
    if (key === id) {
      if (current?.open) return false;
      r = group(key, game); groups.set(key, r); current = r;
    } else {
      r = groups.get(key);
      if (r !== current || !r?.open || r.game !== game || !['plinko', 'dice'].includes(game)) return false;
    }
    lastTicket = id; r.left++; tickets.set(id, { id, r, b, first: b }); return true;
  }
  function increase(id, b, max) {
    const t = tickets.get(id);
    if (!t || t.r.game !== 'bj' || !Number.isFinite(b) || b <= t.b || b > Math.min(max, t.first * 4)) return false;
    t.b = b; return true;
  }
  // Inspect first; commit only after the existing game/payout/queue validation succeeds.
  function inspect(ids, b) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 32 || new Set(ids).size !== ids.length) return null;
    const rows = ids.map(id => tickets.get(id));
    if (rows.some(t => !t) || rows.some(t => t.r !== rows[0].r) || Math.abs(rows.reduce((n, t) => n + t.b, 0) - b) > .00001) return null;
    return { r: rows[0].r, ids, b };
  }
  function accept(part, last) {
    const r = part.r;
    for (const id of part.ids) { tickets.delete(id); r.left--; }
    if (last && !r.left) r.open = false;
    r.pending++;
    return part;
  }
  function paid(part, net) {
    const r = part.r; r.pending--; r.stake += part.b;
    // Remove the ordinary table comp. A pit-boss cap or ignored payment cannot create a refund larger than the real loss.
    if (Number.isFinite(net)) r.delta += Math.max(-part.b, net - Math.round(part.b * comp));
    finish(r);
  }
  const native = key => owns() ? group(key, 'native') : null;
  function cancel(r) { if (bound === r) bound = null; }
  function settle(r, b, net) {
    if (!r) return;
    r.open = false; r.pending++; paid({ r, b }, net);
  }
  return { view, activate, begin, increase, inspect, accept, paid, native, cancel, settle, requiresReceipt: () => lastTicket > 0 };
}
