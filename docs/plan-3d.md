# Last Call 3D: build plan (2026-10-12 UTC)

Steve (2026-10-12) rejected the top-down 2D version. Picks: first-person 3D, look A "plush toy" (Fall Guys / Among Us
bean gamblers in suits and hats, gloved hands, warm Art Deco casino; previews in `picks/`), PC first (phone still
works, lighter). Gameplay rules stay as built in the 2D version (docs/plan.md); only the presentation and controls
change. Play: https://trashpanda62.github.io/last-call/ (GitHub Pages, branch master, root).

If context runs low, this file is the source of truth. Tick slices as they land, with one line of notes.

## Architecture
- `src/sim.js`, `map.js`, `config.js`, `net.js` stay: the game is still a 2D plane sim (1 sim px = 1/60 m).
  Sim x -> three x/60, sim y -> three z/60. Sim angle a -> camera yaw = -a - PI/2.
- One sim change: a seated human's look comes from input (free head turn), not forced to seat.face.
- Map: race lounge betting desks become obstacles (`kind: 'desk'`) so nobody walks through them.
- three.js r185 vendored in `vendor/three` (build + postprocessing/shaders/RoundedBox/BufferGeometryUtils), loaded
  through an importmap. No CDN for three.
- New `src/3d/`:
  - `textures.js` canvas textures: carpet, wood, tile, wallpaper, felts, slot reels, race screen, neon, labels.
  - `world.js` static casino from map data: floors, walls, ceilings, trim, doors, bar, tables, slots, race screen,
    VIP, restrooms, bell, plants, chandeliers, lights, seats, drink rails, bowl stands, dealers.
  - `chars.js` plush bean gamblers: suit, bow tie, gloves, dot eyes, 8 hats, walk waddle, sit, glance, pale/poison,
    dead pose, name labels.
  - `items.js` drinks (5 glass kinds, liquid level), bowls, bodies, fx (chips, bubbles, splat, crumbs), floats.
  - `hands.js` first-person gloved hands: idle sway, walk bob, holding drink, cards at blackjack.
  - `render3d.js` renderer, camera, bloom composer, lights-out, menu/meeting cameras, draw(frame).
- `main.js`: pointer-lock mouse look (never under navigator.webdriver), WASD relative to yaw, Space look back,
  touch: left stick + right-side drag look. Menu shows an all-bot demo game behind the menu.
- UI: crosshair, table panel docked bottom-right so the table stays visible, hides while looking back.

## Checks (every slice)
- `node --check` all JS; `node tools/batch.mjs 200 6` still clean (sim untouched except seated look).
- Built-in browser on the local server (`python -m http.server 8931 --bind 127.0.0.1`), driven through
  `window.__lastCall` (pane may be hidden: use step()/render()). Screenshots desktop 1280x720. No console errors.
- Never click the canvas in tests (pointer lock). Never touch Steve's mouse/keyboard.

## Slices
- [ ] T1 Engine: vendor three, importmap, render3d skeleton, camera mapping, first-person movement + mouse look,
  floors/walls/ceilings with textures, lights, bloom. Walk around solo.
- [ ] T2 Casino dressing: bar + bottles, blackjack, roulette (spinning wheel), slots, race lounge screen + desks,
  VIP couches + TV, restrooms, bell, bowls, plants, chandeliers, neon sign, seats + drink rails, dealers.
- [ ] T3 Characters: plush beans, hats, animation, seated pose, labels, killer partner tint, dead/pale, ghosts.
- [ ] T4 Items + hands: drinks on rails and in hands, my-drink marker, spiked glow for killers, bodies, fx, floats,
  first-person hands.
- [ ] T5 Flow: seated camera + look back, table panel restyle, lights-out darkness, meeting/over cameras, menu demo
  scene, crosshair, HUD and how-to text for mouse/keys, touch look.
- [ ] T6 Polish + perf: footstep/ambience sfx, performance pass (draw calls, pixel ratio), screenshots vs picks,
  README, deploy, verify live.
