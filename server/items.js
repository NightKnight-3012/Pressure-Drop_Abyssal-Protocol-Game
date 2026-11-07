// Definitions are separate from the pure game rules; clients cannot choose these values.
export const ITEM_TUNING = Object.freeze({
  cooldown: 3, dropCooldown:1, pickupSeconds:1, dropsPerCrew:4, flareSeconds: 24, flareNoise: 1.4, lureSeconds: 10,
  lureCooldown: 16, repairFactor: .5, maxEffects: 8,
  welderFactor: .35, welderNoise: 2.8,
  scanSeconds: 6, scanCooldown: 25, scanPulseSeconds: 1.5, scanNoise: 3.5,
  stationAir: 12, suitAir: 30, markerSeconds: 60, minRepairRemaining: .25, lockerCooldown: 1
});
export const ROLE_ITEMS = Object.freeze({ engineering:'welder', command:'scanner', medical:'oxygen', eva:'return' });
export const ITEM_ROLES = Object.freeze({...Object.fromEntries(Object.entries(ROLE_ITEMS).map(([role,item]) => [item,role])),prod:'eva',emp:'command',clamp:'engineering',trauma:'medical'});
export const startingInventory = dept => ['flare', 'decoy', 'repair', Object.hasOwn(ROLE_ITEMS,dept) ? ROLE_ITEMS[dept] : null];
export const lockerStock = scale => ({
  engineering: { flare:Math.max(1,scale.junctions-1), repair:Math.ceil(scale.maxBreaches/2) },
  medical: { decoy:Math.max(1,scale.junctions-1), repair:1 }
});
