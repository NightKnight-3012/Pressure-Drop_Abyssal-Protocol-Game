import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CRATES, ROOMS, ROOM_IDS, WINDOWS, WINDOW_W, WINDOW_Y0, WINDOW_Y1 } from "../../shared/layout.js";

// These are visual replacements inside existing solid footprints, not new obstacles.
export const STATION_FURNITURE = ["survey-recorder", "tool-locker", "medical-storage", "treatment-cot", "power-bus"];
export const ROOM_LIGHT_COLORS = [0x8bcbd3,0xe0b97e,0xb3d5c7,0xd2be9c,0x9ac4cc];

function atlasTexture() {
  if(typeof document==="undefined") return null;
  const canvas=document.createElement("canvas");canvas.width=canvas.height=1024;
  const g=canvas.getContext("2d");if(!g)return null;
  const rows=[
    ["NEREID-9 / ACOUSTIC SURVEY", "FRACTURE RETURN / CHANNEL 02 / 06:14", "#9cd1d6"],
    ["01 / CONTROL", "SURVEY RECORDS  /  EMERGENCY COMMS", "#9cd1d6"],
    ["02 / ENGINEERING", "POWER DISTRIBUTION  /  PUMP SERVICES", "#e7bd7f"],
    ["03 / MEDICAL", "TREATMENT  /  LIFE SUPPORT  /  EVA", "#b3dfc6"],
    ["04 / TRANSFER BAY", "MANTA-07  /  RIDGE RECOVERY ROUTE", "#e5c493"],
    ["MAIN LIFT / CABLE SEVERED", "AUXILIARY CRADLE IN BASALT RIDGE / ASTERION UPLINK", "#e7bd7f"],
    ["06:17 / IMPACT RECORD", "MAIN LIFT OFFLINE / ASCENT TANK PRESSURE LOST", "#c3d8d8"],
    ["NEREID / EMERGENCY ROUTES", "CONTROL 01 / ENGINEERING 02 / MEDICAL 03 / POD 04", "#b3dfc6"]
  ];
  rows.forEach(([title,sub,color],i)=>{
    const y=i*128;g.fillStyle="#0b1c23";g.fillRect(0,y,1024,128);
    g.fillStyle=color;g.fillRect(16,y+16,5,92);g.font="bold 36px monospace";g.fillText(title,40,y+49,950);
    g.font="17px monospace";g.fillStyle="#aebfc0";g.fillText(sub,40,y+82,950);
    g.strokeStyle=color;g.lineWidth=2;g.beginPath();
    for(let x=40;x<985;x+=6){const dy=i===0?Math.sin(x*.055)*Math.sin(x*.013)*9:0;x===40?g.moveTo(x,y+108+dy):g.lineTo(x,y+108+dy);}g.stroke();
  });
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=2;return map;
}
function crackTexture() {
  if(typeof document==="undefined") return null;
  const c=document.createElement("canvas");c.width=c.height=256;const g=c.getContext("2d");if(!g)return null;
  g.clearRect(0,0,256,256);g.lineWidth=.7;
  for(let i=0;i<13;i++) {
    const angle=i*2.39996;let x=102,y=134;g.strokeStyle=i%3?"#a2bbc0":"#dae4de";g.beginPath();g.moveTo(x,y);
    for(let j=1;j<6;j++){x+=Math.cos(angle+Math.sin(j*7+i)*.2)*17;y+=Math.sin(angle+Math.sin(j*3+i)*.2)*17;g.lineTo(x,y);if(j===3){g.lineTo(x+Math.cos(angle+.65)*15,y+Math.sin(angle+.65)*15);g.moveTo(x,y);}}g.stroke();
  }
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return map;
}
function poolTexture() {
  const size=32,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,r=Math.hypot((x+0.5)/size-.5,(y+.5)/size-.5)*2;
    data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.max(0,1-r)**2*255;
  }
  const map=new THREE.DataTexture(data,size,size);map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearFilter;map.needsUpdate=true;return map;
}

