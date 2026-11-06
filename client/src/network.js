import { io } from "socket.io-client";

// By default we connect to the same origin that served the page. In development Vite
// proxies /socket.io to the game server, and in production the game server serves the
// page itself. Set VITE_SERVER_URL only if you host the client somewhere else.
const url = import.meta.env.VITE_SERVER_URL || undefined;
const IDENTITY_KEY='pressure-drop-identity';
let identity=null;try{const saved=JSON.parse(localStorage.getItem(IDENTITY_KEY)||'null');if(saved&&typeof saved.token==='string'&&/^[a-f0-9]{64}$/.test(saved.token))identity=saved;}catch{}
export const socket = io(url,{auth:done=>done({identityToken:identity?.token})});
socket.on('identity',profile=>{if(typeof profile?.id!=='string'||typeof profile.token!=='string'||!/^[a-f0-9]{64}$/.test(profile.token))return;identity={id:profile.id,token:profile.token,name:profile.name};try{localStorage.setItem(IDENTITY_KEY,JSON.stringify(identity));}catch{}});

// Session survives a page refresh or a dropped connection (sessionStorage = per tab).
const SESSION_KEY = "pressure-drop-session";
export const saveSession = (s) => { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* ignore */ } };
export const loadSession = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
export const clearSession = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } };

export const net = {
  leave: () => socket.emit("room:leave"),
  create: (name) => socket.emit("room:create", { name }),
  practice:name=>socket.emit('room:create',{name,practice:true}),
  quick:(name,difficulty='normal')=>socket.emit('room:quick',{name,difficulty}),
  rooms:()=>socket.emit('rooms:list'),
  visibility:(isPublic,name)=>socket.emit('lobby:visibility',{public:isPublic,name}),
  stats:()=>socket.emit('stats:get'),
  board:filters=>socket.emit('leaderboard:get',filters),
  report:(target,reason)=>socket.emit('moderation:report',{target,reason}),
  join: (name, code) => socket.emit("room:join", { name, code }),
  rejoin: (code, token) => socket.emit("room:rejoin", { code, token }),
  setDept: (dept) => socket.emit("lobby:dept", { dept }),
  setReady: (ready) => socket.emit("lobby:ready", { ready }),
  start: () => socket.emit("lobby:start"),
  toLobby: () => socket.emit("match:lobby"),
  chat: (text) => socket.emit("chat:send", { text }),
  move: (x, z, rotation, running) => socket.emit("player:move", { x, z, rotation, running }),
  interact: (id) => socket.emit("interact:start", { id }),
  cancel: () => socket.emit("interact:cancel"),
  door: (room) => socket.emit("door:toggle", { room }),
  decoy: () => socket.emit("decoy:launch"),
  item: slot => socket.emit('item:use', { slot }),
  take: (locker,item) => socket.emit('locker:take',{locker,item}),
  craft:recipe=>socket.emit('craft:make',{recipe}),
  circuit:room=>socket.emit('circuit:toggle',{room}),
  light:on=>socket.emit('player:light',{on}),
  difficulty:difficulty=>socket.emit('lobby:difficulty',{difficulty}),
  dive:vertical=>socket.emit('diver:control',{vertical}),
  subControl:(steer,throttle)=>socket.emit('sub:control',{steer,throttle}),
  subAction:action=>socket.emit('sub:action',{action}),
  vote: (targets, confirmed = false) => socket.emit("vote:cast", { targets, confirmed }),
  mission: mission => socket.emit("lobby:mission", { mission }),
  calibrate: (id, value) => socket.emit("repair:input", { id, value }),
  podControl: (steer, throttle, boost) => socket.emit("pod:control", { steer, throttle, boost }),
  podAction: action => socket.emit("pod:action", { action }),
  epilogueDone: () => socket.emit("epilogue:done"),
  introDone: () => socket.emit("intro:done"),
  ping: (targetId) => socket.emit("spectate:ping", { targetId })
};
