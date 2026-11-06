import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Visual assembly stays within the existing wall-panel footprint. Four static
// batches; no extra light, shadow pass, animation or collision geometry.
export function createPowerUnit(statusMaterial, hazardMap) {
  const root=new THREE.Group();root.name='NEREID / power distribution assembly';
  const finishes=[
    new THREE.MeshStandardMaterial({color:0x344b50,metalness:.65,roughness:.55}),
    new THREE.MeshStandardMaterial({color:0x9a7955,metalness:.7,roughness:.48}),
    new THREE.MeshStandardMaterial({color:0xb8b5a2,metalness:.35,roughness:.64,map:hazardMap}),
    statusMaterial
  ],batches=finishes.map(()=>[]);
  function add(geo,position,batch=0,rotation=[0,0,0]) {
    geo.rotateX(rotation[0]);geo.rotateY(rotation[1]);geo.rotateZ(rotation[2]);geo.translate(...position);batches[batch].push(geo.toNonIndexed());geo.dispose();
  }
  add(new THREE.BoxGeometry(1,2.35,.12),[0,1.48,0]);
  for(const x of [-.34,.34]) {
    add(new THREE.CylinderGeometry(.115,.115,1.25,16),[x,1.65,.12],1);
    for(const y of [1.04,1.34,1.94,2.24])add(new THREE.TorusGeometry(.13,.025,6,16),[x,y,.12],0,[Math.PI/2,0,0]);
    add(new THREE.BoxGeometry(.05,.9,.015),[x,1.65,.245],3);
  }
  for(const y of [.45,2.6])add(new THREE.BoxGeometry(.92,.15,.04),[0,y,.09],2);
  for(const x of [-.48,.48])add(new THREE.BoxGeometry(.035,2.3,.09),[x,1.48,.09],1);
  for(const y of [.7,2.4])add(new THREE.BoxGeometry(.78,.05,.055),[0,y,.16],1);
  for(let i=0;i<5;i++)add(new THREE.BoxGeometry(.07,.12,.02),[-.2+i*.1,.7,.2],3);
  batches.forEach((parts,i)=>{if(!parts.length)return;const geo=mergeGeometries(parts);parts.forEach(p=>p.dispose());root.add(new THREE.Mesh(geo,finishes[i]));});
  return root;
}
