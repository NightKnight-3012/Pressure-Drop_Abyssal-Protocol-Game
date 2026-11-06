import * as THREE from "three";

// A small cached feed shares the pod scene; it never needs another world/model.
export function createPodMonitor(scene) {
  const frame = document.getElementById("pod-contact-camera"), label = document.getElementById("pod-camera-label"), image = document.getElementById("pod-camera-image");
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 160);
  const lamp = new THREE.SpotLight(0xb8dce2, 100, 100, 0.8, 0.65, 1); lamp.position.set(-3, 3, 0);
  camera.add(lamp); lamp.target.position.set(0, 0, -35); camera.add(lamp.target); scene.add(camera);
  const target = new THREE.WebGLRenderTarget(256, 144);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Scene(), lens = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3); lens.position.z = 1;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: target.texture, toneMapped: false, depthTest: false, depthWrite: false })); screen.add(quad);
  const viewport = new THREE.Vector4(), scissor = new THREE.Vector4();
  let shown = false, due = false, rect = null, width = 0, height = 0, lastCapture = -1;
  return {
    update(pod, pursuing, lane, rear, time, hit) {
      const visible = pod.status === "running" && !["sealing", "ascent"].includes(pod.phase) && !rear;
      if (shown !== visible) { frame.classList.toggle("hidden", !visible); shown = visible; rect = null; }
      frame.classList.toggle("danger", pursuing && pod.creatureDistance < 12);
      const text = pursuing ? `STERN / ${Math.round(pod.creatureDistance)}m / ${pod.creatureDistance < 9 ? "ATTACK" : "CONTACT"}` : "STERN / STATION CONTACT";
      if (label.textContent !== text) label.textContent = text;
      camera.position.set(lane * 4, 2.1, 8); camera.lookAt(lane * 4, 2.4, 60);
      const fov = pursuing && pod.creatureDistance < 12 ? 42 : 58;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      due = visible && (lastCapture < 0 || time - lastCapture >= 0.125 || hit);
      if (due) lastCapture = time;
    },
    render(renderer, creature, pursuing, drawForward) {
      if (shown && due) {
        const previousTarget = renderer.getRenderTarget(), wasVisible = creature.visible;
        try {
          creature.visible = pursuing;
          renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
        } finally { renderer.setRenderTarget(previousTarget); creature.visible = wasVisible; }
      }
      drawForward();
      if (!shown) return;
      if (!rect || width !== innerWidth || height !== innerHeight) { rect = image.getBoundingClientRect(); width = innerWidth; height = innerHeight; }
      if (rect.width <= 0 || rect.height <= 0) return;
      renderer.getViewport(viewport); renderer.getScissor(scissor);
      const wasScissored = renderer.getScissorTest(), wasClearing = renderer.autoClear;
      try {
        renderer.autoClear = false;
        renderer.setViewport(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
        renderer.setScissor(rect.left, innerHeight - rect.bottom, rect.width, rect.height); renderer.setScissorTest(true);
        renderer.render(screen, lens);
      } finally { renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(wasScissored); renderer.autoClear = wasClearing; }
    },
    hide() { frame.classList.add("hidden"); shown = false; rect = null; lastCapture = -1; },
    dispose() { frame.classList.add("hidden"); target.dispose(); quad.geometry.dispose(); quad.material.dispose(); scene.remove(camera); }
  };
}
