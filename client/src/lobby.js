// The lobby screen: crew list, department picker, ready/start, chat.
import { DEPTS, DEPT_IDS, MAX_PLAYERS } from "../../shared/layout.js";
import { net } from "./network.js";
import { createChatView, bindChatInput } from "./chat.js";
import { MISSIONS } from "../../shared/tactical.js";
import {openCrewControls} from './moderation-ui.js';

const $ = (id) => document.getElementById(id);

export function createLobby() {
  const chat = createChatView($("lobby-chat-log"));
  bindChatInput($("lobby-chat-input"));
  let last = null, myId = null;
  $("mission-select").addEventListener("change", e => net.mission(e.target.value));
  $('difficulty-select').addEventListener('change',e=>net.difficulty(e.target.value));
  $('room-visibility-save').onclick=()=>net.visibility($('room-public').checked,$('public-room-name').value);

  $("ready-button").addEventListener("click", () => {
    const me = last?.players.find((p) => p.id === myId);
    if (me) net.setReady(!me.ready);
  });
  $("start-button").addEventListener("click", () => net.start());
  $("lobby-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(last?.code ?? ""); $("lobby-status").textContent = "Room code copied."; } catch { $("lobby-status").textContent = "Could not copy: select the code manually."; }
  });

  // department cards are built once
  const cards = {};
  for (const id of DEPT_IDS) {
    const d = DEPTS[id];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "dept-card";
    card.style.setProperty("--c", d.color);
    card.innerHTML = '<b></b><small></small><span class="picked"></span>';
    card.querySelector("b").textContent = d.label.toUpperCase();
    card.querySelector("small").textContent = d.blurb;
    card.addEventListener("click", () => {
      const me = last?.players.find((p) => p.id === myId);
      net.setDept(me?.dept === id ? null : id); // click again to go back to "auto"
    });
    $("dept-cards").appendChild(card);
    cards[id] = card;
  }

  return {
    chat,
    setMe: (id) => { myId = id; },
    render(lobby) {
      last = lobby;
      const me = lobby.players.find((p) => p.id === myId);
      $("lobby-code").textContent = lobby.code;
      $("lobby-count").textContent = `${lobby.players.length} / ${MAX_PLAYERS}`;
      $("lobby-players").replaceChildren(...lobby.players.map((p) => {
        const row = document.createElement("div");
        row.className = "lobby-player" + (p.id === myId ? " me" : "") + (p.connected ? "" : " offline");
        const d = DEPTS[p.dept];
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = d ? d.short : "AUTO";
        if (d) badge.style.color = d.color;
        const name = document.createElement("button");name.className='chat-author';name.type='button';name.title='Mute or report crew';name.onclick=()=>openCrewControls(p);
        name.textContent = p.name + (p.host ? "  ★ HOST" : "") + (p.id === myId ? " (you)" : "");
        const state = document.createElement("em");
        state.textContent = !p.connected ? "OFFLINE" : p.ready ? "✔ READY" : "...";
        if (p.ready) state.className = "ok";
        row.append(badge, name, state);
        return row;
      }));
      for (const id of DEPT_IDS) {
        const n = lobby.players.filter((p) => p.dept === id).length;
        cards[id].classList.toggle("selected", me?.dept === id);
        cards[id].querySelector(".picked").textContent = n ? `${n} chosen` : "";
      }
      const isHost = lobby.hostId === myId;
      $('room-public').checked=!!lobby.public;$('room-public').disabled=!isHost||!!lobby.practice;$('public-room-name').disabled=!isHost||!!lobby.practice;$('room-visibility-save').disabled=!isHost||!!lobby.practice;
      if(document.activeElement!==$('public-room-name'))$('public-room-name').value=lobby.name||'Crew room';
      $('visibility-status').textContent=lobby.practice?'SOLO PRACTICE / PRIVATE':lobby.public?'PUBLIC / LISTED ON THIS SERVER / PUBLIC RESULTS MAY RANK':'PRIVATE / CODE ONLY / RESULTS STAY PERSONAL';
      $("mission-select").disabled = !isHost;
      $('difficulty-select').disabled=!isHost;$('difficulty-select').value=lobby.difficulty||'normal';
      $("mission-select").value = lobby.mission || "blackout";
      $("mission-brief").textContent = MISSIONS[lobby.mission || "blackout"].brief;
      $("ready-button").textContent = me?.ready ? "✔ READY (click to cancel)" : "READY";
      $("ready-button").classList.toggle("on", !!me?.ready);
      const start = $("start-button");
      start.classList.toggle("hidden", !isHost);
      const ready = lobby.players.filter((p) => p.ready || p.host).length;
      start.textContent = `START MISSION (${ready}/${lobby.players.length} ready)`;
      const missing = DEPT_IDS.filter((d) => !lobby.players.some((p) => p.dept === d));
      $("lobby-hint").textContent = lobby.players.length < 4
        ? "Fewer than 4 players: some departments will be empty. Everyone can still do every task, just slower."
        : missing.length ? `Nobody chose ${missing.map((d) => DEPTS[d].label).join(", ")}. Unchosen departments are filled automatically.`
          : "Every department is covered. Good luck.";
      $("lobby-status").textContent = isHost ? "You are the host: start when everyone is ready." : "Waiting for the host to start the mission...";
      if(lobby.practice)$('lobby-status').textContent='Training room: replay the simulator, or leave to create a normal co-op room.';
    }
  };
}
