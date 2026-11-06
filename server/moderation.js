// A deliberately small local word filter, not automated abuse adjudication.
const WORDS=/\b(fuck(?:ing|ed|er|s)?|shit(?:ty|head|s)?|bitch(?:es)?|asshole(?:s)?|cunt(?:s)?)\b/gi;
export function filterText(text){return text.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g,'').replace(WORDS,'[redacted]');}
export function cleanReport(reason){if(typeof reason!=='string')return null;const text=reason.replace(/[\u0000-\u001f\u007f]/g,' ').trim();return text.length>=1&&text.length<=240?text:null;}
export function rateGate(map,key,limit,windowMs,now=Date.now()){
  const recent=(map.get(key)||[]).filter(t=>now-t<windowMs);if(recent.length>=limit){map.set(key,recent);return false;}recent.push(now);map.set(key,recent);return true;
}
