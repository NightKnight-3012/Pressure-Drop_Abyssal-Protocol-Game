import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {controlText,bindControlHints} from '../client/src/control-text.js';
import {DEFAULT_BINDINGS,options} from '../client/src/options.js';
const bindings={...DEFAULT_BINDINGS,interact:'KeyF',flashlight:'KeyE',forward:'KeyI',back:'KeyK',left:'KeyJ',right:'KeyL',sprint:'KeyG'};
assert.equal(controlText('HOLD E / F lamp / W/S / A/D / Shift boost',bindings),'HOLD F / E lamp / I/K / J/L / G boost');
assert.equal(controlText('ENGINEERING / WASD / TAB / X',bindings),'ENGINEERING / I/J/K/L / TAB / X');
assert.equal(controlText('A teammate can help.',bindings),'A teammate can help.');
const dom=new JSDOM('<div id="controls">WASD<br><b>E interact</b></div>');globalThis.document=dom.window.document;const refresh=bindControlHints();const previous=options.bindings;try{options.bindings=bindings;refresh();assert(document.querySelector('br'));assert.equal(document.querySelector('b').textContent,'F interact');const replayRefresh=bindControlHints();options.bindings=DEFAULT_BINDINGS;replayRefresh();refresh();assert.equal(document.querySelector('b').textContent,'E interact');}finally{options.bindings=previous;dom.window.close();}
console.log('PASS swapped bindings, vehicle controls, reserved keys, preserved HTML and reset without cumulative substitution');
