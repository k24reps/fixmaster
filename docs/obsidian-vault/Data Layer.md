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

### Repository swappable (live-binding) — untuk demo publik

`src/data/index.ts` meng-ekspor `repository` sebagai **ES live-binding mutable**. `installRepository(impl)` menukar instance saat runtime, `resetRepository()` mengembalikannya. Karena semua pemanggil (`useCollection`, `session`, dll) membaca binding **saat dipanggil**, menukar instance langsung mengalihkan seluruh app tanpa reload.

[`InMemoryAdapter`](src/data/in-memory-adapter.ts) — implementasi `Repository` berbasis `Map` (singleton per-instance), mencerminkan `LocalAdapter`: audit-stamp (`createdAt/updatedAt`), scoping `orgId`, soft-delete (tombstone), singleton per-org, dan mekanik `notify()`/`subscribe()`. **RAM-only**: nol jejak disk, hilang saat tab ditutup, tak menyentuh IndexedDB asli pengunjung. Dipakai oleh **demo interaktif** (lihat [[Signature Pages]] § Demo Interaktif). Teruji paritas di `in-memory-adapter.test.ts` (8 tes).

> [!NOTE]
> `commitWizard()` punya opsi `{forceLocal}`. Di produksi (`isSupabaseConfigured`) wizard normal menulis ke cloud RPC; demo memakai `forceLocal:true` agar seed menulis ke `InMemoryAdapter` yang baru dipasang (pengunjung anonim tak punya akun cloud).

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

**Billing (migration `0009`, diperketat `0016`, `0022`)** — tabel `invoices` (org_id, plan, amount, status, provider, qris_url, period_start/end, paid_at) + RPC `start_subscription` (bikin invoice pending 1 siklus), `apply_payment` (idempotent: tandai lunas + perpanjang `plan_expired_at` dari `max(now, expiry)`), fungsi `is_org_active` (cek belum suspended & belum lewat grace). **Sejak `0016`: billing = OWNER-only** — `start_subscription`/`cancel_invoice` dan policy `invoices_manage` pakai `is_org_owner`; selain itu kolom `organizations.plan_type` dikunci oleh trigger `guard_plan_type_change` (hanya berubah lewat `apply_payment` yang menandai flag transaksi-lokal, atau `service_role` webhook) — jadi admin/siapa pun tak bisa mem-bypass pembayaran via `UPDATE` langsung. Edit profil usaha (nama/alamat/logo) tetap aman: klien menyimpan profil dengan meng-`UPDATE` seluruh baris (termasuk `plan_type` yang bisa **basi** dari cache), jadi trigger **mempertahankan** nilai lama (`new.plan_type := old.plan_type`) alih-alih menggagalkan update — anti-bypass tanpa false-positive. **Sejak `0022` (fix F5): `apply_payment` punya guard pemanggil eksplisit** — hanya `service_role` (webhook) ATAU `is_org_owner` pemilik invoice; sebelumnya di-grant `authenticated` tanpa cek sehingga karyawan bisa menandai invoice lunas tanpa bayar (terbukti via test integrasi, kini regresi 2-arah hijau). Logika siklus murni di `lib/business/billing.ts`. Detail: [[Decisions & Bug Fixes]] (billing invoice-based QRIS) & [[Testing & Security]] (fase perbaikan).

**Enforcement tulis (migration `0010`)** — semua RLS `*_write` policy (operasional, finansial, config) diperketat agar `using`+`with check` wajib `is_org_active(org_id)`. Jadi saat langganan kedaluwarsa (lewat grace), **insert/update/delete diblokir di level DB** untuk semua jalur tulis (termasuk input pemasukan via adapter yang tak lewat RPC) — sementara `*_select` tak disentuh (baca tetap jalan) dan `invoices`/`memberships` tak digerbang (bayar + kelola tim tetap bisa). `supabase-adapter` menerjemahkan error RLS `42501` jadi pesan Indonesia yang ramah.

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
- **Klien `subscribeOrgTables(orgId, tables, onChange)`** (`supabase-client.ts`): satu channel `org-domain:<orgId>`, satu listener `postgres_changes` per-tabel dengan filter `org_id=eq.<orgId>`. RLS tetap berlaku di stream → device hanya menerima baris org-nya.
- **`SupabaseAdapter`**: `setScope()` membuka channel (menutup yang lama saat ganti org). Event masuk → `TABLE_TO_COLLECTION[table]` → `notifyDebounced(collection)` (**debounce 250ms** untuk meredam ledakan event saat bulk-write seperti restore `0020`). Strategi **re-fetch koleksi terdampak**, bukan patch store → sederhana & anti-drift. `dispose()` melepas channel + timer, dipanggil dari `session.reset()` (sign-out/ganti akun).
- **Kontrak**: `Repository.dispose?()` opsional (local adapter no-op).

