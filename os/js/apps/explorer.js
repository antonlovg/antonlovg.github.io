// File Explorer: browse the C: drive, open, rename, move, copy, delete, search, import from and
// export to the real computer, restore from the Recycle Bin and extract zips.
import { h, icon, inlineEdit, pickFiles, formatDate, isNarrow, onLongPress } from '../dom.js';
import * as vfs from '../vfs.js';
import * as settings from '../settings.js';
import { menubar, showMenu } from '../menu.js';
import { openPath, launch } from '../apps.js';
import { normalize, display, parent, join, key, basename, extension, isRoot, isInside, formatSize, validName, RECYCLE } from '../lib/path.js';
import { fileIcon, typeName, shortcutLabel, IMAGE_TYPES } from '../files.js';
import { dragItems } from '../dnd.js';
import { moveInto, recyclePaths, setClipboard, paste, canPaste, isCut, clipboardEvents, importFiles, filesFromDataTransfer, exportPaths, askExtract, extractZip } from '../fileops.js';
import { errorBox, confirmBox } from '../dialogs.js';
import { showProperties } from '../properties.js';

const PLACES = [
  { label: 'Local Disk (C:)', icon: 'drive', path: 'C:' },
  { label: 'Desktop', icon: 'display', path: 'C:/Desktop' },
  { label: 'Documents', icon: 'documents', path: 'C:/Documents' },
  { label: 'Pictures', icon: 'pictures', path: 'C:/Pictures' },
  { label: 'Games', icon: 'games', path: 'C:/Games' },
  { label: 'DOS', icon: 'dos', path: 'C:/DOS' },
  { label: 'Recycle Bin', icon: 'recycle', path: RECYCLE }
];