export function createStationDetail(scene) {
  const root=new THREE.Group();root.name="NEREID-9 / station identity";scene.add(root);
  const atlas=atlasTexture(),cracks=crackTexture(),soft=poolTexture();
  const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.66,metalness:.45,...extra});
  const materials={
    case:mat(0x263943),trim:mat(0x64777a,{roughness:.42,metalness:.7}),ivory:mat(0xa2b1ac,{roughness:.73}),
    copper:mat(0x98714a,{roughness:.48}),rubber:mat(0x111d23,{roughness:.88,metalness:.1}),
    cloth:mat(0x899f96,{roughness:.98,metalness:0}),screen:mat(0x37626a,{emissive:0x4e9daa,emissiveIntensity:.45}),
    route:mat(0x87b1ab,{emissive:0x446b68,emissiveIntensity:.35}),
    signs:new THREE.MeshBasicMaterial({map:atlas,color:0xffffff,side:THREE.FrontSide})
  };
  const pieces=new Map(),physicalBounds=[],signs=[],displayGeometry=new THREE.BoxGeometry(1,1,1);
  const keep=(geometry,material,position,rotation=[0,0,0],scale=[1,1,1])=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.scale.set(...scale);mesh.updateMatrix();
    const copy=geometry.clone();copy.applyMatrix4(mesh.matrix);if(!pieces.has(material))pieces.set(material,[]);pieces.get(material).push(copy);
  };
  function box(size,pos,key="case",rot=[0,0,0]){keep(displayGeometry,materials[key],pos,rot,size);}
  function softBox(size,pos,key="cloth") {
    const geo=new RoundedBoxGeometry(...size,2,Math.min(.045,...size.map(n=>n*.22)));
    keep(geo,materials[key],pos);geo.dispose();
  }
  function cylinder(radius,height,pos,key="trim",rotation=[0,0,0]){const geo=new THREE.CylinderGeometry(radius,radius,height,12);keep(geo,materials[key],pos,rotation);geo.dispose();}
  function plaque(row,width,x,y,z,yaw=0) {
    signs.push({row,x,y,z,yaw});
    const geo=new THREE.PlaneGeometry(width,width/8),uv=geo.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setY(i,1-(row+1)/8+uv.getY(i)/8);
    if(y<.1)geo.rotateX(-Math.PI/2);
    keep(geo,materials.signs,[x,y,z],[0,yaw,0]);geo.dispose();
  }
  // Architectural frames are high enough to leave the existing door openings clear.
  for(const [i,id] of ROOM_IDS.entries()) {
    const {sx,sz}=ROOMS[id];
    box([5.8,.24,.32],[sx*5.8,3.55,sz*1.85]);
    box([.32,.24,5.8],[sx*1.85,3.55,sz*5.8]);
    for(const x of [sx*2.8,sx*6.2,sx*9.45])box([.12,.4,.5],[x,3.42,sz*1.85],"trim");
    box([3.42,.5,.12],[sx*5.8,3.55,sz*1.74]);
    plaque(i+1,3.3,sx*5.8,3.55,sz*1.675,sz<0?0:Math.PI);
    box([1.1,.11,2.6],[sx*6.3,3.72,sz*5.5],"case");
    for(let vent=0;vent<7;vent++)box([.85,.035,.045],[sx*6.3,3.64,sz*5.5-.95+vent*.3],"trim");
    // Small stepped arrows on the existing floor; no new collision geometry.
    for(let j=0;j<4;j++) {
      const x=sx*(2.2+j*.6),z=sz*2.25;
      box([.32,.006,.045],[x,.034,z],"route",[0,sx*sz*Math.PI/4,0]);
      box([.32,.006,.045],[x,.034,z+sz*.2],"route",[0,-sx*sz*Math.PI/4,0]);
    }
    // Perimeter protection rails leave windows, panels and room entrances visible.
    cylinder(.035,7,[sx*9.71,.44,sz*5.4],"trim",[Math.PI/2,0,0]);
  }

  // Existing crate collision volumes now describe useful, room-specific equipment.
  for(const [i,c] of CRATES.entries()) {
    const before=new Set([...pieces.values()].flat());
    const {cx:x,cz:z,w,d}=c;
    if(i===0) {
      box([w,.8,d],[x,.4,z]);box([w*.92,.08,d*.92],[x,.84,z],"trim");
      box([w*.86,.48,.1],[x,1.16,z-d*.3]);box([w*.75,.34,.018],[x,1.16,z-d*.3+.057],"screen");
      for(let j=0;j<3;j++)box([w*.7,.025,.015],[x,1.12+j*.09,z-d*.3+.071],"route");
    } else if(i===1 || i===2) {
      const h=c.h;
      box([w,.14,d],[x,.07,z]);box([w*.94,h-.14,d*.94],[x,.14+(h-.14)/2,z],i===2?"ivory":"case");
      for(let j=0;j<4;j++) {
        box([w*.82,.025,.02],[x,.2+j*(h-.25)/4,z+d*.48],"trim");
        box([.17,.025,.025],[x+w*.22,.28+j*(h-.25)/4,z+d*.48],"rubber");
      }
      if(i===2){box([.06,.24,.025],[x,h*.7,z+d*.48],"route");box([.22,.06,.025],[x,h*.7,z+d*.48],"route");}
    } else if(i===3) {
      box([w*.85,.4,d*.84],[x,.3,z]);softBox([w,.1,d],[x,.57,z],"ivory");softBox([w*.91,.11,d*.86],[x,.67,z],"cloth");
      softBox([w*.22,.08,d*.7],[x-w*.29,.755,z],"ivory");
      for(const side of [-1,1])box([.055,.02,d*.9],[x+side*w*.24,.735,z],"rubber");
      for(const sign of [-1,1])cylinder(.024,w*.85,[x,.55,z+sign*d*.47],"trim",[0,0,Math.PI/2]);
    } else {
      box([w,.18,d],[x,.09,z]);
      for(const sign of [-1,1])box([.095,2.5,.75*d],[x+sign*w*.4,1.4,z],"trim");
      cylinder(.29,2.18,[x,1.34,z],"copper");
      for(let j=0;j<5;j++) {
        const geo=new THREE.TorusGeometry(.34,.035,6,16);keep(geo,materials.trim,[x,.43+j*.43,z],[Math.PI/2,0,0]);geo.dispose();
      }
      box([w*.9,.16,d*.8],[x,2.73,z]);box([.055,2.2,.028],[x,1.35,z+d*.41],"screen");
    }
    const bounds=new THREE.Box3();for(const list of pieces.values())for(const geo of list)if(!before.has(geo)){geo.computeBoundingBox();bounds.union(geo.boundingBox);}
    physicalBounds.push({kind:STATION_FURNITURE[i],crate:i,bounds});
  }

  // Wall-mounted records belong to this game's severed-lift incident, not a ghost story.
  plaque(0,3.4,-7.5,2.8,-9.76);plaque(6,2.9,-9.76,2.7,-6,Math.PI/2);
  plaque(5,3.4,9.76,2.65,6.8,-Math.PI/2);plaque(7,1.5,.9,.039,.2,-Math.PI/2);
  // Conduit hangers and a damaged cable end above the transfer bay.
  for(let i=0;i<6;i++) {
    cylinder(.045,.75,[4+i*.6,3.5,8.05],"rubber",[0,0,Math.PI/2]);
    box([.08,.14,.15],[4+i*.6,3.66,8.05],"trim");
  }
  box([.55,.16,.3],[7.5,3.56,8.05],"copper",[0,0,-.18]);
  // Mechanical survey-rack sides and medicine locker vents replace anonymous storage.
  for(const c of [CRATES[0],CRATES[2]])for(let j=0;j<6;j++)box([.025,.035,c.d*.52],[c.cx+c.w*.47,.4+j*.13,c.cz],"rubber");

  displayGeometry.dispose();
  for(const [material,geometries] of pieces) {
    const expanded=geometries.map(g=>g.index?g.toNonIndexed():g);
    const geometry=mergeGeometries(expanded);new Set([...geometries,...expanded]).forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`Station detail / ${Object.keys(materials).find(k=>materials[k]===material)}`;root.add(mesh);
  }
  // Soft floor light pools add depth without new lights, shadows or screen effects.
  const poolGeo=new THREE.PlaneGeometry(1,1),poolMat=new THREE.MeshBasicMaterial({map:soft,transparent:true,opacity:.075,depthWrite:false,blending:THREE.AdditiveBlending,color:0x9cb9ac});
  const pools=[];for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const geo=poolGeo.clone();geo.rotateX(-Math.PI/2);geo.scale(4.5,1,4.5);geo.translate(sx*5,.041,sz*5);pools.push(geo);
  }
  const poolMesh=new THREE.Mesh(mergeGeometries(pools),poolMat);poolMesh.name="Low floor bounce";root.add(poolMesh);pools.forEach(g=>g.dispose());poolGeo.dispose();
  const damage=new Map();
  for(const room of ROOM_IDS) {
    const geometries=[];
    for(const w of WINDOWS) {
      const horizontal=w.wall==="N"||w.wall==="S",fixed=w.wall==="N"||w.wall==="W"?-9.785:9.785;
      const x=horizontal?w.c:fixed,z=horizontal?fixed:w.c;
      if(Math.sign(x)!==ROOMS[room].sx || Math.sign(z)!==ROOMS[room].sz)continue;
      const geo=new THREE.PlaneGeometry(WINDOW_W*.92,(WINDOW_Y1-WINDOW_Y0)*.92);if(!horizontal)geo.rotateY(Math.PI/2);geo.translate(x,(WINDOW_Y0+WINDOW_Y1)/2,z);geometries.push(geo);
    }
    if(!geometries.length)continue;
    const material=new THREE.MeshBasicMaterial({map:cracks,color:0xb4c7c8,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false});
    const mesh=new THREE.Mesh(mergeGeometries(geometries),material);mesh.name=`Hull strike scars / ${room}`;mesh.visible=false;root.add(mesh);damage.set(room,mesh);geometries.forEach(g=>g.dispose());
  }
  const sprayCount=8*32,sprayGeo=new THREE.BufferGeometry();sprayGeo.setAttribute("position",new THREE.BufferAttribute(new Float32Array(sprayCount*3),3));sprayGeo.setDrawRange(0,0);
  const sprayMat=new THREE.PointsMaterial({map:soft,color:0xd3e8df,size:.065,transparent:true,opacity:.68,depthWrite:false});
  const spray=new THREE.Points(sprayGeo,sprayMat);spray.name="Breach pressure spray";spray.frustumCulled=false;root.add(spray);
  let lastSpray=-Infinity,lastSprayKey="",lastReduced=null;
  const dustGeo=new THREE.BufferGeometry(),dustPos=new Float32Array(180*3);
  for(let i=0;i<180;i++){dustPos[i*3]=Math.sin(i*31.7)*6;dustPos[i*3+1]=Math.sin(i*17.3)*2.4;dustPos[i*3+2]=Math.sin(i*11.9)*6;}
  dustGeo.setAttribute("position",new THREE.BufferAttribute(dustPos,3));
  const dustMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uDirection:{value:new THREE.Vector3(0,0,-1)},uOn:{value:0},uTime:{value:0}},
    vertexShader:'uniform float uTime; varying vec3 vRelative; void main(){vec3 p=position;p.y+=sin(uTime*.3+position.x)*.1;vRelative=p;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(16./max(1.,-mv.z),1.,2.5);}',
    fragmentShader:'uniform vec3 uDirection;uniform float uOn;varying vec3 vRelative;void main(){float d=length(vRelative);float cone=smoothstep(.91,.97,dot(normalize(vRelative),uDirection));float point=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.75,.84,.79,point*cone*exp(-d*.23)*.24*uOn);}' });
  const dust=new THREE.Points(dustGeo,dustMat);dust.name="Flashlight beam particles";dust.frustumCulled=false;root.add(dust);

  return {root,physicalBounds,signs,damage,spray,dust,
    update(state,{time=0,reducedEffects=false,camera=null,flashlightOn=false,quality="balanced"}={}) {
      const powered=state.power && (!state.finale || state.finale.station.power>5);
      materials.screen.emissiveIntensity=powered?.6:.12;poolMat.opacity=powered?.085:.045;
      for(const [room,mesh] of damage){const hits=state.rooms[room]?.impacts||0;mesh.visible=hits>0;mesh.material.opacity=Math.min(.52,.24+hits*.035);}
      const breaches=state.breaches.slice(0,8),key=breaches.map(b=>b.id).join('|');
      if(!reducedEffects && time-lastSpray>=.1 || key!==lastSprayKey || reducedEffects!==lastReduced) {
        const p=sprayGeo.attributes.position;let at=0;
        for(const b of breaches){const r=ROOMS[b.room]||ROOMS.control,dx=r.sx*5-b.x,dz=r.sz*5-b.z,len=Math.hypot(dx,dz)||1;
          for(let j=0;j<32;j++){const phase=((reducedEffects?0:time*.8)+j*.6180339)%1,spread=Math.sin(j*13.7)*.12;
            p.setXYZ(at++,b.x+dx/len*phase*1.7+spread*phase,Math.max(.04,1.2-phase*phase*1.35)+spread*.3,b.z+dz/len*phase*1.7+Math.cos(j*19)*.1*phase);}}
        sprayGeo.setDrawRange(0,at);p.needsUpdate=true;lastSpray=time;lastSprayKey=key;lastReduced=reducedEffects;
      }
      dust.visible=!!camera && flashlightOn && !reducedEffects;
      if(dust.visible){dust.position.copy(camera.position);camera.getWorldDirection(dustMat.uniforms.uDirection.value);dustMat.uniforms.uOn.value=1;dustMat.uniforms.uTime.value=time;dustGeo.setDrawRange(0,quality==="low"?60:quality==="high"?180:120);}
    },
    dispose(){scene.remove(root);const geometries=new Set(),mats=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])mats.add(m);});geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());for(const map of [atlas,cracks,soft])map?.dispose();}
  };
}
