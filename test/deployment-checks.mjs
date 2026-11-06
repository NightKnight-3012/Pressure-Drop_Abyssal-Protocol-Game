import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {Server} from 'socket.io';
import {io as connect} from 'socket.io-client';
import {attachGame} from '../server/net.js';
import {createRepository} from '../server/db.js';
import {createStaticHandler} from '../server/http.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let checks=0;
const check=(name,c)=>{assert(c,name);checks++;console.log('PASS '+name);};
async function until(fn,ms=7000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(25);}throw Error('Deployment smoke timeout');}
async function capped(limits,run){const repo=createRepository(),server=http.createServer(createStaticHandler('client/dist',{rooms:()=>[]})),io=new Server(server),api=attachGame(io,{repository:repo,limits,log:{log(){},error:console.error}}),clients=[];await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;const client=async(extraHeaders={})=>{const socket=connect(url,{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders}),c={socket};clients.push(socket);socket.on('identity',v=>c.identity=v);socket.on('server:blocked',v=>c.blocked=v);socket.on('game:error',v=>c.error=v);socket.on('room:joined',v=>c.joined=v);await until(()=>c.identity||c.blocked);return c;};try{await run({client,api,url});}finally{clients.forEach(c=>c.disconnect());api.stop();await new Promise(r=>io.close(r));server.close();repo.close();}}
await capped({maxRooms:2,maxRoomsPerIp:1,maxConnectionsPerIp:3},async({client,api,url})=>{
 const host=await client();host.socket.emit('room:create',{name:'Host'});await until(()=>host.joined);
 const guest=await client({'x-forwarded-for':'203.0.113.9'});guest.socket.emit('room:create',{name:'Guest'});await until(()=>guest.error);check('per-IP room limit cannot be bypassed by an untrusted forwarded header',/limit/.test(guest.error)&&api.rooms.size===1);
 host.socket.emit('room:leave');await until(()=>api.rooms.size===0);await sleep(550);guest.error=null;guest.socket.emit('room:create',{name:'Guest'});await until(()=>guest.joined);check('empty rooms release creation capacity',api.rooms.size===1);
 await client();const fourth=await client();check('per-IP connection cap rejects additional sockets',/connection limit/.test(fourth.blocked));
 let response;for(let i=0;i<121;i++)response=await fetch(url+'/api/rooms');check('read-only HTTP browser rate-limits bursts',response.status===429);
});
await capped({maxRooms:1,maxRoomsPerIp:4,maxConnections:2,maxConnectionsPerIp:40},async({client,api})=>{const first=await client(),second=await client();first.socket.emit('room:create',{name:'One'});await until(()=>first.joined);second.socket.emit('room:create',{name:'Two'});await until(()=>second.error);check('global room capacity is enforced',/room limit/.test(second.error)&&api.rooms.size===1);const third=await client();check('global connection capacity is enforced',!!third.blocked);});
const directory=fs.mkdtempSync(path.resolve('test/artifacts/entry-smoke-')),filename=path.join(directory,'test.sqlite');let child;
async function boot(){let output='',error='';child=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),env:{...process.env,PORT:'0',NODE_ENV:'production',PD_TIME_SCALE:'1',PD_DATA_FILE:filename},windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);await until(()=>/listening on port (\d+)/.test(output)||child.exitCode!==null);if(child.exitCode!==null)throw Error('Entry startup failed '+error);return {url:'http://127.0.0.1:'+output.match(/listening on port (\d+)/)[1],output};}
async function stop(){if(!child)return;const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;child=null;}
try{let instance=await boot();let response=await fetch(instance.url+'/health');check('real production entry starts with SQLite and structured logs',response.ok&&(await response.json()).persistence&&JSON.parse(instance.output.trim().split('\n')[0]).level==='info');response=await fetch(instance.url+'/');check('production entry serves the built game',(await response.text()).includes('quick-match'));let c=connect(instance.url,{transports:['websocket'],reconnection:false}),identity;try{c.on('identity',v=>identity=v);await until(()=>identity);check('production entry issues a persistent anonymous identity',identity.persistence&&/^[a-f0-9]{64}$/.test(identity.token));}finally{c.disconnect();}await stop();instance=await boot();c=connect(instance.url,{transports:['websocket'],reconnection:false,auth:{identityToken:identity.token}});let restored;try{c.on('identity',v=>restored=v);await until(()=>restored);check('identity storage survives a real process restart',restored.id===identity.id);}finally{c.disconnect();}}
finally{await stop();for(const suffix of ['','-wal','-shm'])if(fs.existsSync(filename+suffix))fs.rmSync(filename+suffix);fs.rmdirSync(directory);}
console.log(checks+' deployment and capacity checks passed');
