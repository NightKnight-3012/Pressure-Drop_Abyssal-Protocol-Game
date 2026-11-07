import * as THREE from "three";
import { createModelLibrary } from "./models.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createHorrorLeviathan } from "./leviathan-horror.js";
import { FINALE_POINTS } from "../../shared/tactical.js";
import {CIRCUITS} from '../../shared/fieldwork.js';
import { createSurfaces, addStationStructure } from "./surfaces.js";
import { options, QUALITY } from "./options.js";
import { initialLeviathanYaw, leviathanYaw, leviathanClearance, turnLeviathan } from "./leviathan-motion.js";
import { createOcean, oceanHeight } from "./ocean.js";
import { createWreckage } from "./wreckage.js";
import { createEscapeCraft, fitEscapeCraft } from "./escape-craft.js";
import { createStationDetail, ROOM_LIGHT_COLORS } from "./station-detail.js";
import { createPowerUnit } from "./power-unit.js";
import {createStationExterior} from './station-exterior.js';
import { createEquipmentView } from './equipment-view.js';
import { createLockerView } from './locker-view.js';
import { createResourceView } from './resource-view.js';
import { SALVAGE } from '../../shared/salvage.js';
import {createStoryView} from './story-view.js';
import {createThreatView} from './threat-view.js';
import {createSubView} from './sub-view.js';
import {createExplorationView} from './exploration-view.js';
import {
  WALLS, POD, STATIONS, STATION_IDS, WINDOWS, WINDOW_W, WINDOW_Y0, WINDOW_Y1, DOOR_SLABS, ROOM_IDS, ROOMS,
  INNER, HUB, HULL_OUT, SERVICE_PORTALS, ROOM_PARTITIONS, EXT_LIMIT
} from "../../shared/layout.js";

const WALL_H = 4;
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.1, ...extra });

function makeLabel(text, color, width = 512, height = 96, font = "bold 38px monospace") {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext("2d");
  g.fillStyle = color; g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, width / 2, height / 2, width - 20);
  return new THREE.CanvasTexture(canvas);
}
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.25)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const LOOK = {
  idle: 0x70eaff, door: 0xffd166, locked: 0xff9f43, holding: 0xffffff, done: 0x4a6b5a, alert: 0xff4a4a
};

