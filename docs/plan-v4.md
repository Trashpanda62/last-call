# Last Call v4: hands-on tables, new kills, human bots, real art and audio (2026-10-12 08:03 UTC)

Steve (2026-10-12, after playing v3): "not bad honestly. i don't like the interaction menu for the games. it should be
like the video i sent you where you are placing chips on the actual squares for roulette and things like that. the
drink behind them is a poor mechanic for killing. replace it with a variety or better options. i want more emotion,
deceit, and more human like responses from the bots during voting. finally it's still ugly, there are 7,000
sorceress credits, give me a list of what we can generate with that to make this look amazing, plan elevenlabs
spending as well, no budget on that"

If context runs low, this file is the source of truth. Tick items as they land.

## 1. Hands-on tables (no menus)

What the video does (SMii7Yplus, "We Almost Lost EVERYTHING Gambling", 2:27-18:32): no HUD panel at all. Seated, you
look at the table and press things with your hands: big physical HIT / STAND / PLAY buttons, a chunky keypad on the
table to type the bet, a felt layout where you tap a number or colour, cards dealt on the felt by a dealer, the wheel
spinning in front of you. The crosshair names the thing you aim at ("ROULETTE BUTTON", "E Interact").

Our version:
- Seated, the mouse stays locked; the crosshair aims at table parts and click (or E) presses them. On phones, tap the
  part. The HTML console goes away; only a small bet readout stays in the HUD.
- A chip tray on every table: tap a chip colour to pick a value, then tap a square on the felt to drop a chip there
  (stacks grow, several squares at once on roulette), tap again to add, right-click or the CLEAR button to take back.
  Plus a 3D keypad for typing an exact bet, and ALL IN / ½ / ×2 buttons on the rail.
- Per game:
  - Roulette: the full single-zero layout on the felt (numbers, dozens, columns, red/black, odd/even, low/high), the
    croupier calls "no more bets", the wheel spins in front of you, winning chips get paid next to yours.
  - Blackjack: drop chips in your betting circle, then giant DEAL, HIT, STAND, DOUBLE, SPLIT buttons on the rail.
  - Dice: pass line, field and the point puck on the felt; a ROLL button throws the 3D dice.
  - Slots: a real lever (pull it), bet buttons on the cabinet.
  - Plinko, Mines, Dragon Tower: touch screens in the cabinet you tap directly (risk, mines, tiles, eggs), CASH OUT
    button.
  - Crash: chip in the slot, a big red CASH OUT plunger on the desk.
  - Duck race: drop chips on the duck lanes painted on the betting desk.
  - Coin flip and prize wheel: chips on HEADS/TAILS or the wheel's betting board; a SPIN handle.
- Odds and maths stay exactly as in games.js (bots and players the same).

## 2. Kills (replacing "the drink on the rail behind you")

**Built 2026-10-12 (commit 2c27b70, tuned in 476250c).** **Decided (Steve, 2026-10-12):** kills: rigged games, close kills from behind, staged accidents, poisoned orders (all four).
Deceit: disguise only. Crew tools: buy security with crew-bank money, inspect machines, an antidote at the bar, a
security-camera office, ghost haunting. Not picked: secret passages, hiding bodies, planting evidence, body clues,
sheriff, lie detector, staff tip-offs. The drink on the rail behind your seat goes away; drinks are held in hand.

The candidates as asked:
- Rigged games (traps): wire a slot lever, a Plinko cabinet or a chip stack; the next player who uses it dies a few
  seconds later. The killer gets an alibi.
