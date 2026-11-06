// Shared names and positions keep rendering, interaction and server validation aligned.
export const MISSIONS = {
  blackout: { name: "Blackout", brief: "Restore the station before its emergency reserves fail.", leak: 1, oxygen: 100 },
  pressure: { name: "Pressure surge", brief: "A damaged pump is losing the fight against the ocean.", leak: 1.22, oxygen: 100 },
  silence: { name: "Silent running", brief: "Low air reserves. Repairs carry further through the hull.", leak: 0.9, oxygen: 78 }
};
export const FINALE_POINTS = {
  board: { x: 7, z: 6.45, label: "Escape pod hatch", room: "pod", rot: Math.PI, kind: "board" },
  beacon: { x: -9.3, z: -6, label: "Emergency acoustic beacon", room: "control", rot: Math.PI / 2, kind: "beacon" },
  capsule: { x: -6.5, z: -2.8, label: "Maintenance escape capsule", room: "control", rot: Math.PI, kind: "capsule" }
};
export const POD_ROUTE_LENGTH = 210;
export const POD_DOCKING = { approachAt: 198, tolerance: 0.32, lockSeconds: 3, sealSeconds: 2.4, liftSeconds: 12 };
export const CAPSULE_STEPS = ["Reconnect the power cell", "Equalize the pressure seal", "Release the damaged hatch"];
export const REPAIR_TYPES = { power: "circuit", pump: "pressure", console: "routing", lifesupport: "airflow" };
export const POD_ACTIONS = ["pilot", "repair", "repairStop", "sonar", "countermeasure", "propose", "accept", "decline"];

export function repairSpec(id, seed = 0) {
  const type = REPAIR_TYPES[id];
  const target = type === "circuit" ? 1 + ((seed >>> 2) % 7) : 1 + ((seed >>> (id === "pump" ? 4 : 6)) % 4);
  return { type, target, value: type === "circuit" ? 0 : 1, solved: false };
}
export const atPoint = (p, point, range = 2.05) => !p.exterior && Math.hypot(p.x - point.x, p.z - point.z) <= range;
