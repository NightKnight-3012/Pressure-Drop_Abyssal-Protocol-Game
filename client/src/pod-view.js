import * as THREE from "three";
import { createRecoveryLift } from "./recovery.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createHorrorLeviathan } from "./leviathan-horror.js";
import { createModelLibrary } from "./models.js";
import { createSurfaces } from "./surfaces.js";
import { options, QUALITY } from "./options.js";
import { createPodSound, sfx } from "./audio.js";
import { POD_VISUAL_SCALE, podMotionTarget } from "./pod-motion.js";
import { POD_ROUTE_LENGTH } from "../../shared/tactical.js";
import { createSeabed } from "./ocean.js";
import { createWreckage } from "./wreckage.js";
import { createPodMonitor } from "./pod-monitor.js";
import {routeFrame} from '../../shared/escape-route.js';
import {createRouteScenery} from './route-scenery.js';

export function createPodView() {
  const surfaces = createSurfaces(); let time = 0;
  const sound = createPodSound(); let progress = null, lane = 0, velocity = 0, kick = 0, previousHull = null, wasBoosting = false, lastPass = -10;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020d16); scene.fog = new THREE.Fog(0x020d16, 15, 220);
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 400);
  camera.rotation.order = "YXZ";
  const aim = new THREE.Object3D(); aim.rotation.order = "YXZ";
  let lift = 0;
  scene.add(new THREE.HemisphereLight(0x6a8f9b, 0x142731, 1.65));
  const lamp = new THREE.SpotLight(0xbed9d8, 155, 220, 0.65, 0.6, 1);
  camera.add(lamp); lamp.target.position.set(0, 0, -30); camera.add(lamp.target); scene.add(camera);
  const cockpit = new THREE.Group(); camera.add(cockpit);
  const metal = new THREE.MeshStandardMaterial({ color: 0x344951, map: surfaces.metal, roughness: 0.48, metalness: 0.5 });
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new RoundedBoxGeometry(0.13, 1.3, 0.12, 2, 0.025), metal);
    strut.position.set(side * 0.87, -0.08, -1.3); strut.rotation.z = side * -0.18; cockpit.add(strut);
  }
  const dashboard = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.3, 0.7, 3, 0.08), metal);
  dashboard.position.set(0, -0.8, -1.2); cockpit.add(dashboard);
  const displayMat = new THREE.MeshStandardMaterial({ color: 0x34626e, emissive: 0x0a2938, emissiveIntensity: 0.8, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const display = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.18, 0.025, 2, 0.02), displayMat);
    display.position.set(side * 0.6, -0.59, -1.25); display.rotation.x = -0.3; cockpit.add(display);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 8, 24, Math.PI * 1.5), metal); rim.position.set(side * 0.86, -0.48, -1.03); cockpit.add(rim);
  }
  const wreckMat = new THREE.MeshStandardMaterial({ color: 0xb1bfbd, map: surfaces.wall, vertexColors: true, side: THREE.DoubleSide, roughness: 0.88, metalness: 0.22 });
  const warningMat = new THREE.MeshStandardMaterial({ color: 0x9c5633, emissive: 0x4b210d, emissiveIntensity: 0.8 });
  const particles = new Float32Array(480 * 3);
  let seed = 882;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < particles.length; i += 3) { particles[i] = (rnd() - 0.5) * 40; particles[i + 1] = rnd() * 13 - 3; particles[i + 2] = rnd() * 100 - 70; }
  const particleGeo = new THREE.BufferGeometry(); particleGeo.setAttribute("position", new THREE.BufferAttribute(particles, 3));
  const marineSnow = new THREE.Points(particleGeo, new THREE.PointsMaterial({ color: 0x6ea1ae, size: 0.04, transparent: true, opacity: 0.42, depthWrite: false })); scene.add(marineSnow);
  const wrecks = new Map();
  const recovery = createRecoveryLift(), extraction = recovery.root; scene.add(extraction);
  const streakData = new Float32Array(100 * 6), streakSeeds = [];
  for (let i = 0; i < 100; i++) streakSeeds.push({ x: (i % 2 ? 1 : -1) * (6 + rnd() * 12), y: rnd() * 12 - 3, z: rnd() * 100 });
  const streakGeo = new THREE.BufferGeometry(); streakGeo.setAttribute("position", new THREE.BufferAttribute(streakData, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: 0x6fc3d9, transparent: true, opacity: 0.12, depthWrite: false });
  const streaks = new THREE.LineSegments(streakGeo, streakMat); streaks.frustumCulled = false; scene.add(streaks);
  const floor = createSeabed(160, 600, true); scene.add(floor);
  const corridor=createRouteScenery();scene.add(corridor.root);
  const creature = createHorrorLeviathan(); creature.root.rotation.y = Math.PI / 2; scene.add(creature.root);
  const monitor = createPodMonitor(scene); let pursuit = false, creatureAt = 0;
  const library = createModelLibrary(); let closed = false;
  library.instantiate("leviathan", [7, 5.2, 22], { uniform: true, fit: true, centered: true }).then(asset => {
    if (!asset) return; if (closed) { library.disposeInstance(asset.root); return; } creature.attach(asset);
  });
  return {
    scene, camera, silence() { sound.dispose(); monitor.hide(); }, pause() { sound.update(0, false, 0); monitor.hide(); },
    render(renderer) { monitor.render(renderer, creature.root, pursuit, () => renderer.render(scene, camera)); },
    update(finale, dt, rear = false, reduced = false, audible = true) {
      if (!finale) return;
      const pod = finale.pod;
      const sealing = pod.phase === "sealing", ascending = pod.phase === "ascent";
      const showRear = !ascending && (rear || sealing && !reduced);
      const motion = podMotionTarget(pod, reduced, showRear), k = 1 - Math.exp(-12 * dt);
      if (audible && motion.boost && !wasBoosting) sfx.podBoost();
      wasBoosting = audible && motion.boost;
      progress ??= pod.progress; progress += (pod.progress - progress) * k;
      const track=routeFrame(progress);corridor.update(progress);corridor.root.visible=!ascending;
      const oldLane = lane; lane += (pod.lane - lane) * k;
      velocity += (((lane - oldLane) / Math.max(dt, 0.001)) - velocity) * k;
      if (previousHull !== null && pod.hull < previousHull) kick = 1;
      previousHull = pod.hull; kick = Math.max(0, kick - dt * 2.5);
      sound.update(audible ? ascending ? 0.35 : motion.speed : 0, motion.boost, motion.danger);
      time += dt; surfaces.update(time, reduced);
      particleGeo.setDrawRange(0, Math.floor(480 * QUALITY[options.quality].particles));
      if (!reduced) { for (let i = 2; i < particles.length; i += 3) { particles[i] += dt * motion.travelSpeed; if (particles[i] > 25) particles[i] -= 100; } particleGeo.attributes.position.needsUpdate = true; }
      lift += ((ascending ? pod.ascentProgress * 35 : 0) - lift) * (1 - Math.exp(-4 * dt));
      extraction.position.set(0, -lift, 12 - (POD_ROUTE_LENGTH - progress) * POD_VISUAL_SCALE);
      recovery.update(ascending ? 1 : sealing ? pod.sealProgress : 0, sealing || ascending ? 1 : pod.dockProgress || 0,lift);
      floor.visible = !ascending;
      streaks.visible = !reduced && motion.speed > 0;
      streakGeo.setDrawRange(0, Math.floor(100 * QUALITY[options.quality].particles) * 2);
      streakMat.opacity = motion.boost ? 0.25 : 0.09;
      for (let i = 0; i < streakSeeds.length; i++) {
        const p = streakSeeds[i], z = 20 - ((p.z - progress * POD_VISUAL_SCALE) % 100 + 100) % 100;
        streakData.set([p.x, p.y, z, p.x, p.y, z - (motion.boost ? 2.8 : 0.8)], i * 6);
      }
      streakGeo.attributes.position.needsUpdate = true;
      camera.position.set(track.x+lane * 4, track.y, 8);
      aim.rotation.set(ascending ? 0.22 : track.pitch-.006, showRear ? Math.PI+track.yaw : track.yaw+(reduced ? 0 : -velocity * 0.006), 0);
      camera.quaternion.slerp(aim.quaternion, 1 - Math.exp(-(sealing || ascending ? 4 : rear ? 8 : 12) * dt));
      if (!reduced && !showRear && !ascending && !sealing) {
        camera.rotation.z = -velocity * 0.055 + Math.sin(time * 39) * (motion.boost ? 0.004 : 0.0015) + Math.sin(time * 57) * kick * 0.008;
        camera.position.y += Math.sin(time * 26) * (motion.boost ? 0.018 : 0.005) + Math.sin(time * 45) * kick * 0.02;
      }
      const fov = reduced ? 68 : camera.fov + (motion.fov - camera.fov) * (1 - Math.exp(-5 * dt));
      if (Math.abs(fov - camera.fov) > 0.001) { camera.fov = fov; camera.updateProjectionMatrix(); }
      cockpit.visible = !showRear && !ascending;
      const seen = new Set();
      for (const gate of pod.route) {
        seen.add(gate.at);
        let mesh = wrecks.get(gate.at);
        if (!mesh) {
          mesh = createWreckage(wreckMat, warningMat, gate.at);
          mesh.rotation.y = gate.lane * 0.12;
          mesh.userData.lane = gate.lane;
          scene.add(mesh); wrecks.set(gate.at, mesh);
        }
        const frame=routeFrame(gate.at),ahead=gate.at-progress;
        mesh.rotation.y=frame.yaw+gate.lane*.12;
        const fall=gate.kind==='falling'?8*(1-THREE.MathUtils.smoothstep(10-ahead,0,6)):0;
        mesh.position.set(frame.x+gate.lane * 4, frame.y-1+fall, 8 - ahead * POD_VISUAL_SCALE);
        mesh.rotation.z=gate.kind==='falling'?(reduced?0:Math.sin(Math.max(0,10-ahead)*.4)*.09):0;
      }
      for (const [at, mesh] of wrecks) {
        mesh.position.z = 8 - (at - progress) * POD_VISUAL_SCALE;
        if (!seen.has(at) && progress > at + 0.8) {
          const clearance = Math.abs(lane - mesh.userData.lane);
          if (audible && pod.status === "running" && clearance >= 0.52 && clearance < 1.3 && time - lastPass > 1.5) { lastPass = time; sfx.podPass(); if (!reduced) kick = Math.max(kick, 0.16); }
          scene.remove(mesh); mesh.traverse(o => o.geometry?.dispose()); wrecks.delete(at);
        }
      }
      creature.root.visible = !ascending && (showRear || camera.rotation.y > 0.3) && finale.creature.target === "pod" && pod.status === "running";
      const chaseTrack=routeFrame(progress-(pod.creatureDistance+11)/POD_VISUAL_SCALE);
      creature.root.rotation.y=Math.PI/2+chaseTrack.yaw;
      creature.root.position.set(chaseTrack.x+pod.lane * 4 + 0.5, chaseTrack.y+.3, Math.max(8 + pod.creatureDistance + 11, extraction.position.z + 17));
      pursuit = !ascending && finale.creature.target === "pod" && pod.status === "running";
      if (pursuit && (creature.root.visible || time - creatureAt >= 0.1)) { creature.update(pod.creatureDistance < 9 ? "attack" : "approach", Math.min(0.15, time - creatureAt), reduced); creatureAt = time; }
      monitor.update(pod, pursuit, lane, showRear, time, kick === 1);
    },
    resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); },
    dispose() {
      closed = true; sound.dispose(); monitor.dispose(); creature.dispose(); surfaces.dispose();
      wreckMat.dispose(); warningMat.dispose();
      const textures = new Set();
      scene.traverse(o => { if (o.isInstancedMesh) o.dispose(); o.geometry?.dispose(); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); m.dispose(); } });
      textures.forEach(t => t.dispose());
      library.dispose();
    }
  };
}
