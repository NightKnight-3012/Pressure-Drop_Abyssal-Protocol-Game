import * as THREE from "three";

// A real shelter, rather than an abstract finish marker. Local +Z faces the approach.
export function createRecoveryLift() {
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x3e5057, roughness: 0.72, metalness: 0.65 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x172629, roughness: 1 });
  const lamps = new THREE.MeshStandardMaterial({ color: 0x8ce8df, emissive: 0x45b5b0, emissiveIntensity: 2 });
  const shutterLamp = new THREE.MeshStandardMaterial({ color: 0xe8b879, emissive: 0xb96020, emissiveIntensity: 1.5 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  function box(w, h, d, x, y, z, mat = steel) {
    const m = new THREE.Mesh(unitBox, mat); m.scale.set(w, h, d); m.position.set(x, y, z); root.add(m); return m;
  }
  for (const side of [-1, 1]) {
    const cliff = new THREE.Mesh(new THREE.DodecahedronGeometry(18, 1), rock);
    cliff.scale.set(0.8, 2.1, 1.2); cliff.position.set(side * 21, 6, -9); root.add(cliff);
    box(1.4, 15, 18, side * 7, 3, -6);
    box(0.2, 0.18, 24, side * 2.5, -1.2, 2, lamps);
    for (let y = 0; y < 12; y += 3) box(0.25, 0.7, 0.3, side * 6.2, y, 3.2, lamps);
    box(0.16, 50, 0.16, side * 2.8, 23, -6);
  }
  // Open steelwork leaves the ascending camera inside a readable shaft instead
  // of filling the screen with the near face of a solid grey wall.
  for(const x of [-6,6])for(const z of [-14,4])box(.45,55,.45,x,28,z);
  for (let y = 12; y < 55; y += 6) {
    box(12, 0.25, 0.3, 0, y, 4.4);
    box(12, 0.25, 0.3, 0, y, -14);
    for (const side of [-1, 1]) box(0.12, 1.2, 0.12, side * 5.5, y, 4.2, lamps);
  }
  box(15, 1.4, 3, 0, 10.5, 1); box(15, 1, 18, 0, -2, -6);
  for (const side of [-1, 1]) {
    for(let y=12;y<55;y+=6)box(.3,.3,18,side*6.5,y,-6);
    for (let y = 12; y < 55; y += 6) box(0.2, 0.3, 12, side * 6, y, -6, lamps);
  }
  box(12, 12, 1, 0, 4, -15);
  const carrier=box(7, 0.35, 9, 0, -1.1, -3);
  const doors = [-1, 1].map(side => box(6, 12, 0.8, side * 9.1, 4, 5));
  const clamps = [-1, 1].map(side => box(0.6, 1.4, 2, side * 3.7, -0.3, -3));
  const seams = [-1, 1].map(side => box(0.12, 8, 0.1, side * 6.2, 4, 5.48, shutterLamp));
  // One draw per static material; only doors, clamps and seam lights move.
  const moving = new Set([carrier,...doors, ...clamps, ...seams]), batches = new Map();
  for (const mesh of [...root.children]) if (mesh.geometry === unitBox && !moving.has(mesh)) {
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(mesh); root.remove(mesh);
  }
  for (const [material, meshes] of batches) {
    const batch = new THREE.InstancedMesh(unitBox, material, meshes.length);
    meshes.forEach((mesh, i) => { mesh.updateMatrix(); batch.setMatrixAt(i, mesh.matrix); });
    root.add(batch);
  }
  root.add(new THREE.PointLight(0x65d8db, 55, 35));
  return { root, update(progress = 0, capture = progress > 0 ? 1 : 0, rise = 0) {
    const seal = Math.max(0, Math.min(1, progress)), eased = seal * seal * (3 - 2 * seal);
    doors.forEach((d, i) => { d.position.x = (i ? 1 : -1) * (9.1 - eased * 6.1); seams[i].position.x = d.position.x + (i ? -3 : 3); });
    clamps.forEach((c, i) => { c.position.x = (i ? 1 : -1) * (3.7 - Math.max(0, Math.min(1, capture)) * 1.1);c.position.y=rise-.3; });
    carrier.position.y=rise-1.1;
    shutterLamp.emissive.setHex(seal >= 1 ? 0x268f72 : 0xb96020);
  } };
}
