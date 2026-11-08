// Controlled rule feasibility, not a human win-rate estimate. No game tuning is changed.
import {createGame,tickGame,assignDepartments} from '../game.js';
import {beginFinale} from '../finale.js';
import {driveFinale} from './crew-driver.js';
import {FINALE_POINTS} from '../../shared/tactical.js';

export function simulateEvacuation({crew,seed=1000,beaconSeconds=12,hp=100,flood=0}){
  const players=Array.from({length:crew},(_,i)=>({id:`p${i}`,name:`Crew ${i}`,connected:true,dept:null,joinedAt:i}));assignDepartments(players);
  const game=createGame({players,seed,now:0});for(const task of Object.values(game.tasks))task.done=true;
  game.nextBreachAt=game.lockdown.nextAt=game.complication.at=1e9;
  for(const room of Object.values(game.rooms))room.flood=flood;
  players.forEach((p,i)=>{p.aboard=i<game.seats;p.hp=hp;if(!p.aboard)Object.assign(p,FINALE_POINTS.capsule);});
  beginFinale(game,players,[]);
  for(let i=0;i<2400&&game.status==='playing';i++){driveFinale(game,players,{beaconSeconds});tickGame(game,players,game.lastTick+100);}
  return {crew,seed,beaconSeconds,hp,flood,escaped:players.filter(p=>p.escaped).length,fullEscape:players.every(p=>p.escaped),status:game.status,pod:game.finale.pod.status,station:game.finale.station.status,time:+game.time.toFixed(1),reserve:+game.finale.station.power.toFixed(1),endings:players.map(p=>({dept:p.dept,ending:p.ending,hp:+p.hp.toFixed(1)}))};
}
