# Whole-game performance audit — 2026-10-16

The audited build is served at **https://10.42.0.37:3161/**. This pass found and fixed repeated GPU allocations, hidden character work, unchanged HUD writes, duplicate image downloads and repeated object construction. The selected graphics quality, resolution, lights and effects were preserved.

## Findings and implemented changes

| Finding | Change | Evidence |
| --- | --- | --- |
| Restarting a 32-player round leaked about 31 GPU textures each time. Cloned character skeletons retained their bone textures. | Actors now dispose their own skeletons, body/fur materials and label textures when replaced or removed. Corpses and private death actors use the same cleanup. Monster skeletons are released too. Shared models, geometry, maps and hat materials remain reusable. | Before: texture counts **339, 370, 401, 432, 463, 494**. Final full audit: **307, 306, 307, 306, 307, 307**. A separate seven-restart regression also verifies a plateau. JavaScript heap stayed about 65 MiB in both runs; the leak was in GPU resources. |
| Hidden rooms still posed the entire character crowd and recursively updated its matrices. | Determine camera/portal visibility before posing. Pose visible characters, update matrices only through visible branches, and restore poses/matrices on the first visible frame. Preserve Three.js's own SkinnedMesh update for skin bind matrices. AO visibility filtering also skips hidden subtrees. | Bar: **2 of 37** queued actors posed; restroom/arcade/VIP: **0 of 37**. Five immediate room changes compare every visible world matrix and skin bind matrix with Three.js's exhaustive update to within 1e-8. Doorway visibility and rendered characters are checked separately. |
| The killer HUD rewrote unchanged labels, titles, disabled states and attributes every frame. Meeting timers and table controls had similar churn. | Cache stable controls and update DOM properties only when their values change. Read table control bounds only when aiming needs them. Preserve action button nodes while values change. | Baseline bar sample: 1,764 attribute writes and 1,029 child-list mutations in the killer bar over about 2.4 seconds. Final paused bar/blackjack/meeting samples: **zero mutations and zero layouts**. Running crowd still performs real cooldown/status updates: 4 layouts, versus 148 before. |
| Routine death/input checks built the full debug scene snapshot, including every actor and backrooms metadata. | Use a direct death-state boolean; retain the detailed snapshot for diagnostics. | Normal input/frame paths no longer invoke `debugScene()` just to ask whether a cinematic is active. Gameplay and death checks exercise the result. |
| Arrival art downloaded through both preload/CSS and interface preparation; jukebox art loaded as both world art and an unused interface asset. | Use the prepared interface blob for arrival art and let the world art loader own the marquee. | Final resource audit: **no repeated static asset URLs**, versus two duplicated image URLs before. Arrival art, menu and loading barriers still pass. |
| Each actor rebuilt and bounded a reference hat to fit an already-loaded hat. Each procedural hot dog built fresh geometry. | Cache immutable hat fitting dimensions and procedural snack geometry; clone reusable instances. | Eight repeated hot-dog eating cycles keep geometry counts flat. Actor appearance/restart checks retain the expected rendered scene. |
| Table view construction rebuilt the removed physical-console layout, including a redundant table-bar calculation. Stationary listeners also rewrote all WebAudio listener parameters. | Remove the unused console data from runtime table views. Update WebAudio listener parameters only when pose/context changes; keep ambience and jukebox state transitions responsive while stationary. | Table/gameplay/controller and real audio-output checks cover the retained behavior. |

## Measured CPU work

Same ml350 P100, Vulkan Chromium, High preset, 1280×720, seed 42, 32 players. Most scenes pause simulation to isolate rendering/UI; `crowd-running` advances normally. Each scene settles for 0.5 seconds and samples about 2.4 seconds with CDP CPU profiling. Values below are **main-thread TaskDuration in milliseconds across that sample**, not milliseconds per frame.

| Scene | Before | Final | Change in CPU time |
| --- | ---: | ---: | ---: |
| Main floor | 2,073 | 2,077 | +0.2% |
| Bar | 1,784 | 1,256 | −29.6% |
| Restrooms | 1,727 | 1,203 | −30.4% |
| Arcade | 1,822 | 1,130 | −38.0% |
| Duck race | 1,834 | 1,735 | −5.4% |
| Slots | 1,819 | 1,383 | −24.0% |
| VIP | 1,743 | 1,038 | −40.5% |
| North floor | 2,066 | 1,775 | −14.1% |
| Backrooms | 1,858 | 1,852 | −0.3% |
| Ghost camera | 2,360 | 2,165 | −8.3% |
| Running crowd | 1,872 | 1,859 | −0.7% |

These are individual instrumented samples. Small differences are noise-sensitive; they do not establish an FPS improvement. Browser animation callbacks remained vsync-limited around 16.7–16.8 ms. Renderer frame counters include multiple effect passes and must not be interpreted as presented frames.

