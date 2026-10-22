// File types: which icon a file gets and what Explorer calls it. Which app opens a type is set
// in apps.json ("opens": [...]).
import { extension, stem, key, RECYCLE } from './lib/path.js';

export const TYPES = {
  txt: { icon: 'text', name: 'Text Document' },
  md: { icon: 'text', name: 'Markdown Document' },
  log: { icon: 'text', name: 'Log File' },
  ini: { icon: 'text', name: 'Configuration Settings' },
  cfg: { icon: 'text', name: 'Configuration File' },
  conf: { icon: 'text', name: 'Configuration File' },
  json: { icon: 'text', name: 'JSON File' },
  nfo: { icon: 'text', name: 'Information File' },
  diz: { icon: 'text', name: 'Description File' },
  png: { icon: 'image', name: 'PNG Image' },
  jpg: { icon: 'image', name: 'JPEG Image' },
  jpeg: { icon: 'image', name: 'JPEG Image' },
  gif: { icon: 'image', name: 'GIF Image' },
  bmp: { icon: 'image', name: 'Bitmap Image' },
  webp: { icon: 'image', name: 'WebP Image' },
  zip: { icon: 'zip', name: 'Compressed (zipped) Folder' },
  jsdos: { icon: 'dos', name: 'DOS Game Bundle' },
  exe: { icon: 'exe', name: 'DOS Application' },
  com: { icon: 'exe', name: 'DOS Application' },
  bat: { icon: 'bat', name: 'DOS Batch File' },
  lnk: { icon: 'shortcut', name: 'Shortcut' }
};

export const TEXT_TYPES = ['txt', 'md', 'log', 'ini', 'cfg', 'conf', 'json', 'nfo', 'diz', 'bat'];
export const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];

export function fileIcon(entry) {
  if (entry.type === 'dir') {
    if (key(entry.path) === key(RECYCLE)) return 'recycle';
    if (/^c:\/documents$/i.test(entry.path)) return 'documents';
    if (/^c:\/pictures$/i.test(entry.path)) return 'pictures';
    if (/^c:\/games$/i.test(entry.path)) return 'games';
    if (/^c:\/dos$/i.test(entry.path)) return 'dos';
    return 'folder';
  }
  if (entry.icon) return entry.icon;
  return TYPES[extension(entry.name)]?.icon || 'file';
}

export function typeName(entry) {
  if (entry.type === 'dir') return 'File Folder';
  const ext = extension(entry.name);
  return TYPES[ext]?.name || (ext ? `${ext.toUpperCase()} File` : 'File');
}

// Shortcuts (.lnk) are small JSON files: { "app": "notepad", "args": { … }, "icon": "notepad" }.
export function shortcutLabel(entry) {
  return extension(entry.name) === 'lnk' ? stem(entry.name) : entry.name;
}
