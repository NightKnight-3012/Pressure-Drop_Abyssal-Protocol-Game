// Balance check: a scripted, sensible crew plays full matches at every crew size.
//   npm run balance            (all sizes, 12 seeds each)
//   npm run balance -- 6 30    (6 players, 30 seeds)
//   REACTION=30 RUN=0.4 npm run balance   (a slow, noisy crew: how often do they lose?)
// "Sensible" = does the right tasks in a reasonable order, patches breaches, refills oxygen, handles the
// lockdown and the vote, but is not perfect (walking takes time, reactions are slow). If this crew cannot win,
// the numbers in server/game.js (TUNING) or shared/layout.js (scaling table) are too harsh.
import { createGame, tickGame, startHold, castVote, assignDepartments, isActive, cancelHold, TUNING, mulberry32,useItem } from "../game.js";
import {CIRCUITS} from '../../shared/fieldwork.js';
import { STATIONS, DEPT_IDS, DOOR_STATION, roomAt } from "../../shared/layout.js";
import { calibrate, driveFinale } from "./crew-driver.js";
import { FINALE_POINTS } from "../../shared/tactical.js";

const front = (st, d = 1.3) => ({ x: st.x + Math.sin(st.rot) * d, z: st.z + Math.cos(st.rot) * d });
const DT = 0.1;
const WALK = 3;   // effective walking speed in m/s (corners, doors, looking around)

