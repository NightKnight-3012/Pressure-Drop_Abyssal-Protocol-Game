// Exercise model loading and skeleton ownership without a GPU or external network.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createModelLibrary } from "../client/src/models.js";
import { createLeviathanAnimation } from "../client/src/leviathan-visual.js";
import { createHorrorLeviathan } from "../client/src/leviathan-horror.js";

const originalLoad = GLTFLoader.prototype.loadAsync;
function fixture() {
  const geometry = new THREE.BoxGeometry(1, 2, 0.5);
  geometry.translate(0, 1, 0);
  const count = geometry.attributes.position.count;
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  const bone = new THREE.Bone(); bone.name = "Hip";
  mesh.add(bone); mesh.bind(new THREE.Skeleton([bone]));
  const scene = new THREE.Group(); scene.add(mesh);
  const clips = [new THREE.AnimationClip("Walk", 1, [new THREE.NumberKeyframeTrack("Hip.rotation[x]", [0, 1], [0, 0.5])])];
  return { scene, animations: clips };
}
let checks = 0;
function check(label, value) { assert.ok(value, label); checks++; console.log(`PASS ${label}`); }
try {
  let requests = [];
  GLTFLoader.prototype.loadAsync = async url => {
    requests.push(url);
    if (url.startsWith("/models/")) throw new Error("No local asset");
    return fixture();
  };
  const library = createModelLibrary();
  const [a, b] = await Promise.all([
    library.instantiate("crate", [0.8, 1.85, 0.8], { uniform: true, yaw: Math.PI }),
    library.instantiate("crate", [0.8, 1.85, 0.8], { uniform: true, yaw: Math.PI })
  ]);
  check("missing local asset falls back to online source", requests.length === 2 && requests[1].startsWith("https://"));
  check("concurrent crew share one download", requests.filter(url => url.startsWith("https://")).length === 1);
  const box = new THREE.Box3().setFromObject(a.root);
  check("crew stands on floor at full intended height", Math.abs(box.min.y) < 0.001 && Math.abs(box.getSize(new THREE.Vector3()).y - 1.85) < 0.001);
  const aMesh = a.model.children[0], bMesh = b.model.children[0];
  check("crew own separate skeletons", aMesh.skeleton.bones[0] !== bMesh.skeleton.bones[0]);
  check("crew own separate materials", aMesh.material !== bMesh.material);
  const mixer = new THREE.AnimationMixer(a.model);
  mixer.clipAction(a.clips[0]).play(); mixer.update(0.5);
  check("animating one crew leaves the other unchanged", aMesh.skeleton.bones[0].rotation.x > 0 && bMesh.skeleton.bones[0].rotation.x === 0);
  mixer.stopAllAction(); mixer.uncacheRoot(a.model);
  library.disposeInstance(a.root); library.disposeInstance(b.root); library.dispose();

  requests = [];
  GLTFLoader.prototype.loadAsync = async url => {
    requests.push(url);
    if (!url.includes("Ariescar/gobkit-free-assets")) throw new Error("Unavailable source");
    return fixture();
  };
  const mirrored = createModelLibrary();
  const mirroredMonster = await mirrored.instantiate("leviathan", [7, 5.2, 22], { uniform: true, fit: true, centered: true });
  check("Leviathan tries local file, publisher, then GitHub mirror", mirroredMonster && requests.length === 3 && requests[0] === "/models/leviathan.glb" && requests[1] === "https://gobkit.com/freebies/animal/Anglerfish.glb" && requests[2].includes("Ariescar/gobkit-free-assets"));
  mirrored.disposeInstance(mirroredMonster.root); mirrored.dispose();

  requests = [];
  GLTFLoader.prototype.loadAsync = async url => { requests.push(url); return fixture(); };
  const local = createModelLibrary();
  const crate = await local.instantiate("crate", [1.1, 0.9, 1.2]);
  check("installed assets require no external request", requests.length === 1 && requests[0].startsWith("/models/"));
  const size = new THREE.Box3().setFromObject(crate.root).getSize(new THREE.Vector3());
  check("cargo model matches existing collision footprint", Math.abs(size.x - 1.1) < 0.001 && Math.abs(size.y - 0.9) < 0.001 && Math.abs(size.z - 1.2) < 0.001);
  local.disposeInstance(crate.root); local.dispose();

  let finish;
  const lateAsset = fixture(); let releases = 0;
  lateAsset.scene.children[0].geometry.addEventListener("dispose", () => releases++);
  GLTFLoader.prototype.loadAsync = () => new Promise(resolve => { finish = resolve; });
  const closing = createModelLibrary();
  const late = closing.instantiate("crew", [0.8, 1.85, 0.8]);
  closing.dispose(); finish(lateAsset);
  check("ending a match prevents late models from attaching", await late === null);
  check("late model resources are released", releases === 1);

  const creature = fixture();
  const fitted = createModelLibrary();
  GLTFLoader.prototype.loadAsync = async () => creature;
  const monster = await fitted.instantiate("leviathan", [7, 5.2, 22], { uniform: true, fit: true, centered: true });
  const monsterBox = new THREE.Box3().setFromObject(monster.root);
  const monsterSize = monsterBox.getSize(new THREE.Vector3());
  check("swimming monster is vertically centred and fits its envelope", Math.abs(monsterBox.getCenter(new THREE.Vector3()).y) < 0.001 && monsterSize.x <= 7.001 && monsterSize.y <= 5.201 && monsterSize.z <= 22.001);
  check("monster scaling preserves proportions", monster.root.scale.x === monster.root.scale.y && monster.root.scale.y === monster.root.scale.z);
  fitted.disposeInstance(monster.root); fitted.dispose();

  const animated = fixture();
  const pose = value => new THREE.NumberKeyframeTrack("Hip.rotation[x]", [0, 1], [value, value]);
  const namedClips = [new THREE.AnimationClip("idle", 1, [pose(0.1)]), new THREE.AnimationClip("walk", 1, [pose(0.2)]), new THREE.AnimationClip("attack", 1, [pose(0.5)])];
  const named = createLeviathanAnimation(animated.scene, namedClips);
  for (let i = 0; i < 10; i++) named.update("patrol", 0.1);
  const animatedBone = animated.scene.children[0].skeleton.bones[0];
  check("patrol plays the named swimming clip", Math.abs(animatedBone.rotation.x - 0.2) < 0.001);
  for (let i = 0; i < 10; i++) named.update("attack", 0.1);
  check("attack transitions to the named biting clip", Math.abs(animatedBone.rotation.x - 0.5) < 0.001);
  for (let i = 0; i < 10; i++) named.update("retreat", 0.1);
  check("retreat returns to swimming", Math.abs(animatedBone.rotation.x - 0.2) < 0.001);
  named.dispose();

  const bakedClip = new THREE.AnimationClip("timeline", 119 / 24, [new THREE.NumberKeyframeTrack("Hip.rotation[x]", [0, 29 / 24, 30 / 24, 59 / 24, 60 / 24, 89 / 24, 90 / 24, 119 / 24], [0.1, 0.1, 0.5, 0.5, 9, 9, 0.2, 0.2])]);
  const legacy = createLeviathanAnimation(animated.scene, [bakedClip]);
  for (const state of ["patrol", "investigate", "approach", "retreat"]) {
    for (let i = 0; i < 100; i++) legacy.update(state, 0.1);
    check(`${state} loops only swimming frames in older model`, Math.abs(animatedBone.rotation.x - 0.2) < 0.001);
  }
  for (let i = 0; i < 100; i++) legacy.update("attack", 0.1);
  check("older model attacks without crossing death frames", Math.abs(animatedBone.rotation.x - 0.5) < 0.001);
  legacy.dispose();
  const horror = createHorrorLeviathan();
  const horrorJaw = horror.root.getObjectByName("Leviathan jaw");
  const horrorSpine = horror.root.getObjectByName("Leviathan spine");
  horror.update("patrol", 0.1);
  const restingJaw = horrorJaw.rotation.z;
  const tailBefore = horrorSpine.geometry.attributes.position.getZ(58 * 21);
  for (let i = 0; i < 30; i++) horror.update("attack", 0.1);
  check("attack opens the horror jaw beyond its patrol pose", horrorJaw.rotation.z < restingJaw - 0.2);
  check("the horror spine undulates instead of remaining rigid", Math.abs(horrorSpine.geometry.attributes.position.getZ(58 * 21) - tailBefore) > 0.01);
  const horrorAsset = fixture();
  const eye = new THREE.Bone(); eye.name = "LeftEye";
  horrorAsset.scene.children[0].add(eye);
  const horrorWrapper = new THREE.Group(); horrorWrapper.add(horrorAsset.scene);
  horror.attach({ root: horrorWrapper, model: horrorAsset.scene, clips: horrorAsset.animations });
  horror.update("patrol", 0.1, true);
  check("downloaded cranial shell uses neutral skin instead of the cartoon atlas", horrorAsset.scene.children[0].material.map === null);
  check("cartoon eye bones stay suppressed after animation updates", eye.scale.x < 0.1 && eye.scale.y < 0.1);
  let finiteGeometry = true;
  horror.root.traverse(o => {
    if (o.geometry?.attributes.position) finiteGeometry &&= Array.from(o.geometry.attributes.position.array).every(Number.isFinite);
  });
  check("horror anatomy remains finite after state changes and source attachment", finiteGeometry);
  horror.dispose();
  const diverJson=JSON.parse(await readFile(new URL('../client/public/models/Animated/nereid-diver.gltf',import.meta.url),'utf8'));
  const hadProgress=globalThis.ProgressEvent;
  globalThis.ProgressEvent??=class ProgressEvent {constructor(type,values){this.type=type;Object.assign(this,values);}};
  const diver=await new GLTFLoader().parseAsync(JSON.stringify(diverJson),'');
  if(!hadProgress)delete globalThis.ProgressEvent;
  check('shipped diver needs no animal atlas or external textures',!diverJson.images && !diverJson.textures);
  check('shipped diver has a sealed helmet attached to the animated head',diver.scene.getObjectByName('NEREIDsealedhelmet')?.parent.name==='Head' || diver.scene.getObjectByName('NEREID_sealed_helmet')?.parent.name==='Head');
  check('the carried weapon is removed',!diver.scene.getObjectByName('Pistol')?.isMesh);
  const diverMixer=new THREE.AnimationMixer(diver.scene);
  for(const name of ['Idle','Walk','Run']) {
    const clip=diver.animations.find(c=>c.name.toLowerCase()===name.toLowerCase() || c.name.toLowerCase().endsWith('|'+name.toLowerCase()));
    check(`shipped diver retains ${name} animation`,!!clip);
    diverMixer.stopAllAction();diverMixer.clipAction(clip).play();
    for(let i=0;i<20;i++)diverMixer.update(.05);
    diver.scene.updateMatrixWorld(true);let finite=true;
    diver.scene.traverse(o=>{if(o.isSkinnedMesh){o.computeBoundingBox();finite&&=o.boundingBox.min.toArray().every(Number.isFinite)&&o.boundingBox.max.toArray().every(Number.isFinite);}});
    check(`shipped diver ${name} skin remains finite`,finite);
  }
  diverMixer.stopAllAction();diverMixer.uncacheRoot(diver.scene);
  diver.scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  console.log(`${checks}/${checks} model checks passed`);
} finally {
  GLTFLoader.prototype.loadAsync = originalLoad;
}
