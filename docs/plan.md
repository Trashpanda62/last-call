# Last Call: full build plan (2026-10-12 UTC)

Steve (2026-10-12): "build it and show me when it's fully done", no questions. Controls feel good. He plays on his phone
from https://trashpanda62.github.io/last-call/ (repo Trashpanda62/last-call, branch master, GitHub Pages from root).

Work slice by slice. After each slice: run the checks below, commit, push, tick the box here with one line of notes.
If context runs low, this file is the source of truth for what is done and what is next.

## Checks (every slice)
- `node --check` on every JS file.
- Solo bot batch in the built-in browser via `window.__lastCall` (start, step, render): no errors, games end.
- Screenshot at phone landscape (844x390) and desktop.
- Local server: `python -m http.server 8931 --bind 127.0.0.1` from C:\dev\last-call (port 8765 is taken).
  The pane is hidden, so rAF does not run: drive with `step()` and `render()`.

## Slices
- [x] S1 Modules + humans. Split game.js into ES modules (`src/`: config, map, sim, bots, render, ui, audio, net, main).
  Generalize "the player" to any number of human characters: per-character input object, notes, toasts (`tell(c, ...)`),
  sniff, panels. Solo play unchanged.
- [ ] S2 Online multiplayer (PeerJS 1.5.4 from cdnjs, host-authoritative). Menu: Solo / Host a room / Join (4-letter code).
  Lobby with names and colors, host starts; empty seats are bots. Host sims and sends 15 Hz snapshots plus private
  per-player data (role, cooldowns, notes, toasts). Guests send input (move, look, actions, table-game bank deltas, votes,
  chat). Meeting text chat for humans. Guest leaving -> bot takes over; host leaving -> guests told.
  Test with two tabs.
- [x] S3 More killer "stuff" and games. Killer: spike the snack bowl (next eater is poisoned), plus existing poison,
  shiv, lights out. Slot machines (solo game for players and bots). Bots snack and play slots.
- [x] S4 Options. Players 4-8 (bots fill), killers 1-2 (2 allowed at 7+; killers see each other), bot difficulty.
  Killers win at killers >= gamblers.
- [ ] S5 Look and sound. Characters with suits, hats, walk bob and collapse animation; casino decor (lit slots,
  chandeliers, carpet, glow); chip and poison particles; "BODY REPORTED" splash; ejection scene; title art.
  Procedural lounge music loop and ambience, mute toggle.
- [ ] S6 Onboarding and polish. How-to-play cards, first-round tips, local stats, portrait-mode support (layout works
  upright or asks to rotate), solo pause menu, settings (music, sfx, names).
- [ ] S7 Final pass. Balance batch (target: killer wins ~55% with an idle human, less with an active one), full test
  sweep (solo batch, two-tab multiplayer game to the end, phone and desktop shots), README, deploy, verify live.

## Notes
- 2026-10-12: S1, S3, S4 built together as a rewrite (src/*.js, game.js removed). Sim runs in Node:
  `node tools/batch.mjs [games] [players] [killers] [difficulty]` (idle human seat; `CFG='{...}'` env overrides).
  Balance after tuning: 1 killer 44-55% across 4-8 players, 2 killers 55-66%. Targets per player count in CFG.targets.
- Test hook: `__lastCall.start(role)`, `step(s)`, `place(x,y)`, `act(k,arg)`, `vote(id)`, `render()`, `state`, `view`, `S`, `cam`.
- S2 code is written (src/net.js, host/guest in main.js); needs the two-tab test. S5 art/music partly done (render.js, audio.js).
