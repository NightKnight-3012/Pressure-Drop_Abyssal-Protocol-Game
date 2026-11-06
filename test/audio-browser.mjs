// Real Chrome decoding/playback and offline mixing; no production debug API.
import { spawn } from "node:child_process";
import http from "node:http";
import { readFile,mkdir,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "vite";
import { SOUNDS } from "../client/src/sound-catalog.js";
const output=await build({configFile:false,logLevel:"error",build:{write:false,minify:false,lib:{entry:resolve("client/src/audio.js"),name:"AudioCheck",formats:["iife"]}}});
const script=(Array.isArray(output)?output[0]:output).output.find(o=>o.type==="chunk").code;
const html='<!doctype html><body>Audio verification<script>window.nativeContext=new AudioContext();window.AudioContext=function(){return nativeContext;};window.voices=[];const nativeSource=nativeContext.createBufferSource.bind(nativeContext);nativeContext.createBufferSource=()=>{const source=nativeSource();voices.push(source);return source;};</script><script src="/audio.js"></script>';
const server=http.createServer(async(req,res)=>{
  if(req.url==="/"){res.setHeader("Content-Type","text/html");return res.end(html);}
  if(req.url==="/audio.js"){res.setHeader("Content-Type","application/javascript");return res.end(script);}
  if(!/^\/audio\/[a-zA-Z0-9]+\.wav$/.test(req.url)){res.writeHead(404);return res.end();}
  try{res.setHeader("Content-Type","audio/wav");res.end(await readFile(resolve("client/public","."+req.url)));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(3997,"127.0.0.1",r));
const chrome=spawn(process.env.BROWSER_BIN||"C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless","--no-sandbox","--autoplay-policy=no-user-gesture-required","--no-first-run","--no-default-browser-check","--remote-debugging-port=9226",`--user-data-dir=${resolve("test/.audio-profile")}`,"about:blank"],{windowsHide:true,stdio:"ignore"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try {
  let pages;for(let i=0;i<50;i++){try{pages=await(await fetch("http://127.0.0.1:9226/json")).json();break;}catch{await sleep(100);}}
  if(!pages)throw Error("Audio review Chrome did not start");
  ws=new WebSocket(pages.find(p=>p.type==="page").webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let seq=0;const pending=new Map(),errors=[];
  ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);}if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.text);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout ${method}`));},20000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await call("Runtime.enable");await call("Page.navigate",{url:"http://127.0.0.1:3997"});
  for(let i=0;i<50;i++){if(await evaluate("typeof AudioCheck!=='undefined'"))break;await sleep(100);}
  await evaluate("window.sampleNames="+JSON.stringify(Object.keys(SOUNDS)));
  const result=await evaluate(`(async()=>{
    await AudioCheck.unlockAudio();const decoded=[];
    for(const name of sampleNames)decoded.push(await nativeContext.decodeAudioData(await(await fetch('/audio/'+name+'.wav')).arrayBuffer()));
    AudioCheck.setCaptionSink(t=>(window.captions??=[]).push(t));
    AudioCheck.setAudioEnvironment({active:true,outside:false});AudioCheck.setThreatAudio(80);
    AudioCheck.setAudioListener(0,0,0);AudioCheck.sfx.impact({x:0,z:8});AudioCheck.sfx.creature();AudioCheck.sfx.done();AudioCheck.sfx.sonarPing();
    const pod=AudioCheck.createPodSound();pod.update(3,true,.5);
    const playing=voices.length;await new Promise(r=>setTimeout(r,100));pod.dispose();AudioCheck.setCaptionSink(null);
    const offline=new OfflineAudioContext(1,48000*4,48000),compressor=offline.createDynamicsCompressor();compressor.threshold.value=-14;compressor.ratio.value=6;compressor.connect(offline.destination);
    for(const name of ['impact','breach','hullGroan','creature','alarm']){const source=offline.createBufferSource(),gain=offline.createGain();source.buffer=decoded[sampleNames.indexOf(name)];gain.gain.value=.2;source.connect(gain);gain.connect(compressor);source.start(0);}
    const rendered=await offline.startRendering(),data=rendered.getChannelData(0);let peak=0,power=0;for(const v of data){peak=Math.max(peak,Math.abs(v));power+=v*v;}
    return {decoded:decoded.length,state:nativeContext.state,playing,caption:captions.some(t=>t.includes('BEHIND YOU')),peak,rms:Math.sqrt(power/data.length),finite:data.every(Number.isFinite),sizes:decoded.every(b=>b.length>1000)};
  })()`);
  if(result.decoded!==Object.keys(SOUNDS).length||result.state!=="running"||result.playing<9||!result.caption||!result.finite||!result.sizes||result.peak>=1||result.rms<.001||errors.length)throw Error(JSON.stringify({result,errors}));
  await mkdir(resolve("test/artifacts"),{recursive:true});await writeFile(resolve("test/artifacts/audio-browser.json"),JSON.stringify(result,null,2));
  console.log(`PASS real Chrome: ${result.decoded} WAVs decoded, spatial/loop playback, captions and offline mix (peak ${result.peak.toFixed(3)}, RMS ${result.rms.toFixed(3)})`);
} finally {
  try{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({id:999999,method:"Browser.close"}));}catch{}
  await sleep(150);ws?.close();chrome.kill();server.close();
}
