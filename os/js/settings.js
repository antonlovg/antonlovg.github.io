// Desktop settings, stored with the drive in IndexedDB. settings.get('theme'), settings.set({ theme: 'lautus' }).
import { getValue, setValue } from './vfs.js';

export const DEFAULTS = {
  theme: 'classic',
  wallpaper: 'reactos',
  wallpaperImage: '',
  wallpaperFit: 'cover',
  sounds: true,
  volume: 0.7,
  muted: false,
  clock24: true,
  showHidden: false,
  explorerView: 'icons',
  bootScreen: true,
  restoreWindows: true,
  touchControls: 'auto',
  iconPositions: {},
  recent: [],
  runHistory: [],
  session: []
};

let values = { ...DEFAULTS };
export const events = new EventTarget();

export async function load() {
  values = { ...DEFAULTS, ...(await getValue('settings', {})) };
  return values;
}

export const get = name => values[name];
export const all = () => ({ ...values });

let saving = Promise.resolve();
export function set(changes) {
  values = { ...values, ...changes };
  events.dispatchEvent(new CustomEvent('change', { detail: changes }));
  saving = saving.then(() => setValue('settings', values)).catch(() => {});
  return saving;
}

// The ten most recently opened documents, newest first.
export function addRecent(path) {
  const recent = [path, ...values.recent.filter(item => item.toLowerCase() !== path.toLowerCase())].slice(0, 10);
  set({ recent });
}
