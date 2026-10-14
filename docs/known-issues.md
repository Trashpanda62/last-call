# Last Call: known issues, crashes and test limits

Kept current with the code; each entry says when it was checked and how. Last checked 2026-10-14.

## Crashes

- Unresolved crashes: none known. Checked 2026-10-14 headless on the ml350: 1,560 games of bots and one idle human seat
  (120 at each player count, 4-16, at the most killers each allows) ran with 0 errors and 0 timeouts, before and after the pathing fixes
  (`docs/plan-v3.md` Notes); `tools/head-check-ml350.sh` (syntax of every src file, a batch, the odds table, the route
  check) passes on the committed tree. In the browser: the 2026-10-12 headless Chrome run played a full 12-player killer
  game to the results screen with no page errors (`docs/plan-v3.md`). No crash has been reported by a player.

## Open defects (found by crew reviews, 2026-10-14)

- Bank settlement: bets decided as a meeting starts were dropped, rounds you stand up from mid-hand settled nothing,
  and the bank could still change after the verdict. Being fixed (studio step systems), with the coin ride capped at
  16 wins so its biggest pot stays under the settlement ceiling (`MAX_MULT`; 20 wins promise more than it pays).
- Round length: Steve wants rounds of about 15 minutes on average (2026-10-14); bot rounds average 2-3 minutes of play
  (bank wins in 1.5-2 minutes, fast ejections). To tune together with the killer win rate (`tools/batch.mjs`,
  `tools/bankcurve.mjs`: closing time, bank targets, bot stakes, kill cooldowns, bot suspicion).
- Balance: at 10, 12 and 16 players the killers win under the 50-58% goal (the crew votes them out); see
  `docs/plan-v3.md` Notes. To retune once the comp change lands.
- First-time player: the tips are timed rather than taught by doing, cannot be skipped or replayed from How to play,
  and some prompts name keys on touch screens (studio step tutorial).
- Playtest link: the GitHub Pages build has no visible build id and no build-numbered script paths, so a cached old
  build cannot be told apart from the current one (studio step playlink).
- `tools/v4_props.py` still lists `coinPodium`; a full re-run of the prop jobs would make that rejected mesh again
  (`src/3d/props.js` does not load it).

## Test limits

- Bot batches leave the one human seat idle, so they never press table parts; table input is covered by the headless
  Chrome checks instead.
- Browser checks run headless on the ml350's P100s (ANGLE Vulkan); a hidden pane does not render WebGL
  (`docs/plan-3d.md`), and no check runs on Steve's PC.
- No recorded human playtest yet: fresh-player sessions and phones (out of scope for polish, PC first) are untested by
  people.
- Crew reviewers cannot reach the live site from their sandbox; live checks run from the ml350.

## Source inventory categories

- Current assets: every file under `assets/`, each listed in its folder's `provenance.json` (the hats in
  `assets/art2/provenance.json`); vendored three.js r185
  (`vendor/three`, MIT).
- Alternatives and rejected: the takes not picked stay in `runs/` (git-ignored receipts); the coin podium mesh was
  rejected and removed (45380c5); voices were shelved (no voice lines).
- Recovered content: none. Free asset packs: none. Missing assets: none; every generated prop, character and texture has
  a hand-built stand-in in code that shows until it loads.
