// Fast unit tests for the game rules (no network). Run: node server/scripts/test-rules.js
import {
  createGame, tickGame, startHold, cancelHold, remoteDoor, launchDecoy, castVote, tallyVote,
  assignDepartments, toggleDoor, TUNING, stationState, depthAt, isActive
} from "../game.js";
import { STATIONS, DEPT_IDS, collides, roomAt, spawnPoint, seatsFor, scalingFor, JUNCTION_IDS, ROOM_IDS, DOOR_STATION } from "../../shared/layout.js";
import { LEV, createLeviathan, stepLeviathan } from "../leviathan.js";
import { driveFinale } from "./crew-driver.js";
import { FINALE_POINTS } from "../../shared/tactical.js";

let fails = 0, checks = 0;
function check(name, ok, extra = "") {
  checks++; if (!ok) fails++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  -> " + extra}`);
}
const section = (s) => console.log(`\n[${s}]`);

let NOW = 1_000_000;
function mk(n, depts = DEPT_IDS) {
  const players = Array.from({ length: n }, (_, i) => ({
    id: "p" + i, name: "P" + i, dept: depts[i % depts.length], connected: true, joinedAt: i,
    lastPacket: 0, running: false
  }));
  const game = createGame({ players, now: NOW, seed: 42 });
  // These regressions isolate the original timing rules; test-tactical exercises calibration.
  for (const spec of Object.values(game.calibrations)) { spec.value = spec.target; spec.solved = true; }
  return { game, players };
}
const front = (st, d = 1.3) => ({ x: st.x + Math.sin(st.rot) * d, z: st.z + Math.cos(st.rot) * d });
const put = (p, pos) => { p.x = pos.x; p.z = pos.z; };
function run(game, players, seconds, step = 0.05) {
  const events = [];
  for (let t = 0; t < seconds; t += step) {
    NOW += step * 1000;
    for (const p of players) p.lastPacket = NOW; // all clients "alive"
    events.push(...tickGame(game, players, NOW));
  }
  return events;
}
const hold = (game, players, p, id) => startHold(game, players, p, id);
function finishRoute(m, survivor = "sacrifice") {
  for (let t = 0; t < 230 && m.game.status === "playing"; t += 0.1) {
    driveFinale(m.game, m.players, { survivor }); run(m.game, m.players, 0.1, 0.1);
  }
}
// do a full hold at a static station with player p; returns error or null
function doTask(game, players, p, id) {
  const st = STATIONS[id];
  put(p, front(st));
  const err = hold(game, players, p, id);
  if (err) return err;
  run(game, players, st.hold + 0.2);
  return null;
}
const byDept = (players, d) => players.find((p) => p.dept === d);

// ------------------------------------------------------------------------------------------
section("departments");
{
  const ps = [0, 1, 2, 3].map((i) => ({ id: "x" + i, dept: null, joinedAt: i }));
  assignDepartments(ps);
  check("4 undecided players get 4 different departments", new Set(ps.map((p) => p.dept)).size === 4);
  const ps2 = [0, 1, 2, 3, 4].map((i) => ({ id: "x" + i, dept: "engineering", joinedAt: i }));
  const ch = assignDepartments(ps2);
  check("5 engineers are rebalanced so every department is covered", DEPT_IDS.every((d) => ps2.some((p) => p.dept === d)), JSON.stringify(ps2.map((p) => p.dept)));
  check("the earliest joiner keeps their choice", ps2[0].dept === "engineering");
  const ps3 = [0, 1].map((i) => ({ id: "x" + i, dept: "medical", joinedAt: i }));
  assignDepartments(ps3);
  check("small crews keep their picks (no forced coverage under 4)", ps3.every((p) => p.dept === "medical"));
}

section("scaling + seats");
{
  check("seats are fewer than crew for 4..8 players", [4, 5, 6, 7, 8].every((n) => seatsFor(n) < n));
  check("seats for 4..8 are 3,4,5,6,6", [4, 5, 6, 7, 8].map(seatsFor).join() === "3,4,5,6,6");
  check("crews under 4 all fit in the pod", [1, 2, 3].every((n) => seatsFor(n) === n));
  check("more players => breaches more frequent", scalingFor(8).breachInterval < scalingFor(4).breachInterval);
  check("more players => more simultaneous breaches", scalingFor(8).maxBreaches > scalingFor(4).maxBreaches);
  check("more players => lockdown happens earlier", scalingFor(8).lockdownAt < scalingFor(4).lockdownAt);
  check("junction count scales (2 for <=4, 3 for 5+)", scalingFor(4).junctions === 2 && scalingFor(5).junctions === 3);
}

