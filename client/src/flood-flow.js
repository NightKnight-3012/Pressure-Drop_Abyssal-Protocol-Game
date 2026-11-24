import * as THREE from 'three';
import { DOOR_SLABS, ROOM_IDS, ROOMS } from '../../shared/layout.js';

const segments=8;
const capacity=8*3+ROOM_IDS.length*2;

export function addFloodFlow(scene) {
  const geometry=new THREE.BufferGeometry();
  const vertices=capacity*segments*6;
  const position=new THREE.BufferAttribute(new Float32Array(vertices*3),3).setUsage(THREE.DynamicDrawUsage);
  const flow=new THREE.BufferAttribute(new Float32Array(vertices*3),3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',position);
  geometry.setAttribute('flow',flow);
  const material=new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, side:THREE.DoubleSide, forceSinglePass:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{time:{value:0}}]),
    vertexShader:`
      attribute vec3 flow;
      varying vec3 vFlow;
      #include <fog_pars_vertex>
      void main(){
        vFlow=flow;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      uniform float time;
      varying vec3 vFlow;
      #include <fog_pars_fragment>
      void main(){
        float u=vFlow.x, v=vFlow.y;
        float edge=1.-smoothstep(.24,1.,abs(u*2.-1.));
        float strands=.58+.42*sin(u*47.+sin(v*16.)*.8);
        float pulse=.60+.40*sin(v*43.-time*17.+sin(u*21.)*.7);
        float bubbles=smoothstep(.73,.99,sin(v*79.-time*22.+sin(u*33.)*2.)*sin(u*48.+v*11.));
        float foam=smoothstep(.68,.88,v)*(1.-smoothstep(.91,1.,v));
        vec3 color=mix(vec3(.13,.39,.47),vec3(.69,.86,.86),foam*.62+bubbles*.24);
        gl_FragColor=vec4(color,edge*(1.-smoothstep(.94,1.,v))*vFlow.z*(.26+.42*strands*pulse+.23*foam));
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`, fog:true
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Breach jets and bulkhead flow';
  mesh.frustumCulled=false;
  mesh.renderOrder=3;
  mesh.visible=false;
  scene.add(mesh);
  let count=0, lastState, lastQuality, lastWaterKey;
  function strip(fromX,fromY,fromZ,dx,dz,length,drop,width,strength,vertical=false) {
    if (count+segments*6>vertices) return;
    const vertex=(segment,side)=>{
      const t=segment/segments, across=side-.5;
      const spread=width*(.27+.73*t)*across;
      const fall=drop<0?t*(2-t):t*t;
      const x=fromX+dx*t*length, y=fromY-drop*fall, z=fromZ+dz*t*length;
      position.setXYZ(count,vertical?x:x-dz*spread,vertical?y+spread:y,vertical?z:z+dx*spread);
      flow.setXYZ(count++,side,t,strength);
    };
    for(let i=0;i<segments;i++){
      vertex(i,0);vertex(i,1);vertex(i+1,0);
      vertex(i,1);vertex(i+1,1);vertex(i+1,0);
    }
  }
  return {mesh,update(state,time,reduced,quality,heave=0) {
    material.uniforms.time.value=reduced?0:time;
    mesh.position.y=heave;
    if(lastState===state && lastQuality===quality)return;
    lastState=state;lastQuality=quality;
    const breaches=state.breaches.slice(0,8);
    const waterKey=JSON.stringify([quality,state.hub,
      ROOM_IDS.map(id=>[state.rooms[id].flood,state.rooms[id].closed]),
      breaches.map(b=>[b.id,b.room,b.x,b.z,b.severity,b.clampedIn>0])]);
    if(waterKey===lastWaterKey)return;
    lastWaterKey=waterKey;count=0;
    for(const breach of breaches){
      if(breach.clampedIn>0)continue;
      const room=ROOMS[breach.room];
      if(!room)continue;
      const flood=state.rooms[breach.room]?.flood??0;
      // The repair marker is on the deck. The pressure jet rises from that
      // seam before gravity turns it over into the room's water surface.
      const dx=-room.sx*Math.SQRT1_2, dz=-room.sz*Math.SQRT1_2;
      const strength=Math.min(1,.6+(breach.severity??1)*.24);
      const height=.20+Math.max(0,1.1-flood);
      if(flood>1.25)continue;
      const source=Math.max(.05,flood+.03), crest=Math.max(source+.12,height);
      strip(breach.x,source,breach.z,dx,dz,.45,source-crest,.28,strength,true);
      strip(breach.x+dx*.35,crest,breach.z+dz*.35,dx,dz,1.24,crest-source,.62,strength*.85);
      if(quality!=='low')strip(breach.x+dx*.35,crest-.07,breach.z+dz*.35,dx,dz,1.37,crest-source,.42,strength*.8,true);
    }
    for(const id of ROOM_IDS){
      const room=state.rooms[id], delta=room.flood-state.hub;
      const drop=Math.abs(delta);
      if(room.closed||drop<=.035)continue;
      const strength=Math.min(.85,.35+drop*.5)*THREE.MathUtils.smoothstep(drop,.035,.16);
      const [door]=DOOR_SLABS[id];
      const x=(door.minX+door.maxX)/2,z=(door.minZ+door.maxZ)/2;
      const dz=-ROOMS[id].sz*Math.sign(delta);
      strip(x,Math.max(room.flood,state.hub)+.023,z-dz*.21,0,dz,.87,drop,1.5,strength);
    }
    geometry.setDrawRange(0,count);
    mesh.visible=count>0;
    if(count) for(const attribute of [position,flow]){
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0,count*3);
      attribute.needsUpdate=true;
    }
  }};
}
