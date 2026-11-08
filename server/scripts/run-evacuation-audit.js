import {simulateEvacuation} from './audit-evacuation.js';
const seeds=Number(process.argv[2])||20;let feasible=true;
if(!Number.isInteger(seeds)||seeds<1||seeds>2000)throw Error('Seed count must be an integer from 1 to 2000.');
console.log('Controlled healthy-entry audit: all systems repaired, 100 HP/air, dry rooms; scripted movement, no pre-finale damage.');
for(const crew of [1,2,3,4,5,6,7,8])for(const beaconSeconds of [0,12,24]){
  const runs=Array.from({length:seeds},(_,i)=>simulateEvacuation({crew,seed:9000+crew+i*37,beaconSeconds}));
  const full=runs.filter(r=>r.fullEscape).length;
  if(!full)feasible=false;
  console.log(JSON.stringify({crew,beaconSeconds,seeds,fullEscape:full,fullPercent:Math.round(full/seeds*100),averageEscaped:+(runs.reduce((n,r)=>n+r.escaped,0)/seeds).toFixed(2),failures:runs.filter(r=>!r.fullEscape).slice(0,2)}));
}
process.exitCode=feasible?0:1;
