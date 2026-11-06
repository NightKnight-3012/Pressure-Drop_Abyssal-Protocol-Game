import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createRecoveryLift } from "./recovery.js";
import { createHorrorLeviathan } from "./leviathan-horror.js";
import { options } from "./options.js";
import { createEscapeCraft } from "./escape-craft.js";
import { shotPose } from "./presentation.js";
import { setAudioEnvironment,setThreatAudio } from "./audio.js";
import { rescuePose, RESCUE_DURATION, RESCUE_SEA_LEVEL } from "./rescue-sequence.js";
import {createWaterNormal} from './surfaces.js';

export function endingStory(outcome, playerId) {
  const self = outcome.crew.find(p => p.id === playerId) || outcome.crew[0];
  if(outcome.practice)return {title:outcome.practiceComplete?'RECOVERY DRILL COMPLETE':'TRAINING RUN ENDED',lines:[outcome.practiceComplete?'You repaired the station, worked outside and docked the escape pod.':'The simulator has ended. Replay to practise the recovery cradle.','Training stays separate from expedition and competitive records.'],ending:self?.ending,name:self?.name,survived:!!outcome.practiceComplete,badge:'Training'};
  const podSafe = outcome.finale?.pod === "escaped", answered = outcome.finale?.history?.diversions > 0;
  const endings = {
    capsule_escape: ["ANOTHER WAY UP", "You released the damaged hatch. A small capsule rose through the dark.", podSafe ? "Two routes. One crew. Your signals met again at extraction." : "Your capsule surfaced. The pod never answered the final call."],
    beacon_sacrifice: ["THE LAST SIGNAL", "Your beacon bought the crew precious seconds. Every pulse spent the power that could have carried you home.", podSafe ? "Above the wreckage, their engine kept running. Below it, your signal became part of the ocean." : "You offered them a window. The ocean closed around both signals."],
    last_stand: ["THE STATION REMEMBERS", "You chose to stay. The last rooms fell silent around you.", answered ? "The pod answered with a diversion. For a moment, neither side faced the dark alone." : "Your final transmission travelled farther than the station's lights."],
    abandoned: ["AFTER THE VOTE", "The pod left. You still had a choice: the beacon, the capsules, or one final transmission.", answered ? "The escaping crew turned its signal back toward you. The station kept the rest of your story." : "The last room filled. Your name stayed on the crew manifest."],
    station_lost: ["BELOW THE LIGHT", "The reserve power failed. The water found the last dry room.", "Your final signal remains in the expedition record."],
    pod_escape: ["ABOVE THE WRECKAGE", "The cradle caught the pod. Behind you, the armored shutter closed against the pursuing shadow.", answered ? "You risked your own route to buy the station crew time. Every signal is recorded." : "The rescue tender received your crew. The expedition record preserved every crew member's route."],
    pod_lost: ["THE SIGNAL WENT QUIET", "The pod's hull could not hold the final approach.", outcome.crew.some(p => p.ending === "capsule_escape") ? "A smaller signal continued upward. Someone found another way." : "The expedition's final transmissions remain in the crew log."],
    lost: ["AN EMPTY CHANNEL", "Your radio fell silent before evacuation.", outcome.crew.some(p => /escape/.test(p.ending)) ? "The surviving crew carried your name through the last emergency." : "Asterion kept listening. Your name remains in the expedition record."],
    stranded: ["UNFINISHED TRANSMISSION", "The station lost contact before your route was complete.", "Your name remains in the expedition record."]
  };
  const copy = endings[self?.ending] || endings.lost;
  return { title: copy[0], lines: [copy[1], copy[2]], ending: self?.ending, name: self?.name, survived: /escape/.test(self?.ending || ""),
    badge: self?.ending === "beacon_sacrifice" ? "Last Signal" : self?.ending === "capsule_escape" && podSafe ? "Against the Odds" : outcome.finale?.history?.podHelpBy?.[playerId] && self?.ending === "pod_escape" ? "An Answer in the Dark" : "Expedition Record" };
}

