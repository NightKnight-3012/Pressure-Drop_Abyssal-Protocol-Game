// Paired simulator sensitivity test, not a claim about human survival rates.
import {simulate} from './balance.js';
const seeds=Number(process.argv[2]??12);
if(!Number.isInteger(seeds)||seeds<1||seeds>2000)throw Error('Seed count must be an integer from 1 to 2000.');
console.log('crew mode win% full% mean EVA downs blocked routes');
for(let crew=1;crew<=8;crew++)for(const movement of ['legacy','retreat','continuous']){
  const runs=Array.from({length:seeds},(_,i)=>simulate(crew,1000+crew+i*37,{movement,audit:true}));
  const mean=fn=>runs.reduce((sum,r)=>sum+fn(r),0)/seeds;
  console.log(JSON.stringify({crew,movement,seeds,winPercent:Math.round(mean(r=>r.win)*100),fullCrewPercent:Math.round(mean(r=>r.allEscaped)*100),evaDowns:+mean(r=>r.evaDowns).toFixed(2),blockedRoutes:runs.reduce((sum,r)=>sum+r.travel.blocked,0)}));
}
