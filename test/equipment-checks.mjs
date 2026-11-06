import assert from 'node:assert/strict';
import { createGame, tickGame, useItem, startHold, snapshotGame, buildSummary, TUNING } from '../server/game.js';
import { recordEvents } from '../server/timeline.js';
import { ITEM_LIMIT } from '../shared/items.js';
import { createEquipmentView } from '../client/src/equipment-view.js';
import * as THREE from 'three';
let checks=0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }
function setup(n=1) {
  const players=Array.from({length:n},(_,i)=>({id:`p${i}`,name:`Crew ${i}`,dept:'engineering',connected:true}));
  const game=createGame({players,now:0,seed:17}); game.nextBreachAt=1e6; game.lockdown.nextAt=1e6;
  return {game,players,p:players[0]};
}
const tick=(g,p,seconds)=>{for(let i=0;i<seconds*4;i++) tickGame(g,p,g.lastTick+250);};
for(let n=1;n<=8;n++) check(`${n} crew receive independent limited inventories`,()=>{
  const {game,players,p}=setup(n);
  assert.equal(p.inventory.length,4); assert(p.inventory.length<=ITEM_LIMIT);
  useItem(game,players,p,0); assert.equal(p.inventory[0],null);
  if(n>1) assert.equal(players[1].inventory[0],'flare');
});
check('reject malformed, nonexistent and prototype equipment slots without mutation',()=>{
  const {game,players,p}=setup();
  for(const slot of [null,{},NaN,Infinity,-1,4,1.5,'0','__proto__']) assert(useItem(game,players,p,slot));
  assert.deepEqual(p.inventory,['flare','decoy','repair','welder']); assert.equal(game.effects.length,0);
});
check('inactive, disconnected, boarded and ended players cannot use tools',()=>{
  for(const flag of ['downed','lost','aboard','escaped']) { const {game,players,p}=setup();p[flag]=true;assert(useItem(game,players,p,0)); }
  const {game,players,p}=setup();p.connected=false;assert(useItem(game,players,p,0));p.connected=true;game.status='lose';assert(useItem(game,players,p,0));
});
check('flare position is authoritative; it is consumed once and expires',()=>{
  const {game,players,p}=setup();p.x=-15;p.z=10;p.exterior=true;
  assert.equal(useItem(game,players,p,0),null);const e=game.effects[0];assert.equal(e.x,p.x);assert.equal(e.z,p.z);assert.equal(e.exterior,true);
  assert(useItem(game,players,p,0));assert.equal(game.effects.length,1);tick(game,players,25);assert.equal(game.effects.length,0);
});
check('flare adds measurable noise to the actual Leviathan model',()=>{
  const a=setup(),b=setup();useItem(a.game,a.players,a.p,0);tick(a.game,a.players,4);tick(b.game,b.players,4);
  assert(a.game.lev.threat>b.game.lev.threat);
});
check('personal equipment cooldown blocks consecutive uses without spending',()=>{
  const {game,players,p}=setup();useItem(game,players,p,0);assert(useItem(game,players,p,1));assert.equal(p.inventory[1],'decoy');
});
check('lure distracts an approaching Leviathan and a team cooldown prevents chaining',()=>{
  const {game,players,p}=setup(2);p.x=6;p.z=-6;game.lev.state='approach';game.lev.threat=75;
  assert.equal(useItem(game,players,p,1),null);assert(useItem(game,players,players[1],1));
  tick(game,players,9);assert.equal(game.lev.state,'approach');assert(game.lev.threat<40);assert.equal(game.breaches.length,0);
  assert(Math.abs(game.lev.target+Math.PI/4)<.001);tick(game,players,8);assert.equal(useItem(game,players,players[1],1),null);
});
check('repair kit requires a live nearby breach hold; rejection preserves the kit',()=>{
  const {game,players,p}=setup();assert(useItem(game,players,p,2));assert.equal(p.inventory[2],'repair');
  game.breaches.push({id:'breach:test',room:'control',x:p.x,z:p.z});assert.equal(startHold(game,players,p,'breach:test'),null);
  p.x+=20;assert(useItem(game,players,p,2));assert.equal(p.inventory[2],'repair');
});
check('repair kit shortens a real hold, keeps progress and still requires holding E',()=>{
  const {game,players,p}=setup();game.breaches.push({id:'breach:test',room:'control',x:p.x,z:p.z});
  startHold(game,players,p,'breach:test');tick(game,players,.5);const h=game.holds.get(p.id), before=h.need;
  assert.equal(useItem(game,players,p,2),null);assert(h.need<before);assert(game.breaches.length===1);
  tick(game,players,1.5);assert.equal(game.breaches.length,0);assert.equal(p.inventory[2],null);
});
check('live device cap rejects excess deployments without spending',()=>{
  const {game,players,p}=setup();game.effects=Array.from({length:TUNING.items.maxEffects},()=>({until:20}));assert(useItem(game,players,p,0));assert.equal(p.inventory[0],'flare');
});
check('snapshots copy inventories and expose remaining device time for reconnect',()=>{
  const {game,players,p}=setup();useItem(game,players,p,0);const s=snapshotGame(game,players,0);assert.equal(s.effects[0].remaining,24);
  s.players[0].inventory[1]=null;assert.equal(p.inventory[1],'decoy');assert(s.players[0].itemReadyIn>0);
});
check('timeline captures actual rules, deduplicates dispatch and snapshots summary',()=>{
  const {game,players,p}=setup();useItem(game,players,p,0);const events=tickGame(game,players,250);
  recordEvents(game,players,events);assert.equal(game.timeline.length,1);assert.equal(game.timeline[0].actor,p.name);
  const summary=buildSummary(game,players,'win','test');game.timeline[0].text='changed';assert.notEqual(summary.timeline[0].text,'changed');
  recordEvents(game,players,Array.from({length:200},()=>({type:'patched',by:p.id})));assert.equal(game.timeline.length,160);
});
check('device visuals pool eight meshes and at most two lights without per-frame growth',()=>{
  const scene=new THREE.Scene(),view=createEquipmentView(scene);assert.equal(scene.children.length,10);
  const effects=Array.from({length:8},(_,i)=>({x:i,z:0,item:'flare',remaining:10}));
  view.update(effects,'low');assert.equal(scene.children.filter(o=>o.isLight&&o.intensity>0).length,1);
  view.update(effects,'high');assert.equal(scene.children.filter(o=>o.isLight&&o.intensity>0).length,2);
  view.update([]);assert.equal(scene.children.filter(o=>o.isMesh&&o.visible).length,0);view.dispose();assert.equal(scene.children.length,0);
});
console.log(`${checks} equipment and timeline checks passed`);
