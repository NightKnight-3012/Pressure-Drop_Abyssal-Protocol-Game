import {controlText} from './control-text.js';
import * as THREE from 'three';
import {LOCKERS} from '../../shared/layout.js';
// Two mounted plates inside the existing storage fronts. No new lights or colliders.
export function createLockerView(scene) {
  const plates=Object.values(LOCKERS).map(def=>{
    const canvas=typeof document==='undefined'?null:document.createElement('canvas');
    if(canvas){canvas.width=512;canvas.height=160;}
    const texture=canvas?new THREE.CanvasTexture(canvas):null;if(texture)texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({color:0xffffff,map:texture});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.86,.27),material);
    mesh.position.set(def.x,def.y,def.z+.025);scene.add(mesh);
    return {def,mesh,texture,canvas,key:''};
  });
  return {
    update(state) {
      for(const p of plates){
        const count=Object.values(state.lockers?.[p.def.id]||{}).reduce((a,b)=>a+b,0),open=state.stage==='main';
        const key=`${count}:${open}:${controlText('E')}`;if(key===p.key)continue;p.key=key;
        const g=p.canvas?.getContext('2d');if(!g)continue;
        g.fillStyle='#08171d';g.fillRect(0,0,512,160);g.strokeStyle='#8caeb0';g.lineWidth=5;g.strokeRect(5,5,502,150);
        g.fillStyle='#d3e6e3';g.font='bold 32px monospace';g.fillText('SHARED / STORES',20,48,470);
        g.font='27px monospace';g.fillText(controlText(open?`${count} ${count===1?'SUPPLY':'SUPPLIES'} / PRESS E`:'SEALED / LAUNCH ACTIVE'),20,102,470);
        p.texture.needsUpdate=true;
      }
    },
    dispose() {for(const p of plates){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();p.texture?.dispose();}}
  };
}
