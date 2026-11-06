import * as THREE from "three";

export function createWaterNormal() {
  const n=128,pixels=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=(y*n+x)*4;pixels[i]=128+Math.sin(x/n*Math.PI*8+Math.sin(y/n*Math.PI*4))*32;pixels[i+1]=128+Math.cos(y/n*Math.PI*8+Math.sin(x/n*Math.PI*4))*32;pixels[i+2]=244;pixels[i+3]=255;}
  const water=new THREE.DataTexture(pixels,n,n);water.wrapS=water.wrapT=THREE.RepeatWrapping;water.magFilter=THREE.LinearFilter;water.minFilter=THREE.LinearMipmapLinearFilter;water.generateMipmaps=true;water.repeat.set(3,3);water.needsUpdate=true;return water;
}

// Small deterministic, locally authored PBR maps. No remote textures or runtime
// downloads; the same industrial surface language carries into the pod.
export function createSurfaces() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d");
  g.fillStyle = "#b8c2c5"; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) {
    g.fillStyle = "#52636c"; g.fillRect(0, y, 256, 3);
    g.fillStyle = "#e0e7e5"; g.fillRect(0, y + 3, 256, 1);
    for (let x = 0; x < 256; x += 64) {
      g.fillStyle = "#6c7d84"; g.fillRect(x, y, 2, 64);
      g.fillStyle = "#455860"; g.fillRect(x + 7, y + 7, 3, 3); g.fillRect(x + 55, y + 55, 3, 3);
    }
  }
  let seed = 713;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 1000; i++) { g.fillStyle = `rgba(30,48,55,${0.03 + rnd() * 0.1})`; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 12, 1); }
  // Localized oxidation under rivets and seams, rather than uniform orange noise.
  for(let i=0;i<32;i++) {const x=7+Math.floor(rnd()*4)*64,y=7+Math.floor(rnd()*4)*64;const stain=g.createLinearGradient(x,y,x,y+38);stain.addColorStop(0,'rgba(104,60,33,.22)');stain.addColorStop(1,'rgba(104,60,33,0)');g.fillStyle=stain;g.fillRect(x-2,y,5+rnd()*5,20+rnd()*28);}
  const metal = new THREE.CanvasTexture(canvas); metal.colorSpace = THREE.SRGBColorSpace;
  metal.wrapS = metal.wrapT = THREE.RepeatWrapping; metal.repeat.set(3, 3); metal.anisotropy = 4;
  const wall = metal.clone(); wall.repeat.set(4, 1);
  function floorMap(kind) {
    const c=document.createElement('canvas');c.width=c.height=256;const p=c.getContext('2d');
    p.fillStyle=kind==='tile'?'#b8c2b9':'#87938f';p.fillRect(0,0,256,256);
    if(kind==='grating')for(let y=0;y<256;y+=16)for(let x=0;x<256;x+=16){p.fillStyle='#334248';p.fillRect(x+3,y+3,9,10);p.fillStyle='#b3bcb8';p.fillRect(x+1,y,14,2);}
    if(kind==='diamond')for(let y=0;y<256;y+=32)for(let x=0;x<256;x+=32){p.save();p.translate(x+8+(y%64?16:0),y+12);p.rotate(Math.PI/4);p.fillStyle='#bdc6bd';p.fillRect(-2,-10,4,20);p.fillStyle='#536561';p.fillRect(2,-10,2,20);p.restore();}
    if(kind==='tile')for(let y=0;y<256;y+=64)for(let x=0;x<256;x+=64){p.strokeStyle='#71817c';p.lineWidth=3;p.strokeRect(x+1,y+1,62,62);}
    if(kind==='hazard'){p.fillStyle='#b7a66b';p.fillRect(0,0,256,256);p.fillStyle='#354342';for(let x=-256;x<512;x+=64){p.beginPath();p.moveTo(x,0);p.lineTo(x+32,0);p.lineTo(x+288,256);p.lineTo(x+256,256);p.fill();}}
    for(let i=0;i<650;i++){p.fillStyle=`rgba(25,38,35,${rnd()*.14})`;p.fillRect(rnd()*256,rnd()*256,rnd()*13+1,1);}
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(kind==='hazard'?2:5,kind==='hazard'?1:5);map.anisotropy=4;return map;
  }
  const grating=floorMap('grating'),diamond=floorMap('diamond'),tile=floorMap('tile'),hazard=floorMap('hazard');
  const water = createWaterNormal();
  return { metal, wall, grating, diamond, tile, hazard, water, update(time, reduced) { water.offset.set(reduced ? 0 : time * 0.009, reduced ? 0 : time * -0.006); }, dispose() { for(const map of [metal,wall,grating,diamond,tile,hazard,water])map.dispose(); } };
}

// Structural detail is instanced and kept against the ceiling/walls, away from
// the shared collision paths and interaction panels.
export function addStationStructure(scene) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x192d37, roughness: 0.54, metalness: 0.65 });
  const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.22, 9.4), metal, 32);
  const dummy = new THREE.Object3D(); let index = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) {
    dummy.position.set(sx * (1.9 + i * 2.4), 3.81, sz * 5); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); beam.setMatrixAt(index++, dummy.matrix);
    dummy.position.set(sx * 5, 3.81, sz * (1.9 + i * 2.4)); dummy.rotation.y = Math.PI / 2; dummy.updateMatrix(); beam.setMatrixAt(index++, dummy.matrix);
  }
  scene.add(beam);
  const strip = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.06, 2.8), new THREE.MeshStandardMaterial({ color: 0x99cbd0, emissive: 0x38798a, emissiveIntensity: 1.5 }), 16);
  index = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) {
    dummy.position.set(sx * 9.72, 0.16, sz * (1.9 + i * 2.1)); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); strip.setMatrixAt(index++, dummy.matrix);
  }
  scene.add(strip);
}
