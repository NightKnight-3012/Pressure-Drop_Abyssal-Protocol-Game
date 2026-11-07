import * as THREE from "three";
import {createFrameStats} from "./frame-stats.js";
import {
  EYE_HEIGHT, DOWNED_EYE_HEIGHT, STAMINA, WALK_SPEED, RUN_SPEED, SWIM_SPEED, FLOODED_SPEED_FACTOR, FLOODED_SLOW_LEVEL, PLAYER_RADIUS,
  INNER, EXT_LIMIT, REPAIR_RANGE, BREACH_RANGE, TREAT_RANGE, CONSOLE_RANGE, STATIONS, ROOM_IDS, ROOMS, DEPTS,
  roomAt, collides, zoneLabel, LOCKERS, LOCKER_RANGE
} from "../../shared/layout.js";
import { net } from "./network.js";
import { buildWorld } from "./world.js";
import { createRemotes } from "./remotes.js";
import { createInput } from "./input.js";
import { createHud } from "./hud.js";
import { createChatView, bindChatInput } from "./chat.js";
import { options, QUALITY, onOptionsChange, showOptions } from "./options.js";
import { unlockAudio, setThreatAudio, setCaptionSink, setAudioListener, setAudioEnvironment, setCreatureContact, updateMovementAudio, createPodSound, sfx } from "./audio.js";
import { FINALE_POINTS, CAPSULE_STEPS } from "../../shared/tactical.js";
import { createPodView } from "./pod-view.js";
import { createPrologue } from "./prologue.js";
import { createEpilogue } from "./epilogue.js";
import { createRenderBudget } from "./render-budget.js";
import { createMissionComms, createLocomotion } from "./presentation.js";
import { createLockerPanel } from './locker-panel.js';
import { ITEMS } from '../../shared/items.js';
import { RESOURCE_RANGE } from '../../shared/exterior-resources.js';
import { SALVAGE } from '../../shared/salvage.js';
import {LOGS,LOG_RANGE} from '../../shared/story.js';
import {CIRCUITS} from '../../shared/fieldwork.js';
import {SUB_BOARD,SUB_DOCK,SUB_TUNING} from '../../shared/submersible.js';
import {createSubHud} from './sub-hud.js';
import {PRACTICE_STEPS,practiceTargetAllowed} from '../../shared/practice.js';
import {saveEvidence} from './case-file.js';
import {EXTERIOR_ZONES,exteriorZone} from '../../shared/exterior.js';
import {createWorkHands,workPose,workAim} from './work-hands.js';
import {cameraContact} from './hand-rig.js';

const SEND_INTERVAL_MS = 70;
const HOLD_RETRY_MS = 600;
const FOG = {
  ...EXTERIOR_ZONES,
  inside: { color: 0x06151f, near: 8, far: 25 },
  underwater: { color: 0x0a4a6a, near: 0.5, far: 9 },
  outside: { color: 0x03141f, near: 3, far: 46 }
};
const FOG_COLORS=Object.fromEntries(Object.entries(FOG).map(([id,f])=>[id,new THREE.Color(f.color)]));
const VERB = { task: "REPAIR", refill: "REFILL OXYGEN:", airlock: "CYCLE", door: "TOGGLE" };

let G = null; // everything about the running match view (null in menus)

export const isGameRunning = () => G !== null;
const meOf = () => (G?.state ? G.state.players.find((p) => p.id === G.playerId) || null : null);
const closedRooms = (state) => ROOM_IDS.filter((r) => state.rooms[r].closed);

function depthAt(state, x, z) {
  const room = roomAt(x, z);
  if (room === "exterior") return 0;
  return room === "hub" ? state.hub : state.rooms[room].flood;
}

// ================================================================== start / stop
// match = { phase, self:{x,z,rotation}, state, briefingEndsIn }.  Returns false if the game cannot start (no WebGL).
export function startGame({ playerId, code, match, chat }) {
  if (G) return true;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[options.quality].pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = options.brightness;
  const gameEl = document.getElementById("game");
  gameEl.prepend(renderer.domElement); // behind the HUD, never on top of it

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG.inside.color);
  scene.fog = new THREE.Fog(FOG.inside.color, FOG.inside.near, FOG.inside.far);
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 140);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0x7aa8bc, 0x0a1218, 1.1));
  const fill = new THREE.DirectionalLight(0x7ba5b5, 0.45);
  fill.position.set(4, 8, 3);
  scene.add(fill);
  const FLASH_ON = 30;
  const flashlight = new THREE.SpotLight(0xc9f4ff, FLASH_ON, 17, Math.PI / 7, 0.4, 1.3);
  flashlight.target.position.set(0, 0, -1);
  camera.add(flashlight);
  camera.add(flashlight.target);

  const hud = createHud();
  hud.setRoomCode(code);
  const world = buildWorld(scene);
  const remotes = createRemotes(scene);
  const chatView = createChatView(document.getElementById("chat-log"), { fade: true });
  for (const m of chat || []) chatView.add(m);
  setCaptionSink((t) => hud.caption(t));

  G = {
    playerId, code, hud, scene, camera, renderer, world, remotes, flashlight, FLASH_ON, chatView, fill, prologue: createPrologue(() => net.introDone()),
    clock: new THREE.Clock(), raf: 0, renderBudget: createRenderBudget(Math.min(window.devicePixelRatio || 1, QUALITY[options.quality].pixelRatio)),
    phase: match.phase, briefingEndsAt: performance.now() + (match.briefingEndsIn ?? 0),
    player: { x: match.self.x, z: match.self.z },
    state: null, over: false, typing: false, consoleOpen: false, repairId: null, podView: null, epilogue: null, rearView: false, podThrottle: 0.7,
    viewPod: false, stamina: STAMINA.max, winded: false, paused: false, connectionLost: false,
    waterFog: "inside", flash: 0, shake: 0, flashOn: match.state.players.find(p=>p.id===playerId)?.flashlight??true,
    lastSent: 0, holdWanted: false, holdBlocked: false, lastReq: 0, wasHolding: false,
    spectateId: null, lastLeftToast: false, errored: false, voteTimer: 0, lastWarn: 0, votingShown: false,
    input: null, onResize: null, chatInput: document.getElementById("chat-input")
  };
  G.frameStats=createFrameStats();G.comms = createMissionComms(); G.locomotion = createLocomotion();G.workHands=createWorkHands();
  G.lockerId=null;G.locker=createLockerPanel(net.take,closeLocker,net.craft);
  G.subHud=createSubHud(net);G.subSound=createPodSound();
  G.chatInput.value = ""; G.chatInput.classList.add("hidden");
  hud.setFlash(0); hud.setUnderwater(false);

  G.input = createInput(renderer.domElement, {
    onGesture: unlockAudio,
    onLockChange: (locked) => hud.setLookPrompt(!locked),
    onFlashlight() {
      const me = meOf();
      if (G.over || me?.lost) return;
      G.flashOn = !G.flashOn;
      flashlight.intensity = G.flashOn ? FLASH_ON : 0; // not .visible: toggling lights recompiles shaders
      sfx.flashlight(G.flashOn);
      net.light(G.flashOn);
    },
    onInteractStart: interactStart,
    onInteractStop: interactStop,
    onKey: onKey,
    onKeyUp: code => { if (G && code === "KeyR") G.rearView = false; }
  });
  G.input.yaw = match.self.rotation || 0;
  // Steering must keep reaching the server even when a rendered frame stalls.
  G.pilotTimer = setInterval(sendPodInput, SEND_INTERVAL_MS);

  G.unbindChat = bindChatInput(G.chatInput, closeChat);
  let lastQuality = options.quality;
  G.unbindOptions = onOptionsChange(() => {
    if (lastQuality !== options.quality) {
      lastQuality = options.quality;
      G.renderBudget = createRenderBudget(Math.min(window.devicePixelRatio || 1, QUALITY[options.quality].pixelRatio));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[options.quality].pixelRatio));
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    renderer.toneMappingExposure = options.brightness;
  });
  document.getElementById("pause-resume").onclick = () => togglePause(false);
  document.getElementById("pause-options").onclick = showOptions;
  document.getElementById("pause-leave").onclick = () => { net.leave(); setTimeout(() => location.reload(), 80); };

  G.onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    G.podView?.resize(); G.epilogue?.resize();
  };
  window.addEventListener("resize", G.onResize);

  hud.setLookPrompt(true);
  document.getElementById("game").classList.remove("hidden");
  handleState(match.state);
  refreshInput();
  if (G.phase === "briefing") hud.showBriefing(meOf()?.dept, match.briefingEndsIn / 1000, match.state);
  if (match.state.status !== "playing" && match.state.outcome) handleOver(match.state.outcome); // joined a finished match
  frame();
  return true;
}

