import * as THREE from "three";
import { options, QUALITY } from "./options.js";
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {EXT_LIMIT,EXTERIOR_STRUCTURES} from '../../shared/layout.js';

const hash = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
import {oceanNoise,oceanHeight} from '../../shared/ocean-floor.js';
export {oceanNoise,oceanHeight};

let sedimentPixels = null;
export function createSedimentMaps() {
  const size = 256;
  if (!sedimentPixels) {
  const color = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = (z * size + x) * 4, grain = hash(x, z), ax = x / size * Math.PI * 2, az = z / size * Math.PI * 2;
    const cloud = 0.5 + Math.sin(Math.sin(ax) * 3 + Math.cos(az) * 2) * 0.2 + Math.cos(Math.cos(ax) * 2 - Math.sin(az) * 3) * 0.15;
    const phase = az * 18 + Math.sin(ax) * 1.7;
    const ripple = Math.sin(phase), shade = 0.76 + cloud * 0.18 + grain * 0.08 + ripple * 0.04;
    color.set([111 * shade, 119 * shade, 112 * shade, 255], i);
    normal.set([128 + Math.cos(phase) * Math.cos(x * Math.PI / 128) * 7 + (grain - 0.5) * 12, 128 + Math.cos(phase) * 28, 250, 255], i);
  }
    sedimentPixels = { color, normal };
  }
  // Reuse immutable CPU pixels, not GPU textures: station/pod tiling and disposal
  // remain independent, without regenerating the map when the chase begins.
  const map = new THREE.DataTexture(sedimentPixels.color, size, size); map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.DataTexture(sedimentPixels.normal, size, size);
  for (const texture of [map, normalMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  }
  return { map, normalMap };
}

export function createSeabed(width = 220, depth = 220, route = false) {
  const maps = createSedimentMaps(); maps.map.repeat.set(width / 4, depth / 4); maps.normalMap.repeat.copy(maps.map.repeat);
  const geometry = new THREE.PlaneGeometry(width, depth, 64, route ? 96 : 64); geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position, colors = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    positions.setY(i, route ? -2.1 + oceanNoise(x * 0.08, z * 0.08) * 0.8 : oceanHeight(x, z));
    const mottling = 0.72 + oceanNoise(x * 0.17, z * 0.17) * 0.28; colors.push(mottling, mottling, mottling);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x81938c, map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, roughness: 0.98, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = "Eroded sediment shelf";
  return mesh;
}

function rockGeometry(seed) {
  const geometry = new THREE.SphereGeometry(1, 14, 9), p = geometry.attributes.position, colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ridge = oceanNoise(x * 2.5 + seed, z * 2.5 + y * 1.3) * 0.6 + Math.sin(y * 15 + x * 3) * 0.065;
    const r = 0.7 + ridge;
    p.setXYZ(i, x * r + y * 0.18, y * r * 0.85, z * r + x * y * 0.1);
    const shade = 0.45 + oceanNoise(x * 6 + seed, z * 6 + y * 3) * 0.3 + (y + 1) * 0.05;
    colors.push(shade * 0.94, shade, shade * 0.97);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals(); return geometry;
}

export function createRockMaps() {
  const size = 128, color = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = (z * size + x) * 4, grain = hash(x, z), strata = Math.sin(z * 0.9 + Math.sin(x * 0.12) * 2);
    const tone = 138 + (grain - 0.5) * 42 + strata * 10;
    color.set([tone * 0.97, tone, tone * 0.96, 255], i);
    normal.set([128 + (grain - 0.5) * 55, 128 + (hash(x + 9, z + 11) - 0.5) * 55, 245, 255], i);
  }
  const map = new THREE.DataTexture(color, size, size), normalMap = new THREE.DataTexture(normal, size, size); map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; }
  return { map, normalMap };
}

