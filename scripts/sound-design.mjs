// Offline sound design: filtered turbulence, inharmonic steel modes and pressure.
// No musical scales or pitch-stepped UI tones. Render once; the game plays buffers.
import { SOUNDS } from "../client/src/sound-catalog.js";

export function renderSound(name, rate=24000) {
  const spec=SOUNDS[name]; if(!spec) throw Error(`Unknown sound: ${name}`);
  const length=Math.ceil(spec.seconds*rate), data=new Float32Array(length);
  let seed=[...name].reduce((s,c)=>(Math.imul(s,31)+c.charCodeAt(0))>>>0,71);
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;};
  // Continuous noise states keep water and friction broad, rather than buzzy.
  let low=0, mid=0, deep=0;
  const modes=(t,frequencies,decay=2)=>frequencies.reduce((v,f,i)=>v+Math.sin(2*Math.PI*f*t+.15*i)*Math.exp(-t*(decay+i*.65))/(i+1),0);
  const pulse=(t,at,width)=>t<at?0:Math.exp(-(t-at)/width)*(1-Math.exp(-(t-at)*160));
  const steel=(t)=>modes(t,[63,107,181,293,457],1.7);
  for(let i=0;i<length;i++) {
    const t=i/rate, n=random(); low+=.035*(n-low); mid+=.19*(n-mid); deep+=.003*(n-deep);
    const grain=mid-low, rumble=deep*7, air=low*2.6;
    let v=0;
    switch(name) {
      case "station": v=rumble*.45+air*.08+(Math.sin(t*2*Math.PI*49)+.35*Math.sin(t*2*Math.PI*97))*.035*(.8+.2*Math.sin(t*2*Math.PI/8)); break;
      case "ocean": v=rumble*.65+air*.22*(.7+.3*Math.sin(t*2*Math.PI/8)); break;
      case "surface": v=air*.2*(.7+.3*Math.sin(t*2*Math.PI/8))+grain*.045+rumble*.1; break;
      case "tension": v=rumble*.45+Math.sin(t*2*Math.PI*31)*.06+Math.sin(t*2*Math.PI*46.75)*.035+grain*.02; break;
      case "engine": v=rumble*.4+air*.18+(Math.sin(t*2*Math.PI*38)+.32*Math.sin(t*2*Math.PI*76))*.13*(.8+.2*Math.sin(t*2*Math.PI*6)); break;
      case "rush": v=(air*.5+rumble*.28+grain*.12)*(.85+.15*Math.sin(t*2*Math.PI/6)); break;
      case "impact": v=pulse(t,0,.23)*(air*.65+rumble*.9)+steel(t)*.35+Math.sin(2*Math.PI*(42*t+1.3*Math.sin(t*3)))*Math.exp(-t*2.4)*.3+steel(Math.max(0,t-.17))*pulse(t,.17,.8)*.1; break;
      case "collision": v=steel(t)*.5+(air*.8+grain*.2)*pulse(t,0,.1)+modes(t,[149,239,397],5)*.15; break;
      case "hullGroan": {
        const env=Math.sin(Math.PI*t/spec.seconds)**2;
        v=env*(Math.sin(2*Math.PI*(48*t+.32*Math.sin(t*2)))*.25+Math.sin(2*Math.PI*(79*t+.7*Math.sin(t*.9)))*.12+air*.12+rumble*.45)+grain*pulse(t,1.7,.2)*.16; break;
      }
      case "creature": {
        const env=Math.sin(Math.PI*t/spec.seconds)**2, breath=air*(.6+.4*Math.sin(t*31)**2);
        v=env*(breath*.35+rumble*.45+Math.sin(2*Math.PI*(53*t+.8*Math.sin(t*1.8)))*.17*(.55+.45*Math.sin(t*37)**2)+Math.sin(2*Math.PI*(139*t+1.5*Math.sin(t*.6)))*.055); break;
      }
      case "breach": v=steel(t)*.26+(air*.5+grain*.24)*(pulse(t,0,.13)+Math.sin(Math.PI*t/spec.seconds)*.6)+rumble*.3*pulse(t,.15,1.1); break;
      case "door": v=(air*.4+grain*.12)*pulse(t,.08,.6)+steel(Math.max(0,t-1.05))*pulse(t,1.05,.3)*.55+steel(t)*.18; break;
      case "alarm": {
        const env=pulse(t,0,.55)+pulse(t,1.35,.55)+pulse(t,2.7,.55);
        v=env*(Math.sin(2*Math.PI*173*t)*.23+Math.sin(2*Math.PI*347*t)*.09+air*.1); break;
      }
      case "warning": v=(pulse(t,0,.25)+pulse(t,.55,.25))*(Math.sin(2*Math.PI*146*t)*.2+air*.15); break;
      case "lowAir": v=(pulse(t,0,.2)+pulse(t,.8,.2))*(Math.sin(2*Math.PI*237*t)*.18+grain*.08)+air*pulse(t,1.4,.15)*.13; break;
      case "down": v=air*pulse(t,0,.25)*.35+rumble*pulse(t,.1,.7)*.65+modes(t,[71,113,167],2)*.12; break;
      case "sonarPing": {
        const ping=s=>s<0?0:Math.sin(2*Math.PI*690*s)*Math.exp(-s*5)*(1-Math.exp(-s*200));
        v=(ping(t)+.32*ping(t-.24)+.17*ping(t-.57))*.35+air*pulse(t,0,.12)*.07; break;
      }
      case "done": v=grain*pulse(t,0,.012)*.7+modes(t,[122,211,354],16)*.17+air*pulse(t,.16,.15)*.2; break;
      case "flashlight": v=(n*.2+grain*.7)*pulse(t,0,.008)+modes(t,[231,473],45)*.09; break;
      case "holdStart": v=grain*pulse(t,0,.025)*.6+air*pulse(t,.06,.12)*.18; break;
      case "holdCancel": v=grain*pulse(t,0,.018)*.4; break;
      case "chat": v=grain*(pulse(t,0,.018)+pulse(t,.085,.025))*.32; break;
      case "error": v=air*pulse(t,0,.08)*.5+modes(t,[92,137],15)*.12; break;
      case "launch": v=air*pulse(t,0,.08)*.25+rumble*pulse(t,.2,1.2)*.4+(Math.sin(2*Math.PI*182*t)*.14+Math.sin(2*Math.PI*275*t)*.07)*pulse(t,.4,.6); break;
      case "podBoost": v=(air*.65+rumble*.7+grain*.2)*Math.sin(Math.PI*t/spec.seconds)**2; break;
      case "podPass": v=(air*.65+grain*.3)*Math.exp(-(((t-.45)/.23)**2)); break;
      case "win": v=(air*.25+rumble*.12)*(1-Math.exp(-t*2))*Math.exp(-t*.22)+grain*(pulse(t,.3,.03)+pulse(t,.5,.025))*.14; break;
      case "lose": v=rumble*Math.sin(Math.PI*t/spec.seconds)*.6+modes(t,[37,61.7,94.3],.8)*.12+air*pulse(t,.3,.8)*.14; break;
      case "step1": case "step2": v=air*pulse(t,0,.025)*.65+modes(t,name==="step1"?[87,156,262]:[92,163,271],16)*.24+grain*pulse(t,.035,.035)*.14; break;
      case "wetStep": v=air*pulse(t,0,.04)*.5+grain*pulse(t,.055,.12)*.4+modes(t,[86,173],18)*.16; break;
      case "swim": v=(air*.45+grain*.11)*Math.sin(Math.PI*t/spec.seconds)**2; break;
    }
    // Long fades remove clicks without flattening steel transients.
    const fadeIn=spec.loop?1:Math.min(1,t/.003), fadeOut=spec.loop?1:Math.min(1,(spec.seconds-t)/.14);
    data[i]=v*fadeIn*fadeOut;
  }
  if(spec.loop) {
    // Overlap the end into the beginning, preserving a continuous loop seam.
    const overlap=Math.floor(rate*.15), start=length-overlap;
    for(let i=0;i<overlap;i++) { const a=i/overlap; data[start+i]=data[start+i]*(1-a)+data[i]*a; }
    const loop=data.slice(overlap), correction=loop[0]-loop.at(-1);
    for(let i=0;i<64;i++) loop[loop.length-64+i]+=correction*(i/63)**2;
    return master(loop,true);
  }
  return master(data);
}
function master(data,loop=false) {
  const weight=i=>loop?1:Math.min(1,i/120,(data.length-1-i)/120);
  let mean=0,total=0;for(let i=0;i<data.length;i++){mean+=data[i];total+=weight(i);}mean/=total;
  let peak=0; for(let i=0;i<data.length;i++) {data[i]-=mean*weight(i);peak=Math.max(peak,Math.abs(data[i]));}
  const gain=Math.min(3,.8/Math.max(peak,.001));
  for(let i=0;i<data.length;i++) data[i]*=gain;
  return data;
}
export function encodeWav(samples,rate=24000) {
  const bytes=new ArrayBuffer(44+samples.length*2), view=new DataView(bytes);
  const ascii=(at,s)=>[...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
  ascii(0,"RIFF");view.setUint32(4,36+samples.length*2,true);ascii(8,"WAVE");ascii(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,"data");view.setUint32(40,samples.length*2,true);
  samples.forEach((v,i)=>view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,v))*32767),true));return new Uint8Array(bytes);
}
