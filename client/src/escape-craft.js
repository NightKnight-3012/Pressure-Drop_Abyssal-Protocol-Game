import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Original rescue submersible. Forward is +Z, with the pressure hull at origin.
export function createEscapeCraft({ compact = false } = {}) {
  const root = new THREE.Group(); root.name = compact ? "MANTA / maintenance lifeboat" : "MANTA-07 / rescue transfer craft";
  const materials = {
    hull: new THREE.MeshStandardMaterial({ color:0x18323f, roughness:0.43, metalness:0.45 }),
    armor: new THREE.MeshStandardMaterial({ color:0xc7cec6, roughness:0.48, metalness:0.26 }),
    orange: new THREE.MeshStandardMaterial({ color:0xd66a2d, roughness:0.5, metalness:0.24 }),
    metal: new THREE.MeshStandardMaterial({ color:0x526773, roughness:0.34, metalness:0.72 }),
    rubber: new THREE.MeshStandardMaterial({ color:0x0c151c, roughness:0.86 }),
    glass: new THREE.MeshPhysicalMaterial({ color:0x102d3b, roughness:0.14, metalness:0.28, clearcoat:0.85, emissive:0x08232b, emissiveIntensity:0.45, side:THREE.DoubleSide }),
    lamps: new THREE.MeshStandardMaterial({ color:0xffebc1, emissive:0xffcf84, emissiveIntensity:1.7 }),
    red: new THREE.MeshBasicMaterial({ color:0xe8674a }),
    green: new THREE.MeshBasicMaterial({ color:0x7ce3bf })
  };
  function add(geometry, material, x=0,y=0,z=0) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x,y,z); root.add(mesh); return mesh;
  }
  function box(w,h,d,x,y,z,material=materials.metal) {
    return add(new RoundedBoxGeometry(w,h,d,2,Math.min(0.09,w/4,h/4,d/4)),material,x,y,z);
  }
  function bar(a,b,r=0.045,material=materials.metal) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), dir = to.clone().sub(from);
    const mesh = add(new THREE.CylinderGeometry(r,r,dir.length(),6),material);
    mesh.position.copy(from.add(to).multiplyScalar(0.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()); return mesh;
  }
  function ring(radius,tube,x,y,z,material=materials.metal) { return add(new THREE.TorusGeometry(radius,tube,8,24),material,x,y,z); }
  const profile = [[0,-3.25],[0.55,-3.15],[1.1,-2.8],[1.43,-1.9],[1.52,-0.4],[1.46,1],[1.18,2.25],[0.68,3.1],[0,3.7]].map(([r,z])=>new THREE.Vector2(r,z));
  const hull = add(new THREE.LatheGeometry(profile,32),materials.hull); hull.rotation.x=Math.PI/2; hull.scale.set(1.05,1,0.77);
  const armor = add(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(p.x*1.018,p.y)),32,Math.PI/2,Math.PI),materials.armor);
  armor.rotation.x=Math.PI/2; armor.scale.copy(hull.scale);
  // Glazed brow and raked windscreen: visible planes and mullions, not a glowing dot.
  const L=[-1.08,1.18,0.45], R=[1.08,1.18,0.45], TL=[-0.68,1.62,1.15], TR=[0.68,1.62,1.15];
  const FL=[-0.92,1.12,2.35], FR=[0.92,1.12,2.35], BL=[-0.78,0.56,3.2], BR=[0.78,0.56,3.2];
  const SL=[-1.3,0.48,0.7], SR=[1.3,0.48,0.7], ML=[-1.16,0.35,2.1], MR=[1.16,0.35,2.1];
  function pane(points) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(points.flat(),3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
    geometry.setIndex([0,1,2,0,2,3]); geometry.computeVertexNormals(); add(geometry,materials.glass);
  }
  pane([TL,TR,FR,FL]); pane([FL,FR,BR,BL]); pane([L,TL,FL,ML]); pane([R,MR,FR,TR]);
  pane([L,ML,SL,[-1.1,0.5,-0.05]]); pane([R,[1.1,0.5,-0.05],SR,MR]);
  for(const [a,b] of [[L,TL],[R,TR],[TL,TR],[FL,FR],[FL,BL],[FR,BR],[BL,BR],[L,SL],[R,SR],[SL,ML],[SR,MR],[ML,BL],[MR,BR]]) bar(a,b,0.045);
  bar([0,1.62,1.15],[0,1.12,2.35],0.035); bar([0,1.12,2.35],[0,0.56,3.2],0.035);
  // Rescue side armor, pressure ribs, recessed service seams and lifting hardpoints.
  for(const side of [-1,1]) {
    box(0.18,0.46,2.7,side*1.48,-0.12,-0.55,materials.orange);
    box(0.025,0.045,2.5,side*1.585,0.06,-0.55,materials.armor);
    for(const z of [-2,-1.1,-0.2]) box(0.12,0.58,0.09,side*1.51,-0.13,z);
    box(0.3,0.12,3.5,side*1.08,-1.18,-0.2,materials.rubber);
    for(const z of [-1.5,1.1]) bar([side*0.95,-0.65,z],[side*1.08,-1.12,z],0.085);
    box(0.35,0.12,3.7,side*1.08,-1.31,-0.2);
    const eye=ring(0.14,0.048,side*0.7,1.13,-1.35); eye.rotation.y=Math.PI/2;
    box(0.34,0.12,0.35,side*0.7,1.03,-1.35);
    const nav = add(new THREE.SphereGeometry(0.07,8,6),side<0?materials.red:materials.green,side*1.65,0.2,0.1);
    nav.scale.z=2;
    const light = box(0.29,0.16,0.09,side*0.83,-0.07,2.94,materials.lamps); light.rotation.y=side*0.25;
  }
  bar([-0.7,1.25,-1.35],[0,1.5,-1.35],0.025); bar([0.7,1.25,-1.35],[0,1.5,-1.35],0.025);
  const hatch=add(new THREE.CylinderGeometry(0.48,0.48,0.12,24),materials.metal,0,1.12,-0.82);
  const hatchRim=ring(0.39,0.065,0,1.2,-0.82,materials.orange); hatchRim.rotation.x=-Math.PI/2;
  bar([-0.21,1.28,-0.82],[0.21,1.28,-0.82],0.04); bar([0,1.28,-1.03],[0,1.28,-0.61],0.04);
  box(0.78,0.13,1.1,0,1.04,-2.02,materials.armor);
  for(let i=0;i<6;i++) box(0.54,0.035,0.055,0,1.12,-2.42+i*0.14,materials.rubber);
  // Two guarded electric propulsors with recessed moving impellers.
  const rotors=[], glows=[];
  for(const side of [-1,1]) {
    const x=side*(compact?1.65:1.9);
    box(0.85,0.17,1.1,side*1.5,-0.25,-1.65,materials.armor);
    const shroud=add(new THREE.CylinderGeometry(0.52,0.49,1.45,24,1,true),materials.orange,x,-0.15,-1.85); shroud.rotation.x=Math.PI/2;
    ring(0.44,0.085,x,-0.15,-2.6); ring(0.43,0.07,x,-0.15,-1.12);
    const inner=add(new THREE.CylinderGeometry(0.37,0.37,0.7,20,1,true),materials.rubber,x,-0.15,-2.2); inner.rotation.x=Math.PI/2;
    const rotor=new THREE.Group(); rotor.position.set(x,-0.15,-2.43); root.add(rotor); rotors.push(rotor);
    for(let i=0;i<4;i++) {
      const blade=new THREE.Mesh(new THREE.BoxGeometry(0.33,0.065,0.05),materials.metal);
      const angle=i*Math.PI/2; blade.position.set(Math.cos(angle)*0.19,Math.sin(angle)*0.19,0); blade.rotation.z=angle+0.25; rotor.add(blade);
    }
    const glow=add(new THREE.CircleGeometry(0.29,20),new THREE.MeshBasicMaterial({color:0x5cb5c2,transparent:true,opacity:0.16,side:THREE.DoubleSide,depthWrite:false}),x,-0.15,-2.32);
    glow.userData.moving=true; glows.push(glow);
    const fin=box(compact?0.34:0.75,0.075,0.75,x+side*0.3,-0.15,-1.7,materials.hull); fin.rotation.z=-side*0.12;
  }
  // Side rescue flashes and a segmented ceramic nose guard.
  for(const side of [-1,1]) for(let i=0;i<3;i++) {
    const stripe=box(0.18,0.045,0.5,side*(0.7+i*0.18),0.55-i*0.12,2.45-i*0.23,materials.orange); stripe.rotation.z=-side*0.32;
  }
  if(typeof document!=="undefined") {
    const canvas=document.createElement("canvas"); canvas.width=512; canvas.height=128;
    const context=canvas.getContext("2d");
    if(context) {
      context.fillStyle="#c9d4ce"; context.font="bold 54px monospace"; context.textAlign="center"; context.fillText(compact?"MANTA / AUX":"MANTA / 07",256,60);
      context.font="19px monospace"; context.fillStyle="#e6a364"; context.fillText("NEREID RESCUE SYSTEMS",256,100);
      const map=new THREE.CanvasTexture(canvas); map.colorSpace=THREE.SRGBColorSpace;
      const decal=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,side:THREE.DoubleSide});
      for(const side of [-1,1]) { const sign=add(new THREE.PlaneGeometry(1.55,0.39),decal,side*1.6,-0.08,-0.55); sign.rotation.y=side*Math.PI/2; }
    }
  }
  // Merge static surfaces by finish; details do not turn into dozens of draws.
  const groups=new Map();
  for(const mesh of [...root.children]) if(mesh.isMesh&&!mesh.userData.moving) {
    mesh.updateMatrix(); const transformed=mesh.geometry.clone().applyMatrix4(mesh.matrix);
    const geometry=transformed.index?transformed.toNonIndexed():transformed;
    if(geometry!==transformed) transformed.dispose();
    if(!groups.has(mesh.material)) groups.set(mesh.material,[]); groups.get(mesh.material).push(geometry);
    mesh.geometry.dispose(); root.remove(mesh);
  }
  for(const [material,geometries] of groups) {
    const geometry=mergeGeometries(geometries); geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,material); mesh.name=`Craft / ${Object.keys(materials).find(k=>materials[k]===material)||"livery"}`; root.add(mesh);
  }
  return { root,
    update(dt,{powered=false,reduced=false}={}) {
      if(!reduced) rotors.forEach((r,i)=>{ r.rotation.z+=Math.min(0.1,dt)*(powered?5:0.25)*(i?1:-1); });
      glows.forEach(g=>{g.material.opacity=powered?0.35:0.08;});
    }
  };
}

export function fitEscapeCraft(craft, dimensions, yaw=0) {
  craft.root.rotation.y=yaw; craft.root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(craft.root), size=bounds.getSize(new THREE.Vector3());
  const scale=Math.min(dimensions[0]/size.x,dimensions[1]/size.y,dimensions[2]/size.z);
  const wrapper=new THREE.Group(); wrapper.add(craft.root); wrapper.scale.setScalar(scale);
  craft.root.position.set(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2);
  return wrapper;
}