function simulate(n, seed, { reaction = Number(process.env.REACTION) || 9, runChance = process.env.RUN !== undefined ? Number(process.env.RUN) : 0.12 } = {}) {
  let NOW = 1_000_000;
  const randomDecision = mulberry32(seed ^ 0x51a7);
  const players = Array.from({ length: n }, (_, i) => ({
    id: "p" + i, name: "P" + i, dept: null, connected: true, joinedAt: i, lastPacket: 0, running: false,
    busyUntil: 0, plan: null
  }));
  assignDepartments(players);
  const game = createGame({ players, now: NOW, seed });
  game.holds.clear();
  const stats = { minO2: 100, maxFlood: 0, lost: 0,drownDowns:0,airDowns:0,impactDowns:0,otherDowns:0,evaDowns:0,evaAirDowns:0,evaContactDowns:0,electricDowns:0,skitterDowns:0 };
  let overrideTried = false;

  const dist = (p, pos) => Math.hypot(p.x - pos.x, p.z - pos.z);
  // Walk to a spot (teleport after the walking time), then start the hold.
  function go(p, pos, id) {
    p.plan = { at: game.time + dist(p, pos) / WALK + reaction * (0.6 + randomDecision() * 0.8), pos, id }; // humans hesitate
  }
  const idle = (p) => !p.plan && !game.holds.has(p.id) && isActive(p);
  const taskReady = (id) => game.tasks[id] && !game.tasks[id].done && !(STATIONS[id].requires || []).some((r) => r === "junctions" ? !game.activeJunctions.every((j) => game.tasks[j].done) : !game.tasks[r].done) &&
    ![...game.holds.values()].some((h) => h.id === id) && ![...players].some((q) => q.plan?.id === id);
  const power = () => game.tasks.power.done;

  for (let step = 0; step < 3600 / DT && game.status === "playing"; step++) {
    NOW += DT * 1000;
    for (const p of players) { p.lastPacket = NOW; if (step % 30 === 0) p.running = !p.exterior && randomDecision() < runChance; } // humans sprint sometimes
    const events = tickGame(game, players, NOW);
    stats.minO2 = Math.min(stats.minO2, game.oxygen);
    stats.maxFlood = Math.max(stats.maxFlood, ...Object.values(game.rooms).map((r) => r.flood));
    for (const e of events){if(e.type==='lost')stats.lost++;if(e.type==='down'){const p=players.find(p=>p.id===e.id);const cause=!p.exterior&&p.breath<=0?'drownDowns':!p.exterior&&game.oxygen<=0?'airDowns':events.some(e=>e.type==='impact'&&e.room===roomAt(p.x,p.z))?'impactDowns':'otherDowns';stats[cause]++;if(cause==='otherDowns'){if(p.exterior){stats.evaDowns++;if(p.suit<=0)stats.evaAirDowns++;else stats.evaContactDowns++;}else if(game.threats.electric?.room===roomAt(p.x,p.z)&&game.roomCircuits[roomAt(p.x,p.z)])stats.electricDowns++;else if(game.threats.skitters.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<1))stats.skitterDowns++;}}}

    // Divers react to a nearby hunting contact and use their real, finite lure.
    const contact={x:Math.cos(game.lev.angle)*game.lev.dist,z:Math.sin(game.lev.angle)*game.lev.dist};
    for(const p of players)if(isActive(p)&&p.exterior&&(['approach','attack'].includes(game.lev.state)&&dist(p,contact)<18||p.suit<25)&&p.plan?.id!=='airlock_out'&&game.holds.get(p.id)?.id!=='airlock_out'){
      const decoy=p.inventory.indexOf('decoy');if(decoy>=0)useItem(game,players,p,decoy);
      cancelHold(game,p.id);p.plan={at:game.time+2+dist(p,front(STATIONS.airlock_out))/WALK,pos:front(STATIONS.airlock_out),id:'airlock_out'};
    }
    // ---- arrivals
    for (const p of players) {
      if (p.plan && game.time >= p.plan.at && isActive(p)) {
        const { pos, id } = p.plan; p.plan = null;
        p.x = pos.x; p.z = pos.z;
        if (id) {
          if (id === "airlock_in" && STATIONS[id]) p.exterior = false;
          calibrate(game, p, id);
          const err = startHold(game, players, p, id);
          if (err) p.busyUntil = game.time + 2;
        }
      } else if (p.plan && !isActive(p)) p.plan = null;
    }

    // ---- escape stages
    if (game.stage === "vote") {
      for (const p of players) if (!game.vote.ballots[p.id]) {
        const worst = players.filter((q) => !q.lost).sort((a, b) => (a.contribution || a.tasksDone) - (b.contribution || b.tasksDone)).slice(0, game.vote.k);
        castVote(game, players, p, worst.map(q => q.id));
      }
      continue;
    }
    if (game.stage === "boarding") {
      for (const p of players) if (!p.lost && !p.leftBehind && !p.aboard && !p.plan) p.plan = { at: game.time + 6 + reaction, pos: FINALE_POINTS.board, id: "board" };
      continue;
    }
    if (game.stage === "finale") { driveFinale(game, players); continue; }

    // ---- lockdown: someone in each sealed room holds the override together
    if (game.lockdown.active) {
      for (const r of game.lockdown.rooms) {
        const st = STATIONS[DOOR_STATION[r]];
        const inside = players.filter((p) => isActive(p) && roomAt(p.x, p.z) === r);
        const holder = inside.find((p) => game.holds.get(p.id)?.id === st.id);
        if (!holder && inside[0] && !inside[0].plan) { inside[0].plan = null; inside[0].x = front(st).x; inside[0].z = front(st).z; startHold(game, players, inside[0], st.id); }
      }
      overrideTried = true;
      continue;
    }

    // ---- everyone else works

    const openBreaches = game.breaches.filter((b) => ![...game.holds.values()].some((h) => h.id === b.id) && !players.some((q) => q.plan?.id === b.id));
    for (const p of players) {
      if (!idle(p) || game.time < p.busyUntil) continue;
      if (p.exterior) { // divers outside keep working through the junctions, then come home
        const j = game.activeJunctions.find((id) => taskReady(id));
        if (j) go(p, front(STATIONS[j]), j); else go(p, front(STATIONS.airlock_out), "airlock_out");
        continue;
      }
      // Critical air is a crew-wide emergency. A medic should not repeatedly
      // choose individual revives or patch jobs while the whole crew suffocates.
      if (p.dept === "medical" && game.tasks.lifesupport.done && game.oxygen < 30 && game.time >= game.o2ReadyAt) { go(p, front(STATIONS.o2), "o2"); continue; }
      const dangerous=game.threats.electric?.room;
      if(dangerous&&game.roomCircuits[dangerous]&&!players.some(q=>q.plan?.id===`circuit:${dangerous}`)&&![...game.holds.values()].some(h=>h.id===`circuit:${dangerous}`)){go(p,CIRCUITS[dangerous],`circuit:${dangerous}`);continue;}
      if(game.threats.warden){p.flashlight=false;const lit=Object.keys(CIRCUITS).find(r=>game.roomCircuits[r]&&!players.some(q=>q.plan?.id===`circuit:${r}`)&&![...game.holds.values()].some(h=>h.id===`circuit:${r}`));if(lit){go(p,CIRCUITS[lit],`circuit:${lit}`);continue;}}
      if(game.threats.skitters.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<4)&&!game.effects.some(e=>e.item==='flare'&&Math.hypot(e.x-p.x,e.z-p.z)<5)){const slot=p.inventory.indexOf('flare');if(slot>=0)useItem(game,players,p,slot);}
      const downed=players.find(q=>q.downed&&!q.lost&&!q.exterior&&!players.some(r=>r.plan?.id==='treat:'+q.id)&&![...game.holds.values()].some(h=>h.id==='treat:'+q.id));
      if (downed && downed !== p) { go(p, { x: downed.x + 0.8, z: downed.z }, "treat:" + downed.id); continue; }
      const patient=players.find(q=>q!==p&&isActive(q)&&!q.exterior&&q.hp<60&&!players.some(r=>r.plan?.id==='treat:'+q.id)&&![...game.holds.values()].some(h=>h.id==='treat:'+q.id));
      if(p.dept==='medical'&&game.tasks.lifesupport.done&&patient){go(p,{x:patient.x+.8,z:patient.z},'treat:'+patient.id);continue;}
      if (openBreaches.length && (p.dept === "engineering" || openBreaches.length > 1 || game.rooms.control.flood > 1)) {
        const b = openBreaches.shift(); go(p, { x: b.x + 0.5, z: b.z }, b.id); continue;
      }
      // medical keeps the air breathable
      if (p.dept === "medical" && game.tasks.lifesupport.done && game.oxygen < 55 && game.time >= game.o2ReadyAt) { go(p, front(STATIONS.o2), "o2"); continue; }
      // each department prefers its own tasks, but anyone helps when something is waiting (small crews!)
      const own = { engineering: ["power", "pump"], command: ["console"], medical: ["lifesupport"], eva: [] }[p.dept];
      const hasEva = players.some((q) => q.dept === "eva" && !q.lost); // a lost diver can be replaced by anyone
      const order = [...own, "power", "pump", "console", "lifesupport"];
      const next = order.find((id) => taskReady(id));
      if (next) { go(p, front(STATIONS[next]), next); continue; }
      const junctionsLeft = game.activeJunctions.some((id) => !game.tasks[id].done);
      if (junctionsLeft && (p.dept === "eva" || !hasEva) && power() && !players.some((q) => (q.exterior && !q.lost) || q.plan?.id === "airlock_in")) { go(p, front(STATIONS.airlock_in), "airlock_in"); continue; }
      if (taskReady("launch") && (p.dept === "medical" || !players.some((q) => q.dept === "medical" && isActive(q)))) go(p, front(STATIONS.launch), "launch");
    }
  }
  if (game.status === "playing" && process.env.DEBUG_STUCK) console.log(JSON.stringify({ stage: game.stage, tasks: Object.fromEntries(Object.entries(game.tasks).map(([k, v]) => [k, v.done])), lock: game.lockdown, holds: [...game.holds], players: players.map((p) => ({ id: p.id, dept: p.dept, x: +p.x.toFixed(1), z: +p.z.toFixed(1), ext: p.exterior, plan: p.plan && p.plan.id, down: p.downed, lost: p.lost, busy: +p.busyUntil.toFixed(0) })), rooms: game.rooms, vote: game.vote && { k: game.vote.k, ballots: game.vote.ballots }, boarding: game.boarding }, null, 1));
  return { seed,failureStage:game.stage,win: game.status === "win", status: game.status, time: Math.round(game.time), grade: game.outcome?.grade, reason: game.outcome?.reason, aboard: game.outcome?.aboard.length ?? 0, ...stats,lost:players.filter(p=>p.lost).length,escaped:players.filter(p=>p.escaped).length,allEscaped:players.every(p=>p.escaped),podEscaped:game.finale?.pod.status==='escaped', lockdownHandled: overrideTried };
}

