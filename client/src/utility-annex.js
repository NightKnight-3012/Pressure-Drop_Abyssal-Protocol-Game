import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ANNEX_DECKS, ANNEX_MACHINERY} from '../../shared/layout.js';

export function addUtilityAnnex(scene, surfaces, height) {
  const materials = [
    new THREE.MeshStandardMaterial({color:0x61727a, map:surfaces.grating ?? null, roughness:.78, metalness:.45}),
    new THREE.MeshStandardMaterial({color:0x263e48, map:surfaces.wall ?? null, roughness:.67, metalness:.52}),
    new THREE.MeshStandardMaterial({color:0x93674a, roughness:.5, metalness:.65}),
    new THREE.MeshStandardMaterial({color:0xae9b6d, map:surfaces.hazard ?? null, roughness:.72}),
    new THREE.MeshStandardMaterial({color:0x7fa6b0, emissive:0x53848f, emissiveIntensity:1.6})
  ];
  const batches = materials.map(() => []);
  function put(geo, material, x, y, z, roll=0) {
    geo.rotateZ(roll);
    geo.translate(x, y, z);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if (flat !== geo) geo.dispose();
    batches[material].push(flat);
  }
  const box = (m,x,y,z,w,h,d) => put(new THREE.BoxGeometry(w,h,d),m,x,y,z);
  const cylinder = (m,x,y,z,r,h,roll=0) => put(new THREE.CylinderGeometry(r,r,h,16),m,x,y,z,roll);

  for (const {cx,cz,w,d} of ANNEX_DECKS) {
    box(0,cx,-.17,cz,w,.34,d);
    box(1,cx,height,cz,w,.24,d);
  }
  for (const x of [10.25, 12.5, 15.75, 20.8, 25.65]) {
    box(1,x,3.36,-8.2,.26,.5,2.52);
    box(4,x,3.08,-8.2,.13,.045,1.15);
    box(3,x,.015,-8.2,.18,.025,2.2);
  }
  for (const z of [-9.05,-7.34]) cylinder(2,17.9,3.38,z,.12,15.6,Math.PI/2);

  for (const machine of ANNEX_MACHINERY) {
    const {id,x,z,w,d} = machine;
    box(1,x,.16,z,w,.32,d);
    box(3,x,.31,z,w,.14,d-.08);
    if (id === 'compressor') {
      cylinder(2,x,1.52,z,.66,1.9);
      for (const y of [.7,1.35,2.25]) cylinder(1,x,y,z,.72,.14);
      cylinder(2,x,2.8,z,.19,.82);
    } else if (id === 'scrubber') {
      for (const dx of [-.62,0,.62]) {
        cylinder(1,x+dx,1.57,z,.26,2.25);
        cylinder(2,x+dx,1.96,z,.295,.16);
      }
      cylinder(2,x,2.82,z,.18,1.8,Math.PI/2);
    } else if (id === 'isolation') {
      box(1,x,1.33,z,1.7,1.9,1.12);
      for (const dx of [-.62,0,.62]) cylinder(2,x+dx,1.75,z+.59,.11,1.85);
      cylinder(2,x,2.76,z+.59,.16,1.85,Math.PI/2);
    } else {
      cylinder(1,x,1.27,z,.72,1.9,Math.PI/2);
      for (const dx of [-.76,0,.76]) cylinder(2,x+dx,1.27,z,.76,.15,Math.PI/2);
      box(1,x,2.15,z,.58,.9,.54);
      box(4,x,2.48,z+.29,.36,.13,.05);
    }
  }
  const root = new THREE.Group();
  root.name = 'NEREID / East utility annex';
  batches.forEach((parts,i) => {
    if (parts.length) root.add(new THREE.Mesh(mergeGeometries(parts),materials[i]));
    parts.forEach(part => part.dispose());
  });
  scene.add(root);
  return root;
}
