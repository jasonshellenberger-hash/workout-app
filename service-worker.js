/* Offline support: cache the app shell on install, serve it cache-first.
 * After changing any app file, bump CACHE_VERSION so phones pick up the new files.
 * A new version installs in the background and waits. Today shows "Update ready, tap to reload",
 * and the tap sends SKIP_WAITING. Closing the app fully also lets it take over on the next launch.
 */
const CACHE_VERSION = 'v8';
const CACHE = `workout-${CACHE_VERSION}`;

// Navigations (including './') are answered from the cached index.html below.
const ASSETS = [
  'index.html',
  'styles.css',
  'db.js',
  'adapt.js',
  'track.js',
  'app.js',
  'exercises.json',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('workout-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // demo video links etc. go straight to the network

  // App navigations always get the cached shell, so it opens in a dead zone.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then(hit => hit || fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
