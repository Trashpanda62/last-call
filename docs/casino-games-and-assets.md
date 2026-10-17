# Casino games and asset production

## Constructed checkpoint — 2026-10-17

The built coordinates are in [casino-layout-built.json](../design/casino-layout-built.json), with the interactive page defaulting to Built. The original proposal below is retained as design history. The casino now has central roulette and dice, back-to-back penny slot banks, a high-limit row, a VIP coin/wheel/shop/social cluster, the skee/Plinko pair and both new cabinets. All 63 game/social/security positions, six snacks, doors and staff approaches pass the production navigation checks; nine principal circulation strips clear occupied bodies at widths of at least 1.5 m. All 528 gathering poses (1–32 players) clear the built map, and meetings use those same positions.

Plinko has a continuous walnut/green base replacing the exposed lump and detached stand, a supported BET circle, green DROP and three physical risk keys. Duck derby is a brass-trimmed wooden flume with numbered lanes, moving gates and finish lamps. Each desk has numbered circles, live odds and START; the odds fold flat for the run. Chips stage until START; editing and withdrawal remain available before the gates close.

Midnight Mint has five tokens and at most forty simulated coins. Move the chute and time DROP against the moving shelf. At 2/4/6/9/12 coins the total return is .5/1/1.5/2/3× the stake; fewer than two returns zero. The thresholds are printed on its score panel. Night Shift Claw has three attempts, four movement keys and DROP. Prizes show their point values; total return is points divided by three. The host validates carriage steps, reach and pickup, and settles each round once. Visible gold assistance preserves the existing protected-streak behavior; the claw's point tags update with assisted value changes. Owner/guest/spectator, abuse, disconnect, insurance, death/leave, compact screens and fallback graphics have automated coverage. Neither game required paid assets.

Player acceptance remains open; rocket/coin/wheel art expansion still follows review of the Plinko pilot. Steve's C02 balance hold is preserved.


Status: ACTIVE planning, 2026-10-16. Layout first: [interactive measured draft](../design/casino-layout.html), [placement data](../design/casino-layout-v1.json). This specifies work; it does not claim these games or generated assets are already playable.

## Layout and game mix

Retain the seven-room shell. Put dice beside roulette on the main floor, group blackjack into a card pit, and give the arcade a continuous 1.6 m promenade. Two parallel skee-ball lanes occupy its east wall; consolidated Plinko, coin-pusher and a prize claw face the promenade. Use the vacated dice zone for high-limit slots. VIP becomes a deliberate coin/wheel and seating cluster with a recognizable shady shop alcove. Keep doors, security, camera destinations and hiding opportunities usable.

The interactive draft has 22 proposed groups compared with the original 27 scattered machine groups (28 after the first arcade construction step). The aim is a fuller physical experience through larger playable objects, paired lanes and spectators, rather than preserving every small duplicate console. The expanded draft now includes 64 player positions and their approaches, individual skee roller/spectator bays, 16 retained furniture pieces, 15 plants, four relocated plants, the relocated pit bell and all six staff exits. The [measured clearance audit](../design/casino-layout-audit.json) checks 10 cm grid reachability to every approach and all ten door crossings, occupied-player clearance, other-object bay clearance and the three reserved 1.5 m or wider main aisles. All pass after moving Plinko clear of the rocket desks, shifting the coin-pusher away from a rocket approach and preserving the existing coffee seating as one lounge cluster. Blackjack body/table contact uses the existing curved-table seated poses rather than a rectangular tabletop proxy. The paired-lane gap is not a walkway; their south bays and the east staff route are clear. Production map collision, camera views and first-person signs still require validation after each incremental construction change.

## Material, light and typography brief — L03

Direction: an eerie, worn casino with substantial physical games and clear social sightlines. The supplied Gambling With Your Friends examples make the game silhouettes and mechanisms readable even in busy rooms: broad contrasting playfields, visibly separate rails/targets and one prominent game name. Apply those usability principles to Last Call's own worn walnut, oxblood and brass setting. The delivered [skee gameplay view](../design/previews/skee-gameplay-v1.png) is the current small game-face pilot; its continuous rails, recessed openings and independent readout establish the geometry approach, while its distant pocket values and busy surrounding wallpaper still need visual improvement. Technical integration is complete; this is not Steve's visual acceptance.

