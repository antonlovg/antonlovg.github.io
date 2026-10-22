// The window manager: open, focus, drag, resize, minimise, maximise and close windows.
// Windows are plain DOM sections in #windows; the taskbar listens to `events` to stay in sync.
import { h, icon, clamp, isNarrow, capture } from './dom.js';
import { play } from './sound.js';

export const events = new EventTarget();
const windows = [];
let layer = null;
let zTop = 10;
let nextId = 1;
let active = null;
const MIN_W = 220;
const MIN_H = 120;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function init(container) {
  layer = container;
  window.addEventListener('resize', () => windows.forEach(win => win.keepInside()));
}

const emit = (type, win) => events.dispatchEvent(new CustomEvent(type, { detail: win }));
export const all = () => [...windows];
export const getActive = () => active;
export const area = () => layer.getBoundingClientRect();

class Win {
  constructor(options) {
    this.id = nextId++;
    this.options = options;
    this.appId = options.appId || '';
    this.title = options.title || 'Untitled';
    this.iconName = options.icon || 'file';
    this.resizable = options.resizable !== false;
    this.state = 'normal';
    this.hooks = { close: [], resize: [], activate: [], deactivate: [], minimize: [], restore: [] };
    this.owner = options.owner || null;
    this.children = new Set();

    const titleId = `win-title-${this.id}`;
    this.titleEl = h('h2', { class: 'title', id: titleId, text: this.title });
    this.iconEl = icon(this.iconName, 16, 'title-icon');
    this.minButton = h('button', { class: 'wbtn wbtn-min', type: 'button', 'aria-label': 'Minimize', title: 'Minimize', onclick: () => this.minimize() });
    this.maxButton = h('button', { class: 'wbtn wbtn-max', type: 'button', 'aria-label': 'Maximize', title: 'Maximize', onclick: () => this.toggleMaximize() });
    this.closeButton = h('button', { class: 'wbtn wbtn-close', type: 'button', 'aria-label': 'Close', title: 'Close', onclick: () => this.close() });
    const controls = h('div', { class: 'wcontrols' },
      options.minimizable === false ? null : this.minButton,
      this.resizable && options.maximizable !== false ? this.maxButton : null,
      this.closeButton);
    this.titlebar = h('header', { class: 'titlebar' }, this.iconEl, this.titleEl, controls);
    this.body = h('div', { class: `window-body ${options.bodyClass || ''}`.trim() });
    this.el = h('section', { class: `window ${options.className || ''}`.trim(), role: 'dialog', 'aria-labelledby': titleId, tabIndex: -1, dataset: { app: this.appId } },
      this.titlebar, this.body);
    if (this.resizable) {
      for (const edge of ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']) {
        const handle = h('div', { class: `rh rh-${edge}`, 'aria-hidden': 'true' });
        handle.addEventListener('pointerdown', event => this.startResize(event, edge));
        this.el.append(handle);
      }
    }
    // Clicking a control focuses that control; clicking anywhere else gives the window the keyboard.
    this.el.addEventListener('pointerdown', event => {
      const focusable = event.target.closest('input, textarea, select, button, a[href], [tabindex]:not(.window)');
      this.focus({ moveFocus: !focusable, preferSelf: !event.target.closest('.titlebar') });
    }, true);
    this.el.addEventListener('focusin', () => { if (active !== this) this.focus({ moveFocus: false }); });
    this.titlebar.addEventListener('pointerdown', event => this.startDrag(event));
    this.titlebar.addEventListener('dblclick', event => { if (!event.target.closest('button') && this.resizable) this.toggleMaximize(); });
    this.titleEl.addEventListener('contextmenu', event => event.preventDefault());

    const bounds = area();
    const narrow = isNarrow();
    const width = Math.min(options.width || 520, bounds.width - 8);
    this.autoHeight = options.height === 'auto';
    const height = this.autoHeight ? 160 : Math.min(options.height || 360, bounds.height - 8);
    const cascade = (windows.length % 8) * 26;
    let x = options.x ?? (options.center || this.owner ? (bounds.width - width) / 2 : 36 + cascade);
    let y = options.y ?? (options.center || this.owner ? (bounds.height - height) / 2.6 : 24 + cascade);
    if (this.owner && options.x == null) {
      const o = this.owner.rect;
      x = o.x + (o.w - width) / 2;
      y = o.y + Math.max(30, (o.h - height) / 3);
    }
    this.rect = { x, y, w: width, h: height };
    this.minW = Math.min(options.minWidth || MIN_W, bounds.width);
    this.minH = Math.min(options.minHeight || MIN_H, bounds.height);
    this.place();
    layer.append(this.el);
    if (this.autoHeight) {
      this.rect.h = Math.min(this.el.offsetHeight, bounds.height - 8);
      if (options.y == null) this.rect.y = this.owner ? this.rect.y : (bounds.height - this.rect.h) / 2.6;
      this.place();
    }
    if (this.owner) {
      this.owner.children.add(this);
      this.owner.el.classList.add('blocked');
    }
    if ((options.maximized || (narrow && this.resizable && !this.owner)) && this.resizable) this.maximize({ silent: true });
    this.keepInside();
  }