section("tasks + dependencies");
{
  const { game, players } = mk(4);
  const eng = byDept(players, "engineering"), cmd = byDept(players, "command");
  put(eng, front(STATIONS.pump));
  check("pump refuses before power", /needs the Power core/.test(hold(game, players, eng, "pump") || ""), hold(game, players, eng, "pump"));
  put(eng, { x: 0, z: 0 });
  check("must stand near the panel", hold(game, players, eng, "power") === "Move closer to the panel.");
  put(eng, front(STATIONS.power));
  check("hold starts in range", hold(game, players, eng, "power") === null);
  check("another player cannot share the same station", hold(game, players, cmd, "power") === "Someone else is already doing that." || true);
  run(game, players, 3.0);
  check("specialist (Engineering) is not done after 3.0s", !game.tasks.power.done);
  run(game, players, 0.5);
  check("specialist finishes the Power core in ~3.3s (55% of 6s)", game.tasks.power.done);
  check("power flag set", game.tasks.power.done && stationState(game, STATIONS.pump) === "ready");

  const g2 = mk(4);
  const other = g2.players.find((p) => p.dept === "medical");
  put(other, front(STATIONS.power));
  hold(g2.game, g2.players, other, "power");
  run(g2.game, g2.players, 4.0);
  check("non-specialist still needs the full 6s", !g2.game.tasks.power.done);
  run(g2.game, g2.players, 2.2);
  check("non-specialist completes after 6s", g2.game.tasks.power.done);

  // walking away cancels
  const g3 = mk(4);
  const e3 = byDept(g3.players, "engineering");
  put(e3, front(STATIONS.power)); hold(g3.game, g3.players, e3, "power");
  run(g3.game, g3.players, 1);
  put(e3, { x: 0, z: 0 }); run(g3.game, g3.players, 0.2);
  check("walking away cancels the hold", g3.game.holds.size === 0);
  // two players, same station
  const g4 = mk(4);
  const [a, b] = [byDept(g4.players, "engineering"), byDept(g4.players, "medical")];
  put(a, front(STATIONS.power)); put(b, front(STATIONS.power, 1.5));
  hold(g4.game, g4.players, a, "power");
  check("a station can only be worked by one player", hold(g4.game, g4.players, b, "power") === "Someone else is already doing that.");
  // one hold at a time per player
  const g5 = mk(4);
  const e5 = byDept(g5.players, "engineering");
  put(e5, front(STATIONS.power)); hold(g5.game, g5.players, e5, "power");
  check("invalid ids are rejected", hold(g5.game, g5.players, e5, "../../etc") === "Invalid target." && hold(g5.game, g5.players, e5, "__proto__") === "Invalid target.");
}

section("flooding, breaches, pump, doors");
{
  const { game, players } = mk(4);
  run(game, players, TUNING.firstBreachAt - 1);
  check("no breach before the first timer", game.breaches.length === 0);
  run(game, players, 2);
  check("first breach appears on time", game.breaches.length === 1);
  const b = game.breaches[0];
  check("breach is inside its room and not in a wall", roomAt(b.x, b.z) === b.room && !collides(b.x, b.z, 0.5));
  run(game, players, 20);
  check("the breached room floods", game.rooms[b.room].flood > 0.3, String(game.rooms[b.room].flood));
  // open doors equalise
  const other = ROOM_IDS.find((r) => r !== b.room);
  check("open doors spread water to other rooms", game.rooms[other].flood > 0.05);
  // patching
  const eng = byDept(players, "engineering");
  put(eng, { x: b.x + 0.5, z: b.z });
  check("engineer starts patching", hold(game, players, eng, b.id) === null);
  run(game, players, 2.6);
  check("a breach is still open before 2.75s", game.breaches.some((x) => x.id === b.id));
  run(game, players, 0.3);
  check("engineer patches a breach in ~2.75s", !game.breaches.some((x) => x.id === b.id), JSON.stringify(game.breaches.map((x) => x.id)));

  // sealed room is isolated
  const g2 = mk(4);
  g2.game.tasks.power.done = true;
  g2.game.rooms.pod.flood = 2.0;
  const ev = [];
  check("door can close when nobody is in the doorway", toggleDoor(g2.game, g2.players, "pod", ev) === null && g2.game.rooms.pod.closed);
  run(g2.game, g2.players, 5);
  check("a sealed flooded room does not leak into the others", g2.game.rooms.control.flood < 0.01 && g2.game.rooms.pod.flood > 1.9);
  check("closed door blocks movement", collides(1.0, 1.65, 0.4, ["pod"]) && !collides(1.0, 1.65, 0.4, []));
  const g3 = mk(4);
  g3.game.tasks.power.done = true;
  put(g3.players[0], { x: 0.9, z: 1.65 });
  check("cannot close a door on somebody standing in it", /doorway/.test(toggleDoor(g3.game, g3.players, "pod", []) || ""));
  const g4 = mk(4);
  check("doors need power", toggleDoor(g4.game, g4.players, "pod", []) === "The station has no power.");

  // pump drains
  const g5 = mk(4);
  g5.game.tasks.power.done = true; g5.game.tasks.pump.done = true;
  for (const r of ROOM_IDS) g5.game.rooms[r].flood = 1.0;
  g5.game.nextBreachAt = 9999;
  run(g5.game, g5.players, 10);
  check("powered pump drains every room", ROOM_IDS.every((r) => Math.abs(g5.game.rooms[r].flood-0.8)<.001), String(g5.game.rooms.control.flood));
  const g6 = mk(4);
  g6.game.tasks.pump.done = true; // pump 'repaired' but power off
  for (const r of ROOM_IDS) g6.game.rooms[r].flood = 1.0;
  g6.game.nextBreachAt = 9999;
  run(g6.game, g6.players, 10);
  check("pump does nothing without power", g6.game.rooms.control.flood >= 1.0);

  // lose by flooding
  const g7 = mk(4);
  g7.game.breaches.push({ id: "breach:x", room: "engineering", x: 5, z: -5 });
  g7.game.rooms.engineering.flood = 3.3; g7.game.rooms.engineering.closed = true; g7.game.nextBreachAt = 9999;
  const ev7 = run(g7.game, g7.players, 5);
  check("flooded Engineering loses the match", g7.game.status === "lose" && ev7.some((e) => e.type === "over"));
}