> [!NOTE]
> Realtime di FixMaster kini dua lapis: **billing** (`0012`, `subscribeOrgBilling`) + **data domain** (`0021`, `subscribeOrgTables`). Keduanya per-org & terkurung RLS.

### Tim per-outlet, wallet Hybrid, laporan per-cabang (migrasi `0023`–`0029`)

Rilis bertahap **Expand → Contract** agar aman di produksi (tak ada *lockout* data). `0023`–`0026` = Rilis 1 (Expand); `0027` = jaring pengaman anti-lockout; `0028` = Rilis 2 (Contract / RLS lock, **applied di staging** 12 Jun 2026, **belum di produksi**). **Nomor file = urutan eksekusi.**

- **`0023_backfill_outlet_id.sql`** — menstempel record transaksi lama (`outlet_id null`) ke **outlet utama** org (is_primary → terlama). Hanya tabel transaksi (`services, sales, incomes, expenses, attendance, purchase_orders, task_instances`); data bersama (wallet/pelanggan/inventori) dibiarkan `null`. Idempotent, forward-only. **Kenapa**: tanpa ini, record null muncul di SETIAP cabang dan menggelembungkan total per-cabang.
- **`0024_membership_outlets.sql`** — junction **`membership_outlets`** (karyawan↔outlet, RLS: member baca, manager kelola) + helper **`auth_outlet_ids()`** (security definer stable, pola `auth_org_ids`) + RPC **`set_member_outlets(member, outlet[])`** (replace, manager-only) + **backfill semua anggota→semua outlet** (cegah lockout saat `0028`) + **`pending_invites.outlet_ids`** dengan `claim_invite()` mengisi junction (fallback: semua outlet bila invite tak menyebut).
- **`0025_outlet_aware_rpc.sql`** — `process_sale` & `settle_service` di-recreate: tambah `p_outlet_id` (default null → tanda tangan lama tetap jalan), validasi **`can_use_outlet(org, outlet)`** (null/manager/∈ auth_outlet_ids), dan `incomes.sale_id` diisi (void deterministik). Deskripsi income tetap `'Penjualan <no>'` agar fallback `void_sale` (`0018`) tetap cocok. _(Catatan: `settle_service` di sini single-wallet; kemudian **digantikan** oleh versi split-payment di `0029`.)_
- **`0026_ensure_primary_outlet.sql`** (Rilis 1, siap apply) — **menjamin invarian "tiap org punya 1 outlet utama"**: (A) org lama tanpa outlet → buat 1 outlet utama (nama = nama org); (B) org punya outlet tapi tak ada `is_primary` → tandai yang terlama; (C) **re-jalankan backfill** transaksi (identik `0023`) agar baris `null` kini menempel ke outlet utama. **Kenapa perlu**: org dibuat sebelum wizard punya langkah Outlet bisa nol outlet, membuat `0023` jadi no-op (transaksi lama tak masuk cabang manapun). Org baru via wizard sudah otomatis primary (`buildOutlets: isPrimary = i===0`), jadi A/B hanya menyentuh org lama. Menggantikan kebutuhan re-run `0023` manual.
- **`0027_heal_unassigned_outlets.sql`** (jaring pengaman, siap apply) — untuk tiap **karyawan aktif dengan NOL penugasan**, tugaskan ke SEMUA outlet org-nya (filosofi sama backfill `0024`). **Kenapa perlu**: org nol-outlet membuat backfill `0024` jadi no-op → karyawannya 0 penugasan → terkunci dari transaksi lama (yang sudah di-stempel outlet utama oleh `0026`) setelah `0028`. **Presisi**: HANYA menyentuh yang 0 penugasan (pembatasan owner yang sudah ada dihormati), hanya peran `karyawan`. Idempotent, hanya MEMBERI akses (tak pernah mencabut) → aman sebelum/sesudah `0028`.
- **`0028_rls_outlet_scope.sql`** (Rilis 2, **applied di staging + PRODUKSI** 12 Jun 2026) — mengetatkan RLS select/insert/update transaksi + select wallet ke `is_org_manager OR outlet_id IS NULL OR outlet_id IN (auth_outlet_ids)`. Tetap pertahankan gerbang `is_org_active` (`0010`), delete manager-only (`0017`), keuangan baca manager-only (`0016`, sengaja tak dilonggarkan). Header memuat prasyarat apply. Diverifikasi [[Testing & Security]] (Tier 3, 6 test).
- **`0029_split_settle_and_cancel.sql`** (**applied di staging + PRODUKSI** 12 Jun 2026) — memindahkan dua alur billing yang tersisa ke RPC agar kasir tetap bisa di bawah `0028`: (A) **`settle_service` di-recreate** dari single-wallet (`p_wallet_id`/`p_amount`) → **`p_payments jsonb`** (array leg, mirror `process_sale`); 1 income per leg, deskripsi kini **`'Pelunasan servis <no>'`** (sebelumnya tanpa nomor di `0025`) agar koreksi final-cost tetap cocok. (B) **RPC baru `cancel_service`** — atomik: restore stok ter-`deducted`, refund DP (hapus income `'DP servis <no>'` + balik saldo wallet), set `batal`, nolkan DP, flip `deducted=false`. **Kenapa perlu**: batch split-payment (live di produksi) menulis langsung ke wallets/incomes/inventory → manager-only setelah `0028` → kasir karyawan terblokir lunas/batal. Additif & idempotent (drop+create fungsi). Diverifikasi [[Testing & Security]] (Tier 3B, 3 test).

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

