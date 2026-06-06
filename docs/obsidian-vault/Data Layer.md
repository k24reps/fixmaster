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

> [!tip] Konsekuensi penting
> Karena logika ini murni & dipakai ulang, [[Sidebar - Live Diagnostic Rail]] menampilkan angka yang **identik** dengan halamannya — tidak ada aturan terduplikasi.

## Servis: pengambilan barang & garansi

Entity `Service` (di `data/types.ts`) punya field penting yang **terpisah** satu sama lain:

- **`pickedUp` + `pickedUpAt`** — status fisik "barang sudah diambil pelanggan", **independen** dari status pembayaran. Jadi tiket bisa `lunas` tapi belum diambil, atau sebaliknya. Toggle ada di halaman detail.
- **`warrantyServiceUntil` + `warrantyPartsUntil`** — dua tanggal garansi **terpisah**: garansi **jasa** dan garansi **sparepart**. Keduanya diisi saat status → **`selesai`** (bukan lagi otomatis saat `lunas`): teknisi mengisi lama hari masing-masing di StatusModal, **wajib minimal salah satu**, prefill dari default `orgConfig.getWarrantyServiceDays()` (30h) & `getWarrantyPartsDays()` (7h). Expiry = tanggal selesai + lama hari. Chip preset durasi dari `getWarrantyPresets()` ([3,7,14,30,90] default).
- **`warrantyClaimOf`** — bila tiket ini adalah **klaim garansi**, menyimpan ID tiket asli. Tiket klaim dibuat gratis (`finalCost` 0); tiket asli tetap `lunas` & keuangannya utuh.

Helper murni di `lib/business/services.ts`: `warrantyEndDate(service)` (tanggal garansi terjauh antara jasa & sparepart), `isUnderWarranty(service, today)` (true bila **salah satu** garansi masih berlaku, inklusif), dan `canClaimWarranty(service, today)` (syarat: `lunas`, masih dalam garansi, dan bukan tiket klaim). Kerugian garansi dicatat **manual** sebagai expense kategori `'Garansi'` — sengaja tidak ditarik dari inventory/POS. Lihat [[Signature Pages]] & [[Decisions & Bug Fixes]].

## Terkait
- [[Tech Stack]] · [[Decisions & Bug Fixes]] · [[Sidebar - Live Diagnostic Rail]]

#architecture #data
