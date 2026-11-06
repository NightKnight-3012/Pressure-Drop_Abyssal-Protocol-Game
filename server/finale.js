import { FINALE_POINTS, CAPSULE_STEPS, POD_ROUTE_LENGTH, POD_DOCKING, POD_ACTIONS, atPoint } from "../shared/tactical.js";
import { nearestFree, ROOM_IDS, FLOOD_MAX } from "../shared/layout.js";
import {createRoute} from '../shared/escape-route.js';

const active = p => p && p.connected && !p.lost && !p.downed && !p.escaped;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function beginFinale(game, players, events) {
  game.stage = "finale";
  game.holds.clear();
  for (const r of ROOM_IDS) { game.rooms[r].locked = false; game.rooms[r].closed = false; }
  game.lockdown.active = false; game.lockdown.rooms = [];
  const crew = players.filter(p => p.aboard && !p.lost);
  const route = createRoute(game.rng);
  game.finale = {
    since: game.time, pod: { status: crew.length ? "running" : "lost", pilot: crew.find(active)?.id ?? null,
      phase: "run", dockProgress: 0, sealSince: null, ascentSince: null, progress: 0, lane: 0, lateralSpeed: 0, hull: 100, oxygen: 100, battery: 100, speed: 0, input: { steer: 0, throttle: 0.7, boost: false, at: game.time },
      route, repairs: {}, charges: 2, counterAt: 0, distractedUntil: 0, sonarUntil: 0, diversion: null, pulseUntil: 0, consentCooldown: 0,
      creatureDistance: 36, strikeAt: 0 },
    station: { status: "running", power: 100, beacon: false, beaconBy: null, capsuleStep: 0, capsulesUsed: 0, repair: null,
      lastRadio: null, collapseAt: game.time + 180 },
    creature: { target: "pod", committedAt: game.time, noisePod: 0, noiseStation: 0, stationStrikeAt: game.time + 14 },
    history: { beaconSeconds: 0, diversions: 0, podHelpSeconds: 0, stationHelpBy: {}, podHelpBy: {}, capsuleWork: 0 }
  };
  for (const p of players) if (!p.aboard && !p.lost) { p.leftBehind = true; p.ending = null; }
  events.push({ type: "finale", pilot: game.finale.pod.pilot });
}

export function finaleInteract(game, players, p, id, events) {
  if (!active(p) || p.aboard) return "You cannot operate this station right now.";
  const point = FINALE_POINTS[id];
  if (!point || !atPoint(p, point)) return "Move closer to the panel.";
  if (id === "board") {
    if (game.stage !== "boarding" || p.leftBehind) return "You do not have a seat on this pod.";
    if (players.filter(q => q.aboard).length >= game.seats) return "The pod is full.";
    p.aboard = true; p.running = false; game.holds.delete(p.id);
    events.push({ type: "boarded", id: p.id }); return null;
  }
  if (game.stage !== "finale") return "This emergency equipment is reserved for the final evacuation.";
  const f = game.finale, s = f.station;
  if (s.status !== "running") return "The station has been lost.";
  if (id === "beacon") {
    if (!s.beacon && s.power <= 2) return "No reserve power remains for the beacon.";
    s.beacon = !s.beacon; s.beaconBy = s.beacon ? p.id : null;
    events.push({ type: "beacon", active: s.beacon, by: p.id }); return null;
  }
  if (id === "capsule") {
    if (s.repair && s.repair.by !== p.id) return "Someone else is working on the capsule.";
    if (s.capsuleStep >= CAPSULE_STEPS.length) {
      if (s.capsulesUsed >= 2) return "Both one-person maintenance capsules have already launched.";
      s.capsulesUsed++;
      p.escaped = true; p.ending = "capsule_escape"; s.lastRadio = `${p.name} launched the maintenance capsule.`;
      events.push({ type: "capsuleEscape", id: p.id }); return null;
    }
    if (s.power < 12) return "The capsule needs 12 reserve power for its next repair.";
    if (!s.repair) s.repair = { by: p.id, since: game.time, step: s.capsuleStep, need: p.dept === "engineering" ? 6 : 8 };
    return null;
  }
  return "No such emergency panel.";
}

