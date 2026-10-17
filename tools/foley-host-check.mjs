import assert from 'node:assert/strict';import fs from 'node:fs';
import {createFootsteps} from '../src/character-foley.js';
import {createGame} from '../src/sim.js';
const chars=[{id:0,x:100,y:100,isHuman:true,alive:true},
 {id:1,x:160,y:100,alive:true,moving:true},
 {id:2,x:180,y:100,alive:true,moving:true,perk:'legs'},
 {id:3,x:3100,y:100,alive:true,moving:true},
 {id:4,x:400,y:100,alive:false,moving:true},
 {id:5,x:200,y:100,alive:true,moving:true,seat:{}}];
const tick=createFootsteps(c=>c.x<1000?'floor':'bar');
tick(0,chars);tick(.25,chars);assert.deepEqual(chars[0].footsteps,[1]);
tick(.4,chars);assert.deepEqual(chars[0].footsteps,[1],'one pending ID per source');
chars[0].footsteps=[];tick(.6,chars);assert.deepEqual(chars[0].footsteps,[],'cadence');
chars[1].moving=false;tick(.9,chars);assert.deepEqual(chars[0].footsteps,[],'standing/silent/far/dead/seated actors stay quiet');
const sim=createGame({humans:[0,1,2,3].map(i=>({name:'Human '+i,key:'p'+i})),players:6,killers:1,forceRole:'gambler',pick:null});sim.startPlay();
for(const c of sim.G.chars){c.isHuman=true;c.x=1800;c.y=500+c.id*50;}
const killer=sim.G.chars[sim.G.killerIds[0]],victim=sim.G.chars.find(c=>c!==killer&&c.id!==0),near=sim.G.chars[0],far=sim.G.chars.find(c=>c!==killer&&c!==victim&&c!==near);
near.x=1320;near.y=600;victim.x=1360;victim.y=600;far.x=2900;far.y=1000;
victim.poisonT=.001;victim.poisonBy=killer.id;sim.tick(.02);
const local=sim.view(near.id),distant=sim.view(far.id),dead=sim.view(victim.id);
assert.equal(victim.alive,false);assert.equal(dead.priv.deathScene.killer.name,killer.name);
assert.equal(local.priv.deathScene,null);assert.equal(distant.priv.deathScene,null);
const closeEvent=local.priv.inbox.find(m=>m.sfx==='death'),farEvent=distant.priv.inbox.find(m=>m.sfx==='death');
assert.ok(closeEvent);assert.equal(closeEvent.distant,false);assert.ok(farEvent);assert.equal(farEvent.distant,true);assert.equal(farEvent.muffle,true);assert.deepEqual(farEvent.at,[1360,600]);
assert.equal(farEvent.event,closeEvent.event);assert.equal(sim.view(far.id).priv.inbox.some(m=>m.sfx==='death'),false);
near.footsteps=[victim.id];const packet=sim.view(near.id).priv.footsteps;assert.equal(packet.seq,1);assert.deepEqual(packet.ids,[victim.id]);assert.equal(sim.view(near.id).priv.footsteps,null);
const report={hostSteps:true,silentPerk:true,distanceCulling:true,cadence:true,stationarySilence:true,onePrivatePacket:true,realPoisonEvent:{near:closeEvent,far:farEvent},victimOnlyKiller:true};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
console.log('PASS: host footsteps preserve silent walking without publishing perks, cull distant/dead/seated sources, and real deaths emit one positioned near/far event with victim-only identity.');