export function stopGame() {
  if (!G) return;
  document.body.classList.remove('working');
  cancelAnimationFrame(G.raf);
  clearInterval(G.pilotTimer);
  window.removeEventListener("resize", G.onResize);
  G.input.dispose();
  G.chatView.dispose();
  G.unbindChat?.(); G.unbindOptions?.(); G.hud.dispose(); G.locker?.dispose();G.subHud?.dispose();G.subSound?.dispose();
  document.getElementById("pause").classList.add("hidden");
  G.input.releaseMouse();
  G.remotes.clear();
  G.podView?.dispose(); G.epilogue?.dispose(); G.prologue?.dispose();
  G.hud.hideRepair(); G.hud.toggleWrist(false);
  document.getElementById("pod-hud").classList.add("hidden"); document.getElementById("finale-status").classList.add("hidden");
  G.world.dispose();
  G.workHands.dispose();
  G.renderer.dispose();
  G.renderer.domElement.remove();
  setCaptionSink(null);
  setThreatAudio(0);
  const hud = G.hud;
  hud.hideBriefing(); hud.hideGameOver(); hud.hideDown(); hud.setSpectate(null); hud.setConsoleOpen(false); hud.showLost(false);
  document.getElementById("vote").classList.add("hidden");
  document.getElementById("chat-log").replaceChildren();
  document.getElementById("game").classList.add("hidden");
  document.body.classList.remove("in-pod", "pod-clamped");
  G = null;
}

// ================================================================== small helpers
function canAct() {
  const me = meOf();
  return !!G && G.phase === "playing" && !G.over && !G.paused && !G.connectionLost && !G.typing && !G.repairId && !document.body.classList.contains('crew-controls-open') && !!me && !me.down && !me.lost && !me.escaped;
}
function refreshInput() {
  if (!G) return;
  G.input.setEnabled(canAct());
}

function sendPodInput() {
  if (!G || G.phase !== "playing" || G.over || G.connectionLost) return;
  const me = meOf(), pod = G.state?.finale?.pod;
  if (!me?.aboard || me.down || me.lost || me.escaped || pod?.status !== "running" || pod.pilot !== me.id || ["sealing", "ascent"].includes(pod.phase)) return;
  const blocked = G.typing || G.paused || document.hidden || document.body.classList.contains('crew-controls-open');
  const axes = blocked ? { f: 0, s: 0 } : G.input.axes();
  net.podControl(axes.s, axes.f > 0 ? 1 : axes.f < 0 ? 0.15 : 0.7, !blocked && G.input.sprinting());
}

function setFog(mode,dt=0,visibility=1) {
  G.waterFog = mode;
  const f = FOG[mode];
  const k=dt>0?1-Math.exp(-2*dt):1;
  G.scene.fog.color.lerp(FOG_COLORS[mode],k);G.scene.fog.near+=(f.near*visibility-G.scene.fog.near)*k;G.scene.fog.far+=(f.far*visibility-G.scene.fog.far)*k;
  G.scene.background.copy(G.scene.fog.color);
}

// ================================================================== interaction
function nearestTarget() {
  const s = G?.state, me = meOf();
  if (!s || !me || me.lost || me.down || me.escaped || me.aboard) return null;
  if(me.subSeat){const sub=s.sub;return me.subSeat==='driver'&&s.power&&Math.hypot(sub.x-SUB_DOCK.x,sub.z-SUB_DOCK.z)<SUB_TUNING.dockRange&&Math.abs(sub.speed)<.6?{kind:'subdock',id:'sub:dock',point:sub,d:0}:null;}
  if(me.ext&&me.depth>1.25)return null;
  const p = G.player;
  let best = null;
  const consider = (cand) => {
    if(!practiceTargetAllowed(s.practice?.step,cand.id))return;
    const point = cand.st || cand.b || cand.o || cand.point;
    const dx = point.x - p.x, dz = point.z - p.z, length = Math.hypot(dx, dz);
    const facing = length < 0.2 ? 1 : (-Math.sin(G.input.yaw) * dx - Math.cos(G.input.yaw) * dz) / length;
    if (facing < 0.7) return;
    cand.score = cand.d + (1 - facing) * 3;
    if (!best || cand.score < best.score) best = cand;
  };
  if(!me.ext && s.stage==='main')for(const point of Object.values(LOCKERS)) {
    const d=Math.hypot(p.x-point.x,p.z-point.z);
    if(d<=LOCKER_RANGE && p.z>=point.z && roomAt(p.x,p.z)===point.room)consider({kind:'locker',id:`locker:${point.id}`,point,d});
  }
  if(s.sub?.hull>0&&['main','vote','boarding'].includes(s.stage)){
    if(!me.ext&&s.sub.docked){const d=Math.hypot(p.x-SUB_BOARD.x,p.z-SUB_BOARD.z);if(d<REPAIR_RANGE-.05)consider({kind:'subboard',id:'sub:board',point:SUB_BOARD,d});}
    if(me.ext&&Math.abs(s.sub.speed)<.6){const d=Math.hypot(p.x-s.sub.x,p.z-s.sub.z);if(d<SUB_TUNING.boardRange-.05)consider({kind:'subboard',id:'sub:board',point:s.sub,d});
      const point={x:s.sub.x+Math.sin(s.sub.yaw)*2,z:s.sub.z+Math.cos(s.sub.yaw)*2},repairDist=Math.hypot(p.x-point.x,p.z-point.z);
      if(s.stage==='main'&&s.sub.hull<100&&d<SUB_TUNING.boardRange&&me.inventory.some(i=>i==='scrap'||i==='repair')&&repairDist<REPAIR_RANGE)consider({kind:'subrepair',id:'sub:repair',point,d:repairDist-.1});
    }
  }
  if(s.stage==='main')for(const point of LOGS){if(point.ext!==me.ext||!s.story?.available.includes(point.id)||s.story.found.includes(point.id))continue;const d=Math.hypot(p.x-point.x,p.z-point.z);if(d<LOG_RANGE-.05)consider({kind:'log',id:`log:${point.id}`,point,d});}
  if(s.stage==='main')for(const point of s.drops||[]){
    if(point.ext!==me.ext||!me.ext&&roomAt(p.x,p.z)!==point.room)continue;
    const d=Math.hypot(p.x-point.x,p.z-point.z);
    if(d<=RESOURCE_RANGE-.05)consider({kind:'gearPickup',id:point.id,point,d:d-.15});
  }
  if(me.ext&&s.stage==='main')for(const point of [...(s.resources||[]),...(s.scrap||[])]) {
    const d=Math.hypot(p.x-point.x,p.z-point.z);
    if(d<=RESOURCE_RANGE-.05)consider({kind:'resource',id:point.id,point,d});
  }
  if(!me.ext&&s.stage==='main')for(const point of Object.values(CIRCUITS)){const d=Math.hypot(p.x-point.x,p.z-point.z);if(d<REPAIR_RANGE-.05)consider({kind:'circuit',id:`circuit:${point.room}`,point,d});}
  if(s.stage==='main' && s.salvage) {
    const recover=me.ext&&s.salvage.state==='available';
    const install=!me.ext&&s.salvage.carrier===me.id&&s.power&&s.stations.pump==='done';
    if(recover||install){const point=recover?SALVAGE:STATIONS.pump,d=Math.hypot(p.x-point.x,p.z-point.z);if(d<(recover?RESOURCE_RANGE:REPAIR_RANGE)-.05)consider({kind:'salvage',id:recover?SALVAGE.recover:SALVAGE.install,point,d:d-.1});}
  }
  if (!me.ext) for (const [id, point] of Object.entries(FINALE_POINTS)) {
    if (id === "board" && (s.stage !== "boarding" || me.left)) continue;
    if (id === "beacon" && s.stage !== "finale") continue;
    const d = Math.hypot(p.x - point.x, p.z - point.z);
    if (d <= 2.0) consider({ kind: "emergency", id, point, d });
  }
  if (!me.ext && s.stage === 'main' && s.complication?.state === 'active') {
    const point = STATIONS.pump, d = Math.hypot(p.x-point.x,p.z-point.z);
    if(d <= REPAIR_RANGE-.05) consider({kind:'service',id:'service:pump',point,d});
  }
  for (const id of Object.keys(s.stations)) {
    const st = STATIONS[id];
    if (!!st.exterior !== !!me.ext) continue;
    const state = s.stations[id];
    const consoleOpenable = id === "console" && state === "done";
    if (state === "done" && !consoleOpenable) continue;
    const d = Math.hypot(p.x - st.x, p.z - st.z);
    if (d <= (consoleOpenable ? CONSOLE_RANGE : REPAIR_RANGE) - 0.05) consider({ kind: "station", id, st, state, d, consoleOpenable });
  }
  if (!me.ext) {
    for (const b of s.breaches) {
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d <= BREACH_RANGE - 0.05) consider({ kind: "breach", id: b.id, d: d - 0.3, b }); // slight priority over panels
    }
    for (const o of s.players) {
      if (o.id === me.id || o.lost || o.ext || (!o.down && o.hp >= 100)) continue;
      const d = Math.hypot(p.x - o.x, p.z - o.z);
      if (d <= TREAT_RANGE - 0.05) consider({ kind: "treat", id: `treat:${o.id}`, o, d: o.down ? d - 1 : d });
    }
  }
  return best;
}

