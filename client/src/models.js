import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { MODEL_FILES, modelUrls } from "./model-assets.js";

function disposeMaterials(root) {
  const materials = new Set(), textures = new Set(), geometries = new Set();
  root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      materials.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  for (const g of geometries) g.dispose();
  for (const t of textures) t.dispose();
  for (const m of materials) m.dispose();
}

// A library belongs to one match. Late downloads never attach to a closed scene.
export function createModelLibrary() {
  const pending = new Map();
  let closed = false;
  async function load(id) {
    if (!pending.has(id)) pending.set(id, (async () => {
      const file = MODEL_FILES[id];
      const loader = new GLTFLoader();
      let asset;
      let lastError;
      for (const url of [`/models/${file}`, ...modelUrls(id)]) {
        if (closed) return null;
        try { asset = await loader.loadAsync(url); break; }
        catch (error) { lastError = error; }
      }
      if (!asset) throw lastError;
      if (closed) { disposeMaterials(asset.scene); return null; }
      return asset;
    })().catch(error => {
      if (!closed) console.warn(`Model ${id} unavailable; using built-in visual.`, error.message);
      return null;
    }));
    return pending.get(id);
  }
  return {
    async instantiate(id, size, { uniform = false, yaw = 0, fit = false, centered = false } = {}) {
      const asset = await load(id);
      if (!asset || closed) return null;
      const model = clone(asset.scene);
      model.rotation.y = yaw;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const extent = box.getSize(new THREE.Vector3());
      const ratios = [size[0] / Math.max(extent.x, 0.001), size[1] / Math.max(extent.y, 0.001), size[2] / Math.max(extent.z, 0.001)];
      const wrapper = new THREE.Group();
      wrapper.add(model);
      wrapper.scale.set(...(uniform ? Array(3).fill(fit ? Math.min(...ratios) : ratios[1]) : ratios));
      model.position.x -= (box.min.x + box.max.x) / 2;
      model.position.y -= centered ? (box.min.y + box.max.y) / 2 : box.min.y;
      model.position.z -= (box.min.z + box.max.z) / 2;
      model.traverse(o => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      });
      return { root: wrapper, model, clips: asset.animations };
    },
    disposeInstance(root) {
      root.traverse(o => {
        for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose();
      });
    },
    dispose() {
      closed = true;
      for (const p of pending.values()) p.then(asset => { if (asset) disposeMaterials(asset.scene); });
      pending.clear();
    }
  };
}
