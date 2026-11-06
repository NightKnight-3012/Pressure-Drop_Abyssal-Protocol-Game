import assert from 'node:assert/strict';
import {createGame,tickGame,startHold,cancelHold,useItem,snapshotGame,assignDepartments,TUNING} from '../server/game.js';
import {ROLE_ITEMS} from '../server/items.js';
import {AIRLOCK_ARRIVE_EXT} from '../shared/layout.js';
import {bearingTo} from '../client/src/gear-guidance.js';
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log(`PASS ${name}`);};
function setup(dept='engineering',n=1) {
  const players=Array.from({length:n},(_,i)=>({id:`p${i}`,name:`Crew ${i}`,dept,connected:true,joinedAt:i}));
  const game=createGame({players,now:0,seed:72});game.nextBreachAt=1e6;game.lockdown.nextAt=1e6;
  return {game,players,p:players[0]};
}
function tick(g,p,seconds) {const out=[];for(let i=0;i<seconds*4;i++)out.push(...tickGame(g,p,g.lastTick+250));return out;}
function patch(s) {s.game.breaches.push({id:'breach:gear',x:s.p.x,z:s.p.z,room:'control'});assert.equal(startHold(s.game,s.players,s.p,'breach:gear'),null);return s.game.holds.get(s.p.id);}
for(let n=1;n<=8;n++) check(`${n} crew receive correct role gear without extra slots or required jobs`,()=>{
  const players=Array.from({length:n},(_,i)=>({id:`p${i}`,name:`Crew ${i}`,dept:null,connected:true,joinedAt:i}));assignDepartments(players);
  const game=createGame({players,now:0,seed:8});
  assert(players.every(p=>p.inventory.length===4&&p.inventory[3]===ROLE_ITEMS[p.dept]));
  assert.equal(game.activeJunctions.length,game.scale.junctions);
});
check('unknown departments receive an empty fourth slot, never prototype gear',()=>{
  for(const dept of [null,'__proto__','constructor'])assert.equal(setup(dept).p.inventory[3],null);
});
check('every signature tool rejects the wrong role without charges or effects changing',()=>{
  for(const [role,item] of Object.entries(ROLE_ITEMS)) {
    const s=setup(role==='medical'?'engineering':'medical');s.p.inventory[3]=item;
    assert.match(useItem(s.game,s.players,s.p,3),/department/);assert.equal(s.p.inventory[3],item);assert.equal(s.game.scan,null);assert.equal(s.game.returnMarker,null);
  }
});
check('welder accelerates a real patch and contributes more noise than manual work',()=>{
  const a=setup(),b=setup();const h=patch(a);patch(b);const before=h.need;
  assert.equal(useItem(a.game,a.players,a.p,3),null);assert(h.need<before*.5);assert.equal(a.p.inventory[3],null);
  tick(a.game,a.players,.5);tick(b.game,b.players,.5);assert(a.game.lev.threat>b.game.lev.threat);
  assert.equal(snapshotGame(a.game,a.players,0).players[0].noise,100);assert.equal(a.game.breaches.length,1);
  tick(a.game,a.players,.75);assert.equal(a.game.breaches.length,0);
});
check('welder requires a nearby breach hold and rejects outside use without spending',()=>{
  const s=setup();assert(useItem(s.game,s.players,s.p,3));patch(s);s.p.x+=10;assert(useItem(s.game,s.players,s.p,3));s.p.x-=10;s.p.exterior=true;assert(useItem(s.game,s.players,s.p,3));assert.equal(s.p.inventory[3],'welder');
});
check('repair kit and welder cannot stack on the same patch in either order',()=>{
  for(const first of [2,3]) {const s=setup();patch(s);assert.equal(useItem(s.game,s.players,s.p,first),null);s.p.itemReadyAt=0;
    const second=first===2?3:2;assert.match(useItem(s.game,s.players,s.p,second),/already/);assert(s.p.inventory[second]);}
});
check('late repair tools never slow a patch or waste a charge on a nearly finished hold',()=>{
  for(const slot of [2,3]) {
    const s=setup(),h=patch(s);s.game.time=h.need-.1;
    assert.match(useItem(s.game,s.players,s.p,slot),/nearly finished/);assert(s.p.inventory[slot]);
    s.game.time=h.need-.4;const before=h.need;assert.equal(useItem(s.game,s.players,s.p,slot),null);assert(h.need<before);
  }
});
check('releasing a weld cancels noise and repair; spent charge cannot be reclaimed',()=>{
  const s=setup();patch(s);useItem(s.game,s.players,s.p,3);cancelHold(s.game,s.p.id);tick(s.game,s.players,2);
  assert.equal(s.game.breaches.length,1);assert.equal(s.p.inventory[3],null);assert.equal(s.game.lev.threat,0);
});
check('a patch cannot continue after crossing outside',()=>{
  const s=setup();patch(s);useItem(s.game,s.players,s.p,3);s.p.exterior=true;tick(s.game,s.players,2);
  assert.equal(s.game.breaches.length,1);assert.equal(s.game.holds.size,0);
});
check('scan samples real contact once, expires and never tracks subsequent movement',()=>{
  const s=setup('command');s.game.lev.angle=0;s.game.lev.dist=32;
  assert.equal(useItem(s.game,s.players,s.p,3),null);assert.equal(s.game.scan.x,32);assert.equal(s.game.scan.z,0);
  s.game.lev.angle=1;tick(s.game,s.players,2);const snap=snapshotGame(s.game,s.players,0);
  assert.equal(snap.scan.x,32);assert.equal(snap.scan.z,0);assert.equal(snap.scan.age,2);assert(snap.scan.remaining>0);
  snap.scan.x=999;assert.equal(s.game.scan.x,32);tick(s.game,s.players,4.25);assert.equal(snapshotGame(s.game,s.players).scan,null);
});
check('scanner pulse adds actual noise and team cooldown prevents chained scans',()=>{
  const a=setup('command',2),b=setup('command');useItem(a.game,a.players,a.p,3);
  assert.match(useItem(a.game,a.players,a.players[1],3),/channel/);assert.equal(a.players[1].inventory[3],'scanner');
  tick(a.game,a.players,1);tick(b.game,b.players,1);assert(a.game.lev.threat>b.game.lev.threat);
  tick(a.game,a.players,25);assert.equal(useItem(a.game,a.players,a.players[1],3),null);
});
check('canister restores station air inside and suit air outside, clamped to capacity',()=>{
  const a=setup('medical');a.game.oxygen=95;assert.equal(useItem(a.game,a.players,a.p,3),null);assert.equal(a.game.oxygen,100);assert.equal(a.p.suit,90);
  const b=setup('medical');b.p.exterior=true;b.p.suit=80;b.game.oxygen=50;assert.equal(useItem(b.game,b.players,b.p,3),null);assert.equal(b.p.suit,90);assert.equal(b.game.oxygen,50);
  const c=setup('medical');c.game.oxygen=40;useItem(c.game,c.players,c.p,3);assert.equal(c.game.oxygen,52);
  const d=setup('medical');d.p.exterior=true;d.p.suit=20;useItem(d.game,d.players,d.p,3);assert.equal(d.p.suit,50);
});
check('full air, downed crew and cooldown reject canisters without spending',()=>{
  for(const exterior of [false,true]) {const s=setup('medical');s.p.exterior=exterior;assert(useItem(s.game,s.players,s.p,3));assert.equal(s.p.inventory[3],'oxygen');}
  const s=setup('medical');s.game.oxygen=20;s.p.downed=true;assert(useItem(s.game,s.players,s.p,3));assert.equal(s.game.oxygen,20);s.p.downed=false;s.p.itemReadyAt=3;assert(useItem(s.game,s.players,s.p,3));
});
check('EVA marker is outside-only, points to the actual airlock, and expires',()=>{
  const s=setup('eva');assert(useItem(s.game,s.players,s.p,3));assert.equal(s.p.inventory[3],'return');
  Object.assign(s.p,{exterior:true,x:-25,z:20});assert.equal(useItem(s.game,s.players,s.p,3),null);
  const snap=snapshotGame(s.game,s.players);assert.equal(snap.returnMarker.x,AIRLOCK_ARRIVE_EXT.x);assert.equal(snap.returnMarker.z,AIRLOCK_ARRIVE_EXT.z);assert.equal(snap.returnMarker.remaining,60);
  tick(s.game,s.players,60.25);assert.equal(snapshotGame(s.game,s.players).returnMarker,null);
});
check('active marker preserves another diver battery and reconnect snapshot contains shared guidance',()=>{
  const s=setup('eva',2);s.players.forEach(p=>p.exterior=true);useItem(s.game,s.players,s.p,3);
  assert.match(useItem(s.game,s.players,s.players[1],3),/already/);assert.equal(s.players[1].inventory[3],'return');
  const snap=snapshotGame(s.game,s.players);assert(snap.returnMarker);assert.equal(snap.players[0].inventory[3],null);
});
check('ended matches, finale and spent signature slots never grant repeated effects',()=>{
  for(const role of Object.keys(ROLE_ITEMS)) {const s=setup(role);s.game.stage='finale';assert(useItem(s.game,s.players,s.p,3));assert(s.p.inventory[3]);s.game.stage='main';s.game.status='win';assert(useItem(s.game,s.players,s.p,3));}
  const s=setup('command');useItem(s.game,s.players,s.p,3);tick(s.game,s.players,30);assert(useItem(s.game,s.players,s.p,3));
});
check('timeline names signature actions accurately and new match restores only its own role gear',()=>{
  const s=setup('command');useItem(s.game,s.players,s.p,3);tick(s.game,s.players,.25);assert(s.game.timeline.some(e=>/Active scan/.test(e.text)));
  const game=createGame({players:s.players,now:0,seed:99});assert.equal(game.scan,null);assert.equal(game.returnMarker,null);assert.equal(s.p.inventory[3],'scanner');
});
check('bearing guidance rotates with the viewer and uses readable words without colour',()=>{
  assert.match(bearingTo({x:0,z:-10},{x:0,z:0},0),/10m \/ AHEAD/);
  assert.match(bearingTo({x:10,z:0},{x:0,z:0},0),/RIGHT/);
  assert.match(bearingTo({x:-10,z:0},{x:0,z:0},0),/LEFT/);
  assert.match(bearingTo({x:0,z:10},{x:0,z:0},0),/BEHIND/);
  assert.match(bearingTo({x:-10,z:0},{x:0,z:0},Math.PI/2),/AHEAD/);
  assert.match(bearingTo({x:0,z:0},{x:0,z:0}),/HERE/);
});
console.log(`${checks} role gear checks passed`);