function promptFor(t, me) {
  const s = G.state;
  if(t.kind==='subboard')return `PRESS E / BOARD SKIFF-2 SURVEY SUB / ${Number(!!s.sub.driver)+Number(!!s.sub.passenger)}/2 OCCUPIED`;
  if(t.kind==='subdock')return 'HOLD E / DOCK AND EQUALISE MEDICAL TRANSFER HATCH / 2s';
  if(t.kind==='subrepair')return 'HOLD E / REPAIR SURVEY SUB / 5s / USE ONE ALLOY OR REPAIR KIT / +25 HULL';
  if(t.kind==='circuit')return `HOLD E / ${s.roomCircuits?.[t.point.room]?'ISOLATE':'RESTORE'} LOCAL LIGHTING CIRCUIT / STOPS LIVE-WATER SHOCKS`;
  if(t.kind==='log')return `HOLD E / RECOVER RECORD: ${t.point.title.toUpperCase()} / 1s`;
  if(t.kind==='gearPickup')return me.inventory.includes(null)?`HOLD E / TAKE ${ITEMS[t.point.item].label.toUpperCase()} / 1s`:'INVENTORY FULL / Q SELECT / BACKSPACE PUT DOWN';
  if(t.kind==='salvage')return t.id===SALVAGE.install?'HOLD E / INSTALL REGULATOR / 4s / PUMP FLOW +20 POINTS':me.inventory.includes(null)?'HOLD E / RECOVER PUMP REGULATOR / 3s / RETURN TO ENGINEERING':'INVENTORY FULL / Q SELECT / BACKSPACE PUT DOWN';
  if(t.kind==='resource')return me.inventory?.some(item=>item===null)?`HOLD E / RECOVER ${ITEMS[t.point.item].label.toUpperCase()} / 2s / OPENING MAKES NOISE`:'INVENTORY FULL / Q SELECT / BACKSPACE PUT DOWN';
  if(t.kind==='locker') {
    const count=Object.values(s.lockers?.[t.point.id]||{}).reduce((a,b)=>a+b,0);
    return `PRESS E / ${t.point.label.toUpperCase()} / ${count} SHARED SUPPLIES`;
  }
  if (t.kind === 'service') return 'HOLD E · CLEAR PUMP FILTER / RESTORE FLOW + 10% OUTPUT';
  if (t.kind === "emergency") {
    if (t.id === "board") return "PRESS E · BOARD YOUR SEAT IN THE ESCAPE POD";
    if (t.point.kind === "passage") return "HOLD E · " + t.point.label.toUpperCase() + " (sealed during lockdown)";
    if (t.id === "beacon") return `PRESS E · ${s.finale.station.beacon ? "STOP" : "ACTIVATE"} THE BEACON · DRAINS CAPSULE RESERVE`;
    if (s.stage !== "finale") return "PRESS E · SURVEY THE DAMAGED MAINTENANCE CAPSULES";
    const station = s.finale.station;
    if (station.capsulesRemaining === 0) return "MAINTENANCE CAPSULE RACK EMPTY";
    return station.capsuleStep >= 3 ? "PRESS E · LAUNCH YOUR MAINTENANCE CAPSULE" : `HOLD E · ${CAPSULE_STEPS[station.capsuleStep].toUpperCase()} · 12 RESERVE POWER`;
  }
  if (t.kind === "breach") return me.dept === "engineering" ? "HOLD E - PATCH HULL BREACH (fast)" : "HOLD E - PATCH HULL BREACH";
  if (t.kind === "treat") {
    if (t.o.down) return `HOLD E - REVIVE ${t.o.name.toUpperCase()}`;
    return me.dept === "medical" ? `HOLD E - HEAL ${t.o.name.toUpperCase()}` : `${t.o.name.toUpperCase()} IS HURT (only Medical can heal)`;
  }
  const st = t.st;
  if (s.calibrations?.[t.id] && !s.calibrations[t.id].solved && t.state === "ready") return `PRESS E · CALIBRATE ${st.label.toUpperCase()}`;
  if (t.consoleOpenable) return `PRESS E - USE ${st.label.toUpperCase()} (sonar, doors, decoy)`;
  if (t.state === "lockdown") return "HOLD E - OVERRIDE LOCKDOWN (the other sealed room must hold too)";
  if (t.state === "cooldown") return `${st.label.toUpperCase()}: RECHARGING`;
  if (t.state === "locked") {
    if (st.kind === "door") return "NO POWER - THE DOORS NEED POWER";
    const missing = (st.requires || []).find((r) => r === "junctions" ? Object.keys(s.stations).some((id) => STATIONS[id].junction && s.stations[id] !== "done") : s.stations[r] !== "done");
    const what = missing === "junctions" ? "THE OUTSIDE CABLE JUNCTIONS" : (STATIONS[missing]?.label ?? "SOMETHING").toUpperCase();
    return `${st.label.toUpperCase()}: NEEDS ${what} FIRST`;
  }
  if (st.kind === "door") {
    const closed = s.rooms[st.door].closed;
    return `HOLD E - ${closed ? "OPEN" : "CLOSE"} THE ${ROOMS[st.door].label.toUpperCase()} BLAST DOOR`;
  }
  if (st.kind === "airlock" && !st.exterior && me.dept !== "eva" && s.players.some((p) => p.dept === "eva" && !p.lost)) return "AIRLOCK: DIVERS ONLY";
  return `HOLD E - ${VERB[st.kind] || "USE"} ${st.label.toUpperCase()}`;
}

