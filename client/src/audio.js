import { options, onOptionsChange } from "./options.js";
import { SOUNDS } from "./sound-catalog.js";

let ctx=null, master=null, effects=null, ambience=null, communications=null, muffler=null, captionSink=null;
const SUIT_CUES=new Set(['alarm','warning','lowAir','down','launch','chat','sonarPing']);
let loadTask=null, threat=0, duckUntil=0, environment={active:false,outside:false,underwater:false,pod:false,surface:false};
const buffers=new Map(), voices=new Set(), beds=new Map(), cooldowns=new Map(), podMixes=new Set();
let listenerPosition={x:0,z:0}, listenerYaw=0, stepDistance=0, stepIndex=0;
let contactPosition=null, contactState=null, hushUntil=0, nextCallAt=0;
const clamp=(v,a=0,b=1)=>Number.isFinite(v)?Math.max(a,Math.min(b,v)):a;
const targets=new WeakMap();
const gainTo=(node,value,seconds=.15)=>{if(node && targets.get(node)!==value) {targets.set(node,value);node.gain.setTargetAtTime(value,ctx.currentTime,seconds);}};

function applyMix() {
  if(!ctx) return;
  gainTo(master,options.sound && !document.hidden ? options.masterVolume : 0,.035);
  gainTo(effects,options.effectsVolume,.05); gainTo(ambience,options.ambienceVolume,.1);
  gainTo(communications,options.effectsVolume,.05);
}
onOptionsChange(applyMix);

