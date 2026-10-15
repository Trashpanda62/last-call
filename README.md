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
Gamblers win by breaking the bank or by voting the killers out. Killers win when they match the gamblers left, or
when the casino closes (20 minutes; a night runs about 15 with its meetings) before the bank breaks.

Play: https://trashpanda62.github.io/last-call/

Inspired by the hidden-role casino setup of LumenLabs' *Who's Cheating?*, with its guard and cheater swapped for an
Among Us-style killer. The look is plush toy gamblers (bean bodies, suits, hats, mitten gloves) in a warm Art Deco
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
  over-the-shoulder camera (hold V), killer sense (7: gamblers glow through walls), staff passages (linked STAFF ONLY
  doors in six rooms), light feet (8-second sprint, silent up close), night eyes (see in the dark) or a jackpot lure
  (7: a siren in any room pulls the crowd). Gamblers see the same list. Online everyone waits the same 15 seconds, so the
  wait gives nobody away; solo the night starts when you pick (a gambler reads the list and presses Start the night, or
  the 15 seconds run out). Bot killers have no edge.

## Death sounds and hearing a killing

Each player records their own death sound on the main menu, under their name: Record takes 2.5 seconds from the
microphone (it needs the https link), and that recording is what everyone hears when you die. Twelve ready-made sounds,
from a scream to a sad trombone, are there for anyone who doesn't record (the play button beside the list lets you hear
one; `tools/v5_death.py`, Sorceress). Bots draw one at random. Online, everyone's recordings are shared when the game starts. A killing plays
the victim's sound to everyone in that room, clearly from anywhere in it. Through a wall it is faint and muffled, and
only for someone standing within about 1.8 m of that room (`CFG.hearWall`); from the middle of the room next door,
nothing. Whoever hears it without seeing it gets a note of where it came from for the meeting, and bots bring it up.

## The blackout

A killer's Blackout move (6) cuts the power. While it is out, a killer can press T to turn into a giant monster
(`src/3d/monster.js`, a mutated creepy potato made with Sorceress, `tools/v6_monster.py`; the old felt monster is in `assets/monster/old/`; nobody turns by themselves, and only one at a time) that kills everyone it catches, with no limit but catching them: 3 grabs whoever is within reach, it holds them for its kill (a stab, 2 seconds), and they die; 4 seconds later it can take the next. E pounces: a leap of about 3 metres toward the nearest gambler in front of it (or straight ahead), stopped by walls, that takes whoever it lands on; a miss leaves it winded for a second, and it can pounce again after 5.5 seconds. Bot monsters pounce too. Nobody
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
target, about a jackpot. The revolver has one bullet: Q shoots whoever is in your sights within 15 m, everyone nearby hears
it, and the monster only staggers. In Escape mode he also sells the gear. Bots buy the revolver when they can afford it
and shoot whoever they are surest about.

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
(roulette takes several at once) and the game's buttons (SPIN, DEAL, HIT...) are built into the table or machine in front of you (the prize wheel's SPIN is the handle on its desk). The max bet is a quarter of the crew bank. Every bet also pays the crew a 10% comp, win or
lose. Every game pays back a little more than it takes (about 104%), and the bots play the same odds as you.

## Controls

PC: click to grab the mouse, mouse to look, WASD to walk, Shift to sprint (5 seconds, then it refills), E or click to use
(talk to the bartender or the shady guy, play a game, report, bell, snack), F sip (in a blackout: your flashlight), R check (your drink, a machine, a snack bowl), X pour out, G the mixer
(at the bar), Q fire the revolver, Space marks whoever you aim at as a suspect (again: trusted; only you see it, on their name tag and
in the meeting), 1-6 killer moves (poisoned order, rig, knife, accident, disguise, blackout), 7 a killer's sense or lure,
hold V a killer's over-the-shoulder camera, E at a STAFF ONLY door a killer's staff passage, H haunt (as a ghost), Tab your phone (the meeting), T turn into the monster (a killer, in a blackout; then 3 grab, E pounce, on a phone the Pounce button), Esc menu.
Nobody sits at the games and nothing needs a key: walk up to a free game facing it and you're at it, free to keep
looking around. Scroll the mouse wheel to pick your chip (anywhere; it shows at the bottom), aim the crosshair and click
(or E) the felt's spots, and right-click takes chips back. Roulette, blackjack, dice, the coin flip and the prize wheel
start by themselves a few seconds after your first chips (the game's button starts one at once) and your chips ride each
round until you take them back; at the duck race and Crash the chips are your bet for the next race or rocket, and the
first bet starts its countdown. Slots, Plinko, Mines and Dragon Tower start when you press. Walking off leaves (a
round you leave is played out for you); a rigged game goes off at your first chip or press there. The security desk and
the VIP sofas are real seats: sit at the desk and its cameras come on, with the mouse free for its card. Thirst and hunger both slow you down: drinks at the bar, pretzels at the six
SNACKS stands. The HUD keeps quiet (Steve, 2026-10-15): one message at a time at the top (chatter dropped, repeats
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
- **Sound:** master, music and effects levels.
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
  `src/talk.js` the meeting conversation (personalities, moods, alibis, votes), `src/audio.js` sounds and music.
- `src/3d/hazards.js` the security desk and camera view, the guard, haunts and the kill effects.
- Character art: `tools/v4_chars.py` (Sorceress jobs), `tools/v4_anims.py` (22 hy-motion gesture clips in `assets/anim`), `tools/rig_bean.py` (Blender rig, headless), `tools/v4_export.py`
  (meeting portraits in `assets/portraits`, provenance). Receipts stay in `runs/` (git-ignored).
- Room and table art: `tools/v4_props.py` (34 hero props and the breaker panel, Sorceress/Meshy) and `tools/prop_fit.py` (headless Blender
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
