// Offline support for the app shell. The site's real value - Quick
// answers and At a glance for all 435 animals - is pure client-side
// data (animals.js + render-data.js), so caching just the shell and
// letting app.js do what it already does gives full offline lookup for
// every animal, not only ones visited before. Only the live Wikipedia
// photo and blurb need a connection, same as they always have.
//
// Cache name carries the same hand-bumped version as the ?v= query
// strings in index.html - bump both together whenever a shell file
// changes, or a returning visitor keeps the stale cached version
// forever instead of picking up the new one.
const VERSION = 'gma-20260904-4';

const SHELL = [
  '/',
  '/style.css?v=20260904-4',
  '/animals.js?v=20260901-1',
  '/render-data.js?v=20260901-1',
  '/mystery.js?v=20260904-4',
  '/app.js?v=20260904-3',
  '/fonts/onest-latin.woff2',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('gma-') && k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Never touch report submissions or anything cross-origin (Wikipedia,
  // the D1-backed API) - only the shell this service worker owns.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => {
        // Offline and this exact URL was never cached - a navigation
        // (e.g. a shared /?a=pangolin link opened with no signal) still
        // gets the cached shell, and app.js reads the real animal out
        // of the real URL once it runs, same as it does online.
        if (req.mode === 'navigate') return caches.match('/');
        return Response.error();
      });
    })
  );
});
