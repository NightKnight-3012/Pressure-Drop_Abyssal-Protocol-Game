import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SUB_BOARD,SUB_DOCK,SUB_TUNING} from '../../shared/submersible.js';
export function createSubView(scene){
  const root=new THREE.Group();root.name='SKIFF-2 survey sub';root.position.set(SUB_DOCK.x,SUB_TUNING.bodyY,SUB_DOCK.z);scene.add(root);
  const shell=new THREE.MeshStandardMaterial({color:0x747e78,roughness:.55,metalness:.65}),dark=new THREE.MeshStandardMaterial({color:0x172c32,roughness:.65,metalness:.5}),glass=new THREE.MeshStandardMaterial({color:0x7dadae,transparent:true,opacity:.08,roughness:.2,metalness:.2,depthWrite:false,side:THREE.DoubleSide}),stripe=new THREE.MeshStandardMaterial({color:0xd2b16b,emissive:0x5a4821,emissiveIntensity:.15});
  const mesh=(geometry,mat,x,y,z)=>{const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);root.add(m);return m;};
  mesh(new RoundedBoxGeometry(1.9,1.1,3.2,3,.25),shell,0,-.4,0);
  const canopy=mesh(new THREE.SphereGeometry(1,18,12),glass,0,.65,-.35);canopy.scale.set(1.03,.95,1.5);
  for(const side of [-1,1]){
    mesh(new RoundedBoxGeometry(.2,.25,3.7,2,.07),dark,side*1.03,-.15,0);
    mesh(new THREE.BoxGeometry(.08,.06,2.5),stripe,side*.98,.05,0);
    const engine=mesh(new THREE.CylinderGeometry(.27,.32,.7,12),dark,side*.65,-.2,1.7);engine.rotation.x=Math.PI/2;
    mesh(new RoundedBoxGeometry(.65,.7,.18,2,.06),dark,side*.4,.35,.55);
  }
  mesh(new RoundedBoxGeometry(1.4,.16,.45,2,.06),dark,0,.95,-.85);
  for(let i=0;i<3;i++)mesh(new THREE.BoxGeometry(.24,.025,.2),stripe,(i-1)*.38,1.04,-.85);
  const arch=new THREE.CatmullRomCurve3([new THREE.Vector3(-.95,.7,-.9),new THREE.Vector3(-.7,1.28,-.9),new THREE.Vector3(0,1.5,-.9),new THREE.Vector3(.7,1.28,-.9),new THREE.Vector3(.95,.7,-.9)]);
  mesh(new THREE.TubeGeometry(arch,24,.035,5,false),dark,0,0,0);
  const helmets=[-1,1].map(side=>mesh(new THREE.SphereGeometry(.2,10,8),dark,side*.4,1.15,.28));
  for(const material of [shell,dark,stripe]){const list=root.children.filter(m=>m.material===material&&!helmets.includes(m)),parts=list.map(m=>{m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();return g.applyMatrix4(m.matrix);});const merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());for(const m of list){root.remove(m);m.geometry.dispose();}root.add(new THREE.Mesh(merged,material));}
  const boardMat=new THREE.MeshStandardMaterial({color:0x688b8b,emissive:0x274c4b,emissiveIntensity:.4});
  const board=new THREE.Mesh(new THREE.BoxGeometry(.1,.55,.45),boardMat);board.position.set(-9.55,1.2,SUB_BOARD.z);scene.add(board);
  let label=null,labelTexture=null;
  if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;const g=canvas.getContext('2d');if(g){g.fillStyle='#092027';g.fillRect(0,0,512,160);g.strokeStyle='#9fbdb3';g.lineWidth=8;g.strokeRect(4,4,504,152);g.fillStyle='#dae8df';g.font='bold 44px monospace';g.textAlign='center';g.fillText('SKIFF-2',256,65);g.font='30px monospace';g.fillText('SURVEY / TWO SEATS',256,120);labelTexture=new THREE.CanvasTexture(canvas);labelTexture.colorSpace=THREE.SRGBColorSpace;label=new THREE.Mesh(new THREE.PlaneGeometry(.48,.15),new THREE.MeshBasicMaterial({map:labelTexture}));label.position.set(-9.49,1.3,SUB_BOARD.z);label.rotation.y=Math.PI/2;scene.add(label);}}
  const dockMat=new THREE.MeshBasicMaterial({color:0x7eaaa4,transparent:true,opacity:.6});const dock=new THREE.Mesh(new THREE.RingGeometry(1.8,1.9,32),dockMat);dock.rotation.x=-Math.PI/2;dock.position.set(SUB_DOCK.x,-.34,SUB_DOCK.z);scene.add(dock);
  let placed=false;
  return {root,update(sub,dt=0,self=null){if(!sub){root.visible=false;return;}root.visible=sub.hull>0;const k=placed?1-Math.exp(-12*dt):1;placed=true;root.position.x+=(sub.x-root.position.x)*k;root.position.z+=(sub.z-root.position.z)*k;root.rotation.y+=Math.atan2(Math.sin(sub.yaw-root.rotation.y),Math.cos(sub.yaw-root.rotation.y))*k;helmets[0].visible=!!sub.driver&&sub.driver!==self;helmets[1].visible=!!sub.passenger&&sub.passenger!==self;boardMat.emissiveIntensity=sub.docked&&sub.hull>0?.4:.05;},dispose(){root.removeFromParent();for(const m of root.children)m.geometry.dispose();for(const material of [shell,dark,glass,stripe])material.dispose();for(const m of [board,dock,label].filter(Boolean)){m.removeFromParent();m.geometry.dispose();m.material.dispose();}labelTexture?.dispose();}};
}
