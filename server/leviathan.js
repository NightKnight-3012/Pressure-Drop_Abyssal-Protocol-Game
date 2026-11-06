// The Leviathan: a blind predator that hunts by sound.
// A small finite-state machine driven by a "threat" meter that noise fills up and silence drains.
//
//   PATROL      -> circles far away, not interested
//   INVESTIGATE -> heard something: swims closer, heading for the loudest noise
//   APPROACH    -> pressed against the hull, hull groans (the crew should freeze!)
//   ATTACK      -> rams the part of the hull nearest to the noise
//   RETREAT     -> backs off after a strike, then returns to patrol
import { roomAtAngle } from "../shared/layout.js";

export const LEV = {
  investigateAt: 25,
  approachAt: 55,
  attackAt: 85,
  quietDecay: 3,        // threat lost per second when nobody makes noise
  noiseToThreat: 3,     // threat per second per unit of noise
  dist: { patrol: 40, investigate: 24, approach: 13.5, attack: 10.8, retreat: 45 },
  turn: { patrol: 0.12, investigate: 0.7, approach: 0.9, attack: 1.4, retreat: 0.3 }, // rad/s
  speed: { patrol: 4, investigate: 5, approach: 6, attack: 9, retreat: 7 },           // m/s
  retreatSeconds: 11,
  retreatThreat: 20,
  decoyThreat: 35
};

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createLeviathan(rng = Math.random) {
  return {
    state: "patrol", angle: rng() * TAU - Math.PI, dist: LEV.dist.patrol, threat: 0,
    target: 0, since: 0, calmSince: 0, retreatUntil: 0, patrolDir: rng() < 0.5 ? -1 : 1,
    listenUntil: 0, listenPlayed: false
  };
}

export const levPosition = (lev) => ({ x: Math.cos(lev.angle) * lev.dist, z: Math.sin(lev.angle) * lev.dist });

function turnToward(current, target, maxStep) {
  const d = wrap(target - current);
  return wrap(current + Math.max(-maxStep, Math.min(maxStep, d)));
}
function easeDist(current, target, maxStep) {
  return current + Math.max(-maxStep, Math.min(maxStep, target - current));
}

function setState(lev, state, time, events) {
  if (lev.state === state) return;
  lev.state = state;
  lev.since = time;
  lev.calmSince = time;
  lev.listenUntil = 0; lev.listenPlayed = false;
  events.push({ type: "lev", state });
}

// noise: total noise this tick (already scaled), noiseAngle: where it came from (or null),
// decoyAngle: where an active decoy is (or null). Returns a list of events.
export function stepLeviathan(lev, { dt, time, noise, noiseAngle, decoyAngle, gain = 1 }) {
  const events = [];

  // --- threat meter ---------------------------------------------------------
  if (decoyAngle != null) {
    lev.target = decoyAngle;
    lev.threat += (LEV.decoyThreat - lev.threat) * Math.min(1, dt * 1.5); // lured, never attacks
  } else {
    if (noise > 0) {
      lev.threat += noise * gain * LEV.noiseToThreat * dt;
      if (noiseAngle != null) lev.target = noiseAngle;
    } else {
      lev.threat -= LEV.quietDecay * dt;
    }
  }
  lev.threat = Math.max(0, Math.min(100, lev.threat));
  const t = lev.threat;

  // --- state machine --------------------------------------------------------------
  const move = (state) => {
    lev.angle = turnToward(lev.angle, lev.target, LEV.turn[state] * dt);
    const distance = state === 'investigate' && time < lev.listenUntil ? 18 : LEV.dist[state];
    lev.dist = easeDist(lev.dist, distance, LEV.speed[state] * dt);
  };

  switch (lev.state) {
    case "patrol":
      lev.angle = wrap(lev.angle + lev.patrolDir * LEV.turn.patrol * dt);
      lev.dist = easeDist(lev.dist, LEV.dist.patrol, LEV.speed.patrol * dt);
      lev.target = lev.angle;
      if (t >= LEV.investigateAt) setState(lev, "investigate", time, events);
      break;

    case "investigate":
      // One audible close pass after a sound fades. Quiet still allows a safe retreat.
      if (!lev.listenPlayed && noise === 0 && decoyAngle == null && t < 25 && time - lev.since >= 2) {
        lev.listenPlayed = true; lev.listenUntil = time + 4;
        events.push({ type:'listening', angle:lev.target });
      }
      move("investigate");
      if (t >= LEV.approachAt) setState(lev, "approach", time, events);
      else if (t >= 15) lev.calmSince = time;
      else if (time - lev.calmSince >= 4) setState(lev, "patrol", time, events);
      break;

    case "approach":
      move("approach");
      if (t >= LEV.attackAt) setState(lev, "attack", time, events);
      else if (t >= 30) lev.calmSince = time;
      else if (time - lev.calmSince >= 5) setState(lev, "investigate", time, events);
      break;

    case "attack":
      move("attack");
      if (lev.dist <= LEV.dist.attack + 0.2 && Math.abs(wrap(lev.target - lev.angle)) < 0.35) {
        events.push({ type: "strike", angle: lev.angle, room: roomAtAngle(lev.angle) });
        lev.threat = LEV.retreatThreat;
        lev.retreatUntil = time + LEV.retreatSeconds;
        setState(lev, "retreat", time, events);
      }
      break;

    case "retreat":
      move("retreat");
      if (time >= lev.retreatUntil) setState(lev, "patrol", time, events);
      break;
  }
  return events;
}
