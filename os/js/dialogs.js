// Standard dialogs: message boxes, a text prompt and the Open / Save As file dialog.
import { h, icon, formatDate } from './dom.js';
import * as wm from './wm.js';
import * as vfs from './vfs.js';
import { normalize, display, parent, join, extension, validName, formatSize, isRoot } from './lib/path.js';
import { play } from './sound.js';
import { fileIcon } from './files.js';

function buttonRow(labels, onChoose, { defaultIndex = 0 } = {}) {
  const row = h('div', { class: 'dialog-buttons' });
  labels.forEach((label, index) => {
    const button = h('button', { class: `button${index === defaultIndex ? ' default' : ''}`, type: 'button', text: label, onclick: () => onChoose(label) });
    if (index === defaultIndex) button.dataset.autofocus = '';
    row.append(button);
  });
  return row;
}

// Resolves with the label of the button pressed, or null when closed with ✕ or Esc.
export function messageBox(text, { title = 'LövOS', kind = 'info', buttons = ['OK'], owner = null, defaultIndex = 0, detail = '' } = {}) {
  return new Promise(resolve => {
    let result = null;
    const win = wm.open({ title, icon: kind, owner, width: 380, height: 'auto', resizable: false, minimizable: false, className: 'dialog', silent: true, center: !owner });
    win.body.append(
      h('div', { class: 'msgbox' },
        icon(kind, 32, 'msgbox-icon'),
        h('div', { class: 'msgbox-text' }, h('p', { text }), detail ? h('p', { class: 'msgbox-detail', text: detail }) : null)),
      buttonRow(buttons, label => { result = label; win.close({ force: true }); }, { defaultIndex }));
    win.el.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); win.close({ force: true }); } });
    const finish = () => resolve(result);
    wm.events.addEventListener('close', function handler(event) {
      if (event.detail === win) { wm.events.removeEventListener('close', handler); finish(); }
    });
    play(kind === 'error' ? 'error' : 'ding');
    win.focus();
  });
}

export const alertBox = (text, options = {}) => messageBox(text, { kind: 'info', ...options });
export const errorBox = (error, options = {}) => messageBox(error?.message || String(error), { kind: 'error', title: options.title || 'Error', ...options });
export const confirmBox = async (text, options = {}) => (await messageBox(text, { kind: 'question', buttons: ['Yes', 'No'], ...options })) === 'Yes';

// A one-line text prompt. Resolves with the text, or null when cancelled.
export function promptBox(label, { title = 'LövOS', value = '', owner = null, validate = null, okLabel = 'OK' } = {}) {
  return new Promise(resolve => {
    let result = null;
    const win = wm.open({ title, icon: 'question', owner, width: 380, height: 'auto', resizable: false, minimizable: false, className: 'dialog', silent: true });
    const id = `prompt-${win.id}`;
    const input = h('input', { id, type: 'text', value, autocomplete: 'off', spellcheck: false, dataset: { autofocus: '' } });
    const error = h('p', { class: 'field-error', role: 'alert' });
    const submit = () => {
      const problem = validate?.(input.value);
      if (problem) { error.textContent = problem; play('error'); input.focus(); return; }
      result = input.value;
      win.close({ force: true });
    };
    const form = h('form', { class: 'prompt', onsubmit: event => { event.preventDefault(); submit(); } },
      h('label', { for: id, text: label }), input, error,
      h('div', { class: 'dialog-buttons' },
        h('button', { class: 'button default', type: 'submit', text: okLabel }),
        h('button', { class: 'button', type: 'button', text: 'Cancel', onclick: () => win.close({ force: true }) })));
    win.body.append(form);
    win.el.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); win.close({ force: true }); } });
    wm.events.addEventListener('close', function handler(event) {
      if (event.detail === win) { wm.events.removeEventListener('close', handler); resolve(result); }
    });
    input.focus();
    input.select();
  });
}

