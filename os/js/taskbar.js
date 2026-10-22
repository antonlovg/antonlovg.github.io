// The taskbar: Start button and menu, quick launch, a button per window, and the tray
// (GitHub sync status, volume, clock with a calendar).
import { h, icon } from './dom.js';
import * as wm from './wm.js';
import * as settings from './settings.js';
import { showMenu, closeMenus } from './menu.js';
import { apps, launch, launchGame, gameList, openPath } from './apps.js';
import { basename } from './lib/path.js';
import { fileIcon } from './files.js';
import * as sync from './sync.js';

let bar = null;
let buttons = null;
let startButton = null;
let clockEl = null;
let syncButton = null;
let volumeButton = null;
const buttonFor = new Map();
let shell = null;

export function init(container, shellApi) {
  shell = shellApi;
  bar = container;
  startButton = h('button', { class: 'start-button', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', dataset: { menuOwner: '' } }, icon('logo', 16), h('span', { text: 'Start' }));
  startButton.addEventListener('pointerdown', event => { event.preventDefault(); toggleStart(); });
  startButton.addEventListener('keydown', event => { if (['Enter', ' ', 'ArrowUp'].includes(event.key)) { event.preventDefault(); toggleStart(true); } });
  const quick = h('div', { class: 'quick-launch', role: 'group', 'aria-label': 'Quick Launch' },
    quickButton('Show desktop', 'display', () => wm.minimizeAll()),
    quickButton('File Explorer', 'explorer', () => launch('explorer', { path: 'C:' })),
    quickButton('MS-DOS Prompt', 'dos', () => launch('dos', {})));
  buttons = h('div', { class: 'task-buttons', role: 'toolbar', 'aria-label': 'Open windows' });
  clockEl = h('button', { class: 'tray-clock', type: 'button', 'aria-label': 'Clock', dataset: { menuOwner: '' }, onclick: () => showCalendar() });
  syncButton = h('button', { class: 'tray-icon', type: 'button', dataset: { menuOwner: '' }, onclick: () => syncMenu() });
  volumeButton = h('button', { class: 'tray-icon', type: 'button', dataset: { menuOwner: '' }, onclick: () => showVolume() });
  const tray = h('div', { class: 'tray' }, syncButton, volumeButton, clockEl);
  bar.append(startButton, h('span', { class: 'bar-sep', 'aria-hidden': 'true' }), quick, h('span', { class: 'bar-sep', 'aria-hidden': 'true' }), buttons, tray);

  for (const type of ['open', 'close', 'change', 'focus']) wm.events.addEventListener(type, renderButtons);
  settings.events.addEventListener('change', event => { if ('volume' in event.detail || 'muted' in event.detail) renderVolume(); if ('clock24' in event.detail) tick(); });
  sync.events.addEventListener('status', renderSync);
  renderVolume();
  renderSync();
  tick();
  setInterval(tick, 1000 * 15);
}

function quickButton(label, iconName, action) {
  return h('button', { class: 'quick-button', type: 'button', title: label, 'aria-label': label, onclick: action }, icon(iconName, 16));
}

// ---------- Window buttons ----------

function renderButtons() {
  const wins = wm.all().filter(win => !win.owner);
  for (const [win, button] of buttonFor) if (!wins.includes(win)) { button.remove(); buttonFor.delete(win); }
  const active = wm.getActive();
  for (const win of wins) {
    let button = buttonFor.get(win);
    if (!button) {
      button = h('button', { class: 'task-button', type: 'button' });
      button.addEventListener('click', () => {
        const top = wm.getActive();
        if ((top === win || top?.owner === win) && win.state !== 'min') win.minimize();
        else win.focus();
      });
      button.addEventListener('contextmenu', event => {
        event.preventDefault();
        showMenu([
          { label: 'Restore', disabled: win.state === 'normal', action: () => (win.state === 'min' ? win.restore() : win.unmaximize()) },
          { label: 'Minimize', disabled: win.state === 'min', action: () => win.minimize() },
          { label: 'Maximize', disabled: win.state === 'max' || !win.resizable, action: () => { win.focus(); win.maximize(); } },
          '-',
          { label: 'Close', shortcut: 'Alt+W', bold: true, action: () => win.close() }
        ], { anchor: button, above: true, label: win.title });
      });
      buttonFor.set(win, button);
      buttons.append(button);
    }
    button.replaceChildren(icon(win.iconName, 16), h('span', { text: win.title }));
    button.title = win.title;
    const pressed = (active === win || active?.owner === win) && win.state !== 'min';
    button.setAttribute('aria-pressed', String(pressed));
    button.classList.toggle('minimized', win.state === 'min');
  }
}

// ---------- Start menu ----------

function programsMenu() {
  const tree = { items: [], folders: new Map() };
  const folderFor = path => {
    let node = tree;
    for (const part of path.split('/').filter(Boolean)) {
      if (!node.folders.has(part)) node.folders.set(part, { items: [], folders: new Map() });
      node = node.folders.get(part);
    }
    return node;
  };
  for (const app of apps().filter(a => !a.hidden)) {
    folderFor(app.menu || '').items.push({ label: app.name, icon: app.icon, action: () => launch(app.id) });
  }
  for (const game of gameList()) folderFor('Games').items.push({ label: game.title, icon: game.icon || 'dos', action: () => launchGame(game.id) });
  const toMenu = node => [
    ...[...node.folders.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, child]) => ({ label: name, icon: 'folder', items: toMenu(child) })),
    ...node.items.sort((a, b) => a.label.localeCompare(b.label))
  ];
  return toMenu(tree);
}

