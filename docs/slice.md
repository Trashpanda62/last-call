# Last Call: the vertical slice

The slice is the one round that has to work before more content is worth making. It is chosen for the hardest parts
of the game working together, not for the prettiest corner. Written 2026-10-14; the gate below governs everything still
to be produced (studio steps `slice` and `scale`).

Honest history: the art and audio production of plan v4 (phases 1-10, 2026-10-12) ran before this gate existed, on
Steve's look pick alone. The gate is applied from here on: no new room, game, kill or asset set goes into production
until the slice passes, and anything that breaks the slice is fixed before new content.

## The slice: one 8-player, 2-killer round on the casino floor and at the bar

- Area: the casino floor (`ROOMS.floor`, the roulette table `RL_TABLE`, both blackjack tables, the pit bell `BELL`) and
  the bar (`ROOMS.bar`, the tap and antidote `TAP`), joined by the bar/floor door. Bots may walk the whole casino.
- Encounter: you sit at roulette and bet. A killer sends you a cocktail "on the house" at the bar (the poisoned order);
  you sniff it (R) and pour it out, or drink it and run for the antidote. The other killer knifes a gambler near the
  tables. Someone finds the body and reports it; the meeting argues (alibis, accusations, contradictions) and votes.
- Progression beat: the crew bank from $500,000 toward the 8-player target with 2 killers ($500,000 x 5 x 0.7, rounded,
  `CFG.targets[8]`, `CFG.killerBank[2]`), every bet adding the comp; the round ends one of the four ways in
  `docs/brief.md` (bank broken, killers voted out, killers match the gamblers, closing time).
