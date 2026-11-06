import * as THREE from "three";
import { DEPTS } from "../../shared/layout.js";
import { createModelLibrary } from "./models.js";

// Other players: capsule + visor + name tag, smoothly interpolated between the ~20 server
// updates per second. Downed crew lie on the floor; lost and evacuated crew disappear.
const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.35, 8, 16);
const limbGeo = new THREE.CapsuleGeometry(0.11, 0.42, 6, 12);
const visorGeo = new THREE.BoxGeometry(0.42, 0.18, 0.12);
const helmetGeo = new THREE.SphereGeometry(0.36, 12, 10);
const stripeGeo = new THREE.BoxGeometry(0.14, 0.055, 0.025);
const visorMat = new THREE.MeshStandardMaterial({ color: 0x183b4a, roughness: 0.4 });
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6f8a96, roughness: 0.7 });
const runMat = new THREE.MeshStandardMaterial({ color: 0xffa05c, roughness: 0.7, emissive: 0x663300 });
const stripeMats = Object.fromEntries(Object.values(DEPTS).map((d) => [d.id, new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.12 })]));

function nameTag(text, color) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(2,12,20,.82)"; g.fillRect(12, 20, 488, 88);
  g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(12, 20, 488, 88);
  g.fillStyle = "#e8faff"; g.font = "bold 36px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 256, 64, 450);
  const texture = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.7, 0.425, 1);
  return sprite;
}
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function createRemotes(scene) {
  const remotes = new Map(); // id -> record
  const models = createModelLibrary();

  function add(p) {
    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // yaw first, then tilt (for downed crew)
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.38, -0.3); // "front" = -z, same convention as the camera
    const stripe = new THREE.Mesh(stripeGeo, stripeMats[p.dept] || bodyMat);
    stripe.position.y = 0.95;
    const helmet = new THREE.Mesh(helmetGeo, new THREE.MeshStandardMaterial({ color: 0xbcd8e4, transparent: true, opacity: 0.35 }));
    helmet.position.y = 1.45; helmet.visible = true;
    const limbs = [-1, 1].flatMap(side => [false, true].map(arm => {
      const pivot = new THREE.Group();
      pivot.position.set(side * (arm ? 0.34 : 0.16), arm ? 1.18 : 0.65, 0);
      const mesh = new THREE.Mesh(limbGeo, bodyMat);
      mesh.position.y = -0.25;
      pivot.add(mesh); group.add(pivot);
      return { pivot, side, arm };
    }));
    const d = DEPTS[p.dept];
    const tag = nameTag(`${d ? `[${d.short}] ` : ""}${p.name}`.slice(0, 22), d?.color || "#70eaff");
    tag.position.y = 2.25;
    group.add(body, visor, stripe, helmet, tag);
    group.position.set(p.x, 0, p.z);
    scene.add(group);
    const r = { group, body, tag, helmet, limbs, phase: 0, tx: p.x, tz: p.z, trot: p.rot, run: false, down: false, name: p.name, dept: p.dept };
    remotes.set(p.id, r);
    models.instantiate("crew", [0.8, 1.85, 0.8], { uniform: true, yaw: Math.PI }).then(asset => {
      if (!asset) return;
      if (remotes.get(p.id) !== r) { models.disposeInstance(asset.root); return; }
      r.asset = asset;
      group.add(asset.root);
      // A small department band remains readable without colouring the whole suit.
      stripe.visible = true; stripe.position.set(.14, 1.24, -.23);
      asset.root.scale.x *= .78;asset.root.scale.z *= .85;
      body.visible = visor.visible = false;
      for (const limb of limbs) limb.pivot.visible = false;
      r.mixer = new THREE.AnimationMixer(asset.model);
      r.actions = Object.fromEntries(["Idle", "Walk", "Run"].map(name => {
        const clip = asset.clips.find(c => c.name.toLowerCase() === name.toLowerCase())
          || asset.clips.find(c => c.name.toLowerCase().endsWith("|" + name.toLowerCase()));
        return [name, clip ? r.mixer.clipAction(clip) : null];
      }));
      r.actions.Idle?.play(); r.animation = "Idle";
    });
    return r;
  }

  function remove(id) {
    const r = remotes.get(id);
    if (!r) return;
    scene.remove(r.group);
    if (r.asset) {
      r.mixer.stopAllAction(); r.mixer.uncacheRoot(r.asset.model);
      models.disposeInstance(r.asset.root);
    }
    r.tag.material.map.dispose(); r.tag.material.dispose(); r.helmet.material.dispose();
    remotes.delete(id);
  }

  return {
    // `list` = players from the server snapshot, excluding yourself
    sync(list) {
      const seen = new Set();
      for (const p of list) {
        if (!p || typeof p.id !== "string" || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
        if (p.lost || p.aboard || p.escaped||p.subSeat) continue; // vehicle occupants are rendered in its seats
        seen.add(p.id);
        const r = remotes.get(p.id) || add(p);
        r.tx = p.x; r.tz = p.z; r.trot = p.rot || 0;
        r.depth=p.ext?p.depth||0:0;
        r.run = !!p.run;
        r.body.material = r.run ? runMat : bodyMat;
        r.helmet.visible = !r.asset;
        r.down = !!p.down;
        r.tag.visible = !r.down;
      }
      for (const id of [...remotes.keys()]) if (!seen.has(id)) remove(id);
    },
    update(dt, viewer, followingId = null, camera = null) {
      const k = 1 - Math.exp(-14 * dt);
      const candidates = [];
      for (const r of remotes.values()) {
        r.group.visible = r !== remotes.get(followingId);
        if (viewer) {
          const range = Math.hypot(r.group.position.x - viewer.x, r.group.position.z - viewer.z);
          r.tag.visible = !r.down && r.group.visible && range > 1.2 && range < 11;
          r.tag.material.opacity = THREE.MathUtils.smoothstep(range, 1.2, 2) * (1 - THREE.MathUtils.smoothstep(range, 7, 11));
          const width = Math.min(1.25, Math.max(0.5, range * 0.19));
          r.tag.scale.set(width, width / 4, 1);
          if (r.tag.visible && camera) candidates.push({r,range,width});
        }
        const distance = Math.hypot(r.tx - r.group.position.x, r.tz - r.group.position.z);
        r.phase += dt * (r.run ? 11 : 7);
        if (!r.asset) for (const limb of r.limbs) {
          const swing = !r.down && distance > 0.025 ? Math.sin(r.phase) * (r.run ? 0.65 : 0.4) : 0;
          limb.pivot.rotation.x += (swing * limb.side * (limb.arm ? -1 : 1) - limb.pivot.rotation.x) * k;
        }
        if (r.asset) {
          const animation = r.down || distance < 0.025 ? "Idle" : r.run ? "Run" : "Walk";
          if (animation !== r.animation && r.actions[animation]) {
            r.actions[r.animation]?.fadeOut(0.2);
            r.actions[animation].reset().fadeIn(0.2).play();
            r.animation = animation;
          }
          if (!r.down) r.mixer.update(Math.min(dt, 0.1));
          r.helmet.visible = false;
        }
        r.group.position.x += (r.tx - r.group.position.x) * k;
        r.group.position.z += (r.tz - r.group.position.z) * k;
        r.group.rotation.y += angleDiff(r.trot, r.group.rotation.y) * k;
        const targetTilt = r.down ? -Math.PI / 2 : 0;
        r.group.rotation.x += (targetTilt - r.group.rotation.x) * k;
        r.group.position.y += ((r.down?.4:0)-r.depth-r.group.position.y)*k;
      }
      // Prioritize nearby crew. Hide colliding tags rather than moving them away
      // from their owners or covering the view with a stack of labels.
      if (camera) {
        camera.updateMatrixWorld();const occupied=[],point=new THREE.Vector3();
        for(const {r,range,width} of candidates.sort((a,b)=>a.range-b.range)) {
          r.group.updateWorldMatrix(true,false);r.tag.getWorldPosition(point);point.project(camera);
          const h=width/(Math.max(range,1)*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2));
          const box={x:point.x,y:point.y,w:h/camera.aspect,h:h/4};
          r.tag.visible=point.z>-1 && point.z<1 && Math.abs(point.x)<1 && Math.abs(point.y)<1 && !occupied.some(b=>Math.abs(b.x-box.x)<(b.w+box.w)/2+.025 && Math.abs(b.y-box.y)<(b.h+box.h)/2+.025);
          if(r.tag.visible)occupied.push(box);
        }
      }
    },
    get: (id) => remotes.get(id),
    clear() { for (const id of [...remotes.keys()]) remove(id); models.dispose(); }
  };
}
