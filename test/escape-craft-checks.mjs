import assert from "node:assert/strict";
import * as THREE from "three";
import { createEscapeCraft, fitEscapeCraft } from "../client/src/escape-craft.js";
import { POD } from "../shared/layout.js";

let checks=0;
function check(name,result){ assert.ok(result,name); checks++; console.log(`PASS ${name}`); }
function dispose(root){ const geometry=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);});geometry.forEach(g=>g.dispose());materials.forEach(m=>{m.map?.dispose();m.dispose();}); }
for(const compact of [false,true]) {
  const craft=createEscapeCraft({compact});
  let meshes=0,vertices=0,finite=true,glass=false,whiteArmor=false;
  craft.root.traverse(o=>{
    if(!o.isMesh)return; meshes++; vertices+=o.geometry.attributes.position.count;
    for(const key of ["position","normal"]) if(o.geometry.attributes[key]) finite &&= Array.from(o.geometry.attributes[key].array).every(Number.isFinite);
    glass ||= o.name==="Craft / glass"; whiteArmor ||= o.name==="Craft / armor";
  });
  check(`${compact?"maintenance":"transfer"} craft has finite geometry`,finite);
  check("canopy and armored hull are separate surfaces",glass&&whiteArmor);
  check("detail stays within a 24-mesh rendering budget",meshes<=24&&vertices<100000);
  const position=craft.root.position.clone(),scale=craft.root.scale.clone();
  for(let i=0;i<60;i++)craft.update(1/60,{powered:true});
  check("cosmetic thrusters do not move or resize the craft",craft.root.position.equals(position)&&craft.root.scale.equals(scale));
  const bounds=new THREE.Box3().setFromObject(craft.root);
  check("the rescue craft has a distinct cockpit and landing skids",bounds.max.y>1.5&&bounds.min.y<-1.2);
  dispose(craft.root);
}
const craft=createEscapeCraft(), fitted=fitEscapeCraft(craft,[POD.w,POD.h-0.35,POD.d],Math.PI/2);
fitted.updateMatrixWorld(true);
const box=new THREE.Box3().setFromObject(fitted),size=box.getSize(new THREE.Vector3());
check("the station model stays within the existing collision footprint",size.x<=POD.w+1e-6&&size.y<=POD.h-0.35+1e-6&&size.z<=POD.d+1e-6);
check("the fitted model sits on the dock floor",Math.abs(box.min.y)<1e-6);
check("fitting preserves the craft's proportions",fitted.scale.x===fitted.scale.y&&fitted.scale.y===fitted.scale.z);
dispose(fitted);
console.log(`${checks}/${checks} escape craft checks passed`);
