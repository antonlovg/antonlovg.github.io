// The virtual C: drive, stored in this browser's IndexedDB ("lovgren-os"). Nothing leaves the
// device unless GitHub sync is set up. Folders and files are records keyed by their lower-cased
// path; a file's contents are a Blob. Every change fires a "change" event (also to other tabs).
import { normalize, key, parent, basename, join, isInside, validName, uniqueName, ROOT, RECYCLE } from './lib/path.js';

const DB_NAME = 'lovgren-os';
const VERSION = 1;
let db = null;
export const events = new EventTarget();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('lovgren-os-vfs') : null;
channel?.addEventListener('message', event => events.dispatchEvent(new CustomEvent('change', { detail: { ...event.data, remote: true } })));

function request(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

function done(tx) {
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Aborted')); });
}

export async function open() {
  if (db) return db;
  db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const files = req.result.createObjectStore('files', { keyPath: 'key' });
      files.createIndex('parent', 'parent');
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other tabs with the desktop open and try again.'));
  });
  return db;
}

function store(mode = 'readonly', name = 'files') {
  const tx = db.transaction(name, mode);
  return { tx, files: tx.objectStore(name) };
}

function notify(paths) {
  const dirs = [...new Set(paths.map(path => parent(path) || ROOT))];
  const detail = { dirs, paths };
  events.dispatchEvent(new CustomEvent('change', { detail }));
  channel?.postMessage(detail);
}

const descendants = k => IDBKeyRange.bound(`${k}/`, `${k}/￿`);

function record(path, type, data = null, extra = {}) {
  const p = normalize(path);
  const now = Date.now();
  return { key: key(p), path: p, name: basename(p), parent: parent(p) ? key(parent(p)) : null, type, size: data ? data.size : 0, mtime: now, ctime: now, data, ...extra };
}

const toBlob = data => (data instanceof Blob ? data : new Blob([data ?? '']));

// ---------- Reading ----------

export async function stat(path) {
  await open();
  return (await request(store().files.get(key(path)))) || null;
}

export const exists = async path => Boolean(await stat(path));

export async function list(path) {
  await open();
  const items = await request(store().files.index('parent').getAll(key(path)));
  return items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.type === 'dir' ? -1 : 1));
}

// Everything inside a folder (not the folder itself), shallowest first.
export async function walk(path) {
  await open();
  const items = await request(store().files.getAll(descendants(key(path))));
  return items.sort((a, b) => a.key.split('/').length - b.key.split('/').length || a.key.localeCompare(b.key));
}

export async function read(path) {
  const entry = await stat(path);
  if (!entry) throw new Error(`${path} was not found.`);
  if (entry.type !== 'file') throw new Error(`${entry.name} is a folder.`);
  return entry.data || new Blob([]);
}

export const readBytes = async path => new Uint8Array(await (await read(path)).arrayBuffer());
export const readText = async path => (await read(path)).text();
export async function readJson(path, fallback = null) {
  try { return JSON.parse(await readText(path)); } catch { return fallback; }
}

