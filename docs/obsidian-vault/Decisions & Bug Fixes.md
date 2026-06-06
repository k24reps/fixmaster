---
title: Decisions & Bug Fixes
aliases: [Decisions, Bug Fixes, Lessons]
tags: [fixmaster, decision, bugfix]
created: 2026-06-04
---

# 🧠 Decisions & Bug Fixes

Bagian dari [[00 - FixMaster MOC]].

Catatan keputusan desain penting + bug nyata yang ditemukan saat verifikasi.

## Keputusan desain

### Bahasa visual bersama, bukan asal beda
Tiap halaman punya metafora alat sendiri, tapi semua memakai token + motif yang sama (mono, LED, spine, dotted divider, tick-gauge). Tujuan: terasa **satu produk**. Lihat [[Design System]] & [[Signature Pages]].

### Komponen bersama dibiarkan utuh
`StatCard` dipakai Dashboard & Servis. Saat mendesain ulang Reports, dibuat **tile lokal** alih-alih mengubah `StatCard`, supaya halaman lain tak ikut berubah tak sengaja.

### Sidebar arah B + active-as-channel
Dari beberapa opsi (Control Panel, Live Diagnostic Rail, Rack Unit, Boot Sequence), dipilih **Live Diagnostic Rail** karena unik *dan* fungsional — readout memakai data nyata. Tanpa grup bersekat. Lihat [[Sidebar - Live Diagnostic Rail]].

### Ikon terpusat
Migrasi ke Phosphor lewat satu komponen `Icon` agar penggantian set ikon = ubah satu file. Lihat [[Iconography]].

### Auth dua-mode (cloud vs local) — Fase 0 SaaS
Schema Supabase (RLS + RPC) dibangun untuk **Supabase Auth** (`auth.uid()`, `memberships.user_id → auth.users`), tapi app awalnya hanya punya **login PIN sisi-klien** yang tak pernah sign-in ke Supabase. Akibatnya cloud mode tak bisa membuat org / RLS memblokir semua. Keputusan (branch `feat/cloud-auth`):
- **Dua sesi terpisah**: `stores/auth.ts` (akun cloud Supabase Auth, email+password) vs `stores/session.ts` (org + karyawan aktif). `AuthGate` mengorkestrasi keduanya.
- **Dua jalur boot**: Cloud → `loading → needs-auth (AuthPage) → needs-setup (Wizard) → ready`. Local → `loading → needs-setup → needs-pin (PinLogin) → ready`.
- **PIN tidak dihapus**: di cloud mode PIN **dilewati** (akun yang login = karyawannya, tak perlu picker shared-device); di local mode (dev/demo, tanpa Supabase) PIN tetap dipakai. `auth` store settle ke `'local'` bila env Supabase tak ada.
- **Kenapa begini**: mempertahankan local-first untuk pengembangan & menjaga **164 test tetap utuh**, sambil mengaktifkan auth nyata di cloud. Verifikasi cloud (signup→create_organization RPC→isolasi antar-org) butuh **Supabase project staging terpisah** — belum dijalankan saat catatan ini ditulis. Lihat [[Tech Stack]] & [[Data Layer]].

### Bug: schema cloud melenceng dari entity TS (Fase 0D)
Saat wiring onboarding cloud (0D) ketahuan **schema Postgres awal (`0001`) sudah tertinggal** dari `src/data/types.ts` yang terus berevolusi. Karena `supabase-adapter.toRow()` memetakan **setiap** field entity ke kolom, kolom yang hilang membuat **semua upsert cloud gagal saat runtime** — artinya cloud mode belum pernah benar-benar teruji. Temuan konkret:
- `deletedAt` ada di **semua** entity (`BaseEntity`) tapi **tak ada satu tabel pun** yang punya `deleted_at`.
- `outlet_id` hilang di `suppliers`, `wallets`, `task_templates`, `memberships`.
- `services` melenceng: schema punya `warranty_until` (lama), entity punya `warranty_service_until`/`warranty_parts_until`/`picked_up`/`picked_up_at`/`warranty_claim_of`.
- `memberships` tak punya `updated_at` (Employee entity punya).
- Tabel `fixed_costs` tak pernah dibuat padahal dipetakan adapter.

