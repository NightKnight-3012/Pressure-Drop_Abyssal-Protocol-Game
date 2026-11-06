// Fake players for testing a full crew without needing 8 people.
//
//   npm run bots                  -> creates a room with 7 bots and prints the join code.
//                                    The mission starts automatically once you join and press READY.
//   npm run bots -- 3             -> 3 bots instead
//   npm run bots -- 5 ABCDE       -> add 5 bots to an existing lobby (you are the host)
//
// Bots pick departments, ready up, wander the station (sometimes running, which makes noise),
// vote when asked, and return to the lobby after a match. They do NOT repair anything, so you
// (and the real players) have to do the work. Great for testing 8-player scaling.
import { io } from "socket.io-client";
import { PLAYER_RADIUS, WALK_SPEED, RUN_SPEED, ROOM_IDS, DEPT_IDS, collides, roomAt } from "../../shared/layout.js";
import { FINALE_POINTS } from "../../shared/tactical.js";

const count = Math.max(1, Math.min(8, Number(process.argv[2]) || 7));
const existingCode = process.argv[3]?.toUpperCase();
const url = process.env.PD_URL || "http://localhost:3000";
const NAMES = ["Bot-Alpha", "Bot-Bravo", "Bot-Charlie", "Bot-Delta", "Bot-Echo", "Bot-Foxtrot", "Bot-Golf", "Bot-Hotel"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randomFreePoint(closed) {
  for (;;) {
    const x = (Math.random() * 2 - 1) * 9, z = (Math.random() * 2 - 1) * 9;
    if (!collides(x, z, PLAYER_RADIUS + 0.2, closed)) return { x, z };
  }
}

function startBot(name, code, isHost) {
  return new Promise((resolve) => {
    const socket = io(url, { transports: ["websocket"] });
    const bot = {
      id: null, x: 0, z: 0, yaw: 0, target: null, stuck: 0, run: false, nextRunToggle: 0,
      phase: "lobby", state: null, timer: null, lobby: null, startedAt: 0
    };
    socket.on("connect_error", () => console.error(`[${name}] cannot reach ${url} - is the server running?`));
    socket.on("game:error", (m) => console.error(`[${name}] ${m}`));
    socket.on("player:correct", (p) => { bot.x = p.x; bot.z = p.z; bot.target = null; });
    socket.on("game:state", (s) => { bot.state = s; });

    socket.on("room:joined", (d) => {
      bot.id = d.you.id;
      bot.lobby = d.lobby;
      socket.emit("lobby:dept", { dept: DEPT_IDS[Math.floor(Math.random() * DEPT_IDS.length)] });
      if (!isHost) socket.emit("lobby:ready", { ready: true });
      resolve({ code: d.code, socket });
    });

    socket.on("lobby:state", (l) => {
      bot.lobby = l;
      if (!isHost || l.phase !== "lobby") return;
      // the host bot starts the mission once every human is ready
      const humans = l.players.filter((p) => !p.name.startsWith("Bot-") && p.connected);
      if (humans.length && humans.every((p) => p.ready) && l.players.filter((p) => p.connected).length >= 2 && !bot.startTimer) {
        bot.startTimer = setTimeout(() => { bot.startTimer = null; socket.emit("lobby:start"); }, 1500);
      }
    });

    socket.on("match:start", (m) => { socket.emit("intro:done"); bot.phase = "briefing"; bot.x = m.self.x; bot.z = m.self.z; });
    socket.on("match:go", () => { bot.phase = "playing"; });
    socket.on("match:lobby", () => {
      bot.phase = "lobby";
      setTimeout(() => socket.emit("lobby:ready", { ready: true }), 800 + Math.random() * 1500);
    });
    socket.on("game:over", () => {
      bot.phase = "ended";
      setTimeout(() => socket.emit("epilogue:done"), 12000);
      if (isHost) setTimeout(() => socket.emit("match:lobby"), 15000);
    });

    // wander + vote
    bot.timer = setInterval(() => {
      const s = bot.state;
      if (bot.phase !== "playing" || !s || s.status !== "playing") return;
      const me = s.players.find((p) => p.id === bot.id);
      if (!me || me.down || me.lost) return;
      if (s.stage === "vote" && s.vote && !s.vote.voted.includes(bot.id)) {
        const others = s.players.filter((p) => !p.lost && p.id !== bot.id);
        const pick = others.sort((a, b) => (a.contribution || 0) - (b.contribution || 0)).slice(0, s.vote.k).map(p => p.id);
        socket.emit("vote:cast", { targets: pick, confirmed: true });
      }
      if (me.escaped) return;
      if (s.stage === "finale" && me.aboard) {
        const pod = s.finale.pod, gate = pod.route[0], lane = pod.phase === "rendezvous" ? 0 : gate?.lane === -1 ? 0 : -1;
        if (pod.pilot === bot.id) socket.emit("pod:control", { steer: Math.abs(pod.lane - lane) < 0.1 ? 0 : Math.sign(lane - pod.lane), throttle: pod.phase === "rendezvous" ? 0.15 : 0.85, boost: false });
        else if (pod.hull < 85 || pod.oxygen < 65) socket.emit("pod:action", { action: "repair" });
        if (pod.diversion) socket.emit("pod:action", { action: "accept" });
        return;
      }
      const closed = ROOM_IDS.filter((r) => s.rooms[r].closed);
      const now = Date.now();
      let destination = null, interaction = null;
      if (s.stage === "boarding" && !me.left && !me.aboard) { destination = FINALE_POINTS.board; interaction = "board"; }
      if (s.stage === "finale" && !me.aboard) { destination = FINALE_POINTS.capsule; interaction = "capsule"; }
      if (destination) {
        if (Math.hypot(bot.x - destination.x, bot.z - destination.z) < 1.65) {
          if (now - (bot.lastInteract || 0) > 1000) { socket.emit("interact:start", { id: interaction }); bot.lastInteract = now; }
          return;
        }
        const currentRoom = roomAt(bot.x, bot.z), targetRoom = roomAt(destination.x, destination.z);
        bot.target = currentRoom !== targetRoom && currentRoom !== "hub" ? { x: 0, z: 0 } : destination;
        bot.run = false; bot.nextRunToggle = now + 3000;
      }
      if (!bot.target || Math.hypot(bot.target.x - bot.x, bot.target.z - bot.z) < 0.4 || bot.stuck > 12) { bot.target = randomFreePoint(closed); bot.stuck = 0; }
      if (now > bot.nextRunToggle) { bot.run = Math.random() < 0.2; bot.nextRunToggle = now + 2000 + Math.random() * 6000; }
      const dx = bot.target.x - bot.x, dz = bot.target.z - bot.z, d = Math.hypot(dx, dz) || 1;
      const step = (bot.run ? RUN_SPEED : WALK_SPEED) * 0.07;
      const nx = bot.x + (dx / d) * step, nz = bot.z + (dz / d) * step;
      let moved = false;
      if (!collides(nx, bot.z, PLAYER_RADIUS, closed)) { bot.x = nx; moved = true; }
      if (!collides(bot.x, nz, PLAYER_RADIUS, closed)) { bot.z = nz; moved = true; }
      bot.stuck = moved ? 0 : bot.stuck + 1;
      bot.yaw = Math.atan2(-dx, -dz);
      socket.emit("player:move", { x: bot.x, z: bot.z, rotation: bot.yaw, running: bot.run && moved });
    }, 70);

    socket.on("connect", () => {
      if (code) socket.emit("room:join", { name, code });
      else socket.emit("room:create", { name });
    });
  });
}

let code = existingCode;
if (!code) {
  const first = await startBot(NAMES[0], null, true);
  code = first.code;
  console.log(`\n  Lobby created. JOIN CODE: ${code}`);
  console.log("  Open the game, join with this code, pick a department and press READY. The mission starts automatically.\n");
  for (let i = 1; i < count; i++) { await startBot(NAMES[i], code, false); await sleep(150); }
} else {
  for (let i = 0; i < count; i++) { await startBot(NAMES[i], code, false); await sleep(150); }
}
console.log(`  ${count} bot(s) running. Press Ctrl+C to stop.`);
