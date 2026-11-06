import assert from 'node:assert/strict';
import {createGame,tickGame,startHold,cancelHold,snapshotGame} from '../server/game.js';
import {createLeviathan,stepLeviathan} from '../server/leviathan.js';
import {STATIONS} from '../shared/layout.js';
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log(`PASS ${name}`);};
function setup(n=1,seed=9) {
  const players=Array.from({length:n},(_,i)=>({id:`p${i}`,name:`Crew ${i}`,dept:'engineering',connected:true}));
  const game=createGame({players,now:0,seed});game.nextBreachAt=1e6;game.lockdown.nextAt=1e6;
  return {game,players,p:players[0]};
}
function tick(g,p,seconds) {const out=[];for(let i=0;i<seconds*4;i++)out.push(...tickGame(g,p,g.lastTick+250));return out;}
check('filter timing is reproducible without consuming the match RNG',()=>{
  const a=setup(),b=setup(),c=setup(1,10);assert.equal(a.game.complication.at,b.game.complication.at);assert.notEqual(a.game.complication.at,c.game.complication.at);
  assert.equal(a.game.rng(),b.game.rng());assert(a.game.complication.at>=55&&a.game.complication.at<=90);
});
check('filter waits for pump restoration and never becomes a launch prerequisite',()=>{
  const {game,players}=setup();tick(game,players,92);assert.equal(game.complication.state,'waiting');
  game.tasks.pump.done=true;tick(game,players,.25);assert.equal(game.complication.state,'active');
  assert(!STATIONS.launch.requires.includes('service:pump'));
});
for(let n=1;n<=8;n++) check(`${n} crew have one service job; any role can complete it`,()=>{
  const {game,players,p}=setup(n);p.dept='medical';Object.assign(p,{x:STATIONS.pump.x,z:STATIONS.pump.z-1});
  game.tasks.power.done=true;game.tasks.pump.done=true;game.complication.state='active';
  assert.equal(startHold(game,players,p,'service:pump'),null);tick(game,players,6.25);
  assert.equal(game.complication.state,'resolved');assert.equal(p.tasksDone,1);assert.equal(p.contribution,2);
  assert(startHold(game,players,p,'service:pump'));
});
check('filter repair rejects remote, outside, duplicate and inactive intents',()=>{
  const {game,players,p}=setup(2);game.complication.state='active';assert(startHold(game,players,p,'service:pump'));
  Object.assign(p,{x:STATIONS.pump.x,z:STATIONS.pump.z-1,exterior:true});assert(startHold(game,players,p,'service:pump'));
  p.exterior=false;assert.equal(startHold(game,players,p,'service:pump'),null);
  Object.assign(players[1],{x:p.x,z:p.z});assert(startHold(game,players,players[1],'service:pump'));
  cancelHold(game,p.id);p.downed=true;assert(startHold(game,players,p,'service:pump'));
});
check('walking away or releasing E cancels service without awarding a reward',()=>{
  const {game,players,p}=setup();game.complication.state='active';Object.assign(p,{x:STATIONS.pump.x,z:STATIONS.pump.z-1});
  startHold(game,players,p,'service:pump');p.x=0;tick(game,players,8);assert.equal(game.complication.state,'active');assert.equal(game.holds.size,0);
  Object.assign(p,{x:STATIONS.pump.x,z:STATIONS.pump.z-1});startHold(game,players,p,'service:pump');cancelHold(game,p.id);tick(game,players,8);assert.equal(game.complication.state,'active');
});
check('clog reduces actual drainage; servicing improves it; state survives snapshot',()=>{
  const levels=[];
  for(const state of ['active','waiting','resolved']) {
    const {game,players}=setup();game.tasks.power.done=true;game.tasks.pump.done=true;game.complication.state=state;
    Object.values(game.rooms).forEach(r=>r.flood=1);tick(game,players,1);levels.push(game.rooms.control.flood);
    assert.equal(snapshotGame(game,players).complication.state,state);
  }
  assert(levels[0]>levels[1]&&levels[1]>levels[2]);
});
check('complication warns once and records resolution in the timeline',()=>{
  const {game,players,p}=setup();game.tasks.pump.done=true;game.complication.at=0;
  const events=tick(game,players,2);assert.equal(events.filter(e=>e.type==='pumpClog').length,1);
  Object.assign(p,{x:STATIONS.pump.x,z:STATIONS.pump.z-1});startHold(game,players,p,'service:pump');tick(game,players,4);
  assert(game.timeline.some(e=>/Filter cleared/.test(e.text)));
});
check('quiet investigation produces one physical listening pass and retreats safely',()=>{
  const lev=createLeviathan(()=>.2);Object.assign(lev,{state:'investigate',threat:24,dist:24,since:0,target:0,angle:0});
  const events=[];let nearest=100;
  for(let t=.25;t<=12;t+=.25) {events.push(...stepLeviathan(lev,{dt:.25,time:t,noise:0,noiseAngle:null,decoyAngle:null}));nearest=Math.min(nearest,lev.dist);}
  assert.equal(events.filter(e=>e.type==='listening').length,1);assert(nearest<=18.1);assert(!events.some(e=>e.type==='strike'));assert.equal(lev.state,'patrol');
});
check('continued noise and active lures do not falsely announce a listening pass',()=>{
  for(const decoyAngle of [null,1]) {
    const lev=createLeviathan(()=>.2);Object.assign(lev,{state:'investigate',threat:24});
    const events=stepLeviathan(lev,{dt:.25,time:3,noise:decoyAngle===null?1:0,noiseAngle:0,decoyAngle});
    assert(!events.some(e=>e.type==='listening'));
  }
});
console.log(`${checks} complication and encounter checks passed`);
