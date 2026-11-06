import {ROOM_IDS,ROOMS,LOCKERS} from './layout.js';
export const WORKBENCH=Object.freeze({...LOCKERS.engineering,label:'Engineering fabrication bench'});
export const CIRCUITS=Object.freeze(Object.fromEntries(ROOM_IDS.map(room=>[room,{room,x:ROOMS[room].sx*3.5,z:ROOMS[room].sz*3.5}])));
export const RECIPES=Object.freeze({flare:{item:'flare',cost:1},decoy:{item:'decoy',cost:1},repair:{item:'repair',cost:1},welder:{item:'welder',cost:2,role:'engineering'},scanner:{item:'scanner',cost:2,role:'command'},oxygen:{item:'oxygen',cost:2,role:'medical'},return:{item:'return',cost:2,role:'eva'},prod:{item:'prod',cost:1,role:'eva'},emp:{item:'emp',cost:2,role:'command'},clamp:{item:'clamp',cost:1,role:'engineering'},trauma:{item:'trauma',cost:1,role:'medical'}});
export const MINE_SITES=Object.freeze([{x:28,z:28},{x:47,z:-21},{x:-28,z:-26}]);
export const DIFFICULTIES=Object.freeze({relaxed:{label:'Relaxed',frequency:.6,damage:.6},normal:{label:'Normal',frequency:1,damage:1},nightmare:{label:'Nightmare',frequency:1.4,damage:1.25}});
