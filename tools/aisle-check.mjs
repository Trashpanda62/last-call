import assert from 'node:assert/strict';import fs from 'node:fs';import * as M from '../src/map.js';import {CFG} from '../src/config.js';
const aisles=[
 {name:'floor cross aisle',x:760,y:465,w:1180,h:90},
 {name:'clear approach to VIP',x:1695,y:540,w:90,h:638},
 {name:'table pit central aisle',x:1225,y:710,w:90,h:468},
 {name:'slot hall north aisle',x:180,y:1207,w:1280,h:90},
 {name:'slot entrance to jackpot',x:775,y:1207,w:90,h:280},
 {name:'arcade promenade',x:2510,y:280,w:150,h:370},
 {name:'duck entry',x:2455,y:730,w:90,h:150},
 {name:'pond spectator strip',x:2080,y:1080,w:840,h:90},
 {name:'VIP east loop',x:2887,y:1390,w:90,h:430},
];
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const gap=(p,b)=>Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.w),Math.max(b.y-p.y,0,p.y-b.y-b.h));
for(const a of aisles){for(const b of M.SOLIDS)assert.ok(!overlap(a,b),a.name+' overlaps '+b.kind);for(const [x,y]of M.PLANTS)assert.ok(gap({x,y},a)>=14.4,a.name+' plant');for(const s of M.makeSeats())assert.ok(gap(s,a)>=CFG.radius,a.name+' occupied seat '+s.id);}
fs.writeFileSync('docs/performance/2026-10-17-aisles.json',JSON.stringify({at:new Date().toISOString(),units:'simulation pixels; 60 = 1 metre',scope:'Clear rectangular principal aisles, including occupied player bodies, solids and plants. Connecting doors retain the existing two metre gaps; this is not a claim that every machine approach is 1.5 metres wide.',aisles},null,2)+'\n');console.log('PASS: nine principal circulation strips at least 1.5 metres wide, clear of furniture, plants and every occupied seat.');
