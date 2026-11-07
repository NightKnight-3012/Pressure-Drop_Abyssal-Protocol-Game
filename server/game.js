import {FLOODING,breachSeverity,pumpCapacity,drainShared} from './flooding.js';
// Pure game-rule logic (no sockets in here). The server owns all of this state:
// clients can only *ask* for things and the server decides what actually happens.
//
// All timers use `game.time` (seconds of simulated match time) so tests can run fast.
import {
  MAX_HP, STAMINA, FLOOD_MAX, DROWN_DEPTH, ROOM_IDS, ROOMS, DEPT_IDS, STATIONS, STATION_IDS, JUNCTION_IDS, DOOR_STATION,
  REPAIR_RANGE, BREACH_RANGE, TREAT_RANGE, CONSOLE_RANGE, AIRLOCK_ARRIVE_EXT, AIRLOCK_ARRIVE_INT,
  roomAt, collides, doorwayBlocked, nearestFree, spawnPoint, scalingFor, seatsFor, LOCKERS, LOCKER_RANGE
} from "../shared/layout.js";
import { createLeviathan, stepLeviathan, levPosition } from "./leviathan.js";
import { MISSIONS, FINALE_POINTS, REPAIR_TYPES, repairSpec, atPoint } from "../shared/tactical.js";
import { beginFinale, finaleInteract, tickFinale, finaleSnapshot } from "./finale.js";
import { ITEMS, ITEM_LIMIT } from "../shared/items.js";
import { ITEM_TUNING, ITEM_ROLES, startingInventory, lockerStock } from "./items.js";
import { recordEvents } from "./timeline.js";
import { createResources, RESOURCE_RANGE } from '../shared/exterior-resources.js';
import { SALVAGE } from '../shared/salvage.js';
import {LOGS,LOG_RANGE,storySelection,storyEnding} from '../shared/story.js';
import {WORKBENCH,RECIPES,CIRCUITS,DIFFICULTIES} from '../shared/fieldwork.js';
import {createThreats,tickThreats,THREAT_TUNING} from './threats.js';
import {createSub,tickSub,boardSub,canDockSub,dockSub,subAction} from './submersible.js';
import {SUB_TUNING} from '../shared/submersible.js';
import {maximumDive,suitDrain,DIVE_SPEED} from '../shared/ocean-floor.js';
import {PRACTICE_STEPS} from '../shared/practice.js';
export {controlSub as subControl,subAction} from './submersible.js';