export function podControl(game, players, p, data) {
  const pod = game.finale?.pod;
  if (game.stage !== "finale" || !pod || pod.status !== "running" || ["sealing", "ascent"].includes(pod.phase) || !active(p) || !p.aboard || pod.pilot !== p.id) return "Only the active pilot can steer.";
  if (!data || typeof data !== "object" || !Number.isFinite(data.steer) || !Number.isFinite(data.throttle) || typeof data.boost !== "boolean") return "Invalid piloting input.";
  pod.input = { steer: clamp(data.steer, -1, 1), throttle: clamp(data.throttle, 0, 1), boost: data.boost, at: game.time };
  return null;
}

export function podAction(game, players, p, action, events) {
  const pod = game.finale?.pod;
  if (game.stage !== "finale" || !pod || pod.status !== "running" || pod.phase === "ascent" || !active(p) || !p.aboard) return "You are not an active pod crew member.";
  if (!POD_ACTIONS.includes(action)) return "Unknown pod action.";
  if (pod.phase === "sealing" && ["pilot", "propose", "accept", "decline"].includes(action)) return "The cradle has control. Keep the hull stable while the shutter closes.";
  const crew = players.filter(q => q.aboard && active(q));
  if (action === "pilot") {
    if (pod.pilot === p.id && crew.length > 1) {
      pod.pilot = crew.find(q => q.id !== p.id).id;
      delete pod.repairs[pod.pilot];
      pod.input = { steer: 0, throttle: 0.65, boost: false, at: game.time };
      events.push({ type: "pilotChanged", id: pod.pilot }); return null;
    }
    if (players.some(q => q.id === pod.pilot && active(q))) return "The pilot is still at the controls.";
    pod.pilot = p.id; return null;
  }
  if (action === "repairStop") { delete pod.repairs[p.id]; return null; }
  if (action === "repair") {
    if (pod.pilot === p.id && crew.length > 1) return "Keep steering. Another crew member can repair.";
    if (game.time < (p.podRepairAt || 0)) return "Your equipment is recharging.";
    pod.repairs[p.id] ??= { since: game.time, need: p.dept === "engineering" || p.dept === "medical" ? 3 : 5 }; return null;
  }
  if (action === "sonar") {
    if (p.dept !== "command" && crew.some(q => q.dept === "command")) return "Ask Command to read the sonar.";
    if (game.time < pod.sonarUntil - 5) return "Sonar is recharging.";
    pod.sonarUntil = game.time + 7; p.contribution += 1; events.push({ type: "podSonar", by: p.id }); return null;
  }
  if (action === "countermeasure") {
    if (pod.charges <= 0 || game.time < pod.counterAt) return "Countermeasures are unavailable.";
    pod.charges--; pod.counterAt = game.time + 25; pod.distractedUntil = game.time + 6; pod.creatureDistance += 17;
    p.contribution += 2; events.push({ type: "podDecoy", by: p.id }); return null;
  }
  if (action === "propose") {
    if (pod.diversion || game.time < pod.consentCooldown) return "Wait before proposing another diversion.";
    if (!players.some(q => !q.aboard && !q.escaped && !q.lost)) return "No survivors remain in the station.";
    pod.diversion = { by: p.id, endsAt: game.time + 10, votes: { [p.id]: true } };
    events.push({ type: "diversionProposed", by: p.id }); return null;
  }
  if (!pod.diversion) return "There is no diversion proposal.";
  pod.diversion.votes[p.id] = action === "accept";
  return null;
}

function settlePod(game, players, status, events) {
  const f = game.finale, pod = f.pod;
  pod.status = status; pod.speed = 0; pod.repairs = {}; pod.pulseUntil = 0; pod.diversion = null;
  for (const p of players.filter(q => q.aboard && !q.lost)) {
    p.escaped = status === "escaped"; p.lost = status === "lost";
    p.ending = status === "escaped" ? "pod_escape" : "pod_lost";
  }
  events.push({ type: "podOutcome", status });
}

