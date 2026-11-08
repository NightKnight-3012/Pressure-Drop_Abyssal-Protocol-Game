import assert from 'node:assert/strict';
import {createSurvivalAudit,summarizeSurvival} from '../server/scripts/survival-audit.js';
import {simulateEvacuation} from '../server/scripts/audit-evacuation.js';
import {createGame,tickGame} from '../server/game.js';
import {beginFinale} from '../server/finale.js';
const player=id=>({id,dept:'engineering',connected:true,hp:100,downed:false,lost:false,escaped:false,aboard:false});
const game=()=>({stage:'main',time:0,oxygen:100,rooms:{a:{flood:0},b:{flood:0}}});let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
check('loss phases distinguish early deaths, boarding losses and both finale routes',()=>{const a=createSurvivalAudit(),g=game(),p=Array.from({length:4},(_,i)=>player(String(i)));a.observe(g,p);p[0].downed=true;a.observe(g,p);p[0].lost=true;a.observe(g,p);g.stage='boarding';p[1].lost=true;a.observe(g,p);g.stage='finale';p[2].aboard=true;a.observe(g,p);p[2].lost=true;p[3].lost=true;g.stage='done';a.observe(g,p);const r=a.result(p);assert.deepEqual(r.losses,{main:1,vote:0,boarding:1,pod:1,station:1,exteriorFinale:0});assert.equal(r.downs.main,1);assert.equal(r.entries.finale.alreadyLost,2);assert.equal(r.finaleEntrantsSaved,false);});
check('pre-finale failure never masquerades as a capsule/pod death',()=>{const a=createSurvivalAudit(),g=game(),p=[player('a')];a.observe(g,p);const report=summarizeSurvival([{win:false,seed:1,survivalAudit:a.result(p)}]);assert.equal(report.failedBeforeFinale,1);assert.equal(report.reachedFinale,0);assert.equal(report.finaleEntry.averageNotLost,null);assert.equal(report.averageUnresolved,1);assert.equal(report.averageLosses.pod,0);});
check('saved finale entrants are separate from full starting-crew survival',()=>{const a=createSurvivalAudit(),g=game(),p=[player('a'),player('b')];a.observe(g,p);p[0].lost=true;a.observe(g,p);g.stage='finale';a.observe(g,p);p[1].escaped=true;a.observe(g,p);const r=summarizeSurvival([{win:true,seed:2,survivalAudit:a.result(p)}]);assert.equal(r.finaleEntry.allEntrantsSavedRuns,1);assert.equal(r.finaleEntry.intactCrewRuns,0);assert.equal(r.finaleEntry.averageAlreadyLost,1);});
check('diagnostics do not mutate authoritative inputs',()=>{const g=game(),p=[player('a')],before=JSON.stringify({g,p}),a=createSurvivalAudit();a.observe(g,p);a.result(p);assert.equal(JSON.stringify({g,p}),before);});
check('a casualty during the tick that launches the finale remains a boarding loss',()=>{const g=game(),p=[player('a')],a=createSurvivalAudit();g.stage='boarding';a.observe(g,p);g.stage='finale';p[0].lost=true;p[0].exterior=true;a.observe(g,p,'boarding');const r=a.result(p);assert.equal(r.losses.boarding,1);assert.equal(r.losses.exteriorFinale,0);assert.equal(r.entries.finale.alreadyLost,1);});
check('already-downed exterior crew do not masquerade as healthy capsule-route failures',()=>{const g=game(),p=[player('a'),player('b')],a=createSurvivalAudit();p[0].downed=true;p[0].exterior=true;a.observe(g,p);g.stage='finale';a.observe(g,p);p[0].lost=true;p[1].escaped=true;g.stage='done';a.observe(g,p);const r=summarizeSurvival([{win:true,seed:3,survivalAudit:a.result(p)}]);assert.equal(r.finaleEntry.intactCrewRuns,0);assert.equal(r.finaleEntry.averageDowned,1);assert.equal(r.averageLosses.exteriorFinale,1);assert.equal(r.averageLosses.station,0);});
check('healthy crews of every size have a real route to full extraction',()=>{for(let crew=1;crew<=8;crew++){const r=simulateEvacuation({crew,seed:9012,beaconSeconds:0});assert(r.fullEscape,JSON.stringify(r));assert.equal(r.status,'win');}});
check('default twelve-second beacon policy is reproducible without changing game tuning',()=>{assert.deepEqual(simulateEvacuation({crew:8,seed:9008}),simulateEvacuation({crew:8,seed:9008,beaconSeconds:12}));});
check('resolved finale distinguishes incapacitated exterior casualties from voluntary sacrifice',()=>{
  for(const kind of ['eva','volunteer','beacon','abandoned']){
    const players=[{id:'p',name:'Crew',dept:'eva',connected:true}],g=createGame({players,seed:52,now:0}),p=players[0];
    p.exterior=kind==='eva';p.downed=kind==='eva';p.volunteered=kind==='volunteer';
    beginFinale(g,players,[]);g.finale.station.status='lost';g.finale.pod.status='lost';p.lost=true;
    if(kind==='beacon')g.finale.history.stationHelpBy[p.id]=6;
    tickGame(g,players,100);
    assert.equal(p.ending,{eva:'eva_lost',volunteer:'last_stand',beacon:'beacon_sacrifice',abandoned:'abandoned'}[kind]);
  }
});
console.log(`${checks} survival-audit checks passed`);