function documentsMenu() {
  const recent = settings.get('recent') || [];
  return [
    { label: 'Documents', icon: 'documents', action: () => launch('explorer', { path: 'C:/Documents' }) },
    { label: 'Pictures', icon: 'pictures', action: () => launch('explorer', { path: 'C:/Pictures' }) },
    recent.length ? '-' : null,
    ...recent.map(path => ({ label: basename(path), icon: fileIcon({ type: 'file', name: basename(path), path }), action: () => openPath(path) })),
    recent.length ? '-' : null,
    recent.length ? { label: 'Clear recent documents', action: () => settings.set({ recent: [] }) } : null
  ].filter(Boolean);
}

export function toggleStart(keyboard = false) {
  if (startButton.getAttribute('aria-expanded') === 'true') { closeMenus(); return; }
  startButton.setAttribute('aria-expanded', 'true');
  startButton.classList.add('pressed');
  const banner = h('div', { class: 'start-banner', 'aria-hidden': 'true' }, h('span', {}, h('b', { text: 'Löv' }), 'OS'));
  showMenu([
    { label: 'Programs', icon: 'folder', bigIcon: true, items: programsMenu() },
    { label: 'Documents', icon: 'documents', bigIcon: true, items: documentsMenu() },
    { label: 'Settings', icon: 'control', bigIcon: true, items: [
      { label: 'Control Panel', icon: 'control', action: () => launch('control') },
      { label: 'Display', icon: 'display', action: () => launch('control', { page: 'display' }) },
      { label: 'Sounds', icon: 'sound', action: () => launch('control', { page: 'sound' }) },
      { label: 'GitHub Sync', icon: 'sync', action: () => launch('control', { page: 'sync' }) },
      { label: 'Storage', icon: 'storage', action: () => launch('control', { page: 'storage' }) }
    ] },
    { label: 'Find files', icon: 'explorer', bigIcon: true, action: () => launch('explorer', { path: 'C:', search: true }) },
    { label: 'Help', icon: 'help', bigIcon: true, action: () => launch('help') },
    { label: 'Run…', icon: 'run', bigIcon: true, action: () => shell.run() },
    '-',
    { label: 'Shut Down…', icon: 'shutdown', bigIcon: true, action: () => shell.shutdownDialog() }
  ], {
    anchor: startButton, above: true, className: 'start-menu', banner, label: 'Start', focusFirst: keyboard,
    onClose: () => { startButton.setAttribute('aria-expanded', 'false'); startButton.classList.remove('pressed'); }
  });
}

// ---------- Tray ----------

