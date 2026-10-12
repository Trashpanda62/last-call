# Last Call

A first-person 3D casino social-deduction game for the browser (PC first, phones work too). Four to eight gamblers, one or two of them killers.
The killers poison drinks, lace the snack bowls, stab loners and cut the lights, but only when nobody is looking.
Gamblers win by breaking the bank or by voting the killers out. Killers win when they match the gamblers left.

Play: https://trashpanda62.github.io/last-call/

Inspired by the hidden-role casino setup of LumenLabs' *Who's Cheating?*, with its guard and cheater swapped for an
Among Us-style killer. The look is plush toy gamblers (bean bodies, suits, hats, mitten gloves) in a warm Art Deco
casino, picked from the previews in `picks/`. Everything is built in code: three.js geometry, canvas-painted textures,
WebAudio sound. three.js r185 is vendored in `vendor/three`.

## Modes

- **Solo:** you plus bots. Pick players (4-8), killers (1, or 2 at 7+), bot smarts and your role.
- **Online:** host a room and share the 4-letter code or the invite link (`?join=CODE`). Empty seats are bots.
  The host's browser runs the game and the guests connect over WebRTC through PeerJS's free broker.
  A guest who leaves is replaced by a bot. Games in progress can't be joined; the host returns everyone to the lobby.

## Controls

PC: click to grab the mouse, mouse to look, WASD to walk, E or click to use (order, sit, stand, report, bell, snack),
F sip, R sniff, X pour out, hold Space to look behind you, 1/2/3 killer moves, Esc menu. At a table the mouse is freed
for the game panel: drag to look around, press a move key or E to stand.
Phone: left thumb walks, right thumb drags to look, buttons on the right.

## Code

- `src/sim.js` the authoritative game (no DOM), `src/config.js` every number, `src/map.js` the casino and pathing.
- The sim is a 2D plane (1 px = 1/60 m); `src/3d/` draws it in 3D: `world.js` the casino, `chars.js` the bean
  gamblers, `items.js` drinks, bowls, bodies and effects, `hands.js` first-person hands, `textures.js` painted
  textures, `render3d.js` camera, lights, bloom and lights-out.
- `src/ui.js` HUD, table games, meetings, `src/audio.js` sounds and music.
- `src/net.js` rooms, `src/main.js` screens, modes, input and the loop.
- `node tools/batch.mjs [games] [players] [killers] [difficulty]` plays headless games (one idle human seat) and
  prints win rates. `CFG='{"poisonCd":50}' node tools/batch.mjs` tries a tuning change.
- `window.__lastCall` (start, step, place, look, act, vote, render, shot, state, view, noLock) drives a solo game from
  automation. Call `noLock()` first: automation must never take pointer lock.

Run locally with any static server, for example `python -m http.server 8931 --bind 127.0.0.1`.