| Role | Starting specification | Purpose |
| --- | --- | --- |
| Cabinet body | Walnut / `#3a2214`, roughness 0.42–0.60; broad oxblood inset `#5a1422` | A solid, worn furniture silhouette; grain belongs on large surfaces, with restrained edge wear. |
| Play surface | Deep green `#193b35`, roughness 0.75–0.95 | Separate the moving ivory ball, brass rails and targets from the room. Keep any grain/pattern much quieter than the carpet. |
| Working metal | Muted brass `#c8963a`, roughness 0.35–0.50; no full-face mirror finish | Thin rail/target edges and mechanical parts catch light without covering labels in white glare. |
| Text / ball | Warm ivory `#f8edc9` against near-black green `#142d28` | High local contrast at the actual player camera. Values and live score take precedence over ornament. |
| Active / unavailable | Existing green, red, blue and purple blackjack actions, paired with their labels; unavailable controls visibly dim | Meaning remains identifiable without relying on color alone. Round state and press feedback must agree with the real rules. |
| Local illumination | Warm key around 2700–3200 K; start from existing cabinet light power/range and inspect under normal and blackout conditions | Light the face, hands and ball. A small emissive accent locates the cabinet; it must not wash out the complete playfield. Preserve quality presets and shadow behavior. |

Typography hierarchy: one consistent sans-serif for actionable text and numerals (the existing Arial stack needs no additional download). Keep the existing decorative sign face for room/game titles only. Use at most four sizes on a cabinet: title, dominant score, target/payout values, secondary round state. Default canvas spacing is a 4 px grid with at least 8 px clear padding around value cells. Render deterministic type after art generation, using real rules/payout data. At 1280 × 720, target critical digits at **14 screen pixels or more** from the intended playing position and at least **12 pixels at 740 × 420**; these are design targets to measure during the next face rebuild, not claims that current distant skee/Plinko values meet them. If 17 payout bins cannot all carry legible numbers, keep their physical separation and provide a larger readout for the selected/landed bin. Do not squeeze another paragraph into the strip.

Interaction hierarchy: one relevant primary action near the bottom; show **SPACE** for keyboard, **A** for standard controller and the action alone for touch. Before a stake, show only the placement cue. During play, retain useful data such as balls left, point, pot, return multiplier or countdown. Remove repeated start instructions and general rules from the HUD. Place detailed rules on the clear wall guide or optional help. Keep a result long enough to read, and let it occupy the existing result location.

Next art pilot: rebuild one Plinko face within its current 1.5 m cabinet and collision footprint. Keep the existing 16-row path/payout rules and prepared texture ownership; expose a continuous dark playfield, individual pegs, a visible top drop point, separated payout channels and a clean outcome readout. Recess the face enough to show depth while bringing every critical label and ball in front of the opaque bezel. Compare the same standing view before/after in normal and fallback graphics, both cabinet positions and 740 × 420. Include all three risk settings, real drops into edge/central bins and actual ray samples through the scoring/interaction surfaces. Roll out to rocket, coin and wheel only after this pilot is reviewed.

Before promoting a pilot: check player/seat/approach clearance and nearby doors, camera/vent views, audio zones, real input and multiplayer outcomes. Prepare assets/shaders before Continue; measure draw calls, texture/geometry lifetime and repeat the integrated candidate check after construction. Keep original paid sources/receipts; this brief requires **no new paid generation**. Player visual review remains a separate open item.

## Plinko face pilot — built 2026-10-16

Built per the brief above, inside the existing cabinet and rules. The model's lower panel hides the board below about 1.24 m, so the column of channels, 16 peg rows and drop chute is fitted between that line and the top of the seated view (spacing shrinks slightly). Channel values use the full cell width (1000 reads 1K); 17 cells cannot reach the 14 px target (5.5–6.6 px at 1280×720), so the landed channel gets an ivory frame and a corner readout shows the landed multiplier (26 px; 15 px at 740×420) or the risk when idle. The readout is one prepared atlas; landing only moves texture coordinates. Clicking the chute drops a ball. Evidence: performance/2026-10-16-plinko-face.json (10 views, forced edge/centre drops, ray samples), plinko-texture-pilot*.json, design/previews/plinko-face-v1-compare.jpg. Not yet reviewed by Steve; rocket/coin/wheel wait for that.

## Skee-ball — first new game

