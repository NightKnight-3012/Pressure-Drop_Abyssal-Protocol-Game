// Presentation follows authoritative milestones; it never advances the mission.
export function shotPose(from, to, progress, reduced = false) {
  const t = reduced ? 0.5 : Math.max(0, Math.min(1, progress));
  const ease = t * t * (3 - 2 * t);
  return from.map((v, i) => v + (to[i] - v) * ease);
}

export function missionChapter(state) {
  if(state.practice)return `SIMULATOR / ${state.practice.step.toUpperCase()} / DAMAGE OFF`;
  if (state.stage === "finale") return "03 / THE SIGNALS WE KEEP";
  if (["vote", "boarding"].includes(state.stage)) return "02 / THE WEIGHT OF A SEAT";
  return "01 / BELOW THE LIGHT";
}

export function roleBriefing(state, dept) {
  if(state.practice)return {location:'NEREID-9 / SOLO TRAINING',task:'Learn movement, calibration, patching, equipment, outside work and real pod docking. Damage is disabled and suit air stabilises at a safe reserve.',evacuation:'One learner, one seat. Training does not count toward expedition or competitive records.',route:'Follow the objective. The drill uses the real station and escape controls.'};
  const roles = {
    engineering: ["ENGINEERING / EAST WING", "Restore the Power core, then calibrate the flood pump. Your repairs are faster; keep the hull patches under control."],
    medical: ["MEDICAL / WEST WING", "Restore Life support after power returns. Refill station oxygen and revive fallen crew; your treatment restores injuries too."],
    command: ["CONTROL / NORTHWEST", "Restore the Command console after power returns. Read sonar, coordinate sealed rooms and use decoys to draw contact away."],
    eva: ["MEDICAL AIRLOCK / WEST WING", "Wait for power, then cycle the airlock. Repair the outside cable junctions and return before your suit air runs out."]
  };
  const [location, task] = roles[dept] || ["NEREID-9 / CREW", "Follow the suit objective and restore the launch systems with your crew."];
  const count = state.players.filter(p => !p.lost).length;
  return { location, task, evacuation: count > state.seats
    ? `${state.seats} pod seats for ${count} crew. Confirm a private evacuation ballot before boarding. Anyone left in the station still has a route and a choice.`
    : `${state.seats} pod ${state.seats === 1 ? "seat" : "seats"} available. Everyone has a seat: board through the pod hatch after the launch systems are restored.`,
    route: "The main lift cable is severed. Pilot the MANTA through the wreckage to the auxiliary cradle. Center with A/D, release boost and hold S to dock." };
}

// One transmission at a time. Late joins/reconnects do not replay old crises.
export function createMissionComms() {
  let previous = null, pending = [], lastAt = -Infinity;
  return {
    update(state, me, now, active = true) {
      if(state.practice){previous=state;pending=[];return null;}
      if (!previous) {
        if (state.t < 3) pending.push("SUIT / Main lift offline. Asterion is listening. Restore power and keep the crew on the radio.");
      } else {
        if(!previous.breaches?.length&&state.breaches?.length)pending.push('ASTERION / Hull breach confirmed. Patch the opening. If the water carries a live cable, isolate that room before entering.');
        if(previous.oxygen>20&&state.oxygen<=20)pending.push('ASTERION / Station air is running low. Check Medical reserves and tell us who is still outside.');
        if(previous.lev?.state!=='approach'&&state.lev?.state==='approach')pending.push('SUIT / Hull contact is closing. Stop running. Listen before opening another panel.');
        if (!previous.power && state.power) pending.push("ASTERION / We have your emergency carrier. The auxiliary lift is still intact. Bring the pod to the ridge; we will bring you up.");
        if (previous.stage !== state.stage) {
          pending = [];
          if (state.stage === "vote") pending.push("SUIT / The transfer pod cannot carry everyone. The maintenance capsules in Control have independent ascent tanks, but need repairs.");
          if (state.stage === "boarding") pending.push(me?.left
            ? "SUIT / Your route is still open. Survey the Control capsule rack. After launch, its reserve power is shared with the acoustic beacon."
            : "ASTERION / Board at the pod hatch. Your ascent tanks are damaged: stay low and reach the armored recovery lift.");
          if (state.stage === "finale") pending.push(me?.aboard
            ? "ASTERION / Follow the wreckage corridor to our cradle. The station can draw contact away. Your distress pulse can return the favor."
            : "SUIT / The beacon protects the pod, but spends capsule power. The pod can answer your signal. Tell them what you need.");
        }
        if (previous.finale?.pod.phase !== state.finale?.pod.phase && state.finale?.pod.phase === "ascent") {
          pending = ["ASTERION / Shutter seal confirmed. The winch has you. Keep the radio open for anyone still below."];
        }
      }
      previous = state;
      if(pending.length>6)pending=pending.slice(-6);
      if (!active || !pending.length || now - lastAt < 10000) return null;
      lastAt = now;
      return pending.shift();
    }
  };
}

// Camera motion uses distance actually travelled, so walking into a wall stays still.
export function createLocomotion() {
  let phase = 0, height = 0, roll = 0, fov = 75;
  return {
    update(dt, distance, { running = false, swimming = false, strafe = 0, active = true, reduced = false } = {}) {
      const seconds = Math.max(0, Math.min(0.2, dt));
      if (reduced || !active) { height = roll = 0; fov = 75; return { height, roll, fov }; }
      const moving = distance > 0.0001;
      phase = (phase + Math.min(distance, 1) * (swimming ? 2 : 9)) % (Math.PI * 2);
      const k = 1 - Math.exp(-12 * seconds);
      height += ((moving ? Math.sin(phase) * (swimming ? 0.008 : running ? 0.018 : 0.01) : 0) - height) * k;
      roll += ((moving ? -strafe * 0.006 : 0) - roll) * k;
      fov += ((running && moving ? 78 : 75) - fov) * k;
      return { height, roll, fov };
    }
  };
}
