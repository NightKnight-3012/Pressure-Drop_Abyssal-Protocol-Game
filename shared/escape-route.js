const points=[[0,0,2.1],[34,-10,2.6],[76,14,4.2],[119,-14,2.4],[161,10,3.6],[198,0,2.1],[210,0,2.1]];
export function routeFrame(progress) {
  const p=Math.max(0,Math.min(210,progress));let i=0;while(i<points.length-2&&p>points[i+1][0])i++;
  const [a,x,y]=points[i],[b,nx,ny]=points[i+1],t=(p-a)/(b-a),s=t*t*(3-2*t),d=6*t*(1-t)/(b-a);
  return {x:x+(nx-x)*s,y:y+(ny-y)*s,yaw:-Math.atan2((nx-x)*d,6),pitch:Math.atan2((ny-y)*d,6)};
}
export function routeChapter(progress) {
  return progress<42?'DEPARTURE / SEVERED LIFT ARRAY':progress<91?'COLLAPSE FIELD / FALLING HULL SECTIONS':progress<145?'THE FISSURE / BROKEN SURVEY CONDUIT':progress<198?'RIDGE RUN / AUXILIARY RECOVERY LINE':'ASTERION / ARMORED RECOVERY CRADLE';
}
export function createRoute(rng) {
  return Array.from({length:14},(_,i)=>({at:18+i*12,lane:[-1,0,1][Math.floor(rng()*3)],kind:i%4===2?'falling':'wreck',passed:false}));
}
export function collapseLabel(at){return at<70?'LIFT GANTRY':at<115?'WRECK BULKHEAD':'SURVEY CONDUIT';}
export function approachingCollapse(route,progress){return route.find(g=>g.kind==='falling'&&!g.passed&&g.at>=progress&&g.at-progress<=13)||null;}
