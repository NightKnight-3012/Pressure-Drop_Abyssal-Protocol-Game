// Single source of truth for the station layout, stations and tuning constants.
// Imported by BOTH the server (validation) and the client (rendering/collision),
// so the two can never disagree about where walls, doors or panels are.

export const MAX_PLAYERS = 8;

// ------------------------------------------------------------------ player
export const PLAYER_RADIUS = 0.4;
export const WALK_SPEED = 4;
export const RUN_SPEED = 6.2;
export const SWIM_SPEED = 3.4;            // divers outside the hull
export const FLOODED_SPEED_FACTOR = 0.62; // speed multiplier once water is knee-high
export const FLOODED_SLOW_LEVEL = 0.5;
export const DROWN_DEPTH = 2.0;           // water above this height drowns you
export const EYE_HEIGHT = 1.65;
export const DOWNED_EYE_HEIGHT = 0.45;
export const MAX_HP = 100;
// Sprinting costs stamina: a few seconds of running, then you must catch your breath.
export const STAMINA = { max: 100, drain: 30, regen: 15, resumeAt: 25 };

// ------------------------------------------------------------------ geometry
export const HALF = 10;        // outer wall centre line
export const INNER = 9.8;      // inner face of the outer walls
export const HULL_OUT = 10.2;  // outer face of the outer walls
export const HUB = 1.65;       // half-size of the open central hub
export const WALL_T = 0.25;
export const DOOR_T = 0.3;
export const EXT_LIMIT = 60;   // survey perimeter: 120m square; required jobs remain near the hull
export const FLOOD_MAX = 3.35;

// ------------------------------------------------------------------ rooms
export const ROOM_IDS = ["control", "engineering", "medical", "pod"];
export const ROOMS = {
  control:     { id: "control",     label: "Control Room", sx: -1, sz: -1 },
  engineering: { id: "engineering", label: "Engineering",  sx: 1,  sz: -1 },
  medical:     { id: "medical",     label: "Medical Bay",  sx: -1, sz: 1 },
  pod:         { id: "pod",         label: "Escape Pod",   sx: 1,  sz: 1 }
};
export const ZONE_LABEL = {
  hub: "Central Hub", exterior: "Outside the hull",
  control: "Control Room", engineering: "Engineering", medical: "Medical Bay", pod: "Escape Pod"
};

// Which room (or "hub" / "exterior") is a point in?
export function roomAt(x, z) {
  if (Math.abs(x) > HULL_OUT || Math.abs(z) > HULL_OUT) return "exterior";
  if (Math.abs(x) < HUB && Math.abs(z) < HUB) return "hub";
  if (x < 0 && z < 0) return "control";
  if (x >= 0 && z < 0) return "engineering";
  if (x < 0 && z >= 0) return "medical";
  return "pod";
}
export const zoneLabel = (x, z) => ZONE_LABEL[roomAt(x, z)];

// Which room does a Leviathan at this angle (atan2(z, x)) hit?
export function roomAtAngle(angle) {
  return roomAt(Math.cos(angle) * 5, Math.sin(angle) * 5);
}

// ------------------------------------------------------------------ departments
export const DEPT_IDS = ["engineering", "eva", "command", "medical"];
export const DEPTS = {
  engineering: {
    id: "engineering", label: "Engineering", short: "ENG", color: "#ffb347",
    blurb: "Repairs power, the pump and hull breaches about twice as fast as anyone else."
  },
  eva: {
    id: "eva", label: "EVA Diver", short: "EVA", color: "#6ec1ff",
    blurb: "The only crew allowed through the airlock. Swim outside and repair the cable junctions."
  },
  command: {
    id: "command", label: "Command & Sonar", short: "CMD", color: "#c79bff",
    blurb: "Reads the sonar, operates the blast doors and can launch a decoy to lure the Leviathan away."
  },
  medical: {
    id: "medical", label: "Medical & Logistics", short: "MED", color: "#5dffb0",
    blurb: "Revives and heals crew, restores the station's oxygen and runs life support."
  }
};

// ------------------------------------------------------------------ boxes
const aabb = (cx, cz, w, d) => ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