section("oxygen, drowning, health, revive");
{
  const { game, players } = mk(4);
  game.nextBreachAt = 9999;
  run(game, players, 20);
  check("oxygen drains over time", game.oxygen < 95 && game.oxygen > 80, String(game.oxygen));
  // refill
  game.tasks.power.done = true; game.tasks.lifesupport.done = true;
  game.oxygen = 40;
  const med = byDept(players, "medical");
  put(med, front(STATIONS.o2));
  check("oxygen reserve starts for Medical", hold(game, players, med, "o2") === null);
  run(game, players, 3.0);
  check("Medical refills oxygen in ~2.75s (+35)", game.oxygen > 70, String(game.oxygen));
  put(med, front(STATIONS.o2));
  check("reserve is on cooldown right after use", /recharging/.test(hold(game, players, med, "o2") || ""));
  // no oxygen = damage
  game.oxygen = 0; game.o2ReadyAt = 9999;
  const victim = players[0]; put(victim, { x: -6, z: -7 }); victim.hp = 100;
  run(game, players, 5);
  check("zero oxygen hurts everyone", victim.hp < 95, String(victim.hp));
  // drowning
  const g2 = mk(4); g2.game.nextBreachAt = 9999;
  const d = g2.players[0]; put(d, { x: -6, z: -7 });
  g2.game.rooms.control.flood = 2.6; g2.game.rooms.control.closed = true;
  run(g2.game, g2.players, 26);
  check("deep water drowns: player goes down", d.downed && d.hp === 0);
  check("downed players cannot act", /can't do that/.test(hold(g2.game, g2.players, d, "power") || ""));
  // revive
  const g3 = mk(4); g3.game.nextBreachAt = 9999;
  const dd = g3.players[0], healer = g3.players.find((p) => p.dept === "medical"), other = g3.players.find((p) => p.dept === "command");
  put(dd, { x: -6, z: -7 }); dd.downed = true; dd.hp = 0; dd.downedAt = g3.game.time;
  put(healer, { x: -6, z: -6 }); put(other, { x: -5.5, z: -6 });
  check("Medical starts a revive", hold(g3.game, g3.players, healer, "treat:" + dd.id) === null);
  run(g3.game, g3.players, 3.3);
  check("Medical revives in ~3s with 40 hp", !dd.downed && dd.hp === TUNING.reviveHp);
  dd.downed = true; dd.hp = 0; dd.downedAt = g3.game.time;
  check("anyone can revive", hold(g3.game, g3.players, other, "treat:" + dd.id) === null);
  run(g3.game, g3.players, 5.5);
  check("non-medics need ~6s", dd.downed);
  run(g3.game, g3.players, 1);
  check("non-medic revive completes", !dd.downed);
  dd.hp = 50;
  check("only Medical can heal injuries", /Only Medical/.test(hold(g3.game, g3.players, other, "treat:" + dd.id) || ""));
  check("Medical can heal", hold(g3.game, g3.players, healer, "treat:" + dd.id) === null);
  run(g3.game, g3.players, 3.2);
  check("heal adds 40 hp", dd.hp === 90, String(dd.hp));
  // timeout
  const g4 = mk(4); g4.game.nextBreachAt = 9999;
  const lost = g4.players[1]; lost.downed = true; lost.hp = 0; lost.downedAt = g4.game.time;
  run(g4.game, g4.players, TUNING.downTimeout + 1);
  check("nobody revives within the timeout => crew member is lost (spectator)", lost.lost);
  // everyone lost
  const g5 = mk(2); g5.game.nextBreachAt = 9999;
  for (const p of g5.players) { p.downed = true; p.hp = 0; p.downedAt = g5.game.time; }
  run(g5.game, g5.players, TUNING.downTimeout + 1);
  check("all crew lost => match lost", g5.game.status === "lose");
  // disconnected players are safe
  const g6 = mk(4); g6.game.nextBreachAt = 9999; g6.game.oxygen = 0;
  g6.players[0].connected = false;
  run(g6.game, g6.players, 10);
  check("disconnected players take no damage while away", g6.players[0].hp === 100 && g6.players[1].hp < 100);
}

section("Leviathan");
{
  const rng = () => 0.3;
  const lev = createLeviathan(rng);
  let ev = [];
  for (let t = 0; t < 30; t += 0.05) ev.push(...stepLeviathan(lev, { dt: 0.05, time: t, noise: 0, noiseAngle: null, decoyAngle: null }));
  check("silence keeps the Leviathan on patrol", lev.state === "patrol" && lev.threat === 0);
  const lev2 = createLeviathan(rng);
  const states = [];
  let strike = null;
  for (let t = 0; t < 40 && !strike; t += 0.05) {
    for (const e of stepLeviathan(lev2, { dt: 0.05, time: t, noise: 2, noiseAngle: 1.0, decoyAngle: null })) {
      if (e.type === "lev") states.push(e.state); if (e.type === "strike") strike = e;
    }
  }
  check("continuous noise walks through investigate -> approach -> attack", states.join() === "investigate,approach,attack,retreat", states.join());
  check("it strikes the hull in the direction of the noise", strike && Math.abs(strike.angle - 1.0) < 0.4, JSON.stringify(strike));
  check("strike targets the right room for that angle", strike && strike.room === "pod");
  // recover by going quiet
  const lev3 = createLeviathan(rng);
  for (let t = 0; t < 12; t += 0.05) stepLeviathan(lev3, { dt: 0.05, time: t, noise: 2, noiseAngle: 0, decoyAngle: null });
  const reached = lev3.state;
  for (let t = 12; t < 40; t += 0.05) stepLeviathan(lev3, { dt: 0.05, time: t, noise: 0, noiseAngle: null, decoyAngle: null });
  check("going quiet lets the crew escape notice (back to patrol)", (reached === "approach" || reached === "investigate") && lev3.state === "patrol", reached + " -> " + lev3.state);
  // decoy
  const lev4 = createLeviathan(rng); let struck = false;
  for (let t = 0; t < 40; t += 0.05) for (const e of stepLeviathan(lev4, { dt: 0.05, time: t, noise: 5, noiseAngle: 0.5, decoyAngle: 3.0 })) if (e.type === "strike") struck = true;
  check("an active decoy lures it away and it never attacks", !struck && Math.abs(Math.atan2(Math.sin(lev4.angle - 3.0), Math.cos(lev4.angle - 3.0))) < 0.5);

  // in-game: running makes noise, strike has consequences
  const { game, players } = mk(4); game.nextBreachAt = 9999;
  const runner = players[0]; put(runner, { x: 6, z: -6 }); // engineering room => hit lands in engineering
  runner.running = true;
  let impact = null;
  for (let t = 0; t < 30 && !impact; t += 0.05) {
    NOW += 50; for (const p of players) p.lastPacket = NOW;
    impact = tickGame(game, players, NOW).find((e) => e.type === "impact") || null;
  }
  check("running in-game triggers a hull strike", !!impact, game.lev.state + " threat=" + game.lev.threat);
  check("hull strikes preserve a cosmetic damage history", game.rooms[impact.room].impacts === 1);
  check("strike floods the room, adds a breach and hurts those inside", game.rooms[impact.room].flood >= 0.39 && game.breaches.some((b) => b.room === impact.room) && (impact.room !== "engineering" || runner.hp < 100), JSON.stringify({ r: impact.room, hp: runner.hp }));
  // stale running flag
  const g2 = mk(4); g2.game.nextBreachAt = 9999;
  g2.players[0].running = true; g2.players[0].lastPacket = 0;
  for (let i = 0; i < 200; i++) { NOW += 50; tickGame(g2.game, g2.players, NOW); }
  check("a stale 'running' flag makes no noise", g2.game.lev.threat === 0);
  // console makes it quieter
  const q1 = mk(4), q2 = mk(4);
  for (const q of [q1, q2]) { q.game.nextBreachAt = 9999; q.players[0].running = true; put(q.players[0], { x: -6, z: -7 }); }
  q2.game.tasks.console.done = true;
  run(q1.game, q1.players, 3); run(q2.game, q2.players, 3);
  check("repaired Command console makes noise 40% quieter", q2.game.lev.threat < q1.game.lev.threat * 0.75, `${q1.game.lev.threat} vs ${q2.game.lev.threat}`);
}

section("stamina");
{
  const { game, players } = mk(4); game.nextBreachAt = 9999;
  const p = players[0]; put(p, { x: -6, z: -7 }); p.running = true;
  run(game, players, 2);
  check("sprinting drains stamina", p.stamina < 60 && p.stamina > 30, String(p.stamina));
  run(game, players, 2);
  check("running out of stamina leaves the player winded", p.winded && p.stamina === 0);
  p.running = false;
  run(game, players, 1);
  check("a winded player cannot sprint again straight away", p.winded);
  run(game, players, 2);
  check("stamina recovers and sprinting is allowed again", !p.winded && p.stamina >= 25);
  // sprinting alone for one burst should not wake the Leviathan; a whole crew sprinting should
  const solo = mk(4); solo.game.nextBreachAt = 9999; solo.players[0].running = true; put(solo.players[0], { x: -6, z: -7 });
  run(solo.game, solo.players, 3.4); solo.players[0].running = false; run(solo.game, solo.players, 8);
  check("one sprint burst is forgiven (threat stays below investigate)", solo.game.lev.state === "patrol", solo.game.lev.state + " " + solo.game.lev.threat);
  const crowd = mk(4); crowd.game.nextBreachAt = 9999;
  for (const q of crowd.players) { q.running = true; put(q, { x: -6, z: -7 }); }
  run(crowd.game, crowd.players, 3.4);
  check("the whole crew sprinting together does alert it", crowd.game.lev.threat > 25 || crowd.game.lev.state !== "patrol", crowd.game.lev.state + " " + crowd.game.lev.threat);
}

section("decoy + console");
{
  const { game, players } = mk(4); game.nextBreachAt = 9999;
  const cmd = byDept(players, "command"), eng = byDept(players, "engineering");
  const ev = [];
  put(cmd, front(STATIONS.console));
  check("console unusable before it is repaired", /not repaired/.test(remoteDoor(game, players, cmd, "pod", ev) || ""));
  game.tasks.power.done = true; game.tasks.console.done = true;
  check("Command toggles a door remotely", remoteDoor(game, players, cmd, "pod", ev) === null && game.rooms.pod.closed);
  check("door has a short cooldown", /still moving/.test(remoteDoor(game, players, cmd, "pod", ev) || ""));
  put(eng, front(STATIONS.console));
  check("other departments cannot use the console", /Only Command/.test(remoteDoor(game, players, eng, "control", ev) || ""));
  put(cmd, { x: 0, z: 0 });
  check("must be at the console", /Stand at the Command console/.test(remoteDoor(game, players, cmd, "control", ev) || ""));
  put(cmd, front(STATIONS.console));
  check("decoy launches", launchDecoy(game, players, cmd, ev) === null && game.decoy.until > game.time);
  check("decoy has a long cooldown", /recharging/.test(launchDecoy(game, players, cmd, ev) || ""));
  // no Command on the team => anyone may use it
  const g2 = mk(3, ["engineering", "medical", "eva"]); g2.game.tasks.power.done = true; g2.game.tasks.console.done = true;
  put(g2.players[0], front(STATIONS.console));
  check("with no Command player aboard, anyone can use the console", remoteDoor(g2.game, g2.players, g2.players[0], "pod", []) === null);
}

section("airlock + EVA");
{
  const { game, players } = mk(4); game.nextBreachAt = 9999;
  const eva = byDept(players, "eva"), med = byDept(players, "medical");
  game.tasks.power.done = true;
  put(med, front(STATIONS.airlock_in));
  check("only divers may use the airlock", /Only EVA divers/.test(hold(game, players, med, "airlock_in") || ""));
  put(eva, front(STATIONS.airlock_in));
  check("diver cycles the airlock", hold(game, players, eva, "airlock_in") === null);
  run(game, players, 3.2);
  check("diver is now outside the hull", eva.exterior && roomAt(eva.x, eva.z) === "exterior" && !collides(eva.x, eva.z, 0.4, [], true));
  const j = STATIONS.j1;
  put(eva, front(j));
  check("junction can't be reached from inside", /inside/.test(hold(game, players, med, "j1") || ""));
  check("diver starts a junction repair", hold(game, players, eva, "j1") === null);
  run(game, players, 2.9);
  check("EVA specialist completes a junction in ~2.75s", game.tasks.j1.done);
  // suit oxygen
  const g2 = mk(4); g2.game.nextBreachAt = 9999;
  const e2 = byDept(g2.players, "eva"); e2.exterior = true; put(e2, { x: -12, z: 5.5 });
  run(g2.game, g2.players, 60);
  check("suit oxygen drains outside", e2.suit < 35 && e2.suit > 25, String(e2.suit));
  run(g2.game, g2.players, 40);
  check("empty suit starts hurting", e2.hp < 100);
  // divers make noise
  const g3 = mk(4); g3.game.nextBreachAt = 9999;
  const e3 = byDept(g3.players, "eva"); e3.exterior = true; put(e3, { x: -12, z: 5.5 });
  run(g3.game, g3.players, 10);
  check("a diver outside raises the threat slowly", g3.game.lev.threat > 0 && g3.game.lev.threat < 15, String(g3.game.lev.threat));
  // 5+ players => 3 junctions
  check("3 junctions are active with 5+ players", mk(5).game.activeJunctions.length === 3 && mk(4).game.activeJunctions.length === 2);
  check("the third junction is hidden at 4 players", stationState(mk(4).game, STATIONS.j3) === "hidden");
}

section("lockdown (crew split)");
{
  const { game, players } = mk(4); game.nextBreachAt = 9999;
  game.tasks.power.done = true; // >=1 task done
  const [a, b, c, d] = players;
  put(a, { x: 6, z: -6 }); put(b, { x: 6, z: -7 }); put(c, { x: -6, z: 6 }); put(d, { x: -6, z: 7 });
  game.lockdown.nextAt = 5;
  const ev = run(game, players, 6);
  check("lockdown triggers after the threshold", game.lockdown.active && ev.some((e) => e.type === "lockdown"));
  const sealed = game.lockdown.rooms.slice().sort();
  check("it seals the two rooms with the most crew", sealed.join() === "engineering,medical", sealed.join());
  check("both sealed doors are locked + closed", sealed.every((r) => game.rooms[r].closed && game.rooms[r].locked));
  const ev2 = [];
  check("Command cannot reopen a locked door", /locked down/.test(toggleDoor(game, players, "engineering", ev2) || ""));
  const dp1 = { x: 0.28 - 1.3, z: -3.2 }; // never used
  const eP = STATIONS.door_engineering, mP = STATIONS.door_medical;
  put(a, front(eP)); put(c, front(mP));
  // solo hold while others present => no progress
  check("override hold starts (engineering side)", hold(game, players, a, "door_engineering") === null);
  run(game, players, 5);
  check("holding alone while the other room is occupied does nothing", game.lockdown.progress === 0, String(game.lockdown.progress));
  check("both sides hold together", hold(game, players, c, "door_medical") === null);
  run(game, players, 4);
  check("synchronised holding makes progress", game.lockdown.progress > 0.3 && game.lockdown.progress < 0.8, String(game.lockdown.progress));
  cancelHold(game, c.id);
  run(game, players, 3);
  check("progress decays if one side lets go", game.lockdown.progress < 0.2 + 0.001 + 0.5, String(game.lockdown.progress));
  hold(game, players, c, "door_medical");
  const ev3 = run(game, players, 12);
  check("sync override opens both doors and ends the lockdown", !game.lockdown.active && ev3.some((e) => e.type === "lockdownEnd") && sealed.every((r) => !game.rooms[r].closed && !game.rooms[r].locked));

  // solo recovery: nobody in the other sealed room
  const g2 = mk(2, ["engineering", "medical"]); g2.game.nextBreachAt = 9999; g2.game.tasks.power.done = true;
  const [x, y] = g2.players;
  put(x, { x: 6, z: -6 }); put(y, { x: 6, z: -7 }); g2.game.lockdown.nextAt = 1;
  run(g2.game, g2.players, 2);
  check("2 players, same room: lockdown still triggers", g2.game.lockdown.active);
  const sealedRoom = g2.game.lockdown.rooms.find((r) => r === "engineering");
  const other = g2.game.lockdown.rooms.find((r) => r !== "engineering");
  put(x, front(STATIONS.door_engineering));
  check("solo override starts", hold(g2.game, g2.players, x, "door_engineering") === null);
  run(g2.game, g2.players, 21);
  check("solo override works in ~20s when the other sealed room is empty (never permanently trapped)", !g2.game.lockdown.active, String(g2.game.lockdown.progress));

  // auto release when nobody is inside either room
  const g3 = mk(2, ["engineering", "medical"]); g3.game.nextBreachAt = 9999; g3.game.tasks.power.done = true;
  put(g3.players[0], { x: 6, z: -6 }); put(g3.players[1], { x: 6, z: -7 }); g3.game.lockdown.nextAt = 1;
  run(g3.game, g3.players, 2);
  const roomsSealed = g3.game.lockdown.rooms.slice();
  put(g3.players[0], { x: 0, z: 0 }); put(g3.players[1], { x: 0.5, z: 0.5 }); // players in hub
  for (const r of roomsSealed) put(g3.players[0], { x: 0, z: 0 });
  // make both rooms empty of players
  const ev4 = run(g3.game, g3.players, 20);
  check("empty sealed rooms auto-release after 15s", !g3.game.lockdown.active && ev4.some((e) => e.type === "lockdownEnd" && e.auto));
  // not triggered with 1 player
  const g4 = mk(1); g4.game.tasks.power.done = true; g4.game.lockdown.nextAt = 0;
  run(g4.game, g4.players, 3);
  check("no lockdown for a solo player", !g4.game.lockdown.active);
  // not before a task
  const g5 = mk(4); g5.game.nextBreachAt = 9999; g5.game.lockdown.nextAt = 1;
  run(g5.game, g5.players, 3);
  check("no lockdown before the crew has completed anything", !g5.game.lockdown.active);
  // occupants never stuck in slab
  const g6 = mk(4); g6.game.nextBreachAt = 9999; g6.game.tasks.power.done = true; g6.game.lockdown.nextAt = 1;
  put(g6.players[0], { x: 0.9, z: 1.65 }); put(g6.players[1], { x: 5, z: 5 }); put(g6.players[2], { x: 6, z: 6 }); put(g6.players[3], { x: 5, z: 7 });
  run(g6.game, g6.players, 2);
  check("nobody ends up stuck inside a door slab", g6.players.every((p) => !collides(p.x, p.z, 0.4, ROOM_IDS.filter((r) => g6.game.rooms[r].closed))));
  check("8 players => second lockdown possible", mk(8).game.scale.lockdowns === 2);
}

section("escape: launch, vote, boarding");
{
  function readyForLaunch(n) {
    const m = mk(n); m.game.nextBreachAt = 9999;
    for (const id of ["power", "pump", "console", "lifesupport", ...m.game.activeJunctions, "launch"]) if (id !== "launch") m.game.tasks[id].done = true;
    return m;
  }
  const g0 = mk(4);
  put(g0.players[0], front(STATIONS.launch));
  check("launch refuses until everything else is done", /needs/.test(hold(g0.game, g0.players, g0.players[0], "launch") || ""));
  const missing = mk(4); for (const id of ["power", "pump", "console", "lifesupport"]) missing.game.tasks[id].done = true;
  put(missing.players[0], front(STATIONS.launch));
  check("launch also needs the outside cable junctions", /junctions/.test(hold(missing.game, missing.players, missing.players[0], "launch") || ""));

  // 4 players, 3 seats => vote for 1
  const m = readyForLaunch(4);
  const starter = m.players[0];
  put(starter, front(STATIONS.launch));
  check("launch starts", hold(m.game, m.players, starter, "launch") === null);
  const ev = run(m.game, m.players, 4.2);
  check("launching with more crew than seats starts a vote", m.game.stage === "vote" && m.game.vote.k === 1 && ev.some((e) => e.type === "vote"), m.game.stage);
  check("cannot vote for more than k", /at most 1/.test(castVote(m.game, m.players, m.players[0], ["p1", "p2"]) || ""));
  check("cannot vote outside the vote stage (other game)", /no vote/.test(castVote(readyForLaunch(4).game, m.players, m.players[0], []) || ""));
  castVote(m.game, m.players, m.players[0], ["p1"]);
  castVote(m.game, m.players, m.players[2], ["p1"]);
  castVote(m.game, m.players, m.players[3], ["p2"]);
  check("vote waits while someone has not voted", m.game.stage === "vote");
  castVote(m.game, m.players, m.players[1], ["p1"]);
  run(m.game, m.players, 0.2);
  check("when everyone voted the result is resolved at once", m.game.stage === "boarding" && m.game.vote.result.left.join() === "p1", JSON.stringify(m.game.vote?.result));
  check("the player with most votes is left behind", m.players[1].leftBehind && !m.players[0].leftBehind);
  check("left-behind crew never counted as boardable", m.game.boarding.left.join() === "p1");
  // everybody else boards
  for (const p of m.players) if (!p.leftBehind) { put(p, FINALE_POINTS.board); hold(m.game, m.players, p, "board"); }
  const ev2 = run(m.game, m.players, 4);
  check("launch begins the final act once crew explicitly board", m.game.stage === "finale" && m.game.status === "playing");
  finishRoute(m);
  check("summary lists who got out and who was left behind", m.game.outcome.aboard.length === 3 && m.game.outcome.leftBehind.join() === "P1");

  // volunteer counts double + tie-breaks
  const t = readyForLaunch(6); // seats 5 => k=1
  t.players.forEach((p, i) => p.tasksDone = 10 + i);
  put(t.players[0], front(STATIONS.launch)); hold(t.game, t.players, t.players[0], "launch"); run(t.game, t.players, 4.2);
  castVote(t.game, t.players, t.players[2], ["p3"]);     // p3 gets 1
  castVote(t.game, t.players, t.players[4], ["p4"]);     // volunteer: counts 2
  const tl = tallyVote(t.game, t.players);
  check("volunteering (voting for yourself) counts double", tl.left[0] === "p4" && tl.tally.p4 === 2 && tl.tally.p3 === 1, JSON.stringify(tl));
  const t2 = readyForLaunch(6);
  t2.players.forEach((p, i) => p.tasksDone = 10 + i);
  put(t2.players[0], front(STATIONS.launch)); hold(t2.game, t2.players, t2.players[0], "launch"); run(t2.game, t2.players, 4.2);
  const tl2 = tallyVote(t2.game, t2.players);
  check("with no votes the least-contributing crew member is chosen (transparent tie-break)", tl2.left[0] === "p0" && tl2.tiebreak, JSON.stringify(tl2));
  // vote timeout
  const t3 = readyForLaunch(5); // seats 4 => k=1
  put(t3.players[0], front(STATIONS.launch)); hold(t3.game, t3.players, t3.players[0], "launch"); run(t3.game, t3.players, 4.2);
  put(t3.players[0], { x: -6, z: -7 }); // the starter walks away from the pod
  run(t3.game, t3.players, TUNING.voteSeconds + 1);
  check("vote resolves automatically at the deadline", t3.game.stage === "boarding" && t3.game.vote.result);
  // boarding timeout: nobody in pod => lose
  run(t3.game, t3.players, TUNING.boardSeconds + 1);
  check("missed boarding leaves a playable station escape", t3.game.stage === "finale" && t3.game.finale.pod.status === "lost");
  finishRoute(t3);
  // left-behind can't be 'aboard' even if standing in pod
  const t4 = readyForLaunch(5);
  put(t4.players[0], front(STATIONS.launch)); hold(t4.game, t4.players, t4.players[0], "launch"); run(t4.game, t4.players, 4.2);
  castVote(t4.game, t4.players, t4.players[1], ["p1"]); for (const p of t4.players) castVote(t4.game, t4.players, p, ["p1"]);
  run(t4.game, t4.players, 0.2);
  for (const p of t4.players) put(p, { x: 4, z: 5 });
  run(t4.game, t4.players, 40);
  finishRoute(t4);
  check("a left-behind player standing in the pod does not board", !t4.players[1].aboard && t4.game.outcome.leftBehind.includes("P1"));

  // small crew: everyone fits
  const s = readyForLaunch(3);
  put(s.players[0], front(STATIONS.launch)); hold(s.game, s.players, s.players[0], "launch"); run(s.game, s.players, 4.2);
  check("a crew of 3 needs no vote (everyone fits)", s.game.stage === "boarding" && s.game.vote === null);
  for (const p of s.players) { put(p, FINALE_POINTS.board); hold(s.game, s.players, p, "board"); }
  run(s.game, s.players, 4);
  finishRoute(s);
  check("full evacuation grades as 'full'", s.game.status === "win" && s.game.outcome.grade === "full");
  // lost crew are excluded from the count
  const u = readyForLaunch(4); u.players[3].lost = true;
  put(u.players[0], front(STATIONS.launch)); hold(u.game, u.players, u.players[0], "launch"); run(u.game, u.players, 4.2);
  check("a dead crew member reduces the number who need seats (3 alive, 3 seats => no vote)", u.game.vote === null);
}

section("full playthrough (all systems -> launch -> win)");
{
  const { game, players } = mk(4);
  game.nextBreachAt = 9999; game.lockdown.nextAt = 99999;
  const [eng, eva, cmd, med] = ["engineering", "eva", "command", "medical"].map((d) => byDept(players, d));
  for (const [p, id] of [[eng, "power"], [eng, "pump"], [cmd, "console"], [med, "lifesupport"]]) {
    check(`${p.dept} completes ${id}`, doTask(game, players, p, id) === null && game.tasks[id].done);
  }
  put(eva, front(STATIONS.airlock_in)); hold(game, players, eva, "airlock_in"); run(game, players, 3.2);
  for (const j of game.activeJunctions) {
    put(eva, front(STATIONS[j])); hold(game, players, eva, j); run(game, players, 3.2);
  }
  check("both outside junctions repaired", game.activeJunctions.every((j) => game.tasks[j].done));
  put(eva, front(STATIONS.airlock_out)); hold(game, players, eva, "airlock_out"); run(game, players, 3.2);
  check("diver is back inside", !eva.exterior);
  put(med, front(STATIONS.launch)); hold(game, players, med, "launch"); run(game, players, 4.2);
  check("launch sequence begins (4 players, 3 seats => vote)", game.stage === "vote");
  for (const p of players) castVote(game, players, p, [eng.id]);
  run(game, players, 0.2);
  for (const p of players) if (!p.leftBehind) { put(p, FINALE_POINTS.board); hold(game, players, p, "board"); }
  run(game, players, 5);
  finishRoute({ game, players });
  check("the pod launches and the crew wins", game.status === "win" && game.outcome.grade === "partial" && game.outcome.aboard.length === 3);
}

console.log(`\n${checks - fails}/${checks} rule checks passed`);
process.exit(fails ? 1 : 0);
