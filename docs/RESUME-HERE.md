# Last Call — resume here

Updated **2026-10-17**. The remaining implementable work from the prior checkpoint is constructed. Implementation, automated checks and LAN delivery verification are complete. [active-plan.md](active-plan.md) separates implementation from player acceptance. Older reports describe historical builds.

## Constructed in this continuation

- **Plinko:** continuous walnut/green lower cabinet, supported BET circle, physical DROP and LOW/MED/HIGH controls. Both cabinets show falling balls and landed risk channels.
- **Duck derby:** rebuilt flume, animated water, six lanes, swinging gates, numbered markers and finish lamps. One shared pedestal has six numbered betting circles, live odds and START. The wall tote sits entirely east of the arcade doorway. START enters this race only; accepted bets remain editable before gates close. Odds boards fold down during the run.
- **Physical betting:** supported circles across all 14 games, including Crash's actual desk. Stacks match authored centres/heights; roulette and dice retain ringed felt targets.
- **New games:** Midnight Mint coin-pusher and Night Shift Claw, with bounded 120 Hz host simulations, visible mechanisms and physical controls. Ownership, replay validation, spectators, disconnect takeover, insurance and one-time settlement are covered.
- **Constructed layout:** central roulette/dice, matching penny banks around the jackpot, high-limit slots inside VIP, arcade cabinets along the east wall and VIP coin/wheel/shop/social cluster. All 58 seat approaches, six snacks and nine principal circulation strips have measured collision/navigation coverage. The bell retains its original position; all 528 gathering poses for 1–32 players and meeting rendering share clear positions.
- **Integration:** repaired confirmed guide/neon/painting conflicts; retained snacks, death and ghost cameras. Actual guest footsteps, pause cleanup and verdict/lobby/Continue audio reset pass. No additional paid generation. Coin-pusher now settles after one token’s push cycle; claw settles after one grab, with visible 1×/2×/3× prize tags and the actual bank credit.

The [top-down PNG](../design/casino-layout-top-down.png) and [SVG](../design/casino-layout-top-down.svg) show the revised floor. The [interactive layout](../design/casino-layout.html) defaults to Updated layout and includes Before; [built data](../design/casino-layout-built.json) records actual coordinates. First-person previews are in design/previews/.

## What Steve should look for

- Enter Duck Derby from the arcade: the doorway is open, the tote is on solid wall to its right and there is exactly one pedestal with six duck choices.
- Open the top-down plan and switch Before / Updated layout. Roulette and dice share the southern pit, penny banks frame the jackpot, high-limit slots are inside VIP and the two new cabinets line the arcade east wall.
- Coin-pusher: place a bet, START, aim and DROP one token. After about 4.2 seconds the round settles. Each fallen coin returns 1× the stake, capped at 3×. No fallen coins is a miss.
- Claw: place a bet, START, aim and DROP once. After delivery (about 3.2 seconds), the grabbed 1×/2×/3× tag determines the return. A missed prize returns zero.
- Both cabinets show PAID and BANK separately. BANK is the actual shared-bank change, including the existing comp/luck rules. A $1,000 protected pusher test paid $3,000 / bank +$2,100; a $1,000 2× claw test paid $2,000 / bank +$1,100. Screenshots: design/previews/pusher-paid.jpg and claw-paid.jpg.

## Manual acceptance and holds

1. Steve's visual/play review: Plinko, derby, new cabinets, hands and sound keep/mute choices. Technical checks do not constitute player acceptance.
2. Physical controller and real 32-person voice session: simulated standard-controller and actual three-browser checks pass; full hardware/human sessions need devices and participants.
3. C02 balance remains on HOLD: Steve requested no further night-length or killer-win tuning before his playtest. Existing cooldown/speed settings remain.
4. Further rocket/coin/wheel art expansion is gated on Steve's Plinko pilot review. No further paid assets are authorized.

## Verification and delivery

Latest layout/payout evidence uses the layout-review and arcade-payout report names under docs/performance/2026-10-17-*; native rules include a normal one-coin return, while physical input checks arrange protected winning cycles to verify positive bank credit. Broader coverage: native-game rules/network/input, bet support, Plinko/derby visibility, routes/gathering/aisles, signs, cameras, snacks/death, audio, loading/resources, 21 whole-game scenarios and startup. Preserve October 16 evidence as historical comparisons.

LAN playtest: https://10.42.0.37:3161/ (existing self-signed LAN HTTPS).

Delivery identity: [complete source/asset/vendor receipt](playtest-build-layout-review-2026-10-17.json), generated after sync. All 847 Git-tracked files in src/, assets/, vendor/ and the three entry files match served SHA-256 bytes, including the mirror and new arcade modules.

The sync tool now copies Git-tracked files only. Stage new deliverables before syncing; preserve local untracked .claude/, .dev/ and shots/. Existing voice-server configuration is retained. No new generation or balance sweep is needed.

GPU checks run sequentially on ml350 using its existing Playwright/Vulkan setup. Validate the current checkout rather than an older served build. Compare performance on the same machine/settings; the larger constructed scene is not an FPS optimization claim.
