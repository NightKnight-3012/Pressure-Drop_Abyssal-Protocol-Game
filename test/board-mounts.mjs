import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createStoryView} from '../client/src/story-view.js';
import {createStationDetail} from '../client/src/station-detail.js';
import {LOGS} from '../shared/story.js';
import {oceanHeight} from '../shared/ocean-floor.js';
const scene=new THREE.Scene(),view=createStoryView(scene),available=['arrival','wreck','garden'];view.update({available,found:[]});const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
const stand=view.root.children[2];for(let i=0;i<available.length;i++){const log=LOGS.filter(l=>available.includes(l.id))[i];stand.getMatrixAt(i,matrix);matrix.decompose(position,quaternion,scale);const ground=log.ext?oceanHeight(log.x,log.z):0;assert(Math.abs(position.y-scale.y/2-ground)<1e-5);assert(Math.abs(position.y+scale.y/2-.525)<1e-5);}
view.dispose();const detail=createStationDetail(scene);for(const sign of detail.signs.filter(s=>s.row>=1&&s.row<=4)){assert.equal(sign.y,3.55);assert(sign.z<0?Math.cos(sign.yaw)>0:Math.cos(sign.yaw)<0);}detail.dispose();console.log('PASS evidence stands touch the floor/seabed and support the terminals; room signs face the approach');
