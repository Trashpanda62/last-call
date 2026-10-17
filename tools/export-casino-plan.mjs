import fs from 'node:fs';
import * as M from '../src/map.js';
import {renderPlan} from '../design/casino-plan.mjs';
const aisles=JSON.parse(fs.readFileSync('docs/performance/2026-10-17-aisles.json')).aisles;
const map={at:new Date().toISOString(),status:'revised after player feedback; constructed',units:'60 simulation pixels = 1 metre',rooms:M.ROOMS,walls:M.WALLS,doorGaps:M.DOOR_GAPS,doors:M.DOORS,staffDoors:M.STAFF_DOORS,obstacles:M.OBSTACLES,plants:M.PLANTS,seats:M.makeSeats(),snacks:M.BOWL_SPOTS,shop:M.SHADY,aisles};
fs.writeFileSync('design/casino-layout-built.json',JSON.stringify(map,null,2)+'\n');
fs.writeFileSync('design/casino-layout-top-down.svg',renderPlan(map));
console.log('Exported current map data and measured top-down SVG.');
