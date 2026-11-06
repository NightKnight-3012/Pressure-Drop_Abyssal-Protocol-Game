import {spawn} from 'node:child_process';
import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {build} from 'vite';
const out=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:resolve('test/expansion-review-scene.js'),name:'ExpansionReview',formats:['iife']}}});
const bundle=(Array.isArray(out)?out[0]:out).output.find(x=>x.type==='chunk').code;
let html=await readFile('client/dist/index.html','utf8');html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>','<script src="/review.js"></script></body>');
html=html.replace('</head>','<style>#menu,#lobby,#connection-overlay{display:none!important}canvas{display:block}</style></head>');
const server=http.createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
  if(req.url==='/review.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle);}
  const path=new URL(req.url,'http://localhost').pathname;
  if(path.includes('..')){res.writeHead(403);return res.end();}
  try{const data=await readFile(resolve('client/dist','.'+path));res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.gltf':'model/gltf+json','.glb':'model/gltf-binary','.wav':'audio/wav'}[extname(path)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}
});await new Promise(r=>server.listen(4001,'127.0.0.1',r));
const chrome=spawn(process.env.BROWSER_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--no-default-browser-check','--remote-debugging-port=9227',`--user-data-dir=${resolve('test/.expansion-profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;const report=[];
try {
  let pages;for(let i=0;i<200;i++){try{pages=await(await fetch('http://127.0.0.1:9227/json')).json();break;}catch{await sleep(200);}}
  if(!pages)throw Error('Review Chrome unavailable');ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let seq=0;const pending=new Map(),errors=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout: '+method));},60000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
  await call('Runtime.enable');await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:'http://127.0.0.1:4001'});
  for(let i=0;i<200;i++){if(await evaluate('typeof ExpansionReview!=="undefined"'))break;await sleep(100);}
  const shots=[
    ['station-service-loop','ExpansionReview.station([-6,1.65,-3.4],[-5.2,1.7,2])'],
    ['medical-sign-fixed','ExpansionReview.station([-5.8,1.65,6],[-5.8,3.2,2.03])'],
    ['station-pressure-hull','ExpansionReview.station([-16,7,12],[0,3,0],true)'],
    ['escape-collapse-field','ExpansionReview.pod(68)'],
    ['escape-fissure','ExpansionReview.pod(111)'],
    ['lift-ascent-open-shaft','ExpansionReview.pod(210,"ascent",.65)'],
    ['rescue-shaft','ExpansionReview.ending(2)'],
    ['rescue-ascent-cable','ExpansionReview.ending(7)'],
    ['rescue-surface-emergence','ExpansionReview.ending(13.8)'],
    ['rescue-sling','ExpansionReview.ending(18.5)'],
    ['rescue-deck','ExpansionReview.ending(25.5)']
  ];
  await mkdir('test/artifacts',{recursive:true});
  for(const [name,expression] of shots){await evaluate(expression);await sleep(800);const stats=await evaluate('ExpansionReview.redraw()');const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`test/artifacts/${name}.png`,Buffer.from(shot.data,'base64'));report.push({name,...stats});console.log('PASS rendered '+name+' / '+stats.draws+' draws');}
  if(errors.length)throw Error(errors.join('\n'));await writeFile('test/artifacts/expansion-review.json',JSON.stringify(report,null,2));console.log(`${report.length} expansion screenshots rendered without JavaScript errors.`);
} finally {try{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({id:999999,method:'Browser.close'}));}catch{}await sleep(200);ws?.close();chrome.kill();server.close();}
