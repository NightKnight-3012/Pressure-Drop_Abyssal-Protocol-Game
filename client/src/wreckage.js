import * as THREE from "three";
import { oceanNoise } from "./ocean.js";

export function wreckPanelGeometry(width = 2.8, height = 4.8, seed = 1) {
  const columns = 18, rows = 24, positions = [], colors = [], uv = [], indices = [];
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
    const u = x / columns, v = y / rows;
    const tear = (y === 0 || y === rows ? 0.22 : 0.025) * Math.sin(x * 2.7 + seed);
    positions.push((u - 0.5) * width, (v - 0.5) * height + tear, (u - 0.5) ** 2 * 1.4 + Math.sin(v * 5 + seed) * 0.08);
    const rust = THREE.MathUtils.smoothstep(oceanNoise(u * 7 + seed, v * 9), 0.48, 0.76);
    colors.push(0.46 + rust * 0.14, 0.56 - rust * 0.23, 0.58 - rust * 0.32); uv.push(u, v);
    if (x < columns && y < rows) {
      // Irregular puncture, small enough that a pod cannot pass through it.
      const hole = ((u - 0.63) / 0.11) ** 2 + ((v - 0.63) / 0.1) ** 2;
      if (hole < 1 + Math.sin(x * 7 + y) * 0.17) continue;
      const a = y * (columns + 1) + x, b = a + columns + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function createWreckage(material, warningMaterial, seed = 1) {
  const group = new THREE.Group(); group.name = "Torn pressure-hull section";
  const panel = new THREE.Mesh(wreckPanelGeometry(2.8, 4.8, seed), material); group.add(panel);
  const spine = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.3, -2.4, 0.4), new THREE.Vector3(-1.45, -0.4, 0.3), new THREE.Vector3(-1.3, 1.6, 0.4), new THREE.Vector3(-1.05, 2.45, 0.7)]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(spine, 16, 0.07, 6, false), material));
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(0.9, 2.3, 0.2), new THREE.Vector3(1.1, 1.2, 0.65), new THREE.Vector3(0.85, 0.4, 0.6), new THREE.Vector3(1.3, -0.3, 0.9)]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 18, 0.027, 5, false), material));
  if (warningMaterial) for (let i = 0; i < 5; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.07, 0.025), warningMaterial);
    strip.position.set(-1.1 + i * 0.5, 1.25, ((-1.1 + i * 0.5) / 2.8) ** 2 * 1.4 + 0.12); strip.rotation.z = -0.12; group.add(strip);
  }
  return group;
}
