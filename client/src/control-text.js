import {options} from './options.js';
const label=code=>code==='ShiftLeft'?'Shift':String(code).replace(/^Key/,'');
export function controlText(text,bindings=options.bindings){
 const keys={W:bindings.forward,S:bindings.back,A:bindings.left,D:bindings.right,E:bindings.interact,F:bindings.flashlight,Shift:bindings.sprint,SHIFT:bindings.sprint};
 return String(text).replace(/\bWASD\b|\b[WA]\/[SD]\b|\b(?:SHIFT|Shift|W|S|D|E|F)\b/g,key=>key==='WASD'?[bindings.forward,bindings.left,bindings.back,bindings.right].map(label).join('/') : key.includes('/')?key.split('/').map(k=>label(keys[k])).join('/') : label(keys[key]));
}
const defaultHintText=new WeakMap();
export function bindControlHints(root=document){
 const originals=new Map();for(const el of root.querySelectorAll('#controls,#pause .hint,#briefing .hint,.pod-flight-tools > span')){const walker=document.createTreeWalker(el,4);let node;while((node=walker.nextNode())){if(!defaultHintText.has(node))defaultHintText.set(node,node.nodeValue);originals.set(node,defaultHintText.get(node));}}
 return ()=>{for(const [node,value] of originals)node.nodeValue=controlText(value);};
}