Perbaikan: migration **`0005_fixed_costs.sql`** (buat tabel) + **`0006_schema_reconcile.sql`** (idempotent: tambah `deleted_at` ke semua tabel, `outlet_id` yang hilang, `memberships.updated_at`, kolom garansi/pickup `services`). Pelajaran: **entity TS & schema SQL harus direkonsiliasi tiap kali `types.ts` berubah** — idealnya ada test/CI yang membandingkan keduanya (kandidat Fase 2). Lihat [[Data Layer]].

### Bug: cloud logout & login user existing belum ada (Fase 0D)
Ketahuan saat uji manual: tombol di footer sidebar hanya memanggil `signOutEmployee` (mode lokal = re-entry PIN), **bukan** sign-out akun cloud. Lebih dalam: `bootstrap()` me-resolve org dari `localStorage` & karyawan dari PIN, jadi setelah logout→login, user cloud **nyangkut di PinLogin**. Belum ketahuan karena onboarding auto-login owner. Perbaikan:
- **`getMyMembership()`** (supabase-client): resolve org + `membership.id` dari `auth.uid()`. Di cloud, `membership.id` **adalah** id "karyawan aktif" yang dipakai app → login tanpa PIN.
- **`bootstrap()` sadar-mode**: cloud → resolve org+employee dari membership; local → jalur lama (localStorage+PIN).
- **Sidebar logout sadar-mode**: cloud → `useAuthStore.signOut()` (→ AuthPage); local → switch user (PIN).
- **Cegah kebocoran antar-tenant**: `auth.signOut()` memanggil `session.reset()` (set `boot:'loading'`, kosongkan org/employee) di tick yang sama, supaya akun berikut yang login **tak pernah** sekejap melihat data org sebelumnya. (Effect `bootstrap` jalan setelah render, jadi reset eksplisit ini penting — bukan sekadar set `loading` di dalam bootstrap.) Lihat [[Tech Stack]].

### Absensi: GPS geofence saja, selfie ditolak (Fase 0E)
Selfie saat clock-in **sengaja tidak dipakai**. Alasan biaya: tiap absen meng-upload gambar ke Supabase Storage → biaya storage + bandwidth **berulang** tiap hari per karyawan, untuk tambahan jaminan yang marginal. GPS geofencing (radius outlet, divalidasi server-side di RPC `clock_in`) sudah cukup mencegah "absen nakal". Field `requireSelfie` & param `p_selfie_url` dibuang dari `Outlet`/migration `0004`. `0004` dibikin idempotent (`drop column/function if exists`) agar aman di-rerun di staging yang sudah terlanjur kena versi lama.

### Wizard onboarding sadar-mode (cloud vs local)
Wizard awalnya selalu menampilkan (a) bar dev "isi data demo & masuk" dan (b) step "Tim" untuk input karyawan + PIN. Keduanya **tak cocok untuk cloud**: demo seed bisa mencemari org nyata, dan PIN tak dipakai di cloud (owner = akun yang login, staff via undangan nanti). Perbaikan: bar demo di-hide bila `isSupabaseConfigured` (tetap ada di local dev/Playwright), dan step "Tim" dilewati di cloud — nama owner diambil di step Profil (field "Nama Anda"). **Nomor step logis dijaga stabil** (`validateStep` diuji per-nomor), navigasi didorong oleh daftar step yang *terlihat*; test wizard tetap hijau.

### Manajemen Tim: model undangan "pending-invite + claim" (Fase 1A)
Menambah karyawan di cloud butuh tiap orang punya akun Supabase Auth sendiri (Opsi B). Cara "resmi" (`auth.admin.inviteUserByEmail`) butuh **service_role key** yang HANYA boleh di server/Edge Function — tak boleh di browser. Daripada langsung bikin Edge Function + email transaksional (ditunda ke Fase 3), dipilih model **pending-invite + claim** yang tak butuh keduanya:
1. Owner/admin buat baris `pending_invites` (email + peran) lewat UI Tim di Pengaturan.
2. Karyawan **daftar mandiri** di halaman signup pakai email yang diundang.
3. Saat boot pertama (`session.bootstrap`), bila akun belum punya membership → panggil RPC `claim_invite()` yang mencocokkan `auth.email()` dengan undangan terbuka, lalu buat `memberships` row & tandai `claimed_at`. Bila ada → masuk org (skip wizard); bila tidak → wizard onboarding seperti biasa.

