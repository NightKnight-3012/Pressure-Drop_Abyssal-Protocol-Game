// Accessibility + control options, saved in the browser (localStorage).
const KEY = "pressure-drop-options";
export const DEFAULT_BINDINGS=Object.freeze({forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',interact:'KeyE',flashlight:'KeyF',sprint:'ShiftLeft'});
export function validBinding(code){return typeof code==='string'&&(/^(Key[A-Z]|ShiftLeft)$/.test(code))&&!/^Key[QPXRVTO]$/.test(code);}
const DEFAULTS = { captions: true, colorblind: false, reduced: false, sound: true, invert:false, fov:75, bindings:DEFAULT_BINDINGS, sensitivity: 1, quality: "balanced", brightness: 1.15, masterVolume:.8, ambienceVolume:.7, effectsVolume:.85 };
export const QUALITY = { low: { pixelRatio: 1, particles: 0.35 }, balanced: { pixelRatio: 1.5, particles: 0.7 }, high: { pixelRatio: 2, particles: 1 } };
export function normalizeOptions(value) {
  const result = { ...DEFAULTS };
  if (!value || typeof value !== "object") return result;
  for (const key of ["captions", "colorblind", "reduced", "sound", "invert"]) if (typeof value[key] === "boolean") result[key] = value[key];
  if(Number.isFinite(value.fov))result.fov=Math.max(60,Math.min(100,value.fov));
  const binds=value.bindings;
  if(binds&&typeof binds==='object'&&Object.keys(DEFAULT_BINDINGS).every(k=>validBinding(binds[k]))&&new Set(Object.keys(DEFAULT_BINDINGS).map(k=>binds[k])).size===Object.keys(DEFAULT_BINDINGS).length)result.bindings=Object.fromEntries(Object.keys(DEFAULT_BINDINGS).map(k=>[k,binds[k]]));
  for (const [key, min, max] of [["sensitivity", 0.4, 2.5], ["brightness", 0.7, 1.8], ["masterVolume",0,1], ["ambienceVolume",0,1], ["effectsVolume",0,1]]) if (Number.isFinite(value[key])) result[key] = Math.max(min, Math.min(max, value[key]));
  if (Object.hasOwn(QUALITY, value.quality)) result.quality = value.quality;
  return result;
}

function load() {
  try { const saved=JSON.parse(localStorage.getItem(KEY) || '{}');const normalized=normalizeOptions(saved);if(!saved||typeof saved.reduced!=='boolean')normalized.reduced=!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;return normalized; } catch { return { ...DEFAULTS }; }
}

export const options = load();
const listeners = new Set();
export const onOptionsChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function apply() {
  document.body.classList.toggle("cb", options.colorblind);
  document.body.classList.toggle("reduced", options.reduced);
  listeners.forEach((fn) => fn(options));
}

export function setOption(name, value) {
  Object.assign(options, normalizeOptions({ ...options, [name]: value }));
  try { localStorage.setItem(KEY, JSON.stringify(options)); } catch { /* storage may be blocked */ }
  apply();
}

export function initOptionsUi() {
  const $ = (id) => document.getElementById(id);
  $('opt-invert').checked=options.invert;$('opt-invert').onchange=e=>setOption('invert',e.target.checked);
  const fov=$('opt-fov');fov.value=options.fov;$('opt-fov-value').textContent=options.fov;fov.oninput=()=>{setOption('fov',Number(fov.value));$('opt-fov-value').textContent=options.fov;};
  const bindings=$('opt-bindings');let capture=null;
  const renderBindings=()=>{bindings.replaceChildren();for(const action of Object.keys(DEFAULT_BINDINGS)){const button=document.createElement('button');button.type='button';button.className='secondary small';button.textContent=`${action.toUpperCase()}: ${options.bindings[action]}`;button.onclick=()=>{capture=action;$('opt-bind-status').textContent=`Press a key for ${action}. Escape cancels. Reserved shortcuts cannot be reassigned.`;};bindings.append(button);}};
  bindings.addEventListener('keydown',e=>{if(!capture)return;e.preventDefault();e.stopPropagation();if(e.code==='Escape'){capture=null;$('opt-bind-status').textContent='Binding cancelled.';return;}if(!validBinding(e.code)||Object.entries(options.bindings).some(([a,c])=>a!==capture&&c===e.code)){$('opt-bind-status').textContent='That key is reserved or already assigned. Choose another.';return;}setOption('bindings',{...options.bindings,[capture]:e.code});capture=null;renderBindings();$('opt-bind-status').textContent='Binding saved. Arrow keys remain available.';});
  $('opt-bind-reset').onclick=()=>{capture=null;setOption('bindings',DEFAULT_BINDINGS);renderBindings();$('opt-bind-status').textContent='Default controls restored.';};renderBindings();
  const map = { captions: "opt-captions", colorblind: "opt-colorblind", reduced: "opt-reduced", sound: "opt-sound" };
  for (const [key, id] of Object.entries(map)) {
    $(id).checked = !!options[key];
    $(id).addEventListener("change", (e) => setOption(key, e.target.checked));
  }
  const sens = $("opt-sens");
  const quality = $("opt-quality"); quality.value = options.quality;
  quality.addEventListener("change", () => setOption("quality", quality.value));
  const brightness = $("opt-brightness"); brightness.value = options.brightness;
  brightness.addEventListener("input", () => setOption("brightness", Number(brightness.value)));
  for(const name of ["masterVolume","ambienceVolume","effectsVolume"]) {
    const input=$("opt-"+name), output=$("opt-"+name+"-value");input.value=options[name];output.textContent=Math.round(options[name]*100)+"%";
    input.addEventListener("input",()=>{setOption(name,Number(input.value));output.textContent=Math.round(options[name]*100)+"%";});
  }
  sens.value = options.sensitivity;
  $("opt-sens-value").textContent = Number(options.sensitivity).toFixed(1);
  sens.addEventListener("input", () => {
    setOption("sensitivity", Number(sens.value));
    $("opt-sens-value").textContent = Number(sens.value).toFixed(1);
  });
  $("options-close").addEventListener("click", () => $("options").classList.add("hidden"));
  apply();
}
export const showOptions = () => document.getElementById("options").classList.remove("hidden");
