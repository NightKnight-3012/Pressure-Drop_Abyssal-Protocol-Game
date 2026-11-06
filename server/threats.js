// Pure, seeded state machines. The rules module applies the returned damage.
import {ROOM_IDS,FLOOD_MAX,roomAt,nearestFree,pathBlocked} from '../shared/layout.js';
import {MINE_SITES,DIFFICULTIES} from '../shared/fieldwork.js';
export const THREAT_TUNING=Object.freeze({skitterFirst:140,skitterGap:100,skitterWarning:8,skitterLife:50,skitterSpeed:1.5,skitterDps:3,electricFirst:170,electricWarning:8,electricLife:45,electricDps:4,mineRadius:2.8,mineFuse:4,mineDamage:30,wardenFirst:480,wardenWarning:9,wardenDps:6,wardenLife:75});
const active=p=>p.connected&&!p.lost&&!p.downed&&!p.aboard&&!p.escaped;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function createThreats(scale,rng){return {skitters:[],skitterAt:THREAT_TUNING.skitterFirst+rng()*30,electric:null,electricAt:THREAT_TUNING.electricFirst+rng()*35,mines:MINE_SITES.map((m,i)=>({...m,id:i,fuse:0,active:true,warned:false})),warden:null,wardenAt:THREAT_TUNING.wardenFirst+rng()*45,wardenDone:false,seq:0};}
export function tickThreats(game,players,dt){
  const out={events:[],hits:[]},h=game.threats,T=THREAT_TUNING,D=DIFFICULTIES[game.difficulty]||DIFFICULTIES.normal;
  const tell=(kind,room)=>out.events.push({type:'hazardWarning',kind,room});
  const hit=(p,amount,cause)=>out.hits.push({id:p.id,amount:amount*D.damage,cause});
  if(game.stage!=='main')return out;
  const crew=players.filter(active),closed=ROOM_IDS.filter(r=>game.rooms[r].closed),isFlared=(point,ext)=>game.effects.some(e=>e.item==='flare'&&e.exterior===ext&&distance(e,point)<5);
  if(game.tasks.power.done&&game.tasks.pump.done&&game.time>=h.skitterAt){
    const breach=game.breaches.find(b=>!h.skitters.some(s=>s.breach===b.id));
    if(breach&&h.skitters.length<Math.min(3,game.scale.maxBreaches)){
      const point=nearestFree(breach.x,breach.z,closed,false);
      h.skitters.push({...point,id:++h.seq,breach:breach.id,room:breach.room,ready:game.time+T.skitterWarning,until:game.time+T.skitterLife,stunned:0});tell('skitter',breach.room);
    }h.skitterAt=game.time+T.skitterGap/D.frequency;
  }
  h.skitters=h.skitters.filter(s=>game.time<s.until&&game.breaches.some(b=>b.id===s.breach));
  for(const s of h.skitters){
    if(game.time<s.ready||game.time<s.stunned||isFlared(s,false))continue;
    const targets=crew.filter(p=>!p.exterior&&roomAt(p.x,p.z)===s.room).sort((a,b)=>distance(a,s)-distance(b,s));
    const target=targets[0];if(!target)continue;
    const d=distance(s,target),step=Math.min(d,T.skitterSpeed*dt);
    if(d>.7){const x=s.x+(target.x-s.x)/d*step,z=s.z+(target.z-s.z)/d*step;if(!pathBlocked(s.x,s.z,x,z,.18,closed,false)){s.x=x;s.z=z;}}
    if(distance(s,target)<1&&!isFlared(target,false))hit(target,T.skitterDps*dt,'skitter');
  }
  if(!h.electric&&game.tasks.power.done&&game.time>=h.electricAt){const room=ROOM_IDS.find(r=>game.rooms[r].flood>.3&&game.roomCircuits[r]);if(room){h.electric={room,ready:game.time+T.electricWarning,until:game.time+T.electricWarning+T.electricLife};tell('electric',room);}h.electricAt=game.time+130/D.frequency;}
  if(h.electric){const e=h.electric;if(game.time>=e.until)h.electric=null;else if(game.time>=e.ready&&game.roomCircuits[e.room]&&game.time>=(game.empRooms[e.room]||0)&&game.rooms[e.room].flood>.15)for(const p of crew)if(!p.exterior&&roomAt(p.x,p.z)===e.room)hit(p,T.electricDps*dt,'electric');}
  for(const mine of h.mines){if(!mine.active)continue;const near=crew.filter(p=>p.exterior&&distance(p,mine)<T.mineRadius);const lit=near.some(p=>p.flashlight)||isFlared(mine,true);if(near.length&&!mine.warned){mine.warned=true;tell('mine',null);}mine.fuse=lit?mine.fuse+dt:Math.max(0,mine.fuse-dt*2);if(mine.fuse>=T.mineFuse){mine.active=false;out.events.push({type:'mineBlast',x:mine.x,z:mine.z});for(const p of near)hit(p,T.mineDamage,'mine');}}
  const repaired=game.activeJunctions.every(id=>game.tasks[id]?.done);
  if(!h.wardenDone&&game.tasks.power.done&&game.tasks.console.done&&repaired&&game.time>=h.wardenAt){h.wardenDone=true;h.warden={x:0,z:-28,ready:game.time+T.wardenWarning,until:game.time+T.wardenWarning+T.wardenLife,strikeAt:0,target:null};tell('warden',null);}
  const w=h.warden;
  if(w){if(game.time>=w.until){h.warden=null;return out;}if(game.time<w.ready||game.time<game.empUntil)return out;
    const flare=game.effects.find(e=>e.item==='flare'),targets=crew.filter(p=>p.flashlight||!p.exterior&&game.roomCircuits[roomAt(p.x,p.z)]),target=flare||targets.sort((a,b)=>distance(a,w)-distance(b,w))[0];
    w.target=target?.id??null;if(!target){w.strikeAt=0;return out;}
    const angle=Math.atan2(target.z,target.x),range=Math.max(18,Math.hypot(target.x,target.z)),goal={x:Math.cos(angle)*range,z:Math.sin(angle)*range},angleNow=Math.atan2(w.z,w.x),delta=Math.atan2(Math.sin(angle-angleNow),Math.cos(angle-angleNow)),nextAngle=angleNow+Math.max(-dt*.35,Math.min(dt*.35,delta)),rad=Math.hypot(w.x,w.z)+(range-Math.hypot(w.x,w.z))*Math.min(1,dt);
    w.x=Math.cos(nextAngle)*rad;w.z=Math.sin(nextAngle)*rad;
    if(flare){w.strikeAt=0;return out;}
    if(target.exterior){if(distance(target,w)<3)hit(target,T.wardenDps*dt,'warden');w.strikeAt=0;}
    else if(Math.abs(delta)<.25){if(!w.strikeAt)w.strikeAt=game.time+T.wardenWarning;if(game.time>=w.strikeAt){const room=roomAt(target.x,target.z);game.rooms[room].flood=Math.min(FLOOD_MAX,game.rooms[room].flood+.1);for(const p of crew)if(!p.exterior&&roomAt(p.x,p.z)===room)hit(p,10,'warden');out.events.push({type:'wardenStrike',room});w.strikeAt=game.time+18;}}else w.strikeAt=0;
  }
  return out;
}
