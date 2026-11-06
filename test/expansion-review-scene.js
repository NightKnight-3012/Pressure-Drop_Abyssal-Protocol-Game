// Private, deterministic visual fixtures. Never imported by the released game.
import * as THREE from 'three';
import {createEpilogue} from '../client/src/epilogue.js';
import {createPodView} from '../client/src/pod-view.js';
import {buildWorld} from '../client/src/world.js';
import {createGame,snapshotGame} from '../server/game.js';
import {beginFinale,finaleSnapshot} from '../server/finale.js';
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
document.getElementById('game').classList.remove('hidden');document.getElementById('game').append(renderer.domElement);
document.querySelectorAll('#game-hud > *').forEach(e=>e.style.visibility='hidden');document.getElementById('epilogue').style.visibility='visible';
let current=null,filmAt=0;
function clear(){current?.dispose();current=null;document.getElementById('epilogue').classList.add('hidden');}
export function ending(t) {
  if(current?.kind!=='ending'||t<filmAt){clear();current=createEpilogue({seed:1,mission:'blackout',crew:[{id:'a',name:'Mara',ending:'pod_escape'}],finale:{pod:'escaped',history:{}}},'a',()=>{});current.kind='ending';filmAt=0;}
  current.update(t-filmAt);filmAt=t;renderer.render(current.scene,current.camera);return info();
}
export function pod(progress=70,phase='run',ascent=.5) {
  clear();const players=[{id:'a',connected:true,dept:'engineering',name:'Mara'}],g=createGame({players,seed:8});players[0].aboard=true;beginFinale(g,players,[]);
  Object.assign(g.finale.pod,{progress,phase,lane:0,speed:3.7,hull:100,ascentSince:phase==='ascent'?0:null});g.time=ascent*12;
  g.finale.pod.route.forEach(r=>r.passed=r.at<progress);
  const f=finaleSnapshot(g);current=createPodView();current.kind='pod';for(let i=0;i<30;i++)current.update(f,.05,false,false,false);renderer.render(current.scene,current.camera);return info();
}
export function station(from,target,outside=false) {
  clear();const scene=new THREE.Scene();scene.background=new THREE.Color(0x03121b);scene.fog=new THREE.Fog(0x03121b,outside?20:10,outside?125:65);scene.add(new THREE.HemisphereLight(0x7aa8bc,0x0a1218,1.1));
  const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,180);camera.position.fromArray(from);camera.lookAt(...target);
  const lamp=new THREE.PointLight(0xc3d6d2,35,18);lamp.position.copy(camera.position);scene.add(lamp);
  const world=buildWorld(scene),g=createGame({players:[],seed:1});g.tasks.power.done=true;
  world.update(snapshotGame(g,[]),{dt:.016,time:20,now:Date.now(),reducedEffects:false,holdIds:new Set(),alert:0,viewer:camera.position,camera,flashlightOn:false});
  current={scene,camera,dispose:()=>world.dispose(),kind:'station'};renderer.render(scene,camera);return info();
}
export function redraw(){renderer.render(current.scene,current.camera);return info();}
export function info(){return {draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,camera:current.camera.position.toArray(),kind:current.kind};}
