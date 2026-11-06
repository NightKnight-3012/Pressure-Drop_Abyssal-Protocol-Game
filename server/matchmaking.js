import {MAX_PLAYERS} from '../shared/layout.js';
export function publicRooms(rooms){
  return [...rooms.values()].filter(r=>r.public&&!r.practice).map(r=>({code:r.code,name:r.name||'Open crew',players:r.players.size,max:MAX_PLAYERS,difficulty:r.difficulty||'normal',phase:r.phase})).sort((a,b)=>(a.phase==='lobby'?0:1)-(b.phase==='lobby'?0:1)||b.players-a.players||a.code.localeCompare(b.code));
}
export function quickRoom(rooms,difficulty='normal'){
  return [...rooms.values()].filter(r=>r.public&&!r.practice&&r.phase==='lobby'&&r.players.size<MAX_PLAYERS&&(r.difficulty||'normal')===difficulty).sort((a,b)=>b.players.size-a.players.size)[0]||null;
}
