// Original evidence from NEREID-9. Content stays separate from game rules.
export const LOGS = [
  {id:'arrival',title:'Transfer manifest',x:-6,z:-6,ext:false,text:'NEREID-9 received a replacement crew, not a rescue team. The last transfer left its seats empty. Asterion asked us to call it a scheduling error.'},
  {id:'pulse',title:'Unscheduled pulse',x:-7,z:-4,ext:false,text:'The trench answered the calibration tone three seconds before we transmitted it. Command ordered a second test. We unplugged the recorder instead.'},
  {id:'filter',title:'Filter shift',x:6,z:-6,ext:false,text:'There are pale fibres in the pump intake again. They tighten around warm pipes. Stop running the intake tests after midnight. It follows the machinery.'},
  {id:'reserve',title:'Power ledger',x:7,z:-4,ext:false,text:'Emergency capsule reserve can run the beacon or warm the pressure seals. It cannot do both forever. Tell the next shift before anyone calls that a design flaw.'},
  {id:'sleep',title:'Medical observation',x:-6,z:6,ext:false,text:'Crew hear scraping in their sleep. No infection found. The marks on the exterior match the rhythm of their breathing. I have asked for the night lights to stay on.'},
  {id:'names',title:'Names, not numbers',x:-8,z:4,ext:false,text:'Command requested a survival estimate. I sent the crew roster. If someone stays behind, remember a person made that choice. Do not write acceptable loss on my report.'},
  {id:'seats',title:'Seat inspection',x:6,z:6,ext:false,text:'The transfer pod was rated before the cargo conversion. The extra seats never arrived. The capsule rack in Control is real. Keep its seals dry and its batteries charged.'},
  {id:'surface',title:'Asterion carrier',x:8,z:4,ext:false,text:'We can hear you through the hull. Our winch cannot reach your station now. The auxiliary cradle beyond the wreck still has power. Bring us a sealed vehicle. Keep talking.'},
  {id:'wreck',title:'Survey vessel black box',x:38,z:12,ext:true,text:'We shut down the engine and it passed beneath us. Then the deck lamps came on. There was a second shape below the first. It turned toward the light.'},
  {id:'garden',title:'Field notebook',x:-38,z:5.5,ext:true,text:'The vent fans close before the calls arrive. This is not an empty ocean. Leave a quiet way home. The posts are navigation markers, not protection.'},
  {id:'cleft',title:'Last cable check',x:0,z:-35,ext:true,text:'The cable did not snap. Something pulled it down, slowly, while our load meter stayed green. I have left the junctions near the hull. Nobody should need to come this far for a repair.'},
  {id:'hull',title:'Unsent message',x:-18,z:10,ext:true,text:'I used to think getting out meant being saved. Now I want to know who is still listening when we reach the surface. If you find this, keep their names.'}
];
export const LOG_RANGE=1.7;
export function storySelection(rng) {
  const groups=[LOGS.filter(l=>!l.ext),LOGS.filter(l=>l.ext)];
  return groups.flatMap((group,index)=>{const copy=[...group];for(let i=copy.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy.slice(0,index?2:3).map(l=>l.id);});
}
export function storyEnding(game,players) {
  const escaped=players.filter(p=>game.finale?p.escaped:p.aboard);
  if(!escaped.length)return {id:'silence',title:'The interrupted record',text:'No ascent signal reached Asterion. The station record ends below the light.'};
  if(players.some(p=>p.leftBehind&&!p.escaped))return {id:'witness',title:'A name on the radio',text:'Asterion recovered survivors. Someone remained below. The final watch is recorded by name.'};
  if((game.story?.found.length||0)>=3)return {id:'evidence',title:'The sealed case',text:'The crew reached recovery with evidence from NEREID-9. Asterion can no longer call the previous crew a scheduling error.'};
  return {id:'survivors',title:'An open frequency',text:'The crew escaped. Questions remain in the station. Asterion keeps the frequency open.'};
}