  on(type, handler) { this.hooks[type].push(handler); return this; }

  place() {
    Object.assign(this.el.style, { left: `${Math.round(this.rect.x)}px`, top: `${Math.round(this.rect.y)}px`, width: `${Math.round(this.rect.w)}px`, height: this.autoHeight ? 'auto' : `${Math.round(this.rect.h)}px` });
  }

  keepInside() {
    if (this.state === 'max') { this.hooks.resize.forEach(fn => fn()); return; }
    const b = area();
    this.rect.w = Math.min(this.rect.w, b.width);
    this.rect.h = Math.min(this.rect.h, b.height);
    this.rect.x = clamp(this.rect.x, Math.min(0, 80 - this.rect.w), b.width - 80);
    this.rect.y = clamp(this.rect.y, 0, b.height - 28);
    this.place();
  }

  setTitle(title) {
    this.title = title;
    this.titleEl.textContent = title;
    emit('change', this);
  }

  setIcon(name) {
    this.iconName = name;
    const next = icon(name, 16, 'title-icon');
    this.iconEl.replaceWith(next);
    this.iconEl = next;
    emit('change', this);
  }

  focus({ moveFocus = true, preferSelf = false } = {}) {
    if (this.children.size) {
      const child = [...this.children].at(-1);
      child.focus();
      child.flash();
      return;
    }
    if (this.state === 'min') this.restore();
    if (active && active !== this) {
      active.el.classList.remove('active');
      active.hooks.deactivate.forEach(fn => fn());
    }
    const changed = active !== this;
    active = this;
    this.el.classList.add('active');
    if (this.owner) this.owner.el.style.zIndex = ++zTop;
    this.el.style.zIndex = ++zTop;
    // The window itself only holds focus as a stand-in (e.g. before its content was added).
    const holding = document.activeElement === this.el && !preferSelf;
    if (moveFocus && (!this.el.contains(document.activeElement) || holding)) {
      const target = preferSelf ? this.el : this.body.querySelector('[autofocus], [data-autofocus]') || this.body.querySelector(':is(input, textarea, select, button, [tabindex="0"]):not(.menubar-item)') || this.el;
      target.focus({ preventScroll: true });
    }
    if (changed) {
      this.hooks.activate.forEach(fn => fn());
      emit('focus', this);
    }
  }

  flash() {
    this.el.classList.remove('flash');
    void this.el.offsetWidth;
    this.el.classList.add('flash');
    play('ding');
  }

  blur() {
    if (active !== this) return;
    this.el.classList.remove('active');
    this.hooks.deactivate.forEach(fn => fn());
    active = null;
    emit('focus', null);
  }

  minimize() {
    if (this.state === 'min' || this.owner) return;
    this.prevState = this.state;
    this.state = 'min';
    this.animate('minimizing');
    this.el.classList.add('minimized');
    this.children.forEach(child => child.el.classList.add('minimized'));
    this.hooks.minimize.forEach(fn => fn());
    play('minimize');
    if (active === this) {
      this.blur();
      focusTopmost(this);
    }
    emit('change', this);
  }

  restore() {
    if (this.state !== 'min') return;
    this.state = this.prevState || 'normal';
    this.el.classList.remove('minimized');
    this.children.forEach(child => child.el.classList.remove('minimized'));
    this.animate('restoring');
    this.hooks.restore.forEach(fn => fn());
    play('restore');
    emit('change', this);
    this.focus();
  }

  animate(name) {
    if (reduceMotion()) return;
    this.el.classList.remove('minimizing', 'restoring');
    void this.el.offsetWidth;
    this.el.classList.add(name);
    setTimeout(() => this.el.classList.remove(name), 220);
  }

  maximize({ silent = false } = {}) {
    if (!this.resizable) return;
    this.state = 'max';
    this.el.classList.add('maximized');
    this.maxButton.classList.add('is-max');
    this.maxButton.setAttribute('aria-label', 'Restore');
    this.maxButton.title = 'Restore';
    if (!silent) emit('change', this);
    this.hooks.resize.forEach(fn => fn());
  }