export default async function open(ctx) {
  let start = normalize(ctx.args.path || 'C:');
  const startEntry = await vfs.stat(start);
  if (startEntry?.type === 'file' && extension(startEntry.name) === 'zip') {
    const folder = await askExtract(start);
    if (!folder) return;
    start = folder;
  } else if (!startEntry || startEntry.type !== 'dir') {
    start = startEntry ? parent(start) : 'C:';
  }

  const win = ctx.window({ width: 640, height: 430, minWidth: 320, minHeight: 220 });
  const uid = win.id;
  let current = start;
  const back = [];
  const forward = [];
  let entries = [];
  let view = settings.get('explorerView') === 'details' ? 'details' : 'icons';
  let sort = { by: 'name', dir: 1 };
  let searchText = '';
  let thumbs = [];
  const selected = new Set();
  let anchor = -1;
  let focusIndex = -1;

  // ---------- Layout ----------
  const button = (label, iconName, action, extra = '') => h('button', { class: 'tool-button', type: 'button', title: label, 'aria-label': label, onclick: action }, icon(iconName, 16, extra), h('span', { class: 'label', text: label }));
  const backButton = button('Back', 'folder', () => goBack());
  const forwardButton = button('Forward', 'folder', () => goForward());
  const upButton = button('Up', 'folder-open', () => goUp());
  backButton.querySelector('.label').textContent = '◀ Back';
  forwardButton.querySelector('.label').textContent = 'Forward ▶';
  backButton.querySelector('svg').remove();
  forwardButton.querySelector('svg').remove();
  const restoreButton = button('Restore', 'recycle', () => restoreSelected());
  const emptyButton = button('Empty Recycle Bin', 'recycle-full', () => emptyBin());
  const viewButton = button('Views', 'display', event => viewMenu(event.currentTarget));
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Explorer toolbar' },
    backButton, forwardButton, upButton, h('span', { class: 'sep' }),
    button('New folder', 'folder', () => newItem('folder')),
    button('Import', 'documents', () => importFromComputer()),
    button('Download', 'drive', () => exportSelected()),
    h('span', { class: 'sep' }), restoreButton, emptyButton, viewButton);
  const addressId = `ex-address-${uid}`;
  const address = h('input', { id: addressId, type: 'text', spellcheck: false, autocomplete: 'off' });
  const searchId = `ex-search-${uid}`;
  const search = h('input', { id: searchId, type: 'search', placeholder: 'Search', spellcheck: false, autocomplete: 'off', class: 'ex-search' });
  const addressBar = h('form', { class: 'ex-address', onsubmit: event => { event.preventDefault(); navigate(address.value); } },
    h('label', { for: addressId, text: 'Address' }), address, h('button', { class: 'button small', type: 'submit', text: 'Go' }),
    h('label', { for: searchId, class: 'sr-only', text: 'Search this folder' }), search);
  const places = h('nav', { class: 'ex-places', 'aria-label': 'Places' }, h('p', { class: 'ex-places-title', text: 'Folders' }),
    h('ul', {}, PLACES.map(place => h('li', {}, h('button', { type: 'button', class: 'ex-place', dataset: { drop: place.path === RECYCLE ? 'recycle' : place.path, path: place.path }, onclick: () => navigate(place.path) }, icon(place.icon, 16), h('span', { text: place.label }))))));
  const list = h('ul', { class: 'ex-list', role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': 'Files', tabIndex: 0 });
  const header = h('div', { class: 'ex-header', role: 'presentation' });
  const pane = h('div', { class: 'ex-pane' }, header, list);
  const statusLeft = h('span', {});
  const statusMid = h('span', { class: 'fixed' });
  const statusRight = h('span', { class: 'fixed' });
  const menus = menubar([
    { label: 'File', items: () => [
      { label: 'Open', disabled: !selected.size, action: openSelected },
      { label: 'New', items: [{ label: 'Folder', icon: 'folder', action: () => newItem('folder') }, { label: 'Text Document', icon: 'text', action: () => newItem('text') }] },
      '-',
      { label: 'Import files from computer…', action: importFromComputer },
      { label: 'Import a folder from computer…', action: () => importFromComputer(true) },
      { label: 'Download to computer', disabled: !selected.size, action: exportSelected },
      '-',
      { label: 'Delete', disabled: !selected.size, action: deleteSelected },
      { label: 'Rename', disabled: selected.size !== 1, action: renameFocused },
      { label: 'Properties', action: () => showProperties(selected.size === 1 ? selectedPaths()[0] : current, { owner: null }) },
      '-',
      { label: 'Close', action: () => win.close() }
    ] },
    { label: 'Edit', items: () => [
      { label: 'Cut', shortcut: 'Ctrl+X', disabled: !selected.size, action: () => setClipboard(selectedPaths(), true) },
      { label: 'Copy', shortcut: 'Ctrl+C', disabled: !selected.size, action: () => setClipboard(selectedPaths(), false) },
      { label: 'Paste', shortcut: 'Ctrl+V', disabled: !canPaste(), action: () => paste(current).catch(errorBox) },
      '-',
      { label: 'Select All', shortcut: 'Ctrl+A', action: selectAll },
      { label: 'Invert Selection', action: invertSelection }
    ] },
    { label: 'View', items: () => [
      { label: 'Icons', checked: view === 'icons', radio: true, action: () => setView('icons') },
      { label: 'Details', checked: view === 'details', radio: true, action: () => setView('details') },
      '-',
      { label: 'Sort by', items: ['name', 'size', 'type', 'date'].map(by => ({ label: by[0].toUpperCase() + by.slice(1), checked: sort.by === by, radio: true, action: () => setSort(by) })) },
      { label: 'Show hidden files', checked: settings.get('showHidden'), action: () => settings.set({ showHidden: !settings.get('showHidden') }) },
      '-',
      { label: 'Refresh', shortcut: 'F5', action: refresh }
    ] },
    { label: 'Go', items: () => [
      { label: 'Back', shortcut: 'Alt+←', disabled: !back.length, action: goBack },
      { label: 'Forward', shortcut: 'Alt+→', disabled: !forward.length, action: goForward },
      { label: 'Up One Level', shortcut: 'Backspace', disabled: isRoot(current), action: goUp },
      '-',
      ...PLACES.map(place => ({ label: place.label, icon: place.icon, action: () => navigate(place.path) }))
    ] },
    { label: 'Help', items: [{ label: 'Help Topics', action: () => launch('help', { topic: 'files' }) }, { label: 'About LövOS', action: () => launch('about') }] }
  ]);
  win.body.classList.add('explorer');
  win.body.append(menus, toolbar, addressBar, h('div', { class: `ex-main${isNarrow() ? ' narrow' : ''}` }, places, pane), h('div', { class: 'statusbar' }, statusLeft, statusMid, statusRight));
  win.on('resize', () => win.body.querySelector('.ex-main').classList.toggle('narrow', win.body.offsetWidth < 520));

  // ---------- Navigation ----------
  async function navigate(path, { record = true } = {}) {
    const target = normalize(String(path).trim() || 'C:');
    const entry = await vfs.stat(target);
    if (!entry) { await errorBox(`LövOS cannot find '${display(target)}'. Check the spelling and try again.`, { title: 'Address Bar', owner: win }); address.value = display(current); return; }
    if (entry.type === 'file') { openPath(entry.path); return; }
    if (record && key(target) !== key(current)) { back.push(current); forward.length = 0; }
    current = entry.path;
    searchText = '';
    search.value = '';
    selected.clear();
    anchor = -1;
    focusIndex = -1;
    win.sessionArgs = { path: current };
    await refresh();
    list.focus({ preventScroll: true });
  }
  const goBack = () => { if (back.length) { forward.push(current); navigate(back.pop(), { record: false }); } };
  const goForward = () => { if (forward.length) { back.push(current); navigate(forward.pop(), { record: false }); } };
  const goUp = () => { if (!isRoot(current)) navigate(parent(current)); };

  // ---------- Rendering ----------
  const compare = (a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    let result = 0;
    if (sort.by === 'size') result = a.size - b.size;
    else if (sort.by === 'date') result = a.mtime - b.mtime;
    else if (sort.by === 'type') result = typeName(a).localeCompare(typeName(b));
    return (result || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })) * sort.dir;
  };

  async function refresh() {
    const inBin = key(current) === key(RECYCLE);
    const showHidden = settings.get('showHidden');
    let items;
    if (searchText) {
      const needle = searchText.toLowerCase();
      items = (await vfs.walk(current)).filter(entry => entry.name.toLowerCase().includes(needle) && !isInside(entry.path, RECYCLE));
    } else {
      items = await vfs.list(current);
    }
    entries = items.filter(entry => showHidden || inBin || !(entry.name.startsWith('$') || entry.name.startsWith('.'))).sort(compare);
    const name = searchText ? `Search results in ${basename(current)}` : isRoot(current) ? 'Local Disk (C:)' : basename(current);
    win.setTitle(name);
    win.setIcon(isRoot(current) ? 'drive' : fileIcon({ type: 'dir', path: current, name }));
    address.value = display(current);
    backButton.disabled = !back.length;
    forwardButton.disabled = !forward.length;
    upButton.disabled = isRoot(current);
    restoreButton.hidden = !inBin;
    emptyButton.hidden = !inBin;
    pane.dataset.drop = inBin ? 'recycle' : current;
    places.querySelectorAll('.ex-place').forEach(el => el.classList.toggle('current', key(el.dataset.path) === key(current)));
    render();
  }

  function render() {
    thumbs.forEach(url => URL.revokeObjectURL(url));
    thumbs = [];
    const inBin = key(current) === key(RECYCLE);
    list.className = `ex-list view-${view}`;
    header.hidden = view !== 'details';
    header.replaceChildren(...[['name', 'Name'], ['size', 'Size'], ['type', 'Type'], ['date', inBin ? 'Deleted' : 'Modified']].map(([by, label]) =>
      h('button', { type: 'button', class: `ex-col ex-col-${by}`, 'aria-label': `Sort by ${label}`, onclick: () => setSort(by) }, label, sort.by === by ? h('span', { 'aria-hidden': 'true', text: sort.dir > 0 ? ' ▲' : ' ▼' }) : null)));
    for (const path of [...selected]) if (!entries.some(entry => entry.key === path)) selected.delete(path);
    list.replaceChildren(...entries.map((entry, index) => {
      const label = h('span', { class: 'ex-name', text: shortcutLabel(entry) });
      let glyph = icon(fileIcon(entry), view === 'icons' ? 32 : 16);
      if (view === 'icons' && entry.type === 'file' && IMAGE_TYPES.includes(extension(entry.name)) && entry.size < 4 * 1024 * 1024 && entry.data) {
        const url = URL.createObjectURL(entry.data);
        thumbs.push(url);
        glyph = h('img', { class: 'ex-thumb', src: url, alt: '', loading: 'lazy', draggable: false });
      }
      const li = h('li', {
        role: 'option', id: `ex-${uid}-${index}`, class: `ex-item${selected.has(entry.key) ? ' selected' : ''}${isCut(entry.path) ? ' cut' : ''}`,
        'aria-selected': String(selected.has(entry.key)), title: searchText ? display(entry.path) : entry.name,
        dataset: { index, ...(entry.type === 'dir' && !inBin ? { drop: entry.path } : {}) }
      },
      h('span', { class: 'ex-glyph' }, glyph), label,
      view === 'details' ? h('span', { class: 'ex-size', text: entry.type === 'dir' ? '' : formatSize(entry.size) }) : null,
      view === 'details' ? h('span', { class: 'ex-type', text: inBin && entry.origin ? display(parent(entry.origin)) : typeName(entry) }) : null,
      view === 'details' ? h('span', { class: 'ex-date', text: formatDate(inBin && entry.deleted ? entry.deleted : entry.mtime) }) : null);
      li.addEventListener('pointerdown', event => onItemPointer(event, index));
      li.addEventListener('dblclick', () => openEntry(entry));
      li.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); if (!selected.has(entry.key)) selectOnly(index); itemMenu(event.clientX, event.clientY); });
      onLongPress(li, event => { if (!selected.has(entry.key)) selectOnly(index); itemMenu(event.clientX, event.clientY); });
      li._label = label;
      return li;
    }));
    if (!entries.length) list.append(h('li', { class: 'ex-empty', role: 'presentation', text: searchText ? 'No files match your search.' : 'This folder is empty.' }));
    updateStatus();
    if (focusIndex >= entries.length) focusIndex = entries.length - 1;
    if (focusIndex >= 0) list.setAttribute('aria-activedescendant', `ex-${uid}-${focusIndex}`);
    else list.removeAttribute('aria-activedescendant');
    markFocus();
  }

  async function updateStatus() {
    const chosen = entries.filter(entry => selected.has(entry.key));
    const bytes = (chosen.length ? chosen : entries).filter(entry => entry.type === 'file').reduce((sum, entry) => sum + entry.size, 0);
    statusLeft.textContent = chosen.length ? `${chosen.length} object(s) selected` : `${entries.length} object(s)`;
    statusMid.textContent = formatSize(bytes);
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    statusRight.textContent = estimate?.quota ? `${formatSize(Math.max(0, estimate.quota - estimate.usage))} free` : 'My Computer';
  }

  // ---------- Selection ----------
  const items = () => [...list.querySelectorAll('.ex-item')];
  const selectedPaths = () => entries.filter(entry => selected.has(entry.key)).map(entry => entry.path);

  function syncSelection() {
    for (const li of items()) {
      const entry = entries[Number(li.dataset.index)];
      li.classList.toggle('selected', selected.has(entry.key));
      li.setAttribute('aria-selected', String(selected.has(entry.key)));
    }
    updateStatus();
  }

  function markFocus() {
    items().forEach(li => li.classList.toggle('focused', Number(li.dataset.index) === focusIndex));
  }

  function setFocus(index) {
    focusIndex = index;
    if (index >= 0) {
      list.setAttribute('aria-activedescendant', `ex-${uid}-${index}`);
      list.querySelector(`#ex-${uid}-${index}`)?.scrollIntoView({ block: 'nearest' });
    }
    markFocus();
  }

  function selectOnly(index) {
    selected.clear();
    if (entries[index]) selected.add(entries[index].key);
    anchor = index;
    setFocus(index);
    syncSelection();
  }

  function selectRange(index) {
    const from = Math.max(0, anchor);
    selected.clear();
    for (let i = Math.min(from, index); i <= Math.max(from, index); i++) selected.add(entries[i].key);
    setFocus(index);
    syncSelection();
  }

  function selectAll() { entries.forEach(entry => selected.add(entry.key)); syncSelection(); }
  function invertSelection() { entries.forEach(entry => (selected.has(entry.key) ? selected.delete(entry.key) : selected.add(entry.key))); syncSelection(); }

  async function onItemPointer(event, index) {
    if (event.button !== 0) return;
    event.stopPropagation();
    list.focus({ preventScroll: true });
    const entry = entries[index];
    if (event.shiftKey) { selectRange(index); return; }
    if (event.ctrlKey || event.metaKey) {
      if (selected.has(entry.key)) selected.delete(entry.key); else selected.add(entry.key);
      anchor = index;
      setFocus(index);
      syncSelection();
      return;
    }
    if (!selected.has(entry.key)) selectOnly(index);
    else setFocus(index);
    if (event.pointerType === 'touch') {
      const result = await dragItems(event, { count: selected.size, label: entry.name, iconName: fileIcon(entry), threshold: 12 });
      if (!result) openEntry(entry);
      else await handleDrop(result);
      return;
    }
    const result = await dragItems(event, { count: selected.size, label: shortcutLabel(entry), iconName: fileIcon(entry) });
    if (!result) { if (selected.size > 1) selectOnly(index); return; }
    await handleDrop(result);
  }

  async function handleDrop(result) {
    const target = result.target;
    if (!target) return;
    const paths = selectedPaths();
    try {
      if (target.dataset.drop === 'recycle') await recyclePaths(paths, { owner: win });
      else if (target.dataset.drop) await moveInto(paths, target.dataset.drop, { copy: result.copy });
    } catch (error) { errorBox(error, { owner: win }); }
  }

  // Click on empty space clears the selection.
  pane.addEventListener('pointerdown', event => {
    if (event.target.closest('.ex-item, .ex-header')) return;
    if (!event.ctrlKey) { selected.clear(); syncSelection(); }
    list.focus({ preventScroll: true });
  });
  pane.addEventListener('contextmenu', event => {
    if (event.target.closest('.ex-item')) return;
    event.preventDefault();
    backgroundMenu(event.clientX, event.clientY);
  });
  onLongPress(pane, event => { if (!event.target.closest('.ex-item')) backgroundMenu(event.clientX, event.clientY); });

  // ---------- Keyboard ----------
  function columns() {
    if (view !== 'icons') return 1;
    const first = items()[0];
    if (!first) return 1;
    return Math.max(1, Math.floor(list.clientWidth / first.offsetWidth));
  }

  list.addEventListener('keydown', async event => {
    const count = entries.length;
    const ctrl = event.ctrlKey || event.metaKey;
    const moveTo = index => {
      const next = Math.max(0, Math.min(count - 1, index));
      if (event.shiftKey) selectRange(next);
      else if (ctrl) setFocus(next);
      else selectOnly(next);
    };
    const step = { ArrowDown: columns(), ArrowUp: -columns(), ArrowRight: view === 'icons' ? 1 : 0, ArrowLeft: view === 'icons' ? -1 : 0 }[event.key];
    if (event.altKey && event.key === 'ArrowLeft') goBack();
    else if (event.altKey && event.key === 'ArrowRight') goForward();
    else if (step !== undefined && count) { if (step) moveTo(focusIndex < 0 ? 0 : focusIndex + step); }
    else if (event.key === 'Home' && count) moveTo(0);
    else if (event.key === 'End' && count) moveTo(count - 1);
    else if (event.key === ' ' && ctrl && focusIndex >= 0) { const entry = entries[focusIndex]; if (selected.has(entry.key)) selected.delete(entry.key); else selected.add(entry.key); syncSelection(); }
    else if (event.key === 'Enter') openSelected();
    else if (event.key === 'Backspace') goUp();
    else if (event.key === 'Delete') deleteSelected(event.shiftKey);
    else if (event.key === 'F2') renameFocused();
    else if (event.key === 'F5') refresh();
    else if (ctrl && event.key.toLowerCase() === 'a') selectAll();
    else if (ctrl && event.key.toLowerCase() === 'c') { if (selected.size) setClipboard(selectedPaths(), false); }
    else if (ctrl && event.key.toLowerCase() === 'x') { if (selected.size) setClipboard(selectedPaths(), true); }
    else if (ctrl && event.key.toLowerCase() === 'v') paste(current).catch(error => errorBox(error, { owner: win }));
    else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      const li = list.querySelector(`#ex-${uid}-${focusIndex}`);
      const r = (li || list).getBoundingClientRect();
      if (li) { if (!selected.has(entries[focusIndex].key)) selectOnly(focusIndex); itemMenu(r.left + 20, r.top + r.height / 2); } else backgroundMenu(r.left + 20, r.top + 20);
    } else if (event.key.length === 1 && /\S/.test(event.key) && !ctrl && !event.altKey && count) {
      const startAt = focusIndex + 1;
      const order = [...entries.keys()].map(i => (i + startAt) % count);
      const match = order.find(i => entries[i].name.toLowerCase().startsWith(event.key.toLowerCase()));
      if (match !== undefined) selectOnly(match);
    } else return;
    event.preventDefault();
  });
  win.el.addEventListener('keydown', event => {
    if (event.target === list || event.target.closest('.inline-edit')) return;
    if (event.altKey && event.key === 'ArrowLeft') { goBack(); event.preventDefault(); }
    if (event.altKey && event.key === 'ArrowRight') { goForward(); event.preventDefault(); }
  });

  let searchTimer = 0;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchText = search.value.trim(); refresh(); }, 200);
  });

  // ---------- Actions ----------
  async function openEntry(entry) {
    if (key(current) === key(RECYCLE)) { showProperties(entry.path); return; }
    if (entry.type === 'dir') { navigate(entry.path); return; }
    if (extension(entry.name) === 'zip') {
      const folder = await askExtract(entry.path, win);
      if (folder) navigate(folder);
      return;
    }
    openPath(entry.path);
  }

  function openSelected() {
    const chosen = entries.filter(entry => selected.has(entry.key));
    if (!chosen.length && entries[focusIndex]) chosen.push(entries[focusIndex]);
    const folder = chosen.find(entry => entry.type === 'dir');
    if (folder && chosen.length === 1) { openEntry(folder); return; }
    chosen.forEach(entry => (entry.type === 'dir' ? launch('explorer', { path: entry.path }) : openEntry(entry)));
  }

  async function deleteSelected(permanent = false) {
    const paths = selectedPaths();
    if (await recyclePaths(paths, { owner: win, permanent })) selected.clear();
  }

  async function renameFocused() {
    const index = focusIndex >= 0 ? focusIndex : entries.findIndex(entry => selected.has(entry.key));
    const entry = entries[index];
    const li = list.querySelector(`#ex-${uid}-${index}`);
    if (!entry || !li) return;
    const isLink = extension(entry.name) === 'lnk';
    const next = await inlineEdit(li._label, shortcutLabel(entry));
    list.focus({ preventScroll: true });
    if (!next) return;
    const name = isLink ? `${next}.lnk` : next;
    if (!validName(name)) { errorBox('A file name can\'t contain any of the following characters: \\ / : * ? " < > |', { title: 'Rename', owner: win }); return; }
    try {
      const target = await vfs.move(entry.path, join(parent(entry.path), name));
      selected.clear();
      selected.add(key(target));
    } catch (error) { errorBox(error, { title: 'Rename', owner: win }); }
  }

  async function newItem(kind) {
    if (key(current) === key(RECYCLE)) return;
    try {
      const name = await vfs.freeName(current, kind === 'folder' ? 'New Folder' : 'New Text Document.txt');
      const path = join(current, name);
      if (kind === 'folder') await vfs.mkdir(path); else await vfs.write(path, '');
      searchText = '';
      await refresh();
      const index = entries.findIndex(entry => entry.key === key(path));
      if (index >= 0) { selectOnly(index); renameFocused(); }
    } catch (error) { errorBox(error, { owner: win }); }
  }

  async function importFromComputer(folder = false) {
    const files = await pickFiles({ folder });
    try {
      const paths = await importFiles(files, key(current) === key(RECYCLE) ? 'C:/Documents' : current);
      navigator.storage?.persist?.().catch(() => {});
      if (paths.length === 1 && extension(paths[0]) === 'zip') {
        const extract = await confirmBox(`Extract ${basename(paths[0])} here?`, { title: 'Import', owner: win });
        if (extract) await extractZip(paths[0]);
      }
    } catch (error) { errorBox(error, { owner: win }); }
  }

  function exportSelected() {
    const paths = selectedPaths();
    exportPaths(paths.length ? paths : [current]).catch(error => errorBox(error, { owner: win }));
  }

  async function restoreSelected() {
    try { for (const path of selectedPaths()) await vfs.restore(path); } catch (error) { errorBox(error, { owner: win }); }
  }

  async function emptyBin() {
    if (!entries.length) return;
    if (await confirmBox(`Are you sure you want to permanently delete these ${entries.length} items?`, { title: 'Confirm Multiple File Delete', kind: 'warning', owner: win })) await vfs.emptyRecycleBin();
  }

  function setView(next) {
    view = next;
    settings.set({ explorerView: next });
    render();
  }

  function setSort(by) {
    sort = sort.by === by ? { by, dir: -sort.dir } : { by, dir: 1 };
    entries.sort(compare);
    render();
  }

  function viewMenu(anchorEl) {
    showMenu([
      { label: 'Icons', checked: view === 'icons', radio: true, action: () => setView('icons') },
      { label: 'Details', checked: view === 'details', radio: true, action: () => setView('details') }
    ], { anchor: anchorEl, label: 'Views' });
  }

  function itemMenu(x, y) {
    const chosen = entries.filter(entry => selected.has(entry.key));
    const one = chosen.length === 1 ? chosen[0] : null;
    const inBin = key(current) === key(RECYCLE);
    if (inBin) {
      showMenu([
        { label: 'Restore', bold: true, action: restoreSelected },
        '-',
        { label: 'Delete permanently', action: () => deleteSelected(true) },
        '-',
        { label: 'Properties', disabled: !one, action: () => showProperties(one.path) }
      ], { x, y, label: 'File' });
      return;
    }
    showMenu([
      { label: one?.type === 'dir' ? 'Open' : 'Open', bold: true, action: openSelected },
      one?.type === 'dir' ? { label: 'Open in new window', action: () => launch('explorer', { path: one.path }) } : null,
      one && extension(one.name) === 'zip' ? { label: 'Extract All…', action: () => openEntry(one) } : null,
      one?.type === 'file' && IMAGE_TYPES.includes(extension(one.name)) ? { label: 'Set as desktop background', action: () => settings.set({ wallpaper: 'image', wallpaperImage: one.path }) } : null,
      one?.type === 'file' && !['lnk', 'zip'].includes(extension(one.name)) ? { label: 'Open with', items: [
        { label: 'Notepad', icon: 'notepad', action: () => launch('notepad', { path: one.path }) },
        { label: 'Paint', icon: 'paint', action: () => launch('paint', { path: one.path }) },
        { label: 'MS-DOS Prompt', icon: 'dos', action: () => launch('dos', { path: one.path }) }
      ] } : null,
      one?.type === 'dir' ? { label: 'Open MS-DOS Prompt here', icon: 'dos', action: () => launch('dos', { mount: one.path }) } : null,
      '-',
      { label: 'Cut', shortcut: 'Ctrl+X', action: () => setClipboard(selectedPaths(), true) },
      { label: 'Copy', shortcut: 'Ctrl+C', action: () => setClipboard(selectedPaths(), false) },
      one?.type === 'dir' && canPaste() ? { label: 'Paste into folder', action: () => paste(one.path).catch(errorBox) } : null,
      '-',
      { label: 'Download to computer', action: exportSelected },
      { label: 'Create shortcut on desktop', disabled: !one, action: async () => {
        await vfs.write(join('C:/Desktop', await vfs.freeName('C:/Desktop', `${shortcutLabel(one)}.lnk`)), JSON.stringify({ path: one.path, icon: fileIcon(one) }));
      } },
      { label: 'Delete', shortcut: 'Del', action: () => deleteSelected() },
      { label: 'Rename', shortcut: 'F2', disabled: !one, action: renameFocused },
      '-',
      { label: 'Properties', disabled: !one, action: () => showProperties(one.path) }
    ].filter(Boolean), { x, y, label: 'File' });
  }

  function backgroundMenu(x, y) {
    const inBin = key(current) === key(RECYCLE);
    showMenu([
      { label: 'View', items: [
        { label: 'Icons', checked: view === 'icons', radio: true, action: () => setView('icons') },
        { label: 'Details', checked: view === 'details', radio: true, action: () => setView('details') }
      ] },
      { label: 'Sort by', items: ['name', 'size', 'type', 'date'].map(by => ({ label: by[0].toUpperCase() + by.slice(1), checked: sort.by === by, radio: true, action: () => setSort(by) })) },
      { label: 'Refresh', action: refresh },
      '-',
      inBin ? { label: 'Empty Recycle Bin', action: emptyBin } : { label: 'Paste', shortcut: 'Ctrl+V', disabled: !canPaste(), action: () => paste(current).catch(errorBox) },
      inBin ? null : { label: 'Import files from computer…', action: () => importFromComputer() },
      inBin ? null : { label: 'New', items: [{ label: 'Folder', icon: 'folder', action: () => newItem('folder') }, { label: 'Text Document', icon: 'text', action: () => newItem('text') }] },
      inBin ? null : { label: 'Open MS-DOS Prompt here', icon: 'dos', action: () => launch('dos', { mount: current }) },
      '-',
      { label: 'Properties', action: () => showProperties(current) }
    ].filter(Boolean), { x, y, label: 'Folder' });
  }

  // ---------- Live updates and drops from the computer ----------
  const onChange = event => {
    if (win.closed) return;
    const touched = event.detail.dirs.some(dir => key(dir) === key(current) || (searchText && isInside(dir, current)));
    const gone = event.detail.paths.some(path => isInside(current, path));
    if (gone) {
      vfs.stat(current).then(entry => { if (!entry) navigate(parent(current) || 'C:', { record: false }); else if (touched) refresh(); });
    } else if (touched) refresh();
  };
  vfs.events.addEventListener('change', onChange);
  const onClipboard = () => items().forEach(li => li.classList.toggle('cut', isCut(entries[Number(li.dataset.index)].path)));
  clipboardEvents.addEventListener('change', onClipboard);
  const onSettings = event => { if ('showHidden' in event.detail) refresh(); };
  settings.events.addEventListener('change', onSettings);
  win.on('close', () => {
    vfs.events.removeEventListener('change', onChange);
    clipboardEvents.removeEventListener('change', onClipboard);
    settings.events.removeEventListener('change', onSettings);
    thumbs.forEach(url => URL.revokeObjectURL(url));
  });
  pane.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); pane.classList.add('drop-hover'); } });
  pane.addEventListener('dragleave', event => { if (!pane.contains(event.relatedTarget)) pane.classList.remove('drop-hover'); });
  pane.addEventListener('drop', async event => {
    event.preventDefault();
    pane.classList.remove('drop-hover');
    const folder = event.target.closest('.ex-item[data-drop]')?.dataset.drop || (key(current) === key(RECYCLE) ? 'C:/Documents' : current);
    try {
      await importFiles(await filesFromDataTransfer(event.dataTransfer), folder);
      navigator.storage?.persist?.().catch(() => {});
    } catch (error) { errorBox(error, { owner: win }); }
  });

  win.onArgs = args => { if (args.path) navigate(args.path); };
  await navigate(start, { record: false });
  if (ctx.args.search) search.focus();
}
