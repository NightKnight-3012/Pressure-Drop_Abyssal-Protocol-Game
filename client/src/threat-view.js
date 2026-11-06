import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CIRCUITS} from '../../shared/fieldwork.js';
export function createThreatView(scene){
  const root=new THREE.Group();root.name='Counterable hazards';scene.add(root);
  const metal=new THREE.MeshStandardMaterial({color:0x544e40,roughness:.8,metalness:.5}),pale=new THREE.MeshStandardMaterial({color:0x5c746f,roughness:.75,metalness:.2}),warning=new THREE.MeshStandardMaterial({color:0xb5b995,emissive:0x6d7960,emissiveIntensity:.6});
  const batch=(geometry,material,n)=>{const mesh=new THREE.InstancedMesh(geometry,material,n);mesh.count=0;mesh.frustumCulled=false;root.add(mesh);return mesh;};
  const switches=batch(new THREE.BoxGeometry(.4,.08,.4),metal,4),switchFaces=batch(new THREE.BoxGeometry(.27,.02,.27),warning,4);
  const mine=batch(new THREE.IcosahedronGeometry(.55,1),metal,3),mineRings=batch(new THREE.TorusGeometry(.65,.035,5,16),warning,3);
  const parts=[],transform=new THREE.Object3D();
  const part=(geo,x,y,z,sx,sy,sz,rz=0)=>{transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.rotation.set(0,0,rz);transform.updateMatrix();const g=geo.index?geo.toNonIndexed():geo.clone();g.applyMatrix4(transform.matrix);parts.push(g);geo.dispose();};
  part(new THREE.SphereGeometry(1,8,6),0,.2,0,.35,.16,.22);
  for(const side of [-1,1])for(let i=0;i<3;i++)part(new THREE.CylinderGeometry(.025,.025,1,4),side*.38,.13,(i-1)*.17,1,.45,1,side*1.2);
  const skitterGeo=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());parts.length=0;
  const skitters=batch(skitterGeo,pale,3);
  part(new THREE.SphereGeometry(1,12,8),0,0,0,1.3,.45,4);
  for(const side of [-1,1])part(new THREE.ConeGeometry(2.3,6,3),side*3,0,0,.15,1,1,side*Math.PI/2);
  const tail=new THREE.ConeGeometry(.4,9,5);tail.rotateX(Math.PI/2);part(tail,0,0,6,1,1,1);
  const wardenGeo=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  const warden=new THREE.Mesh(wardenGeo,pale);warden.visible=false;root.add(warden);
  const spark=batch(new THREE.OctahedronGeometry(.18),warning,1);let circuitKey='';
  const put=(mesh,i,x,y,z,rz=0)=>{transform.position.set(x,y,z);transform.rotation.set(0,0,rz);transform.scale.set(1,1,1);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);};
  return {root,update(state,viewer){
    const h=state.threats;if(!h)return;const t=state.t;
    const key=JSON.stringify(state.roomCircuits);if(key!==circuitKey){circuitKey=key;switches.count=switchFaces.count=4;Object.values(CIRCUITS).forEach((p,i)=>{put(switches,i,p.x,.04,p.z);put(switchFaces,i,p.x,.09,p.z);switchFaces.setColorAt(i,new THREE.Color(state.roomCircuits[p.room]?0xc5d2b7:0x2e4c57));});switches.instanceMatrix.needsUpdate=switchFaces.instanceMatrix.needsUpdate=true;if(switchFaces.instanceColor)switchFaces.instanceColor.needsUpdate=true;}
    const active=h.mines.filter(m=>m.active);mine.count=mineRings.count=active.length;active.forEach((m,i)=>{put(mine,i,m.x,.9,m.z);put(mineRings,i,m.x,.9,m.z);});mine.instanceMatrix.needsUpdate=mineRings.instanceMatrix.needsUpdate=true;
    skitters.count=h.skitters.length;h.skitters.forEach((s,i)=>put(skitters,i,s.x,.04,s.z));skitters.instanceMatrix.needsUpdate=true;
    warden.visible=!!h.warden;if(h.warden){warden.position.set(h.warden.x,12,h.warden.z);warden.rotation.y=Math.atan2(h.warden.x,h.warden.z);}
    spark.count=h.electric&&state.roomCircuits[h.electric.room]?1:0;if(spark.count){const p=CIRCUITS[h.electric.room];put(spark,0,p.x,.3,p.z);spark.instanceMatrix.needsUpdate=true;}
  },dispose(){root.removeFromParent();for(const m of root.children){m.dispose?.();m.geometry.dispose();}for(const mat of [metal,pale,warning])mat.dispose();}};
}