Semua mutasi tim lewat RPC **security definer** (`claim_invite`, `set_member_role`, `deactivate_member`) yang mengecek `is_org_manager` dan **menolak menghapus/menurunkan owner aktif terakhir** (cegah org tanpa owner). Logika guard yang sama dicerminkan murni di `src/lib/business/team.ts` (testable) untuk validasi UI dini — tapi RPC tetap batas keamanan sebenarnya. Migration `0008`. Trade-off jujur: karyawan harus tahu harus daftar **pakai email yang diundang** (belum ada email pemberitahuan otomatis); ini dinaikkan ke alur Edge Function + email saat Fase 3. Lihat [[Data Layer]].

### Billing & langganan: invoice-based QRIS, enum plan tetap stabil (Fase 1B)
QRIS itu **bayar sekali** (bukan auto-debit recurring seperti kartu). Maka model langganan = **tiap siklus generate invoice → user scan QRIS → bayar → webhook tandai lunas → perpanjang `plan_expired_at`**. Diimplementasi: tabel `invoices` + RPC `start_subscription` (bikin invoice pending) & `apply_payment` (idempotent: tandai lunas + perpanjang plan dari `max(now, expiry)` agar bayar lebih awal tak hangus). Migration `0009`.

Keputusan penting yang dijaga:
- **Enum `plan_type` Postgres TIDAK di-rename.** Nilainya tetap `('free','standard','enterprise','trial','suspended')` karena `PLANS` di `plans.ts` adalah `Record<PlanType, PlanDef>` dan ada org existing di staging. Mengganti enum = migrasi data berisiko demi kosmetik. Jadi hanya **label tampilan** yang berubah (standard→"Solo", enterprise→"Bisnis"), plus kuota & harga. Harga = **placeholder** (`// placeholder`), gampang diganti sebelum launch.
- **Harga per-organisasi, tier by jumlah outlet, user UNLIMITED** (`maxUsers:-1` di semua tier pakai). Helper `withinOutletQuota`, `outletTierFor`, `PAID_TIERS`.
- **Reminder H-3, grace 3 hari, lalu expired** — logika murni di `src/lib/business/billing.ts` (`subscriptionPhase`: active/reminder/grace/expired; `canWrite`; `isOrgActive`) + 13 test. Dicerminkan server-side oleh fungsi `is_org_active` (RPC `0009`).
- **Provider di-abstraksi.** Kolom `provider`/`provider_ref`/`qris_url` di `invoices`. Integrasi Mayar nyata **sudah ditulis** (Edge Functions `create-invoice` + `mayar-webhook`) — tinggal deploy + key user. UI `BillingTab` coba Mayar dulu (buka link bayar di tab baru), dan **fallback** ke tombol "Saya sudah bayar" (mock confirm) bila fungsi belum di-deploy, jadi alur tetap bisa diuji tanpa Mayar. Detail di catatan integrasi Mayar di bawah.

Catatan enforcement (Fase 1B lanjutan, migration `0010`): **write-blocking server-side saat langganan kedaluwarsa kini aktif**. Akar masalah: input (mis. pemasukan) menulis langsung ke tabel via adapter, dan RLS `*_write` policy cuma cek `is_org_member`/`is_org_manager` — tak pernah cek `is_org_active`. Jadi Postgres tetap mengizinkan tulis walau plan lewat grace. Fix: migration `0010_billing_enforcement.sql` membuat ulang **semua** `*_write` policy (operasional, finansial, config) agar `using`+`with check` juga wajib `is_org_active(org_id)`. Akibatnya tulis (insert/update/delete) diblokir di level DB saat kedaluwarsa, sementara **baca tetap jalan** (policy `*_select` tak disentuh) dan **bayar tetap bisa** (tabel `invoices`/`memberships` tak digerbang). Org trial baru tak terpengaruh (aktif 14 hari). Error RLS (`42501`) diterjemahkan `supabase-adapter` jadi pesan Indonesia ("Langganan kedaluwarsa atau melebihi kuota — perpanjang di Pengaturan → Langganan") alih-alih "row-level security policy" mentah. Lihat [[Data Layer]].

### Integrasi Mayar nyata: 2 Edge Function (produksi) — Fase 1B lanjutan
Untuk uji di **staging** dipakai environment **sandbox** Mayar (`api.mayar.club`, tanpa uang asli); produksi (`api.mayar.id`) menyusul saat promote. Karena base URL **env-driven** (`MAYAR_API_BASE`), pindah sandbox↔produksi cukup ganti secret, tanpa ubah kode. Bentuk API diverifikasi langsung dari docs resmi sebelum koding (bukan menebak). Dua Edge Function (runtime Deno, di `supabase/functions/`):

