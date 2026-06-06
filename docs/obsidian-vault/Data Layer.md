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

## Servis: pengambilan barang & garansi

Entity `Service` (di `data/types.ts`) punya field penting yang **terpisah** satu sama lain:

- **`pickedUp` + `pickedUpAt`** — status fisik "barang sudah diambil pelanggan", **independen** dari status pembayaran. Jadi tiket bisa `lunas` tapi belum diambil, atau sebaliknya. Toggle ada di halaman detail.
- **`warrantyServiceUntil` + `warrantyPartsUntil`** — dua tanggal garansi **terpisah**: garansi **jasa** dan garansi **sparepart**. Keduanya diisi saat status → **`selesai`** (bukan lagi otomatis saat `lunas`): teknisi mengisi lama hari masing-masing di StatusModal, **wajib minimal salah satu**, prefill dari default `orgConfig.getWarrantyServiceDays()` (30h) & `getWarrantyPartsDays()` (7h). Expiry = tanggal selesai + lama hari. Chip preset durasi dari `getWarrantyPresets()` ([3,7,14,30,90] default).
- **`warrantyClaimOf`** — bila tiket ini adalah **klaim garansi**, menyimpan ID tiket asli. Tiket klaim dibuat gratis (`finalCost` 0); tiket asli tetap `lunas` & keuangannya utuh.

Helper murni di `lib/business/services.ts`: `warrantyEndDate(service)` (tanggal garansi terjauh antara jasa & sparepart), `isUnderWarranty(service, today)` (true bila **salah satu** garansi masih berlaku, inklusif), dan `canClaimWarranty(service, today)` (syarat: `lunas`, masih dalam garansi, dan bukan tiket klaim). Kerugian garansi dicatat **manual** sebagai expense kategori `'Garansi'` — sengaja tidak ditarik dari inventory/POS. Lihat [[Signature Pages]] & [[Decisions & Bug Fixes]].

## Terkait
- [[Tech Stack]] · [[Decisions & Bug Fixes]] · [[Sidebar - Live Diagnostic Rail]]

#architecture #data
