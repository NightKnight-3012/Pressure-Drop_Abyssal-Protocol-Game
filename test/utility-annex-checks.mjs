import assert from 'node:assert/strict';
import * as THREE from 'three';
import {STATIONS, EXTERIOR_ROUTES, collides, pathBlocked, insideStation, roomAt, zoneLabel} from '../shared/layout.js';
import {createGame, startHold, tickGame, snapshotGame} from '../server/game.js';
import {calibrate} from '../server/scripts/crew-driver.js';
import {addUtilityAnnex} from '../client/src/utility-annex.js';
import {objectiveFor} from '../client/src/objectives.js';

const jobs = ['compressor','scrubber','isolation','pressure_test'];
assert.deepEqual(jobs.map(id=>STATIONS[id].hold),[STATIONS.pump.hold,STATIONS.lifesupport.hold,STATIONS.console.hold,8]);
const front = ({x,z,rot}) => ({x:x + Math.sin(rot)*1.3, z:z + Math.cos(rot)*1.3});
const stations = jobs.map(id => front(STATIONS[id]));
const path = [{x:8,z:-8.2},{x:13,z:-8.2},{x:17,z:-8.2},{x:21.4,z:-8.2},{x:25,z:-8.2}];
function assertPath(points, exterior=false) {
  for (let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i];
    assert.equal(pathBlocked(a.x,a.z,b.x,b.z,.4,[],exterior),false,JSON.stringify({a,b,exterior}));
  }
}
assertPath(path);
assert(stations.every(p => insideStation(p.x,p.z) && roomAt(p.x,p.z)==='engineering' && !collides(p.x,p.z)));
assert.equal(zoneLabel(13,-8.2),'East service corridor');
assert.equal(zoneLabel(18,-8.2),'Compressor bay');
assert.equal(zoneLabel(22,-8.2),'Pressure test bay');
assert(!insideStation(14,-5));
assert(pathBlocked(18,-10,22,-10));
assert(collides(23,-8.2,.4,[],true));
assertPath(EXTERIOR_ROUTES[0].points.map(([x,z])=>({x,z})),true);

const scene = new THREE.Scene();
const layout = addUtilityAnnex(scene,{},4);
assert.equal(layout.children.length,5);
for (const mesh of layout.children) assert(mesh.geometry.attributes.position.array.every(Number.isFinite));

const crew = size => Array.from({length:size},(_,i)=>({id:`p${i}`,name:`Crew ${i}`,connected:true,dept:'engineering'}));
const baseReady = game => {for(const id of ['power','pump','lifesupport','console'])game.tasks[id].done=true;};
const cablesReady = game => {for(const id of game.activeJunctions)game.tasks[id].done=true;};
for (const [mission,practice] of [['blackout',false],['overhaul',true]]) {
  const players=crew(1), game=createGame({players, now:0, seed:29, mission, practice});
  baseReady(game); cablesReady(game);
  const snapshot=snapshotGame(game,players,0);
  assert(!jobs.some(id=>snapshot.stations[id] || snapshot.calibrations[id]));
  assert.equal(snapshot.stations.launch,'ready');
}

for (let size=1;size<=8;size++) {
  const players=crew(size), p=players[0];
  const game=createGame({players,now:0,seed:29,mission:'overhaul'});
  game.nextBreachAt=game.lockdown.nextAt=game.complication.at=1e8;
  game.threats.skitterAt=game.threats.electricAt=game.threats.wardenAt=1e8;
  baseReady(game);
  const state=()=>snapshotGame(game,players,game.lastTick);
  assert.equal(state().stations.compressor,'ready');
  assert.equal(state().stations.scrubber,'ready');
  assert.equal(state().stations.isolation,'locked');
  assert.match(objectiveFor(state(),state().players[0]),/east service corridor/);
  const move = id => Object.assign(p,front(STATIONS[id]));
  const finish = id => {
    move(id);
    calibrate(game,p,id);
    assert.equal(startHold(game,players,p,id),null);
    for(let step=0;step<90&&!game.tasks[id].done;step++)tickGame(game,players,game.lastTick+250);
    assert(game.tasks[id].done,id);
  };
  move('launch'); assert(startHold(game,players,p,'launch'));
  move('compressor');p.exterior=true;assert(startHold(game,players,p,'compressor'));p.exterior=false;
  assert.equal(startHold(game,players,p,'compressor'),null);
  Object.assign(p,{x:17.7,z:-8.2});
  for(let step=0;step<50;step++)tickGame(game,players,game.lastTick+250);
  assert.equal(game.tasks.compressor.done,false,'calibration is required');
  calibrate(game,p,'compressor');
  finish('compressor');finish('scrubber');
  Object.assign(p,{x:20.24,z:-7.25});assert(startHold(game,players,p,'isolation'),'bay wall blocks reach');
  finish('isolation');
  assert.equal(state().stations.pressure_test,'locked');
  cablesReady(game);
  assert.equal(state().stations.launch,'locked');
  assert.match(objectiveFor(state(),state().players[0]),/launch pressure test/);
  finish('pressure_test');
  assert.equal(state().stations.launch,'ready');
}
console.log('PASS annex routes, exterior clearance, geometry, calibration and launch rules for crew sizes 1–8');