function myHold() {
  return G?.state?.holds[G.playerId] || null;
}

function requestHold(target) {
  net.interact(target.id);
  G.lastReq = performance.now();
}

function interactStart() {
  if (!canAct()) return;
  if(meOf()?.subSeat&&!nearestTarget()){net.subAction('exit');return;}
  if (meOf()?.aboard) { if (G.state.stage === "finale" && G.state.finale.pod.phase !== "ascent") net.podAction("repair"); return; }
  const t = nearestTarget();
  if (!t) return;
  if(t.kind==='subboard'){net.interact(t.id);return;}
  if(t.kind==='locker') {
    if(G.lockerId===t.point.id){closeLocker();return;}
    interactStop();G.hud.toggleWrist(false);G.lockerId=t.point.id;G.locker.open(t.point.id);G.locker.update(G.state,meOf());
    G.input.releaseMouse();(document.querySelector('#locker-stock button:not(:disabled)')||document.getElementById('locker-close')).focus();return;
  }
  closeLocker();
  if(t.kind==='resource'&&!meOf().inventory.some(item=>item===null)){G.hud.toast('INVENTORY FULL / Q SELECT / BACKSPACE PUT DOWN');sfx.error();return;}
  if (t.kind === "station" && G.state.calibrations?.[t.id] && !G.state.calibrations[t.id].solved && t.state === "ready") {
    G.repairId = t.id; G.input.releaseMouse(); refreshInput();
    G.hud.showRepair(t.id, G.state.calibrations[t.id], net.calibrate, closeRepair); return;
  }
  if (t.kind === "emergency" && t.point.kind !== "passage" && t.id !== "capsule") { net.interact(t.id); return; }
  if (t.id === "capsule" && (G.state.stage !== "finale" || G.state.finale.station.capsuleStep >= 3)) { net.interact(t.id); return; }
  if (t.consoleOpenable) { toggleConsole(); return; }
  if (t.kind === "station" && (t.state === "locked" || t.state === "cooldown")) { G.hud.toast(promptFor(t, meOf())); sfx.error(); return; }
  G.holdWanted = true;
  G.holdBlocked = false;
  requestHold(t);
}

function interactStop() {
  G?.workHands.update(null);
  if (G && meOf()?.aboard && G.state?.stage === "finale" && G.state.finale.pod.phase !== "ascent") { net.podAction("repairStop"); return; }
  if (!G || !G.holdWanted) return;
  G.holdWanted = false;
  // Always cancel a requested hold, including capsule work and requests whose
  // acknowledgement has not arrived yet. Releasing E must never finish a repair.
  net.cancel();
  if (myHold() || G.state?.finale?.station.repair?.by === G.playerId) sfx.holdCancel();
}

function closeRepair() {
  if (!G) return; G.repairId = null; G.hud.hideRepair(); refreshInput();
}

// ================================================================== console / chat / keys
function closeLocker() {
  if(!G)return;G.lockerId=null;G.locker?.close();
}

function toggleConsole(force) {
  const open = force ?? !G.consoleOpen;
  if(open)closeLocker();
  G.consoleOpen = open;
  G.hud.setConsoleOpen(open);
  if (open) G.input.releaseMouse(); // not needed for keys, but lets the player look at the screen calmly
}

function togglePause(open) {
  if (!G || G.over) return;
  G.paused = open; document.getElementById("pause").classList.toggle("hidden", !open);
  if (open) { interactStop(); G.input.releaseMouse(); }
  refreshInput();
}
function openChat() {
  closeLocker();
  if (G.typing) return;
  G.typing = true;
  G.input.setEnabled(false);
  G.input.releaseMouse();
  G.chatInput.classList.remove("hidden");
  G.chatInput.focus();
}
function closeChat() {
  if (!G) return;
  G.typing = false;
  G.chatInput.classList.add("hidden");
  G.chatInput.blur();
  refreshInput();
  try { G.renderer.domElement.requestPointerLock()?.catch?.(() => {}); } catch { /* the player can click */ }
}

function spectateTargets() {
  return G.state.players.filter((p) => !p.lost && !p.escaped && p.id !== G.playerId);
}
function onKey(code) {
  if (!G) return;
  if(document.body.classList.contains('crew-controls-open'))return;
  const me = meOf();
  if (code === "Enter" && !G.paused && !G.connectionLost && !G.over) return openChat();
  if (code === "Escape") {
    if (!document.getElementById("options").classList.contains("hidden")) { document.getElementById("options").classList.add("hidden"); return; }
    if (G.repairId) { closeRepair(); return; }
    if (G.lockerId) { closeLocker(); return; }
    if (G.consoleOpen) { toggleConsole(false); return; }
    if (document.body.classList.contains("wrist-open")) { G.hud.toggleWrist(false); return; }
    togglePause(!G.paused); return;
  }
  if (G.paused || G.connectionLost || G.over) return;
  if ((me?.lost || me?.escaped) && G.state) {
    const list = spectateTargets();
    if (code === "Tab" && list.length) {
      const i = list.findIndex((p) => p.id === G.spectateId);
      G.spectateId = list[(i + 1) % list.length].id;
    } else if (code === "KeyP" && G.spectateId) net.ping(G.spectateId);
    return;
  }
  if(me?.subSeat){if(!canAct())return;const action={KeyX:'flare',KeyT:'scan',KeyV:'pilot'}[code];if(action)net.subAction(action);return;}
  if (code === "Tab") { if (G.viewPod) return; closeLocker(); G.hud.toggleWrist(); if (document.body.classList.contains("wrist-open")) G.input.releaseMouse(); return; }
  if (me?.aboard && G.state?.stage === "finale") {
    if (code === "KeyR") G.rearView = true;
    if (G.state.finale.pod.phase === "ascent") return;
    if (G.state.finale.pod.phase === "sealing" && ["KeyT", "KeyV"].includes(code)) return;
    const action = { KeyQ: "sonar", KeyX: "countermeasure", KeyV: "propose", KeyT: "pilot" }[code]; if (action) net.podAction(action);
    return;
  }
  if (G.consoleOpen && G.phase === "playing") {
    const n = Number(code.replace("Digit", ""));
    if (n >= 1 && n <= 4) net.door(ROOM_IDS[n - 1]);
    else if (n === 5) net.decoy();
    return;
  }
  if (!canAct()) return;
  if (/^Digit[1-4]$/.test(code)) G.hud.useGear(Number(code.slice(-1)) - 1);
  else if (code === 'KeyQ') G.hud.cycleGear();
  else if (code === 'KeyX') G.hud.useGear();
  else if (code === 'Backspace') G.hud.dropGear();
}

// ================================================================== frame loop
function movePlayer(dt, me) {
  const { f, s, moving } = G.input.axes();
  // Sprinting costs stamina (the server keeps its own count; ours just keeps the bar and controls in step)
  const wantsSprint = moving && G.input.sprinting() && !me.ext;
  const running = wantsSprint && !G.winded && G.stamina > 0;
  if (running) {
    G.stamina = Math.max(0, G.stamina - STAMINA.drain * dt);
    if (G.stamina <= 0) G.winded = true;
  } else {
    G.stamina = Math.min(STAMINA.max, G.stamina + STAMINA.regen * dt);
    if (G.winded && G.stamina >= STAMINA.resumeAt) G.winded = false;
  }
  let speed = me.ext ? SWIM_SPEED : running ? RUN_SPEED : WALK_SPEED;
  if (!me.ext && depthAt(G.state, G.player.x, G.player.z) > FLOODED_SLOW_LEVEL) speed *= FLOODED_SPEED_FACTOR;
  const yaw = G.input.yaw, d = speed * dt;
  const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) * d;
  const dz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) * d;
  const p = G.player, closed = closedRooms(G.state), limit = me.ext ? EXT_LIMIT : INNER;
  const blocked = (x, z) => collides(x, z, PLAYER_RADIUS, closed, me.ext) || Math.abs(x) > limit || Math.abs(z) > limit;
  if (!blocked(p.x + dx, p.z)) p.x += dx; // one axis at a time lets you slide along walls
  if (!blocked(p.x, p.z + dz)) p.z += dz;
  return running;
}

