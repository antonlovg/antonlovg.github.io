// Optional two-way sync of the C: drive with a folder in your own (private) GitHub repository,
// so games, saves and documents follow you between devices. Uses a fine-grained personal access
// token that you create and paste in Control Panel → GitHub Sync; it is stored only in this
// browser and sent only to api.github.com. One sync = one commit. Read-only tokens download only.
import * as vfs from './vfs.js';
import { planSync, planIsEmpty, conflictName, gitBlobSha, toRepoPath, fromRepoPath, cleanRepoFolder } from './lib/sync-plan.js';
import { key, isInside, RECYCLE } from './lib/path.js';

const API = 'https://api.github.com';
const MAX_FILE = 95 * 1024 * 1024;
export const events = new EventTarget();
let state = { state: 'off', message: 'Not set up', last: null };
let running = null;
let dirtyTimer = 0;

export const status = () => ({ ...state });
function setStatus(next) {
  state = { ...state, ...next };
  events.dispatchEvent(new CustomEvent('status', { detail: state }));
}

export async function getConfig() {
  return { owner: '', repo: '', branch: '', folder: 'lovos', token: '', auto: true, ...(await vfs.getValue('sync-config', {})) };
}

export async function setConfig(config) {
  const clean = { ...config, owner: config.owner.trim(), repo: config.repo.trim(), branch: config.branch.trim(), folder: cleanRepoFolder(config.folder), token: config.token.trim() };
  const before = await getConfig();
  // A different repository or folder starts from a clean slate.
  if (before.owner !== clean.owner || before.repo !== clean.repo || before.folder !== clean.folder || before.branch !== clean.branch) await vfs.setValue('sync-base', {});
  await vfs.setValue('sync-config', clean);
  await refreshStatus();
}

export async function forget() {
  await vfs.setValue('sync-config', undefined);
  await vfs.setValue('sync-base', undefined);
  await vfs.setValue('sync-last', undefined);
  await refreshStatus();
}

const configured = config => Boolean(config.owner && config.repo && config.token);

export async function refreshStatus() {
  const config = await getConfig();
  const last = await vfs.getValue('sync-last', null);
  if (!configured(config)) setStatus({ state: 'off', message: 'Not set up', last });
  else setStatus({ state: 'idle', message: last ? `Last synced ${new Date(last).toLocaleString()}` : 'Ready, not synced yet', last });
}

// ---------- GitHub API ----------

async function gh(config, path, { method = 'GET', body, raw = false, allow = [] } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer'
  });
  if (allow.includes(response.status)) return { status: response.status };
  if (!response.ok) {
    let message = '';
    try { message = (await response.json()).message; } catch { /* not JSON */ }
    const hints = { 401: 'The token was rejected. It may have expired.', 403: 'The token is not allowed to do this (check its repository access and permissions).', 404: 'The repository or branch was not found (or the token cannot see it).' };
    throw Object.assign(new Error(`GitHub: ${hints[response.status] || message || response.statusText} (${response.status})`), { status: response.status });
  }
  if (raw) return new Uint8Array(await response.arrayBuffer());
  return response.status === 204 ? null : response.json();
}

