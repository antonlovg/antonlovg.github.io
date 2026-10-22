// File operations shared by the desktop, Explorer and the command prompt: moving, copying,
// the clipboard, the Recycle Bin, importing from and exporting to the real computer, and zips.
import * as vfs from './vfs.js';
import { join, basename, parent, normalize, stem, isInside, key, RECYCLE } from './lib/path.js';
import { readZip, writeZip, commonFolder } from './lib/zip.js';
import { confirmBox, errorBox, messageBox } from './dialogs.js';
import { download } from './dom.js';
import { play } from './sound.js';
import { progress } from './progress.js';

// Moves (or copies) items into a folder, renaming on clashes ("Notes (2).txt").
export async function moveInto(paths, folder, { copy = false } = {}) {
  const target = normalize(folder);
  const results = [];
  for (const path of paths) {
    if (key(parent(path)) === key(target) && !copy) continue;
    if (isInside(target, path)) { await errorBox(`Cannot ${copy ? 'copy' : 'move'} ${basename(path)}: the destination folder is inside it.`); continue; }
    const name = await vfs.freeName(target, basename(path));
    results.push(copy ? await vfs.copy(path, join(target, name)) : await vfs.move(path, join(target, name)));
  }
  return results;
}

// ---------- Clipboard (Cut / Copy / Paste) ----------

let clipboard = { paths: [], cut: false };
export const clipboardEvents = new EventTarget();
export function setClipboard(paths, cut) {
  clipboard = { paths: [...paths], cut };
  clipboardEvents.dispatchEvent(new Event('change'));
}
export const canPaste = () => clipboard.paths.length > 0;
export const isCut = path => clipboard.cut && clipboard.paths.some(p => key(p) === key(path));

export async function paste(folder) {
  if (!clipboard.paths.length) return [];
  const existing = [];
  for (const path of clipboard.paths) if (await vfs.stat(path)) existing.push(path);
  const result = await moveInto(existing, folder, { copy: !clipboard.cut });
  if (clipboard.cut) setClipboard([], false);
  return result;
}

// ---------- Deleting ----------

export async function recyclePaths(paths, { owner = null, permanent = false } = {}) {
  if (!paths.length) return false;
  const inBin = paths.every(path => isInside(path, RECYCLE));
  const forever = permanent || inBin;
  const what = paths.length === 1 ? `'${basename(paths[0]).replace(/\.lnk$/i, '')}'` : `these ${paths.length} items`;
  const ok = await confirmBox(forever ? `Are you sure you want to permanently delete ${what}?` : `Are you sure you want to send ${what} to the Recycle Bin?`,
    { title: paths.length === 1 ? 'Confirm File Delete' : 'Confirm Multiple File Delete', kind: forever ? 'warning' : 'question', owner });
  if (!ok) return false;
  for (const path of paths) {
    if (forever) await vfs.remove(path);
    else await vfs.recycle(path);
  }
  play('recycle');
  return true;
}

// ---------- Importing from the real computer ----------

// files: File[] (with webkitRelativePath for folder picks) → written into `folder`. Zips are kept as zips.
export async function importFiles(files, folder) {
  const list = [...files];
  if (!list.length) return [];
  const done = progress(`Copying ${list.length} item${list.length === 1 ? '' : 's'}…`);
  const items = [];
  try {
    let bytes = 0;
    for (const file of list) {
      const relative = file.webkitRelativePath || file.relativePath || file.name;
      items.push({ path: join(folder, relative), data: file, mtime: file.lastModified || Date.now() });
      bytes += file.size;
    }
    await checkSpace(bytes);
    for (let i = 0; i < items.length; i += 200) {
      await vfs.writeMany(items.slice(i, i + 200));
      done.update((i + 200) / items.length);
    }
    return items.map(item => normalize(item.path));
  } finally {
    done.close();
  }
}

// Files dragged in from the computer, including whole folders (via webkitGetAsEntry).
export async function filesFromDataTransfer(dataTransfer) {
  const entries = [...dataTransfer.items || []].map(item => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dataTransfer.files];
  const files = [];
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      file.relativePath = prefix + file.name;
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  }
  for (const entry of entries) await walk(entry, '');
  return files;
}

async function checkSpace(bytes) {
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  if (estimate?.quota && estimate.usage + bytes > estimate.quota * 0.95) {
    throw new Error(`There isn't enough space in this browser's storage (${Math.round((estimate.quota - estimate.usage) / 1048576)} MB free).`);
  }
}

// ---------- Exporting to the real computer ----------

export async function exportPaths(paths) {
  if (paths.length === 1) {
    const entry = await vfs.stat(paths[0]);
    if (entry?.type === 'file') { download(entry.name, entry.data || new Blob([])); return; }
  }
  const done = progress('Compressing…');
  try {
    const files = [];
    for (const path of paths) {
      const entry = await vfs.stat(path);
      if (!entry) continue;
      const base = parent(entry.path) || 'C:';
      const all = entry.type === 'dir' ? [entry, ...await vfs.walk(entry.path)] : [entry];
      for (const item of all) {
        if (item.type !== 'file') continue;
        files.push({ path: item.path.slice(base.length + 1), bytes: new Uint8Array(await (item.data || new Blob([])).arrayBuffer()), date: new Date(item.mtime) });
      }
    }
    const name = paths.length === 1 ? `${basename(paths[0]).replace(/[:\\]/g, '') || 'C'}.zip` : 'Files.zip';
    download(name, new Blob([writeZip(files)], { type: 'application/zip' }));
  } finally {
    done.close();
  }
}

// ---------- Zips ----------

// Extracts a zip on the drive into a new folder next to it (or `into`). Returns the folder.
export async function extractZip(path, into = null) {
  const bytes = await vfs.readBytes(path);
  const entries = readZip(bytes);
  const files = entries.filter(entry => !entry.dir);
  const folder = into || join(parent(path), await vfs.freeName(parent(path), stem(basename(path))));
  await extractEntries(files, folder);
  return folder;
}

// Writes zip entries (from readZip) into a folder, dropping a single wrapping folder if there is one.
export async function extractEntries(files, folder, { stripCommon = false } = {}) {
  const strip = stripCommon ? commonFolder(files.map(entry => entry.path)) : '';
  const done = progress(`Extracting ${files.length} files…`);
  try {
    await vfs.mkdir(folder);
    let batch = [];
    let count = 0;
    for (const entry of files) {
      const relative = strip ? entry.path.slice(strip.length + 1) : entry.path;
      batch.push({ path: join(folder, relative), data: await entry.bytes(), mtime: entry.date.getTime() });
      count++;
      if (batch.length >= 100) { await vfs.writeMany(batch); batch = []; done.update(count / files.length); }
    }
    if (batch.length) await vfs.writeMany(batch);
  } finally {
    done.close();
  }
}

export async function askExtract(path, owner = null) {
  const choice = await messageBox(`Extract all files from ${basename(path)} into a new folder?`, { title: 'Compressed (zipped) Folder', kind: 'question', buttons: ['Extract', 'Cancel'], owner });
  if (choice !== 'Extract') return null;
  try {
    return await extractZip(path);
  } catch (error) {
    await errorBox(error, { title: 'Compressed (zipped) Folder', owner });
    return null;
  }
}

