import { SALVAGE } from '../../shared/salvage.js';
// End-to-end network test: runs the real server in-process and plays with real Socket.IO clients.
//   npm test
import http from "node:http";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { attachGame } from "../net.js";
import { STATIONS, PLAYER_RADIUS, WALK_SPEED, SWIM_SPEED, collides, spawnPoint, DEPT_IDS, MAX_PLAYERS } from "../../shared/layout.js";
import { FINALE_POINTS } from "../../shared/tactical.js";

let fails = 0, checks = 0;
function check(name, ok, extra = "") {
  checks++; if (!ok) fails++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !extra ? "" : "  -> " + extra}`);
}
const section = (s) => console.log(`\n[${s}]`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const front = (st, d = 1.3) => ({ x: st.x + Math.sin(st.rot) * d, z: st.z + Math.cos(st.rot) * d });

async function startServer(port, timeScale = 1) {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  const quiet = { log() {}, error: console.error };
  const api = attachGame(io, { timeScale, log: quiet });
  await new Promise((r) => httpServer.listen(port, r));
  return { api, url: `http://localhost:${port}`, close: () => { api.stop(); io.close(); httpServer.close(); } };
}

function client(url) {
  const socket = connect(url, { transports: ["websocket"], reconnection: false });
  const c = {
    socket, id: null, token: null, code: null, lobby: null, state: null, x: 0, z: 0, corrections: 0,
    errors: [], chat: [], events: [], over: null, phase: null, went: false, gotLobbyReturn: false, started: null,
    ready: new Promise((res, rej) => { socket.on("connect", res); socket.on("connect_error", rej); })
  };
  socket.on("room:joined", (d) => { c.id = d.you.id; c.token = d.you.token; c.code = d.code; c.lobby = d.lobby; c.joined = d; if (d.match) { c.state = d.match.state; c.x = d.match.self.x; c.z = d.match.self.z; } });
  socket.on("lobby:state", (l) => { c.lobby = l; });
  socket.on("match:start", (d) => { if (c.skipIntro !== false) socket.emit("intro:done"); c.started = d; c.state = d.state; c.x = d.self.x; c.z = d.self.z; });
  socket.on("match:go", () => { c.went = true; });
  socket.on("match:lobby", () => { c.gotLobbyReturn = true; });
  socket.on("game:state", (s) => { c.state = s; });
  socket.on("game:error", (m) => c.errors.push(m));
  socket.on("game:event", (e) => c.events.push(e));
  socket.on("game:over", (o) => { c.over = o; });
  socket.on("chat:msg", (m) => c.chat.push(m));
  socket.on("player:correct", (p) => { c.corrections++; c.x = p.x; c.z = p.z; });
  socket.on("room:gone", () => { c.gone = true; });
  const once = (ev) => new Promise((res) => socket.once(ev, res));
  c.create = async (name) => { const p = once("room:joined"); const e = once("game:error"); socket.emit("room:create", { name }); return Promise.race([p, e.then((m) => { throw m; })]); };
  c.join = async (name, code) => { const p = once("room:joined"); const e = once("game:error"); socket.emit("room:join", { name, code }); return Promise.race([p, e.then((m) => { throw m; })]); };
  c.rejoin = (code, token) => { const p = once("room:joined"); socket.emit("room:rejoin", { code, token }); return Promise.race([p, once("room:gone").then(() => { throw "gone"; })]); };
  c.send = (running = false) => socket.emit("player:move", { x: c.x, z: c.z, rotation: 0, running });
  c.walk = async (points, exterior=false) => {
    for (const [tx, tz] of points) {
      let guard = 0;
      while (Math.hypot(tx - c.x, tz - c.z) > 0.05 && guard++ < 3000) {
        const d = Math.hypot(tx - c.x, tz - c.z), step = Math.min(d, (exterior?SWIM_SPEED:WALK_SPEED) * 0.07);
        const nx = c.x + ((tx - c.x) / d) * step, nz = c.z + ((tz - c.z) / d) * step;
        if (collides(nx, nz, PLAYER_RADIUS,[],exterior)) throw new Error(`test path blocked at ${nx.toFixed(2)},${nz.toFixed(2)}`);
        c.x = nx; c.z = nz; c.send(false); await sleep(70);
      }
    }
  };
  c.waitFor = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(25); } return false; };
  return c;
}

async function fill(url, n, depts = []) {
  const cs = [];
  for (let i = 0; i < n; i++) {
    const c = client(url); await c.ready;
    if (i === 0) await c.create("Host"); else await c.join("P" + i, cs[0].code);
    if (depts[i]) c.socket.emit("lobby:dept", { dept: depts[i] });
    if (i) c.socket.emit("lobby:ready", { ready: true });
    cs.push(c);
  }
  await sleep(150);
  return cs;
}
const closeAll = (cs) => cs.forEach((c) => c.socket.disconnect());