export function buildWorld(scene) {
  const equipment = createEquipmentView(scene);
  const lockerView = createLockerView(scene);
  const resourceView = createResourceView(scene);
  const storyView=createStoryView(scene);
  const threatView=createThreatView(scene);
  const subView=createSubView(scene);
  const surfaces = createSurfaces(); addStationStructure(scene);
  const exploration = createExplorationView(scene,surfaces);
  createStationExterior(scene);
  const detail = createStationDetail(scene);
  const glow = glowTexture();
  const models = createModelLibrary();
  let disposed = false;
  const emergencyLooks = {};
  const labels = [], labelPosition = new THREE.Vector3();
  let focusedTarget = null;
  function replaceWithModel(id, parent, fallback, size, position = [0, 0, 0]) {
    models.instantiate(id, size).then(asset => {
      if (!asset) return;
      if (disposed) { models.disposeInstance(asset.root); return; }
      asset.root.position.set(...position);
      parent.add(asset.root);
      fallback.visible = false;
    });
  }

  // ================================================================ station shell
  const base = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.35, 20.4), std(0x17242d));
  base.position.y = -0.2;
  scene.add(base);
  const plate = (cx, cz, color, map) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(INNER, 0.03, INNER), std(color, { roughness: 0.57, metalness: 0.3, map }));
    m.position.set(cx, 0, cz);
    scene.add(m);
  };
  const c = INNER / 2;
  plate(-c, -c, 0x687f81, surfaces.metal); plate(c, -c, 0x7a8278, surfaces.grating); plate(-c, c, 0x82988c, surfaces.tile); plate(c, c, 0x8a8979, surfaces.diamond);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(20.4, 20.4), std(0x26363c, { side: THREE.DoubleSide, map: surfaces.metal }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_H;
  scene.add(ceiling);

  const wallMat = std(0x3c5360, { map: surfaces.wall, roughness: 0.66, metalness: 0.3 });
  for (const w of WALLS.slice(4)) { // inner cross walls
    const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, WALL_H, w.d), wallMat);
    m.position.set(w.cx, WALL_H / 2, w.cz);
    scene.add(m);
  }
  for(const p of SERVICE_PORTALS) {
    const horizontal=p.axis==='x';
    const lintel=new THREE.Mesh(new THREE.BoxGeometry(horizontal?2.15:.4,.65,horizontal?.4:2.15),wallMat);
    lintel.position.set(p.x,3.68,p.z);scene.add(lintel);
  }
  for(const p of ROOM_PARTITIONS) {
    const panel=new THREE.Mesh(new RoundedBoxGeometry(p.w,p.h,p.d,2,.035),std(p.room==='medical'?0x7d9690:0x344c54,{map:surfaces.wall}));
    panel.position.set(p.cx,p.h/2,p.cz);scene.add(panel);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(p.w+.08,.08,p.d+.08),std(0x7c918e,{metalness:.55}));cap.position.set(p.cx,p.h,p.cz);scene.add(cap);
  }

  // Outer walls with observation windows (collision is still the full wall; windows are visual).
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2a6f8f, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.6, emissive: 0x06202c, side: THREE.DoubleSide
  });
  const frameMat = std(0x1c2c35, { metalness: 0.4 });
  function outerWall(side) {
    const horizontal = side === "N" || side === "S";        // wall runs along x
    const fixed = side === "N" || side === "W" ? -10 : 10;   // z (or x) of the wall's centre line
    const wins = WINDOWS.filter((w) => w.wall === side).sort((a, b) => a.c - b.c);
    const place = (u0, u1, y0, y1, mat) => {
      if (u1 - u0 < 0.01) return;
      const len = u1 - u0, uc = (u0 + u1) / 2, h = y1 - y0;
      const m = new THREE.Mesh(horizontal ? new THREE.BoxGeometry(len, h, 0.4) : new THREE.BoxGeometry(0.4, h, len), mat);
      m.position.set(horizontal ? uc : fixed, y0 + h / 2, horizontal ? fixed : uc);
      scene.add(m);
    };
    place(-HULL_OUT, HULL_OUT, 0, WINDOW_Y0, wallMat);
    place(-HULL_OUT, HULL_OUT, WINDOW_Y1, WALL_H, wallMat);
    let cursor = -HULL_OUT;
    for (const w of wins) {
      place(cursor, w.c - WINDOW_W / 2, WINDOW_Y0, WINDOW_Y1, wallMat);
      cursor = w.c + WINDOW_W / 2;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW_W, WINDOW_Y1 - WINDOW_Y0), glassMat);
      pane.position.set(horizontal ? w.c : fixed, (WINDOW_Y0 + WINDOW_Y1) / 2, horizontal ? fixed : w.c);
      if (!horizontal) pane.rotation.y = Math.PI / 2;
      scene.add(pane);
      place(w.c - WINDOW_W / 2 - 0.05, w.c - WINDOW_W / 2 + 0.05, WINDOW_Y0, WINDOW_Y1, frameMat);
      place(w.c + WINDOW_W / 2 - 0.05, w.c + WINDOW_W / 2 + 0.05, WINDOW_Y0, WINDOW_Y1, frameMat);
    }
    place(cursor, HULL_OUT, WINDOW_Y0, WINDOW_Y1, wallMat);
  }
  for (const s of ["N", "S", "E", "W"]) outerWall(s);

  // The existing crate solids are furnished by station-detail.js with useful equipment.

  // ---- escape pod
  const craft = createEscapeCraft();
  const pod = fitEscapeCraft(craft, [POD.w, POD.h - 0.35, POD.d], Math.PI / 2);
  pod.position.set(POD.cx, 0.35, POD.cz);
  scene.add(pod);
  const podDoorMat = new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff2a1a, emissiveIntensity: 1.6 });
  const podDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.06), podDoorMat);
  podDoor.position.set(POD.cx, 1.0, POD.cz - POD.d / 2 - 0.02);
  podDoor.rotation.y = Math.PI;
  scene.add(podDoor);

  // ================================================================ stations
  const stations = new Map(),workPanels=new Map();
  function addLabel(group, text, y, id) {
    const junction=STATIONS[id]?.junction,small=STATIONS[id]?.kind==='door';
    const width=small?.62:.88,height=width/8;
    const texture=makeLabel(text.toUpperCase(), '#bfeaf5',512,64,'bold 38px monospace');
    const plate=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
    const mountY=junction?2.45:id==='capsule'?1.75:small?1.38:1.48,mountZ=junction?.27:id==='capsule'?.51:id==='power'?.32:.195;
    plate.name='Mounted equipment label / '+id;plate.position.set(0,mountY,mountZ);
    if(junction){const back=new THREE.Mesh(new THREE.BoxGeometry(width+.06,height+.06,.08),std(0x142a34));back.position.set(0,mountY,.23);group.add(back);}
    labels.push({sprite:plate,width,aspect:8,id});group.add(plate);
  }
  for (const id of STATION_IDS) {
    const def = STATIONS[id];
    const group = new THREE.Group();
    const screenMat = new THREE.MeshStandardMaterial({ color: LOOK.idle, emissive: LOOK.idle, emissiveIntensity: 1.8 });
    const beaconMat = new THREE.SpriteMaterial({ map: glow, color: LOOK.idle, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const beacon = new THREE.Sprite(beaconMat);
    if (def.junction) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3.0, 10), std(0x20323b, { metalness: 0.5 }));
      pylon.position.y = 1.5;
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), screenMat);
      node.position.y = 3.2;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), std(0x1a2a32));
      foot.position.y = 0.2;
      group.add(pylon, node, foot);
      beacon.position.set(0, 3.2, 0); beacon.scale.set(3, 3, 1);
      addLabel(group, def.label, 4.1, id);
    } else {
      const small = def.kind === "door";
      const body = new THREE.Mesh(new RoundedBoxGeometry(small ? 0.7 : 1.0, small ? 0.8 : 1.1, 0.3, 3, 0.05), std(0x142a34));
      body.position.y = 1.1;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(small ? 0.45 : 0.7, small ? 0.3 : 0.45, 0.05), screenMat);
      screen.position.set(0, small ? 1.15 : 1.2, 0.16);
      group.add(body, screen);
      if (id === "power") {
        body.visible = false;group.add(createPowerUnit(screenMat, surfaces.hazard));
        screen.scale.set(.48,.65,1);screen.position.set(0,1.25,.28);
      } else if (!small && def.kind !== "airlock") {
        const modelId = id === "power" || id === "o2" ? "battery" : id === "pump" || id === "lifesupport" ? "pipes" : "computer";
        // Keep equipment inside the original panel footprint and retain its status display.
        replaceWithModel(modelId, group, body, [1.0, 1.4, 0.3], [0, 0.35, 0]);
      }
      beacon.position.set(0, 2.5, 0.2); beacon.scale.set(1.8, 1.8, 1);
      addLabel(group, def.label, small ? 1.85 : 2.0, id);
    }
    group.add(beacon);
    group.position.set(def.x, 0, def.z);
    group.rotation.y = def.rot;
    scene.add(group);
    stations.set(id, { def, group, screenMat, beaconMat, beacon });
    workPanels.set(id,{def,group});
  }
  for (const [id, def] of Object.entries(FINALE_POINTS)) {
    const group = new THREE.Group(); group.position.set(def.x, 0, def.z); group.rotation.y = def.rot;
    const material = new THREE.MeshStandardMaterial({ color: 0x6d6150, emissive: 0x503d20, emissiveIntensity: 0.4, metalness: 0.4, roughness: 0.65 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.9, def.kind === "capsule" ? 1.6 : 0.85, 0.18, 3, 0.07), std(0x1d2d35));
    body.position.set(0, 1.1, 0);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.32), material); screen.position.set(0, 1.25, 0.1);
    group.add(body, screen); addLabel(group, def.label, 2.15, id); scene.add(group);
    if (id === "capsule") {
      const lifeboat = createEscapeCraft({ compact:true }); lifeboat.root.rotation.set(-Math.PI/2,0,Math.PI);
      const stowed = fitEscapeCraft(lifeboat,[1.2,1.7,0.5]); stowed.position.set(0,0.25,0.22); group.add(stowed); body.visible=false;
      screen.scale.set(0.45,0.25,1); screen.position.z=0.5;
    }
    emergencyLooks[id] = material;
    workPanels.set(id,{def,group});
  }
  const targetMarker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.27, 28), new THREE.MeshBasicMaterial({ color: 0xb8eaf0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  targetMarker.rotation.x = -Math.PI / 2; targetMarker.visible = false; scene.add(targetMarker);
  function setTarget(id) {
    focusedTarget = id;
    const point = STATIONS[id] || FINALE_POINTS[id];
    targetMarker.visible = !!point;
    if (point) targetMarker.position.set(point.x, 0.045, point.z);
  }
  function setStationLook(id, look, visible = true) {
    const s = stations.get(id);
    if (!s) return;
    s.group.visible = visible;
    const color = LOOK[look] ?? LOOK.idle;
    s.screenMat.color.setHex(color); s.screenMat.emissive.setHex(color);
    s.screenMat.emissiveIntensity = look === "done" ? 0.35 : look === "holding" ? 2.6 : 1.8;
    s.beaconMat.color.setHex(color);
    s.beacon.visible = s.def.kind === "door" ? look === "alert" : look === "idle" || look === "holding" || look === "alert";
  }

  // ================================================================ blast doors (animated slabs)
  const doorBase = new THREE.MeshStandardMaterial({ color: 0x37454d, roughness: 0.5, metalness: 0.6, emissive: 0x442a00, emissiveIntensity: 0.6 });
  const doors = {};
  for (const room of ROOM_IDS) {
    const meshes = DOOR_SLABS[room].map((b) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(b.maxX - b.minX, WALL_H, b.maxZ - b.minZ, 2, 0.035), doorBase.clone());
      m.position.set((b.minX + b.maxX) / 2, 0.04, (b.minZ + b.maxZ) / 2);
      m.scale.y = 0.02; m.visible = false;
      scene.add(m);
      return m;
    });
    doors[room] = { meshes, t: 0 };
  }

  // ================================================================ lights
  const lightSpots = [[-5, -5], [5, -5], [-5, 5], [5, 5], [0, 0]].map(([x,z],i)=>[x,z,ROOM_LIGHT_COLORS[i]]);
  const lights = lightSpots.map(([x, z, color]) => {
    const light = new THREE.PointLight(color, 14, 13, 1.5);
    light.position.set(x, 3.4, z);
    scene.add(light);
    const fixtureMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 });
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.38), fixtureMat);
    fixture.position.set(x, 3.95, z);
    scene.add(fixture);
    return { light, fixtureMat, baseColor: color, flickerUntil: 0 };
  });
  let power = false;
  const alertColor = new THREE.Color(0xff2a1a);
  const tmpColor = new THREE.Color();
  function updateLights(threat, alert, now, reduced, state) {
    const t = threat / 100;
    const chance = reduced ? 0 : 0.002 + t * 0.008;
    for (const l of lights) {
      if (now > l.flickerUntil && Math.random() < chance) l.flickerUntil = now + 50 + Math.random() * 160;
      const flickering = !reduced && now < l.flickerUntil;
      l.light.intensity = (power ? 14 : 6.5) * (flickering ? 0.65 : 1 - t * 0.18);
      const room=ROOM_IDS.find(r=>ROOMS[r].sx===Math.sign(l.light.position.x)&&ROOMS[r].sz===Math.sign(l.light.position.z));
      const isolated=room&&(state.roomCircuits?.[room]===false||state.empRooms?.[room]>state.t);
      if(isolated)l.light.intensity=.5;
      l.fixtureMat.emissiveIntensity = flickering ? 0.5 : power ? 1.4 : 0.8;
      if(isolated)l.fixtureMat.emissiveIntensity=.05;
      tmpColor.setHex(power ? l.baseColor : 0xd09862);
      if (alert > 0) tmpColor.lerp(alertColor, reduced ? alert * 0.65 : alert * (0.5 + 0.5 * Math.sin(now / 260)));
      l.light.color.copy(tmpColor); l.fixtureMat.color.copy(tmpColor); l.fixtureMat.emissive.copy(tmpColor);
    }
  }

  // ================================================================ water (per room, L-shaped) + hub
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x15637a, transparent: true, opacity: 0.48, roughness: 0.17, metalness: 0.38, normalMap: surfaces.water, normalScale: new THREE.Vector2(0.45, 0.45), side: THREE.DoubleSide, depthWrite: false });
  const planes = {};
  function waterPlane(cx, cz, w, d) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), waterMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0, cz);
    m.renderOrder = 2; m.visible = false;
    scene.add(m);
    return m;
  }
  for (const room of ROOM_IDS) {
    const { sx, sz } = ROOMS[room];
    planes[room] = [
      waterPlane(sx * INNER / 2, sz * (HUB + INNER) / 2, INNER, INNER - HUB),
      waterPlane(sx * (HUB + INNER) / 2, sz * HUB / 2, INNER - HUB, HUB)
    ];
  }
  planes.hub = [waterPlane(0, 0, HUB * 2, HUB * 2)];
  function setLevel(list, level, t) {
    for (const m of list) { m.visible = level > 0.02; m.position.y = level + Math.sin(t * 1.6 + m.position.x) * 0.012; }
  }

  // ================================================================ breaches
  const ringGeo = new THREE.RingGeometry(0.35, 0.5, 20);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5364, side: THREE.DoubleSide });
  const breaches = new Map();
  function syncBreaches(list, t, reduced) {
    const seen = new Set();
    for (const b of list) {
      seen.add(b.id);
      let v = breaches.get(b.id);
      if (!v) {
        const group = new THREE.Group();
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x9de8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        sprite.position.y = 0.3; sprite.scale.set(2.2, 2.2, 1);
        const mark = new THREE.Mesh(ringGeo, ringMat);
        mark.rotation.x = -Math.PI / 2; mark.position.y = 0.05;
        group.add(sprite, mark);
        group.position.set(b.x, 0, b.z);
        scene.add(group);
        v = { group, sprite, seed: Math.random() * 6 };
        breaches.set(b.id, v);
      }
      v.sprite.material.opacity = reduced ? 0.5 : 0.5 + Math.sin(t * 3 + v.seed) * 0.1;
    }
    for (const [id, v] of breaches) {
      if (seen.has(id)) continue;
      scene.remove(v.group); v.sprite.material.dispose(); breaches.delete(id);
    }
  }

  // ================================================================ the ocean outside + the Leviathan
  const ocean = createOcean(scene);
  const wreckMaterial = std(0x8a9692, { vertexColors: true, side: THREE.DoubleSide, roughness: 0.96 });
  for (let i = 0; i < 9; i++) {
    const a = 1.4 + i * 2.4, r = EXT_LIMIT + 15 + i % 3 * 4;
    const wreck = createWreckage(wreckMaterial, null, i * 3 + 1);
    wreck.position.set(Math.cos(a) * r, -0.2, Math.sin(a) * r); wreck.rotation.set(-1.15 + (i % 3) * 0.35, a, 0.12);
    wreck.scale.setScalar(0.45 + i % 3 * 0.2); scene.add(wreck); wreck.updateMatrixWorld(true);
    wreck.position.y += oceanHeight(wreck.position.x, wreck.position.z) - new THREE.Box3().setFromObject(wreck).min.y - 0.12;
  }
  let seed = 12345; // deterministic scenery: every player sees the same rocks
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const snowCount = 420;
  const snowPos = new Float32Array(snowCount * 3);
  for (let i = 0; i < snowCount; i++) { snowPos[i * 3] = (rnd() - 0.5) * 70; snowPos[i * 3 + 1] = rnd() * 14; snowPos[i * 3 + 2] = (rnd() - 0.5) * 70; }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0x9fd6e8, map: glow, size: 0.11, transparent: true, opacity: 0.45, depthWrite: false }));
  snow.frustumCulled = false;
  scene.add(snow);

  const lev = new THREE.Group();
  const horror = createHorrorLeviathan();
  lev.add(horror.root);
  const eyeGlow = new THREE.PointLight(0x7a291b, 0.5, 6, 1.6);
  eyeGlow.position.set(7, 0.8, 0);
  lev.add(eyeGlow);
  scene.add(lev);
  models.instantiate("leviathan", [7, 5.2, 22], { uniform: true, fit: true, centered: true }).then(asset => {
    if (!asset) return;
    if (disposed) { models.disposeInstance(asset.root); return; }
    horror.attach(asset);
  });

  let leviathanPlaced = false;
  function updateLeviathan(l, t, dt, reduced) {
    const x = Math.cos(l.angle) * l.dist, z = Math.sin(l.angle) * l.dist;
    if (!leviathanPlaced) {
      lev.position.set(x, leviathanClearance(l), z); lev.rotation.y = initialLeviathanYaw(l); leviathanPlaced = true;
    }
    const previous = { x: lev.position.x, z: lev.position.z }, k = 1 - Math.exp(-10 * dt);
    lev.position.x += (x - lev.position.x) * k; lev.position.z += (z - lev.position.z) * k;
    lev.position.y += (leviathanClearance(l) + (reduced ? 0 : Math.sin(t * 0.8) * 0.25) - lev.position.y) * k;
    const heading=leviathanYaw(previous, lev.position, lev.rotation.y),oldYaw=lev.rotation.y;
    lev.rotation.y = turnLeviathan(oldYaw,heading,dt);
    const bank=reduced?0:Math.max(-.12,Math.min(.12,(lev.rotation.y-oldYaw)/Math.max(.001,dt)*.09));
    lev.rotation.x+=(bank-lev.rotation.x)*Math.min(1,dt*3);
    const hunting = l.state === "approach" || l.state === "attack";
    eyeGlow.intensity = hunting ? 1.2 : 0.5;
    horror.update(l.state, dt, reduced);
  }

  // ================================================================ per-frame update from server state
  function update(state, ctx) {
    subView.update(state.sub,ctx.dt,ctx.selfId);
    threatView.update(state,ctx.viewer);
    storyView.update(state.story);
    resourceView.update([...(state.resources||[]),...(state.scrap||[]),...(state.stage==='main'?state.drops||[]:[]),...(state.stage==='main'&&state.salvage?.state==='available'?[{...SALVAGE,item:'regulator',id:SALVAGE.recover}]:[])]);
    lockerView.update(state);
    equipment.update(state.effects, options.quality, ctx.viewer);
    const { dt, time, now, reducedEffects, holdIds, alert } = ctx;
    if (ctx.viewer) for (const { sprite, width, aspect, id } of labels) {
      sprite.getWorldPosition(labelPosition);
      const distance = labelPosition.distanceTo(ctx.viewer);
      const limit = id ? (id === focusedTarget ? 6 : 3.5) : 12;
      sprite.material.opacity = (1 - THREE.MathUtils.smoothstep(distance, limit * .55, limit)) * THREE.MathUtils.smoothstep(distance, .65, 1.3);
      sprite.visible = sprite.material.opacity > .02;
    }
    surfaces.update(time, reducedEffects);
    detail.update(state, { ...ctx, quality:options.quality });
    ocean.update();
    snowGeo.setDrawRange(0, Math.floor(snowCount * QUALITY[options.quality].particles));
    for (const [id, material] of Object.entries(emergencyLooks)) {
      const open = id === "board" ? state.stage === "boarding" : id === "beacon" ? state.finale?.station.beacon : id === "capsule" ? state.finale?.station.capsuleStep >= 3 : !state.lockdown.active;
      material.emissive.setHex(open ? 0x315a49 : 0x503d20); material.color.setHex(open ? 0x6fba9b : 0xb4976b);
    }
    power = state.power && (!state.finale || state.finale.station.power > 5);
    for (const id of STATION_IDS) {
      const s = state.stations[id];
      if (!s) { setStationLook(id, "done", false); continue; } // inactive junctions are hidden
      const def = STATIONS[id];
      let look;
      if (holdIds.has(id) || id === 'pump' && holdIds.has('service:pump')) look = "holding";
      else if (id === 'pump' && state.complication?.state === 'active') look = 'alert';
      else if (s === "done") look = "done";
      else if (s === "locked" || s === "cooldown") look = "locked";
      else if (s === "lockdown") look = "alert";
      else look = def.kind === "door" ? "door" : "idle";
      setStationLook(id, look, true);
    }
    for (const room of ROOM_IDS) { // blast doors slide up and down
      const d = doors[room], r = state.rooms[room];
      const target = r.closed ? 1 : 0;
      d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * 2.2);
      const slide = d.t * d.t * (3 - 2 * d.t);
      for (const m of d.meshes) {
        m.scale.y = 1; m.position.y = WALL_H / 2 + WALL_H * (1 - slide);
        m.visible = d.t > 0.01;
        m.material.emissive.setHex(r.locked ? 0xff2a1a : 0x442a00);
        m.material.emissiveIntensity = r.locked ? 0.9 + (reducedEffects ? 0 : Math.sin(time * 6) * 0.4) : 0.6;
      }
    }
    for (const room of ROOM_IDS) setLevel(planes[room], state.rooms[room].flood, time);
    setLevel(planes.hub, state.hub, time);
    waterMat.opacity = 0.4 + Math.min(0.15, state.hub * 0.05);
    const launch = state.stations.launch;
    const ready = launch === "ready" || launch === "done" || state.stage === "boarding";
    podDoorMat.color.setHex(ready ? 0x4dff9a : 0xff5a4a);
    podDoorMat.emissive.setHex(ready ? 0x12b85a : 0xff2a1a);
    syncBreaches(state.breaches, time, reducedEffects);
    updateLeviathan(state.lev, time, dt, reducedEffects);
    updateLights(state.lev.threat, alert, now, reducedEffects,state);
    const pos = snow.geometry.attributes.position;
    for (let i = 0; i < snowCount; i++) {
      let y = pos.getY(i) - (reducedEffects ? 0 : dt * 0.35);
      if (y < -0.3) y = 14;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  function dispose() {
    disposed = true;
    equipment.dispose();
    lockerView.dispose();
    resourceView.dispose();
    storyView.dispose();
    threatView.dispose();
    subView.dispose();
    exploration.dispose();
    detail.dispose();
    horror.dispose();
    ocean.dispose();
    surfaces.dispose();
    ringGeo.dispose(); ringMat.dispose(); glow.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { m.map?.dispose?.(); m.dispose(); }
    });
    models.dispose();
  }

  const workRay=new THREE.Raycaster();
  function workSurface(target,origin){
    if(!target)return null;
    if(target.kind==='resource'||target.kind==='gearPickup'||target.id===SALVAGE.recover)return resourceView.contact(target.id,origin);
    if(target.kind==='breach')return {point:new THREE.Vector3(target.b.x,.05,target.b.z),normal:new THREE.Vector3(0,1,0)};
    if(target.kind==='circuit'){const p=CIRCUITS[target.point.room];return p?{point:new THREE.Vector3(p.x,.1,p.z),normal:new THREE.Vector3(0,1,0)}:null;}
    const station=workPanels.get(target.id==='service:pump'||target.id===SALVAGE.install?'pump':target.id);if(!station)return null;
    const group=station.group;group.updateWorldMatrix(true,true);
    const centre=group.localToWorld(new THREE.Vector3(0,station.def.junction?1.1:1.2,.19)),meshes=[];
    group.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});
    workRay.set(origin,centre.sub(origin).normalize());
    const hit=workRay.intersectObjects(meshes,false)[0];if(!hit)return null;
    const normal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
    if(normal.dot(origin.clone().sub(hit.point))<0)normal.negate();
    return {point:hit.point,normal};
  }
  return { update, dispose, setTarget,workSurface };
}
