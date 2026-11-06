import {SUB_DOCK,SUB_BOARD,SUB_TUNING as T} from '../shared/submersible.js';
import {EXT_LIMIT,REPAIR_RANGE,STATIONS,AIRLOCK_ARRIVE_INT,pathBlocked,nearestFree,collides} from '../shared/layout.js';
const active=p=>p.connected&&!p.lost&&!p.downed&&!p.aboard&&!p.escaped;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const safeExit=(s,side=1)=>{const point=nearestFree(Math.max(-EXT_LIMIT+.6,Math.min(EXT_LIMIT-.6,s.x+side*2)),s.z,[],true);return Math.max(Math.abs(point.x),Math.abs(point.z))>EXT_LIMIT-.5?{x:s.x,z:s.z}:point;};
export function createSub(){return {...SUB_DOCK,yaw:0,speed:0,hull:T.hull,air:T.air,driver:null,passenger:null,docked:true,steer:0,throttle:0,inputUntil:0,bumpAt:0,flareCharges:3,scanCharges:2};}
export function boardSub(game,p){
  const s=game.sub;
  if(game.status!=='playing'||!['main','vote','boarding'].includes(game.stage)||!active(p)||p.subSeat||s.hull<=0||s.air<10)return 'The survey sub is unavailable.';
  if(!p.exterior){if(!s.docked||!game.tasks.power.done||dist(p,SUB_BOARD)>REPAIR_RANGE)return 'Board the docked survey sub at the powered Medical survey console beside the airlock.';}
  else if(dist(p,s)>T.boardRange||Math.abs(s.speed)>.6||p.depth>1.25)return 'Surface to the survey level and approach the stationary sub hatch.';
  const seat=!s.driver?'driver':!s.passenger?'passenger':null;if(!seat)return 'Both survey-sub seats are occupied.';
  s[seat]=p.id;p.subSeat=seat;p.exterior=true;p.depth=0;p.vertical=0;p.x=s.x;p.z=s.z;p.running=false;
  if(seat==='driver'){s.steer=s.throttle=s.inputUntil=0;}
  (game.pendingEvents??=[]).push({type:'subBoarded',by:p.id,seat},{type:'teleport',id:p.id});return null;
}
export function controlSub(game,p,data){
  if(game.status!=='playing'||!['main','vote','boarding'].includes(game.stage)||!active(p)||p.subSeat!=='driver'||game.sub.driver!==p.id)return 'Only the active survey-sub pilot can steer.';
  if(!data||![data.steer,data.throttle].every(v=>Number.isFinite(v)&&v>=-1&&v<=1))return 'Invalid sub controls.';
  game.sub.steer=data.steer;game.sub.throttle=data.throttle;game.sub.inputUntil=game.time+.35;return null;
}
export function canDockSub(game,p){const s=game.sub;return game.status==='playing'&&['main','vote','boarding'].includes(game.stage)&&active(p)&&p.subSeat==='driver'&&s.driver===p.id&&s.hull>0&&game.tasks.power.done&&dist(s,SUB_DOCK)<=T.dockRange&&Math.abs(s.speed)<.6;}
export function dockSub(game,players,events){
  const s=game.sub;s.x=SUB_DOCK.x;s.z=SUB_DOCK.z;s.speed=s.throttle=s.steer=0;s.docked=true;
  for(const seat of ['driver','passenger']){const p=players.find(p=>p.id===s[seat]);if(p){p.subSeat=null;p.exterior=false;p.depth=0;p.x=AIRLOCK_ARRIVE_INT.x;p.z=AIRLOCK_ARRIVE_INT.z;events.push({type:'teleport',id:p.id});}s[seat]=null;}
  events.push({type:'subDocked'});
}
export function exitSub(game,p){
  const s=game.sub;if(!active(p)||!p.subSeat||s[p.subSeat]!==p.id)return 'You are not in the survey sub.';
  const side=p.subSeat==='driver'?-1:1,spot=nearestFree(s.x+Math.cos(s.yaw)*2*side,s.z-Math.sin(s.yaw)*2*side,[],true);
  if(Math.max(Math.abs(spot.x),Math.abs(spot.z))>EXT_LIMIT-.5||collides(spot.x,spot.z,.4,[],true))return 'Hatch obstructed. Move into clear water before exiting.';
  s[p.subSeat]=null;p.subSeat=null;p.x=spot.x;p.z=spot.z;p.exterior=true;p.depth=0;p.running=false;
  (game.pendingEvents??=[]).push({type:'subExited',by:p.id},{type:'teleport',id:p.id});return null;
}
export function subAction(game,players,p,action){
  if(game.status!=='playing'||!active(p)||!p.subSeat||game.sub[p.subSeat]!==p.id)return 'Board the survey sub first.';
  const s=game.sub;
  if(action==='exit')return exitSub(game,p);
  if(action==='pilot'){
    const driver=players.find(q=>q.id===s.driver);if(p.subSeat==='driver')return 'You already have the controls.';
    if(driver&&active(driver))return 'The current pilot still has the controls.';
    s.passenger=driver?.id??null;if(driver)driver.subSeat='passenger';s.driver=p.id;p.subSeat='driver';s.throttle=s.steer=0;s.inputUntil=0;
    (game.pendingEvents??=[]).push({type:'subPilot',by:p.id});return null;
  }
  if(!['main','vote','boarding'].includes(game.stage)||s.hull<=0)return 'Survey-sub equipment is unavailable.';
  if(action!=='flare'&&action!=='scan')return 'Unknown sub action.';
  const passenger=players.find(q=>q.id===s.passenger);if(p.subSeat==='driver'&&passenger&&active(passenger))return 'The passenger operates the survey equipment while both seats are occupied.';
  if(action==='flare'){
    if(s.flareCharges<=0||game.time<(s.flareAt||0)||game.effects.length>=8)return 'Flare rack empty or cooling.';
    const point={x:s.x+Math.sin(s.yaw)*2,z:s.z+Math.cos(s.yaw)*2};if(collides(point.x,point.z,.2,[],true)||Math.max(Math.abs(point.x),Math.abs(point.z))>EXT_LIMIT-.5){point.x=s.x;point.z=s.z;}
    game.effects.push({id:++game.effectSeq,item:'flare',by:p.id,...point,exterior:true,until:game.time+24});s.flareCharges--;s.flareAt=game.time+8;
    (game.pendingEvents??=[]).push({type:'subFlare',by:p.id,...point});return null;
  }
  if(s.scanCharges<=0||game.time<game.scanReadyAt)return 'Scanner battery empty or crew channel recovering.';
  const pos={x:Math.cos(game.lev.angle)*game.lev.dist,z:Math.sin(game.lev.angle)*game.lev.dist};
  game.scan={...pos,at:game.time,until:game.time+6};game.scanPulse={x:s.x,z:s.z,until:game.time+1.5};game.scanReadyAt=game.time+25;s.scanCharges--;
  (game.pendingEvents??=[]).push({type:'subScan',by:p.id});return null;
}
export function tickSub(game,players,dt){
  const s=game.sub,events=[],hits=[];
  for(const seat of ['driver','passenger']){const p=players.find(p=>p.id===s[seat]);if(s[seat]&&(!p||p.lost||p.downed||p.escaped||p.aboard)){if(p){p.subSeat=null;p.exterior=true;p.depth=0;const spot=safeExit(s);p.x=spot.x;p.z=spot.z;events.push({type:'teleport',id:p.id});}s[seat]=null;}}
  const occupants=players.filter(p=>p.subSeat&&s[p.subSeat]===p.id),driver=players.find(p=>p.id===s.driver);
  const controlling=driver&&active(driver)&&game.time<s.inputUntil&&s.hull>0&&['main','vote','boarding'].includes(game.stage);
  const throttle=controlling?s.throttle:0,steer=controlling?s.steer:0;
  s.yaw=Math.atan2(Math.sin(s.yaw-steer*T.turn*dt),Math.cos(s.yaw-steer*T.turn*dt));
  s.speed+=(throttle*(throttle<0?T.reverse:T.speed)-s.speed)*Math.min(1,dt*3);
  const x=s.x-Math.sin(s.yaw)*s.speed*dt,z=s.z-Math.cos(s.yaw)*s.speed*dt;
  if(Math.abs(x)>EXT_LIMIT-T.radius||Math.abs(z)>EXT_LIMIT-T.radius||pathBlocked(s.x,s.z,x,z,T.radius,[],true)){
    if(Math.abs(s.speed)>1&&game.time>=s.bumpAt){s.hull=Math.max(0,s.hull-Math.min(8,Math.abs(s.speed)*1.2));s.bumpAt=game.time+1.2;events.push({type:'subBump',x:s.x,z:s.z});}s.speed=0;
  }else{s.x=x;s.z=z;}
  if(Math.abs(s.speed)>.1||dist(s,SUB_DOCK)>T.dockRange)s.docked=false;
  const moving=!!occupants.length&&Math.abs(s.speed)>.4;if(moving!==!!s.moving){s.moving=moving;events.push({type:'subEngine',active:moving,x:s.x,z:s.z});}
  if(s.docked&&game.tasks.power.done)s.air=Math.min(T.air,s.air+dt*12);
  else if(occupants.length)s.air=Math.max(0,s.air-dt*occupants.length*.5);
  if(s.hull<=0){for(const p of occupants){p.subSeat=null;p.exterior=true;p.depth=0;const point=safeExit(s,p.id===s.driver?-1:1);p.x=point.x;p.z=point.z;events.push({type:'teleport',id:p.id});}s.driver=s.passenger=null;s.throttle=s.steer=s.speed=0;if(!s.destroyed){s.destroyed=true;events.push({type:'subDestroyed'});}}
  for(const p of occupants){if(!p.subSeat)continue;p.x=s.x;p.z=s.z;p.depth=0;p.exterior=true;p.running=false;if(s.air<=0&&active(p))hits.push({id:p.id,amount:dt*6});}
  return {events,hits};
}
