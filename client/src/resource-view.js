import * as THREE from 'three';
import {oceanHeight} from './ocean.js';

const MAX=12;
// Moored emergency canisters: six shared draws, no lights, shadows or per-frame animation.
export function createResourceView(scene) {
  const root=new THREE.Group();root.name='Exterior emergency supplies';scene.add(root);
  const metal=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.65,metalness:.45});
  const dark=new THREE.MeshStandardMaterial({color:0x26343a,roughness:.8,metalness:.3});
  const silver=new THREE.MeshStandardMaterial({color:0xb5c4be,roughness:.45,metalness:.65});
  const marker=new THREE.MeshStandardMaterial({color:0xd6dfcc,emissive:0x9bab8e,emissiveIntensity:.65,roughness:.6});
  const cylinder=new THREE.CylinderGeometry(.22,.22,1,12);cylinder.rotateZ(Math.PI/2);
  const batch=(geometry,material,count)=>{const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.count=0;mesh.frustumCulled=false;root.add(mesh);return mesh;};
  const body=batch(cylinder,metal,MAX),caps=batch(cylinder.clone(),dark,MAX*2);
  const handle=batch(new THREE.TorusGeometry(.14,.025,6,12),silver,MAX);
  const cable=batch(new THREE.CylinderGeometry(.009,.009,1,5),dark,MAX);
  const anchor=batch(new THREE.CylinderGeometry(.2,.24,.1,8),dark,MAX);
  const stripe=batch(new THREE.BoxGeometry(.4,.025,.055),marker,MAX);
  const transform=new THREE.Object3D(),color=new THREE.Color();let key='';
  const put=(mesh,i,x,y,z,sx=1,sy=1,sz=1)=>{transform.position.set(x,y,z);transform.rotation.set(0,0,0);transform.scale.set(sx,sy,sz);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);};
  return {
    root,
    update(resources=[]) {
      const next=JSON.stringify(resources);if(key===next)return;key=next;
      const list=resources.slice(0,MAX);
      body.count=handle.count=cable.count=anchor.count=stripe.count=list.length;caps.count=list.length*2;
      list.forEach((r,i)=>{
        const length=r.item==='regulator'?1.4:r.item==='flare'?1.05:r.item==='decoy'?.55:.85,diameter=r.item==='regulator'?1.4:r.item==='flare'?.62:r.item==='decoy'?1.2:1;
        const y=.38,floor=oceanHeight(r.x,r.z);
        put(body,i,r.x,y,r.z,length,diameter,diameter);body.setColorAt(i,color.setHex(r.item==='regulator'?0xc5aa68:r.item==='repair'?0xa58b60:r.item==='flare'?0x9c6444:0x67818a));
        for(let end=0;end<2;end++)put(caps,i*2+end,r.x+(end?1:-1)*length*.45,y,r.z,.065,diameter*1.08,diameter*1.08);
        put(handle,i,r.x,y+.22*diameter+.08,r.z,.9,.6,1);
        const bottom=y-.22*diameter;put(cable,i,r.x,(floor+bottom)/2,r.z,1,bottom-floor,1);
        put(anchor,i,r.x,floor+.05,r.z);put(stripe,i,r.x,y+.22*diameter+.01,r.z,length,1,1);
      });
      for(const mesh of root.children)mesh.instanceMatrix.needsUpdate=true;
      if(body.instanceColor)body.instanceColor.needsUpdate=true;
    },
    dispose() {root.removeFromParent();for(const mesh of root.children){mesh.dispose();mesh.geometry.dispose();}for(const material of [metal,dark,silver,marker])material.dispose();}
  };
}