const only = Number(process.argv[2]);
const seeds = Number(process.argv[3]) || 12;
const sizes = only ? [only] : [1, 2, 3, 4, 5, 6, 7, 8];
console.log("players  win%   avg time  min oxygen  max flood  lost  seats  escaped  full%  (scripted sensible crew)");
let allGood = true;
for (const n of sizes) {
  const runs = Array.from({ length: seeds }, (_, i) => simulate(n, (process.env.START_SEED!==undefined?Number(process.env.START_SEED):1000+n) + i * 37));
  const wins = runs.filter((r) => r.win).length;
  const avg = (k) => runs.reduce((s, r) => s + r[k], 0) / runs.length;
  console.log(`${String(n).padStart(5)}   ${String(Math.round((wins / runs.length) * 100)).padStart(4)}%  ${String(Math.round(avg("time"))).padStart(6)}s  ${avg("minO2").toFixed(0).padStart(9)}%  ${avg("maxFlood").toFixed(2).padStart(9)}m  ${avg("lost").toFixed(1).padStart(4)}  ${String(runs[0].aboard ? "" : "").padStart(1)}${n < 4 ? n : [3, 4, 5, 6, 6][n - 4]}  ${avg('escaped').toFixed(1).padStart(5)}/${n}  ${Math.round(runs.filter(r=>r.allEscaped).length/runs.length*100).toString().padStart(4)}%`);
  if(process.env.BALANCE_REPORT){const reasons={};for(const r of runs.filter(r=>!r.win))reasons[r.reason||r.status]=(reasons[r.reason||r.status]||0)+1;console.log('        loss breakdown: '+JSON.stringify(reasons)+' / observed down contexts '+JSON.stringify(Object.fromEntries(['drownDowns','airDowns','impactDowns','otherDowns','evaDowns','evaAirDowns','evaContactDowns','electricDowns','skitterDowns'].map(k=>[k,+avg(k).toFixed(2)]))));}
  if(process.env.BALANCE_REPORT&&wins<runs.length)console.log('        example seeds: '+JSON.stringify(runs.filter(r=>!r.win).slice(0,3).map(r=>({seed:r.seed,stage:r.failureStage,reason:r.reason}))));
  if (wins / runs.length < 0.8) { allGood = false; const f = runs.find((r) => !r.win); console.log(`        e.g. a lost match: ${f.reason} (t=${f.time}s)`); }
}
void TUNING; void DEPT_IDS;
process.exit(allGood ? 0 : 1);
