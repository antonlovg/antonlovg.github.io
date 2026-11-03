// Matschemat utan nät (bara /matschema/). Allt sidan behöver sparas när den installeras. Med nät hämtas
// filerna på nytt (så att ändringar syns direkt) men ger upp efter 3 sekunder, så att sidan öppnas
// snabbt även med dålig täckning i butiken; då, och utan nät, används den sparade kopian.
const CACHE = 'matschema-v9';
const FONT = '/assets/fonts/manrope-latin-wght.woff2';
const PRECACHE = [
  './',
  'matschema.css',
  'icon.svg',
  'manifest.webmanifest',
  'js/app.js',
  'js/plan.js',
  'js/recipes.js',
  'js/foods.js',
  'js/store.js',
  'js/sync.js',
  'js/theme.js',
  FONT
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(name => name.startsWith('matschema') && name !== CACHE).map(name => caches.delete(name))))
    .then(() => self.clients.claim()));
});

const timeout = ms => new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), ms));

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const inScope = url.pathname.startsWith(new URL('./', location).pathname) || url.pathname === FONT;
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
