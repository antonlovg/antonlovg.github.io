// Paths on the virtual drive. Stored with forward slashes ("C:/Games/Jazz/JAZZ.EXE"),
// shown with backslashes like DOS and Windows. Case is kept in names but ignored when comparing.

export const ROOT = 'C:';
export const RECYCLE = 'C:/$Recycle.Bin';
const INVALID = /[<>:"|?*\u0000-\u001f]/;

// Resolves "..", "." and either slash style against an optional base folder.
export function normalize(input, base = ROOT) {
  let text = String(input ?? '').trim().replace(/\\/g, '/');
  if (!/^[a-z]:/i.test(text)) text = `${base}/${text}`;
  const [drive, ...rest] = text.split('/');
  const parts = [];
  for (const part of rest) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return [drive.toUpperCase(), ...parts].join('/');
}

export const key = path => normalize(path).toLowerCase();
export const display = path => normalize(path).replace(/\//g, '\\') + (normalize(path) === ROOT ? '\\' : '');
export const isRoot = path => normalize(path) === ROOT;

export function parent(path) {
  const parts = normalize(path).split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : null;
}

export function basename(path) {
  const parts = normalize(path).split('/');
  return parts.length > 1 ? parts.at(-1) : `${parts[0]}\\`;
}

export const join = (dir, name) => normalize(`${normalize(dir)}/${name}`);

// "notes.txt" → "txt"; folders and files without a dot → "".
export function extension(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function stem(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

// True when `path` is `folder` itself or somewhere inside it.
export function isInside(path, folder) {
  const a = key(path);
  const b = key(folder);
  return a === b || a.startsWith(`${b}/`);
}

export function validName(name) {
  const text = String(name ?? '');
  if (!text.trim() || text !== text.trim() || text === '.' || text === '..') return false;
  if (text.length > 120 || INVALID.test(text) || /[/\\]/.test(text) || /\.$/.test(text)) return false;
  return true;
}

// "New Folder", "New Folder (2)", … — the first name not in `taken` (compared without case).
export function uniqueName(name, taken) {
  const lower = new Set([...taken].map(item => item.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const ext = extension(name);
  const base = ext ? stem(name) : name;
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext ? `.${ext}` : ''}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

export function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')} ${units[unit]}`;
}
