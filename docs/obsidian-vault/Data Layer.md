---
title: Data Layer
aliases: [Data Layer, Repository, Persistence]
tags: [fixmaster, architecture, data]
created: 2026-06-04
---

# 🗄️ Data Layer

Bagian dari [[00 - FixMaster MOC]].

## Pola Repository

FixMaster memakai **abstraksi repository** yang adapter-agnostic. Berbeda dari pendekatan FixNova (satu blob JSONB per key), tiap koleksi di sini adalah **store/tabel berisi baris-baris record** — memungkinkan query terindeks & mutasi atomik.

```
Repository (interface)
├── local-adapter.ts    → IndexedDB (via idb), default offline
└── supabase-adapter.ts → Supabase (cloud), aktif bila env terkonfigurasi
```

Metode inti: `list`, `get`, `put`, `putMany`, `remove`, `subscribe`, `clearAll`.

## Koleksi (EntityMap)

`employees`, `outlets`, `customers`, `inventory`, `suppliers`, `purchaseOrders`, `wallets`, `incomes`, `expenses`, `fixedCosts`, `services`, `sales`, `attendance`, `taskTemplates`, `taskInstances`. Plus singleton `organization`.

## Reaktivitas — `useCollection`

Hook `useCollection(name)` membungkus TanStack Query: query me-`list()` koleksi, lalu `repository.subscribe()` meng-invalidate query saat ada perubahan → UI re-fetch otomatis.

> [!warning] Bug halus yang sudah diperbaiki
> Awalnya hook pakai `initialData: []`. React Query menganggap itu data "fresh", jadi—digabung `staleTime`—fetch saat mount **dilewati** dan UI kosong sampai stale. Solusinya `placeholderData: []`. Detail di [[Decisions & Bug Fixes]].

## Scoping per-outlet (cabang)

`setScope(orgId, outletId)` menetapkan org **dan** cabang aktif. Aturan filter di `list()`:

- **`outletId` aktif = null** → "Semua Outlet": tampilkan semua record org (perilaku lama, aman).
- **`outletId` aktif = sebuah cabang** → tampilkan record cabang itu **plus** record `outletId null` (org-wide, mis. wallet/karyawan/absensi yang memang dipakai bersama).

Pemilihan cabang dipegang `session store` (`activeOutletId`, persist di localStorage) via `setActiveOutlet()`, yang me-`setScope` lalu memicu refetch karena `activeOutletId` ikut masuk **queryKey** `useCollection`. Akibatnya ganti cabang = data seluruh app ikut ter-scope tanpa reload.

> [!tip] Kenapa aturan "null = tampil di semua scope" penting
> Itu membuat perubahan **backward-compatible**: data lama tanpa cabang tetap muncul, dan 164 test tidak berubah. Record bersama (wallet, karyawan) sengaja `outletId null` agar selalu tampil di cabang manapun.

## Logika bisnis murni

Semua aturan domain ada di `src/lib/business/*.ts` — **tanpa** dependensi DOM/repository, jadi 100% unit-testable. Contoh: `isActive()` (servis), `isOverdue()` (tugas), `computeKpis()` (dashboard). Hook UI memanggilnya lalu mem-persist hasil.

### Absensi geofence (Fase 0E)
`attendance.ts` berisi `distanceMeters()` (haversine), `hasGeofence()`, dan `checkWithinGeofence()` — validasi posisi clock-in terhadap koordinat outlet. Entity `Outlet` punya field **opsional** `lat`/`lng`/`geofenceRadiusM`; bila tak diisi = tanpa geofence (clock-in di mana saja, perilaku lama). Anti-"absen nakal" pakai **GPS geofence saja** (selfie sengaja ditolak — lihat [[Decisions & Bug Fixes]]). Logika klien ini **dicerminkan** di RPC `clock_in` (migration `0004_outlet_geofence.sql`) yang jadi batas keamanan sebenarnya (server-side).