export function tickFinale(game, players, dt, events) {
  const f = game.finale, pod = f.pod, station = f.station, monster = f.creature;
  let crew = players.filter(p => p.aboard && active(p));
  if (pod.status === "running" && pod.phase !== "ascent") {
    if (!crew.some(p => p.id === pod.pilot)) {
      pod.pilot = crew[0]?.id ?? null;
      delete pod.repairs[pod.pilot];
      pod.input = { steer: 0, throttle: 0.65, boost: false, at: game.time };
    }
    const stale = game.time - pod.input.at > 0.6;
    const clamped = pod.phase === "sealing";
    if (pod.phase === "run" && pod.progress >= POD_DOCKING.approachAt) pod.phase = "approach";
    const boost = !stale && !clamped && pod.phase === "run" && pod.input.boost && pod.battery > 5;
    pod.boosting = boost;
    pod.battery = clamp(pod.battery + dt * (boost ? -17 : 5), 0, 100);
    const cruising = (1.2 + (stale ? 0.65 : pod.input.throttle) * 1.6 + (boost ? 1.6 : 0)) * (game.time < pod.distractedUntil ? 0.7 : 1);
    const approachSpeed = 0.65 + 1.8 * clamp((POD_ROUTE_LENGTH - pod.progress) / 12, 0, 1);
    pod.speed = clamped || pod.phase === "rendezvous" ? 0 : pod.phase === "approach" ? Math.min(cruising, approachSpeed) : cruising;
    const steering = clamped || stale ? 0 : pod.input.steer;
    const lateralTarget = steering * (pod.phase === "rendezvous" ? 0.65 : 1.4);
    pod.lateralSpeed += (lateralTarget - pod.lateralSpeed) * (1 - Math.exp(-12 * dt));
    pod.lane = clamp(pod.lane + pod.lateralSpeed * dt, -1.2, 1.2);
    if (clamped || pod.phase === "rendezvous" && Math.abs(pod.lane) < 0.16 && Math.abs(steering) < 0.1) pod.lane *= Math.exp(-4 * dt);
    pod.progress = Math.min(POD_ROUTE_LENGTH, pod.progress + pod.speed * dt);
    if (!clamped && pod.progress >= POD_ROUTE_LENGTH) {
      pod.phase = "rendezvous"; pod.speed = 0;
      const age = game.time - pod.input.at, centered = Math.abs(pod.lane) <= POD_DOCKING.tolerance;
      const braking = pod.input.throttle <= 0.45 && !pod.input.boost;
      if (age <= 0.95 && centered && braking) pod.dockProgress = Math.min(1, pod.dockProgress + dt / POD_DOCKING.lockSeconds);
      else if (age <= 0.95 && !braking) pod.dockProgress = 0;
      else if (!(age <= 1.3 && centered && braking)) pod.dockProgress = Math.max(0, pod.dockProgress - dt * 0.5);
    }
    pod.oxygen = clamp(pod.oxygen - dt * 0.62, 0, 100);
    for (const gate of pod.route) if (!gate.passed && pod.progress >= gate.at) {
      gate.passed = true;
      if (Math.abs(pod.lane - gate.lane) < 0.52) { pod.hull -= boost ? 22 : 14; events.push({ type: "podCollision", lane: gate.lane }); }
    }
    for (const [id, repair] of Object.entries(pod.repairs)) {
      const p = crew.find(q => q.id === id);
      if (!p || (p.id === pod.pilot && crew.length > 1)) { delete pod.repairs[id]; continue; }
      if (game.time - repair.since >= repair.need) {
        pod.hull = Math.min(100, pod.hull + (p.dept === "engineering" ? 18 : 10));
        pod.oxygen = Math.min(100, pod.oxygen + (p.dept === "medical" ? 16 : 7));
        p.contribution += 2; p.podRepairAt = game.time + 10; delete pod.repairs[id];
        events.push({ type: "podRepair", by: id });
      }
    }
    if (pod.diversion) {
      const yes = crew.filter(p => pod.diversion.votes[p.id] === true).length;
      const no = crew.filter(p => pod.diversion.votes[p.id] === false).length;
      if (yes > crew.length / 2) {
        pod.pulseUntil = game.time + 14; pod.battery = Math.max(0, pod.battery - 28);
        f.history.diversions++; for (const p of crew) if (pod.diversion.votes[p.id]) { p.contribution += 3; f.history.podHelpBy[p.id] = (f.history.podHelpBy[p.id] || 0) + 1; }
        events.push({ type: "diversion", accepted: true }); pod.diversion = null; pod.consentCooldown = game.time + 25;
      } else if (no >= Math.ceil(crew.length / 2) || game.time >= pod.diversion.endsAt) {
        events.push({ type: "diversion", accepted: false }); pod.diversion = null; pod.consentCooldown = game.time + 10;
      }
    }
    monster.noisePod = 1 + (boost ? 3.5 : 0) + (game.time < pod.pulseUntil ? 7 : 0) + Object.keys(pod.repairs).length * 0.65;
  } else monster.noisePod = 0;

  const remaining = players.filter(p => !p.aboard && !p.escaped && !p.lost);
  if (station.status === "running") {
    if (station.beacon && station.power > 0) {
      station.power = Math.max(0, station.power - dt * 2); f.history.beaconSeconds += dt;
      if (station.beaconBy) f.history.stationHelpBy[station.beaconBy] = (f.history.stationHelpBy[station.beaconBy] || 0) + dt;
    }
    if (station.power <= 0 || !remaining.length) { station.beacon = false; station.beaconBy = null; }
    const repair = station.repair, worker = repair && remaining.find(p => p.id === repair.by && active(p));
    if (repair && (!worker || !atPoint(worker, FINALE_POINTS.capsule) || worker.running)) station.repair = null;
    if (station.repair && game.time - station.repair.since >= station.repair.need) {
      if (station.power >= 12) {
        station.power -= 12; station.capsuleStep++; worker.contribution += 3; f.history.capsuleWork++;
        events.push({ type: "capsuleRepair", step: station.capsuleStep });
      } else events.push({ type: "notice", id: worker.id, text: "The beacon consumed the power needed for this repair." });
      station.repair = null;
    }
    monster.noiseStation = remaining.length ? 0.25 + (station.beacon ? 5.5 : 0) + (station.repair ? 2.4 : 0) : 0;
    for (const r of ROOM_IDS) game.rooms[r].flood = Math.min(FLOOD_MAX, game.rooms[r].flood + dt * (0.009 + (station.power <= 0 ? 0.015 : 0)));
    if (!remaining.length || game.time >= station.collapseAt) {
      station.status = remaining.length ? "lost" : "resolved"; station.beacon = false; station.repair = null;
      for (const p of remaining) { p.lost = true; p.ending = "station_lost"; }
      if (remaining.length) events.push({ type: "stationLost" });
    }
  } else monster.noiseStation = 0;

  // Acoustic commitment prevents instantaneous ping-pong. Capsule work itself
  // is noisy: trying to escape does not magically send the creature to the pod.
  const desired = (pod.status !== "running" || pod.phase === "ascent") && remaining.length ? "station" : !remaining.length ? "pod" : monster.noiseStation > monster.noisePod + 0.5 ? "station" : "pod";
  const currentNoise = monster.target === "pod" ? monster.noisePod : monster.noiseStation;
  const desiredNoise = desired === "pod" ? monster.noisePod : monster.noiseStation;
  const unavailable = monster.target === "pod" ? pod.status !== "running" || pod.phase === "ascent" : !remaining.length;
  if (desired !== monster.target && game.time - monster.committedAt >= 8 && (desiredNoise > currentNoise + 0.5 || unavailable)) {
    monster.target = desired; monster.committedAt = game.time;
    monster.stationStrikeAt = game.time + 12;
    events.push({ type: "pursuit", target: desired });
  }
  if (pod.status === "running" && pod.phase !== "ascent") {
    pod.creatureDistance = clamp(pod.creatureDistance + dt * (monster.target === "station" || game.time < pod.distractedUntil ? 3.2 : -2.2), 4, 65);
    if (monster.target === "pod" && pod.creatureDistance < 9 && game.time >= pod.strikeAt && game.time >= pod.distractedUntil) {
      pod.hull -= 14; pod.strikeAt = game.time + 9; events.push({ type: "podStrike" });
    }
    if (game.time < pod.pulseUntil) f.history.podHelpSeconds += dt;
    if (pod.hull <= 0 || pod.oxygen <= 0 || pod.phase !== "sealing" && game.time - f.since >= 150) settlePod(game, players, "lost", events);
    else if (pod.phase === "rendezvous" && pod.dockProgress >= 1) {
      pod.phase = "sealing"; pod.sealSince = game.time; pod.boosting = false; pod.speed = 0; pod.lateralSpeed = 0;
      pod.diversion = null; pod.pulseUntil = 0;
      events.push({ type: "podClamped" });
    } else if (pod.phase === "sealing" && game.time - pod.sealSince >= POD_DOCKING.sealSeconds) {
      pod.phase = "ascent"; pod.ascentSince = game.time; pod.boosting = false;
      pod.repairs = {}; pod.diversion = null; pod.pulseUntil = 0; monster.noisePod = 0;
      events.push({ type: "podSecured" });
    }
  }
  if (pod.status === "running" && pod.phase === "ascent" && game.time - pod.ascentSince >= POD_DOCKING.liftSeconds) settlePod(game, players, "escaped", events);
  if (monster.target === "station" && station.status === "running" && game.time >= monster.stationStrikeAt && remaining.length) {
    monster.stationStrikeAt = game.time + 15;
    const target = remaining.find(active) ?? remaining[0];
    const r = target.x < 0 ? target.z < 0 ? "control" : "medical" : target.z < 0 ? "engineering" : "pod";
    game.rooms[r].flood = Math.min(FLOOD_MAX, game.rooms[r].flood + 0.35);
    for (const p of remaining.filter(active)) {
      p.hp = Math.max(0, p.hp - 12);
      if (p.hp <= 0) { p.downed = true; p.downedAt = game.time; }
    }
    events.push({ type: "impact", room: r, angle: Math.atan2(target.z, target.x) });
  }
  return pod.status !== "running" && !players.some(p => !p.aboard && !p.escaped && !p.lost);
}

