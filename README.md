# Last Call

A first-person 3D casino social-deduction game for the browser (PC first, phones work too). Four to thirty-two gamblers, one to eight of them killers, twelve casino games and one crew bank.
The killers send poisoned drinks "on the house", rig empty machines and snack bowls, knife people from behind, shove
them into the duck pond or drop chandeliers on them, then wear their victim's face for a while. The crew sniffs drinks,
checks machines before playing, runs to the antidote at the bar, watches the cameras, hires a guard with crew money, and haunts
people from beyond the grave. In meetings the bots argue like people: thirty-two personalities, moods, alibis (the killers'
are made up), questions, contradictions and votes that swing with the room. Type in the chat and they answer.
Meetings happen on your phone and the night doesn't stop for them: a murder found buzzes everyone's phone, Tab brings
the meeting up (talk, accuse, vote) and puts it away, and you can ignore it and keep playing. Whoever doesn't vote skips.
Ghosts keep playing the casino games, and their winnings still count for the crew.
Ghosts can also press C (or Cameras) to watch private room feeds from anywhere; C or Escape returns to roaming.
At a staff passage, choose a room to preview its live camera, then click that room again to enter. Cancel leaves you in place.
Casino games periodically give players protected winning streaks, with three losses bringing the next streak forward.
Blackjack keeps completed hands visible until the next deal starts, and reports both totals in the result. Small green Hit, red Stand and blue Double buttons sit in 3D just below your chip circle; purple Split appears only when allowed. Hit/Stand/Double have no screen action panel. Place chips and press Space to deal; H/J/K and controller X/Y/B still work.
Audio uses three selectable ElevenLabs casino scores, room-specific card and roulette ambience, scattered machine sounds and distant coughs. The bar jukebox quietly plays the original menu music. Music and effects have independent controls in Settings.
Deaths cut to a private third-person jumpscare and collapse before returning control to the ghost.
The main menu uses new Murder Mystery and Escape artwork, local Cinzel/Manrope type, and separate join/profile panels.
Startup loads the static art, models, animations and audio before opening the menu, then prepares textures and shaders. Each level shows generated loading artwork, a visual WASD keyboard/mouse and a labelled controller until the player clicks Continue at the bottom right. The full control list expands beneath the diagrams and can also be opened with a controller. Solo time stays frozen during this briefing. The bottom ability HUD and edge choices use a generated icon atlas.
Standard gamepads support both sticks, RT murder/table click, LT disguise/remove chips, Y transform, RB selected ability, LB/left-stick click sprint or leap, A interact/start, X/Y/B blackjack hit/stand/double, D-pad up inspect, down ghost cameras, left/right chip size (outside a table, killers select a HUD ability with left/right and activate it with down), View phone, right-stick click arms owned House Insurance at a table or fires an owned revolver away from tables, ghost X haunts, and Menu pauses. D-pad/stick navigates menus, A selects, B goes back, and left/right changes a focused option.
Gamblers win by breaking the bank or by voting the killers out. Killers win when they match the gamblers left, or
when the casino closes (20 minutes; a night runs about 15 with its meetings) before the bank breaks.

LAN playtest: https://10.42.0.37:3161/

Published build: https://trashpanda62.github.io/last-call/

Inspired by the hidden-role casino setup of LumenLabs' *Who's Cheating?*, with its guard and cheater swapped for an
Among Us-style killer. The look is solid potato gamblers (russet bodies, suits, hats, cream gloves) in a warm Art Deco
casino, picked from the previews in `picks/`. It runs on three.js geometry, canvas-painted textures and WebAudio sound
built in code, dressed with generated models, art and recorded sound in `assets/` (each folder has a provenance.json;
see Code below). three.js r185 is vendored in `vendor/three`. The one-page brief is `docs/brief.md`.

## Modes

- **Solo:** you plus bots. Pick players (4-32), killers (up to 2 at 7+, 3 at 11+, 4 at 13+, 5 at 17+, 6 at 21+, 7 at 25+,
  8 at 29+; the most is the balanced game), bot smarts and your role.
- **Online:** host a room and share the 4-letter code or the invite link (`?join=CODE`). Empty seats are bots.
  A room holds up to 32 players.
  The host's browser runs the game and the guests connect over WebRTC through PeerJS's free broker.
  A guest who leaves is replaced by a bot. Games in progress can't be joined; the host returns everyone to the lobby.
