import * as THREE from "three";
import { createLeviathanAnimation } from "./leviathan-visual.js";
import { swimWave } from "./leviathan-motion.js";

// Horror silhouette and anatomy are local, so the old cartoon can never appear
// while an asset loads. The CC0 imported mesh becomes the creature's cranial shell.
export function createHorrorLeviathan() {
  const root = new THREE.Group();
  root.name = "Abyssal Leviathan";
  const skin = new THREE.MeshStandardMaterial({ color: 0x182326, roughness: 0.54, metalness: 0.12 });
  const ridge = new THREE.MeshStandardMaterial({ color: 0x293437, roughness: 0.75 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xa8a58a, roughness: 0.68 });
  const throatMat = new THREE.MeshStandardMaterial({ color: 0x10090d, roughness: 0.95 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x743b30, emissive: 0x8b2817, emissiveIntensity: 0.5, roughness: 0.3 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x283e3e, emissive: 0x173d3c, emissiveIntensity: 0.3 });
  const sphere = new THREE.SphereGeometry(1, 28, 18);
  function ellipsoid(parent, material, position, scale) {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh);
    return mesh;
  }

  // Tapered continuous body; its silhouette bends as a travelling wave rather
  // than rotating an entire cone around a detached pivot.
  const rings = 58, sides = 20;
  const positions = new Float32Array((rings + 1) * (sides + 1) * 3);
  const radii = [], rest = [], indices = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings, x = 5.7 - u * 21;
    const radius = 1.5 * Math.pow(1 - u, 0.85) + 0.035;
    radii.push(radius); rest.push(x);
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2, offset = (i * (sides + 1) + j) * 3;
      const ribs = 1 + Math.sin(a * 5 + u * 22) * 0.035;
      positions.set([x, Math.sin(a) * radius * 0.83 * ribs, Math.cos(a) * radius * ribs], offset);
      if (i < rings && j < sides) {
        const p = i * (sides + 1) + j, q = p + sides + 1;
        indices.push(p, q + 1, q, p, p + 1, q + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const body = new THREE.Mesh(geometry, skin); body.name = "Leviathan spine"; body.frustumCulled = false; root.add(body);
  const skull = new THREE.Group(); skull.position.x = 5.5; root.add(skull);
  // Open maxilla: a continuous upper skull around the mouth, never a solid
  // sphere covering the throat or a separate plate floating above the teeth.
  const shellPoints = [], shellIndices = [], shellRings = 14, shellSides = 24;
  for (let i = 0; i <= shellRings; i++) for (let j = 0; j <= shellSides; j++) {
    const u = i / shellRings, a = -0.1 + j / shellSides * (Math.PI + 0.2);
    const radius = 1.35 + Math.sin(u * Math.PI) * 0.15 - (1 - u) * 0.15;
    shellPoints.push(-1.1 + u * 3.3, 0.12 + Math.sin(a) * radius * 0.85, Math.cos(a) * radius);
    if (i < shellRings && j < shellSides) {
      const p = i * (shellSides + 1) + j, q = p + shellSides + 1;
      shellIndices.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const shellGeometry = new THREE.BufferGeometry();
  shellGeometry.setAttribute("position", new THREE.Float32BufferAttribute(shellPoints, 3));
  shellGeometry.setIndex(shellIndices); shellGeometry.computeVertexNormals();
  skull.add(new THREE.Mesh(shellGeometry, skin));
  ellipsoid(skull, throatMat, [1.15, -0.15, 0], [0.35, 0.98, 1.07]);
  const jaw = new THREE.Group(); jaw.name = "Leviathan jaw"; jaw.position.set(-0.35, -0.8, 0); skull.add(jaw);
  ellipsoid(jaw, skin, [1.5, -0.24, 0], [1.65, 0.18, 1.32]);
  ellipsoid(jaw, throatMat, [1.7, 0.025, 0], [1.2, 0.1, 1.17]);

  const toothGeometry = new THREE.ConeGeometry(1, 1, 7);
  const upward = new THREE.Vector3(0, 1, 0);
  for (const upper of [true, false]) for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 17; i++) {
      const a = (i + 0.4) / 17.8 * Math.PI;
      const length = (0.85 + (Math.sin(i * 7.3 + row) + 1) * 0.4) * (row ? 0.58 : 1);
      const base = new THREE.Vector3((upper ? 2.12 : 2.35) - row * 0.26 - (1 - Math.sin(a)) * 0.55,
        upper ? 0.12 + Math.sin(a) * 0.88 : 0.13, Math.cos(a) * (1.24 - row * 0.2));
      const direction = new THREE.Vector3(0.14 + Math.sin(i * 3.7) * 0.14, upper ? -1 : 1, -Math.cos(a) * 0.34 + Math.sin(i * 5.1) * 0.13).normalize();
      const tooth = new THREE.Mesh(toothGeometry, toothMat);
      tooth.scale.set(0.052 + (i % 3) * 0.01, length, 0.052);
      tooth.quaternion.setFromUnitVectors(upward, direction);
      tooth.position.copy(base).addScaledVector(direction, length / 2);
      (upper ? skull : jaw).add(tooth);
    }
  }
  // Eyes are recessed pinpoints under a brow, with no visible white eyeballs.
  for (const side of [-1, 1]) {
    ellipsoid(skull, eyeMat, [1.32, 0.83, side * 1.32], [0.17, 0.04, 0.035]);
    const brow = ellipsoid(skull, skin, [1.24, 0.94, side * 1.29], [0.65, 0.075, 0.12]);
    brow.rotation.x = side * 0.12;
    for (let i = 0; i < 5; i++) {
      const gill = ellipsoid(root, throatMat, [3.25 - i * 0.28, 0.1, side * (1.31 + i * 0.025)], [0.07, 0.62, 0.04]);
      gill.rotation.z = -0.22;
    }
  }
  const fins = [];
  function fin(x, radius, side = 0) {
    const shape = new THREE.Shape();
    shape.moveTo(0.7, 0); shape.quadraticCurveTo(-0.12, radius * 0.3, -0.5, radius);
    shape.lineTo(-0.65, radius * 0.6); shape.lineTo(-0.93, radius * 0.5);
    shape.lineTo(-0.83, radius * 0.32); shape.quadraticCurveTo(-1.1, radius * 0.23, -1.8, 0); shape.closePath();
    const material = ridge.clone(); material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    const bodyRadius = 1.5 * Math.pow(Math.max(0, (x + 15.3) / 21), 0.85) + 0.035;
    mesh.position.set(x, side ? -0.35 : bodyRadius * 0.83, side * 0.8);
    if (side) mesh.rotation.x = side * 1.15;
    root.add(mesh); fins.push({ mesh, x, side });
  }
  for (let i = 0; i < 10; i++) fin(3.5 - i * 1.5, 1.2 * (1 - i / 12));
  fin(2.2, 2.1, -1); fin(2.2, 2.1, 1);
  const tailFin = new THREE.Group(); root.add(tailFin);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.5, 0); tailShape.lineTo(-1.5, 1.8); tailShape.lineTo(-1.05, 0.2);
  tailShape.lineTo(-1.7, -1.2); tailShape.closePath();
  const tailMaterial = ridge.clone(); tailMaterial.side = THREE.DoubleSide;
  tailFin.add(new THREE.Mesh(new THREE.ShapeGeometry(tailShape), tailMaterial));
  const marks = [];
  for (let i = 0; i < 12; i++) for (const side of [-1, 1]) {
    const x = 3 - i * 1.35, radius = 1.5 * Math.pow(Math.max(0, (x + 15.3) / 21), 0.85);
    const mark = ellipsoid(root, glowMat, [x, 0.3, side * radius], [0.06, 0.04, 0.05]);
    marks.push({ mesh: mark, x, side, radius });
  }
  const ownedMaterials = new Set();
  let sourceAnimation = null, sourceRoot = null, smallBones = [];
  let time = 0, opening = 0;
  const wave = swimWave;
  return {
    root,
    attach(asset) {
      // Keep the downloaded anatomy, but remove its colourful atlas and suppress
      // the exaggerated eyes/lure. No source file or gameplay state is changed.
      asset.root.rotation.y = Math.PI / 2;
      asset.model.traverse(o => {
        if (o.isBone && /^(LeftEye|RightEye|Head)$/.test(o.name)) smallBones.push(o);
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        o.material = skin.clone(); ownedMaterials.add(o.material);
        o.frustumCulled = false;
      });
      for (const bone of smallBones) bone.scale.setScalar(0.06);
      asset.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(asset.root), size = box.getSize(new THREE.Vector3());
      asset.root.scale.multiply(new THREE.Vector3(4.4 / Math.max(size.x, 0.01), 2.1 / Math.max(size.y, 0.01), 2.8 / Math.max(size.z, 0.01)));
      asset.root.updateMatrixWorld(true);
      const center = new THREE.Box3().setFromObject(asset.root).getCenter(new THREE.Vector3());
      asset.root.position.sub(center);
      const shell = new THREE.Group(); shell.position.set(4.95, 0.2, 0); shell.add(asset.root); root.add(shell);
      sourceRoot = asset.model;
      sourceAnimation = createLeviathanAnimation(sourceRoot, asset.clips, { swim: "idle" });
    },
    update(state, dt, reduced = false) {
      time += Math.min(Math.max(dt, 0), 0.1) * (state === "approach" || state === "attack" ? 1.3 : 1);
      opening += ((state === "attack" ? 0.42 : state === "approach" ? 0.2 : 0.06) - opening) * (1 - Math.exp(-5 * dt));
      jaw.rotation.z = -opening;
      eyeMat.emissiveIntensity = state === "attack" ? 1.2 : 0.5;
      const attribute = geometry.attributes.position;
      for (let i = 0; i <= rings; i++) for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2, offset = i * (sides + 1) + j;
        attribute.setZ(offset, Math.cos(a) * radii[i] * (1 + Math.sin(a * 5 + i / rings * 22) * 0.035) + wave(rest[i], time));
      }
      attribute.needsUpdate = true; geometry.computeVertexNormals();
      for (const f of fins) f.mesh.position.z = f.side * 0.8 + wave(f.x, time);
      for (const m of marks) m.mesh.position.z = m.side * m.radius + wave(m.x, time);
      tailFin.position.set(-15.3, 0, wave(-15.3, time));
      tailFin.rotation.y = Math.cos(time * 1.4 - 7.35) * 0.22;
      sourceAnimation?.update(state, dt);
      for (const bone of smallBones) bone.scale.setScalar(0.06);
      // Cosmetic attack motion is subdued when reduced effects are enabled.
      skull.rotation.z = reduced ? 0 : state === "attack" ? Math.sin(time * 2.2) * 0.025 : 0;
    },
    dispose() {
      sourceAnimation?.dispose();
      // Scene traversal owns geometry/material disposal, including imported ones.
      ownedMaterials.clear(); smallBones = []; sourceRoot = null;
    }
  };
}
