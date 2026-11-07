// Socket.IO layer: rooms, lobby, chat, reconnecting, validation of every client message,
// and the match lifecycle (lobby -> briefing -> playing -> ended).
import crypto from "node:crypto";
import {isIP} from 'node:net';
import {
  MAX_PLAYERS, PLAYER_RADIUS, WALK_SPEED, RUN_SPEED, SWIM_SPEED, INNER, EXT_LIMIT, DEPT_IDS, ROOMS,
  roomAt, pathBlocked, zoneLabel
} from "../shared/layout.js";
import {
  createGame, tickGame, snapshotGame, startHold, cancelHold, remoteDoor, launchDecoy, castVote,
  assignDepartments, closedRooms, isActive, repairInput, useItem, dropItem, takeLockerItem,craftItem,remoteCircuit,subControl,subAction,diverControl
} from "./game.js";
import { podControl, podAction } from "./finale.js";
import { MISSIONS } from "../shared/tactical.js";
import { recordEvents } from './timeline.js';
import {DIFFICULTIES} from '../shared/fieldwork.js';
import {publicRooms as roomListing,quickRoom} from './matchmaking.js';
import {filterText,cleanReport,rateGate} from './moderation.js';

export const TICK_MS = 50;           // 20 simulation updates per second
const BRIEFING_MS = 34000; // Twenty-four-second incident record, then role briefing.
const GRACE_LOBBY_MS = 20000;        // how long a dropped player keeps their lobby seat
const GRACE_MATCH_MS = 90000;        // ...and their character during a match
const MAX_MOVE_DT = 0.5;
const MOVE_SLACK = 0.3;
const SPEED_TOLERANCE = 1.25;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHAT_MAX = 120;

const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function cleanName(value) {
  if (typeof value !== "string") return null;
  const name = filterText(value.replace(/[\u0000-\u001f\u007f]/g, "")).trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 16 ? name : null;
}
function cleanText(value) {
  if (typeof value !== "string") return null;
  const text = filterText(value.replace(/[\u0000-\u001f\u007f]/g, " ")).trim().replace(/\s+/g, " ");
  return text.length >= 1 ? text.slice(0, CHAT_MAX) : null;
}

// Walkie-talkies between sealed sections are glitchy: some letters turn into static.
export function garble(text, rng = Math.random) {
  const noise = "#%&*?~=";
  return [...text].map((ch) => (ch !== " " && rng() < 0.3 ? noise[Math.floor(rng() * noise.length)] : ch)).join("");
}

