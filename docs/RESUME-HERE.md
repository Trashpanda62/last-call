# Last Call — resume here

Updated **2026-10-16** after Steve explicitly resumed work in this session. The outstanding integrated scenery audit/startup profile is complete. Contextual table controls are implemented and deployed; expanded solo/three-browser death checks and plaque checks pass. The broader game work remains **ACTIVE and unfinished**.

## Latest (Claude session, 2026-10-16 night): Steve's second playtest list

- B10 tables keep running when you walk off (spins, AUTO slots; held for you); blackjack/Mines/Tower/coin pot/dice point settle past 10 ft. B11 Plinko rebuilt bottom (pockets, gates per risk, playfield in front of the model's fascia, auto-bet on the chute), rocket statue removed. B12 signs beside doors on black backers, lowered; real restroom mirror (src/3d/mirror.js). B13 duck race: chips on a duck are the bet, duck buttons on walnut desks. C02 kill cooldowns 60 s, everyone 20% faster, monster 1.5x.
- New tools: background-tables-check, plinko-drop-film, view-shots. Updated: settle-check, insurance-check, contextual-controls, physical-starts.
- Open: bot nights now run ~6-8.5 min with killers winning ~70% (60 s kills). Steve: don't tune length or killer wins until he has tested. A parked candidate is in active-plan C02.

## Earlier (Claude session, 2026-10-16 late)

- Codex's checkpoint independently re-verified (all claims held). Plinko face pilot and rocket move done (G06/B06).
- Steve's playtest fixes, deployed and checked: no SPACE starts (each table starts from its own control; blackjack HIT deals; slots have a chip slot instead of three buttons), varied lucky blackjack hands, left click is the only interact (E is the killer ability), killer can get a drink. See active-plan B08/B09/C01 and performance/2026-10-16-physical-starts*.json.
- New tools: tools/physical-starts-check.mjs, tools/plinko-face-shots.mjs. Updated: contextual-controls, casino-refresh, plinko-texture, luck, arcade-route, table-shots.
- Still open: Steve's review of the Plinko pilot and the new starts; Crash/race/skee keep their SPACE primaries (shared rounds / hold-to-roll).

## Next work

1. Read this file and [active-plan.md](active-plan.md), the authoritative task ledger. Preserve the current checkout and completed assets; do not restart the project or repeat paid stages.
2. Continue the visible game backlog: apply the L03 brief in docs/casino-games-and-assets.md to the bounded Plinko game-face pilot, then continue layout construction/collision/navigation/camera/audio follow-through and the planned coin-pusher/prize claw. Skee remains the delivered art/mechanics pilot; wider rooms are unbuilt. No new paid generation is authorized by this checkpoint.
3. The V08 integrated checkpoint and the contextual-controls final candidate reports below replace the old “rerun scenery audit” next step. Do not repeat already passing jobs without a source change or unresolved concern. Startup texture uploads and the early PeerJS probe remain attribution leads; no startup/FPS gain is claimed.
4. B04/V03 still need the remaining live-round wording review. B05/B06 still need snacks and other interaction surfaces; both table plaques now have clear surface coverage, with oblique text readability explicitly open. D01/D03 technical coverage is complete; D02 and hands/wrists H03/H04 still require Steve's visual acceptance. Technical checks do not establish that the art looks good.

## Workspace and deployed build

- Workspace: **C:/dev/last-call**, branch **master**. Extensive intentional uncommitted/untracked work exists, including .claude/, .dev/ and tools/prop_fit.py. Preserve all of it. No commit, reset, cleanup, public release or new branch was requested.
- Playtest: **https://10.42.0.37:3161/**, TrueNAS nginx, self-signed HTTPS and no-store. Hosting continues independently of this PC.
- [Delivery receipt](playtest-build-2026-10-16.json): all **92 runtime/asset files** match served bytes for the current production candidate. Documentation/tool changes are synced after verification.
- Current src/3d/render3d.js SHA-256: **822f68b22167b5d389f6292b4e788f0168847dec184ac6fec96be95da1584df9**.
- Follow the repository/user execution-continuity instructions. No subagents were used in this resumed checkpoint. Continue authorized investigation, changes and verification without routine permission check-ins.

## Latest production change: contextual table controls

Primary table prompts name the actual action (Deal/Spin/Drop/Roll/Flip/Climb/Place bet/Start round) and follow actual **SPACE / controller A / touch** use. Idle pads and small stick drift do not replace keyboard prompts; keyboard/mouse return, disconnect and keyboard after touch work. Controller-generated synthetic keys preserve the active device. Skee hold/release retains the button element through label changes. Repeated placement/start/scroll instructions are removed from the affected betting-game statuses and chip summary; useful round data and physical blackjack actions remain.

- Source changes: src/main.js, src/gamepad.js, src/tables.js and index.html. Current main.js SHA-256: **e9c89d74ab05356da279892aafd9bc7bc41149c04f116d60d37de6760c4aef23**. Renderer/asset quality is unchanged.
- [24 normal/fallback betting-game states and actual device transitions](performance/2026-10-16-contextual-controls.json): twelve games each verify initial and chip-placed prompts; real simulated-controller skee start/hold/release, drift, keyboard/mouse return, disconnect, touch and keyboard after touch pass. At 740×420 the touch primary is contained and 44 px high. Previews: design/previews/contextual-controller.png and contextual-touch.png.
- [Loading/Continue/controller regression](performance/2026-10-16-loading-contextual-controls.txt) passes, with no late asset downloads and required-asset Retry. Existing settlement suite passes **23 scenarios × 25 trials**.
- [Six solo death paths](performance/2026-10-16-death-paths-expanded.json) now include real rig/chip/delay and blackout/transform/grab. [Four actual three-browser deaths](performance/2026-10-16-death-network.json) cover guest paused-table knife, trap, monster and delayed last-player delivery. A fresh complete host snapshot after five seconds of held deltas contains a death already **5.05 simulation seconds old**; all three phases still play once before the end screen. Killer identity is victim-only; ordinary completion releases ghost CCTV. No death runtime change was needed in this session. Player acceptance remains open.
- [Table plaques](performance/2026-10-16-table-plaques.json): **500** rays across ten occupied seats × two variants are clear. Far-side text can narrow to about 20 projected pixels in width; this is obstruction coverage, not a claim of universal lettering readability.
- L03 is now delivered in docs/casino-games-and-assets.md: a material/light/type/interaction brief, current skee readability shortcomings and a bounded next Plinko pilot. It does not claim a completed art rebuild or Steve's acceptance.

## Retained renderer change: fixed scenery outside the view

V08 adds cullOffscreenScenery in src/3d/render3d.js. src/3d/world.js tags baked static batches and src/3d/props.js tags fixed generated instanced props with userData.fixedScenery. Dynamic prop objects are excluded.

The guard rejects an eligible object only when both its transformed body bounds and entire directional shadow projection miss the camera. Camera/projection/shadow-direction changes invalidate the cached decision; object transforms and shadow flags are checked too. It runs after visible matrices, immediately around normal first-person rendering, and restores visibility in finally. Preparation and orbit keep their existing behavior. Cache ownership follows the current world. Ordinary actor posing/item updates, asset detail, effects, presets and resolution are retained.

Verified evidence saved locally:

- [82 paired production views](performance/2026-10-16-offscreen-scenery-current.json): **zero changed pixels**, repeated original frames exact, same actor pose counts. Rooms, turns, Low/Ultra, FOV 55/90/110, moving actors, Backrooms and ghost CCTV covered. Seeded floor **451 → 424 draw calls / 2,060,496 → 2,018,453 submitted triangles**, with 16 scenery meshes rejected.
- The same report's alternating 16-render CPU medians: floor **79.0 → 77.5 ms**, north **99.8 → 98.5 ms**, bar **31.1 → 30.6 ms**. These are local synchronous render measurements, **not overall FPS or startup improvements**.
- [Independent cache/recovery oracle](performance/2026-10-16-scenery-cache.json): **56 cases**, normal and noprops/nomats fallback. Reference projects all eight body-box corners along the key direction. Camera/projection/quality/shadow/parent-transform changes, Backrooms, return turns, actual world replacement and an intentionally thrown renderer error pass. Visibility is restored, old-world references are discarded, and unchanged views perform zero repeated frustum-box tests.
- [Runtime comparison baseline](performance/2026-10-16-runtime-scenery-baseline.txt) and [current candidate](performance/2026-10-16-runtime-scenery.txt) both PASS: seven restarts **357/358/357/358/357/358/357 textures**, eight eating cycles **470 geometries**, correct first-return world/bind matrices, one upload per skeleton pose, frozen poses, unchanged HUD, unique asset requests and zero page errors.
- [Loading/Continue/input](performance/2026-10-16-loading-scenery.txt) PASS: startup preparation barrier, frozen briefing, visual keyboard/labelled controller, desktop/mobile layout, controller commands, no late asset downloads and missing-required-asset Retry.
- Syntax checks pass for the three production files and tools/offscreen-scenery-check.mjs, tools/scenery-cache-check.mjs and tools/runtime-perf-check.mjs. Git whitespace checks pass.

Runtime fixture caveat: the initial unseeded restart test observed 358/358/358/356/358/359/358 textures and exceeded its plateau tolerance. Different randomly rendered character populations can allocate different bone textures. The fixture now alternates deterministic population seeds 42/43 and compares both helper-bypassed baseline and candidate. Both pass with identical counts; the tolerance was not loosened. The initial failure is recorded here, not a claim of a production leak fix.

Previous V07 actor culling remains in production after ordinary posing/item updates. Its independent [82-view report](performance/2026-10-16-offscreen-actor-current.json) and [25,582 portal decisions](performance/2026-10-16-portal-cache-offscreen.json) remain valid. V08's baseline keeps V07 enabled, isolating the additional scenery change.

## Fresh baseline and unfinished profiling

The original pending V08 integration run is now complete: [19-scenario scenery report](performance/2026-10-16-resume-whole-game-scenery.json), zero page errors/repeated URLs and 470 geometries / 357–359 textures across six unseeded restarts. Floor 451 → 424 draws and arcade 270 → 251; median remains about 16.7 ms. [Scenery startup](performance/2026-10-16-resume-startup-scenery.json): 9.762 s / 283 ms longest task, compared with 9.587 s / 297 ms before V08. Single samples do not establish a startup improvement or regression. These reports precede the contextual-controls code change. The [final contextual-controls audit](performance/2026-10-16-whole-game-contextual.json) now also passes all 19 scenarios, with zero errors/repeated assets, 470 geometries and 356–360 textures over six unseeded restarts. [Final startup](performance/2026-10-16-startup-contextual.json): 9.554 s ready / 336 ms longest task. Separate single samples do not establish a startup/FPS gain. No browser/GPU job remains running.

These older reports were captured on resume **before V08** and must not be described as the final integrated candidate:

- [19-scenario baseline](performance/2026-10-16-resume-whole-game-before.json): zero page errors/repeated static URLs; six unseeded restarts retain 470 geometries and 360/359/358/358/359/359 textures. Seeded floor 451 calls, north 643, bar 117, running crowd 480.
- [Startup baseline](performance/2026-10-16-resume-startup-before.json): **9.587 seconds** to readiness; longest task **297 ms**; about **2.990 seconds** sampled texture-upload CPU. Large 2048-image uploads cost roughly 50–77 ms each. Early PeerJS capability probing accounts for about 292 ms. These are attribution leads, not established optimization outcomes.
- [Submission attribution](performance/2026-10-16-resume-render-cost-before.json): no repeated shader selections. Remaining same-room geometry/shadow submissions motivate V08.

Read-only texture inspection found no duplicated large GPU images. Independent dynamic machine screens/scoreboards retain separate state. No textures were reduced or merged. .dev/render3d-resume-before.js preserves the pre-V08 renderer. .dev/static-view-probe.mjs and .dev/resume-texture-inventory.mjs are private investigations, not alternative production implementations. The downloaded .dev/peerjs-current.min.js was inspected only; PeerJS initialization is unchanged.

## Player-visible work already implemented

- **Blackjack:** scoring corrected, extra decorative hands suppressed at occupied tables, chips centered in the printed circle and cards close to the player. Screen action panel removed. Small physical green Hit/red Stand/blue Double/conditional purple Split buttons sit below the chips. Mouse/HJK/simulated controller and 280 seat/action states pass, including a real 4+3 hit staying live at 16. [Preview](../design/previews/blackjack-buttons-v2.png).
- **Hands/wrists:** generated glove pair with independent finger skeletons, palms/mirror corrected, forced 60-degree bend removed and fitted open sleeve lips. All 22 actual pose/held-item states pass orientation, neutral-wrist, sleeve and preparation checks. Steve's visual acceptance remains open. Views: design/previews/hands-neutral-gameplay.png and hands-neutral-idle/reach/sip/knife/snack.png.
- **Games/layout:** two playable east-arcade skee-ball lanes with approved optimized cabinet, authored rails/pockets/readouts, nine-ball host simulation and network checks. Arcade Plinko pair relocated. Hot-dog pedestal moved out of the Plinko shell to (2070,480); all six snack approaches/bites and 260 routes/1,295 segments pass. Wider proposed layout is in design/casino-layout.html and design/casino-layout-v1.json; other rooms remain unbuilt.
- **House Insurance:** shady-shop single-use net-loss protection implemented with host authority, aggregate split/double/shared settlement and win/tie retention. 108 real rounds, abuse/privacy cases and actual three-client purchase/activation/physical Stand/refund pass.
- **Audio:** Settings → Sound previews **142** sounds with persistent Keep/Muted choices. ElevenLabs scores, table beds, positional breaths/death cries/footsteps/potato noises and quiet spatial bar jukebox are implemented. Direct listening page: audio-review.html. Steve's subjective keep/mute and balance decisions remain open.
- **Death:** private 3D killer reveal/lunge/collapse passes real knife, seated/paused, delayed poison and last-player paths. Guest/trap/monster and delayed last-player delivery now have actual coverage as recorded above; player acceptance remains open.
- **Other controls/flow:** protected winning streaks/eventual wins, full roulette stop, ghost CCTV, vent previews/second-click travel, LMB kill/RMB disguise/Q transform/E ability/Shift leap, retained mouse-look, menu/loading art, generated ability icons and keyboard/controller briefing with explicit Continue are implemented.

## Remaining game work

The authoritative ledger has exact statuses and evidence. Main open work: applying the delivered art/material/light/type brief; broader casino layout construction and collision/camera/audio follow-through; remaining contextual HUD wording; dealer plaques and other interaction overlaps; additional coin-pusher/claw options; art upgrades to Plinko, rocket, giant coin and prize wheel; player review of the death sequence; first-person hand visual review; integrated performance checks after changes. Physical-controller hardware and a real 32-client voice load remain untested. Do not close these from simulated-input or local rendering results.

## Tools and operational commands

GPU verification host: **ml350**, directory **~/lc-runner/codex-oct15**. Dependencies/environment: **PW=$HOME/ptd-runner/node_modules/playwright**, **DRI_PRIME=pci-0000_8a_00_0**, **LC_GPU=vulkan**. Run **one GPU job at a time**, redirect verbose logs, copy final reports into docs/performance/. All jobs from this checkpoint are complete and their browsers are closed. Run future jobs one at a time.

Example for a future source change, on ml350 after uploading any changed tool (choose fresh output names):

~~~sh
cd ~/lc-runner/codex-oct15
export PW=$HOME/ptd-runner/node_modules/playwright DRI_PRIME=pci-0000_8a_00_0 LC_GPU=vulkan
node tools/whole-game-audit.mjs shots/next-whole-game.json > shots/next-whole-game.log 2>&1
node tools/startup-profile.mjs shots/next-startup.json > shots/next-startup.log 2>&1
~~~

Check each exit status before continuing. Use new output names so the baseline evidence is retained. Focused reruns, only if changes justify them: tools/offscreen-scenery-check.mjs, tools/scenery-cache-check.mjs, tools/runtime-perf-check.mjs (optional --baseline-scenery), tools/loading-check.mjs.

LAN sync from PowerShell:

~~~powershell
& 'C:/Program Files/Git/bin/bash.exe' tools/sync-truenas.sh
node .dev/verify-playtest-build.mjs
~~~

The verifier refreshes the 92-file served SHA-256 receipt. Keep runtime edits, evidence, task statuses and handoff consistent after future changes.

## Paid assets and credentials

No paid calls were made during this resumed optimization and no provider job is pending. Approved Sorceress **20-credit image stage** and **60-credit two-model stage** are complete. The approved 16-file ElevenLabs pack estimated 624 credits and actually cost 628, previously disclosed. Preserve the original receipts/raw assets; do not repeat these stages. Credentials remain in the established vault/provider configuration; do not ask Steve to paste keys. Any additional paid generation needs a concrete plan under the applicable local provider skill and existing session authorization.
