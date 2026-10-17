import fs from 'node:fs';import * as M from '../src/map.js';import{renderPlan}from'../design/casino-plan.mjs';
const old=JSON.parse(fs.readFileSync('design/casino-layout-built.json'));
const m={...old,at:new Date().toISOString(),status:'populated slot banks, south-wall Flying Pigs cabinet and lounge-facing coin; constructed',rooms:M.ROOMS,walls:M.WALLS,doorGaps:M.DOOR_GAPS,doors:M.DOORS,staffDoors:M.STAFF_DOORS,obstacles:M.OBSTACLES,plants:M.PLANTS,seats:M.makeSeats(),snacks:M.BOWL_SPOTS,shop:M.SHADY};
m.aisles=m.aisles.filter(a=>a.name!=='slot hall centre cross aisle').map(a=>a.name==='arcade promenade'?{...a,x:2470,w:90}:a).concat([{name:'slot hall centre cross aisle',x:190,y:1515,w:1380,h:50}]);
fs.writeFileSync('design/casino-layout-built.json',JSON.stringify(m,null,2)+'\n');fs.writeFileSync('design/casino-layout-top-down.svg',renderPlan(m));
console.log('Rebuilt actual map:',m.seats.length,'game positions,',M.SLOT_BANKS.length,'occluding slot banks.');
