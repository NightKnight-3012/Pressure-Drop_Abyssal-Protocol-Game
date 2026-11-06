import * as THREE from "three";

// Current Gobkit downloads have named clips. The GitHub mirror has one baked
// timeline; support its documented 24 fps segments without playing the death pose.
const SEGMENTS = { idle: [0, 29], attack: [30, 59], walk: [90, 119] };
export function createLeviathanAnimation(model, clips, { swim = "walk" } = {}) {
  const mixer = new THREE.AnimationMixer(model);
  const byName = Object.fromEntries(clips.map(clip => [clip.name.toLowerCase(), clip]));
  const baked = clips.length === 1 && clips[0].duration >= 119 / 24;
  const actions = {};
  if (baked) mixer.clipAction(clips[0]).play();
  else for (const name of ["idle", "walk", "attack"]) {
    if (byName[name]) actions[name] = mixer.clipAction(byName[name]);
  }
  let current = null, phase = 0;
  return {
    update(state, dt) {
      const requested = state === "attack" ? "attack" : swim;
      const next = baked || actions[requested] ? requested : actions.idle ? "idle" : null;
      if (next !== current) {
        actions[current]?.fadeOut(0.18);
        actions[next]?.reset().fadeIn(0.18).play();
        current = next; phase = 0;
      }
      const speed = state === "approach" ? 1.45 : state === "retreat" ? 1.25 : 1;
      const elapsed = Math.min(Math.max(dt, 0), 0.1) * speed;
      if (baked) {
        phase += elapsed;
        const [from, to] = SEGMENTS[current];
        mixer.setTime(from / 24 + phase % ((to - from) / 24));
      } else mixer.update(elapsed);
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); }
  };
}
