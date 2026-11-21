import * as THREE from 'three';
import { WINDOWS, WINDOW_W, WINDOW_Y1 } from '../../shared/layout.js';

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

export function createLightScattering(scene) {
  const rays = [], pools = [];
  for (const {wall,c} of WINDOWS) {
    const horizontal = wall === 'N' || wall === 'S';
    const sign = wall === 'N' || wall === 'W' ? -1 : 1;
    function point(offset,height,inset) {
      const axis = sign * (10 - inset);
      return horizontal ? [c+offset,height,axis] : [axis,height,c+offset];
    }
    const w = WINDOW_W * .43;
    rays.push([point(-w,WINDOW_Y1-.16,.23),point(w,WINDOW_Y1-.16,.23),
      point(-w-.18,.04,3.8),point(w+.55,.04,3.8)]);
    pools.push([point(-w,.045,.4),point(w,.045,.4),point(-w-.18,.045,4.1),point(w+.55,.045,4.1)]);
  }
  const shaft = ribbons(rays,lightMaterial(false,.23));
  const pool = ribbons(pools,lightMaterial(true,.16));
  const beam = ribbons([[[-.30,-.23,-.5],[-.13,-.24,-.5],[-1.25,-.85,-5.4],[1.05,-.88,-5.4]]],lightMaterial(false,.078));
  for (const mesh of [shaft,pool,beam]) { mesh.visible=false; scene.add(mesh); }
  return {
    update({camera, outside, underwater, flashlightOn, reducedEffects, time=0},quality) {
      const enabled = !!camera && quality !== 'low' && !reducedEffects;
      shaft.visible = pool.visible = enabled && !outside;
      if(pool.visible) pool.material.map.offset.set(.018*Math.sin(time*.38),.025*Math.sin(time*.29));
      beam.visible = !!(enabled && flashlightOn && (outside || underwater));
      if (beam.visible) { beam.position.copy(camera.position); beam.quaternion.copy(camera.quaternion); }
    }
  };
}