- **Killer edges:** before the night starts each human killer picks one edge (`src/perks.js`): a witness meter, an
  over-the-shoulder camera (hold E), killer sense (E: gamblers glow through walls), staff passages (linked STAFF ONLY
  doors in six rooms), light feet (8-second sprint, silent up close), night eyes (see in the dark) or a jackpot lure
  (E: a siren in any room pulls the crowd). Gamblers see the same list. Online everyone waits the same 15 seconds, so the
  wait gives nobody away; solo the night starts when you pick (a gambler reads the list and presses Start the night). Bot killers have no edge.

## Death sounds and hearing a killing

Each player records their own death sound on the main menu, under their name: Record takes 2.5 seconds from the
microphone (it needs the https link), and that recording is what everyone hears when you die. Twelve ready-made sounds,
from a scream to a sad trombone, are there for anyone who doesn't record (the play button beside the list lets you hear
one; `tools/v5_death.py`, Sorceress). Bots draw one at random. Online, everyone's recordings are shared when the game starts. A killing plays
the victim's sound to everyone in that room, clearly from anywhere in it. Through a wall it is faint and muffled, and
only for someone standing within about 1.8 m of that room (`CFG.hearWall`); from the middle of the room next door,
nothing. Whoever hears it without seeing it gets a note of where it came from for the meeting, and bots bring it up.

## The blackout

A killer's Blackout move (6) cuts the power. While it is out, a killer can press Q to turn into a giant monster
(`src/3d/monster.js`, a mutated creepy potato made with Sorceress, `tools/v6_monster.py`; the old felt monster is in `assets/monster/old/`; nobody turns by themselves, and only one at a time) that kills everyone it catches, with no limit but catching them: Left-click grabs whoever is within reach, it holds them for its kill (a stab, 2 seconds), and they die; 4 seconds later it can take the next. Shift leaps: a leap of about 3 metres toward the nearest gambler in front of it (or straight ahead), stopped by walls, that takes whoever it lands on; a miss leaves it winded for a second, and it can pounce again after 5.5 seconds. Bot monsters pounce too. Nobody
knows which killer it is. The lights stay out until the crew resets the breakers: two panels light up red in two other
rooms (the HUD names them), and standing at one, facing it, resets it in 6 seconds (faster with more hands). Gamblers
find their way by flashlight, F to switch it off: the monster spots a lit flashlight from far away, and someone in the
dark with it off only up close. Nobody can call a meeting in the dark; one called then is held as the lights come back.
The frame the power comes back on, the monster is gone and the killer is their own size again, standing where it stood;
anyone in its hands at that moment gets away. If nobody manages the breakers, the power company resets them after
2.5 minutes.

One time in a hundred, the lights come back on somewhere else: the backrooms casino, the same rooms and games in
damp yellow wallpaper under buzzing fluorescent panels, for the rest of the night (any mode).

## The bar and the shady guy

E at the bar counter (anywhere along it) talks to the bartender: he comes over and the mixer opens. Pour any of 18
ingredients in any ratio (up to 12 parts, 6 of any one), or tap a classic (Martini, Mojito, Bloody Mary...), for yourself or
for anyone. The mixer lists everyone alive with their thirst and hunger. What's in the glass decides what a sip does:
juice and soda quench thirst, cream and tomato juice fill you up, spirits make you lucky at the tables for a while. Anyone
can add poison, gamblers too: it doesn't change the colour or the name. More poison kills faster but smells stronger;
whiskey and coffee hide the smell. A gambler waits 5 minutes between poisoned pours; a killer's counts as move 1.

The shady guy leans in the bar's south-east corner, over the jukebox. E talks to him: he sells for your own winnings
(what you spend leaves the crew bank too), priced as a share of the night's target: loaded dice (lucky for 90 s), a pocket
antidote (cures poison the moment you feel it), a Kevlar vest (stops one knife or bullet) and a revolver at 30% of the
target, about a jackpot. The revolver has one bullet: Q (J for a killer) shoots whoever is in your sights within 15 m, everyone nearby hears
it, and the monster only staggers. In Escape mode he also sells the gear. Bots buy the revolver when they can afford it
and shoot whoever they are surest about.

House Insurance costs 4% of the crew target. Click its shield, press I, or click the right stick at a table to arm it before starting a round. The next net losing protected round returns its lost stake once; wins and ties retain protection. Blackjack doubles/splits and multi-bet rounds aggregate before the refund. The shield shows owned, armed or protected.

## Escape mode

