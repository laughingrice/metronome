// NOTE: bump CACHE_NAME to force SW updates when you change assets
const CACHE_NAME = 'metronome-synth-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  // We cache the React libraries so it works offline
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js'
];

// Install Event: Cache files and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    .then(() => {
      // take control of the page quicker on next load
      return self.skipWaiting();
    })
  );
});

// Fetch Event: network-first for navigation (index.html) so PWA picks up updates quickly,
// cache-first for other static assets.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Navigation requests -> network-first
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      fetch(req).then((res) => {
        // update cache for next time
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put('/', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // For other assets, try cache first then network
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then(res => {
      // optionally cache new requests from same origin
      if (url.origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return res;
    }))
  );
});

// Activate Event: Clean up old caches and take control of clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Allow the page to tell the SW to skipWaiting (activate new SW immediately)
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});