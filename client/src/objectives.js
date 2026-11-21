// Pure objective selection: no sockets or DOM side effects.
import {STATIONS} from '../../shared/layout.js';
import {CAPSULE_STEPS} from '../../shared/tactical.js';
import {practiceGuidance} from '../../shared/practice.js';
import {exteriorNotice} from '../../shared/exterior.js';

export function objectiveFor(state, me) {
  const st = state.stations;
  const done = (id) => st[id] === "done";
  if (me?.lost || me?.escaped) return "You are a spectator: your route has ended. TAB follows the remaining crew; the radio link stays open.";
  if (me?.down) return me.ext ? "SUIT EMERGENCY / You are incapacitated outside. Field revival is unavailable; keep the radio link open." : "You are down. Call your crew for a rescue.";
  if(state.practice)return practiceGuidance(state);
  if(me?.submerged)return 'SUBMERGED / Reach dry space before helmet air runs out. Seal the room and patch leaks once safe.';
  if(me?.subSeat)return me.subSeat==='driver'?'SURVEY PILOT / W/S thrust, A/D steer. Return to the marked west Medical dock, stop and hold E to transfer the crew inside. Engine noise attracts contact.':'SURVEY OPERATOR / X deploys a limited flare; T scans a last-known contact. Tell the pilot when air or hull is low. V takes an unattended pilot seat.';
  if (state.stage === "finale") {
    if (me?.aboard && state.finale.pod.phase === "sealing") return "CLAMPS LOCKED: the shutter is closing behind you. Keep the hull stable until the seal holds.";
    if (me?.aboard && state.finale.pod.phase === "ascent") return "RECOVERY LIFT ENGAGED: the shutter is sealed. Keep the station crew on the radio while the winch hauls you clear.";
    if (me?.aboard && state.finale.pod.phase === "rendezvous") return state.finale.pod.pilot === me.id ? "DOCK: center with A/D, release boost and hold S for three seconds. You are vulnerable until the cradle locks." : "DOCKING: keep the hull and air stable until the pilot locks the cradle.";
    if (me?.aboard) return state.finale?.pod.pilot === me.id ? "PILOT: reach the armored recovery lift. At the cradle, center the pod and hold S to dock." : "SUPPORT THE PILOT: repair the hull, restore air, read sonar and decide whether to answer the station.";
    const s = state.finale.station;
    if (s.capsulesRemaining === 0) return "The maintenance capsules have launched. The acoustic beacon can still protect the pod. Keep the final radio link open.";
    return s.capsuleStep >= 3 ? "CAPSULES READY: return to the maintenance capsule panel in Control and press E to escape." : `FINAL SIGNAL: ${CAPSULE_STEPS[s.capsuleStep]} at the Control capsule rack. Beacon protection consumes the same reserve power.`;
  }
  if (state.stage === "vote") return "EMERGENCY VOTE: choose who stays behind.";
  if (state.stage === "boarding") {
    const boardable = state.players.filter((p) => !p.lost && !p.left);
    const inPod = boardable.filter((p) => p.aboard).length;
    if (me?.left) return "Survey the Control maintenance capsules and emergency beacon. Your story continues after launch.";
    if (me?.aboard) return `SEATED IN THE POD · launch in ${state.boarding?.endsIn ?? 0}s. Your crew still have to navigate out.`;
    return `BOARD AT THE POD HATCH! Launch in ${state.boarding?.endsIn ?? 0}s (${inPod}/${boardable.length} seated)`;
  }
  if (state.lockdown.active) return "LOCKDOWN: sealed crews must hold their room's door panel AT THE SAME TIME. Use chat.";
  if (state.oxygen < (state.mission === 'overhaul' ? 35 : 20) && done("lifesupport") && st.o2 === "ready") return "OXYGEN LOW: refill at the Oxygen reserve in the Medical Bay.";
  if (!done("power")) return "Restore power: repair the Power core (Engineering, east wall).";
  if(me?.ext) {
    const notice=exteriorNotice(me);if(notice)return `${notice}. Follow the survey posts home; supplies are optional.`;
    if(me.depth>1.25)return `DIVE / ${me.depth.toFixed(1)}m below the survey line / air use x${me.pressure}. SPACE ascends, Ctrl descends. Ascend to the marked route level to work on equipment or return through the airlock.`;
    if(state.salvage?.carrier===me.id)return 'REGULATOR CARRIED / Return through the west Medical airlock. Hold E at the powered, repaired Engineering pump to install: +20 points of pump flow.';
    const left=Object.keys(st).filter(id=>STATIONS[id]?.junction&&st[id]!=='done').length;
    if(!left&&state.salvage?.state==='available'&&me.x>27)return 'OPTIONAL WRECK SALVAGE / Follow the wreck route to its north end. Recover the pump regulator into an empty slot, then install at the Engineering pump. Watch suit air.';

    return left ? `EVA: repair ${left} cable junction(s). Optional moored supplies need an empty slot; hold E to recover. Watch suit air; return through the west Medical airlock.` : 'Outside cables restored: return through the west Medical airlock. Moored supplies are optional; opening takes time and makes noise. Watch suit air.';
  }
  if(state.salvage?.carrier===me?.id)return 'REGULATOR CARRIED / Repair the Engineering pump if needed, then hold E at it to install the regulator: +20 points of drainage.';
  if (me?.dept === "medical") {
    if (!done("lifesupport")) return "MEDICAL: calibrate airflow and restore Life support in Medical Bay. Your crew can work in parallel.";
    const hurt = state.players.find(p => !p.lost && !p.ext && !p.aboard && !p.escaped && (p.down || p.hp < 65));
    if (hurt) return `MEDICAL: ${hurt.down ? "revive" : "treat"} ${hurt.name}. Keep the oxygen reserve available.`;
    if (state.oxygen < 65 && st.o2 === "ready") return "MEDICAL: refill the oxygen reserve, then check the crew's condition.";
  }
  if (me?.dept === "command" && !done("console")) return "COMMAND: route the sonar signal and restore the Command console. Coordinate doors and decoys.";
  const outside = Object.keys(st).filter(id => STATIONS[id]?.junction && st[id] !== "done");
  if (me?.dept === "eva" && outside.length) return `EVA: cycle the Medical airlock and repair ${outside.length} outside cable junction(s). Monitor suit air and listen for hull movement.`;
  if (st.pump !== "done") return "Repair the flood pump (Engineering, north wall).";
  if (me?.dept === 'engineering' && state.complication?.state === 'active') return `OPTIONAL / Pump filter obstructed: ${state.salvage?.state==='installed'?105:85}% flow. Hold E at the Engineering pump to clear it and increase output to ${state.salvage?.state==='installed'?130:110}%. Repairs make noise.`;
  if (st.console !== "done") return "Repair the Command console (Control Room, north wall).";
  if (st.lifesupport !== "done") return "Repair the Life support unit (Medical Bay, south wall).";
  const junctions = Object.keys(st).filter((id) => STATIONS[id]?.junction && st[id] !== "done");
  const annexJobs = ['compressor', 'scrubber', 'isolation'];
  const annexJob = annexJobs.find(id => st[id] === 'ready' && STATIONS[id].dept === me?.dept)
    ?? annexJobs.find(id => st[id] === 'ready');
  if (annexJob) {
    const bay = annexJob === 'isolation' ? 'Pressure test bay' : 'Compressor bay';
    return `OVERHAUL / ${STATIONS[annexJob].label} needs work. Take the east service corridor from Engineering to the ${bay}.`;
  }
  if (junctions.length) {
    return me?.dept === "eva" || !state.players.some((p) => p.dept === "eva" && !p.lost)
      ? `Divers: cycle the airlock (Medical Bay, west wall) and repair ${junctions.length} cable junction(s) outside.`
      : `Waiting on the divers: ${junctions.length} cable junction(s) left outside the hull.`;
  }
  if (st.pressure_test === 'ready') return 'OVERHAUL / Run the launch pressure test in the far bay of the east utility annex.';
  if (st.launch !== "done") return "All systems ready: start the launch at the Pod launch console.";
  return "Launching...";
}