  unmaximize() {
    this.state = 'normal';
    this.el.classList.remove('maximized');
    this.maxButton.classList.remove('is-max');
    this.maxButton.setAttribute('aria-label', 'Maximize');
    this.maxButton.title = 'Maximize';
    this.keepInside();
    emit('change', this);
    this.hooks.resize.forEach(fn => fn());
  }

  toggleMaximize() {
    if (this.state === 'max') this.unmaximize();
    else this.maximize();
  }

  startDrag(event) {
    if (event.button !== 0 || event.target.closest('button')) return;
    // Keep keyboard focus where it is (e.g. in Notepad's text) when grabbing the title bar.
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, rect: { ...this.rect } };
    let moved = false;
    const handle = this.titlebar;
    capture(handle, event.pointerId);
    const move = e => {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved && this.state === 'max') {
        // Dragging a maximised window restores it under the pointer, like ReactOS and Windows.
        const ratio = (start.x - area().left) / area().width;
        this.unmaximize();
        start.rect = { ...this.rect, x: start.x - area().left - this.rect.w * ratio, y: 0 };
      }
      moved = true;
      this.el.classList.add('dragging');
      const b = area();
      this.rect.x = clamp(start.rect.x + dx, 60 - this.rect.w, b.width - 60);
      this.rect.y = clamp(start.rect.y + dy, 0, b.height - 28);
      this.place();
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      this.el.classList.remove('dragging');
      if (moved) emit('moved', this);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  startResize(event, edge) {
    if (event.button !== 0 || this.state === 'max') return;
    event.preventDefault();
    event.stopPropagation();
    this.focus({ moveFocus: false });
    const handle = event.currentTarget;
    capture(handle, event.pointerId);
    const start = { x: event.clientX, y: event.clientY, rect: { ...this.rect } };
    const b = area();
    const move = e => {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const r = { ...start.rect };
      if (edge.includes('e')) r.w = clamp(start.rect.w + dx, this.minW, b.width - r.x);
      if (edge.includes('s')) r.h = clamp(start.rect.h + dy, this.minH, b.height - r.y);
      if (edge.includes('w')) { r.w = clamp(start.rect.w - dx, this.minW, start.rect.x + start.rect.w); r.x = start.rect.x + start.rect.w - r.w; }
      if (edge.includes('n')) { r.h = clamp(start.rect.h - dy, this.minH, start.rect.y + start.rect.h); r.y = start.rect.y + start.rect.h - r.h; }
      this.rect = r;
      this.place();
      this.hooks.resize.forEach(fn => fn());
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      emit('moved', this);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  // Resolves false when a close hook (e.g. "Save changes?") cancels it.
  async close({ force = false } = {}) {
    if (this.closed) return true;
    if (this.children.size && !force) { this.focus(); return false; }
    if (!force) {
      for (const hook of this.hooks.close) {
        if (await hook() === false) return false;
      }
    }
    for (const child of [...this.children]) await child.close({ force: true });
    this.closed = true;
    windows.splice(windows.indexOf(this), 1);
    if (this.owner) {
      this.owner.children.delete(this);
      if (!this.owner.children.size) this.owner.el.classList.remove('blocked');
    }
    const wasActive = active === this;
    if (wasActive) active = null;
    this.el.remove();
    play('close');
    emit('close', this);
    if (wasActive) {
      if (this.owner && !this.owner.closed) this.owner.focus();
      else focusTopmost(this);
    }
    return true;
  }
}

function focusTopmost(except) {
  const candidates = windows.filter(win => win !== except && win.state !== 'min' && !win.closed);
  candidates.sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex));
  if (candidates[0]) candidates[0].focus();
  else emit('focus', null);
}

export function open(options) {
  const win = new Win(options);
  windows.push(win);
  if (!options.silent) play('open');
  emit('open', win);
  win.focus();
  return win;
}

// Alt+` style cycling: the next window in z-order, including minimised ones.
export function cycle(backwards = false) {
  if (!windows.length) return;
  const ordered = [...windows].sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex));
  const index = ordered.indexOf(active);
  const next = ordered[(index + (backwards ? -1 : 1) + ordered.length) % ordered.length] || ordered[0];
  next.focus();
}

export function minimizeAll() {
  const visible = windows.filter(win => win.state !== 'min' && !win.owner);
  if (visible.length) visible.forEach(win => win.minimize());
  else windows.filter(win => !win.owner).forEach(win => win.restore());
}

export async function closeAll() {
  for (const win of [...windows].reverse()) {
    if (!(await win.close())) return false;
  }
  return true;
}

export const findByApp = appId => windows.filter(win => win.appId === appId);
