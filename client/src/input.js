// Keyboard + mouse input. Movement works any time; mouse look needs pointer lock.
import { options, DEFAULT_BINDINGS, onOptionsChange } from "./options.js";
export function canonicalKey(code,bindings=options.bindings){const action=Object.keys(DEFAULT_BINDINGS).find(a=>bindings[a]===code);return action?DEFAULT_BINDINGS[action]:Object.values(DEFAULT_BINDINGS).includes(code)?null:code;}

const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "Tab"]);
for(const code of ['ControlLeft','ControlRight','KeyE','KeyF','KeyR','KeyQ','KeyX','KeyT','KeyV','KeyP','Digit1','Digit2','Digit3','Digit4'])GAME_KEYS.add(code);
const isTyping = (e) => e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable || e.target.closest?.('[contenteditable="true"]'));

export function createInput(canvas, handlers) {
  const keys = new Set();
  let yaw = 0, pitch = 0, enabled = true;

  const releaseAll = () => {
    if (keys.has("KeyR")) handlers.onKeyUp?.("KeyR");
    keys.clear();
    handlers.onInteractStop?.();
  };

  const onKeyDown = (e) => {
    if (isTyping(e)) return;
    const code=canonicalKey(e.code);if(!code)return;
    const podShortcut = enabled && (document.body.classList.contains("in-pod")||document.body.classList.contains('in-sub')) && /^(Key[WASDQXVTRFE]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(code);
    const lockerShortcut = enabled && document.body.classList.contains('locker-open') && /^(Key[WASDEQXF]|Digit[1-4]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(code);
    if (e.target?.closest?.("select") || e.target?.closest?.("button") && !podShortcut && !lockerShortcut) {
      if (e.code === "Escape") handlers.onKey?.(e.code, e);
      return;
    }
    handlers.onGesture?.();
    if (GAME_KEYS.has(code)) e.preventDefault();
    if (e.repeat) return;
    if (enabled) {
      keys.add(code);
      if (code === "KeyF") handlers.onFlashlight?.();
      if (code === "KeyE") handlers.onInteractStart?.();
    }
    handlers.onKey?.(code, e); // Enter, Tab, P, digits... always delivered
  };
  const onKeyUp = (e) => {
    const code=canonicalKey(e.code);keys.delete(code);
    handlers.onKeyUp?.(code);
    if (code === "KeyE") handlers.onInteractStop?.();
  };
  const onMouseMove = (e) => {
    if (!enabled || document.pointerLockElement !== canvas) return;
    const s = 0.002 * (options.sensitivity || 1);
    yaw -= e.movementX * s;
    pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch - e.movementY * s * (options.invert?-1:1)));
  };
  const onClick = () => {
    handlers.onGesture?.();
    if (!enabled || document.pointerLockElement === canvas) return;
    document.activeElement?.blur?.(); // return keyboard control after a panel button
    try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* not supported */ }
  };
  const onLockChange = () => {
    handlers.onLockChange?.(document.pointerLockElement === canvas);
    if (document.pointerLockElement !== canvas) releaseAll(); // avoid "stuck" keys
  };
  const onVisibility = () => { if (document.hidden) releaseAll(); };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointerlockchange", onLockChange);
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("click", onClick);
  const unbindOptions=onOptionsChange(releaseAll);

  return {
    get yaw() { return yaw; },
    set yaw(v) { yaw = v; },
    get pitch() { return pitch; },
    isLocked: () => document.pointerLockElement === canvas,
    releaseMouse() { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
    // forward/strafe in [-1, 1], already normalised
    axes() {
      let f = 0, s = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) f++;
      if (keys.has("KeyS") || keys.has("ArrowDown")) f--;
      if (keys.has("KeyD") || keys.has("ArrowRight")) s++;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) s--;
      const len = Math.hypot(f, s);
      return len ? { f: f / len, s: s / len, moving: true } : { f: 0, s: 0, moving: false };
    },
    sprinting: () => keys.has("ShiftLeft") || keys.has("ShiftRight"),
    depthAxis:()=>keys.has('Space')?-1:keys.has('ControlLeft')||keys.has('ControlRight')?1:0,
    // setEnabled(false) stops movement and interaction keys (e.g. when down or the match is over)
    setEnabled(v) {
      if (enabled === v) return;
      enabled = v;
      if (!v) releaseAll();
    },
    dispose() {
      unbindOptions();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("click", onClick);
    }
  };
}