- Played two ways: solo (you plus 7 bots) and online (a host and a guest tab in one room, the guest's bets reaching the
  host's bank).

Why this one: it touches every risky system at once: hands-on betting into the one shared bank (`src/tables.js` to the
sim's `bank` action), a hidden-role kill with crew counterplay (`src/sim.js` poison, sniff, antidote, blade), bots that
argue and swing votes (`src/talk.js`), the host-run network game (`src/net.js`), and the generated 3D assets at frame
budget.

## Exact assets and dependencies

The build loads the whole casino at once, whatever room you stand in, so the slice depends on every file under
`assets/` at the slice commit (`git ls-files assets`, each in its folder's `provenance.json`). The rows name what the
slice's area and encounter put in front of the player.

| Kind | Files |
| --- | --- |
| Characters | `assets/chars/bean.glb`, `round.glb`, `croupier.glb`, `bartender.glb` (rigged, `tools/rig_bean.py`); the toy beans in `src/3d/chars.js` as fallback |
| Hats | the first eight of `CAST` in `src/config.js`: `assets/hats/fedora.glb`, `tophat.glb`, `cowboy.glb`, `beret.glb`, `bowler.glb`, `visor.glb`, `crown.glb`, `beanie.glb`; `assets/hats/hats.json` (`loadHats()` loads all 16) |
| Gestures | all 20 in `GESTURES` (`src/3d/gestures.js`), `assets/anim/*.json`: tables (`tap`, `thinking`, `clap`, `cheer`, `despair`), the bar (`sip`, `pour`), the kill (`stab`, `gasp`), the meeting moods (`point`, `facepalm`, `nervous`, `lookaround`, `cry`, `laugh`, `bow`, `shrug`) and idle (`wave`, `dance`, `lever`) |
| Portraits | `assets/portraits/<name>-{calm,nervous,angry,smug,crying}.webp` for the first eight of `CAST` (40 files) |
| Props | `assets/props/` `rouletteTable`, `bjTable`, `barCounter`, `backBar`, `stool`, `chair`, `chandelier`, `pitBell`, `hightop`, `champagne`, `snackBowl`, `palm` (`src/3d/props.js` `PROP_NAMES`) |
| Materials | `assets/mats/` `carpetFloor`, `wallFloor`, `wallBar`, `ceiling`, `woodFloor`, `marble`, `darkWood`, `feltGreen`, `feltRed`, `velvet`, `leather`, `goldLeaf`, `brass` (colour and normal maps) |
| Table art | `assets/art/chip0-5.webp`, `cardBack.webp`, `king.webp`, `queen.webp`, `jack.webp`, `crest.webp` |
| Room art | `assets/art2/` paintings on the floor and bar walls (`paint-00`, `paint-07`, `paint-03`, `paint-05`, `paint-01`, `paint-04`, `paint-10`, `src/3d/world.js` `ART`/`PAINTINGS`), posters `poster-cocktails` and `poster-roulette`, signs `sign-bar` and `sign-lastcall` (`src/3d/world.js` `sign()`); the meeting and ending art `key-meeting`, `key-ejected`, `key-gamblersWin`, `key-killersWin`; effect sprites `fx-fizz`, `fx-smoke`, `fx-sparks`, `fx-confetti`, `fx-stars`, `fx-ghost` (`loadArt2()` loads the whole folder) |
| Sound | `assets/audio/audio.json` keys: ambience `floor`, `bar`; music `floor`, `bar`, `meeting`, `eject`, `gamblersWin`, `killersWin`; effects `chip`, `chips`, `card`, `shuffle`, `rouletteSpin`, `ballDrop`, `pour`, `sip`, `poison`, `clink`, `stab`, `fallCarpet`, `gasp`, `meeting`, `vote`, `eject`, `step` |
| Code | `src/sim.js`, `src/map.js`, `src/config.js`, `src/games.js`, `src/tables.js`, `src/talk.js`, `src/net.js`, `src/main.js`, `src/ui.js`, `src/3d/*`; three.js r185 (`vendor/three`), PeerJS 1.5.4 (cdnjs) |

## Acceptance checklist and evidence

Each row is accepted by evidence from one commit (the slice commit); older results are kept as history, not as
acceptance. Status as of 2026-10-14, code commit dc972d8 (`src/` and `tools/` unchanged in the docs commits after it).

| # | Accept when | How it is checked (headless, on the ml350, never Steve's PC) | Status at dc972d8 |
| --- | --- | --- | --- |
| 1 | The code parses | `git archive HEAD \| ssh ml350 ~/lc-runner/bin/lchead.sh` (`tools/head-check-ml350.sh`: `node --check` every src file, a batch, the route check, the odds table) | passed: studio runner job v-20261014-a68587 (step navigation) |
| 2 | 8p/2k rounds end on their own: 0 errors, 0 timeouts, 2-5 minutes of play, killers win 50-58% | `node tools/batch.mjs 120 8 2 normal` | passed: 120 games, killers 0.53, 0 errors, 0 timeouts, 2.4 minutes of play, 3.1 meetings a game |
| 3 | No bot route runs through a wall | `node tools/nav-check.mjs 20000` | passed: 20,110 routes, 0 through walls |
| 4 | Every bet settles into the crew bank, including rounds you stand up from and bets decided as a meeting starts; nothing settles after the verdict | the settlement check of the systems fix (studio step systems) | open: the fix is not committed yet |
| 5 | The poisoned order, sniff, pour and antidote, the knife, the report, the meeting and the vote all happen in one solo 8p/2k round with no page errors | headless Chrome on a P100 through `window.__lastCall`, serving the slice commit | open: to run once the table and settlement changes in progress are committed (2026-10-12 history: a 12-player killer game reached the results screen with no page errors) |
| 6 | Online: a guest's bet reaches the host's bank | two headless tabs in one room, same commit | open (2026-10-12 history: passed) |
| 7 | Desktop frame time with every slice asset loaded: median under 16.7 ms at 1600x900 | the same headless run, frame times from `requestAnimationFrame` | open (2026-10-12 history: 4-12 ms) |
| 8 | A fresh player, uncoached, gets through the round and can say what to do next | a recorded first-time session by a person | open: needs a player (studio step tutorial) |

## The gate

The slice passes when rows 1-8 all have evidence from the same commit. Then an independent crew review (studio step
`slice`, not the author) checks the evidence and plays the round headless, and Steve plays it on the live build and says
go or no-go. Until then: no new rooms, games, kill types, characters or asset sets (studio step `scale`). A failing
row stops new work and is fixed first.