export function attachGame(io, { timeScale = 1, log = console,repository=null,limits={},trustProxy=false,matchSeed } = {}) {
  const rooms = new Map();   // code -> room
  const sockets = new Map(); // socket.id -> { room, id }
  let chatSeq = 0;
  const cap={maxRooms:20,maxRoomsPerIp:4,maxConnections:200,maxConnectionsPerIp:40,...limits};
  const ephemeralIdentities=new Map(),creationRates=new Map(),connectionRates=new Map(),reportRates=new Map(),pendingResults=new Map();
  let nextRetry=0,nextBanCheck=0,nextRateCleanup=0,bannedIds=new Set(repository?.bannedIds()||[]);
  const ipOf=socket=>{const forwarded=socket.handshake.headers['x-forwarded-for'];const candidate=trustProxy&&typeof forwarded==='string'?forwarded.split(',')[0].trim():'';return (isIP(candidate)?candidate:socket.handshake.address||'unknown').replace(/^::ffff:/,'');};
  const identityFor=token=>{if(repository)return repository.identity(token);if(typeof token==='string'&&ephemeralIdentities.has(token))return ephemeralIdentities.get(token);const identity={id:crypto.randomUUID(),token:crypto.randomBytes(32).toString('hex'),name:'Crew'};ephemeralIdentities.set(identity.token,identity);if(ephemeralIdentities.size>10000)ephemeralIdentities.delete(ephemeralIdentities.keys().next().value);return identity;};
  const requestGate=(socket,key,ms)=>allow(socket.data,key,ms,Date.now());
  function persistResult(room,summary){
    if(!repository||summary.practice||summary.aborted)return;
    const payload={id:room.game.matchId,summary,difficulty:room.game.difficulty,publicRoom:!!room.game.publicRoom,players:room.matchPlayers.map(p=>({id:p.id,profileId:p.profileId}))};
    try{repository.record(payload);}catch(error){pendingResults.set(payload.id,payload);log.error(JSON.stringify({event:'result_write_failed',match:payload.id,error:error.message}));}
  }

  const randomCode = () => {
    let code;
    do code = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join("");
    while (rooms.has(code));
    return code;
  };
  const roomPlayers = (room) => [...room.players.values()];
  const emitTo = (p, event, payload) => { if (p.connected && p.socketId) io.to(p.socketId).emit(event, payload); };
  const fail = (socket, message) => socket.emit("game:error", message);

  // ---------------------------------------------------------------- snapshots
  const lobbySnapshot = (room) => ({
    code: room.code, phase: room.phase, hostId: room.hostId, matchNo: room.matchNo, mission: room.mission,difficulty:room.difficulty,practice:!!room.practice,public:!!room.public,name:room.name,
    players: roomPlayers(room).map((p) => ({
      id: p.id, name: p.name, dept: p.dept, ready: p.ready, connected: p.connected, host: p.id === room.hostId,profileId:p.profileId
    }))
  });
  const broadcastLobby = (room) => io.to(room.code).emit("lobby:state", lobbySnapshot(room));
  const gameState = (room) => snapshotGame(room.game, room.matchPlayers, Date.now());

  function matchPayload(room, p) {
    if (!room.game) return null;
    return {
      phase: room.phase, self: { x: p.x, z: p.z, rotation: p.rotation, exterior: p.exterior },
      state: gameState(room), briefingEndsIn: Math.max(0, room.briefingEndsAt - Date.now())
    };
  }

  // ---------------------------------------------------------------- chat
  function sendChat(room, from, text, { system = false } = {}) {
    const game = room.game;
    const lockdown = room.phase === "playing" && game?.lockdown.active;
    const section = (p) => {
      if (!lockdown || !p || p.lost) return "open";
      const r = roomAt(p.x, p.z);
      return !p.exterior && game.rooms[r]?.locked ? r : "open";
    };
    const msg = { id: ++chatSeq, ts: Date.now(), system, text };
    if (from) msg.from = { id: from.id, name: from.name, dept: from.dept, spectator: !!from.lost,profileId:from.profileId };
    room.chat.push(msg);
    if (room.chat.length > 40) room.chat.shift();
    for (const p of roomPlayers(room)) {
      const garbled = !system && from && section(from) !== section(p);
      emitTo(p, "chat:msg", garbled ? { ...msg, text: garble(text), garbled: true } : msg);
    }
  }
  const sys = (room, text) => sendChat(room, null, text, { system: true });

  // ---------------------------------------------------------------- joining / leaving
  function pickHost(room) {
    const current = room.players.get(room.hostId);
    if (current?.connected) return;
    const next = roomPlayers(room).filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next) room.hostId = next.id;
  }

  function removePlayer(room, p) {
    room.players.delete(p.id);
    if (room.phase === "playing" || room.phase === "briefing") {
      // keep the character in the match list as a lost crew member
      p.connected = false; p.lost = true; p.running = false;
      p.lostAt??=room.game?.time??0;
      if (room.game) cancelHold(room.game, p.id);
    }
    pickHost(room);
  }

  function bindSocket(socket, room, p) {
    if (p.socketId && p.socketId !== socket.id) {
      sockets.delete(p.socketId);
      io.sockets.sockets.get(p.socketId)?.disconnect(true); // replaced by a newer connection
    }
    p.socketId = socket.id; p.connected = true; p.disconnectedAt = 0;
    sockets.set(socket.id, { room, id: p.id });
    socket.join(room.code);
    pickHost(room);
    socket.emit("room:joined", {
      code: room.code, you: { id: p.id, token: p.token },
      lobby: lobbySnapshot(room), chat: room.chat.slice(-30), match: matchPayload(room, p)
    });
    broadcastLobby(room);
  }

  function newPlayer(room, socket, name) {
    const now = Date.now();
    let id;
    do id = crypto.randomBytes(3).toString("hex"); while (room.players.has(id));
    const p = {
      id, token: crypto.randomBytes(16).toString("hex"), name, dept: null, ready: false,
      profileId:socket.data.identity.id,
      connected: false, socketId: null, joinedAt: now, disconnectedAt: 0,
      x: 0, z: 0, rotation: 0, running: false, exterior: false,
      lastMove: now, lastPacket: now, lastCorrect: 0, rate: {},
      hp: 100, downed: false, lost: false, leftBehind: false, aboard: false, suit: 90, tasksDone: 0, slot: 0, stamina: 100, winded: false
    };
    room.players.set(id, p);
    socket.data.identity.name=name;
    try{repository?.setName(p.profileId,name);}catch(error){log.error(JSON.stringify({event:'profile_name_failed',error:error.message}));}
    if (!room.hostId || !room.players.has(room.hostId)) room.hostId = id;
    return p;
  }

  const allow = (p, key, minMs, now) => {
    if (now - (p.rate[key] || 0) < minMs) return false;
    p.rate[key] = now;
    return true;
  };
  function makeRoom(socket,name,{practice=false,public:visible=false,label,difficulty='normal'}={}){
    if(rooms.size>=cap.maxRooms){fail(socket,'This server has reached its room limit. Join an existing crew or retry later.');return null;}
    const ip=socket.data.ip;
    if([...rooms.values()].filter(r=>r.creatorIp===ip).length>=cap.maxRoomsPerIp||!rateGate(creationRates,ip,10,60000)){fail(socket,'Room creation limit reached for this connection. Join an existing crew or retry shortly.');return null;}
    const title=label===undefined?`${name}'s crew`:typeof label==='string'?filterText(label.replace(/[\u0000-\u001f\u007f]/g,'')).trim():'';
    if(!title||title.length>32){fail(socket,'Room names must contain 1–32 characters.');return null;}
    const room={code:randomCode(),instanceId:crypto.randomUUID(),creatorIp:ip,name:title,public:visible===true&&!practice,practice:practice===true,phase:'lobby',hostId:null,players:new Map(),matchPlayers:[],game:null,chat:[],briefingEndsAt:0,matchNo:0,mission:'blackout',difficulty:typeof difficulty==='string'&&Object.hasOwn(DIFFICULTIES,difficulty)?difficulty:'normal'};
    rooms.set(room.code,room);return room;
  }

  // ---------------------------------------------------------------- match lifecycle
  function startMatch(room) {
    if(repository&&!room.practice&&pendingResults.size>=1000){sys(room,'Stats storage is unavailable. New scored matches are paused until it recovers.');return;}
    for (const p of roomPlayers(room)) if (!p.connected) room.players.delete(p.id);
    pickHost(room);
    const list = roomPlayers(room).sort((a, b) => a.joinedAt - b.joinedAt);
    if (!list.length) return;
    const changes = assignDepartments(list);
    for (const p of list) { p.lastPacket = p.lastMove = Date.now(); p.running = false; }
    room.matchPlayers = list;
    room.game = createGame({ players: list, now: Date.now(), mission: room.mission,difficulty:room.difficulty,practice:room.practice,seed:matchSeed });
    room.game.matchId=crypto.randomUUID();room.game.publicRoom=!!room.public;
    room.phase = "briefing";
    room.introSeen = new Set();
    room.briefingEndsAt = Date.now() + (room.practice?1000:BRIEFING_MS);
    room.matchNo++;
    for (const c of changes) {
      const p = room.players.get(c.id);
      if (c.from) sys(room, `${p.name} was moved to ${c.to} so every department is covered.`);
    }
    for (const p of list) emitTo(p, "match:start", matchPayload(room, p));
    broadcastLobby(room);
    log.log(`[room ${room.code}] match ${room.matchNo} starting with ${list.length} player(s)`);
  }

  function returnToLobby(room) {
    room.phase = "lobby"; room.game = null; room.matchPlayers = [];
    for (const p of [...room.players.values()]) {
      if (!p.connected) room.players.delete(p.id);
      else Object.assign(p, { ready: false, lost: false, leftBehind: false, aboard: false, escaped: false, downed: false, hp: 100, exterior: false });
    }
    pickHost(room);
    io.to(room.code).emit("match:lobby");
    broadcastLobby(room);
  }

  function dispatch(room, events) {
    recordEvents(room.game, room.matchPlayers, events);
    for (const e of events) {
      const who = (id) => room.players.get(id)?.name ?? "Someone";
      switch (e.type) {
        case "teleport": {
          const p = room.players.get(e.id);
          if (p) { p.lastMove = Date.now(); emitTo(p, "player:correct", { x: p.x, z: p.z, teleport: true, exterior: p.exterior }); }
          break;
        }
        case "notice": { const p = room.players.get(e.id); if (p) emitTo(p, "game:error", e.text); break; }
        case "task": io.to(room.code).emit("game:event", { type: "task", id: e.id, label: e.label, by: who(e.by) }); break;
        case "lockdown":
          io.to(room.code).emit("game:event", e);
          sys(room, `LOCKDOWN: the ${e.rooms.map((r) => ROOMS[r].label).join(" and ")} doors are sealed. Hold both door panels at the same time to override.`);
          break;
        case "lockdownEnd": io.to(room.code).emit("game:event", e); sys(room, "Lockdown lifted. Blast doors are open."); break;
        case "down": io.to(room.code).emit("game:event", { type: "down", id: e.id, name: who(e.id) }); sys(room, `${who(e.id)} is down! Hold E next to them to revive.`); break;
        case "revive": io.to(room.code).emit("game:event", { type: "revive", id: e.id, name: who(e.id) }); break;
        case "lost": io.to(room.code).emit("game:event", { type: "lost", id: e.id, name: who(e.id) }); sys(room, `${who(e.id)} was lost.`); break;
        case "voteResult": sys(room, `Vote result: ${e.left.map(who).join(", ")} will stay behind.`); io.to(room.code).emit("game:event", e); break;
        case "finale": sys(room, "POD RELEASED. Pilot through the wreckage. Station crew: survey the maintenance capsules and acoustic beacon. Radio link remains open."); io.to(room.code).emit("game:event", e); break;
        case "beacon": sys(room, `${who(e.by)} ${e.active ? "activated" : "stopped"} the station beacon. It consumes capsule reserve power.`); io.to(room.code).emit("game:event", e); break;
        case "diversionProposed": sys(room, `${who(e.by)} proposes drawing the Leviathan to the pod to buy the station crew time. Pod crew must agree.`); io.to(room.code).emit("game:event", e); break;
        case "diversion": sys(room, e.accepted ? "Pod crew approved the distress pulse. Propulsion reserve reduced. Hold your course." : "The diversion was not approved."); io.to(room.code).emit("game:event", e); break;
        case "pursuit": sys(room, `ACOUSTIC CONTACT: the Leviathan is committing toward the ${e.target === "pod" ? "escape pod" : "station"}.`); io.to(room.code).emit("game:event", e); break;
        case "capsuleEscape": sys(room, `${who(e.id)} escaped in a maintenance capsule. The other crew's outcome is still unfolding.`); io.to(room.code).emit("game:event", e); break;
        case "podClamped": sys(room, "Cradle clamps engaged. Shutter closing astern. Keep the hull stable until the seal holds."); io.to(room.code).emit("game:event", e); break;
        case "podSecured": sys(room, "Cradle locked. Isolation shutter sealed. The armored lift is hauling the pod clear. Station crew: find your own route."); io.to(room.code).emit("game:event", e); break;
        case "podOutcome": sys(room, e.status === "escaped" ? "The pod is secured in the armored recovery shaft. Station signals are still being monitored." : "The pod signal was lost. Station crew: your escape is still possible."); io.to(room.code).emit("game:event", e); break;
        case "over": {
          persistResult(room,e.outcome);
          room.phase = "ended";
          room.debriefAt = Date.now(); room.debriefSeen = new Set();
          io.to(room.code).emit("game:state", gameState(room));
          io.to(room.code).emit("game:over", e.outcome);
          broadcastLobby(room);
          log.log(`[room ${room.code}] match over: ${e.outcome.result}`);
          break;
        }
        default: io.to(room.code).emit("game:event", e);
      }
    }
  }

  // ---------------------------------------------------------------- sockets
  io.on("connection", (socket) => {
    socket.data.rate={};socket.data.ip=ipOf(socket);
    if(io.sockets.sockets.size>cap.maxConnections||[...io.sockets.sockets.values()].filter(s=>ipOf(s)===socket.data.ip).length>cap.maxConnectionsPerIp||!rateGate(connectionRates,socket.data.ip,120,60000)){
      socket.emit('server:blocked','Server connection limit reached. Please retry shortly.');socket.disconnect(true);return;
    }
    try{socket.data.identity=identityFor(socket.handshake.auth?.identityToken);if(repository?.isBanned(socket.data.identity.id)){socket.emit('server:blocked','This anonymous profile is banned on this server.');socket.disconnect(true);return;}}
    catch(error){log.error(JSON.stringify({event:'identity_unavailable',error:error.message}));socket.emit('server:blocked','Profile storage is temporarily unavailable.');socket.disconnect(true);return;}
    socket.emit('identity',{...socket.data.identity,persistence:!!repository});
    const ctx = () => {
      const c = sockets.get(socket.id);
      const room = c && rooms.get(c.room.code);
      const p = room && room.players.get(c.id);
      return room && p ? { room, p } : null;
    };

    socket.on("room:create", (data) => {
      if (sockets.has(socket.id)) return fail(socket, "You are already in a room.");
      const name = cleanName(isObject(data) ? data.name : null);
      if (!name) return fail(socket, "Enter a name between 1 and 16 characters.");
      if(!requestGate(socket,'create',500))return;
      const room=makeRoom(socket,name,{practice:data.practice===true,public:data.public===true,label:data.roomName,difficulty:data.difficulty});if(!room)return;
      const p = newPlayer(room, socket, name);
      bindSocket(socket, room, p);
      sys(room, `${name} created the room.`);
      log.log(`[room ${room.code}] created by ${name}`);
      if(room.practice)startMatch(room);
    });
    socket.on('rooms:list',()=>socket.emit('rooms:state',requestGate(socket,'rooms',500)?roomListing(rooms):{error:'Wait a moment before refreshing crews.'}));
    socket.on('room:quick',data=>{
      if(sockets.has(socket.id))return fail(socket,'You are already in a room.');
      const name=cleanName(isObject(data)?data.name:null);if(!name||!isObject(data)||(data.difficulty!==undefined&&(typeof data.difficulty!=='string'||!Object.hasOwn(DIFFICULTIES,data.difficulty))))return fail(socket,'Choose a valid name and difficulty.');
      if(!requestGate(socket,'quick',500))return;
      const difficulty=data.difficulty||'normal',room=quickRoom(rooms,difficulty)||makeRoom(socket,name,{public:true,difficulty,label:`Open crew / ${DIFFICULTIES[difficulty].label}`});if(!room)return;
      const p=newPlayer(room,socket,name);bindSocket(socket,room,p);sys(room,`${name} joined through Quick Match.`);
    });

    socket.on("room:join", (data) => {
      if (sockets.has(socket.id)) return fail(socket, "You are already in a room.");
      if (!isObject(data)) return fail(socket, "Invalid request.");
      const name = cleanName(data.name);
      if (!name) return fail(socket, "Enter a name between 1 and 16 characters.");
      if (typeof data.code !== "string") return fail(socket, "Invalid room code.");
      const now=Date.now();socket.data.joinAttempts=(socket.data.joinAttempts||[]).filter(t=>now-t<1000);
      if(socket.data.joinAttempts.length>=5)return fail(socket,'Too many join attempts. Retry in a second.');socket.data.joinAttempts.push(now);
      const room = rooms.get(data.code.trim().toUpperCase());
      if (!room) return fail(socket, "Room not found. Check the code.");
      if(room.practice)return fail(socket,'Practice rooms are solo. Create a normal room to invite crew.');
      if (room.phase !== "lobby") return fail(socket, "A match is in progress. Wait for it to finish.");
      if (room.players.size >= MAX_PLAYERS) return fail(socket, `Room full (${MAX_PLAYERS}/${MAX_PLAYERS} players).`);
      const p = newPlayer(room, socket, name);
      bindSocket(socket, room, p);
      sys(room, `${name} joined.`);
    });

    // Come back after a dropped connection (page refresh, Wi-Fi blip...)
    socket.on("room:rejoin", (data) => {
      if (sockets.has(socket.id) || !isObject(data)) return;
      const room = typeof data.code === "string" ? rooms.get(data.code.toUpperCase()) : null;
      const p = room && typeof data.token === "string" ? roomPlayers(room).find((q) => q.token === data.token) : null;
      if (!room || !p) return socket.emit("room:gone");
      if(repository?.isBanned(p.profileId)){socket.emit('server:blocked','This crew profile is banned on this server.');socket.disconnect(true);return;}
      bindSocket(socket, room, p);
      sys(room, `${p.name} reconnected.`);
    });

    socket.on("lobby:dept", (data) => {
      const c = ctx(); if (!c || c.room.phase !== "lobby" || !isObject(data)) return;
      if (data.dept !== null && !DEPT_IDS.includes(data.dept)) return;
      if(!allow(c.p,'dept',100,Date.now()))return;
      c.p.dept = data.dept;
      broadcastLobby(c.room);
    });
    socket.on("lobby:ready", (data) => {
      const c = ctx(); if (!c || c.room.phase !== "lobby" || !isObject(data)) return;
      if(typeof data.ready!=='boolean'||!allow(c.p,'ready',100,Date.now()))return;
      c.p.ready = data.ready === true;
      broadcastLobby(c.room);
    });
    socket.on("lobby:mission", data => {
      const c = ctx(); if (!c || c.room.phase !== "lobby" || c.room.hostId !== c.p.id || !isObject(data) || typeof data.mission!=='string' || !Object.hasOwn(MISSIONS, data.mission)) return;
      if(!allow(c.p,'mission',100,Date.now()))return;c.room.mission = data.mission; broadcastLobby(c.room);
    });
    socket.on('lobby:difficulty',data=>{const c=ctx();if(!c||c.room.phase!=='lobby'||c.room.hostId!==c.p.id||!isObject(data)||typeof data.difficulty!=='string'||!Object.hasOwn(DIFFICULTIES,data.difficulty)||!allow(c.p,'difficulty',100,Date.now()))return;c.room.difficulty=data.difficulty;broadcastLobby(c.room);});
    socket.on('lobby:visibility',data=>{
      const c=ctx();if(!c||c.room.phase!=='lobby'||c.room.hostId!==c.p.id||c.room.practice||!isObject(data)||typeof data.public!=='boolean'||!allow(c.p,'visibility',250,Date.now()))return;
      const title=data.name===undefined?c.room.name:typeof data.name==='string'?filterText(data.name.replace(/[\u0000-\u001f\u007f]/g,'')).trim():'';
      if(!title||title.length>32)return fail(socket,'Room names must contain 1–32 characters.');c.room.public=data.public;c.room.name=title;broadcastLobby(c.room);
    });
    socket.on('stats:get',()=>{
      if(!requestGate(socket,'stats',1000))return socket.emit('stats:state',{supported:!!repository,error:'Wait a second before refreshing stats.'});
      try{socket.emit('stats:state',{supported:!!repository,stats:repository?.stats(socket.data.identity.id)||null});}catch{socket.emit('stats:state',{supported:true,error:'Stats are temporarily unavailable.'});}
    });
    socket.on('leaderboard:get',data=>{
      if(!requestGate(socket,'board',500))return socket.emit('leaderboard:state',{supported:!!repository,error:'Wait a moment before refreshing the board.'});
      if(!repository)return socket.emit('leaderboard:state',{supported:false,entries:[]});
      try{const filters=isObject(data)?{period:data.period||'all',kind:data.kind||'escapes',crewSize:data.crewSize??0}:{};socket.emit('leaderboard:state',{supported:true,entries:repository.leaderboard(filters),filters});}
      catch(error){socket.emit('leaderboard:state',{supported:true,error:error.message,entries:[]});}
    });
    socket.on('moderation:report',data=>{
      const c=ctx(),notice=(ok,message)=>socket.emit('moderation:notice',{ok,message});
      if(!c||!isObject(data)||typeof data.target!=='string')return;
      if(!repository)return notice(false,'Reporting is unavailable on this server.');
      const reason=cleanReport(data.reason),target=c.room.players.get(data.target),message=[...c.room.chat].reverse().find(m=>m.from?.id===data.target),targetProfile=target?.profileId||message?.from?.profileId;
      if(!reason||!targetProfile||targetProfile===c.p.profileId)return notice(false,'Choose another crew member and a reason of 1–240 characters.');
      if(!rateGate(reportRates,c.p.profileId,6,60000))return notice(false,'Report limit reached. Please retry shortly.');
      try{const added=repository.report({scope:c.room.game?.matchId||c.room.instanceId,reporter:c.p.profileId,target:targetProfile,reason,excerpt:message?.text||''});notice(true,added?'Report saved for the server operator. No automatic ban was applied.':'This report is already saved.');}
      catch{notice(false,'Report storage is temporarily unavailable.');}
    });
    socket.on("lobby:start", () => {
      const c = ctx(); if (!c || c.room.phase !== "lobby") return;
      if (c.room.hostId !== c.p.id) return fail(socket, "Only the host can start the mission.");
      if (roomPlayers(c.room).some(p => p.connected && p.id !== c.room.hostId && !p.ready)) return fail(socket, "Wait until the crew are ready.");
      startMatch(c.room);
    });
    socket.on("intro:done", () => {
      const c = ctx(); if (!c || c.room.phase !== "briefing") return;
      const room = c.room;
      room.introSeen.add(c.p.id);
      if (room.briefingEndsAt - Date.now() > 10000 && roomPlayers(room).filter(p => p.connected).every(p => room.introSeen.has(p.id))) {
        room.briefingEndsAt = Date.now() + 10000;
        io.to(room.code).emit("match:briefing", { briefingEndsIn: 10000 });
      }
    });
    socket.on("match:lobby", () => {
      const c = ctx(); if (!c || c.room.phase !== "ended") return;
      if (Date.now() - c.room.debriefAt < 13000 && roomPlayers(c.room).some(p => p.connected && !c.room.debriefSeen.has(p.id))) return fail(socket, "The remaining crew are finishing their epilogues. You can return in a moment.");
      returnToLobby(c.room);
    });
    socket.on("epilogue:done", () => { const c = ctx(); if (c?.room.phase === "ended") c.room.debriefSeen?.add(c.p.id); });

    socket.on("chat:send", (data) => {
      const c = ctx(); if (!c || !isObject(data)) return;
      const text = cleanText(data.text);
      const now = Date.now();
      if (!text) return;
      c.p.chatTimes = (c.p.chatTimes || []).filter((t) => now - t < 10000);
      if (c.p.chatTimes.length >= 6) return fail(socket, "Slow down: you are sending messages too fast.");
      c.p.chatTimes.push(now);
      sendChat(c.room, c.p, text);
    });

    socket.on("spectate:ping", (data) => {
      const c = ctx(); if (!c || c.room.phase !== "playing" || !c.p.lost || !isObject(data)) return;
      if (!allow(c.p, "ping", 3000, Date.now())) return;
      const target = typeof data.targetId === "string" ? c.room.players.get(data.targetId) : null;
      if (!target || target.lost) return;
      sys(c.room, `[spectator ${c.p.name}] pings ${target.name} in the ${zoneLabel(target.x, target.z)}.`);
    });

    // ---------------- in-match messages ----------------
    socket.on("player:move", (data) => {
      const c = ctx(); if (!c || c.room.phase !== "playing" || !isObject(data)) return;
      const { room, p } = c, game = room.game;
      const { x, z, rotation, running } = data;
      if (typeof running !== "boolean" || ![x, z, rotation].every(Number.isFinite)) return;
      const now = Date.now();
      if (!allow(p, "move", 25, now)) return;
      p.lastPacket = now;
      p.rotation = Math.atan2(Math.sin(rotation), Math.cos(rotation));
      if (game.status !== "playing") return;
      const correct = () => {
        p.running = false;
        if (now - p.lastCorrect > 150) { p.lastCorrect = now; socket.emit("player:correct", { x: p.x, z: p.z, exterior: p.exterior }); }
      };
      if (!isActive(p)||p.subSeat) return correct(); // seated crew move only with the authoritative vehicle
      const elapsed = Math.min((now - p.lastMove) / 1000, MAX_MOVE_DT);
      const speed = p.exterior ? SWIM_SPEED : running && !p.winded ? RUN_SPEED : WALK_SPEED; // winded = out of stamina
      const tooFar = Math.hypot(x - p.x, z - p.z) > speed * elapsed * SPEED_TOLERANCE + MOVE_SLACK;
      const limit = p.exterior ? EXT_LIMIT : INNER;
      const outside = Math.abs(x) > limit || Math.abs(z) > limit;
      const closed = closedRooms(game);
      // slightly smaller radius than the client uses, so rounding never rejects honest play
      const blocked = pathBlocked(p.x, p.z, x, z, PLAYER_RADIUS - 0.05, closed, p.exterior);
      if (tooFar || outside || blocked) return correct();
      p.x = x; p.z = z; p.running = running && !p.exterior; p.lastMove = now;
    });

    const inMatch = () => {
      const c = ctx();
      return c && c.room.phase === "playing" && c.room.game.status === "playing" ? c : null;
    };
    socket.on("interact:start", (data) => {
      const c = inMatch(); if (!c || !isObject(data) || !allow(c.p, "interact", 100, Date.now())) return;
      const err = startHold(c.room.game, c.room.matchPlayers, c.p, data.id);
      if (err) fail(socket, err);
    });
    socket.on("interact:cancel", () => {
      const c = inMatch(); if (c) cancelHold(c.room.game, c.p.id);
    });
    socket.on("repair:input", data => {
      const c = inMatch(); if (!c || !isObject(data) || !allow(c.p, "calibration", 90, Date.now())) return;
      const err = repairInput(c.room.game, c.p, data.id, data.value); if (err) fail(socket, err);
    });
    socket.on('item:use', data => {
      const c = inMatch();
      if (!c || !isObject(data) || !allow(c.p, 'item', 250, Date.now())) return;
      const err = useItem(c.room.game, c.room.matchPlayers, c.p, data.slot);
      if (err) fail(socket, err);
    });
    socket.on('item:drop',data=>{
      const c=inMatch();if(!c||!isObject(data)||!allow(c.p,'drop',250,Date.now()))return;
      const err=dropItem(c.room.game,c.room.matchPlayers,c.p,data.slot);if(err)fail(socket,err);
    });
    socket.on('locker:take', data => {
      const c=inMatch();if(!c||!isObject(data)||!allow(c.p,'locker',250,Date.now()))return;
      const err=takeLockerItem(c.room.game,c.room.matchPlayers,c.p,data.locker,data.item);
      if(err)fail(socket,err);
    });
    socket.on('craft:make',data=>{const c=inMatch();if(!c||!isObject(data)||!allow(c.p,'craft',250,Date.now()))return;const err=craftItem(c.room.game,c.room.matchPlayers,c.p,data.recipe);if(err)fail(socket,err);});
    socket.on('circuit:toggle',data=>{const c=inMatch();if(!c||!isObject(data)||typeof data.room!=='string'||!allow(c.p,'circuit',300,Date.now()))return;const err=remoteCircuit(c.room.game,c.room.matchPlayers,c.p,data.room);if(err)fail(socket,err);});
    socket.on('player:light',data=>{const c=inMatch();if(!c||!isObject(data)||typeof data.on!=='boolean'||!isActive(c.p)||!allow(c.p,'light',100,Date.now()))return;c.p.flashlight=data.on;});
    socket.on('diver:control',data=>{const c=inMatch();if(!c||!isObject(data)||!allow(c.p,'depth',40,Date.now()))return;diverControl(c.room.game,c.p,data.vertical);});
    socket.on('sub:control',data=>{const c=inMatch();if(!c||!isObject(data)||!allow(c.p,'subControl',40,Date.now()))return;subControl(c.room.game,c.p,data);});
    socket.on('sub:action',data=>{const c=inMatch();if(!c||!isObject(data)||typeof data.action!=='string'||!allow(c.p,'subAction',200,Date.now()))return;const err=subAction(c.room.game,c.room.matchPlayers,c.p,data.action);if(err)fail(socket,err);});
    socket.on("pod:control", data => {
      const c = inMatch(); if (!c || !isObject(data) || !allow(c.p, "pilot", 40, Date.now())) return;
      podControl(c.room.game, c.room.matchPlayers, c.p, data);
    });
    socket.on("pod:action", data => {
      const c = inMatch(); if (!c || !isObject(data) || typeof data.action !== "string" || !allow(c.p, data.action === "repairStop" ? "podRepairStop" : "podAction", data.action === "repairStop" ? 25 : 200, Date.now())) return;
      const events = [], err = podAction(c.room.game, c.room.matchPlayers, c.p, data.action, events);
      if (err) fail(socket, err); else dispatch(c.room, events);
    });
    socket.on("door:toggle", (data) => {
      const c = inMatch(); if (!c || !isObject(data) || !allow(c.p, "door", 250, Date.now())) return;
      const events = [];
      const err = remoteDoor(c.room.game, c.room.matchPlayers, c.p, data.room, events);
      if (err) fail(socket, err); else dispatch(c.room, events);
    });
    socket.on("decoy:launch", () => {
      const c = inMatch(); if (!c || !allow(c.p, "decoy", 500, Date.now())) return;
      const events = [];
      const err = launchDecoy(c.room.game, c.room.matchPlayers, c.p, events);
      if (err) fail(socket, err); else dispatch(c.room, events);
    });
    socket.on("vote:cast", (data) => {
      const c = inMatch(); if (!c || !isObject(data) || !allow(c.p, "vote", 100, Date.now())) return;
      const err = castVote(c.room.game, c.room.matchPlayers, c.p, data.targets, data.confirmed === true);
      if (err) fail(socket, err);
    });

    // Leave on purpose (no waiting period)
    socket.on("room:leave", () => {
      const c = ctx(); if (!c) return;
      const { room, p } = c;
      sys(room, `${p.name} left.`);
      socket.leave(room.code);
      sockets.delete(socket.id);
      p.socketId = null;
      removePlayer(room, p);
      broadcastLobby(room);
    });

    socket.on("disconnect", () => {
      const c = ctx();
      sockets.delete(socket.id);
      if (!c) return;
      const { room, p } = c;
      if (p.socketId !== socket.id) return; // already replaced by a newer connection
      p.connected = false; p.socketId = null; p.disconnectedAt = Date.now(); p.running = false;
      if (room.game) cancelHold(room.game, p.id);
      pickHost(room);
      broadcastLobby(room);
    });
  });

  // ---------------------------------------------------------------- the loop
  const timer = setInterval(() => {
    const now = Date.now();
    if(repository&&now>=nextRetry){nextRetry=now+1000;const first=pendingResults.entries().next().value;if(first){const [id,payload]=first;try{repository.record(payload);pendingResults.delete(id);}catch(error){log.error(JSON.stringify({event:'result_retry_failed',match:id,error:error.message}));}}}
    if(repository&&now>=nextBanCheck){nextBanCheck=now+5000;try{bannedIds=new Set(repository.bannedIds());}catch{}for(const room of rooms.values())for(const p of [...room.players.values()])if(bannedIds.has(p.profileId)){const socket=io.sockets.sockets.get(p.socketId);socket?.emit('server:blocked','This anonymous profile was banned by the server operator.');removePlayer(room,p);socket?.disconnect(true);broadcastLobby(room);}}
    if(repository)for(const socket of io.sockets.sockets.values())if(bannedIds.has(socket.data.identity?.id)){socket.emit('server:blocked','This anonymous profile was banned by the server operator.');socket.disconnect(true);}
    if(now>=nextRateCleanup){nextRateCleanup=now+60000;for(const map of [creationRates,connectionRates,reportRates])for(const [key,times] of map)if(!times.some(t=>now-t<60000))map.delete(key);}
    for (const room of [...rooms.values()]) {
      // drop players who stayed away too long
      const grace = room.phase === "lobby" || room.phase === "ended" ? GRACE_LOBBY_MS : GRACE_MATCH_MS;
      for (const p of roomPlayers(room)) {
        if (!p.connected && now - p.disconnectedAt > grace) {
          removePlayer(room, p);
          sys(room, `${p.name} left.`);
          broadcastLobby(room);
        }
      }
      if (!roomPlayers(room).some((p) => p.connected) && !roomPlayers(room).some((p) => !p.connected && now - p.disconnectedAt <= grace)) {
        rooms.delete(room.code);
        log.log(`[room ${room.code}] closed (empty)`);
        continue;
      }
      if (room.phase === "briefing") {
        io.to(room.code).emit("game:state", gameState(room));
        if (now >= room.briefingEndsAt) {
          room.phase = "playing";
          room.game.lastTick = now;
          for (const p of room.matchPlayers) p.lastMove = p.lastPacket = now;
          io.to(room.code).emit("match:go");
          broadcastLobby(room);
        }
      } else if (room.phase === "playing") {
        const events = tickGame(room.game, room.matchPlayers, now, timeScale);
        if (room.phase === "playing") io.to(room.code).emit("game:state", gameState(room));
        dispatch(room, events);
      }
    }
  }, TICK_MS);

  return { rooms, sockets,publicRooms:()=>roomListing(rooms),health:()=>({ok:pendingResults.size===0,rooms:rooms.size,players:[...rooms.values()].reduce((n,r)=>n+[...r.players.values()].filter(p=>p.connected).length,0),queuedResults:pendingResults.size,persistence:!!repository}),stop:()=>clearInterval(timer),shutdown(){clearInterval(timer);for(const room of rooms.values())if(room.game?.status==='playing'){room.game.status='aborted';room.game.holds.clear();room.phase='ended';}io.emit('server:shutdown',{message:'Server restarting. Unfinished matches are not scored.'});const deadline=Date.now()+2000;for(const [id,payload] of pendingResults){if(Date.now()>=deadline)break;try{repository.record(payload);pendingResults.delete(id);}catch{break;}} if(pendingResults.size)log.error(JSON.stringify({event:'shutdown_pending_results',count:pendingResults.size}));} };
}
