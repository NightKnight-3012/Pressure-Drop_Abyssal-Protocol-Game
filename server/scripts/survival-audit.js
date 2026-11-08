// Read-only simulator diagnostics. Never consumed by authoritative gameplay.
const emptyLosses=()=>({main:0,vote:0,boarding:0,pod:0,station:0,exteriorFinale:0});
const route=(phase,p)=>phase==='finale'?(p.aboard?'pod':p.exterior?'exteriorFinale':'station'):phase;
export function createSurvivalAudit(){
  const previous=new Map(),entries={},losses=emptyLosses(),downs=emptyLosses();let lastPhase='main',finaleIds=null;
  return {
    observe(game,players,phaseBeforeTick){
      const phase=game.stage==='done'?lastPhase:game.stage;lastPhase=phase;
      const lossPhase=phaseBeforeTick||phase;
      if(!entries[phase]){
        entries[phase]={time:+game.time.toFixed(1),notLost:players.filter(p=>!p.lost).length,active:players.filter(p=>!p.lost&&!p.downed&&p.connected).length,downed:players.filter(p=>p.downed&&!p.lost).length,alreadyLost:players.filter(p=>p.lost).length,pod:players.filter(p=>p.aboard&&!p.lost).length,station:players.filter(p=>!p.aboard&&!p.lost).length,oxygen:+game.oxygen.toFixed(1),maxFlood:+Math.max(...Object.values(game.rooms).map(r=>r.flood)).toFixed(2)};
        if(phase==='finale'){finaleIds=players.filter(p=>!p.lost).map(p=>p.id);entries[phase].crew=players.map(p=>({id:p.id,dept:p.dept,hp:+p.hp.toFixed(1),downed:p.downed,lost:p.lost,exterior:p.exterior,aboard:p.aboard}));}
      }
      for(const p of players){const old=previous.get(p.id)||{lost:false,downed:false},key=route(lossPhase,p);
        if(p.lost&&!old.lost)losses[key]=(losses[key]||0)+1;
        if(p.downed&&!old.downed)downs[key]=(downs[key]||0)+1;
        previous.set(p.id,{lost:p.lost,downed:p.downed});
      }
    },
    result(players){return {entries,losses:{...losses},downs:{...downs},finaleEntrantsSaved:finaleIds===null?null:finaleIds.every(id=>players.find(p=>p.id===id)?.escaped),unresolved:players.filter(p=>!p.escaped&&!p.lost).length,endings:players.map(p=>({id:p.id,escaped:!!p.escaped,lost:!!p.lost,ending:p.ending||null}))};}
  };
}
export function summarizeSurvival(runs){
  const audits=runs.map(r=>r.survivalAudit),finales=audits.filter(a=>a.entries.finale),intact=finales.filter(a=>a.entries.finale.alreadyLost===0&&a.entries.finale.downed===0);
  const mean=(list,fn)=>list.length?+(list.reduce((n,a)=>n+fn(a),0)/list.length).toFixed(2):null;
  return {matches:runs.length,reachedFinale:finales.length,failedBeforeFinale:runs.filter(r=>!r.win&&!r.survivalAudit.entries.finale).length,
    finaleEntry:{averageNotLost:mean(finales,a=>a.entries.finale.notLost),averageAlreadyLost:mean(finales,a=>a.entries.finale.alreadyLost),averageDowned:mean(finales,a=>a.entries.finale.downed),intactCrewRuns:intact.length,intactCrewAllEscaped:intact.filter(a=>a.finaleEntrantsSaved).length,allEntrantsSavedRuns:finales.filter(a=>a.finaleEntrantsSaved).length},
    averageLosses:Object.fromEntries(Object.keys(emptyLosses()).map(k=>[k,mean(audits,a=>a.losses[k])])),
    averageDowns:Object.fromEntries(Object.keys(emptyLosses()).map(k=>[k,mean(audits,a=>a.downs[k])])),
    averageUnresolved:mean(audits,a=>a.unresolved),
    examples:runs.filter(r=>r.survivalAudit.entries.finale&&!r.survivalAudit.finaleEntrantsSaved).slice(0,3).map(r=>({seed:r.seed,entry:r.survivalAudit.entries.finale,endings:r.survivalAudit.endings}))};
}
