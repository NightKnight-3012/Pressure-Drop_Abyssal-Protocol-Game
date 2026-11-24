import { POD_ROUTE_LENGTH } from '../../shared/tactical.js';

// Route units remain authoritative. Longitudinal staging makes the same route
// read as a kilometre of rushing ocean without shortening the survivor's window.
export const POD_VISUAL_SCALE = 6;

export function updatePodTravel(view, pod, dt) {
  if (view.snapshot !== pod) {
    if (view.progress === undefined || Math.abs(pod.progress - view.progress) > 3) view.progress = pod.progress;
    view.snapshot = pod;
    view.age = 0;
  }
  view.age += dt;
  const moving = pod.status === 'running' && (pod.phase === 'run' || pod.phase === 'approach');
  const speed = moving ? Math.max(0,pod.speed) : 0;
  // Coast between 20 Hz snapshots and limit how far the view can drift when
  // a packet is late.
  const predicted = Math.min(POD_ROUTE_LENGTH,pod.progress + speed*Math.min(view.age,.1));
  const coast = speed * Math.min(dt,Math.max(0,.1-(view.age-dt)));
  const estimate = view.progress + coast;
  const eased = estimate+(predicted-estimate)*(1-Math.exp(-14*dt));
  const limit = Math.min(POD_ROUTE_LENGTH,pod.progress+speed*.1);
  view.progress = moving ? Math.max(view.progress,Math.min(limit,eased)) : eased;
  return view.progress;
}

export function podMotionTarget(pod, reduced = false, rear = false) {
  const running = pod.status === "running" && pod.phase !== "ascent", speed = running ? Math.max(0, pod.speed || 0) : 0;
  const boost = running && (pod.boosting ?? speed > 3.4);
  return { speed, boost, travelSpeed: speed * POD_VISUAL_SCALE,
    fov: reduced || rear ? 68 : 68 + Math.min(12, speed * 3) + (boost ? 8 : 0),
    danger: running ? Math.max(0, Math.min(1, (24 - pod.creatureDistance) / 20)) : 0 };
}