// ============================================================================================
async function lobbyTests() {
  section("lobby: rooms, departments, ready, chat");
  const S = await startServer(3931);
  const cs = [];
  try {
    const host = client(S.url); await host.ready; cs.push(host);
    try { await host.create("   "); check("blank name is rejected", false); } catch (m) { check("blank name is rejected", /name/i.test(String(m))); }
    await host.create("Alice");
    check("room code is 5 characters", /^[A-Z0-9]{5}$/.test(host.code));
    check("creator is the host", host.lobby.hostId === host.id && host.lobby.phase === "lobby");
    check("a private token is issued for reconnecting", host.token?.length === 32);

    const bob = client(S.url); await bob.ready; cs.push(bob);
    try { await bob.join("Bob", "ZZZZZ"); check("unknown room is rejected", false); } catch (m) { check("unknown room is rejected", /not found/i.test(String(m))); }
    await bob.join("Bob", host.code.toLowerCase());
    check("codes are case-insensitive", bob.code === host.code);
    check("lobby shows both players to everyone", await host.waitFor(() => host.lobby.players.length === 2));

    bob.socket.emit("lobby:dept", { dept: "medical" });
    host.socket.emit("lobby:dept", { dept: "engineering" });
    bob.socket.emit("lobby:ready", { ready: true });
    await sleep(120);
    const rows = Object.fromEntries(host.lobby.players.map((p) => [p.name, p]));
    check("department picks and ready status are shared", rows.Bob.dept === "medical" && rows.Alice.dept === "engineering" && rows.Bob.ready && !rows.Alice.ready);
    bob.socket.emit("lobby:dept", { dept: "hacker" });
    await sleep(80);
    check("invalid department is ignored", host.lobby.players.find((p) => p.name === "Bob").dept === "medical");

    bob.errors.length = 0; bob.socket.emit("lobby:start"); await sleep(100);
    check("only the host can start", /Only the host/.test(bob.errors[0] || "") && bob.lobby.phase === "lobby");

    // chat
    host.chat.length = 0; bob.chat.length = 0;
    host.socket.emit("chat:send", { text: "  hello   crew  " });
    check("chat reaches everyone, spaces normalised", await bob.waitFor(() => bob.chat.some((m) => m.text === "hello crew" && m.from.name === "Alice")));
    host.socket.emit("chat:send", { text: "x".repeat(500) });
    await sleep(100);
    check("chat text is limited to 120 characters", bob.chat.at(-1).text.length === 120);
    for (let i = 0; i < 8; i++) host.socket.emit("chat:send", { text: "spam " + i });
    await sleep(150);
    check("chat is rate limited", host.errors.some((e) => /too fast/.test(e)));

    // fill to 8, then 9th rejected
    for (let i = 3; i <= MAX_PLAYERS; i++) { const c = client(S.url); await c.ready; await c.join("P" + i, host.code); cs.push(c); }
    check("room holds 8 players", await host.waitFor(() => host.lobby.players.length === 8));
    const ninth = client(S.url); await ninth.ready; cs.push(ninth);
    try { await ninth.join("Nine", host.code); check("9th player is rejected", false); } catch (m) { check("9th player is rejected", /full/i.test(String(m))); }

    // reconnect inside the lobby
    const carol = cs[2];
    carol.socket.emit("lobby:dept", { dept: "eva" }); await sleep(80);
    const { id, token, code } = carol;
    carol.socket.disconnect();
    check("a dropped player stays in the lobby (marked offline)", await host.waitFor(() => host.lobby.players.find((p) => p.id === id)?.connected === false));
    const back = client(S.url); await back.ready; cs.push(back);
    await back.rejoin(code, token);
    await host.waitFor(() => host.lobby.players.find((p) => p.id === id)?.connected === true);
    check("rejoin restores identity + department", back.id === id && host.lobby.players.find((p) => p.id === id).dept === "eva" && host.lobby.players.find((p) => p.id === id).connected);
    const stranger = client(S.url); await stranger.ready; cs.push(stranger);
    try { await stranger.rejoin(code, "0".repeat(32)); check("a wrong token cannot take over a seat", false); } catch { check("a wrong token cannot take over a seat", true); }

    // host migration
    host.socket.disconnect(); await sleep(150);
    check("host role moves to another connected player", bob.lobby.players.find((p) => p.host)?.connected === true && bob.lobby.hostId !== host.id);
  } finally { closeAll(cs); S.close(); }
}