// Shared footprints for the optional exploration areas. All leave the inner 20m apron clear.
export const EXTERIOR_STRUCTURES = [
  {id:'garden-spire',kind:'rock',cx:-32,cz:-15,w:6,d:5,h:6},
  {id:'garden-ridge',kind:'rock',cx:-45,cz:11,w:7,d:7,h:7},
  {id:'garden-sill',kind:'rock',cx:-29,cz:25,w:5,d:8,h:5},
  {id:'cleft-west',kind:'rock',cx:-12,cz:-36,w:9,d:18,h:9},
  {id:'cleft-east',kind:'rock',cx:10,cz:-38,w:9,d:14,h:8},
  {id:'receiver',kind:'receiver',cx:25,cz:-23,w:10,d:10,h:5},
  {id:'wreck-port',kind:'wreck',cx:32,cz:-1,w:1,d:34,h:4},
  {id:'wreck-starboard',kind:'wreck',cx:44,cz:-1,w:1,d:34,h:4},
  {id:'wreck-baffle-a',kind:'wreck',cx:35,cz:-5,w:4,d:1,h:2.5},
  {id:'wreck-baffle-b',kind:'wreck',cx:41,cz:5,w:4,d:1,h:2.5}
];
export const EXTERIOR_ROUTES = [
  {id:'home',label:'STATION LOOP',points:[[-12,5.5],[-18,5.5],[-18,-18],[18,-18],[18,18],[-18,18],[-18,5.5]]},
  {id:'garden',label:'WEST / VENT GARDEN',points:[[-18,5.5],[-26,5.5],[-38,5.5],[-38,-12]]},
  {id:'wreck',label:'EAST / SURVEY WRECK',points:[[18,18],[28,18],[38,18],[38,5],[38,-12]]},
  {id:'cleft',label:'NORTH / BASALT CLEFT',points:[[0,-18],[0,-30],[0,-45]]}
];
export const EXTERIOR_BOUNDARY = [-1,1].flatMap(sign=>[
  {cx:sign*EXT_LIMIT,cz:0,w:.2,d:EXT_LIMIT*2,h:3},
  {cx:0,cz:sign*EXT_LIMIT,w:EXT_LIMIT*2,d:.2,h:3}
]);

export const WALLS = [
  // outer walls
  { cx: 0, cz: -HALF, w: 20.4, d: 0.4 },
  { cx: 0, cz: HALF, w: 20.4, d: 0.4 },
  { cx: -HALF, cz: 0, w: 0.4, d: 20.4 },
  { cx: HALF, cz: 0, w: 0.4, d: 20.4 },
  // inner cross walls: four arms that stop at the central hub
  ...[-1, 1].flatMap(sign => [[HUB,4.3],[6.1,INNER]].flatMap(([a,b]) => [
    {cx:0,cz:sign*(a+b)/2,w:WALL_T,d:b-a},
    {cx:sign*(a+b)/2,cz:0,w:b-a,d:WALL_T}
  ]))
];
// A physical circulation loop connects all four wings independently of the hub.
export const SERVICE_PORTALS = [
  {x:-5.2,z:0,axis:'x',rooms:['control','medical']},
  {x:5.2,z:0,axis:'x',rooms:['engineering','pod']},
  {x:0,z:-5.2,axis:'z',rooms:['control','engineering']},
  {x:0,z:5.2,axis:'z',rooms:['medical','pod']}
];
export const ROOM_PARTITIONS = [
  {cx:-3.15,cz:-6,w:.18,d:3,h:2.6,room:'control'},
  {cx:5.7,cz:-4.8,w:3,d:.18,h:2.2,room:'engineering'},
  {cx:-3.15,cz:7.5,w:.18,d:3,h:2.4,room:'medical'},
  {cx:4.1,cz:5,w:.18,d:2.4,h:2.7,room:'pod'}
];

export const CRATES = [
  { cx: -8.1, cz: -3.3, w: 1.1, d: 1.1, h: 1.0, color: 0x30444e },
  { cx: 8.0, cz: -3.5, w: 1.2, d: 1.2, h: 1.1, color: 0x315148 },
  { cx: -8.0, cz: 2.9, w: 1.0, d: 1.0, h: 0.9, color: 0x45475a },
  { cx: -4.0, cz: 6.0, w: 1.6, d: 0.8, h: 0.8, color: 0x3d4150 },
  { cx: 3.4, cz: -8.2, w: 1.0, d: 1.0, h: 0.9, color: 0x3a4a3d }
];

