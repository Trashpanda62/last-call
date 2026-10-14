# Last Call: the brief

One page: what the game is, how a round ends, what it is made of, what it won't do, and how we know it works.
Sources: the approved pitch (studio record `games/last-call/pitch.json`, 2026-10-14), `docs/plan-v3.md`, `docs/plan-v4.md`
and the code at the commit this file ships in.

## The idea, in two sentences

You are a plush gambler in a warm Art Deco casino, playing twelve casino games with your own hands to grow one shared
crew bank, while one to four of the 4-16 gamblers are killers thinning the room with poisoned drinks, rigged machines,
knives and staged accidents. The crew wins by breaking the bank or voting every killer out in meetings with bots that
argue like people; the killers win by matching the gamblers left or by lasting to closing time.

## Form and inputs

- First-person 3D in the browser (three.js), PC first: mouse to look, WASD to walk, E/click to use, F/R/X/G for drinks,
  1-6 killer moves, H haunt. Seated, you bet on the table itself (chips on the felt, the game's own buttons). Phones work (touch sticks and buttons) but
  are not polished for now.
- Solo with bots, or an online room of up to 16 (host's browser runs the game, guests join by a 4-letter code).

## The loop

- Moment: pick a chip, drop it on the felt, press SPIN or DEAL; sniff the drink and check the machine before you sit.
- Minutes: win for the crew bank while watching who goes where; find a body, report it, argue and vote.
- Round: break the bank or catch the killers before closing time, then play again as another role or host a room.

## Done condition (how a round ends, `checkOver` in `src/sim.js`)

1. The crew bank reaches its target (start bank $500,000 times `CFG.targets[players]`, smaller with more killers): crew wins.
2. The last killer is voted out: crew wins.
3. Living killers match the living gamblers: killers win.
4. Closing time, 12 minutes of play (`CFG.closingTime` 720 s, a warning at 10): the killers win if the bank is short.

## Assets: what each one is

| What | Where | Kind | Provenance |
| --- | --- | --- | --- |
| Toy bean gamblers, hand-built props and tables, canvas textures, synth sounds | `src/3d/*.js`, `src/audio.js` | placeholder (kept as the fallback until the real assets load; `?toy`, `?noprops`, `?nomats`, `?noart`, `?synth`) | code in this repo |
| The casino rooms, walls, bar, pond, alley, coin podium | `src/3d/world.js`, `src/3d/machines.js` | modelled (by hand, in code) | code in this repo |
| 5 plush bodies (bean, round, croupier, bartender, guard) | `assets/chars` | generated (Nano Banana designs, Meshy 7 meshes), rig modelled in Blender (`tools/rig_bean.py`) | `assets/chars/provenance.json` |
| 20 gesture clips | `assets/anim` | generated (hy-motion), retargeted | `assets/anim/provenance.json` |
| 80 meeting portraits | `assets/portraits` | generated (gpt-image-2.5) | `assets/portraits/provenance.json` |
| 34 hero props | `assets/props` | generated (Meshy 7), fitted in Blender | `assets/props/provenance.json` |
| 25 PBR materials | `assets/mats` | generated | `assets/mats/provenance.json` |
| Chips, court cards, card back, felt crest | `assets/art` | generated | `assets/art/provenance.json` |
| Slot symbols, neon signs, screens, paintings, posters, skyline, key art, effect sprites; 16 hats | `assets/art2`, `assets/hats` | generated (hats: Hunyuan meshes baked in Blender) | `assets/art2/provenance.json` |
| Effects, room ambience, music (no voices) | `assets/audio` | generated (ElevenLabs) | `assets/audio/provenance.json` |
| three.js r185 | `vendor/three` | reused (MIT, `vendor/three/LICENSE.txt`) | vendored copy |
| PeerJS 1.5.4 and its free broker | cdnjs, `index.html` | reused (MIT, loaded from the CDN) | `src/net.js` |

## Scope and budget

- Won't do (pitch): voice lines; secret passages, hiding bodies, planting evidence, body clues, sheriff, lie detector,
  staff tip-offs; the drink on the rail as the kill; phone polish for now.
- Spent on generation, by the receipts in `docs/plan-v4.md`: Sorceress about 4,700 credits of a 7,000 budget (phase 0
  181, characters about 940, tables and rooms 2,649, the rest 926), ElevenLabs 20,060 credits (no voices).
- The game lives in its own repository (`C:\dev\last-call`, github.com/Trashpanda62/last-call), never in a shared skill.

## Success criteria (measured, not judged)

- Balance: at the most killers each player count allows, killers win 50-58% of 120 games of bots plus
  one idle human gambler seat (`node tools/batch.mjs 120 <players> <killers> normal`, on the ml350). Latest matrix: `docs/plan-v3.md` Notes.
- Session: a round lasts 2-5 minutes of play, measured on the game clock (`G.t`, what `tools/batch.mjs` reports as
  avgMinutes), which is also the closing-time clock and stops during meetings; each meeting adds its talk plus up to
  30 s of voting and 4 s of results on top. Never past closing time at 12 minutes of play; batches report 0 timeouts
  and 0 errors.
- Odds: every game returns 102-110% to the player, the same maths for bots and players (`node tools/ev.mjs`).
- Build: `node --check` passes on every source file; headless checks only, never on Steve's PC
  (`tools/head-check-ml350.sh` runs syntax, a batch, the route check and the odds table against the committed tree
  on the ml350). Known issues and test limits: `docs/known-issues.md`.
