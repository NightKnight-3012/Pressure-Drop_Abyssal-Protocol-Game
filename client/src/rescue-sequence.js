// A continuous, authored extraction. World-space metres, not a fade between sets.
export const RESCUE_DURATION=26;
export const RESCUE_SEA_LEVEL=74;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function rescuePose(seconds, compact=false) {
  const t=Math.max(0,Math.min(RESCUE_DURATION,seconds));
  const rise=t<9?35+27*smooth(t/9):62+12.5*smooth((t-9)/5);
  const secured=smooth((t-18)/7), surface=smooth((rise-67)/7);
  const settle=1.2*smooth((t-24)/2);
  const y=(compact?(t<14?rise:74.5+secured*2.5):rise+secured*2.5)-settle;
  const cameraY=y<73.6?Math.min(y+4,73.7):73.7+(y+4-73.7)*smooth((y-73.6)/.9);
  return {phase:t<4?'shaft':t<9?'open-water':t<14?'surface':t<18?'hook':'recovery',
    body:[-8*secured,y,-3],surface,secured,
    camera:[9-3*secured,cameraY,12+5*surface],target:[-3*secured,y,-4],
    hookY:t<14?86:t<18?86-9.7*smooth((t-14)/4):76.3+secured*2.5-settle,
    text:t<4?(compact?'MAINTENANCE CAPSULE / ASCENT TANKS HOLDING':'WINCH CARRIER / LEAVING THE ARMORED SHAFT'):t<9?'ASCENT LINE / FOLLOWING ASTERION’S RECOVERY CABLE':t<14?'SURFACE CONTACT / EMERGENCY BUOYANCY DEPLOYED':t<18?'ASTERION / RECOVERY SLING ATTACHING':t<24?'ASTERION / HOISTING THE CREW ABOARD':'ASTERION / LOWERING ONTO THE RECOVERY DECK'};
}
