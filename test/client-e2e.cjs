// Browser-simulation test: runs the REAL client code (lobby, HUD, game loop) in jsdom against the REAL server.
// WebGL is stubbed, so this checks logic, networking and the UI, not how the 3D scene looks.
//   npm run test:client
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { pathToFileURL } = require("url");
const ROOT = path.resolve(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, checks = 0;
const ok = (n, c, x = "") => { checks++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  -> " + x}`); if (!c) fails++; };
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await sleep(40); } return false; };

(async () => {
  const { Server } = require("socket.io");
  const { io: connect } = require("socket.io-client");
  const { attachGame } = await import(pathToFileURL(path.join(ROOT, "server/net.js")).href);
  const { STATIONS } = await import(pathToFileURL(path.join(ROOT, "shared/layout.js")).href);
  const { FINALE_POINTS } = await import(pathToFileURL(path.join(ROOT, "shared/tactical.js")).href);
  const { build } = await import("vite");
  const output = await build({
    plugins: [{ name: "count-visible-view-work", transform(code, id) {
      if(id.replaceAll("\\", "/").endsWith("/client/src/work-hands.js"))return code.replace("if(disposed)return;pose=next;", "if(disposed)return;globalThis.__workPose=next?.kind||null;pose=next;").replace("try{renderer.clearDepth();", "try{globalThis.__workRenders=(globalThis.__workRenders||0)+1;renderer.clearDepth();");
      if (id.replaceAll("\\", "/").endsWith("/client/src/world.js")) return code.replace("function update(state, ctx) {", "function update(state, ctx) { globalThis.__stationUpdates = (globalThis.__stationUpdates || 0) + 1;");
      if (id.replaceAll("\\", "/").endsWith("/client/src/pod-view.js")) return code.replace("update(finale, dt, rear = false, reduced = false, audible = true) {", "update(finale, dt, rear = false, reduced = false, audible = true) { globalThis.__podUpdates = (globalThis.__podUpdates || 0) + 1;");
    } }],
    configFile: false, root: path.join(ROOT, "client"), logLevel: "error",
    resolve: { alias: [{ find: /^three$/, replacement: path.join(ROOT, "test/three-stub.js") }] },
    define: { "import.meta.env.VITE_SERVER_URL": "undefined" },
    build: { write: false, minify: false, lib: { entry: path.join(ROOT, "client/src/main.js"), name: "GameTest", formats: ["iife"] } }
  });
  const bundle = (Array.isArray(output) ? output[0] : output).output.find(o => o.type === "chunk").code;
  const PORT = 3961;
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  const api = attachGame(io, { timeScale: 1, log: { log() {}, error: console.error } });
  await new Promise((r) => httpServer.listen(PORT, r));

  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(String(e.stack || e)));
  vc.on("error", (...a) => errors.push(a.join(" ")));
  const html = fs.readFileSync(path.join(ROOT, "client/index.html"), "utf8").replace(/<script[^>]*><\/script>/, "");
  const dom = new JSDOM(html, { url: `http://localhost:${PORT}/`, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  const ctx2d = new Proxy({}, { get: (t, k) => (k === "createRadialGradient" || k === "createLinearGradient" ? () => ({ addColorStop() {} }) : k === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  w.HTMLCanvasElement.prototype.requestPointerLock = function () {};
  w.navigator.clipboard = { writeText: async () => {} };
  w.eval(bundle);
  const $ = (id) => w.document.getElementById(id);
  const txt = (id) => $(id).textContent;
  const vis = (id) => !$(id).classList.contains("hidden");
  const key = (type, code) => w.document.dispatchEvent(new w.KeyboardEvent(type, { code, bubbles: true }));
  const tap = async (code, ms = 60) => { key("keydown", code); await sleep(ms); key("keyup", code); };

  // ------------------------------------------------------------------ menu
  console.log("\n[menu + lobby]");
  await until(() => /ONLINE/.test(txt("menu-status")), 6000);
  ok("menu shows connected status", /ONLINE/.test(txt("menu-status")), txt("menu-status"));
  $("create-room").click();
  ok("empty name is rejected", /ENTER A NAME/.test(txt("menu-status")));
  $("player-name").value = "Anurag";
  $("create-room").click();
  ok("creating a room opens the lobby", await until(() => vis("lobby") && !vis("menu")));
  ok("lobby shows the 5-character code", /^[A-Z0-9]{5}$/.test(txt("lobby-code")), txt("lobby-code"));
  const code = txt("lobby-code");
  ok("4 department cards are shown", $("dept-cards").children.length === 4);
  ok("lobby lists me as host", /Anurag.*HOST/.test(txt("lobby-players")), txt("lobby-players"));
  ok("host sees the start button", vis("start-button") || !$("start-button").classList.contains("hidden"));
  $("dept-cards").children[0].click(); // engineering
  await sleep(200);
  ok("choosing a department highlights the card", $("dept-cards").children[0].classList.contains("selected"));
  $("ready-button").click(); await sleep(200);
  ok("ready toggles", /READY \(click to cancel\)/.test(txt("ready-button")), txt("ready-button"));
  $("lobby-chat-input").value = "hello from the lobby";
  $("lobby-chat-input").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await sleep(250);
  ok("lobby chat message appears", /hello from the lobby/.test(txt("lobby-chat-log")), txt("lobby-chat-log"));

  // three more players
  const bots = [];
  for (const [name, dept] of [["Eva", "eva"], ["Cmd", "command"], ["Med", "medical"]]) {
    const s = connect(`http://localhost:${PORT}`, { transports: ["websocket"], reconnection: false });
    const b = { s, name, chat: [], state: null };
    s.on("match:start", () => s.emit("intro:done"));
    s.on("game:state", (st) => (b.state = st));
    s.on("room:joined", (d) => { b.id = d.you.id; });
    s.on("chat:msg", (m) => b.chat.push(m));
    await new Promise((r) => s.on("connect", r));
    s.emit("room:join", { name, code }); await sleep(120);
    s.emit("lobby:dept", { dept }); s.emit("lobby:ready", { ready: true });
    bots.push(b);
  }
  await sleep(300);
  ok("lobby shows all 4 players", /4 \/ 8/.test(txt("lobby-count")), txt("lobby-count"));
  ok("departments are shown for others", /Eva/.test(txt("lobby-players")) && /EVA/.test(txt("lobby-players")));
  ok("start button shows ready count", /START MISSION \(4\/4 ready\)/.test(txt("start-button")), txt("start-button"));

  // ------------------------------------------------------------------ briefing + match
  console.log("\n[briefing + match]");
  $("start-button").click();
  // Cold procedural scene construction can exceed the ordinary 6s interaction timeout
  // in jsdom; still require the actual incident record within its opening window.
  ok("game opens with the incident record", await until(() => vis("game") && vis("prologue"),15000));
  $("prologue").querySelector("button").click();
  ok("skipping the record reveals the role briefing", await until(() => vis("briefing")));
  ok("briefing shows my role", /ENGINEERING/.test(txt("briefing-role")), txt("briefing-role"));
  ok("role briefing gives a first assignment and the actual pod capacity", /Power core/.test(txt("briefing-task")) && /3 pod seats for 4 crew/.test(txt("briefing-evacuation")));
  ok("the briefing ends and the mission starts", await until(() => !vis("briefing"), 40000));
  ok("renderer is rendering frames", (w.__frames || 0) > 20, String(w.__frames));
  ok("HUD shows department badge", /ENG/.test(txt("dept-badge")), txt("dept-badge"));
  ok("systems panel lists the stations (8 shown for 4 players)", [...$("systems-list").children].filter((r) => !r.classList.contains("hidden")).length === 8);
  ok("crew roster shows 4 crew", $("roster-list").children.length === 4);
  ok("objective points at the Power core", /power/i.test(txt("objective")), txt("objective"));
  ok("starting location is the Control Room", /CONTROL ROOM/.test(txt("room-name")), txt("room-name"));

  const room = api.rooms.get(code), game = room.game, P = room.matchPlayers;
  ok('equipment hotbar shows three shared tools and a role tool', vis('gear') && $('gear-slots').children.length === 4 && /Flare/.test(txt('gear-slots')) && /Welder/.test(txt('gear-slots')));
  for(let i=0;i<3;i++) await tap('KeyQ');
  ok('Q cycles through the fourth role slot', $('gear-slots').children[3].getAttribute('aria-pressed') === 'true');
  await tap('KeyQ');
  ok('Q wraps back to the first shared slot', $('gear-slots').children[0].getAttribute('aria-pressed') === 'true');
  await tap('Digit1');
  ok('equipment shortcut consumes a server-owned flare', await until(() => P[0].inventory[0] === null && game.effects.length === 1));
  ok('spent tool is disabled in the hotbar', await until(() => $('gear-slots').children[0].disabled && /Spent/.test($('gear-slots').children[0].textContent)));
  game.lockdown.nextAt = 1e9; game.nextBreachAt = 1e9;
  // This UI tour injects individual hazards below; keep unrelated random encounters out of its timing fixtures.
  game.threats.skitterAt=game.threats.electricAt=game.threats.wardenAt=1e9;
  const sockOf = (i) => io.sockets.sockets.get(P[i].socketId);
  const tp = (i, x, z, target) => { P[i].x = x; P[i].z = z; sockOf(i)?.emit("player:correct", { x, z, teleport: true, rotation: target ? Math.atan2(x - target.x, z - target.z) : undefined }); };
  const front = (st, d = 1.3) => ({ x: st.x + Math.sin(st.rot) * d, z: st.z + Math.cos(st.rot) * d });

  // walking with the keyboard
  const before = P[0].x + "," + P[0].z;
  key("keydown", "KeyD"); await sleep(500); key("keyup", "KeyD");
  await sleep(300);
  ok("keyboard movement reaches the server", P[0].x + "," + P[0].z !== before, before + " -> " + P[0].x + "," + P[0].z);

  // power core
  tp(0, front(STATIONS.power).x, front(STATIONS.power).z, STATIONS.power); await sleep(300);
  ok("aiming at the Power core shows a calibration prompt", /CALIBRATE POWER CORE/.test(txt("interaction")), txt("interaction"));
  await tap("KeyE"); await sleep(200);
  ok("interacting opens the circuit maintenance interface", vis("repair-panel") && /Power core/.test(txt("repair-title")));
  for (let i = 1; i <= 3; i++) if (game.calibrations.power.target & (1 << (i - 1))) { $("repair-inputs").children[i - 1].click(); await sleep(180); }
  ok("matching circuit controls calibrates the real server system", game.calibrations.power.solved);
  $("repair-close").click(); await sleep(100);
  ok("calibrated panel returns to timed repair", !vis("repair-panel") && /REPAIR POWER CORE/.test(txt("interaction")));
  key("keydown", "KeyE"); await sleep(1500);
  ok("holding E shows server-confirmed progress", /POWER CORE/.test(txt("interaction")) && !$("repair-wrap").classList.contains("hidden"), txt("interaction"));
  const w1 = parseFloat($("repair-fill").style.width); await sleep(1000); const w2 = parseFloat($("repair-fill").style.width);
  ok("repair bar advances", w2 > w1, `${w1} -> ${w2}`);
  const powerRepaired = await until(() => game.tasks.power.done, 6000); key("keyup", "KeyE"); await sleep(100);
  ok("Engineering specialist completes the required repair hold", powerRepaired);
  ok("toast announces the repair", /POWER CORE REPAIRED/.test(txt("toast")), txt("toast"));
  ok("systems row shows ONLINE", [...w.document.querySelectorAll(".system em")].some((e) => /ONLINE/.test(e.textContent)));
  ok("objective advances to the pump", await until(() => /pump/i.test(txt("objective"))), txt("objective"));
  tp(0,8,-2.1,{x:8,z:-2.9});await sleep(300);
  ok('existing Engineering storage has a supply interaction',/ENGINEERING STORES.*SHARED SUPPLIES/.test(txt('interaction')));
  await tap('KeyE');
  ok('E opens a locker without hiding suit meters',await until(()=>vis('locker-panel')) && /FREE SLOTS/.test(txt('locker-capacity')));
  const repairStock=game.lockers.engineering.repair;
  $('locker-stock').querySelector('[data-item="repair"]').click();
  ok('taking a supply updates real stock and fills the first spent slot',await until(()=>game.lockers.engineering.repair===repairStock-1 && P[0].inventory[0]==='repair'));
  ok('hotbar reflects the new item in its actual slot',await until(()=>/Repair kit/.test($('gear-slots').children[0].textContent)));
  ok('full inventory disables further checkout with an explanation',await until(()=>/Inventory full/.test(txt('locker-note')),2500) && [...$('locker-stock').children].every(b=>b.disabled));
  const storeZ=P[0].z;
  $('locker-close').dispatchEvent(new w.KeyboardEvent('keydown',{code:'KeyS',bubbles:true}));await sleep(650);key('keyup','KeyS');await sleep(200);
  ok('focused locker buttons do not trap movement and walking away closes stores',P[0].z>storeZ+.5 && !vis('locker-panel'));
  tp(0,8,-2.1,{x:8,z:-2.9});await sleep(250);await tap('KeyE');await until(()=>vis('locker-panel'));await tap('Escape');
  ok('Escape closes the locker without pausing the match',!vis('locker-panel') && !vis('pause'));
  game.tasks.pump.done = true; game.complication.state = 'active';
  tp(0, front(STATIONS.pump).x, front(STATIONS.pump).z, STATIONS.pump); await sleep(300);
  ok('pump obstruction has a readable optional service prompt', /CLEAR PUMP FILTER/.test(txt('interaction')) && /OPTIONAL/.test(txt('objective')));
  key('keydown','KeyE');
  ok('holding E clears the actual server complication', await until(() => game.complication.state === 'resolved', 5000));
  key('keyup','KeyE');
  ok('service reward is reported to the crew', await until(()=>/110%/.test(txt('toast'))));

  // locked station gives an explanation
  tp(0, front(STATIONS.launch).x, front(STATIONS.launch).z, STATIONS.launch); await sleep(300);
  ok("a locked station explains what it needs", /NEEDS/.test(txt("interaction")), txt("interaction"));
  key("keydown", "KeyE"); key("keyup", "KeyE"); await sleep(150);

  // hull breach
  game.nextBreachAt = game.time; await sleep(400); game.nextBreachAt = 1e9;
  ok("a hull breach spawns and is announced", game.breaches.length >= 1 && /HULL BREACH/.test(txt("toast")), txt("toast"));
  const b = game.breaches[0];
  tp(0, b.x + 0.5, b.z, b); await sleep(300);
  ok("standing at a breach shows the patch prompt", /PATCH HULL BREACH/.test(txt("interaction")), txt("interaction"));
  key("keydown", "KeyE"); await sleep(200);
  ok('repairing shows actual first-person gloves and a repair tool',await until(()=>w.__workPose==='repair'&&w.__workRenders>0,1500));
  key('keyup','KeyE');await sleep(150);
  ok('releasing interaction immediately hides hands and cancels the server hold',w.__workPose===null&&!game.holds.has(P[0].id));
  key('keydown','KeyE');await sleep(200);
  const patchNeed = game.holds.get(P[0].id)?.need;
  await tap('Digit3');
  ok('repair kit shortcut accelerates the active breach hold', await until(() => P[0].inventory[2] === null && game.holds.get(P[0].id)?.need < patchNeed));
  await until(() => !game.breaches.some(x => x.id === b.id), 7000); key("keyup", "KeyE");
  ok("the breach is patched", !game.breaches.some((x) => x.id === b.id));
  await until(()=>game.time>=P[0].itemReadyAt,4000);
  const welded={...b,id:'breach:role-test'};game.breaches.push(welded);
  tp(0,welded.x+.5,welded.z,welded);await sleep(250);key('keydown','KeyE');await sleep(150);
  await tap('Digit4');
  ok('slot 4 commits the Engineering welder to a real patch',await until(()=>P[0].inventory[3]===null));
  ok('confirmed welder use changes the visible tool during the hold',await until(()=>w.__workPose==='weld',1000));
  ok('welder patch completes through the normal hold rules',await until(()=>!game.breaches.some(x=>x.id===welded.id),2500));key('keyup','KeyE');

  // revive a downed teammate
  P[3].downed = true; P[3].hp = 0; P[3].downedAt = game.time;
  tp(3, -5, -5); tp(0, -5.5, -5, P[3]); await sleep(300);
  ok("roster shows a downed crew member", /DOWN/.test(txt("roster-list")), txt("roster-list"));
  ok("a revive prompt appears next to the downed crew member", /REVIVE MED/.test(txt("interaction")), txt("interaction"));
  key("keydown", "KeyE");
  const revived = await until(() => !P[3].downed && P[3].hp === 40, 10000); key("keyup", "KeyE");
  ok("revive completes after the required hold", revived, JSON.stringify({ d: P[3].downed, hp: P[3].hp }));

  // console
  game.tasks.console.done = true; await sleep(200);
  tp(0, front(STATIONS.console).x, front(STATIONS.console).z, STATIONS.console); await sleep(300);
  ok("console shows a 'use' prompt once repaired", /USE COMMAND CONSOLE/.test(txt("interaction")), txt("interaction"));
  key("keydown", "KeyE"); key("keyup", "KeyE"); await sleep(250);
  ok("tapping E opens the sonar console", vis("console"));
  ok("console reserves contact detail for Command and lists its controls", /COMMAND ACCESS/.test(txt("sonar-readout")) && $("console-doors").children.length === 4 && $("console-decoy").children.length === 1, txt("sonar-readout"));
  await tap("Digit2"); await sleep(250);
  ok("non-Command players are refused console actions (toast)", /Only Command/.test(txt("toast")), txt("toast"));
  // the Command bot uses it for real
  tp(2, front(STATIONS.console).x, front(STATIONS.console).z);
  bots[1].s.emit("door:toggle", { room: "pod" }); await sleep(300);
  ok("Command can seal a door from the console (visible in the console list)", game.rooms.pod.closed && /SEALED/.test(txt("console-doors")), txt("console-doors"));
  game.rooms.pod.closed = false;
  tp(0, 0, 0); await sleep(300);
  ok("walking away closes the console", !vis("console"));

  // chat in game
  key("keydown", "Enter"); await sleep(100);
  ok("Enter opens the chat box", !$("chat-input").classList.contains("hidden"));
  $("chat-input").value = "pump is online";
  $("chat-input").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await sleep(300);
  ok("chat message reaches the crew and the box closes", bots[0].chat.some((m) => m.text === "pump is online") && $("chat-input").classList.contains("hidden"));
  bots[0].s.emit("chat:send", { text: "copy that" }); await sleep(250);
  ok("incoming chat is displayed in the HUD", /copy that/.test(txt("chat-log")), txt("chat-log"));

  // airlock & diver outside (bot Eva)
  game.tasks.power.done = true;
  tp(1, front(STATIONS.airlock_in).x, front(STATIONS.airlock_in).z);
  bots[0].s.emit("interact:start", { id: "airlock_in" }); await until(() => P[1].exterior, 7000); await sleep(100);
  ok("the diver is outside: roster says OUTSIDE", /OUTSIDE/.test(txt("roster-list")), txt("roster-list"));
  game.lev.threat=0;game.lev.state='patrol';
  bots[1].s.emit('item:use',{slot:3});
  ok('Command scan reaches another role as a last-known contact',await until(()=>vis('gear-contact') && /LAST CONTACT.*OLD/.test(txt('gear-contact'))));
  bots[0].s.emit('item:use',{slot:3});await until(()=>!!game.returnMarker);
  const back={x:P[0].x,z:P[0].z};P[0].exterior=true;tp(0,-16,5.5);await sleep(300);
  ok('outside crew see the real airlock bearing and direct-path caution', /AIRLOCK.*DIRECT BEARING/.test(txt('gear-contact')));
  P[0].exterior=false;tp(0,back.x,back.z);await sleep(250);
  ok('inside crew do not see exterior return guidance', !/AIRLOCK/.test(txt('gear-contact')));
  // Return the marker diver before the remaining UI tour; suit air is deliberately finite.
  tp(1,front(STATIONS.airlock_out).x,front(STATIONS.airlock_out).z);bots[0].s.emit('interact:start',{id:'airlock_out'});
  ok('marker diver returns through the real airlock before the extended UI tour',await until(()=>!P[1].exterior,5000));bots[0].s.emit('interact:cancel');
  const supply=game.resources[0],suppliesBefore=game.resources.length,recoveredSlot=P[0].inventory.findIndex(item=>item===null);
  P[0].exterior=true;tp(0,supply.x,supply.z+1,supply);await sleep(300);
  ok('available canister shows a noisy recovery hold',await until(()=>/RECOVER REPAIR KIT.*NOISE/.test(txt('interaction'))));
  key('keydown','KeyE');await sleep(600);key('keyup','KeyE');await sleep(200);
  ok('releasing E leaves the canister available',game.resources.some(r=>r.id===supply.id)&&P[0].inventory[recoveredSlot]===null);
  key('keydown','KeyE');
  ok('holding E recovers an exterior supply into a real inventory slot',await until(()=>game.resources.length===suppliesBefore-1 && P[0].inventory[recoveredSlot]===supply.item,5000));key('keyup','KeyE');
  ok('recovery confirms the slot and route back',await until(()=>txt('toast').includes(`SLOT ${recoveredSlot+1}`)&&/RECOVERED.*MEDICAL AIRLOCK/.test(txt('toast'))));
  tp(0,front(STATIONS.airlock_out).x,front(STATIONS.airlock_out).z,STATIONS.airlock_out);await sleep(300);key('keydown','KeyE');
  const returnedWithSupply=await until(()=>!P[0].exterior,5000);key('keyup','KeyE');
  ok('recovered equipment survives the actual airlock return',returnedWithSupply && P[0].inventory[recoveredSlot]==='repair' && /Repair kit/.test($('gear-slots').children[recoveredSlot].textContent));
  P[0].inventory[0]=null;P[0].exterior=true;P[0].suit=90;tp(0,38,-11,{x:38,z:-12});await sleep(300);
  ok('wreck regulator has a clear recovery interaction',await until(()=>/RECOVER PUMP REGULATOR/.test(txt('interaction'))));
  key('keydown','KeyE');ok('real client recovers the regulator into its free hotbar slot',await until(()=>P[0].inventory[0]==='regulator',5500));key('keyup','KeyE');
  ok('carrying salvage explains the return and installation',await until(()=>/REGULATOR CARRIED/.test(txt('objective'))&&/Pump regulator/.test($('gear-slots').children[0].textContent)));
  P[0].exterior=false;game.tasks.power.done=game.tasks.pump.done=true;tp(0,STATIONS.pump.x,STATIONS.pump.z+1,STATIONS.pump);await sleep(300);
  ok('the repaired pump offers installation instead of an unusable repair',await until(()=>/INSTALL REGULATOR/.test(txt('interaction'))));
  key('keydown','KeyE');ok('client installation consumes the part and changes real match state',await until(()=>game.salvage.state==='installed'&&P[0].inventory[0]===null,6500));key('keyup','KeyE');
  const surveyReturn={x:P[0].x,z:P[0].z};P[0].exterior=true;P[0].suit=90;tp(0,-38,5.5);await sleep(300);
  ok('the expanded exterior shows the actual survey region',await until(()=>/VENT GARDEN/.test(txt('room-name'))));
  tp(0,58,0);await sleep(300);
  ok('the visible survey boundary has a matching on-screen warning',await until(()=>/SURVEY BOUNDARY/.test(txt('banner'))));
  P[0].suit=30;await sleep(200);
  ok('return-air safety takes priority over the boundary warning',await until(()=>/SUIT AIR LOW/.test(txt('banner')) && /MEDICAL AIRLOCK/.test(txt('objective'))));
  P[0].suit=90;P[0].exterior=false;tp(0,surveyReturn.x,surveyReturn.z);await sleep(250);
  ok('survey warnings clear on returning inside',!vis('banner')||!/SUIT AIR|SURVEY BOUNDARY/.test(txt('banner')));

  const {LOGS}=await import(pathToFileURL(path.join(ROOT,'shared/story.js')).href);
  const evidence=LOGS.find(l=>game.story.available.includes(l.id)&&!l.ext);
  P[0].exterior=false;tp(0,evidence.x,evidence.z+1,evidence);await sleep(300);
  ok('available evidence has a readable hold prompt',await until(()=>/RECOVER RECORD/.test(txt('interaction'))));
  key('keydown','KeyE');ok('reading records evidence on the authoritative server',await until(()=>game.story.found.includes(evidence.id),3500));key('keyup','KeyE');
  ok('shared evidence persists in this browser without stopping the scene',await until(()=>JSON.parse(w.localStorage.getItem('pressure-drop-case-file')||'[]').includes(evidence.id)) && (w.__frames||0)>100);
  $('lobby-case-open').click();ok('case file shows recovered story text and keeps unknown records sealed',vis('case-file')&&txt('case-list').includes(evidence.text)&&txt('case-list').includes('EVIDENCE NOT RECOVERED'));$('case-close').click();
  const {WORKBENCH,CIRCUITS}=await import(pathToFileURL(path.join(ROOT,'shared/fieldwork.js')).href);
  const alloy=game.scrap[0];P[0].exterior=true;P[0].suit=90;P[0].inventory[0]=null;tp(0,alloy.x,alloy.z+1,alloy);await sleep(300);
  ok('alloy cache offers a material recovery prompt',await until(()=>/SALVAGED ALLOY/.test(txt('interaction'))));key('keydown','KeyE');ok('alloy recovery consumes the cache and occupies one slot',await until(()=>P[0].inventory[0]==='scrap',5000));key('keyup','KeyE');
  P[0].exterior=false;tp(0,WORKBENCH.x,WORKBENCH.z+1,WORKBENCH);await sleep(300);await tap('KeyE');
  ok('Engineering stores expose real fabrication recipes',vis('locker-panel')&&!!w.document.querySelector('#locker-stock button[data-recipe="flare"]:not(:disabled)'));
  w.document.querySelector('#locker-stock button[data-recipe="flare"]').click();ok('fabrication replaces spent material with the chosen tool',await until(()=>P[0].inventory[0]==='flare'));$('locker-close').click();
  const switchPoint=CIRCUITS.engineering;tp(0,switchPoint.x,switchPoint.z+1,switchPoint);await sleep(300);
  game.rooms.engineering.flood=.6;game.rooms.engineering.closed=true;game.threats.electric={room:'engineering',ready:game.time,until:game.time+30};
  ok('local live-water danger stays visible after the initial warning',await until(()=>/LIVE WATER/.test(txt('banner'))));key('keydown','KeyE');ok('holding the floor switch isolates the real circuit',await until(()=>game.roomCircuits.engineering===false,4000));key('keyup','KeyE');
  ok('isolation clears the live-water warning',await until(()=>!vis('banner')||!/LIVE WATER/.test(txt('banner'))));game.threats.electric=null;game.rooms.engineering.flood=0;game.rooms.engineering.closed=false;game.roomCircuits.engineering=true;
  const {SUB_BOARD,SUB_DOCK}=await import(pathToFileURL(path.join(ROOT,'shared/submersible.js')).href);
  P[0].exterior=true;P[0].suit=90;tp(0,0,-43);await sleep(300);key('keydown','ControlLeft');ok('diving depth comes from real server integration',await until(()=>P[0].depth>1.5,3500));key('keyup','ControlLeft');
  ok('deep dive shows route-level work instructions and depth',await until(()=>/DIVE.*SPACE/.test(txt('objective'))&&/m/.test(txt('suit-value'))));key('keydown','Space');ok('Space ascends back to the equipment survey level',await until(()=>P[0].depth<.1,5000));key('keyup','Space');
  P[0].exterior=false;tp(0,SUB_BOARD.x,SUB_BOARD.z+1,SUB_BOARD);await sleep(300);ok('Medical has a separate two-seat survey-sub interaction',await until(()=>/BOARD SKIFF-2.*0\/2/.test(txt('interaction'))));await tap('KeyE');
  ok('boarding enters a real pilot seat and clears the hotbar from the view',await until(()=>P[0].subSeat==='driver'&&vis('sub-hud')&&!vis('gear')));
  const subStart=game.sub.z;key('keydown','KeyW');await sleep(1000);key('keyup','KeyW');ok('pilot keyboard thrust moves the authoritative sub and its occupant',game.sub.z<subStart-1&&P[0].z===game.sub.z);
  await until(()=>Math.abs(game.sub.speed)<.2,2500);key('keydown','KeyS');await until(()=>game.sub.z>SUB_DOCK.z-.7,5000);key('keyup','KeyS');await until(()=>Math.abs(game.sub.speed)<.2,2500);
  key('keydown','KeyE');ok('holding dock transfers the actual pilot back inside Medical',await until(()=>!P[0].subSeat&&!P[0].exterior&&game.sub.docked,4500));key('keyup','KeyE');ok('sub display closes and ordinary equipment returns after docking',await until(()=>!vis('sub-hud')&&vis('gear')));
  // lockdown banner
  game.lockdown.nextAt = game.time; await sleep(500);
  ok("lockdown shows the banner, the systems warning and the alarm toast", game.lockdown.active && /LOCKDOWN/.test(txt("banner")) && vis("lockdown-box"), txt("banner"));
  ok("chat announces the lockdown", /LOCKDOWN/.test(txt("chat-log")), txt("chat-log"));
  game.rooms[game.lockdown.rooms[0]].locked = game.rooms[game.lockdown.rooms[1]].locked = false;
  for (const r of game.lockdown.rooms) game.rooms[r].closed = false;
  game.lockdown.active = false; game.lockdown.rooms = []; game.lockdown.nextAt = 1e9;
  await sleep(300);
  ok("banner disappears when the lockdown ends", !vis("banner") || !/LOCKDOWN/.test(txt("banner")));

  // Leviathan warning + impact
  game.lev.threat = 70; await sleep(400);
  ok("suit HUD shows personal noise instead of the monster's hidden threat percentage", /QUIET|AUDIBLE|LOUD/.test(txt("threat-value")) && !/%/.test(txt("threat-value")), txt("threat-value"));
  await tap("Tab"); ok("wrist computer opens without losing systems or crew", w.document.body.classList.contains("wrist-open") && $("wrist-toggle").getAttribute("aria-expanded") === "true");
  $('roster-list').querySelectorAll('button.chat-author')[1].click();await sleep(120);
  ok('crew name opens accessible mute/report controls during a live match',vis('crew-controls')&&w.document.body.classList.contains('crew-controls-open'));
  const modalPosition=[P[0].x,P[0].z];await tap('KeyW',250);
  ok('crew controls block gameplay movement while the match keeps running',P[0].x===modalPosition[0]&&P[0].z===modalPosition[1]&&game.status==='playing');
  $('crew-mute').click();ok('crew mute persists a stable anonymous profile',JSON.parse(w.localStorage.getItem('pressure-drop-muted')||'[]').length===1);
  $('crew-mute').click();$('crew-controls-close').click();
  await tap("Tab"); ok("wrist computer closes to the minimal suit HUD", !w.document.body.classList.contains("wrist-open"));
  game.lev.threat = 0;

  // down + spectate
  P[0].downed = true; P[0].hp = 0; P[0].downedAt = game.time - 41; await sleep(400);
  ok("being downed shows the down overlay", vis("down-overlay"));
  ok("the rescue countdown reflects server time instead of restarting locally", /in 1[0-9]s/.test(txt("down-text")), txt("down-text"));
  P[0].lost = true; await sleep(400);
  ok("a lost player becomes a spectator", !$("spectate").classList.contains("hidden") && /spectator/i.test(txt("objective")), txt("objective"));
  key("keydown", "Tab"); key("keyup", "Tab"); await sleep(200);
  ok("spectator bar names a teammate to follow", txt("spectate-name").length > 0, txt("spectate-name"));
  P[0].lost = false; P[0].downed = false; P[0].hp = 100; await sleep(300);
  ok("overlay clears after recovering", !vis("down-overlay"));

  // ------------------------------------------------------------------ escape vote
  console.log("\n[escape vote + summary]");
  for (const id of ["power", "pump", "console", "lifesupport", ...game.activeJunctions]) game.tasks[id].done = true;
  for (const [i, p] of P.entries()) { p.exterior = false; tp(i, front(STATIONS.launch, 1.1 + i * 0.2).x, front(STATIONS.launch, 1.1 + i * 0.2).z); }
  await sleep(300);
  bots[2].s.emit("interact:start", { id: "launch" }); // Med bot starts the launch
  ok("launch opens the vote overlay (4 players, 3 seats)", await until(() => vis("vote"), 7000));
  ok("vote text explains the seats", /3 seats for 4 survivors/.test(txt("vote-text")), txt("vote-text"));
  ok("the vote lists every survivor", $("vote-list").children.length === 4);
  $("vote-list").children[3].click(); await sleep(400);
  ok("clicking a name saves a draft without submitting a ballot", (game.vote?.drafts[P[0].id] || []).length === 1 && !game.vote.ballots[P[0].id]);
  $("vote-confirm").click(); await sleep(250);
  ok("confirmation submits the selected ballot", game.vote.ballots[P[0].id]?.length === 1);
  for (const b of bots) b.s.emit("vote:cast", { targets: [P[3].id], confirmed: true });
  ok("everyone voted: vote resolves and boarding starts", await until(() => game.stage === "boarding", 3000));
  ok("vote overlay closes", await until(() => !vis("vote")));
  ok("boarding banner shows the countdown", /POD LAUNCH IN/.test(txt("banner")), txt("banner"));
  ok("the person voted out remains a playable station survivor", P[3].leftBehind && /STATION SURVIVOR/.test(txt("roster-list")), txt("roster-list"));
  $("wrist-toggle").click();
  ok("crew can consult the wrist computer before boarding", w.document.body.classList.contains("wrist-open"));
  tp(0, FINALE_POINTS.board.x, FINALE_POINTS.board.z - 0.8, FINALE_POINTS.board); await sleep(200); await tap("KeyE");
  for (let i = 1; i < 3; i++) { tp(i, FINALE_POINTS.board.x, FINALE_POINTS.board.z - 0.8); bots[i - 1].s.emit("interact:start", { id: "board" }); }
  const hatchWorked=await until(() => P[0].aboard && game.stage === "finale",4500);
  if(!hatchWorked)console.log("BOARDING DEBUG",JSON.stringify({stage:game.stage,players:P.map(p=>({id:p.id,conn:p.connected,down:p.downed,lost:p.lost,aboard:p.aboard,seat:p.subSeat,x:p.x,z:p.z})),prompt:txt("interaction"),toast:txt("toast"),holds:[...game.holds]}));
  ok("using the hatch seats the player instead of ending the game",hatchWorked&&!vis("game-over"));
  ok("pod cockpit presents piloting and supporting controls", await until(() => vis("pod-hud") && /PILOTING/.test(txt("pod-role")), 6000));
  ok("boarding closes the wrist computer to protect the windshield", !w.document.body.classList.contains("wrist-open"));
  await tap("Tab");
  ok("flight controls cannot reopen station wrist panels", !w.document.body.classList.contains("wrist-open"));
  ok("pod tools start collapsed to leave the windshield clear", !vis("pod-actions"));
  ok("the stern monitor is visible without turning away from the route", vis("pod-contact-camera"));
  key("keydown", "KeyR"); await sleep(100);
  ok("holding R temporarily shows a full rear view", !vis("pod-contact-camera"));
  key("keyup", "KeyR"); await sleep(100);
  ok("releasing R restores the forward view and stern monitor", vis("pod-contact-camera"));
  await sleep(100); const hiddenStationUpdates = w.__stationUpdates, visiblePodUpdates = w.__podUpdates;
  await sleep(350);
  ok("the cockpit does not animate a hidden second world", w.__stationUpdates === hiddenStationUpdates && w.__podUpdates > visiblePodUpdates);
  game.rooms.pod.flood = 2.4; await sleep(150);
  ok("station flooding does not apply an underwater overlay inside the pod", !$("underwater").classList.contains("on"));
  sockOf(0).emit("game:event", { type: "impact", room: "pod" }); await sleep(100);
  ok("a distant station impact does not flash the cockpit", Number($("damage-flash").style.opacity || 0) === 0);
  const laneBefore = game.finale.pod.lane; await tap("KeyD", 400); await sleep(200);
  ok("keyboard steering reaches the authoritative pod", game.finale.pod.lane > laneBefore + 0.1);
  const focusedLane = game.finale.pod.lane;
  $("pod-tools-toggle").click();
  ok("pod tools can be opened when needed", vis("pod-actions"));
  $("pod-propose").focus();
  $("pod-propose").dispatchEvent(new w.KeyboardEvent("keydown", { code: "KeyA", bubbles: true }));
  await sleep(400); key("keyup", "KeyA");
  ok("pod buttons do not swallow steering keys after clicking them", game.finale.pod.lane < focusedLane - 0.1);
  $("pod-propose").click(); await sleep(250);
  ok("using a tool collapses its panel again", !vis("pod-actions"));
  ok("pod diversion opens a consent request", vis("pod-consent") && game.finale.history.diversions === 0);
  bots[0].s.emit("pod:action", { action: "accept" }); await sleep(250);
  ok("majority agreement commits the risky diversion", game.finale.history.diversions === 1);
  game.finale.pod.charges = 0; game.finale.pod.creatureDistance = 5; game.finale.creature.target = "pod";
  game.finale.pod.strikeAt = game.time + 60; await sleep(300);
  ok("empty countermeasures leave tools collapsed and the attack visible", !vis("pod-actions") && vis("pod-contact-camera") && /ATTACK/.test(txt("pod-camera-label")) && /DECOYS EMPTY/.test(txt("pod-warning")));
  tp(3, FINALE_POINTS.beacon.x + 0.75, FINALE_POINTS.beacon.z); bots[2].s.emit("interact:start", { id: "beacon" }); await sleep(200);
  game.finale.station.collapseAt = game.time + 28;
  for (const gate of game.finale.pod.route) gate.passed = true;
  game.finale.pod.progress = 210; game.finale.pod.lane = 0;
  key("keydown", "KeyS");
  const originalRAF = w.requestAnimationFrame, pendingFrames = [];
  w.requestAnimationFrame = callback => { pendingFrames.push(callback); return 0; };
  const frameParked=await until(()=>pendingFrames.length>0,1500);const stoppedFrames=w.__frames;
  await sleep(1200);
  ok("docking input keeps reaching the server while rendering is stalled", frameParked && w.__frames === stoppedFrames && game.finale.pod.dockProgress > 0.3 && game.time - game.finale.pod.input.at < 0.3, JSON.stringify({frameParked,frames:w.__frames,stoppedFrames,progress:game.finale.pod.dockProgress,inputAge:game.time-game.finale.pod.input.at}));
  w.requestAnimationFrame = originalRAF; pendingFrames.forEach(callback => originalRAF.call(w, callback));
  ok("clamp and shutter stages are visible before the lift", await until(() => game.finale.pod.phase === "sealing" && /SHUTTER CLOSING/.test(txt("pod-warning")), 6000));
  ok("the alignment panel shows the captured pod", vis("pod-docking") && /SHUTTER/.test(txt("pod-dock-stage")));
  ok("pod extraction leaves the survivor's game running", await until(() => P[0].escaped, 20000) && game.status === "playing" && !vis("game-over"));
  ok("settled crew can follow the station survivor", await until(() => /Med/i.test(txt("spectate-name")), 1500));
  await sleep(100); const hiddenPodUpdates = w.__podUpdates, visibleStationUpdates = w.__stationUpdates;
  await sleep(350);
  ok("following the survivor pauses the hidden cockpit", w.__podUpdates === hiddenPodUpdates && w.__stationUpdates > visibleStationUpdates);
  const sawEnding = await until(() => vis("epilogue"), 20000);
  if (!sawEnding) console.log("ENDING DEBUG", JSON.stringify({phase:room.phase,time:game.time,status:game.status,stage:game.stage,pod:game.finale.pod.status,station:game.finale.station,players:P.map(p=>({name:p.name,aboard:p.aboard,lost:p.lost,escaped:p.escaped,connected:p.connected})),errors}));
  ok("the ending cinematic starts only after both routes settle", sawEnding);
  ok("ending records acknowledge the individual route", /ABOVE THE WRECKAGE/.test(txt("epilogue-title")));
  $("epilogue-skip").click();
  ok("cinematic can be skipped to the crew report", vis("game-over") && !vis("epilogue"));
  ok("summary reports actual extraction", /SURVIVORS REACHED EXTRACTION/.test(txt("over-title")), txt("over-title"));
  ok("summary lists 4 crew with fates", $("over-table").querySelectorAll("tr").length === 5 && /LEFT BEHIND/.test(txt("over-table")), txt("over-table"));
  ok('mission timeline includes actual equipment use and filter servicing', /Flare ignited/.test(txt('timeline-entries')) && /Filter cleared/.test(txt('timeline-entries')));
  ok("the personal ending is saved in expedition records", JSON.parse(w.localStorage.getItem("pressure-drop-crew-log") || "[]").length === 1);
  for (const b of bots) b.s.emit("epilogue:done"); await sleep(200);
  $("to-lobby").click();
  ok("return to lobby works", await until(() => vis("lobby") && !vis("game")));
  ok("lobby is reset (nobody ready)", !/✔ READY/.test(txt("lobby-players")), txt("lobby-players"));

  // ------------------------------------------------------------------ reconnect
  console.log("\n[reconnect]");
  for (const b of bots) b.s.emit("lobby:ready", { ready: true }); await sleep(200);
  $("start-button").click();
  // Confirm the new mission, rather than requiring a transient briefing frame
  // that may already have elapsed on a busy software-rendering test machine.
  ok("a second mission starts from the same lobby", await until(() => vis("game") && api.rooms.get(code).matchNo === 2, 40000));
  await until(() => !vis("briefing"), 40000);
  ok("a replay starts with clean damage and water overlays", Number($("damage-flash").style.opacity) === 0 && !$("underwater").classList.contains("on"));
  const g2 = api.rooms.get(code).game;
  ok("the second match is fresh", !g2.tasks.power.done);
  ok("replaying does not duplicate system rows", $("systems-list").children.length === 9);
  await tap("Escape"); ok("Escape opens the in-game menu", vis("pause"));
  $("pause-resume").click(); ok("resume closes the in-game menu", !vis("pause"));
  await tap("Enter"); $("chat-input").value = "second expedition radio check";
  $("chat-input").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })); await sleep(300);
  ok("replaying does not send chat twice", api.rooms.get(code).chat.filter(m => m.text === "second expedition radio check").length === 1);
  const hostSid = api.rooms.get(code).matchPlayers[0].socketId;
  io.sockets.sockets.get(hostSid).conn.close(); // simulate a network drop
  ok("a dropped connection shows the reconnecting overlay", await until(() => vis("lost"), 3000));
  ok("the client reconnects automatically and the overlay clears", await until(() => !vis("lost"), 15000));
  ok("the character is still in the match after reconnecting", api.rooms.get(code).matchPlayers[0].connected && vis("game"));

  const real = errors.filter((e) => !/Not implemented: (HTMLCanvasElement|window\.scroll|navigation)/i.test(e));
  ok("no JavaScript errors were thrown", real.length === 0, real.slice(0, 3).join("\n"));
  console.log(`\n${checks - fails}/${checks} client checks passed`);
  for (const b of bots) b.s.disconnect();
  api.stop(); io.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
