// Route units remain authoritative. Longitudinal staging makes the same route
// read as a kilometre of rushing ocean without shortening the survivor's window.
export const POD_VISUAL_SCALE = 6;
export function podMotionTarget(pod, reduced = false, rear = false) {
  const running = pod.status === "running" && pod.phase !== "ascent", speed = running ? Math.max(0, pod.speed || 0) : 0;
  const boost = running && (pod.boosting ?? speed > 3.4);
  return { speed, boost, travelSpeed: speed * POD_VISUAL_SCALE,
    fov: reduced || rear ? 68 : 68 + Math.min(12, speed * 3) + (boost ? 8 : 0),
    danger: running ? Math.max(0, Math.min(1, (24 - pod.creatureDistance) / 20)) : 0 };
}
