// Loads apps.json and games.json, starts apps, opens files with the right app, and remembers
// open windows between visits. An app module default-exports `async function open(ctx)` and
// uses ctx.window(options) to make its window. If an app throws, only that app's window closes.
import * as wm from './wm.js';
import * as vfs from './vfs.js';
import * as settings from './settings.js';
import { extension, normalize, display } from './lib/path.js';
import { errorBox, messageBox } from './dialogs.js';

let registry = [];
let games = [];
const byId = new Map();
const associations = new Map();

export async function load() {
  const [appList, gameList] = await Promise.all([
    fetch('apps.json').then(r => r.json()),
    fetch('games.json').then(r => r.json()).catch(() => ({ games: [] }))
  ]);
  registry = appList.apps;
  games = gameList.games;
  for (const app of registry) {
    byId.set(app.id, app);
    for (const ext of app.opens || []) associations.set(ext, app.id);
  }
}

export const apps = () => registry;
export const app = id => byId.get(id);
export const gameList = () => games;
export const game = id => games.find(item => item.id === id);
export const appFor = ext => associations.get(ext);

const modules = new Map();
function loadModule(app) {
  if (!modules.has(app.module)) modules.set(app.module, import(`../${app.module}`));
  return modules.get(app.module);
}

// Starts an app. args are app-specific ({ path }, { game }, …).
export async function launch(id, args = {}, { restore = null } = {}) {
  const entry = byId.get(String(id).toLowerCase());
  if (!entry) { await errorBox(`LövOS cannot find '${id}'. Make sure you typed the name correctly.`, { title: 'Run' }); return null; }
  if (entry.single) {
    const existing = wm.findByApp(entry.id)[0];
    if (existing) { existing.focus(); existing.onArgs?.(args); return existing; }
  }
  document.body.classList.add('busy');
  const created = [];
  const ctx = {
    app: entry,
    args,
    restore,
    window(options = {}) {
      const win = wm.open({ appId: entry.id, title: entry.name, icon: entry.icon, ...(restore?.rect ? { x: restore.rect.x, y: restore.rect.y, width: restore.rect.w, height: restore.rect.h } : {}), ...options });
      if (restore?.state === 'max') win.maximize();
      win.sessionArgs = args;
      created.push(win);
      return win;
    }
  };
  try {
    const module = await loadModule(entry);
    await module.default(ctx);
    const first = created[0];
    if (first && !first.closed && document.activeElement === first.el) first.focus();
    return first || null;
  } catch (error) {
    console.error(error);
    created.forEach(win => win.close({ force: true }));
    await errorBox(`${entry.name} has stopped working.`, { title: entry.name, detail: error?.message || String(error) });
    return null;
  } finally {
    document.body.classList.remove('busy');
  }
}

// Opens a file or folder the way double-clicking it would.
export async function openPath(path, { withApp = null } = {}) {
  const entry = await vfs.stat(path);
  if (!entry) { await errorBox(`${display(path)} was not found. It may have been moved or deleted.`, { title: 'Problem with Shortcut' }); return; }
  if (entry.type === 'dir') return launch('explorer', { path: entry.path });
  const ext = extension(entry.name);
  if (ext === 'lnk' && !withApp) {
    const link = await vfs.readJson(entry.path, {});
    if (link.path) return openPath(normalize(link.path));
    if (link.app) return launch(link.app, link.args || {});
    return errorBox('This shortcut is damaged.', { title: entry.name });
  }
  const target = withApp || associations.get(ext);
  if (target) {
    if (target !== 'explorer') settings.addRecent(entry.path);
    return launch(target, { path: entry.path });
  }
  return openWith(entry.path);
}

// "Open with" for unknown file types.
export async function openWith(path) {
  const choices = registry.filter(a => ['notepad', 'paint', 'dos'].includes(a.id));
  const choice = await messageBox(`Choose the program you want to use to open this file:\n${display(path)}`, { title: 'Open With', kind: 'question', buttons: [...choices.map(c => c.name), 'Cancel'], defaultIndex: 0 });
  const picked = choices.find(c => c.name === choice);
  if (picked) return launch(picked.id, { path });
}

// Start menu / Run dialog entry for every game in games.json.
export function launchGame(id) {
  return launch('dos', { game: id });
}

// What the Run dialog and START do with a line of text: a program, a game id, or a path.
export async function runCommand(text) {
  const [name, ...rest] = text.trim().split(/\s+/);
  const lower = name.toLowerCase();
  const app = apps().find(a => a.id === lower || a.run?.includes(lower));
  if (app) {
    const arg = rest.join(' ');
    return launch(app.id, arg ? { path: arg } : {});
  }
  const game = gameList().find(g => g.id === lower);
  if (game) return launchGame(game.id);
  if (await vfs.stat(text)) return openPath(text);
  return errorBox(`LövOS cannot find '${text}'. Make sure you typed the name correctly, and then try again.`, { title: text });
}

// ---------- Session: reopen windows after a reload ----------

let sessionTimer = 0;
function saveSession() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    const session = wm.all().filter(win => !win.owner && win.sessionArgs && byId.has(win.appId) && !win.noSession)
      .map(win => ({ app: win.appId, args: win.sessionArgs, rect: win.rect, state: win.state }));
    settings.set({ session });
  }, 400);
}

export function trackSession() {
  for (const type of ['open', 'close', 'moved', 'change']) wm.events.addEventListener(type, saveSession);
}

export async function restoreSession() {
  if (!settings.get('restoreWindows')) return;
  for (const item of settings.get('session') || []) {
    if (!byId.has(item.app)) continue;
    const win = await launch(item.app, item.args || {}, { restore: item });
    if (win && item.state === 'min') win.minimize();
  }
}

