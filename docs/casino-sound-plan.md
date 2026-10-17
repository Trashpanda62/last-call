# Casino sound cues — active plan

Steve requested breathing behind the player, distant cries tied to deaths, footsteps and potato character noises alongside the existing ambience.

## Generation batch

ElevenLabs sound-generation model, 16 files, **52 seconds / 624 estimated credits**. Free account check: **1,625,674 credits available** on 2026-10-16. Exact prompts: [cue manifest](../design/casino-cues-v1.json). Reproducible free estimates: `python tools/casino-cues.py` (defaults to dry-run). Paid generation requires `--approved`; existing files are reused, never bought twice by rerunning.

| Files | Length each | Estimated credits |
| --- | --- | --- |
| `breath-behind-a/b/c.mp3` | 5 s | 180 total |
| `death-yell-a/b/c.mp3` | 4 s | 144 total |
| `potato-step-carpet-a/b.mp3` | 1 s | 24 total |
| `potato-step-tile-a/b.mp3` | 1 s | 24 total |
| `potato-mutter-a/b.mp3` | 3 s | 72 total |
| `potato-chuckle.mp3` | 3 s | 36 |
| `potato-sigh.mp3` | 3 s | 36 |
| `vent-knock.mp3` | 4 s | 48 |
| `whisper-behind.mp3` | 5 s | 60 |

## Implementation and acceptance

- Ambient bed continues independently. Discrete cues use positional audio, distance falloff and muffling through walls. Respect effects/master volume and mute.
- Breathing/whispers: rare, world-positioned behind the player at the instant triggered. Turning should change the apparent direction. Long cooldown, avoid menus/loading, active death/meetings and constant overlapping scares.
- Distant death cry: event-driven from a real death location. Preserve the victim's close-range chosen death sound; use distant variants for listeners farther away, at restrained volume through intervening rooms. Deduplicate events.
- Footsteps: nearby living moving potato characters, matching carpet/hard floor; per-character cadence and distance culling, rather than an unrelated sound from nowhere every frame.
- Potato murmurs/chuckle/sigh: occasional quiet sounds from actual nearby living characters. Limit simultaneous cues, prevent rapid repetition and keep voice chat intelligible.
- Vent taps: rare environmental cue from a vent/door position. Never substitute a fake death notification for a random scare.
- All new files preload/decode in the existing asset barrier before menu and level Continue. Verify mute, direction, cooldowns, death event uniqueness, removal/reset cleanup and repeated level starts.
- Listen to the generated files, measure clipping and tails, show previews in the review page, then verify actual in-game audible output. Generation success alone is not acceptance.

Status: **All 16 files generated.** Steve approved the 624-credit estimate on 2026-10-16. Receipts total **628 credits**: four five-second requests charged 61 rather than the estimated 60; this difference was disclosed. No additional takes were ordered. Provenance: `assets/audio/cues-provenance.json`.

Local post-processing balances peaks, fades tails and preserves original takes in `.dev/cue-originals`. All files decode with no over-full-scale samples after processing: [file check](performance/2026-10-16-cue-file-check.json). Integrated playback confirms all 16 preload, native previews play, breathing produces audible output and remains anchored while turning, pause/mute/reset clear voices and a death emits one cry: [audio check](performance/2026-10-16-casino-audio-check.json). Host footsteps preserve the silent-walking perk through private packets: [host check](performance/2026-10-16-foley-host-check.json).

Steve requested an in-game selector for every sound. Settings → Sound → Browse 142 sounds now has search/categories, solo Play/Stop, persistent per-file Keep/Muted choices, Keep all and Copy muted list. [Integrated verification](performance/2026-10-16-sound-selector-check.json) passes every preview with no late downloads, actual per-take/gameplay suppression, stopping active effects, score/jukebox restore, browser reload, desktop/phone layout and tab/Done/scene-transition cleanup. Muted recordings remain available for explicit audition; choices apply to this browser. The external [listening page](../audio-review.html) remains available. Technical playback checks do not replace Steve's audition and taste decisions.
