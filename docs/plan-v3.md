# Last Call v3: 16 players, big money, many games, better graphics (2026-10-12 UTC)

Steve (2026-10-12, after playing the 3D build): "I want up to 16 players or bots in the game at once, which means we
need a lot more games, and games with the potential to earn a lot more money. I lost almost every blackjack hand. Use
this video for game ideas (youtube Vagb9BqdX8g). The graphics feel very unfinished as well, do better."

His picks (asked 2026-10-12):
- Layout: **one huge floor** with new wings (no elevator, no locked floors).
- Money: **one shared crew bank, a target in the millions, pick your bet** (keypad and chips, like the video). The max
  bet grows with the bank. Multiplier games pay up to 1000x and more. Your odds match the bots' (player-friendly).
- Games: **all of them**: Crash, Plinko, Mines, Dragon Tower, Coin flip, Prize wheel, Duck race (replaces the horse
  race), Street dice, high-limit slots. Blackjack gets Double and Split.
- Killers: **up to 4** (1 at 4-6 players, up to 2 at 7-11, up to 3 at 12-13, up to 4 at 14-16; host picks).
  As built (`CFG.maxKillers`): 1 at 4-6, up to 2 at 7-10, up to 3 at 11-12, up to 4 at 13-16 (13 since 9a4efe7).
- Look stays A (plush toy). "Do better" = execution inside look A, matched to the pick-A image and the video's polish.

Why he lost at blackjack: bots won 56% of hands in an abstract roll; his hands used real casino rules (no double, no
split, $250 fixed). Fix: every game's math lives in one module both bots and players use, with player-friendly rules
printed on the table.

If context runs low, this file is the source of truth. Tick slices as they land.

## Rules
- `src/games.js`: pure math for every game (no DOM), used by the panels (players) and the sim (bots).
  Return to player (RTP) per game about 102-110%, printed honestly ("TIES PAY", "ZERO GIVES IT BACK" and so on).
  `tools/ev.mjs` measures each game's RTP and top multiplier over a million rounds.
- Betting: min bet $10; max bet = 25% of the crew bank (at least $1,000). Panels: bet box with chips (+10 +100 +1K
  +10K), 1/2, x2, MAX, and a keypad. A bet can't exceed the max. The bank never goes below 0; the house always lets
  you bet the minimum.
- Bots bet a share of the bank (tuned) on the same game math, so the bank compounds.
- Shared rounds in the sim (everyone sees the same thing): **Crash** (bet 6 s, fly, boom; cash out any time) and
  **Duck race** (bet 15 s, race 12 s; 6 ducks with odds). Others resolve per player.
- Start bank $500,000. Targets per player count in CFG (millions everywhere), tuned so killers win about 50-58% at the
  balanced (most) killer count.
- 16 players: CAST of 16 (colors, hats), lobby up to 16 humans, killers 1-4, cooldowns scale with killer count.

## Map (sim px, 60 px = 1 m): 3000 x 1900
Rooms (20 px walls): bar 20-620 x 20-700, restrooms 20-620 x 720-1180, casino floor 640-2000 x 20-1180,
arcade (Crash, Plinko, Mines, Tower) 2020-2980 x 20-700, duck race 2020-2980 x 720-1180, slot hall 20-1000 x
1200-1880, street alley (dice, wheel, coin flip) 1020-2000 x 1200-1880, VIP 2020-2980 x 1200-1880.
Seats: blackjack 2 tables x 5, roulette 6, slots 10 (6 regular, 4 high limit), duck race 6, crash 4, plinko 3,
mines 3, tower 3, coin 2, wheel 2, dice 4, VIP 4 (57).

## Graphics (look A, done properly)
- Composer with MSAA, GTAO ambient occlusion, a camera-following shadow light, pooled chandelier lights (nearest 8).
- Beans redone toward the pick-A image: face plate, big glossy eyes, brows, smile, four-finger gloves, shoes.
- First-person four-finger cartoon gloves with cuffs; press, sip, deal, pull poses.
- Room dressing: coffered ceilings with cove light, columns, drapes, wall panels, neon per wing, brick street alley,
  carpet swirls, rope posts, palms. Every machine has a live screen; the machine you sit at shows your own game.
- Panels restyled as glossy casino consoles.

## Slices
- [x] V1 Game math: games.js (blackjack D/S, roulette with lucky numbers, slots tiers, plinko, mines, tower, coin,
  wheel, dice, crash, duck odds), betting limits, tools/ev.mjs. Config for 16 players and 4 killers.
- [x] V2 Map and sim: new layout, rooms, doors, seats, obstacles; shared crash and duck rounds; bots on the real game
  math; bank validation; meeting ring for 16; batch-tuned targets for 4-16 players and 1-4 killers.
