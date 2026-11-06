import {moderationIdentity} from './moderation-ui.js';
export function createOnlineUi({net,socket,begin}){
  const $=id=>document.getElementById(id),root=$('online-panel'),content=$('online-content');let mode=null,persistent=false,boardTimer=null;
  const close=()=>{root.classList.add('hidden');mode=null;clearTimeout(boardTimer);if(root.contains(document.activeElement))document.activeElement.blur();};
  const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
  const status=message=>{$('online-status').textContent=message;};
  const filters=()=>({period:$('board-period').value,kind:$('board-kind').value,crewSize:Number($('board-crew').value)});
  const askBoard=()=>{if($('board-kind').value==='fastest'&&$('board-crew').value==='0')$('board-crew').value='1';status('Loading server results…');net.board(filters());};
  function open(next){mode=next;content.replaceChildren();$('online-title').textContent={rooms:'PUBLIC CREWS',stats:'YOUR EXPEDITION STATS',board:'SERVER LEADERBOARDS'}[next];$('board-filters').classList.toggle('hidden',next!=='board');root.classList.remove('hidden');status('Loading…');$('online-close').focus();if(next==='rooms')net.rooms();if(next==='stats')net.stats();if(next==='board')askBoard();}
  for(const id of ['browse-rooms','lobby-browse'])$(id).onclick=()=>open('rooms');
  for(const id of ['personal-stats','lobby-stats'])$(id).onclick=()=>open('stats');
  for(const id of ['leaderboards-open','lobby-boards'])$(id).onclick=()=>open('board');
  $('quick-match').onclick=()=>begin(name=>net.quick(name,'normal'));
  $('online-close').onclick=close;$('online-refresh').onclick=()=>{if(mode==='rooms')net.rooms();if(mode==='stats')net.stats();if(mode==='board')askBoard();};
  for(const id of ['board-period','board-kind','board-crew'])$(id).onchange=()=>{clearTimeout(boardTimer);boardTimer=setTimeout(askBoard,600);};
  root.addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();e.stopPropagation();close();}});
  socket.on('identity',profile=>{
    persistent=!!profile.persistence;moderationIdentity(profile.id,persistent);
    for(const id of ['personal-stats','lobby-stats','leaderboards-open','lobby-boards']){$(id).disabled=!persistent;$(id).title=persistent?'Server-owned completed-match records':'Persistence is not configured on this server.';}
    if(!$('player-name').value&&profile.name&&profile.name!=='Crew')$('player-name').value=profile.name;
  });
  socket.on('rooms:state',rooms=>{
    if(mode!=='rooms')return;if(rooms?.error){status(rooms.error);return;}content.replaceChildren();const inRoom=!$('lobby').classList.contains('hidden');status(inRoom?'Leave your current room to join another crew.':'Rooms on this server only. Private code rooms are not listed. Join requires a crew name.');
    if(!Array.isArray(rooms)||!rooms.length){content.append(text('p','No public rooms yet. Quick Match opens a public crew when needed.'));return;}
    const table=document.createElement('table'),head=document.createElement('tr');for(const title of ['CREW','DIFFICULTY','SEATS','PHASE',''])head.append(text('th',title));table.append(head);
    for(const room of rooms){const row=document.createElement('tr');for(const value of [room.name,room.difficulty,`${room.players}/${room.max}`,room.phase])row.append(text('td',value));const cell=document.createElement('td'),button=document.createElement('button');button.className='secondary small';button.textContent='JOIN';button.disabled=inRoom||room.phase!=='lobby'||room.players>=room.max;button.setAttribute('aria-label',`Join ${room.name}`);button.onclick=()=>{close();begin(name=>net.join(name,room.code));};cell.append(button);row.append(cell);table.append(row);}content.append(table);
  });
  socket.on('stats:state',data=>{
    if(mode!=='stats')return;content.replaceChildren();if(!data.supported||data.error){status(data.error||'Persistence is not configured on this server.');return;}
    status('Server-owned results. Private missions count here; training and interrupted matches do not.');
    const stats=data.stats||{},list=document.createElement('dl');list.className='stats-grid';
    for(const [label,value] of [['Anonymous ID',String(stats.id||'').slice(0,8)],['Matches',stats.matches],['Escapes',stats.escaped],['Tasks & treatment',stats.tasks],['Revives',stats.revives],['Times downed',stats.downs],['Time survived',`${Math.floor((stats.survived||0)/60)} min`]])list.append(text('dt',label),text('dd',String(value??0)));content.append(list);
  });
  socket.on('leaderboard:state',data=>{
    if(mode!=='board')return;content.replaceChildren();if(!data.supported||data.error){status(data.error||'Persistence is not configured on this server.');return;}
    if(data.filters&&JSON.stringify(data.filters)!==JSON.stringify(filters()))return;
    status('Completed public missions only. Weekly resets Monday 00:00 UTC. Fastest compares the selected crew size.');
    if(!data.entries?.length){content.append(text('p','No qualifying expeditions yet.'));return;}
    const table=document.createElement('table'),head=document.createElement('tr');for(const title of ['CREW ID','ESCAPES','REVIVES','FASTEST'])head.append(text('th',title));table.append(head);
    for(const entry of data.entries){const row=document.createElement('tr');for(const value of [`${entry.name} / ${String(entry.id).slice(0,8)}`,entry.escapes,entry.revives,entry.fastest===null?'—':`${entry.fastest}s`])row.append(text('td',String(value)));table.append(row);}content.append(table);
  });
  return {close};
}
