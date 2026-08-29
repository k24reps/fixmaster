/*
 * FixMaster — Service Worker (app-shell offline).
 *
 * Scope (deliberately conservative): cache the app shell + hashed build assets
 * so the UI loads instantly and works offline as a shell. It does NOT cache
 * API/data responses — FixMaster is real-time/multi-tenant and stale data
 * would be misleading. Data still requires a connection (or the local
 * IndexedDB adapter in local mode).
 *
 * Cache-busting strategy:
 *  - CACHE name is versioned; bump CACHE_VERSION on shell changes.
 *  - activate → delete all caches that don't match → no "stuck" old shells.
 *  - skipWaiting + clients.claim → updates take effect on next load.
 *  - Vite assets under /assets/ are content-hashed, so cache-first is safe.
 *  - Navigations use network-first, falling back to cached index.html offline.
 */

const CACHE_VERSION = 'v2';
const CACHE = `fixmaster-shell-${CACHE_VERSION}`;

// Minimal shell precache. Hashed assets are cached lazily on first fetch.
const SHELL = [
  '/',
  '/index.html',
  '/manifest-volt.webmanifest',
  '/favicon-volt.svg',
  '/logo-volt.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle same-origin requests; let the network handle the rest
  // (Supabase API, Google Fonts, Sentry, etc. — never cache those here).
  if (url.origin !== self.location.origin) return;

  // SPA navigations: network-first, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    );
    return;
  }

  // Hashed build assets: cache-first (immutable, content-hashed by Vite).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }),
      ),
    );
    return;
  }

  // Other same-origin GETs (icons, og-image): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});
