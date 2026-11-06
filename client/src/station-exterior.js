import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Everything stays inside the existing hull apron; the silhouette above the
// ceiling is now pressure vessels, roof services and a severed lift umbilical.
export function createStationExterior(scene) {
  const root=new THREE.Group();root.name='NEREID / pressure modules and survey superstructure';scene.add(root);
  const mats=[
    new THREE.MeshStandardMaterial({color:0x344b54,metalness:.65,roughness:.64}),
    new THREE.MeshStandardMaterial({color:0x7a8174,metalness:.5,roughness:.75}),
    new THREE.MeshStandardMaterial({color:0x9f7348,metalness:.65,roughness:.7}),
    new THREE.MeshStandardMaterial({color:0xc4ac78,emissive:0x80602f,emissiveIntensity:.65})
  ],parts=mats.map(()=>[]);
  function put(g,pos,mat=0,rot=[0,0,0]){g.rotateX(rot[0]);g.rotateY(rot[1]);g.rotateZ(rot[2]);g.translate(...pos);parts[mat].push(g.toNonIndexed());g.dispose();}
  for(const sx of [-1,1])for(const sz of [-1,1]) {
    put(new THREE.CylinderGeometry(2.75,2.75,6.2,24,1,false,0,Math.PI),[sx*6,4,sz*6],1,[0,0,Math.PI/2]);
    for(const x of [sx*3.2,sx*6,sx*8.8])put(new THREE.TorusGeometry(2.82,.1,7,24,Math.PI),[x,4,sz*6],0,[0,Math.PI/2,0]);
    put(new THREE.CylinderGeometry(.8,.9,2.5,16),[sx*8,5.4,sz*8],0);
    put(new THREE.SphereGeometry(.85,16,8,0,Math.PI*2,0,Math.PI/2),[sx*8,6.65,sz*8],1);
    for(const y of [1,3.2])put(new THREE.BoxGeometry(.18,.18,5.4),[sx*9.9,y,sz*6],2);
    put(new THREE.BoxGeometry(.08,.15,.3),[sx*9.93,3.5,sz*7],3);
  }
  // The broken main lift is visible from the station and explains the ridge route.
  for(const x of [-1.1,1.1])put(new THREE.CylinderGeometry(.11,.11,5.5,8),[x,6.4,-2],2,[0,0,x*.06]);
  put(new THREE.BoxGeometry(3,.3,.45),[0,9,-2],0);
  const cable=new THREE.CatmullRomCurve3([new THREE.Vector3(0,9,-2),new THREE.Vector3(1.4,7.8,-2.8),new THREE.Vector3(2.2,5.4,-3.5)]);
  put(new THREE.TubeGeometry(cable,18,.07,7),[0,0,0],0);
  parts.forEach((p,i)=>{if(!p.length)return;const geo=mergeGeometries(p);p.forEach(g=>g.dispose());root.add(new THREE.Mesh(geo,mats[i]));});
  return root;
}