1. **`create-invoice`** — dipanggil klien via `functions.invoke`. Alur: (a) verifikasi JWT pemanggil, panggil RPC `start_subscription` sebagai user itu (cek manager + bikin invoice `pending`), (b) `POST {MAYAR_API_BASE}/invoice/create` dengan `extraData.invoiceId` = id invoice kita (**kunci korelasi** balik dari webhook), (c) simpan `provider_ref` + `qris_url` (= hosted payment link Mayar) ke baris invoice, (d) balikkan link. Bila Mayar gagal, invoice di-set `canceled` (tak menggantung pending).
2. **`mayar-webhook`** — endpoint **publik** (Mayar yang manggil, bukan user login → `verify_jwt = false` dideklarasikan di `supabase/config.toml`, jadi `supabase functions deploy mayar-webhook` polos sudah cukup). Pola **acknowledge-then-verify**: **selalu balas 200** (biar "Test URL" Mayar & retry lolos), tapi `apply_payment` (idempotent, service-role) cuma jalan kalau token cocok **dan** event `payment.received`. Korelasi via `extraData.invoiceId` (fallback `provider_ref`).

Keputusan & alasan:
- **Pilih endpoint Invoice, bukan Dynamic QRCode.** Endpoint `qrcode/create` cuma terima `amount` — tak ada cara mengaitkan pembayaran balik ke invoice kita. `invoice/create` mendukung `extraData`, jadi webhook bisa tahu invoice mana yang lunas.
- **Base URL env-driven** (`MAYAR_API_BASE`, default produksi). Tinggal ganti ke `api.mayar.club` kalau mau sandbox tanpa ubah kode.
- **Key Mayar TAK PERNAH di browser** — hanya di Supabase secrets, dibaca `Deno.env.get`. Klien hanya kenal nama fungsi.
- **Token webhook by value, bukan by nama header**: docs Mayar tak menyebut nama header token, dan ping "Test URL" Mayar **tak bawa token & bukan `payment.received`** (log konektivitas membuktikan: header yang masuk cuma `accept`, `cf-*`, `content-type`, dst — nol header auth). Maka handler mencocokkan `MAYAR_WEBHOOK_TOKEN` dengan **nilai semua header** (bukan nebak nama), dan menolak diam-diam (tetap 200) bila tak cocok — nama header di-log (bukan nilainya) untuk diagnosa. Selain itu **non-POST (GET/HEAD) juga dibalas 200** karena Test URL Mayar kemungkinan pakai GET. Awalnya sempat balas 403/405 keras → Test URL gagal; diperbaiki ke acknowledge-then-verify.
- **UI fallback**: `BillingTab.subscribe` coba `createMayarInvoice` dulu; bila fungsi belum di-deploy (error) → jatuh ke mock `start_subscription` + tombol "Saya sudah bayar". Jadi app tetap jalan sebelum & sesudah deploy.
- **ESLint**: `supabase/functions` dimasukkan `globalIgnores` (runtime Deno, import URL, di luar `tsconfig.app` yang cuma `src`) — biar `npm run lint` browser-app tak rusak.

Sisa (giliran user, perubahan akun/eksternal): set secrets, `supabase functions deploy`, daftar URL webhook di dashboard Mayar, uji bayar QRIS nominal kecil. Lihat [[Data Layer]] (Tabel & RPC cloud).

