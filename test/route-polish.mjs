import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRouteScenery} from '../client/src/route-scenery.js';
import {routeFrame} from '../shared/escape-route.js';
const view=createRouteScenery();view.root.updateMatrixWorld(true);assert.equal(view.root.children.length,5);let vertices=0;view.root.traverse(m=>{assert(!m.isLight&&!m.castShadow);if(m.geometry){vertices+=m.geometry.attributes.position.count;assert([...m.geometry.attributes.position.array].every(Number.isFinite));}});assert(vertices<200000);
const ray=new THREE.Raycaster();for(let at=8;at<195;at+=1){const a=routeFrame(at),b=routeFrame(at+1);for(const lane of [-4,0,4]){const from=new THREE.Vector3(a.x+lane,a.y,-at*6),to=new THREE.Vector3(b.x+lane,b.y,-(at+1)*6);ray.set(from,to.clone().sub(from).normalize());ray.far=from.distanceTo(to);assert.equal(ray.intersectObject(view.root,true).length,0,'Static dressing obstructs lane at '+at);}}
console.log('PASS route dressing: five batches, finite geometry, no lights/shadows, clear steering lanes');
