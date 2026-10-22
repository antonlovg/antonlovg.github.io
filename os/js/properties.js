// The Properties dialog for files, folders and the C: drive.
import { h, icon, formatDate } from './dom.js';
import * as wm from './wm.js';
import * as vfs from './vfs.js';
import { display, parent, formatSize, isRoot } from './lib/path.js';
import { fileIcon, typeName, shortcutLabel } from './files.js';

export async function showProperties(path, { owner = null } = {}) {
  const entry = await vfs.stat(path);
  if (!entry) return;
  const drive = isRoot(entry.path);
  const name = drive ? 'Local Disk (C:)' : shortcutLabel(entry);
  const win = wm.open({ title: `${name} Properties`, icon: drive ? 'drive' : fileIcon(entry), owner, width: 360, height: 'auto', resizable: false, minimizable: false, className: 'dialog', silent: true });
  const rows = h('dl', { class: 'props' });
  const row = (label, value) => rows.append(h('dt', { text: label }), h('dd', { text: value }));
  const header = h('div', { class: 'props-head' }, icon(drive ? 'drive' : fileIcon(entry), 32), h('strong', { text: name }));
  win.body.append(h('div', { class: 'props-body' }, header, h('hr'), rows,
    h('div', { class: 'dialog-buttons' }, h('button', { class: 'button default', type: 'button', text: 'OK', dataset: { autofocus: '' }, onclick: () => win.close({ force: true }) }))));
  win.el.addEventListener('keydown', event => { if (event.key === 'Escape') win.close({ force: true }); });
  row('Type:', drive ? 'Local Disk' : typeName(entry));
  if (!drive) row('Location:', display(parent(entry.path)));
  if (entry.origin) row('Original location:', display(parent(entry.origin)));
  if (entry.type === 'dir') {
    const inside = await vfs.walk(entry.path);
    const files = inside.filter(item => item.type === 'file');
    row('Size:', `${formatSize(files.reduce((sum, item) => sum + item.size, 0))}`);
    row('Contains:', `${files.length} Files, ${inside.length - files.length} Folders`);
  } else {
    row('Size:', `${formatSize(entry.size)} (${entry.size.toLocaleString()} bytes)`);
  }
  if (drive) {
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    if (estimate?.quota) {
      row('Used by this browser:', formatSize(estimate.usage));
      row('Free space:', formatSize(Math.max(0, estimate.quota - estimate.usage)));
      const used = Math.min(100, Math.round(estimate.usage / estimate.quota * 100));
      rows.after(h('div', { class: 'meter', role: 'img', 'aria-label': `${used}% used` }, h('div', { class: 'meter-fill', style: { width: `${Math.max(1, used)}%` } })));
    }
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    row('Protected from clean-up:', persisted ? 'Yes' : 'No (the browser may clear it when space runs low)');
  } else {
    row('Created:', formatDate(entry.ctime));
    row('Modified:', formatDate(entry.mtime));
  }
  win.keepInside();
  win.rect.h = win.el.offsetHeight;
  return win;
}

