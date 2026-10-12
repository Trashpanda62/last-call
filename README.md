# Last Call

A casino social-deduction game for the browser. Six gamblers, one of them a killer. The killer poisons drinks and
stabs loners, but only when nobody is looking. Gamblers win by breaking the bank ($9,000 crew bankroll) or by voting
the killer out. The killer wins when one gambler is left.

Inspired by the hidden-role casino setup of LumenLabs' *Who's Cheating?*; the pit boss/cheater pair is replaced with
an Among Us-style killer. All code and art are original (canvas greybox, no external assets).

## Run

    python -m http.server 8931 --bind 127.0.0.1

then open http://127.0.0.1:8931/. No build step.

## Controls

WASD move, mouse look, E use/sit/report/order, F sip, R sniff a drink, X pour out, Space look behind you while
seated. Killer: 1 poison drink, 2 shiv, 3 lights out.

## Rules in brief

- You only see inside your view cone. Seated players face the table; their drink sits on the rail behind them.
- A poisoned sip kills 7 seconds later. Sniffing (R) tells you if a drink is poisoned. Bots sometimes sniff too.
- Anyone who sees the killer act remembers it, and so does anyone who saw someone loitering by a victim's drink.
- Meetings: bots speak from what they saw (the killer lies), you can accuse once, then everyone votes.

Tuning lives in `CFG` at the top of `game.js`. `window.__lastCall` exposes `start`, `step`, `render` and `state`
for automated checks.