export function setAudioListener(x,z,yaw) {
  listenerPosition={x,z};listenerYaw=yaw;
  if(!ctx?.listener.positionX) return;
  const l=ctx.listener;
  l.positionX.value=x;l.positionY.value=1.65;l.positionZ.value=z;
  l.forwardX.value=-Math.sin(yaw);l.forwardY.value=0;l.forwardZ.value=-Math.cos(yaw);
  l.upX.value=0;l.upY.value=1;l.upZ.value=0;
}
export function setCaptionSink(fn) {
  captionSink=fn;
  if(!fn) {
    environment.active=false;environment.surface=false;stepDistance=0;threat=0;
    contactPosition=null;contactState=null;hushUntil=0;nextCallAt=0;
    for(const voice of [...voices]) stopVoice(voice);
    for(const pod of podMixes) pod.dispose();
    for(const bed of beds.values()) gainTo(bed.gain,0,.12);
    cooldowns.clear();duckUntil=0;
  }
}
export function unlockAudio() {
  try {
    if(!ctx) {
      const Constructor=window.AudioContext||window.webkitAudioContext;if(!Constructor) return;
      ctx=new Constructor();master=ctx.createGain();master.gain.value=0;
      const highpass=ctx.createBiquadFilter();highpass.type="highpass";highpass.frequency.value=28;
      const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=12;limiter.ratio.value=6;limiter.attack.value=.006;limiter.release.value=.25;
      effects=ctx.createGain();ambience=ctx.createGain();communications=ctx.createGain();muffler=ctx.createBiquadFilter();muffler.type="lowpass";muffler.frequency.value=environment.outside||environment.underwater?1800:6500;
      effects.connect(muffler);muffler.connect(master);ambience.connect(master);master.connect(highpass);highpass.connect(limiter);limiter.connect(ctx.destination);
      communications.connect(master);
      document.addEventListener("visibilitychange",applyMix);applyMix();
    }
    if(ctx.state==="suspended") ctx.resume()?.catch?.(()=>{});
    return preloadAudio();
  } catch { return Promise.resolve(); }
}
export function preloadAudio() {
  if(!ctx) return Promise.resolve();
  if(loadTask) return loadTask;
  const names=Object.keys(SOUNDS).filter(name=>!buffers.has(name));
  // A small worker pool bounds concurrent asset requests and decoding work.
  loadTask=(async()=>{
    await Promise.all(Array.from({length:3},async()=>{
      while(names.length) {
        const name=names.shift();
        try {
          const base=import.meta.env?.BASE_URL||"/", response=await fetch(`${base}audio/${name}.wav`);
          if(!response.ok) throw Error(`Missing audio: ${name}`);
          buffers.set(name,await ctx.decodeAudioData(await response.arrayBuffer()));
        } catch { /* Missing audio never interrupts play; the next gesture retries. */ }
      }
    }));
    updateBeds();
  })().finally(()=>{loadTask=null;});return loadTask;
}
function stopVoice(voice) {
  if(voice.closed) return;voice.closed=true;
  try {voice.source.stop();} catch {}
  voice.source.disconnect();voice.gain.disconnect();voice.panner?.disconnect();voices.delete(voice);
}
function play(name,position,volume=1,rate=1) {
  const spec=SOUNDS[name], buffer=buffers.get(name);
  if(!spec || !buffer || !options.sound || !ctx || ctx.state!=="running" || document.hidden) return;
  const now=ctx.currentTime;
  if(now-(cooldowns.get(name)??-Infinity)<(spec.cooldown||0)) return;
  if(voices.size>=20) {
    const discard=[...voices].find(v=>v.priority<(spec.priority||0));
    if(!discard) return;stopVoice(discard);
  }
  cooldowns.set(name,now);
  const source=ctx.createBufferSource(), gain=ctx.createGain();source.buffer=buffer;source.playbackRate.value=clamp(rate,.75,1.3);gain.gain.value=spec.gain*clamp(volume,0,1.5);
  source.connect(gain);
  let panner;
  if(position && Number.isFinite(position.x) && Number.isFinite(position.z)) {
    panner=ctx.createPanner();panner.panningModel="HRTF";panner.distanceModel="inverse";panner.refDistance=7;panner.maxDistance=65;panner.rolloffFactor=.7;
    panner.positionX.value=position.x;panner.positionY.value=2;panner.positionZ.value=position.z;
    gain.connect(panner);panner.connect(effects);
  } else gain.connect(SUIT_CUES.has(name)?communications:effects);
  const voice={source,gain,panner,name,priority:spec.priority||0};voices.add(voice);source.onended=()=>stopVoice(voice);source.start();
  if((spec.priority||0)>=2||name==='launch')duckUntil=Math.max(duckUntil,now+Math.min(3,spec.seconds));
  else if(name==='chat')duckUntil=Math.max(duckUntil,now+.45);
}
function loop(name,bus) {
  if(!buffers.has(name)) return null;
  const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffers.get(name);source.loop=true;gain.gain.value=0;source.connect(gain);gain.connect(bus);source.start();return {source,gain};
}
function updateBeds() {
  if(!ctx) return;
  const active=environment.active && !document.hidden;
  if(active && options.sound) for(const name of ["station","ocean","tension"]) if(!beds.has(name)) {const bed=loop(name,ambience);if(bed) beds.set(name,bed);}
  if(active && options.sound && environment.surface && !beds.has("surface")) {const bed=loop("surface",ambience);if(bed) beds.set("surface",bed);}
  const duck=ctx.currentTime<hushUntil ? .09 : ctx.currentTime<duckUntil ? .6 : 1;
  for(const [name,bed] of beds) {
    let level=0;
    if(environment.surface) level=name==="surface"?1:0;
    else if(name==="station") level=!environment.outside && !environment.pod ? .8 : 0;
    else if(name==="ocean") level=environment.outside?1:environment.pod ? .22 : .16;
    else if(name==="tension") level=threat*.65;
    gainTo(bed.gain,active?SOUNDS[name].gain*level*duck:0,.65);
  }
}
export function setThreatAudio(value) { threat=clamp(value/100);updateBeds(); }
// Follow the authoritative contact, including already playing calls. No new
// looping source per frame, and pre-strike quiet affects ambience, never alarms.
export function setCreatureContact(contact) {
  if(!contact || !Number.isFinite(contact.angle) || !Number.isFinite(contact.dist)) {contactPosition=null;contactState=null;hushUntil=0;return;}
  contactPosition={x:Math.cos(contact.angle)*contact.dist,z:Math.sin(contact.angle)*contact.dist};
  if(ctx && environment.active && !environment.pod && !environment.surface) {
    if(contact.state==='attack' && contactState!=='attack')hushUntil=ctx.currentTime+1.2;
    for(const voice of voices)if(voice.name==='creature' && voice.panner){voice.panner.positionX.setTargetAtTime(contactPosition.x,ctx.currentTime,.15);voice.panner.positionZ.setTargetAtTime(contactPosition.z,ctx.currentTime,.15);}
    if(contact.state!=='attack' && contact.state!=='retreat' && contact.dist<44 && ctx.currentTime>=nextCallAt) {
      nextCallAt=ctx.currentTime+(contact.state==='patrol'?23:14);
      cue('creature',`[DISTANT CREATURE CALL${direction(contactPosition).toUpperCase()}]`,contactPosition);
    }
  }
  contactState=contact.state;updateBeds();
}
export function setAudioEnvironment(value) {
  const wasMuffled=environment.outside||environment.underwater;
  environment={...environment,...value};
  const isMuffled=environment.outside||environment.underwater;
  if(muffler && wasMuffled!==isMuffled) muffler.frequency.setTargetAtTime(isMuffled?1800:6500,ctx.currentTime,.4);
  updateBeds();
}
export function updateMovementAudio(distance,{active=true,running=false,swimming=false,wet=false}={}) {
  if(!active || !environment.active) {stepDistance=0;return;}
  stepDistance+=clamp(distance,0,.6);
  const stride=swimming?1.7:running?1.65:1.35;
  if(stepDistance<stride) return;stepDistance%=stride;stepIndex++;
  play(swimming?"swim":wet?"wetStep":stepIndex%2?"step1":"step2",null,running?1:.72,1+(stepIndex%3-1)*.035);
}
export function createPodSound() {
  let engine=null,rush=null,registered=false;
  const mix={
    update(speed,boost,danger) {
      if(!ctx) return;
      speed=clamp(speed,0,8);danger=clamp(danger);
      if(speed>0 && options.sound) {
        engine??=loop("engine",effects);rush??=loop("rush",effects);
        if(!registered) {podMixes.add(mix);registered=true;}
      }
      const on=speed>0 && environment.active && !document.hidden;
      const space=ctx.currentTime<duckUntil ? .55 : 1;
      gainTo(engine?.gain,on?SOUNDS.engine.gain*(.35+speed*.09)*space:0,.22);
      gainTo(rush?.gain,on?SOUNDS.rush.gain*(speed*.16+(boost ? .22 : 0)+danger*.1)*space:0,.22);
      if(engine) engine.source.playbackRate.setTargetAtTime(.85+speed*.07+(boost ? .08 : 0),ctx.currentTime,.3);
      if(rush) rush.source.playbackRate.setTargetAtTime(.9+speed*.05,ctx.currentTime,.3);
    },
    dispose() { for(const voice of [engine,rush]) if(voice) {try {voice.source.stop();}catch{} voice.source.disconnect();voice.gain.disconnect();} engine=rush=null;podMixes.delete(mix);registered=false; }
  };return mix;
}
const caption=text=>{if(options.captions && captionSink) captionSink(text);};
const direction=position=>{
  if(!position) return "";
  const dx=position.x-listenerPosition.x,dz=position.z-listenerPosition.z;
  const side=Math.cos(listenerYaw)*dx-Math.sin(listenerYaw)*dz,forward=-Math.sin(listenerYaw)*dx-Math.cos(listenerYaw)*dz;
  return Math.abs(side)<1?forward<0?" behind you":" ahead":side<0?" to your left":" to your right";
};
function cue(name,text,position) { play(name,position);if(text) caption(text); }
export const sfx={
  drowning:()=>cue('lowAir','[HELMET AIR LOW / REACH A DRY COMPARTMENT]'),
  subHatch:position=>cue('door','[SURVEY SUB HATCH / PRESSURE SEAL]',position),
  subEngine:position=>cue('podBoost','[SURVEY SUB THRUSTERS / ENGINE NOISE CARRIES THROUGH WATER]',position),
  hazardImpact:(text,position)=>cue('impact',text,position),
  recover:position=>cue('holdStart','[SEALED SUPPLY CANISTER OPENED / EQUIPMENT RECOVERED]',position),
  supply:position=>cue('holdStart','[SUPPLY DRAWER / SHARED EQUIPMENT TAKEN]',position),
  listening:position=>cue('hullGroan',`[SLOW SCRAPING${direction(position).toUpperCase()} / STAY QUIET]`,position),
  equipment:(item,position)=>{
    const cues={prod:['sonarPing','[EVA SONIC PROD / SMALL CREATURES STUNNED]'],emp:['sonarPing','[EMP DISCHARGE / LOCAL LIGHTS INTERRUPTED]'],clamp:['holdStart','[PIPE CLAMP SEATED / TEMPORARY LEAK CONTROL]'],trauma:['holdCancel','[TRAUMA KIT / RESCUE WINDOW EXTENDED]'],repair:['holdStart','[REPAIR FOAM APPLIED]'],flare:['breach','[FLARE HISSES / ACOUSTIC RISK]'],decoy:['sonarPing','[ACOUSTIC LURE PULSING / MOVE AWAY QUIETLY]'],
      welder:['holdStart','[WELDER ARC / LOUD WHILE PATCHING]'],scanner:['sonarPing','[CREW ACTIVE SCANNER / LAST-KNOWN CONTACT SHARED]'],
      oxygen:['holdCancel','[EMERGENCY AIR CANISTER RELEASE]'],return:['flashlight','[EVA HOME MARKER / AIRLOCK BEARING SHARED]']};
    const c=cues[item];if(c)cue(c[0],c[1],position);
  },
  podBoost:()=>cue("podBoost","[POD THRUSTERS SURGING]"),podPass:()=>cue("podPass","[WRECKAGE RUSHES PAST]"),
  flashlight:()=>cue("flashlight"),holdStart:()=>cue("holdStart"),holdCancel:()=>cue("holdCancel"),done:()=>cue("done"),
  impact:position=>cue("impact",`[THE LEVIATHAN SLAMS INTO THE HULL${direction(position).toUpperCase()}]`,position),
  collision:()=>cue("collision","[WRECKAGE STRIKES THE POD HULL]"),launch:()=>cue("launch","[EVACUATION SIGNAL / BOARD THE TRANSFER POD]"),
  warning:()=>cue("warning"),sonarPing:()=>cue("sonarPing","[SONAR RETURN]"),
  hullGroan:position=>cue("hullGroan",`[PRESSURE GROAN${direction(position).toUpperCase()} / CONTACT CLOSE]`,position),
  creature:position=>{const p=position||contactPosition;cue("creature",`[LOW CREATURE CALL${direction(p).toUpperCase()}]`,p);},
  alarm:()=>cue("alarm","[LOCKDOWN SIREN / BLAST DOORS CLOSING]"),door:()=>cue("door","[HYDRAULICS / DOOR OR CLAMP ENGAGING]"),
  breach:position=>cue("breach",`[HULL BREACH${direction(position).toUpperCase()} / WATER POURING IN]`,position),
  down:()=>cue("down","[CREW DISTRESS / SUIT PRESSURE ALERT]"),lowAir:()=>cue("lowAir","[LOW OXYGEN WARNING]"),
  win:()=>cue("win","[SURFACE WATER / RESCUE RADIO CARRIER]"),lose:()=>cue("lose","[PRESSURE SETTLING / SIGNAL LOST]"),
  chat:()=>cue("chat"),error:()=>cue("error")
};
