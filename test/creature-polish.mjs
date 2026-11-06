import assert from 'node:assert/strict';
import {turnLeviathan,leviathanClearance} from '../client/src/leviathan-motion.js';
assert(Math.abs(turnLeviathan(0,Math.PI,.05))<=.0676);
assert(turnLeviathan(3.13,-3.13,.05)>3.13);
assert.equal(turnLeviathan(1,2,0),1);
let yaw=0;for(let i=0;i<100;i++)yaw=turnLeviathan(yaw,Math.PI,.05);assert(Math.abs(yaw-Math.PI)<1e-8);
for(let angle=-Math.PI;angle<Math.PI;angle+=.01){const a=leviathanClearance({angle,dist:35}),b=leviathanClearance({angle:angle+.0001,dist:35});assert(Number.isFinite(a)&&Math.abs(a-b)<.02);}
console.log('PASS bounded shortest-arc turns, convergence, zero-time stability and continuous obstacle clearance');
