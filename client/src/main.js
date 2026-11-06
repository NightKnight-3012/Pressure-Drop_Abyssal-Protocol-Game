import "./style.css";
import { socket, net, saveSession, loadSession, clearSession } from "./network.js";
import { unlockAudio } from "./audio.js";
import { initOptionsUi, showOptions } from "./options.js";
import { createLobby } from "./lobby.js";
import {openCaseFile,saveEvidence} from './case-file.js';
import {createOnlineUi} from './online-ui.js';
import {initModerationUi} from './moderation-ui.js';
import {
  startGame, stopGame, isGameRunning, handleState, handleGo, handleBriefing, handleEvent, handleChat, handleOver,
  handleCorrect, handleServerMessage, setConnectionLost, replaceMatch
} from "./game.js";

const $ = (id) => document.getElementById(id);
const nameInput = $("player-name");
const codeInput = $("room-code");
const createButton = $("create-room");
const joinButton = $("join-room");
const status = $("menu-status");

initOptionsUi();
const moderation=initModerationUi(net),online=createOnlineUi({net,socket,begin});
for(const id of ['case-open','lobby-case-open'])$(id).addEventListener('click',openCaseFile);
$('case-close').addEventListener('click',()=>$('case-file').classList.add('hidden'));
$("crew-log-open").addEventListener("click", () => {
  let records = []; try { records = JSON.parse(localStorage.getItem("pressure-drop-crew-log") || "[]"); } catch {}
  records = Array.isArray(records) ? records.filter(record => record && typeof record.title === "string").slice(0, 30) : [];
  const list = $("crew-log-list"); list.replaceChildren();
  if (!records.length) list.textContent = "Your first expedition's ending will be recorded here.";
  for (const record of records) {
    const row = document.createElement("p"); row.textContent = `${record.title} · ${record.badge} · ${record.name}`; list.append(row);
  }
  $("crew-log").classList.remove("hidden");
});
$("crew-log-close").addEventListener("click", () => $("crew-log").classList.add("hidden"));
const lobby = createLobby();
let me = null;       // { id, token }
let roomCode = null;
let lobbyState = null;
let entering = false;
let connectionNotice='';

function show(screen) {
  moderation.close();online.close();
  for (const id of ["menu", "lobby", "game"]) $(id).classList.toggle("hidden", id !== screen);
}
const setBusy = (busy) => { entering = busy; createButton.disabled = joinButton.disabled = $('practice-start').disabled = $('quick-match').disabled = busy; };
function leaveForGood() {
  clearSession();
  window.location.reload();
}

// ---------------------------------------------------------------- menu
function begin(action) {
  if (entering) return;
  if (!socket.connected) { status.textContent = "NOT CONNECTED TO SERVER. IS IT RUNNING?"; return; }
  const name = nameInput.value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 16) { status.textContent = "ENTER A NAME BETWEEN 1 AND 16 CHARACTERS."; nameInput.focus(); return; }
  unlockAudio(); // a button click is a user gesture, so audio is allowed from here on
  setBusy(true);
  status.textContent = "ESTABLISHING COMMUNICATIONS...";
  action(name);
}
function joinWithCode() {
  const code = codeInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) { status.textContent = "ENTER A VALID 5-CHARACTER ROOM CODE."; codeInput.focus(); return; }
  begin((name) => net.join(name, code));
}
createButton.addEventListener("click", () => begin(net.create));
$('practice-start').addEventListener('click',()=>begin(net.practice));
joinButton.addEventListener("click", joinWithCode);
for (const input of [nameInput, codeInput]) {
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (codeInput.value.trim()) joinWithCode(); else begin(net.create);
  });
}
$("menu-form").addEventListener("submit", (e) => e.preventDefault());
codeInput.addEventListener("input", () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); });
for (const id of ["menu-options", "lobby-options"]) $(id).addEventListener("click", showOptions);
$("lobby-leave").addEventListener("click", () => { socket.emit("room:leave"); setTimeout(leaveForGood, 80); });
$("leave-room").addEventListener("click", () => { socket.emit("room:leave"); setTimeout(leaveForGood, 80); });
$("lost-leave").addEventListener("click", () => { net.leave(); setTimeout(leaveForGood, 80); });
$("to-lobby").addEventListener("click", () => net.toLobby());

