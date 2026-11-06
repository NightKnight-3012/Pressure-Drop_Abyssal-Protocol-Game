// HTTP, authoritative simulation and private SQLite storage.
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Server} from 'socket.io';
import {createStaticHandler} from './http.js';
import {attachGame} from './net.js';
import {createRepository} from './db.js';
import {readConfig} from './config.js';
const config=readConfig(),repository=createRepository(config.dataFile);
const log={log:message=>console.log(JSON.stringify({time:new Date().toISOString(),level:'info',message})),error:message=>console.error(JSON.stringify({time:new Date().toISOString(),level:'error',message}))};
let game,closing=false;
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../client/dist');
const server=http.createServer(createStaticHandler(dist,{health:()=>closing?{ok:false,closing:true}:game.health(),rooms:()=>game.publicRooms(),leaderboard:filters=>repository.leaderboard(filters)}));
const io=new Server(server,{maxHttpBufferSize:1e4,...(config.origins.length?{cors:{origin:config.origins.includes('*')?'*':config.origins,methods:['GET','POST']}}:{})});
game=attachGame(io,{repository,limits:config.limits,trustProxy:config.trustProxy,timeScale:config.timeScale,log});
function shutdown(){if(closing)return;closing=true;game.shutdown();io.close(()=>{repository.close();process.exit(0);});setTimeout(()=>{log.error('Shutdown timed out');process.exit(1);},5000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
server.on('error',error=>{log.error(error.code==='EADDRINUSE'?'Port '+config.port+' is already in use. Close the other server or change PORT.':error.message);game.stop();repository.close();process.exit(1);});
server.listen(config.port,()=>log.log('Pressure Drop listening on port '+server.address().port));
