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
 *  - Navigations use network-first, falling back to cached index.html offline.
 *  - /assets/ TIDAK disentuh SW (v4). Dulu cache-first di sini: setelah deploy
 *    14 Sep, halaman yang dikendalikan SW memuat index.html baru tetapi skrip
 *    entry & vendor-nya gagal `net::ERR_FAILED` — padahal fetch SW sendiri
 *    untuk file yang sama menjawab 200 — dan React tak pernah terpasang
 *    (halaman kosong sampai dibuka ulang). Aset ber-hash sudah `immutable`
 *    1 tahun di cache HTTP (vercel.json), jadi SW tidak menambah apa pun selain
 *    titik gagal — dan cache-nya menumpuk semua versi aset tiap deploy.
 */

const CACHE_VERSION = 'v4';
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

  // Hashed build assets: langsung ke jaringan/cache HTTP browser (lihat header).
  if (url.pathname.startsWith('/assets/')) return;

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
