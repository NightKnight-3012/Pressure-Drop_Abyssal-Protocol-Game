import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {EXTERIOR_STRUCTURES,EXTERIOR_ROUTES,EXTERIOR_BOUNDARY,EXT_LIMIT} from '../../shared/layout.js';
import {oceanHeight,createRockMaps} from './ocean.js';

// Static material batches keep the larger survey area inexpensive at every quality level.
export function createExplorationView(scene,surfaces={}){
  const root=new THREE.Group();root.name='NEREID exterior survey';scene.add(root);
  const maps=createRockMaps();
  const materials={rock:new THREE.MeshStandardMaterial({color:0x87958b,...maps,roughness:.96,vertexColors:true}),
    metal:new THREE.MeshStandardMaterial({color:0x52666b,roughness:.8,metalness:.6}),
    rust:new THREE.MeshStandardMaterial({color:0x826348,roughness:.9,metalness:.4,map:surfaces.metal?.clone()||null,normalMap:maps.normalMap}),
    glow:new THREE.MeshStandardMaterial({color:0xbad4c5,emissive:0x73978b,emissiveIntensity:.7}),
    fan:new THREE.MeshStandardMaterial({color:0x887f6a,roughness:1,side:THREE.DoubleSide}),
    net:new THREE.MeshBasicMaterial({color:0x809d9e,transparent:true,opacity:.24})};
  const groups=new Map(),transform=new THREE.Object3D();
  function keep(geo,key,pos=[0,0,0],rot=[0,0,0]){
    if(geo.index){const flat=geo.toNonIndexed();geo.dispose();geo=flat;}
    transform.position.set(...pos);transform.rotation.set(...rot);transform.updateMatrix();geo.applyMatrix4(transform.matrix);
    if(key==='rock'){
      const p=geo.attributes.position,colors=[];
      for(let i=0;i<p.count;i++){const shade=.76+.22*Math.abs(Math.sin(p.getX(i)*.8+p.getY(i)*1.7+p.getZ(i)*.3));colors.push(shade,shade,shade);}
      geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    }
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(geo);
  }
  const box=(w,h,d,x,y,z,key='metal')=>keep(new THREE.BoxGeometry(w,h,d),key,[x,y,z]);
  const cylinder=(r,h,x,y,z,key='metal')=>keep(new THREE.CylinderGeometry(r,r,h,8),key,[x,y,z]);
  for(const s of EXTERIOR_STRUCTURES){
    if(s.kind==='receiver')continue; // Existing survey dish fits this shared footprint.
    const floor=oceanHeight(s.cx,s.cz);
    const h=s.h-floor;
    if(s.kind==='rock'){
      const geo=new RoundedBoxGeometry(s.w,h,s.d,6,.55),positions=geo.attributes.position;
      for(let i=0;i<positions.count;i++){
        const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),u=y/h+.5;
        const erosion=.12+.68*THREE.MathUtils.smoothstep(floor+y+h/2,2.2,4);
        const cutX=Math.abs(Math.sin(y*1.9+z*.7+s.cx))*erosion*Math.pow(Math.abs(x)/(s.w/2),3);
        const cutZ=Math.abs(Math.cos(y*1.3+x*.9+s.cz))*erosion*Math.pow(Math.abs(z)/(s.d/2),3);
        positions.setXYZ(i,Math.sign(x)*Math.max(0,Math.abs(x)*(1-.08*u*u)-cutX),y+(Math.sin(x*1.7+z*.8)*.85+Math.cos(x*.7-z)*.4)*u,Math.sign(z)*Math.max(0,Math.abs(z)*(1-.06*u*u)-cutZ));
      }geo.computeVertexNormals();keep(geo,'rock',[s.cx,floor+h/2,s.cz]);
    }else{
      box(s.w,h,s.d,s.cx,floor+h/2,s.cz,'rust');
      box(s.w+.12,.18,s.d+.12,s.cx,s.h,s.cz,'metal');
    }
  }
  // Broken ship ribs and deck; entrances at both ends, wide baffle passages inside.
  box(11.4,.15,34,38,-.15,-1,'rust');
  for(let z=-16;z<=14;z+=6){
    const arch=new THREE.CatmullRomCurve3([[32.4,1.7],[32.8,3.3],[35,4.5],[38,4.9],[41,4.5],[43.2,3.3],[43.6,1.7]].map(([x,y])=>new THREE.Vector3(x,y,z)));
    keep(new THREE.TubeGeometry(arch,32,.13,6,false),'metal');
    box(.8,.05,.22,38,.03,z,'glow');
  }
  // Bare deep-water fans and vent chimneys, rather than sunlit kelp at 1,800m.
  for(let i=0;i<32;i++){
    const x=-27-(i%6)*4.5,z=-22+Math.floor(i/6)*9;
    if(Math.abs(z-5.5)<4||Math.abs(x+38)<3&&z<8)continue;
    const floor=oceanHeight(x,z),height=3.8+(i%4)*.7;
    cylinder(.07,height,x,floor+height/2,z,'fan');
    for(let j=0;j<7;j++){
      const side=j%2?1:-1,geo=new THREE.CylinderGeometry(.025,.045,2.6,5);
      keep(geo,'fan',[x+side*.65,floor+height*.35+j*.35,z],[0,0,side*-.7]);
    }
    if(i%5===0){cylinder(.4,2.7,x+1,floor+1.35,z,'rock');box(.14,.12,.14,x+1,floor+2.75,z,'glow');}
  }
  const signs=[];
  for(const route of EXTERIOR_ROUTES){
    for(let segment=1;segment<route.points.length;segment++){
      const a=route.points[segment-1],b=route.points[segment],distance=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(distance/6);
      for(let i=0;i<steps;i++){
        const t=i/steps,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
        // Mark beside the swimming line, never across it.
        const sideX=(b[1]-a[1])/distance*.8,sideZ=-(b[0]-a[0])/distance*.8;
        const floor=oceanHeight(x+sideX,z+sideZ);cylinder(.045,1.6-floor,x+sideX,(floor+1.6)/2,z+sideZ);cylinder(.07,.22,x+sideX,1.4,z+sideZ,'glow');
        // Protective foot and a second reflective band make the route readable from below.
        cylinder(.16,.12,x+sideX,floor+.06,z+sideZ);
        cylinder(.055,.10,x+sideX,.45,z+sideZ,'glow');
      }
    }
    const p=route.points[route.points.length-1],x=p[0]+.8,z=p[1],floor=oceanHeight(x,z);
    const previous=route.points[route.points.length-2];
    signs.push({text:route.label,x,z,yaw:Math.atan2(previous[0]-x,previous[1]-z)});cylinder(.055,2.05-floor,x,(floor+2.05)/2,z);
  }
  const boundarySigns=[{text:'SURVEY LIMIT / TURN BACK',x:0,z:59},{text:'SURVEY LIMIT / TURN BACK',x:0,z:-59},{text:'SURVEY LIMIT / TURN BACK',x:-59,z:0},{text:'SURVEY LIMIT / TURN BACK',x:59,z:0}];
  for(const p of boundarySigns){const floor=oceanHeight(p.x,p.z);cylinder(.055,2.05-floor,p.x,(floor+2.05)/2,p.z);}
  // Visible safety net matches the shared collision boundary: no unmarked map edge.
  for(const wall of EXTERIOR_BOUNDARY){
    const vertical=wall.w<wall.d;
    for(let n=-EXT_LIMIT;n<=EXT_LIMIT;n+=12){const x=vertical?wall.cx:n,z=vertical?n:wall.cz,floor=oceanHeight(x,z);cylinder(.075,3-floor,x,(floor+3)/2,z);cylinder(.1,.4,x,2.8,z,'glow');}
    for(let y=0;y<=3;y+=.5)box(wall.w, .018,wall.d,wall.cx,y,wall.cz,'net');
    for(let n=-EXT_LIMIT;n<=EXT_LIMIT;n+=2)box(vertical?.018:.012,3,vertical?.012:.018,vertical?wall.cx:n,1.5,vertical?n:wall.cz,'net');
  }
  for(const [key,geos] of groups){const mesh=new THREE.Mesh(mergeGeometries(geos),materials[key]);mesh.name=`Survey / ${key}`;root.add(mesh);geos.forEach(g=>g.dispose());}
  // Compact physically mounted route names and boundary wording, all in one atlas.
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const g=canvas.getContext('2d');
    const labels=[...signs,...boundarySigns];
    const geos=[];labels.forEach((p,i)=>{
      g.fillStyle='#07171b';g.fillRect(0,i*64,1024,64);g.fillStyle='#c7dbd5';g.font='bold 32px monospace';g.fillText(p.text,18,i*64+41,985);
      const geo=new THREE.PlaneGeometry(2.8,.175),uv=geo.attributes.uv;for(let j=0;j<uv.count;j++)uv.setY(j,1-(i+1)/8+uv.getY(j)/8);
      const yaw=p.yaw??Math.atan2(-p.x,-p.z);const mesh=new THREE.Mesh(geo);mesh.position.set(p.x,1.85,p.z);mesh.rotation.y=yaw;mesh.updateMatrix();geo.applyMatrix4(mesh.matrix);geos.push(geo);
    });
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mat=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});const mesh=new THREE.Mesh(mergeGeometries(geos),mat);root.add(mesh);geos.forEach(g=>g.dispose());
  }
  return {root,signs,dispose(){root.removeFromParent();const mats=new Set(),textures=new Set();root.traverse(o=>{o.geometry?.dispose();if(o.material)mats.add(o.material);});for(const m of mats){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}textures.forEach(t=>t.dispose());}};
}
