import assert from 'node:assert/strict';
import http from 'node:http';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import {attachGame} from '../server/net.js';
import {createRepository} from '../server/db.js';
import {createStaticHandler} from '../server/http.js';
import {readConfig} from '../server/config.js';
import {STATIONS} from '../shared/layout.js';
import {driveFinale,calibrate} from '../server/scripts/crew-driver.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let count=0,driver;
const check=(name,value)=>{assert(value,name);count++;console.log('PASS '+name);};
async function until(fn,ms=15000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(25);}throw Error('Timed out: '+fn.toString());}
const repo=createRepository();let failWrite=true;const errors=[];
const repository=new Proxy(repo,{get(target,key){if(key==='record')return payload=>{if(failWrite){failWrite=false;throw Error('Injected transient write failure');}return target.record(payload);};return target[key];}});
let api;const server=http.createServer(createStaticHandler('client/dist',{health:()=>api.health(),rooms:()=>api.publicRooms(),leaderboard:f=>repo.leaderboard(f)})),io=new Server(server);
api=attachGame(io,{repository,timeScale:4,matchSeed:17,log:{log(){},error:message=>errors.push(message)}});const clients=[];
async function client(token){const socket=connect(url,{transports:['websocket'],forceNew:true,reconnection:false,auth:token?{identityToken:token}:{}}),c={socket,identity:null,joined:null};clients.push(c);socket.on('identity',v=>c.identity=v);socket.on('room:joined',v=>c.joined=v);await until(()=>c.identity);return c;}
async function request(c,event,data,response){const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No response '+response)),6000);c.socket.once(response,value=>{clearTimeout(timer);resolve(value);});});c.socket.emit(event,data);return result;}
let url;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
 const privateHost=await client();privateHost.socket.emit('room:create',{name:'Private'});await until(()=>privateHost.joined);const privateRoom=api.rooms.get(privateHost.joined.code);
 const crew=[];for(let i=0;i<20;i++){const c=await client();crew.push(c);c.socket.emit('room:quick',{name:'Crew '+i,difficulty:'normal'});await until(()=>c.joined);}
 const rooms=[...api.rooms.values()].filter(r=>r.public);check('20 real clients quick-match into 8/8/4 crews',rooms.length===3&&rooms.map(r=>r.players.size).sort((a,b)=>b-a).join(',')==='8,8,4');
 const listed=await request(privateHost,'rooms:list',undefined,'rooms:state');check('public projection excludes private codes, identities and secrets',listed.length===3&&!JSON.stringify(listed).includes(privateRoom.code)&&!JSON.stringify(listed).includes('token')&&!JSON.stringify(listed).includes('profileId'));
 const throttled=await request(privateHost,'rooms:list',undefined,'rooms:state');check('rapid refresh returns a clear response instead of leaving the browser loading',typeof throttled.error==='string');
 const room=rooms[0],members=crew.filter(c=>c.joined.code===room.code),host=members.find(c=>c.joined.you.id===room.hostId),guest=members.find(c=>c!==host);
 guest.socket.emit('lobby:visibility',{public:false,name:'Stolen'});await sleep(100);check('only host can change public visibility',room.public&&room.name!=='Stolen');
 host.socket.emit('lobby:difficulty',{difficulty:{toString:null}});host.socket.emit('lobby:mission',{mission:{toString:null}});await sleep(100);check('malformed difficulty and mission values do not crash the server',room.difficulty==='normal'&&room.mission==='blackout');
 const stats=await request(guest,'stats:get',{id:privateHost.identity.id,matches:999},'stats:state');check('stats requests always use the authenticated anonymous profile',stats.stats.id===guest.identity.id&&stats.stats.matches===0);
 host.socket.emit('chat:send',{text:'fuck'});await sleep(100);check('chat filtering happens before canonical server history',room.chat.at(-1).text==='[redacted]');
 const report={target:guest.joined.you.id,reason:'Repeated harassment'};
 let notice=await request(host,'moderation:report',report,'moderation:notice');check('reports store actual room participants for manual review',notice.ok&&repo.reports()[0].target===guest.identity.id&&!repo.isBanned(guest.identity.id));
 notice=await request(host,'moderation:report',report,'moderation:notice');check('duplicate reports do not inflate records',notice.ok&&repo.reports().length===1);
 notice=await request(host,'moderation:report',{target:host.joined.you.id,reason:'self'},'moderation:notice');check('self-report and forged participant targets are refused',!notice.ok);
 notice=await request(host,'moderation:report',{target:'outside-room',reason:'forged'},'moderation:notice');assert(!notice.ok);
 const publicApi=await fetch(url+'/api/rooms');check('read-only HTTP browser lists the same public rooms',publicApi.ok&&(await publicApi.json()).rooms.length===3);
 check('invalid HTTP leaderboard filters are rejected',(await fetch(url+'/api/leaderboard?kind=fastest&crewSize=0')).status===400);
 check('health exposes bounded operational status without identity data',(await (await fetch(url+'/health')).json()).players===21);
 for(const r of rooms){const cs=crew.filter(c=>c.joined.code===r.code);for(const c of cs)c.socket.emit('lobby:ready',{ready:true});await until(()=>[...r.players.values()].every(p=>p.ready));cs.find(c=>c.joined.you.id===r.hostId).socket.emit('lobby:start');await until(()=>r.phase==='briefing');r.briefingEndsAt=Date.now();}
 await until(()=>rooms.every(r=>r.phase==='playing'));
 // Fixture positions replace walking only; task holds, calibration, vote, boarding and pod flight use actual rules.
 for(const r of rooms){r.game.nextBreachAt=r.game.lockdown.nextAt=r.game.complication.nextAt=1e9;for(const key of ['skitterAt','electricAt','wardenAt'])r.game.threats[key]=1e9;}
 async function hold(r,id){const station=STATIONS[id],p=r.matchPlayers.find(p=>(id.startsWith('j')||id.startsWith('airlock'))?p.dept==='eva':id==='power'?p.dept==='engineering':id==='console'||id==='launch'?p.dept==='command':id==='lifesupport'?p.dept==='medical':id==='pump'?p.dept==='engineering':true)||r.matchPlayers[0];Object.assign(p,{x:station.x+(station.rot?Math.sin(station.rot)*1.2:0),z:station.z+(station.rot!==undefined?Math.cos(station.rot)*1.2:1)});calibrate(r.game,p,id);const c=crew.find(c=>c.joined.you.id===p.id&&c.joined.code===r.code);c.socket.emit('interact:start',{id});await until(()=>r.game.holds.has(p.id)||r.game.tasks[id]?.done);await until(()=>!r.game.holds.has(p.id));if(r.game.tasks[id])assert(r.game.tasks[id].done,id);}
 for(const id of ['power','pump','console','lifesupport'])await Promise.all(rooms.map(r=>hold(r,id)));
 await Promise.all(rooms.map(async r=>{await hold(r,'airlock_in');for(const id of r.game.activeJunctions)await hold(r,id);await hold(r,'airlock_out');assert(r.game.activeJunctions.every(id=>r.game.tasks[id].done));await hold(r,'launch');}));
 for(const r of rooms)if(r.game.stage==='vote'){const targets=r.matchPlayers.slice(-r.game.vote.k).map(p=>p.id);for(const c of crew.filter(c=>c.joined.code===r.code))c.socket.emit('vote:cast',{targets,confirmed:true});}
 await until(()=>rooms.every(r=>r.game.stage==='boarding'));
 driver=setInterval(()=>{for(const r of rooms)if(r.phase==='playing')driveFinale(r.game,r.matchPlayers);},20);
 await until(()=>rooms.every(r=>r.phase==='ended'),180000);clearInterval(driver);driver=null;
 check('all three public crews finish through actual boarding, pod navigation and survivor rules',rooms.every(r=>r.game.outcome.result==='win'));
 await until(()=>crew.every(c=>repo.stats(c.identity.id).matches===1));
 check('20 authoritative completed results reach SQLite exactly once after a transient write failure',crew.every(c=>repo.stats(c.identity.id).matches===1)&&errors.some(m=>m.includes('result_write_failed'))&&api.health().queuedResults===0);
 const board=await request(host,'leaderboard:get',{period:'weekly',kind:'escapes',crewSize:0},'leaderboard:state');check('weekly leaderboard contains all 20 completed public profiles',board.entries.length===20);
 const fastest=repo.leaderboard({period:'all',kind:'fastest',crewSize:4});check('fastest escape board compares only the requested crew size',fastest.length>0&&fastest.every(row=>crew.filter(c=>c.joined.code===rooms.find(r=>r.players.size===4).code).some(c=>c.identity.id===row.id)));
 const resumed=await client(host.identity.token);check('browser identity token survives a fresh connection',resumed.identity.id===host.identity.id&&repo.stats(resumed.identity.id).matches===1);
 repo.ban(guest.identity.id,'Network test');await until(()=>!guest.socket.connected,7000);check('operator ban disconnects the target without disconnecting other crew',host.socket.connected&&!guest.socket.connected);
 const idle=await client();repo.ban(idle.identity.id,'Idle profile test');await until(()=>!idle.socket.connected,7000);check('operator bans also disconnect idle profiles outside rooms',!idle.socket.connected);
 const blocked=connect(url,{transports:['websocket'],forceNew:true,reconnection:false,auth:{identityToken:guest.identity.token}});clients.push({socket:blocked});let bannedMessage='';blocked.on('server:blocked',v=>bannedMessage=v);await until(()=>bannedMessage);check('banned identity cannot reconnect',/banned/i.test(bannedMessage));
 privateHost.socket.emit('lobby:ready',{ready:true});await sleep(100);privateHost.socket.emit('lobby:start');await until(()=>privateRoom.game);api.shutdown();check('graceful shutdown aborts unfinished games without scoring them',privateRoom.game.status==='aborted'&&repo.stats(privateHost.identity.id).matches===0);
 check('configuration rejects invalid limits, proxy flags and production acceleration',(()=>{assert.throws(()=>readConfig({MAX_ROOMS:'0'}));assert.throws(()=>readConfig({TRUST_PROXY:'yes'}));assert.throws(()=>readConfig({NODE_ENV:'production',PD_TIME_SCALE:'2'}));assert.equal(readConfig({PORT:'0'}).port,0);return true;})());
 console.log(count+' online network/deployment checks passed');
}finally{clearInterval(driver);for(const c of clients)c.socket.disconnect();api.stop();io.close();server.close();repo.close();}
