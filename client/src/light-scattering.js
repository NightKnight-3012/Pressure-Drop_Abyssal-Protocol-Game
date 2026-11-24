import * as THREE from 'three';
import { WINDOWS, WINDOW_W, WINDOW_Y0, WINDOW_Y1 } from '../../shared/layout.js';

// Soft photographic-style masks shared by every opening. No render targets or shadow maps.
function lightMaterial(pool, opacity) {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size, v = (y + .5) / size;
    const edge = Math.sin(Math.PI * u) ** 2;
    const strand = Math.cos(12 * u + .35 * Math.sin(5 * v));
    const falloff = pool ? Math.sin(Math.PI * v) ** 2 : (1 - v) ** 1.6 * Math.min(v * 16, 1);
    const ripple = pool ? .4 + .6 * Math.cos(9 * v + 3 * Math.sin(7 * u)) ** 8 : .65 + .35 * strand ** 2;
    pixels.set([255, 255, 255, Math.round(255 * edge * falloff * ripple)], (y * size + x) * 4);
  }
  const map = new THREE.DataTexture(pixels, size, size);
  map.magFilter = map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return new THREE.MeshBasicMaterial({map, color: 0x9ce4ea, opacity, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true});
}

function ribbons(shapes, material) {
  const positions = [], uv = [], indices = [];
  for (const corners of shapes) {
    const start = positions.length / 3;
    positions.push(...corners.flat());
    uv.push(0,0, 1,0, 0,1, 1,1);
    indices.push(start,start+1,start+2, start+1,start+3,start+2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  return new THREE.Mesh(geometry,material);
}

function windowVolumes() {
  const positions=[], local=[], origins=[], directions=[], indices=[];
  const width=WINDOW_W*.66, height=WINDOW_Y1-.05, distance=4.65;
  const box=new THREE.BoxGeometry(width*2,height,distance).translate(0,height/2+.05,distance/2);
  const vertices=box.attributes.position;
  for(const {wall,c} of WINDOWS){
    const horizontal=wall==='N'||wall==='S';
    const sign=wall==='N'||wall==='W'?-1:1;
    const x=horizontal?c:sign*9.77, z=horizontal?sign*9.77:c;
    const dx=horizontal?0:-sign, dz=horizontal?-sign:0;
    const offset=positions.length/3;
    for(let i=0;i<vertices.count;i++){
      const u=vertices.getX(i), y=vertices.getY(i), depth=vertices.getZ(i);
      positions.push(x+dz*u+dx*depth,y,z-dx*u+dz*depth);
      local.push(u,y,depth);
      origins.push(x,z);
      directions.push(dx,dz);
    }
    for(const i of box.index.array)indices.push(offset+i);
  }
  box.dispose();
  const geometry=new THREE.BufferGeometry();
  for(const [name,data,size] of [
    ['position',positions,3],['beamPosition',local,3],['beamOrigin',origins,2],['beamDirection',directions,2]
  ])geometry.setAttribute(name,new THREE.Float32BufferAttribute(data,size));
  geometry.setIndex(indices);
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{
      bounds:{value:new THREE.Vector3(width,height+.05,distance)},
      aperture:{value:(WINDOW_Y0+WINDOW_Y1)/2},
      samples:{value:5}
    },
    vertexShader:`
      attribute vec3 beamPosition;
      attribute vec2 beamOrigin, beamDirection;
      varying vec3 localPoint, localEye;
      void main() {
        vec2 eye=cameraPosition.xz-beamOrigin;
        localEye=vec3(dot(eye,vec2(beamDirection.y,-beamDirection.x)),cameraPosition.y,dot(eye,beamDirection));
        localPoint=beamPosition;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        if(dot(eye,eye)>144.)gl_Position=vec4(2.,2.,2.,1.);
      }`,
    fragmentShader:`
      uniform vec3 bounds;
      uniform float aperture;
      uniform int samples;
      varying vec3 localPoint, localEye;
      void main() {
        vec3 direction=normalize(localPoint-localEye);
        vec3 safeDirection=mix(vec3(.00001),direction,step(vec3(.00001),abs(direction)));
        vec3 a=(vec3(-bounds.x,.05,0.)-localEye)/safeDirection;
        vec3 b=(bounds-localEye)/safeDirection;
        vec3 lo=min(a,b), hi=max(a,b);
        float near=max(0.,max(lo.x,max(lo.y,lo.z)));
        float far=min(hi.x,min(hi.y,hi.z));
        if(far<=near)discard;
        float stride=(far-near)/float(samples), density=0.;
        for(int i=0;i<8;i++){
          if(i>=samples)break;
          vec3 p=localEye+direction*(near+(float(i)+.5)*stride);
          float spread=.78+p.z*.105;
          float x=(p.x-p.z*.065)/spread;
          float y=(p.y-aperture+p.z*.41)/(.8+p.z*.065);
          float apertureMask=(1.-smoothstep(.38,1.,abs(x)))*(1.-smoothstep(.32,1.,abs(y)));
          float strand=.5+.5*cos(17.*x+y*.55);
          float shafts=.57+.43*strand*strand;
          float endFade=(1.-smoothstep(2.75,bounds.z,p.z))*smoothstep(.05,.34,p.y);
          density+=apertureMask*shafts*endFade/(1.+p.z*.42);
        }
        float distanceFade=1.-smoothstep(9.,12.,length(localEye.xz));
        float brightness=(1.-exp(-.24*density*stride))*distanceFade;
        gl_FragColor=vec4(.33,.66,.74,brightness);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Volumetric window shafts';
  return mesh;
}

export function createLightScattering(scene) {
  const pools = [];
  for (const {wall,c} of WINDOWS) {
    const horizontal = wall === 'N' || wall === 'S';
    const sign = wall === 'N' || wall === 'W' ? -1 : 1;
    function point(offset,height,inset) {
      const axis = sign * (10 - inset);
      return horizontal ? [c+offset,height,axis] : [axis,height,c+offset];
    }
    const w = WINDOW_W * .43;
    pools.push([point(-w,.045,.4),point(w,.045,.4),point(-w-.18,.045,4.1),point(w+.55,.045,4.1)]);
  }
  const shaft = windowVolumes();
  const pool = ribbons(pools,lightMaterial(true,.16));
  const beam = ribbons([[[-.30,-.23,-.5],[-.13,-.24,-.5],[-1.25,-.85,-5.4],[1.05,-.88,-5.4]]],lightMaterial(false,.078));
  for (const mesh of [shaft,pool,beam]) { mesh.visible=false; scene.add(mesh); }
  return {
    update({camera, outside, underwater, flashlightOn, reducedEffects, time=0},quality) {
      const enabled = !!camera && quality !== 'low' && !reducedEffects;
      shaft.visible = pool.visible = enabled && !outside;
      shaft.material.uniforms.samples.value = quality === 'high' ? 8 : 5;
      if(pool.visible) pool.material.map.offset.set(.018*Math.sin(time*.38),.025*Math.sin(time*.29));
      beam.visible = !!(enabled && flashlightOn && (outside || underwater));
      if (beam.visible) { beam.position.copy(camera.position); beam.quaternion.copy(camera.quaternion); }
    }
  };
}