Picked on the main menu next to Murder Mystery. No meetings, no reports, no votes: the night is the casino and the
killers, and the power goes out at 5 minutes at the latest (a killer can cut it sooner with 6). Three breakers light up;
resetting them powers one exit, a STAFF ONLY door with a green EXIT sign, but not the lights. Stand at it for 5 seconds
(the monster hears the door) and you are out, a ghost who can keep playing the games. The door stays open 90 seconds.
You win if you got out; the killers win only if they get everyone.

What you win at the games is yours to spend: B opens the gear shop, any time. Sneakers ($60K, 15% faster), a fuse kit
($80K, breakers twice as fast), a crowbar ($100K, an exit door in 2 seconds) and a lucky rabbit foot ($150K, you slip
out of the monster's first grab).

## The games

Blackjack (double, split, ties pay half, blackjack pays 2 to 1), roulette with lucky numbers up to 500x, penny and
high-limit slots, Plinko (up to 1000x), Mines, Dragon Tower, the coin flip, the prize wheel, street dice, and two
rounds the whole casino shares: Crash (one rocket, cash out before it blows) and the duck race. You play standing at the
game itself: the scroll wheel picks your chip (shown at the bottom of the screen), clicks put chips on the felt's spots
(roulette takes several at once), then Space at the HUD prompt starts the game. Physical table buttons have been removed. Blackjack Hit, Stand and Double appear directly under the chip spot. The max bet is a quarter of the crew bank. Every bet also pays the crew a 10% comp, win or
lose. Human players also receive recurring protected winning streaks; three losses bring the next streak forward, and the streak survives changing tables.

## Controls

PC: click to grab the mouse, mouse to look, WASD to walk, Shift to sprint (5 seconds, then it refills), E or U to use (gamblers can also click)
(talk to the bartender or the shady guy, play a game, report, bell, snack), F sip (in a blackout: your flashlight), R check (your drink, a machine, a snack bowl), X pour out, G the mixer
(at the bar), Q fire the revolver (J for killers), Space marks whoever you aim at as a suspect (again: trusted; only you see it, on their name tag and
in the meeting). Killer: left-click murder, right-click disguise, Q transform during a blackout, Shift leap in monster form. U interacts when E is assigned to an ability. E uses your selected ability: sense, lure, hold to peek, or vents at a STAFF ONLY door. Light feet and the vision perks apply passively; Shift still sprints in human form. Number keys 1-6 remain alternate killer moves (poisoned order, rig, murder, accident, disguise, blackout). H haunt and C cameras (as a ghost), Tab your phone (the meeting), Esc menu.
Walk up to a free game facing it to play, with the mouse still attached to your view. Scroll to pick your chip, aim
and click (or E) the felt to place it, and right-click to take chips back. After placing chips, press Space at the HUD
prompt to start or commit the bet. Games do not start from placing chips alone. Blackjack Hit, Stand and Double sit
immediately below the chip spot: aim and click, or use H / J / K. Cards and chips are enlarged and closer to your eyes.
Crash and duck-race bets must be committed for each shared round; Space cashes out a flying rocket. Walking off leaves (a
round you leave is played out for you); a rigged game goes off at your first chip or press there. The security desk and
the VIP sofas are real seats: sit at the desk and its cameras come on, with the mouse free for its card. Thirst and hunger both slow you down: drinks at the bar, pretzels at the six
SNACKS stands with doughnuts, pretzels and hot dogs, each with a held-food eating animation. The HUD keeps quiet (Steve, 2026-10-15): one message at a time at the top (chatter dropped, repeats
dropped, alerts first), thirst, hunger, the drink in hand and the revolver in a small bottom-left cluster that turns red
and grows when something is low, the role card in full for the first 15 seconds and then one line, the top winners
under the bankroll while you're at a game, and a killer's moves at the bottom folded to their key while they wait, under
the suggested target.
Phone: left thumb walks, right thumb drags to look, and the buttons by the right thumb are only the ones you can use right
now: Use always, Sip, Check and Pour with a drink in hand (Check also at a game or a snack bowl), Light in a blackout,
Shoot with a loaded revolver, Moves (a killer: fans the moves out above it) and Pounce (the monster). Games work as on the PC:
walk up and you're at it, tap a spot on the felt to put your chip there (hold it to take chips back), the - and + by
the chip change it, and walking off leaves.

## Settings

Settings (main menu or Esc) has four tabs, kept in the browser (`src/settings.js`, screen in `src/settings-ui.js`):
- **Graphics:** Low, Medium, High and Ultra presets, or each option on its own: render resolution (50 to 200%, with
  AMD FSR 1.0 or bilinear filling the screen below 100%, and FSR sharpening), dynamic resolution (holds 45 to 144 FPS),
  anti-aliasing (FXAA, SMAA, MSAA 4x or 8x), shadows (up to 4096), GTAO ambient occlusion (half or full resolution),
  screen-space reflections, how many lamps light the room round you, texture filtering, bloom (off, subtle, strong), the
  light cones over the tables, tone mapping (AgX, ACES, Neutral), brightness, field of view, a frame rate limit, an FPS
  readout and fullscreen. DLSS and hardware ray tracing aren't open to browsers: FSR 1 (`src/3d/fsr.js`, AMD's MIT
  code) and screen-space reflections are the browser versions. FreeSync and G-Sync work in fullscreen with the frame
  rate limit off, once variable refresh is on in the graphics driver.
