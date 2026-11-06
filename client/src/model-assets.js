// CC0 models by Quaternius and Gobkit. See ASSETS.md for provenance.
export const MODEL_ROOT = "https://raw.githubusercontent.com/danvanderboom/Aetherium/main/samples/unity/Aphelion/Assets/ThirdParty/Quaternius/";
export const MODEL_FILES = {
  crew: "Animated/nereid-diver.gltf",
  crate: "prop-scifi-crate.glb",
  computer: "prop-scifi-computer.glb",
  battery: "prop-battery.glb",
  pipes: "prop-pipes-panel.glb",
  pod: "prop-scifi-pod.glb",
  leviathan: "leviathan.glb"
};

export function modelUrls(id) {
  if (id === "crew") return []; // Authored local derivative; never fall back to the animal source.
  return id === "leviathan" ? [
    "https://gobkit.com/freebies/animal/Anglerfish.glb",
    "https://raw.githubusercontent.com/Ariescar/gobkit-free-assets/main/animal/Anglerfish.glb"
  ] : [MODEL_ROOT + MODEL_FILES[id]];
}
