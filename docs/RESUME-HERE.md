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

## VIP follow-up

The previous route/sign audit missed the crowded shop/piano corner and full palm spread. Removed the floating vendor name that overprinted the shop sign from across the room. Removed all four VIP palms, moved the shop against the east wall and stock clear of the piano/bench, and corrected the piano collision footprint to contain its full model and bench. The main approach runs in front of the shop/TV. Reviewed six first-person views per graphics variant; actual shop use/inventory and stock-to-piano bounds pass. Evidence: performance/2026-10-17-vip-clearance.json; previews: design/previews/vip-shop-clear.jpg and vip-wheel-clear.jpg. The top-down map now shows the measured conservative 71-pixel maximum palm spread instead of only planting centers.

## Red / black / gold aesthetic

Matched Steve's supplied reference in the actual casino: gold-veined cracked black stone walls, columns and wainscoting; oxblood damask carpet with flush stone borders and thin gold inlay; burgundy seating, black betting stands and warmer antique-gold lights/trim. Purple/cyan architectural accents are removed. Existing layout and game cues remain. Normal, no-prop and procedural-material views were checked, with doorway and VIP regressions. [Reference, current room previews and exact texture prompts](../design/casino-aesthetic/README.md).

## Latest arcade / slot hall playtest follow-up

Duck START now launches immediately. Skee uses rolling energy, curved-ramp launch, gravity and board/rail rebounds; removed mid-flight steering. New original Flappy Bird cabinet has physical controls, Space/controller A and host-owned collision/payout/replay/disconnect handling. Slot hall now contains 40 penny machines in four double-sided concealing banks; bank geometry also blocks actual witness evidence. Four VIP high-limit slots remain. DICE sign clears the floor/pond doorway; dice table rotated and VIP coin approaches/title face the lounge. Removed roulette's extra circles while preserving felt betting. Rocket AUTO defaults OFF; rocket, trail and crash burst are physical 3D meshes. [Previews and controls](../design/arcade-followup/README.md). Updated actual top-down map and all 87 game positions pass navigation coverage. Current evidence: performance/2026-10-17-arcade-followup-*.json, 2026-10-17-skee-physical-*.json and 2026-10-17-flappy-network.json.

## Latest slot / camera controls follow-up

Slots now use physical BET − / BET + / MAX BET / SPIN / AUTO SPIN buttons on fitted decks. Space spins too; chip sockets/trays/stacks and the HUD AUTO icon are removed. Bets follow each tier's effective minimum and the current maximum. Lobby recommendations are 2 killers at 16 players and 4 at 32. Camera left click cycles; right click exits. Staff doors enter immediately with no room picker: the host hides the character, freezes movement and supplies private room cameras; Exit emerges at the viewed room's staff door. Packed network visibility, observer rendering and disconnect recovery pass. [Previews and controls](../design/slot-camera-controls/README.md). Current reports: performance/2026-10-17-slot-camera-{rules,views,network}.json.

## Skeeball entry / Flappy placement and difficulty follow-up

Corrected the skee collision test to check the ballistic path at the actual hole plane, instead of judging it where the front of the ball touches the board. An accepted ball now carries its velocity through the opening before falling behind the face; it no longer drops vertically at the lip. Ball diameter is 80 mm, matching the rendered sphere and giving practical clearance inside the 156�190 mm openings. Roll energy is mapped across a more useful range. All seven pockets, misses, protected rounds and one-time host settlement pass, with actual rendered opening rays and entry motion in both graphics paths.

Flappy is now against the south arcade wall at (2660, 650), facing north beside the duck doorway; its playing/approach positions and the promenade stay clear. Moved the obsolete MINES / DRAGON TOWER wall labels over their actual machines. Flappy starts 36% faster, speeds up with score and narrows later gaps from .28 to .21; each pipe retains its own visible/collision gap while on screen. A precise scripted run can still clear 15 pipes; idle and repeated flap spam lose. The top-down plan is updated. [Previews and proposed next games](../design/arcade-entry/README.md). Current reports: performance/2026-10-17-skee-entry-rules.json, arcade-entry-{rules,views}.json, flappy-difficulty.json and the current entry network reports. No additional games were added in this follow-up.

## Manual acceptance and holds

The more realistic standard potato pilot is integrated at the shipped 1.41 m height, with natural skin, inset eyes, waistcoat/gloves and the existing local rig/animations. Steve approved the single 30-credit ($0.30) Hunyuan generation; no further paid variants were generated. Standard uses 24K triangles and baked 2K PBR maps. Graphics > Potato detail > High (original mesh), also included in Ultra, retains the full 1.5M-triangle model and 4K maps for the nearest potato up close. The optional download does not block startup. Corrected Steve's reported side-view arm: symmetric fitted shoulder/elbow/wrist joints, continuous upper-arm weights and ascending chest joints on both meshes. Both sides were visually checked idle and walking. Round/staff bodies and meeting portraits retain their previous designs pending pilot review. [Pilot details and evidence](../design/characters/potato-realism/README.md).

1. Steve's visual/play review: Plinko, derby, new cabinets, hands and sound keep/mute choices. Technical checks do not constitute player acceptance.
2. Physical controller and real 32-person voice session: simulated standard-controller and actual three-browser checks pass; full hardware/human sessions need devices and participants.
3. C02 balance remains on HOLD: Steve requested no further night-length or killer-win tuning before his playtest. Existing cooldown/speed settings remain.
4. Further rocket/coin/wheel art expansion is gated on Steve's Plinko pilot review. No further paid assets are authorized.

## Verification and delivery

Latest layout/payout evidence uses the layout-review and arcade-payout report names under docs/performance/2026-10-17-*; native rules include a normal one-coin return, while physical input checks arrange protected winning cycles to verify positive bank credit. Broader coverage: native-game rules/network/input, bet support, Plinko/derby visibility, routes/gathering/aisles, signs, cameras, snacks/death, audio, loading/resources, 21 whole-game scenarios and startup. Preserve October 16 evidence as historical comparisons.

LAN playtest: https://10.42.0.37:3161/ (existing self-signed LAN HTTPS).

Delivery identity: [complete source/asset/vendor receipt](playtest-build-arcade-entry-2026-10-17.json), generated after sync. All 855 Git-tracked files in src/, assets/, vendor/ and the three entry files match served SHA-256 bytes, including the mirror and new arcade modules.

The sync tool now copies Git-tracked files only. Stage new deliverables before syncing; preserve local untracked .claude/, .dev/ and shots/. Existing voice-server configuration is retained. No new generation or balance sweep is needed.

GPU checks run sequentially on ml350 using its existing Playwright/Vulkan setup. Validate the current checkout rather than an older served build. Compare performance on the same machine/settings; the larger constructed scene is not an FPS optimization claim.
