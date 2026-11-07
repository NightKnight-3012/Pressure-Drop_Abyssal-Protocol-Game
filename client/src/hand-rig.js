import * as THREE from 'three';

const Y=new THREE.Vector3(0,1,0);
// Fixed-length two-bone IK. A pole chooses the elbow bend without changing the wrist target.
export function solveArm(shoulder,target,pole,upper=.46,lower=.46){
  const axis=target.clone().sub(shoulder),distance=axis.length();
  if(!Number.isFinite(distance)||distance<1e-5||distance>upper+lower-1e-4)return null;
  axis.divideScalar(distance);
  const bend=pole.clone().sub(shoulder);bend.addScaledVector(axis,-bend.dot(axis));
  if(bend.lengthSq()<1e-8)bend.copy(Y).addScaledVector(axis,-axis.y);
  if(bend.lengthSq()<1e-8)bend.set(1,0,0);bend.normalize();
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  return shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
}
export function cameraContact(surface,camera){
  if(!surface?.point||!surface?.normal||![...surface.point.toArray(),...surface.normal.toArray()].every(Number.isFinite))return null;
  camera.updateMatrixWorld(true);
  const point=surface.point.clone().applyMatrix4(camera.matrixWorldInverse),normal=surface.normal.clone().transformDirection(camera.matrixWorldInverse);
  if(point.z>=-.1||normal.lengthSq()<.9)return null;
  const low=surface.normal.y>.75&&surface.point.y<camera.position.y-.75;
  const shoulders=[-1,1].map(side=>new THREE.Vector3(side*.23,low?-.88:-.26,.06).applyAxisAngle(Y,camera.rotation.y).add(camera.position).applyMatrix4(camera.matrixWorldInverse));
  return {point,normal,fov:camera.fov,low,shoulders};
}
export function surfaceFrame(normal){
  const up=Math.abs(normal.y)>.95?new THREE.Vector3(0,0,-1):Y.clone();
  up.addScaledVector(normal,-up.dot(normal)).normalize();
  const right=new THREE.Vector3().crossVectors(up,normal).normalize();
  const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,normal));
  const brace=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,normal,up.clone().negate()));
  return {right,up,rotation,brace};
}

// Four three-joint fingers and a two-joint opposable thumb, mirrored per glove.
// All 28 moving segments share one instanced draw.
export function createFingerRig(root,material,geometries){
  const geometry=new THREE.SphereGeometry(1,8,6);geometries.push(geometry);
  const mesh=new THREE.InstancedMesh(geometry,material,28);mesh.frustumCulled=false;mesh.name='Articulated glove segments';root.add(mesh);
  const segments=[],hands=[],dummy=new THREE.Object3D(),inverse=new THREE.Matrix4();
  function attach(hand,side){
    const fingers=[];
    for(let finger=0;finger<5;finger++){
      const thumb=finger===4,length=thumb?.067:[.068,.082,.077,.057][finger],joints=[];
      let parent=hand;
      for(let joint=0;joint<(thumb?2:3);joint++){
        const bone=new THREE.Group();parent.add(bone);
        if(!joint){bone.position.set(thumb?-side*.058:(finger-1.5)*.031,thumb?0:.01,thumb?-.052:-.115);if(thumb)bone.rotation.y=-side*.65;}
        else bone.position.z=-length/(thumb?2:3);
        const extent=length/(thumb?2:3),radius=thumb?.019:.0145;
        segments.push({bone,extent,radius});joints.push(bone);parent=bone;
      }
      fingers.push({joints,thumb,length});
    }
    const rig={hand,side,fingers};hands.push(rig);return rig;
  }
  function curl(rig,kind,time,reduced){
    rig.fingers.forEach((finger,i)=>{
      const gripping=['repair','weld','valve'].includes(kind);
      const base=gripping?(rig.side===1?.78:.48):kind==='controls'?(i===0?.04:.72):kind==='reach'?.20:.35;
      const motion=reduced?0:Math.sin(time*4+i*.7)*(kind==='treat'?.12:kind==='reach'?.07:.025);
      finger.joints.forEach((joint,j)=>{joint.rotation.x=-THREE.MathUtils.clamp(base+[.04,-.035,.02,.10,.08][i]+motion,0,1.15)*(j?1:.65);});
    });
  }
  function tip(rig,index=0){
    const finger=rig.fingers[index],bone=finger.joints.at(-1);
    rig.hand.updateWorldMatrix(true,true);
    const point=bone.localToWorld(new THREE.Vector3(0,0,-finger.length/finger.joints.length-.008));
    return rig.hand.worldToLocal(point);
  }
  function update(){
    root.updateWorldMatrix(true,true);inverse.copy(root.matrixWorld).invert();
    segments.forEach(({bone,extent,radius},i)=>{
      dummy.position.set(0,0,-extent*.5);dummy.quaternion.identity();dummy.scale.set(radius,radius,extent*.5+.006);dummy.updateMatrix();
      mesh.setMatrixAt(i,new THREE.Matrix4().multiplyMatrices(inverse,bone.matrixWorld).multiply(dummy.matrix));
    });mesh.instanceMatrix.needsUpdate=true;
  }
  return {mesh,attach,curl,tip,update};
}