export const TUNING = {
  flooding:FLOODING,
  items: ITEM_TUNING,
  resources: { hold:2, noise:.9 },
  salvage: { recover:3, install:4, noise:1.2, bonus:SALVAGE.bonus },
  threats:THREAT_TUNING,
  submersible:SUB_TUNING,
  fieldwork:{clampSeconds:20,stunSeconds:10,empSeconds:8,traumaSeconds:20,craftCooldown:2},
  complication: { startMin: 55, startSpread: 35, hold: 6, cloggedPump: .85, servicedPump: 1.1 },
  // flooding
  breachRate: 0.035,        // metres of water per second, per breach
  pumpRate: 0.04,           // shared station capacity, scaled by the crew breach tier
  equalizeK: 0.18,          // water spreads between rooms whose doors are open
  firstBreachAt: 10,
  // body
  drownDps: 8, noO2Dps: 3, suitSeconds: 90, suitEmptyDps: 6,
  downTimeout: 60, reviveHp: 40, healAmount: 40,
  // tasks
  specialistFactor: 0.55,   // a department's own tasks take 55% of the time
  breachHold: 5,
  treatHold: { medical: 3, other: 6 },
  o2Refill: { medical: 35, other: 22 }, o2Cooldown: 15,
  doorCooldown: 1.2,
  // noise (see leviathan.js for how it becomes threat)
  noise: { run: 1.6, machinery: 1.2, diver: 0.25, quiet: 0.6 },
  strike: { flood: 0.4, damage: 24, grabRange: 10, grabDps: 30, extRange: 12, extDamage: 40 },
  decoy: { duration: 18, cooldown: 70 },
  lockdown: { syncSeconds: 8, soloSeconds: 20, decay: 0.12, repeatGap: 100, autoReleaseAfter: 15 },
  // escape
  voteSeconds: 20, boardSeconds: 35, boardMin: 3, boardLeakFactor: 1.6, boardNoiseFactor: 1.4,
  runningFreshMs: 500
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;

export const isAlive = (p) => !p.lost;
export const isActive = (p) => !p.lost && p.connected && !p.downed && !p.aboard && !p.escaped;
const hasDept = (players, dept) => players.some((p) => !p.lost && !p.aboard && !p.escaped && p.dept === dept);
export const isRunning = (p, nowMs) => p.running && nowMs - p.lastPacket < TUNING.runningFreshMs;

// ------------------------------------------------------------------ departments
// Fill in missing choices and make sure all four departments are covered when the crew is big enough.
// Returns a list of { id, from, to } changes that were made.
export function assignDepartments(players) {
  const changes = [];
  const count = () => Object.fromEntries(DEPT_IDS.map((d) => [d, players.filter((p) => p.dept === d).length]));
  const leastCovered = () => {
    const c = count();
    return DEPT_IDS.slice().sort((a, b) => c[a] - c[b] || DEPT_IDS.indexOf(a) - DEPT_IDS.indexOf(b))[0];
  };
  for (const p of players.filter((q) => !q.dept)) {
    p.dept = leastCovered();
    changes.push({ id: p.id, from: null, to: p.dept });
  }
  if (players.length >= DEPT_IDS.length) {
    for (const dept of DEPT_IDS) {
      if (players.some((p) => p.dept === dept)) continue;
      const c = count();
      const donors = players.filter((p) => c[p.dept] >= 2);
      if (!donors.length) break;
      const donor = donors.sort((a, b) => b.joinedAt - a.joinedAt)[0]; // the most recent joiner moves
      changes.push({ id: donor.id, from: donor.dept, to: dept });
      donor.dept = dept;
    }
  }
  return changes;
}

// ------------------------------------------------------------------ setup
export function resetPlayerForMatch(p, slot) {
  const s = spawnPoint(slot);
  Object.assign(p, {
    slot, x: s.x, z: s.z, rotation: Math.atan2(s.x, s.z), running: false, exterior: false,
    breath:FLOODING.breathSeconds, submerged:false, hp: MAX_HP, downed: false, downedAt: 0, lost: false, leftBehind: false, aboard: false,
    tasksDone: 0, contribution: 0, credits: {}, escaped: false, ending: null, volunteered: false,
    podRepairAt: 0, suit: TUNING.suitSeconds, stamina: STAMINA.max, winded: false,
    inventory: startingInventory(p.dept), itemReadyAt: 0, lockerReadyAt:0,craftReadyAt:0,flashlight:true,subSeat:null,depth:0,vertical:0,verticalUntil:0,
    stats:{downs:0,revives:0},lostAt:null,escapedAt:null
  });
}

export function createGame({ players, now = Date.now(), seed = (Math.random() * 2 ** 32) >>> 0, mission = "blackout",difficulty='normal',practice=false }) {
  const n = players.length;
  const rng = mulberry32(seed);
  const scale = scalingFor(n);
  const game = {
    seed, rng, mission: Object.hasOwn(MISSIONS, mission) ? mission : "blackout", status: "playing", outcome: null,
    time: 0, lastTick: now, startCount: n, seats: seatsFor(n), scale,
    activeJunctions: JUNCTION_IDS.slice(0, scale.junctions),
    tasks: {},
    rooms: Object.fromEntries(ROOM_IDS.map((r) => [r, { flood: 0, closed: false, locked: false, impacts:0 }])),
    oxygen: 100, o2ReadyAt: 0, o2Warn: { 25: false, 10: false },
    breaches: [], breachSeq: 0, nextBreachAt: TUNING.firstBreachAt,
    holds: new Map(), effects: [], effectSeq: 0, lureReadyAt: 0, timeline: [],
    scan: null, scanReadyAt: 0, scanPulse: null, returnMarker: null,
    lockers: lockerStock(scale),
    resources: createResources(scale,mulberry32(seed ^ 0x53414c56)),
    salvage: { state:'available', carrier:null },
    story: { available:storySelection(mulberry32(seed^0x4c4f4753)), found:[] },
    difficulty:Object.hasOwn(DIFFICULTIES,difficulty)?difficulty:'normal',
    threats:createThreats(scale,mulberry32(seed^0x54485254)),
    roomCircuits:Object.fromEntries(ROOM_IDS.map(r=>[r,true])),empRooms:{},empUntil:0,circuitReadyAt:0,
    sub:createSub(),
    practice:practice===true&&n===1?{step:'move',start:{...spawnPoint(0)},usedTool:false,wentOutside:false}:null,
    scrap:createResources(scale,mulberry32(seed^0x53435250)).map((r,i)=>({id:`scrap:${i}`,x:r.x,z:r.z+2,item:'scrap'})),
    complication: { state: 'waiting', at: TUNING.complication.startMin + mulberry32(seed ^ 0x7275)() * TUNING.complication.startSpread },
    lev: createLeviathan(rng), decoy: { until: 0, readyAt: 0, angle: 0 },
    lockdown: { active: false, rooms: [], progress: 0, count: 0, nextAt: scale.lockdownAt, emptySince: null },
    doorReadyAt: {},
    stage: "main", vote: null, boarding: null, finale: null, capsuleDiscovered: false,
    calibrations: Object.fromEntries(Object.keys(REPAIR_TYPES).map(id => [id, repairSpec(id, seed)]))
  };
  for (const id of STATION_IDS) if (STATIONS[id].kind === "task") game.tasks[id] = { done: false, by: null };
  players.forEach((p, i) => resetPlayerForMatch(p, i));
  game.oxygen = MISSIONS[game.mission].oxygen;
  if(game.practice){game.nextBreachAt=game.lockdown.nextAt=game.complication.at=1e9;game.threats.skitterAt=game.threats.electricAt=game.threats.wardenAt=1e9;for(const mine of game.threats.mines)mine.active=false;game.story.available=[];}
  return game;
}

// One synchronous checkout: every rejection preserves both inventory and shared stock.
export function takeLockerItem(game, players, p, lockerId, item) {
  if (game.status !== 'playing' || game.stage !== 'main' || !isActive(p) || p.exterior) return 'Stores are available to active crew inside before launch.';
  if (typeof lockerId !== 'string' || lockerId.length>24 || !Object.hasOwn(LOCKERS,lockerId) || typeof item !== 'string' || item.length>24) return 'Invalid locker request.';
  const point=LOCKERS[lockerId], stock=game.lockers[lockerId];
  if (roomAt(p.x,p.z)!==point.room || dist(p,point)>LOCKER_RANGE || p.z<point.z) return 'Stand at the front of the supply locker.';
  if (!Object.hasOwn(stock,item)) return 'That item is not stocked here.';
  if (game.time < p.lockerReadyAt) return 'Wait for the locker dispenser.';
  if (stock[item]<=0) return 'That shared supply is exhausted.';
  const slot=Array.from({length:ITEM_LIMIT},(_,i)=>i).find(i=>p.inventory[i]===null);
  if (slot===undefined) return 'Inventory full. Spend a tool before taking another.';
  stock[item]--; p.inventory[slot]=item; p.lockerReadyAt=game.time+TUNING.items.lockerCooldown;
  (game.pendingEvents??=[]).push({type:'lockerTake',by:p.id,locker:lockerId,item,slot,x:point.x,z:point.z});
  return null;
}

// Accept a slot only: position, duration, inventory and repair results are server-owned.
export function craftItem(game,players,p,recipeId){
  if(game.status!=='playing'||game.stage!=='main'||!isActive(p)||p.exterior||!powerOn(game))return 'Fabrication needs an active crew member inside with station power before launch.';
  if(typeof recipeId!=='string'||!Object.hasOwn(RECIPES,recipeId))return 'Unknown fabrication recipe.';
  if(dist(p,WORKBENCH)>LOCKER_RANGE||p.z<WORKBENCH.z||roomAt(p.x,p.z)!==WORKBENCH.room)return 'Stand at the front of Engineering stores to fabricate tools.';
  const recipe=RECIPES[recipeId];if(recipe.role&&recipe.role!==p.dept)return 'That signature tool is assigned to another department.';
  if(game.time<p.craftReadyAt)return 'The fabrication bench is cycling.';
  const slots=p.inventory.flatMap((item,i)=>item==='scrap'?[i]:[]);if(slots.length<recipe.cost)return `This recipe needs ${recipe.cost} salvaged alloy slot(s).`;
  for(const slot of slots.slice(0,recipe.cost))p.inventory[slot]=null;
  p.inventory[slots[0]]=recipe.item;p.craftReadyAt=game.time+TUNING.fieldwork.craftCooldown;
  (game.pendingEvents??=[]).push({type:'crafted',by:p.id,item:recipe.item,cost:recipe.cost});return null;
}
export function remoteCircuit(game,players,p,room){
  if(game.status!=='playing'||game.stage!=='main'||!isActive(p)||p.exterior||!powerOn(game)||!game.tasks.console.done||!Object.hasOwn(CIRCUITS,room))return 'Local circuits are unavailable.';
  if((p.dept!=='command'&&hasDept(players,'command'))||dist(p,STATIONS.console)>CONSOLE_RANGE)return 'Use the Command console to isolate a local circuit.';
  if(game.time<game.circuitReadyAt)return 'Wait for the circuit switch to reset.';
  game.roomCircuits[room]=!game.roomCircuits[room];game.circuitReadyAt=game.time+2;
  (game.pendingEvents??=[]).push({type:'circuit',room,on:game.roomCircuits[room],by:p.id});return null;
}
export function useItem(game, players, p, slot) {
  if (game.status !== 'playing' || !isActive(p) || game.stage === 'finale') return 'Equipment is unavailable right now.';
  if (!Number.isInteger(slot) || slot < 0 || slot >= ITEM_LIMIT) return 'Invalid equipment slot.';
  if(p.subSeat)return 'Use the survey-sub equipment or exit before using carried tools.';
  const item = p.inventory?.[slot];
  if (!item || !Object.hasOwn(ITEMS, item)) return 'That equipment slot is empty.';
  if (item === 'regulator') return 'Carry the regulator inside and hold E at the repaired Engineering pump.';
  if (item === 'scrap') return 'Take salvaged alloy to the powered Engineering fabrication bench.';
  if (ITEM_ROLES[item] && ITEM_ROLES[item] !== p.dept) return 'That equipment requires its assigned department.';
  if (game.time < p.itemReadyAt) return 'Equipment is cooling down.';
  const T = ITEM_TUNING;
  if(item==='prod'||item==='emp') {
    const radius=item==='emp'?7:4;
    for(const skitter of game.threats.skitters)if(!p.exterior&&dist(p,skitter)<=radius)skitter.stunned=game.time+TUNING.fieldwork.stunSeconds;
    if(item==='emp'){game.empUntil=game.time+TUNING.fieldwork.empSeconds;if(!p.exterior)game.empRooms[roomAt(p.x,p.z)]=game.empUntil;for(const mine of game.threats.mines)if(p.exterior&&dist(p,mine)<=radius)mine.active=false;}
  } else if(item==='clamp') {
    const h=game.holds.get(p.id),b=game.breaches.find(b=>b.id===h?.id);
    if(p.exterior||h?.mode!=='breach'||!b||dist(p,b)>BREACH_RANGE||b.clampedUntil>game.time)return 'Hold E at an unclamped breach before fitting a pipe clamp.';
    b.clampedUntil=game.time+TUNING.fieldwork.clampSeconds;
  } else if(item==='trauma') {
    const h=game.holds.get(p.id),target=players.find(q=>`treat:${q.id}`===h?.id);
    if(p.exterior||h?.mode!=='revive'||!target?.downed||target.lost||dist(p,target)>TREAT_RANGE)return 'Hold E beside a downed crewmate before applying the trauma kit.';
    if(target.downedAt>=game.time-.25)return 'The rescue window is already full.';
    target.downedAt=Math.min(game.time,target.downedAt+TUNING.fieldwork.traumaSeconds);
  } else if (item === 'repair' || item === 'welder') {
    const h = game.holds.get(p.id), b = game.breaches.find(b => b.id === h?.id);
    if (!h || h.mode !== 'breach' || !b || p.exterior || dist(p, b) > BREACH_RANGE) return 'Hold E at a breach before using this repair tool.';
    if (h.gearApplied) return 'This patch already has a repair aid. Save the other tool.';
    const elapsed = game.time - h.since;
    const remaining = h.need - elapsed;
    if (remaining <= T.minRepairRemaining) return 'The patch is nearly finished. Save the repair tool.';
    h.need = elapsed + Math.max(T.minRepairRemaining, remaining * (item === 'welder' ? T.welderFactor : T.repairFactor));
    h.gearApplied = item;
  } else if (item === 'scanner') {
    if (game.time < game.scanReadyAt) return 'The crew scanner channel is recovering.';
    const pos = levPosition(game.lev);
    game.scan = { x:pos.x, z:pos.z, at:game.time, until:game.time+T.scanSeconds };
    game.scanPulse = { x:p.x, z:p.z, until:game.time+T.scanPulseSeconds };
    game.scanReadyAt = game.time+T.scanCooldown;
  } else if (item === 'oxygen') {
    if (p.exterior) {
      if (p.suit >= TUNING.suitSeconds) return 'Your suit air is already full.';
      p.suit = Math.min(TUNING.suitSeconds, p.suit+T.suitAir);
    } else {
      if (game.oxygen >= 100) return 'Station air is already full. Save the canister.';
      game.oxygen = Math.min(100, game.oxygen+T.stationAir);
    }
  } else if (item === 'return') {
    if (!p.exterior) return 'Activate the home marker outside the airlock.';
    if (game.returnMarker && game.time < game.returnMarker.until) return 'The crew home marker is already broadcasting.';
    game.returnMarker = { ...AIRLOCK_ARRIVE_EXT, until:game.time+T.markerSeconds };
  } else {
    if (game.effects.length >= T.maxEffects) return 'Too many active devices. Wait for one to expire.';
    if (item === 'decoy' && game.time < game.lureReadyAt) return 'The shared acoustic channel is recovering.';
    // Place at the authoritative player position. This prevents throws through sealed walls.
    game.effects.push({ id: ++game.effectSeq, item, by: p.id, x: p.x, z: p.z, exterior: p.exterior,
      until: game.time + (item === 'flare' ? T.flareSeconds : T.lureSeconds) });
    if (item === 'decoy') game.lureReadyAt = game.time + T.lureCooldown;
  }
  p.inventory[slot] = null;
  if(game.practice&&(item==='flare'||item==='decoy'))game.practice.usedTool=true;
  p.itemReadyAt = game.time + T.cooldown;
  (game.pendingEvents ??= []).push({ type: 'item', item, by: p.id, x: p.x, z: p.z });
  return null;
}

function credit(p, key, amount = 1) {
  if (!p) return;
  p.credits ??= {};
  if (p.credits[key]) return;
  p.credits[key] = true; p.contribution = (p.contribution || 0) + amount;
}

export function repairInput(game, p, id, value) {
  if (typeof id !== "string" || !Object.hasOwn(REPAIR_TYPES, id)) return "No such calibration panel.";
  const spec = game.calibrations?.[id], station = STATIONS[id];
  if (game.status !== "playing" || !isActive(p) || !spec || !station || stationState(game, station) !== "ready" || dist(p, station) > REPAIR_RANGE) return "Stand at an available repair panel.";
  if (!Number.isInteger(value) || value < 1 || value > (spec.type === "circuit" ? 3 : 4)) return "Invalid calibration input.";
  spec.value = spec.type === "circuit" ? spec.value ^ (1 << (value - 1)) : value;
  spec.solved = spec.value === spec.target;
  return null;
}

// ------------------------------------------------------------------ station helpers
const stationActive = (game, st) => !st.junction || game.activeJunctions.includes(st.id);
export const powerOn = (game) => game.tasks.power.done;
const doneCount = (game) => Object.values(game.tasks).filter((t) => t.done).length;

function requirementMet(game, id) {
  if (id === "junctions") return game.activeJunctions.every((j) => game.tasks[j].done);
  return !!game.tasks[id]?.done;
}
const stationLocked = (game, st) => (st.requires || []).some((r) => !requirementMet(game, r));

// State of a static station: hidden | done | locked | cooldown | lockdown | ready
export function stationState(game, st) {
  if (!stationActive(game, st)) return "hidden";
  if (st.kind === "task" && game.tasks[st.id].done) return "done";
  if (st.kind === "door") {
    if (game.rooms[st.door].locked) return "lockdown";
    return powerOn(game) ? "ready" : "locked";
  }
  if (stationLocked(game, st)) return "locked";
  if (st.kind === "refill" && game.time < game.o2ReadyAt) return "cooldown";
  return "ready";
}

export function hubLevel(game) {
  const open = ROOM_IDS.filter((r) => !game.rooms[r].closed);
  return open.length ? open.reduce((s, r) => s + game.rooms[r].flood, 0) / open.length : 0;
}
export function depthAt(game, p) {
  const room = roomAt(p.x, p.z);
  if (room === "exterior") return 0;
  return room === "hub" ? hubLevel(game) : game.rooms[room].flood;
}
export const closedRooms = (game) => ROOM_IDS.filter((r) => game.rooms[r].closed);

// ------------------------------------------------------------------ holds (hold E)
function salvageValid(game,p,mode) {
  if(game.stage!=='main')return false;
  if(mode==='salvageRecover')return game.salvage.state==='available'&&p.exterior&&dist(p,SALVAGE)<=RESOURCE_RANGE&&p.inventory.includes(null);
  return game.salvage.state==='carried'&&game.salvage.carrier===p.id&&p.inventory.includes('regulator')&&!p.exterior&&powerOn(game)&&game.tasks.pump.done&&dist(p,STATIONS.pump)<=REPAIR_RANGE;
}
function subRepairValid(game,p){return game.stage==='main'&&p.exterior&&!p.subSeat&&p.depth<=1.25&&game.sub.hull>0&&game.sub.hull<SUB_TUNING.hull&&Math.abs(game.sub.speed)<.6&&dist(p,game.sub)<SUB_TUNING.boardRange&&p.inventory.some(i=>i==='scrap'||i==='repair');}
export function diverControl(game,p,vertical){
  if(game.status!=='playing'||!isActive(p)||!p.exterior||p.subSeat||!Number.isInteger(vertical)||vertical< -1||vertical>1)return 'Invalid diver depth control.';
  p.vertical=vertical;p.verticalUntil=game.time+.35;return null;
}
function holdNeed(player, st) {
  const f = st.dept && player.dept === st.dept ? TUNING.specialistFactor : 1;
  return st.hold * f;
}

// Returns an error message for the player, or null if the hold started.
export function startHold(game, players, player, id) {
  if (game.status !== "playing") return "The match is over.";
  if (!isActive(player)) return "You can't do that right now.";
  if (typeof id !== "string" || id.length > 40) return "Invalid target.";
  if(id==='sub:board'){const err=boardSub(game,player);if(!err)game.holds.delete(player.id);return err;}
  if(id==='sub:dock'){
    if(!canDockSub(game,player))return 'Pilot to the marked Medical dock, stop the thrusters and hold E to seal the transfer hatch.';
    game.holds.set(player.id,{id,mode:'subDock',since:game.time,need:SUB_TUNING.hold});return null;
  }
  if(player.subSeat)return 'Exit or dock the survey sub before using station equipment.';
  if(player.exterior&&player.depth>1.25)return 'Ascend to the marked survey level before working on equipment or entering the airlock.';
  if(id==='sub:repair'){
    if(!subRepairValid(game,player))return 'Approach a stationary damaged sub with one repair kit or alloy slot.';
    if([...game.holds.values()].some(h=>h.id===id))return 'Someone is already repairing the survey sub.';
    game.holds.set(player.id,{id,mode:'subRepair',since:game.time,need:SUB_TUNING.repairHold});return null;
  }
  if(id.startsWith('log:')) {
    const log=LOGS.find(l=>l.id===id.slice(4));
    if(game.stage!=='main'||!log||!game.story.available.includes(log.id)||game.story.found.includes(log.id)||player.exterior!==log.ext||dist(player,log)>LOG_RANGE)return 'Move to an unread evidence terminal before launch.';
    if([...game.holds].some(([pid,h])=>pid!==player.id&&h.id===id))return 'Another crew member is reading that terminal.';
    game.holds.set(player.id,{id,mode:'log',since:game.time,need:1});return null;
  }
  if(id.startsWith('scrap:')){
    const resource=game.scrap.find(r=>r.id===id);
    if(game.stage!=='main'||!player.exterior||!resource||dist(player,resource)>RESOURCE_RANGE||!player.inventory.includes(null))return 'Swim to an alloy cache with an empty inventory slot before launch.';
    if([...game.holds].some(([pid,h])=>h.id===id&&pid!==player.id))return 'Another diver is opening this alloy cache.';
    game.holds.set(player.id,{id,mode:'scrap',since:game.time,need:TUNING.resources.hold});return null;
  }
  if(id.startsWith('circuit:')){
    const point=CIRCUITS[id.slice(8)];
    if(game.stage!=='main'||!point||player.exterior||dist(player,point)>REPAIR_RANGE||game.time<game.circuitReadyAt)return 'Stand at a local circuit switch and wait for it to reset.';
    game.holds.set(player.id,{id,mode:'circuit',since:game.time,need:1.5});return null;
  }
  if(id===SALVAGE.recover || id===SALVAGE.install) {
    const mode=id===SALVAGE.recover?'salvageRecover':'salvageInstall';
    if(!salvageValid(game,player,mode))return 'Salvage needs an empty slot at the wreck, or its carrier at the powered, repaired Engineering pump before launch.';
    if([...game.holds].some(([pid,h])=>h.id===id&&pid!==player.id))return 'Another crew member is working on the regulator.';
    game.holds.set(player.id,{id,mode,since:game.time,need:TUNING.salvage[mode==='salvageRecover'?'recover':'install']});return null;
  }
  if(id.startsWith('resource:')) {
    const resource=game.resources.find(r=>r.id===id);
    if(game.stage!=='main'||!player.exterior||!resource||dist(player,resource)>RESOURCE_RANGE)return 'Swim to an available supply canister before launch.';
    if(!player.inventory.some(item=>item===null))return 'Inventory full. Use a tool to make room before recovering supplies.';
    if([...game.holds].some(([pid,h])=>h.id===id&&pid!==player.id))return 'Another diver is opening that supply canister.';
    game.holds.set(player.id,{id,mode:'resource',since:game.time,need:TUNING.resources.hold});return null;
  }
  if (id === 'service:pump') {
    if (game.stage !== 'main' || game.complication.state !== 'active' || player.exterior || dist(player, STATIONS.pump) > REPAIR_RANGE) return 'Stand at the obstructed flood pump.';
    if ([...game.holds.values()].some(h => h.id === id)) return 'Someone is already clearing the filter.';
    game.holds.set(player.id, { id, mode:'service', since:game.time, need:TUNING.complication.hold * (player.dept==='engineering' ? TUNING.specialistFactor : 1) });
    return null;
  }
  if (Object.hasOwn(FINALE_POINTS, id)) {
    if (player.exterior) return "Get back inside before operating station equipment.";
    const point = FINALE_POINTS[id];
    if (!atPoint(player, point)) return "Move closer to the panel.";
    if (id === "capsule" && game.stage !== "finale") {
      game.capsuleDiscovered = true; return "Survey: two damaged maintenance capsules. Reserve power, pressure seals and hatch repairs are required after launch.";
    }
    const events = [];
    const error = finaleInteract(game, players, player, id, events);
    (game.pendingEvents ??= []).push(...events);
    return error;
  }
  for (const [pid, h] of game.holds) if (h.id === id && pid !== player.id) return "Someone else is already doing that.";

  let hold;
  if (id.startsWith("breach:")) {
    const b = game.breaches.find((x) => x.id === id);
    if (!b) return "That breach is already sealed.";
    if (player.exterior) return "You can't reach that from outside.";
    if (dist(player, b) > BREACH_RANGE) return "Move closer to the breach.";
    hold = { id, need: TUNING.breachHold * (player.dept === "engineering" ? TUNING.specialistFactor : 1), mode: "breach" };
  } else if (id.startsWith("treat:")) {
    const t = players.find((x) => x.id === id.slice(6));
    if (!t || t === player || t.lost) return "Nobody to treat.";
    if (player.exterior || t.exterior) return "Not from out here.";
    if (dist(player, t) > TREAT_RANGE) return "Move closer.";
    if (t.downed) hold = { id, need: player.dept === "medical" ? TUNING.treatHold.medical : TUNING.treatHold.other, mode: "revive" };
    else if (t.hp < MAX_HP) {
      if (player.dept !== "medical") return "Only Medical can heal injuries. You can still revive downed crew.";
      hold = { id, need: TUNING.treatHold.medical, mode: "heal" };
    } else return "They are fine.";
  } else {
    const st = Object.hasOwn(STATIONS, id) ? STATIONS[id] : null;
    if (!st || !stationActive(game, st)) return "Invalid target.";
    if (!!st.exterior !== !!player.exterior) return player.exterior ? "Get back inside first." : "You can't reach that from inside.";
    if (dist(player, st) > REPAIR_RANGE) return "Move closer to the panel.";
    const state = stationState(game, st);
    if (state === "done") return "Already repaired.";
    if (state === "locked") {
      if (st.kind === "door") return "The station has no power.";
      const missing = (st.requires || []).find((r) => !requirementMet(game, r));
      return missing === "junctions" ? "The outside cable junctions must be repaired first."
        : `${st.label} needs the ${STATIONS[missing]?.label ?? missing} repaired first.`;
    }
    if (state === "cooldown") return "The oxygen reserve is recharging.";
    if (st.kind === "airlock" && !st.exterior && hasDept(players, "eva") && player.dept !== "eva") {
      return "Only EVA divers can use the airlock.";
    }
    if (st.id === "launch" && game.stage !== "main") return "Already launching.";
    if(st.id==='launch'&&players.some(p=>isActive(p)&&p.subSeat))return 'Recall and dock the occupied survey sub before starting evacuation.';
    if (st.kind === "door") {
      hold = state === "lockdown"
        ? { id, need: Infinity, mode: "override" }
        : { id, need: st.hold, mode: "door" };
    } else hold = { id, need: holdNeed(player, st), mode: st.kind };
  }
  hold.since = game.time;
  game.holds.set(player.id, hold);
  return null;
}

export function cancelHold(game, playerId) {
  game.holds.delete(playerId);
  if (game.finale?.station.repair?.by === playerId) game.finale.station.repair = null;
}

export function holdProgress(game, hold) {
  if (hold.mode === "override") return game.lockdown.progress;
  const progress = clamp((game.time - hold.since) / hold.need, 0, 1);
  return game.calibrations?.[hold.id] && !game.calibrations[hold.id].solved ? Math.min(progress, 0.88) : progress;
}

// ------------------------------------------------------------------ doors
// Returns an error string, or null. Used by the local panel (hold) and the Command console (instant).
export function toggleDoor(game, players, room, events) {
  const r = game.rooms[room];
  if (!r) return "No such door.";
  if (r.locked) return "That door is locked down.";
  if (!powerOn(game)) return "The station has no power.";
  if (!r.closed) {
    const blocker = players.find((p) => !p.lost && !p.exterior && doorwayBlocked(room, p.x, p.z));
    if (blocker) return `${blocker.name} is standing in the doorway.`;
  }
  r.closed = !r.closed;
  events.push({ type: "door", room, closed: r.closed });
  return null;
}

const mayUseConsole = (game, players, player) =>
  game.tasks.console.done && powerOn(game) && (player.dept === "command" || !hasDept(players, "command"));

function consoleChecks(game, players, player) {
  if (game.status !== "playing" || !isActive(player)) return "You can't do that right now.";
  if (player.exterior) return "You are outside the hull.";
  if (!game.tasks.console.done) return "The Command console is not repaired yet.";
  if (!powerOn(game)) return "The station has no power.";
  if (dist(player, STATIONS.console) > CONSOLE_RANGE) return "Stand at the Command console.";
  if (!mayUseConsole(game, players, player)) return "Only Command can use the console.";
  return null;
}

export function remoteDoor(game, players, player, room, events) {
  const err = consoleChecks(game, players, player);
  if (err) return err;
  if (typeof room !== "string" || !Object.hasOwn(ROOMS, room)) return "No such door.";
  if (game.time < (game.doorReadyAt[room] || 0)) return "The door is still moving.";
  const e = toggleDoor(game, players, room, events);
  if (!e) { game.doorReadyAt[room] = game.time + TUNING.doorCooldown; credit(player, `door:${room}`, 2); }
  return e;
}

export function launchDecoy(game, players, player, events) {
  const err = consoleChecks(game, players, player);
  if (err) return err;
  if (game.time < game.decoy.readyAt) return `Decoy recharging (${Math.ceil(game.decoy.readyAt - game.time)}s).`;
  game.decoy = {
    until: game.time + TUNING.decoy.duration,
    readyAt: game.time + TUNING.decoy.cooldown,
    angle: Math.atan2(Math.sin(game.lev.angle + Math.PI), Math.cos(game.lev.angle + Math.PI))
  };
  events.push({ type: "decoy" });
  credit(player, `decoy:${Math.floor(game.time / TUNING.decoy.cooldown)}`, 3);
  return null;
}

// ------------------------------------------------------------------ hold completion
function completeHold(game, players, player, hold, events) {
  const { id, mode } = hold;
  game.holds.delete(player.id);
  if(mode==='subDock'){dockSub(game,players,events);return;}
  if(mode==='subRepair'){const slot=player.inventory.findIndex(i=>i==='repair'||i==='scrap');if(slot>=0){player.inventory[slot]=null;game.sub.hull=Math.min(SUB_TUNING.hull,game.sub.hull+SUB_TUNING.repairAmount);events.push({type:'subRepaired',by:player.id});}return;}
  if(mode==='scrap'){const r=game.scrap.find(r=>r.id===id),slot=player.inventory.indexOf(null);if(r&&slot>=0){player.inventory[slot]='scrap';game.scrap=game.scrap.filter(r=>r.id!==id);events.push({type:'scrapRecovered',by:player.id,x:r.x,z:r.z,slot});}return;}
  if(mode==='circuit'){const room=id.slice(8);if(game.time>=game.circuitReadyAt){game.roomCircuits[room]=!game.roomCircuits[room];game.circuitReadyAt=game.time+2;events.push({type:'circuit',room,on:game.roomCircuits[room],by:player.id});}return;}
  if(mode==='log'){const logId=id.slice(4);if(!game.story.found.includes(logId)){game.story.found.push(logId);events.push({type:'storyLog',by:player.id,log:logId});}return;}
  if(mode==='salvageRecover') {
    const slot=player.inventory.indexOf(null);if(slot<0)return;
    player.inventory[slot]='regulator';game.salvage={state:'carried',carrier:player.id};
    events.push({type:'salvageRecovered',by:player.id,x:SALVAGE.x,z:SALVAGE.z,slot});return;
  }
  if(mode==='salvageInstall') {
    player.inventory[player.inventory.indexOf('regulator')]=null;game.salvage={state:'installed',carrier:null};
    events.push({type:'salvageInstalled',by:player.id});return;
  }
  if(mode==='resource') {
    const resource=game.resources.find(r=>r.id===id),slot=player.inventory.findIndex(item=>item===null);
    if(!resource||slot<0||slot>=ITEM_LIMIT)return;
    player.inventory[slot]=resource.item;game.resources=game.resources.filter(r=>r.id!==id);
    events.push({type:'resourceRecovered',by:player.id,...resource,slot});return;
  }
  if (mode === 'service') {
    game.complication.state = 'resolved'; player.tasksDone++; player.contribution += 2;
    events.push({ type:'pumpService', by:player.id }); return;
  }
  if (["breach", "revive", "heal", "task", "refill"].includes(mode)) player.contribution = (player.contribution || 0) + (mode === "revive" ? 3 : 2);
  if (mode === "breach") {
    game.breaches = game.breaches.filter((b) => b.id !== id);
    player.tasksDone++;
    events.push({ type: "patched", by: player.id });
  } else if (mode === "revive" || mode === "heal") {
    const t = players.find((x) => x.id === id.slice(6));
    if (!t) return;
    if (mode === "revive") { t.downed = false; t.hp = TUNING.reviveHp; player.stats.revives++;events.push({ type: "revive", id: t.id, by: player.id }); }
    else t.hp = Math.min(MAX_HP, t.hp + TUNING.healAmount);
    player.tasksDone++;
  } else {
    const st = STATIONS[id];
    if (st.kind === "task") {
      game.tasks[id].done = true; game.tasks[id].by = player.id;
      player.tasksDone++;
      events.push({ type: "task", id, label: st.label, by: player.id });
      if (id === "launch") startEscape(game, players, events);
    } else if (st.kind === "refill") {
      game.oxygen = Math.min(100, game.oxygen + (player.dept === "medical" ? TUNING.o2Refill.medical : TUNING.o2Refill.other));
      game.o2ReadyAt = game.time + TUNING.o2Cooldown;
      player.tasksDone++;
      events.push({ type: "refill", by: player.id });
    } else if (st.kind === "airlock") {
      if (!st.exterior) {
        player.exterior = true; Object.assign(player, AIRLOCK_ARRIVE_EXT);
      } else {
        player.exterior = false; player.suit = TUNING.suitSeconds;
        Object.assign(player, nearestFree(AIRLOCK_ARRIVE_INT.x, AIRLOCK_ARRIVE_INT.z, closedRooms(game)));
      }
      events.push({ type: "teleport", id: player.id, x: player.x, z: player.z });
    } else if (st.kind === "door") {
      const err = toggleDoor(game, players, st.door, events);
      if (err) events.push({ type: "notice", id: player.id, text: err });
    }
  }
}

// ------------------------------------------------------------------ breaches / flooding
function addBreach(game, room, events, force = false) {
  if (!force && game.breaches.length >= game.scale.maxBreaches) return null;
  const { sx, sz } = ROOMS[room];
  for (let i = 0; i < 40; i++) {
    const x = sx * (2.2 + game.rng() * 6.6), z = sz * (2.2 + game.rng() * 6.6);
    if (collides(x, z, 0.9) || roomAt(x, z) !== room) continue;
    if (game.breaches.some((b) => Math.hypot(b.x - x, b.z - z) < 2.5)) continue;
    const b = { id: `breach:${++game.breachSeq}`, room, x: round(x), z: round(z), since: game.time };
    game.breaches.push(b);
    events.push({ type: "breach", room, id: b.id });
    return b;
  }
  return null;
}

function stepFlood(game, dt) {
  const leakFactor = game.stage === "boarding" ? TUNING.boardLeakFactor : 1;
  for (const b of game.breaches) if(!(b.clampedUntil>game.time)) game.rooms[b.room].flood += TUNING.breachRate * breachSeverity(b,game.time) * leakFactor * MISSIONS[game.mission].leak * dt;
  const pumpFactor = (game.complication.state === 'active' ? TUNING.complication.cloggedPump : game.complication.state === 'resolved' ? TUNING.complication.servicedPump : 1) + (game.salvage.state==='installed'?TUNING.salvage.bonus:0);
  if (powerOn(game) && game.tasks.pump.done && (!game.finale || game.finale.station.power > 0)) drainShared(game.rooms,pumpCapacity(game.scale,TUNING.pumpRate)*pumpFactor,dt);
  const open = ROOM_IDS.filter((r) => !game.rooms[r].closed);
  if (open.length > 1) {
    const mean = open.reduce((s, r) => s + game.rooms[r].flood, 0) / open.length;
    const k = Math.min(1, TUNING.equalizeK * dt);
    for (const r of open) game.rooms[r].flood += (mean - game.rooms[r].flood) * k;
  }
  for (const r of ROOM_IDS) game.rooms[r].flood = clamp(game.rooms[r].flood, 0, FLOOD_MAX);
}

// ------------------------------------------------------------------ the tick
export function tickGame(game, players, nowMs = Date.now(), timeScale = 1) {
  const events = game.pendingEvents?.splice(0) ?? [];
  if (game.status !== "playing") return events;

  const dt = Math.min((nowMs - game.lastTick) / 1000, 0.25) * timeScale;
  game.lastTick = nowMs;
  game.time += dt;
  game.effects = game.effects.filter(e => e.until > game.time);
  const T = TUNING;
  const byId = new Map(players.map((p) => [p.id, p]));
  if(game.practice){game.oxygen=100;game.lev.threat=0;game.lev.state='patrol';for(const r of ROOM_IDS)game.rooms[r].flood=Math.min(.7,game.rooms[r].flood);for(const p of players)p.suit=Math.max(20,p.suit);if(game.finale){game.finale.pod.hull=Math.max(50,game.finale.pod.hull);game.finale.pod.oxygen=Math.max(60,game.finale.pod.oxygen);}}
  for(const p of players){if(!p.exterior||p.subSeat){p.depth=0;p.vertical=0;}else if(isActive(p)){const direction=game.time<p.verticalUntil?p.vertical:0;p.depth=clamp((p.depth||0)+direction*DIVE_SPEED*dt,0,maximumDive(p.x,p.z));}}
  const vehicle=tickSub(game,players,dt);events.push(...vehicle.events);for(const hit of vehicle.hits){const p=byId.get(hit.id);if(p&&isActive(p))damage(p,hit.amount,game,events);}

  if(game.salvage.state==='carried' && byId.get(game.salvage.carrier)?.lost) {
    const carrier=byId.get(game.salvage.carrier);carrier.inventory=carrier.inventory.map(item=>item==='regulator'?null:item);
    game.salvage={state:'available',carrier:null};events.push({type:'salvageReturned'});
  }

  // ---- 1. holds ---------------------------------------------------------------
  for (const [pid, hold] of [...game.holds]) {
    const p = byId.get(pid);
    let valid = !!p && isActive(p);
    if(valid&&p.exterior&&p.depth>1.25)valid=false;
    if (valid) {
      if(hold.mode==='subDock')valid=canDockSub(game,p);
      else if(hold.mode==='subRepair')valid=subRepairValid(game,p);
      else if(p.subSeat)valid=false;
      else if(hold.mode==='scrap'){const r=game.scrap.find(r=>r.id===hold.id);valid=game.stage==='main'&&p.exterior&&!!r&&dist(p,r)<=RESOURCE_RANGE&&p.inventory.includes(null);}
      else if(hold.mode==='circuit'){const point=CIRCUITS[hold.id.slice(8)];valid=game.stage==='main'&&!p.exterior&&!!point&&dist(p,point)<=REPAIR_RANGE&&game.time>=game.circuitReadyAt;}
      else if(hold.mode==='log'){const log=LOGS.find(l=>l.id===hold.id.slice(4));valid=game.stage==='main'&&!!log&&game.story.available.includes(log.id)&&!game.story.found.includes(log.id)&&p.exterior===log.ext&&dist(p,log)<=LOG_RANGE;}
      else if(hold.mode==='salvageRecover'||hold.mode==='salvageInstall') valid=salvageValid(game,p,hold.mode);
      else if(hold.mode==='resource') {const r=game.resources.find(r=>r.id===hold.id);valid=game.stage==='main'&&p.exterior&&!!r&&dist(p,r)<=RESOURCE_RANGE&&p.inventory.some(item=>item===null);}
      else if (hold.mode === 'service') valid = game.stage === 'main' && game.complication.state === 'active' && !p.exterior && dist(p, STATIONS.pump) <= REPAIR_RANGE;
      else if (hold.mode === "breach") { const b = game.breaches.find((x) => x.id === hold.id); valid = !!b && !p.exterior && dist(p, b) <= BREACH_RANGE; }
      else if (hold.mode === "revive" || hold.mode === "heal") {
        const t = byId.get(hold.id.slice(6));
        valid = !!t && !t.lost && dist(p, t) <= TREAT_RANGE && (hold.mode === "revive" ? t.downed : !t.downed && t.hp < MAX_HP);
      } else {
        const st = STATIONS[hold.id];
        const state = stationState(game, st);
        valid = dist(p, st) <= REPAIR_RANGE && !!st.exterior === !!p.exterior &&
          (hold.mode === "override" ? state === "lockdown" : state === "ready");
      }
    }
    if (!valid) { game.holds.delete(pid); continue; }
    if (hold.mode !== "override" && game.time - hold.since >= hold.need && (!game.calibrations?.[hold.id] || game.calibrations[hold.id].solved)) completeHold(game, players, p, hold, events);
  }

  // ---- 2. new hull breaches ------------------------------------------------------
  if (game.stage !== "done" && game.time >= game.nextBreachAt) {
    const counts = Object.fromEntries(ROOM_IDS.map((r) => [r, game.breaches.filter((b) => b.room === r).length]));
    const options = ROOM_IDS.filter((r) => counts[r] < 2);
    if (options.length) addBreach(game, options[Math.floor(game.rng() * options.length)], events);
    game.nextBreachAt = game.time + game.scale.breachInterval * (0.8 + 0.4 * game.rng());
  }

  // ---- 3. water + air ----------------------------------------------------------------
  if (game.stage === 'main' && game.complication.state === 'waiting' && game.time >= game.complication.at && game.tasks.pump.done) {
    game.complication.state = 'active'; events.push({ type:'pumpClog' });
  }
  stepFlood(game, dt);
  game.oxygen = Math.max(0, game.oxygen - game.scale.oxygenDrain * dt);
  for (const lvl of [25, 10]) {
    if (game.oxygen <= lvl && !game.o2Warn[lvl]) { game.o2Warn[lvl] = true; events.push({ type: "o2warn", level: lvl }); }
    if (game.oxygen > lvl + 5) game.o2Warn[lvl] = false;
  }

  // ---- 4. noise -> Leviathan --------------------------------------------------------
  const sources = [];
  for (const p of players) {
    if (!isActive(p)) continue;
    const sprinting = !p.exterior && isRunning(p, nowMs);
    // stamina: sprint for a few seconds, then catch your breath
    if (sprinting) {
      p.stamina = Math.max(0, p.stamina - STAMINA.drain * dt);
      if (p.stamina <= 0) p.winded = true;
    } else {
      p.stamina = Math.min(STAMINA.max, p.stamina + STAMINA.regen * dt);
      if (p.winded && p.stamina >= STAMINA.resumeAt) p.winded = false;
    }
    if (p.exterior) sources.push({ x: p.x, z: p.z, w: T.noise.diver });
    else if (sprinting) sources.push({ x: p.x, z: p.z, w: T.noise.run });
  }
  for (const [pid, hold] of game.holds) {
    if(hold.mode==='salvageRecover'||hold.mode==='salvageInstall'){const p=byId.get(pid);if(p)sources.push({x:p.x,z:p.z,w:T.salvage.noise});}
    if(hold.mode==='resource'||hold.mode==='scrap'){const p=byId.get(pid);if(p)sources.push({x:p.x,z:p.z,w:T.resources.noise});}
    if (hold.gearApplied === 'welder') {
      const p = byId.get(pid);
      if (p) sources.push({ x:p.x, z:p.z, w:T.items.welderNoise });
    }
    const st = hold.mode === 'service' ? STATIONS.pump : STATIONS[hold.id];
    if (st?.noisy) sources.push({ x: st.x, z: st.z, w: T.noise.machinery });
  }
  if (game.scanPulse && game.time < game.scanPulse.until) sources.push({ ...game.scanPulse, w:T.items.scanNoise });
  for (const e of game.effects) if (e.item === 'flare') sources.push({ x: e.x, z: e.z, w: ITEM_TUNING.flareNoise });
  if((game.sub.driver||game.sub.passenger)&&Math.abs(game.sub.speed)>.1)sources.push({x:game.sub.x,z:game.sub.z,w:1+Math.abs(game.sub.speed)*.35});
  let loud = 0, vx = 0, vz = 0;
  for (const s of sources) { loud += s.w; vx += s.x * s.w; vz += s.z * s.w; }
  const noiseAngle = loud > 0 && Math.hypot(vx, vz) > 0.5 * loud ? Math.atan2(vz, vx) : null;
  const quiet = game.tasks.console.done ? T.noise.quiet : 1;
  const decoyActive = game.time < game.decoy.until;
  const lure = game.effects.find(e => e.item === 'decoy');
  const levEvents = game.stage === "finale" ? [] : stepLeviathan(game.lev, {
    dt, time: game.time, noise: game.practice?0:loud * quiet, noiseAngle,
    decoyAngle: game.practice?null:decoyActive ? game.decoy.angle : lure ? Math.atan2(lure.z, lure.x) : null,
    gain: game.scale.noiseGain * (game.mission === "silence" ? 1.2 : 1) * (game.stage === "boarding" ? T.boardNoiseFactor : 1)
  });
  for (const e of levEvents) {
    if (e.type === "strike") {
      const room = e.room;
      game.rooms[room].flood = Math.min(FLOOD_MAX, game.rooms[room].flood + T.strike.flood);
      game.rooms[room].impacts = Math.min(20,(game.rooms[room].impacts||0)+1);
      addBreach(game, room, events, true);
      const pos = levPosition(game.lev);
      if((game.sub.driver||game.sub.passenger)&&dist(game.sub,pos)<T.strike.extRange)game.sub.hull=Math.max(0,game.sub.hull-T.strike.extDamage);
      for (const p of players) {
        if (!isActive(p)) continue;
        if (!p.exterior && roomAt(p.x, p.z) === room) damage(p, T.strike.damage, game, events);
        else if (p.exterior && !p.subSeat && Math.hypot(p.x - pos.x, p.z - pos.z) < T.strike.extRange) damage(p, T.strike.extDamage, game, events);
      }
      events.push({ type: "impact", room, angle: e.angle });
    } else events.push(e);
  }

  const hazards=tickThreats(game,players,dt);events.push(...hazards.events);
  let hullHit=0;for(const hit of hazards.hits){const p=byId.get(hit.id);if(p&&isActive(p)){if(p.subSeat)hullHit=Math.max(hullHit,hit.amount);else damage(p,hit.amount,game,events);}}game.sub.hull=Math.max(0,game.sub.hull-hullHit);
  // ---- 5. damage, downing, losing crew --------------------------------------------------
  const levPos = levPosition(game.lev);
  const levHunting = game.lev.state === "approach" || game.lev.state === "attack";
  for (const p of players) {
    if (p.lost) continue;
    if (!p.downed && p.connected && !p.aboard && !p.escaped) {
      let dps = 0;
      p.submerged=!p.exterior&&!p.aboard&&!p.subSeat&&depthAt(game,p)>DROWN_DEPTH;
      const previousBreath=p.breath??FLOODING.breathSeconds;
      p.breath=p.submerged?Math.max(0,previousBreath-dt):Math.min(FLOODING.breathSeconds,previousBreath+dt*FLOODING.breathRecovery);
      if(p.submerged&&p.breath<=0)dps+=T.drownDps;
      if (p.exterior) {
        if(!p.subSeat){p.suit=Math.max(0,p.suit-dt*suitDrain(p.x,p.z,p.depth));if(p.suit<=0)dps+=T.suitEmptyDps;}
        if (!p.subSeat&&levHunting && Math.hypot(p.x - levPos.x, p.z - levPos.z) < T.strike.grabRange) dps += T.strike.grabDps;
      } else {
        p.suit = T.suitSeconds;
        if (game.oxygen <= 0) dps += T.noO2Dps;
      }
      if (dps > 0) damage(p, dps * dt, game, events);
    }
    if (p.downed && game.time - p.downedAt >= T.downTimeout) {
      p.lost = true; game.holds.delete(p.id);
      p.lostAt??=game.time;
      events.push({ type: "lost", id: p.id, why: "died" });
    }
  }

  // ---- 6. lockdown -------------------------------------------------------------------------
  stepLockdown(game, players, dt, events);

  // ---- 7. the escape ---------------------------------------------------------------------------
  if (game.stage === "finale") {
    const resolved = tickFinale(game, players, dt, events);
    for(const p of players){if(p.lost)p.lostAt??=game.time;if(p.escaped)p.escapedAt??=game.time;}
    const chasingStation = game.finale.creature.target === "station" && game.finale.station.status === "running";
    game.lev.state = chasingStation ? "approach" : "retreat";
    game.lev.dist += ((chasingStation ? 14 : 40) - game.lev.dist) * Math.min(1, dt * 0.4);
    const survivor = players.find(p => !p.aboard && !p.escaped && !p.lost);
    if (survivor && chasingStation) game.lev.angle = Math.atan2(survivor.z, survivor.x);
    if (resolved) {
      for (const p of players.filter(p => p.leftBehind && !p.escaped)) p.ending = (game.finale.history.stationHelpBy[p.id] || 0) >= 6 ? "beacon_sacrifice" : p.volunteered ? "last_stand" : "abandoned";
      finish(game, players, players.some(p => p.escaped) ? "win" : "lose", "The last signals have reached their destination.", events);
      game.stage = "done";
    }
  } else if (game.stage === "vote") stepVote(game, players, events);
  else if (game.stage === "boarding") stepBoarding(game, players, events);

  // ---- 8. win / lose ----------------------------------------------------------------------------
  if (game.status === "playing" && game.stage !== "finale") {
    if (game.rooms.engineering.flood >= FLOOD_MAX) finish(game, players, "lose", "The reactor room flooded. The station is lost.", events);
    else if (game.rooms.control.flood >= FLOOD_MAX) finish(game, players, "lose", "The Control Room flooded. Command was lost.", events);
    else if (players.length && players.every((p) => p.lost)) finish(game, players, "lose", "No crew remain.", events);
  }
  if(game.practice)advancePractice(game,players,events);
  recordEvents(game, players, events);
  return events;
}

function advancePractice(game,players,events){
  const p=players[0],practice=game.practice;if(!p||!practice)return;
  if(p.exterior)practice.wentOutside=true;
  const previous=practice.step;
  if(previous==='move'&&dist(p,practice.start)>=2)practice.step='power';
  else if(previous==='power'&&game.tasks.power.done){practice.step='patch';game.breaches.push({id:'breach:practice',room:'engineering',x:6,z:-6});}
  else if(previous==='patch'&&!game.breaches.some(b=>b.id==='breach:practice'))practice.step='tool';
  else if(previous==='tool'&&practice.usedTool)practice.step='systems';
  else if(previous==='systems'&&['pump','console','lifesupport'].every(id=>game.tasks[id].done))practice.step='outside';
  else if(previous==='outside'&&game.activeJunctions.every(id=>game.tasks[id].done))practice.step='return';
  else if(previous==='return'&&practice.wentOutside&&!p.exterior&&!p.subSeat)practice.step='launch';
  else if(previous==='launch'&&game.stage!=='main')practice.step='pod';
  else if(previous==='pod'&&game.finale?.pod.status==='escaped')practice.step='complete';
  if(previous!==practice.step)events.push({type:'practiceStep',step:practice.step});
}

function damage(p, amount, game, events) {
  if(game.practice)return;
  if (p.lost || p.downed) return;
  p.hp = Math.max(0, p.hp - amount);
  if (p.hp <= 0) {
    p.stats.downs++;
    p.downed = true; p.downedAt = game.time; p.running = false;
    game.holds.delete(p.id);
    events.push({ type: "down", id: p.id });
  }
}

// ------------------------------------------------------------------ lockdown
function occupants(players, room) {
  return players.filter((p) => isActive(p) && !p.exterior && roomAt(p.x, p.z) === room).length;
}

function stepLockdown(game, players, dt, events) {
  const L = game.lockdown, T = TUNING.lockdown;
  if (!L.active) {
    const alive = players.filter(isActive).length;
    if (game.stage === "main" && L.count < game.scale.lockdowns && game.time >= L.nextAt && doneCount(game) >= 1 && alive >= 2) {
      // seal the two rooms that hold the most crew, so the crew really is split
      const order = ROOM_IDS.map((r) => ({ r, n: occupants(players, r), tie: game.rng() }))
        .sort((a, b) => b.n - a.n || a.tie - b.tie);
      L.active = true; L.rooms = [order[0].r, order[1].r]; L.progress = 0; L.emptySince = null;
      for (const r of L.rooms) {
        game.rooms[r].locked = true;
        if (!game.rooms[r].closed) { game.rooms[r].closed = true; events.push({ type: "door", room: r, closed: true }); }
      }
      for (const p of players) { // never leave anybody stuck inside a door slab
        if (p.lost || p.exterior) continue;
        if (collides(p.x, p.z, 0.4, closedRooms(game))) Object.assign(p, nearestFree(p.x, p.z, closedRooms(game)));
      }
      events.push({ type: "lockdown", rooms: L.rooms.slice() });
    }
    return;
  }
  const [a, b] = L.rooms;
  let heldA = false, heldB = false;
  for (const h of game.holds.values()) {
    if (h.mode !== "override") continue;
    if (h.id === DOOR_STATION[a]) heldA = true;
    if (h.id === DOOR_STATION[b]) heldB = true;
  }
  const oa = occupants(players, a), ob = occupants(players, b);
  let rate = 0;
  if (heldA && heldB) rate = 1 / T.syncSeconds;
  else if ((heldA && ob === 0) || (heldB && oa === 0)) rate = 1 / T.soloSeconds; // nobody on the other side: slower, but possible
  L.progress = clamp(L.progress + (rate > 0 ? rate : -T.decay) * dt, 0, 1);
  // if nobody is trapped in either room, release automatically so required systems are never lost for good
  if (oa + ob === 0) { if (L.emptySince == null) L.emptySince = game.time; } else L.emptySince = null;
  const autoRelease = L.emptySince != null && game.time - L.emptySince >= T.autoReleaseAfter;
  if (L.progress >= 1 || autoRelease) {
    for (const r of L.rooms) { game.rooms[r].locked = false; game.rooms[r].closed = false; }
    events.push({ type: "lockdownEnd", rooms: L.rooms.slice(), auto: autoRelease && L.progress < 1 });
    L.active = false; L.rooms = []; L.progress = 0; L.count++; L.nextAt = game.time + T.repeatGap; L.emptySince = null;
    for (const [pid, h] of [...game.holds]) if (h.mode === "override") { credit(players.find(p => p.id === pid), `lockdown:${L.count}`, 3); game.holds.delete(pid); }
  }
}

// ------------------------------------------------------------------ escape: vote -> boarding -> launch
function startEscape(game, players, events) {
  const alive = players.filter(isAlive);
  events.push({ type: "escape" });
  if (alive.length > game.seats) {
    game.stage = "vote";
    game.vote = { endsAt: game.time + TUNING.voteSeconds, k: alive.length - game.seats, ballots: {}, drafts: {}, result: null };
    events.push({ type: "vote", k: game.vote.k, seats: game.seats });
  } else startBoarding(game, [], events);
}

// targets = ids the voter wants to leave behind (at most k). Voting for yourself = volunteering = counts double.
export function castVote(game, players, player, targets, confirmed = true) {
  if (game.stage !== "vote") return "There is no vote right now.";
  if (!isAlive(player)) return "Spectators cannot vote.";
  if (!Array.isArray(targets) || targets.length > game.vote.k) return `Choose at most ${game.vote.k}.`;
  const alive = new Set(players.filter(isAlive).map((p) => p.id));
  if (Object.hasOwn(game.vote.ballots, player.id)) return "Your ballot is already confirmed.";
  const clean = [...new Set(targets.filter((t) => typeof t === "string" && alive.has(t)))];
  if (confirmed && clean.length && clean.length !== game.vote.k) return `Choose ${game.vote.k} people, or explicitly abstain.`;
  game.vote.drafts[player.id] = clean;
  if (confirmed) { game.vote.ballots[player.id] = clean; if (clean.includes(player.id)) player.volunteered = true; }
  return null;
}

export function tallyVote(game, players) {
  const alive = players.filter(isAlive);
  const score = Object.fromEntries(alive.map((p) => [p.id, 0]));
  for (const [voter, targets] of Object.entries(game.vote.ballots)) {
    for (const t of targets) if (t in score) score[t] += t === voter ? 2 : 1;
  }
  // Fair, transparent order: most votes leave first; ties -> whoever contributed the fewest tasks; then by id.
  const order = alive.slice().sort((a, b) =>
    score[b.id] - score[a.id] || (a.contribution || a.tasksDone) - (b.contribution || b.tasksDone) || (a.id < b.id ? -1 : 1));
  const left = order.slice(0, game.vote.k);
  const boundary = order[game.vote.k];
  const lastIn = left[left.length - 1];
  const tiebreak = left.some((p) => score[p.id] === 0) || (!!boundary && !!lastIn && score[boundary.id] === score[lastIn.id]);
  return { left: left.map((p) => p.id), tally: score, tiebreak };
}

function stepVote(game, players, events) {
  const voters = players.filter((p) => isAlive(p) && p.connected);
  const allVoted = voters.length > 0 && voters.every((p) => game.vote.ballots[p.id]);
  if (!allVoted && game.time < game.vote.endsAt) return;
  const result = tallyVote(game, players);
  result.at = game.time;
  game.vote.result = result;
  for (const p of players) {
    if (!result.left.includes(p.id)) continue;
    p.leftBehind = true;
    game.holds.delete(p.id);
  }
  events.push({ type: "voteResult", left: result.left });
  startBoarding(game, result.left, events);
}

function startBoarding(game, left, events) {
  game.stage = "boarding";
  game.boarding = { since: game.time, endsAt: game.time + TUNING.boardSeconds, left };
  events.push({ type: "boarding", seconds: TUNING.boardSeconds });
}

function stepBoarding(game, players, events) {
  const boardable = players.filter((p) => !p.lost && !p.leftBehind);
  const inPod = boardable.filter((p) => p.aboard && !p.downed);
  const ready = boardable.length > 0 && inPod.length === boardable.length && game.time - game.boarding.since >= TUNING.boardMin;
  if (!ready && game.time < game.boarding.endsAt) return;
  beginFinale(game, players, events);
}

// ------------------------------------------------------------------ finishing
export function buildSummary(game, players, result, reason) {
  const escaped = players.filter(p => game.finale ? p.escaped : p.aboard);
  const aboard = players.filter(p => p.aboard && (game.finale ? p.escaped : true));
  return {
    result, reason, seed: game.seed, mission: game.mission,
    storyEnding:game.practice?{id:'training',title:'Simulation debrief',text:'Training records are separate from real expeditions.'}:storyEnding(game,players), evidence:[...game.story.found],
    practice:!!game.practice,practiceComplete:!!game.practice&&game.finale?.pod.status==='escaped'&&players[0]?.aboard,
    timeline: (game.timeline || []).map(e => ({ ...e })),
    grade: result === "win" ? (escaped.length === game.startCount ? "full" : "partial") : "none",
    seconds: Math.round(game.time),
    startCount: game.startCount, seats: game.seats,
    aboard: aboard.map((p) => p.name),
    escaped: escaped.map(p => p.name), capsules: escaped.filter(p => !p.aboard).map(p => p.name),
    leftBehind: players.filter((p) => p.leftBehind).map((p) => p.name),
    lost: players.filter((p) => !p.escaped && (game.finale ? p.lost : !p.aboard) && !p.leftBehind).map((p) => p.name),
    crew: players.map((p) => ({
      id: p.id, name: p.name, dept: p.dept, tasks: p.tasksDone, contribution: p.contribution || 0, volunteered: p.volunteered,
      downs:p.stats?.downs||0,revives:p.stats?.revives||0,survived:Math.round(Math.min(game.time,p.escapedAt??p.lostAt??game.time)),escaped:game.finale?!!p.escaped:!!p.aboard,
      ending: p.ending || (p.lost ? "lost" : "stranded"),
      fate: p.escaped ? p.aboard ? "pod escaped" : "capsule escaped" : p.leftBehind ? "left behind" : p.lost ? "lost" : "stranded"
    })),
    finale: game.finale ? { pod: game.finale.pod.status, history: game.finale.history } : null
  };
}

function finish(game, players, result, reason, events) {
  game.status = result;
  recordEvents(game, players, events);
  game.outcome = buildSummary(game, players, result, reason);
  game.holds.clear();
  events.push({ type: "over", outcome: game.outcome });
}

// ------------------------------------------------------------------ snapshot for clients
export function snapshotGame(game, players, nowMs = Date.now()) {
  const holds = {};
  for (const [pid, h] of game.holds) holds[pid] = { id: h.id, progress: round(holdProgress(game, h), 3), tool:h.gearApplied==='welder'?'welder':null };
  const stations = {};
  for (const id of STATION_IDS) {
    const s = stationState(game, STATIONS[id]);
    if (s !== "hidden") stations[id] = s;
  }
  const L = game.lockdown;
  return {
    t: Math.round(game.time), status: game.status, stage: game.stage, outcome: game.outcome, mission: game.mission,
    calibrations: game.calibrations, capsuleDiscovered: game.capsuleDiscovered, finale: finaleSnapshot(game),
    flooding:{capacity:powerOn(game)&&game.tasks.pump.done&&(!game.finale||game.finale.station.power>0)?round(pumpCapacity(game.scale,TUNING.pumpRate)*((game.complication.state==='active'?TUNING.complication.cloggedPump:game.complication.state==='resolved'?TUNING.complication.servicedPump:1)+(game.salvage.state==='installed'?TUNING.salvage.bonus:0)),3):0,inflow:round(game.breaches.reduce((sum,b)=>sum+(b.clampedUntil>game.time?0:TUNING.breachRate*breachSeverity(b,game.time)*MISSIONS[game.mission].leak*(game.stage==='boarding'?TUNING.boardLeakFactor:1)),0),3)},
    power: powerOn(game), oxygen: round(game.oxygen, 1),
    seats: game.seats, startCount: game.startCount,
    rooms: Object.fromEntries(ROOM_IDS.map((r) => [r, { flood: round(game.rooms[r].flood, 3), closed: game.rooms[r].closed, locked: game.rooms[r].locked, impacts:game.rooms[r].impacts||0 }])),
    hub: round(hubLevel(game), 3),
    breaches: game.breaches.map((b) => ({ id: b.id, room: b.room, x: b.x, z: b.z,severity:round(breachSeverity(b,game.time),2),clampedIn:Math.max(0,Math.ceil((b.clampedUntil||0)-game.time)) })),
    stations, holds, complication: { state: game.complication.state },
    lockers: Object.fromEntries(Object.entries(game.lockers).map(([id,stock])=>[id,{...stock}])),
    resources: game.resources.map(r=>({...r})),
    salvage: {...game.salvage},
    story: {available:[...game.story.available],found:[...game.story.found]},
    scrap:game.scrap.map(r=>({...r})),difficulty:game.difficulty,
    roomCircuits:{...game.roomCircuits},empRooms:{...game.empRooms},
    threats:JSON.parse(JSON.stringify(game.threats)),
    sub:JSON.parse(JSON.stringify(game.sub)),
    practice:game.practice?{step:game.practice.step}:null,
    scan: game.scan && game.time < game.scan.until ? { x:round(game.scan.x), z:round(game.scan.z), age:round(game.time-game.scan.at,1), remaining:round(game.scan.until-game.time,1) } : null,
    scanReadyIn: Math.max(0,Math.ceil(game.scanReadyAt-game.time)),
    returnMarker: game.returnMarker && game.time < game.returnMarker.until ? { x:game.returnMarker.x, z:game.returnMarker.z, remaining:Math.ceil(game.returnMarker.until-game.time) } : null,
    effects: game.effects.map(e => ({ id: e.id, item: e.item, x: e.x, z: e.z, ext: e.exterior, remaining: round(e.until - game.time, 1) })),
    lureReadyIn: Math.max(0, Math.ceil(game.lureReadyAt - game.time)),
    activeJunctions: game.activeJunctions,
    lev: { state: game.lev.state, threat: round(game.lev.threat, 1), angle: round(game.lev.angle, 3), dist: round(game.lev.dist, 1), patrolDir: game.lev.patrolDir },
    decoy: { active: game.time < game.decoy.until, readyIn: Math.max(0, Math.ceil(game.decoy.readyAt - game.time)) },
    lockdown: { active: L.active, rooms: L.rooms, progress: round(L.progress, 3) },
    vote: game.vote && {
      endsIn: Math.max(0, Math.ceil(game.vote.endsAt - game.time)), k: game.vote.k,
      voted: Object.keys(game.vote.ballots), result: game.vote.result
    },
    boarding: game.boarding && { endsIn: Math.max(0, Math.ceil(game.boarding.endsAt - game.time)), left: game.boarding.left },
    players: players.map((p) => ({
      id: p.id, name: p.name, dept: p.dept, x: round(p.x), z: round(p.z), rot: round(p.rotation),
      run: isRunning(p, nowMs), room: roomAt(p.x, p.z), hp: Math.round(p.hp), down: p.downed, lost: p.lost,
      downIn: p.downed && !p.lost ? Math.max(0, Math.ceil(TUNING.downTimeout - (game.time - p.downedAt))) : 0,
      left: p.leftBehind, aboard: p.aboard, escaped: !!p.escaped, ending: p.ending, contribution: p.contribution || 0,
      noise: p.subSeat&&Math.abs(game.sub.speed)>.4?80:game.holds.get(p.id)?.gearApplied === 'welder' ? 100 : isRunning(p, nowMs) ? 80 : ['resource','scrap','salvageRecover','salvageInstall'].includes(game.holds.get(p.id)?.mode) ? 65 : p.exterior ? 15 : game.holds.get(p.id) && (game.holds.get(p.id).mode === 'service' || STATIONS[game.holds.get(p.id).id]?.noisy) ? 65 : 0,
      breath:round(p.breath??FLOODING.breathSeconds,1),submerged:!!p.submerged&&!p.lost&&!p.downed&&!p.escaped&&!p.aboard,ext: p.exterior, conn: p.connected, suit: Math.round(p.suit),
      inventory: [...(p.inventory || [])], itemReadyIn: Math.max(0, Math.ceil((p.itemReadyAt || 0) - game.time)),
      craftReadyIn:Math.max(0,Math.ceil((p.craftReadyAt||0)-game.time)),flashlight:p.flashlight,
      profileId:p.profileId||null,
      subSeat:p.subSeat,depth:round(p.depth||0,2),pressure:round(suitDrain(p.x,p.z,p.depth||0),2),
      lockerReadyIn: Math.max(0,Math.ceil((p.lockerReadyAt || 0)-game.time)),
      stm: Math.round(p.stamina), wnd: p.winded
    }))
  };
}
