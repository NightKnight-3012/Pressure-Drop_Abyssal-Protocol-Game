export const PRACTICE_STEPS=Object.freeze({
  move:'Walk a few metres using your movement keys. Mouse look starts when you click the view. Your suit shows health, air and personal noise.',
  power:'Enter Engineering in the east wing. Aim at the Power core on its east wall, open its calibration, match the circuit diagram, then hold your interaction key to finish.',
  patch:'A training pipe leak is marked on the Engineering floor. Aim at it and hold your interaction key until the patch completes. You can use a carried repair kit to speed it up.',
  tool:'Use hotbar 1 or 2 to deploy a flare or acoustic lure. These tools cost a charge and make noise. The creature cannot hurt you in this simulation.',
  systems:'Restore the flood pump in Engineering, Life support in Medical and the Command console in Control. Follow each calibration, then finish the held repair. Solo crew can cover every role.',
  outside:'Cycle the Medical airlock, repair the marked outside cable, then return. Space ascends and Ctrl descends; equipment is at the survey line. The optional sub uses a separate nearby boarding panel.',
  return:'Return through the west Medical airlock, or dock the survey sub at its marked pad. Outside work is complete. Station systems and air reserves are waiting inside.',
  launch:'Reach the Pod launch console and hold your interaction key. Then walk to the pod hatch and board. Training uses one seat for one learner.',
  pod:'Board the escape-pod hatch. After release, pilot the rubble corridor. A/D steer, S brakes, Shift boosts. At the recovery cradle, centre the pod and hold S until its clamps engage.',
  complete:'Recovery drill complete. Review the debrief, then create a normal room when you are ready.'
});
export function practiceGuidance(state){const step=state.practice?.step;if(!step)return null;return `SOLO TRAINING / ${PRACTICE_STEPS[step]||PRACTICE_STEPS.move}`;}
export function practiceTargetAllowed(step,id){
  if(!step)return true;
  if(typeof id!=='string')return false;
  if(step==='power')return id==='power';
  if(step==='patch')return id==='breach:practice';
  if(step==='systems')return ['pump','lifesupport','console'].includes(id);
  if(step==='outside')return /^j[1-3]$/.test(id)||['airlock_in','airlock_out','sub:board','sub:repair'].includes(id);
  if(step==='return')return ['airlock_in','airlock_out','sub:board','sub:dock'].includes(id);
  if(step==='launch')return id==='launch';
  if(step==='pod')return id==='board';
  return false;
}