function frame() {
  if (!G) return;
  G.raf = requestAnimationFrame(frame);
  try {
    step();
  } catch (e) {
    if (!G.errored) { G.errored = true; console.error("Game loop error:", e); G.hud.toast("Display error (see console). The game is still running."); }
  }
  if (!G.epilogue && G.viewPod && G.podView) G.podView.render(G.renderer);
  else G.renderer.render(G.epilogue ? G.epilogue.scene : G.scene, G.epilogue ? G.epilogue.camera : G.camera);
  if(!G.epilogue&&!G.viewPod)G.workHands.render(G.renderer,G.camera.aspect);
}

function step() {
  const frameTime = G.clock.getDelta(), dt = Math.min(frameTime, 0.1);
  const measured=G.frameStats.sample(frameTime,!document.hidden&&!G.connectionLost);
  if(measured){const output=document.getElementById('performance-readout');if(output)output.textContent=measured.fps+' FPS / 95th-percentile frame '+measured.p95+' ms / '+options.quality+' / measured on this device';}
  const ratio = G.renderBudget.sample(frameTime, !document.hidden && !G.paused && !G.connectionLost);
  if (ratio !== null) G.renderer.setPixelRatio(ratio);
  const now = performance.now();
  const time = G.clock.elapsedTime;
  const { hud, camera, state } = G;
  if (!state) return;
  const me = meOf();
  const reduced = options.reduced;
  if(G.phase!=='playing'||G.over||G.epilogue)G.workHands.update(null);
  if (G.epilogue) { G.epilogue.update(Math.min(frameTime, 0.25)); return; }
  if(!G.over)G.subHud.update(state,me);

  if (G.phase === "briefing" && G.prologue.update((G.briefingEndsAt - now) / 1000, camera, reduced)) {
    setAudioEnvironment({active:!G.connectionLost,outside:true,underwater:false,pod:false,surface:false});
    hud.hideBriefing(); setFog("outside"); G.fill.intensity = 1.2;
    G.world.update(state, { dt, time, now, reducedEffects: reduced, holdIds: new Set(), alert: 0, viewer: camera.position });
    return;
  }
  G.prologue.update(0, camera, reduced); G.fill.intensity = 0.45;

  // ---- briefing countdown
  if (G.phase === "briefing") hud.showBriefing(me?.dept, (G.briefingEndsAt - now) / 1000, state);
  const transmission = G.comms.update(state, me, now, G.phase === "playing" && !G.paused && !G.connectionLost && !G.over);
  if (transmission) G.chatView.add({ system: true, text: transmission });

  // ---- movement + networking
  let running = false;
  const beforeX = G.player.x, beforeZ = G.player.z;
  if (canAct() && me && !me.aboard&&!me.subSeat) {
    // Preserve walking speed at lower frame rates without stepping through walls.
    const travelTime = Math.min(frameTime, 0.2), steps = Math.max(1, Math.ceil(travelTime / 0.04));
    for (let i = 0; i < steps; i++) running = movePlayer(travelTime / steps, me);
  }
  if (G.phase === "playing" && !G.connectionLost && !G.over && me && !me.lost && !me.down && !me.escaped && now - G.lastSent >= SEND_INTERVAL_MS) {
    G.lastSent = now;
    if(me.subSeat==='driver'&&canAct()){const axes=G.input.axes();net.subControl(Math.sign(axes.s),Math.sign(axes.f));}
    else if(!me.subSeat&&!me.aboard){net.move(+G.player.x.toFixed(3),+G.player.z.toFixed(3),+G.input.yaw.toFixed(3),running);if(me.ext)net.dive(canAct()?G.input.depthAxis():0);}
  }
  // downed / lost players follow the server's position (they cannot move)
  if (me?.down) { G.player.x = me.x; G.player.z = me.z; }
  if(me?.subSeat){const k=1-Math.exp(-12*dt);G.player.x+=(me.x-G.player.x)*k;G.player.z+=(me.z-G.player.z)*k;if(G.lastSubSeat!==me.subSeat){G.subLookBase=G.input.yaw;closeLocker();G.hud.toggleWrist(false);G.hud.setConsoleOpen(false);G.consoleOpen=false;}}
  else if(G.lastSubSeat){G.input.yaw=G.subLastYaw??G.input.yaw;}
  G.lastSubSeat=me?.subSeat||null;

  // ---- camera
  let eye = EYE_HEIGHT, cx = G.player.x, cz = G.player.z, yaw = G.input.yaw, pitch = G.input.pitch, roll = 0;
  G.displayDepth=(G.displayDepth||0)+((me?.ext&&!me.subSeat?me.depth||0:0)-(G.displayDepth||0))*(1-Math.exp(-12*dt));eye-=G.displayDepth;
  if(me?.subSeat){yaw=state.sub.yaw+G.input.yaw-G.subLookBase;G.subLastYaw=yaw;eye=SUB_TUNING.eye;const side=me.subSeat==='driver'?-.32:.32;cx+=Math.cos(state.sub.yaw)*side-Math.sin(state.sub.yaw)*.25;cz-=Math.sin(state.sub.yaw)*side+Math.cos(state.sub.yaw)*.25;}
  if (me?.lost || me?.escaped) { // each outcome settles independently
    const list = spectateTargets();
    if (!list.some((p) => p.id === G.spectateId)) G.spectateId = list[0]?.id ?? null;
    const r = G.spectateId ? G.remotes.get(G.spectateId) : null;
    const target = state.players.find(p => p.id === G.spectateId);
    hud.setSpectate(target?.name || "(nobody left)");
    if(target?.subSeat){cx=state.sub.x;cz=state.sub.z;eye=SUB_TUNING.eye;yaw=state.sub.yaw;pitch=0;}
    else if (r) { cx = r.group.position.x; cz = r.group.position.z; yaw = r.group.rotation.y; pitch = 0; eye = (r.down ? DOWNED_EYE_HEIGHT : EYE_HEIGHT)-(target?.depth||0); }
    else { cx = 0; cz = 0; eye = 6; pitch = -0.6; }
  } else {
    hud.setSpectate(null);
    if (me?.down) { eye = DOWNED_EYE_HEIGHT; roll = 0.35; }
  }
  camera.position.set(cx, eye, cz);
  camera.rotation.set(pitch, yaw, roll);
  const motion = G.locomotion.update(frameTime, Math.hypot(G.player.x - beforeX, G.player.z - beforeZ), {
    running, swimming: !!me?.ext, strafe: G.input.axes().s, reduced,
    active: canAct() && !me?.aboard&&!me?.subSeat && !G.holdWanted
  });
  camera.position.y += motion.height; camera.rotation.z += motion.roll;
  const fieldOfView=motion.fov+options.fov-75;
  if (Math.abs(camera.fov - fieldOfView) > 0.001) { camera.fov = fieldOfView; camera.updateProjectionMatrix(); }
  setAudioListener(cx, cz, yaw);
  G.subSound.update(!G.over&&me?.subSeat?Math.abs(state.sub.speed):0,false,0);
  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - dt * 2.4);
    if (!reduced) { camera.position.x += (Math.random() - 0.5) * G.shake * 0.22; camera.position.y += (Math.random() - 0.5) * G.shake * 0.18; }
  }
  if (G.flash > 0) { G.flash = Math.max(0, G.flash - dt * 1.8); hud.setFlash(reduced ? G.flash * 0.3 : G.flash); }

  if (!me?.aboard || me.lost || me.escaped) G.remotes.update(dt, camera.position, me?.lost || me?.escaped ? G.spectateId : null, camera);
  const following = state.players.find(p => p.id === G.spectateId);
  G.viewPod = !!state.finale && (!!me?.aboard && !me.lost && !me.escaped || (me?.lost || me?.escaped) && !!following?.aboard);
  if (G.viewPod && document.body.classList.contains("wrist-open")) hud.toggleWrist(false);
  document.body.classList.toggle("in-pod", G.viewPod);
  document.body.classList.toggle("pod-clamped", G.viewPod && ["sealing", "ascent"].includes(state.finale.pod.phase));
  hud.setLookPrompt(!G.viewPod && !G.input.isLocked());
  if (G.viewPod) { G.podView ??= createPodView(); G.podView.update(state.finale, dt, G.rearView, reduced, !G.over); }
  else G.podView?.pause();

  // ---- environment
  const viewer = me?.lost || me?.escaped ? { x: cx, z: cz } : G.player;
  const outside = roomAt(viewer.x, viewer.z) === "exterior";
  const depthShade=1/(1+(me?.depth||0)*.12);
  G.fill.intensity=outside ? .85*depthShade : .45;
  const region=exteriorZone(viewer.x,viewer.z);
  G.flashlight.distance = outside ? region.lamp*depthShade : 17;
  G.flashlight.intensity = G.flashOn ? G.FLASH_ON * (outside ? 1.4 : 1) : 0;
  const depth = depthAt(state, viewer.x, viewer.z);
  const under = !G.viewPod && !outside && depth > eye - 0.1;
  setAudioEnvironment({active:!G.connectionLost && !G.over,outside:outside && !G.viewPod,underwater:under,pod:G.viewPod,surface:false});
  setCreatureContact(!state.finale && !G.over ? state.lev : null);
  updateMovementAudio(Math.hypot(G.player.x-beforeX,G.player.z-beforeZ),{
    active:canAct() && !me?.aboard&&!me?.subSeat, running, swimming:!!me?.ext, wet:depth>.12
  });
  setFog(outside ? region.id : under ? "underwater" : "inside",dt,outside?depthShade:1);
  hud.setUnderwater(under && !reduced);
  const holdIds = new Set(Object.values(state.holds).map((h) => h.id));
  const alert = state.lockdown.active || state.stage === "boarding" ? 1 : state.oxygen < 15 ? 0.6 : 0;
  if (!G.viewPod) G.world.update(state, { dt, time, now, reducedEffects: reduced, holdIds, alert, viewer: camera.position, camera, flashlightOn:G.flashOn,selfId:G.playerId });
  if (G.repairId && Math.hypot(G.player.x - STATIONS[G.repairId].x, G.player.z - STATIONS[G.repairId].z) > REPAIR_RANGE + 0.3) closeRepair();

  // ---- warnings
  if (!G.viewPod && (state.lev.state === "approach" || state.lev.state === "attack") && now - G.lastWarn > 4500) { G.lastWarn = now; sfx.warning(); }

  // ---- hold-E retry (walked up late, or somebody else was busy)
  if (G.holdWanted && !G.holdBlocked && canAct() && !myHold() && now - G.lastReq > HOLD_RETRY_MS) {
    const t = nearestTarget();
    if (t && !t.consoleOpenable && !(t.kind === "station" && (t.state === "locked" || t.state === "cooldown"))) requestHold(t);
  }

  // ---- prompts
  if(me?.submerged&&me.breath<=6&&now-(G.lastBreathWarn??-Infinity)>6000){G.lastBreathWarn=now;sfx.drowning();}
  if(me?.contactWarning&&now-(G.lastContactWarn??-Infinity)>4000){G.lastContactWarn=now;sfx.closeContact();}
  const mine = myHold();
  const workTarget=mine?nearestTarget():null,workPoint=workTarget?.st||workTarget?.b||workTarget?.o||workTarget?.point;
  G.workHands.update(workPose({hold:mine,working:G.holdWanted&&workTarget?.id===mine?.id,blocked:!canAct()||G.phase!=='playing'||!!G.epilogue||G.viewPod||!!G.lockerId||G.consoleOpen||G.votingShown||document.body.classList.contains('wrist-open'),player:me,stage:state.stage,aim:workAim(workPoint,camera.position,G.input.yaw,G.input.pitch),contact:cameraContact(G.world.workSurface(workTarget,camera.position),camera)}),dt,reduced);
  if (mine) {
    if (!G.wasHolding) sfx.holdStart();
    G.wasHolding = true;
    const t = nearestTarget();
    const text = mine.id.startsWith("door_") && state.lockdown.active
      ? "OVERRIDING: keep holding E. The other sealed room must hold too."
      : t && t.id === mine.id ? promptFor(t, me) : "HOLD E - WORKING...";
    hud.setInteraction(text, mine.progress);
  } else {
    G.wasHolding = false;
    const t = canAct() ? nearestTarget() : null;
    hud.setInteraction(t ? promptFor(t, me) : null, null);
    G.world.setTarget?.(t?.id);
    if (state.finale?.station.repair?.by === me?.id) hud.setInteraction("HOLD E · RESTORING THE MAINTENANCE CAPSULE", state.finale.station.repair.progress);
  }

  // ---- console auto-close
  if (G.consoleOpen) {
    const far = Math.hypot(G.player.x - STATIONS.console.x, G.player.z - STATIONS.console.z) > CONSOLE_RANGE + 0.6;
    if (far || !me || me.down || me.lost || me.ext) toggleConsole(false);
    else hud.updateConsole(state, time, me);
  }

  // ---- down overlay
  if(G.lockerId) {
    const point=LOCKERS[G.lockerId];
    if(!me || me.ext || me.down || me.lost || me.aboard || me.escaped || state.stage!=='main' || G.paused || G.connectionLost || Math.hypot(G.player.x-point.x,G.player.z-point.z)>LOCKER_RANGE || G.player.z<point.z)closeLocker();
    else G.locker.update(state,me);
  }
  if (me?.down) {
    hud.showDown(me.downIn);
  } else hud.hideDown();

  // ---- left behind notice
  if (me?.left && !G.lastLeftToast) { G.lastLeftToast = true; hud.toast("YOU WERE LEFT BEHIND. You can still help the others board."); }

  // ---- vote overlay
  const voting = hud.updateVote(state, me, (sel, confirmed) => {
    clearTimeout(G.voteTimer);
    net.vote(sel, confirmed);
  });
  if (voting && !G.votingShown) { G.votingShown = true; G.input.releaseMouse(); if (G.consoleOpen) toggleConsole(false); }
  if (!voting) G.votingShown = false;

  hud.update(state, { me, following, position:G.player, yaw:G.input.yaw, zone: me?.lost || me?.escaped ? "Spectating" : me?.aboard ? "Escape pod" : zoneLabel(G.player.x, G.player.z), depth, stamina: G.stamina, winded: G.winded });
}

