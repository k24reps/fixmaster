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

const CACHE_VERSION = 'v3';
const CACHE = `fixmaster-shell-${CACHE_VERSION}`;

/**
 * SATU pintu penulisan cache, dan ia MENOLAK respons yang tidak OK.
 *
 * Sebelumnya tiap cabang fetch menyimpan apa pun yang dikembalikan jaringan.
 * Untuk /assets/ yang dilayani cache-first, sekali saja sebuah 404 masuk
 * cache, ia disajikan SELAMANYA — jaringan tidak pernah ditanya lagi. Itu
 * yang terjadi ketika tab lama meminta chunk ber-hash yang sudah diganti
 * deploy: 404-nya diawetkan, dan import dinamis gagal terus meski file yang
 * benar sudah ada di server. Memuat ulang halaman pun tak menolong.
 */
function putIfOk(request, response) {
  if (!response || !response.ok || response.status === 206) return;
  const copy = response.clone();
  caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
}

/**
 * Aset ber-hash yang hilang tidak selalu menjawab 404. Server yang memakai
 * fallback SPA menjawab 200 dengan index.html — lolos dari pemeriksaan
 * `response.ok` di atas, lalu diawetkan cache-first dan disajikan sebagai
 * JavaScript selamanya. Browser menolaknya dengan "Expected a
 * JavaScript-or-Wasm module script but the server responded with a MIME
 * type of text/html", dan memuat ulang halaman TIDAK menolong karena
 * jawabannya datang dari cache, bukan jaringan.
 *
 * Produksi saat ini menjawab 404 yang benar (vercel.json memakai daftar
 * rute eksplisit, bukan catch-all), tetapi `vite preview` tidak — dan satu
 * perubahan konfigurasi cukup untuk mengembalikan perilaku itu. Murah untuk
 * dijaga di sini.
 */
function looksLikeSpaFallback(response) {
  return (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
}

// Minimal shell precache. Hashed assets are cached lazily on first fetch.
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/logo.svg',
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
          putIfOk('/index.html', res);
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
            if (!looksLikeSpaFallback(res)) putIfOk(req, res);
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
          putIfOk(req, res);
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});
