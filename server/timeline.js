const descriptions = {
  subBoarded:e=>`Survey sub ${e.seat} boarded`,subDocked:()=> 'Survey sub docked and crew transferred inside',subRepaired:()=> 'Survey sub hull repaired',subDestroyed:()=> 'Survey sub lost; emergency hatch released',subPilot:()=> 'Survey pilot controls transferred',subFlare:()=> 'Survey sub flare launched',subScan:()=> 'Survey sub contact scan shared',
  crafted:e=>`${e.item} fabricated from salvaged alloy`,scrapRecovered:()=> 'Salvaged alloy recovered',circuit:e=>`${e.room} local circuit ${e.on?'restored':'isolated'}`,
  hazardWarning:e=>`${e.kind} hazard signalled${e.room?' in '+e.room:''}`,mineBlast:()=> 'Drifting mine detonated',wardenStrike:e=>`Light-hunting contact struck ${e.room}`,
  storyLog: ()=> 'Station evidence recovered',
  salvageRecovered: ()=>'Wreck pump regulator recovered',
  salvageInstalled: ()=>'Salvaged regulator installed: pump flow +20 points',
  salvageReturned: ()=>'Lost regulator returned to the wreck recovery cradle',
  resourceRecovered: e=>`Exterior ${e.item==='repair'?'repair kit':e.item==='flare'?'flare':'acoustic lure'} recovered`,
  lockerTake: e=>`Shared ${e.item === 'repair' ? 'repair kit' : e.item === 'decoy' ? 'acoustic lure' : 'flare'} taken from ${e.locker} stores`,
  pumpClog: () => 'Pump filter obstructed — flow reduced', pumpService: () => 'Filter cleared — pump output improved',
  listening: () => 'Leviathan made a listening pass',
  task: e => `${e.label} restored`, patched: () => 'Hull breach sealed',
  impact: e => `Leviathan struck ${e.room}`, down: () => 'Crew member downed',
  revive: () => 'Crew member revived', lost: () => 'Crew signal lost',
  lockdown: () => 'Emergency lockdown', lockdownEnd: () => 'Lockdown lifted',
  item: e => ({ repair:'Repair kit committed to a breach', flare:'Flare ignited — acoustic risk', decoy:'Acoustic lure deployed',
    welder:'Noisy weld committed to a breach', scanner:'Active scan shared — last-known contact',
    oxygen:'Emergency air canister used', return:'Airlock home marker broadcast' })[e.item] || 'Equipment used',
  decoy: () => 'Command launched an acoustic decoy', escape: () => 'Launch sequence started',
  boarded: () => 'Strapped into the escape pod', finale: () => 'Pod released',
  beacon: e => `Station beacon ${e.active ? 'activated' : 'stopped'}`,
  diversion: e => `Pod diversion ${e.accepted ? 'approved' : 'declined'}`,
  capsuleEscape: () => 'Maintenance capsule escaped', podSecured: () => 'Recovery cradle secured',
  podOutcome: e => `Pod ${e.status === 'escaped' ? 'reached recovery' : 'signal lost'}`
};
// Called by rules and network dispatch. The same event object is only recorded once.
export function recordEvents(game, players, events) {
  game.recordedEvents ??= new WeakSet();
  game.timeline ??= [];
  for (const e of events) {
    if (!descriptions[e.type] || game.recordedEvents.has(e)) continue;
    game.recordedEvents.add(e);
    const actor = players.find(p => p.id === (e.by || e.id));
    game.timeline.push({ t: Math.floor(game.time), text: descriptions[e.type](e), actor: actor?.name || null });
    if (game.timeline.length > 160) game.timeline.shift();
  }
}
