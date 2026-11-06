// Deterministic decision driver for balance/regression tests, not a game bot.
// It issues the same validated actions as players; movement is supplied by the harness.
import { startHold, repairInput } from "../game.js";
import { podControl, podAction } from "../finale.js";
import { FINALE_POINTS } from "../../shared/tactical.js";

export function calibrate(game, p, id) {
  const spec = game.calibrations[id];
  if (!spec || spec.solved) return;
  if (spec.type === "circuit") {
    for (let i = 1; i <= 3; i++) if ((spec.value & (1 << (i - 1))) !== (spec.target & (1 << (i - 1)))) repairInput(game, p, id, i);
  } else repairInput(game, p, id, spec.target);
}
export function driveFinale(game, players, { survivor = "escape" } = {}) {
  if (game.stage === "boarding") {
    for (const p of players.filter(p => !p.lost && !p.downed && !p.leftBehind && !p.aboard)) {
      Object.assign(p, FINALE_POINTS.board); startHold(game, players, p, "board");
    }
    return;
  }
  if (game.stage !== "finale") return;
  for (const p of players) p.running = false;
  const f = game.finale, pod = f.pod, crew = players.filter(p => p.aboard && p.connected && !p.lost && !p.escaped);
  const pilot = crew.find(p => p.id === pod.pilot);
  if (pilot) {
    const gate = pod.route.find(g => !g.passed);
    const desiredLane = pod.phase === "rendezvous" ? 0 : gate?.lane === -1 ? 0 : -1;
    podControl(game, players, pilot, { steer: Math.abs(pod.lane - desiredLane) < 0.08 ? 0 : Math.sign(desiredLane - pod.lane), throttle: pod.phase === "rendezvous" ? 0.15 : 1, boost: false });
    if (pod.creatureDistance < 13 && game.time >= pod.counterAt && pod.charges > 0) podAction(game, players, pilot, "countermeasure", []);
  }
  for (const p of crew) if ((p.id !== pod.pilot || crew.length === 1) && (pod.hull < 85 || pod.oxygen < 70) && game.time >= (p.podRepairAt || 0)) podAction(game, players, p, "repair", []);
  const stationCrew = players.filter(p => !p.aboard && !p.escaped && !p.lost && !p.downed && p.connected);
  const lead = stationCrew[0];
  if (!lead) return;
  const s = f.station;
  if (survivor === "sacrifice" || game.time - f.since < 12) {
    if (!s.beacon && s.power > 2) { Object.assign(lead, FINALE_POINTS.beacon); startHold(game, players, lead, "beacon"); }
    return;
  }
  if (s.beacon) { Object.assign(lead, FINALE_POINTS.beacon); startHold(game, players, lead, "beacon"); }
  if (s.capsuleStep >= 3) {
    for (const p of stationCrew) { Object.assign(p, FINALE_POINTS.capsule); startHold(game, players, p, "capsule"); }
  } else if (!s.repair) { Object.assign(lead, FINALE_POINTS.capsule); startHold(game, players, lead, "capsule"); }
}
