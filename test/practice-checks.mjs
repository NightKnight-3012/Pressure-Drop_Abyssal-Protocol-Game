import assert from 'node:assert/strict';
import {createGame,startHold,tickGame,useItem,buildSummary} from '../server/game.js';
import {STATIONS} from '../shared/layout.js';
import {FINALE_POINTS} from '../shared/tactical.js';
import {PRACTICE_STEPS,practiceGuidance,practiceTargetAllowed} from '../shared/practice.js';
import {calibrate,driveFinale} from '../server/scripts/crew-driver.js';
import {saveEnding} from '../client/src/epilogue.js';
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
function setup(options={}){const players=[{id:'learner',name:'Learner',dept:'engineering',connected:true}],game=createGame({players,practice:true,seed:17,now:0,...options});return {players,game,p:players[0]};}
function tick(s,seconds=.25){for(let i=0;i<seconds*4;i++)tickGame(s.game,s.players,s.game.lastTick+250);}
function hold(s,id){const st=STATIONS[id]||s.game.breaches.find(b=>b.id===id)||FINALE_POINTS[id];if(!st)throw Error('Missing test target '+id);Object.assign(s.p,{x:st.x+(st.rot?Math.sin(st.rot)*1.2:0),z:st.z+(st.rot!==undefined?Math.cos(st.rot)*1.2:1)});calibrate(s.game,s.p,id);assert.equal(startHold(s.game,s.players,s.p,id),null,id);const h=s.game.holds.get(s.p.id);if(h)tick(s,h.need+.25);}
check('practice requires an explicit solo flag and does not alter ordinary matches',()=>{assert(setup().game.practice);assert.equal(setup({practice:'yes'}).game.practice,null);const players=[{id:'a',connected:true,dept:'eva'},{id:'b',connected:true,dept:'medical'}];assert.equal(createGame({players,practice:true}).practice,null);assert.equal(setup({practice:false}).game.practice,null);});
check('practice safety disables random hazards and lore farming while keeping real interactions',()=>{const s=setup();assert.equal(s.game.story.available.length,0);assert(s.game.threats.mines.every(m=>!m.active));assert(s.game.nextBreachAt>1e6);assert(startHold(s.game,s.players,s.p,'power'));assert.equal(s.game.tasks.power.done,false);});
check('tutorial steps wait for actual server progress rather than client acknowledgements',()=>{const s=setup();tick(s,2);assert.equal(s.game.practice.step,'move');s.p.x+=2.2;tick(s);assert.equal(s.game.practice.step,'power');tick(s,2);assert.equal(s.game.practice.step,'power');assert(practiceGuidance({practice:{step:'power'}}).includes('Power core'));});
check('one learner completes repairs, outside work and real pod docking without another player',()=>{
  const s=setup();s.p.x+=2.2;tick(s);hold(s,'power');assert.equal(s.game.practice.step,'patch');assert(s.game.breaches.some(b=>b.id==='breach:practice'));
  hold(s,'breach:practice');assert.equal(s.game.practice.step,'tool');assert.equal(useItem(s.game,s.players,s.p,0),null);tick(s);assert.equal(s.game.practice.step,'systems');assert.equal(s.p.inventory[0],null);
  for(const id of ['pump','console','lifesupport'])hold(s,id);assert.equal(s.game.practice.step,'outside');
  hold(s,'airlock_in');assert(s.p.exterior);for(const id of s.game.activeJunctions)hold(s,id);assert.equal(s.game.practice.step,'return');hold(s,'airlock_out');assert(!s.p.exterior);assert.equal(s.game.practice.step,'launch');
  hold(s,'launch');assert.equal(s.game.stage,'boarding');Object.assign(s.p,{x:FINALE_POINTS.board.x,z:FINALE_POINTS.board.z});assert.equal(startHold(s.game,s.players,s.p,'board'),null);tick(s,4);
  for(let i=0;i<2400&&s.game.status==='playing';i++){driveFinale(s.game,s.players);tick(s);}
  assert.equal(s.game.status,'win');assert.equal(s.game.finale.pod.status,'escaped');assert.equal(s.game.practice.step,'complete');assert.equal(s.game.outcome.practiceComplete,true);assert.equal(s.game.outcome.practice,true);assert(s.game.timeline.some(e=>e.text.includes('restored')));
});
check('training reserve prevents health loss while real suit and flood meters still operate',()=>{const s=setup();s.game.rooms.control.flood=3.5;s.game.oxygen=0;s.p.hp=50;s.p.exterior=true;s.p.x=0;s.p.z=-43;s.p.suit=0;tick(s,2);assert.equal(s.p.hp,50);assert(s.p.suit>19);assert(s.game.rooms.control.flood<1);assert(s.game.oxygen>99);});
check('training progress is stored separately from real expedition endings',()=>{const s=setup(),outcome=buildSummary(s.game,s.players,'win','test');outcome.practiceComplete=true;const values=new Map();const old=globalThis.localStorage;globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};try{const copy=saveEnding(outcome,s.p.id);assert.equal(copy.title,'RECOVERY DRILL COMPLETE');assert.equal(values.get('pressure-drop-practice-complete'),'true');assert(!values.has('pressure-drop-crew-log'));}finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}});
check('every training stage has plain-language guidance and no numbered data entry can complete it',()=>{assert.equal(Object.keys(PRACTICE_STEPS).length,10);for(const step of Object.keys(PRACTICE_STEPS))assert(practiceGuidance({practice:{step}}).length>30);const s=setup();assert(startHold(s.game,s.players,s.p,'practice:complete'));assert.equal(s.game.practice.step,'move');});
check('lesson prompts hide unrelated optional switches until the learner is ready',()=>{assert(practiceTargetAllowed('power','power'));assert(!practiceTargetAllowed('power','circuit:control'));assert(!practiceTargetAllowed('move','power'));assert(practiceTargetAllowed('outside','j1'));assert(!practiceTargetAllowed('outside',null));assert(practiceTargetAllowed(null,'circuit:control'));});
console.log(`${count} solo practice checks passed`);
