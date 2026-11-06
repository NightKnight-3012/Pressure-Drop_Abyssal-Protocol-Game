// Real WebGL smoke/visual review against a private in-process server.
// Requires Chrome on Windows. No debug endpoint is added to the actual game.
import { spawn } from "node:child_process";
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { attachGame } from "../server/net.js";
import { snapshotGame } from "../server/game.js";
import { STATIONS, POD } from "../shared/layout.js";
import { beginFinale } from "../server/finale.js";
import { FINALE_POINTS } from "../shared/tactical.js";

const artifacts = resolve("test/artifacts"); await mkdir(artifacts, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = resolve("client/dist", "." + (path === "/" ? "/index.html" : path));
  if (!file.startsWith(resolve("client/dist") + "/") && !file.startsWith(resolve("client/dist") + "\\")) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file); res.setHeader("Content-Type", { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".gltf": "model/gltf+json" }[extname(file)] || "application/octet-stream"); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
const io = new Server(server), api = attachGame(io, { log: { log() {}, error: console.error } });
await new Promise(r => server.listen(3996, "127.0.0.1", r));
const chrome = spawn(process.env.BROWSER_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless", "--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=9225", `--user-data-dir=${resolve("test/.chrome-profile")}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
let ws, orbit = null, bots = [], errors = [], checks = 0;
try {
  let pages;
  for (let i = 0; i < 40; i++) { try { pages = await (await fetch("http://127.0.0.1:9225/json")).json(); break; } catch { await sleep(200); } }
  if (!pages) throw new Error("Chrome debugging endpoint unavailable");
  const page = pages.find(p => p.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = new Map();
  ws.addEventListener("message", e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(Error(JSON.stringify(msg.error))) : resolve(msg.result); }
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error(`Browser command timed out: ${method}`)); }, method === "Page.captureScreenshot" ? 30000 : 15000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => { const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const wait = async expression => { for (let i = 0; i < 400; i++) { if (await evaluate(expression)) return; await sleep(100); } throw Error(`UI timeout: ${expression}`); };
  const capture = async name => { await sleep(500); const data = await call("Page.captureScreenshot", { format: "png" }); await writeFile(resolve(artifacts, name + ".png"), Buffer.from(data.data, "base64")); checks++; console.log(`PASS real browser: ${name}`); };
  const key = async (code, type = "keyDown") => call("Input.dispatchKeyEvent", { type, code, key: { KeyE: "e", Tab: "Tab", Escape: "Escape", KeyR: "r", KeyS: "s", ShiftLeft: "Shift" }[code] || code, windowsVirtualKeyCode: { KeyE: 69, Tab: 9, Escape: 27, KeyR: 82, KeyS: 83, ShiftLeft: 16 }[code] || 0 });
  const tap = async code => { await key(code); await sleep(80); await key(code, "keyUp"); };
  await call("Page.enable"); await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: process.argv.includes("--story-only") ? 960 : 1440, height: process.argv.includes("--story-only") ? 640 : 1000, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: "http://127.0.0.1:3996" });
  await wait("document.getElementById('menu-status')?.textContent.includes('ONLINE')"); await capture("menu");
  await evaluate("document.getElementById('player-name').value='Mara';document.getElementById('create-room').click()");
  await wait("!document.getElementById('lobby').classList.contains('hidden')");
  const room = [...api.rooms.values()][0];
  for (const [name, dept] of [["Ivo", "eva"], ["Sana", "command"], ["Nell", "medical"]]) {
    const socket = connect("http://127.0.0.1:3996", { transports: ["websocket"] }); bots.push(socket);
    await new Promise(r => socket.on("connect", r));
    const joined = new Promise(r => socket.once("room:joined", r)); socket.emit("room:join", { name, code: room.code }); await joined;
    socket.emit("lobby:dept", { dept }); socket.emit("lobby:ready", { ready: true });
  }
  await evaluate("document.getElementById('dept-cards').children[0].click()"); await sleep(300); await capture("lobby");
  await evaluate("document.getElementById('start-button').click()");
  await wait("!document.getElementById('game').classList.contains('hidden')");
  let introRemaining = 30000;
  orbit = setInterval(() => { room.briefingEndsAt = Date.now() + 60000; io.to(room.code).emit("match:briefing", { briefingEndsIn: introRemaining }); }, 150);
  await wait("document.body.classList.contains('in-prologue')"); await capture("prologue");
  introRemaining = 22000; await capture("prologue-contact");
  introRemaining = 14000; await capture("prologue-route");
  introRemaining = 9000;
  await wait("!document.getElementById('briefing').classList.contains('hidden')"); await capture("role-briefing");
  await call("Emulation.setDeviceMetricsOverride", { width:520, height:640, deviceScaleFactor:1, mobile:false }); await capture("role-briefing-compact");
  const briefBounds = await evaluate("(() => { const el=document.getElementById('briefing'), card=el.querySelector('.overlay-card'), r=card.getBoundingClientRect(); return {right:r.right,left:r.left,bottom:r.bottom,width:innerWidth,height:innerHeight,scroll:el.scrollWidth,client:el.clientWidth}; })()");
  if (briefBounds.left < 0 || briefBounds.right > briefBounds.width || briefBounds.bottom > briefBounds.height || briefBounds.scroll > briefBounds.client) throw Error("Role briefing overflows the viewport: " + JSON.stringify(briefBounds)); checks++;
  await call("Emulation.setDeviceMetricsOverride", { width: process.argv.includes("--story-only") ? 960 : 1440, height: process.argv.includes("--story-only") ? 640 : 1000, deviceScaleFactor:1, mobile:false });
  clearInterval(orbit);
  room.briefingEndsAt = Date.now() - 1; await wait("document.getElementById('briefing').classList.contains('hidden')");
  const game = room.game, P = room.matchPlayers, host = P[0]; game.nextBreachAt = 1e9; game.lockdown.nextAt = 1e9;
  const teleport = (point, from) => { Object.assign(host, { x: from.x, z: from.z, rotation: Math.atan2(from.x - point.x, from.z - point.z) }); io.to(host.socketId).emit("player:correct", { x: host.x, z: host.z, rotation: host.rotation, teleport: true }); };
  await capture("station");
  if (process.argv.includes("--station-only")) {
    room.phase="visual-fixture";game.tasks.power.done=true;
    for(const [i,p] of P.slice(1).entries()){p.x=.3+i*.5;p.z=.4;}
    const pose=async(name,from,point)=>{teleport(point,from);io.to(room.code).emit("game:state",snapshotGame(game,P,Date.now()));await capture(name);};
    await pose("station-control-detail",{x:-3,z:-5},{x:-8,z:-7.3});
    await pose("station-engineering-detail",{x:7,z:-2.2},{x:3.4,z:-8.2});
    await pose("station-medical-detail",{x:-2.4,z:4.2},{x:-6,z:6.8});
    await pose("station-transfer-detail",{x:3.5,z:4},{x:7.5,z:8});
    game.rooms.engineering.impacts=3;game.breaches=[{id:"review-breach",room:"engineering",x:9.4,z:-3.8}];
    await pose("station-strike-detail",{x:6,z:-4},{x:10,z:-2.6});
    game.tasks.power.done=false;
    await pose("station-emergency-detail",{x:7,z:-2.2},{x:3.4,z:-8.2});
    await evaluate("document.getElementById('opt-reduced').click();document.getElementById('opt-quality').value='low';document.getElementById('opt-quality').dispatchEvent(new Event('change'))");
    await pose("station-low-reduced-detail",{x:7,z:-2.2},{x:3.4,z:-8.2});
  } else if (process.argv.includes("--story-only")) {
    teleport({x:POD.cx,z:POD.cz},{x:3.6,z:5.4}); await capture("escape-craft-docked");
    await evaluate("document.getElementById('opt-quality').value='low';document.getElementById('opt-quality').dispatchEvent(new Event('change'))");
    for (const p of P.slice(0,3)) p.aboard = true;
    P[3].leftBehind = true; beginFinale(game, P, []);
    const pod = game.finale.pod;
    pod.phase = "run"; pod.progress = 136; pod.lane = 0; pod.charges = 0; pod.creatureDistance = 5; pod.hull = 65;
    pod.route.forEach(g => g.passed = g.at < 136);
    room.phase = "visual-fixture"; io.to(room.code).emit("game:state", snapshotGame(game, P, Date.now()));
    await wait("!document.getElementById('pod-contact-camera').classList.contains('hidden')");
    await capture("pod-attack-empty-decoys");
    const clearFlightCorridor = async () => evaluate(`(() => {
      const safe={left:innerWidth*.4,right:innerWidth*.6,top:innerHeight*.3,bottom:innerHeight*.65};
      return ['pod-hud','pod-actions','pod-consent','pod-contact-camera','toast','captions','chat'].every(id=>{
        const el=document.getElementById(id); if(!el || getComputedStyle(el).display==='none' || getComputedStyle(el).visibility==='hidden') return true;
        const r=el.getBoundingClientRect(); return r.width===0 || r.height===0 || r.right<=safe.left || r.left>=safe.right || r.bottom<=safe.top || r.top>=safe.bottom;
      });
    })()`);
    if (!await clearFlightCorridor()) throw Error("Attack HUD blocks the flight corridor"); checks++;
    await evaluate("document.getElementById('pod-tools-toggle').click()"); await capture("pod-tools-at-edge");
    if (!await clearFlightCorridor()) throw Error("Expanded tools block the flight corridor"); checks++;
    await evaluate("document.getElementById('pod-tools-toggle').click();document.activeElement?.blur?.()");
    await key("KeyR"); await wait("document.getElementById('pod-contact-camera').classList.contains('hidden')");
    await key("KeyR", "keyUp"); await wait("!document.getElementById('pod-contact-camera').classList.contains('hidden')");
    await capture("pod-forward-after-peek");
    await call("Emulation.setDeviceMetricsOverride", { width:390,height:844,deviceScaleFactor:1,mobile:false }); await capture("pod-attack-compact");
    if (!await clearFlightCorridor()) throw Error("Compact attack HUD blocks the flight corridor"); checks++;
    await call("Emulation.setDeviceMetricsOverride", { width:960,height:640,deviceScaleFactor:1,mobile:false });
    pod.phase = "approach"; pod.progress = 207; pod.creatureDistance = 65; pod.hull = 100; pod.route.forEach(g => g.passed = true);
    io.to(room.code).emit("game:state", snapshotGame(game, P, Date.now())); await capture("recovery-approach");
    pod.progress = 210; pod.phase = "rendezvous";
    io.to(room.code).emit("game:state", snapshotGame(game, P, Date.now())); await capture("recovery-cradle");
    room.phase = "playing"; game.lastTick = Date.now();
    await evaluate("document.getElementById('pod-tools-toggle').click();document.getElementById('pod-sonar').focus()"); await key("KeyS");
    await wait("document.getElementById('pod-warning').textContent.includes('SHUTTER CLOSING')");
    room.phase = "visual-fixture"; pod.sealSince = game.time - 1.2;
    io.to(room.code).emit("game:state", snapshotGame(game, P, Date.now())); await capture("recovery-shutter");
    room.phase = "playing"; game.lastTick = Date.now(); pod.sealSince = game.time - 2.4;
    await wait("document.getElementById('pod-warning').textContent.includes('SHUTTER SEALED')");
    clearInterval(orbit); room.phase = "visual-fixture"; pod.ascentSince = game.time - 4;
    io.to(room.code).emit("game:state", snapshotGame(game, P, Date.now())); await capture("recovery-ascent");
    await key("KeyS", "keyUp"); pod.ascentSince = game.time - 13; game.finale.station.collapseAt = game.time;
    room.phase = "playing"; game.lastTick = Date.now();
    await wait("!document.getElementById('epilogue').classList.contains('hidden')"); await capture("recovery-epilogue");
    await wait("document.getElementById('epilogue-text').textContent.includes('RECOVERY SLING')"); await capture("surface-rescue");
    await evaluate("document.getElementById('epilogue-skip').click()"); await capture("recovery-report");
  } else {
  host.exterior = true;
  // Hold a small visible patrol arc during slow software-rendered captures.
  // This fixture is private to the test; production simulation is untouched.
  const phase = room.phase; room.phase = "visual-fixture"; let fixtureAngle = Math.PI, fixtureDir = 1;
  orbit = setInterval(() => { fixtureAngle += fixtureDir * 0.0008; const state = snapshotGame(game, P, Date.now()); state.lev = { state: "patrol", threat: 0, angle: fixtureAngle, dist: 27, patrolDir: fixtureDir }; io.to(host.socketId).emit("game:state", state); }, 100);
  teleport({ x: -27, z: 0 }, { x: -14.5, z: 5.5 }); await sleep(300);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: 720, y: 500, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: 720, y: 500, button: "left", clickCount: 1 });
  // Headless Chrome can deny pointer lock. This private screenshot fixture
  // supplies the lock state only while aiming the exterior camera.
  await evaluate("if (!document.pointerLockElement) { Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.querySelector('#game > canvas')}); document.dispatchEvent(new Event('pointerlockchange')); }");
  const look = async movementY => evaluate(`{ const event = new MouseEvent('mousemove', {bubbles:true}); Object.defineProperty(event,'movementY',{value:${movementY}}); Object.defineProperty(event,'movementX',{value:0}); document.dispatchEvent(event); }`);
  await look(110); await capture("ocean-exterior");
  fixtureDir = -1; await sleep(500); await capture("ocean-reverse-patrol");
  await look(-110); host.exterior = false;
  clearInterval(orbit); room.phase = phase; game.lastTick = Date.now();
  await evaluate("if (Object.hasOwn(document,'pointerLockElement')) delete document.pointerLockElement; document.exitPointerLock(); document.dispatchEvent(new Event('pointerlockchange'));");
  if (!process.argv.includes("--ocean-only")) {
  teleport(STATIONS.power, { x: 8.25, z: -6 }); await sleep(250); await tap("KeyE");
  await wait("!document.getElementById('repair-panel').classList.contains('hidden')"); await capture("calibration");
  for (let i = 1; i <= 3; i++) if (game.calibrations.power.target & (1 << (i - 1))) { await evaluate(`document.querySelector('[data-calibration="${i}"]').click()`); await sleep(180); }
  if (!game.calibrations.power.solved) throw Error("Real browser circuit interaction did not reach server"); checks++;
  await tap("Escape"); await evaluate("document.getElementById('wrist-toggle').click()"); await capture("wrist-desktop");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }); await capture("wrist-compact");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.getElementById('wrist-toggle').click()");
  for (const task of Object.values(game.tasks)) task.done = true;
  game.stage = "boarding"; game.boarding = { since: game.time - 4, endsAt: game.time + 35, left: [P[3].id] }; P[3].leftBehind = true;
  teleport(FINALE_POINTS.board, { x: 7, z: 5.65 });
  await wait("document.getElementById('interaction').textContent.includes('BOARD YOUR SEAT')"); await tap("KeyE");
  for (let i = 1; i < 3; i++) { Object.assign(P[i], { x: 7, z: 5.65 }); bots[i - 1].emit("interact:start", { id: "board" }); }
  await wait("!document.getElementById('pod-hud').classList.contains('hidden')");
  game.finale.pod.progress = 82; for (const gate of game.finale.pod.route) if (gate.at < 82) gate.passed = true;
  game.finale.pod.hull = 82; game.finale.pod.oxygen = 72;
  await capture("cockpit");
  await evaluate("document.activeElement?.blur?.()"); await key("ShiftLeft"); await wait("document.getElementById('pod-hud').classList.contains('boosting')");
  await capture("cockpit-boost"); await key("ShiftLeft", "keyUp");
  await evaluate("document.getElementById('opt-reduced').click()"); await capture("cockpit-reduced");
  await evaluate("document.getElementById('opt-reduced').click()");
  await evaluate("document.getElementById('pod-tools-toggle').click();document.getElementById('pod-propose').click()"); await wait("!document.getElementById('pod-consent').classList.contains('hidden')"); await capture("pod-consent");
  bots[0].emit("pod:action", { action: "accept" });
  game.finale.pod.progress = 207; game.finale.pod.lane = 0;
  for (const gate of game.finale.pod.route) gate.passed = true;
  game.finale.pod.hull = 100; game.finale.pod.creatureDistance = 65;
  await capture("recovery-approach");
  game.finale.pod.progress = 210;
  await wait("document.getElementById('pod-warning').textContent.includes('CRADLE')");
  await evaluate("document.activeElement?.blur?.()"); await key("KeyS"); await capture("recovery-docking");
  await wait("document.getElementById('pod-warning').textContent.includes('SHUTTER SEALED')");
  await capture("recovery-ascent"); await key("KeyS", "keyUp");
  host.aboard = false; host.leftBehind = true; P[3].aboard = true; P[3].leftBehind = false;
  teleport(FINALE_POINTS.beacon, { x: -8.0, z: -6 }); await sleep(300); await tap("KeyE"); await capture("station-survivor");
  teleport(FINALE_POINTS.capsule, { x: -6.5, z: -4.1 }); await sleep(300); await key("KeyE");
  for (let i = 0; i < 30 && !game.finale.station.repair; i++) await sleep(100);
  if (!game.finale.station.repair) throw Error("Capsule repair did not start from held E");
  await key("KeyE", "keyUp"); await sleep(300);
  if (game.finale.station.repair) throw Error("Releasing E did not stop capsule work"); checks++; console.log("PASS real browser: capsule hold cancellation");
  game.rooms.control.flood = 0.7; await capture("water-surface");
  await tap("Escape"); await wait("!document.getElementById('pause').classList.contains('hidden')"); await capture("pause-menu");
  await evaluate("document.getElementById('pause-options').click()"); await capture("display-options");
  await evaluate("document.getElementById('opt-quality').value='low';document.getElementById('opt-quality').dispatchEvent(new Event('change'));document.getElementById('options-close').click();document.getElementById('pause-resume').click()");
  game.finale.history.stationHelpBy[host.id] = 9;
  game.finale.station.collapseAt = game.time; game.finale.pod.ascentSince = game.time - 13; for (const gate of game.finale.pod.route) gate.passed = true;
  await wait("!document.getElementById('epilogue').classList.contains('hidden')"); await capture("epilogue");
  await evaluate("document.getElementById('epilogue-skip').click()"); await capture("crew-report");
  }
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log(`${checks} real browser checks/captures passed; screenshots in test/artifacts`);
} finally {
  clearInterval(orbit);
  try { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: "Browser.close" })); } catch {}
  await sleep(200); ws?.close(); chrome.kill(); bots.forEach(s => s.disconnect()); api.stop(); io.close(); server.close();
}