// Existing storage fronts: no new obstacles or room changes.
export const LOCKERS = {
  engineering: { id:'engineering', label:'Engineering stores', room:'engineering', crate:1, x:8, z:-2.9, y:.7 },
  medical: { id:'medical', label:'Medical emergency stores', room:'medical', crate:2, x:-8, z:3.38, y:.6 }
};
export const LOCKER_RANGE = 1.8;

// The escape pod: a big machine against the south wall of the pod room.
export const POD = { cx: 7.0, cz: 8.7, w: 3.6, d: 1.9, h: 2.4 };

// Observation windows (visual only; the wall stays solid). wall: N,S,E,W. c = centre along the wall.
export const WINDOWS = [
  { wall: "N", c: -2.6 }, { wall: "N", c: 2.6 },
  { wall: "W", c: -4.2 }, { wall: "W", c: 2.4 },
  { wall: "S", c: -3.0 }, { wall: "S", c: 2.4 },
  { wall: "E", c: -2.6 }, { wall: "E", c: 2.2 }
];
export const WINDOW_W = 2.2;
export const WINDOW_Y0 = 0.9;
export const WINDOW_Y1 = 2.9;

// ------------------------------------------------------------------ blast doors
// Each room is closed off from the hub by two slabs forming an "L" across its open corner.
export function doorSlabs(room) {
  const { sx, sz } = ROOMS[room];
  return [
    aabb(sx * HUB / 2, sz * HUB, HUB + DOOR_T, DOOR_T),
    aabb(sx * HUB, sz * HUB / 2, DOOR_T, HUB + DOOR_T),
    aabb(sx*5.2,sz*.15,1.8,.24),
    aabb(sx*.15,sz*5.2,.24,1.8)
  ];
}
export const DOOR_SLABS = Object.fromEntries(ROOM_IDS.map((r) => [r, doorSlabs(r)]));