- Close kills from behind: garrote, knife or a push, with an animation; a scream others hear nearby.
- Staged accidents: drop a chandelier on a table, push someone into the duck pond, a "malfunctioning" Crash rocket.
- Poisoned orders: send a cocktail "on the house" to someone through the bartender; it kills when they drink it.
- Deceit tools: secret passages (bookcase, slot back panel, restroom stall, alley dumpster), a 30 s disguise as the
  victim, hiding bodies (closet, dumpster, pond), planting evidence (someone's chip or glove) on a body.
- Crew counterplay: a security office with live camera feeds, body clues (time of death, weapon), a sheriff role.

## 3. Bots that argue like people

**Built 2026-10-12 (476250c, `src/talk.js`).** Portraits and voices follow the art and voice picks.

- 16 personalities (hothead, nervous wreck, smug know-it-all, sweetheart, conspiracy nut, wannabe lawyer, comedian,
  drunk, gossip, high roller, grandma, rookie, ...), each with their own wording, temper and voice.
- Memory: who they saw where, who sat near whom, who left the room before a body was found, who defended whom.
- Emotion state per bot (fear, anger, grief, smugness) that rises with bodies, accusations and losses; it changes
  what they say, how fast they vote, and their face (portraits in the meeting).
- Killers lie: invent alibis that fit the map, frame whoever was nearby, defend their partner just enough, bandwagon
  onto an innocent, fake grief at a body.
- Conversation, not a list of statements: questions ("Moss, where were you?"), answers, contradictions called out
  ("You said bar, I saw you at the pond"), interruptions, people changing their vote when the crowd turns, last words
  when ejected (pleading, cursing, a confession), reactions after the reveal ("I TOLD you!").
- Players can type, and the bots react to their name, accusations and "I saw X" claims.

## 4. Sorceress: 7,000 credits (100 credits = US$1, charged only on success; prices from the live catalog)

| # | What | How | Credits |
| --- | --- | --- | --- |
| 0 | Look previews first: 3 casino keyframes in our plush style, 3 bean A-pose designs, 1 test 3D prop | nano-banana-pro 2K (18), Meshy 6 textured (~50) | 210 |
| 1 | Bean gambler 3D character, 2 body shapes, rigged, 20 animations each (walk, sit, play, pull lever, sip, cheer, despair, point, shrug, gasp, cry, laugh, stab, pour, collapse, vote, sneak, wave, dance, idle) | image 18, Meshy 60, rig 20, hy-motion 3 per clip | 320 |
| 2 | 16 hats and accessories as 3D models | image 6 + Hunyuan 30 each | 580 |
| 3 | Staff: croupier, bartender, security guard (outfits on the bean, shared animations) | image 18, Meshy 60, rig 20 | 300 |
| 4 | 35 hero props in 3D: blackjack, roulette and dice tables, two slot machines, jackpot tower, Plinko cabinet, Mines/Tower console, Crash rocket and desk, prize wheel, coin podium, racing duck, bar and back bar, stools, chairs, booth, couch, armchair, chandelier, piano, pool table, jukebox, champagne tower, 4 cocktails, snack bowl, chips, card shoe, palm, rope post, cashier cage, camera, vent grate, dumpster, street lamp | image 10 + Meshy 50 each | 2,100 |
| 5 | 25 PBR materials: 5 carpets, 6 wallpapers, coffered ceiling, wood floor, 2 tiles, marble, brick, asphalt, 3 felts, velvet, leather, gold leaf, brass | material_generate, nano-banana-2 2K | 300 |
| 6 | Table art: roulette, blackjack and dice felt layouts, 6 chip faces, a card deck and back | gpt-image-2 / nano-banana-2 2K | 160 |
| 7 | Machine art: slot symbols and reel strips, 6 cabinet toppers, 12 neon game logos | gpt-image-2 2K | 220 |
| 8 | 20 paintings and posters, alley night skyline (2 at 4K), menu key art and loading screens (6) | gpt-image-2 2K, nano-banana-pro | 300 |
| 9 | Meeting portraits: 16 characters x 5 emotions (calm, nervous, angry, smug, crying), from the 3D design as reference | gpt-image-2.5 flare 1K | 480 |
| 10 | Effect sprites: smoke, sparks, confetti, poison fizz, explosion | gpt-image-2 | 80 |
| | Reserve for retakes (about 15%) | | 1,000 |
| | **Total** | | **6,550** |

Phase 0 approved and done 2026-10-12 (03:10-03:50 CT): 181 credits, balance 7,266 after.

**Picked (Steve, 2026-10-12): scene A (plush felt diorama), bean A (plush, red felt, button eyes, stitched smile).** Phases 1-10 build
to that look. Picks page:
https://trashpanda62.github.io/last-call/picks/v4/ (provenance in picks/v4/provenance.json, receipts in runs/).

**Built 2026-10-12 (phases 1, 3 and 9, about 940 credits).** Five Meshy 7 bodies from Nano Banana Pro designs: the bean
(bean A), a rounder second shape (Biscuit, Duke, Coco, Ozzie, Snow, Peach), the croupier (the table dealers), the
bartender (new, behind the bar) and the security guard. Sorceress' auto-rigger refuses bean shapes ("pose estimation
failed", no charge), so `tools/rig_bean.py` rigs them in headless Blender: a 16-bone Mixamo-named skeleton from the mesh,
region weights, 1024 px JPEG texture, about 0.7 MB each. `src/3d/plush.js` poses them from the same inputs as the toy
beans (walk, sit, hold a drink, lie dead) and tints the red felt to each player's colour in the shader; hats ride the
head bone. Frame times match the toy beans (one skinned mesh each instead of about 60 parts). Meeting portraits: 16
characters x 5 moods (calm, nervous, angry, smug, crying), gpt-image-2.5 flare; 8 that drifted were redone from that
character's calm portrait (2 twice, for white gloves), and Ozzie's smug one, lost to a provider outage, was made the same way. One hy-motion test clip bought (3 credits) to check the format (`sorceress-motion@1`, SMPL
joints); the 20 gesture clips need a retarget to this skeleton and are next.

Order: 0 (Steve picks a look) → 1, 3, 9 (characters) → 4, 5, 6 (tables and rooms) → 7, 8, 10. Every image is checked
up close for extra or missing limbs and fingers before Steve sees it. Every job id and file goes in provenance.json.
Generated meshes are remeshed to a polygon budget and instanced so phones keep their frame rate.

## 5. ElevenLabs

**Steve, 2026-10-12: "No voice lines."** No voiced dialogue, names, reactions or staff callouts; the voice casting is
shelved. Effects, ambience and music stay in the plan.
 (no budget; rates measured 2026-09-27: speech about 1 credit a character, effects 12 a second, music about 15 a second)

| What | Amount | Est. credits |
| --- | --- | --- |
| Voice casting: 16 gamblers + croupier, dealer, duck-race announcer, PA announcer, bartender (Voice Design, 2 candidates each for Steve to pick) | 21 voices | 15,000 |
| Meeting dialogue in v3 with emotion tags ([angry], [whispers], [crying], [laughs nervously]): about 150 lines per personality | 2,400 lines | 150,000 |
| Names said by every voice in 3 tones (accusing, pleading, neutral) and places ("at the roulette table") | 960 clips | 20,000 |
| In-world reactions: screams at a body, death cries, ejection last words, win cheers, loss groans | 320 clips | 15,000 |
| Staff callouts: "place your bets", "no more bets", all 37 numbers, blackjack totals, Crash countdown, 8 full duck-race commentaries, PA lines, bartender | 300 clips | 25,000 |
| Effects: chips, cards, wheel and ball, reels, jackpot bells, pegs, dice, coin, ticker, rocket, splashes, 4 footstep surfaces, doors, glass, pour, sip, fizz, knife, body fall, lights, bell, vote stamp, ejection | 120 effects | 5,000 |
| Ambience loops: casino floor, bar, VIP, arcade, alley, duck pond, crowd walla | 7 loops x 30 s | 2,500 |
| Music: menu, casino lounge jazz, bar piano, VIP, arcade synthwave, alley blues, duck-race ragtime, meeting tension, ejection sting, win and lose stings (2 takes each) | 13 pieces | 45,000 |
| **Total** | | **about 280,000** |

## 6. Checks

- `node --check` every file; balance batches through the heavy-job scheduler (killers 50-58%).
- Headless Chrome only (GPU, through the scheduler): every table played by aiming and clicking, phone taps, a full game
  per new kill, a 16-player meeting, two-tab online, frame times.