export function finaleSnapshot(game) {
  const f = game.finale;
  if (!f) return null;
  const pod = f.pod, s = f.station;
  return {
    elapsed: Math.floor(game.time - f.since), creature: { target: f.creature.target }, history: f.history,
    pod: { status: pod.status, phase: pod.phase, dockProgress: pod.dockProgress, reserveIn: Math.max(0, Math.ceil(150 - (game.time - f.since))), braking: pod.input.throttle <= 0.45 && !pod.input.boost && game.time - pod.input.at <= 0.95,
      sealProgress: pod.sealSince === null ? 0 : clamp((game.time - pod.sealSince) / POD_DOCKING.sealSeconds, 0, 1),
      ascentProgress: pod.ascentSince === null ? 0 : clamp((game.time - pod.ascentSince) / POD_DOCKING.liftSeconds, 0, 1), pilot: pod.pilot, progress: pod.progress, lane: pod.lane, speed: pod.speed, hull: Math.max(0, pod.hull), oxygen: pod.oxygen,
      battery: pod.battery, boosting: pod.status === "running" && !!pod.boosting, charges: pod.charges, counterReady: game.time >= pod.counterAt, sonar: game.time < pod.sonarUntil,
      creatureDistance: pod.creatureDistance, pulse: game.time < pod.pulseUntil, repairs: Object.entries(pod.repairs).map(([id, r]) => ({ id, progress: clamp((game.time - r.since) / r.need, 0, 1) })),
      route: pod.route.filter(g => !g.passed).slice(0, 3),
      diversion: pod.diversion && { by: pod.diversion.by, endsIn: Math.ceil(pod.diversion.endsAt - game.time), votes: pod.diversion.votes } },
    station: { status: s.status, power: Math.round(s.power), beacon: s.beacon, capsuleStep: s.capsuleStep, capsulesRemaining: 2 - s.capsulesUsed, collapseIn: Math.max(0, Math.ceil(s.collapseAt - game.time)),
      repair: s.repair && { by: s.repair.by, progress: clamp((game.time - s.repair.since) / s.repair.need, 0, 1) } }
  };
}
