import assert from 'node:assert/strict';
import fs from 'node:fs';
import {skillNew,skillAction,skillTick} from '../src/skill-arcade.js';
import {openTable,closeTable,press,tablePinned,tableTick,tableKey,spaceTable} from '../src/tables.js';
import {createGame} from '../src/sim.js';

// Captured controls are persistent per side, and expire if a client disappears.
const r=skillNew('pinball',1,1,0,100);
skillTick(r,10);assert.equal(r.time,60,'loading a round does not spend playing time');
assert.equal(skillAction(r,1,{flippers:3}),true);assert.equal(r.phase,'aim','flippers do not launch');
assert.equal(r.left,.24);assert.equal(r.right,.24);
assert.equal(skillAction(r,2,{flippers:4}),false);assert.equal(skillAction(r,2,{flippers:1.5}),false);
assert.equal(skillAction(r,2,{flippers:0}),true);assert.equal(r.left,0);assert.equal(r.right,0);
assert.equal(skillAction(r,3,{}),true);assert.ok(r.ball);assert.equal(r.balls,2);
assert.equal(skillAction(r,4,{flippers:3}),true);skillTick(r,.1);assert.ok(r.la<0&&r.ra<0);
assert.equal(skillAction(r,5,{flippers:1}),true);skillTick(r,.08);assert.ok(r.la<0&&r.ra>0,'release right independently');
skillTick(r,.4);assert.equal(r.left,0);assert.ok(r.la>0,'disconnect heartbeat releases paddle');
assert.equal(skillAction(r,5,{flippers:3}),false,'replay rejected');

// Exercise the real table controller against the host, including the chip capture boundary.
const g=createGame({humans:[{name:'Owner',key:'1'}],players:6,forceRole:'gambler'});g.G.target=1e12;
for(const c of g.G.chars)c.isHuman=true;
function sit(game){const c=g.G.chars[0],s=g.G.seats.find(s=>s.game===game);g.setInput(0,{x:s.x,y:s.y,look:s.face,posVer:c.posVer});openTable(s,(k,a)=>g.action(0,k,a),g.view(0));return s;}
sit('pinball');assert.equal(tablePinned(),false);press('spot:main');assert.equal(tablePinned(),true);
spaceTable();tableTick(g.view(0));assert.equal(g.G.arcade.pinball.phase,'aim');
spaceTable();g.tick(.1);tableTick(g.view(0));assert.equal(g.G.arcade.pinball.phase,'play');
assert.equal(tableKey('a',true),true);g.tick(.02);tableTick(g.view(0));
assert.equal(tableKey('d',true),true);g.tick(.02);tableTick(g.view(0));
assert.ok(g.G.arcade.pinball.left>0&&g.G.arcade.pinball.right>0);
tableKey('a',false);g.tick(.02);tableTick(g.view(0));assert.equal(g.G.arcade.pinball.left,0);assert.ok(g.G.arcade.pinball.right>0);
tableKey('d',false);g.tick(.02);tableTick(g.view(0));assert.equal(g.G.arcade.pinball.right,0);
g.action(0,'leave');closeTable();assert.equal(tablePinned(),false);
sit('pop');press('spot:main');assert.equal(tablePinned(),true);spaceTable();tableTick(g.view(0));g.tick(.1);spaceTable();g.tick(.1);tableTick(g.view(0));
const p=g.G.arcade.pop;p.holes[7]={id:7,on:true,bad:false,until:10,up:0};
press('btn:hole7');assert.equal(p.score,1,'physical potato routes to the matching host hole');
g.action(0,'leave');closeTable();sit('stack');press('spot:main');assert.equal(tablePinned(),false,'other games retain walking');closeTable();

// Runtime assets must contain real skinning and moving clips, within a browser-friendly budget.
const assets=[];
for(const kind of ['stalker','skinstealer','hound','smiler']){
 const file='assets/backrooms/entities/'+kind+'.glb',b=fs.readFileSync(file),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
 assert.ok(b.length<2e6,kind+' runtime download budget');
 const triangles=j.meshes.reduce((sum,m)=>sum+m.primitives.reduce((s,p)=>s+j.accessors[p.indices].count/3,0),0);assert.ok(triangles<=18100);
 if(kind!=='smiler')assert.ok(j.skins?.length,kind+' has deforming skeleton');
 if(['stalker','skinstealer'].includes(kind))for(const name of ['walk','run']){const a=j.animations.find(a=>a.name===name);assert.ok(a);assert.ok(a.samplers.some(s=>j.accessors[s.input].count>10),'clip moves');}
 assets.push({kind,bytes:b.length,triangles,clips:j.animations?.map(a=>a.name)||[]});
}
const lib=JSON.parse(fs.readFileSync('assets/audio/audio.json'));
for(const key of ['pinFlipper','pinBumper','pinLaunch','pinDrain','popUp','popHit','entityHound','entityStalker'])assert.ok(fs.statSync('assets/audio/'+lib.sfx[key][0]).size>1000);
const report={captureOnChips:true,heldIndependentFlippers:true,disconnectRelease:true,timerStartsOnLaunch:true,physicalPopHit:true,unaffectedWalkingGames:true,assets};
fs.writeFileSync('docs/performance/2026-10-17-arcade-finish.json',JSON.stringify(report,null,2)+'\n');console.log('PASS captured chip controls, launch, held/released flippers, disconnect safety, physical pop mapping, optimized rigged creatures and generated audio.',assets);
