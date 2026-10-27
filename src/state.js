import { FIELDS, fieldByKey, fieldDefaults, fieldNext, fieldSnap } from './fields.js';

export const DEFAULTS = fieldDefaults();

// Pure store: no DOM. Only the inputs in FIELDS are stored; everything else is derived (physics.js), never stored,
// so it can never disagree. Subscribers get a copy of the new state, and only when a stored value changed.
export function createState() {
  let cur = { ...DEFAULTS };
  const subs = new Set();

  function commit(next) {
    if (FIELDS.every(f => next[f.key] === cur[f.key])) return;
    cur = next;
    const snapshot = { ...cur };
    for (const fn of [...subs]) fn(snapshot);
  }

  return {
    getState: () => ({ ...cur }),
    // One field, snapped as its slider snaps (the keyboard jump only for a field with `snap`).
    setField: (key, raw, viaKeyboard) => {
      const f = fieldByKey(key);
      commit({ ...cur, [key]: fieldNext(f, cur[key], raw, viaKeyboard) });
    },
    // A batch (presets): each field is snapped, missing fields are kept, one notification.
    set: (p = {}) => commit(Object.fromEntries(
      FIELDS.map(f => [f.key, p[f.key] === undefined ? cur[f.key] : fieldSnap(f, p[f.key])]))),
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    reset: () => commit({ ...DEFAULTS })
  };
}
