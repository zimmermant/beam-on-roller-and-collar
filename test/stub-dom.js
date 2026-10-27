// A tiny stand-in for the DOM (no browser, no jsdom): enough for svg.js, scene.js, panel.js, controls.js and app.js.
// Not a test file (the runner globs *.test.js).
export function stubElement(tag = 'div') {
  const listeners = {};
  const el = {
    tag, attrs: {}, children: [], parent: null,
    textContent: '', innerHTML: '', hidden: false, value: '0',
    get firstChild() { return this.children[0] || null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parent = null;
      return c;
    },
    classList: {
      toggle(c, on) {
        const set = new Set((el.attrs.class || '').split(/\s+/).filter(Boolean));
        if (on) set.add(c); else set.delete(c);
        el.attrs.class = [...set].join(' ');
      },
      contains: (c) => (el.attrs.class || '').split(/\s+/).includes(c)
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      const list = listeners[type];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    fire(type, e = {}) { for (const fn of listeners[type] || []) fn(e); }
  };
  return el;
}

// document.createElementNS for svg.js
export function installSvgDocument() {
  globalThis.document = { createElementNS: (ns, name) => stubElement(name) };
}
