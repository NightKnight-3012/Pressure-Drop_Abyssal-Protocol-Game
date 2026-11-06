import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {routeFrame} from '../../shared/escape-route.js';
import {createRockMaps,oceanNoise} from './ocean.js';
// A continuous wreck corridor: structures flank the *same* authoritative lanes.
// Five static batches, with a generous clear envelope and no shadow passes.
export function createRouteScenery() {
  const root=new THREE.Group();root.name='Escape corridor / fractured survey array';
  const materials=[
    new THREE.MeshStandardMaterial({color:0x34494c,metalness:.55,roughness:.74}),
    new THREE.MeshStandardMaterial({color:0x725840,metalness:.5,roughness:.8}),
    new THREE.MeshStandardMaterial({color:0x5a6c63,roughness:1,...createRockMaps(),normalScale:new THREE.Vector2(.6,.6)}),
    new THREE.MeshStandardMaterial({color:0x7fc8bb,emissive:0x3e8b85,emissiveIntensity:.8}),
    new THREE.MeshStandardMaterial({color:0xbf8e52,emissive:0x653719,emissiveIntensity:.35})
  ],batches=materials.map(()=>[]);
  const place=(geo,at,x,y,batch=0,rotation=[0,0,0])=>{const f=routeFrame(at);geo.rotateX(rotation[0]);geo.rotateY(rotation[1]);geo.rotateZ(rotation[2]);geo.translate(f.x+x,f.y+y,-at*6);batches[batch].push(geo.index?geo.toNonIndexed():geo);if(geo.index)geo.dispose();};
  for(let at=8;at<198;at+=7) {
    const sign=Math.sin(at*23)>0?1:-1;
    // Cliffs and pressure-pipe ribs frame the view, leaving all three lanes clear.
    for(const side of [-1,1]) {
      const cliff=new THREE.SphereGeometry(1,14,10),p=cliff.attributes.position;
      for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=.85+oceanNoise(x*3+at,z*3+y)*.25+Math.sin(y*18+x*2)*.06;p.setXYZ(i,x*r,y*r,z*r);}
      cliff.computeVertexNormals();cliff.scale(4.5,5+Math.sin(at)*2,12);
      place(cliff,at,side*(16+Math.sin(at)*1.5),-1.5,2,[.15,at*.3,side*.2]);
      place(new THREE.CylinderGeometry(.18,.24,12,8),at,side*8.6,1.8,0,[0,0,side*.18]);
      place(new THREE.BoxGeometry(.12,.14,1.4),at,side*6.8,-1.6,3);
    }
    if(at>43&&at<145) {
      place(new THREE.TorusGeometry(9,.24,6,32,Math.PI),at,0,-1.7,1,[0,0,sign*.07]);
      place(new THREE.BoxGeometry(9,.3,2),at,sign*7.5,7.8,0,[.15,0,sign*.17]);
    }
    if(at>92&&at<145)place(new THREE.CylinderGeometry(.4,.6,18,10),at,sign*10,3,1,[0,0,sign*.5]);
  }
  for(const at of [35,85,138,182]) {
    for(const side of [-1,1])place(new THREE.BoxGeometry(.8,8,2),at,side*8.4,1.6,0);
    place(new THREE.BoxGeometry(18,.7,2),at,0,6.1,1,[0,0,.04]);
    place(new THREE.BoxGeometry(4,.08,.1),at,0,5.6,4);
  }
  // Paired guide dashes follow the actual bends; they mark corridor edges,
  // not a safe lane through the server's randomly selected obstacles.
  for(let at=6;at<198;at+=2.5){
    const frame=routeFrame(at);
    for(const side of [-1,1]){
      place(new THREE.BoxGeometry(.10,.10,2.8),at,side*6.8,-1.6,3,[0,frame.yaw,0]);
      if(Math.round(at*2)%5===2)place(new THREE.BoxGeometry(.16,.65,.12),at,side*7,-1.25,4);
    }
  }
  // Torn deck stacks and exposed frames give each part of the transit its own silhouette.
  // All static dressing stays outside the three steering lanes.
  for(let at=48;at<145;at+=11){
    const side=Math.sin(at*17)>0?1:-1;
    const panel=new THREE.Shape();panel.moveTo(-2.2,-1.4);panel.lineTo(1.6,-1.4);
    panel.lineTo(2.3,-.3);panel.lineTo(1.4,.1);panel.lineTo(2.1,1.2);
    panel.lineTo(-.6,1.5);panel.lineTo(-2.2,.7);panel.closePath();
    place(new THREE.ExtrudeGeometry(panel,{depth:.12,bevelEnabled:false}),at,side*11,1.6,1,[.18,side*.35,side*.22]);
    place(new THREE.BoxGeometry(.15,5,.18),at,side*10,3.8,0,[.12,0,side*.28]);
    place(new THREE.BoxGeometry(3,.12,.3),at,side*10.5,6.2,4,[0,0,side*.15]);
  }
  batches.forEach((parts,i)=>{if(!parts.length)return;const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());root.add(new THREE.Mesh(geometry,materials[i]));});
  return {root,update(progress){root.position.z=8+progress*6;}};
}
