import { shotPose } from "./presentation.js";
// The incident record plays while the authoritative simulation is paused for briefing.
export function createPrologue(onSkip) {
  const el = document.createElement("section"); el.id = "prologue";
  el.innerHTML = '<div class="prologue-meta">NEREID-9 / INCIDENT RECORD / 1,800 METRES <span class="shot-count"></span></div><div class="prologue-copy"><small></small><h1></h1><p></p></div><div class="story-progress" aria-hidden="true"><i></i><i></i><i></i></div><button type="button">Skip incident record</button>';
  document.getElementById("game").append(el);
  let skipped = false, lastShot = -1, wasActive = null;
  const kicker = el.querySelector("small"), title = el.querySelector("h1"), copy = el.querySelector("p");
  el.querySelector("button").onclick = () => { skipped = true; document.activeElement?.blur?.(); el.classList.add("hidden"); document.body.classList.remove("in-prologue"); onSkip(); };
  const shots = [
    ["06:14 / BEFORE CONTACT", "WE THOUGHT IT WAS AN ECHO", "NEREID-9 was surveying a fracture beneath the seabed. The acoustic drill returned a signal that did not match the rock. We sent a second pulse.", [27, 9, 30], [0, 0, 0]],
    ["06:17 / CONTACT", "SOMETHING ANSWERED", "The impact severed the main lift cable. Bulkheads failed. Outside the glass, something followed the sound of our machinery.", [15, 2.4, 14], [0, 1, 0]],
    ["06:19 / EMERGENCY CHANNEL", "ONE ROUTE LEFT", "The pod lost its ascent tanks. Restore the launch systems, then reach the auxiliary lift in the basalt ridge. Dock slowly: the armored shutter is your shelter. Maintenance capsules offer a second route.", [5, 2.3, 5], [7, 1.3, 7]]
  ];
  return {
    update(remaining, camera, reduced) {
      const active = remaining > 10 && !skipped;
      if (active !== wasActive) { el.classList.toggle("hidden", !active); document.body.classList.toggle("in-prologue", active); wasActive = active; }
      if (!active) return false;
      const elapsed = Math.max(0, 34 - remaining), shot = Math.min(2, Math.floor(elapsed / 8)), s = shots[shot];
      if (shot !== lastShot) { kicker.textContent = s[0]; title.textContent = s[1]; copy.textContent = s[2]; el.querySelector('.shot-count').textContent = `0${shot + 1} / 03`; lastShot = shot; }
      const progress = (elapsed % 8) / 8;
      el.querySelectorAll('.story-progress i').forEach((bar, i) => bar.style.setProperty('--progress', i < shot ? 1 : i === shot ? progress : 0));
      camera.position.set(...shotPose(s[3], [s[3][0] - 1.2, s[3][1] + 0.2, s[3][2] - 0.8], progress, reduced));
      camera.lookAt(...s[4]); return true;
    },
    dispose() { el.remove(); document.body.classList.remove("in-prologue"); }
  };
}
