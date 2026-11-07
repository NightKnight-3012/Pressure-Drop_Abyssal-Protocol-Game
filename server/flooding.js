// Water quantities are room-depth equivalents, not cubic metres.
export const FLOODING={growthAfter:45,growthSeconds:90,maxSeverity:2.5,breathSeconds:12,breathRecovery:3};
export function breachSeverity(b,time){return 1+Math.min(1,Math.max(0,(time-(b.since??time)-FLOODING.growthAfter)/FLOODING.growthSeconds))*(FLOODING.maxSeverity-1);}
export function pumpCapacity(scale,rate){return rate*(1+Math.max(0,scale.maxBreaches-2));}
export function drainShared(rooms,capacity,dt){const wet=Object.values(rooms).filter(r=>r.flood>0),total=wet.reduce((sum,r)=>sum+r.flood,0);if(!total)return;const fraction=Math.min(1,Math.max(0,capacity*dt)/total);for(const room of wet)room.flood*=1-fraction;}
