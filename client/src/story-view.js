import * as THREE from 'three';
import {oceanHeight} from '../../shared/ocean-floor.js';
import {LOGS} from '../../shared/story.js';
// Five static evidence terminals, three shared draws, no lights or shadows.
export function createStoryView(scene){
  const root=new THREE.Group();root.name='Evidence terminals';scene.add(root);
  const shell=new THREE.MeshStandardMaterial({color:0x645d4c,metalness:.6,roughness:.7});
  const screen=new THREE.MeshStandardMaterial({color:0x94b8b0,emissive:0x37685f,emissiveIntensity:.4});
  const body=new THREE.InstancedMesh(new THREE.BoxGeometry(.48,.55,.2),shell,5),face=new THREE.InstancedMesh(new THREE.BoxGeometry(.36,.25,.02),screen,5);
  const stand=new THREE.InstancedMesh(new THREE.CylinderGeometry(.055,.12,1,8),shell,5);
  root.add(body,face,stand);body.count=face.count=stand.count=0;let key='';const t=new THREE.Object3D();
  return {root,update(story){const next=JSON.stringify(story);if(next===key)return;key=next;const logs=LOGS.filter(l=>story?.available.includes(l.id)&&!story.found.includes(l.id));body.count=face.count=stand.count=logs.length;logs.forEach((l,i)=>{t.scale.set(1,1,1);t.position.set(l.x,.8,l.z);t.updateMatrix();body.setMatrixAt(i,t.matrix);t.position.z+=.111;t.position.y+=.08;t.updateMatrix();face.setMatrixAt(i,t.matrix);const ground=l.ext?oceanHeight(l.x,l.z):0,height=Math.max(.1,.525-ground);t.scale.set(1,height,1);t.position.set(l.x,.525-height/2,l.z);t.updateMatrix();stand.setMatrixAt(i,t.matrix);});body.instanceMatrix.needsUpdate=face.instanceMatrix.needsUpdate=stand.instanceMatrix.needsUpdate=true;},dispose(){root.removeFromParent();for(const mesh of [body,face,stand]){mesh.dispose?.();mesh.geometry.dispose();}shell.dispose();screen.dispose();}};
}
