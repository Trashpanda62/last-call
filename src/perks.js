// The killers' edges: each killer picks one before the game starts (the pick screen). The sim applies them; this is
// the list everyone sees (gamblers too: it tells them what to watch for).
export const PERKS = [
  { id: 'eyes', name: 'Witness meter', key: '', text: 'An eye on your screen counts the people who can see you right now. Strike at zero.' },
  { id: 'peek', name: 'Over the shoulder', key: 'Hold V', text: 'A camera over your shoulder that sees round corners and doorways. You walk slower while it is up.' },
  { id: 'sense', name: 'Killer sense', key: '7', text: 'Every gambler glows red through the walls for 3 seconds. Ready every 90 seconds.' },
  { id: 'staff', name: 'Staff passages', key: 'E at a door', text: 'The STAFF ONLY doors in seven rooms are linked. Step in one, out of another. Anyone who sees you use one will wonder why.' },
  { id: 'legs', name: 'Light feet', key: 'Shift', text: 'Sprint for 8 seconds instead of 5 and get it back twice as fast. Nobody hears you walk up behind them.' },
  { id: 'night', name: 'Night eyes', key: '', text: 'When the lights go out you see in the dark and gamblers glow. Your lights out comes back sooner.' },
  { id: 'lure', name: 'Jackpot lure', key: '7', text: 'Set off a jackpot siren in any room. The crowd drifts over to look. Ready every 2 minutes.' },
];
export const PERK = Object.fromEntries(PERKS.map(p => [p.id, p]));
export const ACTIVE = new Set(['sense', 'lure']); // the ones key 7 uses
