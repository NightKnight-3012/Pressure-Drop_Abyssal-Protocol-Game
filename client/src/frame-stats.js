// Rolling browser-frame measurements, kept local and bounded.
export function createFrameStats(){
 let samples=[],elapsed=0;
 return {sample(seconds,active=true){if(!active){samples=[];elapsed=0;return null;}if(!Number.isFinite(seconds)||seconds<=0||seconds>2)return null;samples.push(seconds);if(samples.length>240)samples.shift();elapsed+=seconds;if(elapsed<1)return null;elapsed=0;const sorted=[...samples].sort((a,b)=>a-b),total=samples.reduce((a,b)=>a+b,0);return {fps:Math.round(samples.length/total),p95:Math.round(sorted[Math.ceil(sorted.length*.95)-1]*1000)};}};
}
