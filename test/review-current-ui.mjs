// Real WebGL smoke/visual review against a private in-process server.
// Requires Chrome on Windows. No debug endpoint is added to the actual game.
import { spawn } from "node:child_process";
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { attachGame } from "../server/net.js";
import {createRepository} from "../server/db.js";
import { snapshotGame, useItem, buildSummary, takeLockerItem, startHold, cancelHold } from "../server/game.js";
import { recordEvents } from '../server/timeline.js';

const artifacts = resolve("test/artifacts"); await mkdir(artifacts, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if(process.argv.includes('--route-only')&&path==='/route-review'){res.setHeader('Content-Type','text/html');return res.end(await readFile(resolve('test/artifacts/route-preview.html')));}
  const file = resolve("client/dist", "." + (path === "/" ? "/index.html" : path));
  if (!file.startsWith(resolve("client/dist") + "/") && !file.startsWith(resolve("client/dist") + "\\")) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file); res.setHeader("Content-Type", { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".gltf": "model/gltf+json" }[extname(file)] || "application/octet-stream"); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
const repository=createRepository();
const io = new Server(server), api = attachGame(io, { repository, log: { log() {}, error: console.error } });
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
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error(`Browser command timed out: ${method}`)); }, method === "Page.captureScreenshot" ? 60000 : 30000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => { const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const wait = async expression => { for (let i = 0; i < 400; i++) { if (await evaluate(expression)) return; await sleep(100); } throw Error(`UI timeout: ${expression}`); };
  const captureFilter=process.argv.includes('--hands-only')?'presentation-hands-':process.argv.includes('--online-only')?'presentation-online-':process.argv.includes('--practice-only')?'presentation-practice-':process.argv.includes('--sub-only')?'presentation-sub-':process.argv.includes('--fieldwork-only')?'presentation-fieldwork-':process.argv.includes('--story-only')?'presentation-story-':process.argv.includes('--survey-only')?'presentation-survey-':process.argv.includes('--resources-only')?'presentation-resource-':process.argv.includes('--lockers-only')?'presentation-locker-':null;
  const capture = async name => {
    if(!name.startsWith('audit-')&&!name.startsWith('presentation-'))return;
    await sleep(500);if(captureFilter&&!name.startsWith(captureFilter))return;
    const data=await call('Page.captureScreenshot',{format:'png'});
    await writeFile(resolve(artifacts,name+'.png'),Buffer.from(data.data,'base64'));checks++;console.log(`PASS real browser: ${name}`);
  };
  const key = async (code, type = "keyDown") => call("Input.dispatchKeyEvent", { type, code, key: { KeyE: "e", Tab: "Tab", Escape: "Escape", KeyR: "r", KeyS: "s", ShiftLeft: "Shift" }[code] || code, windowsVirtualKeyCode: { KeyE: 69, Tab: 9, Escape: 27, KeyR: 82, KeyS: 83, ShiftLeft: 16 }[code] || 0 });
  const tap = async code => { await key(code); await sleep(80); await key(code, "keyUp"); };
  await call("Page.enable"); await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width:1280,height:720, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: "http://127.0.0.1:3996" });
  await wait("document.getElementById('menu-status')?.textContent.includes('ONLINE')"); await capture("menu");
  if(process.argv.includes('--flood-only')){
    await evaluate("document.getElementById('player-name').value='Mara';document.getElementById('practice-start').click()");await wait("document.getElementById('mission-chapter').textContent.includes('SIMULATOR')");
    const r=[...api.rooms.values()][0];for(let i=0;i<120&&r.phase!=='playing';i++)await sleep(50);await sleep(200);r.phase='visual-fixture';r.game.practice=null;
    const p=r.matchPlayers[0];Object.assign(p,{x:6,z:-6,breath:5,submerged:true});r.game.rooms.engineering.flood=2.5;r.game.rooms.engineering.closed=true;
    io.to(p.socketId).emit('player:correct',{x:p.x,z:p.z,rotation:0,teleport:true});io.to(r.code).emit('game:state',snapshotGame(r.game,r.matchPlayers,Date.now()));await wait("document.getElementById('banner').textContent.includes('HELMET AIR')");
    for(const [width,height] of [[1280,720],[520,640]]){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await capture('presentation-flood-air-'+width);}
    p.breath=12;p.submerged=false;r.game.rooms.engineering.flood=0;io.to(r.code).emit('game:state',snapshotGame(r.game,r.matchPlayers,Date.now()));await wait("document.getElementById('suit-block').classList.contains('hidden')");checks++;
  }else if(process.argv.includes('--route-only')){
    await call('Page.navigate',{url:'http://127.0.0.1:3996/route-review'});await wait("typeof previewRoute==='function'");
    for(const at of [30,65,110,165]){await evaluate('previewRoute('+at+')');await capture('presentation-route-'+at);}
  }else if(process.argv.includes('--hands-only')){
    await evaluate("document.getElementById('player-name').value='Mara';document.getElementById('practice-start').click()");
    await wait("document.getElementById('mission-chapter').textContent.includes('SIMULATOR')");
    const room=[...api.rooms.values()][0],game=room.game,host=room.matchPlayers[0];
    for(let i=0;i<120&&room.phase!=='playing';i++)await sleep(50);if(room.phase!=='playing')throw Error('Practice has not started');
    await evaluate("document.activeElement?.blur()");
    game.practice=null;game.tasks.power.done=true;game.nextBreachAt=game.lockdown.nextAt=1e9;
    const breach={id:'breach:hands-review',x:6,z:-6,room:'engineering'};game.breaches.push(breach);
    Object.assign(host,{x:6,z:-4.8,rotation:0});io.to(host.socketId).emit('player:correct',{x:host.x,z:host.z,rotation:0,teleport:true});io.to(room.code).emit('game:state',snapshotGame(game,room.matchPlayers,Date.now()));await sleep(400);
    await wait("document.getElementById('interaction').textContent.includes('PATCH')");await evaluate("document.activeElement?.blur();document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',bubbles:true}))");
    for(let i=0;i<60&&!game.holds.has(host.id);i++)await sleep(50);if(!game.holds.has(host.id))throw Error('No actual working hold '+JSON.stringify({position:[host.x,host.z],down:host.downed,lost:host.lost,phase:room.phase,ui:await evaluate("({focus:document.activeElement?.id,toast:document.getElementById('toast').textContent,pause:document.getElementById('pause').className,interaction:document.getElementById('interaction').textContent})")}));game.holds.get(host.id).need=60;checks++;
    for(const [width,height] of [[1280,720],[520,640]]){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await capture('presentation-hands-repair-'+width);}
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit4',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code:'Digit4',bubbles:true}))");
    for(let i=0;i<60&&game.holds.get(host.id)?.gearApplied!=='welder';i++)await sleep(50);if(game.holds.get(host.id)?.gearApplied!=='welder')throw Error('No validated welder');game.holds.get(host.id).need=60;checks++;
    for(const [width,height] of [[1280,720],[520,640]]){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await capture('presentation-hands-welder-'+width);}
    await evaluate("document.getElementById('pause-options').click();if(!document.getElementById('opt-reduced').checked)document.getElementById('opt-reduced').click();document.getElementById('options-close').click()");await key('KeyE','keyUp');await evaluate("document.activeElement?.blur()");await key('KeyE');for(let i=0;i<40&&!game.holds.has(host.id);i++)await sleep(50);if(!game.holds.has(host.id))throw Error('Reduced-effects work did not resume');await capture('presentation-hands-reduced-520');
    await key('KeyE','keyUp');await sleep(150);if(game.holds.has(host.id))throw Error('Release did not cancel hold');checks++;await capture('presentation-hands-released-520');
  }else if(process.argv.includes('--online-only')){
    const bot=connect('http://127.0.0.1:3996',{transports:['websocket'],forceNew:true});bots.push(bot);await new Promise(r=>bot.once('connect',r));const joined=new Promise(r=>bot.once('room:joined',r));bot.emit('room:quick',{name:'Inez',difficulty:'normal'});await joined;
    for(const [width,height] of [[1280,720],[520,640]]){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await capture('presentation-online-menu-'+width);
      await evaluate("document.getElementById('browse-rooms').click()");await wait("document.getElementById('online-content').textContent.includes('Open crew')");await capture('presentation-online-browser-'+width);
      const bounds=await evaluate("(() => {const r=document.querySelector('.online-card').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()");if(bounds.left<0||bounds.right>width||bounds.top<0||bounds.bottom>height)throw Error('Online panel leaves viewport');checks++;
      await evaluate("document.getElementById('online-close').click();document.getElementById('personal-stats').click()");await wait("document.getElementById('online-content').textContent.includes('Time survived')");await capture('presentation-online-stats-'+width);
      await evaluate("document.getElementById('online-close').click();document.getElementById('leaderboards-open').click()");await wait("document.getElementById('online-content').textContent.includes('No qualifying')");await capture('presentation-online-board-'+width);await evaluate("document.getElementById('online-close').click()");
    }
    await evaluate("document.getElementById('player-name').value='Mara';document.getElementById('quick-match').click()");await wait("!document.getElementById('lobby').classList.contains('hidden') && document.getElementById('lobby-players').textContent.includes('Inez')");
    for(const [width,height] of [[1280,720],[520,640]]){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await capture('presentation-online-lobby-'+width);
      await evaluate("[...document.querySelectorAll('#lobby-players button')].find(b=>b.textContent.includes('Inez')).click()");await capture('presentation-online-report-'+width);await evaluate("document.getElementById('crew-controls-close').click()");
      const horizontal=await evaluate("document.documentElement.scrollWidth");if(horizontal>width)throw Error('Lobby overflows viewport');checks++;
    }
  }else if(process.argv.includes('--practice-only')||process.argv.includes('--boards-only')||process.argv.includes('--creature-only')){
    if(process.argv.includes('--creature-only'))await evaluate("document.getElementById('menu-options').click();document.getElementById('opt-quality').value='low';document.getElementById('opt-quality').dispatchEvent(new Event('change'));document.getElementById('options-close').click()");
    await capture('presentation-practice-menu-1280');
    const menu=await evaluate("(() => {const r=document.querySelector('.menu-card').getBoundingClientRect();return {top:r.top,bottom:r.bottom};})()");if(menu.top<0||menu.bottom>720)throw Error('Training menu leaves the screen');checks++;
    await evaluate("document.getElementById('player-name').value='Mara';document.getElementById('practice-start').click()");
    await wait("document.getElementById('mission-chapter').textContent.includes('SIMULATOR') && document.getElementById('objective').textContent.includes('Walk a few metres')");
    await capture('presentation-practice-start-1280');
    await evaluate("document.activeElement?.blur();document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}))");
    await wait("document.getElementById('objective').textContent.includes('Power core')");
    await evaluate("document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true}))");
    if(process.argv.includes('--boards-only')){
      const r=[...api.rooms.values()][0],p=r.matchPlayers[0];r.game.story.available=['arrival','filter','names'];r.game.story.found=[];
      Object.assign(p,{x:-6,z:-3,rotation:0});io.to(p.socketId).emit('player:correct',{x:p.x,z:p.z,rotation:0,teleport:true});io.to(r.code).emit('game:state',snapshotGame(r.game,r.matchPlayers,Date.now()));await capture('presentation-boards-terminal');
    }
    if(process.argv.includes('--creature-only')){
      const r=[...api.rooms.values()][0],p=r.matchPlayers[0];
      for(const [name,x,z,tx,tz] of [['garden',-23,5.5,-38,-8],['wreck',28,18,38,0]]){
        Object.assign(p,{exterior:true,x,z,rotation:Math.atan2(x-tx,z-tz)});io.to(p.socketId).emit('player:correct',{x,z,rotation:p.rotation,teleport:true});io.to(r.code).emit('game:state',snapshotGame(r.game,r.matchPlayers,Date.now()));await capture('presentation-creature-'+name);
      }
    }
    const training=[...api.rooms.values()][0];if(training.game.practice.step!=='power'||training.matchPlayers.length!==1)throw Error('Keyboard movement did not advance solo server training');checks++;
    for(const [width,height] of [[1280,720],[520,640]]){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await capture('presentation-practice-power-'+width);const b=await evaluate("(() => {const r=document.querySelector('.objective').getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom};})()");if(b.x<0||b.right>width||b.bottom>height)throw Error('Training instructions exceed viewport');checks++;}
  } else {
  await evaluate("document.getElementById('player-name').value='Mara';document.getElementById('create-room').click()");
  await wait("!document.getElementById('lobby').classList.contains('hidden')");
  await evaluate("localStorage.setItem('pressure-drop-case-file',JSON.stringify(['arrival','surface']));document.getElementById('lobby-case-open').click()");
  for(const width of [1280,520]){await call('Emulation.setDeviceMetricsOverride',{width,height:720,deviceScaleFactor:1,mobile:false});await capture('presentation-story-case-'+width);const b=await evaluate("(() => {const r=document.querySelector('#case-file .overlay-card').getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,scroll:document.getElementById('case-file').scrollWidth};})()");if(b.left<0||b.right>width||b.bottom>720||b.scroll>width)throw Error('Case file exceeds viewport: '+JSON.stringify(b));checks++;}
  await evaluate("document.getElementById('case-close').click();document.getElementById('lobby-options').click()");await capture('presentation-story-controls');await evaluate("document.getElementById('options-close').click()");
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  const room = [...api.rooms.values()][0];
  for (const [name, dept] of [["Ivo", "eva"], ["Sana", "command"], ["Nell", "medical"], ["Alexander", "eva"], ["Valentina", "medical"], ["Christopher", "engineering"], ["Alexandria", "command"]]) {
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
  await call("Emulation.setDeviceMetricsOverride", { width:1280,height:720, deviceScaleFactor:1, mobile:false });
  clearInterval(orbit);
  room.briefingEndsAt = Date.now() - 1; await wait("document.getElementById('briefing').classList.contains('hidden')");
  const game = room.game, P = room.matchPlayers, host = P[0]; game.nextBreachAt = 1e9; game.lockdown.nextAt = 1e9;
  const teleport = (point, from) => { Object.assign(host, { x: from.x, z: from.z, rotation: Math.atan2(from.x - point.x, from.z - point.z) }); io.to(host.socketId).emit("player:correct", { x: host.x, z: host.z, rotation: host.rotation, teleport: true }); };
  await capture("station");
  if (process.argv.includes("--station-only")) {
    room.phase="visual-fixture";game.tasks.power.done=true;
    for(const [i,p] of P.slice(1).entries()){p.x=-7+(i%4)*.7;p.z=-7+Math.floor(i/4)*.6;}
    teleport({x:-6,z:-7},{x:-3,z:-3});
    io.to(room.code).emit("game:state",snapshotGame(game,P,Date.now()));
    await sleep(2000);await capture("audit-20261019-normal-720p");
    const measure=async()=>evaluate(`(() => {
      const rect=(selector)=>{const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,visible:s.display!=='none'&&s.visibility!=='hidden'&&r.height>0,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight};};
      return {viewport:[innerWidth,innerHeight],systems:rect('#systems'),roster:rect('#roster'),meters:rect('.meters'),objective:rect('.objective'),warnings:rect('#banner'),captions:rect('#captions')};
    })()`);
    const normal=await measure();
    await evaluate("document.getElementById('wrist-toggle').click()");
    await capture("audit-20261019-wrist-720p");
    const wrist=await measure();
    await writeFile(resolve(artifacts,"audit-20261019-ui.json"),JSON.stringify({crew:P.length,normal,wrist},null,2));
    console.log(JSON.stringify({crew:P.length,normal,wrist}));
    const intersects=(a,b)=>a?.visible && b?.visible && a.x<b.right && a.right>b.x && a.y<b.bottom && a.bottom>b.y;
    const verify=(bounds)=>{
      if(!bounds.meters.visible)throw Error('Critical suit meters hidden by wrist computer');
      for(const id of ['systems','roster']) {
        if(intersects(bounds[id],bounds.meters) || intersects(bounds[id],bounds.objective))throw Error(id+' overlaps suit meters or objective');
        if(bounds[id].bottom>bounds.viewport[1])throw Error(id+' leaves viewport');
      }
      if(intersects(bounds.systems,bounds.roster))throw Error('Wrist panels overlap');
      checks++;
    };
    verify(wrist);
    game.oxygen=10;io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    await wait("!document.getElementById('banner').classList.contains('hidden') && document.getElementById('banner').textContent.includes('OXYGEN CRITICAL')");
    for(const [width,height] of [[1280,720],[960,640],[520,640]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await capture('presentation-wrist-critical-'+width);
      const bounds=await measure();verify(bounds);
      if(!bounds.warnings.visible || intersects(bounds.warnings,bounds.objective) || intersects(bounds.warnings,bounds.systems) || intersects(bounds.warnings,bounds.roster))throw Error('Critical warning overlaps another panel: '+JSON.stringify(bounds));checks++;
      if(width===520) {
        await evaluate("document.getElementById('wrist-crew').click()");
        await capture('presentation-wrist-crew-520');const crewBounds=await measure();verify(crewBounds);
        if(!crewBounds.roster.visible || crewBounds.systems.visible || !crewBounds.warnings.visible)throw Error('Compact crew tab loses critical information');checks++;
        await evaluate("document.getElementById('wrist-systems').click()");
      }
    }
    await evaluate("document.getElementById('wrist-toggle').click()");game.oxygen=90;
    useItem(game,P,host,0);
    io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    for(const [width,height] of [[1280,720],[960,640],[520,640]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await capture('presentation-equipment-'+width);
      const boxes=await evaluate(`(() => {const box=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};return {gear:box('#gear'),meters:box('.meters')};})()`);
      if(boxes.gear.right>width || boxes.gear.x<0 || boxes.gear.bottom>height || boxes.gear.x<boxes.meters.right && boxes.gear.y<boxes.meters.bottom && boxes.gear.bottom>boxes.meters.y) throw Error('Equipment overlaps critical suit meters: '+JSON.stringify(boxes));checks++;
    }
    teleport({x:8,z:-2.9},{x:8,z:-1.4});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await sleep(300);
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE',bubbles:true}))");
    await wait("!document.getElementById('locker-panel').classList.contains('hidden')");
    for(const [width,height] of [[1280,720],[960,640],[520,640]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await capture('presentation-locker-'+width);
      const boxes=await evaluate(`(() => {const b=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};return {panel:b('#locker-panel'),note:b('#locker-note'),gear:b('#gear'),meters:b('.meters'),objective:b('.objective'),capacity:document.getElementById('locker-capacity').textContent};})()`);
      const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
      if(boxes.panel.x<0||boxes.panel.right>width||boxes.panel.bottom>height||boxes.note.bottom>boxes.panel.bottom-4||overlap(boxes.panel,boxes.gear)||overlap(boxes.panel,boxes.meters)||overlap(boxes.panel,boxes.objective)||!/1\/4 FREE/.test(boxes.capacity))throw Error('Locker overlaps gameplay HUD or hides its status: '+JSON.stringify(boxes));checks++;
    }
    const checkout=takeLockerItem(game,P,host,'engineering','repair');if(checkout)throw Error(checkout);
    host.lockerReadyAt=game.time; // Visual fixture settles the one-second dispensing state.
    io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await capture('presentation-locker-full-520');
    game.lockers.engineering={flare:0,repair:0};io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await capture('presentation-locker-empty-520');
    if(!await evaluate("/Stores exhausted/.test(document.getElementById('locker-note').textContent)"))throw Error('Empty stores lack an exhaustion explanation');checks++;
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code:'Escape',bubbles:true}))");
    await wait("document.getElementById('locker-panel').classList.contains('hidden')");
    const command=P.find(p=>p.dept==='command'),eva=P.find(p=>p.dept==='eva');
    const scanError=useItem(game,P,command,3);if(scanError)throw Error(scanError);
    Object.assign(eva,{exterior:true,x:-17,z:7});
    const markerError=useItem(game,P,eva,3);if(markerError)throw Error(markerError);
    host.exterior=true;teleport({x:-10.45,z:5.5},{x:-11.8,z:5.5});
    io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    for(const [width,height] of [[1280,720],[960,640],[520,640]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await capture('presentation-role-guidance-'+width);
      const bounds=await evaluate(`(() => {const r=document.getElementById('gear').getBoundingClientRect();const m=document.querySelector('.meters').getBoundingClientRect();const c=document.getElementById('gear-contact');const i=document.getElementById('interaction').getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,mx:m.x,mr:m.right,my:m.y,mb:m.bottom,ix:i.x,ir:i.right,iy:i.y,ib:i.bottom,text:c.textContent,overflow:c.scrollWidth>c.clientWidth};})()`);
      if(!/LAST CONTACT/.test(bounds.text)||!/AIRLOCK/.test(bounds.text)||bounds.overflow||bounds.x<0||bounds.right>width||bounds.y<200||bounds.bottom>height||bounds.x<bounds.mr&&bounds.right>bounds.mx&&bounds.y<bounds.mb&&bounds.bottom>bounds.my||bounds.x<bounds.ir&&bounds.right>bounds.ix&&bounds.y<bounds.ib&&bounds.bottom>bounds.iy)throw Error('Role guidance overlaps or loses information: '+JSON.stringify(bounds));checks++;
      const controlsHidden=await evaluate("getComputedStyle(document.querySelector('.controls')).visibility==='hidden'||getComputedStyle(document.querySelector('.controls')).display==='none'");
      if(!controlsHidden)throw Error('Static controls obscure active role guidance');checks++;
    }
    host.exterior=false;eva.exterior=false;game.scan=null;game.returnMarker=null;
    const supply=game.resources[0];host.exterior=true;
    teleport(supply,{x:supply.x,z:supply.z+1.5});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    await wait("document.getElementById('interaction').textContent.includes('INVENTORY FULL')");
    // Headless Chrome rejects native pointer lock (WrongDocumentError). Scope a
    // lock getter to one synthetic mouse-look event; rendering and input handling stay real.
    const lookDown=async amount=>evaluate(`(() => {Object.defineProperty(document,'pointerLockElement',{configurable:true,value:document.querySelector('#game > canvas')});try{const e=new MouseEvent('mousemove',{bubbles:true});Object.defineProperty(e,'movementY',{value:${amount}});document.dispatchEvent(e);}finally{delete document.pointerLockElement;}})()`);
    await lookDown(220);
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await capture('presentation-resource-full-1280');
    host.inventory[0]=null;const recoveryError=startHold(game,P,host,supply.id);if(recoveryError)throw Error(recoveryError);
    game.time+=1;io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    await wait("document.getElementById('interaction').textContent.includes('RECOVER REPAIR KIT')");
    for(const [width,height] of [[1280,720],[960,640],[520,640]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await capture('presentation-resource-recovery-'+width);
      const b=await evaluate(`(() => {const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};return {prompt:rect('#interaction'),bar:rect('#repair-wrap'),gear:rect('#gear'),meters:rect('.meters'),progress:document.getElementById('repair-fill').style.width};})()`);
      const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
      if(overlap(b.prompt,b.gear)||overlap(b.prompt,b.meters)||overlap(b.bar,b.prompt)||overlap(b.bar,b.gear)||overlap(b.bar,b.meters)||b.prompt.x<0||b.prompt.right>width||b.progress!=='50%')throw Error('Resource recovery obscures suit controls: '+JSON.stringify(b));checks++;
    }
    cancelHold(game,host.id);
    await lookDown(-220);
    await lookDown(110);
    for(const [name,from,target] of [
      ['flats',{x:-18,z:18},{x:0,z:0}],
      ['garden',{x:-25,z:8},{x:-38,z:-2}],
      ['wreck',{x:38,z:22},{x:38,z:-6}],
      ['cleft',{x:0,z:-29},{x:0,z:-43}],
      ['boundary',{x:57,z:0},{x:60,z:0}]
    ]) {
      host.suit=90;teleport(target,from);io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await sleep(1800);
      await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await capture('presentation-survey-'+name);
    }
    host.suit=25;io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    await wait("document.getElementById('banner').textContent.includes('SUIT AIR LOW')");
    await call('Emulation.setDeviceMetricsOverride',{width:520,height:640,deviceScaleFactor:1,mobile:false});await capture('presentation-survey-air-warning-520');
    const warn=await measure();if(!warn.warnings.visible||warn.warnings.bottom>warn.viewport[1]||warn.warnings.y<warn.objective.bottom)throw Error('Survey warning obscures objectives: '+JSON.stringify(warn));checks++;
    await evaluate("document.getElementById('wrist-toggle').click()");await capture('presentation-survey-wrist-air-520');
    const wristAir=await measure();verify(wristAir);
    const tabs=await evaluate("document.querySelector('.wrist-tabs').getBoundingClientRect().y");
    if(!wristAir.warnings.visible||wristAir.warnings.bottom>tabs)throw Error('Return-air warning covers wrist tabs: '+JSON.stringify(wristAir));checks++;
    await evaluate("document.getElementById('wrist-toggle').click()");
    host.exterior=false;game.story={available:['arrival'],found:[]};await lookDown(220);
    teleport({x:-6,z:-6},{x:-6,z:-5});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await sleep(500);
    const logError=startHold(game,P,host,'log:arrival');if(logError)throw Error(logError);game.time+=.5;io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    await wait("document.getElementById('interaction').textContent.includes('RECOVER RECORD')");await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await capture('presentation-story-terminal');cancelHold(game,host.id);host.exterior=true;await lookDown(-220);
    host.suit=90;host.inventory[0]=null;await lookDown(220);
    teleport({x:38,z:-12},{x:38,z:-10.7});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await sleep(500);
    const salvageError=startHold(game,P,host,'salvage:recover');if(salvageError)throw Error(salvageError);
    game.time+=1.5;io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    await wait("document.getElementById('interaction').textContent.includes('RECOVER PUMP REGULATOR')");
    for(const [width,height] of [[1280,720],[520,640]]){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await capture('presentation-survey-salvage-'+width);
      const b=await evaluate("(() => {const r=document.getElementById('interaction').getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom,progress:document.getElementById('repair-fill').style.width};})()");
      if(b.x<0||b.right>width||b.bottom>height||b.progress!=='50%')throw Error('Salvage prompt or progress unreadable: '+JSON.stringify(b));checks++;
    }
    cancelHold(game,host.id);
    host.suit=90;await lookDown(-330);
    host.exterior=false;
    teleport({x:-6,z:-7},{x:-3,z:-3});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    for(const p of P.slice(1))p.aboard=true;
    host.inventory=['scrap','scrap','repair','welder'];
    const {WORKBENCH,MINE_SITES,CIRCUITS}=await import('../shared/fieldwork.js');
    teleport(WORKBENCH,{x:WORKBENCH.x,z:WORKBENCH.z+1});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await sleep(500);await evaluate('document.activeElement?.blur()');await tap('KeyE');
    await wait("!document.getElementById('locker-panel').classList.contains('hidden')");
    for(const width of [1280,520]){await call('Emulation.setDeviceMetricsOverride',{width,height:720,deviceScaleFactor:1,mobile:false});await capture('presentation-fieldwork-bench-'+width);const r=await evaluate("(() => {const r=document.getElementById('locker-panel').getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom};})()");if(r.x<0||r.right>width||r.bottom>720)throw Error('Fabrication panel leaves screen');checks++;}
    await evaluate("document.getElementById('locker-close').click()");
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    game.threats.skitters=[{id:1,x:6,z:-6,room:'engineering',breach:'breach:review',ready:game.time,until:game.time+50,stunned:0}];game.breaches.push({id:'breach:review',x:6,z:-6,room:'engineering'});
    teleport({x:6,z:-6},{x:6,z:-8.5});await lookDown(250);io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));io.to(room.code).emit('game:event',{type:'hazardWarning',kind:'skitter',room:'engineering'});await capture('presentation-fieldwork-skitter');await lookDown(-250);
    game.threats.skitters=[];game.threats.electric={room:'engineering',ready:game.time+8,until:game.time+50};game.rooms.engineering.flood=.5;
    teleport(CIRCUITS.engineering,{x:CIRCUITS.engineering.x,z:CIRCUITS.engineering.z+1.2});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await lookDown(330);await capture('presentation-fieldwork-electric');await lookDown(-330);
    game.threats.electric=null;game.rooms.engineering.flood=0;host.exterior=true;
    const m=MINE_SITES[0];teleport(m,{x:m.x,z:m.z+2.2});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await lookDown(150);await capture('presentation-fieldwork-mine');await lookDown(-150);
    game.threats.warden={x:-18,z:33,ready:game.time,until:game.time+50,strikeAt:0,target:null};
    teleport({x:-18,z:33},{x:-18,z:18});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await lookDown(-300);await capture('presentation-fieldwork-warden');await lookDown(300);
    game.threats.warden=null;game.breaches=game.breaches.filter(b=>b.id!=='breach:review');host.exterior=false;teleport({x:-6,z:-7},{x:-3,z:-3});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    const {SUB_BOARD,SUB_DOCK}=await import('../shared/submersible.js');
    host.exterior=true;host.depth=0;host.suit=90;teleport(SUB_DOCK,{x:-20,z:9});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await sleep(500);await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await capture('presentation-sub-exterior');
    Object.assign(host,{x:SUB_BOARD.x,z:SUB_BOARD.z+1,exterior:false,depth:0});const subError=startHold(game,P,host,'sub:board');if(subError)throw Error(subError);
    game.sub.air=24;game.sub.hull=60;
    io.to(host.socketId).emit('player:correct',{x:host.x,z:host.z,teleport:true,rotation:0});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await sleep(1000);
    for(const [width,height] of [[1280,720],[520,640]]){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await capture('presentation-sub-pilot-'+width);
      const b=await evaluate("(() => {const box=id=>{const r=document.querySelector(id).getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom};};return {panel:box('#sub-hud'),meters:box('.meters'),status:document.getElementById('sub-status').textContent};})()");
      if(b.panel.x<b.meters.right+6||b.panel.right>width||b.panel.bottom>height||!b.status.includes('HULL 60% / AIR 24s'))throw Error('Sub instruments overlap or miss critical values: '+JSON.stringify(b));checks++;
    }
    Object.assign(game.sub,{x:-26,z:5.5,yaw:Math.PI/2,speed:0,docked:false});Object.assign(host,{x:game.sub.x,z:game.sub.z});
    const other=P[1];Object.assign(other,{aboard:false,lost:false,downed:false,connected:true,exterior:true,depth:0,x:game.sub.x,z:game.sub.z+1});const otherError=startHold(game,P,other,'sub:board');if(otherError)throw Error(otherError);
    game.sub.driver=other.id;game.sub.passenger=host.id;other.subSeat='driver';host.subSeat='passenger';
    io.to(host.socketId).emit('player:correct',{x:host.x,z:host.z,teleport:true});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await sleep(1000);
    await evaluate("document.querySelector('#sub-hud details').open=true;document.getElementById('sub-scan').focus()");await capture('presentation-sub-operator-520');
    game.sub.driver=host.id;game.sub.passenger=other.id;host.subSeat='driver';other.subSeat='passenger';Object.assign(game.sub,{...SUB_DOCK,yaw:0,speed:0});Object.assign(host,SUB_DOCK);Object.assign(other,SUB_DOCK);
    const dockingError=startHold(game,P,host,'sub:dock');if(dockingError)throw Error(dockingError);game.time+=1;
    io.to(host.socketId).emit('player:correct',{x:host.x,z:host.z,teleport:true});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    await wait("document.getElementById('sub-dock').textContent.includes('50%')");await capture('presentation-sub-dock-520');cancelHold(game,host.id);
    const {dockSub}=await import('../server/submersible.js');dockSub(game,P,[]);io.to(host.socketId).emit('player:correct',{x:host.x,z:host.z,teleport:true});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await sleep(500);
    other.aboard=true;host.exterior=true;host.depth=3;host.suit=60;teleport({x:0,z:-43},{x:-2,z:-43});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await lookDown(110);await sleep(1000);
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await capture('presentation-sub-dive');await lookDown(-110);
    host.exterior=false;host.depth=0;teleport({x:-6,z:-7},{x:-3,z:-3});io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));
    // Environmental review does not need seven animated crew behind the camera.
    for(const p of P.slice(1))p.aboard=true;
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    for(const [name,from,point] of [
      ['power-unit',{x:7.5,z:-6},{x:9.55,z:-6}],
      ['engineering-floor',{x:7,z:-2.2},{x:3.4,z:-8.2}],
      ['medical-floor',{x:-2.4,z:4.2},{x:-6,z:6.8}],
      ['transfer-floor',{x:3.5,z:4},{x:7.5,z:8}]
    ]) {
      teleport(point,from);io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await capture('presentation-'+name);
    }
    await evaluate("document.getElementById('opt-reduced').click();document.getElementById('opt-quality').value='low';document.getElementById('opt-quality').dispatchEvent(new Event('change'))");
    game.tasks.power.done=false;io.to(room.code).emit('game:state',snapshotGame(game,P,Date.now()));await capture('presentation-emergency-low-reduced');
    recordEvents(game,P,[...(game.pendingEvents||[]),{type:'pumpClog'},{type:'pumpService',by:host.id}]);
    for(const p of P) Object.assign(p,{aboard:true,escaped:true,ending:'pod_escape'});
    io.to(room.code).emit('game:over',buildSummary(game,P,'win','The crew reached the recovery tender.'));
    await wait("document.body.classList.contains('in-epilogue')");
    await evaluate("document.getElementById('epilogue-skip').click()");
    await wait("!document.getElementById('game-over').classList.contains('hidden')");
    await evaluate("document.getElementById('match-timeline').open=true");
    for(const [width,height] of [[1280,720],[520,640]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await capture('presentation-timeline-'+width);
      const bounds=await evaluate(`(() => {const r=document.querySelector('#game-over .overlay-card').getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,scroll:document.getElementById('game-over').scrollWidth};})()`);
      if(bounds.left<0||bounds.right>width||bounds.scroll>width)throw Error('Timeline report exceeds viewport: '+JSON.stringify(bounds));checks++;
    }

  }
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log(`${checks} real browser checks/captures passed; screenshots in test/artifacts`);
} finally {
  clearInterval(orbit);
  try { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: "Browser.close" })); } catch {}
  await sleep(200); ws?.close(); chrome.kill(); bots.forEach(s => s.disconnect()); api.stop(); io.close(); server.close();repository.close();
}
