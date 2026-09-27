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
├── local-adapter.ts     → IndexedDB (via idb), default offline
├── supabase-adapter.ts  → Supabase (cloud), aktif bila env terkonfigurasi
└── in-memory-adapter.ts → RAM-only (Map), khusus demo publik
```

Metode inti: `list`, `get`, `put`, `putMany`, `remove`, `subscribe`, `clearAll`.

### `patch` — tulis sebagian kolom (0087)

`repository.patch(collection, id, fields)` mengubah kolom yang dikirim saja. Di cloud ia
`UPDATE` biasa, sedangkan `put` = upsert **baris penuh** dari salinan klien yang bisa basi
(DP tiket pernah tertimpa begini). Pakai `patch` untuk mengubah record yang sudah ada dari
data layar; `put` untuk membuat record baru atau jalur lokal yang baru membaca ulang.
Lokal/in-memory: `get` + gabung + `put`.

### Repository swappable (live-binding) — untuk demo publik

`src/data/index.ts` meng-ekspor `repository` sebagai **ES live-binding mutable**. `installRepository(impl)` menukar instance saat runtime, `resetRepository()` mengembalikannya. Karena semua pemanggil (`useCollection`, `session`, dll) membaca binding **saat dipanggil**, menukar instance langsung mengalihkan seluruh app tanpa reload.

[`InMemoryAdapter`](src/data/in-memory-adapter.ts) — implementasi `Repository` berbasis `Map` (singleton per-instance), mencerminkan `LocalAdapter`: audit-stamp (`createdAt/updatedAt`), scoping `orgId`, soft-delete (tombstone), singleton per-org, dan mekanik `notify()`/`subscribe()`. **RAM-only**: nol jejak disk, hilang saat tab ditutup, tak menyentuh IndexedDB asli pengunjung. Dipakai oleh **demo interaktif** (lihat [[Signature Pages]] § Demo Interaktif). Teruji paritas di `in-memory-adapter.test.ts` (8 tes).

> [!NOTE]
> `commitWizard()` punya opsi `{forceLocal}`. Di produksi (`isSupabaseConfigured`) wizard normal menulis ke cloud RPC; demo memakai `forceLocal:true` agar seed menulis ke `InMemoryAdapter` yang baru dipasang (pengunjung anonim tak punya akun cloud).

## Koleksi (EntityMap)

`employees`, `outlets`, `customers`, `inventory`, `suppliers`, `purchaseOrders`, `wallets`, `incomes`, `expenses`, `fixedCosts`, `services`, `sales`, `attendance`, `taskTemplates`, `taskInstances`, `activity`, `walletTransfers` (0086 — transfer antar wallet, lihat [[Decisions & Bug Fixes#Transfer punya tabel sendiri + bisa diedit/dibatalkan (0086, 25 Sep 2026)]]). Plus singleton `organization`.

## Reaktivitas — `useCollection`

Hook `useCollection(name)` membungkus TanStack Query: query me-`list()` koleksi, lalu `repository.subscribe()` meng-invalidate query saat ada perubahan → UI re-fetch otomatis.

Sejak 28 Agu 2026, kontrak hasil hook tidak hanya `{ data, loading, refetch }`, tetapi juga
`refreshing`, `error`, dan `updatedAt`; `useCollectionRange` punya kontrak yang sama. `loading`
tetap **true selama `placeholderData: []` masih aktif**, supaya array kosong sementara tidak dapat
ditampilkan sebagai angka bisnis nol atau empty state yang sah. `updatedAt` memungkinkan halaman
mempertahankan data terakhir secara jujur ketika refresh gagal, sedangkan error sebelum fetch
pertama harus menyembunyikan angka turunan dan memberi retry. Dijaga 2 unit test baru.

> [!warning] Bug halus yang sudah diperbaiki
> Awalnya hook pakai `initialData: []`. React Query menganggap itu data "fresh", jadi—digabung `staleTime`—fetch saat mount **dilewati** dan UI kosong sampai stale. Solusinya `placeholderData: []`. Detail di [[Decisions & Bug Fixes]].

## Scoping per-outlet (cabang)

`setScope(orgId, outletId)` menetapkan org **dan** cabang aktif. Aturan filter di `list()`:

- **`outletId` aktif = null** → "Semua Outlet": tampilkan semua record org (perilaku lama, aman).
- **`outletId` aktif = sebuah cabang** → tampilkan record cabang itu **plus** record `outletId null` (org-wide, mis. wallet/karyawan/absensi yang memang dipakai bersama).

Pemilihan cabang dipegang `session store` (`activeOutletId`, persist di localStorage) via `setActiveOutlet()`, yang me-`setScope` lalu memicu refetch karena `activeOutletId` ikut masuk **queryKey** `useCollection`. Akibatnya ganti cabang = data seluruh app ikut ter-scope tanpa reload.

> [!tip] Kenapa aturan "null = tampil di semua scope" penting
> Itu membuat perubahan **backward-compatible**: data lama tanpa cabang tetap muncul, dan 164 test tidak berubah. Record bersama (wallet, karyawan) sengaja `outletId null` agar selalu tampil di cabang manapun.

### Tim per-outlet & wallet Hybrid (Level 2 — migrasi `0023`–`0026`)

Memperluas scoping menjadi **penguncian per-karyawan** + laporan per-cabang akurat. Detail migrasi di bawah; ringkas kontraknya:

- **`allowedOutletIds`** (session store) — daftar outlet yang boleh diakses user. Diisi dari `membership_outlets` saat `getMyMembership()`. **Kosong = tanpa batasan** (manager, mode lokal, atau pra-penugasan).
- **`resolveCreateOutlet(outlets)`** & **`mustPickOutlet(count)`** (`session.ts`, teruji 12 test) — menentukan outlet yang distempel pada transaksi baru (aktif → satu-satunya yang diizinkan → primary/pertama) dan apakah user multi-cabang **wajib memilih** cabang dulu (OQ-C).
- **Wallet Hybrid**: `wallets.outlet_id` nullable. `null` = kas **Bersama** (semua cabang), berisi ID = kas **khusus cabang**. Saat scope cabang aktif, `list('wallets')` menampilkan kas bersama + kas cabang itu (aturan `or(outlet_id.eq,outlet_id.is.null)`).
- **RPC sadar-outlet**: `process_sale` & `settle_service` kini menstempel `outlet_id` + memvalidasi lewat `can_use_outlet()`. Ini juga **memperbaiki bug laten**: tulis wallet/inventory dari klien = manager-only (RLS `0010`/`0017`), jadi kasir-karyawan sebelumnya **tak bisa** menuntaskan transaksi di cloud. POS/StatusModal kini memakai RPC (cloud) vs tulis langsung (lokal).

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

**Tim (migration `0008`, diperketat `0016`)** — tabel `pending_invites` (org_id, email, role, claimed_at) + RPC security-definer `claim_invite` (dipanggil di `session.bootstrap` saat akun baru belum punya membership → gabung org via email yang cocok), `set_member_role`, `deactivate_member`. Semua mengecek `is_org_manager` & menolak menurunkan/menonaktifkan owner aktif terakhir. **Sejak `0016`: hanya OWNER yang boleh mengelola peran owner** (promote ke owner, demote/nonaktifkan owner) — admin ditolak; policy `mbr_manage` juga menambah guard `role <> 'owner' or is_org_owner(...)` agar admin tak bisa mem-bypass via PostgREST langsung. Guard yang sama dicerminkan murni di `lib/business/team.ts`. Detail: [[Decisions & Bug Fixes]] (model undangan pending-invite + claim).

**Billing (migration `0009` → `0047`)** — tabel `invoices` tetap menjadi buku pembayaran (org, paket, nominal, status, provider, periode, waktu lunas), sedangkan `is_org_active` tetap menjadi gerbang akses tulis. Sejak `0047`, klien **tidak dapat membuat atau melunasi invoice sendiri**: RPC `start_subscription`, `apply_payment`, `cancel_invoice`, dan seluruh RPC GoPay dihapus. Tombol paket hanya membuat deep-link WhatsApp yang memuat nama + id organisasi, paket, masa aktif, jumlah outlet, dan nominal; helper murninya `manualPaymentWhatsAppLink()` di `lib/business/billing.ts`.

Satu-satunya jalur perpanjangan adalah `admin_confirm_manual_payment(org, plan, months, amount, reference, reason)`: admin platform memverifikasi bukti bayar di WhatsApp, RPC mengunci baris organisasi, membuat invoice langsung `paid` dengan `provider='manual_whatsapp'`, memperpanjang dari `greatest(now(), expiry)`, mengganti paket ke Solo/Pro, lalu menulis `payment_manual` ke `operator_actions`. Referensi dan catatan verifikasi wajib; durasi 1–12 bulan; nominal harus positif. Grant hanya `authenticated`, lalu fail-closed dengan `is_platform_admin()` di dalam fungsi. Invoice pending lama dipertahankan apa adanya untuk audit, tetapi tidak ditampilkan sebagai riwayat pembayaran aktif.

**Enforcement tulis (migration `0010`)** — semua RLS `*_write` policy (operasional, finansial, config) diperketat agar `using`+`with check` wajib `is_org_active(org_id)`. Jadi saat langganan kedaluwarsa (lewat grace), **insert/update/delete diblokir di level DB** untuk semua jalur tulis (termasuk input pemasukan via adapter yang tak lewat RPC) — sementara `*_select` tak disentuh (baca tetap jalan) dan `invoices`/`memberships` tak digerbang (bayar + kelola tim tetap bisa). `supabase-adapter` menerjemahkan error RLS `42501` jadi pesan Indonesia yang ramah.

### Historis — listener GoPay (`0043`–`0046`, dinonaktifkan `0047`)

> [!WARNING]
> Bagian ini adalah catatan keputusan historis, **bukan arsitektur aktif**. `0047` menghapus RPC/index GoPay, Edge Function, env QR, skrip rekonsiliasi, dan panel rekonsiliasi. Jangan memakai instruksi di bawah untuk deployment baru.

Jalur billing alternatif yang **memakai akun GoPay merchant sendiri**, bukan gateway berlisensi. Notifikasi GoPay tidak membawa order id — hanya nominal — jadi **nominal itulah korelatornya**. Konsekuensinya nominal wajib unik di antara invoice yang terbuka, dan itu ditegakkan **partial unique index** `uq_invoices_gopay_open_amount` (`on invoices(amount) where status='pending' and provider='gopay'`), bukan cek di kode aplikasi — sehingga tidak ada celah check-then-insert.

RPC:
- `start_gopay_invoice(plan, amount)` → `(invoice_id, exact_amount)`. OWNER-only + supersede pending lama (aturan `0016`); nominal = `floor(amount) + random(0..999)`, di-retry sampai unique index menerima (maks 50x). Mengembalikan nominal persis yang harus dibayar.
- `claim_gopay_payment(amount)` → `uuid | null`. **`service_role` saja** (diperketat di `0044`, lihat di bawah) — fungsi ini menandai lunas tanpa bukti selain nominal, dan user tahu nominal invoice-nya sendiri, jadi akses dari sesi login mengulang celah F5 di `0022`. Pakai `for update skip locked` agar dua notifikasi bersamaan tak bisa sama-sama mengklaim. Memanggil `apply_payment` — lolos guard `0022` karena `auth.role()` membaca klaim JWT dan tidak berubah oleh nesting RPC.
- `expire_stale_gopay_invoices()` — pending gopay > 30 menit jadi `expired` sehingga nominalnya kembali ke pool. Dipanggil on-demand oleh kedua entry point, **tanpa cron**.

**Koreksi `0044` — `revoke ... from public` TIDAK cukup di Supabase.** Probe langsung ke staging menemukan `claim_gopay_payment` bisa dieksekusi **tanpa login** (balas `null`, bukan menolak). Sebabnya: Supabase memasang *default privileges* yang meng-grant EXECUTE **eksplisit ke role `anon` dan `authenticated`** untuk tiap fungsi baru di schema `public`; mencabut dari `PUBLIC` tidak menghapus grant eksplisit itu. Dampaknya tertahan guard `apply_payment` (`0022`) sehingga tak ada langganan gratis, tapi anon tetap bisa memicu expire + menyelidik nominal invoice terbuka. `0044` memperbaiki dua lapis: revoke ke `anon`/`authenticated`, **dan** guard `auth.role() <> 'service_role'` di dalam `claim_gopay_payment` — lapis kedua yang menentukan, karena default privileges berlaku lagi saat fungsi dibuat pertama kali di environment baru (produksi).

> Jebakan turunan: `expire_stale_gopay_invoices()` **tidak** boleh diberi guard `auth.role()`. Ia dipanggil dari dalam `start_gopay_invoice` yang pemanggilnya owner ber-JWT `authenticated`. `SECURITY DEFINER` mengganti `current_user` (hak EXECUTE lolos sebagai pemilik fungsi) tetapi **tidak** mengganti `auth.role()`. Memberi guard di sana mematikan pembuatan invoice. Untuk fungsi itu pencabutan grant sudah cukup.

Edge Function `gopay-listener`, parser, env `VITE_GOPAY_QRIS_URL`, dan skrip `reconcile-gopay.mjs` kemudian dihapus oleh `0047`. Dokumen perangkat dipertahankan hanya sebagai arsip keputusan.

**Gateway hosted dicabut seluruhnya.** Edge Function `create-invoice`, `duitku-webhook`, dan `fersaku-webhook` dihapus, entri `config.toml`-nya dibuang, dan `createPaymentInvoice()` dihapus dari data layer. Sisa Edge Function: `gopay-listener`, `delete-account`, `health`. Kolom `provider`/`provider_ref`/`qris_url` **tetap** — baris invoice lama tetap terbaca. Di pay dock, invoice pending milik provider lama sengaja **tidak** lagi menampilkan link bayar: checkout-nya mungkin masih menerima uang padahal webhook konfirmasinya sudah tiada, jadi UI menyuruh membatalkan dan membuat ulang.

### Admin platform & dashboard operator (migration `0045`) — SATU-SATUNYA permukaan lintas-tenant

> [!WARNING]
> Seluruh keamanan FixMaster berdiri di atas satu prinsip: tiap org hanya melihat datanya sendiri, dipagari RLS. **`0045` sengaja mendobrak pagar itu di satu tempat.** Ini satu-satunya permukaan lintas-tenant di sistem — satu bug gating = data seluruh klien bocor sekaligus. Perlakukan tiap perubahan di sini sebagai perubahan keamanan.

Sebelum `0045` tak ada konsep peran global sama sekali: tidak ada tabel `profiles`, `auth.jwt()`/`raw_app_meta_data` nol dipakai, dan satu-satunya identitas di atas keanggotaan org adalah `service_role`.

**Tabel `platform_admins`** — `user_id` (PK, FK `auth.users`), `email`, `note`, `created_at`. RLS aktif dengan **nol policy**: tidak terbaca lewat REST oleh siapa pun, hanya fungsi `security definer`. Pola yang sama dipakai `rate_events` (`0015`). **Bootstrap admin pertama sengaja di luar band** (insert manual via SQL Editor/service_role) — tidak boleh ada jalur self-promote dari aplikasi.

RPC (semua `security definer` + `set search_path = public, pg_temp`, gate `is_platform_admin()` di baris pertama):
- `is_platform_admin()` → boolean. Aman di-grant `authenticated`: hanya membocorkan status diri sendiri, bukan daftar admin.
- `admin_list_orgs()` → satu baris per org: `org_id, org_name, org_plan, expires_at, registered_at, demo, outlet_count, user_count, service_count, last_activity_at, last_paid_at, last_paid_reference, note`. Urut `plan_expired_at asc nulls last`. `last_activity_at` ditopang index `idx_activity_org_created` (`0019`).
- `admin_confirm_manual_payment()` (sejak `0047`, diperketat `0049`) → satu-satunya aksi berbayar: validasi harga resmi + invoice paid + perpanjangan + audit dalam satu transaksi.

**Batas privasi ditegakkan di level skema query, bukan di UI:** yang diekspos hanya metadata + **jumlah agregat**. Tidak ada nama pelanggan klien, detail tiket, atau angka keuangan mereka. Vendor perlu tahu klien X jatuh tempo, bukan mengintip pelanggan klien X — sekaligus memperkecil ledakan bila surface ini bocor. Ada tes yang mengasersikan tidak ada kolom bocoran.

**Pembayaran manual dibungkus RPC khusus.** `admin_confirm_manual_payment` tidak menerima id invoice buatan klien; ia membuat invoice paid sendiri setelah operator memilih paket/durasi dan mengisi referensi bukti. Nominal dihitung UI lalu dihitung ulang server dari paket × bulan × outlet aktif; selisih satu rupiah pun ditolak. Ini menghapus ambiguitas antara “klik saya sudah bayar”, promo gratis, dan uang yang benar-benar sudah diverifikasi.

Grant mengikuti pelajaran `0044`: `revoke ... from public, anon` lalu `grant ... to authenticated` (fungsi self-gated). Klien memakainya lewat free function di [supabase-client.ts](src/data/supabase-client.ts) (`isPlatformAdmin`, `adminListOrgs`, `adminConfirmManualPayment`) — **bukan** lewat `repository`/`useCollection`, karena `SupabaseAdapter` single-tenant secara konstruksi. Tidak ada service key di browser.

UI: `/operator` ([OperatorPage.tsx](src/features/operator/OperatorPage.tsx)), route sibling top-level **di luar `AuthGate`**. Lihat [[Decisions & Bug Fixes]] untuk alasannya.

### Kontrol operator & jejak aksi (migration `0046`)

`0045` memberi vendor kemampuan **melihat** semua klien; `0046` memberi kemampuan **mengubah**. Karena itu ia dimulai dari tabel jejaknya, bukan dari fiturnya.

> [!IMPORTANT]
> **Aturan yang mengikat migrasi berikutnya:** setiap RPC admin yang MENULIS wajib memanggil `log_operator_action()`. Kalau sebuah RPC tulis tidak mencatat, jangan di-merge.

**Tabel:**
- `operator_actions` — `org_id` (FK `on delete set null`, agar jejak tak ikut hilang saat org dihapus), `org_name` disalin, `actor_id/actor_email`, `action`, `reason`, `detail jsonb`, `created_at`. RLS nol policy.
- `client_notes` — catatan internal vendor per klien. **Tabel terpisah, bukan kolom di `organizations`**: RLS mengizinkan anggota org membaca barisnya sendiri, jadi kolom di sana akan terbaca klien. Catatan "bingung di alur DP" bukan konsumsi klien. RLS nol policy.

**RPC (semua gate `is_platform_admin()` + `set search_path`):**
- `admin_suspend_org(org, reason)` — set `plan_type='suspended'`. **Alasan wajib** (RPC menolak string kosong). Memakai `set_config('fixmaster.bypass_plan_lock')` seperti `apply_payment`, karena trigger `guard_plan_type_change` (`0016`) mengunci kolom itu.
- `admin_reactivate_org(org, plan, reason)` — jalur historis `0046`; **dihapus oleh `0049`** agar akses tidak dapat dipulihkan tanpa pembayaran terverifikasi.
- `admin_apply_promo(org, promo, days, reason)` — menambah masa aktif **tanpa uang**. Menolak org yang sedang `suspended` (menambah hari ke akses yang mati itu menyesatkan) dan durasi di luar 1–365.
- `admin_set_client_note(org, note)` — upsert. **Sengaja tidak menulis `operator_actions`**: `client_notes` sudah punya `updated_by`/`updated_at`, jadi ia jejaknya sendiri; mencatat tiap penyuntingan hanya menenggelamkan aksi yang benar-benar mengubah akses/masa aktif.
- `admin_list_operator_actions(limit)` — baca jejak, dibatasi 200.

**`admin_list_orgs` diperluas** dengan `activation_hours`, `weeks_active` (0–3), `modules_used` (0–4), dan `note`. Tiga yang pertama memetakan Scorecard Pilot di `docs/roadmap-penjualan.md` — dihitung dari data yang sudah ada, tanpa mengekspos isi bisnis klien baru.

**`apply_payment` mencatat bila pemanggilnya admin platform.** Webhook (service_role) tidak dicatat di sini karena sudah punya log Edge Function; owner mock-confirm bukan aksi lintas-tenant. Yang dicatat khusus jalur operator — rekonsiliasi manual, yang dari luar tampak sama dengan promo: "masa aktif bertambah tanpa webhook".

### Konsol organisasi & penghapusan permanen (migration `0048`)

`0048` menyederhanakan scorecard menjadi data yang benar-benar dipakai operator. `admin_list_orgs()` dibuat ulang tanpa `weeks_active` dan `modules_used`; `registered_at`, `activation_hours`, jumlah agregat, status paket, expiry, aktivitas, dan catatan tetap tersedia. Nomor tampilan `ORG-XXXXXXXX` **bukan kolom baru** dan bukan nomor urut yang mudah ditebak: klien menurunkannya secara deterministik dari delapan karakter awal UUID organisasi melalui `organizationNumber()`. Pencarian nama/nomor/UUID dilakukan lokal terhadap hasil admin yang sudah dibatasi skemanya.

RPC baru `admin_delete_org(org, confirmation, reason)` adalah operasi vendor-only yang fail-closed: gate `is_platform_admin()`, alasan wajib, organisasi dikunci `FOR UPDATE`, dan konfirmasi harus sama dengan nomor `ORG-XXXXXXXX` yang dihitung ulang di server. Sebelum `DELETE organizations`, RPC menghitung outlet/anggota/tiket lalu memanggil `log_operator_action('delete_org')`; FK `operator_actions.org_id on delete set null` menjaga audit dan salinan `org_name`, sedangkan seluruh data tenant ber-FK cascade ikut hilang. **Baris `auth.users` sengaja dipertahankan**—pengguna masih dapat login dan membuat organisasi baru. Fungsi di-revoke dari `public, anon`, hanya di-grant ke `authenticated`, lalu tetap menolak semua akun yang bukan admin platform.

### Aktivasi berbayar fail-closed (migration `0049`)

`0049` menghapus `admin_reactivate_org` dan menjadikan pembayaran Solo/Pro sebagai satu-satunya jalur rutin untuk menghidupkan organisasi trial, kedaluwarsa, atau suspended. `admin_confirm_manual_payment` mengunci organisasi, menghitung outlet aktif, menolak Solo bila outlet >1, lalu memvalidasi nominal tepat: Solo Rp99.000/bulan; Pro Rp199.000 untuk dua outlet + Rp50.000/outlet tambahan, capped Rp349.000/bulan. Harga dikali 1–12 bulan di server. Referensi yang sama tetap idempoten agar retry jaringan tidak menggandakan masa aktif.

Payload `admin_list_orgs` dipangkas lagi: `sale_count`, `pending_invoices`, dan `activation_hours` dihapus karena tidak menentukan tindakan operator. `last_paid_reference` ditambahkan agar modal pembayaran dapat membandingkan organisasi, tanggal/ref pembayaran terakhir, biaya bulanan, total, dan expiry proyeksi sebelum operator mengonfirmasi.

### Model akses peran (migration `0016`) — TIGA lapis

Sebelum `0016`, RLS hanya kenal dua level (`is_org_member` vs `is_org_manager` = owner/admin), sehingga ada dua celah yang hanya tertutup UI (bisa di-bypass via API):

1. **Baca keuangan bocor** — `incomes_select`/`expenses_select` dulu `is_org_member`, jadi karyawan bisa menarik omzet/pengeluaran lewat API. `0016` mengubahnya ke **`is_org_manager`** → karyawan tak lagi melihat keuangan apa pun.
2. **Admin = owner** — `0016` menambah helper **`is_org_owner`** dan memisahkan kuasa: kelola peran owner & seluruh billing kini **owner-only** (lihat catatan Tim & Billing di atas), `plan_type` dikunci trigger.

Matriks final tiga lapis (diperketat lebih lanjut oleh `0017`, lihat di bawah):

| Kemampuan | karyawan | admin (manager) | owner |
|---|:-:|:-:|:-:|
| Operasional inti — servis, POS, pelanggan (tambah/edit), tugas (selesai) | ✅ | ✅ | ✅ |
| **Inventori** — tambah/edit/hapus item (harga modal/jual) | ❌¹ | ✅ | ✅ |
| **Absensi** — tulis baris **milik sendiri** | ✅ | ✅ | ✅ |
| Absensi — tulis baris karyawan lain | ❌ | ✅ | ✅ |
| **Hard-delete** — customers/services/sales/task_instances | ❌ | ✅ | ✅ |
| Baca keuangan (incomes/expenses, laporan) | ❌ | ✅ | ✅ |
| Tulis keuangan & config (wallet/outlet/supplier/PO) | ❌ | ✅ | ✅ |
| Kelola karyawan & admin | ❌ | ✅ | ✅ |
| Kelola peran **owner** (promote/demote/nonaktif) | ❌ | ❌ | ✅ |
| Billing/langganan + ubah `plan_type` | ❌ | ❌ | ✅ |

¹ Stok berubah otomatis saat **POS** (`process_sale`) & **terima barang** (`receive_goods`) — keduanya RPC `security definer` yang **bypass RLS**, jadi tetap jalan untuk karyawan. Yang dikunci hanya editor item manual.

**Cerminan UI** ada di `config/plans.ts`: `roleAllows` (kini `finance.view` untuk owner/admin saja), helper `isManager`/`isOwner`. Sidebar menyembunyikan **Keuangan** & **Laporan** dari karyawan (`navigation.managerOnly`), `ManagerRoute` mengalihkan akses-URL langsung, Dashboard menyembunyikan hero laba + metrik Pemasukan/Pengeluaran/Saldo + target pendapatan, InventoryPage menyembunyikan tombol tambah/edit/hapus item, dan tombol hapus (pelanggan, tugas-cepat) disembunyikan dari karyawan. Tab **Tim** & **Langganan** di Settings memang sudah `ownerOnly`. **Penegak sebenarnya tetap RLS server**; UI hanya mencegah kontrol yang pasti gagal. Detail: [[Decisions & Bug Fixes]] (role hardening 0016 & 0017).

### Pengetatan integritas operasional (migration `0017`, P1)

`0016` menutup celah **kerahasiaan** (baca keuangan) & **kepemilikan** (owner vs admin). `0017` menutup celah **integritas tulis operasional** yang sebelumnya masih `is_org_member`:

1. **Inventori → manager-only (semua tulis).** Policy `inventory_write` (`for all`) kini `is_org_manager`. Karyawan tak bisa lagi mengubah harga modal/jual atau menambah/menghapus item lewat API. Penjualan & penerimaan barang tetap jalan karena memakai RPC `security definer` (`process_sale`/`receive_goods`) yang bypass RLS.
2. **Absensi → self-only untuk member.** Helper baru `is_self_membership(member_id, org)`; policy insert/update mengizinkan manager **atau** pemilik baris (`employee_id` = membership aktif pemanggil). DELETE manager-only. Geofence `clock_in` (RPC) tak terpengaruh.
3. **Hard-delete → manager-only.** Policy `*_write` gabungan pada `customers`, `services`, `sales`, `task_instances` dipecah jadi insert/update (tetap `is_org_member`) + **delete (`is_org_manager`)**. App memang pakai soft-delete/void; penghapusan permanen jadi aksi manager.

Semua policy tulis tetap mempertahankan gerbang langganan `is_org_active()` dari `0010`. Expand-only & idempotent.

### Koreksi transaksi (migration `0018`)

Melengkapi alur "perbaiki kalau salah input" untuk transaksi finansial:
- **`incomes.sale_id`** (kolom baru, FK → `sales`, `on delete set null`) — menautkan pemasukan POS ke penjualannya agar pembalikan saat void bersifat deterministik (bukan cocok-teks). Checkout POS kini menstempel `saleId`.
- **RPC `void_sale(sale_id, reason)`** — MANAGER-only, `security definer`, ATOMIK: (1) kembalikan stok tiap baris, (2) kurangi saldo wallet sebesar income terkait, (3) hapus income terkait (cocok via `sale_id`, fallback deskripsi `Penjualan <no>` untuk sale lama), (4) tandai `sales.voided = true` + alasan. Baris sale **ditahan** untuk audit; laporan & dashboard sudah memfilter `voided`. Idempoten (sale yang sudah void = no-op).
- **Koreksi absensi** TIDAK butuh policy baru — sejak `0017` manager sudah boleh `update`/`delete` attendance. Murni UI: manager bisa edit jam/status/catatan (hitung ulang total jam) & hapus baris.

Cermin UI: POS menampilkan panel **Transaksi Terakhir** dengan tombol batalkan (manager) + modal beralasan; halaman Absensi punya kolom aksi edit/hapus (manager). Dual-path seperti `clockIn` — cloud lewat RPC, lokal membalik via repository.

### Log Aktivitas (migration `0019`) — jejak audit owner-only

Menjawab kebutuhan owner: melihat aktivitas tiap peran (owner/admin/karyawan).
- **Tabel `activity_logs`** (append-only): `actor_id/actor_name/actor_role`, `action` (verb kanonik), `entity_type/entity_id/entity_label`, `meta jsonb`, plus field BaseEntity. Index `(org_id, created_at desc)`.
- **RLS unik dibanding tabel lain**: INSERT diizinkan untuk **semua member** (`is_org_member`, tidak digerbang `is_org_active` agar audit tetap jalan setelah masa tenggang), tetapi SELECT **owner-only** (`is_org_owner`). **Tanpa policy UPDATE/DELETE** → log immutable (klien tak bisa mengubah/menghapus).
- **Koleksi baru `activity`** di EntityMap → tabel `activity_logs` (cloud) / object store IndexedDB (local, **DB_VERSION dinaikkan 1→2**).
- **Helper `logActivity()`** (`src/lib/activity.ts`): ambil aktor dari `session` store, tulis fire-and-forget (`void repository.put('activity', …).catch()`) — **tak pernah** memblokir/menggagalkan aksi pengguna. Logika presentasi murni di `src/lib/business/activity.ts` (label/ikon/tone/filter, teruji).
- **Aksi yang dicatat**: login; POS jual & void; pemasukan/pengeluaran create & delete; inventori create/update/delete; pelanggan create/update/delete; absensi update/delete; servis create & ubah status.

> [!NOTE]
> `activity_logs` adalah satu-satunya tabel dengan **SELECT owner-only** + **append-only** (tanpa update/delete). Ini sengaja: jejak audit harus kebal manipulasi dan hanya untuk pemilik.

### Restore data org (migration `0020`) — RPC transaksional, semua owner

Membuka kembali fitur **Restore di mode cloud** untuk **setiap owner** memulihkan data org-nya sendiri (pelanggan: pemulihan saat ada kendala; akun demo: refresh isi). Sebelumnya restore cloud dimatikan karena `clearAll + putMany` dari browser tidak aman di DB multi-tenant.

- **Kolom `organizations.is_demo`** (default `false`) — hanya **penanda informatif** akun demo (mis. banner), TIDAK menggerbang restore.
- **RPC `restore_org_data(p_org_id, p_payload jsonb)`** — `security definer`, satu transaksi atomik (gagal di tengah = rollback penuh). Pengaman berlapis yang membuatnya aman untuk SEMUA org:
  1. `is_org_owner(p_org_id)` → hanya owner org itu.
  2. **`org_id` tiap baris DIPAKSA = `p_org_id`** (abaikan `org_id` dalam file) → owner hanya bisa menimpa **org-nya sendiri**; file termanipulasi tak bisa menyentuh tenant lain.
  3. Hapus data org urutan **anak→induk** (FK-safe), lalu insert urutan **induk→anak** via `jsonb_populate_record`.
  4. **FK ke memberships di-NULL** saat insert (`technician_id`, `cashier_id`, `employee_id`, `actor_id`, `assignee_employee_id`, `completed_by_id`) — nama tetap tampil lewat kolom `*_name` denormalized.
- **Yang DITIMPA**: seluruh data domain (outlets, customers, suppliers, wallets, inventory, fixed_costs, services, purchase_orders, sales, incomes, expenses, activity_logs, task_templates/instances).
- **Yang TIDAK disentuh** (sengaja): `memberships` (akun login aman), `organizations` (profil + **billing/plan** → langganan tak pernah ter-reset), `invoices`.
- **Klien**: `Repository.restoreOrgData?()` opsional; `SupabaseAdapter` memanggil RPC + notify semua koleksi. `buildRestorePayload()` (`lib/business/backup.ts`, teruji) memetakan koleksi→tabel snake_case & **mengecualikan `employees`/organization**. `restoreBackup()` (`features/settings/backupRestore.ts`) bercabang: cloud→RPC, lokal→`clearAll+putMany` (tak berubah).
- **UI**: tombol "Pulihkan dari File" tampil untuk owner di kedua mode (halaman Pengaturan sudah owner-only). Catatan menjelaskan apa yang diganti & yang aman.
- **Tooling demo**: `scripts/make-demo-backup.mjs` — generator data demo **kumulatif** (data hari-1→hari ini, bertumbuh tiap hari, deterministik per-hari). Dijalankan tiap hari lalu di-restore agar akun demo selalu segar & berkembang.

> [!NOTE]
> **Menu Pengaturan kini owner-only** (`navigation.ts` `ownerOnly: true` + `<OwnerRoute>` di `router.tsx`) — admin & karyawan tak lagi melihat/membuka `/settings`, mirror dengan kebijakan RLS. Berlaku global (semua tenant), bukan hanya demo. Catatan: tombol **"Hapus Akun Permanen"** disembunyikan saat `org.isDemo` (lindungi akun demo publik dari penghapusan oleh pengunjung); tetap tersedia untuk pelanggan asli demi kepatuhan UU PDP. **"Reset Seluruh Data"** di cloud kini memakai RPC `restore_org_data(orgId, {})` (mengosongkan data operasional, mempertahankan tim/langganan).

### Realtime sinkronisasi data domain (migration `0021`) — multi-device live

Memperluas `0012` (yang hanya realtime untuk billing). Tujuan: aksi satu kasir langsung tampil di device lain pada org yang sama, tanpa refresh manual.

- **Publication**: `0021_realtime_domain.sql` menambahkan **15 tabel domain** (`outlets, customers, suppliers, inventory_items, wallets, fixed_costs, services, purchase_orders, sales, incomes, expenses, attendance, task_templates, task_instances, activity_logs`) ke `supabase_realtime` (idempotent, loop). `memberships` sengaja tak disertakan.
- **Klien `subscribeOrgTables(orgId, tables, onChange, onStatus?)`** (`supabase-client.ts`): satu channel `org-domain:<orgId>`, satu listener `postgres_changes` per-tabel. Filter **per-tabel**: `organizations` pakai `id=eq.<orgId>` (singleton, keyed by id), sisanya `org_id=eq.<orgId>`. RLS tetap berlaku di stream → device hanya menerima baris org-nya.
- **Event DELETE butuh `REPLICA IDENTITY FULL` (0090, 27 Sep 2026).** Langganan disaring `org_id=eq.<org>`, dan Supabase hanya bisa menyaring DELETE bila baris lama di WAL memuat `org_id` — dengan identitas bawaan (hanya PK) event DELETE dibuang diam-diam. Gejalanya: transaksi yang dihapus tetap tampil sampai refresh, perangkat lain tak pernah melihat hapusan. Tabel publikasi yang barisnya bisa dihapus kini FULL; `services` & `activity_logs` sengaja tidak (lihat [[Decisions & Bug Fixes]]). Payload DELETE tabel ber-RLS tetap hanya `{id}`. **Tabel baru yang bisa dihapus & masuk publikasi: set FULL juga.**
- **Tanggal transaksi keuangan dijaga server (0091, 27 Sep 2026).** `record_finance_entry` & `update_finance_entry` memanggil `assert_entry_date`: bulan berjalan s/d hari ini (Asia/Jakarta). Pemasukan manual `Servis`/`Penjualan` ditolak (sudah tercatat otomatis dari tiket & Kasir). Cermin UI: `entryDateError` di `lib/business/finance.ts`. Lihat [[Decisions & Bug Fixes]].
- **`SupabaseAdapter`**: `setScope()` membuka channel (menutup yang lama saat ganti org), subscribe **`[...REALTIME_TABLES, 'organizations']`**. Event koleksi domain → `TABLE_TO_COLLECTION[table]` → `notifyDebounced(collection)` (**debounce 250ms** untuk meredam ledakan event saat bulk-write seperti restore `0020`). Event **`organizations`** → `refreshOrganization()` me-refetch **singleton** org ke session store (`setState({ org })`) — karena org bukan koleksi TanStack, ia dimuat sekali saat boot & butuh refresh eksplisit agar config org-level (mis. kategori perangkat) sinkron lintas-device tanpa reload. Strategi **re-fetch**, bukan patch store → sederhana & anti-drift. `dispose()` melepas channel + timer, dipanggil dari `session.reset()` (sign-out/ganti akun).
- **Kontrak**: `Repository.dispose?()` opsional (local adapter no-op).

#### Ketahanan realtime (auto-reconnect + resync + status) — adopsi selektif dari FixNova

Masalah nyata: channel Supabase bisa **mati senyap** setelah laptop sleep / wifi putus dan tak pulih sendiri — device jadi basi **tanpa indikasi**. Yang **diadopsi** dari FixNova hanya celah ini (bukan mesin merge klien: FixMaster pakai RPC+RLS sebagai sumber kebenaran, jadi smart-merge/tombstone/echo-suppression/retry-queue **tidak relevan**).

- **`subscribeOrgTables` kini resilient** (`supabase-client.ts`):
  - Param baru opsional **`onStatus(status)`** → `'connecting' | 'live' | 'offline'` (`RealtimeStatus`). Backward-compatible (pemanggil 3-arg lama tetap jalan).
  - **Auto-reconnect**: pada `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` → status `offline` + jadwal reconnect **exponential backoff + jitter** (`computeBackoff`/`withJitter`); `SUBSCRIBED` → reset attempt + status `live`.
  - **Health-check** tiap `HEALTH_IDLE_MS` (60s): channel tak `joined` & idle > ambang → dianggap *zombie* → teardown + reconnect. Channel `joined`-tapi-sepi (tak ada tulis) dibiarkan.
  - Cleanup melepas channel + clear timer reconnect/health.
- **Timing murni & teruji**: `src/lib/business/realtime-timing.ts` (`computeBackoff`, `withJitter`, `isHealthDue`) — pola "logika murni di `lib/business`", 15 unit test (tanpa DOM/Supabase).
- **Full resync saat reconnect**: di `SupabaseAdapter`, transisi **`offline → live`** memanggil `notifyAll()` (refetch SEMUA koleksi) **+ `refreshOrganization()`** (refetch singleton org) karena event mungkin terlewat saat down. Server tetap sumber kebenaran — tak ada merge klien.
- **Safety net TanStack Query**: `refetchOnReconnect: 'always'` di `App.tsx` QueryClient (event `online` browser) menutup skenario "data basi setelah bangun tidur" bahkan bila channel belum pulih.
- **Status store + badge**: `src/stores/realtime.ts` (`useRealtimeStore`: `status`, `active`, `setStatus`, `reset`) diisi adapter. **Topbar** menampilkan badge LED + readout mono (motif bench): hijau `LIVE`, kuning pulse `SYNC…`, merah `OFFLINE`. Cloud-only (`active` baru true setelah channel lapor) → lokal/demo bersih. `dispose()` mereset store. Hook DEV `window.__realtime` untuk screenshot.

> [!NOTE]
> Realtime di FixMaster kini dua lapis: **billing** (`0012`, `subscribeOrgBilling`) + **data domain** (`0021`, `subscribeOrgTables`, kini **dengan ketahanan reconnect/resync/status**). Keduanya per-org & terkurung RLS.

### Tim per-outlet, wallet Hybrid, laporan per-cabang (migrasi `0023`–`0036`)

Rilis bertahap **Expand → Contract** agar aman di produksi (tak ada *lockout* data). `0023`–`0026` = Rilis 1 (Expand); `0027` = jaring pengaman anti-lockout; `0028` = Rilis 2 (Contract / RLS lock, **applied di staging + PRODUKSI** 12 Jun 2026). **Nomor file = urutan eksekusi.**

- **`0023_backfill_outlet_id.sql`** — menstempel record transaksi lama (`outlet_id null`) ke **outlet utama** org (is_primary → terlama). Hanya tabel transaksi (`services, sales, incomes, expenses, attendance, purchase_orders, task_instances`); data bersama (wallet/pelanggan/inventori) dibiarkan `null`. Idempotent, forward-only. **Kenapa**: tanpa ini, record null muncul di SETIAP cabang dan menggelembungkan total per-cabang.
- **`0024_membership_outlets.sql`** — junction **`membership_outlets`** (karyawan↔outlet, RLS: member baca, manager kelola) + helper **`auth_outlet_ids()`** (security definer stable, pola `auth_org_ids`) + RPC **`set_member_outlets(member, outlet[])`** (replace, manager-only) + **backfill semua anggota→semua outlet** (cegah lockout saat `0028`) + **`pending_invites.outlet_ids`** dengan `claim_invite()` mengisi junction (fallback: semua outlet bila invite tak menyebut).
- **`0025_outlet_aware_rpc.sql`** — `process_sale` & `settle_service` di-recreate: tambah `p_outlet_id` (default null → tanda tangan lama tetap jalan), validasi **`can_use_outlet(org, outlet)`** (null/manager/∈ auth_outlet_ids), dan `incomes.sale_id` diisi (void deterministik). Deskripsi income tetap `'Penjualan <no>'` agar fallback `void_sale` (`0018`) tetap cocok. _(Catatan: `settle_service` di sini single-wallet; kemudian **digantikan** oleh versi split-payment di `0029`.)_
- **`0026_ensure_primary_outlet.sql`** (Rilis 1, siap apply) — **menjamin invarian "tiap org punya 1 outlet utama"**: (A) org lama tanpa outlet → buat 1 outlet utama (nama = nama org); (B) org punya outlet tapi tak ada `is_primary` → tandai yang terlama; (C) **re-jalankan backfill** transaksi (identik `0023`) agar baris `null` kini menempel ke outlet utama. **Kenapa perlu**: org dibuat sebelum wizard punya langkah Outlet bisa nol outlet, membuat `0023` jadi no-op (transaksi lama tak masuk cabang manapun). Org baru via wizard sudah otomatis primary (`buildOutlets: isPrimary = i===0`), jadi A/B hanya menyentuh org lama. Menggantikan kebutuhan re-run `0023` manual.
- **`0027_heal_unassigned_outlets.sql`** (jaring pengaman, siap apply) — untuk tiap **karyawan aktif dengan NOL penugasan**, tugaskan ke SEMUA outlet org-nya (filosofi sama backfill `0024`). **Kenapa perlu**: org nol-outlet membuat backfill `0024` jadi no-op → karyawannya 0 penugasan → terkunci dari transaksi lama (yang sudah di-stempel outlet utama oleh `0026`) setelah `0028`. **Presisi**: HANYA menyentuh yang 0 penugasan (pembatasan owner yang sudah ada dihormati), hanya peran `karyawan`. Idempotent, hanya MEMBERI akses (tak pernah mencabut) → aman sebelum/sesudah `0028`.
- **`0028_rls_outlet_scope.sql`** (Rilis 2, **applied di staging + PRODUKSI** 12 Jun 2026) — mengetatkan RLS select/insert/update transaksi + select wallet ke `is_org_manager OR outlet_id IS NULL OR outlet_id IN (auth_outlet_ids)`. Tetap pertahankan gerbang `is_org_active` (`0010`), delete manager-only (`0017`), keuangan baca manager-only (`0016`, sengaja tak dilonggarkan). Header memuat prasyarat apply. Diverifikasi [[Testing & Security]] (Tier 3, 6 test).
- **`0029_split_settle_and_cancel.sql`** (**applied di staging + PRODUKSI** 12 Jun 2026) — memindahkan dua alur billing yang tersisa ke RPC agar kasir tetap bisa di bawah `0028`: (A) **`settle_service` di-recreate** dari single-wallet (`p_wallet_id`/`p_amount`) → **`p_payments jsonb`** (array leg, mirror `process_sale`); 1 income per leg, deskripsi kini **`'Pelunasan servis <no>'`** (sebelumnya tanpa nomor di `0025`) agar koreksi final-cost tetap cocok. (B) **RPC baru `cancel_service`** — atomik: restore stok ter-`deducted`, refund DP (hapus income `'DP servis <no>'` + balik saldo wallet), set `batal`, nolkan DP, flip `deducted=false`. **Kenapa perlu**: batch split-payment (live di produksi) menulis langsung ke wallets/incomes/inventory → manager-only setelah `0028` → kasir karyawan terblokir lunas/batal. Additif & idempotent (drop+create fungsi). Diverifikasi [[Testing & Security]] (Tier 3B, 3 test). _(Model refund DP di sini **digantikan** oleh `0031`: refund parsial-by-choice, income DP dipertahankan.)_
- **`0030_record_down_payment.sql`** (**applied di staging + PRODUKSI** 12 Jun 2026) — **RPC baru `record_down_payment`** untuk jalur billing TERAKHIR yang masih tulis langsung: penerimaan DP. Atomik & security-definer: insert income **`'DP servis <no>'`** (cocok dengan refund `cancel_service` 0029), kredit wallet, akumulasi `down_payment` (mendukung cicilan). Validasi `is_org_member` + `can_use_outlet`. **Kenapa perlu**: `applyDp` di StatusModal masih `repository.put` ke incomes/wallets → manager-only setelah `0028` → kasir gagal "menyimpan DP"; selain itu insert klien membawa kolom `deletedAt` yang tak ada di skema. Additif & idempotent. Diverifikasi [[Testing & Security]] (Tier 3B, +2 test).
- **`0031_wallet_transfer_and_cancel_refund.sql`** (**applied di staging + PRODUKSI** 13 Jun 2026) — dua perubahan: (A) **RPC baru `transfer_wallet(org, from, to, amount)`** — pindah saldo antar wallet, atomik & **manager-only** (`is_org_manager`); validasi from≠to, amount>0, saldo cukup (`for update`). **TIDAK** membuat income/expense (transfer bukan untung/rugi → tak mendistorsi laporan); dicatat via Activity Log (`wallet.transfer`). (B) **`cancel_service` di-recreate** dengan param `p_refund_amount` + `p_refund_wallet_id` → **refund DP PARSIAL by-choice**: income `'DP servis <no>'` kini **DIPERTAHANKAN** (audit utuh), bagian refund dicatat sebagai **expense `'Refund DP servis <no>'`** (kategori `'Lainnya'`) + kurangi wallet refund; sisa yang ditahan toko otomatis jadi pendapatan bersih. `down_payment` dibiarkan apa adanya. **Kenapa perlu**: (A) owner butuh pindah kas antar wallet tanpa mendistorsi laba; (B) pembatalan butuh refund sebagian (mis. potong biaya diagnosa), model lama (`0029`) selalu refund penuh + hapus income. Additif & idempotent. Diverifikasi [[Testing & Security]] (Tier 3B: cancel refund parsial + refund 0 + 4 test `transfer_wallet`).
- **`0032_org_settings.sql`** (**applied di staging + PRODUKSI** 14 Jun 2026) — kolom **`organizations.settings jsonb not null default '{}'`**. Memindahkan **kategori perangkat** dari localStorage per-device ke baris org (`settings.deviceCategories`) agar **tersinkron lintas device** — bug smoke test: kategori dibuat di desktop tak muncul di HP. Sejak 11 Agu 2026 JSON yang sama juga menyimpan empat route pilihan owner pada **`settings.mobileNavigation`**; tidak perlu migrasi baru. Klien: `getCategories` baca `org.settings` (fallback localStorage lama), `setCategories`/`setMobileNavigation` via `setSingleton('organization')` → `setState({ org })`, `seedCategoriesFromLocal()` angkat data lokal lama sekali. **TANPA** perubahan RLS (UPDATE organizations sudah manager-only → edit config manager-only; semua member tetap MEMBACA). Kolom extensible: config org lain (template, garansi) bisa menyusul **tanpa migrasi baru**. Additif & idempotent. Diverifikasi unit `orgConfig` (11 test). Lihat [[Decisions & Bug Fixes]] §Perbaikan 2 bug smoke test.
  - > [!CAUTION]
  > **Follow-up 16 Jun 2026 (commit `0c96e6d`).** Saat dirilis, `0032` lupa memigrasikan **penulis pertama** kategori: wizard onboarding (`commitWizardCloud`) masih tulis ke localStorage → org baru punya `settings.deviceCategories` **kosong** → dropdown kategori hilang di form servis & Pengaturan. Diperbaiki klien (tanpa migrasi): wizard kini tulis `data.categories` ke `org.settings.deviceCategories`, dan `getCategories()` fallback ke konstanta **`DEFAULT_DEVICE_CATEGORIES`** saat cloud & local kosong. Pelajaran: pindah sumber-kebenaran harus migrasi **semua penulis**, bukan cuma pembaca.
- **`0033_one_shop_per_email.sql`** (**applied di staging + PRODUKSI** 16 Jun 2026) — **RPC baru `create_invite`** (security definer) + recreate `claim_invite` dengan guard satu-toko. Menegakkan **satu email = satu toko**: `create_invite` menolak email yang sudah jadi **anggota aktif** atau punya **undangan tertunda** di org LAIN (cek lintas-org via definer — RLS menyembunyikan data toko lain dari klien); re-invite di toko sendiri tetap boleh (upsert). `claim_invite` menolak klaim bila user sudah anggota aktif di org berbeda (defense-in-depth). **Kenapa perlu**: bug smoke test — `pending_invites` unik per-`(org_id, email)` saja, jadi email bisa diundang di banyak toko tanpa peringatan; arsitektur app satu-user-satu-toko (`getMyMembership` `limit(1)`) → multi-membership = bug laten non-deterministik. Enforcement via RPC (bukan unique constraint global, karena data lama bisa punya duplikat). Klien `inviteMember` kini panggil `create_invite`. Additif & idempotent. Diverifikasi [[Testing & Security]] (Tier 3C, 4 test).
- **`0034_receive_goods_finance.sql`** (**applied di staging + PRODUKSI** 22 Jun 2026) — **sinkronisasi Terima Barang (PO) → Keuangan**. (1) Kolom **`expenses.po_id`** (nullable, `on delete set null`) → meng-link expense ke PO untuk audit + void. (2) **RPC baru `receive_goods_v2`** (security definer, **manager-only** `is_org_manager` + `can_use_outlet`): dalam satu transaksi → tambah stok per delta, update PO (lines/status/received_at), **insert Expense `'Pembelian stok PO <no>'`** kategori `'Sparepart'` senilai barang yang diterima SAAT INI (partial-aware), dan **bila wallet dipilih → potong saldo** (bayar tunai; kosong = tempo/hutang). (3) **RPC baru `void_po`** (manager-only): pembatalan **otomatis** → balikkan stok diterima, **refund saldo wallet** tiap expense ter-link lalu **hapus expense**-nya, reset `receivedQty=0`, set status `cancelled`. **Kenapa perlu**: bug smoke test — terima barang dulu hanya menambah stok + ubah status, belanja stok ke supplier tak pernah masuk Keuangan (laba bersih terlalu tinggi, saldo wallet tak akurat). Keputusan user: Q1=(c) checkbox potong-wallet (default ON + wallet utama), Q2=expense partial per event terima, Q3=void otomatis. Klien: `receiveGoodsWithFinance`/`voidPurchaseOrder` (cloud RPC) atau tulis berurutan (lokal). Additif & idempotent (`create or replace` + `if not exists`). Helper murni `receivedValue` diverifikasi unit (5 test).
- **`0035_track_service_contact.sql`** (**applied di staging + PRODUKSI** 22 Jun 2026) — **perluas RPC publik `track_service`** agar halaman lacak menampilkan **kontak toko + garansi**. Tambah kolom return: `org_phone`, `org_address`, `org_logo_url` (dari `organizations`), `warranty_service_until`, `warranty_parts_until` (tipe **`date`**, sesuai 0006), `picked_up`. **Sengaja TANPA** biaya/estimasi/DP — link publik tak boleh bocorkan harga. Mempertahankan model 0015 (security definer, grant `anon`, rate-limit 60/mnt per-org) + filter history internal. **Wajib `drop function` dulu** sebelum `create` — Postgres tolak ubah tipe return fungsi via `create or replace` (SQLSTATE 42P13); grant `anon`/`authenticated` di-restore di akhir migrasi. Klien `trackService` + tipe `TrackServiceResult` di [[supabase-client]] diperluas; `TrackingPage` menampilkan blok Garansi (mono) + Kontak (tombol WhatsApp `wa.me` + alamat). Jalur lokal baca `organizations` langsung.
- **`0042_membership_deleted_at_guard.sql`** (**applied di staging + PRODUKSI** 31 Jul 2026, gate integration test 59/59 hijau) — **anggota ter-soft-delete tak boleh punya akses**. Semua helper RLS (`auth_org_ids`, `auth_role_in`, `is_org_member`, `is_org_manager`, `is_org_owner`, `auth_outlet_ids`) dulu hanya cek `active = true` dan **mengabaikan `deleted_at`**, sementara `list()` menyaring sebaliknya → baris `active=true` + `deleted_at` terisi jadi **kasat mata di DB tapi hilang dari UI, dengan akses penuh**. Ditemukan di produksi: satu akun berperan `owner` tak terlihat di daftar tim pemilik. Pemicunya `claim_invite` yang menghidupkan ulang baris terhapus tanpa membersihkan `deleted_at`; migrasi ini memperbaiki keduanya + membuat rejoin mengadopsi peran undangan (anggota yang masih aktif tak diubah, mencegah lockout owner). Menyembuhkan diri: akun hantu cukup login ulang. Detail di [[Decisions & Bug Fixes]].
- **`0036_admin_outlet_scope.sql`** (**applied di staging + PRODUKSI** 22 Jun 2026, **56/56 integration hijau**; gerbang keamanan terpenuhi sebelum apply prod: admin toko testing sudah di-set outlet, toko pilot owner-only/tanpa admin-karyawan → nol risiko lockout. Apply via `supabase link` ke prod → `db push` (dry-run konfirmasi hanya 0036 pending) → relink balik staging) — **scope admin per-cabang**. Sebelumnya owner **dan** admin = `is_org_manager` → menembus semua outlet (0028). Kini predikat outlet di `services`/`sales`/`attendance`/`purchase_orders`/`task_instances`/`wallets` jadi **`is_org_owner(org_id) OR outlet_id IS NULL OR outlet_id IN (auth_outlet_ids())`** — owner tembus semua, admin di-scope ke outlet tugasannya (seperti karyawan untuk **cakupan data**). Keuangan (`incomes`/`expenses`) baca: **`is_org_owner OR (is_org_manager AND outlet match)`** → owner semua, admin per-cabang, karyawan nol. **Kewenangan** manager-level (delete 0017, settle/refund 0029/0031, kelola tim 0016, tulis keuangan 0010) **tetap** `is_org_manager` — admin tetap "manager", hanya cakupan datanya dibatasi. Helper `is_org_owner` (0016) & `auth_outlet_ids` (0024) dipakai ulang. `SettingsPage`: pemilih outlet kini untuk semua role non-owner. Idempotent (drop+create policy).

> [!WARNING]
> `0028` mengubah batas keamanan. Urutan aman ke produksi: apply `0023`–`0026` → cek karyawan tanpa penugasan (query di bawah) → owner assign outlet di **Pengaturan → Tim** dan/atau jalankan jaring pengaman `0027` → uji staging (`npm run test:integration`) → baru apply `0028`. Karyawan tanpa penugasan akan kehilangan akses data transaksi setelah `0028`.
>
> Migrasi global (sekali jalan, semua tenant); penugasan outlet **per-org** & opt-in (toko 1-outlet tak perlu apa-apa). Cek karyawan berisiko:
> ```sql
> select m.org_id, m.name from memberships m
> where m.active = true and m.role = 'karyawan'
>   and not exists (select 1 from membership_outlets mo where mo.membership_id = m.id);
> ```

### Klien sadar-outlet (data layer + UI)

- **`supabase-adapter.ts`**: set `OUTLET_SCOPED` (services, sales, incomes, expenses, attendance, purchaseOrders, taskInstances, wallets) — hanya tabel ini difilter di `list()` (tabel tanpa kolom outlet_id akan error bila difilter). `setScope` menyimpan `outletId` **sebelum** early-return realtime.
- **`supabase-client.ts`**: `getMyMembership()` kini mengembalikan `outletIds`; `inviteMember({outletIds})`; baru: `setMemberOutlets`, `getMemberOutlets`, `processSale`, `settleService`.
- **UI**: Sidebar BranchSelector difilter ke `allowedOutletIds`; SettingsPage **TeamTab** (chip multi-select cabang saat undang + editor per-anggota `MemberOutletsEditor`, **hanya peran `karyawan`**; owner/admin diberi badge **"Semua cabang"** karena Model A = manager menembus semua scope; tiap baris karyawan menampilkan **ringkasan cabang** via `getOrgMemberOutlets` (1 query/org, di-refresh setelah simpan) agar penugasan terlihat sekilas) & **WalletTab** (pilih Bersama/cabang); PosPage (RPC `process_sale` + guard `mustPickOutlet` + stempel outlet); StatusModal (RPC `settle_service`); ServiceModal/EntryModal (stempel `resolveCreateOutlet`); ReportsPage (badge scope cabang).

## Servis: pengambilan barang & garansi

Entity `Service` (di `data/types.ts`) punya field penting yang **terpisah** satu sama lain:

- **`pickedUp` + `pickedUpAt`** — status fisik "barang sudah diambil pelanggan", **independen** dari status pembayaran. Jadi tiket bisa `lunas` tapi belum diambil, atau sebaliknya. Toggle ada di halaman detail.
- **`warrantyServiceUntil` + `warrantyPartsUntil`** — dua tanggal garansi **terpisah**: garansi **jasa** dan garansi **sparepart**. Keduanya diisi saat status → **`selesai`** (bukan lagi otomatis saat `lunas`): teknisi mengisi lama hari masing-masing di StatusModal, **wajib minimal salah satu**, prefill dari default `orgConfig.getWarrantyServiceDays()` (30h) & `getWarrantyPartsDays()` (7h). Expiry = tanggal selesai + lama hari. Chip preset durasi dari `getWarrantyPresets()` ([3,7,14,30,90] default).
- **`warrantyClaimOf`** — bila tiket ini adalah **klaim garansi**, menyimpan ID tiket asli. Tiket klaim dibuat gratis (`finalCost` 0); tiket asli tetap `lunas` & keuangannya utuh.

Helper murni di `lib/business/services.ts`: `warrantyEndDate(service)` (tanggal garansi terjauh antara jasa & sparepart), `isUnderWarranty(service, today)` (true bila **salah satu** garansi masih berlaku, inklusif), dan `canClaimWarranty(service, today)` (syarat: `lunas`, masih dalam garansi, dan bukan tiket klaim). Kerugian garansi dicatat **manual** sebagai expense kategori `'Garansi'` — sengaja tidak ditarik dari inventory/POS. Lihat [[Signature Pages]] & [[Decisions & Bug Fixes]].

### Sparepart BOM & modal dadakan (profit per unit)

`Service.spareparts` (array JSONB, tipe `ServiceSparepart`) kini menampung **dua jenis baris cost** dalam satu array — **tanpa migrasi DB** (field JSONB sudah ada):

- **`kind: 'inventory'`** (default; baris lama tanpa `kind` terbaca sebagai ini) — sparepart dari stok. Punya `itemId` valid. **Stok dipotong SEKETIKA saat baris ditambahkan** (`addSparepartLine`), bukan ditunda ke Pengerjaan. Pengaman: pemanggil **re-read item** sebagai guard otoritatif & **menolak** bila `stock < qty` (toast), lalu menyimpan baris `deducted:true`. **TIDAK** membuat Expense — modalnya sudah keluar saat beli stok (anti dobel-hitung kas). Saat tiket **batal**, `computeStockRestore()` mengembalikan stok semua baris inventory ber-`deducted` & membalik flag-nya (anti dobel-restore). `computeStockDeduction()` (pemicu `pengerjaan`) kini jadi **fallback legacy** — hanya menyentuh baris `deducted:false` lama; baris baru sudah `deducted:true` sehingga tak ada dobel-potong. Lihat [[Decisions & Bug Fixes]].
- **`kind: 'manual'`** (modal dadakan: part beli di luar / jasa outsource) — `itemId: null`. **Membuat Expense** kategori `Sparepart` (kas benar-benar keluar) + memotong saldo wallet terpilih. `expenseId` & `walletId` disimpan di baris agar bisa **dibalik** saat baris dihapus (hapus Expense + refund wallet, atomik). Di-skip oleh `computeStockDeduction` (tak punya stok). Baris manual juga bisa **diedit** (tombol pensil): menyinkronkan Expense terkait (nominal/wallet/keterangan, `expenseId` dipertahankan agar jejak audit kontinu) lalu **men-net saldo wallet** via `walletDeltasForModalEdit` (refund debit lama, terapkan debit baru). Dicatat di Activity Log sebagai verb baru **`expense.update`**.

Wallet sumber memakai pola **A1 + ingat terakhir**: dropdown di form modal dadakan default ke `getLastExpenseWallet()` (localStorage per-org), fallback wallet pertama; pilihan disimpan via `setLastExpenseWallet()` setiap simpan. Tidak ada setting global (hindari caveat per-perangkat).

Helper murni: `sparepartCost(parts)` = Σ `costPrice×qty` (semua baris), `serviceModalTotal(parts)` = alias eksplisit untuk kolom "Modal", `serviceProfit({finalCost, spareparts})` = `finalCost − sparepartCost`. Karena `sparepartCost` menjumlah **semua** baris, profit otomatis sudah memotong inventory + modal dadakan. Untuk edit baris manual, `walletDeltasForModalEdit(...)` menghitung delta saldo per wallet (di-net per wallet; edit di wallet sama → satu delta; no-op → kosong). Stok: `computeStockDeduction` (fallback legacy, pemicu `pengerjaan`) & `computeStockRestore` (kembalikan stok saat batal). Teruji di `services.test.ts` (**309 tes total**; mencakup profit baris manual, deduct skip manual, modalTotal, finalCost=0, netting edit, DP/koreksi, split payment, + 3 tes stock restore).

UI: tambah/hapus baris di **halaman detail servis** ([[Signature Pages]]); kolom **Modal** & **Profit** di tabel servis + panel BIAYA detail **owner-only** (`role === 'owner'`). Profit di tabel hanya tampil saat `finalCost > 0` agar tak menyesatkan sebelum biaya final pasti.

### DP, pelunasan & koreksi biaya — terpusat di StatusModal (hub input)

> **Sentralisasi (11 Jun 2026).** Semua **input finansial terikat-transisi** kini tinggal di `StatusModal` (dibuka via tombol **Update Status**), bukan tersebar di panel BIAYA halaman detail. `StatusModal` punya **tab sub-aksi** (`Ubah Status` / `Terima DP` / `Koreksi Biaya`) yang muncul sesuai status + peran. Halaman detail jadi **read-only** untuk angka finansial; satu-satunya input yang tersisa di detail adalah **BOM/sparepart** (lihat di atas) karena sifatnya iteratif. Lihat [[Decisions & Bug Fixes]] & [[Signature Pages]].

**DP sebagai kas nyata.** Field `Service.downPayment` (sudah ada, tanpa migrasi) diisi lewat **tab Terima DP** di StatusModal (tersedia selama `!isTerminal(status)`). Membuat **Income** kategori `Servis` (deskripsi kanonik `dpIncomeDescription` = `"DP servis <no>"`) + kredit wallet terpilih (`applyBalance`), lalu **mengakumulasi** `downPayment` (mendukung beberapa kali DP / cicilan). Dicatat Activity Log `income.create`. Wallet default ikut pola A1 (`getLastExpenseWallet`).

**Pelunasan = split payment (pilih satu / beberapa wallet).** Saat target `lunas`, StatusModal menampilkan **editor pembayaran**: daftar leg `{wallet, nominal}` dengan tombol **+ Tambah wallet** dan ringkasan **terbayar / sisa** (readout mono, hijau saat balance). Default = satu leg menutup penuh sisa tagihan (kasus umum = bayar satu wallet). Booking: **satu Income kategori `Servis` per leg** (deskripsi kanonik `settlementIncomeDescription`) + kredit wallet masing-masing (`applyBalance`); wallet leg pertama disimpan via `setLastExpenseWallet`. Validasi memakai helper murni `validateSplit(splits, sisa)` — total leg **wajib sama persis** dengan sisa tagihan (`empty`/`mismatch` → toast). Ini juga memperbaiki kerancuan lama "pelunasan lewat wallet apa" (dulu hard-coded `wallets[0]`).

**Anti dobel-hitung di pelunasan.** Sisa = `settlementAmount(finalCost, downPayment)` = `max(0, final − DP)`. Bila DP sudah menutup tagihan (sisa 0) → editor pembayaran tak muncul & **tidak** ada income pelunasan. Ini memperbaiki bug laten lama `outstandingBalance(...) || cost` yang akan mencatat seluruh biaya lagi ketika sisa 0.

**Refund DP saat batal.** Bila tiket → `batal` dan `downPayment > 0`, semua Income DP tertaut (match `serviceId` + deskripsi kanonik) di-reverse: debit wallet asalnya, hapus income, dan `downPayment` di-nol-kan agar tak dobel-refund.

**Koreksi biaya final pasca-lunas (owner/admin).** **Tab Koreksi Biaya** (atau tombol **Koreksi Biaya** di detail yang membuka StatusModal langsung di mode ini) muncul hanya saat `status === 'lunas'` dan `isManager` (owner+admin). Menyetel `finalCost` baru tanpa membatalkan tiket dengan pola **reverse-all + rebook** (tahan terhadap split): semua Income pelunasan tertaut di-reverse (refund wallet masing-masing + hapus), lalu sisa baru = `settlementAmount(newFinal, DP)` di-booking ulang sebagai **satu** baris ke wallet leg pertama sebelumnya (atau last-used). Bila sisa baru 0 → tak ada booking. Guard: `newFinal >= downPayment`. Dicatat di history internal (`status:'edit'`) + Activity Log `service.status` (`meta.correctFinalCost`). Catatan: koreksi tidak meminta ulang split — owner cukup mengubah angka, kas tetap konsisten.

Helper murni di `services.ts`: `settlementAmount`, `settlementCorrectionDelta` (dipakai test/util), `splitTotal`, `normalizeSplits`, `validateSplit` (split payment), `dpIncomeDescription`, `settlementIncomeDescription`. Income DP & pelunasan **wajib** dibuat lewat builder deskripsi kanonik ini agar bisa dicocokkan andal saat koreksi/refund (string literal ad-hoc akan memutus pencocokan secara diam-diam).


## Export data, hapus/erasure, & pelaporan error (P1)

**Export CSV.** `lib/business/export.ts` murni & teruji: `escapeCsvField` (RFC 4180 — quote bila ada koma/kutip/baris-baru, gandakan kutip) **plus guard formula-injection** (sel berawalan `= + - @` diberi prefiks apostrof agar tak dieksekusi Excel/Sheets), `rowsToCsv`/`buildCsv` (BOM UTF-8 agar Excel baca teks Indonesia benar), `csvFilename` (slug bertanggal). Definisi dataset di `features/settings/exportDatasets.ts` memetakan 5 koleksi (servis, penjualan, pelanggan, inventori, keuangan) ke kolom berlabel Indonesia, **skip tombstone** (`deletedAt`), lalu `downloadCsv` (Blob + anchor) di layer UI. Kartu "Export Data" tampil di Settings → **Sistem** (owner-only, karena memuat keuangan + PII). Untuk cadangan, laporan, atau pindah sistem.

**Backup/Restore JSON (lossless).** Berbeda dari CSV (untuk manusia/laporan), backup JSON adalah snapshot **utuh & dapat dipulihkan**. `lib/business/backup.ts` murni & teruji: `buildBackup`/`serializeBackup` (file `{app:'fixmaster', version, exportedAt, orgId, collections, organization}`), `parseBackup` (validasi marker app + versi tak boleh lebih baru), `countRecords`, `backupFilename`, dan `isBackupDue` (logika jatuh tempo pengingat). IO di `features/settings/backupRestore.ts`: `createBackup` membaca **semua koleksi `COLLECTIONS` (termasuk `walletTransfers` sejak 0086) + singleton organization**, `downloadBackup` (Blob JSON), `restoreBackup` = **Replace** (`clearAll` → `putMany` per koleksi + `setSingleton`); record mempertahankan id/orgId/createdAt sehingga relasi utuh. **Restore lokal-only** (mode cloud andalkan backup/PITR Supabase — overwrite massal lintas-org tak aman karena RLS + bentrok id). Kartu "Backup & Restore" owner-only di Settings → Sistem. **Pengingat**: `stores/backup.ts` (frequency + lastBackupAt di localStorage) + `useBackupReminder` di `AppLayout` menampilkan toast sekali saat app dibuka bila jatuh tempo — *nudge-on-open* yang jujur (web app tak bisa job terjadwal saat ditutup). Kartu "Paket Langganan" dihapus dari tab Sistem (redundan dengan tab Langganan).



**Ekspor PDF Laporan.** Jalur ketiga di gerbang `exportImport` yang sama. Dokumen A4 dibangun
[`features/reports/printReport.ts`](src/features/reports/printReport.ts) dan dibuka lewat
[`lib/print.ts`](src/lib/print.ts) — **dialog cetak browser, bukan pustaka PDF klien**: teks tetap
vektor, grafik tetap SVG, bundle tidak bertambah. `lib/print.ts` juga memayungi nota servis dan
struk penjualan, dan merupakan **satu-satunya tempat warna literal boleh ditulis** (dokumen cetak
tidak mewarisi `tokens.css`). `reportDocHtml()` dipisah dari `printReport()` supaya dokumennya bisa
dirakit dan diperiksa tanpa membuka dialog cetak.

**Hapus/erasure data (hak "penghapusan" UU PDP).** Di Settings → Sistem (Zona Berbahaya), mode cloud menyediakan **"Hapus Akun Permanen"**: (1) `repository.clearAll()` menghapus data tenant, (2) `deleteAccountCredential()` memanggil Edge Function **`delete-account`** yang—setelah memverifikasi JWT pemanggil—menghapus record `auth.users` miliknya **sendiri** via service_role (kunci admin tak pernah ke browser; user tak bisa menghapus akun orang lain), (3) `signOut()`. Bila fungsi belum di-deploy/gagal, **fallback jujur**: data tetap terhapus, user keluar, dan toast memberi tahu kredensial perlu dihapus via dukungan. Disarankan export dulu sebelum hapus.

**Seam pelaporan error.** `lib/report.ts` = satu titik kirim error. Default **console-only** (tanpa SDK/jaringan/bobot bundle); `setErrorReporter()` memasang tracker nyata (mis. Sentry) sekali saat startup tanpa mengubah call-site lain. `reportError()` membungkus non-Error & **tak pernah throw** walau reporter rusak. `ErrorBoundary.componentDidCatch` kini lewat seam ini (tag `source: root|route`). `initErrorTracking()` (dipanggil di `main.tsx`) lazy-import `@sentry/react` **hanya** bila `VITE_SENTRY_DSN` diset.

## Object Storage, rate limiting, & availability (P1/P2 hardening)

**Storage logo (`src/data/storage.ts`).** Logo org dipindah dari base64 di record `organization` → bucket Supabase Storage `org-logos` (migration `0014`). `uploadOrgLogo(orgId, blob)` — **cloud**: upload ke `org-logos/{orgId}/logo-<ts>.png`, prune logo lama, kembalikan **public URL**; **lokal**: kembalikan dataURL (perilaku lama). Caller cukup simpan hasil ke `Organization.logoDataUrl` (kini bisa dataURL **atau** public URL — dirender langsung sebagai `<img src>`, tanpa resolver). RLS Storage: baca publik (logo tampil di struk + tracking publik), tulis/hapus hanya **manager** org pemilik (`org_id` = segmen path pertama via `storage.foldername`). **Foto perangkat sengaja ditunda** (hindari beban storage).

**Rate limiting (lapisan 9).** Migration `0015`: tabel `rate_events` (RLS-locked) + RPC `check_rate_limit(key, max, window)` (sliding window, self-cleaning, security-definer). RPC publik `track_service` di-redefine untuk throttle **60/menit per org** sebelum lookup (return kosong bila lewat — tanpa bocor error). Tradeoff jujur: per-**org**, bukan per-IP (IP klien tak andal di Postgres). Di klien, `lib/rate-limit.ts` punya `slidingWindowAllow()`/`pruneWindow()` murni & teruji; `TrackingPage` memakainya (10/menit) sebagai **defense-in-depth**. Webhook pembayaran sudah diamankan **HMAC** signature; `create-invoice` butuh JWT.

> **Koreksi (bug fix tracking lintas-device).** `TrackingPage` di mode **cloud** kini memanggil RPC `track_service` via `trackService()` di `supabase-client.ts` — **bukan** `repository.list('services')`. Pembacaan langsung tabel `services` tunduk RLS (`services_select` = `is_org_member`), jadi pengunjung **anonim** (pelanggan yang buka link di device/browser lain) selalu dapat "tidak ditemukan". RPC bersifat `security definer` + grant ke `anon`, mengembalikan hanya field aman + history non-internal. Mode **lokal/dev** (tanpa Supabase) tetap baca `repository.list` (IndexedDB, tanpa RLS), dipilih lewat `isSupabaseConfigured`.

**Availability & recovery (lapisan 13).** Edge Function publik `health` (`supabase/functions/health`, `verify_jwt=false`) → cek konektivitas DB (head-count `organizations`), balas `{status, db, version, time, latencyMs}` (200 sehat / 503 down) untuk uptime monitor eksternal. Prosedur lengkap (RPO/RTO, PITR, restore, rollback Vercel, checklist insiden) di `docs/runbook-backup-recovery.md`.

**Service Worker app-shell (lapisan 10).** `public/sw.js` + `lib/sw-register.ts` (registrasi **prod-only**). Cache **app-shell + aset `/assets` ber-hash** (cache-first, aman karena content-hashed), navigasi network-first → fallback `index.html` offline, cache ber-versi + bersih cache lama agar update tak nyangkut. **Tidak** meng-cache API/data (app real-time/multi-tenant). CSP `worker-src 'self'` mengizinkannya.



## Integritas servis & absensi (migrasi `0050`–`0068`)

Rincian keputusan dan latar tiap temuan di [[Decisions & Bug Fixes]]. Di sini fakta strukturalnya.

### Kolom & batasan baru

| Objek | Migrasi | Catatan |
|---|---|---|
| `services.completion_note` (text) | `0059` | Catatan wajib saat status "selesai", dipindah keluar dari `history`. **Kolom baru WAJIB ikut ke `SERVICE_LIST_COLUMNS`** di `src/data/types.ts` — tes integrasi tier3e memeriksanya |
| `services.completed_at` (timestamptz) | `0080` | Saat tiket PERTAMA mencapai "selesai", dipindah keluar dari `history` supaya Laporan berhenti menyeret ≈78% tiap baris. Dipelihara oleh trigger `services_history_append_only` (`0058`) yang diperluas, sekali-set via `coalesce`. `completionDate()` tetap punya jalur mundur ke `history` untuk adapter lokal/demo |
| `nav_counts(p_outlet_id)` RPC | `0081` | Hitungan lampu rel nav (services aktif, menunggu konfirmasi, stok habis/menipis, PO terbuka) dalam SATU permintaan. **SECURITY INVOKER** — RLS yang membatasi org, jadi tanpa permukaan hak akses baru. Tugas TIDAK di sini: aturan visibilitasnya per peran, menyalinnya ke SQL akan membuat badge menyimpang dari halaman Tugas |
| `inventory_items.warranty_days` | `0067` | Garansi bawaan per item; disalin ke baris sparepart sebagai `defaultWarrantyDays` saat part diambil ke tiket. Kosong = pakai garansi part toko |
| `services.spareparts[].warrantyDays` / `warrantyUntil` | `0060` | Garansi per part, di dalam JSONB — tanpa kolom baru |
| Indeks unik absensi per karyawan per hari | `0054` | Sengaja dipisah dari `0053` karena bisa GAGAL bila data lama punya duplikat, dan kegagalannya akan ikut membatalkan pengerasan `clock_in` |
| `membership_outlets` tidak boleh kosong | `0057` | `auth_outlet_ids()` gagal-tertutup: kosong = tidak melihat cabang mana pun |

### RPC baru / berubah tanda tangan

| RPC | Migrasi | Yang dilakukan |
|---|---|---|
| `settle_service` | `0061`, `0062` | Status + biaya final + riwayat + uang dalam SATU transaksi; menerima `p_final_cost`, lalu `p_refund_amount`/`p_refund_wallet_id` untuk kelebihan DP |
| `correct_service_cost` | `0063` | Membukukan SELISIHNYA saja, hari ini; pelunasan lama tidak disentuh |
| `service_summary` | `0063` | Angka Servis/Dashboard + papan teknisi dihitung server, bukan dari daftar terpotong 1000 tiket |
| `update_service_parts` | `0064` | Daftar sparepart + selisih stok dalam satu transaksi; selisih dihitung server dari baris `deducted`, baris inventori dikunci |
| `claim_warranty` | `0064`, `0065` | Klaim garansi atomik, memilih BAGIAN yang diklaim (jasa dan/atau part) dan hanya yang masih berlaku |
| `delete_finance_entry` | `0068` | Hapus transaksi keuangan atomik; aturan pembalikan berbeda per jenis baris (pelunasan / DP / selisih koreksi / refund koreksi) |
| `track_service` | `0050`, `0060` | Menambah `publicNote` toko, lalu `part_warranties` (hanya nama part + tanggal akhir garansi — harga TIDAK pernah ikut) |
| `clock_in` / `clock_out` | `0053` | Zona waktu WIB (bukan `now()` polos yang UTC), dan penjagaan yang sebelumnya hanya ada di policy kini ikut di dalam RPC |

### Trigger penegak

- **`0058` riwayat append-only** — `history` ditandai append-only sejak `0001` tapi tak pernah
  ditegakkan. Trigger menggabungkan: riwayat lama selalu dipertahankan, hanya entri baru yang
  ditambahkan di belakang. Menutup dua hal sekaligus: perangkat kedua yang menimpa entri perangkat
  pertama, dan anggota yang mengganti jejak audit lewat REST.
- **`0065` Lunas/Batal owner/admin-only** — ditegakkan di database, bukan hanya di aplikasi. RPC
  `security definer` tetap membawa `auth.uid()` pemanggil sehingga RPC-nya ikut tertolak tanpa
  ditulis ulang. Service role (`auth.uid()` null — backup/restore, skrip admin) lolos.
- **`0066` stok yang "dipegang" tiket** — membandingkan qty baris `deducted` per item sebelum &
  sesudah. Bagi karyawan, perubahan itu hanya boleh terjadi di dalam `update_service_parts`, ditandai
  variabel transaksi-lokal `fixmaster.parts_rpc`.
- **`0056` absensi owner-only** — `is_org_manager()` (yang mencakup admin) diganti pemeriksaan owner.

### `set search_path` di seluruh fungsi definer (`0055`)

Standar proyek sejak `0045`: `set search_path = public, pg_temp` pada setiap `security definer`.
Audit menemukan aturan itu hanya berlaku dari `0045` ke atas — **64 dari 70 fungsi** tidak
memilikinya, termasuk `process_sale`, `settle_service`, `apply_payment`, `claim_invite`, dan
`track_service`. `0055` menutup semuanya sekaligus. Fungsi definer baru WAJIB menyertakannya.

### Auto-backup (`0051`–`0052`)

Bucket privat `org-backups`, path `{orgId}/auto-<ISO>.json` — segmen folder pertama dipakai RLS
sebagai `org_id`, konvensi sama dengan `org-logos` (`0014`). Isi file memakai format `BackupFile` v1
yang sudah ada, jadi hasilnya bisa di-restore lewat jalur manual. Pemicunya `pg_cron` + `pg_net` ke
Edge Function, karena **aplikasi web tidak bisa menjalankan tugas terjadwal saat ditutup**. Dua
langkah manual (secret `BACKUP_CRON_SECRET` + penjadwalan) dicatat di kepala `0052`. Klien membacanya
lewat [`src/data/cloudBackup.ts`](src/data/cloudBackup.ts).

## Penegakan server menyeluruh (migrasi `0069`–`0079`)

Hasil audit logika bisnis lima menu. Prinsipnya: **server menegakkan, klien mencerminkan
hanya untuk pesan ramah**. Cermin klien tidak pernah jadi satu-satunya penjaga. Rinciannya
di [[Decisions & Bug Fixes]].

- **Uang & stok (`0069`–`0072`)** — `process_sale` memvalidasi ulang harga/HPP/total dan
  menggabungkan baris kembar sebelum cek stok; diskon karyawan dibatasi 10%; stok bisa dimiliki
  satu cabang; HPP jadi rata-rata tertimbang saat PO diterima. `assert_open_month` mengunci
  bulan lalu di Keuangan; pengeluaran milik PO tak bisa diedit dari layar Keuangan;
  `receive_goods_v2` menolak item terhapus alih-alih melewatinya diam-diam; nomor PO dari server
  lewat advisory lock.
- **Jejak audit (`0073`, `0075`, `0076`)** — `activity_stamp_actor` menstempel pelaku di server,
  jadi nama pelaku tidak bisa dipalsukan dari klien. `fm_log` + trigger membuat DATABASE mencatat
  sendiri empat peristiwa uang (void penjualan, void PO, hapus pemasukan, hapus pengeluaran) plus
  `wallet.transfer` — jejaknya tidak lagi bergantung pada browser yang masih hidup sesudah server
  selesai. Di klien, himpunan `SERVER_LOGGED` di [`lib/activity.ts`](src/lib/activity.ts) yang
  memutuskan kapan klien TIDAK ikut mencatat. `purge_activity_logs` owner-only, minimal 90 hari.
- **Agregat laporan (`0074`)** — `service_receivables` dan `category_profit` sebagai RPC, supaya
  piutang dihitung dari SELURUH tabel (bukan potongan 1000 baris) dan laba kategori memakai
  tanggal SELESAI. Dikonsumsi [`useReportData.ts`](src/hooks/useReportData.ts).
- **Kuota paket (`0077`)** — `plan_quota()` mencerminkan `plans.ts` ke database; outlet, wallet,
  dan kursi undangan ditegakkan trigger, bukan hanya disembunyikan UI. `restore_org_data` tidak
  lagi ikut menghapus `activity_logs`: memulihkan backup lama tak boleh menghapus jejak audit.
- **Undangan (`0078`–`0079`)** — `pending_invites.expires_at`, berlaku 14 hari, hanya disegarkan
  oleh jalur undang-ulang (`created_at` berubah).

### Modul tulis bersama (`src/data/*.ts`)

Percabangan `isCloudMode()` **tidak boleh hidup di dalam modal**. Tiap salinan harus disepakati
ulang saat bentuk barisnya berubah, dan jalur lokalnya hanya bisa diuji lewat UI. Polanya:

| Modul | Menyembunyikan |
|---|---|
| [`serviceParts.ts`](src/data/serviceParts.ts) | Simpan sparepart tiket + selisih stok (RPC `update_service_parts` vs tulis lokal) |
| [`financeEntry.ts`](src/data/financeEntry.ts) | Catat pemasukan/pengeluaran + saldo wallet (RPC `record_finance_entry` vs tulis lokal). Dipakai Keuangan DAN saldo awal wallet di Pengaturan |

## Terkait
- [[Tech Stack]] · [[Decisions & Bug Fixes]] · [[Sidebar - Live Diagnostic Rail]]

#architecture #data