function tick() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: !settings.get('clock24') });
  clockEl.title = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  clockEl.setAttribute('aria-label', `${clockEl.textContent}, ${clockEl.title}`);
}

let openPopup = null;
function popup(anchor, content, label) {
  closeMenus();
  openPopup?.remove();
  const box = h('div', { class: 'menu tray-popup', role: 'dialog', 'aria-label': label, tabIndex: -1 }, content);
  openPopup = box;
  document.body.append(box);
  const r = anchor.getBoundingClientRect();
  box.style.left = `${Math.max(2, Math.min(innerWidth - box.offsetWidth - 2, r.right - box.offsetWidth))}px`;
  box.style.top = `${r.top - box.offsetHeight - 2}px`;
  const close = event => {
    if (box.contains(event.target) || anchor.contains(event.target)) return;
    box.remove();
    document.removeEventListener('pointerdown', close, true);
  };
  setTimeout(() => document.addEventListener('pointerdown', close, true));
  box.addEventListener('keydown', event => { if (event.key === 'Escape') { box.remove(); document.removeEventListener('pointerdown', close, true); anchor.focus(); } });
  return box;
}

function showCalendar() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const names = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
  const grid = h('div', { class: 'calendar-grid', role: 'grid' },
    ...names.map(n => h('span', { class: 'cal-head', role: 'columnheader', text: n })),
    ...Array.from({ length: offset }, () => h('span', { role: 'gridcell' })),
    ...Array.from({ length: days }, (_, i) => h('span', { role: 'gridcell', class: i + 1 === now.getDate() ? 'today' : '', text: String(i + 1), 'aria-current': i + 1 === now.getDate() ? 'date' : null })));
  const box = popup(clockEl, h('div', { class: 'calendar' },
    h('p', { class: 'cal-time', text: now.toLocaleTimeString(undefined, { hour12: !settings.get('clock24') }) }),
    h('p', { class: 'cal-date', text: now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }),
    h('p', { class: 'cal-month', text: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }),
    grid), 'Calendar');
  box.focus();
}

function renderVolume() {
  const muted = settings.get('muted') || settings.get('volume') === 0;
  volumeButton.replaceChildren(icon(muted ? 'mute' : 'volume', 16));
  const label = muted ? 'Volume: muted' : `Volume: ${Math.round(settings.get('volume') * 100)}%`;
  volumeButton.setAttribute('aria-label', label);
  volumeButton.title = label;
}

function showVolume() {
  const id = 'volume-slider';
  const slider = h('input', { id, type: 'range', min: 0, max: 100, value: Math.round(settings.get('volume') * 100), class: 'volume-slider' });
  slider.addEventListener('input', () => settings.set({ volume: Number(slider.value) / 100, muted: false }));
  const mute = h('input', { type: 'checkbox', id: 'volume-mute', checked: settings.get('muted') });
  mute.addEventListener('change', () => settings.set({ muted: mute.checked }));
  const box = popup(volumeButton, h('div', { class: 'volume-box' },
    h('label', { for: id, text: 'Volume' }), slider,
    h('label', { class: 'check' }, mute, h('span', { text: 'Mute' }))), 'Volume');
  slider.focus();
  return box;
}

function renderSync() {
  const status = sync.status();
  const name = status.state === 'off' ? 'cloud-off' : status.state === 'error' ? 'warning' : status.state === 'busy' ? 'sync' : 'cloud';
  syncButton.replaceChildren(icon(name, 16, status.state === 'busy' ? 'spin' : ''));
  const label = `GitHub sync: ${status.message}`;
  syncButton.setAttribute('aria-label', label);
  syncButton.title = label;
}

function syncMenu() {
  const status = sync.status();
  showMenu([
    { label: status.message, disabled: true },
    '-',
    { label: 'Sync now', disabled: status.state === 'off' || status.state === 'busy', action: () => sync.syncNow({ interactive: true }) },
    { label: 'GitHub Sync settings…', action: () => launch('control', { page: 'sync' }) }
  ], { anchor: syncButton, above: true, label: 'GitHub sync' });
}

