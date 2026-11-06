import assert from "node:assert/strict";
import { readFile,writeFile,mkdir } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { SOUNDS } from "../client/src/sound-catalog.js";
import { renderSound,encodeWav } from "../scripts/sound-design.mjs";
import { options,setOption,normalizeOptions } from "../client/src/options.js";
import { unlockAudio,setAudioEnvironment,setCaptionSink,setThreatAudio,setAudioListener,setCreatureContact,updateMovementAudio,createPodSound,sfx } from "../client/src/audio.js";
let checks=0;
const check=(name,value)=>{assert.ok(value,name);checks++;console.log(`PASS ${name}`);};
const clips=new Map();
for(const [name,spec] of Object.entries(SOUNDS)) {
  const samples=renderSound(name);clips.set(name,samples);
  let peak=0,power=0,mean=0;for(const v of samples) {peak=Math.max(peak,Math.abs(v));power+=v*v;mean+=v;}
  check(`${name}: finite non-silent samples with headroom`,samples.every(Number.isFinite) && peak<=.801 && Math.sqrt(power/samples.length)>.001 && Math.abs(mean/samples.length)<.00001);
  if(spec.loop) check(`${name}: continuous loop seam`,Math.abs(samples[0]-samples.at(-1))<.07);
  else check(`${name}: faded boundaries avoid clicks`,Math.abs(samples[0])<.01 && Math.abs(samples.at(-1))<.01);
  const installed=await readFile(new URL(`../client/public/audio/${name}.wav`,import.meta.url));
  check(`${name}: shipped WAV matches its authored source`,Buffer.compare(installed,Buffer.from(encodeWav(samples)))===0);
}
check("stored mix levels are bounded and old preferences receive defaults",normalizeOptions({masterVolume:200,ambienceVolume:-1,effectsVolume:"loud"}).masterVolume===1 && normalizeOptions({ambienceVolume:-1}).ambienceVolume===0 && normalizeOptions({}).effectsVolume===.85);

