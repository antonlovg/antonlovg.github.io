// The desktop: system icons (This PC, Documents, Recycle Bin) plus everything in C:/Desktop.
// Icons sit on a grid and can be selected (click, Ctrl+click, drag a box, arrow keys), opened,
// renamed (F2), deleted (Del), dragged around, into folders or onto the Recycle Bin.
import { h, icon, inlineEdit, isTouch, onLongPress, capture } from './dom.js';
import * as vfs from './vfs.js';
import * as settings from './settings.js';
import { showMenu } from './menu.js';
import { launch, openPath } from './apps.js';
import { join, key, extension, validName, RECYCLE, basename } from './lib/path.js';
import { fileIcon, shortcutLabel } from './files.js';
import { dragItems } from './dnd.js';
import { moveInto, recyclePaths, setClipboard, paste, canPaste, importFiles, filesFromDataTransfer, isCut, clipboardEvents, exportPaths } from './fileops.js';
import { errorBox, promptBox } from './dialogs.js';
import { showProperties } from './properties.js';

export const DESKTOP = 'C:/Desktop';
const CELL_W = 84;
const CELL_H = 88;
let root = null;
let list = null;
let items = [];
const selected = new Set();
let focusedId = null;

const SYSTEM = [
  { id: 'sys:pc', label: 'This PC', icon: 'computer', open: () => launch('explorer', { path: 'C:' }), props: () => showProperties('C:') },
  { id: 'sys:docs', label: 'Documents', icon: 'documents', path: 'C:/Documents', open: () => launch('explorer', { path: 'C:/Documents' }) },
  { id: 'sys:recycle', label: 'Recycle Bin', icon: 'recycle', path: RECYCLE, drop: 'recycle', open: () => launch('explorer', { path: RECYCLE }) }
];

export function init(container) {
  root = container;
  list = h('ul', { class: 'desktop-icons', role: 'listbox', 'aria-label': 'Desktop', 'aria-multiselectable': 'true', tabIndex: 0 });
  root.prepend(list);
  root.dataset.drop = DESKTOP;
  list.addEventListener('keydown', onKey);
  list.addEventListener('focus', () => { if (!focusedId && items[0]) focusIcon(items[0].id); });
  root.addEventListener('pointerdown', onBackgroundPointer);
  root.addEventListener('contextmenu', event => {
    if (event.target.closest('.window')) return;
    event.preventDefault();
    if (!event.target.closest('.desk-icon')) { clearSelection(); backgroundMenu(event.clientX, event.clientY); }
  });
  onLongPress(root, event => { if (!event.target.closest('.window, .desk-icon')) backgroundMenu(event.clientX, event.clientY); });
  // Files dragged in from the real computer.
  root.addEventListener('dragover', event => { if (!event.target.closest('.window') && event.dataTransfer.types.includes('Files')) { event.preventDefault(); root.classList.add('drop-hover'); } });
  root.addEventListener('dragleave', event => { if (event.target === root) root.classList.remove('drop-hover'); });
  root.addEventListener('drop', async event => {
    if (event.target.closest('.window')) return;
    event.preventDefault();
    root.classList.remove('drop-hover');
    try {
      const target = event.target.closest('.desk-icon[data-drop]')?.dataset.drop;
      const folder = target && target !== 'recycle' ? target : DESKTOP;
      await importFiles(await filesFromDataTransfer(event.dataTransfer), folder);
    } catch (error) { errorBox(error); }
  });
  vfs.events.addEventListener('change', event => {
    if (event.detail.dirs.some(dir => key(dir) === key(DESKTOP) || key(dir) === key(RECYCLE) || key(dir) === 'c:')) render();
  });
  clipboardEvents.addEventListener('change', () => list.querySelectorAll('.desk-icon').forEach(el => el.classList.toggle('cut', Boolean(el.dataset.path && isCut(el.dataset.path)))));
  settings.events.addEventListener('change', event => { if ('showHidden' in event.detail) render(); });
  window.addEventListener('resize', () => layout());
  return render();
}