async function robustnessTests() {
  section("robustness: garbage input never crashes the server");
  const S = await startServer(3932);
  const cs = await fill(S.url, 2, ["engineering", "medical"]);
  try {
    const junk = [null, undefined, 5, "str", [], {}, { x: "a" }, { id: {} }, { dept: ["x"] }, { text: 5 }, { x: NaN, z: Infinity, rotation: 1, running: 1 }, { targets: "x" }, { room: {} }, { code: 5, name: 5 }];
    const events = ["room:create", "room:join", "room:rejoin", "lobby:dept", "lobby:ready", "lobby:mission", "lobby:start", "match:lobby", "chat:send", "spectate:ping", "player:move", "interact:start", "interact:cancel", "repair:input", "pod:control", "pod:action", "door:toggle", "decoy:launch", "vote:cast", "bogus:event"];
    for (const e of events) for (const j of junk) cs[1].socket.emit(e, j);
    await sleep(200);
    cs[1].socket.emit("lobby:ready", { ready: true }); await sleep(100);
    cs[0].socket.emit("lobby:start");
    for (const e of events) for (const j of junk) cs[1].socket.emit(e, j);
    await sleep(300);
    check("server survived ~200 malformed messages in lobby", cs[0].socket.connected);
    check("match still starts afterwards", await cs[0].waitFor(() => cs[0].started !== null, 2000));
    await cs[0].waitFor(() => cs[0].went, 40000);
    for (const e of events) for (const j of junk) cs[1].socket.emit(e, j);
    await sleep(300);
    check("server survived malformed messages during a match", cs[0].socket.connected && cs[1].socket.connected && cs[0].state?.status === "playing");
  } finally { closeAll(cs); S.close(); }
}