// ------------------------------------------------------------------ stations
// Every spot a player can interact with. `rot` turns the panel so its screen faces into the room.
//   kind: task (one-time repair) | refill | door | airlock
//   dept: the department that works at double speed
//   requires: station ids that must be done first ("junctions" = all cable junctions)
//   hold: seconds to hold E for a non-specialist
export const STATIONS = {
  power: {
    id: "power", kind: "task", label: "Power core", room: "engineering",
    x: 9.55, z: -6, rot: -Math.PI / 2, hold: 6, dept: "engineering", noisy: true,
    effect: "Restores power: lights, pump, doors, airlock and sonar"
  },
  pump: {
    id: "pump", kind: "task", label: "Flood pump", room: "engineering",
    x: 5.5, z: -9.55, rot: 0, hold: 6, dept: "engineering", noisy: true, requires: ["power"],
    effect: "Drains every room, but breaches can outpace it"
  },
  console: {
    id: "console", kind: "task", label: "Command console", room: "control",
    x: -6, z: -9.55, rot: 0, hold: 6, dept: "command", requires: ["power"],
    effect: "Sonar, remote blast doors and decoy launcher. Running is 40% quieter"
  },
  lifesupport: {
    id: "lifesupport", kind: "task", label: "Life support unit", room: "medical",
    x: -6, z: 9.55, rot: Math.PI, hold: 6, dept: "medical", requires: ["power"],
    effect: "Enables the oxygen reserve"
  },
  o2: {
    id: "o2", kind: "refill", label: "Oxygen reserve", room: "medical",
    x: -8.3, z: 9.55, rot: Math.PI, hold: 5, dept: "medical", requires: ["lifesupport"],
    effect: "Restores station oxygen (short cooldown)"
  },
  launch: {
    id: "launch", kind: "task", label: "Pod launch console", room: "pod",
    x: 9.55, z: 4.5, rot: -Math.PI / 2, hold: 4, dept: null,
    requires: ["power", "pump", "console", "lifesupport", "junctions"],
    effect: "Starts the escape sequence"
  },
  airlock_in: {
    id: "airlock_in", kind: "airlock", label: "Airlock", room: "medical",
    x: -9.55, z: 5.5, rot: Math.PI / 2, hold: 3, dept: null, requires: ["power"], exterior: false,
    effect: "Divers only: cycle outside"
  },
  airlock_out: {
    id: "airlock_out", kind: "airlock", label: "Airlock hatch", room: "exterior",
    x: -10.45, z: 5.5, rot: -Math.PI / 2, hold: 3, dept: null, exterior: true,
    effect: "Cycle back inside"
  },
  door_control: { id: "door_control", kind: "door", door: "control", label: "Control Room door panel", room: "control", x: -0.28, z: -3.2, rot: -Math.PI / 2, hold: 2.5 },
  door_engineering: { id: "door_engineering", kind: "door", door: "engineering", label: "Engineering door panel", room: "engineering", x: 0.28, z: -3.2, rot: Math.PI / 2, hold: 2.5 },
  door_medical: { id: "door_medical", kind: "door", door: "medical", label: "Medical Bay door panel", room: "medical", x: -0.28, z: 3.2, rot: -Math.PI / 2, hold: 2.5 },
  door_pod: { id: "door_pod", kind: "door", door: "pod", label: "Escape Pod door panel", room: "pod", x: 0.28, z: 3.2, rot: Math.PI / 2, hold: 2.5 },
  j1: { id: "j1", kind: "task", junction: true, label: "Cable junction A", room: "exterior", x: -13, z: -5, rot: 0, hold: 5, dept: "eva", exterior: true, effect: "Re-seat the launch cables" },
  j2: { id: "j2", kind: "task", junction: true, label: "Cable junction B", room: "exterior", x: 6, z: -13, rot: 0, hold: 5, dept: "eva", exterior: true, effect: "Re-seat the launch cables" },
  j3: { id: "j3", kind: "task", junction: true, label: "Cable junction C", room: "exterior", x: 13.5, z: 6, rot: 0, hold: 5, dept: "eva", exterior: true, effect: "Re-seat the launch cables" }
};
export const STATION_IDS = Object.keys(STATIONS);
export const JUNCTION_IDS = STATION_IDS.filter((id) => STATIONS[id].junction);
export const DOOR_STATION = Object.fromEntries(ROOM_IDS.map((r) => [r, `door_${r}`]));

export const REPAIR_RANGE = 2.25;
export const BREACH_RANGE = 2.0;
export const TREAT_RANGE = 2.0;
export const CONSOLE_RANGE = 3.0;
export const AIRLOCK_ARRIVE_EXT = { x: -12.0, z: 5.5 };
export const AIRLOCK_ARRIVE_INT = { x: -8.2, z: 5.5 };

// ------------------------------------------------------------------ solids / collision
function stationSolid(s) {
  if (s.junction) return aabb(s.x, s.z, 0.9, 0.9);
  const sideways = Math.abs(Math.sin(s.rot)) > 0.5;
  return aabb(s.x, s.z, sideways ? 0.5 : 1.0, sideways ? 1.0 : 0.5);
}

// Inside the station
export const SOLIDS = [
  ...WALLS.map((w) => aabb(w.cx, w.cz, w.w, w.d)),
  ...ROOM_PARTITIONS.map(w=>aabb(w.cx,w.cz,w.w,w.d)),
  ...CRATES.map((c) => aabb(c.cx, c.cz, c.w, c.d)),
  aabb(POD.cx, POD.cz, POD.w, POD.d),
  ...Object.values(STATIONS).filter((s) => !s.exterior).map(stationSolid)
];
// Outside the hull (the whole station is one big solid block)
export const EXT_SOLIDS = [
  aabb(0, 0, HULL_OUT * 2, HULL_OUT * 2),
  ...Object.values(STATIONS).filter((s) => s.exterior).map(stationSolid),
  ...EXTERIOR_STRUCTURES.map(s=>aabb(s.cx,s.cz,s.w,s.d)),
  ...EXTERIOR_BOUNDARY.map(s=>aabb(s.cx,s.cz,s.w,s.d))
];

const NO_DOORS = Object.freeze([]);

