// Tiny DOM helpers. Text always goes in as text (never as HTML).

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (name === 'class') el.className = value;
    else if (name === 'text') el.textContent = value;
    else if (name === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (name === 'dataset') Object.assign(el.dataset, value);
    else if (name.startsWith('on') && typeof value === 'function') el.addEventListener(name.slice(2), value);
    else if (name in el && !name.includes('-') && typeof value !== 'string') el[name] = value;
    else el.setAttribute(name, value === true ? '' : value);
  }
  el.append(...children.flat().filter(child => child != null && child !== false));
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';

// An icon from icons.svg, e.g. icon('folder', 32).
export function icon(name, size = 16, className = '') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `icons.svg#${ICONS.has(name) ? name : 'file'}`);
  svg.append(use);
  return svg;
}

// Every symbol in icons.svg (kept in sync by tests/os.test.mjs).
export const ICONS = new Set(['computer', 'folder', 'folder-open', 'file', 'text', 'image', 'zip', 'exe', 'bat', 'dos', 'recycle', 'recycle-full',
  'notepad', 'paint', 'mines', 'calc', 'cmd', 'taskmgr', 'control', 'about', 'help', 'run', 'shutdown', 'games', 'jazz', 'documents', 'pictures',
  'drive', 'display', 'sound', 'sync', 'storage', 'keyboard', 'logo', 'explorer', 'shortcut', 'volume', 'mute', 'cloud', 'cloud-off', 'gamepad', 'info', 'warning', 'error', 'question']);

// Pointer capture can fail (e.g. the pointer is already gone); dragging still works without it.
export function capture(el, pointerId) {
  try { el.setPointerCapture(pointerId); } catch { /* not capturable */ }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export const isNarrow = () => matchMedia('(max-width: 640px)').matches;
export const isTouch = () => matchMedia('(pointer: coarse)').matches;

export function formatDate(time, withTime = true) {
  const d = new Date(time);
  return d.toLocaleString(undefined, withTime ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' } : { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Lets a button-like element be focused and activated with Enter/Space as well as clicks.
export function onActivate(el, handler) {
  el.addEventListener('click', handler);
  el.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handler(event); }
  });
}

// Long-press on touch screens opens the context menu (iOS never fires contextmenu).
export function onLongPress(el, handler) {
  let timer = 0;
  let start = null;
  el.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    start = [event.clientX, event.clientY];
    timer = setTimeout(() => { timer = 0; handler(event); }, 550);
  });
  const cancel = event => {
    if (!timer) return;
    if (event.type === 'pointermove' && start && Math.hypot(event.clientX - start[0], event.clientY - start[1]) < 10) return;
    clearTimeout(timer);
    timer = 0;
  };
  el.addEventListener('pointermove', cancel);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
}

export function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Opens the real file picker; resolves with File[] (empty when cancelled).
export function pickFiles({ accept = '', multiple = true, folder = false } = {}) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, multiple, hidden: true });
    if (folder) input.webkitdirectory = true;
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// Inline rename: swaps a label for a text field. Resolves with the new text, or null if cancelled.
export function inlineEdit(label, value, { selectStem = true } = {}) {
  return new Promise(resolve => {
    const input = h('textarea', { class: 'inline-edit', rows: 1, spellcheck: false, 'aria-label': 'New name' });
    input.value = value;
    label.hidden = true;
    label.after(input);
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      input.remove();
      label.hidden = false;
      resolve(result);
    };
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); finish(input.value.trim() === value ? null : input.value.trim()); }
      if (event.key === 'Escape') { event.preventDefault(); finish(null); }
    });
    input.addEventListener('pointerdown', event => event.stopPropagation());
    input.addEventListener('blur', () => finish(input.value.trim() && input.value.trim() !== value ? input.value.trim() : null));
    input.focus();
    const dot = value.lastIndexOf('.');
    input.setSelectionRange(0, selectStem && dot > 0 ? dot : value.length);
  });
}
