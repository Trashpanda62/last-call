# Last Call

A casino social-deduction game for the browser and phones. Four to eight gamblers, one or two of them killers.
The killers poison drinks, lace the snack bowls, stab loners and cut the lights, but only when nobody is looking.
Gamblers win by breaking the bank or by voting the killers out. Killers win when they match the gamblers left.

Play: https://trashpanda62.github.io/last-call/

Inspired by the hidden-role casino setup of LumenLabs' *Who's Cheating?*, with its guard and cheater swapped for an
Among Us-style killer. All code, art and music are original and generated in the browser (canvas and WebAudio).

## Modes

- **Solo:** you plus bots. Pick players (4-8), killers (1, or 2 at 7+), bot smarts and your role.
- **Online:** host a room and share the 4-letter code or the invite link (`?join=CODE`). Empty seats are bots.
  The host's browser runs the game and the guests connect over WebRTC through PeerJS's free broker.
  A guest who leaves is replaced by a bot. Games in progress can't be joined; the host returns everyone to the lobby.

## Controls

Keyboard: WASD move, mouse look, E use (order, sit, stand, report, bell, snack), F sip, R sniff, X pour out,
Space look back while seated, 1/2/3 killer moves, Esc menu.
Phone: left thumb walks, tap the floor to look that way, buttons on the right.

## Code

- `src/sim.js` the authoritative game (no DOM), `src/config.js` every number, `src/map.js` the casino and pathing.
- `src/render.js` canvas drawing, `src/ui.js` HUD, table games, meetings, `src/audio.js` sounds and music.
- `src/net.js` rooms, `src/main.js` screens, modes, input and the loop.
- `node tools/batch.mjs [games] [players] [killers] [difficulty]` plays headless games (one idle human seat) and
  prints win rates. `CFG='{"poisonCd":50}' node tools/batch.mjs` tries a tuning change.
- `window.__lastCall` (start, step, place, act, vote, render, state, view) drives a solo game from automation.

Run locally with any static server, for example `python -m http.server 8931 --bind 127.0.0.1`.
