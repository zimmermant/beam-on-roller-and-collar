import { SLIDER_FIELDS } from './fields.js';
import { createState } from './state.js';
import { createScene } from './scene.js';
import { createControls } from './controls.js';
import { attachDrag } from './interact.js';
import { parsePresets, describePresets } from './presets.js';

// The page: the four diagrams, the applied-couple slider, and dragging the load. Nothing else.
//
// The load is set by DRAGGING its arrow, not by sliders, so only the inputs in SLIDER_FIELDS have
// controls on the page. The keyboard still reaches the load: tab to the handle, then the arrow keys
// swing it and change its strength, Home is the hardest straight-down pull and End drops it. That is
// the drag by another route, not a second way in, and without it the load would need a mouse.
const APP_TITLE = 'Beam on a roller and a collar';

function appStart() {
  document.title = APP_TITLE;
  const state = createState();
  const fig = document.getElementById('fig');
  const scene = createScene(fig);
  const parts = { reset: null, sliders: {}, readouts: {}, zeros: {}, marks: {} };
  for (const f of SLIDER_FIELDS) {
    parts.sliders[f.key] = document.getElementById(`${f.id}-slider`);
    parts.readouts[f.key] = document.getElementById(`${f.id}-readout`);
    if (f.snap) parts.zeros[f.key] = document.getElementById(`${f.id}-zero`);
    if (f.mark) parts.marks[f.key] = document.getElementById(`${f.id}-mark`);
  }
  const controls = createControls(document.getElementById('controls'), state, parts);

  // Presets from the link apply once, before the first render. Only the fields the link set.
  const presets = parsePresets(location.search);
  state.set(presets.values);
  const note = describePresets(presets);
  const link = document.getElementById('from-link');
  link.textContent = note;            // text only: the link's own text can never become markup
  link.hidden = note === '';

  // The scene rebuilds the whole figure, so the drag handle is a NEW node after every render. Hand
  // focus back when the old one had it, and never take it otherwise.
  function sync() {
    const s = state.getState();
    const active = typeof document.activeElement === 'object' && document.activeElement
      && typeof document.activeElement.getAttribute === 'function'
      && (document.activeElement.getAttribute('class') || '').includes('load-handle');
    scene.render(s);
    controls.render(s);
    if (active && fig.querySelector) {
      const handle = fig.querySelector('.load-handle');
      if (handle && typeof handle.focus === 'function') handle.focus({ preventScroll: true });
    }
  }
  state.subscribe(sync);
  sync();
  attachDrag(document.getElementById('stage'), state);
}

appStart();
