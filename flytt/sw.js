// Flyttlistan utan nät (bara /flytt/). Allt sidan behöver sparas när den installeras. Med nät hämtas filerna
// på nytt (så att ändringar syns direkt) men ger upp efter 3 sekunder; då, och utan nät, används den sparade kopian.
const CACHE = 'flytt-v4';
const PRECACHE = [
  './',
  'flytt.css',
  'icon.svg',
  'manifest.webmanifest',
  'fonts/caveat-700.woff2',
  'fonts/patrick-hand-400.woff2',
  'js/app.js',
  'js/list.js',
  'js/store.js',
  'js/sync.js',
  'js/theme.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(name => name.startsWith('flytt') && name !== CACHE).map(name => caches.delete(name))))
    .then(() => self.clients.claim()));
});

const timeout = ms => new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms));

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const inScope = url.pathname.startsWith(new URL('./', location).pathname);
  if (request.method !== 'GET' || url.origin !== location.origin || !inScope) return;
  const network = fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  event.respondWith(Promise.race([network, timeout(3000)])
    .catch(() => caches.match(request, { ignoreSearch: true }).then(hit => hit || (request.mode === 'navigate' ? caches.match('./') : network))));
});
