# Last Call

A first-person 3D casino social-deduction game for the browser (PC first, phones work too). Four to sixteen gamblers, one to four of them killers, twelve casino games and one crew bank.
The killers send poisoned drinks "on the house", rig empty machines and snack bowls, knife people from behind, shove
them into the duck pond or drop chandeliers on them, then wear their victim's face for a while. The crew sniffs drinks,
checks machines before sitting, runs to the antidote at the bar, buys cameras or a guard with crew money, and haunts
people from beyond the grave. In meetings the bots argue like people: sixteen personalities, moods, alibis (the killers'
are made up), questions, contradictions and votes that swing with the room. Type in the chat and they answer.
Gamblers win by breaking the bank or by voting the killers out. Killers win when they match the gamblers left, or
when the casino closes (20 minutes; a night runs about 15 with its meetings) before the bank breaks.

Play: https://trashpanda62.github.io/last-call/

Inspired by the hidden-role casino setup of LumenLabs' *Who's Cheating?*, with its guard and cheater swapped for an
Among Us-style killer. The look is plush toy gamblers (bean bodies, suits, hats, mitten gloves) in a warm Art Deco
casino, picked from the previews in `picks/`. It runs on three.js geometry, canvas-painted textures and WebAudio sound
built in code, dressed with generated models, art and recorded sound in `assets/` (each folder has a provenance.json;
see Code below). three.js r185 is vendored in `vendor/three`. The one-page brief is `docs/brief.md`.

## Modes

- **Solo:** you plus bots. Pick players (4-16), killers (up to 2 at 7+, 3 at 11+, 4 at 13+; the most is the balanced
  game), bot smarts and your role.
- **Online:** host a room and share the 4-letter code or the invite link (`?join=CODE`). Empty seats are bots.
  The host's browser runs the game and the guests connect over WebRTC through PeerJS's free broker.
  A guest who leaves is replaced by a bot. Games in progress can't be joined; the host returns everyone to the lobby.

## The games

Blackjack (double, split, ties pay half, blackjack pays 2 to 1), roulette with lucky numbers up to 500x, penny and
high-limit slots, Plinko (up to 1000x), Mines, Dragon Tower, the coin flip, the prize wheel, street dice, and two
rounds the whole casino shares: Crash (one rocket, cash out before it blows) and the duck race. You play on the table
itself: pick a chip on the table bar and click the spots on the felt (roulette takes several at once); UNDO, CLEAR, x2
and MAX sit next to the chips and the game's buttons (SPIN, DEAL, HIT...) on the right. The max bet is a quarter of the crew bank. Every bet also pays the crew a 10% comp, win or
lose. Every game pays back a little more than it takes (about 104%), and the bots play the same odds as you.

## Controls

PC: click to grab the mouse, mouse to look, WASD to walk, E or click to use (order, sit, stand, report, bell, snack),
F sip, R check (your drink, a machine, a snack bowl), X pour out, G send someone a drink (at the bar), hold Space to
look behind you, 1-6 killer moves (poisoned order, rig, knife, accident, disguise, lights), H haunt (as a ghost), Esc menu.
Seated at a table the camera moves to an overhead view of the game and the mouse is free: click a spot to bet,
right-click takes a chip back, the wheel changes chip, hold Space to look behind you, Q or E or a walk key
stands you up (a round you leave is played out for you). The bar along the bottom shows the chips, the total on the
table, the game's state and its buttons. At the security desk the mouse is free for its card.
Phone: left thumb walks, right thumb drags to look, buttons on the right. Seated, tap the felt and the bar; Stand and
Look back stay on the right.

## Code

- `src/sim.js` the authoritative game (no DOM), `src/config.js` every number, `src/map.js` the casino and pathing.
- The sim is a 2D plane (1 px = 1/60 m); `src/3d/` draws it in 3D: `world.js` the casino, `plush.js` the plush
  bean gamblers, staff and guard (rigged models in `assets/chars`, toy beans from `chars.js` until they load; `?toy`
  keeps the toy beans), `gestures.js` when they gesture (wins, losses, bodies, a knife, sips, meeting lines, idle, staff), `items.js` drinks, bowls, bodies and effects, `hands.js` first-person hands, `textures.js` painted
  textures, `render3d.js` camera, lights, bloom and lights-out.
- `src/games.js` every game's maths (shared by players and bots), `src/paint.js` the 2D game screens on the 3D
  machines, `src/tables.js` your table's bets and game flow (no DOM; `press(part)` in, `tableView()` out),
  `src/3d/machines.js` the machines and tables, `src/3d/rig.js` the parts you press (felt layouts, touch screens, chip
  stacks, the roulette history board) and each seat's camera framing; `tableBar()` in `src/tables.js` feeds the HTML bar.
- `src/ui.js` HUD, meetings, results, `src/moves.js` the killer bar, name picker, security desk and haunts,
  `src/talk.js` the meeting conversation (personalities, moods, alibis, votes), `src/audio.js` sounds and music.
- `src/3d/hazards.js` the security desk and camera view, the guard, haunts and the kill effects.
- Character art: `tools/v4_chars.py` (Sorceress jobs), `tools/v4_anims.py` (20 hy-motion gesture clips in `assets/anim`), `tools/rig_bean.py` (Blender rig, headless), `tools/v4_export.py`
  (meeting portraits in `assets/portraits`, provenance). Receipts stay in `runs/` (git-ignored).
- Room and table art: `tools/v4_props.py` (34 hero props, Sorceress/Meshy) and `tools/prop_fit.py` (headless Blender
  fit) into `assets/props`, loaded by `src/3d/props.js`; `tools/v4_mats.py` PBR materials in `assets/mats`; `tools/v4_art.py`
  chips, court cards, card back and felt crest in `assets/art`. `?noprops`, `?nomats`, `?noart` turn each off.
- More art and the hats: `tools/v4_more.py` (slot symbols, neon signs, screen backdrops, paintings, posters, skyline, key
  art, effect sprites in `assets/art2`; Hunyuan hats baked in Blender into `assets/hats`).
- Sound: `tools/v4_audio.py` (ElevenLabs effects, room ambience and music into `assets/audio`, `audio.json`); `src/audio.js`
  plays them (`?synth` keeps the synthesized set). `audio-review.html` plays every take and stores music picks.
- `src/net.js` rooms, `src/main.js` screens, modes, input and the loop.
- `node tools/batch.mjs [games] [players] [killers] [difficulty]` plays headless games (one idle human seat) and
  prints win rates. `node tools/batch.mjs 40 8 2 normal --cfg='{"bladeCd":50}'` tries a tuning change. `node tools/ev.mjs` measures
  each game's return to player. Run both on the ml350 (`~/lc-runner/last-call`), not Steve's PC.
- `window.__lastCall` (start, step, place, look, act, vote, render, shot, state, view, noLock; seated: parts, press,
  pressScreen, aimAt, aim, screenPoint, table, bar; scene for checks that look inside the 3D scene) drives a solo game from headless automation. Call `noLock()` first: automation must never take pointer lock. Test headless only.

- `bash tools/shots-ml350.sh [gpu]` syncs the site to the TrueNAS preview and photographs every table headless on an
  ml350 P100 (`tools/table-shots.mjs`, Playwright); the shots land in `.dev/shots`.

The dev preview is served from TrueNAS, not this PC: `bash tools/sync-truenas.sh` copies the working tree to
`/mnt/apps/last-call-dev/site` (nginx, no caching) at http://10.42.0.37:3160/.