async function render() {
  const entries = (await vfs.list(DESKTOP)).filter(entry => settings.get('showHidden') || !entry.name.startsWith('.'));
  const recycleFull = (await vfs.list(RECYCLE).catch(() => [])).length > 0;
  items = [
    ...SYSTEM.map(item => ({ ...item, icon: item.id === 'sys:recycle' && recycleFull ? 'recycle-full' : item.icon })),
    ...await Promise.all(entries.map(async entry => {
      let iconName = fileIcon(entry);
      if (extension(entry.name) === 'lnk') iconName = (await vfs.readJson(entry.path, {})).icon || 'shortcut';
      return { id: key(entry.path), label: shortcutLabel(entry), icon: iconName, path: entry.path, entry, drop: entry.type === 'dir' ? entry.path : null, open: () => openPath(entry.path) };
    }))
  ];
  for (const id of [...selected]) if (!items.some(item => item.id === id)) selected.delete(id);
  const hadFocus = list.contains(document.activeElement);
  list.replaceChildren(...items.map(item => {
    const label = h('span', { class: 'desk-label', text: item.label });
    const el = h('li', {
      class: `desk-icon${selected.has(item.id) ? ' selected' : ''}${item.path && isCut(item.path) ? ' cut' : ''}`,
      role: 'option', id: `desk-${cssId(item.id)}`, 'aria-selected': String(selected.has(item.id)), title: item.label,
      dataset: { id: item.id, path: item.path || '', drop: item.drop || '' }
    }, h('span', { class: 'desk-glyph' }, icon(item.icon, 32), item.entry && extension(item.entry.name) === 'lnk' ? icon('shortcut', 12, 'shortcut-arrow') : null), label);
    if (!item.drop) delete el.dataset.drop;
    el.addEventListener('pointerdown', event => onIconPointer(event, item));
    el.addEventListener('dblclick', () => item.open());
    el.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); if (!selected.has(item.id)) select(item.id); iconMenu(item, event.clientX, event.clientY); });
    onLongPress(el, event => { if (!selected.has(item.id)) select(item.id); iconMenu(item, event.clientX, event.clientY); });
    item.el = el;
    item.label$ = label;
    return el;
  }));
  layout();
  if (focusedId && items.some(item => item.id === focusedId)) list.setAttribute('aria-activedescendant', `desk-${cssId(focusedId)}`);
  if (hadFocus) list.focus({ preventScroll: true });
  return items;
}

const cssId = id => id.replace(/[^a-z0-9]/gi, '_');

// Places icons: saved positions first, the rest fill free cells top-to-bottom, left-to-right.
function layout() {
  const bounds = root.getBoundingClientRect();
  const rows = Math.max(1, Math.floor((bounds.height - 8) / CELL_H));
  const cols = Math.max(1, Math.floor((bounds.width - 8) / CELL_W));
  const saved = settings.get('iconPositions') || {};
  const taken = new Set();
  const place = (item, col, row) => {
    item.cell = [col, row];
    taken.add(`${col},${row}`);
    item.el.style.transform = `translate(${4 + col * CELL_W}px, ${4 + row * CELL_H}px)`;
  };
  const pending = [];
  for (const item of items) {
    const pos = saved[item.id];
    if (pos && pos[0] < cols && pos[1] < rows && !taken.has(`${pos[0]},${pos[1]}`)) place(item, pos[0], pos[1]);
    else pending.push(item);
  }
  let col = 0;
  let row = 0;
  for (const item of pending) {
    while (taken.has(`${col},${row}`)) { row++; if (row >= rows) { row = 0; col++; } }
    place(item, Math.min(col, cols - 1), row);
  }
}

function savePositions() {
  const positions = { ...settings.get('iconPositions') };
  for (const item of items) positions[item.id] = item.cell;
  settings.set({ iconPositions: positions });
}

// ---------- Selection ----------

function updateSelection() {
  for (const item of items) {
    item.el.classList.toggle('selected', selected.has(item.id));
    item.el.setAttribute('aria-selected', String(selected.has(item.id)));
  }
}

function select(id, { toggle = false } = {}) {
  if (toggle) { if (selected.has(id)) selected.delete(id); else selected.add(id); }
  else { selected.clear(); selected.add(id); }
  focusIcon(id);
  updateSelection();
}