export async function usage() {
  await open();
  let bytes = 0;
  let files = 0;
  await new Promise((resolve, reject) => {
    const req = store().files.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      if (cursor.value.type === 'file') { bytes += cursor.value.size; files++; }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
  return { bytes, files };
}

// ---------- Writing ----------

async function requireFolder(path) {
  const entry = await stat(path);
  if (!entry) throw new Error(`The folder ${path} does not exist.`);
  if (entry.type !== 'dir') throw new Error(`${entry.name} is not a folder.`);
}

export async function mkdir(path, { parents = true } = {}) {
  await open();
  const target = normalize(path);
  const chain = [];
  for (let p = target; p; p = parent(p)) chain.unshift(p);
  const { tx, files } = store('readwrite');
  const created = [];
  for (const p of chain) {
    const existing = await request(files.get(key(p)));
    if (existing) {
      if (existing.type !== 'dir') { tx.abort(); throw new Error(`${existing.name} is a file, not a folder.`); }
      continue;
    }
    if (!parents && p !== target) { tx.abort(); throw new Error(`The folder ${parent(target)} does not exist.`); }
    files.put(record(p, 'dir'));
    created.push(p);
  }
  await done(tx);
  if (created.length) notify(created);
  return target;
}

export async function write(path, data, { mtime, parents = true } = {}) {
  await open();
  const target = normalize(path);
  if (!validName(basename(target))) throw new Error(`"${basename(target)}" is not a valid file name.`);
  if (parents) await mkdir(parent(target));
  else await requireFolder(parent(target));
  const blob = toBlob(data);
  const { tx, files } = store('readwrite');
  const existing = await request(files.get(key(target)));
  if (existing?.type === 'dir') { tx.abort(); throw new Error(`${existing.name} is a folder.`); }
  const entry = record(target, 'file', blob, existing ? { ctime: existing.ctime, path: existing.path, name: existing.name } : {});
  if (mtime) entry.mtime = mtime;
  files.put(entry);
  await done(tx);
  notify([target]);
  return entry;
}

// Writes many files in one go (used by imports and DOS save-back). files: [{ path, data, mtime? }]
export async function writeMany(items) {
  await open();
  const folders = new Set(items.map(item => parent(normalize(item.path))));
  for (const folder of folders) await mkdir(folder);
  const { tx, files } = store('readwrite');
  for (const item of items) {
    const target = normalize(item.path);
    const entry = record(target, 'file', toBlob(item.data));
    if (item.mtime) entry.mtime = item.mtime;
    files.put(entry);
  }
  await done(tx);
  notify(items.map(item => item.path));
}

// Deletes for good (folders with everything in them).
export async function remove(path) {
  await open();
  const k = key(path);
  if (k === key(ROOT)) throw new Error('The C: drive cannot be deleted.');
  const { tx, files } = store('readwrite');
  files.delete(k);
  files.delete(descendants(k));
  await done(tx);
  notify([normalize(path)]);
}

// Moves or renames a file or folder (with everything inside it).
export async function move(from, to, { overwrite = false } = {}) {
  await open();
  const source = normalize(from);
  const target = normalize(to);
  if (key(source) === key(target)) {
    if (source === target) return target;
  } else if (isInside(target, source)) {
    throw new Error('A folder cannot be moved into itself.');
  }
  if (!validName(basename(target))) throw new Error(`"${basename(target)}" is not a valid name.`);
  await requireFolder(parent(target));
  const entry = await stat(source);
  if (!entry) throw new Error(`${source} was not found.`);
  const clash = key(source) !== key(target) && await stat(target);
  if (clash && !overwrite) throw new Error(`${basename(target)} already exists.`);
  if (clash) await remove(target);
  const inner = entry.type === 'dir' ? await walk(source) : [];
  const { tx, files } = store('readwrite');
  files.delete(entry.key);
  for (const item of inner) files.delete(item.key);
  const rebase = item => {
    const p = normalize(target + item.path.slice(source.length));
    return { ...item, key: key(p), path: p, name: basename(p), parent: key(parent(p)) };
  };
  files.put({ ...rebase(entry), mtime: entry.type === 'file' ? entry.mtime : Date.now() });
  for (const item of inner) files.put(rebase(item));
  await done(tx);
  notify([source, target]);
  return target;
}

export async function copy(from, to) {
  await open();
  const source = normalize(from);
  const target = normalize(to);
  if (isInside(target, source)) throw new Error('A folder cannot be copied into itself.');
  const entry = await stat(source);
  if (!entry) throw new Error(`${source} was not found.`);
  if (await stat(target)) throw new Error(`${basename(target)} already exists.`);
  await requireFolder(parent(target));
  const inner = entry.type === 'dir' ? await walk(source) : [];
  const now = Date.now();
  const { tx, files } = store('readwrite');
  for (const item of [entry, ...inner]) {
    const p = normalize(target + item.path.slice(source.length));
    files.put({ ...item, key: key(p), path: p, name: basename(p), parent: key(parent(p)), ctime: now, origin: undefined });
  }
  await done(tx);
  notify([target]);
  return target;
}

// A name for a new item in `folder` that doesn't clash with anything there.
export async function freeName(folder, name) {
  return uniqueName(name, (await list(folder)).map(item => item.name));
}

// ---------- Recycle Bin ----------

export async function recycle(path) {
  const source = normalize(path);
  if (isInside(source, RECYCLE)) return remove(source);
  await mkdir(RECYCLE);
  const target = join(RECYCLE, await freeName(RECYCLE, basename(source)));
  await move(source, target);
  const { tx, files } = store('readwrite');
  const entry = await request(files.get(key(target)));
  files.put({ ...entry, origin: source, deleted: Date.now() });
  await done(tx);
  notify([target]);
  return target;
}

export async function restore(path) {
  const entry = await stat(path);
  if (!entry?.origin) throw new Error('This item has no original location.');
  await mkdir(parent(entry.origin));
  const target = join(parent(entry.origin), await freeName(parent(entry.origin), basename(entry.origin)));
  await move(entry.path, target);
  const { tx, files } = store('readwrite');
  const moved = await request(files.get(key(target)));
  delete moved.origin;
  delete moved.deleted;
  files.put(moved);
  await done(tx);
  return target;
}

export async function emptyRecycleBin() {
  for (const item of await list(RECYCLE)) await remove(item.path);
}

// ---------- Key-value storage (settings, sync state) ----------

export async function getValue(name, fallback = null) {
  await open();
  const value = await request(store('readonly', 'kv').files.get(name));
  return value === undefined ? fallback : value;
}

export async function setValue(name, value) {
  await open();
  const { tx, files } = store('readwrite', 'kv');
  if (value === undefined) files.delete(name);
  else files.put(value, name);
  await done(tx);
}

// Wipes the whole drive and every setting (Control Panel → Storage → Reset).
export async function wipe() {
  await open();
  db.close();
  db = null;
  await request(indexedDB.deleteDatabase(DB_NAME));
}