export function createOcean(scene) {
  const root = new THREE.Group(); root.name = "Abyssal exterior"; scene.add(root);
  const floor = createSeabed(); root.add(floor);
  let seed = 12345;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rockMaps = createRockMaps();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xb9c5ba, ...rockMaps, normalScale: new THREE.Vector2(0.55, 0.55), vertexColors: true, roughness: 0.96 });
  // Layered escarpments give the shelf a horizon and geological scale. They sit
  // beyond both the EVA boundary and the creature's patrol envelope.
  const cliffs=[];
  for(const side of [-1,1])for(let segment=0;segment<9;segment++) {
    const geo=rockGeometry(segment+42),z=-72+segment*18;
    geo.scale(8,13+oceanNoise(segment,side)*12,14);geo.rotateY(Math.sin(segment)*.3);
    geo.translate(side*(68+Math.sin(segment)*4),1,z);cliffs.push(geo);
  }
  const escarpment=new THREE.Mesh(mergeGeometries(cliffs),rockMat);escarpment.name='Layered abyssal escarpment';root.add(escarpment);cliffs.forEach(g=>g.dispose());
  // A broken survey receiver gives divers a recognizable nearby landmark.
  const relicMat=new THREE.MeshStandardMaterial({color:0x596f70,metalness:.55,roughness:.83});
  const receiver=EXTERIOR_STRUCTURES.find(s=>s.id==='receiver');
  const relic=new THREE.Group();relic.name='Collapsed survey receiver';relic.position.set(receiver.cx,-1,receiver.cz);relic.rotation.z=.32;
  const dish=new THREE.Mesh(new THREE.SphereGeometry(4.6,20,10,0,Math.PI*2,0,Math.PI*.42),relicMat);dish.rotation.x=Math.PI*.4;dish.material.side=THREE.DoubleSide;relic.add(dish);
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.18,.32,9,10),relicMat);mast.position.y=-2;relic.add(mast);root.add(relic);
  const variants = Array.from({ length: 4 }, (_, i) => new THREE.InstancedMesh(rockGeometry(13 + i * 4), rockMat, 24));
  const transform = new THREE.Object3D();
  for (const [variant, rocks] of variants.entries()) {
    for (let i = 0; i < 24; i++) {
      // Repeating clusters of large buried outcrops and smaller scree, rather
      // than equally spaced rocks or upright geometric spikes.
      const cluster = i >> 2, angle = cluster * 2.39996 + variant * 0.3;
      const radius = 27 + (cluster % 4) * 8 + random() * 6;
      let x = Math.cos(angle) * radius + (random() - 0.5) * 6, z = Math.sin(angle) * radius + (random() - 0.5) * 6;
      const size = i % 4 === 0 ? 2.4 + random() * 3.3 : 0.45 + random() * 1.8;
      const clearance = Math.max(1, (EXT_LIMIT + 12 + size * 2) / Math.max(Math.abs(x), Math.abs(z))); x *= clearance; z *= clearance;
      transform.position.set(x, oceanHeight(x, z) + size * 0.3, z);
      transform.scale.set(size * (1 + random() * 0.6), size * (0.6 + random() * 0.6), size);
      transform.rotation.set(random() * 0.4, random() * Math.PI * 2, random() * 0.3); transform.updateMatrix(); rocks.setMatrixAt(i, transform.matrix);
    }
    root.add(rocks);
  }
  // Small stones settle into the sediment around the station, clear of the
  // airlock and cable junctions. Their shallow relief is below swimming feet.
  const gravel = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMat, 230);
  for (let i = 0; i < 230; i++) {
    const a = random() * Math.PI * 2, r = 15 + random() * 26, x = Math.cos(a) * r, z = Math.sin(a) * r;
    transform.position.set(x, oceanHeight(x, z) + 0.04, z); transform.scale.set(0.1 + random() * 0.22, 0.05 + random() * 0.12, 0.1 + random() * 0.25);
    transform.rotation.set(0, random() * Math.PI * 2, 0); transform.updateMatrix(); gravel.setMatrixAt(i, transform.matrix);
  }
  root.add(gravel);
  // Cable runs connect the outside junctions to the hull instead of leaving
  // three isolated pylons standing on an empty plane.
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x19282c, roughness: 0.9 });
  for (const [x, z, hx, hz] of [[-13, -5, -10.4, -5], [6, -13, 6, -10.4], [13.5, 6, 10.4, 6]]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(hx, -0.29, hz), new THREE.Vector3((hx + x) / 2 + 0.3, -0.33, (hz + z) / 2 + 0.5), new THREE.Vector3(x, -0.29, z)]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.055, 6, false), cableMat));
  }
  // Deep-water sea fans: restrained, branching silhouettes, not shallow-water kelp.
  const branches = [], upward = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 24; i++) {
    const a = random() * Math.PI * 2, r = 22 + random() * 20, x = Math.cos(a) * r, z = Math.sin(a) * r, y = oceanHeight(x, z), height = 0.4 + random() * 0.9;
    for (let j = 0; j < 7; j++) {
      const start = new THREE.Vector3(x, y + j * height / 9, z), end = new THREE.Vector3(x + (j % 2 ? -1 : 1) * height * (0.3 + j * 0.06), y + height * (0.5 + j * 0.08), z + Math.sin(a) * 0.12);
      branches.push([start, end]);
    }
  }
  const coral = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.025, 1, 5), new THREE.MeshStandardMaterial({ color: 0x786f61, roughness: 1 }), branches.length);
  branches.forEach(([start, end], i) => {
    transform.position.copy(start).add(end).multiplyScalar(0.5); transform.quaternion.setFromUnitVectors(upward, end.clone().sub(start).normalize());
    transform.scale.set(1, start.distanceTo(end), 1); transform.updateMatrix(); coral.setMatrixAt(i, transform.matrix);
  }); root.add(coral);
  return {
    root,
    update() { const q = QUALITY[options.quality].particles; gravel.count = Math.floor(230 * q); coral.count = Math.floor(branches.length * Math.max(0.6, q)); },
    dispose() {
      root.removeFromParent(); const geometries = new Set(), materials = new Set(), textures = new Set();
      root.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { materials.add(m); for (const t of Object.values(m)) if (t?.isTexture) textures.add(t); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    }
  };
}
