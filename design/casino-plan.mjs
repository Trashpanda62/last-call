// Shared deterministic drawing for the interactive map and exported SVG.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function renderPlan(m,{before=false}={}){
 const out=[],put=s=>out.push(s),rect=(x,y,w,h,fill,extra='')=>put(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`),text=(x,y,s,size=28,color='#eee9dd',extra='')=>put(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${esc(s)}</text>`);
 const names={counter:'Bar counter',hightop:'Standing table',sinks:'Sinks',bj:'Blackjack',roulette:'Roulette',crashDesk:'Crash desk',plinko:'Plinko',skee:'Skee-ball',mines:'Mines',tower:'Tower',pusher:'Coin-pusher',claw:'Prize claw',flappy:'Flappy Bird','slot-bank':'Concealing slot bank',pond:'Duck pond',desk:'Derby betting pedestal',slot:'Slot machine',jackpot:'Jackpot',dice:'Dice',wheelDesk:'Wheel desk',wheel:'Prize wheel',coin:'Coin flip',coffee:'Social table',security:'Security',booth:'Booth',jukebox:'Jukebox',shady:'Shady shop',crates:'Shop stock',ottoman:'Lounge ottoman',pool:'Pool table',champagne:'Champagne',piano:'Piano','pit-bell':'Pit bell','shop-wall':'Shop alcove'};
 const roomTitles={bar:'BAR',rest:'RESTROOMS',floor:'MAIN FLOOR',arcade:'ARCADE',race:'DUCK DERBY',slots:'SLOT HALL',vip:'VIP LOUNGE'};
 const fills={bar:'#322b23',rest:'#293332',floor:'#20323b',arcade:'#302c43',race:'#203b36',slots:'#3c3524',vip:'#3b2935'};
 put('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3200 2480" width="1800" height="1395" role="img" aria-labelledby="title desc" style="font-family:Arial,sans-serif">');
 put(`<title id="title">Last Call — ${before?'previous':'revised'} casino floor</title><desc id="desc">Measured top-down plan, north up. Fifty by 31.67 metres. Rooms, walls, door openings, games, seats and principal routes are drawn from the game map.</desc>`);
 rect(0,0,3200,2480,'#101918');text(100,64,before?'BEFORE · PREVIOUS PLACEMENT':'LAST CALL · REVISED FLOOR PLAN',44,'#f0d498','font-weight="700"');text(3100,64,'NORTH ↑  ·  50 × 31.67 m',28,'#adbbb7','text-anchor="end"');
 put('<g transform="translate(100 120)">');
 for(const[id,r]of Object.entries(m.rooms)){rect(r.x,r.y,r.w,r.h,fills[id]);text(id==='bar'?480:id==='floor'?1320:r.x+24,r.y+48,roomTitles[id],36,'#f2e8d4',id==='floor'?'font-weight="700" text-anchor="middle"':'font-weight="700"');}
 for(const a of before?[]:m.aisles||[])rect(a.x,a.y,a.w,a.h,'#70a68c','opacity=".12"');
 for(const w of m.walls)rect(w.x,w.y,w.w,w.h,'#b9c3ba');
 for(const d of m.doorGaps)rect(d.x,d.y,d.w,d.h,'#83d3ac');
 for(const o of [...m.obstacles].sort((a,b)=>(b.kind==='slot-bank')-(a.kind==='slot-bank'))){const game=['bj','roulette','dice','pond','slot','plinko','skee','crashDesk','desk','pusher','claw','flappy','slot-bank','wheel','wheelDesk','coin','jackpot'].includes(o.kind),fill=o.kind==='pond'?'#498f9c':game?'#b79a60':'#687b71';
  put(`<g class="map-object" data-name="${esc(names[o.kind]||o.kind)}" data-detail="${esc(`${(o.w/60).toFixed(2)} × ${(o.h/60).toFixed(2)} m · x ${(o.x/60).toFixed(2)}, y ${(o.y/60).toFixed(2)} m`)}" tabindex="0" role="button" aria-label="${esc(names[o.kind]||o.kind)}"><title>${esc(names[o.kind]||o.kind)}</title>`);
  rect(o.x,o.y,o.w,o.h,fill,`rx="${o.kind==='bj'?30:5}" fill-opacity="${game?.85:.6}" stroke="${game?'#e0c584':'#91a99a'}" stroke-width="3"`);put('</g>');
  if(['bj','roulette','dice','pond','pool','coffee','security','coin'].includes(o.kind))text(o.x+o.w/2,o.y+o.h/2+8,({bj:'BLACKJACK',roulette:'ROULETTE',dice:'DICE',pond:'SIX-LANE DUCK POND',pool:'POOL',coffee:'LOUNGE',security:'CCTV',coin:'COIN'})[o.kind],o.kind==='security'?17:25,'#101918','text-anchor="middle" font-weight="700"');
 }
 for(const [x,y]of m.plants){put(`<circle cx="${x}" cy="${y}" r="${m.plantCanopyRadius||71}" fill="#548568" fill-opacity=".10" stroke="#8db094" stroke-opacity=".55" stroke-width="2"/>`);put(`<circle cx="${x}" cy="${y}" r="14.4" fill="#548568" stroke="#8db094" stroke-width="2"/>`);}
 for(const s of m.seats)put(`<circle cx="${s.x}" cy="${s.y}" r="12" fill="#f5e8c1" opacity=".85"/><path d="M${s.x},${s.y} l${Math.cos(s.face)*23},${Math.sin(s.face)*23}" stroke="#f5e8c1" stroke-width="4"/>`);
 for(const s of m.snacks)put(`<circle cx="${s.x}" cy="${s.y}" r="11" fill="#d08b69"><title>Snacks</title></circle>`);
 for(const d of m.staffDoors)rect(d.x-9,d.y-9,18,18,'#b8a6e4');
 text(1320,555,'BELL / GATHERING',26,'#cad9e0','text-anchor="middle"');
 if(!before){
  text(400,1260,'20 PENNY SLOTS',26,'#ead4a1','text-anchor="middle"');text(1120,1260,'20 PENNY SLOTS',26,'#ead4a1','text-anchor="middle"');text(820,1660,'JACKPOT',28,'#ead4a1','text-anchor="middle"');
  text(1800,1370,'HIGH LIMIT',27,'#e8b6d4');text(1800,1410,'4 slots · VIP',23,'#b9b4bb');
  text(2790,522,'PUSHER',23,'#e4daf9');text(2790,646,'CLAW',23,'#e4daf9');text(2615,478,'FLAPPY BIRD',23,'#e4daf9');text(2120,580,'MINES / TOWER',23,'#e4daf9');text(2110,240,'PLINKO',23,'#e4daf9');text(2430,180,'CRASH',24,'#e4daf9');text(2720,190,'SKEE-BALL',23,'#e4daf9');
  rect(2696,724,228,12,'#d6ad62');text(2810,770,'TOTE BOARD',22,'#eacb8c','text-anchor="middle"');
  text(2690,785,'ONE BETTING PEDESTAL',23,'#eacb8c','text-anchor="middle"');
  text(m.shop.x-35,m.shop.y-70,'SHOP',24,'#e8b6d4','text-anchor="end"');text(2180,1840,'WHEEL',22,'#e8b6d4','text-anchor="middle"');
  for(const [n,x,y]of[[1,2605,849],[2,2660,735],[3,1840,1500],[4,1280,1010],[5,2740,585]]){put(`<circle cx="${x}" cy="${y}" r="25" fill="#f0d498" stroke="#101918" stroke-width="4"/>`);text(x,y+11,n,31,'#101918','text-anchor="middle" font-weight="700"');}
 }
 put('</g>');
 if(before){rect(2486+100,724+120,228,12,'#d6ad62');text(2600+100,770+120,'OLD TOTE BOARD',22,'#eacb8c','text-anchor="middle"');}
 text(100,2090,before?'PREVIOUS PLACEMENT · FOR COMPARISON':'THE FLOOR HAS A CLEAR ORDER',32,'#f0d498','font-weight="700"');
 const notes=before?['Six betting pedestals crowded the north side of the pond.','The tote board crossed the arcade-to-pond door opening.','High-limit slots were mixed into the public slot hall.','Table games were split across the main-floor approaches.','New arcade cabinets stood in the middle of the room.']:['1  One derby pedestal; doorway and spectator side stay open.','2  Race board sits on solid wall, clear of the arcade doorway.','3  40 penny slots in four concealing banks; high-limit slots in VIP.','4  Roulette and dice share the southern table pit; VIP entry is clear.','5  Flappy Bird joins the arcade; north-south promenade stays clear.'];
 notes.forEach((s,i)=>text(i<3?100:1680,2150+(i<3?i:i-3)*53,s,25,'#d5dfd7'));
 text(100,2360,'Cream dots: player positions   ·   Mint gaps: doors   ·   Green strips: measured aisles   ·   Palm rings: full spread   ·   Purple: staff passages',24,'#a8bcb0');
 text(100,2415,'Actual game coordinates · furniture footprints · north up · 60 simulation pixels = 1 metre',23,'#a8bcb0');
 put('</svg>');return out.join('');
}
