// Identical terrain sampling for rendering, pressure limits and authoritative divers.
const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
const smooth=t=>t*t*(3-2*t),lerp=(a,b,t)=>(1-t)*a+t*b;
export function oceanNoise(x,z){const a=Math.floor(x),b=Math.floor(z),u=smooth(x-a),v=smooth(z-b);return lerp(lerp(hash(a,b),hash(a+1,b),u),lerp(hash(a,b+1),hash(a+1,b+1),u),v);}
export function oceanHeight(x,z){const shelf=smooth(Math.max(0,Math.min(1,(Math.max(Math.abs(x),Math.abs(z))-18)/18))),detail=oceanNoise(x*.16,z*.16)*.65+oceanNoise(x*.43,z*.43)*.15;return -.48+Math.sin(x*.9+z*.23)*.025-shelf*(2+oceanNoise(x*.035,z*.035)*7)+shelf*detail;}
export const DIVE_SPEED=1.4;
export function maximumDive(x,z){return Math.max(0,Math.min(10,-.12-oceanHeight(x,z)));}
export function suitDrain(x,z,depth=0){return 1+Math.max(0,Math.max(Math.abs(x),Math.abs(z))-20)/180+Math.max(0,depth)*.12;}
