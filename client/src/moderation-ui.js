const KEY='pressure-drop-muted';
let self=null,persistent=false,actions=null,target=null;
const valid=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(id);
const muted=new Set((()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value.filter(valid).slice(-100):[];}catch{return [];}})());
export const isMuted=id=>valid(id)&&muted.has(id);
export function toggleMute(id){
  if(!valid(id))return false;
  if(muted.has(id))muted.delete(id);else muted.add(id);
  while(muted.size>100)muted.delete(muted.values().next().value);
  try{localStorage.setItem(KEY,JSON.stringify([...muted]));}catch{}
  if(typeof document!=='undefined')document.dispatchEvent(new document.defaultView.Event('pressure-mute-change'));
  return muted.has(id);
}
export function moderationIdentity(id,supported){self=id;persistent=!!supported;}
export function openCrewControls(member){
  if(!actions||!member?.id)return;
  target=member;const root=document.getElementById('crew-controls');
  document.getElementById('crew-controls-name').textContent=member.name||'Crew member';
  document.getElementById('crew-controls-id').textContent=`ANONYMOUS ID / ${(member.profileId||member.id).slice(0,8)}`;
  document.getElementById('crew-mute').textContent=isMuted(member.profileId||member.id)?'UNMUTE CHAT':'MUTE CHAT';
  document.getElementById('crew-report-reason').value='';document.getElementById('crew-report-status').textContent=persistent?'Reports go to this server’s operator for review.':'Reporting is unavailable on this server. Local mute still works.';
  document.getElementById('crew-report').disabled=!persistent||member.profileId===self;
  document.body.classList.add('crew-controls-open');root.classList.remove('hidden');
  if(document.pointerLockElement)document.exitPointerLock?.();document.getElementById('crew-mute').focus();
}
export function initModerationUi(net){
  actions=net;const root=document.getElementById('crew-controls');
  const close=()=>{root.classList.add('hidden');document.body.classList.remove('crew-controls-open');if(root.contains(document.activeElement))document.activeElement.blur();};
  document.getElementById('crew-controls-close').onclick=close;
  document.getElementById('crew-mute').onclick=()=>{if(!target)return;const on=toggleMute(target.profileId||target.id);document.getElementById('crew-mute').textContent=on?'UNMUTE CHAT':'MUTE CHAT';};
  document.getElementById('crew-report').onclick=()=>{if(!target)return;const reason=document.getElementById('crew-report-reason').value.trim();if(!reason){document.getElementById('crew-report-status').textContent='Enter a reason before reporting.';return;}document.getElementById('crew-report-status').textContent='Saving report…';net.report(target.id,reason);};
  root.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();e.stopPropagation();close();}});
  return {close,notice(data){document.getElementById('crew-report-status').textContent=data.message||'Report response received.';}};
}
