// Presentation metadata only. The server owns quantities, cooldowns and effects.
export const ITEM_LIMIT = 4;
export const ITEMS = Object.freeze({
  scrap:{label:'Salvaged alloy',symbol:'S',help:'One inventory slot of material. Fabricate tools at the powered Engineering stores.'},
  prod:{label:'Sonic prod',symbol:'P',help:'EVA: stun nearby skitters for 10s. One charge. Cannot kill the Leviathan.'},
  emp:{label:'EMP charge',symbol:'EMP',help:'Command: stun small creatures, disarm nearby mines and interrupt the Warden for 8s. Local lighting goes dark. One charge.'},
  clamp:{label:'Pipe clamp',symbol:'C',help:'Engineering: hold E at a breach, then use. Stops that leak for 20s; still needs patching. One clamp.'},
  trauma:{label:'Trauma kit',symbol:'+',help:'Medical: while reviving a downed crewmate, extend their rescue window by up to 20s. One kit.'},
  regulator: { label:'Pump regulator', symbol:'R', help:'Wreck salvage. Carry inside, then hold E at the repaired Engineering pump. Adds 20 percentage points of drainage. Takes one slot.' },
  flare: { label: 'Flare', symbol: '✦', help: 'Light your position for 24s. The hiss attracts the Leviathan.' },
  decoy: { label: 'Acoustic lure', symbol: '◎', help: 'Draw the Leviathan toward this position for 10s. Move away quietly.' },
  repair: { label: 'Repair kit', symbol: '▧', help: 'While holding E at a breach: halve the remaining patch time.' },
  welder: { label: 'Welder', symbol: '⚒', help: 'Engineering: hold E at a breach, then use. Much faster, but loud. One patch.' },
  scanner: { label: 'Scanner', symbol: '⌖', help: 'Command: share a last-known contact for 6s. The active pulse makes noise. One scan.' },
  oxygen: { label: 'Air canister', symbol: 'O₂', help: 'Medical: +12% station air inside, or +30s suit air outside. One canister.' },
  return: { label: 'Home marker', symbol: '⌂', help: 'EVA: broadcast the airlock bearing to outside crew for 60s. One battery. Not an obstacle-free path.' }
});