async function matchTests() {
  section("match: briefing, movement validation, tasks over the network");
  const S = await startServer(3933);
  let cs = [];
  try {
    cs = await fill(S.url, 4, ["engineering", "eva", "command", "medical"]);
    const [eng, eva, cmd, med] = cs; med.skipIntro = false;
    for (const c of cs.slice(1)) c.socket.emit("lobby:ready", { ready: true });
    eng.socket.emit("lobby:start");
    check("everyone receives the match start with a unique spawn", await eng.waitFor(() => cs.every((c) => c.started)) && new Set(cs.map((c) => `${c.started.self.x},${c.started.self.z}`)).size === 4);
    check("spawns follow join order (slot 0..3)", cs.every((c, i) => c.started.self.x === spawnPoint(i).x));
    check("briefing phase first", eng.started.phase === "briefing" && eng.state.status === "playing");
    const introRoom = S.api.rooms.get(eng.code);
    check("one crew member can keep watching the opening", introRoom.briefingEndsAt - Date.now() > 20000 && introRoom.game.time === 0);
    eng.socket.emit("intro:done"); await sleep(100);
    check("repeated skip requests cannot bypass another player", introRoom.briefingEndsAt - Date.now() > 20000);
    med.socket.emit("intro:done"); await sleep(100);
    check("whole-crew skip starts a shared ten-second role countdown", introRoom.briefingEndsAt - Date.now() <= 10000 && introRoom.briefingEndsAt - Date.now() > 9000);
    // movement is ignored/validated during briefing
    check("the match goes live after the briefing", await eng.waitFor(() => eng.went, 40000));
    check("all four departments are present", new Set(eng.state.players.map((p) => p.dept)).size === 4);

    const room = S.api.rooms.get(eng.code), game = room.game;
    // validation
    eng.corrections = 0; eng.x = 0; eng.z = 5; eng.send(false);
    check("teleporting is rejected and corrected", await eng.waitFor(() => eng.corrections > 0, 800));
    eng.x = spawnPoint(0).x; eng.z = spawnPoint(0).z; await sleep(250); eng.corrections = 0;
    eng.x = -0.05; eng.z = -5; eng.send(false); await sleep(150);
    check("walking through a wall is rejected", eng.corrections > 0);
    eng.x = spawnPoint(0).x; eng.z = spawnPoint(0).z; await sleep(300); eng.corrections = 0;
    // closed door blocks movement
    game.rooms.pod.closed = true;
    const probe = cs[3]; probe.corrections = 0;
    S.api.rooms.get(eng.code).matchPlayers[3].x = 3; S.api.rooms.get(eng.code).matchPlayers[3].z = 3; probe.x = 3; probe.z = 3;
    await sleep(100); probe.x = 1.0; probe.z = 1.65; probe.send(false);
    check("a closed blast door blocks players on the server", await probe.waitFor(() => probe.corrections > 0, 800));
    game.rooms.pod.closed = false;
    probe.corrections = 0;
    const pp = S.api.rooms.get(eng.code).matchPlayers[3];
    pp.x = spawnPoint(3).x; pp.z = spawnPoint(3).z; probe.x = pp.x; probe.z = pp.z; await sleep(150); probe.corrections = 0;

    // honest walking to the power core, no corrections
    game.nextBreachAt = 99999; game.lockdown.nextAt = 99999;
    eng.corrections = 0;
    await eng.walk([[-6, -4], [-1, -1], [1, -1], [3, -3], [3, -6], [8.25, -6]]);
    check("honest walking across the station causes zero corrections", eng.corrections === 0, String(eng.corrections));
    const spec = eng.state.calibrations.power;
    for (let i = 1; i <= 3; i++) if (spec.target & (1 << (i - 1))) { eng.socket.emit("repair:input", { id: "power", value: i }); await sleep(120); }
    check("calibration is accepted through validated network input", await eng.waitFor(() => eng.state.calibrations.power.solved));
    eng.socket.emit("interact:start", { id: "power" });
    check("server shows the repair in progress", await eng.waitFor(() => eng.state.holds[eng.id]?.id === "power", 800));
    await sleep(1500);
    const prog = eng.state.holds[eng.id]?.progress ?? 0;
    check("progress is reported (~45% at 1.5s of 3.3s)", prog > 0.3 && prog < 0.7, String(prog));
    check("power core completes for the specialist", await eng.waitFor(() => eng.state.power, 3000));
    check("task event is announced to the crew", cmd.events.some((e) => e.type === "task" && e.id === "power"));
    // pump requires power: now allowed
    await eng.walk([[5.5, -8.25]]);
    eng.errors.length = 0;
    eng.socket.emit("interact:start", { id: "console" });
    await sleep(120);
    check("out-of-range interaction is refused with a message", /closer/i.test(eng.errors[0] || ""));
    // chat during a match + system messages
    cmd.chat.length = 0; eng.socket.emit("chat:send", { text: "engine online" });
    check("crew chat works during a match", await cmd.waitFor(() => cmd.chat.some((m) => m.text === "engine online")));
    // joining mid-match is refused
    const late = client(S.url); await late.ready;
    try { await late.join("Late", eng.code); check("cannot join a match in progress", false); } catch (m) { check("cannot join a match in progress", /in progress/.test(String(m))); }
    late.socket.disconnect();

    // reconnect mid-match
    const medP = S.api.rooms.get(eng.code).matchPlayers[3];
    medP.x = -5; medP.z = -6;
    const { token, id, code } = med;
    med.socket.disconnect();
    check("a dropped player stays in the match and is shown offline", await eng.waitFor(() => eng.state.players.find((p) => p.id === id)?.conn === false));
    const med2 = client(S.url); await med2.ready; cs.push(med2);
    await med2.rejoin(code, token);
    check("rejoin during a match restores the character and position", med2.joined.match?.phase === "playing" && Math.abs(med2.joined.match.self.x + 5) < 0.01 && med2.id === id);
    check("rejoined player is connected again", await eng.waitFor(() => eng.state.players.find((p) => p.id === id)?.conn === true));

    // lockdown garbles chat between sealed sections
    const [pe, pv, pc] = [0, 1, 2].map((i) => S.api.rooms.get(eng.code).matchPlayers[i]);
    pe.x = 6; pe.z = -6; pv.x = -6; pv.z = 6; pc.x = 6; pc.z = -7;
    game.lockdown.active = true; game.lockdown.rooms = ["engineering", "medical"];
    game.rooms.engineering.locked = game.rooms.medical.locked = game.rooms.engineering.closed = game.rooms.medical.closed = true;
    eva.chat.length = 0; cmd.chat.length = 0;
    const msg = "the pump pressure is rising quickly";
    eng.socket.emit("chat:send", { text: msg });
    await sleep(150);
    const sameSection = cmd.chat.find((m) => m.from?.name === "Host" || m.text === msg);
    const crossSection = eva.chat.find((m) => m.from);
    check("chat inside the same sealed room arrives clean", cmd.chat.some((m) => m.text === msg && !m.garbled));
    check("chat across the lockdown is garbled (glitchy walkie-talkie)", !!crossSection && crossSection.garbled === true && crossSection.text !== msg && crossSection.text.length === msg.length, JSON.stringify(crossSection));
    game.lockdown.active = false; game.lockdown.rooms = [];
    game.rooms.engineering.locked = game.rooms.medical.locked = game.rooms.engineering.closed = game.rooms.medical.closed = false;
  } finally { closeAll(cs); S.close(); }
}

