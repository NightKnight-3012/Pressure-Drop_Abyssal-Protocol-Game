import assert from 'node:assert/strict';
import {FLOODING,drainShared,breachSeverity,pumpCapacity} from '../server/flooding.js';
import {createGame,tickGame,snapshotGame} from '../server/game.js';
import {scalingFor} from '../shared/layout.js';
for(let n=1;n<=8;n++){const rooms={a:{flood:1},b:{flood:2},c:{flood:0}},capacity=pumpCapacity(scalingFor(n),.04);drainShared(rooms,capacity,1);assert(Math.abs(3-rooms.a.flood-rooms.b.flood-capacity)<1e-9);assert.equal(rooms.c.flood,0);assert(n*.035>capacity||n===1);}
assert.equal(breachSeverity({since:0},20),1);assert(breachSeverity({since:0},90)>1);assert.equal(breachSeverity({since:0},1000),2.5);const dry={a:{flood:.01},b:{flood:0}};drainShared(dry,1,10);assert.equal(dry.a.flood,0);
function setup(){const players=[{id:'p',dept:'engineering',connected:true}],game=createGame({players,now:0,seed:17});game.nextBreachAt=game.lockdown.nextAt=1e9;game.threats.skitterAt=game.threats.electricAt=game.threats.wardenAt=1e9;return {players,game,p:players[0]};}function tick(s,seconds){for(let i=0;i<seconds*4;i++)tickGame(s.game,s.players,s.game.lastTick+250);}
const s=setup();Object.assign(s.p,{x:-6,z:-7});s.game.rooms.control.closed=true;s.game.rooms.control.flood=2.6;tick(s,6);assert(s.p.breath<7&&s.p.hp===100);tick(s,8);assert(s.p.hp<100);s.game.rooms.control.flood=0;tick(s,4);assert.equal(s.p.breath,FLOODING.breathSeconds);assert(!s.p.submerged);const snap=snapshotGame(s.game,s.players);assert.equal(snap.players[0].breath,12);assert(snap.flooding);
const head=setup();Object.assign(head.p,{x:-6,z:-7});head.game.rooms.control.closed=true;head.game.rooms.control.flood=1.8;tick(head,1);assert(head.p.breath<12);head.game.rooms.control.flood=1.6;tick(head,1);assert.equal(head.p.breath,12);
const ignored=setup();ignored.game.tasks.power.done=ignored.game.tasks.pump.done=true;ignored.game.breaches.push({id:'breach:1',room:'medical',x:-6,z:6,since:0},{id:'breach:2',room:'medical',x:-4,z:6,since:0});tick(ignored,30);assert(Object.values(ignored.game.rooms).some(r=>r.flood>.1));
console.log('PASS shared pump conservation/scaling, dry-room allocation, breach growth, breath grace/damage/recovery, snapshots and live overload');
