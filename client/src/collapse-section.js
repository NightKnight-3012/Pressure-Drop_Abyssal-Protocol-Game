import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {collapseLabel} from '../../shared/escape-route.js';
// Deterministic progress drives essential motion even with reduced effects or reconnects.
export function collapsePose(ahead,reduced=false){
  const t=THREE.MathUtils.smoothstep(10-ahead,0,6);
  return {height:8*(1-t),roll:reduced?0:Math.sin(t*Math.PI)*.12,warning:ahead>=0&&ahead<=13};
}
// Three authored silhouettes replace the existing one-lane falling hazards.
// No particles, lights or geometry outside the original lane envelope.
export function createCollapseSection(material,warningMaterial,at){
  const root=new THREE.Group();root.name=collapseLabel(at);const batches=[[],[]];
  function put(geometry,x,y,z,rotation=0,batch=0){geometry.rotateZ(rotation);geometry.translate(x,y,z);const flat=geometry.index?geometry.toNonIndexed():geometry;batches[batch].push(flat);if(flat!==geometry)geometry.dispose();}
  const beam=(w,h,d,x,y,z,r=0,b=0)=>put(new THREE.BoxGeometry(w,h,d),x,y,z,r,b);
  if(at<70){
    // A severed hoist cage, bent ladder and cable drum.
    for(const side of [-1,1])beam(.18,4.4,.22,side*1.3,0,0,side*.07);
    for(let y=-1.8;y<=1.8;y+=.6)beam(2.6,.1,.16,0,y,.1,.04);
    const drum=new THREE.CylinderGeometry(.7,.7,1.6,14);drum.rotateZ(Math.PI/2);put(drum,0,.25,.4);
    beam(2.7,.25,.7,0,-2,0,.05,1);
  }else if(at<115){
    // A torn ship bulkhead, exposed ribs and an offset hatch reinforcement.
    const sheet=new THREE.Shape();sheet.moveTo(-1.35,-2.2);sheet.lineTo(1.15,-2.2);sheet.lineTo(1.5,-.9);sheet.lineTo(1.1,-.3);sheet.lineTo(1.4,1.9);sheet.lineTo(-.9,2.3);sheet.lineTo(-1.4,.5);sheet.closePath();
    put(new THREE.ExtrudeGeometry(sheet,{depth:.18,bevelEnabled:false}),0,0,0);
    for(const side of [-1,1])beam(.14,4,.4,side*1.05,0,.2,side*.08);
    beam(2.5,.2,.5,0,-1.1,.3,-.1,1);
  }else{
    // A snapped pipe manifold with three differently sheared conduits.
    for(let i=0;i<3;i++){const pipe=new THREE.CylinderGeometry(.3,.37,3.4+i*.3,10,1,true);put(pipe,(i-1)*.9,(i-1)*.15,.1,(i-1)*.09);}
    for(const y of [-1.1,1])beam(2.9,.2,.9,0,y,0,.02,1);
    beam(.18,4.5,.25,-1.35,0,-.2,.06);
  }
  batches.forEach((parts,i)=>{const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());root.add(new THREE.Mesh(geometry,i?warningMaterial:material));});
  return root;
}