- **Sound:** master, music and effects levels; three eerie casino scores and automatic or selected card/roulette/mixed table ambience. **Browse 142 sounds** opens the searchable sound library: Play/Stop previews each sound on its own, Keep/Muted controls whether it plays in the game, and choices save in this browser. Keep all restores everything; Copy muted list shares your removal choices. Available from the main menu or Pause → Settings.
- **Voice:** in-game proximity voice or Discord, the microphone, open mic or push to talk, voice volume.
- **Controls:** mouse sensitivity and invert Y.

## Voice chat

Online rooms only. Settings > Voice picks the mode:
- **In-game proximity** (default, `src/voice.js`): voice runs straight between the players' browsers over the game's
  own connection. In the lobby, the edge pick and the results everyone hears everyone. During play you hear the
  living near you: full volume to 2.5 m, fading to nothing at 14 m, panned left or right, and quieter and muffled
  through a wall. The dead hear each other anywhere and the living never hear them; in a meeting everyone hears the
  living. Open mic or push to talk (T by default, or a mouse side button).
- **Discord** (`src/discord-link.js` and the bot in `server/discord-voice`): the host's game drives a bot that moves
  linked players between one voice channel per casino room (the bot's README has the setup). Players link with
  `/lastcall link code:1234`, using the code the game shows them.

Browsers only give a page the microphone over https (or on localhost). The TrueNAS preview serves the game at
https://10.42.0.37:3161/ with a self-signed certificate for that, and proxies `/discord` to the bot; each browser
accepts the certificate once.

## Code

- `src/sim.js` the authoritative game (no DOM), `src/config.js` every number, `src/map.js` the casino and pathing.
- The sim is a 2D plane (1 px = 1/60 m); `src/3d/` draws it in 3D: `world.js` the casino, `plush.js` the plush
  bean gamblers, staff and guard (rigged models in `assets/chars`, toy beans from `chars.js` until they load; `?toy`
  keeps the toy beans), `gestures.js` when they gesture (chips set down at a game, wins, losses, bodies, a knife, sips, meeting lines, idle, staff), `items.js` drinks, bowls, bodies and effects, `hands.js` first-person hands, `textures.js` painted
  textures, `render3d.js` camera, lights, bloom and lights-out.
- `src/games.js` every game's maths (shared by players and bots), `src/paint.js` the 2D game screens on the 3D
  machines, `src/tables.js` your table's bets and game flow (no DOM; `press(part)` in, `tableView()` out),
  `src/3d/machines.js` the machines and tables, `src/3d/rig.js` the parts you press (felt layouts, touch screens, chip
  stacks, the roulette history board) and each seat's camera framing; `tableBar()` in `src/tables.js` feeds the HTML bar.
- `src/ui.js` HUD, meetings, results, `src/moves.js` the killer bar, name picker, security desk and haunts,
  `src/talk.js` the meeting conversation (personalities, moods, alibis, votes), `src/audio.js` casino effects and ambience.
- `src/3d/hazards.js` the security desk and camera view, the guard, haunts and the kill effects.
- Character art: `tools/v4_chars.py` (Sorceress jobs), `tools/v4_anims.py` (22 hy-motion gesture clips in `assets/anim`), `tools/rig_bean.py` (Blender rig, headless), `tools/v4_export.py`
  (meeting portraits in `assets/portraits`, provenance). Receipts stay in `runs/` (git-ignored).
- Room and table art: `tools/v4_props.py` (34 hero props and the breaker panel, Sorceress/Meshy) and `tools/prop_fit.py` (headless Blender
  fit) into `assets/props`, loaded by `src/3d/props.js`; `tools/v4_mats.py` PBR materials in `assets/mats`; `tools/v4_art.py`
  chips, court cards, card back and felt crest in `assets/art`. `?noprops`, `?nomats`, `?noart` turn each off.
- More art and the hats: `tools/v4_more.py` (slot symbols, neon signs, screen backdrops, paintings, posters, skyline, key
  art, effect sprites in `assets/art2`; Hunyuan hats baked in Blender into `assets/hats`).
- Sound: `tools/v4_audio.py` generates the recorded library in `assets/audio`; `src/audio.js` plays casino effects
  and room ambience. `tools/casino-audio.py` adds three creepy scores and three table-floor ambience options. The casino
  audio and cough have ElevenLabs provenance receipts in `assets/audio`. `?synth` keeps the synthesized effects for comparisons.
- `src/net.js` rooms, `src/main.js` screens, modes, input and the loop.
- `node tools/batch.mjs [games] [players] [killers] [difficulty]` plays headless games (one idle human seat) and
  prints win rates. `node tools/batch.mjs 40 8 2 normal --cfg='{"bladeCd":50}'` tries a tuning change. `node tools/ev.mjs` measures
  each game's return to player. Run both on the ml350 (`~/lc-runner/last-call`), not Steve's PC.
- On the ml350, `PW=$HOME/ptd-runner/node_modules/playwright LC_GPU=vulkan node tools/audio-check.mjs --url https://10.42.0.37:3161/`
  verifies actual audio output, looping ambience, room transitions, independent mute controls, spatial jukebox playback, all three scores, and isolated cough playback.
- `window.__lastCall` (start, step, place, look, act, vote, render, shot, state, view, noLock; seated: parts, press,
  pressScreen, aimAt, aim, screenPoint, table, bar; scene for checks that look inside the 3D scene) drives a solo game from headless automation. Call `noLock()` first: automation must never take pointer lock. Test headless only.

- `bash tools/shots-ml350.sh [gpu]` syncs the site to the TrueNAS preview and photographs every table headless on an
  ml350 P100 (`tools/table-shots.mjs`, Playwright); the shots land in `.dev/shots`.

The dev preview is served from TrueNAS, not this PC: `bash tools/sync-truenas.sh` copies the working tree to
`/mnt/apps/last-call-dev/site` (nginx, no caching) at https://10.42.0.37:3161/ (HTTP :3160 redirects there).

The [whole-game performance audit](docs/whole-game-performance-audit-2026-10-16.md) records duplicate-work fixes,
GPU allocation checks, room profiles, simulation/network budgets and remaining rendering costs. Repeat it with
`tools/whole-game-audit.mjs`, `tools/runtime-perf-check.mjs` and `tools/live-event-soak.mjs` on the ml350; local CPU budgets use `node tools/simulation-audit.mjs`.
`tools/multiplayer-arrival-check.mjs` uses three actual PeerJS data/media clients with synthetic microphones to check concurrent preparation, independent Continue, guest movement, proximity/ghost voice, private cameras and departure cleanup.

The [ongoing performance continuation](docs/performance-continuation-2026-10-16.md) records current first-use, matrix,
shader and resource-lifetime measurements. Focused ml350 checks include `tools/bounds-loading-check.mjs`,
`tools/item-attachment-check.mjs`, `tools/pose-cache-check.mjs`, `tools/scene-loading-check.mjs`,
`tools/gesture-loading-check.mjs`, `tools/gesture-matrix-check.mjs`, `tools/screen-paint-check.mjs`,
`tools/audio-loop-check.mjs`, `tools/audio-buffer-check.mjs`, `tools/table-controls-check.mjs`, `tools/table-loading-check.mjs`, `tools/chip-upload-check.mjs`,
`tools/chip-render-check.mjs`, `tools/particle-upload-check.mjs`, `tools/body-pose-check.mjs`, `tools/body-skin-check.mjs`, `tools/float-cache-check.mjs`,
`tools/chandelier-loading-check.mjs`, `tools/light-selection-check.mjs`, `tools/snack-display-check.mjs`, `tools/portal-cache-check.mjs`, `tools/prop-usage-check.mjs`, `tools/art-usage-check.mjs`, `tools/arrival-cancel-check.mjs`, `tools/collision-check.mjs`, `tools/segment-check.mjs`, `tools/navigation-loading-check.mjs`, `tools/plinko-texture-check.mjs` and `tools/death-lifetime-check.mjs`.
