// The authored animal faces +X. Three.js positive yaw rotates +X toward -Z.
import {EXTERIOR_STRUCTURES} from '../../shared/layout.js';

// Decorative vertical clearance only; the server still owns the predator's route and strikes.
export function leviathanClearance(lev){
  const x=Math.cos(lev.angle)*lev.dist,z=Math.sin(lev.angle)*lev.dist;let height=2.4;
  for(const s of EXTERIOR_STRUCTURES){
    const dx=Math.max(0,Math.abs(x-s.cx)-s.w/2),dz=Math.max(0,Math.abs(z-s.cz)-s.d/2);
    const distance=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,(16-distance)/6)),weight=t*t*(3-2*t);
    height=Math.max(height,2.4+(s.h+4-2.4)*weight);
  }
  const blend=Math.max(0,Math.min(1,(lev.dist-20)/8));return 2.4+(height-2.4)*blend;
}

// Shortest-arc turning avoids instant reversals and wrapping at +/- pi.
export function turnLeviathan(current,target,dt){
  if(!Number.isFinite(dt)||dt<=0)return current;
  const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));
  const limit=Math.min(.1,dt)*1.35;
  return current+Math.max(-limit,Math.min(limit,delta));
}
export function leviathanYaw(previous, position, fallback = 0) {
  if (!previous) return fallback;
  const dx = position.x - previous.x, dz = position.z - previous.z;
  return dx * dx + dz * dz > 1e-8 ? -Math.atan2(dz, dx) : fallback;
}

export function initialLeviathanYaw(lev) {
  const heading = lev.state === "patrol" ? lev.angle + (lev.patrolDir < 0 ? -1 : 1) * Math.PI / 2
    : lev.state === "retreat" ? lev.angle : lev.angle + Math.PI;
  return -heading;
}

export function swimWave(x, time) {
  const distance = Math.max(0, (5.7 - x) / 21);
  return Math.sin(time * 1.4 - (5.7 - x) * 0.35) * Math.pow(distance, 1.4) * 1.5;
}
