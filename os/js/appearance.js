// Applies the theme and wallpaper from settings (and again whenever they change).
import * as settings from './settings.js';
import * as vfs from './vfs.js';

export const THEMES = { classic: 'Classic (grey)', lautus: 'Lautus (dark)', mizu: 'Mizu (light blue)' };
export const WALLPAPERS = { reactos: 'Blue Lagoon', teal: 'Teal', night: 'Night Sky', sunset: 'Sunset', plain: 'Plain colour', image: 'Picture from C:' };

let imageUrl = '';

export async function applyAppearance() {
  const root = document.documentElement;
  root.dataset.theme = settings.get('theme') in THEMES ? settings.get('theme') : 'classic';
  const wallpaper = settings.get('wallpaper');
  root.dataset.wallpaper = wallpaper in WALLPAPERS ? wallpaper : 'reactos';
  const desktop = document.getElementById('desktop');
  if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = ''; }
  desktop.style.backgroundImage = '';
  desktop.style.backgroundSize = '';
  if (wallpaper === 'image' && settings.get('wallpaperImage')) {
    try {
      imageUrl = URL.createObjectURL(await vfs.read(settings.get('wallpaperImage')));
      desktop.style.backgroundImage = `url("${imageUrl}")`;
      desktop.style.backgroundSize = { cover: 'cover', contain: 'contain', center: 'auto', tile: 'auto' }[settings.get('wallpaperFit')] || 'cover';
      desktop.style.backgroundRepeat = settings.get('wallpaperFit') === 'tile' ? 'repeat' : 'no-repeat';
    } catch {
      root.dataset.wallpaper = 'reactos';
    }
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--taskbar').trim() || '#c0c0c0';
}

settings.events.addEventListener('change', event => {
  if (['theme', 'wallpaper', 'wallpaperImage', 'wallpaperFit'].some(name => name in event.detail)) applyAppearance();
});
