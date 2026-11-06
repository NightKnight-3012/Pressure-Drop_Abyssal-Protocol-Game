import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import {attachGame} from '../server/net.js';
const server=http.createServer(),io=new Server(server),api=attachGame(io,{log:{log(){},error:console.error}}),clients=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let checks=0;
async function until(fn,ms=6000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(30);}throw Error('Timed out waiting for practice state');}
const check=(name,condition)=>{assert(condition,name);checks++;console.log('PASS '+name);};
try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const host=connect(url,{transports:['websocket'],forceNew:true});clients.push(host);await new Promise(r=>host.once('connect',r));const joined=new Promise(r=>host.once('room:joined',r));host.emit('room:create',{name:'Learner',practice:true});const session=await joined,room=api.rooms.get(session.code);await until(()=>room.phase==='playing');
  check('practice automatically starts one learner with no readiness dependency',room.game.practice.step==='move'&&room.game.startCount===1&&room.matchPlayers.length===1);
  const observer=connect(url,{transports:['websocket'],forceNew:true});clients.push(observer);await new Promise(r=>observer.once('connect',r));let error='';observer.on('game:error',e=>error=e);observer.emit('room:join',{name:'Observer',code:room.code});await until(()=>!!error);check('another player cannot enter a solo practice room',/solo/i.test(error)&&room.players.size===1);
  const p=room.matchPlayers[0],x=p.x,z=p.z;for(let i=1;i<=16;i++){host.emit('player:move',{x:x+i*.14,z,rotation:0,running:false});await sleep(80);}await until(()=>room.game.practice.step==='power');check('validated movement advances the real practice objective',room.game.practice.step==='power');
  host.emit('interact:start',{id:'practice:complete',step:'complete',passed:true});await sleep(150);check('client cannot acknowledge or forge tutorial completion',room.game.practice.step==='power'&&!room.game.tasks.power.done);
  host.disconnect();const replacement=connect(url,{transports:['websocket'],forceNew:true});clients.push(replacement);await new Promise(r=>replacement.once('connect',r));const restored=new Promise(r=>replacement.once('room:joined',r));replacement.emit('room:rejoin',{code:room.code,token:session.you.token});const recovery=await restored;check('practice progress survives reconnect without creating another learner',recovery.match.state.practice.step==='power'&&room.players.size===1);
  console.log(`${checks} practice network checks passed`);
}finally{for(const c of clients)c.disconnect();api.stop();io.close();server.close();}
