// Boots LövOS: opens the drive, applies settings, builds the desktop and taskbar, reopens the
// windows from last time and starts GitHub sync if it's set up.
import { h, icon } from './dom.js';
import * as vfs from './vfs.js';
import * as settings from './settings.js';
import * as wm from './wm.js';
import * as desktop from './desktop.js';
import * as taskbar from './taskbar.js';
import * as sync from './sync.js';
import { load as loadApps, launch, apps, gameList, trackSession, restoreSession, runCommand } from './apps.js';
import { play } from './sound.js';
import { closeMenus, isOpen as menuOpen } from './menu.js';
import { seed } from './seed.js';
import { applyAppearance } from './appearance.js';

const shell = { run: runDialog, shutdownDialog };

async function boot() {
  const bootScreen = document.getElementById('boot');
  const bar = bootScreen.querySelector('.boot-fill');
  const step = fraction => { bar.style.width = `${Math.round(fraction * 100)}%`; };
  try {
    await vfs.open();
    step(0.25);
    await settings.load();
    applyAppearance();
    step(0.4);
    await seed();
    step(0.6);
    await loadApps();
    step(0.8);
    wm.init(document.getElementById('windows'));
    await desktop.init(document.getElementById('desktop'));
    taskbar.init(document.getElementById('taskbar'), shell);
    trackSession();
    step(1);
    if (settings.get('bootScreen') && !matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 700));
  } catch (error) {
    console.error(error);
    bootScreen.querySelector('.boot-text').textContent = `LövOS could not start: ${error.message}`;
    bootScreen.classList.add('failed');
    return;
  }
  bootScreen.hidden = true;
  document.body.classList.remove('booting');
  play('startup');
  await restoreSession();
  if (!wm.all().length) desktop.focus();
  sync.watch();
  sync.syncOnStart();
  registerServiceWorker();
}

// ---------- Keyboard shortcuts ----------
// Browsers keep Alt+Tab, Alt+F4 and the Windows key for themselves, so LövOS uses Alt+letters.

document.addEventListener('keydown', event => {
  if (document.body.classList.contains('booting') || document.activeElement?.closest('.dos-screen')) return;
  const k = event.key.toLowerCase();
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    if (k === 's') { taskbar.toggleStart(true); }
    else if (k === 'r') runDialog();
    else if (k === 'w' || event.key === 'F4') wm.getActive()?.close();
    else if (event.code === 'Backquote') wm.cycle(event.shiftKey);
    else if (k === 'm') wm.minimizeAll();
    else if (k === 't') launch('taskmgr');
    else if (k === 'x') launch('explorer', { path: 'C:' });
    else return;
    event.preventDefault();
  } else if (event.ctrlKey && event.key === 'Escape') {
    taskbar.toggleStart(true);
    event.preventDefault();
  } else if (event.key === 'Escape' && menuOpen()) {
    closeMenus();
  }
});

// ---------- Run ----------

function runDialog() {
  const win = wm.open({ title: 'Run', icon: 'run', width: 400, height: 'auto', resizable: false, minimizable: false, className: 'dialog', x: 12, y: Math.max(10, wm.area().height - 210) });
  const id = `run-${win.id}`;
  const history = settings.get('runHistory') || [];
  const input = h('input', { id, type: 'text', autocomplete: 'off', spellcheck: false, value: history[0] || '', list: `${id}-list`, dataset: { autofocus: '' } });
  const datalist = h('datalist', { id: `${id}-list` }, [...new Set([...history, ...apps().flatMap(app => app.run || []), ...gameList().map(g => g.id)])].map(v => h('option', { value: v })));
  const form = h('form', { class: 'run-form', onsubmit: async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    settings.set({ runHistory: [text, ...history.filter(item => item !== text)].slice(0, 10) });
    win.close({ force: true });
    await runCommand(text);
  } },
  h('div', { class: 'run-top' }, icon('run', 32), h('p', { text: 'Type the name of a program, folder or document, and LövOS will open it for you.' })),
  h('div', { class: 'run-field' }, h('label', { for: id, text: 'Open:' }), input, datalist),
  h('div', { class: 'dialog-buttons' },
    h('button', { class: 'button default', type: 'submit', text: 'OK' }),
    h('button', { class: 'button', type: 'button', text: 'Cancel', onclick: () => win.close({ force: true }) }),
    h('button', { class: 'button', type: 'button', text: 'Browse…', onclick: async () => {
      const { fileDialog } = await import('./dialogs.js');
      const path = await fileDialog({ title: 'Browse', owner: win, folder: 'C:' });
      if (path) input.value = path.replace(/\//g, '\\');
    } })));
  win.body.append(form);
  win.el.addEventListener('keydown', event => { if (event.key === 'Escape') win.close({ force: true }); });
  input.focus();
  input.select();
}

// ---------- Shut down ----------

function shutdownDialog() {
  const win = wm.open({ title: 'Shut Down LövOS', icon: 'shutdown', width: 400, height: 'auto', resizable: false, minimizable: false, className: 'dialog', center: true });
  const id = `shutdown-${win.id}`;
  const select = h('select', { id, dataset: { autofocus: '' } },
    h('option', { value: 'shutdown', text: 'Shut down' }),
    h('option', { value: 'restart', text: 'Restart' }));
  const form = h('form', { class: 'shutdown-form', onsubmit: async event => {
    event.preventDefault();
    win.close({ force: true });
    await shutdown(select.value === 'restart');
  } },
  h('div', { class: 'run-top' }, icon('shutdown', 32), h('div', {}, h('label', { for: id, text: 'What do you want the computer to do?' }), select)),
  h('div', { class: 'dialog-buttons' },
    h('button', { class: 'button default', type: 'submit', text: 'OK' }),
    h('button', { class: 'button', type: 'button', text: 'Cancel', onclick: () => win.close({ force: true }) })));
  win.body.append(form);
  win.el.addEventListener('keydown', event => { if (event.key === 'Escape') win.close({ force: true }); });
  // Enter means OK, as in classic dialogs (a select would otherwise just open its list).
  select.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); form.requestSubmit(); } });
  select.focus();
}

async function shutdown(restart) {
  const session = settings.get('session');
  if (!(await wm.closeAll())) return;
  await settings.set({ session });
  play('shutdown');
  document.body.classList.add('shutting-down');
  await new Promise(resolve => setTimeout(resolve, 900));
  if (restart) { location.reload(); return; }
  const screen = h('div', { class: 'off-screen', role: 'main' },
    h('p', { text: 'It is now safe to turn off your computer.' }),
    h('div', { class: 'off-actions' },
      h('button', { class: 'button', type: 'button', text: 'Start LövOS again', onclick: () => location.reload() }),
      h('a', { class: 'button', href: '/', text: 'Back to lovgren.dev' })));
  document.body.replaceChildren(screen);
  screen.querySelector('button').focus();
}

// ---------- Offline support ----------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
}

window.addEventListener('unhandledrejection', event => {
  console.error(event.reason);
});

boot();