- Two 1.4 × 4.6 m lanes, north-facing target backboards, 1.2 m player bays at the south ends. Keep 0.4 m between cabinets and a separate promenade beside them.
- Place chips, then Space begins a nine-ball round. Mouse/controller stick sets lateral aim; holding and releasing Space/controller primary sets roll power. Use one small aim/power indicator during aiming. Actual ball, target pockets, remaining-ball tray and score belong on the cabinet.
- The host owns launch parameters, ball positions, pocket detection, scoring and one settlement per round. Use a fixed-step bounded lane simulation and swept pocket tests so low frame rate cannot tunnel through targets. Clamp launch speed and angle; ignore launches outside the aiming state or from other players.
- Pocket values: 10 / 20 / 30 / 40 / 50 plus two difficult 100 pockets. A miss rolls into the return and consumes one ball. Show banked score and returned balls. A short round clock prevents abandoned occupied lanes.
- Prototype payout schedule, subject to simulation: below 120 points returns 0× stake, 120–199 returns 0.5×, 200–299 1×, 300–399 1.5×, 400–549 2×, 550+ 3×. State explicitly that multipliers include the original stake. Test skilled play and intentional misses before balancing.
- Spectators see rolls and score; another player cannot change aim, power or stake. Leaving ends input and finishes/forfeits under an explicit host rule, never duplicates a refund. A protected lucky round may assist a bad roll visibly, without pretending the player hit an impossible pocket.
- Acceptance: nine consumed balls, every pocket and miss, repeated launches, narrow controller aim, disconnect/rejoin, two simultaneous lanes, shared spectator state and no allocations/uploads on the first roll after Continue.

## Complementary physical games

| Game | Distinct interaction | Physical presentation | Rules and implementation boundary |
| --- | --- | --- | --- |
| Coin-pusher | Choose drop position and time a moving shelf | Glass cabinet, lit coins, sweeping push shelf and visible payout chute | Fixed bounded token pool; host simulation and chute counting. No unbounded pile or per-token rigid body allocation. One token is paid at most once. |
| Prize claw | Position a claw in two axes, then commit a drop | Readable plush prizes, carriage rails, claw descent and pickup chute | Host validates reach and grip against visible prize bounds. Explicit finite play and payout; avoid a hidden arbitrary failure after an apparently successful grab. |
| Cash-drop / Plinko rebuild | Aim the drop, choose visible risk bins | Tall physical triangular peg board, rolling ball, lit payout bins | Extend the existing game rather than add another duplicate. Keep the existing prepared score-display path and deterministic host payout. |

Order: skee-ball pilot → playable lane → coin-pusher → prize claw. Rebuild existing Plinko presentation within its current rules. Each cabinet must be evaluated in the intended room and first-person camera before scaling up production.

## Sorceress pilot: exact paid plan

Live catalog checked 2026-10-16. **Steve approved two design images: 20 Sorceress credits (US$0.20 at 100 credits/$1). Both succeeded, 10 credits each.** Receipts are in `runs/sorceress/skee-pilot/` and `runs/sorceress/hands-pilot/`; originals remain there.

| Input | Tool/model | Settings | Cost |
| --- | --- | --- | --- |
| [Skee-ball cabinet](../design/sorceress-skee-pilot.json) | `image_generate` / `gpt-image-2.5-sunburst` | 3:2, 2K, one image | 10 credits |
| [First-person gloves](../design/sorceress-hands-pilot.json) | Same | 3:2, 2K, one image | 10 credits |

Review both at actual gameplay scale. Follow-up image-to-3D is **not part of this 20-credit request**: Hunyuan 3D 3.1 costs 30 credits per model. Only request that stage after the designs are accepted. A pair-of-hands design sheet is not a valid single-object 3D input; derive separate neutral hand references first. No humanoid auto-rig purchase: its 24-bone skeleton has no fingers.

Authentication: established Sorceress credentials recovered from the local Sorceress configuration; free authenticated ping succeeds. The helper receives the credential in process memory only. Never copy raw keys into these documents or ask Steve to paste one into chat. ElevenLabs continues using the existing vault credential.

Visual review: the cabinet has a clear physical silhouette, coherent walnut/oxblood/brass materials, rolling lane, target bowls and ball return. Its concentric target rings need functional pocket segmentation and deterministic score labels in-engine; do not bake the concept image into a flat game face. The gloves show five distinct digits per hand, proper opposing thumbs, readable seams and cuffs. The concepts informed the now-generated 3D stage. Glove topology, the locally authored finger rig and actual runtime poses are reviewed separately below.

Concepts: [cabinet](../design/previews/skee-ball-cabinet-v1.webp), [gloves](../design/previews/first-person-gloves-v1.webp), [provenance](../design/sorceress-pilot-provenance.json).

### Approved 3D pilot — both models generated

Steve approved the two designs and the separate 60-credit model stage on 2026-10-16. Both prepared jobs succeeded at exactly 30 credits each (60 actual): cabinet `0c05425e-9dd9-4628-a855-f9163752d87b`, glove `6555d13c-98f9-49ec-9ad7-6c28ec261073`. Receipts are in `runs/sorceress/skee-model/` and `runs/sorceress/glove-model/`. This is distinct from the completed 20-credit image batch. Both originals and receipts are retained; local optimization and glove integration are complete below.