**Wiring UI (lengkap):**
- `src/lib/geo.ts` — `getCurrentPosition()`: wrapper promise atas browser Geolocation API (dipisah dari math murni agar `attendance.ts` tetap testable). Pesan error Bahasa Indonesia saat izin ditolak.
- `supabase-client.clockIn()` — panggil RPC `clock_in`; lempar pesan server (mis. di luar radius). Karena RPC **bypass** change-subscription adapter, [AttendancePage](file:///c:/Users/Administrator/Documents/FixMaster/src/features/attendance/AttendancePage.tsx) `refetch()` manual setelahnya.
- **AttendancePage**: cek-in memilih jalur — cloud + outlet ber-geofence → minta GPS + RPC; selain itu (local / tanpa geofence) → tulis langsung seperti dulu. `targetOutlet` = cabang aktif, atau primary/pertama.
- **SettingsPage → OutletRow**: owner set `lat`/`lng`/`radius` per outlet (tombol "Gunakan lokasi saya" mengisi dari GPS saat di lokasi). Kosongkan/"Matikan" = absensi bebas lokasi. Outlet kini dibuat **di wizard** (step "Outlet"), jadi org baru sudah punya ≥1 outlet — geofence bisa langsung diset setelah onboarding tanpa harus bikin outlet dulu. Lihat [[Decisions & Bug Fixes]] (Outlet dibuat di wizard + bug `outlets.outlet_id`).

> [!tip] Konsekuensi penting
> Karena logika ini murni & dipakai ulang, [[Sidebar - Live Diagnostic Rail]] menampilkan angka yang **identik** dengan halamannya — tidak ada aturan terduplikasi.

## Tabel & RPC cloud (Fase 1)

Selain koleksi yang dipetakan ke repository, mode cloud punya tabel & RPC khusus SaaS yang **tidak** lewat adapter (diakses langsung via `supabase-client.ts`):

**Tim (migration `0008`)** — tabel `pending_invites` (org_id, email, role, claimed_at) + RPC security-definer `claim_invite` (dipanggil di `session.bootstrap` saat akun baru belum punya membership → gabung org via email yang cocok), `set_member_role`, `deactivate_member`. Semua mengecek `is_org_manager` & menolak menurunkan/menonaktifkan owner aktif terakhir. Guard yang sama dicerminkan murni di `lib/business/team.ts`. Detail: [[Decisions & Bug Fixes]] (model undangan pending-invite + claim).

**Billing (migration `0009`)** — tabel `invoices` (org_id, plan, amount, status, provider, qris_url, period_start/end, paid_at) + RPC `start_subscription` (bikin invoice pending 1 siklus), `apply_payment` (idempotent: tandai lunas + perpanjang `plan_expired_at` dari `max(now, expiry)`), fungsi `is_org_active` (cek belum suspended & belum lewat grace). Logika siklus murni di `lib/business/billing.ts` (`subscriptionPhase`, `canWrite`, `isOrgActive`). `plan_type` enum **tetap stabil** (label saja yang berganti di `plans.ts`). Provider Mayar di-abstraksi & masih mock — Edge Function `create-invoice`/`mayar-webhook` menyusul saat sandbox key tersedia. Detail: [[Decisions & Bug Fixes]] (billing invoice-based QRIS).

**Enforcement tulis (migration `0010`)** — semua RLS `*_write` policy (operasional, finansial, config) diperketat agar `using`+`with check` wajib `is_org_active(org_id)`. Jadi saat langganan kedaluwarsa (lewat grace), **insert/update/delete diblokir di level DB** untuk semua jalur tulis (termasuk input pemasukan via adapter yang tak lewat RPC) — sementara `*_select` tak disentuh (baca tetap jalan) dan `invoices`/`memberships` tak digerbang (bayar + kelola tim tetap bisa). `supabase-adapter` menerjemahkan error RLS `42501` jadi pesan Indonesia yang ramah.

## Servis: pengambilan barang & garansi

Entity `Service` (di `data/types.ts`) punya field penting yang **terpisah** satu sama lain:

- **`pickedUp` + `pickedUpAt`** — status fisik "barang sudah diambil pelanggan", **independen** dari status pembayaran. Jadi tiket bisa `lunas` tapi belum diambil, atau sebaliknya. Toggle ada di halaman detail.
- **`warrantyServiceUntil` + `warrantyPartsUntil`** — dua tanggal garansi **terpisah**: garansi **jasa** dan garansi **sparepart**. Keduanya diisi saat status → **`selesai`** (bukan lagi otomatis saat `lunas`): teknisi mengisi lama hari masing-masing di StatusModal, **wajib minimal salah satu**, prefill dari default `orgConfig.getWarrantyServiceDays()` (30h) & `getWarrantyPartsDays()` (7h). Expiry = tanggal selesai + lama hari. Chip preset durasi dari `getWarrantyPresets()` ([3,7,14,30,90] default).
- **`warrantyClaimOf`** — bila tiket ini adalah **klaim garansi**, menyimpan ID tiket asli. Tiket klaim dibuat gratis (`finalCost` 0); tiket asli tetap `lunas` & keuangannya utuh.

Helper murni di `lib/business/services.ts`: `warrantyEndDate(service)` (tanggal garansi terjauh antara jasa & sparepart), `isUnderWarranty(service, today)` (true bila **salah satu** garansi masih berlaku, inklusif), dan `canClaimWarranty(service, today)` (syarat: `lunas`, masih dalam garansi, dan bukan tiket klaim). Kerugian garansi dicatat **manual** sebagai expense kategori `'Garansi'` — sengaja tidak ditarik dari inventory/POS. Lihat [[Signature Pages]] & [[Decisions & Bug Fixes]].

## Export data, hapus/erasure, & pelaporan error (P1)

**Export CSV.** `lib/business/export.ts` murni & teruji: `escapeCsvField` (RFC 4180 — quote bila ada koma/kutip/baris-baru, gandakan kutip) **plus guard formula-injection** (sel berawalan `= + - @` diberi prefiks apostrof agar tak dieksekusi Excel/Sheets), `rowsToCsv`/`buildCsv` (BOM UTF-8 agar Excel baca teks Indonesia benar), `csvFilename` (slug bertanggal). Definisi dataset di `features/settings/exportDatasets.ts` memetakan 5 koleksi (servis, penjualan, pelanggan, inventori, keuangan) ke kolom berlabel Indonesia, **skip tombstone** (`deletedAt`), lalu `downloadCsv` (Blob + anchor) di layer UI. Kartu "Export Data" tampil di Settings → **Sistem** (owner-only, karena memuat keuangan + PII). Untuk cadangan, laporan, atau pindah sistem.

**Backup/Restore JSON (lossless).** Berbeda dari CSV (untuk manusia/laporan), backup JSON adalah snapshot **utuh & dapat dipulihkan**. `lib/business/backup.ts` murni & teruji: `buildBackup`/`serializeBackup` (file `{app:'fixmaster', version, exportedAt, orgId, collections, organization}`), `parseBackup` (validasi marker app + versi tak boleh lebih baru), `countRecords`, `backupFilename`, dan `isBackupDue` (logika jatuh tempo pengingat). IO di `features/settings/backupRestore.ts`: `createBackup` membaca **15 koleksi + singleton organization**, `downloadBackup` (Blob JSON), `restoreBackup` = **Replace** (`clearAll` → `putMany` per koleksi + `setSingleton`); record mempertahankan id/orgId/createdAt sehingga relasi utuh. **Restore lokal-only** (mode cloud andalkan backup/PITR Supabase — overwrite massal lintas-org tak aman karena RLS + bentrok id). Kartu "Backup & Restore" owner-only di Settings → Sistem. **Pengingat**: `stores/backup.ts` (frequency + lastBackupAt di localStorage) + `useBackupReminder` di `AppLayout` menampilkan toast sekali saat app dibuka bila jatuh tempo — *nudge-on-open* yang jujur (web app tak bisa job terjadwal saat ditutup). Kartu "Paket Langganan" dihapus dari tab Sistem (redundan dengan tab Langganan).



**Hapus/erasure data (hak "penghapusan" UU PDP).** Di Settings → Sistem (Zona Berbahaya), mode cloud menyediakan **"Hapus Akun Permanen"**: (1) `repository.clearAll()` menghapus data tenant, (2) `deleteAccountCredential()` memanggil Edge Function **`delete-account`** yang—setelah memverifikasi JWT pemanggil—menghapus record `auth.users` miliknya **sendiri** via service_role (kunci admin tak pernah ke browser; user tak bisa menghapus akun orang lain), (3) `signOut()`. Bila fungsi belum di-deploy/gagal, **fallback jujur**: data tetap terhapus, user keluar, dan toast memberi tahu kredensial perlu dihapus via dukungan. Disarankan export dulu sebelum hapus.

**Seam pelaporan error.** `lib/report.ts` = satu titik kirim error. Default **console-only** (tanpa SDK/jaringan/bobot bundle); `setErrorReporter()` memasang tracker nyata (mis. Sentry) sekali saat startup tanpa mengubah call-site lain. `reportError()` membungkus non-Error & **tak pernah throw** walau reporter rusak. `ErrorBoundary.componentDidCatch` kini lewat seam ini (tag `source: root|route`). `initErrorTracking()` (dipanggil di `main.tsx`) lazy-import `@sentry/react` **hanya** bila `VITE_SENTRY_DSN` diset.

## Object Storage, rate limiting, & availability (P1/P2 hardening)

**Storage logo (`src/data/storage.ts`).** Logo org dipindah dari base64 di record `organization` → bucket Supabase Storage `org-logos` (migration `0014`). `uploadOrgLogo(orgId, blob)` — **cloud**: upload ke `org-logos/{orgId}/logo-<ts>.png`, prune logo lama, kembalikan **public URL**; **lokal**: kembalikan dataURL (perilaku lama). Caller cukup simpan hasil ke `Organization.logoDataUrl` (kini bisa dataURL **atau** public URL — dirender langsung sebagai `<img src>`, tanpa resolver). RLS Storage: baca publik (logo tampil di struk + tracking publik), tulis/hapus hanya **manager** org pemilik (`org_id` = segmen path pertama via `storage.foldername`). **Foto perangkat sengaja ditunda** (hindari beban storage).

**Rate limiting (lapisan 9).** Migration `0015`: tabel `rate_events` (RLS-locked) + RPC `check_rate_limit(key, max, window)` (sliding window, self-cleaning, security-definer). RPC publik `track_service` di-redefine untuk throttle **60/menit per org** sebelum lookup (return kosong bila lewat — tanpa bocor error). Tradeoff jujur: per-**org**, bukan per-IP (IP klien tak andal di Postgres). Di klien, `lib/rate-limit.ts` kini punya `slidingWindowAllow()`/`pruneWindow()` murni & teruji; `TrackingPage` memakainya (10/menit) sebagai **defense-in-depth** karena halaman publik membaca via `repository.list`, bukan RPC ber-throttle. Webhook pembayaran sudah diamankan **HMAC** signature; `create-invoice` butuh JWT.

**Availability & recovery (lapisan 13).** Edge Function publik `health` (`supabase/functions/health`, `verify_jwt=false`) → cek konektivitas DB (head-count `organizations`), balas `{status, db, version, time, latencyMs}` (200 sehat / 503 down) untuk uptime monitor eksternal. Prosedur lengkap (RPO/RTO, PITR, restore, rollback Vercel, checklist insiden) di `docs/runbook-backup-recovery.md`.

**Service Worker app-shell (lapisan 10).** `public/sw.js` + `lib/sw-register.ts` (registrasi **prod-only**). Cache **app-shell + aset `/assets` ber-hash** (cache-first, aman karena content-hashed), navigasi network-first → fallback `index.html` offline, cache ber-versi + bersih cache lama agar update tak nyangkut. **Tidak** meng-cache API/data (app real-time/multi-tenant). CSP `worker-src 'self'` mengizinkannya.



## Terkait
- [[Tech Stack]] · [[Decisions & Bug Fixes]] · [[Sidebar - Live Diagnostic Rail]]

#architecture #data
