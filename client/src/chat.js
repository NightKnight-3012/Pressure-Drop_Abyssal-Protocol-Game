// Crew chat. Kept separate from gameplay code so voice chat can be added later without touching the game.
import { net } from "./network.js";
import { DEPTS } from "../../shared/layout.js";
import { sfx } from "./audio.js";
import {isMuted,openCrewControls} from './moderation-ui.js';

// Creates a chat view bound to a log element (+ optional input). Returns { add, clear }.
export function createChatView(logEl, { fade = false, max = 60 } = {}) {
  const lines = [];
  const timers = new Set();
  const refreshMute=()=>{for(const row of lines)row.classList.toggle('hidden',isMuted(row.dataset.sender));};
  document.addEventListener('pressure-mute-change',refreshMute);
  return {
    add(msg) {
      const sender=msg.from?.profileId||msg.from?.id;if(!msg.system&&isMuted(sender))return;
      const row = document.createElement("div");
      if(sender)row.dataset.sender=sender;
      row.className = "chat-line" + (msg.system ? " system" : "") + (msg.garbled ? " garbled" : "");
      if (msg.system) {
        row.textContent = msg.text;
      } else {
        const who = document.createElement("button");who.className='chat-author';who.type='button';who.title='Mute or report this crew member';who.onclick=()=>openCrewControls(msg.from);
        const d = DEPTS[msg.from?.dept];
        who.textContent = `${msg.from?.spectator ? "(spectator) " : ""}${d ? `[${d.short}] ` : ""}${msg.from?.name ?? "?"}: `;
        if (d) who.style.color = d.color;
        const text = document.createElement("span");
        text.textContent = msg.text;
        row.append(who, text);
        if (msg.garbled) row.title = "Garbled: the sections are cut off from each other";
      }
      logEl.appendChild(row);
      lines.push(row);
      while (lines.length > max) lines.shift().remove();
      logEl.scrollTop = logEl.scrollHeight;
      if (fade) { const timer = setTimeout(() => { row.classList.add("old"); timers.delete(timer); }, 9000); timers.add(timer); }
      if (!msg.system) sfx.chat();
    },
    clear() { timers.forEach(clearTimeout); timers.clear(); logEl.replaceChildren(); lines.length = 0; },
    dispose(){document.removeEventListener('pressure-mute-change',refreshMute);timers.forEach(clearTimeout);timers.clear();logEl.replaceChildren();lines.length=0;}
  };
}

// Sends the text when Enter is pressed. `onDone` is called after Enter or Escape.
export function bindChatInput(inputEl, onDone) {
  const onKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      const text = inputEl.value.trim();
      if (text) net.chat(text);
      inputEl.value = "";
      onDone?.();
    } else if (e.key === "Escape") {
      inputEl.value = "";
      onDone?.();
    }
  };
  const onKeyUp = e => e.stopPropagation();
  inputEl.addEventListener("keydown", onKeyDown);
  inputEl.addEventListener("keyup", onKeyUp);
  return () => { inputEl.removeEventListener("keydown", onKeyDown); inputEl.removeEventListener("keyup", onKeyUp); };
}
