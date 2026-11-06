// Used only by the browser-simulation test: real three.js, but with a renderer that needs no GPU.
export * from "../node_modules/three/build/three.module.js";
export class WebGLRenderer {
  constructor() { this.domElement = document.createElement("canvas"); this.frames = 0; this.autoClear = true; }
  setPixelRatio() {} setSize() {} dispose() {}
  getRenderTarget() { return null; } setRenderTarget() {} clear() {}
  clearDepth() {}
  getViewport(v) { return v.set(0, 0, 1024, 768); } getScissor(v) { return v.set(0, 0, 1024, 768); }
  setViewport() {} setScissor() {} setScissorTest() {} getScissorTest() { return false; }
  render() { this.frames++; globalThis.__frames = this.frames; }
}
