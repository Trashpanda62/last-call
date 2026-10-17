# Last Call performance audit — 2026-10-16

Measured against the TrueNAS LAN preview with headless Chromium, ANGLE/Vulkan, an NVIDIA Tesla P100, a 1280×720 viewport and the existing High preset. Each startup run used a fresh browser context. These measurements describe the test server; they do not establish frame rates on Steve's PC.

## Results

| Check | Before | After |
| --- | ---: | ---: |
| Hidden casino rendering behind the menu | 316 calls / 1,410,376 triangles per frame in the sampled view | **Zero new renderer frames** during the three-second menu sample |
| Resource transfer through startup and the first play samples | 63.86 MB | **34.71 MB** (45.7% less) |
| Deterministic 32-player doorway scene, render calls | 889 | **659** (25.9% less) |
| Same 32-player scene, submitted triangles | 3,362,027 | **1,101,319** (67.2% less) |
| Late static asset downloads after menu readiness | Assets were allowed to finish and trigger a world rebuild after entry | **0**, verified during menu, level briefing, controller input and play |
| Nearby-character render scale | Could increase to 1.6× per axis (2.56× pixels) | Uses the selected render scale without a proximity spike |

The latest cold-start readiness barrier completed in **8.90 seconds** (9.21 seconds in the preceding audit). It waits for the model/art/audio library, builds the world once, uploads textures and prepares world/hand/monster shaders. The earlier 9.46-second measurement waited for late prop loading and rebuilding, so it is not a like-for-like menu-interactivity benchmark. Total startup request counts were 250 in both audit runs; the transfer reduction comes from the asset mix, including dropping unused painting/poster downloads.

The first-play and later rAF samples had 16.7 ms medians and approximately 16.8 ms p95 on this server. A 53 ms long task remained around entry in the final sample. Random bot movement and cosmetics make the ordinary six-player frame counters illustrative; use the separate seeded 32-player comparison for the doorway optimization's before/after result.

## Changes tied to the findings

- Stop both the demo simulation and 3D rendering while the opaque menu is showing.
- Remove the late world-rebuild callbacks. The renderer now starts after its models, room materials, animations and art are prepared.
- Load GLBs with four workers instead of opening every model parse together; cache animation requests.
- Remove unused old painting and poster images from startup. Keep UI images and streaming-audio bytes in memory, including on the preview's `no-store` responses, so showing the briefing or changing table ambience does not repeat downloads.
- Construct the dynamic scene without drawing it, upload textures in batches that yield after a 12 ms CPU budget, and compile for the composer’s linear render target before the first draw. A single texture upload can exceed the budget. Require Continue before the local client enters play; solo simulation time remains frozen during the briefing.
- Paint each already-loaded table/card texture once, retaining callbacks for assets that arrive later in diagnostic/fallback paths. Cache character rest-pose bounding spheres on the source models so creating 32 clones does not skin every vertex again.
- Remove the obsolete proximity supersampling boost and its render-target reallocations.
- Cull NPCs/staff outside visible rooms. For neighbouring rooms, intersect actor bounds and instanced-prop bounds with the doorway's projected window, including alternative visible doorway paths. Do not submit objects hidden by the adjoining wall.

The seeded comparison uses identical 32-player setup, seed 42, camera position, viewport and graphics settings. `?coarseCull` is a diagnostic path retaining room-only culling for that comparison. Its regression assertions preserve an actor framed by the doorway and remove an actor fully behind the wall.

## Remaining cost and practical limits

Initial asset/model processing and world/material construction still contain synchronous CPU/GPU work. The latest uninstrumented startup sample’s longest pre-menu task was **0.84 seconds**, down from **2.82 seconds** in the same-session baseline. Individual texture uploads still produce 50–193 ms tasks, and the final warmup draw took 0.72 seconds. The loading progress can pause during those tasks. High graphics still uses shadows, multisampling and ambient occlusion; this pass retains those settings. Physical controller hardware and Steve's desktop performance still need his playtest; automated controller checks drive the standard Gamepad API mapping.

## Reproduce and evidence

Run the scripts on the GPU QA machine with `PW` pointing to its Playwright installation and `DRI_PRIME` selecting the same GPU. Do not compare runs made on different GPUs or graphics presets.

- `tools/performance-audit.mjs shots/performance-final.json`: fresh startup, three-second menu/first-play/later samples, resource transfers, long tasks and late assets.
- `tools/portal-audit.mjs`: same-build seeded room-only versus doorway-window comparison and visibility assertions.
- `tools/loading-check.mjs`: asset barrier, zero hidden menu renders, frozen solo briefing, desktop/mobile Continue placement, visual WASD keyboard and labelled controller, gamepad-operated full-controls disclosure, generated icons, controller HUD selection and blackout, right-stick revolver, ghost haunt, no late assets and a required-asset failure/retry gate.
- `tools/camera-check.mjs`: actual game input, ghost/vent camera transitions, blackjack 4+3+10 stays live, visible cards and stopped roulette.
- `tools/audio-check.mjs`: real master-bus audio signal, all three casino scores, table beds, jukebox, independent mutes and cough.
- `tools/casino-refresh-check.mjs`: menu/table visuals, pointer-lock continuity, signs, portraits, chair pose, three eating animations, 3D death/jumpscare/collapse and return to ghost cameras.

Raw reports: [baseline](performance/2026-10-16-baseline.json), [after](performance/2026-10-16-after.json), [seeded portal comparison](performance/2026-10-16-portals.json).


## Follow-up startup responsiveness

CPU sampling identified the first warmup draw as the largest remaining stall: it was rendering before the texture-upload and asynchronous shader steps. Splitting scene preparation from rendering lets the upload loop yield to the loading screen. Compiling with the composer’s render target also prepares the shader color-space/tone-mapping variants actually used in play. The same profile showed repeated felt painting and per-clone skinned bounds calculations; those now reuse completed work.

| Same-session uninstrumented startup check | Before | After |
| --- | ---: | ---: |
| Menu ready from navigation | 8.924 s | 8.899 s |
| Longest pre-menu task | 2.815 s | **0.841 s** (70.1% shorter) |
| Menu render frames over three seconds | 0 | 0 |
| Late static asset downloads | 0 | 0 |

Total startup duration is effectively unchanged in these single-run measurements. The improvement is shorter interruptions during loading; this does not establish higher gameplay FPS. Both runs used the same P100, preset, viewport and fresh browser context.

The instrumented CPU traces separately show the longest task falling from 3.30 s to 1.06 s and the final warmup render taking 0.81 s. Sampling adds overhead; do not mix those timings with the uninstrumented comparison. Sources: [CPU before](performance/2026-10-16-startup-profile.json), [CPU after](performance/2026-10-16-startup-profile-after.json), [startup before](performance/2026-10-16-warmup-before.json), [startup after](performance/2026-10-16-warmup-after.json).
