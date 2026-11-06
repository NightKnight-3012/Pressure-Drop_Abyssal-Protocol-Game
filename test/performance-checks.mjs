import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createRenderBudget } from "../client/src/render-budget.js";
import { createInput } from "../client/src/input.js";
import { createRecoveryLift } from "../client/src/recovery.js";
import { createPodMonitor } from "../client/src/pod-monitor.js";
import * as THREE from "three";

let checks = 0;
const check = (name, result) => { assert.ok(result, name); checks++; console.log(`PASS ${name}`); };
function run(budget, fps, seconds) {
  const changes = [];
  for (let i = 0; i < fps * seconds; i++) { const value = budget.sample(1 / fps); if (value !== null) changes.push(value); }
  return changes;
}
const budget = createRenderBudget(1.5);
check("stable rendering retains the chosen resolution", run(budget, 60, 12).length === 0);
check("one loading hitch does not lower resolution", budget.sample(0.18) === null && run(budget, 60, 3).length === 0);
const falling = run(budget, 24, 15);
check("sustained frame pressure gradually reduces pixel count", falling.length >= 4 && falling[0] === 1.35 && falling.at(-1) === 0.75);
check("resolution has a defined lower bound", run(budget, 15, 20).length === 0);
const rising = run(budget, 60, 100);
check("a recovered frame rate restores resolution slowly", rising.length > 0 && rising[0] === 0.85 && rising.at(-1) === 1.5);
check("resolution cannot grow above the quality setting", run(budget, 120, 30).length === 0);
const lowDpi = createRenderBudget(0.65);
check("adaptive rendering never exceeds a low device limit", run(lowDpi, 20, 20).length === 0);
check("hidden-tab and invalid samples do not change resolution", budget.sample(2, false) === null && budget.sample(NaN) === null);
const lift = createRecoveryLift(); let drawMeshes = 0, instancedParts = 0;
lift.root.traverse(o => { if (o.isMesh) drawMeshes++; if (o.isInstancedMesh) instancedParts += o.count; });
check("the detailed recovery shaft fits a twelve-mesh draw budget", drawMeshes <= 12 && instancedParts > 50);
for (const progress of [0, 0.5, 1]) {
  lift.update(progress, 1); lift.root.updateMatrixWorld(true);
  check(`recovery animation stays finite at ${progress}`, lift.root.children.every(o => o.matrixWorld.elements.every(Number.isFinite)));
}
lift.root.traverse(o => { if (o.isInstancedMesh) o.dispose(); o.geometry?.dispose(); o.material?.dispose(); });

const dom = new JSDOM('<body class="in-pod"><canvas></canvas><button>Sonar</button><input><select><option>A</option></select><div id="pod-contact-camera" class="hidden"><span id="pod-camera-label"></span><div id="pod-camera-image"></div></div></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.innerWidth = 1024; globalThis.innerHeight = 768;
document.getElementById("pod-camera-image").getBoundingClientRect = () => ({ left:800, bottom:200, width:160, height:90 });
const monitorScene = new THREE.Scene(), monster = new THREE.Group(); monster.visible = false; monitorScene.add(monster);
const monitor = createPodMonitor(monitorScene), flight = { status:"running", phase:"run", creatureDistance:5 };
let renderTarget = null, rearCaptures = 0, forwardFrames = 0, seenMonster = false;
const renderer = { autoClear:true, viewport:[0,0,1024,768], scissor:[0,0,1024,768], scissored:false,
  getRenderTarget:()=>renderTarget, setRenderTarget(value){ renderTarget=value; }, clear(){},
  render(){ if(renderTarget){ rearCaptures++; seenMonster ||= monster.visible; } },
  getViewport(v){ return v.fromArray(this.viewport); }, getScissor(v){return v.fromArray(this.scissor);},
  setViewport(...v){ this.viewport = v[0]?.isVector4 ? v[0].toArray() : v; }, setScissor(...v){this.scissor=v[0]?.isVector4?v[0].toArray():v;},
  getScissorTest(){return this.scissored;}, setScissorTest(v){this.scissored=v;}
};
for(let i=0;i<61;i++) {
  monitor.update(flight,true,0,false,i/60,false);
  monitor.render(renderer,monster,true,()=>{assert.equal(renderTarget,null); forwardFrames++;});
}
check("attacking contact has a visible stern feed while flying forward", seenMonster && !document.getElementById("pod-contact-camera").classList.contains("hidden"));
check("the rear feed is cached to at most nine captures per second", rearCaptures <= 9 && forwardFrames === 61);
check("the monitor restores the main viewport and render settings", renderer.viewport.join() === '0,0,1024,768' && renderer.scissor.join() === '0,0,1024,768' && !renderer.scissored && renderer.autoClear && !monster.visible);
monitor.update(flight,true,0,true,2,false);
check("holding rear peek hides the redundant inset", document.getElementById("pod-contact-camera").classList.contains("hidden"));
monitor.update(flight,true,0,false,2.1,false);
check("releasing rear peek restores the forward-flight monitor", !document.getElementById("pod-contact-camera").classList.contains("hidden"));
monitor.update({...flight,phase:"ascent"},true,0,false,3,false);
check("protected recovery hides the contact monitor", document.getElementById("pod-contact-camera").classList.contains("hidden"));
monitor.dispose(); delete globalThis.innerWidth; delete globalThis.innerHeight;
let releases = 0, interacts = 0;
const input = createInput(document.querySelector("canvas"), { onInteractStop() { releases++; }, onInteractStart() { interacts++; } });
const dispatch = (target, type, code) => target.dispatchEvent(new window.KeyboardEvent(type, { code, bubbles: true }));
dispatch(document, "keydown", "KeyE"); input.setEnabled(false);
for (let i = 0; i < 100; i++) input.setEnabled(false);
check("repeated inactive snapshots release controls only once", interacts === 1 && releases === 1);
input.setEnabled(true);
const button = document.querySelector("button"); button.focus();
dispatch(button, "keydown", "KeyS"); dispatch(button, "keydown", "KeyD");
check("focused pod buttons still accept braking and steering", input.axes().f < 0 && input.axes().s > 0);
dispatch(button, "keyup", "KeyS"); dispatch(button, "keyup", "KeyD");
check("releasing controls clears the axes", !input.axes().moving);
dispatch(document.querySelector("input"), "keydown", "KeyW");
dispatch(document.querySelector("select"), "keydown", "KeyW");
check("typing and option selection cannot move the pod", !input.axes().moving);
document.body.classList.remove("in-pod"); dispatch(button, "keydown", "KeyW");
check("ordinary menu buttons keep normal keyboard behavior", !input.axes().moving);
document.activeElement?.blur?.(); dispatch(document,"keydown","KeyW");
Object.defineProperty(document,"hidden",{configurable:true,value:true}); document.dispatchEvent(new window.Event("visibilitychange"));
check("hiding the tab releases movement even without a blur event", !input.axes().moving);
Object.defineProperty(document,"hidden",{configurable:true,value:false});
const editor=document.createElement("div"); editor.setAttribute("contenteditable","true"); document.body.append(editor);
dispatch(editor,"keydown","KeyW"); check("editable interface text cannot trigger movement", !input.axes().moving);
input.dispose(); dispatch(document, "keydown", "KeyW");
check("disposed input cannot retain live event handlers", !input.axes().moving);
dom.window.close(); delete globalThis.window; delete globalThis.document;
console.log(`${checks}/${checks} performance and input checks passed`);
