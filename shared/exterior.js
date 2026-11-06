import {EXT_LIMIT,SWIM_SPEED,AIRLOCK_ARRIVE_EXT} from './layout.js';
import {suitDrain,DIVE_SPEED} from './ocean-floor.js';
export const EXTERIOR_ZONES = {
  flats:{id:'flats',label:'STATION FLATS',color:0x03141f,near:5,far:65,lamp:30},
  garden:{id:'garden',label:'VENT GARDEN',color:0x091c20,near:3,far:25,lamp:20},
  wreck:{id:'wreck',label:'SURVEY WRECK FIELD',color:0x071923,near:4,far:45,lamp:27},
  cleft:{id:'cleft',label:'BASALT CLEFT',color:0x06121d,near:3,far:35,lamp:25}
};
export function exteriorZone(x,z){return x<-24?EXTERIOR_ZONES.garden:x>27?EXTERIOR_ZONES.wreck:z<-26?EXTERIOR_ZONES.cleft:EXTERIOR_ZONES.flats;}
export function exteriorNotice(p){
  if(!p?.ext||p.lost||p.down||p.escaped||p.aboard||p.subSeat)return null;
  const returnReserve=Math.max(20,Math.ceil((Math.hypot(p.x-AIRLOCK_ARRIVE_EXT.x,p.z-AIRLOCK_ARRIVE_EXT.z)/SWIM_SPEED+(p.depth||0)/DIVE_SPEED)*suitDrain(p.x,p.z,p.depth||0))+18);
  if(p.suit<=returnReserve)return 'SUIT AIR LOW / RETURN TO MEDICAL AIRLOCK';
  if(Math.max(Math.abs(p.x),Math.abs(p.z))>=EXT_LIMIT-7)return 'SURVEY BOUNDARY / TURN BACK AT THE MARKERS';
  return null;
}
