import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import {attachGame} from '../server/net.js';
import {SUB_BOARD,SUB_DOCK} from '../shared/submersible.js';
import {maximumDive} from '../shared/ocean-floor.js';
const server=http.createServer(),io=new Server(server),api=attachGame(io,{log:{log(){},error:console.error}}),clients=[],sessions=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let checks=0;
async function until(fn,ms=6000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(30);}throw Error('Timed out waiting for authoritative sub state');}
const check=(name,condition)=>{assert(condition,name);checks++;console.log('PASS '+name);};
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  for(let i=0;i<4;i++){const c=connect(url,{transports:['websocket'],forceNew:true});clients.push(c);await new Promise(r=>c.once('connect',r));const joined=new Promise(r=>c.once('room:joined',r));c.emit(i?'room:join':'room:create',{name:`Survey ${i}`,code:[...api.rooms.keys()][0]});sessions.push(await joined);}
  const room=[...api.rooms.values()][0];for(const c of clients)c.emit('lobby:ready',{ready:true});await sleep(100);clients[0].emit('lobby:start');await until(()=>!!room.game);room.phase='playing';const g=room.game,P=room.matchPlayers;g.nextBreachAt=g.lockdown.nextAt=1e8;g.tasks.power.done=true;g.lastTick=Date.now();
  for(const p of P)Object.assign(p,{x:SUB_BOARD.x,z:SUB_BOARD.z+1});
  clients[0].emit('interact:start',{id:'sub:board',seat:'driver'});await until(()=>P[0].subSeat==='driver');clients[1].emit('interact:start',{id:'sub:board',seat:'driver'});await until(()=>P[1].subSeat==='passenger');clients[2].emit('interact:start',{id:'sub:board'});await sleep(150);check('two server-assigned seats reject a third occupant',!P[2].subSeat&&g.sub.driver===P[0].id&&g.sub.passenger===P[1].id);
  const start=g.sub.z;clients[1].emit('sub:control',{steer:0,throttle:1});clients[2].emit('sub:control',{steer:0,throttle:1});await sleep(200);check('passenger and outside clients cannot drive',g.sub.z===start);
  clients[0].emit('player:move',{x:55,z:55,rotation:0,running:false,subSeat:'driver'});await sleep(200);check('seated players cannot teleport using ordinary movement',Math.abs(P[0].x-g.sub.x)<.001&&Math.abs(P[0].z-g.sub.z)<.001);
  for(let i=0;i<10;i++){clients[0].emit('sub:control',{steer:0,throttle:1});await sleep(100);}check('real pilot intents move vessel and both passengers',g.sub.z<start-2&&P[0].z===g.sub.z&&P[1].z===g.sub.z);
  await until(()=>Math.abs(g.sub.speed)<.2,3000);check('lost control packets safely decay to a stopped vessel',Math.abs(g.sub.speed)<.2);
  clients[1].emit('sub:action',{action:'flare',charges:999,x:999,z:999});await until(()=>g.sub.flareCharges===2);check('passenger flare uses one real charge at the authoritative sub',g.effects.some(e=>e.item==='flare'&&Math.hypot(e.x-g.sub.x,e.z-g.sub.z)<3));
  clients[2].emit('sub:action',{action:'pilot'});await sleep(100);check('an outside client cannot steal the pilot seat',g.sub.driver===P[0].id);
  clients[0].disconnect();await sleep(150);clients[1].emit('sub:action',{action:'pilot'});await until(()=>g.sub.driver===P[1].id);check('passenger takes over a disconnected pilot without losing cargo seats',g.sub.passenger===P[0].id&&P[0].subSeat==='passenger');
  const rejoin=connect(url,{transports:['websocket'],forceNew:true});clients[0]=rejoin;await new Promise(r=>rejoin.once('connect',r));const joined=new Promise(r=>rejoin.once('room:joined',r));rejoin.emit('room:rejoin',{code:room.code,token:sessions[0].you.token});const recovered=await joined;check('reconnect restores the reassigned seat without duplication',recovered.match.state.players.find(p=>p.id===P[0].id).subSeat==='passenger');
  Object.assign(g.sub,{x:SUB_DOCK.x,z:SUB_DOCK.z,speed:0,inputUntil:0,throttle:0,steer:0});await sleep(150);clients[1].emit('interact:start',{id:'sub:dock',result:'escaped'});await until(()=>g.sub.driver===null,4000);check('network docking waits for the hold and transfers both crew inside',P.slice(0,2).every(p=>!p.exterior&&!p.subSeat)&&g.sub.docked);
  for(let i=0;i<P.length;i++)Object.assign(P[i],{x:i,z:-43,exterior:true,depth:0});
  for(let n=0;n<12;n++){for(const c of clients)c.emit('diver:control',{vertical:1,depth:999,suit:999});await sleep(100);}
  check('four simultaneous divers use validated server depth and keep finite air',P.every(p=>p.depth>.6&&p.depth<=maximumDive(p.x,p.z)&&p.suit<90));
  const before=P[0].depth;clients[0].emit('diver:control',{vertical:999,depth:999});await sleep(400);check('forged depth cannot escape the seabed envelope',P[0].depth<=maximumDive(P[0].x,P[0].z)&&P[0].depth<999);
  console.log(`${checks} submersible network checks passed`);
}finally{for(const c of clients)c.disconnect();api.stop();io.close();server.close();}
