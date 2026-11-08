import assert from 'node:assert/strict';
import {STATIONS,SWIM_SPEED} from '../shared/layout.js';
import {exteriorRoute,exteriorLineClear,createExteriorTravel,advanceExteriorTravel} from '../server/scripts/exterior-travel.js';
const front=s=>({x:s.x+Math.sin(s.rot)*1.3,z:s.z+Math.cos(s.rot)*1.3});
const points=['airlock_out','j1','j2','j3'].map(id=>front(STATIONS[id]));
let checks=0;
for(const start of points)for(const target of points){
  const route=exteriorRoute(start,target);assert(route,'required exterior route exists');
  for(let i=1;i<route.points.length;i++)assert(exteriorLineClear(route.points[i-1],route.points[i]),'route respects swept hull collision');
  const player={...start},travel=createExteriorTravel(start,target,0,2);
  advanceExteriorTravel(player,travel,1);assert.deepEqual(player,start,'reaction delay is stationary');
  let result;for(let t=1.1;t<150;t+=.1){const old={...player};result=advanceExteriorTravel(player,travel,t);assert(Math.hypot(player.x-old.x,player.z-old.z)<=SWIM_SPEED*.100001);if(result.arrived)break;}
  assert(result.arrived,'swim reaches target');assert(Math.hypot(player.x-target.x,player.z-target.z)<1e-7);checks++;
}
assert.equal(exteriorRoute({x:0,z:0},points[0]),null);
assert.equal(exteriorRoute(points[0],{x:100,z:0}),null);
assert.equal(createExteriorTravel(points[0],points[1],0,-1),null);
const player={x:0,z:0},travel=createExteriorTravel(points[0],points[1],0,0);
assert(advanceExteriorTravel(player,travel,.1).blocked);assert.deepEqual(player,{x:0,z:0},'blocked movement never teleports');
assert.deepEqual(exteriorRoute(points[0],points[2]),exteriorRoute(points[0],points[2]),'deterministic paths');
console.log(`${checks} exterior routes and invalid/blocked travel checks passed`);
