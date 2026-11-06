import {controlText} from './control-text.js';
import {SUB_DOCK,SUB_TUNING} from '../../shared/submersible.js';
import {bearingTo} from './gear-guidance.js';
export function createSubHud(net){
  const root=document.getElementById('sub-hud');
  for(const [id,action] of [['sub-exit','exit'],['sub-pilot','pilot'],['sub-flare','flare'],['sub-scan','scan']])document.getElementById(id).onclick=()=>net.subAction(action);
  const dock=document.getElementById('sub-dock');dock.onpointerdown=e=>{e.currentTarget.setPointerCapture?.(e.pointerId);net.interact('sub:dock');};dock.onpointerup=dock.onpointercancel=dock.onlostpointercapture=()=>net.cancel();
  let keyboardDock=false;
  const stopDock=()=>{if(keyboardDock){keyboardDock=false;net.cancel();}};
  dock.onkeydown=e=>{if(!['Space','Enter'].includes(e.code))return;e.preventDefault();e.stopPropagation();if(!e.repeat&&!keyboardDock&&!dock.disabled){keyboardDock=true;net.interact('sub:dock');}};
  dock.onkeyup=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();e.stopPropagation();stopDock();}};
  dock.onblur=stopDock;
  let key='';
  return {update(state,me){const on=!!me?.subSeat;root.classList.toggle('hidden',!on);document.body.classList.toggle('in-sub',on);if(!on)return;const s=state.sub,h=state.holds[me.id],dockable=me.subSeat==='driver'&&state.power&&Math.hypot(s.x-SUB_DOCK.x,s.z-SUB_DOCK.z)<SUB_TUNING.dockRange&&Math.abs(s.speed)<.6;
    const passenger=state.players.find(p=>p.id===s.passenger),operator=me.subSeat==='passenger'||!passenger||!passenger.conn||passenger.down||passenger.lost;
    root.classList.toggle('critical',s.hull<30||s.air<30);
    const next=JSON.stringify([controlText('WASD E F Shift'),me.subSeat,s.hull,s.air,s.speed,s.x,s.z,s.yaw,s.flareCharges,s.scanCharges,state.scan,state.scanReadyIn,dockable,operator,h?.progress]);if(next===key)return;key=next;
    document.getElementById('sub-title').textContent=`SKIFF-2 / ${me.subSeat==='driver'?'PILOT':'SURVEY OPERATOR'}`;
    document.getElementById('sub-status').textContent=`HULL ${Math.ceil(s.hull)}% / AIR ${Math.ceil(s.air)}s / ${Math.abs(s.speed).toFixed(1)} m/s`;
    document.getElementById('sub-bearing').textContent=`MEDICAL DOCK ${bearingTo(SUB_DOCK,s,s.yaw)} / FROM BOW / DIRECT BEARING${state.scan?'\nLAST CONTACT '+bearingTo(state.scan,s,s.yaw)+' / '+Math.floor(state.scan.age)+'s OLD':''}`;
    document.getElementById('sub-help').textContent=controlText(dockable?'Hold your interaction key or DOCK button to seal the transfer hatch.':'W/S thrust / A/D steer / F lamp / E exit / X flare / T scan / V take vacant pilot seat');
    dock.disabled=!dockable;dock.textContent=h?.id==='sub:dock'?`SEALING ${Math.round(h.progress*100)}%`:'HOLD TO DOCK';
    const f=document.getElementById('sub-flare'),scan=document.getElementById('sub-scan');f.textContent=`FLARE (${s.flareCharges})`;scan.textContent=`SCAN (${s.scanCharges})`;f.disabled=!operator||!s.flareCharges;scan.disabled=!operator||!s.scanCharges||state.scanReadyIn>0;
  },dispose(){stopDock();root.classList.add('hidden');document.body.classList.remove('in-sub');for(const id of ['sub-exit','sub-pilot','sub-flare','sub-scan'])document.getElementById(id).onclick=null;dock.onpointerdown=dock.onpointerup=dock.onpointercancel=dock.onlostpointercapture=dock.onkeydown=dock.onkeyup=dock.onblur=null;}};
}
