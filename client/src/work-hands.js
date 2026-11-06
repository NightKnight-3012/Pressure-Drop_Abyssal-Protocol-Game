import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {STATIONS} from '../../shared/layout.js';

// Presentation only: the server owns the hold, progress, tool and cancellation.
export function workPose({hold,working=false,blocked=false,player,stage='main',aim}={}){
  if(!hold||!working||blocked||!player||player.down||player.lost||player.escaped||player.aboard||player.subSeat||stage==='vote'||typeof hold.id!=='string'||!Number.isFinite(hold.progress))return null;
  const id=hold.id;
  if(id==='board'||id==='sub:board'||id==='sub:dock'||id.startsWith('log:'))return null;
  let kind='repair';
  if(id.startsWith('breach:')&&hold.tool==='welder')kind='weld';
  else if(id.startsWith('treat:'))kind='treat';
  else if(id==='pump'||id==='service:pump'||id==='o2'||id.startsWith('airlock'))kind='valve';
  else if(id.startsWith('resource:')||id.startsWith('scrap:')||id==='salvage:recover')kind='reach';
  else if(STATIONS[id]?.kind==='door'||id.startsWith('circuit:')||id==='launch')kind='controls';
  return {kind,progress:THREE.MathUtils.clamp(hold.progress,0,1),id,aim};
}

export function workAim(point,position,yaw,pitch=0){
  if(!point||![point.x,point.z,position.x,position.z,yaw,pitch].every(Number.isFinite))return {x:0,y:0};
  const dx=point.x-position.x,dz=point.z-position.z;
  const forward=-Math.sin(yaw)*dx-Math.cos(yaw)*dz,right=Math.cos(yaw)*dx-Math.sin(yaw)*dz;
  if(forward<=.05)return {x:0,y:0};
  return {x:THREE.MathUtils.clamp(right/forward,-.5,.5)*.06,y:THREE.MathUtils.clamp(Math.atan2((point.y??1.1)-(position.y??1.65),Math.hypot(dx,dz))-pitch,-.6,.6)*.05};
}

