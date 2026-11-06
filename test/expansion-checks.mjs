import assert from 'node:assert/strict';
import * as THREE from 'three';
import {collides,roomAt,ROOM_IDS,SERVICE_PORTALS,STATIONS,spawnPoint,HUB} from '../shared/layout.js';
import {routeFrame,createRoute} from '../shared/escape-route.js';
import {rescuePose,RESCUE_DURATION,RESCUE_SEA_LEVEL} from '../client/src/rescue-sequence.js';
import {createRouteScenery} from '../client/src/route-scenery.js';
import {createStationExterior} from '../client/src/station-exterior.js';
import {createStationDetail} from '../client/src/station-detail.js';
let checks=0;const check=(name,value)=>{assert.ok(value,name);checks++;console.log('PASS '+name);};
function reachable(closed=[],avoidHub=false) {
  const start=spawnPoint(0),step=.25,key=(x,z)=>`${Math.round(x/step)},${Math.round(z/step)}`;
  const q=[[Math.round(start.x/step)*step,start.z]],seen=new Set([key(...q[0])]);
  for(let i=0;i<q.length;i++)for(const [dx,dz] of [[step,0],[-step,0],[0,step],[0,-step]]) {
    const x=q[i][0]+dx,z=q[i][1]+dz,k=key(x,z);
    if(seen.has(k)||Math.abs(x)>9.35||Math.abs(z)>9.35||avoidHub&&Math.abs(x)<HUB+.45&&Math.abs(z)<HUB+.45||collides(x,z,.4,closed))continue;
    seen.add(k);q.push([x,z]);
  }return q;
}
const loop=reachable([],true);
check('physical service loop connects all departments without crossing the hub',ROOM_IDS.every(id=>loop.some(([x,z])=>roomAt(x,z)===id)));
check('every repair and launch panel has a reachable working position',Object.values(STATIONS).filter(s=>!s.exterior).every(s=>loop.some(([x,z])=>Math.hypot(x-s.x,z-s.z)<2.2&&roomAt(x,z)===s.room)));
const sealed=reachable(['control']);check('closing Control seals central and service exits',sealed.every(([x,z])=>roomAt(x,z)==='control'));
check('all four service openings are actually walkable',SERVICE_PORTALS.every(p=>!collides(p.x,p.z)));
const detail=createStationDetail(new THREE.Scene());
check('department signs face the hub approach and stay mounted on the header backing',detail.signs.filter(s=>s.row>=1&&s.row<=4).every(s=>Math.sign(Math.cos(s.yaw))===-Math.sign(s.z)&&Math.abs(Math.abs(s.z)-1.675)<.001&&Math.abs(s.y-3.55)<.001));
check('each department has one physical heading rather than duplicate room signs',detail.signs.filter(s=>s.row>=1&&s.row<=4).length===4);detail.dispose();
const route=createRoute(()=>.5);check('the escape route contains telegraphed collapse sections',route.length===14&&route.some(g=>g.kind==='falling'));
check('every obstacle leaves at least two clear steering lanes',route.every(g=>[-1,0,1].filter(l=>Math.abs(l-g.lane)>=.52).length>=2));
let smooth=true;for(let p=0;p<210;p+=.1){const a=routeFrame(p),b=routeFrame(p+.01);smooth&&=Object.values(a).every(Number.isFinite)&&Math.abs(a.x-b.x)<.05&&Math.abs(a.y-b.y)<.02;}
check('curving route stays finite and continuous',smooth);
check('the final approach centers and levels exactly on the recovery cradle',Math.abs(routeFrame(210).x)<.001&&Math.abs(routeFrame(210).y-2.1)<.001&&routeFrame(210).yaw===0);
const scenery=createRouteScenery();let finite=true;scenery.root.traverse(o=>{if(o.geometry)finite&&=o.geometry.attributes.position.array.every(Number.isFinite);});
check('the entire wreck corridor uses five static batches with finite geometry',scenery.root.children.length===5&&finite);
const exterior=createStationExterior(new THREE.Scene());check('station pressure silhouette uses four batches without extra lights',exterior.children.length===4&&exterior.children.every(o=>o.isMesh));
for(const t of [4,9,14,18,24]){const a=rescuePose(t-.001),b=rescuePose(t+.001);check(`rescue staging stays continuous across ${t}s`,new THREE.Vector3(...a.body).distanceTo(new THREE.Vector3(...b.body))<.03&&new THREE.Vector3(...a.camera).distanceTo(new THREE.Vector3(...b.camera))<.08);}
check('surface emergence occurs before sling attachment and deck recovery',rescuePose(10).body[1]<RESCUE_SEA_LEVEL&&rescuePose(15).phase==='hook'&&rescuePose(23).phase==='recovery');
check('the rescue finishes above the tender deck instead of teleporting to it',rescuePose(RESCUE_DURATION).body[0]===-8&&rescuePose(RESCUE_DURATION).body[1]>RESCUE_SEA_LEVEL+1);
for(const root of [scenery.root,exterior])root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
console.log(`${checks}/${checks} expansion checks passed`);