**Backup/Restore JSON (lossless).** Berbeda dari CSV (untuk manusia/laporan), backup JSON adalah snapshot **utuh & dapat dipulihkan**. `lib/business/backup.ts` murni & teruji: `buildBackup`/`serializeBackup` (file `{app:'fixmaster', version, exportedAt, orgId, collections, organization}`), `parseBackup` (validasi marker app + versi tak boleh lebih baru), `countRecords`, `backupFilename`, dan `isBackupDue` (logika jatuh tempo pengingat). IO di `features/settings/backupRestore.ts`: `createBackup` membaca **15 koleksi + singleton organization**, `downloadBackup` (Blob JSON), `restoreBackup` = **Replace** (`clearAll` → `putMany` per koleksi + `setSingleton`); record mempertahankan id/orgId/createdAt sehingga relasi utuh. **Restore lokal-only** (mode cloud andalkan backup/PITR Supabase — overwrite massal lintas-org tak aman karena RLS + bentrok id). Kartu "Backup & Restore" owner-only di Settings → Sistem. **Pengingat**: `stores/backup.ts` (frequency + lastBackupAt di localStorage) + `useBackupReminder` di `AppLayout` menampilkan toast sekali saat app dibuka bila jatuh tempo — *nudge-on-open* yang jujur (web app tak bisa job terjadwal saat ditutup). Kartu "Paket Langganan" dihapus dari tab Sistem (redundan dengan tab Langganan).



**Hapus/erasure data (hak "penghapusan" UU PDP).** Di Settings → Sistem (Zona Berbahaya), mode cloud menyediakan **"Hapus Akun Permanen"**: (1) `repository.clearAll()` menghapus data tenant, (2) `deleteAccountCredential()` memanggil Edge Function **`delete-account`** yang—setelah memverifikasi JWT pemanggil—menghapus record `auth.users` miliknya **sendiri** via service_role (kunci admin tak pernah ke browser; user tak bisa menghapus akun orang lain), (3) `signOut()`. Bila fungsi belum di-deploy/gagal, **fallback jujur**: data tetap terhapus, user keluar, dan toast memberi tahu kredensial perlu dihapus via dukungan. Disarankan export dulu sebelum hapus.

