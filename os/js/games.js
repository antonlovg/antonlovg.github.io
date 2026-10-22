// DOS games: the ones described in games.json plus any you add yourself.
// A game is installed when its program (e.g. JAZZ.EXE) exists in its folder on the C: drive.
import * as vfs from './vfs.js';
import { gameList } from './apps.js';
import { join, basename } from './lib/path.js';
import { readZip } from './lib/zip.js';
import { extractEntries, importFiles } from './fileops.js';

// Games you add yourself live in a file on the drive, so GitHub Sync carries them to other devices.
export const CUSTOM_FILE = 'C:/Games/.games.json';

async function customGames() {
  const data = await vfs.readJson(CUSTOM_FILE, { games: [] });
  return Array.isArray(data?.games) ? data.games.filter(game => game?.id && game.folder && game.program) : [];
}

export async function allGames() {
  return [...gameList(), ...(await customGames()).map(game => ({ ...game, custom: true }))];
}

export const findGame = async id => (await allGames()).find(game => game.id === id) || null;

export async function isInstalled(game) {
  return Boolean(await vfs.stat(join(game.folder, game.program)));
}

// The folder (inside the archive or the picked folder) that holds the game's program.
function baseOf(paths, program) {
  const target = program.toLowerCase();
  const hits = paths.filter(path => basename(path).toLowerCase() === target).sort((a, b) => a.split('/').length - b.split('/').length);
  if (!hits.length) return null;
  const dir = hits[0].split('/').slice(0, -1).join('/');
  return dir;
}

// Old releases often ship as a self-extracting .EXE inside the zip (e.g. JAZZ1X.EXE). If the
// program isn't in the zip itself, look inside those.
async function unwrap(entries, program) {
  if (baseOf(entries.map(entry => entry.path), program) !== null) return entries;
  for (const entry of entries.filter(item => /\.exe$/i.test(item.path))) {
    try {
      const inner = readZip(await entry.bytes()).filter(item => !item.dir);
      if (baseOf(inner.map(item => item.path), program) !== null) return inner;
    } catch { /* not an archive */ }
  }
  return entries;
}

// Installs from a zip (File/Blob) or a list of Files from a folder pick or drop.
export async function install(game, source) {
  const files = Array.isArray(source) ? source : [source];
  navigator.storage?.persist?.().catch(() => {});
  if (files.length === 1 && /\.zip$/i.test(files[0].name || '')) {
    const entries = await unwrap(readZip(new Uint8Array(await files[0].arrayBuffer())).filter(entry => !entry.dir), game.program);
    const base = baseOf(entries.map(entry => entry.path), game.program);
    if (base === null) throw new Error(`${game.program} was not found in ${files[0].name}. Choose a zip of the ${game.title} folder.`);
    const inside = base ? entries.filter(entry => entry.path.startsWith(`${base}/`)).map(entry => ({ ...entry, path: entry.path.slice(base.length + 1), bytes: entry.bytes, date: entry.date })) : entries;
    await vfs.mkdir(game.folder);
    await extractEntries(inside, game.folder);
    return;
  }
  const relative = file => file.relativePath || file.webkitRelativePath || file.name;
  const base = baseOf(files.map(relative), game.program);
  if (base === null) throw new Error(`${game.program} was not found. Choose the ${game.title} folder (the one with ${game.program} in it).`);
  const inside = files.filter(file => !base || relative(file).startsWith(`${base}/`));
  for (const file of inside) file.relativePath = base ? relative(file).slice(base.length + 1) : relative(file);
  await vfs.mkdir(game.folder);
  await importFiles(inside, game.folder);
}

// Installs the shareware release that comes with LövOS (games.json → shareware), checking that the
// archive is byte-for-byte the original: its licence only allows sharing it unaltered.
export async function installShareware(game, onProgress = () => {}) {
  const ware = game.shareware;
  if (!ware?.file) throw new Error(`${game.title} has no shareware version.`);
  onProgress('Downloading…');
  const response = await fetch(new URL(`../${ware.file}`, import.meta.url));
  if (!response.ok) throw new Error(`The shareware episode could not be downloaded (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (bytes.length !== ware.size || digest !== ware.sha256) throw new Error('The shareware download is damaged. Try again.');
  onProgress('Installing…');
  await install(game, new File([bytes], basename(ware.file)));
}

export async function uninstall(game) {
  if (await vfs.stat(game.folder)) await vfs.recycle(game.folder);
}

export async function addCustomGame(game) {
  const list = (await customGames()).filter(item => item.id !== game.id);
  await vfs.write(CUSTOM_FILE, JSON.stringify({ games: [...list, game] }, null, 2));
}

export async function removeCustomGame(id) {
  await vfs.write(CUSTOM_FILE, JSON.stringify({ games: (await customGames()).filter(item => item.id !== id) }, null, 2));
}
