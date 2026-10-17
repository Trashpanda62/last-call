# Five arcade games and latest playtest repairs

Delivered 2026-10-17 to the [LAN casino](https://10.42.0.37:3161/). Reload the page to receive the current build.

The central arcade now has a compact bank of five original cabinets in the casino's burgundy, cracked black stone and antique-gold palette. The main promenade and all existing machines remain reachable. [Updated top-down map](../casino-layout-top-down.png).

| Game | Play | Return thresholds (1× / 1.5× / 2× / 3× stake) |
| --- | --- | --- |
| Potato Stack | Left click drops the moving block; overhang is trimmed | 4 / 7 / 10 / 14 blocks |
| Vault Breaker | Left click when the rotating needle reaches the marked arc; three strikes end the round | 1 / 2 / 3 / 5 locks |
| Last Train | Left click jumps over luggage; right click slides under hanging signs | 5 / 10 / 16 / 24 obstacles |
| Midnight Pinball | Left/right click operate the corresponding flippers; click to serve each of three balls | 500 / 950 / 1500 / 2200 points |
| Potato Pop | Click friendly heads in the nine holes; avoid red-eyed decoys | 6 / 12 / 20 / 28 points |

Place the stake on the cabinet's BET control, press START, then click the screen to begin. Physical action buttons are also available. Rounds last at most 60 seconds; Potato Pop lasts 30. Below the first threshold returns zero. PAID shows the game return; BANK shows the actual shared-bank change including existing comp/insurance rules. Host ownership, replay rejection and one-time settlement use the existing arcade system. Leaving abandons and settles the current result once; disconnects use host takeover.

## Other requested repairs

- The VIP HIGH LIMIT sign is now on the slot hall's north wall. DUCK RACE is on solid wall east of Flying Pigs, clearing its cabinet and the doorway.
- Both skee machines use consistent solid authored backings. The malformed generated cabinet is no longer loaded; the scoreboard sits on the hood's front. Sphere-sized openings and the existing energy-based ball rules remain covered by entry tests.
- Left click sips when not using a nearby object; right click sniffs a held drink or checks the nearby table/machine. Existing table placement and pickup stay contextual. Last Train and Pinball reserve their right click during play.
- The coin-flip display slowly rotates, including after a completed flip.
- Check Traps has a centered icon and label with RMB on a separate line; responsive widths are checked at 1440, 740 and 420 pixels.

## Generated assets

Five approved Sorceress Sunburst 2K image jobs, one four-quadrant atlas per game. Actual total: **50 credits ($0.50)**. No extra jobs. Twenty trimmed WebP textures are integrated, with chroma-keyed foreground pieces and opaque themed backgrounds. Exact prompts, job receipts and output hashes: [media-provenance.json](media-provenance.json). Cabinet geometry, labels, rules and collision remain authored code.

## Verification

Native simulations check competent and idle play at three update cadences, actual flipper impulses, sphere bounds, invalid input, ownership, replay rejection, packed state and one-time payouts. Three real network browsers verify guest input, both observers, stale/foreign messages and disconnect settlement. First-person normal/no-prop browser checks exercise actual BET/START and game clicks, both mouse buttons, drink controls, sign positions, coin rotation before/after a flip, eye height and responsive dock alignment. Existing skee entry tests exercise all seven rendered holes and held-Space input. Navigation covers 92 seats, 2,548 routes and 14,073 segments.

Reports: `docs/performance/2026-10-17-arcade-five-{rules,views,network,skee-entry,layout}.json`. These are automated checks; Steve's visual/play acceptance remains open. Existing game-length and killer-balance hold C02 is unchanged.

## In-game previews

[Potato Stack](stack.jpg) · [Vault Breaker](vault.jpg) · [Last Train](train.jpg) · [Midnight Pinball](pinball.jpg) · [Potato Pop](pop.jpg) · [Skee backing](skee.jpg) · [Centered safety control](dock.jpg)
