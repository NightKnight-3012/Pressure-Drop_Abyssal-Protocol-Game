import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import {attachGame} from '../server/net.js';
import {WORKBENCH} from '../shared/fieldwork.js';
import {STATIONS} from '../shared/layout.js';
const server=http.createServer(),io=new Server(server),api=attachGame(io,{log:{log(){},error:console.error}}),clients=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let checks=0;
async function until(fn,ms=6000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(30);}throw Error('Timed out waiting for authoritative state');}
const check=(name,condition)=>{assert(condition,name);checks++;console.log('PASS '+name);};
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  for(let i=0;i<4;i++){const c=connect(url,{transports:['websocket'],forceNew:true});clients.push(c);await new Promise(r=>c.once('connect',r));const joined=new Promise(r=>c.once('room:joined',r));c.emit(i?'room:join':'room:create',{name:`Field ${i}`,code:[...api.rooms.keys()][0]});await joined;}
  const room=[...api.rooms.values()][0];clients[1].emit('lobby:difficulty',{difficulty:'nightmare'});await sleep(100);check('non-host cannot change difficulty',room.difficulty==='normal');clients[0].emit('lobby:difficulty',{difficulty:'relaxed'});await until(()=>room.difficulty==='relaxed');check('host difficulty is authoritative',room.difficulty==='relaxed');
  for(const c of clients)c.emit('lobby:ready',{ready:true});await sleep(120);clients[0].emit('lobby:start');await until(()=>!!room.game);room.phase='playing';const g=room.game,P=room.matchPlayers;g.nextBreachAt=g.lockdown.nextAt=1e8;g.tasks.power.done=true;g.lastTick=Date.now();
  const cache=g.scrap[0],before=g.scrap.length;for(const p of P){Object.assign(p,{x:cache.x,z:cache.z,exterior:true});p.inventory[0]=null;}
  for(const c of clients)c.emit('interact:start',{id:cache.id,item:'emp',slot:3,quantity:99});await until(()=>g.scrap.length===before-1);check('four divers recover exactly one alloy cargo',P.filter(p=>p.inventory.includes('scrap')).length===1);
  const index=P.findIndex(p=>p.inventory.includes('scrap')),p=P[index];Object.assign(p,{x:WORKBENCH.x,z:WORKBENCH.z+1,exterior:false});clients[index].emit('craft:make',{recipe:'flare',cost:0,quantity:99});await until(()=>p.inventory[0]==='flare');check('forged cost, result quantity and slot cannot duplicate fabrication',p.inventory.filter(i=>i==='flare').length===1&&!p.inventory.includes('scrap'));
  const inventory=JSON.stringify(p.inventory);clients[index].emit('craft:make',{recipe:{id:'emp'},cost:0});await sleep(200);check('malformed recipe preserves inventory',JSON.stringify(p.inventory)===inventory);
  clients[0].emit('circuit:toggle',{room:'engineering'});await sleep(150);check('remote circuit refuses a distant or unauthorised player',g.roomCircuits.engineering);
  const cmd=P[0];cmd.dept='command';cmd.exterior=false;cmd.x=STATIONS.console.x;cmd.z=STATIONS.console.z+1;g.tasks.console.done=true;await sleep(300);clients[0].emit('circuit:toggle',{room:'engineering'});await until(()=>!g.roomCircuits.engineering);check('Command isolates the real local circuit at the console',!g.roomCircuits.engineering);
  clients[0].emit('player:light',{on:'false'});await sleep(150);check('flashlight intent validates boolean types',cmd.flashlight===true);clients[0].emit('player:light',{on:false});await until(()=>cmd.flashlight===false);check('valid flashlight state reaches the authoritative light hunter',cmd.flashlight===false);
  check('selected difficulty survives into match rules',g.difficulty==='relaxed');
  console.log(`${checks} fieldwork network checks passed`);
}finally{for(const c of clients)c.disconnect();api.stop();io.close();server.close();}
