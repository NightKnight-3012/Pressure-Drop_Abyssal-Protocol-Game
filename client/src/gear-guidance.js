// Text as well as bearing: navigation never relies on colour or animation.
export function bearingTo(point, viewer, yaw = 0) {
  const dx=point.x-viewer.x, dz=point.z-viewer.z;
  const side=Math.cos(yaw)*dx-Math.sin(yaw)*dz, forward=-Math.sin(yaw)*dx-Math.cos(yaw)*dz;
  const angle=Math.atan2(side,forward), distance=Math.round(Math.hypot(dx,dz));
  const direction=distance<=2?'HERE':Math.abs(angle)<Math.PI/6?'AHEAD':Math.abs(angle)>Math.PI*5/6?'BEHIND':angle>0?'RIGHT':'LEFT';
  return `${distance}m / ${direction}`;
}