function clearSelection() {
  selected.clear();
  updateSelection();
}

function focusIcon(id) {
  focusedId = id;
  items.forEach(item => item.el.classList.toggle('focused', item.id === id));
  list.setAttribute('aria-activedescendant', `desk-${cssId(id)}`);
}

const selectedItems = () => items.filter(item => selected.has(item.id));
const selectedPaths = () => selectedItems().filter(item => item.entry).map(item => item.path);

// ---------- Pointer ----------

async function onIconPointer(event, item) {
  if (event.button !== 0) return;
  event.stopPropagation();
  if (event.ctrlKey || event.metaKey) { select(item.id, { toggle: true }); list.focus({ preventScroll: true }); return; }
  if (!selected.has(item.id)) select(item.id);
  else focusIcon(item.id);
  list.focus({ preventScroll: true });
  const dragging = selectedItems();
  const result = await dragItems(event, { count: dragging.length, label: item.label, iconName: item.icon });
  if (!result) {
    if (event.pointerType === 'touch' || (isTouch() && event.pointerType !== 'mouse')) item.open();
    else if (selected.size > 1) select(item.id);
    return;
  }
  const target = result.target;
  const paths = dragging.filter(i => i.entry).map(i => i.path);
  try {
    if (!target) return;
    if (target.dataset.drop === 'recycle') { await recyclePaths(paths); return; }
    const onIcon = target.closest('.desk-icon');
    if (target === root || (onIcon && dragging.includes(items.find(i => i.el === onIcon)))) {
      moveIcons(dragging, item, result.x, result.y);
      return;
    }
    if (paths.length) await moveInto(paths, target.dataset.drop, { copy: result.copy });
  } catch (error) { errorBox(error); }
}

// Drops icons on the grid cell under the pointer, keeping their positions relative to each other.
function moveIcons(dragging, lead, x, y) {
  const bounds = root.getBoundingClientRect();
  const col = Math.max(0, Math.floor((x - bounds.left) / CELL_W));
  const row = Math.max(0, Math.floor((y - bounds.top) / CELL_H));
  const [lc, lr] = lead.cell;
  const positions = { ...settings.get('iconPositions') };
  for (const item of items) positions[item.id] = item.cell;
  const moving = new Set(dragging.map(item => item.id));
  const occupied = new Set(items.filter(item => !moving.has(item.id)).map(item => item.cell.join(',')));
  for (const item of dragging) {
    let target = [Math.max(0, item.cell[0] + col - lc), Math.max(0, item.cell[1] + row - lr)];
    while (occupied.has(target.join(','))) target = [target[0], target[1] + 1];
    occupied.add(target.join(','));
    positions[item.id] = target;
  }
  settings.set({ iconPositions: positions });
  layout();
}