export function saveEnding(outcome, playerId) {
  const story = endingStory(outcome, playerId);
  if(outcome.practice){try{if(outcome.practiceComplete)localStorage.setItem('pressure-drop-practice-complete','true');}catch{}return story;}
  try {
    const key = "pressure-drop-crew-log", stored = JSON.parse(localStorage.getItem(key) || "[]");
    const records = Array.isArray(stored) ? stored.filter(r => r && typeof r.id === "string") : [];
    const id = `${outcome.seed}:${playerId}`;
    if (!records.some(r => r.id === id)) records.unshift({ id, name: story.name, title: story.title, badge: story.badge, mission: outcome.mission, date: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(records.slice(0, 30)));
  } catch { /* The ending remains playable without browser storage. */ }
  return story;
}

export function createEpilogue(outcome, playerId, onFinish) {
  setThreatAudio(0);
  const story = saveEnding(outcome, playerId), scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020b14); scene.fog = new THREE.Fog(0x020b14, 8, 60);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 120);
  scene.add(new THREE.HemisphereLight(0x365565, 0x080e14, 1.4));
  const craft = createEscapeCraft({ compact:story.ending === "capsule_escape" }), body = craft.root;
  if (story.ending === "capsule_escape") body.scale.setScalar(0.75);
  scene.add(body);
  const key = new THREE.DirectionalLight(0xe7ebd9, 1.8); key.position.set(-6,8,10); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6b9dae, 1.2); rim.position.set(7,4,-10); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x09151c, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -3; scene.add(floor);
  const beacon = new THREE.PointLight(0xc8ab67, 12, 20); beacon.position.set(-4, -1, 0); scene.add(beacon);
  const recovery = createRecoveryLift(); scene.add(recovery.root);
  // Station endings belong to the person who stayed; no empty pod stands in for them.
  const stationEnding = !story.survived && story.ending !== "pod_lost";
  const station = new THREE.Group(); station.name = "Final transmission / station"; scene.add(station);
  const bulkhead = new THREE.MeshStandardMaterial({ color:0x243741, metalness:.65, roughness:.7 });
  const signalMat = new THREE.MeshStandardMaterial({ color:0xe3a65f, emissive:0xdf7b25, emissiveIntensity:1.5 });
  function stationBox(w,h,d,x,y,z,mat=bulkhead) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.08,h/4,w/4,d/4)),mat);
    mesh.position.set(x,y,z); station.add(mesh); return mesh;
  }
  stationBox(12,.2,10,0,-1.3,-2); stationBox(12,1.2,.3,0,-.65,-5);
  stationBox(12,1.8,.3,0,4.1,-5);
  for (const x of [-5.5,-2,2,5.5]) stationBox(.18,4,.3,x,1.6,-5);
  stationBox(2.1,1.15,.9,-1,-.6,-2);
  stationBox(1.5,.1,.6,-1,.04,-2,signalMat);
  const antenna = new THREE.Mesh(new THREE.TorusGeometry(.6,.035,8,32),signalMat); antenna.position.set(-1,1,-2); station.add(antenna);
  stationBox(.07,.9,.07,-1,.5,-2); stationBox(.8,.03,.06,-1,1,-2);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(12,10),new THREE.MeshStandardMaterial({color:0x173d48,transparent:true,opacity:.72,metalness:.4,roughness:.35,side:THREE.DoubleSide}));
  water.rotation.x=-Math.PI/2; water.position.set(0,-1,-2); station.add(water);
  const surface = new THREE.Group();surface.position.y=RESCUE_SEA_LEVEL;scene.add(surface);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 64, 64), new THREE.MeshStandardMaterial({ color: 0x245866, roughness: 0.32, metalness: 0.35,side:THREE.DoubleSide })); sea.rotation.x = -Math.PI / 2; surface.add(sea);
  const waterNormal=createWaterNormal();sea.material.normalMap=waterNormal;sea.material.normalScale=new THREE.Vector2(.32,.32);waterNormal.repeat.set(85,85);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(90,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,uniforms:{fade:{value:0}},vertexShader:'varying float elevation;void main(){elevation=position.y/90.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying float elevation;uniform float fade;void main(){vec3 c=mix(vec3(.57,.68,.67),vec3(.10,.25,.36),smoothstep(0.,.85,elevation));gl_FragColor=vec4(c,fade);}'}));sky.position.set(0,RESCUE_SEA_LEVEL,-3);scene.add(sky);
  const shipMat = new THREE.MeshStandardMaterial({ color: 0x657680, roughness: 0.65, metalness: 0.4 });
  function shipBox(w,h,d,x,y,z,mat = shipMat) { const m = new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.15,h/4,w/4,d/4)), mat); m.position.set(x,y,z); surface.add(m); }
  const outline = new THREE.Shape();
  outline.moveTo(0, 13); outline.bezierCurveTo(-2, 12, -3.5, 8, -3.5, 4);
  outline.lineTo(-3.5, -10); outline.quadraticCurveTo(-3.5, -12, 0, -12);
  outline.quadraticCurveTo(3.5, -12, 3.5, -10); outline.lineTo(3.5, 4);
  outline.bezierCurveTo(3.5, 8, 2, 12, 0, 13);
  const hullGeo = new THREE.ExtrudeGeometry(outline, { depth: 2.8, bevelEnabled: true, bevelSize: .2, bevelThickness: .2, bevelSegments: 2, steps: 1, curveSegments: 12 });
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: 0x29404d, roughness: .55, metalness: .45 })); hull.position.set(-10, 1, -8); surface.add(hull);
  const deckGeo = new THREE.ShapeGeometry(outline); deckGeo.rotateX(Math.PI / 2);
  const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ color: 0x8c9490, roughness: .9, side: THREE.DoubleSide })); deck.position.set(-10, 1.23, -8); surface.add(deck);
  shipBox(5,3.3,6,-10,2.9,-13);
  const glass = new THREE.MeshStandardMaterial({ color: 0x122f3c, roughness: .2, metalness: .6, emissive: 0x12434c, emissiveIntensity: .6 });
  for (let i = -1; i <= 1; i++) shipBox(1.1,.85,.12,-10+i*1.4,3.5,-9.95,glass);
  for (const side of [-1,1]) {
    for (let i = 0; i < 3; i++) shipBox(.12,.85,1,-10+side*2.55,3.5,-11-i*1.5,glass);
    for (let z = -18; z <= -2; z += 2) shipBox(.06,.85,.06,-10+side*3.2,1.65,z);
    shipBox(.07,.07,18,-10+side*3.2,2.1,-10);
  }
  shipBox(.18,4,.18,-10,6.2,-13); shipBox(3,.15,.3,-10,8,-13);
  shipBox(1.2,1.8,1.1,-10,5.2,-15.1);
  shipBox(.3,12,.3,-7,7,-3); shipBox(10,.4,.4,-4,12,-3);
  const hoist=new THREE.Group();hoist.name='Asterion / recovery hook and sling';scene.add(hoist);
  const hoistMat=new THREE.MeshStandardMaterial({color:0x879799,metalness:.8,roughness:.4});
  const wire=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1,6),hoistMat);scene.add(wire);
  const hook=new THREE.Mesh(new THREE.TorusGeometry(.15,.035,7,18,Math.PI*1.6),hoistMat);hoist.add(hook);
  const slingLines=[-1,1].map(side=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,1,6),hoistMat);mesh.userData.side=side;scene.add(mesh);return mesh;});
  const cable=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,74,7),hoistMat);cable.position.set(2.8,37,-6);scene.add(cable);
  const buoy=new THREE.Group();buoy.position.set(2.8,RESCUE_SEA_LEVEL,-6);surface.add(buoy);buoy.position.y=0;
  const buoyMat=new THREE.MeshStandardMaterial({color:0xd6a44f,roughness:.55,metalness:.4});
  buoy.add(new THREE.Mesh(new THREE.CylinderGeometry(.65,.5,.5,16),buoyMat));
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,1.3,8),hoistMat);stem.position.y=.8;buoy.add(stem);
  const buoyLamp=new THREE.Mesh(new THREE.SphereGeometry(.12,10,6),new THREE.MeshBasicMaterial({color:0xd8ead0}));buoyLamp.position.y=1.45;buoy.add(buoyLamp);
  const bubblePositions=new Float32Array(100*3),bubbleGeo=new THREE.BufferGeometry();bubbleGeo.setAttribute('position',new THREE.BufferAttribute(bubblePositions,3));
  const bubbles=new THREE.Points(bubbleGeo,new THREE.PointsMaterial({color:0xb4d7d8,size:.08,transparent:true,opacity:.4,depthWrite:false}));bubbles.frustumCulled=false;scene.add(bubbles);
  const foam=new THREE.Mesh(new THREE.TorusGeometry(2.3,.035,5,48),new THREE.MeshBasicMaterial({color:0xb9d0cc,transparent:true,opacity:.3,depthWrite:false}));foam.rotation.x=-Math.PI/2;foam.position.set(0,RESCUE_SEA_LEVEL+.05,-3);scene.add(foam);
  const dawn = new THREE.DirectionalLight(0xffd6a1, 3); dawn.position.set(20,25,10); surface.add(dawn);
  const creature = createHorrorLeviathan(); creature.root.position.set(-18, 2, -15); scene.add(creature.root);
  const el = document.getElementById("epilogue"); el.classList.remove("hidden"); document.body.classList.add("in-epilogue");
  document.getElementById("epilogue-kicker").textContent = `${story.name || "CREW"} · ${story.badge}`;
  document.getElementById("epilogue-title").textContent = story.title;
  let elapsed = 0, finished = false, waveAt = -1, lastShot = -1;
  const finish = () => { if (finished) return; finished = true; setAudioEnvironment({active:false,surface:false}); el.classList.add("hidden"); document.body.classList.remove("in-epilogue"); onFinish(); };
  document.getElementById("epilogue-skip").onclick = finish;
  return {
    scene, camera,
    update(dt) {
      elapsed += dt;
      const duration=story.survived?RESCUE_DURATION:12;
      const shot = Math.min(2, Math.floor(elapsed / 4));
      if (shot !== lastShot && !story.survived) document.getElementById("epilogue-text").textContent = story.lines[Math.min(1, shot)];
      lastShot = shot;
      const pose=story.survived?rescuePose(elapsed,story.ending==='capsule_escape'):null;
      const atSurface = !!pose && pose.body[1]>=RESCUE_SEA_LEVEL;
      setAudioEnvironment({active:true,surface:atSurface,outside:!stationEnding && !atSurface,underwater:false,pod:false});
      station.visible = stationEnding; body.visible = !stationEnding;
      surface.visible = story.survived; floor.visible = !story.survived;
      hoist.visible=wire.visible=!!pose && elapsed>=14;
      slingLines.forEach(line=>line.visible=!!pose && elapsed>=18);
      cable.visible=story.survived;
      sky.visible=story.survived;sky.material.uniforms.fade.value=pose?.surface||0;
      waterNormal.offset.set(options.reduced?0:elapsed*.009,options.reduced?0:-elapsed*.006);
      bubbles.visible=story.survived && elapsed<14;
      foam.visible=story.survived && elapsed>10 && elapsed<19;
      if (atSurface && (waveAt < 0 || !options.reduced && elapsed - waveAt >= 0.1)) {
        waveAt = elapsed;
        const positions = sea.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) positions.setZ(i, Math.sin(positions.getX(i) * .16 + (options.reduced ? 0 : elapsed) * .7) * .17 + Math.sin(positions.getY(i) * .22) * .13);
        positions.needsUpdate = true; sea.geometry.computeVertexNormals();
      }
      recovery.root.visible = story.ending === "pod_escape" && elapsed<14;
      const carrierHeight=Math.min(53.5,pose?.body[1]||0),release=pose?1-THREE.MathUtils.smoothstep(pose.body[1],50,55):1;
      recovery.update(1,release,carrierHeight);
      scene.background.setHex(0x020b14);if(pose)scene.background.lerp(new THREE.Color(0x71939f),pose.surface);
      dawn.intensity=pose?pose.surface*3:0;
      scene.fog.color.copy(scene.background); scene.fog.far = pose ? 60+100*pose.surface : 60;
      const moving = options.reduced ? 0 : elapsed;
      body.position.y = atSurface ? 0.5 : story.survived ? moving * 0.3 : -Math.min(2, moving * 0.14);
      body.position.z = atSurface ? -1.65 : 0;
      if (body.visible) craft.update(dt, { powered:story.survived && !atSurface, reduced:options.reduced });
      const paths = [[9, 4, 12], [-7, 3.5, -10], [12, 6, 21]];
      const path = stationEnding ? [[4,2.4,5],[-3,1.6,3],[1,2,5]][shot] : paths[shot];
      camera.position.set(...shotPose(path,[path[0]-.6,path[1]+.12,path[2]-.5],(elapsed%4)/4,options.reduced));
      camera.lookAt(stationEnding ? -1 : atSurface ? -4 : 0, stationEnding ? .5 : body.position.y, stationEnding ? -2 : atSurface ? -3 : 0);
      if(pose) {
        body.position.fromArray(pose.body);camera.position.fromArray(pose.camera);camera.lookAt(...pose.target);
        document.getElementById('epilogue-text').textContent=pose.text+(elapsed>=21?' / '+story.lines[1]:'');
        hoist.position.set(body.position.x,pose.hookY,-3);
        if(!options.reduced && elapsed<14) {
          for(let i=0;i<100;i++){const a=i*2.39996,up=(i*.17+elapsed*1.7)%10;bubblePositions.set([body.position.x+Math.cos(a)*(1+i%5*.2),body.position.y-5+up,-3+Math.sin(a)*1.5],i*3);}
          bubbleGeo.attributes.position.needsUpdate=true;
        }
        bubbles.visible &&= !options.reduced;
        foam.scale.setScalar(1+Math.max(0,elapsed-12)*.09);foam.material.opacity=Math.max(0,.3-Math.max(0,elapsed-14)*.06);
        const top=RESCUE_SEA_LEVEL+12,bottom=pose.hookY;
        wire.position.set(body.position.x,(top+bottom)/2,-3);wire.scale.y=Math.max(.05,top-bottom);
        slingLines.forEach(line=>{
          const a=new THREE.Vector3(body.position.x,pose.hookY,-3),b=new THREE.Vector3(body.position.x+line.userData.side*.95,body.position.y+1.35,-3);
          line.position.copy(a).add(b).multiplyScalar(.5);line.scale.y=a.distanceTo(b);line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.sub(a).normalize());
        });
      }
      if (stationEnding) {
        creature.root.position.set(4,1,-12); creature.root.scale.setScalar(.65);
        water.position.y = -1 + (options.reduced ? .5 : Math.min(1,elapsed/12));
        signalMat.emissiveIntensity = options.reduced ? .8 : Math.max(.08,1-elapsed/14) * (story.ending === "beacon_sacrifice" ? .7+Math.sin(elapsed*2)**2 : .5);
      }
      creature.root.visible = !story.survived;
      if (creature.root.visible) creature.update("approach", dt, options.reduced);
      document.getElementById("epilogue-progress").style.setProperty('--progress',Math.min(1,elapsed/duration));
      if (elapsed >= duration) finish();
    },
    resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); },
    dispose() {
      setAudioEnvironment({active:false,surface:false});
      creature.dispose(); el.classList.add("hidden"); document.body.classList.remove("in-epilogue"); document.getElementById("epilogue-skip").onclick = null;
      const geometries=new Set(), materials=new Set(), textures=new Set();
      scene.traverse(o => { if (o.isInstancedMesh) o.dispose(); if(o.geometry) geometries.add(o.geometry); for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]) materials.add(m); });
      for(const m of materials) for(const value of Object.values(m)) if(value?.isTexture) textures.add(value);
      textures.forEach(t=>t.dispose()); geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose());
    }
  };
}