// ---------------------------------------------------------------- connection
socket.on("connect", () => {
  connectionNotice='';
  const saved = loadSession();
  if (saved) { net.rejoin(saved.code, saved.token); return; }
  status.textContent = "COMMUNICATIONS ONLINE. AWAITING CREW...";
  setBusy(false);
});
socket.on("connect_error", () => { if (!isGameRunning()) status.textContent = "SERVER UNAVAILABLE. START IT WITH: npm run dev"; });
socket.on("disconnect", () => {
  if (isGameRunning()) setConnectionLost(true);
  else if (!$("menu").classList.contains("hidden")) { status.textContent = connectionNotice || "CONNECTION LOST. RECONNECTING..."; setBusy(false); }
});
function serverNotice(message){connectionNotice=String(message).toUpperCase();status.textContent=connectionNotice;setBusy(false);if(isGameRunning()){setConnectionLost(true);$('lost').querySelector('h2').textContent='COMMUNICATIONS CLOSED';$('lost').querySelector('.overlay-card > p:not(.eyebrow)').textContent=String(message);}else{show('menu');clearSession();}}
socket.on('server:blocked',serverNotice);
socket.on('server:shutdown',data=>serverNotice(data.message||'Server restarting. Unfinished match not scored.'));
socket.on('moderation:notice',data=>moderation.notice(data));
socket.on("room:gone", () => {
  clearSession();
  if (isGameRunning()) stopGame();
  show("menu");
  status.textContent = "YOUR PREVIOUS ROOM HAS CLOSED. CREATE OR JOIN A NEW ONE.";
  setBusy(false);
});

// ---------------------------------------------------------------- rooms
socket.on("room:joined", (d) => {
  if(d.match?.state.story)saveEvidence(d.match.state.story.found);
  me = d.you; roomCode = d.code; lobbyState = d.lobby;
  saveSession({ code: d.code, token: d.you.token });
  lobby.setMe(me.id);
  lobby.chat.clear();
  for (const m of d.chat || []) lobby.chat.add(m);
  lobby.render(lobbyState);
  setBusy(false);
  const inMatch = d.match && d.match.phase !== "lobby";
  if (isGameRunning()) {
    if (inMatch) replaceMatch(d.match);           // reconnected during a match
    else { stopGame(); show("lobby"); }            // the match ended while we were away
  } else if (inMatch) {
    show("game");
    if (!startGame({ playerId: me.id, code: roomCode, match: d.match, chat: d.chat })) {
      status.textContent = "YOUR BROWSER DOES NOT SUPPORT WEBGL, WHICH THE GAME NEEDS.";
      show("menu");
    }
  } else show("lobby");
});
socket.on("lobby:state", (l) => { lobbyState = l; lobby.render(l); });
socket.on("match:start", (payload) => {
  if (isGameRunning()) return;
  show("game");
  if (!startGame({ playerId: me.id, code: roomCode, match: payload })) {
    status.textContent = "YOUR BROWSER DOES NOT SUPPORT WEBGL, WHICH THE GAME NEEDS.";
    show("menu");
  }
});
socket.on("match:go", handleGo);
socket.on("match:briefing", handleBriefing);
socket.on("match:lobby", () => { stopGame(); show("lobby"); if (lobbyState) lobby.render(lobbyState); });
socket.on("game:state", s=>{if(s.status!=='playing')moderation.close();handleState(s);});
socket.on("game:event", handleEvent);
socket.on("game:over", o=>{moderation.close();handleOver(o);});
socket.on("player:correct", handleCorrect);
socket.on("chat:msg", (m) => { if (isGameRunning()) handleChat(m); else lobby.chat.add(m); });
socket.on("game:error", (message) => {
  if (isGameRunning()) { handleServerMessage(message); return; }
  if (!$("menu").classList.contains("hidden")) { status.textContent = String(message).toUpperCase(); setBusy(false); }
  else $("lobby-status").textContent = String(message);
});