- [x] V3 Panels: every game's console with bet controls and a canvas view; the same canvas feeds the 3D screen.
- [x] V4 World: rebuild world.js for the new map, all machines, live screens, wing dressing, dealers.
- [x] V5 Graphics quality: AO, shadows, MSAA, light pool, beans, hands, materials, grading.
- [x] V6 Flow and checks: setup for 16 / 4 killers, lobby 16, meeting UI for 16, demo, how-to, tests (batch, browser
  solo games, two-tab online), screenshots, README, deploy, verify live.

## Checks
- `node --check` every JS file. Batch runs through the heavy-job scheduler (never plain node).
- Browser checks headless only, `__lastCall` hooks, never pointer lock under webdriver, never Steve's mouse.

## Notes
- 2026-10-12: balance at the balanced killer count, 120 games each of bots plus one idle human seat: killers win 0.57 4p,
  0.57 5p, 0.48 6p, 0.39 7p, 0.53 8p, 0.53 9p, 0.42 10p, 0.38 11p, 0.37 12p, 0.47 13p, 0.63 14p, 0.46 15p, 0.47 16p;
  games last 2-4.5 minutes. At 10-11 players the crew votes both killers out often, so raising the target barely moves it.
  Fewer killers than the most is much easier for the crew (16p2k: 0.03), so the setup labels the most "balanced".
- 2026-10-14, after the retune (9a4efe7), measured at 45380c5 on the ml350: 120 games per player count (bots plus one idle
  human gambler seat) at the most killers it allows (`node tools/batch.mjs 120 <n> <k> normal`, one idle human seat), 0 errors, 0 timeouts.
  Killer win rate (bank wins / eject wins, minutes, meetings a game): 4p1k 0.57 (48/3, 2.2, 1.3), 5p1k 0.61 (26/21,
  3.0, 2.2), 6p1k 0.48 (19/43, 3.3, 2.9), 7p2k 0.59 (48/1, 1.8, 2.1), 8p2k 0.55 (33/21, 2.5, 3.4), 9p2k 0.50 (26/34,
  2.9, 4.0), 10p2k 0.44 (10/57, 3.2, 4.4), 11p3k 0.53 (38/19, 2.4, 4.2), 12p3k 0.43 (34/34, 2.6, 5.0), 13p4k 0.55
  (43/11, 2.0, 4.3), 14p4k 0.53 (37/19, 2.6, 5.6), 15p4k 0.47 (24/39, 2.9, 6.5), 16p4k 0.39 (18/55, 3.2, 7.2).
  Inside the 50-58% goal: 4, 8, 9, 11, 13, 14. Within one standard error (about 0.045 at 120 games): 5, 6, 7, 15.
  Clearly under it: 10, 12 and 16 players, where the crew votes the killers out (eject wins 55-57 of 120 at 10 and 16).
  Rounds last 1.8-3.3 minutes of play (the game clock, which stops during meetings), so 7 players (1.8) falls just under the 2-5 minute goal and the rest are inside it.
- 2026-10-14, after the pathing fixes (routes round the restroom stalls, no corners inside walls, hunts keep the stuck
  check, wander never targets the pond), same matrix: 4p1k 0.58, 5p1k 0.64, 6p1k 0.51, 7p2k 0.53, 8p2k 0.56, 9p2k 0.54,
  10p2k 0.41, 11p3k 0.55, 12p3k 0.49, 13p4k 0.61, 14p4k 0.65, 15p4k 0.51, 16p4k 0.38; 0 errors, 0 timeouts, 1.7-3.6
  minutes (the shortest counts under the 2-minute floor). Killers that used to stand stuck now finish their hunts; 10 and 16 players stay under the goal.
- 2026-10-14, after the router rewrite (shortest way round the furniture over a corner graph, clearance measured round
  corners), same matrix: 4p1k 0.57, 5p1k 0.64, 6p1k 0.44, 7p2k 0.56, 8p2k 0.58, 9p2k 0.53, 10p2k 0.39, 11p3k 0.68,
  12p3k 0.43, 13p4k 0.58, 14p4k 0.57, 15p4k 0.52, 16p4k 0.47; 0 errors, 0 timeouts, 1.8-3.4 minutes. Within the noise
  of the run before; balance is retuned separately (studio step balance).
- RTP measured by tools/ev.mjs: blackjack 1.06, roulette 1.05, slots 1.05/1.06, plinko 1.04, mines 1.03, crash 1.04,
  dice 1.04/1.06, wheel 1.05, duck race 1.05.
- Checks (headless Chrome on the GPU, through the scheduler): every console seats and settles; 16-player meeting fits;
  phone landscape console fits; two-tab online game (guest bet reached the host bank); a full 12-player killer game ran
  to the results screen with no page errors; desktop frames 4-12 ms median at 1600x900.
