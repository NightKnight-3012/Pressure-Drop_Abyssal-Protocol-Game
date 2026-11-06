import {
  STATIONS, FLOOD_MAX, ROOM_IDS, ROOMS, DEPTS, MAX_HP
} from "../../shared/layout.js";
import { drawSonar, sonarReadout } from "./sonar.js";
import { FINALE_POINTS, MISSIONS, CAPSULE_STEPS, POD_ROUTE_LENGTH } from "../../shared/tactical.js";
import { net } from "./network.js";
import { POD_VISUAL_SCALE } from "./pod-motion.js";
import { POD_DOCKING } from "../../shared/tactical.js";
import { routeChapter } from '../../shared/escape-route.js';
import { missionChapter, roleBriefing } from "./presentation.js";
import { ITEMS, ITEM_LIMIT } from '../../shared/items.js';
import { bearingTo } from './gear-guidance.js';
import {exteriorZone,exteriorNotice} from '../../shared/exterior.js';
import {options} from './options.js';
import {practiceGuidance} from '../../shared/practice.js';
import {openCrewControls} from './moderation-ui.js';

const $ = (id) => document.getElementById(id);

// Only touch the DOM when a value actually changed (the HUD updates every frame).
function setText(el, value) {
  if (el._t !== value) { el.textContent = value; el._t = value; }
}
function setClass(el, name, on) {
  if (el._c?.[name] !== on) { el.classList.toggle(name, on); (el._c ||= {})[name] = on; }
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const SYSTEM_ROWS = ["power", "pump", "console", "lifesupport", "o2", "j1", "j2", "j3", "launch"];

// What should this player be doing right now? Returns one line of guidance.
export function objectiveFor(state, me) {
  const st = state.stations;
  const done = (id) => st[id] === "done";
  if (me?.lost || me?.escaped) return "You are a spectator: your route has ended. TAB follows the remaining crew; the radio link stays open.";
  if (me?.down) return "You are down. Call your crew for a rescue.";
  if(state.practice)return practiceGuidance(state);
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
  if (state.oxygen < 20 && done("lifesupport") && st.o2 === "ready") return "OXYGEN LOW: refill at the Oxygen reserve in the Medical Bay.";
  if (!done("power")) return "Restore power: repair the Power core (Engineering, east wall).";
  if(me?.ext) {
    const notice=exteriorNotice(me);if(notice)return `${notice}. Follow the survey posts home; supplies are optional.`;
    if(me.depth>1.25)return `DIVE / ${me.depth.toFixed(1)}m below the survey line / air use x${me.pressure}. SPACE ascends, Ctrl descends. Ascend to the marked route level to work on equipment or return through the airlock.`;
    if(state.salvage?.carrier===me.id)return 'REGULATOR CARRIED / Return through the west Medical airlock. Hold E at the powered, repaired Engineering pump to install: +20 points of pump flow.';
    if(state.salvage?.state==='available'&&me.x>27)return 'OPTIONAL WRECK SALVAGE / Follow the wreck route to its north end. Recover the pump regulator into an empty slot, then install at the Engineering pump. Watch suit air.';
    const left=Object.keys(st).filter(id=>STATIONS[id]?.junction&&st[id]!=='done').length;
    return left ? `EVA: repair ${left} cable junction(s). Optional moored supplies need an empty slot; hold E to recover. Watch suit air; return through the west Medical airlock.` : 'Outside cables restored: return through the west Medical airlock. Moored supplies are optional; opening takes time and makes noise. Watch suit air.';
  }
  if(state.salvage?.carrier===me?.id)return 'REGULATOR CARRIED / Repair the Engineering pump if needed, then hold E at it to install the regulator: +20 points of drainage.';
  if (me?.dept === "medical") {
    if (!done("lifesupport")) return "MEDICAL: calibrate airflow and restore Life support in Medical Bay. Your crew can work in parallel.";
    const hurt = state.players.find(p => !p.lost && (p.down || p.hp < 65));
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
  if (junctions.length) {
    return me?.dept === "eva" || !state.players.some((p) => p.dept === "eva" && !p.lost)
      ? `Divers: cycle the airlock (Medical Bay, west wall) and repair ${junctions.length} cable junction(s) outside.`
      : `Waiting on the divers: ${junctions.length} cable junction(s) left outside the hull.`;
  }
  if (st.launch !== "done") return "All systems ready: start the launch at the Pod launch console.";
  return "Launching...";
}

export function createHud() {
  // DOM nodes survive matches; cached state and dynamically created rows do not.
  for (const node of $("game-hud").querySelectorAll("*")) { delete node._t; delete node._c; }
  $("systems-list").replaceChildren();
  const el = {
    roomName: $("room-name"), roomCode: $("hud-room-code"), time: $("hud-time"), deptBadge: $("dept-badge"),
    objective: $("objective"), banner: $("banner"), captions: $("captions"),
    systemsList: $("systems-list"), rosterList: $("roster-list"), playerCount: $("player-count"),
    lockdownBox: $("lockdown-box"), lockdownText: $("lockdown-text"), lockdownFill: $("lockdown-fill"),
    lookPrompt: $("look-prompt"), interaction: $("interaction"),
    repairWrap: $("repair-wrap"), repairFill: $("repair-fill"), toast: $("toast"),
    hpValue: $("hp-value"), hpFill: $("hp-fill"), stmValue: $("stm-value"), stmFill: $("stm-fill"), stmNote: $("stm-note"), o2Value: $("o2-value"), o2Fill: $("o2-fill"),
    suitBlock: $("suit-block"), suitValue: $("suit-value"), suitFill: $("suit-fill"),
    floodValue: $("flood-value"), floodFill: $("flood-fill"),
    levState: $("lev-state"), threatValue: $("threat-value"), threatFill: $("threat-fill"),
    flash: $("damage-flash"), underwater: $("underwater"), down: $("down-overlay"), downText: $("down-text"),
    spectate: $("spectate"), spectateName: $("spectate-name"),
    over: $("game-over"), overTitle: $("over-title"), overReason: $("over-reason"), overStats: $("over-stats"), overTable: $("over-table"),
    briefing: $("briefing"), briefingRole: $("briefing-role"), briefingBlurb: $("briefing-blurb"), briefingTimer: $("briefing-timer"),
    vote: $("vote"), voteText: $("vote-text"), voteList: $("vote-list"), voteTimer: $("vote-timer"),
    console: $("console"), sonar: $("sonar"), sonarReadout: $("sonar-readout"), consoleDoors: $("console-doors"), consoleDecoy: $("console-decoy"),
    lost: $("lost")
  };

  // ---- static "systems" rows
  const systemRows = {};
  for (const id of SYSTEM_ROWS) {
    const row = document.createElement("div");
    row.className = "system";
    row.innerHTML = '<span class="dot"></span><div><b></b><small></small></div><em></em>';
    row.querySelector("b").textContent = STATIONS[id].label;
    row.querySelector("small").textContent = STATIONS[id].effect;
    el.systemsList.appendChild(row);
    systemRows[id] = { row, status: row.querySelector("em") };
  }

  let rosterKey = "";
  let toastTimer = 0;
  let voteKey = "";
  const voteSel = new Set();
  let voteSent = false, repairId = null, repairSend = null, repairKey = "";
  let gearSelection = 0, gearState = '';
  $('gear-slots').replaceChildren();
  const gearButtons = Array.from({ length: ITEM_LIMIT }, (_, slot) => {
    const button = document.createElement('button');
    button.className = 'secondary gear-slot'; button.onclick = () => net.item(slot);
    $('gear-slots').appendChild(button); return button;
  });
  const toggleWrist = force => {
    const open = force ?? !document.body.classList.contains("wrist-open");
    document.body.classList.toggle("wrist-open", open); $("wrist-toggle").setAttribute("aria-expanded", String(open));
  };
  $("wrist-toggle").onclick = () => toggleWrist();
  const wristView = crew => {
    document.body.classList.toggle("wrist-crew", crew);
    $("wrist-systems").setAttribute("aria-pressed", String(!crew));
    $("wrist-crew").setAttribute("aria-pressed", String(crew));
  };
  wristView(false);
  $("wrist-systems").onclick = () => wristView(false);
  $("wrist-crew").onclick = () => wristView(true);
  const podTools = open => { $("pod-actions").classList.toggle("hidden", !open); $("pod-tools-toggle").setAttribute("aria-expanded", String(open)); };
  podTools(false);
  $("pod-tools-toggle").onclick = () => podTools($("pod-actions").classList.contains("hidden"));
  for (const [id, action] of [["pod-pilot", "pilot"], ["pod-sonar", "sonar"], ["pod-decoy", "countermeasure"], ["pod-propose", "propose"], ["pod-accept", "accept"], ["pod-decline", "decline"]]) $(id).onclick = () => { net.podAction(action); podTools(false); };
  $("pod-repair").onpointerdown = e => { e.currentTarget.setPointerCapture?.(e.pointerId); net.podAction("repair"); };
  $("pod-repair").onpointerup = $("pod-repair").onpointercancel = $("pod-repair").onlostpointercapture = () => net.podAction("repairStop");

  function caption(text,seconds=4500) {
    const line = document.createElement("div");
    line.className = "caption";
    line.textContent = text;
    el.captions.appendChild(line);
    while (el.captions.children.length > 4) el.captions.firstChild.remove();
    setTimeout(() => line.remove(), Math.max(1000,Math.min(14000,seconds)));
  }

  return {
    el, caption,
    useGear(slot = gearSelection) { net.item(slot); },
    cycleGear() { gearSelection = (gearSelection + 1) % ITEM_LIMIT; gearState = ''; },
    dispose() { clearTimeout(toastTimer); el.captions.replaceChildren(); },
    toggleWrist,
    showRepair(id, spec, send, close) {
      repairId = id; repairSend = send; repairKey = ""; $("repair-panel").classList.remove("hidden");
      $("repair-title").textContent = STATIONS[id].label;
      $("repair-close").onclick = close;
      this.updateRepair({ [id]: spec });
      $("repair-inputs").querySelector("button")?.focus();
    },
    hideRepair() { repairId = null; $("repair-panel").classList.add("hidden"); $("repair-close").onclick = null; },
    updateRepair(specs) {
      if (!repairId || !specs?.[repairId]) return;
      const spec = specs[repairId], buttons = [];
      const key = `${repairId}:${spec.value}:${spec.solved}`;
      if (key === repairKey) return; repairKey = key;
      const focused = document.activeElement?.dataset.calibration;
      $("repair-instructions").textContent = spec.type === "circuit" ? "Match the three circuit switches to the wiring schematic. Then return and hold E to seat the connections." : spec.type === "pressure" ? `Balance the valve in safe pressure band ${spec.target}. Then hold E to replace the pump seal.` : spec.type === "routing" ? `Route sonar to receiver ${spec.target}. Then hold E to secure the signal cable.` : `Select airflow channel ${spec.target}. Then hold E to restore the scrubber.`;
      for (let i = 1; i <= (spec.type === "circuit" ? 3 : 4); i++) {
        const button = document.createElement("button"); button.className = "secondary";
        button.dataset.calibration = String(i);
        const on = spec.type === "circuit" ? !!(spec.value & (1 << (i - 1))) : spec.value === i;
        button.textContent = spec.type === "circuit" ? `CIRCUIT ${i} · ${on ? "ON" : "OFF"} · REQUIRED ${spec.target & (1 << (i - 1)) ? "ON" : "OFF"}` : `${spec.type === "pressure" ? "VALVE" : spec.type === "routing" ? "RECEIVER" : "AIRFLOW"} ${i}${on ? " · SELECTED" : ""}`;
        button.classList.toggle("selected", on); button.onclick = () => repairSend(repairId, i); buttons.push(button);
      }
      $("repair-inputs").replaceChildren(...buttons);
      if (focused) buttons[Number(focused) - 1]?.focus();
      $("repair-status").textContent = spec.solved ? "CALIBRATION ACCEPTED · Return to the panel and hold E to finish the repair." : "CALIBRATION REQUIRED · The circuit will not finish repairing until it is safe.";
    },
    updateFinale(state, me, following) {
      const f = state.finale;
      const observing = !!(me?.lost || me?.escaped), watchingPod = observing && following?.aboard && !following.lost && !following.escaped;
      setClass($("pod-hud"), "hidden", !(f && (me?.aboard && !observing || watchingPod)));
      setClass($("finale-status"), "hidden", !f || !!me?.aboard || !!me?.lost || !!me?.escaped);
      if (!f) return;
      const s = f.station, pod = f.pod, secured = pod.phase === "ascent", clamped = secured || pod.phase === "sealing";
      if (secured || pod.diversion) podTools(false);
      $("pod-tools-toggle").disabled = secured || observing;
      $("pod-hud").classList.toggle("clamped", clamped); $("pod-hud").classList.toggle("secured", secured);
      const docking = ["approach", "rendezvous", "sealing", "ascent"].includes(pod.phase);
      setClass($("pod-docking"), "hidden", !docking);
      if (docking) {
        const centered = Math.abs(pod.lane) <= POD_DOCKING.tolerance;
        const stage = pod.phase === "ascent" ? "05 / WINCH RECOVERY" : pod.phase === "sealing" ? "04 / ISOLATION SHUTTER" : pod.dockProgress > 0 ? "03 / ENGAGING CLAMPS" : pod.phase === "rendezvous" ? "02 / ALIGN AND BRAKE" : "01 / FINAL APPROACH";
        const hint = secured ? "SEALED / STATION RADIO OPEN" : clamped ? "HOLDING AUTOMATICALLY / SUPPORT MAY REPAIR" : !centered ? `MOVE ${pod.lane > 0 ? "LEFT" : "RIGHT"} / ${Math.abs(pod.lane * 4).toFixed(1)}m OFF CENTRE` : pod.phase === "approach" ? "CRADLE AHEAD / SPEED GOVERNOR ACTIVE" : pod.braking ? "CENTERED / KEEP HOLDING S" : "CENTERED / HOLD S TO ENGAGE CLAMPS";
        setText($("pod-dock-stage"), stage); setText($("pod-dock-hint"), hint);
        $("pod-dock-marker").style.left = `${50 + Math.max(-1.2, Math.min(1.2, pod.lane)) / 1.2 * 46}%`;
        $("pod-dock-track").classList.toggle("centered", centered);
        const progress = Math.round(100 * (secured ? pod.ascentProgress : clamped ? pod.sealProgress : pod.dockProgress));
        $("pod-dock-fill").style.width = `${progress}%`; $("pod-dock-progress").setAttribute("aria-valuenow", progress);
      }
      $("pod-hud").classList.toggle("boosting", !!pod.boosting);
      setText($("finale-status"), `STATION RESERVE ${s.power}% · BEACON ${s.beacon ? "TRANSMITTING" : "OFF"} · CAPSULE ${s.capsuleStep}/3 · ${s.capsulesRemaining} REMAIN · COLLAPSE ${s.collapseIn}s${s.repair ? ` · REPAIR ${Math.round(s.repair.progress * 100)}%` : ""}`);
      setText($("pod-role"), clamped ? "CRADLE HAS CONTROL" : !observing && pod.pilot === me?.id ? "YOU ARE PILOTING" : `${observing ? "OBSERVING · " : ""}PILOT: ${state.players.find(p => p.id === pod.pilot)?.name || "REASSIGNING"}`);
      setText($("pod-readout"), `${Math.round(pod.speed * POD_VISUAL_SCALE * 3.6)} KM/H · ${secured ? "WINCH ACTIVE" : clamped ? "CLAMPED" : pod.boosting ? "BOOST ACTIVE" : "CRUISE"} · HULL ${Math.round(pod.hull)}% · AIR ${Math.round(pod.oxygen)}% · BOOST ${Math.round(pod.battery)}% · ${pod.phase === "ascent" ? "LIFT " + Math.round(pod.ascentProgress * 100) : clamped ? "SEAL " + Math.round(pod.sealProgress * 100) : pod.phase === "rendezvous" ? "DOCK " + Math.round(pod.dockProgress * 100) : "RECOVERY SHAFT " + Math.min(100, Math.round(pod.progress / POD_ROUTE_LENGTH * 100))}% · DECOYS ${pod.charges}${clamped ? "" : " / " + pod.reserveIn + "s"}`);
      const next = pod.route[0], lane = next ? ["LEFT", "CENTRE", "RIGHT"][next.lane + 1] : null;
      const warning = secured ? "SHUTTER SEALED / ARMORED LIFT ENGAGED / STATION CREW STILL ON RADIO" : clamped ? "CLAMPS LOCKED / SHUTTER CLOSING / HULL STILL EXPOSED" : pod.phase === "approach" ? "RECOVERY SHAFT AHEAD / BOOST DISABLED / PREPARE TO ALIGN" : pod.phase === "rendezvous" ? "CRADLE: CENTER WITH A/D + HOLD S FOR 3 SECONDS / RELEASE BOOST" : pod.sonar && next ? `SONAR: WRECKAGE ${lane} · ${Math.round((next.at - pod.progress)*POD_VISUAL_SCALE)}m · CONTACT ${Math.round(pod.creatureDistance)}m ASTERN` : f.creature.target === "pod" ? pod.creatureDistance < 12 ? (pod.charges ? "CONTACT ATTACKING ASTERN / X DECOY / E REPAIR / KEEP STEERING" : "CONTACT ATTACKING ASTERN / DECOYS EMPTY / E REPAIR / KEEP STEERING") : "CONTACT FOLLOWING THE POD · WATCH THE WRECKAGE" : "CONTACT MOVING TOWARD THE STATION · THEIR WINDOW IS CLOSING";
      $("pod-decoy").disabled = secured || observing || !pod.counterReady || !pod.charges;
      if(pod.phase==='run') {
        const falling=next?.kind==='falling' && next.at-pod.progress<13;
        const notice=falling?`FALLING SECTION ${lane} / MOVE TO A CLEAR LANE`:routeChapter(pod.progress);
        setText($("pod-warning"),`${notice} / ${warning}`);
      } else setText($("pod-warning"),warning);
      setText($("pod-decoy"), pod.charges ? `X / DECOY (${pod.charges})` : "X / DECOYS EMPTY");
      $("pod-pilot").disabled = clamped || observing || pod.pilot !== me?.id;
      $("pod-repair").disabled = secured || observing; $("pod-sonar").disabled = secured || observing;
      $("pod-propose").disabled = clamped || observing || !state.players.some(p => !p.aboard && !p.lost && !p.escaped);
      setText($("pod-repair"), pod.repairs.some(r => r.id === me?.id) ? `REPAIRING ${Math.round(pod.repairs.find(r => r.id === me.id).progress * 100)}% · KEEP HOLDING` : "E · HOLD TO REPAIR / RESTORE AIR");
      setClass($("pod-consent"), "hidden", observing || !pod.diversion);
      if (pod.diversion) {
        setText($("pod-consent-text"), `DISTRESS DIVERSION · Draw the creature to us for 14s, spend 28 boost reserve. Majority consent required. ${pod.diversion.endsIn}s remaining.`);
        $("pod-accept").disabled = pod.diversion.votes[me?.id] === true; $("pod-decline").disabled = pod.diversion.votes[me?.id] === false;
      }
    },
    setRoomCode: (code) => setText(el.roomCode, code),
    setLookPrompt: (visible) => { el.lookPrompt.style.display = visible ? "block" : "none"; },
    setFlash: (v) => { el.flash.style.opacity = String(v); },
    setUnderwater: (on) => setClass(el.underwater, "on", on),

    toast(message) {
      el.toast.textContent = message;
      el.toast.classList.remove("hidden");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2800);
    },

    // Interaction prompt + progress bar. `prompt` is text or null, `progress` 0-1 or null.
    setInteraction(prompt, progress) {
      setClass(el.interaction, "hidden", !prompt);
      if (prompt) setText(el.interaction, prompt.replace(/\bE\b/g,options.bindings.interact.replace(/^Key/,'')));
      setClass(el.repairWrap, "hidden", progress == null);
      document.body.classList.toggle('working',!!prompt&&progress!=null);
      el.repairWrap.setAttribute('role','progressbar');
      el.repairWrap.setAttribute('aria-label','Interaction progress');
      el.repairWrap.setAttribute('aria-valuemin','0');el.repairWrap.setAttribute('aria-valuemax','100');
      if (progress != null) {const percent=Math.round(Math.max(0,Math.min(1,progress))*100);el.repairFill.style.width=percent+'%';el.repairWrap.setAttribute('aria-valuenow',String(percent));el.repairWrap.dataset.progress=percent+'%';}
      else el.repairWrap.removeAttribute('aria-valuenow');
    },

    // Called every frame. ctx: { me, zone, depth, stamina, winded }
    update(state, ctx) {
      const { me, zone, depth, stamina, winded } = ctx;
      const gearHidden = !me || me.down || me.lost || me.escaped || me.aboard || !!me.subSeat || state.stage === 'finale';
      setClass($('gear'), 'hidden', gearHidden);
      const gearKey = JSON.stringify([me?.inventory, me?.itemReadyIn, state.lureReadyIn, state.scanReadyIn, gearSelection]);
      if (gearKey !== gearState) {
        gearState = gearKey;
        gearButtons.forEach((b, i) => {
          const id = me?.inventory?.[i], def = ITEMS[id];
          const cooldown = Math.max(me?.itemReadyIn || 0, id === 'decoy' ? state.lureReadyIn || 0 : id === 'scanner' ? state.scanReadyIn || 0 : 0);
          b.textContent = `${i + 1} ${def ? def.symbol + ' ' + def.label + (cooldown ? ` / ${cooldown}s` : ' ×1') : 'Spent'}`;
          b.title = def?.help || 'Used this match'; b.disabled = !def || cooldown > 0;
          b.setAttribute('aria-label', `${i + 1}: ${def?.label || 'Spent'}. ${def?.help || ''}${cooldown ? ` Ready in ${cooldown}s.` : ''}`);
          b.setAttribute('aria-pressed', String(i === gearSelection));
        });
        const def = ITEMS[me?.inventory?.[gearSelection]];
        setText($('gear-hint'), me?.itemReadyIn ? `EQUIPMENT COOLDOWN ${me.itemReadyIn}s` : `Q select · X use · ${def?.help || 'Selected slot spent'}`);
      }
      const guidance = [];
      const viewer = ctx.position || me || {x:0,z:0};
      if (state.scan) guidance.push(`LAST CONTACT ${bearingTo(state.scan,viewer,ctx.yaw)} / ${Math.floor(state.scan.age)}s OLD / ${Math.ceil(state.scan.remaining)}s LEFT`);
      if (me?.ext && state.returnMarker) guidance.push(`AIRLOCK ${bearingTo(state.returnMarker,viewer,ctx.yaw)} / ${state.returnMarker.remaining}s / DIRECT BEARING`);
      setText($('gear-contact'),guidance.join('\n'));
      setClass($('gear-contact'),'hidden',!guidance.length);
      setText(el.roomName, me?.ext&&!me.lost&&!me.escaped?exteriorZone(me.x,me.z).label:zone.toUpperCase());
      setText(el.time, fmtTime(state.t));
      const dept = DEPTS[me?.dept];
      setText(el.deptBadge, dept ? `${dept.short} · ${dept.label.toUpperCase()}` : "");
      if (dept) el.deptBadge.style.color = dept.color;

      setText(el.hpValue, String(me?.hp ?? 0));
      el.hpFill.style.width = `${((me?.hp ?? 0) / MAX_HP) * 100}%`;
      setText(el.stmValue, String(Math.round(stamina ?? 100)));
      el.stmFill.style.width = `${stamina ?? 100}%`;
      setClass(el.stmFill, "winded", !!winded);
      setText(el.stmNote, winded ? "(OUT OF BREATH)" : "");
      setText(el.o2Value, `${Math.round(state.oxygen)}%`);
      el.o2Fill.style.width = `${state.oxygen}%`;
      setClass(el.o2Fill, "low", state.oxygen < 25);
      setClass(el.suitBlock, "hidden", !me?.ext||!!me?.subSeat);
      if (me?.ext&&!me.subSeat) { setText(el.suitValue, `${me.suit}s${me.depth>.1?' / '+me.depth.toFixed(1)+'m':''}`); el.suitFill.style.width = `${(me.suit / 90) * 100}%`; }
      const floodPct = Math.min(100, (depth / FLOOD_MAX) * 100);
      setText(el.floodValue, `${Math.round(floodPct)}%`);
      el.floodFill.style.width = `${floodPct}%`;
      const noise = me?.noise || 0;
      setText(el.levState, "");
      setText(el.threatValue, noise >= 60 ? "LOUD" : noise > 0 ? "AUDIBLE" : "QUIET");
      el.threatFill.style.width = `${noise}%`;
      setClass(el.threatFill, "high", noise >= 60);
      this.updateRepair(state.calibrations); this.updateFinale(state, me, ctx.following);
      setText(el.playerCount, `${state.players.filter((p) => !p.lost).length} / ${state.players.length}`);

      // systems
      const holdByStation = {};
      for (const h of Object.values(state.holds)) holdByStation[h.id] = h;
      for (const id of SYSTEM_ROWS) {
        const row = systemRows[id];
        const s = state.stations[id];
        setClass(row.row, "hidden", !s);
        if (!s) continue;
        const h = holdByStation[id] || (id === 'pump' ? holdByStation['salvage:install'] || holdByStation['service:pump'] : null);
        let text, cls;
        if (h) { text = `WORKING ${Math.round(h.progress * 100)}%`; cls = "busy"; }
        else if(id==='pump'&&s==='done'&&state.salvage?.state==='installed'){text=`REGULATOR / ${state.complication?.state==='active'?105:state.complication?.state==='resolved'?130:120}% FLOW`;cls=state.complication?.state==='active'?'bad':'ok';}
        else if (id === 'pump' && state.complication?.state === 'active') { text = 'FILTER CLOG / 85% FLOW'; cls = 'bad'; }
        else if (id === 'pump' && state.complication?.state === 'resolved') { text = 'ONLINE / 110% FLOW'; cls = 'ok'; }
        else if (s === "done") { text = "✔ ONLINE"; cls = "ok"; }
        else if (s === "locked") { text = "✖ NEEDS POWER/PARTS"; cls = "locked"; }
        else if (s === "cooldown") { text = "⏳ RECHARGING"; cls = "locked"; }
        else if (id === "o2") { text = "● READY"; cls = "ok"; }
        else { text = "✖ OFFLINE"; cls = "bad"; }
        setText(row.status, text);
        row.row.dataset.state = cls;
      }

      // lockdown
      const L = state.lockdown;
      setClass(el.lockdownBox, "hidden", !L.active);
      if (L.active) {
        setText(el.lockdownText, `${L.rooms.map((r) => ROOMS[r].label).join(" + ")} sealed. Hold both door panels together.`);
        el.lockdownFill.style.width = `${L.progress * 100}%`;
      }

      // objective + banner
      setText(el.objective, objectiveFor(state, me));
      setText($("mission-chapter"), missionChapter(state));
      let banner = "";
      if(me?.subSeat&&state.sub?.air<30)banner='SUB AIR LOW / RETURN TO MEDICAL DOCK';
      else if(me?.subSeat&&state.sub?.hull<30)banner='SUB HULL CRITICAL / REPAIR OR ABANDON';
      else if(exteriorNotice(me))banner=exteriorNotice(me);
      else if (state.stage === "boarding") banner = `POD LAUNCH IN ${state.boarding?.endsIn ?? 0}s`;
      else if (L.active) banner = "⚠ LOCKDOWN ⚠";
      else if (state.oxygen < 15) banner = "⚠ OXYGEN CRITICAL ⚠";
      else if(state.stage==='main'&&state.threats?.electric?.room===me?.room&&!me?.ext&&state.roomCircuits?.[me.room]&&state.rooms[me.room].flood>.15&&!(state.empRooms?.[me.room]>state.t))banner='LIVE WATER / ISOLATE CIRCUIT OR LEAVE';
      else if(state.stage==='main'&&me?.ext&&state.threats?.mines.some(m=>m.active&&Math.hypot(m.x-me.x,m.z-me.z)<3.5))banner='MINE SENSOR / LIGHT OFF AND BACK AWAY';
      else if(state.stage==='main'&&state.threats?.warden)banner='LIGHT HUNTER / DARKEN CIRCUITS OR USE FLARE';
      setClass(el.banner, "hidden", !banner);
      if (banner) setText(el.banner, banner);

      // roster (rebuilt only when something changed)
      const key = state.players.map((p) => `${p.id}|${p.room}|${p.run ? 1 : 0}|${Math.round(p.hp / 10)}|${p.down ? 1 : 0}|${p.lost ? 1 : 0}|${p.conn ? 1 : 0}|${p.left ? 1 : 0}|${p.aboard ? 1 : 0}|${p.escaped ? 1 : 0}`).join(";") + `#${me?.id}`;
      if (key !== rosterKey) {
        rosterKey = key;
        el.rosterList.replaceChildren(...state.players.map((p) => {
          const row = document.createElement("div");
          row.className = "crew" + (p.id === me?.id ? " me" : "") + (p.run ? " noisy" : "") + (p.down || p.lost ? " out" : "");
          const d = DEPTS[p.dept];
          const name = document.createElement("button");name.className='chat-author';name.type='button';name.title='Mute or report crew';name.onclick=()=>openCrewControls(p);
          name.textContent = `${d ? `[${d.short}] ` : ""}${p.name}${p.id === me?.id ? " (you)" : ""}`;
          if (d) name.style.color = d.color;
          const where = document.createElement("small");
          const status = p.escaped ? "✔ ESCAPED" : p.lost ? "✖ LOST" : p.aboard ? "✔ SEATED IN POD" : p.down ? "✖ DOWN" : p.left ? "STATION SURVIVOR" : !p.conn ? "OFFLINE" : p.ext ? "OUTSIDE" : p.run ? "RUNNING" : "";
          where.textContent = `${status || `${p.hp}hp`} · ${p.aboard ? "POD" : p.ext ? "EXTERIOR" : ROOMS[p.room]?.label || "Central hub"}`;
          row.append(name, where);
          return row;
        }));
      }
    },

    // ---- briefing
    showBriefing(deptId, secondsLeft, state) {
      const d = DEPTS[deptId];
      setText(el.briefingRole, d ? `YOU ARE: ${d.label.toUpperCase()}` : "");
      setText(el.briefingBlurb, d ? d.blurb : "");
      setText(el.briefingTimer, `MISSION STARTS IN ${Math.max(0, Math.ceil(secondsLeft))}`);
      if (state) {
        const brief = roleBriefing(state, deptId);
        setText($("briefing-location"), brief.location); setText($("briefing-task"), brief.task);
        setText($("briefing-evacuation"), brief.evacuation); setText($("briefing-route"), brief.route);
      }
      el.briefing.classList.remove("hidden");
    },
    hideBriefing: () => el.briefing.classList.add("hidden"),

    // ---- down / spectate
    showDown(secondsLeft) {
      el.down.classList.remove("hidden");
      setText(el.downText, `A teammate can revive you (hold E next to you). ${Number.isFinite(secondsLeft) ? `You will be lost in ${Math.max(0, Math.ceil(secondsLeft))}s.` : "Keep the rescue channel open."}`);
    },
    hideDown: () => el.down.classList.add("hidden"),
    setSpectate(name) {
      setClass(el.spectate, "hidden", !name);
      if (name) setText(el.spectateName, name.toUpperCase());
    },

    // ---- Command console overlay
    setConsoleOpen: (open) => el.console.classList.toggle("hidden", !open),
    updateConsole(state, time, me) {
      const authorized = me?.dept === "command" || !state.players.some(p => p.dept === "command" && !p.lost && !p.aboard && !p.escaped);
      const circuitKey=JSON.stringify([state.roomCircuits,authorized]);
      const circuitList=$('console-circuits');if(circuitList.dataset.key!==circuitKey){circuitList.dataset.key=circuitKey;circuitList.replaceChildren(...ROOM_IDS.map(room=>{const button=document.createElement('button');button.className='secondary small';button.textContent=`${ROOMS[room].label}: ${state.roomCircuits?.[room]?'ISOLATE':'RESTORE'}`;button.disabled=!authorized;button.onclick=()=>net.circuit(room);return button;}));}
      if (authorized) drawSonar(el.sonar, state, time);
      else el.sonar.getContext("2d")?.clearRect(0, 0, el.sonar.width, el.sonar.height);
      setText(el.sonarReadout, authorized ? sonarReadout(state) : "COMMAND ACCESS REQUIRED · Ask your operator for contact bearing and range.");
      const key = ROOM_IDS.map((r) => `${state.rooms[r].closed ? 1 : 0}${state.rooms[r].locked ? 1 : 0}`).join("") + state.decoy.readyIn + state.decoy.active;
      if (el.consoleDoors._k !== key) {
        el.consoleDoors._k = key;
        el.consoleDoors.replaceChildren(...ROOM_IDS.map((r, i) => {
          const row = document.createElement("div");
          const rm = state.rooms[r];
          row.className = "console-row" + (rm.locked ? " locked" : rm.closed ? " closed" : "");
          row.textContent = `[${i + 1}] ${ROOMS[r].label.toUpperCase()}: ${rm.locked ? "LOCKED DOWN" : rm.closed ? "SEALED" : "OPEN"}`;
          return row;
        }));
        const dec = document.createElement("div");
        dec.className = "console-row" + (state.decoy.active ? " closed" : "");
        dec.textContent = state.decoy.active ? "[5] DECOY ACTIVE: the Leviathan is following it"
          : state.decoy.readyIn > 0 ? `[5] DECOY RECHARGING (${state.decoy.readyIn}s)` : "[5] LAUNCH DECOY (lures the Leviathan to the far side)";
        el.consoleDecoy.replaceChildren(dec);
      }
    },

    // ---- escape vote. Returns true while a vote is on screen.
    updateVote(state, me, onChange) {
      const v = state.stage === "vote" ? state.vote : null;
      setClass(el.vote, "hidden", !v);
      if (!v) { voteSel.clear(); voteKey = ""; voteSent = false; return false; }
      voteSent = v.voted.includes(me?.id);
      $("vote-confirm").disabled = voteSent || voteSel.size !== v.k || !!me?.lost;
      $("vote-abstain").disabled = voteSent || !!me?.lost;
      $("vote-confirm-status").textContent = voteSent ? "BALLOT CONFIRMED · Waiting for the remaining crew." : "Choose your full ballot, then confirm. Selecting a name does not submit a vote.";
      $("vote-confirm").onclick = () => { if (voteSel.size === v.k && !voteSent) onChange([...voteSel], true); };
      $("vote-abstain").onclick = () => { if (!voteSent) onChange([], true); };
      const alive = state.players.filter((p) => !p.lost);
      const key = alive.map((p) => p.id).join() + "|" + [...voteSel].sort().join() + "|" + v.k + "|" + v.voted.join() + "|" + (me?.lost ? 1 : 0);
      setText(el.voteText, `The pod has ${state.seats} seats for ${alive.length} survivors. Choose ${v.k} crew member${v.k > 1 ? "s" : ""} to stay behind. (${v.voted.length}/${alive.length} voted)`);
      setText(el.voteTimer, `VOTE ENDS IN ${v.endsIn}s`);
      if (key !== voteKey) {
        voteKey = key;
        el.voteList.replaceChildren(...alive.map((p) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "vote-option" + (voteSel.has(p.id) ? " picked" : "");
          const d = DEPTS[p.dept];
          b.textContent = `${voteSel.has(p.id) ? "✔ " : ""}${d ? `[${d.short}] ` : ""}${p.name}${p.id === me?.id ? " (you: volunteer)" : ""}`;
          b.disabled = !!me?.lost || voteSent;
          b.addEventListener("click", () => {
            if (voteSel.has(p.id)) voteSel.delete(p.id);
            else if (voteSel.size < v.k) voteSel.add(p.id);
            else { voteSel.delete([...voteSel][0]); voteSel.add(p.id); } // swap out the oldest pick
            voteKey = ""; // force redraw
            onChange([...voteSel], false);
          });
          return b;
        }));
      }
      return true;
    },

    // ---- match summary
    showGameOver(o) {
      $('timeline-entries').replaceChildren(...(o.timeline || []).map(e => {
        const li = document.createElement('li');
        li.textContent = `${fmtTime(e.t)} · ${e.actor ? e.actor + ': ' : ''}${e.text}`;
        return li;
      }));
      $('match-timeline').open = false;
      const win = o.result === "win";
      setText(el.overTitle, !win ? "ALL SIGNALS LOST" : o.grade === "full" ? "EVERYONE ESCAPED" : "SURVIVORS REACHED EXTRACTION");
      setText(el.overReason, o.reason+(o.storyEnding?` ${o.storyEnding.title}: ${o.storyEnding.text}`:''));
      setText(el.overStats, `TIME ${fmtTime(o.seconds || 0)} · ${(o.escaped || o.aboard).length} ESCAPED · ${o.capsules?.length || 0} VIA CAPSULE · ${o.leftBehind.length} STAYED AT THE STATION`);
      const head = document.createElement("tr");
      head.innerHTML = "<th>CREW</th><th>DEPARTMENT</th><th>CONTRIBUTIONS</th><th>FATE</th>";
      el.overTable.replaceChildren(head, ...o.crew.map((c) => {
        const tr = document.createElement("tr");
        tr.className = "fate-" + c.fate.replace(" ", "-");
        for (const text of [c.name, DEPTS[c.dept]?.label ?? "-", String(c.contribution || c.tasks), c.fate.toUpperCase()]) {
          const td = document.createElement("td"); td.textContent = text; tr.appendChild(td);
        }
        return tr;
      }));
      el.over.classList.toggle("win", win);
      el.over.classList.remove("hidden");
    },
    hideGameOver: () => el.over.classList.add("hidden"),
    showLost: (on) => el.lost.classList.toggle("hidden", !on)
  };
}
