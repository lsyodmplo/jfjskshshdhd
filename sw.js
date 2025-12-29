// sw.js — Service Worker for RPG Maker AI Translator ULTIMATE v4.0
// Safe offline cache, NO API caching, GitHub Pages friendly

const CACHE_NAME = 'rpg-ai-translator-v4.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './autotrans.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ===============================
// Install
// ===============================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ===============================
// Activate
// ===============================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ===============================
// Fetch
// ===============================
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // ❌ Never cache API requests (security)
  if (
    req.method !== 'GET' ||
    req.url.includes('/v1/chat') ||
    req.url.includes('api.deepseek')
  ) {
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;

      return fetch(req)
        .then(res => {
          // Only cache same-origin & successful responses
          if (
            !res ||
            res.status !== 200 ||
            res.type !== 'basic'
          ) {
            return res;
          }

          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(req, clone);
          });

          return res;
        })
        .catch(() => {
          // Offline fallback for HTML
          if (req.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
    })
  );
});