Free authenticated model inventory queries found no existing skee-ball or glove models to reuse. The model guide was read. The live catalog prices Hunyuan 3D 3.1 at 30 credits per successful model. The completed model stage used **60 credits total (US$0.60)** for one cabinet GLB and one single glove/forearm GLB. Inputs: [cabinet model](../design/sorceress-skee-model.json), [glove model](../design/sorceress-glove-model.json). The latter uses an isolated crop of the already purchased open-palm glove, uploaded through the free staging endpoint. No additional image generation is proposed.

Cabinet acceptance: measurable silhouette and usable material quality after reduction to ≤20k triangles / three materials. Replace unsuitable baked bowls with authored scoring pockets, separate ball and return mechanisms, and crisp type. Glove acceptance: five separated digits, opposing thumb, visible knuckles and wrist/cuff; reduce to ≤6k triangles for one hand, mirror locally for the pair, author the dedicated finger rig and weights locally. No paid humanoid auto-rig. Reject fused-finger or badly distorted output rather than hide it with animation.

This plan covers exactly two static model jobs, with local mesh/rig/animation work afterward. No extra takes, paid animation, paid rigging or publishing. Keep receipts and original outputs even if quality fails review.

Save one receipt folder per job, resume the same job after timeouts and keep rejected takes with reasons. Source: [Sorceress skill](C:/dev/playground-td/.claude/skills/sorceress-game-assets/SKILL.md), “Before the first paid call of a task, tell the user the plan and the expected cost ... and get approval.”

## First-person hand integration

Use dedicated glove/forearm assets, mirrored only if seams and thumb anatomy remain correct. Target a maximum of 12k triangles for both hands, two material groups, one shared 2K texture set and 17 local bones per hand (forearm, wrist, three joints for each digit). Delivered glove: 5,832 triangles, one shared material/2K base texture with 1K normal/roughness maps, 17 bones per independently posed hand and seven locally authored pose clips. The pair shares mesh and textures; the runtime file is 872,024 bytes. These measured counts exclude the two simple suit sleeves.

Author a proper finger rig and grips locally. Clip set: relaxed idle, chip pinch/place, card reach/flip, snack grasp/bite with a comic reaction, drink/sip, knife and ability gesture. Evaluate all denomination sizes, table heights and camera pitches. Cuffs hide attachment; fingers wrap around the object; wrists do not intersect the table. Prepare model, textures, animation bindings and shaders before Continue. Inspect close-up deformation at the actual camera, then measure draw cost and repeated-start cleanup.

## Loss-prevention item

Original item: **House Insurance**, sold by the shady shop. Purchase with personal winnings at 4% of the crew target. Inventory activation arms one upcoming round; protection binds at that round's first accepted stake, never after its outcome is known. One active policy per player, one protected round at a time.

For a losing protected round, return only its net lost stake, with no profit or lucky bonus on the insurance return. Wins and pushes leave the policy armed for the next round. Blackjack split/double outcomes aggregate into the same initial round; roulette multi-bets and simultaneous Plinko balls count as one committed round. Partial crash cash-outs aggregate before protection. A timeout/disconnect follows the normal host settlement and protection consumes at most once. Death cannot transfer the policy or pay it again.

Implementation must tag host-accepted round IDs and eligible stake before outcomes, capture protection with deferred settlement queues and deduplicate its reimbursement. Do not implement this as a blanket late `Math.max(0, delta)` that can protect old queued losses or be activated after a known loss. The UI should show one compact inventory icon: owned / armed / protected round. Activation must be available by mouse and controller. Exact controller mapping should reuse an inventory action, with the loading controls updated.

Additional shop concepts after insurance: a noisy wind-up decoy that attracts nearby attention; a one-round comp voucher capped at the posted stake; a comic lucky charm with visible remaining uses. Keep prices and counterplay explicit. Avoid items that reveal a living killer's private role without a deliberate game rule.

### Local pilot optimization checkpoint

The glove is reduced from 1,499,802 to 5,800 triangles / one material / 635,296 bytes; the cabinet from 1,500,000 to 19,000 triangles / one material / 1,773,372 bytes. Each retains a 2K base texture and 1K normal/roughness maps. Originals remain untouched in the receipt folders. Staging files are in `design/models/`; raw generator models never enter game loading. Six rendered views check fingers, rails, silhouette and materials. The final glove adds a sealed end, local 17-bone rig and seven pose clips: 5,832 triangles / 872,024 bytes. The generated hands now load before menu readiness and replace the first-person mittens by default. The existing diagnostic `toy`/`noprops` modes and `legacyHands` retain the old hand comparison. Visible card/chip placement passes all 140 occupied seat/action states with the new hands. The subsequent playable checkpoint below adds functional skee pockets, clean rails, labels and gameplay.

