// Simulator-only travel. Uses the same bounds, circle radius and swept collision as the server.
import {EXT_SOLIDS,EXT_LIMIT,PLAYER_RADIUS,SWIM_SPEED,pathBlocked,collides} from '../../shared/layout.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=EXT_LIMIT-PLAYER_RADIUS&&Math.abs(p.z)<=EXT_LIMIT-PLAYER_RADIUS&&!collides(p.x,p.z,PLAYER_RADIUS,[],true);
export function exteriorLineClear(a,b){
  if(!valid(a)||!valid(b))return false;
  // Keep each query inside pathBlocked's bounded substep count.
  const count=Math.max(1,Math.ceil(distance(a,b)/40));let previous=a;
  for(let i=1;i<=count;i++){const next={x:a.x+(b.x-a.x)*i/count,z:a.z+(b.z-a.z)*i/count};if(pathBlocked(previous.x,previous.z,next.x,next.z,PLAYER_RADIUS,[],true))return false;previous=next;}
  return true;
}
let graph=null;const goals=new Map();
function navigation(){
  if(graph)return graph;
  const points=[],seen=new Set(),margin=PLAYER_RADIUS+.05;
  for(const box of EXT_SOLIDS)for(const x of [box.minX-margin,box.maxX+margin])for(const z of [box.minZ-margin,box.maxZ+margin]){const p={x,z},key=x+':'+z;if(valid(p)&&!seen.has(key)){points.push(p);seen.add(key);}}
  const edges=points.map(()=>[]);
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(exteriorLineClear(points[i],points[j])){const d=distance(points[i],points[j]);edges[i].push([j,d]);edges[j].push([i,d]);}
  graph={points,edges};return graph;
}
function goalRoutes(target){
  const key=target.x+':'+target.z;if(goals.has(key))return goals.get(key);
  const {points,edges}=navigation(),cost=points.map(p=>exteriorLineClear(p,target)?distance(p,target):Infinity),next=points.map(()=>-1),visited=new Set();
  for(let step=0;step<points.length;step++){
    let current=-1;for(let i=0;i<points.length;i++)if(!visited.has(i)&&(current<0||cost[i]<cost[current]))current=i;
    if(current<0||!Number.isFinite(cost[current]))break;visited.add(current);
    for(const [neighbor,d] of edges[current])if(cost[current]+d<cost[neighbor]){cost[neighbor]=cost[current]+d;next[neighbor]=current;}
  }
  const result={cost,next};if(goals.size>=8)goals.delete(goals.keys().next().value);goals.set(key,result);return result;
}
export function exteriorRoute(start,target){
  if(!valid(start)||!valid(target))return null;
  if(exteriorLineClear(start,target))return {points:[{...start},{...target}],distance:distance(start,target)};
  const {points}=navigation(),{cost,next}=goalRoutes(target);let first=-1,total=Infinity;
  for(let i=0;i<points.length;i++){const candidate=distance(start,points[i])+cost[i];if(candidate<total&&exteriorLineClear(start,points[i])){first=i;total=candidate;}}
  if(first<0)return null;
  const route=[{...start}];for(let i=first,steps=0;i>=0;steps++){if(steps>points.length)throw Error('Navigation cycle');route.push({...points[i]});i=next[i];}route.push({...target});
  return {points:route,distance:total};
}
export function createExteriorTravel(start,target,time,reaction=2){
  const route=exteriorRoute(start,target);if(!route||!Number.isFinite(time)||!Number.isFinite(reaction)||reaction<0)return null;
  return {route,readyAt:time+reaction,updatedAt:time,segment:1,speed:SWIM_SPEED};
}
export function advanceExteriorTravel(player,travel,time){
  if(!Number.isFinite(time)||time<travel.updatedAt)return {arrived:false,blocked:false,moved:0};
  let budget=Math.max(0,Math.min(.25,time-Math.max(travel.updatedAt,travel.readyAt)))*travel.speed,moved=0;travel.updatedAt=time;
  while(travel.segment<travel.route.points.length){
    const target=travel.route.points[travel.segment],d=distance(player,target);
    if(d<1e-8){travel.segment++;continue;}if(budget<=0)break;
    const step=Math.min(d,budget),point={x:player.x+(target.x-player.x)*step/d,z:player.z+(target.z-player.z)*step/d};
    if(!exteriorLineClear(player,point))return {arrived:false,blocked:true,moved};
    player.x=point.x;player.z=point.z;moved+=step;budget-=step;if(d-step<1e-8)travel.segment++;
  }
  return {arrived:travel.segment>=travel.route.points.length,blocked:false,moved};
}