async function escapeTests() {
  section("escape over the network: launch, vote, boarding, summary, replay (server time x4)");
  const S = await startServer(3934, 4);
  let cs = [];
  try {
    cs = await fill(S.url, 5, ["engineering", "eva", "command", "medical", "medical"]);
    cs[0].socket.emit("lobby:start");
    await cs[0].waitFor(() => cs.every((c) => c.went), 40000);
    const room = S.api.rooms.get(cs[0].code), game = room.game, P = room.matchPlayers;
    game.nextBreachAt = 1e9; game.lockdown.nextAt = 1e9;
    for (const id of ["power", "pump", "console", "lifesupport", ...game.activeJunctions]) game.tasks[id].done = true;
    P[0].x = front(STATIONS.launch).x; P[0].z = front(STATIONS.launch).z;
    cs[0].x = P[0].x; cs[0].z = P[0].z;
    cs[0].socket.emit("interact:start", { id: "launch" });
    check("launching with 5 players (4 seats) opens a vote", await cs[0].waitFor(() => cs[0].state.stage === "vote", 4000));
    check("vote asks to leave exactly 1 behind", cs[0].state.vote.k === 1 && cs[0].state.seats === 4);
    cs[1].errors.length = 0; cs[1].socket.emit("vote:cast", { targets: [cs[2].id, cs[3].id] });
    await sleep(120);
    check("voting for too many people is refused", /at most 1/.test(cs[1].errors[0] || ""));
    await sleep(250);
    for (const c of cs) c.socket.emit("vote:cast", { targets: [cs[4].id], confirmed: false });
    await sleep(180); check("network drafts cannot resolve the vote", game.stage === "vote" && !Object.keys(game.vote.ballots).length);
    for (const c of cs) c.socket.emit("vote:cast", { targets: [cs[4].id], confirmed: true });
    check("vote result: the crew's choice stays behind", await cs[0].waitFor(() => cs[0].state.stage === "boarding" && cs[0].state.boarding.left.includes(cs[4].id), 3000));
    check("the result is announced in chat", await cs[1].waitFor(() => cs[1].chat.some((m) => m.system && /stay behind/.test(m.text)), 1500));
    // everybody except the left-behind player boards
    for (let i = 0; i < 4; i++) { P[i].x = FINALE_POINTS.board.x; P[i].z = FINALE_POINTS.board.z; cs[i].socket.emit("interact:start", { id: "board" }); }
    check("explicit boarding starts the chase instead of ending the match", await cs[0].waitFor(() => cs[0].state.stage === "finale", 4000) && !cs[0].over);
    cs[1].socket.emit("pod:action", { action: "repair" });
    cs[1].socket.emit("pod:action", { action: "repairStop" });
    await sleep(120);
    check("a quick repair release is not swallowed by the action rate limit", !!P[1].rate.podAction && !!P[1].rate.podRepairStop && !game.finale.pod.repairs[P[1].id]);
    game.finale.station.collapseAt = game.time + 45;
    P[4].x = FINALE_POINTS.beacon.x; P[4].z = FINALE_POINTS.beacon.z;
    cs[4].socket.emit("interact:start", { id: "beacon" });
    check("station survivor can operate the beacon over the network", await cs[0].waitFor(() => cs[0].state.finale.station.beacon));
    const driver = setInterval(() => {
      const f = cs[0].state?.finale; if (!f || f.pod.status !== "running") return;
      const pilot = cs.find(c => c.id === f.pod.pilot), gate = f.pod.route[0], target = f.pod.phase === "rendezvous" ? 0 : gate?.lane === -1 ? 0 : -1;
      pilot?.socket.emit("pod:control", { steer: Math.abs(f.pod.lane - target) < 0.1 ? 0 : Math.sign(target - f.pod.lane), throttle: f.pod.phase === "rendezvous" ? 0.15 : 1, boost: false });
      for (const c of cs.slice(0, 4).filter(c => c !== pilot)) if (f.pod.hull < 85 || f.pod.oxygen < 70) c.socket.emit("pod:action", { action: "repair" });
    }, 70);
    const finished = await cs[0].waitFor(() => cs[0].over?.result === "win", 35000); clearInterval(driver);
    check("network pilot and support crew survive the full route", finished);
    check("summary: 4 aboard, 1 left behind, partial grade", cs[0].over.aboard.length === 4 && cs[0].over.leftBehind.length === 1 && cs[0].over.grade === "partial", JSON.stringify(cs[0].over));
    check("everyone receives the same summary", cs.every((c) => c.over?.reason === cs[0].over.reason));
    // replay
    for (const c of cs) c.socket.emit("epilogue:done"); await sleep(150);
    cs[3].socket.emit("match:lobby");
    check("anyone can send the crew back to the lobby", await cs[0].waitFor(() => cs.every((c) => c.gotLobbyReturn && c.lobby.phase === "lobby"), 2000));
    check("ready flags are cleared for the next mission", cs[0].lobby.players.every((p) => !p.ready));
    cs[0].started = null; cs.forEach((c) => (c.went = false));
    for (const c of cs.slice(1)) c.socket.emit("lobby:ready", { ready: true }); await sleep(150);
    cs[0].socket.emit("lobby:start");
    check("a second match can start from the same room", await cs[0].waitFor(() => cs[0].started !== null && cs[0].went, 40000) && cs[0].state.status === "playing" && cs[0].state.t < 20);
    const g2 = S.api.rooms.get(cs[0].code).game;
    check("the second match is a fresh game (nothing carried over)", !g2.tasks.power.done && g2.oxygen > 90 && g2.rooms.control.flood === 0);
  } finally { closeAll(cs); S.close(); }
}

