// Notepad: a plain-text editor with find/replace, go to line, word wrap and font size.
// Keeps a file's line endings (DOS files use CRLF) when saving.
import { h } from '../dom.js';
import * as vfs from '../vfs.js';
import * as settings from '../settings.js';
import * as wm from '../wm.js';
import { menubar } from '../menu.js';
import { launch } from '../apps.js';
import { basename, display } from '../lib/path.js';
import { fileDialog, messageBox, errorBox, promptBox } from '../dialogs.js';
import { play } from '../sound.js';

const FILTERS = [{ label: 'Text Documents (*.txt)', ext: ['txt'] }, { label: 'All Files (*.*)', ext: [] }];

export default async function open(ctx) {
  const win = ctx.window({ width: 560, height: 400, minWidth: 260, minHeight: 160 });
  let path = null;
  let saved = '';
  let crlf = true;
  let wrap = settings.get('notepadWrap') ?? true;
  let fontSize = settings.get('notepadFont') || 14;
  const editor = h('textarea', { class: 'notepad-text', spellcheck: false, 'aria-label': 'Text', autocomplete: 'off', autocapitalize: 'off', dataset: { autofocus: '' } });
  const position = h('span', { class: 'fixed', text: 'Ln 1, Col 1' });
  const status = h('div', { class: 'statusbar' }, h('span', { text: '' }), position);
  const dirty = () => editor.value !== saved;
  const name = () => (path ? basename(path) : 'Untitled');
  const updateTitle = () => win.setTitle(`${dirty() ? '*' : ''}${name()} - Notepad`);
  const applyFormat = () => {
    editor.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
    editor.style.overflowX = wrap ? 'hidden' : 'auto';
    editor.style.fontSize = `${fontSize}px`;
  };

  win.body.classList.add('notepad');
  win.body.append(menubar([
    { label: 'File', items: [
      { label: 'New', shortcut: 'Ctrl+N', action: newFile },
      { label: 'Open…', shortcut: 'Ctrl+O', action: openFile },
      { label: 'Save', shortcut: 'Ctrl+S', action: save },
      { label: 'Save As…', action: saveAs },
      '-',
      { label: 'Exit', action: () => win.close() }
    ] },
    { label: 'Edit', items: () => [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: () => { editor.focus(); document.execCommand('undo'); } },
      '-',
      { label: 'Cut', shortcut: 'Ctrl+X', action: () => clip('cut') },
      { label: 'Copy', shortcut: 'Ctrl+C', action: () => clip('copy') },
      { label: 'Paste', shortcut: 'Ctrl+V', action: () => clip('paste') },
      { label: 'Delete', shortcut: 'Del', action: () => insert('') },
      '-',
      { label: 'Find…', shortcut: 'Ctrl+F', action: () => findDialog(false) },
      { label: 'Find Next', shortcut: 'F3', action: () => findNext() },
      { label: 'Replace…', shortcut: 'Ctrl+H', action: () => findDialog(true) },
      { label: 'Go To…', shortcut: 'Ctrl+G', action: goTo },
      '-',
      { label: 'Select All', shortcut: 'Ctrl+A', action: () => { editor.focus(); editor.select(); } },
      { label: 'Time/Date', shortcut: 'F5', action: () => insert(new Date().toLocaleString()) }
    ] },
    { label: 'Format', items: () => [
      { label: 'Word Wrap', checked: wrap, action: () => { wrap = !wrap; settings.set({ notepadWrap: wrap }); applyFormat(); } },
      { label: 'Font Size', items: [12, 14, 16, 18, 22, 28].map(size => ({ label: `${size} px`, checked: fontSize === size, radio: true, action: () => { fontSize = size; settings.set({ notepadFont: size }); applyFormat(); } })) }
    ] },
    { label: 'View', items: () => [
      { label: 'Status Bar', checked: !status.hidden, action: () => { status.hidden = !status.hidden; } }
    ] },
    { label: 'Help', items: [{ label: 'About Notepad', action: () => launch('about') }] }
  ]), h('div', { class: 'notepad-frame' }, editor), status);
  applyFormat();

  // ---------- Files ----------
  async function load(target) {
    try {
      const text = await vfs.readText(target);
      crlf = text.includes('\r\n') || !text.includes('\n');
      editor.value = text.replace(/\r\n/g, '\n');
      saved = editor.value;
      path = (await vfs.stat(target)).path;
      win.sessionArgs = { path };
      settings.addRecent(path);
      updateTitle();
      editor.setSelectionRange(0, 0);
      editor.scrollTop = 0;
      updatePosition();
    } catch (error) {
      await errorBox(error, { title: 'Notepad', owner: win });
    }
  }

  async function writeTo(target) {
    try {
      const text = crlf ? editor.value.replace(/\n/g, '\r\n') : editor.value;
      await vfs.write(target, text);
      path = (await vfs.stat(target)).path;
      saved = editor.value;
      win.sessionArgs = { path };
      updateTitle();
      return true;
    } catch (error) {
      await errorBox(error, { title: 'Notepad', owner: win });
      return false;
    }
  }

  async function save() {
    return path ? writeTo(path) : saveAs();
  }

  async function saveAs() {
    const target = await fileDialog({ mode: 'save', owner: win, name: path ? basename(path) : '*.txt'.replace('*', 'Untitled'), folder: path ? path.slice(0, path.lastIndexOf('/')) : 'C:/Documents', filters: FILTERS });
    return target ? writeTo(target) : false;
  }

  // Resolves true if it's fine to throw away the current text.
  async function confirmDiscard() {
    if (!dirty()) return true;
    const answer = await messageBox(`Do you want to save changes to ${path ? display(path) : 'Untitled'}?`, { title: 'Notepad', kind: 'warning', buttons: ['Save', "Don't Save", 'Cancel'], owner: win });
    if (answer === 'Save') return save();
    return answer === "Don't Save";
  }

  async function newFile() {
    if (!(await confirmDiscard())) return;
    editor.value = '';
    saved = '';
    path = null;
    crlf = true;
    win.sessionArgs = {};
    updateTitle();
    editor.focus();
  }

  async function openFile() {
    if (!(await confirmDiscard())) return;
    const target = await fileDialog({ mode: 'open', owner: win, folder: path ? path.slice(0, path.lastIndexOf('/')) : 'C:/Documents', filters: FILTERS });
    if (target) await load(target);
  }

  win.on('close', confirmDiscard);

  // ---------- Editing ----------
  function insert(text) {
    editor.focus();
    if (!document.execCommand('insertText', false, text)) editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, 'end');
    onInput();
  }

  async function clip(action) {
    editor.focus();
    const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    try {
      if (action === 'paste') insert(await navigator.clipboard.readText());
      else {
        await navigator.clipboard.writeText(selection);
        if (action === 'cut') insert('');
      }
    } catch {
      document.execCommand(action);
    }
  }

  function updatePosition() {
    const before = editor.value.slice(0, editor.selectionStart);
    const line = before.split('\n').length;
    const col = before.length - before.lastIndexOf('\n');
    position.textContent = `Ln ${line}, Col ${col}`;
  }

  const onInput = () => { updateTitle(); updatePosition(); };
  editor.addEventListener('input', onInput);
  for (const type of ['keyup', 'click', 'select']) editor.addEventListener(type, updatePosition);

  // ---------- Find, replace, go to ----------
  let lastFind = { text: '', matchCase: false, down: true };

  function findNext(options = lastFind) {
    lastFind = options;
    if (!options.text) { findDialog(false); return false; }
    const hay = options.matchCase ? editor.value : editor.value.toLowerCase();
    const needle = options.matchCase ? options.text : options.text.toLowerCase();
    const index = options.down ? hay.indexOf(needle, editor.selectionEnd) : hay.lastIndexOf(needle, Math.max(0, editor.selectionStart - 1));
    if (index < 0) {
      messageBox(`Cannot find "${options.text}"`, { title: 'Notepad', owner: win });
      return false;
    }
    editor.focus();
    editor.setSelectionRange(index, index + needle.length);
    const line = editor.value.slice(0, index).split('\n').length;
    editor.scrollTop = Math.max(0, (line - 3) * fontSize * 1.4);
    updatePosition();
    return true;
  }

  function findDialog(replace) {
    const dialog = wm.open({ title: replace ? 'Replace' : 'Find', icon: 'notepad', owner: null, width: 380, height: 'auto', resizable: false, minimizable: false, className: 'dialog', silent: true, x: win.rect.x + win.rect.w - 400, y: win.rect.y + 60 });
    const id = `find-${dialog.id}`;
    const what = h('input', { id, type: 'text', value: editor.value.slice(editor.selectionStart, editor.selectionEnd) || lastFind.text, dataset: { autofocus: '' } });
    const withInput = h('input', { id: `${id}-with`, type: 'text' });
    const matchCase = h('input', { type: 'checkbox', checked: lastFind.matchCase });
    const up = h('input', { type: 'radio', name: `${id}-dir`, checked: !lastFind.down });
    const down = h('input', { type: 'radio', name: `${id}-dir`, checked: lastFind.down });
    const options = () => ({ text: what.value, matchCase: matchCase.checked, down: replace ? true : down.checked });
    const replaceOne = () => {
      const o = options();
      const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
      if (selected && (o.matchCase ? selected === o.text : selected.toLowerCase() === o.text.toLowerCase())) insert(withInput.value);
      findNext(o);
    };
    const replaceAll = () => {
      const o = options();
      if (!o.text) return;
      const pattern = new RegExp(o.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), o.matchCase ? 'g' : 'gi');
      const count = (editor.value.match(pattern) || []).length;
      editor.focus();
      editor.select();
      insert(editor.value.replace(pattern, () => withInput.value));
      play('ding');
      dialog.setTitle(`Replace — ${count} replaced`);
    };
    dialog.body.append(h('form', { class: 'find-form', onsubmit: event => { event.preventDefault(); findNext(options()); } },
      h('div', { class: 'find-fields' },
        h('label', { for: id, text: 'Find what:' }), what,
        replace ? h('label', { for: `${id}-with`, text: 'Replace with:' }) : null, replace ? withInput : null),
      h('div', { class: 'find-options' },
        h('label', { class: 'check' }, matchCase, h('span', { text: 'Match case' })),
        replace ? null : h('fieldset', {}, h('legend', { text: 'Direction' }), h('label', { class: 'check' }, up, h('span', { text: 'Up' })), ' ', h('label', { class: 'check' }, down, h('span', { text: 'Down' })))),
      h('div', { class: 'dialog-buttons' },
        h('button', { class: 'button default', type: 'submit', text: 'Find Next' }),
        replace ? h('button', { class: 'button', type: 'button', text: 'Replace', onclick: replaceOne }) : null,
        replace ? h('button', { class: 'button', type: 'button', text: 'Replace All', onclick: replaceAll }) : null,
        h('button', { class: 'button', type: 'button', text: 'Cancel', onclick: () => dialog.close() }))));
    dialog.el.addEventListener('keydown', event => { if (event.key === 'Escape') dialog.close(); });
    win.on('close', () => { dialog.close({ force: true }); });
    what.focus();
    what.select();
  }

  async function goTo() {
    const lines = editor.value.split('\n').length;
    const answer = await promptBox(`Line number (1–${lines}):`, { title: 'Go To Line', owner: win, okLabel: 'Go To', value: String(editor.value.slice(0, editor.selectionStart).split('\n').length),
      validate: v => (/^\d+$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= lines ? '' : 'The line number is beyond the total number of lines.') });
    if (!answer) return;
    const offset = editor.value.split('\n').slice(0, Number(answer) - 1).reduce((sum, line) => sum + line.length + 1, 0);
    editor.focus();
    editor.setSelectionRange(offset, offset);
    editor.scrollTop = Math.max(0, (Number(answer) - 3) * fontSize * 1.4);
    updatePosition();
  }

  win.el.addEventListener('keydown', event => {
    const ctrl = event.ctrlKey || event.metaKey;
    const k = event.key.toLowerCase();
    if (ctrl && k === 's') save();
    else if (ctrl && k === 'o') openFile();
    else if (ctrl && k === 'n') newFile();
    else if (ctrl && k === 'f') findDialog(false);
    else if (ctrl && k === 'h') findDialog(true);
    else if (ctrl && k === 'g') goTo();
    else if (event.key === 'F3') findNext();
    else if (event.key === 'F5') insert(new Date().toLocaleString());
    else if (event.key === 'Tab' && event.target === editor && !event.shiftKey) insert('\t');
    else return;
    event.preventDefault();
  });

  win.onArgs = async args => { if (args.path && (await confirmDiscard())) load(args.path); };
  if (ctx.args.path) await load(ctx.args.path);
  else updateTitle();
  editor.focus();
}
