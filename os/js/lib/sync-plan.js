// Plans a two-way sync between the virtual drive and a folder in a GitHub repository, using the
// state of the last sync as the common base (like git's three-way merge, but per file):
//   - changed on one side only → copy it to the other side,
//   - deleted on one side and unchanged on the other → delete it on the other side too,
//   - changed on both sides → the device's version is uploaded, and GitHub's is kept beside it
//     as "name (GitHub copy).ext", so nothing is lost. (On a device's very first sync GitHub's
//     version wins instead, and the device's is kept as "name (this device).ext".)
// Each map is lower-cased path → { path, sha } (sha = git blob id, so it matches GitHub's tree).

export function planSync(local, remote, base) {
  const plan = { upload: [], download: [], deleteRemote: [], deleteLocal: [], conflicts: [], same: [] };
  const keys = new Set([...local.keys(), ...remote.keys()]);
  for (const key of [...keys].sort()) {
    const l = local.get(key);
    const r = remote.get(key);
    const b = base.get(key);
    if (l && r) {
      if (l.sha === r.sha) plan.same.push(l);
      else if (b && l.sha === b.sha) plan.download.push(r);
      else if (b && r.sha === b.sha) plan.upload.push(l);
      else plan.conflicts.push({ local: l, remote: r });
    } else if (l) {
      if (b && l.sha === b.sha) plan.deleteLocal.push(l);
      else plan.upload.push(l);
    } else if (r) {
      if (b && r.sha === b.sha) plan.deleteRemote.push(r);
      else plan.download.push(r);
    }
  }
  return plan;
}

export const planIsEmpty = plan => !plan.upload.length && !plan.download.length && !plan.deleteRemote.length && !plan.deleteLocal.length && !plan.conflicts.length;

export function conflictName(path, label = 'GitHub copy') {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash + 1 ? `${path.slice(0, dot)} (${label})${path.slice(dot)}` : `${path} (${label})`;
}

// The id git gives a file's contents: sha1("blob <size>\0" + bytes), as hex.
export async function gitBlobSha(bytes) {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(header.length + bytes.length);
  all.set(header);
  all.set(bytes, header.length);
  const digest = await crypto.subtle.digest('SHA-1', all);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Repository paths are "<folder>/<path on C: without the drive>"; only safe paths are accepted.
export function toRepoPath(folder, drivePath) {
  const inner = drivePath.replace(/^C:\/?/i, '');
  return folder ? `${folder}/${inner}` : inner;
}

export function fromRepoPath(folder, repoPath) {
  if (folder && !repoPath.startsWith(`${folder}/`)) return null;
  const inner = folder ? repoPath.slice(folder.length + 1) : repoPath;
  if (!inner || inner.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return `C:/${inner}`;
}

export function cleanRepoFolder(value) {
  return String(value || '').trim().replace(/\\/g, '/').split('/').filter(part => part && part !== '.' && part !== '..').join('/');
}
