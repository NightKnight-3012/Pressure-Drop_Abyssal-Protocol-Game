import {LOCKERS} from '../../shared/layout.js';
import {ITEMS,ITEM_LIMIT} from '../../shared/items.js';
import {RECIPES} from '../../shared/fieldwork.js';

export function createLockerPanel(take,closed,craft=()=>{}) {
  const root=document.getElementById('locker-panel'),list=document.getElementById('locker-stock');
  let id=null,key='';
  const close=()=>{id=null;key='';if(root.contains(document.activeElement))document.activeElement.blur();root.classList.add('hidden');document.body.classList.remove('locker-open');};
  document.getElementById('locker-close').onclick=closed;
  return {
    open(locker) {id=locker;key='';root.classList.remove('hidden');document.body.classList.add('locker-open');},
    close,
    update(state,me) {
      if(!id)return;
      const stock=state.lockers?.[id]||{},free=me?.inventory?.filter(i=>i===null).length||0;
      const next=JSON.stringify([id,stock,me?.inventory,me?.lockerReadyIn,me?.craftReadyIn,state.power]);if(key===next)return;key=next;
      const focused=list.contains(document.activeElement)?document.activeElement.dataset.item:null;
      document.getElementById('locker-title').textContent=LOCKERS[id].label;
      document.getElementById('locker-capacity').textContent=`${free}/${ITEM_LIMIT} FREE SLOTS / STOCK SHARED BY THE CREW`;
      document.getElementById('locker-note').textContent=me?.lockerReadyIn ? `DISPENSING / READY IN ${me.lockerReadyIn}s` : !Object.values(stock).some(n=>n>0) ? 'Stores exhausted. These supplies do not regenerate.' : !free ? 'Inventory full. Put down selected gear with Backspace or use a tool; taking never replaces carried gear.' : 'Choose one supply. It fills your first empty slot. Stock resets next match.';
      list.replaceChildren(...Object.entries(stock).map(([item,count])=>{
        const button=document.createElement('button');button.className='secondary locker-item';button.dataset.item=item;
        button.textContent=`${ITEMS[item].label} / ${count} LEFT / TAKE 1`;
        button.title=ITEMS[item].help;button.disabled=!count||!free||!!me?.lockerReadyIn;
        button.onclick=()=>take(id,item);return button;
      }));
      if(id==='engineering'){
        const alloy=me?.inventory?.filter(i=>i==='scrap').length||0;
        if(alloy)document.getElementById('locker-note').textContent=`FABRICATION / ${alloy} ALLOY. Recipes replace material slots; other carried gear stays. Requires station power.`;else document.getElementById('locker-note').textContent+=' Fabricate tools here with recovered alloy.';
        for(const [recipe,def] of Object.entries(RECIPES)){
          if(def.role&&def.role!==me?.dept)continue;
          const button=document.createElement('button');button.className='secondary locker-item';button.dataset.recipe=recipe;button.textContent=`FABRICATE ${ITEMS[def.item].label.toUpperCase()} / ${def.cost} ALLOY (${alloy} CARRIED)`;button.title=ITEMS[def.item].help;button.disabled=!state.power||alloy<def.cost||!!me?.craftReadyIn;button.onclick=()=>craft(recipe);list.append(button);
        }
      }
      if(focused)(list.querySelector(`button[data-item="${focused}"]:not(:disabled)`)||list.querySelector('button:not(:disabled)')||document.getElementById('locker-close')).focus();
    },
    dispose() {close();list.replaceChildren();document.getElementById('locker-close').onclick=null;}
  };
}