const dom=new JSDOM('<body></body>',{url:"http://localhost",pretendToBeVisual:true});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;
class Param { constructor(value=0){this.value=value;this.events=[];}setTargetAtTime(value){this.value=value;this.events.push(value);} }
class Node {
  constructor(type){this.type=type;this.gain=new Param(1);this.frequency=new Param();this.playbackRate=new Param(1);this.positionX=new Param();this.positionY=new Param();this.positionZ=new Param();this.edges=[];}
  connect(node){this.edges.push(node);}disconnect(){this.disconnected=true;}start(){this.started=true;}stop(){this.stopped=true;}
}
class Context {
  static current;
  constructor(){Context.current=this;this.currentTime=1;this.state="running";this.destination=new Node("destination");this.nodes=[];this.listener=Object.fromEntries(["positionX","positionY","positionZ","forwardX","forwardY","forwardZ","upX","upY","upZ"].map(n=>[n,new Param()]));}
  node(type){const node=new Node(type);this.nodes.push(node);return node;}
  createGain(){return this.node("gain");}createBiquadFilter(){return this.node("filter");}createPanner(){return this.node("panner");}createBufferSource(){return this.node("source");}
  createDynamicsCompressor(){const node=this.node("compressor");for(const n of ["threshold","knee","ratio","attack","release"])node[n]=new Param();return node;}
  async decodeAudioData(bytes){return {duration:(bytes.byteLength-44)/48000};}
}
window.AudioContext=Context;
const originalFetch=globalThis.fetch;let requests=0;
globalThis.fetch=async path=>{requests++;const bytes=await readFile(new URL(`../client/public${path}`,import.meta.url));return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
setAudioEnvironment({outside:true});await unlockAudio();const context=Context.current;
check('first audio unlock respects an existing underwater environment',context.nodes.some(n=>n.type==='lowpass'&&n.frequency.value===1800));setAudioEnvironment({outside:false});
check("local sound bank decodes without creating oscillators",requests===Object.keys(SOUNDS).length && context.nodes.every(n=>n.type!=="oscillator"));
await unlockAudio();check("a repeated gesture shares cached decoded audio",requests===Object.keys(SOUNDS).length);
const live=()=>context.nodes.filter(n=>n.type==="source" && n.started && !n.stopped);
setAudioEnvironment({active:true});setThreatAudio(75);
check("ambient beds share three bounded loop voices",live().filter(n=>n.loop).length===3);
const before=context.nodes.length;for(let i=0;i<100;i++)setAudioEnvironment({active:true});
check("unchanged frames cannot create new ambient voices",context.nodes.length===before);
let captions=[];setCaptionSink(text=>captions.push(text));setAudioListener(0,0,0);
sfx.impact({x:0,z:8});const count=live().length;sfx.impact({x:0,z:8});
check("impact cooldown prevents stacked identical hits",live().length===count);
check("important sounds retain spatial captions",captions.some(c=>c.includes("BEHIND YOU")));
check("positional impacts use an HRTF panner",context.nodes.some(n=>n.panningModel==="HRTF"));
const filter=context.nodes.filter(n=>n.type==="lowpass")[0];
setAudioEnvironment({outside:true});check("EVA muffles the effects bus",filter.frequency.value===1800);
setAudioEnvironment({outside:false});check("returning inside restores effects clarity",filter.frequency.value===6500);
const sourcesBefore=live().length;for(let i=0;i<30;i++)updateMovementAudio(0);
check("standing against a wall cannot produce footsteps",live().length===sourcesBefore);
for(let i=0;i<3;i++)updateMovementAudio(.5);
check("actual walking distance produces a footstep",live().length===sourcesBefore+1);
const pod=createPodSound();pod.update(3,true,.8);
check("pod propulsion uses separate mechanical and water loops",live().filter(n=>n.loop).length===5);
context.currentTime+=10;pod.update(3,true,.8);
const engineSource=live().filter(n=>n.loop).at(-2),engineGain=engineSource.edges[0],fullEngine=engineGain.gain.value;
sfx.lowAir();pod.update(3,true,.8);
check('critical warnings make room in the engine mix',engineGain.gain.value<fullEngine*.6);
const warningSource=live().filter(n=>!n.loop).at(-1);
check('suit alerts bypass exterior muffling',warningSource.edges[0].edges[0].edges[0]===firstMaster());
function firstMaster(){return context.nodes.find(n=>n.type==='gain');}
context.currentTime+=5;pod.update(3,true,.8);check('propulsion mix recovers after the warning',engineGain.gain.value===fullEngine);
pod.dispose();pod.dispose();check("pod audio disposal is safe to repeat",live().filter(n=>n.loop).length===3);
for(let i=0;i<100;i++){context.currentTime+=.1;sfx.flashlight();sfx.done();sfx.chat();}
check("bursts of actions cannot exceed twenty effect voices",live().filter(n=>!n.loop).length<=20);
context.currentTime+=5;sfx.lowAir();
check("priority warnings survive a full effect pool",live().filter(n=>!n.loop).some(n=>Math.abs(n.buffer.duration-SOUNDS.lowAir.seconds)<.0001));
const firstGain=context.nodes.find(n=>n.type==="gain");setOption("masterVolume",.3);
check("master volume applies immediately",firstGain.gain.value===.3);
setOption("sound",false);check("sound-off mutes the master bus",firstGain.gain.value===0);
const mutedCount=live().length;sfx.breach();check("muted effects remain captioned without spawning sound",live().length===mutedCount && captions.some(c=>c.includes("WATER POURING")));
setOption("sound",true);Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new window.Event("visibilitychange"));
check("hidden tabs mute audio immediately",firstGain.gain.value===0);
Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new window.Event("visibilitychange"));
check("visible tabs restore the saved mix",firstGain.gain.value===.3);
setCaptionSink(null);check("ending a match stops outstanding effects",live().every(n=>n.loop));
setAudioEnvironment({active:true,surface:true});
check("surface rescue replaces the underwater beds with wind and water",live().filter(n=>n.loop).length===4 && live().filter(n=>n.loop && n.edges[0].gain.value>0).length===1);
setCaptionSink(null);
check("the shared master has compression and a sub-bass filter",context.nodes.some(n=>n.type==="compressor" && n.ratio.value===6) && context.nodes.some(n=>n.type==="highpass" && n.frequency.value===28));
setAudioEnvironment({active:true,surface:false,pod:false,outside:false});setThreatAudio(80);
context.currentTime+=30;setCreatureContact({angle:0,dist:30,state:'approach'});
const creaturePanner=context.nodes.filter(n=>n.panningModel==='HRTF').at(-1),nodeCount=context.nodes.length;
setCreatureContact({angle:Math.PI/2,dist:22,state:'approach'});
check('playing creature calls follow the moving contact without new nodes',Math.abs(creaturePanner.positionX.value)<.001 && Math.abs(creaturePanner.positionZ.value-22)<.001 && context.nodes.length===nodeCount);
// Test Param nodes expose scheduled targets as values, so the target should be x=0,z=22.
context.currentTime+=2;
const ambientGains=live().filter(n=>n.loop).map(n=>n.edges[0]);
setCreatureContact({angle:0,dist:12,state:'attack'});
const hushed=ambientGains.map(n=>n.gain.value);
context.currentTime+=1.4;setCreatureContact({angle:0,dist:11,state:'attack'});
check('pre-strike hush recovers and cannot latch for the entire attack',ambientGains.some((n,i)=>n.gain.value>hushed[i]*3));
setCaptionSink(null);
globalThis.fetch=originalFetch;dom.window.close();for(const n of ["window","document","localStorage"])delete globalThis[n];

// Local audition reel for human review; these are the same shipped samples.
const rate=24000, reel=new Float32Array(rate*29);
for(const [name,at,gain] of [["station",0,.45],["done",1,.5],["door",3,.65],["hullGroan",5,.65],["creature",8,.65],["impact",12,.65],["sonarPing",16,.5],["engine",18,.5],["podBoost",19,.6],["alarm",23,.45]]) {
  const samples=clips.get(name),offset=at*rate;for(let i=0;i<samples.length && offset+i<reel.length;i++)reel[offset+i]+=samples[i]*gain;
}
await mkdir(new URL("./artifacts/",import.meta.url),{recursive:true});await writeFile(new URL("./artifacts/sound-preview.wav",import.meta.url),encodeWav(reel));
console.log(`${checks}/${checks} audio checks passed; audition reel: test/artifacts/sound-preview.wav`);