// Drag a box on the empty desktop to select the icons it touches.
function onBackgroundPointer(event) {
  if (event.target.closest('.window, .desk-icon') || event.button !== 0) return;
  if (!event.ctrlKey) clearSelection();
  list.focus({ preventScroll: true });
  const bounds = root.getBoundingClientRect();
  const start = { x: event.clientX, y: event.clientY };
  const box = h('div', { class: 'select-box', 'aria-hidden': 'true' });
  let shown = false;
  const base = new Set(selected);
  capture(root, event.pointerId);
  const move = e => {
    const x1 = Math.min(start.x, e.clientX);
    const y1 = Math.min(start.y, e.clientY);
    const x2 = Math.max(start.x, e.clientX);
    const y2 = Math.max(start.y, e.clientY);
    if (!shown && x2 - x1 + y2 - y1 < 6) return;
    if (!shown) { root.append(box); shown = true; }
    Object.assign(box.style, { left: `${x1 - bounds.left}px`, top: `${y1 - bounds.top}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
    selected.clear();
    base.forEach(id => selected.add(id));
    for (const item of items) {
      const r = item.el.getBoundingClientRect();
      if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) selected.add(item.id);
    }
    updateSelection();
  };
  const up = () => {
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerup', up);
    root.removeEventListener('pointercancel', up);
    box.remove();
  };
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
}

// ---------- Keyboard ----------

function nearest(from, dx, dy) {
  const [c, r] = from.cell;
  let best = null;
  let bestScore = Infinity;
  for (const item of items) {
    if (item === from) continue;
    const ddx = item.cell[0] - c;
    const ddy = item.cell[1] - r;
    if ((dx && Math.sign(ddx) !== dx) || (dy && Math.sign(ddy) !== dy)) continue;
    const score = dx ? Math.abs(ddx) * 10 + Math.abs(ddy) * 15 : Math.abs(ddy) * 10 + Math.abs(ddx) * 15;
    if (score < bestScore) { bestScore = score; best = item; }
  }
  return best;
}

async function onKey(event) {
  const current = items.find(item => item.id === focusedId) || items[0];
  if (!current) return;
  const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (moves[event.key]) {
    const next = nearest(current, ...moves[event.key]);
    if (next) { if (event.ctrlKey) focusIcon(next.id); else select(next.id); }
  } else if (event.key === 'Home') select(items[0].id);
  else if (event.key === 'End') select(items.at(-1).id);
  else if (event.key === ' ' && event.ctrlKey) select(current.id, { toggle: true });
  else if (event.key === 'Enter') {
    if (!selected.size) select(current.id);
    selectedItems().forEach(item => item.open());
  } else if (event.key === 'Delete') {
    await recyclePaths(selectedPaths(), { permanent: event.shiftKey });
  } else if (event.key === 'F2') {
    renameItem(current);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    items.forEach(item => selected.add(item.id));
    updateSelection();
  } else if ((event.ctrlKey || event.metaKey) && ['c', 'x'].includes(event.key.toLowerCase())) {
    if (selectedPaths().length) setClipboard(selectedPaths(), event.key.toLowerCase() === 'x');
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
    await paste(DESKTOP).catch(errorBox);
  } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    const r = current.el.getBoundingClientRect();
    if (!selected.has(current.id)) select(current.id);
    iconMenu(current, r.left + r.width / 2, r.top + r.height / 2);
  } else if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.altKey) {
    const start = items.indexOf(current) + 1;
    const match = [...items.slice(start), ...items.slice(0, start)].find(item => item.label.toLowerCase().startsWith(event.key.toLowerCase()));
    if (match) select(match.id);
  } else return;
  event.preventDefault();
}

// ---------- Menus and actions ----------

async function renameItem(item) {
  if (!item.entry) return;
  const isLink = extension(item.entry.name) === 'lnk';
  const next = await inlineEdit(item.label$, item.label);
  list.focus({ preventScroll: true });
  if (!next) return;
  const name = isLink ? `${next}.lnk` : next;
  if (!validName(name)) { errorBox('A file name can\'t contain any of the following characters: \\ / : * ? " < > |', { title: 'Rename' }); return; }
  try {
    const target = await vfs.move(item.path, join(DESKTOP, name));
    const positions = { ...settings.get('iconPositions') };
    positions[key(target)] = item.cell;
    settings.set({ iconPositions: positions });
    selected.clear();
    selected.add(key(target));
    focusedId = key(target);
  } catch (error) { errorBox(error, { title: 'Rename' }); }
}

function iconMenu(item, x, y) {
  const many = selected.size > 1;
  const paths = selectedPaths();
  const menuItems = item.entry ? [
    { label: 'Open', bold: true, action: () => selectedItems().forEach(i => i.open()) },
    item.entry.type === 'file' && !many && extension(item.entry.name) !== 'lnk' ? { label: 'Open with Notepad', action: () => launch('notepad', { path: item.path }) } : null,
    '-',
    { label: 'Cut', shortcut: 'Ctrl+X', action: () => setClipboard(paths, true) },
    { label: 'Copy', shortcut: 'Ctrl+C', action: () => setClipboard(paths, false) },
    item.entry.type === 'dir' && canPaste() ? { label: 'Paste', shortcut: 'Ctrl+V', action: () => paste(item.path).catch(errorBox) } : null,
    '-',
    { label: 'Send to computer (download)', action: () => exportPaths(paths).catch(errorBox) },
    { label: 'Delete', shortcut: 'Del', action: () => recyclePaths(paths) },
    { label: 'Rename', shortcut: 'F2', disabled: many, action: () => renameItem(item) },
    '-',
    { label: 'Properties', disabled: many, action: () => showProperties(item.path) }
  ] : [
    { label: 'Open', bold: true, action: () => item.open() },
    item.id === 'sys:recycle' ? { label: 'Empty Recycle Bin', action: emptyBin } : null,
    '-',
    { label: 'Properties', action: () => (item.props ? item.props() : showProperties(item.path)) }
  ];
  showMenu(menuItems.filter(Boolean), { x, y, label: item.label });
}

async function emptyBin() {
  const inBin = await vfs.list(RECYCLE).catch(() => []);
  if (!inBin.length) return;
  const { confirmBox } = await import('./dialogs.js');
  if (await confirmBox(`Are you sure you want to permanently delete these ${inBin.length} items?`, { title: 'Confirm Multiple File Delete', kind: 'warning' })) await vfs.emptyRecycleBin();
}

function backgroundMenu(x, y) {
  showMenu([
    { label: 'View', items: [
      { label: 'Arrange icons by name', action: arrangeByName },
      { label: 'Show hidden files', checked: settings.get('showHidden'), action: () => settings.set({ showHidden: !settings.get('showHidden') }) }
    ] },
    { label: 'Refresh', action: render },
    '-',
    { label: 'Paste', shortcut: 'Ctrl+V', disabled: !canPaste(), action: () => paste(DESKTOP).catch(errorBox) },
    { label: 'Import files from computer…', action: importFromComputer },
    '-',
    { label: 'New', items: [
      { label: 'Folder', icon: 'folder', action: () => createNew('folder') },
      { label: 'Text Document', icon: 'text', action: () => createNew('text') },
      { label: 'Shortcut…', icon: 'shortcut', action: createShortcut }
    ] },
    '-',
    { label: 'Properties', action: () => launch('control', { page: 'display' }) }
  ], { x, y, label: 'Desktop' });
}

function arrangeByName() {
  const positions = { ...settings.get('iconPositions') };
  for (const item of items) delete positions[item.id];
  const system = items.filter(item => !item.entry);
  const rest = items.filter(item => item.entry).sort((a, b) => (a.entry.type === b.entry.type ? a.label.localeCompare(b.label) : a.entry.type === 'dir' ? -1 : 1));
  items = [...system, ...rest];
  layout();
  savePositions();
}

async function importFromComputer() {
  const { pickFiles } = await import('./dom.js');
  const files = await pickFiles();
  try { await importFiles(files, DESKTOP); } catch (error) { errorBox(error); }
}

async function createNew(kind) {
  try {
    const name = await vfs.freeName(DESKTOP, kind === 'folder' ? 'New Folder' : 'New Text Document.txt');
    const path = join(DESKTOP, name);
    if (kind === 'folder') await vfs.mkdir(path);
    else await vfs.write(path, '');
    await render();
    const item = items.find(i => i.id === key(path));
    if (item) { select(item.id); renameItem(item); }
  } catch (error) { errorBox(error); }
}

async function createShortcut() {
  const { apps } = await import('./apps.js');
  const target = await promptBox('Type the location of the item (e.g. C:\\Documents\\Notes.txt), or a program name (e.g. notepad):', { title: 'Create Shortcut' });
  if (!target) return;
  const app = apps().find(a => a.id === target.trim().toLowerCase() || a.run?.includes(target.trim().toLowerCase()));
  let link;
  let label;
  if (app) {
    link = { app: app.id, icon: app.icon };
    label = app.name;
  } else {
    const entry = await vfs.stat(target.trim());
    if (!entry) { errorBox(`The item '${target}' could not be found.`, { title: 'Create Shortcut' }); return; }
    link = { path: entry.path, icon: fileIcon(entry) };
    label = basename(entry.path);
  }
  await vfs.write(join(DESKTOP, await vfs.freeName(DESKTOP, `${label}.lnk`)), JSON.stringify(link));
}

export function focus() {
  list.focus();
}