**Seam pelaporan error.** `lib/report.ts` = satu titik kirim error. Default **console-only** (tanpa SDK/jaringan/bobot bundle); `setErrorReporter()` memasang tracker nyata (mis. Sentry) sekali saat startup tanpa mengubah call-site lain. `reportError()` membungkus non-Error & **tak pernah throw** walau reporter rusak. `ErrorBoundary.componentDidCatch` kini lewat seam ini (tag `source: root|route`). `initErrorTracking()` (dipanggil di `main.tsx`) lazy-import `@sentry/react` **hanya** bila `VITE_SENTRY_DSN` diset.

## Object Storage, rate limiting, & availability (P1/P2 hardening)

**Storage logo (`src/data/storage.ts`).** Logo org dipindah dari base64 di record `organization` → bucket Supabase Storage `org-logos` (migration `0014`). `uploadOrgLogo(orgId, blob)` — **cloud**: upload ke `org-logos/{orgId}/logo-<ts>.png`, prune logo lama, kembalikan **public URL**; **lokal**: kembalikan dataURL (perilaku lama). Caller cukup simpan hasil ke `Organization.logoDataUrl` (kini bisa dataURL **atau** public URL — dirender langsung sebagai `<img src>`, tanpa resolver). RLS Storage: baca publik (logo tampil di struk + tracking publik), tulis/hapus hanya **manager** org pemilik (`org_id` = segmen path pertama via `storage.foldername`). **Foto perangkat sengaja ditunda** (hindari beban storage).

**Rate limiting (lapisan 9).** Migration `0015`: tabel `rate_events` (RLS-locked) + RPC `check_rate_limit(key, max, window)` (sliding window, self-cleaning, security-definer). RPC publik `track_service` di-redefine untuk throttle **60/menit per org** sebelum lookup (return kosong bila lewat — tanpa bocor error). Tradeoff jujur: per-**org**, bukan per-IP (IP klien tak andal di Postgres). Di klien, `lib/rate-limit.ts` punya `slidingWindowAllow()`/`pruneWindow()` murni & teruji; `TrackingPage` memakainya (10/menit) sebagai **defense-in-depth**. Webhook pembayaran sudah diamankan **HMAC** signature; `create-invoice` butuh JWT.

> **Koreksi (bug fix tracking lintas-device).** `TrackingPage` di mode **cloud** kini memanggil RPC `track_service` via `trackService()` di `supabase-client.ts` — **bukan** `repository.list('services')`. Pembacaan langsung tabel `services` tunduk RLS (`services_select` = `is_org_member`), jadi pengunjung **anonim** (pelanggan yang buka link di device/browser lain) selalu dapat "tidak ditemukan". RPC bersifat `security definer` + grant ke `anon`, mengembalikan hanya field aman + history non-internal. Mode **lokal/dev** (tanpa Supabase) tetap baca `repository.list` (IndexedDB, tanpa RLS), dipilih lewat `isSupabaseConfigured`.

**Availability & recovery (lapisan 13).** Edge Function publik `health` (`supabase/functions/health`, `verify_jwt=false`) → cek konektivitas DB (head-count `organizations`), balas `{status, db, version, time, latencyMs}` (200 sehat / 503 down) untuk uptime monitor eksternal. Prosedur lengkap (RPO/RTO, PITR, restore, rollback Vercel, checklist insiden) di `docs/runbook-backup-recovery.md`.

**Service Worker app-shell (lapisan 10).** `public/sw.js` + `lib/sw-register.ts` (registrasi **prod-only**). Cache **app-shell + aset `/assets` ber-hash** (cache-first, aman karena content-hashed), navigasi network-first → fallback `index.html` offline, cache ber-versi + bersih cache lama agar update tak nyangkut. **Tidak** meng-cache API/data (app real-time/multi-tenant). CSP `worker-src 'self'` mengizinkannya.



## Terkait
- [[Tech Stack]] · [[Decisions & Bug Fixes]] · [[Sidebar - Live Diagnostic Rail]]

#architecture #data
