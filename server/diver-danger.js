export function updateGrabExposure(previous,near,seconds,warningSeconds){
 const before=Number.isFinite(previous)?Math.max(0,previous):0,dt=Number.isFinite(seconds)?Math.max(0,seconds):0;
 const exposure=near?Math.min(warningSeconds+.25,before+dt):Math.max(0,before-dt*2);
 return {exposure,damaging:near&&exposure>warningSeconds};
}
