/* Offline: every file the app needs is cached on first visit. After that it runs with no network. */
const CACHE = 'dead-reckoning-v3';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/qrcode.js', 'vendor/jsQR.js', 'vendor/fonts.css',
  'vendor/fonts/orbitron-500.woff2', 'vendor/fonts/orbitron-700.woff2', 'vendor/fonts/orbitron-900.woff2',
  'vendor/fonts/rajdhani-500.woff2', 'vendor/fonts/rajdhani-600.woff2', 'vendor/fonts/rajdhani-700.woff2',
  'js/data/map.js', 'js/data/intel.js', 'js/data/catalog.js', 'js/data/guide.js', 'js/account.js', 'js/community.js', 'js/ui-crew.js',
  'js/geo.js', 'js/state.js', 'js/route.js', 'js/mapview.js', 'js/comms.js', 'js/sentinel.js', 'js/ui.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // network first (always the newest app and intel when any connection exists), cache when offline
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
