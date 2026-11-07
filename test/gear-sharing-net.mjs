import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import {attachGame} from '../server/net.js';
const server=http.createServer(),io=new Server(server),api=attachGame(io,{log:{log(){},error:console.error}}),clients=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let checks=0;
async function until(fn){for(let i=0;i<240;i++){if(fn())return;await sleep(25);}throw Error('Gear-sharing network timeout');}
const check=(name,value)=>{assert(value,name);checks++;console.log('PASS '+name);};
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(let i=0;i<4;i++){const c=connect('http://127.0.0.1:'+server.address().port,{transports:['websocket'],forceNew:true,reconnection:false});clients.push(c);await new Promise(r=>c.once('connect',r));const joined=new Promise(r=>c.once('room:joined',r));c.emit(i?'room:join':'room:create',{name:`Crew ${i}`,code:[...api.rooms.keys()][0]});await joined;}
 for(const c of clients)c.emit('lobby:ready',{ready:true});await sleep(150);clients[0].emit('lobby:start');await until(()=>[...api.rooms.values()][0]?.game);const room=[...api.rooms.values()][0];room.phase='playing';const g=room.game,P=room.matchPlayers;g.nextBreachAt=g.lockdown.nextAt=g.complication.at=1e9;g.threats.skitterAt=g.threats.electricAt=g.threats.wardenAt=1e9;g.lastTick=Date.now();
 for(const p of P)Object.assign(p,{x:22,z:0,exterior:true,depth:0});
 let state;clients[1].on('game:state',v=>state=v);
 clients[0].emit('item:drop',{slot:0,item:'emp',x:-999,z:999,ext:false,quantity:99});await until(()=>g.drops.length===1);
 check('forged item, count, destination and environment are ignored',g.drops[0].item==='flare'&&g.drops[0].x===22&&g.drops[0].z===0&&g.drops[0].ext&&P[0].inventory[0]===null);
 await until(()=>state?.drops?.length===1);check('other divers receive authoritative drop snapshots',state.drops[0].id===g.drops[0].id);
 const id=g.drops[0].id;for(const p of P.slice(1))p.inventory[0]=null;
 for(const c of clients.slice(1))c.emit('interact:start',{id,item:'emp',slot:3,quantity:99});await until(()=>g.drops.length===0);
 check('four divers outside transfer exactly one charge under competing claims',P.filter(p=>p.inventory[0]==='flare').length===1);
 check('transfers do not farm task credits',P.every(p=>p.contribution===0));
 await sleep(300);for(let i=0;i<20;i++)clients[0].emit('item:drop',{slot:1});await sleep(300);check('flooded drop intents produce at most one new drop',g.drops.length===1);
 const before=JSON.stringify(P[1].inventory),count=g.drops.length;clients[1].emit('item:drop',{slot:'0'});await sleep(300);clients[1].emit('item:drop',{slot:{value:0}});await sleep(300);check('malformed slots preserve inventory and supplies',JSON.stringify(P[1].inventory)===before&&g.drops.length===count);
 P[2].exterior=false;P[2].inventory[0]=null;clients[2].emit('interact:start',{id:g.drops[0].id});await sleep(150);check('interior player cannot recover exterior equipment at identical coordinates',!g.holds.has(P[2].id));
 P[3].x=50;clients[3].emit('interact:start',{id:g.drops[0].id});await sleep(150);check('remote recovery never starts a hold',!g.holds.has(P[3].id));
 console.log(`${checks} gear-sharing network checks passed`);
}finally{clients.forEach(c=>c.disconnect());api.stop();io.close();server.close();}
