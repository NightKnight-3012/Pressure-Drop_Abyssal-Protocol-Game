// Local derivative of the installed CC0 crew rig; preserve all animation channels.
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const source=new URL('../client/public/models/Animated/reclaimer-rae.gltf',import.meta.url);
const g=JSON.parse(await readFile(source,'utf8'));
const original=Buffer.from(g.buffers[0].uri.split(',')[1],'base64'),chunks=[original];let length=original.length;
function append(array,type,componentType=5126) {
  const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}
  const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=g.bufferViews.length;
  g.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length});chunks.push(data);length+=data.length;
  const index=g.accessors.length,n={SCALAR:1,VEC3:3}[type];
  const accessor={bufferView:view,componentType,count:array.length/n,type};
  if(type==='VEC3') {accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++){const k=i%3;accessor.min[k]=Math.min(accessor.min[k],array[i]);accessor.max[k]=Math.max(accessor.max[k],array[i]);}}
  g.accessors.push(accessor);return index;
}
function accessor(i) {
  const a=g.accessors[i],v=g.bufferViews[a.bufferView],size={5126:4,5121:1,5123:2}[a.componentType],n={SCALAR:1,VEC3:3,VEC4:4}[a.type];
  return Array.from({length:a.count},(_,j)=>Array.from({length:n},(_,k)=>{const o=(v.byteOffset||0)+(a.byteOffset||0)+j*(v.byteStride||n*size)+k*size;return a.componentType===5126?original.readFloatLE(o):size===1?original[o]:original.readUInt16LE(o);}));
}
const primitive=g.meshes[0].primitives[0],pos=accessor(primitive.attributes.POSITION),joints=accessor(primitive.attributes.JOINTS_0),weights=accessor(primitive.attributes.WEIGHTS_0);
const headJoint=g.skins[0].joints.findIndex(i=>g.nodes[i].name==='Head');
const head=weights.map((w,i)=>w.reduce((sum,v,k)=>sum+(joints[i][k]===headJoint?v:0),0)>.35);
const indices=accessor(primitive.indices).flat(),kept=[];
for(let i=0;i<indices.length;i+=3)if(!indices.slice(i,i+3).some(v=>head[v]))kept.push(...indices.slice(i,i+3));
primitive.indices=append(new Uint16Array(kept),'SCALAR',5123);
primitive.attributes.POSITION=append(new Float32Array(pos.flatMap(([x,y,z],i)=>head[i]?[0,2.22,-.02]:Math.abs(x)>1.75?[Math.sign(x)*(1.75+(Math.abs(x)-1.75)*.65),1.82+(y-1.82)*.72,-.1+(z+.1)*.72]:[x,y,z])),'VEC3');
const colors=pos.flatMap(([x,y,z])=>{
  const dark=y<.25 || Math.abs(x)>1.75,trim=y>.75&&y<.9 || y>1.62&&y<1.72;
  const color=new THREE.Color(dark?0x17262b:trim?0x89918a:0x566660);
  const wear=.88+.12*Math.sin(x*31+y*43+z*17)**2;color.multiplyScalar(wear);return color.toArray();
});
primitive.attributes.COLOR_0=append(new Float32Array(colors),'VEC3');
g.materials=[{name:'NEREID / pressure suit',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:.22,roughnessFactor:.67}}];
primitive.material=0;
// Remove the carried pistol. The game is about maintenance and survival.
for(const n of g.nodes)if(n.name==='Pistol')delete n.mesh;
const parts=[];
function part(geo,color,position,scale=[1,1,1]) {
  geo=geo.index?geo.toNonIndexed():geo;geo.scale(...scale);geo.translate(...position);
  const values=new Float32Array(geo.attributes.position.count*3),c=new THREE.Color(color);
  for(let i=0;i<values.length;i+=3)values.set(c.toArray(),i);
  geo.setAttribute('color',new THREE.BufferAttribute(values,3));geo.deleteAttribute('uv');parts.push(geo);
}
part(new THREE.SphereGeometry(.34,20,14),0x87938d,[0,2.22,-.02],[1,1.1,1]);
part(new THREE.SphereGeometry(.345,20,12,0,Math.PI*2,0,Math.PI),0x132c34,[0,2.25,.09],[.83,.62,.9]);
part(new THREE.CylinderGeometry(.29,.34,.13,16),0x303f43,[0,1.94,-.04]);
for(const x of [-.34,.34])part(new THREE.CylinderGeometry(.1,.1,.09,12).rotateZ(Math.PI/2),0x35464b,[x,2.23,-.02]);
part(new THREE.BoxGeometry(.19,.035,.025),0xc3d4c5,[0,2.4,.36]);
const helmet=mergeGeometries(parts),hp=helmet.attributes.position;
// Convert mesh-space helmet into Head bone space, so head motion remains natural.
const objects=g.nodes.map(n=>{const o=new THREE.Object3D();if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);if(n.matrix)o.applyMatrix4(new THREE.Matrix4().fromArray(n.matrix));return o;});
g.nodes.forEach((n,i)=>n.children?.forEach(c=>objects[i].add(objects[c])));
const root=new THREE.Group();g.scenes[g.scene||0].nodes.forEach(i=>root.add(objects[i]));root.updateMatrixWorld(true);
const headIndex=g.nodes.findIndex(n=>n.name==='Head'),meshIndex=g.nodes.findIndex(n=>n.skin===0);
helmet.applyMatrix4(new THREE.Matrix4().copy(objects[headIndex].matrixWorld).invert().multiply(objects[meshIndex].matrixWorld));
const helmetMesh=g.meshes.length;g.meshes.push({name:'Sealed pressure helmet',primitives:[{attributes:{POSITION:append(hp.array,'VEC3'),NORMAL:append(helmet.attributes.normal.array,'VEC3'),COLOR_0:append(helmet.attributes.color.array,'VEC3')},material:0}]});
const node=g.nodes.length;g.nodes.push({name:'NEREID sealed helmet',mesh:helmetMesh});(g.nodes[headIndex].children??=[]).push(node);
g.nodes[meshIndex].name='NEREID pressure technician';g.asset.extras={...g.asset.extras,derivative:'Local sealed diver adaptation of the installed CC0 Reclaimer Rae rig. See ASSETS.md.'};
g.buffers[0]={uri:'data:application/octet-stream;base64,'+Buffer.concat(chunks).toString('base64'),byteLength:length};
// No image requests or cartoon atlas in the derivative.
delete g.images;delete g.textures;delete g.samplers;
await writeFile(new URL('../client/public/models/Animated/nereid-diver.gltf',import.meta.url),JSON.stringify(g));
console.log(`Prepared sealed diver: ${kept.length/3} body triangles; animated helmet; no atlas or weapon.`);