// ================================================================== events from the server
export function handleState(s) {
  if (!G || !s || !Array.isArray(s.players)) return;
  G.state = s;
  if(s.story?.found.length&&s.story.found.join()!==G.evidenceKey){G.evidenceKey=s.story.found.join();saveEvidence(s.story.found);}
  G.remotes.sync(s.players.filter((p) => p.id !== G.playerId));
  setThreatAudio(s.lev.threat);
  const mine = s.players.find((p) => p.id === G.playerId);
  if (mine && Math.abs(mine.stm - G.stamina) > 20) { G.stamina = mine.stm; G.winded = !!mine.wnd; } // drifted: trust the server
  if (s.status !== "playing" && !G.over && s.outcome) handleOver(s.outcome);
  refreshInput();
}

export function handleGo() {
  if (!G) return;
  G.phase = "playing";
  G.hud.hideBriefing();
  G.hud.toast("MISSION START");
  refreshInput();
}

export function handleBriefing(payload) {
  if (!G || G.phase !== "briefing") return;
  G.briefingEndsAt = performance.now() + payload.briefingEndsIn;
}

export function handleEvent(e) {
  if (!G || !e) return;
  const me = meOf();
  switch (e.type) {
    case 'practiceStep': sfx.done();G.hud.caption(`[TRAINING / ${PRACTICE_STEPS[e.step]?e.step.toUpperCase():'CONTINUE'} / FOLLOW THE OBJECTIVE]`);break;
    case 'subBoarded': sfx.subHatch(G.state.sub);if(e.by===G.playerId)G.hud.toast(e.seat==='driver'?'SURVEY SUB / PILOT. W/S THRUST, A/D STEER. RETURN TO MEDICAL DOCK TO TRANSFER INSIDE.':'SURVEY SUB / OPERATOR. X FLARE, T SCAN. WATCH AIR AND HULL.');break;
    case 'subDocked': sfx.subHatch({x:SUB_BOARD.x,z:SUB_BOARD.z});G.hud.toast('MEDICAL TRANSFER SEALED / CREW INSIDE / SUB AIR RECHARGING');break;
    case 'subExited': if(e.by===G.playerId)G.hud.toast('HATCH EXIT / BACK ON SUIT AIR. RETURN THROUGH THE MEDICAL AIRLOCK.');break;
    case 'subPilot': if(e.by===G.playerId)G.hud.toast('SURVEY PILOT CONTROLS TRANSFERRED TO YOU');break;
    case 'subFlare': sfx.item('flare',e);break;
    case 'subScan': sfx.item('scanner',G.state.sub);G.hud.toast('SURVEY SUB ACTIVE SCAN / LAST-KNOWN CONTACT SHARED');break;
    case 'subRepaired': sfx.done();G.hud.toast('SURVEY SUB PATCHED / +25 HULL / ONE MATERIAL USED');break;
    case 'subBump': sfx.hazardImpact('[SURVEY SUB STRIKES ROCK OR WRECKAGE]',e);if(me?.subSeat)G.shake=.2;break;
    case 'subDestroyed': sfx.hazardImpact('[SURVEY SUB HULL FAILURE / EMERGENCY HATCH RELEASE]',G.state.sub);G.hud.toast('SURVEY SUB LOST / CREW ON SUIT AIR / RETURN TO MEDICAL');break;
    case 'subEngine': if(e.active)sfx.subEngine(e);break;
    case 'crafted': sfx.done();if(e.by===G.playerId)G.hud.toast(`${ITEMS[e.item].label.toUpperCase()} FABRICATED / ${e.cost} ALLOY USED`);break;
    case 'scrapRecovered': sfx.recover({x:e.x,z:e.z});if(e.by===G.playerId)G.hud.toast('ALLOY RECOVERED / FABRICATE TOOLS AT POWERED ENGINEERING STORES');break;
    case 'circuit': sfx.flashlight(e.on);G.hud.toast(`${ROOMS[e.room].label.toUpperCase()} LOCAL CIRCUIT ${e.on?'RESTORED':'ISOLATED'} / CRITICAL SYSTEMS REMAIN ON BACKUP`);break;
    case 'hazardWarning': {const messages={skitter:'SKITTERS AT A BREACH / PATCH THE OPENING, USE A FLARE, OR EVA SONIC PROD',electric:'LIVE WATER / ISOLATE THE LOCAL CIRCUIT OR DRAIN THE ROOM. KEEP OUT UNTIL SAFE',mine:'MINE SENSOR / TURN OFF YOUR LIGHT AND BACK AWAY. EMP CAN DISARM IT',warden:'SECOND CONTACT / IT HUNTS LIGHT. DARKEN LOCAL CIRCUITS AND YOUR LAMP, OR USE A FLARE DECOY'};sfx.warning();G.hud.caption(`[${e.room?ROOMS[e.room].label.toUpperCase()+' / ':''}${messages[e.kind]}]`,10000);G.hud.toast(messages[e.kind]);break;}
    case 'mineBlast': sfx.hazardImpact('[MINE DETONATION OUTSIDE]',e);break;
    case 'wardenStrike': sfx.hazardImpact('[LIGHT-HUNTING CONTACT STRIKES THE HULL]',{x:ROOMS[e.room].sx*10,z:ROOMS[e.room].sz*10});G.hud.toast(`${ROOMS[e.room].label.toUpperCase()} / LIGHT CONTACT STRIKE`);break;
    case 'storyLog': {const log=LOGS.find(l=>l.id===e.log);if(log){saveEvidence([log.id]);G.hud.caption(`[RECORD / ${log.title}] ${log.text}`,14000);G.hud.toast('EVIDENCE SAVED / CASE FILE AVAILABLE IN THE LOBBY');sfx.done();}break;}
    case 'salvageRecovered': sfx.recover({x:e.x,z:e.z});G.hud.toast('REGULATOR RECOVERED / CARRIER: RETURN THROUGH MEDICAL AIRLOCK. HOLD E AT REPAIRED ENGINEERING PUMP.');break;
    case 'salvageInstalled': sfx.done();G.hud.toast('REGULATOR INSTALLED / PUMP FLOW +20 POINTS. FILTER MAINTENANCE STILL MATTERS.');break;
    case 'salvageReturned': sfx.warning();G.hud.toast('REGULATOR LOST / RECOVERY CRADLE AT THE WRECK IS AVAILABLE AGAIN.');break;
    case 'gearDropped':
      sfx.gearTransfer(false,{x:e.x,z:e.z});
      if(e.by===G.playerId)G.hud.toast(`${ITEMS[e.item].label.toUpperCase()} PUT DOWN / CREW CAN HOLD E TO RECOVER`);
      break;
    case 'gearRecovered':
      sfx.gearTransfer(true,{x:e.x,z:e.z});
      if(e.by===G.playerId)G.hud.toast(`${ITEMS[e.item].label.toUpperCase()} RECOVERED / SLOT ${e.slot+1}`);
      break;
    case 'resourceRecovered':
      sfx.recover({x:e.x,z:e.z});
      if(e.by===G.playerId)G.hud.toast(`${ITEMS[e.item].label.toUpperCase()} RECOVERED / SLOT ${e.slot+1} / RETURN THROUGH THE MEDICAL AIRLOCK`);
      break;
    case 'lockerTake':
      sfx.supply({x:e.x,z:e.z});
      if(e.by===G.playerId)G.hud.toast(`${ITEMS[e.item].label.toUpperCase()} TAKEN / SLOT ${e.slot+1} / SHARED STOCK REDUCED`);
      break;
    case 'pumpClog': sfx.warning(); G.hud.toast(`PUMP FILTER OBSTRUCTED / ${G.state?.salvage?.state==='installed'?105:85}% FLOW. HOLD E AT THE ENGINEERING PUMP TO CLEAR IT. OPTIONAL.`); break;
    case 'pumpService': sfx.done(); G.hud.toast(`FILTER CLEARED / PUMP OUTPUT ${G.state?.salvage?.state==='installed'?130:110}%`); break;
    case 'listening': sfx.listening({x:Math.cos(e.angle)*18,z:Math.sin(e.angle)*18}); break;
    case 'item': {
      if (G.viewPod) break;
      sfx.equipment(e.item, { x: e.x, z: e.z });
      const notice = {repair:'REPAIR KIT APPLIED / KEEP HOLDING E',flare:'FLARE LIT / LIGHT ALSO MAKES NOISE',decoy:'LURE ACTIVE / MOVE AWAY QUIETLY',
        welder:'WELDER ACTIVE / KEEP HOLDING E / LOUD',scanner:'CREW SCAN / LAST-KNOWN CONTACT SHARED / PULSE MAKES NOISE',
        oxygen:'EMERGENCY AIR RELEASED',return:'AIRLOCK BEARING SHARED / AVOID OBSTACLES / NOT A SAFE PATH'};
      if (e.by === G.playerId || e.item === 'scanner' || e.item === 'return') G.hud.toast(notice[e.item]);
      break;
    }
    case "podClamped": sfx.door(); G.hud.toast("CLAMPS ENGAGED / SHUTTER CLOSING ASTERN"); break;
    case "podSecured": sfx.done(); G.hud.toast("RECOVERY CRADLE LOCKED / SHUTTER SEALED"); break;
    case "task": sfx.done(); G.hud.toast(`${e.label.toUpperCase()} REPAIRED BY ${e.by.toUpperCase()}`); break;
    case "patched": case "refill": sfx.done(); break;
    case "breach": sfx.breach({ x: ROOMS[e.room].sx * 6, z: ROOMS[e.room].sz * 6 }); G.hud.toast(`HULL BREACH IN THE ${ROOMS[e.room].label.toUpperCase()}`); break;
    case "lev":
      if (e.state === "investigate") sfx.creature({ x: Math.cos(G.state.lev.angle) * G.state.lev.dist, z: Math.sin(G.state.lev.angle) * G.state.lev.dist });
      else if (e.state === "approach") sfx.hullGroan({ x: Math.cos(G.state.lev.angle) * G.state.lev.dist, z: Math.sin(G.state.lev.angle) * G.state.lev.dist });
      else if (e.state === "attack") sfx.warning();
      break;
    case "impact": {
      if (G.viewPod) break; // A distant station hit must not flash or shake the pod.
      const near = me && !me.ext && roomAt(G.player.x, G.player.z) === e.room;
      G.flash = near ? 0.9 : 0.5; G.shake = near ? 1 : 0.6;
      sfx.impact({ x: ROOMS[e.room].sx * 7, z: ROOMS[e.room].sz * 7 });
      break;
    }
    case "door": sfx.door(); break;
    case "lockdown": sfx.alarm(); G.hud.toast("LOCKDOWN! BLAST DOORS SEALED"); break;
    case "lockdownEnd": G.hud.toast(e.auto ? "LOCKDOWN AUTO-RELEASED" : "LOCKDOWN LIFTED"); break;
    case "decoy": G.hud.toast("DECOY LAUNCHED: the Leviathan is following it"); break;
    case "down": if (e.id !== G.playerId) sfx.down(); else { G.flash = 0.8; sfx.down(); } break;
    case "revive": G.hud.toast(`${e.name.toUpperCase()} WAS REVIVED`); break;
    case "lost": G.hud.toast(`${e.name.toUpperCase()} WAS LOST`); break;
    case "o2warn": sfx.lowAir(); G.hud.toast(`OXYGEN ${e.level}%`); break;
    case "escape": G.hud.toast("LAUNCH SEQUENCE STARTED!"); sfx.launch(); break;
    case "voteResult": G.hud.toast("THE VOTE IS IN"); break;
    case "boarding": G.hud.toast("BOARDING! GET TO THE ESCAPE POD"); break;
    case "boarded": if (e.id === G.playerId) { G.hud.toast("SEATED. The final approach starts after launch."); G.input.releaseMouse(); } break;
    case "finale": G.hud.toast("FINAL APPROACH · PILOT THROUGH THE WRECKAGE. THE RADIO LINK REMAINS OPEN."); break;
    case "pilotChanged": G.hud.toast(`${G.state.players.find(p => p.id === e.id)?.name || "A CREW MEMBER"} NOW HAS THE CONTROLS`); break;
    case "podCollision": sfx.collision(); G.hud.toast("WRECKAGE IMPACT · REPAIR AND KEEP MOVING"); break;
    case 'podCollapse': if(G.viewPod)sfx.collapse(['LEFT','CENTRE','RIGHT'][e.lane+1]);break;
    case "podStrike": sfx.impact(); G.hud.toast("POD HULL DAMAGE · REPAIR AND KEEP MOVING"); break;
    case "podRepair": case "capsuleRepair": sfx.done(); break;
    case "pursuit": sfx.creature(); G.hud.toast(`CONTACT TURNING TOWARD THE ${e.target.toUpperCase()}`); break;
    case "capsuleEscape": case "podOutcome": G.hud.toast("ROUTE RESOLVED · REMAINING CREW ARE STILL PLAYING"); break;
    default: break;
  }
}