const repoPath = config => `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;

// Checks the settings and returns { private, canPush, branch } — used by the "Test" button too.
export async function testConnection(config) {
  const repo = await gh(config, repoPath(config));
  return { private: repo.private, canPush: Boolean(repo.permissions?.push), branch: config.branch || repo.default_branch, fullName: repo.full_name };
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ---------- Local state ----------

async function localFiles() {
  const cache = await vfs.getValue('sync-hashes', {});
  const next = {};
  const map = new Map();
  for (const entry of await vfs.walk('C:')) {
    if (entry.type !== 'file' || isInside(entry.path, RECYCLE)) continue;
    if (entry.size > MAX_FILE) continue;
    const cached = cache[entry.key];
    let sha = cached && cached.mtime === entry.mtime && cached.size === entry.size ? cached.sha : null;
    if (!sha) sha = await gitBlobSha(new Uint8Array(await (entry.data || new Blob([])).arrayBuffer()));
    next[entry.key] = { mtime: entry.mtime, size: entry.size, sha };
    map.set(entry.key, { path: entry.path, sha });
  }
  await vfs.setValue('sync-hashes', next);
  return map;
}

// ---------- Sync ----------

export function syncNow({ interactive = false } = {}) {
  if (!running) running = runSync(interactive).finally(() => { running = null; });
  return running;
}

// If another device pushed in the meantime, GitHub refuses the update (422); start over once.
async function runSync(interactive, retry = true) {
  const config = await getConfig();
  if (!configured(config)) { await refreshStatus(); return null; }
  setStatus({ state: 'busy', message: 'Syncing…' });
  try {
    const info = await testConnection(config);
    const branch = info.branch;
    const base = new Map(Object.entries(await vfs.getValue('sync-base', {})));

    // Remote state: the branch head and every file under the folder.
    let head = await gh(config, `${repoPath(config)}/git/ref/heads/${encodeURIComponent(branch)}`, { allow: [404, 409] });
    if (head.status && info.canPush) {
      // An empty repository: create the first commit so the Git Data API can be used.
      await gh(config, `${repoPath(config)}/contents/${toRepoPath(config.folder, 'C:/.lovos')}`, { method: 'PUT', body: { message: 'LövOS: start syncing', content: toBase64(new TextEncoder().encode('Files synced from LövOS (lovgren.dev/os/).\n')), branch } });
      head = await gh(config, `${repoPath(config)}/git/ref/heads/${encodeURIComponent(branch)}`);
    } else if (head.status) {
      throw new Error('The repository is empty and this token can only read it.');
    }
    const headSha = head.object.sha;
    const commit = await gh(config, `${repoPath(config)}/git/commits/${headSha}`);
    const tree = await gh(config, `${repoPath(config)}/git/trees/${commit.tree.sha}?recursive=1`);
    const remote = new Map();
    for (const item of tree.tree) {
      if (item.type !== 'blob') continue;
      const drivePath = fromRepoPath(config.folder, item.path);
      if (drivePath && !/^C:\/\.lovos$/i.test(drivePath)) remote.set(key(drivePath), { path: drivePath, sha: item.sha, repoPath: item.path });
    }
    const local = await localFiles();
    local.delete('c:/.lovos');
    const plan = planSync(local, remote, base);
    if (!info.canPush) { plan.upload = []; plan.deleteRemote = []; }

    const nextBase = new Map();
    plan.same.forEach(item => nextBase.set(key(item.path), item));
    setStatus({ message: `Downloading ${plan.download.length + plan.conflicts.length} file(s)…` });
    for (const item of plan.download) {
      const bytes = await gh(config, `${repoPath(config)}/git/blobs/${item.sha}`, { raw: true });
      await vfs.write(item.path, bytes);
      nextBase.set(key(item.path), { path: item.path, sha: item.sha });
    }
    const firstSync = base.size === 0;
    for (const { local: l, remote: r } of plan.conflicts) {
      const bytes = await gh(config, `${repoPath(config)}/git/blobs/${r.sha}`, { raw: true });
      if (firstSync) {
        // A new device: GitHub's copy wins and this device's version is kept beside it.
        await vfs.write(conflictName(l.path, 'this device'), await vfs.readBytes(l.path));
        await vfs.write(l.path, bytes);
        nextBase.set(key(l.path), { path: l.path, sha: r.sha });
      } else {
        await vfs.write(conflictName(l.path), bytes);
        if (info.canPush) plan.upload.push(l);
      }
    }
    for (const item of plan.deleteLocal) {
      await vfs.remove(item.path);
    }

    const changes = [];
    setStatus({ message: `Uploading ${plan.upload.length} file(s)…` });
    for (const item of plan.upload) {
      const bytes = await vfs.readBytes(item.path);
      const blob = await gh(config, `${repoPath(config)}/git/blobs`, { method: 'POST', body: { content: toBase64(bytes), encoding: 'base64' } });
      changes.push({ path: toRepoPath(config.folder, item.path), mode: '100644', type: 'blob', sha: blob.sha });
      nextBase.set(key(item.path), { path: item.path, sha: blob.sha });
    }
    for (const item of plan.deleteRemote) changes.push({ path: item.repoPath, mode: '100644', type: 'blob', sha: null });
    if (changes.length) {
      const newTree = await gh(config, `${repoPath(config)}/git/trees`, { method: 'POST', body: { base_tree: commit.tree.sha, tree: changes } });
      const summary = [plan.upload.length && `${plan.upload.length} updated`, plan.deleteRemote.length && `${plan.deleteRemote.length} deleted`].filter(Boolean).join(', ');
      const newCommit = await gh(config, `${repoPath(config)}/git/commits`, { method: 'POST', body: { message: `LövOS sync: ${summary}`, tree: newTree.sha, parents: [headSha] } });
      await gh(config, `${repoPath(config)}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: newCommit.sha } });
    }
    // Pull-only: files that exist locally but were never uploaded must not count as synced.
    await vfs.setValue('sync-base', Object.fromEntries(nextBase));
    const now = Date.now();
    await vfs.setValue('sync-last', now);
    const summary = planIsEmpty(plan) ? 'Everything is up to date' : `${plan.download.length} downloaded, ${plan.upload.length} uploaded, ${plan.deleteLocal.length + plan.deleteRemote.length} deleted${plan.conflicts.length ? `, ${plan.conflicts.length} conflict copies kept` : ''}`;
    setStatus({ state: 'idle', message: `${summary} · ${new Date(now).toLocaleTimeString()}${info.canPush ? '' : ' (read-only token)'}`, last: now });
    if (interactive) {
      const { alertBox } = await import('./dialogs.js');
      await alertBox(summary + (info.private ? '' : '\n\nWarning: this repository is public, so anyone can see the synced files.'), { title: 'GitHub Sync' });
    }
    return plan;
  } catch (error) {
    if (retry && error.status === 422) return runSync(interactive, false);
    setStatus({ state: 'error', message: error.message });
    if (interactive) {
      const { errorBox } = await import('./dialogs.js');
      await errorBox(error, { title: 'GitHub Sync' });
    }
    return null;
  }
}

// Syncs a minute after the drive last changed (and when asked to, e.g. after a DOS game closes).
export function watch() {
  vfs.events.addEventListener('change', event => {
    if (event.detail.remote || state.state === 'off' || state.state === 'busy') return;
    clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(async () => { if ((await getConfig()).auto) syncNow(); }, 60000);
  });
}

export async function syncOnStart() {
  await refreshStatus();
  const config = await getConfig();
  if (configured(config) && config.auto) syncNow();
}
