import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import * as THREE from 'three';
import {createGame,takeLockerItem,snapshotGame,tickGame,useItem} from '../server/game.js';
import {LOCKERS,LOCKER_RANGE,collides,roomAt,spawnPoint} from '../shared/layout.js';
import {createLockerView} from '../client/src/locker-view.js';
import {createLockerPanel} from '../client/src/locker-panel.js';
import {createInput} from '../client/src/input.js';
let checks=0;
function check(name,fn){fn();checks++;console.log(`PASS ${name}`);}
function setup(n=1){const players=Array.from({length:n},(_,i)=>({id:`p${i}`,name:`Crew ${i}`,dept:'engineering',connected:true}));const game=createGame({players,seed:42,now:0});game.nextBreachAt=1e6;game.lockdown.nextAt=1e6;return {game,players,p:players[0]};}
function front(p,id='engineering'){Object.assign(p,{x:LOCKERS[id].x,z:LOCKERS[id].z+.8,exterior:false});}
for(let n=1;n<=8;n++)check(`${n} crew get finite shared reserves and a four-slot cap`,()=>{
  const s=setup(n);assert(Object.values(s.game.lockers).every(stock=>Object.values(stock).every(n=>Number.isInteger(n)&&n>0&&n<=3)));
  useItem(s.game,s.players,s.p,0);front(s.p);const before=s.game.lockers.engineering.flare;
  assert.equal(takeLockerItem(s.game,s.players,s.p,'engineering','flare'),null);assert.equal(s.p.inventory.length,4);assert.equal(s.p.inventory[0],'flare');assert.equal(s.game.lockers.engineering.flare,before-1);
});
check('small and large crew stock follows existing scaling tiers',()=>{
  assert.deepEqual(setup(1).game.lockers,{engineering:{flare:1,repair:1},medical:{decoy:1,repair:1}});
  assert.deepEqual(setup(8).game.lockers,{engineering:{flare:2,repair:3},medical:{decoy:2,repair:1}});
});
check('malformed, prototype and unstocked item requests never mutate stock',()=>{
  const s=setup();front(s.p);s.p.inventory[0]=null;const before=JSON.stringify(s.game.lockers);
  for(const [id,item] of [[null,'flare'],[{},'flare'],['__proto__','flare'],['constructor','flare'],['engineering',null],['engineering','__proto__'],['engineering','welder'],['medical','flare'],['engineering','x'.repeat(5000)]])assert(takeLockerItem(s.game,s.players,s.p,id,item));
  assert.equal(JSON.stringify(s.game.lockers),before);assert.equal(s.p.inventory[0],null);
});
check('inactive, outside, ended and post-launch crew cannot acquire equipment',()=>{
  for(const flag of ['downed','lost','aboard','escaped']){const s=setup();front(s.p);s.p.inventory[0]=null;s.p[flag]=true;assert(takeLockerItem(s.game,s.players,s.p,'engineering','flare'));}
  const s=setup();front(s.p);s.p.inventory[0]=null;s.p.connected=false;assert(takeLockerItem(s.game,s.players,s.p,'engineering','flare'));s.p.connected=true;s.p.exterior=true;assert(takeLockerItem(s.game,s.players,s.p,'engineering','flare'));s.p.exterior=false;
  for(const stage of ['vote','boarding','finale']){s.game.stage=stage;assert(takeLockerItem(s.game,s.players,s.p,'engineering','flare'));}
  s.game.stage='main';s.game.status='lose';assert(takeLockerItem(s.game,s.players,s.p,'engineering','flare'));assert.equal(s.game.lockers.engineering.flare,1);
});
check('checkout requires range, room and the front side of the actual cabinet',()=>{
  const s=setup();s.p.inventory[0]=null;
  for(const [x,z] of [[0,0],[8,-2.9+LOCKER_RANGE+.1],[8,-3.6],[-8,4.2]]){Object.assign(s.p,{x,z});assert(takeLockerItem(s.game,s.players,s.p,'engineering','flare'));}
  front(s.p);assert.equal(takeLockerItem(s.game,s.players,s.p,'engineering','flare'),null);
});
check('full inventory preserves stock and all carried equipment',()=>{
  const s=setup();front(s.p);const before=[...s.p.inventory];assert.match(takeLockerItem(s.game,s.players,s.p,'engineering','repair'),/full/);assert.deepEqual(s.p.inventory,before);assert.equal(s.game.lockers.engineering.repair,1);
});
check('checkout fills first empty slot, never evicts or reorders another tool',()=>{
  const s=setup();front(s.p);s.p.inventory[1]=null;s.p.inventory[2]=null;assert.equal(takeLockerItem(s.game,s.players,s.p,'engineering','repair'),null);assert.deepEqual(s.p.inventory,['flare','repair',null,'welder']);
});
check('last-unit contention and retries cannot duplicate a shared supply',()=>{
  const s=setup(4);s.game.lockers.engineering.repair=1;s.players.forEach(p=>{front(p);p.inventory[2]=null;});
  const errors=s.players.map(p=>takeLockerItem(s.game,s.players,p,'engineering','repair'));
  assert.equal(errors.filter(e=>e===null).length,1);assert.equal(s.players.filter(p=>p.inventory[2]==='repair').length,1);assert.equal(s.game.lockers.engineering.repair,0);
  assert(takeLockerItem(s.game,s.players,s.p,'engineering','repair'));
});
check('dispenser cooldown rejects repeated checkout without spending another unit',()=>{
  const s=setup(8);front(s.p);s.p.inventory[0]=null;s.p.inventory[2]=null;takeLockerItem(s.game,s.players,s.p,'engineering','repair');
  const left=s.game.lockers.engineering.repair;assert.match(takeLockerItem(s.game,s.players,s.p,'engineering','repair'),/dispenser/);assert.equal(s.game.lockers.engineering.repair,left);s.game.time=1;assert.equal(takeLockerItem(s.game,s.players,s.p,'engineering','repair'),null);
});
check('restocked gear works through existing item rules and cannot bypass its cooldown',()=>{
  const s=setup();front(s.p);useItem(s.game,s.players,s.p,0);takeLockerItem(s.game,s.players,s.p,'engineering','flare');assert.match(useItem(s.game,s.players,s.p,0),/cooling/);s.game.time=3;assert.equal(useItem(s.game,s.players,s.p,0),null);assert.equal(s.game.effects.length,2);
});
check('snapshot copies reserves and includes checkout cooldown; reconnect does not restock',()=>{
  const s=setup();front(s.p);s.p.inventory[0]=null;takeLockerItem(s.game,s.players,s.p,'engineering','flare');const snapshot=snapshotGame(s.game,s.players);
  assert.equal(snapshot.lockers.engineering.flare,0);assert.equal(snapshot.players[0].lockerReadyIn,1);snapshot.lockers.engineering.flare=99;assert.equal(s.game.lockers.engineering.flare,0);
  s.p.connected=false;s.p.connected=true;assert.equal(snapshotGame(s.game,s.players).lockers.engineering.flare,0);
  const fresh=createGame({players:s.players,seed:42,now:0});assert.equal(fresh.lockers.engineering.flare,1);assert.equal(s.p.inventory[0],'flare');assert.equal(s.p.lockerReadyAt,0);
});
check('checkout is recorded once in mission timeline without farming contributions',()=>{
  const s=setup();front(s.p);s.p.inventory[0]=null;takeLockerItem(s.game,s.players,s.p,'engineering','repair');tickGame(s.game,s.players,250);
  assert(s.game.timeline.some(e=>/repair kit taken/.test(e.text)&&e.actor===s.p.name));assert.equal(s.p.contribution,0);
});
check('both locker working positions are physically reachable from the crew spawn',()=>{
  const start=spawnPoint(0),step=.25,queue=[[Math.round(start.x/step)*step,Math.round(start.z/step)*step]],key=(x,z)=>`${x},${z}`,seen=new Set([key(...queue[0])]);
  for(let i=0;i<queue.length;i++)for(const [dx,dz] of [[step,0],[-step,0],[0,step],[0,-step]]){const x=queue[i][0]+dx,z=queue[i][1]+dz,k=key(x,z);if(seen.has(k)||Math.abs(x)>9.35||Math.abs(z)>9.35||collides(x,z,.4))continue;seen.add(k);queue.push([x,z]);}
  assert(Object.values(LOCKERS).every(p=>queue.some(([x,z])=>z>=p.z&&roomAt(x,z)===p.room&&Math.hypot(x-p.x,z-p.z)<LOCKER_RANGE)));
});
check('locker plates use two meshes with no lights and dispose cleanly',()=>{
  const scene=new THREE.Scene(),view=createLockerView(scene);assert.equal(scene.children.length,2);assert(scene.children.every(o=>o.isMesh));view.update({lockers:setup().game.lockers,stage:'main'});view.dispose();assert.equal(scene.children.length,0);
});
const dom=new JSDOM('<body><canvas></canvas><section id="locker-panel" class="hidden"><strong id="locker-title"></strong><button id="locker-close">Close</button><p id="locker-capacity"></p><div id="locker-stock"></div><p id="locker-note"></p></section></body>');
globalThis.window=dom.window;globalThis.document=dom.window.document;
check('locker panel shows finite stock, free capacity and disabled full/empty states',()=>{
  const s=setup(),intents=[];const panel=createLockerPanel((...a)=>intents.push(a),()=>panel.close());panel.open('engineering');panel.update(snapshotGame(s.game,s.players),snapshotGame(s.game,s.players).players[0]);
  assert.match(document.getElementById('locker-note').textContent,/Inventory full/);assert([...document.querySelectorAll('#locker-stock button')].every(b=>b.disabled));
  s.p.inventory[0]=null;panel.update(snapshotGame(s.game,s.players),snapshotGame(s.game,s.players).players[0]);const button=document.querySelector('#locker-stock button');button.click();assert.deepEqual(intents,[['engineering','flare']]);assert.equal(s.game.lockers.engineering.flare,1);
  s.game.lockers.engineering.flare=0;panel.update(snapshotGame(s.game,s.players),snapshotGame(s.game,s.players).players[0]);assert(document.querySelector('#locker-stock button').disabled);
  s.game.lockers.engineering.repair=0;s.p.inventory[0]='flare';panel.update(snapshotGame(s.game,s.players),snapshotGame(s.game,s.players).players[0]);assert.match(document.getElementById('locker-note').textContent,/exhausted/);
  panel.dispose();assert(!document.body.classList.contains('locker-open'));
});
check('focused locker buttons preserve movement but ordinary menu buttons do not',()=>{
  const input=createInput(document.querySelector('canvas'),{}),button=document.getElementById('locker-close');
  const dispatch=(type,code)=>button.dispatchEvent(new window.KeyboardEvent(type,{code,bubbles:true}));document.body.classList.add('locker-open');
  dispatch('keydown','KeyW');assert(input.axes().moving);dispatch('keyup','KeyW');assert(!input.axes().moving);document.body.classList.remove('locker-open');dispatch('keydown','KeyW');assert(!input.axes().moving);input.dispose();
});
dom.window.close();delete globalThis.document;delete globalThis.window;
console.log(`${checks} locker checks passed`);
