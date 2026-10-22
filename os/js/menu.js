// Pop-up menus: context menus, menu bar drop-downs, submenus and the start menu.
// Items: { label, icon, action, disabled, checked, shortcut, items: [...] } or '-' for a separator.
// Keyboard: arrows move (Right/Left open and close submenus), Enter/Space choose, Esc closes,
// and typing a letter jumps to the next item starting with it.
import { h, icon } from './dom.js';
import { play } from './sound.js';

let openStack = [];
let restoreFocus = null;
let closeHandler = null;

export function closeMenus() {
  const handler = closeHandler;
  openStack.forEach(menu => menu.remove());
  openStack = [];
  closeHandler = null;
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('blur', closeMenus);
  window.removeEventListener('resize', closeMenus);
  if (handler) handler();
}

function outside(event) {
  if (!openStack.some(menu => menu.contains(event.target)) && !event.target.closest('[data-menu-owner]')) {
    closeMenus();
  }
}

const itemsOf = menu => [...menu.querySelectorAll(':scope > [role="menuitem"], :scope > [role="menuitemcheckbox"], :scope > .menu-items > [role="menuitem"], :scope > .menu-items > [role="menuitemcheckbox"]')];

function focusItem(menu, index) {
  const items = itemsOf(menu).filter(item => item.getAttribute('aria-disabled') !== 'true');
  if (!items.length) return;
  const target = items[(index + items.length) % items.length];
  target.focus();
}

function build(items, { className = '', banner = null, level = 0, label = 'Menu' } = {}) {
  const list = h('div', { class: 'menu-items' });
  const menu = h('div', { class: `menu ${className}`.trim(), role: 'menu', 'aria-label': label, tabIndex: -1, dataset: { level } }, banner, list);
  for (const item of items) {
    if (item === '-' || item?.separator) { list.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
    if (!item || item.hidden) continue;
    const hasSub = Array.isArray(item.items);
    const el = h('div', {
      class: `menu-item${hasSub ? ' has-sub' : ''}${item.bold ? ' bold' : ''}`,
      role: item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem',
      tabIndex: -1,
      'aria-disabled': item.disabled ? 'true' : null,
      'aria-checked': item.checked !== undefined ? String(Boolean(item.checked)) : null,
      'aria-haspopup': hasSub ? 'menu' : null,
      'aria-expanded': hasSub ? 'false' : null
    },
    h('span', { class: 'menu-check', 'aria-hidden': 'true', text: item.checked ? (item.radio ? '•' : '✓') : '' }),
    item.icon ? icon(item.icon, item.bigIcon ? 32 : 16, 'menu-icon') : h('span', { class: 'menu-icon-space' }),
    h('span', { class: 'menu-label', text: item.label }),
    item.shortcut ? h('span', { class: 'menu-shortcut', text: item.shortcut }) : null,
    hasSub ? h('span', { class: 'menu-arrow', 'aria-hidden': 'true', text: '▸' }) : null);
    el._item = item;
    el.addEventListener('pointerenter', () => {
      if (item.disabled) return;
      el.focus({ preventScroll: true });
      clearTimeout(menu._subTimer);
      menu._subTimer = setTimeout(() => { if (hasSub) openSub(menu, el); else closeFrom(level + 1); }, hasSub ? 140 : 200);
    });
    el.addEventListener('click', event => { event.stopPropagation(); choose(menu, el); });
    list.append(el);
  }
  menu.addEventListener('keydown', event => onKey(event, menu, level));
  return menu;
}

function closeFrom(level) {
  while (openStack.length > level) {
    const menu = openStack.pop();
    menu.remove();
  }
  const parent = openStack[level - 1];
  parent?.querySelectorAll('[aria-expanded="true"]').forEach(el => el.setAttribute('aria-expanded', 'false'));
}

function openSub(menu, el, focusFirst = false) {
  const level = Number(menu.dataset.level) + 1;
  if (el.getAttribute('aria-expanded') === 'true' && openStack[level]) {
    if (focusFirst) focusItem(openStack[level], 0);
    return;
  }
  closeFrom(level);
  menu.querySelectorAll('[aria-expanded="true"]').forEach(other => other.setAttribute('aria-expanded', 'false'));
  const item = el._item;
  const items = typeof item.items === 'function' ? item.items() : item.items;
  const sub = build(items.length ? items : [{ label: '(Empty)', disabled: true }], { level, label: item.label, className: 'submenu' });
  document.body.append(sub);
  openStack.push(sub);
  el.setAttribute('aria-expanded', 'true');
  menu._lastOpener = el;
  const r = el.getBoundingClientRect();
  position(sub, r.right - 3, r.top - 3, { flipX: r.left + 3 });
  if (focusFirst) focusItem(sub, 0);
}

function position(menu, x, y, { flipX = null, above = null } = {}) {
  const w = menu.offsetWidth;
  const hgt = menu.offsetHeight;
  let left = x;
  let top = y;
  if (left + w > innerWidth - 2) left = flipX != null ? flipX - w : innerWidth - w - 2;
  if (above != null) top = above - hgt;
  if (top + hgt > innerHeight - 2) top = innerHeight - hgt - 2;
  menu.style.left = `${Math.max(2, left)}px`;
  menu.style.top = `${Math.max(2, top)}px`;
}

function choose(menu, el) {
  const item = el._item;
  if (!item || item.disabled) return;
  if (item.items) { openSub(menu, el, true); return; }
  closeMenus();
  play('click');
  if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
  item.action?.();
}

function onKey(event, menu, level) {
  const items = itemsOf(menu).filter(item => item.getAttribute('aria-disabled') !== 'true');
  const index = items.indexOf(document.activeElement);
  const current = items[index];
  switch (event.key) {
    case 'ArrowDown': focusItem(menu, index + 1); break;
    case 'ArrowUp': focusItem(menu, index < 0 ? -1 : index - 1); break;
    case 'Home': focusItem(menu, 0); break;
    case 'End': focusItem(menu, -1); break;
    case 'ArrowRight':
      if (current?._item.items) openSub(menu, current, true);
      else if (menu._menubar) menu._menubar(1);
      break;
    case 'ArrowLeft':
      if (level > 0) { closeFrom(level); focusParent(level); }
      else if (menu._menubar) menu._menubar(-1);
      break;
    case 'Enter':
    case ' ':
      if (current) choose(menu, current);
      break;
    case 'Escape':
      if (level > 0) { closeFrom(level); focusParent(level); } else { closeMenus(); restoreFocus?.focus({ preventScroll: true }); }
      break;
    case 'Tab':
      closeMenus();
      break;
    default:
      if (event.key.length === 1 && /\S/.test(event.key)) {
        const letter = event.key.toLowerCase();
        const start = index + 1;
        const match = [...items.slice(start), ...items.slice(0, start)].find(item => item.textContent.trim().toLowerCase().startsWith(letter));
        if (match) match.focus();
      } else return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function focusParent(level) {
  const parent = openStack[level - 1];
  (parent?._lastOpener || parent?.querySelector('.has-sub'))?.focus();
}

// Opens a menu at a point (context menus) or under/above an element (menu bars, start menu).
export function showMenu(items, { x, y, anchor, above = false, className = '', banner = null, label = 'Menu', onClose = null, focusFirst = true } = {}) {
  closeMenus();
  restoreFocus = document.activeElement;
  const menu = build(items, { className, banner, label });
  document.body.append(menu);
  openStack.push(menu);
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    position(menu, r.left, above ? 0 : r.bottom, above ? { above: r.top } : {});
  } else {
    position(menu, x, y);
  }
  closeHandler = onClose;
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('blur', closeMenus);
    window.addEventListener('resize', closeMenus);
  });
  if (focusFirst) focusItem(menu, 0);
  else menu.focus();
  return menu;
}