### Outlet dibuat di wizard + bug `outlets.outlet_id`
Dua masalah berkaitan, diperbaiki bareng:
1. **Bug: tambah outlet di Pengaturan gagal (cloud).** `Outlet extends BaseEntity` → bawa field `outletId`, dan supabase-adapter memetakan **semua** field entity ke kolom. Tapi tabel `outlets` (migration `0001`) **tak punya kolom `outlet_id`** (migration `0006` menambahkannya ke tabel lain, tapi melewati `outlets` sendiri). Jadi upsert outlet di cloud menabrak kolom tak-ada → gagal. Fix: migration **`0007_outlets_outlet_id.sql`** (idempotent) menambah kolom itu; nilainya selalu NULL untuk outlet, ada murni demi kontrak BaseEntity↔adapter yang seragam.
2. **Outlet kini dibuat di wizard** (step baru "Outlet", `n:6`, ditaruh setelah Profil). Sebelumnya `create_organization` & commit lokal **tak** membuat outlet sama sekali → org baru punya nol outlet, memaksa user ke Pengaturan (yang malah error karena #1). Sekarang user pilih **single** (default 1 outlet utama, nama/alamat mewarisi profil usaha bila kosong) atau **multi** (tambah cabang). Helper `buildOutlets()` dipakai di **kedua** jalur commit (lokal & cloud). Dev seed **opt-out** (`data.outlets = []`) karena ia bikin 3 outlet sendiri. `validateStep(6)`: minimal 1 outlet, cabang ke-2+ wajib bernama.

### Klaim garansi = tiket baru tertaut, bukan rollback
Saat pelanggan datang untuk klaim garansi, tiket asli **tidak** di-rollback ke alur aktif. Alasannya: tiket `lunas` sudah punya catatan keuangan (income tercatat, profit terhitung) — rollback akan mengacaukan laporan & riwayat. Sebagai gantinya, klaim jadi **tiket baru gratis** yang tertaut ke asli via `warrantyClaimOf`; tiket asli tetap `lunas` & utuh. Kerugian garansi (part/jasa yang ditanggung toko) dicatat **manual** sebagai expense kategori `'Garansi'`, sengaja tidak ditarik dari harga POS/inventory agar part bekas/stok lama tidak salah hitung. Lihat [[Data Layer]] & [[Signature Pages]].

### Garansi diisi saat "selesai", dua field terpisah
Semula garansi aktif **otomatis** saat `lunas` dengan satu field `warrantyUntil`. Diubah: garansi diisi saat status → **`selesai`** (lebih awal di alur, saat teknisi memang menentukan masa garansi), dan dipecah jadi **dua field** — `warrantyServiceUntil` (jasa) & `warrantyPartsUntil` (sparepart) — karena masa garansi keduanya sering berbeda (mis. jasa 30h, part 7h). StatusModal mewajibkan **minimal salah satu** terisi, prefill dari default `orgConfig` + chip preset. `isUnderWarranty` kini true bila **salah satu** masih berlaku. Lihat [[Data Layer]].

### Ukuran tampilan: satu baseline tetap, bukan pemilih skala
Kartu **Tampilan** (pemilih skala Kecil/Normal/Besar 90/100/110%) di tab Sistem **dihapus** beserta store `displayScale`, init pre-render di `main.tsx`, ikon `text-height`/TextAa, dan CSS terkait. Alasannya: pemilih itu meng-override `html { font-size }` lewat JS inline (100% = default browser 16px) sehingga **bertabrakan** dengan baseline desain `15px` — menyebabkan ukuran terasa "berubah-ubah" (kadang kecil, kadang besar) tergantung nilai tersimpan. Keputusan: pakai **satu baseline tetap** `html { font-size: 15px }` yang proper & konsisten di semua device; perbedaan desktop vs mobile ditangani murni lewat **media query** (lihat audit responsif mobile di bawah), bukan skala font global. Pengguna yang butuh memperbesar tetap bisa pakai zoom bawaan browser/OS.

---

## Bug fixes

### 🐞 Data kosong saat mount (`useCollection`)
> [!bug] Akar masalah
> Hook pakai `initialData: []`. React Query menganggap array kosong sebagai data "fresh"; digabung `staleTime` 30 dtk, fetch saat mount **dilewati** → UI kosong sampai stale. Ini juga menimpa user asli (dashboard kosong sesaat tiap login).
>
> **Fix**: ganti ke `placeholderData: []` — menampilkan `[]` sementara fetch asli tetap jalan saat mount.

Ditemukan justru karena verifikasi pakai render asli, bukan mockup. Lihat [[Data Layer]].

### 🐞 Seed demo tak lengkap
Awalnya seed hanya mengisi customers/inventory/services, sehingga Supplier/Keuangan/Tugas/Absensi ter-render **kosong** saat screenshot. Seed diperluas mengisi semua koleksi (PO beragam status, income/expense, sales, absensi, tugas).

### 🐞 Sidebar collapsed tak bisa di-expand
Tombol expand di-`display:none` saat collapsed. **Fix**: header bertumpuk vertikal, chevron tetap terlihat. Verifikasi: **264 → 76 → 264 px**.

### 🐞 Menu drawer mobile tak bisa diklik (kritis)
> [!bug] Akar masalah
> Overlay peredup punya `z-index` lebih tinggi dari sidebar, jadi menutupi drawer dan **menelan setiap tap** → drawer tertutup sebelum menu terpilih.
>
> **Fix**: naikkan `z-index` drawer terbuka ke atas overlay. Verifikasi: tap menu → navigasi ke `/inventory` (dark & light).

Lihat [[Sidebar - Live Diagnostic Rail]].

### 🐞 Teks dashboard hilang di light theme + data ganda
> [!bug] Akar masalah
> Strip `BENCH STATUS` dipaksa background gelap **hardcode** (`#0b0d11`), tapi teksnya pakai token **semantic** (`--text-primary`) yang membalik jadi gelap di light theme → teks gelap di atas latar gelap = tak terbaca. Strip ini juga cuma **mengulang** angka yang sudah ada di tile/kartu (Profit, Target, Operasional).
>
> **Fix**: ganti strip jadi **console header** (info non-tile: tanggal, teknisi hadir, jam live) + **hero readout** laba bersih. Layar hero sengaja tetap gelap di kedua tema, jadi semua warna teksnya **nilai tetap / scale token cerah**, bukan token semantic yang membalik. Laba Bersih dikeluarkan dari grid tile agar tak kembar.

Bonus: nominal tile dulu terpotong (`nowrap` + `ellipsis`) → diganti `clamp()` + `word-break` agar Rupiah tampil penuh. Lihat [[Signature Pages]].

### 🐞 Nama ikon tak terdaftar diam-diam jadi tanda-tanya
> [!bug] Akar masalah
> Registry `Icon` mem-fallback nama tak dikenal ke glyph `Question` **tanpa error**. Akibatnya `shield-halved` (tombol Klaim Garansi) sudah lama tampil sebagai tanda-tanya tanpa ketahuan, dan ikon baru `sliders`/`text-height` berisiko sama.
>
> **Fix**: daftarkan ketiganya (ShieldCheck, SlidersHorizontal, TextAa) di registry. Pelajaran: tiap nama ikon baru **wajib** ditambahkan ke `Icon.tsx`; fallback diam menyembunyikan ikon hilang. Lihat [[Iconography]].

### 🐞 Audit responsif mobile (390px): tumpukan teks & grid sempit
> [!bug] Akar masalah
> Pada viewport mobile (target 390×844) beberapa layout dibuat untuk desktop dan tidak menyusut dengan baik: (1) subtitle halaman di Topbar menumpuk di belakang kolom pencarian global, (2) input pencarian global merebut ruang judul, (3) grid inventori (Parts Bin) memaksa 2 kolom sehingga badge kategori terpotong (mis. `"SPAREP..."`) dan nominal HPP/harga jual sesak, (4) modal/dialog boros ruang vertikal saat keyboard sentuh aktif.
>
> **Fix** (semua via media query, token-only):
> - `Topbar.module.css`: sembunyikan `.subtitle` di `< 768px` + perkecil `.title`.
> - `GlobalSearch.module.css`: transisi `width` + input compact (`100px`/`80px`) yang melebar saat `:focus` di `< 640px` & `< 400px`.
> - `InventoryPage.module.css`: `.binGrid` jadi 1 kolom (`1fr`) di `< 520px`.
> - `Modal.module.css`: di `< 520px` kurangi padding overlay/body/header/footer & set `max-height: 96vh`.

Verifikasi: 12 screenshot mobile diregenerasi via `scripts/shoot-mobile.mjs` (viewport 390×844, dark). Lihat [[Conventions]] & [[Signature Pages]].

---

## Pelajaran utama

> [!tip]
> **Verifikasi dengan render asli, bukan mockup.** Hampir semua bug di atas hanya ketahuan karena UI difoto dengan data nyata via Playwright + cek fungsional (bukan sekadar asumsi "kelihatannya benar").

> [!warning] Jangan campur warna hardcode dengan token semantic
> Background **hardcode** (mis. `#0b0d11`) + teks **token semantic** (`--text-primary`, yang membalik per tema) = resep teks hilang di salah satu tema. Pilih salah satu konsisten: kalau permukaan sengaja gelap di kedua tema, warna teksnya juga harus **nilai tetap / scale token cerah**. Lihat [[Conventions]].

#decision #bugfix