function hitsAny(list, x, z, r2) {
  for (const b of list) {
    const cx = Math.max(b.minX, Math.min(b.maxX, x));
    const cz = Math.max(b.minZ, Math.min(b.maxZ, z));
    if ((x - cx) ** 2 + (z - cz) ** 2 < r2) return true;
  }
  return false;
}

// Does a circle at (x, z) overlap anything solid? `closed` = array of room ids whose door is shut.
export function collides(x, z, radius = PLAYER_RADIUS, closed = NO_DOORS, exterior = false) {
  const r2 = radius * radius;
  if (hitsAny(exterior ? EXT_SOLIDS : SOLIDS, x, z, r2)) return true;
  if (!exterior) for (const room of closed) if (hitsAny(DOOR_SLABS[room], x, z, r2)) return true;
  return false;
}

// Check the travelled segment as well as its destination. Substeps are shorter
// than the collider radius, so delayed packets cannot hop through thin walls.
export function pathBlocked(fromX, fromZ, x, z, radius = PLAYER_RADIUS, closed = NO_DOORS, exterior = false) {
  if (![fromX, fromZ, x, z, radius].every(Number.isFinite) || radius <= 0) return true;
  const steps = Math.max(1, Math.ceil(Math.hypot(x - fromX, z - fromZ) / (radius * 0.5)));
  if (steps > 256) return true;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (collides(fromX + (x - fromX) * t, fromZ + (z - fromZ) * t, radius, closed, exterior)) return true;
  }
  return false;
}

// Is somebody standing in the doorway of this room (so it can't close)?
export function doorwayBlocked(room, x, z) {
  const r = PLAYER_RADIUS + 0.2;
  return hitsAny(DOOR_SLABS[room], x, z, r * r);
}

// Find the nearest free spot to (x, z). Used when something forces a player out of a doorway.
export function nearestFree(x, z, closed = NO_DOORS, exterior = false) {
  if (!collides(x, z, PLAYER_RADIUS, closed, exterior)) return { x, z };
  for (let r = 0.25; r <= 3; r += 0.25) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
      if (!collides(nx, nz, PLAYER_RADIUS, closed, exterior)) return { x: nx, z: nz };
    }
  }
  return { x, z };
}

// Spawn grid inside the Control Room, up to 8 slots.
export function spawnPoint(index) {
  const i = ((index % MAX_PLAYERS) + MAX_PLAYERS) % MAX_PLAYERS;
  return { x: -7.6 + (i % 4) * 1.0, z: -8.0 + Math.floor(i / 4) * 1.0 };
}

// ------------------------------------------------------------------ scaling with crew size
const CLAMP_N = (n) => Math.max(1, Math.min(MAX_PLAYERS, Math.round(n) || 1));
const BY_N = (arr) => (n) => arr[CLAMP_N(n) - 1];

// Index = number of players (1..8). These are the numbers shown in the README table.
const SCALE_TABLE = {
  breachInterval: BY_N([44, 40, 36, 31, 28, 25, 22, 20]), // seconds between new hull breaches
  maxBreaches:    BY_N([2, 2, 3, 3, 4, 4, 5, 5]),         // simultaneous breaches
  oxygenDrain:    BY_N([0.22, 0.25, 0.27, 0.30, 0.33, 0.35, 0.38, 0.40]), // % per second
  noiseGain:      BY_N([0.8, 0.85, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0]),        // Leviathan hearing
  lockdowns:      BY_N([0, 1, 1, 1, 1, 1, 2, 2]),
  lockdownAt:     BY_N([999, 110, 110, 105, 95, 90, 80, 75]),             // seconds into the match
  junctions:      BY_N([2, 2, 2, 2, 3, 3, 3, 3])
};
export function scalingFor(n) {
  return Object.fromEntries(Object.entries(SCALE_TABLE).map(([k, f]) => [k, f(n)]));
}
export const SCALING_TABLE_ROWS = Array.from({ length: MAX_PLAYERS }, (_, i) => ({ players: i + 1, ...scalingFor(i + 1) }));

// Escape pod seats: always fewer than the crew once there are 4+ players.
export function seatsFor(n) {
  n = CLAMP_N(n);
  return n < 4 ? n : [3, 4, 5, 6, 6][n - 4];
}
