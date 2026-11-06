import {LOGS} from '../../shared/story.js';
const KEY='pressure-drop-case-file';
export function readEvidence(storage=globalThis.localStorage) {
  try {const ids=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(ids)?[...new Set(ids.filter(id=>LOGS.some(l=>l.id===id)))]:[];}catch{return [];}
}
export function saveEvidence(ids,storage=globalThis.localStorage) {
  const found=[...new Set([...readEvidence(storage),...ids])].filter(id=>LOGS.some(l=>l.id===id));
  try{storage.setItem(KEY,JSON.stringify(found));}catch{}return found;
}
export function openCaseFile() {
  const found=readEvidence(),list=document.getElementById('case-list');list.replaceChildren();
  for(const log of LOGS){const article=document.createElement('article'),title=document.createElement('h3'),text=document.createElement('p');title.textContent=found.includes(log.id)?log.title:'SEALED / EVIDENCE NOT RECOVERED';text.textContent=found.includes(log.id)?log.text:'Find record terminals in the station and survey area. Your crew shares recovered evidence.';article.append(title,text);list.append(article);}
  document.getElementById('case-file').classList.remove('hidden');document.getElementById('case-close').focus();
}
