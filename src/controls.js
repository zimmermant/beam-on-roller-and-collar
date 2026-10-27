import { FIELDS, SLIDER_FIELDS, fieldShow } from './fields.js';
import { withUnit } from './format.js';

// Pure: what the controls show for state s. text[key] is the readout; atSnap[key] (only for a field with `snap`)
// says whether the slider sits at its marked zero; atMark[key] (only for a field with `mark`) whether it sits on its mark.
export function controlsView(s) {
  const text = {}, atSnap = {}, atMark = {};
  for (const f of FIELDS) {
    text[f.key] = fieldShow(f, s[f.key]);
    if (f.snap) atSnap[f.key] = s[f.key] === 0;
    if (f.mark) atMark[f.key] = s[f.key] === f.mark.value;
  }
  return { text, atSnap, atMark };
}

// Keys that move a range input; a pointer drag is everything else.
const CONTROLS_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];

function controlsSetText(node, str) {
  if (node.textContent !== str) node.textContent = str;
}

// root: the controls container (key and pointer events are heard here).
// parts: { sliders: { key: el }, readouts: { key: el }, zeros: { key: el }, marks: { key: el } } -- the page's
// elements, one of each per input that HAS a slider (SLIDER_FIELDS, not FIELDS: the load is dragged,
// so it is stored and snapped like any input but has no slider to bind); `zeros` only for the fields
// with `snap`, `marks` only for those with `mark`. `reset` is optional: this page has no reset button.
// Binds the sliders and the reset button to state; render(s) shows state s in them.
export function createControls(root, state, parts) {
  let viaKeyboard = false;

  function showSlider(slider, readout, text, value, unitWord) {
    // Move the thumb when the state's value differs from it: a snap, or the keyboard's jump past the zero zone.
    if (Number(slider.value) !== value) slider.value = String(value);
    slider.setAttribute('aria-valuetext', withUnit(text, unitWord));
    controlsSetText(readout, text);
  }

  function render(s) {
    const v = controlsView(s);
    for (const f of SLIDER_FIELDS) {
      showSlider(parts.sliders[f.key], parts.readouts[f.key], v.text[f.key], s[f.key], f.unitWord);
      if (f.snap) parts.zeros[f.key].classList.toggle('on', v.atSnap[f.key]);
      if (f.mark) parts.marks[f.key].classList.toggle('on', v.atMark[f.key]);
    }
  }

  // A key marks the NEXT input event as a keyboard one; that event clears the mark. A key that changes nothing
  // (a slider already at its end) fires no input, so a key release, a pointer press and losing focus clear it
  // too, or the next drag would be taken for a key press.
  const clearKey = () => { viaKeyboard = false; };
  root.addEventListener('keydown', (e) => { if (CONTROLS_KEYS.includes(e.key)) viaKeyboard = true; });
  root.addEventListener('keyup', clearKey);
  root.addEventListener('pointerdown', clearKey);
  root.addEventListener('focusout', clearKey);
  if (typeof window !== 'undefined') window.addEventListener('blur', clearKey);

  for (const f of SLIDER_FIELDS) {
    const slider = parts.sliders[f.key];
    slider.addEventListener('input', () => {
      const kb = viaKeyboard;
      viaKeyboard = false;
      state.setField(f.key, Number(slider.value), kb);
      render(state.getState());   // the state may not have changed (a snap back to 0): still put the thumb right
    });
  }
  if (parts.reset) parts.reset.addEventListener('click', () => state.reset());

  return { render };
}
