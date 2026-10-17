// One layout for the printed felt, live/decorative cards and betting targets.
// Coordinates are canvas pixels; world conversion follows the felt's exact UVs.
import { BJ_SEAT_RING } from '../map.js';
export const BJ_LAYOUT = { width: 1024, height: 512, radius: 2, depth: 1.67, betRadius: 26 };
export const BJ_SPOTS = Array.from({length: 5}, (_, i) => {
  const angle = Math.PI * (1 / 6 + i / 6), turn = angle - Math.PI / 2;
  const x = 512 + Math.cos(angle) * 430, y = Math.sin(angle) * 400;
  return { angle, turn, card: { x, y }, bet: { x: x - Math.sin(turn) * 52, y: y + Math.cos(turn) * 52 } };
});
export function blackjackSpot(seat, table) {
  // Derive the fan position from the seat, including the map's pixel rounding.
  const angle = Math.atan2((seat.y - table.y) / BJ_SEAT_RING.y, (seat.x - table.x) / BJ_SEAT_RING.x);
  const spot = BJ_SPOTS.reduce((best, s) => Math.abs(s.angle - angle) < Math.abs(best.angle - angle) ? s : best, BJ_SPOTS[0]);
  const world = p => ({ x: table.x / 60 + (p.x / BJ_LAYOUT.width - .5) * BJ_LAYOUT.radius * 2, z: table.y / 60 + p.y / BJ_LAYOUT.height * BJ_LAYOUT.depth });
  return { card: world(spot.card), bet: world(spot.bet) };
}