export const isOpen = () => openStack.length > 0;

// A window's menu bar: [{ label: 'File', items: [...] | () => [...] }].
export function menubar(menus) {
  const bar = h('div', { class: 'menubar', role: 'menubar' });
  const buttons = menus.map((entry, index) => {
    const button = h('button', { class: 'menubar-item', type: 'button', role: 'menuitem', 'aria-haspopup': 'menu', 'aria-expanded': 'false', tabIndex: index === 0 ? 0 : -1, text: entry.label, dataset: { menuOwner: '' } });
    const openIt = (focusFirst = true) => {
      buttons.forEach(b => b.setAttribute('aria-expanded', 'false'));
      button.setAttribute('aria-expanded', 'true');
      button.classList.add('open');
      const menu = showMenu(typeof entry.items === 'function' ? entry.items() : entry.items, {
        anchor: button,
        label: entry.label,
        focusFirst,
        onClose: () => { button.setAttribute('aria-expanded', 'false'); button.classList.remove('open'); }
      });
      restoreFocus = button;
      menu._menubar = step => {
        const next = buttons[(index + step + buttons.length) % buttons.length];
        next._open();
      };
    };
    button._open = openIt;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (button.classList.contains('open')) closeMenus();
      else openIt(false);
    });
    button.addEventListener('pointerenter', () => { if (isOpen() && buttons.some(b => b.classList.contains('open')) && !button.classList.contains('open')) openIt(false); });
    button.addEventListener('keydown', event => {
      if (['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); openIt(true); }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
        buttons.forEach(b => { b.tabIndex = -1; });
        next.tabIndex = 0;
        next.focus();
      }
    });
    return button;
  });
  bar.append(...buttons);
  return bar;
}
