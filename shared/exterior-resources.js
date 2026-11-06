// Near-hull and optional expedition moorings, clear of shared collision footprints.
export const RESOURCE_RANGE = 1.8;
export const RESOURCE_SITES = [
  {x:-14,z:10}, {x:-14,z:-10}, {x:-5,z:-15},
  {x:11,z:-14}, {x:15,z:10}, {x:3,z:15},
  {x:-38,z:8}, {x:38,z:0}, {x:0,z:-43}
];
export function createResources(scale,rng) {
  const sites=RESOURCE_SITES.map((point,i)=>({...point,site:i}));
  for(let i=sites.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[sites[i],sites[j]]=[sites[j],sites[i]];}
  const near=sites.findIndex(p=>p.x<-10&&Math.max(Math.abs(p.x),Math.abs(p.z))<=17);[sites[0],sites[near]]=[sites[near],sites[0]];
  const expedition=sites.findIndex(p=>Math.max(Math.abs(p.x),Math.abs(p.z))>24);[sites[1],sites[expedition]]=[sites[expedition],sites[1]];
  const supplies=['repair',...(rng()<.5?['flare','decoy']:['decoy','flare'])];
  return sites.slice(0,scale.maxBreaches).map((p,i)=>({id:`resource:${p.site}`,x:p.x,z:p.z,item:supplies[i%3]}));
}
