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

| Kind | Files |
| --- | --- |
| Characters | `assets/chars/bean.glb`, `round.glb`, `croupier.glb`, `bartender.glb` (rigged, `tools/rig_bean.py`); the toy beans in `src/3d/chars.js` as fallback |
| Gestures | `assets/anim/sip.json`, `stab.json`, `gasp.json`, `point.json`, `cheer.json`, `despair.json`, `pour.json`, `tap.json`, `nervous.json`, `thinking.json` |
| Portraits | `assets/portraits/<name>-{calm,nervous,angry,smug,crying}.webp` for the 8 cast members in the round |
| Props | `assets/props/` `rouletteTable`, `bjTable`, `barCounter`, `backBar`, `stool`, `chair`, `chandelier`, `pitBell`, `hightop`, `champagne`, `snackBowl`, `palm` (`src/3d/props.js` `PROP_NAMES`) |
| Materials | `assets/mats/` `carpetFloor`, `wallFloor`, `wallBar`, `ceiling`, `woodFloor`, `marble`, `darkWood`, `feltGreen`, `feltRed`, `velvet`, `leather`, `goldLeaf`, `brass` |
| Table art | `assets/art/chip0-5.webp`, `cardBack.webp`, `king.webp`, `queen.webp`, `jack.webp`, `crest.webp` |
| Sound | `assets/audio/audio.json` keys: ambience `floor`, `bar`; music `floor`, `bar`, `meeting`, `eject`, `gamblersWin`, `killersWin`; effects `chip`, `chips`, `card`, `shuffle`, `rouletteSpin`, `ballDrop`, `pour`, `sip`, `poison`, `clink`, `stab`, `fallCarpet`, `gasp`, `meeting`, `vote`, `eject`, `step` |
| Code | `src/sim.js`, `src/map.js`, `src/config.js`, `src/games.js`, `src/tables.js`, `src/talk.js`, `src/net.js`, `src/main.js`, `src/ui.js`, `src/3d/*`; three.js r185 (`vendor/three`), PeerJS 1.5.4 (cdnjs) |

## Acceptance checklist and evidence

| # | Accept when | Evidence (all headless, on the ml350, never Steve's PC) |
| --- | --- | --- |
| 1 | The code at HEAD parses | `tools/head-check-ml350.sh` (`node --check` every src file), recorded by the studio runner on steps systems, navigation and controller |
| 2 | 8p/2k rounds end on their own, no errors, no timeouts, 2-5 minutes, killers win 50-58% | 120 games: 0.55, 0 errors, 0 timeouts, 2.5 min, 3.4 meetings a game (`docs/plan-v3.md` Notes, 2026-10-14) |
| 3 | Bots reach their destinations: no route runs through a wall | `node tools/nav-check.mjs 20000` exits 0 |
| 4 | Every bet settles into the crew bank, including rounds you stand up from and bets decided as a meeting starts; nothing settles after the verdict | the settlement check of the systems fix (studio step systems, crew re-review) |
| 5 | The poisoned order, sniff, pour and antidote, the knife, the report, the meeting and the vote all happen in one solo round with no page errors | headless Chrome on a P100 through `window.__lastCall` (2026-10-12: a full 12-player killer game ran to the results screen with no page errors, `docs/plan-v3.md`); to repeat for this slice before the gate |
| 6 | Online: a guest's bet reaches the host's bank | two-tab headless game (2026-10-12, `docs/plan-v3.md`); to repeat before the gate |
| 7 | Desktop frame time with every slice asset loaded under 16.7 ms median at 1600x900 | 4-12 ms measured 2026-10-12 (`docs/plan-v3.md`); to repeat before the gate |
| 8 | A fresh player, uncoached, gets through the round and can say what to do next | a recorded first-time session (studio step tutorial) |

## The gate

The slice passes when rows 1-8 all have evidence from the same commit. Then an independent crew review (studio step
`slice`, not the author) checks the evidence and plays the round headless, and Steve plays it on the live build and says
go or no-go. Until then: no new rooms, games, kill types, characters or asset sets (studio step `scale`). A failing
row stops new work and is fixed first.
