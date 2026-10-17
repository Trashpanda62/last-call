import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGame} from '../src/sim.js';
import {STAFF_DOORS} from '../src/map.js';
import {packPub,packFor,unpackSnap,wireCache} from '../src/wire.js';
import {CFG} from '../src/config.js';
import {openTable,closeAllTables,tableView,tableBar,tableStart,spaceTable,press,chipHud} from '../src/tables.js';
const report={at:new Date().toISOString(),recommendations:[16,32].map(n=>[n,CFG.recommendedKillers(n)]),slots:[],passage:{}};
assert.deepEqual(report.recommendations,[[16,2],[32,4]]);
for(const tier of ['penny','high']){
 const g=createGame({humans:[{name:'Tester',key:'me'}],players:6,killers:1,forceRole:'gambler'}),c=g.G.chars[0],seat=g.G.seats.find(s=>s.game==='slots'&&s.tier===tier);
 openTable(seat,()=>{},g.view(0));const initial=tableView().extra.bet;
 assert.equal(initial,tier==='high'?1000:10);assert.equal(chipHud(),null);assert.equal(tableBar().chips,null);assert.deepEqual(tableBar().acts,[]);assert.deepEqual(tableView().stacks,[]);
 press('btn:betup');assert.ok(tableView().extra.bet>initial);press('btn:betdown');assert.equal(tableView().extra.bet,initial);press('btn:betmax');assert.equal(tableView().extra.bet,tableView().maxBet);
 const max=tableView().extra.bet;assert.equal(tableStart().id,'btn:lever');spaceTable();assert.ok(tableView().view.spin);press('btn:betdown');assert.equal(tableView().extra.bet,max);press('btn:auto');assert.equal(tableView().extra.auto,true);press('btn:auto');assert.equal(tableView().extra.auto,false);
 report.slots.push({tier,initial,max,spaceSpin:true,betLockedDuringSpin:true,physicalAuto:true});closeAllTables();
}
const g=createGame({humans:[{name:'Staff',key:'me'},{name:'Observer',key:'other'}],players:6,killers:1,forceRole:'killer',perk:'staff'}),c=g.G.chars[0],other=g.G.chars[1],from=STAFF_DOORS[0],to=STAFF_DOORS.find(d=>d.room==='vip');
c.perk='staff';c.cd.staff=0;c.x=from.sx;c.y=from.sy;other.x=c.x+10;other.y=c.y;other.look=Math.PI;
const security=g.G.security.feed;g.action(0,'use');assert.ok(c.staffInside);assert.equal(g.view(0).priv.cameraFeed,from.room);assert.ok(g.view(1).pub.chars[0].staffInside);assert.equal(g.view(1).priv.cameraFeed,null);assert.equal(g.canSee(other,c),false);
const packed=packPub(g.view(1).pub),unpacked=unpackSnap(packFor(packed,g.view(1).priv,{},null),wireCache());assert.equal(unpacked.pub.chars[0].staffInside,true);
const pos=[c.x,c.y];g.setInput(0,{x:1000,y:1000,posVer:c.posVer},true);assert.deepEqual([c.x,c.y],pos);g.action(0,'lights');assert.equal(g.G.lightsT,0);g.action(0,'feed','bad-room');assert.equal(c.cameraFeed,from.room);g.action(0,'feed','vip');assert.equal(c.cameraFeed,'vip');assert.equal(g.G.security.feed,security);g.action(0,'staffexit');assert.equal(c.staffInside,null);assert.equal(c.cameraFeed,null);assert.deepEqual([c.x,c.y],[to.sx,to.sy]);assert.equal(c.cd.staff,CFG.staffCd);
g.action(0,'staff');assert.equal(c.staffInside,null);c.cd.staff=0;g.action(0,'staff');assert.ok(c.staffInside);g.dropHuman(0);assert.equal(c.staffInside,null);assert.equal(c.cameraFeed,null);
report.passage={hostOwned:true,hiddenFromObserver:true,privateFeed:true,inputBlocked:true,exitAtSelectedDoor:true,cooldown:true,disconnectRestores:true};
fs.writeFileSync('docs/performance/2026-10-17-slot-camera-rules.json',JSON.stringify(report,null,2)+'\n');console.log(report);
