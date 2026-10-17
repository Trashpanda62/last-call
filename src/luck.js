// A player's run of luck survives changing tables. Every 5–8 rounds brings
// 3–5 protected rounds; three losses bring that run forward immediately.
export function createLuck(r = Math.random) {
  let wait = 2 + Math.floor(r() * 3), hot = 0, losses = 0;
  return {
    next() {
      if (!hot && (--wait <= 0 || losses >= 3)) hot = 3 + Math.floor(r() * 3);
      if (!hot) return false;
      hot--;
      if (!hot) wait = 5 + Math.floor(r() * 4);
      return true;
    },
    settle(stake, back) { losses = back > stake ? 0 : losses + 1; },
  };
}