The final audit also checks an actually joined blackjack seat, a meeting with the phone open, an active blackout and a transformed monster. Those static cases produce zero layouts, with one style recalculation in the blackout sample. Escape darkness and open-exit scenes are sampled with their real simulation flags asserted; they produce one and zero layouts, respectively. The baseline's original "blackjack" fixture was only a north-floor view; its original "blackout" action was still on cooldown. The baseline JSON explicitly labels these `floor-north` and `lights-cooldown`; they are not used as blackjack/blackout comparisons.

## Coverage and independent budgets

| Area | Inspection and checks |
| --- | --- |
| Startup/menu/briefing | Static asset ownership and preparation barriers; no hidden 3D menu render; desktop/mobile loading and Continue; required-asset Retry; controller layout/input. Fresh final startup: **9.220 s**, longest pre-menu task **842 ms**, no late static assets. Earlier startup improvements are documented in the separate startup report. |
| Rendering/world | All seven casino rooms, doorway windows, floor crowd, tables, High AO/shadows, backrooms, ghost camera, blackout/monster and Escape mode. CPU call stacks, render calls/triangles, matrix equivalence and visible doorway actor checks. |
| UI/input/tables | Mutation/layout profiling; actual blackjack, meeting/phone, changing cooldowns, keyboard/controller, pointer lock, killer controls, roulette stop and vent/camera transitions. Blackjack oracle: 28,561 starting combinations plus all 13 hits from 4+3, splits, aces and doubles. Recurring luck and 575 settlement cases pass. |
| Resource lifetimes | Repeated 32-player restarts and appearance changes, skeleton ownership, body/death/monster cleanup, snack geometry reuse and static request uniqueness. Content hashing found no identical duplicate source/asset files over 1 KiB. Historical asset directories are not loaded by the runtime and were retained. |
| Simulation/AI/navigation | Seeded 1,800-tick samples with 6/16/32 players: ordinary play, blackout, Escape darkness and open exits. At 32 players p95 tick times are **0.282 / 0.265 / 0.284 / 0.364 ms**, respectively, in local Node. Navigation: 4,440 routes / 17,840 legs / 1,400 open spots, no tight/stuck/bad-open results. |
| Multiplayer snapshots | Shared public packing once per host snapshot, per-guest private data, sticky deltas at 15 Hz. 6/16/32-human stationary and moving fixtures serialize/parse and validate every guest's restored characters. At 32 moving players, packed traffic is **8.194 Mbps aggregate** versus **49.156 Mbps** for plain snapshots. p95 batch time is **3.114 ms**, including JSON round trips and assertions. This measures serialization in local Node, not 31 real network connections. |
| Audio/voice | Stationary listener guards; cached decoded effects/media; room/table ambience and jukebox transitions, mutes, cough and real master-bus output. Proximity voice uses a retained peer list and guarded gain/pan/filter changes; connection replacement/close releases nodes/tracks. Discord state sends changes with a two-second resend and bounded reconnect backoff. Discord server's 43 tests pass; live Discord accounts and a full voice mesh were not load-tested. |

## Remaining performance costs

The crowded floor and wide ghost-camera view remain expensive on High: roughly **600–1,000 draw calls** and **2.3–4.0 million submitted triangles** across rendering passes in these fixtures. CPU samples concentrate in Three.js material/program selection and draw submission, including shadows and AO. The optimizations above reduce waste around that work; the floor sample does not show a meaningful speedup. Further floor improvement should target repeated static meshes/material batches and shadow/AO submissions, with visual comparisons before changing them. GPU pass durations were not measured.

Cold startup is still around nine seconds on this test server and contains a synchronous task around 0.84 seconds. The earlier startup report's 0.841-second task was a different run; this final run is recorded separately. Physical desktop/controller playtesting remains necessary.

## Repeatable evidence

- [Baseline CPU/layout/resources](performance/2026-10-16-whole-game-before.json)
- [Final CPU/layout/resources and restart allocations](performance/2026-10-16-whole-game-final.json)
- [Final cold start](performance/2026-10-16-startup-final.json)
- [Simulation and multiplayer budgets](performance/2026-10-16-simulation.json)
- [Final doorway/actor visibility regression](performance/2026-10-16-portals-final.json)
- [Earlier startup/doorway optimization report](performance-audit-2026-10-16.md)
- `tools/whole-game-audit.mjs`, `tools/runtime-perf-check.mjs`, `tools/simulation-audit.mjs`, `tools/portal-audit.mjs`, and the existing loading/camera/audio/casino/blackjack/luck/settlement checks.

Final deployed checks passed: loading/desktop/mobile/controller, killer/camera/vent/blackjack/roulette, refreshed casino/snacks/death, audio, portal visibility and resource/matrix regressions. Fresh rendered seated-character, blackjack and death evidence is retained in `.dev/whole-game-performance/`. JavaScript syntax passes for all 61 source/tool files; Git whitespace checks pass. The [build identity](playtest-build-2026-10-16.json) verifies 64 current runtime/asset files against actual HTTPS preview bytes.