async function loseAndSpectateTests() {
  section("losing, spectators (server time x6)");
  const S = await startServer(3935, 6);
  let cs = [];
  try {
    cs = await fill(S.url, 2, ["engineering", "medical"]);
    cs[0].socket.emit("lobby:start");
    await cs[0].waitFor(() => cs.every((c) => c.went), 40000);
    const room = S.api.rooms.get(cs[0].code), game = room.game, P = room.matchPlayers;
    // kill player 1 by making them "lost"
    P[1].downed = true; P[1].hp = 0; P[1].downedAt = game.time - 100;
    await sleep(300);
    check("a crew member who isn't revived becomes lost", cs[0].state.players.find((p) => p.id === cs[1].id).lost);
    cs[0].chat.length = 0;
    cs[1].socket.emit("spectate:ping", { targetId: cs[0].id });
    check("a spectator can ping a teammate's location", await cs[0].waitFor(() => cs[0].chat.some((m) => /\[spectator/.test(m.text)), 1500));
    cs[0].socket.emit("spectate:ping", { targetId: cs[1].id }); await sleep(100);
    check("living players cannot use spectator pings", !cs[1].chat.some((m) => /pings Host/.test(m.text) && /spectator Host/.test(m.text)));
    cs[1].corrections = 0; cs[1].x += 3; cs[1].send(false); await sleep(150);
    check("lost crew cannot move", cs[1].corrections > 0);
    // total flood => lose
    game.nextBreachAt = 1e9;
    game.rooms.engineering.flood = 3.34; game.rooms.engineering.closed = true;
    game.breaches.push({ id: "breach:99", room: "engineering", x: 5, z: -5 });
    check("flooding Engineering ends the match in defeat", await cs[0].waitFor(() => cs[0].over?.result === "lose", 5000));
    check("defeat summary names the reason", /reactor|flooded/i.test(cs[0].over.reason));
  } finally { closeAll(cs); S.close(); }
}

async function eightPlayers() {
  section("8 players: full lobby + live match + 20 breaches/lockdown (server time x8)");
  const S = await startServer(3936, 8);
  let cs = [];
  try {
    cs = await fill(S.url, 8, [null, null, null, null, null, null, null, null]);
    cs[0].socket.emit("lobby:start");
    check("8 players start together", await cs[0].waitFor(() => cs.every((c) => c.went), 40000));
    check("all four departments are covered with random picks", new Set(cs[0].state.players.map((p) => p.dept)).size === 4);
    check("all 8 have distinct spawn points", new Set(cs.map((c) => `${c.started.self.x},${c.started.self.z}`)).size === 8);
    const room = S.api.rooms.get(cs[0].code), game = room.game, P = room.matchPlayers;
    check("8-player scaling is active (5 breaches max, 3 junctions, 6 seats, 2 lockdowns)", game.scale.maxBreaches === 5 && game.activeJunctions.length === 3 && game.seats === 6 && game.scale.lockdowns === 2);
    // make sure the keep-alive of 'running' / holds don't break with 8
    for (const p of P) p.lastPacket = Date.now();
    game.tasks.power.done = true;
    // breaches appear on their own and the crew gets lockdown
    await sleep(1500);
    check("hull breaches are spawning", game.breaches.length >= 1, String(game.breaches.length));
    // put 4 players in engineering and 4 in medical so lockdown splits them
    P.forEach((p, i) => { if (i < 4) { p.x = 6; p.z = -5 - i * 0.6; } else { p.x = -6; p.z = 5 + (i - 4) * 0.6; } });
    game.lockdown.nextAt = game.time + 0.5;
    check("a lockdown fires and splits the crew", await cs[0].waitFor(() => cs[0].state.lockdown.active, 4000) && cs[0].state.lockdown.rooms.length === 2);
    check("clients see the sealed doors in the state", cs[0].state.lockdown.rooms.every((r) => cs[0].state.rooms[r].closed && cs[0].state.rooms[r].locked));
    // sync override via real messages
    P[0].x = front(STATIONS.door_engineering).x; P[0].z = front(STATIONS.door_engineering).z;
    P[4].x = front(STATIONS.door_medical).x; P[4].z = front(STATIONS.door_medical).z;
    cs[0].socket.emit("interact:start", { id: "door_engineering" });
    cs[4].socket.emit("interact:start", { id: "door_medical" });
    check("both sealed rooms holding their panels releases the lockdown", await cs[0].waitFor(() => !cs[0].state.lockdown.active, 6000));
    check("crew receives the 'lockdown lifted' message", cs[0].chat.some((m) => /Lockdown lifted/.test(m.text)));
    // sustained broadcasting with 8 clients
    const t0 = cs[0].state.t; await sleep(1000);
    check("state keeps flowing to all 8 clients", cs.every((c) => c.state && c.socket.connected));
  } finally { closeAll(cs); S.close(); }
}

async function equipmentTests() {
  section('equipment: four divers, validation, rate limits and reconnect');
  const S=await startServer(3938); let cs=[];
  try {
    cs=await fill(S.url,4,['engineering','eva','command','medical']);
    cs[0].socket.emit('lobby:start');
    check('all four receive equipment at match start',await cs[0].waitFor(()=>cs.every(c=>c.started)) && cs.every(c=>c.started.state.players.every(p=>p.inventory.length===4)));
    const room=S.api.rooms.get(cs[0].code);
    // Private fixture advances the briefing only; equipment is exercised through real sockets.
    room.phase='playing';room.game.lastTick=Date.now();
    room.matchPlayers.forEach((p,i)=>{p.exterior=true;p.x=-15-i;p.z=4+i;});
    cs[0].socket.emit('item:use',{slot:'__proto__'});
    check('malformed item intent rejected over the network',await cs[0].waitFor(()=>cs[0].errors.some(e=>/slot/i.test(e))));
    await sleep(300);
    for(const c of cs) for(let i=0;i<12;i++) c.socket.emit('item:use',{slot:0,x:999,z:999,charges:999});
    check('four outside divers can deploy independently',await cs[0].waitFor(()=>cs.every(c=>c.state.effects?.length===4)));
    check('spam consumes exactly one flare per diver',room.game.effects.length===4 && room.matchPlayers.every(p=>p.inventory[0]===null&&p.inventory[1]==='decoy'));
    check('client supplied positions and charges are ignored',room.game.effects.every(e=>e.x<=-15&&e.x>=-18&&e.z>=4&&e.z<=7));
    check('all clients receive the equipment event',cs.every(c=>c.events.some(e=>e.type==='item')));
    const old=cs[3], token=old.token,code=old.code,id=old.id;old.socket.disconnect();await sleep(150);
    const replacement=client(S.url);await replacement.ready;cs[3]=replacement;await replacement.rejoin(code,token);
    check('reconnecting does not replenish spent equipment',replacement.state.players.find(p=>p.id===id)?.inventory[0]===null && replacement.state.effects.length===4);
    await sleep(3100);
    cs[2].socket.emit('item:use',{slot:3,item:'welder',x:999,z:999});
    check('Command scan shares an authoritative contact with every client',await cs[0].waitFor(()=>cs.every(c=>c.state.scan?.remaining>0)) && Math.abs(cs[0].state.scan.x)<50);
    cs[1].socket.emit('item:use',{slot:3,x:999,z:999});
    check('EVA marker shares the real airlock position',await cs[0].waitFor(()=>cs.every(c=>c.state.returnMarker?.x===-12)));
    const medic=room.matchPlayers.find(p=>p.id===cs[3].id);medic.suit=40;
    cs[3].socket.emit('item:use',{slot:3,result:999});
    check('Medical canister changes real suit air without trusting a client result',await cs[0].waitFor(()=>medic.inventory[3]===null) && medic.suit>60 && medic.suit<=70);
    const engineer=room.matchPlayers.find(p=>p.id===cs[0].id);
    cs[0].socket.emit('item:use',{slot:3});
    check('welder outside is rejected without consuming its charge',await cs[0].waitFor(()=>cs[0].errors.some(e=>/repair tool/i.test(e))) && engineer.inventory[3]==='welder');
    cs[0].socket.emit('locker:take',{locker:'medical',item:'repair'});
    check('outside locker requests are rejected over the network',await cs[0].waitFor(()=>cs[0].errors.some(e=>/Stores are available/i.test(e))));
    room.matchPlayers.forEach(p=>Object.assign(p,{exterior:false,x:-8,z:4.2}));await sleep(300);
    for(const c of cs)for(let i=0;i<8;i++)c.socket.emit('locker:take',{locker:'medical',item:'repair',slot:3,count:99,x:999,z:999});
    check('simultaneous checkout consumes the final shared unit once',await cs[0].waitFor(()=>cs.every(c=>c.state.lockers?.medical.repair===0)) && room.matchPlayers.filter(p=>p.inventory[0]==='repair').length===1);
    check('checkout ignores forged slot and quantity while preserving signature gear',room.matchPlayers.every(p=>p.inventory.length===4)&&engineer.inventory[3]==='welder');
    check('only the successful checkout is broadcast',await cs[0].waitFor(()=>cs.every(c=>c.events.filter(e=>e.type==='lockerTake').length===1)));
    const beforeStock=JSON.stringify(room.game.lockers);await sleep(300);
    cs[0].socket.emit('locker:take',{locker:'__proto__',item:'constructor'});await sleep(300);
    check('malformed locker IDs do not change reserves',JSON.stringify(room.game.lockers)===beforeStock);
    const oldEva=cs[1];oldEva.socket.disconnect();await sleep(150);const newEva=client(S.url);await newEva.ready;cs[1]=newEva;await newEva.rejoin(oldEva.code,oldEva.token);
    check('reconnect restores depleted shared stores without duplication',newEva.state.lockers.medical.repair===0);
    const resource=room.game.resources[0],count=room.game.resources.length;
    room.matchPlayers.forEach(p=>{Object.assign(p,{exterior:true,x:resource.x,z:resource.z+1});p.inventory[0]=null;});await sleep(200);
    for(const c of cs)c.socket.emit('interact:start',{id:resource.id,item:'scanner',slot:3,result:99});
    check('four outside players contend for one canister without duplicating it',await cs[0].waitFor(()=>cs.every(c=>c.state.resources?.length===count-1),5000) && room.matchPlayers.filter(p=>p.inventory[0]===resource.item).length===1);
    check('only the actual resource item and first empty slot are granted',room.matchPlayers.every(p=>p.inventory[0]===null||p.inventory[0]===resource.item));
    check('all clients receive one recovery event and the removed world resource',await cs[0].waitFor(()=>cs.every(c=>c.events.filter(e=>e.type==='resourceRecovered').length===1&&!c.state.resources.some(r=>r.id===resource.id))));
    const resourceEva=cs[1];resourceEva.socket.disconnect();await sleep(150);const restoredEva=client(S.url);await restoredEva.ready;cs[1]=restoredEva;await restoredEva.rejoin(resourceEva.code,resourceEva.token);
    check('reconnect cannot restore an already recovered canister',!restoredEva.state.resources.some(r=>r.id===resource.id));
    room.matchPlayers.forEach(p=>{Object.assign(p,{exterior:true,x:SALVAGE.x,z:SALVAGE.z+1});p.inventory[0]=null;});await sleep(200);
    for(const c of cs)c.socket.emit('interact:start',{id:SALVAGE.recover,result:'installed',bonus:999,slot:3});
    check('four network divers recover exactly one authoritative regulator',await cs[0].waitFor(()=>cs.every(c=>c.state.salvage?.state==='carried'),5500)&&room.matchPlayers.filter(p=>p.inventory.includes('regulator')).length===1);
    const carrierIndex=room.matchPlayers.findIndex(p=>p.inventory.includes('regulator')),carrier=room.matchPlayers[carrierIndex];
    Object.assign(carrier,{exterior:false,x:STATIONS.pump.x,z:STATIONS.pump.z+1});room.game.tasks.power.done=room.game.tasks.pump.done=true;await sleep(200);
    cs[carrierIndex].socket.emit('interact:start',{id:SALVAGE.install,bonus:999});
    check('installation broadcasts one permanent reward and consumes the cargo',await cs[0].waitFor(()=>cs.every(c=>c.state.salvage?.state==='installed'),6000)&&!carrier.inventory.includes('regulator'));
    check('each client receives one installation event',await cs[0].waitFor(()=>cs.every(c=>c.events.filter(e=>e.type==='salvageInstalled').length===1)));
    Object.assign(engineer,{exterior:true,x:-16,z:5.5,lastMove:Date.now()});cs[0].x=-16;cs[0].z=5.5;cs[0].corrections=0;
    await cs[0].walk([[-26,5.5]],true);
    check('honest swimming crosses the former 17m edge without corrections',engineer.x<-25.5&&cs[0].corrections===0);
    cs[0].corrections=0;Object.assign(engineer,{x:30.9,z:-1,lastMove:Date.now()-500});cs[0].x=33.1;cs[0].z=-1;cs[0].send(false);
    check('new wreck wall rejects a path with otherwise free endpoints',await cs[0].waitFor(()=>cs[0].corrections>0,1000)&&engineer.x===30.9);
    cs[0].corrections=0;cs[0].x=61;cs[0].z=-1;await sleep(300);cs[0].send(false);
    check('survey perimeter remains authoritative over the network',await cs[0].waitFor(()=>cs[0].corrections>0,1000)&&engineer.x<60);
  } finally { closeAll(cs);S.close(); }
}

await equipmentTests();
await lobbyTests();
await robustnessTests();
await matchTests();
await escapeTests();
await loseAndSpectateTests();
await eightPlayers();
console.log(`\n${checks - fails}/${checks} network checks passed`);
process.exit(fails ? 1 : 0);
