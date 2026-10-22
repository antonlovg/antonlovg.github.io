// Offline support for LövOS (scope /os/ only). Everything LövOS needs is cached on install, so it
// starts without a connection. Pages and scripts are fetched fresh when online (falling back to the
// cache), and the DOSBox files are served from the cache. Bump CACHE when the vendored files change.
const CACHE = 'lovos-v1';
const PRECACHE = [
  './',
  'os.css',
  'icons.svg',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'manifest.webmanifest',
  'apps.json',
  'games.json',
  'js/main.js',
  'js/dom.js',
  'js/vfs.js',
  'js/settings.js',
  'js/sound.js',
  'js/wm.js',
  'js/menu.js',
  'js/dialogs.js',
  'js/files.js',
  'js/apps.js',
  'js/dnd.js',
  'js/fileops.js',
  'js/progress.js',
  'js/properties.js',
  'js/desktop.js',
  'js/taskbar.js',
  'js/sync.js',
  'js/seed.js',
  'js/appearance.js',
  'js/games.js',
  'js/dos-audio.js',
  'js/lib/path.js',
  'js/lib/zip.js',
  'js/lib/dos-keys.js',
  'js/lib/dos-config.js',
  'js/lib/sync-plan.js',
  'js/lib/calc.js',
  'js/lib/shell.js',
  'js/apps/explorer.js',
  'js/apps/notepad.js',
  'js/apps/paint.js',
  'js/apps/calc.js',
  'js/apps/mines.js',
  'js/apps/cmd.js',
  'js/apps/dos.js',
  'js/apps/dosgames.js',
  'js/apps/taskmgr.js',
  'js/apps/control.js',
  'js/apps/about.js',
  'js/apps/help.js',
  'vendor/js-dos/emulators.js',
  'vendor/js-dos/wdosbox.js',
  'vendor/js-dos/wdosbox.wasm',
  'vendor/js-dos/wlibzip.js',
  'vendor/js-dos/wlibzip.wasm',
  'vendor/js-dos/NOTICE.txt',
  'vendor/js-dos/LICENSE',
  // Shared with the rest of lovgren.dev: the Minesweeper rules.
  '/assets/minesweeper.js'
];
const SHARED = ['/assets/minesweeper.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(name => name.startsWith('lovos') && name !== CACHE).map(name => caches.delete(name))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const inScope = url.pathname.startsWith(new URL('./', location).pathname) || SHARED.includes(url.pathname);
  if (request.method !== 'GET' || url.origin !== location.origin || !inScope) return;
  if (url.pathname.includes('/vendor/')) {
    event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
    return;
  }
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request, { ignoreSearch: true }).then(hit => hit || caches.match('./'))));
});
