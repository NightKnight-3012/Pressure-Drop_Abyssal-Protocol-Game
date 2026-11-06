import * as THREE from 'three';
// Bounded pooled devices: no mesh/material allocations per frame, no shadows, at most two lights.
export function createEquipmentView(scene) {
  const geometry = new THREE.CylinderGeometry(.055, .055, .32, 6);
  const flare = new THREE.MeshStandardMaterial({ color:0xe3ba85, emissive:0xffa848, emissiveIntensity:2 });
  const lure = new THREE.MeshStandardMaterial({ color:0xa3b8bb, emissive:0x5f9faf, emissiveIntensity:.8 });
  const devices = Array.from({ length:8 }, () => {
    const mesh = new THREE.Mesh(geometry, flare); mesh.visible=false; scene.add(mesh); return mesh;
  });
  const lights = Array.from({ length:2 }, () => { const light=new THREE.PointLight(0xffc17d,0,9,2); scene.add(light); return light; });
  return {
    update(effects = [], quality = 'balanced', viewer = null) {
      let n = 0;
      const sorted = [...effects].sort((a,b) => viewer ? Math.hypot(a.x-viewer.x,a.z-viewer.z)-Math.hypot(b.x-viewer.x,b.z-viewer.z) : 0);
      devices.forEach((mesh,i) => {
        const e=sorted[i]; mesh.visible=!!e;
        if(!e) return;
        mesh.material=e.item==='flare'?flare:lure;
        mesh.position.set(e.x, e.ext ? .4 : .22, e.z); mesh.rotation.z=Math.PI/2;
        if(e.item==='flare' && n<(quality==='low'?1:2)) {
          const light=lights[n++]; light.position.copy(mesh.position); light.intensity=8*Math.min(1,e.remaining/2);
        }
      });
      for(let i=n;i<lights.length;i++) lights[i].intensity=0;
    },
    dispose() { devices.forEach(m=>scene.remove(m)); lights.forEach(l=>scene.remove(l)); geometry.dispose(); flare.dispose(); lure.dispose(); }
  };
}