Actual optimized output: [cabinet render](../design/previews/skee-ball-cabinet-3d-v1.png), [default hands at blackjack](../design/previews/generated-hands-blackjack-v1.png), [22-state runtime hand check](performance/2026-10-16-generated-hands.json), [exported rig check](performance/2026-10-16-hand-rig.json). The staging cabinet render shows the original uneven baked rails; the playable checkpoint replaces those surfaces locally.

## Playable skee-ball pilot — 2026-10-16

Two lanes now occupy the measured east arcade bay. Plinko moves to a north-wall pair. The arcade hot-dog stand now occupies a clear west-side bay at (2070, 480), rather than the former location inside the new Plinko footprint. The other full-layout proposals are still pending. The untouched optimized source remains in `design/models/skee-cabinet-v1.glb`. `tools/prepare-skee-cabinet.py` removes unsuitable baked rolling/target faces and exports a 13,559-triangle / 1,556,088-byte shell with one PBR material and the existing reduced textures. No extra paid jobs. In-engine geometry supplies continuous rails/ramp, seven real openings and readable labels/readouts.

Place a chip in the front circle, press Space to start, aim with mouse or right stick, then hold/release Space or controller A to roll. Holding the HUD control also sets power; cancellation never rolls. The camera remains free. Nine balls or 90 seconds end the round. The host alone accepts the current owner/round/next-ball sequence and settles the stated multiplier once; duplicate/stale input cannot create another payout. Lucky rounds visibly guide gold balls into real 50/100 openings. Ordinary rolls remain skill-based.

Leaving or dying finishes the current ball and forfeits unused balls, with only the earned score returned. Ghosts can start/play as elsewhere in the casino. A disconnected human becomes a host bot under the existing replacement policy; bot payout caps continue to apply. New arrivals use the existing lobby policy rather than claiming an in-progress owner.

Evidence: `docs/performance/2026-10-16-skee-rules.json`, `2026-10-16-arcade-routes.json` and `2026-10-16-skee-view.json`. Seven-pocket/miss sweep, 25 guaranteed lucky wins, host abuse checks, both graphics paths, mouse/keyboard and simulated controller holds pass. Real three-client network, 740×420 controls, missing-model Retry and the 19-scenario audit now pass. Six restarts retain 468 geometries / 363 textures; all 31 sign surfaces clear in both variants. See `2026-10-16-skee-network.json`, `2026-10-16-required-skee.json` and `2026-10-16-whole-game-skee.json`. User visual approval and physical controller testing remain open.


## House Insurance — implemented checkpoint

The shady shop now sells the policy for 4% of the crew target, paid from personal winnings with the normal crew-bank deduction. A compact shield supports click, I and standard-controller R3 activation; the loading controls list that mapping. Owned, armed and protected-round states remain private to their owner. Arming after an accepted stake is rejected.

`src/insurance.js` records host-accepted round stakes before outcomes. Blackjack doubles/splits, concurrent Plinko balls, dice bets and shared crash/race/skee rounds settle as one policy round. Only net lost stake is returned once. Wins/pushes retain the policy, withdrawal releases a binding, and queued results capture existing coverage before leaving/death. Replayed, stripped, foreign, unknown, mismatched and oversized stake receipts cannot create reimbursements.

[Rules evidence](performance/2026-10-16-insurance-rules.json): 108 real table rounds and 16 host/queue/shared-game/abuse/privacy cases pass. The general settlement oracle passes 23 scenarios with 50 trials each. [Actual three-browser PeerJS evidence](performance/2026-10-16-insurance-network.json) covers guest purchase, click/keyboard/controller activation, a physical red Stand click losing 17 against dealer 20, matching refunded banks for host/guest/spectator, duplicate/foreign packet rejection and the compact HUD. Standard-controller input is simulated; hardware acceptance remains open.


### Hand framing correction after playtest feedback

The initial runtime transform made the palms face up and mirrored the wrong glove. Corrected the source right hand and mirrored only the left. Removed the forced 60-degree forearm bend; the complete arm’s resting angle now provides framing, and a fitted open sleeve lip joins the generated cuff. [All 22 actual poses](performance/2026-10-16-hands-neutral-wrist.json) retain neutral wrist axes, correct palm/thumb orientation and sleeve containment. The [current gameplay view](../design/previews/hands-neutral-gameplay.png) supersedes the initial integration screenshot for orientation/fit. User visual acceptance remains open.