export function createWorkHands(){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.05,3),root=new THREE.Group();
  root.name='first-person-work-hands';root.visible=false;scene.add(root);
  const materials=[
    new THREE.MeshStandardMaterial({color:0x394b48,roughness:.85}),
    new THREE.MeshStandardMaterial({color:0x202a2e,roughness:.82}),
    new THREE.MeshStandardMaterial({color:0x93a4a5,metalness:.65,roughness:.38}),
    new THREE.MeshBasicMaterial({color:0x8edbdc,toneMapped:false})
  ];
  // Fixed lights in this isolated pass never add world lights, shadows or shader variants.
  scene.add(new THREE.HemisphereLight(0xc9dfdf,0x19242c,2.1));
  const light=new THREE.DirectionalLight(0xc9e5ee,2);light.position.set(-1,2,1);scene.add(light);
  const geometries=[];
  function batch(parent,parts,mat){const converted=parts.map(g=>{const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();return n;});const geometry=mergeGeometries(converted);converted.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,materials[mat]);mesh.frustumCulled=false;parent.add(mesh);geometries.push(geometry);return mesh;}
  function ellipsoid(x,y,z,sx,sy,sz){const g=new THREE.SphereGeometry(1,12,8);g.scale(sx,sy,sz);g.translate(x,y,z);return g;}
  function bar(a,b,r1,r2=r1){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start),g=new THREE.CylinderGeometry(r2,r1,direction.length(),10);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());return g;}
  function block(x,y,z,w,h,d){return new THREE.BoxGeometry(w,h,d).translate(x,y,z);}
  function arm(side){
    const group=new THREE.Group();root.add(group);
    const sleeve=[bar([side*.05,-.44,.34],[0,-.035,.025],.092,.067),ellipsoid(side*.035,-.23,.19,.09,.12,.085)];
    batch(group,sleeve,0);
    const rubber=[bar([0,-.045,.03],[0,.005,-.005],.073),ellipsoid(0,.008,-.063,.066,.038,.078)];
    for(let finger=0;finger<4;finger++){
      const x=(finger-1.5)*.031,z=-.12,length=[.068,.082,.077,.057][finger],curl=side===1?.038:.014;
      rubber.push(ellipsoid(x,.015,z,.019,.026,.025),bar([x,.01,z],[x,-curl,z-length],.017,.014),ellipsoid(x,-curl,z-length,.014,.017,.018));
    }
    rubber.push(bar([-side*.058,.003,-.045],[-side*.08,-.019,-.091],.025,.02),bar([-side*.08,-.019,-.091],[-side*.046,-.032,-.12],.02,.016),ellipsoid(-side*.046,-.032,-.12,.018,.018,.023));
    batch(group,rubber,1);
    batch(group,[bar([0,-.062,.04],[0,-.052,.03],.075),block(0,-.17,.21,.08,.045,.012),...[-1,0,1].map(i=>block(i*.027,.043,-.068,.018,.007,.057))],2);
    return group;
  }
  const left=arm(-1),right=arm(1),wrench=new THREE.Group(),welder=new THREE.Group();right.add(wrench,welder);
  welder.rotation.x=.55;
  batch(wrench,[bar([0,-.06,-.095],[0,.17,-.095],.018),block(0,.185,-.095,.092,.034,.028),block(-.038,.213,-.095,.018,.04,.028),block(.038,.213,-.095,.018,.04,.028)],2);
  batch(welder,[bar([0,.015,-.05],[0,.015,-.25],.037,.027),bar([0,-.015,-.06],[0,-.13,-.015],.028),bar([0,.015,-.25],[0,.015,-.34],.015,.011)],2);
  batch(welder,[bar([0,.015,-.07],[0,.015,-.19],.039)],0);
  const arc=batch(welder,[ellipsoid(0,.015,-.346,.014,.014,.018)],3);
  let pose=null,elapsed=0,raised=0,lastId=null,disposed=false;
  const view={root,scene,camera,left,right,wrench,welder,arc,
    update(next,dt=0,reduced=false){
      if(disposed)return;pose=next;root.visible=!!pose;
      if(!pose){raised=0;lastId=null;elapsed=0;return;}
      const delta=Number.isFinite(dt)?Math.min(.1,Math.max(0,dt)):0;
      if(lastId!==pose.id){elapsed=0;raised=0;lastId=pose.id;}
      elapsed+=delta;raised=reduced?1:raised+(1-raised)*(1-Math.exp(-14*delta));
      const wave=reduced?0:Math.sin(elapsed*5),turn=reduced?0:Math.sin(elapsed*4)*.13;
      const stretch=pose.kind==='reach'?pose.progress*.055:0;
      left.position.set(-.25,-.33-(1-raised)*.36,-.74-stretch);
      right.position.set(.26,-.36-(1-raised)*.36,-.69-stretch);
      left.rotation.set(-.12,0,-.23);right.rotation.set(-.15,-.12,.20);
      const aimX=Number.isFinite(pose.aim?.x)?THREE.MathUtils.clamp(pose.aim.x,-.03,.03):0,aimY=Number.isFinite(pose.aim?.y)?THREE.MathUtils.clamp(pose.aim.y,-.03,.03):0;
      left.position.x+=aimX;right.position.x+=aimX;left.position.y+=aimY;right.position.y+=aimY;
      if(pose.kind==='valve'){left.rotation.z+=turn;right.rotation.z-=turn;left.position.y+=wave*.008;}
      else if(pose.kind==='weld'){right.position.x+=wave*.013;right.rotation.y+=turn*.15;}
      else if(pose.kind==='repair'){right.rotation.z+=turn;right.position.y+=wave*.007;}
      else if(pose.kind==='treat'){right.position.y+=wave*.012;right.rotation.x+=turn*.3;left.position.z-=.035;}
      else if(pose.kind==='controls'){right.position.z-=.035+(reduced?0:Math.max(0,wave)*.012);right.rotation.x-=.12;}
      else {left.position.z-=pose.progress*.015;right.position.y+=wave*.007;}
      wrench.visible=pose.kind==='repair';welder.visible=pose.kind==='weld';arc.visible=welder.visible;
    },
    render(renderer,aspect=1){
      if(disposed||!root.visible)return;
      if(camera.aspect!==aspect){camera.aspect=aspect;camera.updateProjectionMatrix();}
      // Narrow windows keep hands near the lower corners rather than filling the centre.
      root.scale.set(Math.min(1,Math.max(.45,aspect/1.35)),1,1);
      root.position.y=Math.min(.20,Math.max(0,(1.35-aspect)*.38));
      const autoClear=renderer.autoClear;renderer.autoClear=false;
      try{renderer.clearDepth();renderer.render(scene,camera);}finally{renderer.autoClear=autoClear;}
    },
    dispose(){if(disposed)return;disposed=true;root.visible=false;scene.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
  };
  view.update(null);return view;
}
