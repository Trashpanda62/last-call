import fs from "node:fs";
import { BR_WALLS, BR_HIDES } from "../src/backrooms-map.js";
import { OBSTACLES, makeSeats, STAFF_DOORS, W, H } from "../src/map.js";
fs.mkdirSync("design/backrooms", { recursive: true });
const seats = makeSeats(),
  data = {
    width: W,
    height: H,
    walls: BR_WALLS,
    hiding: BR_HIDES,
    exits: [0, 3, 4].map((i) => STAFF_DOORS[i]),
    machines: seats.map(({ id, game, x, y, face, machine, approach }) => ({
      id,
      game,
      x,
      y,
      face,
      machine,
      approach,
    })),
    objects: OBSTACLES,
  };
fs.writeFileSync(
  "design/backrooms/layout.json",
  JSON.stringify(data, null, 2) + "\n",
);
const escape = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;");
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -180 3100 2250" width="1550" height="1125"><rect x="-50" y="-180" width="3100" height="2250" fill="#171810"/><text x="20" y="-90" fill="#efdfa7" font-family="Arial" font-size="60" font-weight="bold">LAST CALL / THE BACKROOMS</text><text x="20" y="-30" fill="#b8b693" font-family="Arial" font-size="29">Same machines. Different walls. Five hiding lockers. Three extraction doors.</text><rect width="3000" height="1900" fill="#8f7d45"/>`;
for (const o of OBSTACLES)
  svg += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="#302b20" stroke="#bf9e62" stroke-width="2"><title>${escape(o.kind)}</title></rect>`;
for (const w of BR_WALLS)
  svg += `<rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="#ead38b" stroke="#c1aa63" stroke-width="2"/>`;
for (const s of seats)
  svg += `<circle cx="${s.approach.x}" cy="${s.approach.y}" r="7" fill="#c8c29a"><title>${s.game} / seat ${s.id}, unchanged position</title></circle>`;
for (const h of BR_HIDES)
  svg += `<rect x="${h.box.x}" y="${h.box.y}" width="${h.box.w}" height="${h.box.h}" fill="#62b6ad"/><circle cx="${h.x}" cy="${h.y}" r="18" fill="#132a25" stroke="#74e4d3" stroke-width="3"/><text x="${h.x}" y="${h.y + 9}" text-anchor="middle" fill="#c6ffeb" font-family="Arial" font-size="27">H</text>`;
for (const d of data.exits)
  svg += `<circle cx="${d.sx}" cy="${d.sy}" r="28" fill="#125131" stroke="#87fca8" stroke-width="4"/><text x="${d.sx + 40}" y="${d.sy + 12}" fill="#c6ffcd" font-family="Arial" font-size="32">EXIT</text>`;
for (const [name, x, y] of [
  ["BAR", 240, 220],
  ["TABLE GAMES", 1260, 550],
  ["ARCADE", 2420, 345],
  ["DUCK RACE", 2540, 1000],
  ["SLOT BANKS", 820, 1540],
  ["HIGH LIMIT / WHEEL", 1980, 1660],
])
  svg += `<text x="${x}" y="${y}" text-anchor="middle" fill="#f4e9bf" opacity=".9" font-family="Arial" font-size="30" paint-order="stroke" stroke="#312a15" stroke-width="4">${name}</text>`;
svg +=
  '<text x="20" y="1975" fill="#d7cfaa" font-family="Arial" font-size="29">Pale yellow: new walls · Dark / brass: unchanged furniture and machines · H: locker · Green: exit</text><text x="20" y="2030" fill="#9b9c7d" font-family="Arial" font-size="25">90 seconds quiet · New creature every 55 seconds (maximum 8) · Exits unlock at 0:30 and close at 15:00</text></svg>';
fs.writeFileSync("design/backrooms/top-down.svg", svg);
console.log("Backrooms plan generated from actual geometry.");
