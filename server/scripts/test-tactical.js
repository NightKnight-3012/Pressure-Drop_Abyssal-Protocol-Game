import assert from "node:assert/strict";
import { createGame, tickGame, startHold, cancelHold, repairInput, castVote, tallyVote, remoteDoor, launchDecoy, snapshotGame } from "../game.js";
import { beginFinale, podControl, podAction } from "../finale.js";
import { FINALE_POINTS, POD_ROUTE_LENGTH } from "../../shared/tactical.js";
import { STATIONS, pathBlocked } from "../../shared/layout.js";
import { endingStory } from "../../client/src/epilogue.js";

let checks = 0;
const check = (name, condition) => { assert.ok(condition, name); checks++; console.log(`PASS ${name}`); };
function match(n = 4, mission = "blackout") {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Crew ${i}`, dept: ["engineering", "command", "medical", "eva"][i % 4], connected: true, joinedAt: i, lastPacket: 0 }));
  const game = createGame({ players, now: 100000, seed: 42, mission }); game.nextBreachAt = 1e9; game.lockdown.nextAt = 1e9;
  return { game, players };
}
const place = (p, point) => Object.assign(p, { x: point.x + 0.75, z: point.z, exterior: false });
function advance(m, seconds) {
  const events = [];
  for (let t = 0; t < seconds && m.game.status === "playing"; t += 0.1) {
    for (const p of m.players) p.lastPacket = m.game.lastTick + 100;
    events.push(...tickGame(m.game, m.players, m.game.lastTick + 100));
  }
  return events;
}
function dockAndLift(m) {
  const pod = m.game.finale.pod; pod.route.forEach(g => g.passed = true); pod.progress = POD_ROUTE_LENGTH; pod.lane = 0;
  for (let i = 0; i < 180 && pod.status === "running"; i++) {
    podControl(m.game, m.players, m.players.find(p => p.id === pod.pilot), { steer: 0, throttle: 0.15, boost: false }); advance(m, 0.1);
  }
}
function finale(n = 4) {
  const m = match(n); m.players.slice(0, n > 3 ? n - (n === 8 ? 2 : 1) : n).forEach(p => p.aboard = true);
  beginFinale(m.game, m.players, []); return m;
}

{
  const m = finale(), pod = m.game.finale.pod, pilot = m.players[0];
  pod.progress = POD_ROUTE_LENGTH; pod.route.forEach(g => g.passed = true);
  podControl(m.game, m.players, pilot, { steer: 0, throttle: 1, boost: false }); advance(m, 0.1);
  check("reaching the shaft at speed does not count as escape", pod.phase === "rendezvous" && pod.status === "running" && pod.dockProgress === 0);
  pod.lane = 0.8;
  podControl(m.game, m.players, pilot, { steer: 0, throttle: 0.15, boost: false }); advance(m, 0.1);
  check("off-center braking cannot engage the cradle", pod.dockProgress === 0);
  pod.lane = 0;
  for (let i = 0; i < 12; i++) {
    podControl(m.game, m.players, pilot, { steer: 0, throttle: 0.15, boost: false }); advance(m, 0.1);
  }
  check("centering and braking gradually engages the docking clamps", pod.dockProgress > 0.3 && pod.dockProgress < 1);
  podControl(m.game, m.players, pilot, { steer: 0, throttle: 1, boost: false }); advance(m, 0.1);
  check("accelerating resets an incomplete dock", pod.dockProgress === 0);
  pod.hull = 100; pod.creatureDistance = 65;
  for (let i = 0; i < 32; i++) {
    podControl(m.game, m.players, pilot, { steer: 0, throttle: 0.15, boost: false }); advance(m, 0.1);
  }
  check("three continuous seconds clamp the pod before the shutter closes", pod.phase === "sealing" && pod.status === "running");
  check("clamped pod cannot steer or propose a new diversion", podControl(m.game, m.players, pilot, { steer: 1, throttle: 1, boost: true }) !== null && podAction(m.game, m.players, pilot, "propose", []) !== null);
  advance(m, 2.5);
  check("only the completed shutter seal starts protected recovery", pod.phase === "ascent");
  check("secured lift ignores steering and noisy pod actions", podControl(m.game, m.players, pilot, { steer: 1, throttle: 1, boost: true }) !== null && podAction(m.game, m.players, pilot, "propose", []) !== null);
  const hull = pod.hull, oxygen = pod.oxygen;
  pod.creatureDistance = 4; pod.strikeAt = 0; advance(m, 4);
  check("the sealed shutter physically protects the recovering pod", pod.hull === hull && pod.oxygen === oxygen && pod.status === "running");
  advance(m, 9);
  check("recovery takes time before awarding an escape", pod.status === "escaped" && m.players[0].escaped);
  check("the station survivor remains playable after pod recovery", !m.players[3].lost && !m.players[3].escaped && m.game.status === "playing");
}

{
  const m = finale(), pod = m.game.finale.pod, pilot = m.players[0];
  pod.progress = POD_ROUTE_LENGTH; pod.lane = 0; pod.creatureDistance = 65;
  pod.route.forEach(g => g.passed = true); pod.strikeAt = 1e9;
  podControl(m.game, m.players, pilot, { steer: 0, throttle: 0.15, boost: false }); advance(m, 0.5);
  const progress = pod.dockProgress; advance(m, 0.6);
  check("a brief late packet does not erase docking progress", pod.dockProgress >= progress && pod.phase === "rendezvous");
  advance(m, 3);
  check("lost controls cannot silently finish docking", pod.dockProgress === 0 && pod.phase === "rendezvous");
  for (let i = 0; i < 15; i++) { podControl(m.game, m.players, pilot, { steer: 0, throttle: 0.15, boost: false }); advance(m, 0.1); }
  const aligned = pod.dockProgress; pod.lane = 0.36;
  podControl(m.game, m.players, pilot, { steer: 0, throttle: 0.15, boost: false }); advance(m, 0.1);
  check("a small alignment wobble loses only a little clamp progress", pod.dockProgress > aligned - 0.1 && pod.dockProgress < aligned);
}
{
  const m = finale(), pod = m.game.finale.pod;
  pod.progress = 198; pod.route.forEach(g => g.passed = true);
  podControl(m.game, m.players, m.players[0], { steer: 0, throttle: 1, boost: true }); advance(m, 0.1);
  check("the final approach governs speed and disables boost", pod.phase === "approach" && !pod.boosting && pod.speed <= 2.45);
  pod.phase = "sealing"; pod.sealSince = m.game.time; pod.hull = 5; pod.creatureDistance = 4; pod.strikeAt = 0;
  advance(m, 0.1);
  check("an unsealed shutter does not grant premature invulnerability", pod.status === "lost");
}
{
  const m = finale(), pod = m.game.finale.pod;
  m.game.time = 149.5; pod.phase = "sealing"; pod.sealSince = m.game.time;
  pod.progress = POD_ROUTE_LENGTH; pod.dockProgress = 1; pod.strikeAt = 1e9;
  advance(m, 2.6);
  check("a captured pod can finish sealing after the propulsion window expires", pod.phase === "ascent" && pod.status === "running");
}
for (const n of [1, 2, 3]) {
  const m = finale(n); dockAndLift(m);
  check(`${n}-player crews can complete docking without a station survivor`, m.game.status === "win" && m.players.every(p => p.escaped));
}

{
  const m = match(), p = m.players[0], spec = m.game.calibrations.power;
  place(p, STATIONS.power); startHold(m.game, m.players, p, "power"); advance(m, 5);
  check("timed hold cannot finish an unsafe circuit", !m.game.tasks.power.done && snapshotGame(m.game, m.players).holds[p.id].progress <= 0.88);
  check("prototype names are refused without pollution", repairInput(m.game, p, "__proto__", 1) !== null && Object.prototype.value === undefined);
  check("non-integer calibration is refused", repairInput(m.game, p, "power", 1.5) !== null);
  p.x = 0; p.z = 0; check("calibration cannot be solved remotely", repairInput(m.game, p, "power", 1) !== null);
  place(p, STATIONS.power);
  for (let i = 1; i <= 3; i++) if (spec.target & (1 << (i - 1))) repairInput(m.game, p, "power", i);
  advance(m, 0.1); check("matching the circuit completes a valid elapsed hold", m.game.tasks.power.done);
  place(p, STATIONS.pump); check("pressure accepts a safe valve setting", repairInput(m.game, p, "pump", m.game.calibrations.pump.target) === null && m.game.calibrations.pump.solved);
  check("mission profiles change oxygen and leak conditions", match(4, "silence").game.oxygen === 78 && match(4, "pressure").game.mission === "pressure");
}
{
  const m = match(8); m.game.stage = "vote"; m.game.vote = { k: 2, endsAt: 100, ballots: {}, drafts: {}, result: null };
  for (const p of m.players) castVote(m.game, m.players, p, ["p6"], false);
  advance(m, 1); check("drafts from every player cannot resolve the vote", m.game.stage === "vote" && !Object.keys(m.game.vote.ballots).length);
  check("partial ballots cannot be confirmed", castVote(m.game, m.players, m.players[0], ["p6"], true) !== null);
  for (const p of m.players) castVote(m.game, m.players, p, ["p6", "p7"], true);
  advance(m, 0.1); check("complete confirmed ballots resolve a two-person sacrifice", m.game.stage === "boarding" && m.game.boarding.left.length === 2);
  check("self-selected survivors are recorded as volunteers", m.players[6].volunteered && m.players[7].volunteered);
  place(m.players[6], FINALE_POINTS.board); check("left-behind crew cannot board even at the hatch", startHold(m.game, m.players, m.players[6], "board") !== null && !m.players[6].aboard);
}
{
  const m = match(2); m.game.stage = "boarding"; m.game.boarding = { since: 0, endsAt: 35, left: [] };
  for (const p of m.players) { p.x = 4; p.z = 5; }
  advance(m, 4); check("standing in the pod room does not count as boarding", m.game.stage === "boarding" && m.players.every(p => !p.aboard));
  for (const p of m.players) { place(p, FINALE_POINTS.board); check("using the hatch assigns a physical seat", startHold(m.game, m.players, p, "board") === null); }
  advance(m, 0.1); check("pod launch begins a playable finale rather than ending the match", m.game.stage === "finale" && m.game.status === "playing" && !m.game.outcome);
}
{
  const m = finale(), pod = m.game.finale.pod, pilot = m.players[0], supporter = m.players[1], survivor = m.players[3];
  check("station crew cannot steer the pod", podControl(m.game, m.players, survivor, { steer: 0, throttle: 1, boost: true }) !== null);
  check("non-pilot pod crew cannot steer", podControl(m.game, m.players, supporter, { steer: 0, throttle: 1, boost: true }) !== null);
  check("NaN steering is refused", podControl(m.game, m.players, pilot, { steer: NaN, throttle: 1, boost: true }) !== null);
  check("extreme finite input is bounded", podControl(m.game, m.players, pilot, { steer: 999, throttle: 999, boost: true }) === null && pod.input.steer === 1 && pod.input.throttle === 1);
  advance(m, 0.2); check("boost consumes a finite propulsion reserve", pod.battery < 100 && pod.speed > 2.8);
  pilot.connected = false; advance(m, 0.1); check("disconnection automatically reassigns the pilot", pod.pilot === supporter.id);
  check("malformed pod actions are refused", podAction(m.game, m.players, supporter, "__proto__", []) !== null);
}
{
  const m = finale(), s = m.game.finale.station, survivor = m.players[3];
  place(survivor, FINALE_POINTS.beacon); startHold(m.game, m.players, survivor, "beacon");
  advance(m, 4); check("the beacon spends the capsule's shared power", s.power < 94 && s.beacon);
  check("the creature does not instantly switch to a new beacon", m.game.finale.creature.target === "pod");
  advance(m, 5); check("a sustained beacon draws pursuit toward the station", m.game.finale.creature.target === "station");
  startHold(m.game, m.players, survivor, "beacon"); check("the survivor can stop spending reserve power", !s.beacon);
  place(survivor, FINALE_POINTS.capsule); startHold(m.game, m.players, survivor, "capsule");
  const old = s.power; advance(m, 9); check("capsule repair advances a stage and spends power", s.capsuleStep === 1 && s.power <= old - 12);
  check("capsule repairs produce their own acoustic signal", m.game.finale.creature.noiseStation >= 0.25);
  startHold(m.game, m.players, survivor, "capsule"); survivor.x = 0; survivor.z = 0; advance(m, 0.1);
  check("walking away cancels capsule work", s.repair === null);
  place(survivor, FINALE_POINTS.capsule); s.power = 10; check("insufficient shared power blocks a capsule repair", startHold(m.game, m.players, survivor, "capsule") !== null);
}
{
  const m = finale(), f = m.game.finale, crew = m.players.slice(0, 3);
  f.creature.target = "station"; f.creature.committedAt = -20;
  check("a crew member can propose risking the pod", podAction(m.game, m.players, crew[0], "propose", []) === null);
  advance(m, 0.1); check("one player cannot unilaterally divert a three-person pod", f.history.diversions === 0);
  podAction(m.game, m.players, crew[1], "accept", []); advance(m, 0.1);
  check("majority consent starts a costly distress pulse", f.history.diversions === 1 && f.pod.pulseUntil > m.game.time && f.pod.battery < 75);
  check("distress creates a real competing acoustic signal", f.creature.target === "pod" && f.creature.noisePod >= 8);
  check("diversion cooldown prevents instant repeated proposals", podAction(m.game, m.players, crew[0], "propose", []) !== null);
  check("accepted assistance is recorded per crew member", f.history.podHelpBy[crew[0].id] && f.history.podHelpBy[crew[1].id] && !f.history.podHelpBy[crew[2].id]);
}
{
  const m = finale(), p = m.players[1], pod = m.game.finale.pod;
  pod.hull = 40; pod.oxygen = 50; podAction(m.game, m.players, p, "repair", []); advance(m, 6);
  check("support crew repair real hull and air reserves", pod.hull > 40 && pod.oxygen > 50);
  check("repairs earn support contributions", p.contribution > 0);
  check("repair cooldown limits farming and infinite healing", podAction(m.game, m.players, p, "repair", []) !== null);
  podAction(m.game, m.players, p, "countermeasure", []); check("countermeasures consume a finite charge", pod.charges === 1);
  check("countermeasure cooldown cannot be bypassed", podAction(m.game, m.players, p, "countermeasure", []) !== null);
}
{
  const m = finale(), f = m.game.finale;
  dockAndLift(m);
  check("pod extraction does not end the survivor's game", f.pod.status === "escaped" && m.game.status === "playing" && !m.game.outcome);
  check("escaped pod crew are individually safe", m.players.slice(0, 3).every(p => p.escaped));
  f.station.capsuleStep = 3; place(m.players[3], FINALE_POINTS.capsule); startHold(m.game, m.players, m.players[3], "capsule"); advance(m, 0.1);
  check("a coordinated separate-route escape can save everybody", m.game.status === "win" && m.game.outcome.grade === "full" && m.game.outcome.escaped.length === 4);
  check("capsule survivor receives a distinct ending", endingStory(m.game.outcome, m.players[3].id).title === "ANOTHER WAY UP");
}
{
  const m = finale(); m.game.finale.pod.hull = 0; advance(m, 0.1);
  check("pod destruction does not automatically kill station survivors", m.game.status === "playing" && !m.players[3].lost);
  m.game.finale.station.capsuleStep = 3; place(m.players[3], FINALE_POINTS.capsule); startHold(m.game, m.players, m.players[3], "capsule"); advance(m, 0.1);
  check("the survivor can escape even when the pod is lost", m.game.status === "win" && m.game.outcome.capsules.length === 1 && m.game.outcome.aboard.length === 0);
}
{
  const m = finale(); m.game.rooms.engineering.flood = 3.35; advance(m, 0.1);
  check("station reactor loss does not prematurely resolve an active pod chase", m.game.stage === "finale" && m.game.status === "playing");
  m.game.finale.history.stationHelpBy.p3 = 9; m.game.finale.station.collapseAt = m.game.time;
  advance(m, 0.1); check("station collapse resolves its occupants independently", m.players[3].lost && m.game.finale.pod.status === "running");
  dockAndLift(m);
  check("beacon sacrifice is acknowledged by the ending", m.players[3].ending === "beacon_sacrifice" && endingStory(m.game.outcome, "p3").badge === "Last Signal");
}
{
  const m = finale(); m.game.finale.pod.hull = 0; m.game.finale.station.collapseAt = 0; advance(m, 0.1);
  check("loss on both routes produces a complete defeat", m.game.status === "lose" && m.game.outcome.escaped.length === 0);
}
{
  const m = match(4); beginFinale(m.game, m.players, []); m.game.finale.station.capsuleStep = 3;
  for (const p of m.players) place(p, FINALE_POINTS.capsule);
  check("the first maintenance capsule has one seat", startHold(m.game, m.players, m.players[0], "capsule") === null && m.players[0].escaped);
  check("the second maintenance capsule has one seat", startHold(m.game, m.players, m.players[1], "capsule") === null && m.players[1].escaped);
  check("maintenance capsules cannot replace the whole crew's main pod", startHold(m.game, m.players, m.players[2], "capsule") !== null && !m.players[2].escaped);
}
{
  const m = match(), p = m.players[1]; m.game.tasks.power.done = m.game.tasks.console.done = true;
  place(p, STATIONS.console); remoteDoor(m.game, m.players, p, "engineering", []); advance(m, 2); remoteDoor(m.game, m.players, p, "engineering", []);
  check("door contributions are credited without repeat-toggle farming", p.contribution === 2);
  launchDecoy(m.game, m.players, p, []); check("Command earns credit for a decoy", p.contribution === 5);
  check("physical service passage crosses the shared wall", !pathBlocked(-5.2,-1,-5.2,1));
  check("isolated room closes the physical service passage", pathBlocked(-5.2,-1,-5.2,1,.4,['medical']));
}
{
  const m = finale(), f = m.game.finale, pilot = m.players[0], support = m.players[1];
  podAction(m.game, m.players, support, "repair", []);
  check("support can begin a pod repair", !!f.pod.repairs[support.id]);
  check("support cannot take controls from a connected pilot", podAction(m.game, m.players, support, "pilot", []) !== null);
  podAction(m.game, m.players, pilot, "pilot", []);
  check("handing over controls cancels the new pilot's repair", f.pod.pilot === support.id && !f.pod.repairs[support.id]);
  check("new pilot cannot repair while other crew are aboard", podAction(m.game, m.players, support, "repair", []) !== null);
  podAction(m.game, m.players, pilot, "repair", []);
  support.connected = false; advance(m, 0.1);
  check("automatic pilot replacement cancels the incoming pilot's repair", f.pod.pilot === pilot.id && !f.pod.repairs[pilot.id]);
  podAction(m.game, m.players, m.players[2], "repair", []);
  podAction(m.game, m.players, m.players[2], "repairStop", []);
  check("stopping a repair removes its pending completion", !f.pod.repairs[m.players[2].id]);
}
{
  const m = finale(), p = m.players[3]; place(p, FINALE_POINTS.capsule);
  startHold(m.game, m.players, p, "capsule"); cancelHold(m.game, p.id); advance(m, 9);
  check("releasing a capsule repair cannot complete it later", m.game.finale.station.capsuleStep === 0 && !m.game.finale.station.repair);
  place(p, FINALE_POINTS.beacon); p.exterior = true;
  check("station emergency equipment cannot be operated from outside", startHold(m.game, m.players, p, "beacon") !== null);
}
console.log(`${checks}/${checks} tactical and finale checks passed`);