export function handleChat(msg) { G?.chatView.add(msg); }

export function handleOver(outcome) {
  if (!G || G.over) return;
  closeLocker();
  G.over = true;
  setAudioEnvironment({active:false});
  G.podView?.silence();
  G.subHud?.dispose();G.paused = false; document.getElementById("pause").classList.add("hidden"); document.getElementById("options").classList.add("hidden");
  G.holdWanted = false;
  G.typing = false; G.chatInput.value = ""; G.chatInput.blur(); G.chatInput.classList.add("hidden");
  clearTimeout(G.voteTimer);
  G.input.setEnabled(false);
  G.input.releaseMouse();
  G.hud.hideBriefing();
  G.hud.setConsoleOpen(false); G.consoleOpen = false;
  closeRepair(); G.hud.toggleWrist(false);
  document.getElementById("pod-hud").classList.add("hidden"); document.getElementById("finale-status").classList.add("hidden");
  G.epilogue = createEpilogue(outcome, G.playerId, () => {
    if (!G) return;
    G.epilogue?.dispose(); G.epilogue = null;
    G.hud.showGameOver(outcome); net.epilogueDone();
  });
  G.hud.setInteraction(null, null);
  (/escape/.test(outcome.crew.find(p=>p.id===G.playerId)?.ending || "") ? sfx.win : sfx.lose)();
}