// Open / Save As. filters: [{ label: 'Text Documents (*.txt)', ext: ['txt'] }, { label: 'All Files (*.*)', ext: [] }]
// Resolves with the chosen path, or null.
export function fileDialog({ mode = 'open', title, owner = null, folder = 'C:/Documents', name = '', filters = [{ label: 'All Files (*.*)', ext: [] }] } = {}) {
  return new Promise(async resolve => {
    let result = null;
    let current = (await vfs.stat(folder))?.type === 'dir' ? normalize(folder) : 'C:/Documents';
    if (!(await vfs.stat(current))) current = 'C:';
    let filter = filters[0];
    const win = wm.open({ title: title || (mode === 'save' ? 'Save As' : 'Open'), icon: mode === 'save' ? 'documents' : 'folder-open', owner, width: 520, height: 400, minWidth: 380, minHeight: 300, className: 'dialog file-dialog', minimizable: false, maximizable: false, silent: true });
    const uid = win.id;
    const location = h('select', { id: `fd-loc-${uid}`, class: 'fd-location' });
    const upButton = h('button', { class: 'tool-button', type: 'button', title: 'Up one level', 'aria-label': 'Up one level' }, icon('folder', 16), h('span', { class: 'arrow-up', 'aria-hidden': 'true', text: '↑' }));
    const newFolderButton = h('button', { class: 'tool-button', type: 'button', title: 'New folder', 'aria-label': 'New folder' }, icon('folder', 16), h('span', { 'aria-hidden': 'true', text: '+' }));
    const listEl = h('ul', { class: 'fd-list', role: 'listbox', 'aria-label': 'Files', tabIndex: 0 });
    const nameInput = h('input', { id: `fd-name-${uid}`, type: 'text', value: name, autocomplete: 'off', spellcheck: false });
    const typeSelect = h('select', { id: `fd-type-${uid}` }, filters.map((f, i) => h('option', { value: i, text: f.label })));
    const okButton = h('button', { class: 'button default', type: 'submit', text: mode === 'save' ? 'Save' : 'Open' });
    const form = h('form', { class: 'fd' },
      h('div', { class: 'fd-top' }, h('label', { for: `fd-loc-${uid}`, text: mode === 'save' ? 'Save in:' : 'Look in:' }), location, upButton, newFolderButton),
      listEl,
      h('div', { class: 'fd-fields' },
        h('label', { for: `fd-name-${uid}`, text: 'File name:' }), nameInput, okButton,
        h('label', { for: `fd-type-${uid}`, text: mode === 'save' ? 'Save as type:' : 'Files of type:' }), typeSelect,
        h('button', { class: 'button', type: 'button', text: 'Cancel', onclick: () => win.close({ force: true }) })));
    win.body.append(form);

    const matches = entry => entry.type === 'dir' || !filter.ext.length || filter.ext.includes(extension(entry.name));
    let entries = [];
    async function show(path) {
      current = normalize(path);
      const chain = [];
      for (let p = current; p; p = parent(p)) chain.unshift(p);
      location.replaceChildren(...chain.map((p, i) => h('option', { value: p, text: `${'\u00a0\u00a0'.repeat(i)}${isRoot(p) ? 'C:\\' : p.split('/').at(-1)}`, selected: p === current })));
      upButton.disabled = isRoot(current);
      entries = (await vfs.list(current)).filter(e => !e.name.startsWith('$') && matches(e));
      listEl.replaceChildren(...entries.map((entry, index) => {
        const li = h('li', { role: 'option', 'aria-selected': 'false', id: `fd-${uid}-${index}`, dataset: { index } },
          icon(fileIcon(entry), 16), h('span', { text: entry.name }),
          h('span', { class: 'fd-meta', text: entry.type === 'dir' ? 'Folder' : `${formatSize(entry.size)} · ${formatDate(entry.mtime)}` }));
        li.addEventListener('click', () => select(index));
        li.addEventListener('dblclick', () => activate(index));
        return li;
      }));
      if (!entries.length) listEl.append(h('li', { class: 'fd-empty', text: 'This folder is empty.' }));
      selected = -1;
    }
    let selected = -1;
    function select(index) {
      selected = index;
      listEl.querySelectorAll('[role="option"]').forEach(li => li.setAttribute('aria-selected', String(Number(li.dataset.index) === index)));
      const li = listEl.querySelector(`[data-index="${index}"]`);
      if (li) { listEl.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
      const entry = entries[index];
      if (entry?.type === 'file') nameInput.value = entry.name;
    }
    async function activate(index) {
      const entry = entries[index];
      if (!entry) return;
      if (entry.type === 'dir') await show(entry.path);
      else { nameInput.value = entry.name; await submit(); }
    }
    listEl.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') select(Math.min(entries.length - 1, selected + 1));
      else if (event.key === 'ArrowUp') select(Math.max(0, selected - 1));
      else if (event.key === 'Enter' && selected >= 0) activate(selected);
      else if (event.key === 'Backspace') { if (!isRoot(current)) show(parent(current)); }
      else return;
      event.preventDefault();
    });
    location.addEventListener('change', () => show(location.value));
    upButton.addEventListener('click', () => { if (!isRoot(current)) show(parent(current)); });
    newFolderButton.addEventListener('click', async () => {
      const folderName = await promptBox('Name of the new folder:', { title: 'New Folder', value: await vfs.freeName(current, 'New Folder'), owner: win, validate: v => (validName(v) ? '' : 'That name is not allowed.') });
      if (folderName) { await vfs.mkdir(join(current, folderName)); await show(current); }
    });
    typeSelect.addEventListener('change', () => { filter = filters[Number(typeSelect.value)]; show(current); });

    async function submit() {
      let text = nameInput.value.trim();
      if (!text) { play('error'); nameInput.focus(); return; }
      const target = normalize(text, current);
      const existing = await vfs.stat(target);
      if (existing?.type === 'dir') { nameInput.value = ''; await show(target); return; }
      if (mode === 'open') {
        if (!existing) { await messageBox(`${display(target)}\nFile not found. Check the file name and try again.`, { kind: 'warning', title: win.title, owner: win }); return; }
      } else {
        if (!validName(target.split('/').at(-1))) { await messageBox('The file name is not valid.', { kind: 'warning', title: win.title, owner: win }); return; }
        const wanted = filter.ext[0];
        let path = target;
        if (wanted && !extension(path) && !existing) path = `${path}.${wanted}`;
        if (!(await vfs.stat(parent(path)))) { await messageBox('That folder does not exist.', { kind: 'warning', title: win.title, owner: win }); return; }
        if (await vfs.stat(path)) {
          const replace = await confirmBox(`${display(path)} already exists.\nDo you want to replace it?`, { title: 'Confirm Save As', owner: win, kind: 'warning' });
          if (!replace) return;
        }
        result = path;
        win.close({ force: true });
        return;
      }
      result = target;
      win.close({ force: true });
    }
    form.addEventListener('submit', event => { event.preventDefault(); submit(); });
    win.el.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); win.close({ force: true }); } });
    wm.events.addEventListener('close', function handler(event) {
      if (event.detail === win) { wm.events.removeEventListener('close', handler); resolve(result); }
    });
    await show(current);
    nameInput.focus();
  });
}