// The server rejected a move (or moved us, e.g. through the airlock): snap to its position.
export function handleCorrect({ x, z, teleport, rotation }) {
  if (!G || !Number.isFinite(x) || !Number.isFinite(z)) return;
  G.player.x = x; G.player.z = z;
  if (Number.isFinite(rotation)) G.input.yaw = rotation;
  if (teleport) { sfx.holdStart(); G.flash = 0.25; }
}

export function handleServerMessage(message) {
  if (!G) return;
  G.hud.toast(message);
  sfx.error();
  if (G.holdWanted) G.holdBlocked = true; // don't spam the server until E is pressed again
}

export function setConnectionLost(lost) {
  if (!G) return;
  if(!lost){const overlay=document.getElementById('lost');overlay.querySelector('h2').textContent='RECONNECTING...';overlay.querySelector('.overlay-card > p:not(.eyebrow)').textContent='The link to the station was lost. Your character is safe for a short time while we try to reconnect.';}
  G.connectionLost = lost;
  G.hud.showLost(lost);
  if (lost) { G.holdWanted = false; G.input.setEnabled(false); } else refreshInput();
}

export function replaceMatch(match) { // after a reconnect: resync with the server
  if (!G) return;
  G.player.x = match.self.x; G.player.z = match.self.z;
  G.phase = match.phase;
  G.flashOn=match.state.players.find(p=>p.id===G.playerId)?.flashlight??true;
  G.briefingEndsAt = performance.now() + (match.briefingEndsIn ?? 0);
  if (Number.isFinite(match.self.rotation)) G.input.yaw = match.self.rotation;
  handleState(match.state);
  setConnectionLost(false);
}

void DEPTS;
