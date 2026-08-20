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

### Profit per servis + modal dadakan (11 Jun 2026)
Dari umpan balik 3 toko pilot. Empat kendala diselesaikan sekaligus; keputusan kunci:
- **Tanpa migrasi DB.** Modal dadakan dititipkan di array JSONB `Service.spareparts` yang sudah ada (baris `kind:'manual'`, `itemId:null`) alih-alih kolom baru. Alasan: pilot pakai DB produksi nyata → hindari `ALTER TABLE` berisiko di staging+produksi; iterasi cepat. Bukan keputusan permanen — bisa migrasi belakangan. Baris lama tanpa `kind` terbaca `'inventory'` (backward-compatible).
- **Perlakuan cashflow berbeda (anti dobel-hitung).** Sparepart inventory hanya memotong stok (modal sudah keluar saat beli stok) → **tak** buat Expense. Modal dadakan = kas benar-benar keluar → **buat** Expense + potong wallet. Menggabung keduanya = kas overstated atau profit salah. Pilihan ini muncul dari diskusi panjang dengan user: "masuk Keuangan tapi tak pengaruh cashflow" ditolak karena tak konsisten secara akuntansi.
- **Wallet A1 + ingat terakhir.** Daripada memaksa pilih wallet tiap transaksi (friksi) atau setting global (kena caveat per-perangkat localStorage), dropdown default ke wallet terakhir dipakai (`getLastExpenseWallet`/`setLastExpenseWallet`), fallback wallet pertama, bisa diganti per transaksi. Mayoritas beli-dadakan pakai kas Tunai → default hampir selalu benar.
- **Reversibilitas.** `expenseId` & `walletId` disimpan di baris manual agar hapus baris bisa membalik Expense + refund wallet (atomik). Sparepart inventory yang sudah `deducted` mengembalikan stok saat dihapus.
- **Profit owner-only.** Kolom Modal/Profit di tabel + panel BIAYA detail hanya `role === 'owner'` (admin & karyawan tak lihat margin). Profit di tabel hanya saat `finalCost > 0`.
- Verifikasi: build + **292 test** (288 → +4: profit dengan baris manual, deduct skip manual, `serviceModalTotal`, finalCost=0) + lint hijau. Render alur via `scripts/shoot-modal-profit.mjs` (lewat `/demo`).

### Refund DP parsial, transfer wallet, kategori, warna nama (13 Jun 2026)
Empat fitur dari umpan balik pilot, satu batch (migrasi `0031`). Keputusan kunci:
- **Refund DP = model EXPENSE, bukan hapus-income.** Saat batal servis ber-DP, owner pilih nominal refund. Income `'DP servis <no>'` **dipertahankan** (uang memang pernah masuk → audit utuh); bagian refund dicatat sebagai expense `'Refund DP servis <no>'` (kategori `'Lainnya'`) + kurangi wallet. Sisa yang ditahan toko (mis. biaya diagnosa) otomatis jadi pendapatan bersih. Model lama (`0029`) selalu refund penuh + hapus income → tak bisa parsial & merusak jejak audit. `cancel_service` di-recreate; test Tier 3B di-update (refund parsial + refund 0).
- **Transfer wallet TIDAK membuat income/expense.** Transfer antar kas bukan untung/rugi → kalau dicatat sebagai income+expense akan menggelembungkan kedua sisi laporan. RPC `transfer_wallet` hanya menggeser saldo (manager-only, atomik, `for update`), dicatat di Activity Log (`wallet.transfer`). Fungsi murni `transfer()` di `finance.ts` sudah ada + bertest → dipakai ulang untuk path lokal.
- **Kategori perangkat tetap localStorage (bukan cloud).** ~~Konsisten pola `getCategories`/`setCategories` di `orgConfig`; caveat per-perangkat diterima.~~ **DIBALIK 14 Jun 2026** — caveat ini terbukti jadi bug nyata (kategori dibuat di desktop tak muncul di HP). Dipindah ke cloud (`organizations.settings` jsonb, `0032`). Lihat entri "Perbaikan 2 bug smoke test" di bawah.
- **Warna nama pelanggan via token.** `var(--brand)` + semibold di tabel & kartu mobile, beda jelas dari nama teknisi (redup + ikon obeng). Tanpa hardcode hex → otomatis benar dark/light.
- Verifikasi: build + lint + **321 unit** hijau, **52 integration** hijau. `0031` **applied staging + PRODUKSI** (13 Jun 2026); frontend gabungan (0031 + ketahanan realtime) ter-deploy ke produksi via Vercel (`staging`→`main`, commit `064dc26`).

### Ketahanan realtime: adopsi selektif, bukan smart-merge (13 Jun 2026)
Dipicu studi banding dengan FixNova (varian yang pakai sinkronisasi merge-klien). Keputusan kunci:
- **Adopsi celahnya, bukan arsitekturnya.** FixNova menutup "channel mati senyap setelah sleep/wifi putus" dengan paket berat: smart-merge `id`+`_modifiedAt`, tombstone hapus, echo-suppression, retry-queue offline. FixMaster **menolak** semua itu — sumber kebenaran adalah **server** (RPC atomik + RLS), bukan klien. Merge-klien akan menduplikasi logika otoritas server & berisiko *resurrection* data. Yang **diambil** hanya 4 hal yang murni soal koneksi: deteksi putus, auto-reconnect, resync penuh, indikator status.
- **Resync pakai refetch, bukan rekonsiliasi.** Saat channel pulih (`offline → live`), adapter memanggil `notifyAll()` (refetch SEMUA koleksi via TanStack Query) — bukan menambal store dari payload. Konsisten dengan strategi `notifyDebounced` (`0021`): server selalu menang, anti-drift, tak ada cabang merge yang harus dites.
- **Logika timing dipisah jadi murni & teruji.** `computeBackoff`/`withJitter`/`isHealthDue` ditaruh di `src/lib/business/realtime-timing.ts` (15 unit test, tanpa DOM/Supabase) — pola "logika domain murni di `lib/business`". `subscribe-org-tables` tinggal merangkai timer. Health-check membedakan channel *zombie* (tak `joined` + idle) dari channel sehat-tapi-sepi (jangan di-teardown).
- **Dua lapis jaring, sengaja redundan.** Channel-level (reconnect + health-check di `supabase-client.ts`) menutup kasus channel rusak; query-level (`refetchOnReconnect: 'always'` di `App.tsx`, dengar event `online` browser) menutup kasus jaringan pulih tapi channel telat. Keduanya murah & saling tutup celah "data basi setelah bangun tidur".
- **Status visual wajib otentik bench.** Badge Topbar = LED + readout mono (`LIVE`/`SYNC…`/`OFFLINE`), bukan komponen toast/spinner generik. Cloud-only (`active`) → mode lokal/demo tetap bersih. Pelajaran [[Design System]] dihormati.
- Verifikasi: build + lint + **336 unit** hijau (321 + 15 `realtime-timing`). Badge difoto via `scripts/shoot-sync-badge.mjs` (hook DEV `window.__realtime`) di 3 state. Detail teknis di [[Data Layer]] §Ketahanan realtime.

### Perbaikan 2 bug smoke test: reset password & kategori lintas-device (14 Jun 2026)
Dua bug ditemukan saat smoke test produksi. Keduanya **bukan masalah layout** melainkan konfigurasi/arsitektur data. Keputusan kunci:
- **Reset password: kirim `redirectTo` eksplisit + layar recovery sendiri.** Akar masalah: `resetPasswordForEmail(email)` tanpa `redirectTo` → Supabase pakai **Site URL** default project (`localhost`), dan tak ada layar untuk menyetel password baru. Perbaikan: `redirectTo = "${origin}/reset-password"` (ikut origin pemanggil — prod/preview/lokal), helper baru `authUpdatePassword` (`auth.updateUser`), dan `ResetPasswordPage` di **route publik** `/reset-password` (di luar AuthGate) yang mem-parse sesi recovery (event `PASSWORD_RECOVERY`/`SIGNED_IN`, fallback `getSession`, timeout 2.5s → tautan kedaluwarsa). **Catatan ops:** redirect hanya berfungsi bila origin produksi ada di **allow-list dashboard Supabase** (Authentication → URL Configuration) — ini aksi manual user, di luar kode.
- **Kategori perangkat pindah ke cloud (membalik keputusan 13 Jun).** localStorage per-browser membuat kategori desktop tak muncul di HP. Solusi: kolom **`organizations.settings` jsonb** (`0032`, extensible — config org lain bisa menyusul tanpa migrasi baru). `getCategories` baca `org.settings.deviceCategories` (fallback localStorage lama), `setCategories` tulis via `repository.setSingleton('organization')` lalu `useSessionStore.setState({ org })` **langsung** (bukan `setOrg()` yang me-reset scope outlet). `seedCategoriesFromLocal()` mengangkat daftar lokal lama ke cloud **sekali** saat owner buka Settings & cloud masih kosong. UI kategori + filter servis **reaktif** (subscribe slice `org`). Edit kategori **manager-only** (RLS UPDATE organizations existing — tanpa perubahan RLS).
  - > [!CAUTION]
  > **Bug lanjutan (diperbaiki 14 Jun, commit `96c0601`).** Klaim awal "update lintas-device via realtime tanpa reload" **SALAH**: baris `organizations` adalah **singleton** yang dimuat **sekali saat boot** dan **tak ada** di subscription realtime klien (`REALTIME_TABLES` hanya 15 tabel domain). Jadi kategori dari desktop hanya muncul di mobile setelah **reload**, bukan live. Perbaikan klien (tanpa migrasi DB): (1) `subscribeOrgTables` kini subscribe `organizations` dengan filter **`id=eq.<org>`** (bukan `org_id` — filter kolom salah = nol event); (2) adapter punya `refreshOrganization()` yang me-refetch singleton ke session store pada event `organizations` **dan** saat resync reconnect. `organizations` sudah di publication realtime sejak `0012`, jadi cukup perubahan sisi-klien. **Pelajaran**: untuk data singleton (bukan koleksi TanStack), "reaktif di store" ≠ "ter-refetch saat berubah di device lain" — keduanya harus diwiringkan terpisah.
- **Kenapa `settings` jsonb, bukan kolom `device_categories text[]`.** Template keluhan/kelengkapan & default garansi punya bug per-device yang sama; `settings` jsonb extensible menampungnya nanti **tanpa migrasi baru**. Scope rilis ini sengaja **hanya kategori**.
- Verifikasi: build + lint + **344 unit** hijau (336 + 8 `orgConfig`). `0032` **applied staging + PRODUKSI** (14 Jun 2026); frontend ter-deploy via Vercel (`staging`→`main`, commit `81d8756`). **Belum diverifikasi manual di produksi** (butuh konfigurasi dashboard + uji 2-device).

### Satu email = satu toko (16 Jun 2026)
Ditemukan saat smoke test: email yang sama bisa diundang di banyak toko tanpa peringatan ("user already registered" hanya muncul saat pendaftaran akun, bukan saat undang). Keputusan kunci:
- **Blokir total (pilihan user).** Satu email hanya boleh tergabung/diundang di SATU toko. Alternatif (izinkan multi-toko dengan pemilih toko, atau cuma warning) ditolak — arsitektur app saat ini **satu-user-satu-toko** (`getMyMembership` ambil `limit(1)` membership aktif), jadi multi-membership memilih toko **non-deterministik** = bug laten. Blokir total menutup itu dengan lingkup paling kecil.
- **Enforcement via RPC, bukan unique constraint global.** `pending_invites` unik per-`(org_id, email)` saja; klien `inviteMember` dulu `upsert` langsung tanpa cek lintas-toko (RLS memang menyembunyikan data toko lain dari klien). Solusi: RPC `create_invite` (security definer) yang bisa membaca `auth.users` + `memberships` **semua org** → tolak bila email sudah **anggota aktif** atau punya **undangan tertunda** di org lain. Constraint unik global **tak dipakai** karena data lama (mis. `bangun@gmail.com` di 2 toko saat test) akan membuat migrasi gagal apply.
- **Guard defense-in-depth di `claim_invite`.** Walau `create_invite` mencegah undangan baru lintas-toko, data lama bisa menyisakan undangan ganda. Saat klaim, bila user sudah anggota aktif di org berbeda → tolak (jangan diam-diam buat membership aktif kedua). Re-invite di toko sendiri tetap boleh (upsert reset `created_at`).
- **Email "seakan dari FixMaster" = aksi user, di luar kode.** Pertanyaan pengirim email Supabase dijawab: butuh **custom SMTP** + **email templates** di dashboard Supabase (Authentication → Emails). Juga wajib untuk produksi (pengirim default Supabase rate-limited ~3-4/jam). Tidak ada perubahan kode.
- Verifikasi: build + lint + **344 unit** + **56 integration** hijau (4 Tier 3C baru). `0033` **applied staging + PRODUKSI** (16 Jun 2026); frontend ter-deploy via Vercel (`staging`→`main`, commit `45a3586`).

### Kategori perangkat hilang di org baru — regresi dari 0032 (16 Jun 2026)
Temuan smoke test: kategori perangkat **tidak muncul** di form servis baru maupun di Pengaturan, padahal default diatur saat pendaftaran. Akar masalah = regresi yang **diperkenalkan oleh 0032 sendiri**:
- `0032` memindahkan sumber kebenaran kategori dari localStorage per-device ke kolom cloud `org.settings.deviceCategories`, **tapi wizard onboarding tidak ikut diubah** — `commitWizardCloud` (dan `commitWizard` lokal) masih menulis kategori ke `localStorage` (`fixmaster-categories-<org>`). Akibatnya setiap org baru punya kategori cloud **kosong** (`settings = '{}'` dari RPC `create_organization`); default pendaftaran hanya nyangkut di localStorage browser saat daftar, tak pernah sampai cloud → hilang di device lain & di mana pun `getCategories` membaca cloud.
- Diperparah: `getCategories()` tak punya **default** apa pun → cloud kosong = dropdown benar-benar kosong.
- **Pelajaran**: saat memindah satu sumber kebenaran (localStorage→cloud), **semua penulis** harus ikut dimigrasikan, bukan cuma pembaca. Wizard adalah penulis pertama (saat org lahir) dan paling mudah terlewat.
- Perbaikan (frontend-only, tanpa migrasi): (1) `commitWizard` + `commitWizardCloud` menulis `data.categories` ke `org.settings.deviceCategories` (via `setSingleton('organization')` di jalur cloud) — sinkron lintas-device sejak org lahir; (2) `getCategories()` fallback ke konstanta baru **`DEFAULT_DEVICE_CATEGORIES`** (`['Laptop','HP / Smartphone','Printer','PC / Komputer']`, cermin daftar awal wizard) saat cloud & local kosong → menyelamatkan org lama yang terlanjur kosong **tanpa setup ulang**. List kosong diperlakukan "belum dikonfigurasi".
- Verifikasi: build + lint + **345 unit** hijau (+1 test default fallback). Frontend ter-deploy via Vercel (`staging`→`main`, commit `0c96e6d`).

### Status pengambilan barang + UX karyawan "Update Status" (16 Jun 2026)
Dua perubahan dari smoke test (frontend-only, **tanpa migrasi** — `picked_up`/`picked_up_at` sudah ada sejak `0006`, adapter map camel↔snake otomatis).
- **Fitur pengambilan.** Konter sering punya unit yang sudah jadi/lunas/batal tapi **belum diambil** pelanggan. Ditambah helper murni **`isAwaitingPickup(service)`** (`!pickedUp` & status `selesai`/`lunas`/`batal`) sebagai **satu sumber kebenaran**, dipakai bersama halaman Servis & alert dashboard. Di `/services`: filter Pengambilan (semua/belum/sudah), stat card "Menunggu Diambil", indikator visual bench (LED warning + readout mono di tabel & kartu), dan **aksi cepat "Tandai Diambil"**. Aksi pengambilan (di daftar **dan** detail) kini **khusus owner/admin** (sebelumnya semua role) — karyawan tetap melihat indikator. `dashboard.ts` diselaraskan ke `isAwaitingPickup` (dulu hanya hitung `status==='selesai'`, abaikan `pickedUp`).
- **Pilihan**: "menunggu diambil" mencakup **selesai + lunas + batal** (unit batal pun harus kembali ke pelanggan). Unit yang masih proses **tidak** dianggap menunggu diambil (agar indikator tak berisik).
- **UX karyawan.** Pada unit `selesai`, karyawan tak bisa ubah status (pelunasan owner/admin) → "Update Status" malah membuka form DP (aman tapi menyesatkan). Perbaikan tanpa ubah aturan: (1) catatan kontekstual di StatusModal saat `staffDpOnly` (karyawan, tak ada transisi diizinkan, DP masih boleh); (2) tombol action bar relabel jadi **"Terima DP"** saat `onlyDp`. **Pelajaran**: gating yang benar tetap butuh label yang jujur — keamanan ≠ kejelasan.
- Verifikasi: build + lint + **346 unit** hijau (+`isAwaitingPickup`, +dashboard exclude-collected). Frontend ter-deploy via Vercel (`staging`→`main`, commit `31663e8`).

### Flash empty-state pasca-login di daftar Servis (19 Jun 2026)
- **Gejala (lapor user)**: setelah login ulang, daftar/inputan servis kadang **telat muncul** — awalnya tampak kosong (\"Belum ada servis\") lalu tiba-tiba terisi.
- **Akar masalah**: `ServicesPage` hanya bercabang pada `rows.length === 0`, **mengabaikan flag `loading`** yang sudah disediakan `useCollection`. Saat fetch cloud pasca-login berjalan, `placeholderData: []` membuat list tampak kosong → empty-state tampil sesaat sebelum data nyata datang.
- **Perbaikan (frontend-only)**: tambah cabang **loading** (spinner mono \"Memuat servis…\" via util global `.spin`) sebelum empty-state, mengikuti pola yang sudah benar di `ActivityLogPage`. Commit `aa906ff`.
- **Catatan sistemik (utang teknis)**: pola \"abaikan `loading`\" ini **masih ada** di halaman daftar lain — Pelanggan, Inventori, Supplier, Tugas, POS — yang juga hanya cek `length === 0`. Hanya **Servis** yang sudah diperbaiki (yang dilaporkan). Sisanya rentan flash serupa; kandidat perbaikan menyeluruh berikutnya (ekstrak pola `loading → empty → data`).

### Urutan Buku Kas: DP terbaru tak tampil paling atas (19 Jun 2026)
- **Gejala (lapor user)**: income DP tercatat benar, tapi di Keuangan → Buku Kas **tidak muncul di paling atas** history.
- **Akar masalah**: `FinancePage` mengurut ledger `by date desc` lalu **tiebreaker `id` (UUID acak)**. Untuk transaksi di **tanggal yang sama**, urutan jadi acak — DP yang baru dicatat nyempil di tengah, bukan di atas. Field `date` hanya tanggal (tanpa jam), jadi tak bisa membedakan urutan dalam satu hari.
- **Perbaikan (frontend-only)**: ganti tiebreaker ke **`record.createdAt`** (kolom `created_at timestamptz default now()` di semua tabel sejak 0001 → terisi waktu insert sebenarnya, termasuk dari RPC `record_down_payment` yang tak set kolom itu eksplisit). Commit `afe7371`.
- **Pelajaran**: jangan pakai UUID acak sebagai tiebreaker urutan kronologis — selalu pakai `createdAt`. Pola ini perlu dicek di daftar lain yang juga mengurut per-tanggal.

### Cetak Nota di action bar tiket servis (19 Jun 2026)
- **Permintaan user**: Cetak Nota hanya tersedia di modal **Notifikasi & nota** (NotifyModal), perlu juga di **menu tiket** (detail servis).
- **Temuan**: `ServiceDetailPage` sebenarnya sudah me-render `<NotifyModal>` tapi **tak pernah dibuka** — `setNotifyOpen(true)` tak dipanggil di mana pun (komponen mati/dead). Logika cetak juga terkunci lokal di NotifyModal.
- **Perbaikan**: ekstrak logika cetak ke helper bersama **`printServiceReceipt(service, org)`** (`src/features/services/printReceipt.ts`), dipakai NotifyModal **dan** tombol baru **"Cetak Nota"** di action bar detail tiket. Format nota identik (satu sumber). Tombol tampil bila `org` tersedia. Guard demo tetap. Commit `fb5f743`.
- **Pelajaran**: cek komponen "ter-render tapi tak terpicu" — NotifyModal di detail adalah dead-end sampai temuan ini. Aksi cetak kini langsung (tanpa buka modal).


> [!CAUTION]
> **Pelajaran tooling screenshot (5 kali gagal).** Skrip `shoot-*.mjs` yang pakai `window.__fixmasterSeed()` **GAGAL** di sini karena dev server lokal jalan di **mode cloud** (`.env.local` → Supabase staging) — seed lokal (`repository.clearAll()` + wizard commit) melempar error. **Solusi**: pakai rute **`/demo`** (memaksa mode demo terlepas dari env) + navigasi via **klik link sidebar** (`getByRole('link', {name:/Servis|Pengaturan/})`), JANGAN `page.goto()` ke rute app (reload SPA → buang state demo). Pakai **context baru per shot**. Pola ini ada di `scripts/shoot-4feat.mjs`. Shot modal multi-langkah (refund DP) tetap rapuh karena overlay → andalkan integration test untuk logikanya.


### Bug: pesan WhatsApp "Rp 0" sampai refresh (11 Jun 2026)
- **Gejala**: setelah set biaya final lalu buka NotifyModal "Selesai"/"Konfirmasi", template `{biaya}` tampil **Rp 0**; baru benar setelah refresh halaman.
- **Akar sebab**: NotifyModal me-regenerate pesan hanya saat kunci memo `service.id + templateKey` berubah. `finalCost` tak ada di kunci → saat biaya berubah tapi id/template sama, pesan **tak** di-generate ulang (pakai snapshot lama).
- **Perbaikan**: kunci memo jadi `${id}|${templateKey}|${finalCost}|${updatedAt}` → pesan ikut diperbarui saat biaya berubah, tanpa refresh. Tanpa migrasi.

### Bug + UX: 5 temuan pilot (tracking, topbar, login, tema) (11 Jun 2026)
Lima temuan dari toko pilot, dikerjakan satu sesi. Tanpa migrasi DB.
- **#2 (BUG nyata) — tracking gagal di device/browser lain.** `TrackingPage` membaca via `repository.list('services')` yang tunduk RLS (`services_select` = `is_org_member`) → pengunjung **anonim** (pelanggan) selalu dapat "tidak ditemukan"; hanya jalan di device pemilik yang sudah login. **Akar sebab**: jalur baca publik salah — harusnya pakai RPC `track_service` (security-definer, grant `anon`) yang **sudah ada** sejak `0003`/`0015` tapi tak pernah dipakai klien. **Perbaikan**: helper `trackService()` di `supabase-client.ts`; `TrackingPage` cloud → RPC, lokal/dev → `repository.list` (dipilih `isSupabaseConfigured`). Throttle klien dipertahankan. Pelajaran: RPC keamanan yang dibuat tapi tak di-wire = bug laten — uji halaman publik dalam sesi **anonim**, bukan hanya sebagai pemilik.
- **#1 — tak ada feedback saat "Salin tracking".** Dulu `onClick` menembak `navigator.clipboard?.writeText` tanpa toast/penanganan gagal. **Perbaikan**: handler `copyTrackingLink` async → `toast.success`/`toast.error`, plus fallback `execCommand('copy')` untuk konteks non-secure (HTTP LAN).
- **#3 — topbar mobile sempit (judul "Servis" terpotong "Se").** `GlobalSearch` tetap memakan lebar di layar kecil. **Perbaikan**: di ≤640px search menciut jadi ikon (tap → mengembang overlay), judul dapat ruang. Blok `.search` usang di `Topbar.module.css` dihapus. Landing: anchor nav (`.navLink`) disembunyikan di mobile, sisakan logo + tema + MASUK.
- **#4 — kembali ke beranda dari login kurang jelas.** Tombol "Kembali ke Beranda" dulu di dasar daftar link (perlu scroll). **Perbaikan**: dinaikkan ke `terminalTop` sebagai tombol ber-ikon "Beranda" yang selalu terlihat.
- **#5 — toggle tema di landing + login.** Store tema (`stores/theme.ts`) sudah global; cukup pasang kontrol sun/moon di `topRail` landing & `terminalTop` auth (idiom bench, bukan toggle SaaS generik).
- Verifikasi: build + **293 test** + lint hijau. Render via `scripts/shoot-pilot-fixes.mjs` (landing/auth dark+light, topbar mobile) + `shoot-pilot-toast.mjs` (toast salin, dikonfirmasi `toast visible: true`).

### Edit modal dadakan (rekomendasi lanjutan) (11 Jun 2026)
Permintaan user: "apakah modal dadakan yang telah diinput bisa diedit? dan apakah hasil editannya berdampak terhadap integrasi menu lainnya?". Jawaban: ya, bisa diedit, dan editannya **konsisten** menyentuh Keuangan + wallet. Tanpa migrasi DB.
- **Keputusan integritas kas.** Edit baris manual harus menjaga kas tetap benar: bukan sekadar mengganti angka di baris. Helper murni `walletDeltasForModalEdit(oldWalletId, oldAmount, newWalletId, newAmount)` mengembalikan **delta per wallet** (refund debit lama + terapkan debit baru), di-net agar edit di wallet sama menghasilkan satu delta (mis. 100k→150k = −50k) dan no-op = nol tulisan. Diuji 4 kasus di `services.test.ts`. Alasan dipisah ke `lib/business`: logika uang harus murni & testable (Conventions), bukan tersebar di handler UI.
- **Expense terkait disinkronkan, `expenseId` dipertahankan.** Saat edit, Expense yang sama di-`put` ulang (nominal/wallet/keterangan baru, `createdAt`/`date` lama dijaga) alih-alih hapus-buat-baru → jejak audit kontinu. Baris lama tanpa `expenseId` (bila ada) ditangani dengan membuat satu.
- **Verb audit baru `expense.update`** ditambah ke `ActivityAction` + `ACTION_META` (label "Ubah pengeluaran", ikon pen). Edit dicatat dengan `meta.prevAmount` untuk jejak.
- **UI**: tombol pensil (hover brand) hanya di baris `kind:'manual'`; membuka kembali form inline yang sama, pra-isi, tombol berubah jadi "Perbarui Modal". `editIndex` state membedakan mode tambah vs edit; `closeModalForm` membersihkan state.
- **Dampak ke menu lain** (jawaban eksplisit untuk user): Keuangan (Expense ter-update), saldo Wallet (ter-net), Profit unit & kolom Modal (ikut karena `sparepartCost` baca `costPrice` baris), Activity Log (`expense.update`). Struk/tracking tak terpengaruh (modal tak tampil ke pelanggan).
- Verifikasi: build + **297 test** (293 → +4 netting) + lint hijau. Render alur via `scripts/shoot-modal-edit.mjs` (tambah → form pra-isi → perbarui), dikonfirmasi `revised row visible: true`.

### Input DP (#3) & koreksi biaya final pasca-lunas (#1) (11 Jun 2026)
Dua rekomendasi yang menyentuh **semantik akuntansi**; user memilih "ikuti saran" (default rekomendasi). Tanpa migrasi DB (`downPayment` & `spareparts` JSONB sudah ada).
- **DP = kas masuk nyata (bukan catatan).** `acceptDownPayment` membuat Income kategori `Servis` + kredit wallet, lalu mengakumulasi `downPayment`. Alasan: pemilik toko ingin DP langsung tampak di saldo & laporan, bukan angka pajangan. Mendukung beberapa kali DP (cicilan).
- **Bug laten ditemukan & diperbaiki saat ini juga.** Jalur pelunasan lama memakai `outstandingBalance(updatedService) || cost`. Setelah DP jadi nyata, bila DP menutup tagihan → `outstanding` = 0 → `0 || cost` mencatat **seluruh biaya lagi** (dobel hitung). Diganti `settlementAmount(final, DP)` = `max(0, final − DP)`, dan income pelunasan hanya ditulis bila `> 0`. Pelajaran: menambah fitur uang sering membongkar asumsi lama — telusuri seluruh jalur kas, jangan hanya tempat baru.
- **Deskripsi income kanonik.** Income DP & pelunasan dibuat lewat builder `dpIncomeDescription`/`settlementIncomeDescription` (bukan string literal). Sebab koreksi & refund **mencocokkan** baris income via `serviceId` + deskripsi; literal tersebar akan memutus pencocokan tanpa error.
- **Refund DP saat batal.** `batal` me-reverse semua income DP tertaut (debit wallet, hapus income) dan menol-kan `downPayment`. Reversibilitas = aturan inti user (jaga integritas wallet).
- **Koreksi biaya final pasca-lunas tanpa void (owner+admin).** `correctFinalCost` menulis ulang income pelunasan ke `settlementAmount` baru (hapus bila jadi 0; buat bila dulu tertutup DP) + sesuaikan wallet sebesar `settlementCorrectionDelta`. Pilihan **edit in-place** (bukan buka-kembali tiket lunas→selesai) dipilih agar state machine tetap rigid; jejak di history internal + Activity Log (`meta.correctFinalCost`). Guard `newFinal >= downPayment`.
- **Pemisahan logika.** Semua aritmetika uang murni di `lib/business/services.ts` (`settlementAmount`, `settlementCorrectionDelta`, builder deskripsi), UI hanya orkestrasi I/O. 5 unit test baru.
- Verifikasi: lint + **302 test** (297 → +5) + build hijau. Render alur via `scripts/shoot-dp-correction.mjs`: `DP row visible: true`, `corrected final cost visible: true`.

### Sentralisasi input servis ke StatusModal + fix wallet pelunasan (11 Jun 2026)
User: "pelunasan DP di update status lunas masih rancu, gatau lewat wallet apa; semua input di tiket servis pindahkan ke update status; tiket servis hanya menampilkan hasil input." Keputusan setelah klarifikasi: **Q1 ya** (wallet picker pelunasan), **Q2 ya** (DP + koreksi pindah ke StatusModal), **Q3=A** (BOM tetap di detail), **Q4 tetap** (edit data tiket di detail).
- **Bug nyata: wallet pelunasan hard-coded.** Jalur `lunas` lama memakai `const wallet = wallets[0]` untuk income + kredit saldo — tidak ada pilihan, jadi salah kas untuk toko multi-wallet (Cash/BCA/QRIS). Diganti dropdown **"Wallet penerima pembayaran"** (default `getLastExpenseWallet`, simpan via `setLastExpenseWallet`). Inilah inti keluhan "lewat wallet apa".
- **StatusModal jadi hub input** dengan tab sub-aksi (`Ubah Status` / `Terima DP` / `Koreksi Biaya`) yang muncul kontekstual: status tersedia bila ada transisi, DP bila `!isTerminal`, koreksi bila `lunas` & owner/admin. Logika DP & koreksi dipindah utuh dari `ServiceDetailPage` (handler + form + state dihapus di sana).
- **Pengecualian BOM (Q3=A) — keputusan sadar.** Pengelolaan sparepart/modal dadakan **tetap** di halaman detail karena **iteratif**: teknisi menambah/menghapus part berkali-kali selama `pengerjaan`, bukan satu momen transisi. Memaksanya ke modal status akan butuh "mode kelola" terpisah & transisi palsu. Detail jadi read-only untuk **angka finansial** saja; BOM + edit data tiket (Q4) tetap.
- **Entry koreksi saat lunas.** Karena tiket `lunas` itu terminal (tombol "Update Status" disembunyikan), ditambah tombol **Koreksi Biaya** khusus (owner/admin) yang membuka StatusModal langsung di mode koreksi (`initialMode`). Modal auto-pilih mode pertama yang tersedia bila `initialMode` tak berlaku.
- **Tanpa migrasi DB.** Murni refactor UI + pemindahan handler; semantik akuntansi & helper `services.ts` tak berubah.
- Verifikasi: lint + **302 test** + build hijau. Render via `scripts/shoot-status-hub.mjs`: `detail inline DP button: 0 | inline KoreksiFinal button: 0`, `DP recorded (detail shows DP row): true` — membuktikan input finansial sudah pindah dari detail ke hub. (Probe lanjutan untuk screenshot wallet-picker/koreksi sempat flaky karena port dev 5173 dipakai instance lama; alur sudah ter-cover type-check + probe utama.)

### Split payment di pelunasan + klarifikasi waktu pengurangan stok/kas (11 Jun 2026)
User: "buat di status lunas bisa split payment" + tanya kapan stok/kas BOM berkurang.
- **Split payment.** Editor pembayaran di `lunas`: daftar leg `{wallet, nominal}`, tambah/hapus wallet, ringkasan terbayar/sisa. Satu **Income per leg** + kredit wallet masing-masing. Default satu leg penuh (kasus umum tetap satu klik). Use-case nyata: pelanggan bayar Cash sebagian + transfer/QRIS sisanya.
- **Aritmetika murni & teruji dulu.** Helper baru `splitTotal`, `normalizeSplits`, `validateSplit` di `services.ts` (+4 test → **306**). UI hanya orkestrasi I/O; validasi total = sisa tagihan lewat `validateSplit` (cegah kurang/lebih bayar). Sesuai aturan domain: uang = fungsi murni testable.
- **Koreksi jadi reverse-all + rebook.** Karena split bisa menghasilkan **beberapa** baris income pelunasan, logika koreksi lama (cari 1 baris + delta via `settlementCorrectionDelta`) jadi tak cukup. Diganti: reverse semua baris pelunasan tertaut (refund tiap wallet + hapus) lalu rebook sisa baru sebagai satu baris. Lebih sederhana & idempoten; `settlementCorrectionDelta` tetap ada untuk util/test.
- **Klarifikasi waktu pengurangan** (⚠️ **di-supersede entri berikutnya** — sebelumnya inventory dipotong saat `pengerjaan`/deferred; modal dadakan selalu seketika). Lihat entri di bawah.
- Verifikasi: lint + **306 test** + build hijau. Probe screenshot split (`scripts/shoot-split.mjs`) flaky karena instance dev lama menahan port 5173 (server baru jatuh ke 5174) — UI ter-cover type-check + unit test; screenshot bisa diregen di sesi dengan port bersih.

### Immediate stock deduction saat sparepart ditambah (Opsi C + pengaman) (11 Jun 2026)
User memilih **C dengan pengaman** atas pertanyaan "bagaimana jika sparepart stok pemicu seketika saat baris ditambah?". Mengubah model deferred sebelumnya.
- **Stok dipotong di `addSparepartLine`**, bukan saat `pengerjaan`. Alasan user: ingin angka stok akurat real-time begitu part dikomit ke tiket.
- **Pengaman 1 — guard otoritatif.** `addSparepartLine` **re-read** item dari repo (bukan state cache picker) dan **tolak** bila `stock < qty` (toast). Mencegah stok hantu / mentok-0 diam-diam (`Math.max(0, …)` lama).
- **Pengaman 2 — restore saat batal.** Helper murni baru `computeStockRestore(spareparts)` mengembalikan stok semua baris inventory ber-`deducted` & membalik flag (anti dobel-restore). Diwajibkan karena dengan potong-saat-tambah, tiket yang dibatalkan **harus** mengembalikan part ke rak — kalau tidak, stok bocor. Blok `batal` di `StatusModal` dikonsolidasi: restore stok **dan** refund DP lalu **satu** kali tulis `services` (cegah dua tulis saling menimpa field `spareparts`/`downPayment`).
- **Anti dobel-potong.** Baris baru disimpan `deducted:true`, jadi `computeStockDeduction` (pemicu `pengerjaan`) kini **fallback legacy** — hanya menyentuh baris `deducted:false` lama. Tak ada migrasi.
- **Konsekuensi yang diterima:** menambah part di fase quoting (`diagnosa`/`konfirmasi`) atau `tunggu` langsung memotong stok; bila batal, stok dikembalikan. Hapus baris juga sudah mengembalikan stok (handler lama). Trade-off ini eksplisit dipilih user demi akurasi real-time.
- **"Tunggu Sparepart" tetap valid (dikonfirmasi user, bukan bug).** Untuk part yang masih **indent/dalam perjalanan**, part itu belum di stok → belum ditambahkan sebagai baris (guard otoritatif menolak bila stok < qty). Jadi tiket cukup berstatus `tunggu` selama menunggu **tanpa** menyentuh stok; baris baru ditambahkan (memotong stok) setelah barang tiba. Tidak perlu jenis baris "dipesan" terpisah.
- Verifikasi: lint + build + **309 test** (306 → +3 `computeStockRestore`). Toast ganda picker dibersihkan (feedback kini milik `addSparepartLine`, mencerminkan hasil nyata termasuk penolakan stok).



### Demo interaktif: live-binding repository + iframe, bukan app terpisah
Tujuan: pengunjung **memakai FixMaster asli** sebelum daftar (bukan video/mockup). Keputusan kunci & alasannya:
- **Tukar `repository` saat runtime (live-binding)** alih-alih membangun app demo terpisah. `src/data/index.ts` mengekspor `repository` mutable; `installRepository(new InMemoryAdapter())` mengalihkan **seluruh** app ke RAM tanpa menyentuh kode fitur. Ini menjaga demo **selalu = produk asli** (tak ada drift), biaya pemeliharaan ~0.
- **`InMemoryAdapter` (RAM-only)** — nol jejak disk, tak menyentuh IndexedDB asli pengunjung, hilang saat tab ditutup. Mencerminkan `LocalAdapter` agar perilaku identik.
- **Pakai ulang seed yang sudah ada** (`src/dev/seed.ts`) lewat opsi `commitWizard({forceLocal})` — bukan menulis seed baru. Di produksi wizard menulis ke cloud RPC; `forceLocal` memaksa jalur lokal agar seed menulis ke adapter in-memory (pengunjung anonim tak punya akun cloud). Hemat waktu & konsisten dengan dev.
- **Reuse `appChildRoutes`** di `MemoryRouter` demo → menu & halaman persis sama dengan app asli.
- **Nested-router trap**: `MemoryRouter` tak boleh bersarang di `BrowserRouter` (React Router melempar error). Solusi final: **intersep `/demo` di level `App`** sebelum `RouterProvider` mount, dan **hapus** route `/demo` dari `router.tsx`. Satu jalur melayani kunjungan langsung **dan** link dari landing (poster + tombol layar penuh).
- **Aksi sensitif dijinakkan, bukan disembunyikan** (`demoGuard()`): keluar, reset/hapus akun, backup/restore, kirim WhatsApp, cetak nota → toast + ajakan daftar. Pengunjung tetap melihat tombolnya (terasa app penuh) tanpa risiko keluar-app/destruktif.
- **`noindex`** disuntik selama demo mounted (sandbox, bukan konten SEO). Landing meng-link ke route layar penuh `/demo` (poster + tombol) — **bukan** iframe (lihat keputusan 11 Jun di bawah).
- Verifikasi: build + **280 test** (272 → +8 paritas InMemoryAdapter) + lint hijau; render `/demo` dark/light/mobile difoto via `scripts/shoot-demo.mjs`. Detail di [[Signature Pages]] & [[Data Layer]].

### Demo iframe dihapus — "refused to connect" di produksi (11 Jun 2026)
- **Gejala**: di produksi Vercel, poster "Coba Langsung" memuat iframe `/demo` tapi browser menolak → **"getfixmaster.vercel.app refused to connect"**. Lokal aman (header `vercel.json` tak aktif di dev).
- **Akar sebab**: [vercel.json](vercel.json) menyetel `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` (anti-clickjacking) — ini melarang **semua** framing, termasuk same-origin, jadi halaman tak bisa meng-embed `/demo` miliknya sendiri.
- **Keputusan**: **hapus iframe sepenuhnya**. Poster "Coba Langsung" + tombol "Buka Demo Layar Penuh" kini sama-sama **meng-link** (`<a href="/demo">`, navigasi penuh) ke rute demo. Lebih sederhana, lebih cepat, dan **menghapus seluruh kelas masalah framing/CSP**. Header `vercel.json` dikembalikan ke setelan **paling ketat** (`DENY` / `frame-ancestors 'none'`) karena tak ada lagi yang perlu di-frame.
- **Dihapus**: state `demoLive` + cabang `<iframe>` di `LandingPage.tsx`, CSS `.demoFrame`. Verifikasi: build + lint hijau.

### Perbaikan kelemahan landing + fondasi SEO (11 Jun 2026)
Setelah kritik jujur, 7 kelemahan landing diperbaiki **tetap dalam bahasa "Precision Electronics Bench"** (bukan pola SaaS generik), plus fondasi SEO untuk SPA CSR.
- **Demo box kosong (regresi pasca-iframe)** → akar masalah: bingkai instrumen 600px kehilangan isi saat iframe dihapus, menyisakan kotak kosong yang ironis. **Solusi**: poster `/demo` kini **berlatar screenshot dashboard produk asli** (theme-aware `demo-dashboard-dark/light.png` di `public/screenshots/`) + **scrim radial** token agar judul/tombol play tetap terbaca. Sekaligus memamerkan produk nyata sebelum klik.
- **Tanpa bukti sosial** → ditambah **strip jaminan** berisi 4 **fakta produk terverifikasi** (data terisolasi, offline-first, backup, tanpa kontrak). **Bukan testimoni/angka karangan** — konsisten dengan pagar kejujuran (idiom "?" di matriks).
- **Monoton** → `sectionAlt` (panel `bg-base`) berselang dengan `bg-app` memecah pola pelat-sekrup seragam.
- **LED berlebih** → stamp `OK` di rack-unit kini teks mono polos (LED hanya pada status bermakna).
- **CTA tak konsisten** → label trial disatukan jadi **"Mulai Gratis 14 Hari"**.
- **SEO** (landing CSR di `AuthGate`, jadi crawler perlu HTML statis): tambah `public/robots.txt` (disallow `/demo`+`/track`), `public/sitemap.xml`, dan di `index.html`: title/description berbasis keyword, canonical+og:url, **JSON-LD** (`SoftwareApplication`+offers, `Organization`, `WebSite`, `FAQPage`), serta **`<noscript>`** berisi H1+fitur agar ada konten nyata tanpa JS.
- **Verifikasi**: build ✓ (2.09s) + **288 test** ✓ + lint ✓; render landing dark/light/mobile via `scripts/shoot-landing.mjs`. Detail di [[Signature Pages]].

### Tim per-outlet (Level 2) + wallet Hybrid + rollout Expand-Contract (`0023`–`0028`, 12 Jun 2026)
Multi-outlet diperluas dari sekadar **filter tampilan** (Level 1) menjadi **penguncian akses per-karyawan** + laporan per-cabang. Keputusan kunci & alasannya:
- **Expand → Contract, bukan satu migrasi besar.** Mengetatkan RLS langsung di produksi berisiko **lockout**: karyawan tanpa penugasan outlet kehilangan akses seketika. Maka dipecah: `0023`–`0026` (Expand, aman) menambah struktur + data + backfill **semua anggota→semua outlet** + jamin outlet utama; `0027` (jaring pengaman) menugaskan otomatis karyawan yang masih 0 penugasan; `0028` (Contract) baru mengetatkan RLS **setelah** owner menetapkan outlet tiap karyawan. `0028` sudah **applied di staging + PRODUKSI** (12 Jun 2026, via `db push`; diverifikasi Tier 3). (Nomor file = urutan eksekusi; beberapa kali di-rename agar urut: `0026` ensure_primary_outlet, `0027` heal_unassigned_outlets, `0028` rls_outlet_scope.)
- **Wallet Hybrid (nullable `outlet_id`), pilihan user.** Daripada memaksa semua kas jadi per-cabang (memecah rekonsiliasi kas bersama) atau semua bersama (bocor antar-cabang), `wallets.outlet_id` boleh `null` (Bersama) **atau** berisi ID (khusus cabang). Saat scope cabang aktif: tampil kas bersama + kas cabang itu. Ini keputusan `/goal Hybrid` dari owner.
- **Stok & pelanggan tetap org-wide.** Scope awal sengaja **tidak** memecah inventori/pelanggan per-cabang (kompleksitas transfer-stok belum dibutuhkan di tahap pilot). Hanya transaksi + wallet yang sadar-outlet.
- **Bug laten ketahuan & diperbaiki.** Level 2 (karyawan jadi kasir) memaksa temuan: tulis `wallets`/`inventory` langsung dari klien = **manager-only** sejak RLS `0010`/`0017`. Artinya kasir-karyawan **tak pernah bisa** menuntaskan POS/pelunasan di cloud. Solusi: sambungkan ke RPC `process_sale`/`settle_service` (security-definer, bypass RLS dengan aman + atomik) yang memang **diniatkan** sebagai jalur tulis sejak `0017`. POS/StatusModal kini dual-path (cloud=RPC, lokal=tulis langsung).
- **Wajib pilih cabang (OQ-C).** User multi-cabang pada scope "Semua Outlet" **diblokir** bertransaksi sampai memilih satu cabang (`mustPickOutlet`) — mencegah transaksi salah-stempel. Karyawan satu-cabang otomatis (`resolveCreateOutlet`).
- **Integrasi Pengaturan → Tim.** Penugasan outlet ditaruh di alur tim yang sudah ada: chip multi-select saat undang (`pending_invites.outlet_ids` → diisi `claim_invite`) + editor per-anggota (`set_member_outlets` RPC). Konsisten dengan "kelola tim di satu tempat".
- **Verifikasi**: build ✓ + **300 test** ✓ (288 → +12 resolusi outlet) + lint ✓. Detail di [[Data Layer]] & [[Signature Pages]].
- **Follow-up uji staging (12 Jun 2026)**: integration test (`test:integration`) hijau (36 test) setelah `0023`–`0025` di staging. Tiga temuan owner saat assign tim: (1) org pilot nol outlet → harus tambah toko manual, dan `0023` jadi no-op (transaksi lama tak ter-atribusi). **Fix**: migrasi **`0026`** menjamin outlet utama otomatis + re-backfill. (2) Penugasan outlet hanya untuk peran `karyawan`. (3) Admin tak ada opsi outlet → **dikonfirmasi sengaja (Model A dipilih owner)**: admin = manager, menembus semua cabang; UI kini menampilkan badge **"Semua cabang"** agar eksplisit, bukan tombol kosong.

### Rekonsiliasi split-payment × RLS outlet — settle/cancel via RPC (`0029`, 12 Jun 2026)
Dua aliran kerja bertabrakan di produksi: **Level 2 (RLS `0028`)** dan batch **split-payment + cancel/refund-DP** (sudah live di `main` via go-live terjadwal). Keduanya menulis ulang `StatusModal` settle/cancel dengan cara berbeda. Keputusan & temuan:
- **Regresi laten terdeteksi sebelum sempat menggigit.** Frontend split-payment menulis **langsung** ke `wallets`/`incomes`/`inventory` (`repository.put`). Setelah `0028`, tulisan itu **manager-only** → kasir-karyawan akan **terblokir** melunasi (split) & membatalkan servis di cloud. Pola identik bug POS/settle yang sudah diperbaiki via RPC — kini meluas ke split & cancel.
- **Solusi: pindahkan SEMUA jalur tulis billing ke RPC** (filosofi `0017`/`0025`). `0029`: (A) `settle_service` di-recreate single-wallet → **`p_payments` (array leg)**, mendukung split server-side; (B) **RPC baru `cancel_service`** (restore stok + refund DP + status batal, atomik). POS sudah lewat `process_sale` (yang **sudah** terima `p_payments`), jadi tak perlu diubah.
- **Bug pencocokan income diperbaiki.** `settle_service` di `0025` menulis deskripsi `'Pelunasan servis'` (tanpa nomor), padahal koreksi final-cost mencocokkan `'Pelunasan servis <no>'`. `0029` menyamakannya jadi ber-nomor → koreksi tetap cocok.
- **Merge dengan konflik 3 file** (`StatusModal`, `supabase-client`, `AGENTS`) diselesaikan: cloud=RPC, lokal=tulis langsung (dual-path dipertahankan). Branch `feat/outlet-level2` → merge ke `staging`.
- **Verifikasi**: build ✓ + **321 unit** ✓ + **45 integration** ✓ (+3 Tier 3B: split-settle 2 wallet, tolak outlet lain, cancel restore+refund) + lint ✓. `0029` **applied staging + PRODUKSI** (12 Jun 2026); frontend gabungan ter-deploy ke produksi via Vercel (`staging`→`main`).

### DP via RPC — jalur billing terakhir (`0030`, 12 Jun 2026)
Lapor user: ubah status ke **diagnosa**, lalu update lagi → muncul input DP, ditekan **Simpan DP** → toast "Gagal menyimpan DP". Akar masalah & fix:
- **Bug kelas yang sama dengan `0029`, satu jalur terlewat.** `applyDp` di `StatusModal` masih `repository.put` langsung ke `incomes` + `wallets` + `services`. Setelah `0028` (live di produksi), tulis wallet/income = **manager-only** → kasir-karyawan gagal. (Bonus bug: insert income klien membawa field `deletedAt` yang **tak ada** sebagai kolom server.)
- **Fix: RPC `record_down_payment`** (`0030`) — atomik, security-definer; insert income `'DP servis <no>'` (cocok dgn refund `cancel_service`), kredit wallet, akumulasi `down_payment` (dukung cicilan). `applyDp` jadi dual-path (cloud=RPC, lokal=tulis langsung). Kini **SEMUA** jalur billing (POS/lunas/batal/DP) lewat RPC.
- **Verifikasi**: build ✓ + **321 unit** ✓ + **47 integration** ✓ (+2 Tier 3B: DP sukses utk outlet sendiri, ditolak utk outlet lain) + lint ✓. `0030` **applied staging + PRODUKSI** (12 Jun 2026); frontend ter-deploy ke produksi via Vercel (`staging`→`main`). Kini SEMUA jalur billing (POS/lunas/batal/DP) lewat RPC di produksi.

### Karyawan mentok di `diagnosa` & dipaksa DP — matriks peran kontradiktif (12 Jun 2026)
Lapor user: karyawan hanya bisa sampai status **diagnosa**, lalu modal **memaksa input DP** (tak bisa lanjut tanpa DP). Akar masalah & fix:
- **Kontradiksi gating peran.** `RESTRICTED_FOR_STAFF` memblokir `['konfirmasi','lunas','batal']`. Tapi dari `diagnosa`, satu-satunya transisi maju (state machine) = `konfirmasi`/`batal` — **dua-duanya terblokir** untuk karyawan. Maka `allowed=[]` di [StatusModal](src/features/services/StatusModal.tsx) → tab **"Ubah Status" hilang** → satu-satunya mode tersisa `canDp` → modal jatuh ke **layar DP saja**. Karyawan tak pernah bisa memajukan tiket, padahal matriks **mengizinkan** `pengerjaan`/`selesai` (gerbang menuju ke sana justru diblok — mustahil sesuai workflow).
- **Fix**: keluarkan `konfirmasi` dari daftar terlarang → `RESTRICTED_FOR_STAFF = ['lunas','batal']`. Karyawan kini menguasai **pipeline kerja penuh** (`diagnosa→konfirmasi→pengerjaan→selesai`); hanya aksi **uang** (`lunas`) & **destruktif** (`batal`) yang owner/admin-only. DP tetap opsional (sub-aksi terpisah, bukan paksaan).
- **Pelajaran**: gating peran harus konsisten dengan state machine — memblokir status antara yang merupakan **satu-satunya gerbang** ke status yang diizinkan = dead-end senyap. Murni client-side (tak ada migrasi).
- **Verifikasi**: build ✓ + **321 unit** ✓ (test `role gates` disesuaikan: staff boleh `konfirmasi`) + lint ✓.

### Restore cloud: RPC server transaksional, untuk semua owner (`0020`)
Restore cloud dibuka kembali agar **setiap owner** bisa memulihkan data org-nya sendiri (pelanggan: pemulihan saat kendala; akun demo: refresh isi). Keputusan kunci & alasannya:
- **RPC `security definer` satu transaksi**, bukan `clearAll + putMany` dari browser. Loop klien tidak atomik → kalau putus di tengah, data separuh terhapus. Fungsi Postgres = rollback penuh saat gagal.
- **Aman untuk semua org tanpa gate `is_demo`**, karena proteksi inti tetap: **owner-only** di server + **`org_id` dipaksa server** (abaikan isi file) → owner hanya bisa menimpa **org-nya sendiri**; mustahil lintas-tenant. (`is_demo` tinggal penanda informatif.)
- **Kecualikan `memberships` + `organizations` (profil & billing)**: `memberships.user_id` FK ke `auth.users`; menulis ulang bisa mengunci owner keluar. Mengecualikan billing menjaga **langganan tak ter-reset** tiap restore. FK ke memberships di-NULL saat insert (nama tetap tampil via kolom `*_name`).
- **Risiko sisa** (owner menimpa data baru dengan backup lama) inheren pada "restore" — dimitigasi `ConfirmDialog` berbahaya + saran "backup dulu".
- **Data demo kumulatif**: `scripts/make-demo-backup.mjs` menghasilkan file backup yang **bertumbuh tiap hari** (hari-1→hari ini, deterministik per-hari). Dijalankan tiap hari lalu di-restore. Realtime sinkronisasi data domain direncanakan **terpisah** (`implementation_plan_realtime.md`).
- **Konsekuensi jujur**: menu Tim hanya menampilkan akun login asli (bukan nama dummy dari file). Solusinya buat beberapa akun karyawan sekali manual. Lihat [[Data Layer]].

### Bug fix: "Reset Seluruh Data" menyesatkan di cloud
**Gejala**: tombol "Reset Seluruh Data" memanggil `resetWorkspace()` → `repository.clearAll()`. Di cloud `clearAll()` sengaja **no-op** (keamanan multi-tenant), jadi reset hanya membersihkan state lokal & melempar ke wizard, **tanpa menghapus data di server** — padahal teksnya berjanji "menghapus seluruh data". Menyesatkan.
**Perbaikan**: di cloud, `resetWorkspace()` kini memanggil RPC `restore_org_data(orgId, {})` (payload kosong) → benar-benar mengosongkan SELURUH data operasional secara atomik & owner-only, sambil **mempertahankan** tim/langganan/profil org (akun tetap login, workspace kosong, TIDAK kembali ke wizard). Teks dialog & catatan Zona Berbahaya dibuat **per-mode** agar jujur. Mode lokal tak berubah (wipe penuh + wizard).

### Keputusan: tier `free` TIDAK ditawarkan (model trial→bayar)
**Konteks**: `plans.ts` sempat punya `PlanDef` untuk tier `free` (Rp 0; fitur Servis/Pelanggan/POS), dan `free` ada di union `PlanType` serta enum Postgres `plan_type`. Tapi **tidak ada org yang pernah di-assign `free`**: `create_organization` (`0003`) selalu memberi `'trial'` (14 hari), dan default kolom juga `'trial'`. Setelah trial+grace habis, `is_org_active` mengembalikan `false` — tak ada jalur auto-downgrade ke `free`. Jadi `free` adalah tier "yatim" yang menyesatkan (mis. di kajian harga sempat disebut sebagai "free tier permanen" → keliru).
**Keputusan**: FixMaster memakai model **trial → bayar** (sama seperti FixNova & FixMate). Tier `free` **dibuang dari config**: dihapus dari `PLANS` ([plans.ts](src/config/plans.ts)) dan dari union `PlanType` ([types.ts](src/data/types.ts)). Nilai enum `'free'` **dibiarkan di Postgres** (tak ada migrasi berisiko) — hanya tak lagi dipakai di app. Test `plans.test.ts` yang mengandalkan `free` diganti jadi uji batas fitur Solo vs Pro. (Struktur tier berbayar terbaru: lihat keputusan **Restrukturisasi tier Solo/Pro** di bawah.)


### Restrukturisasi tier berbayar: Solo vs Pro (diversifikasi fitur + per-outlet)
**Konteks**: dua tier berbayar dibedakan agar Solo "gatal" upgrade ke Pro. Pemicu terkuat di niche reparasi = **rekrut karyawan pertama** (butuh multi-user) dan **buka cabang ke-2** (multi-outlet). Maka kunci yang "tumbuh seiring bisnis", bukan core loop.

**Matriks final** ([plans.ts](src/config/plans.ts)):
- **Solo** (`standard`, Rp 99rb): core ops saja — `services, customers, pos, inventory, finance, reports`. `maxUsers: 1`, `maxWallets: 2`, `maxOutlets: 1`. **Single-user** = pemicu upgrade utama.
- **Pro** (`enterprise`, Rp 149rb): semua fitur + `maxUsers: -1`, `maxWallets: 99`, `maxOutlets: -1` (unlimited). 2 outlet termasuk; ekstra **+Rp50rb/outlet**, **mentok Rp 299rb** lalu unlimited.
- Eksklusif Pro (terkunci di Solo): **suppliers, attendance, tasks, multiOutlet, exportImport, logo, waTemplates**.

**Keputusan teknis**:
- **`maxUsers` kini DITEGAKKAN.** Sebelumnya cuma config kosmetik (tak ada guard). Ditambah helper `withinUserQuota(plan, n)` di `plans.ts`, dipanggil di `SettingsPage` TeamTab: undang anggota diblok bila `seatsUsed+1` lewat kuota (anggota aktif + undangan pending dihitung), dengan notice upgrade. RPC server tetap batas sebenarnya (belum di-enforce server-side — TODO bila perlu ketat).
- **`maxOutlets: -1` = unlimited.** `withinOutletQuota` kini memperlakukan `-1` sebagai tak terbatas. `outletTierFor(n)` kini selalu mengembalikan `enterprise` untuk jumlah besar (bukan `null`).
- **Per-outlet pricing**: helper murni `priceForOutlets(n)` + konstanta `PRO_BASE_PRICE/PRO_INCLUDED_OUTLETS/OUTLET_ADDON_PRICE/PRO_PRICE_CEILING`. Diuji di `plans.test.ts`.
- **Nav "show-locked"** ([Sidebar.tsx](src/components/layout/Sidebar.tsx)): item fitur yang dikunci tak lagi *disembunyikan* — tampil redup + badge **"Pro"** + tautan ke `/settings` (memunculkan "itch"). Role-gating (`managerOnly`/`ownerOnly`) tetap *disembunyikan* karena mencerminkan RLS server.
- Verifikasi: build + **272 test** + lint hijau.

**Strategi 3-brand (decoy, Jalur A)**: FixNova adalah produk milik tim sendiri yang diposisikan sebagai **decoy peer-tinggi** — tampil seolah developer independen (tanpa funnel/cross-link ke FixMaster). Ladder fitur di tier tertinggi: **FixMate < FixNova < FixMaster**. FixNova sengaja TIDAK punya fitur tanda-tangan FixMaster (Supplier+PO, Tugas Internal, Activity Log). Pesaing riil hanya **FixMate** (terverifikasi **khusus HP** dari copy resminya; FixNova & FixMaster mencakup semua gadget/elektronik). Syarat legal: tiap klaim faktual tiap brand harus benar — klaim fiktif (statistik/testimoni) di FixNova wajib dibersihkan. FixNova ada di **repo terpisah** (bukan workspace ini). Detail di artifact `implementation_plan.md` + `perbandingan_harga_kompetitor.md`.

### Revisi total landing page + guardrail strategi (9 Jun 2026)
**Konteks**: landing ([LandingPage.tsx](src/features/landing/LandingPage.tsx)) di-revisi total dari hasil komparasi 3-brand. Tujuan ganda: (a) **perbaiki klaim basi** yang jadi bug faktual; (b) **angkat elemen konversi** yang kuat dari kompetitor tanpa merusak keaslian.

**Bug faktual diperbaiki** (klaim wajib jujur demi strategi multi-brand):
- Spec Solo dulu mengklaim "Tugas, absensi, laporan" & "Karyawan tak terbatas" → **salah** (kini Solo = core ops + `maxUsers:1`). Diganti: 1 pengguna · 1 outlet · 2 dompet.
- Spec Pro merender literal **"s/d -1 cabang"** (karena `maxOutlets:-1`) → diganti "outlet tak terbatas" + info add-on per-outlet.

**Elemen diadopsi dari kompetitor (pola, BUKAN visual)**:
- Dari FixNova: **fault panel** (pain points), **viewport preview** interaktif, **framing harga harian**, **FAQ**. Semua diterjemahkan ke bahasa "Precision Electronics Bench" (spine, LED, mono, sekrup) — bukan tiru gradient/glow mereka.
- Dari FixMate: **kejelasan target** → diubah jadi keunggulan **cakupan** (chips HP/Laptop/Tablet/Printer/Konsol/Elektronik), bukan menyempit ke 1 jenis.

> [!important] Guardrail strategi (REVISI 10 Jun 2026 — menggantikan pagar "tanpa komparasi")
> Keputusan awal "landing tanpa tabel komparasi" **dibalik** atas arahan owner. Landing FixMaster **kini memuat matriks banding bernama** (FixMaster vs FixNova vs FixMate) — disadari ini justru **mekanisme inti decoy**: efek halo hanya bekerja bila pembeli melihat ketiganya berdampingan (lih. `implementation_plan.md`). Pagar pengganti yang ketat:
> 1. **Tiap sel faktual benar.** Sel kompetitor yang belum terkonfirmasi = **"?" amber**, bukan tebakan ya/tidak (hindari false advertising).
> 2. **Hanya baris FixMaster unggul/imbang.** Keunggulan eksklusif kompetitor (mis. CRM FixMate) **tidak ditampilkan** — bukan komparasi netral, tapi "alasan pilih FixMaster".
> 3. **Nada faktual, bukan menjatuhkan.** Klaim diri ("FixMaster punya X") aman; hindari klaim negatif eksplisit soal rival.
> 4. **FixMaster ≠ FixNova mirror.** Beda penekanan/kata/struktur agar dua landing tak terbaca satu tim. FixNova boleh banding FixMate saja (tak sebut FixMaster) — asimetri ini natural.
> 5. **Disclaimer bertanggal** ("per Jun 2026, fitur kompetitor dapat berubah") di bawah matriks.
>
> Klaim fiktif (statistik/testimoni palsu) tetap dilarang di semua brand.

**Social proof**: sengaja **tidak** memalsukan angka (50+ bisnis dst) — justru hal yang harus dibersihkan FixNova. Trust dibangun lewat sinyal jujur (data terisolasi/RLS, backup, realtime). Verifikasi: build + **272 test** + lint hijau; render dark/light/mobile difoto via `scripts/shoot-landing.mjs`. Detail visual di [[Signature Pages]].

### ErrorBoundary dua level (anti layar putih)
Crash render React tanpa boundary = **layar putih kosong** tanpa pemulihan — tampak tidak profesional untuk produk berbayar. Solusi: komponen class [`ErrorBoundary`](src/components/ErrorBoundary.tsx) dipasang di **dua level**:
- **Root** (`App.tsx`, prop `root`) — jaring terakhir full-screen dengan aksi "Muat Ulang Aplikasi".
- **Rute** (`AppLayout`, bungkus `<Suspense><Outlet/>`) — crash satu halaman tetap menyisakan sidebar/topbar bisa dipakai. Pakai `resetKey={location.pathname}` → **auto-pulih saat pindah halaman** (via `componentDidUpdate`), plus tombol "Coba Lagi".

Catatan: error boundary hanya menangkap error saat **render/lifecycle**, bukan di event handler/async (itu lewat toast). `componentDidCatch` jadi **satu-satunya seam** untuk memasang error tracker (mis. Sentry) nanti. Detail error hanya tampil di `import.meta.env.DEV`. Fallback pakai token (selaras `NotFoundPage`). Test pertama berbasis `@testing-library/react` di repo (4 test: render normal, fallback, varian root, auto-reset). Lihat [[Signature Pages]].

![[error-dark.png]]

### Sidebar arah B + active-as-channel
Dari beberapa opsi (Control Panel, Live Diagnostic Rail, Rack Unit, Boot Sequence), dipilih **Live Diagnostic Rail** karena unik *dan* fungsional — readout memakai data nyata. Tanpa grup bersekat. Lihat [[Sidebar - Live Diagnostic Rail]].

### Ikon terpusat
Migrasi ke Phosphor lewat satu komponen `Icon` agar penggantian set ikon = ubah satu file. Lihat [[Iconography]].

### Role hardening 0016 — RLS sebagai batas nyata, bukan UI
Kajian akses menemukan komentar skema "fix #3: role jadi batas keamanan" baru **benar untuk WRITE**, tapi ada dua celah READ/eskalasi yang hanya tertutup UI (bisa di-bypass via API PostgREST):
1. **Baca keuangan bocor** — `incomes_select`/`expenses_select` dulu `is_org_member`, jadi karyawan bisa menarik omzet/pengeluaran lewat API meski UI menyembunyikannya. Kini `is_org_manager`.
2. **Admin = owner** — `is_org_manager` menyamakan keduanya. Admin bisa promote dirinya jadi owner (`set_member_role`), ubah `plan_type`, atau `UPDATE organizations` langsung. Migrasi `0016` menambah helper **`is_org_owner`** + memisahkan kuasa.

Keputusan kunci:
- **Penegak = server (RLS/RPC), UI cuma cermin.** Tiap pembatasan dibuat di DB dulu (policy/trigger/RPC guard), lalu UI (`isManager`/`isOwner`, `navigation.managerOnly`, `ManagerRoute`, Dashboard) hanya menyembunyikan kontrol yang pasti gagal. Pelajaran: jangan pernah andalkan UI untuk kerahasiaan data.
- **Guard ganda (RPC + policy).** RPC `security definer` melewati RLS, jadi guard owner ditaruh **di RPC** (`set_member_role`/`deactivate_member`) **dan** di policy `mbr_manage` (untuk jalur PostgREST langsung). Dua pintu, dua kunci.
- **Kunci `plan_type` via trigger + flag transaksi.** Trigger `guard_plan_type_change` mencegah perubahan `plan_type` lewat `UPDATE` langsung. Penting: klien menyimpan profil usaha dengan meng-`UPDATE` **seluruh** baris `organizations`, jadi `plan_type` di payload bisa **basi** (mis. setelah webhook memperpanjang paket tapi cache klien belum segar). Karena itu trigger **meng-coerce** (`new.plan_type := old.plan_type`) untuk pemanggil non-billing alih-alih `raise` — kalau di-reject, edit profil/logo yang sah ikut terblokir (false-positive yang sempat lolos di review pertama, ditemukan saat audit). Jalur sah `apply_payment` menandai `set_config('fixmaster.bypass_plan_lock','1',true)` (transaksi-lokal), dan `service_role` (webhook) juga lolos.
- **Expand-only.** Tak ada DROP kolom/tabel → aman untuk sesi user berjalan; diuji di `fixmaster-staging` dulu sebelum produksi.

Perubahan perilaku yang disengaja: **karyawan tak lagi melihat keuangan apa pun**; **admin kehilangan billing + kelola-owner** (jadi owner-only). Matriks lengkap di [[Data Layer]]. Sub-peran kasir/teknisi (separation of duties) masih **P2** (belum dikerjakan); pengetatan absensi-diri/inventori-harga/hard-delete sudah selesai di `0017` (lihat di bawah).

### Role hardening P1 (migration `0017`) — integritas tulis operasional
Lanjutan dari `0016`. Sementara `0016` menutup celah **kerahasiaan** (baca keuangan) & **kepemilikan** (owner≠admin), `0017` menutup celah **integritas** yang masih `is_org_member`:
- **Inventori tulis → manager-only.** Kunci kunci-nya: perubahan stok yang sah (POS, terima barang) lewat RPC `security definer` (`process_sale`/`receive_goods`) yang **bypass RLS**, jadi mengunci tabel `inventory_items` ke `is_org_manager` **tidak** memutus operasional — hanya editor item manual (harga modal/jual, tambah/hapus) yang ikut terkunci. Diverifikasi dengan membaca jalur tulis dulu sebelum menulis policy (pelajaran: jangan kunci tabel tanpa memetakan semua penulisnya).
- **Absensi self-only.** Helper baru `is_self_membership(member_id, org)` — sengaja menyertakan `org` agar membership sendiri tak bisa dipakai menulis lintas-org. Member hanya boleh insert/update baris dengan `employee_id` miliknya; manager bebas; DELETE manager-only. Geofence `clock_in` (RPC) tak tersentuh.
- **Hard-delete → manager-only.** Policy gabungan `*_write` (`for all`) dipecah jadi insert/update (`is_org_member`) + delete (`is_org_manager`) pada `customers`/`services`/`sales`/`task_instances`. App memang pakai soft-delete/void; penghapusan permanen jadi aksi manager.
- Semua tetap mempertahankan gerbang `is_org_active()` (0010). Expand-only, idempotent, diuji di `fixmaster-staging` dulu. Cermin UI: tombol tambah/edit/hapus inventori + tombol hapus pelanggan & tugas-cepat disembunyikan dari karyawan.

### Koreksi transaksi (migration `0018`) — void penjualan + edit absensi
Menutup gap "recovery from error" yang ditemukan saat audit ketersediaan fitur edit per menu: POS & Absensi sebelumnya tak punya jalur koreksi in-app.
- **Void, bukan delete, untuk penjualan.** Penjualan adalah transaksi finansial → membatalkannya harus membalik stok + saldo + pemasukan secara atomik, dan menyisakan jejak audit. Karena itu RPC `void_sale` (manager-only, `security definer`) menandai `voided=true` alih-alih menghapus baris. Lebih aman daripada "edit" yang bisa meninggalkan saldo tak konsisten.
- **Tautan `incomes.sale_id`.** Tanpa ini, pembalikan finansial harus cocok-teks deskripsi (rapuh). Kolom FK baru membuat reversal deterministik; ada fallback deskripsi untuk sale lama/RPC yang belum punya `sale_id` (sale_no unik per org → deskripsi efektif unik).
- **Absensi: UI-only.** Tidak menambah RLS — `0017` sudah memberi manager hak update/delete attendance. Edit menghitung ulang `totalHours` dari jam masuk/keluar.
- **Pre-existing yang terungkap:** checkout POS menulis `sales`/`inventory`/`incomes`/`wallets` langsung via repository (bukan RPC `process_sale`). Karena `incomes`/`wallets` manager-only sejak `0002`, di cloud praktis **hanya manager yang bisa checkout**. Dicatat sebagai utang teknis; void dibuat manager-only agar konsisten dengan kenyataan itu.

### Laporan owner-only + Log Aktivitas (migration `0019`)
Permintaan owner: (1) batasi menu Laporan ke owner saja, (2) buat menu log aktivitas tiap peran khusus owner.
- **Laporan jadi owner-only (sebelumnya manager).** Sebelumnya `reports.view` dimiliki admin juga + nav `managerOnly`. Sekarang nav pakai flag baru `ownerOnly` (difilter `isOwner`), rute dibungkus `OwnerRoute` (bukan `ManagerRoute`), dan `reports.view` dicabut dari matriks admin (owner tetap lewat wildcard `*`). Defense-in-depth UI; tetap perlu RLS server bila laporan kelak dibangun atas tabel sensitif.
- **Pola tiga lapis ditiru dari role hardening:** nav (sembunyikan) → route guard (redirect) → server. `OwnerRoute` cermin `ManagerRoute` tapi pakai `isOwner`.
- **Log Aktivitas = tabel audit append-only, bukan view turunan.** Dipilih tabel `activity_logs` eksplisit (lihat Data Layer 0019) ketimbang merekonstruksi aktivitas dari tabel lain: lebih murah dibaca, menyimpan konteks (`meta`), dan tahan walau baris sumber dihapus (`entity_id` string, bukan FK). 
- **INSERT semua member, SELECT owner-only, tanpa update/delete.** Setiap peran wajib bisa *menulis* jejaknya, tapi hanya owner *membaca*. Tanpa update/delete agar log tak bisa dipalsukan dari klien — penting untuk fungsi "mengawasi karyawan".
- **Logging fire-and-forget.** `logActivity()` tidak di-await dan menelan error. Alasan: audit bersifat *best-effort* — kegagalan menulis log **tak boleh** menggagalkan transaksi/penjualan. Server RLS tetap batas integritas sebenarnya.
- **Kenapa instrumentasi di UI handler, bukan di adapter `put`?** Agar verb bermakna domain (`sale.void`, `service.status`) dengan label entitas yang ramah, bukan "put incomes" generik. Login dicatat di `PinLogin` (bukan di store) untuk menghindari import siklik store↔helper.

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
- **Enum `plan_type` Postgres TIDAK di-rename.** Nilainya tetap `('free','standard','enterprise','trial','suspended')` karena `PLANS` di `plans.ts` adalah `Record<PlanType, PlanDef>` dan ada org existing di staging. Mengganti enum = migrasi data berisiko demi kosmetik. Jadi hanya **label tampilan** yang berubah (standard→"Solo", enterprise→"Pro"), plus kuota & harga. (Lihat keputusan **Restrukturisasi tier Solo/Pro** untuk struktur & harga terbaru.)
- **Harga per-organisasi, tier by jumlah outlet.** User TIDAK lagi unlimited di semua tier: **Solo `maxUsers:1`** (pemicu upgrade), **Pro `maxUsers:-1`**. Helper `withinOutletQuota`, `withinUserQuota`, `outletTierFor`, `priceForOutlets`, `PAID_TIERS`.
- **Reminder H-3, grace 3 hari, lalu expired** — logika murni di `src/lib/business/billing.ts` (`subscriptionPhase`: active/reminder/grace/expired; `canWrite`; `isOrgActive`) + 13 test. Dicerminkan server-side oleh fungsi `is_org_active` (RPC `0009`).
- **Provider di-abstraksi.** Kolom `provider`/`provider_ref`/`qris_url` di `invoices`. **Gateway aktif = Fersaku** (Edge Functions `create-invoice` + `fersaku-webhook`). UI `BillingTab` coba gateway dulu (buka checkout di tab baru), dan **fallback** ke tombol "Saya sudah bayar" (mock confirm) bila fungsi belum di-deploy, jadi alur tetap bisa diuji. Mayar dipakai sebelumnya tapi ditinggalkan (lihat catatan di bawah). Detail di catatan integrasi Fersaku di bawah.

Catatan enforcement (Fase 1B lanjutan, migration `0010`): **write-blocking server-side saat langganan kedaluwarsa kini aktif**. Akar masalah: input (mis. pemasukan) menulis langsung ke tabel via adapter, dan RLS `*_write` policy cuma cek `is_org_member`/`is_org_manager` — tak pernah cek `is_org_active`. Jadi Postgres tetap mengizinkan tulis walau plan lewat grace. Fix: migration `0010_billing_enforcement.sql` membuat ulang **semua** `*_write` policy (operasional, finansial, config) agar `using`+`with check` juga wajib `is_org_active(org_id)`. Akibatnya tulis (insert/update/delete) diblokir di level DB saat kedaluwarsa, sementara **baca tetap jalan** (policy `*_select` tak disentuh) dan **bayar tetap bisa** (tabel `invoices`/`memberships` tak digerbang). Org trial baru tak terpengaruh (aktif 14 hari). Error RLS (`42501`) diterjemahkan `supabase-adapter` jadi pesan Indonesia ("Langganan kedaluwarsa atau melebihi kuota — perpanjang di Pengaturan → Langganan") alih-alih "row-level security policy" mentah. Lihat [[Data Layer]].

### Integrasi Fersaku (gateway AKTIF) — Fase 1B lanjutan
Setelah Mayar ditinggalkan (KYC produksi berat + sandbox `api.mayar.club` down, lihat di bawah), gateway pindah ke **Fersaku** (`fersaku.com`, "tanpa PT, daftar 2 menit"). Fersaku adalah lapisan di atas PJP berizin BI (sama model dgn Mayar) tapi punya API + webhook + **sandbox simulate** lengkap, jadi alur end-to-end bisa dibuktikan tanpa uang asli & tanpa nunggu KYC. Spesifikasi diverifikasi langsung dari `fersaku.com/docs` sebelum koding.

**Spesifikasi (terverifikasi):**
- **Base URL tunggal**: `https://fersaku.com/api/v1`. Environment ditentukan **prefix key**: `sk_test_*` = sandbox, `sk_live_*` = produksi (base URL sama). Beda dari Mayar yang base URL-nya beda per-env.
- **Auth**: `Authorization: Bearer sk_...` (server-side only).
- **Create**: `POST /payments` `{ amount, customer_name?, customer_email?, description?, external_id?, expired_minutes?, finish_url? }` → `201` `{ id, order_id, external_id, amount, status:"pending", checkout_url, qr_string, qr_image_url, expired_at }`.
- **Webhook body**: `{ event, payment_id, order_id, status, amount, paid_at, merchant_id, mode }`. Header: `X-Webhook-Event`, `X-Webhook-Signature`, `X-Fersaku-Mode` (`sandbox`|`live`). Events: `payment.paid`/`expired`/`failed`/`cancelled`.
- **Signature**: `sha256_hex(payment_id + order_id + status + amount + WEBHOOK_SECRET)` (amount sbg string), bandingkan timing-safe dgn `X-Webhook-Signature`. Lebih aman dari pola token Mayar.
- **Sandbox simulate**: `POST /sandbox/simulate { payment_id, action:"pay"|"expire"|"fail"|"cancel" }` (hanya `sk_test_*`) → memicu webhook nyata ber-`mode:sandbox`. Inilah cara uji webhook handler tanpa uang asli.

**Dua Edge Function (runtime Deno, `supabase/functions/`):**
1. **`create-invoice`** — dipanggil klien via `functions.invoke`; `verify_jwt=false` + self-verify `getUser()` (alasan & bug CORS lihat di bawah, sama spt era Mayar). Alur: (a) verifikasi caller, panggil RPC `start_subscription` (cek manager + invoice `pending`), (b) `POST {FERSAKU_API_BASE}/payments` dgn `external_id` = id invoice kita, (c) simpan `provider='fersaku'`, `provider_ref = id pembayaran Fersaku` (**kunci korelasi** — webhook Fersaku **tak** echo `external_id`, hanya kirim `payment_id`), `qris_url = checkout_url`, (d) balikkan link. Bila gagal, invoice di-set `canceled`. **`expired_minutes: 30`** (jendela QRIS 30 menit). Catatan: nilai `expired_minutes` per-transaksi **menimpa** setelan "Waktu Kedaluwarsa Default" di dashboard Fersaku — jadi ubah di kode, bukan dashboard (timer checkout ditampilkan Fersaku dalam format **menit:detik**, mis. `30:00`).
2. **`fersaku-webhook`** — endpoint **publik** (`verify_jwt=false` di `config.toml`). Acknowledge-then-verify: **selalu 200** (non-POST/test ping lolos), tapi `apply_payment` (idempotent, service-role) cuma jalan kalau **signature SHA-256 cocok** (timing-safe) **dan** event `payment.paid`. Korelasi via `provider_ref = payment_id`.

**Env (secrets):** `FERSAKU_API_KEY` (`sk_test_*`/`sk_live_*`), `FERSAKU_WEBHOOK_SECRET` (`whsec_*`), opsional `FERSAKU_API_BASE` (default `https://fersaku.com/api/v1`).

**Status: TERBUKTI JALAN (2026-06-07).** Uji sandbox end-to-end sukses — log `fersaku-webhook` di Supabase menampilkan `payment applied { invoiceId: ..., mode: "sandbox" }` (artinya: webhook sampai → signature SHA-256 cocok → korelasi `provider_ref` → `apply_payment`). Alur: Pilih Paket → checkout Fersaku terbuka → `POST /sandbox/simulate action=pay` → webhook → masa aktif bertambah otomatis. Catatan: dashboard Fersaku (sisi mereka) kadang tak menampilkan log sandbox; **sumber kebenaran = log Edge Function Supabase**. App **tidak** memproses query `?status=paid` dari redirect `finish_url` (diverifikasi), jadi perpanjangan murni dari webhook.

**Integritas tombol "Saya sudah bayar"**: tombol konfirmasi manual memanggil `apply_payment` langsung dari browser — aman untuk mock, tapi di produksi = manager bisa perpanjang tanpa bayar. Fix: tombol kini **hanya muncul untuk invoice `provider === 'mock'`**. Invoice provider asli (Fersaku) cuma menampilkan link checkout + catatan "diperpanjang otomatis"; pelunasan **wajib** via webhook ber-signature.

**Sisa (giliran user, saat promote ke produksi):** ganti secret ke key `sk_live_*` + webhook secret produksi, daftar URL webhook di dashboard Fersaku mode live.

### Promote staging → produksi (2026-06-07)
Project produksi = `vmitplpvncfvyimgyxrn` ("FixMaster"), staging = `fpwwswngqpftaixdlozo`. Promote pertama kali setelah berbulan dev di staging.

**Pelajaran penting — drift pelacak migration vs schema nyata:** `supabase migration list --linked` menunjukkan kolom **Remote kosong** (0001–0010 belum tercatat), TAPI `db push` langsung gagal `type "role_type" already exists (42710)`. Akar: dulu (sebelum CLI/staging ada) `0001–0003` dijalankan **manual via SQL Editor** di produksi, jadi objeknya ADA tapi tabel pelacak `supabase_migrations` KOSONG. Produksi juga **sudah berisi data nyata** (organisasi/transaksi) — jadi `db reset` HARAM.

**Jalur aman yang dipakai (mempertahankan data):**
```
supabase link --project-ref vmitplpvncfvyimgyxrn   # butuh password DB produksi
supabase migration repair --status applied 0001 0002 0003  # tandai pelacak, NOL sentuh data
supabase db push                                   # apply HANYA 0004–0010
```
`repair` cuma update tabel pelacak (bukan schema/data). `db push` transaksional per-migration (gagal → rollback, tak merusak). Sebelum push, **semua 0004–0010 diaudit**: semua pakai `add column if not exists` / `create table if not exists` / drop-recreate RLS policy — **nol operasi destruktif terhadap baris data**. NOTICE "does not exist, skipping" saat apply = wajar (dari `drop if exists` defensif). Pra-cek: `select table_name from information_schema.tables where table_schema='public'` → 15 tabel `0001–0003` lengkap → aman.

**Edge Functions produksi:** `create-invoice` + `fersaku-webhook` di-deploy ke `vmitplpvncfvyimgyxrn` (migration dulu, karena fungsi butuh RPC `start_subscription`/`apply_payment` dari 0009). Verifikasi: webhook GET → 200, CORS allow-headers `authorization, x-client-info, apikey, content-type` lengkap.

**Sisa produksi (giliran user):** set secret LIVE (`FERSAKU_API_KEY=sk_live_*` + `FERSAKU_WEBHOOK_SECRET` live — **beda dari sandbox**) via `supabase secrets set ... --project-ref vmitplpvncfvyimgyxrn`; daftar webhook URL `https://vmitplpvncfvyimgyxrn.supabase.co/functions/v1/fersaku-webhook` di Fersaku mode Live; merge `feat/cloud-auth`→`main` via PR; uji 1 transaksi QRIS asli nominal kecil (simulate TAK tersedia di live). Live-mode Fersaku tak butuh KYC.

### Invoice cancel + anti-tumpuk pending (migration `0011`)
Masalah: tiap "Pilih Paket" memanggil `start_subscription` yang **selalu** membuat invoice `pending` baru, tanpa membatalkan yang lama & tanpa jalan cancel → invoice pending menumpuk di Riwayat Invoice. Fix (migration `0011_invoice_cancel.sql`):
- **`cancel_invoice(p_invoice_id)`** — RPC manager-only, hanya membatalkan invoice ber-status `pending` (idempotent untuk status final; `paid` tak tersentuh). UI: tombol "Batalkan" (ghost) di tiap baris pending di Riwayat Invoice → wrapper `cancelInvoice` → `cancelPay` handler.
- **`start_subscription` di-recreate**: sebelum insert invoice baru, `update invoices set status='canceled' where org_id=... and status='pending'` → **maksimal satu pending aktif** pada satu waktu (supersede otomatis).

Total migration kini **0001–0011**. Verifikasi: build + 202 test + lint hijau.

> [!NOTE]
> **Pelajaran apply migration (drift tracker):** urutan `db push` gagal-lalu-`repair` bisa membuat tracker menandai migration "applied" padahal body-nya **tak pernah jalan** (fungsi tak ada di DB). `supabase migration list` hanya membuktikan status **tracker**, bukan keberadaan objek. Verifikasi sebenarnya: `select proname from pg_proc where proname='<fn>'`. Bila kosong walau tracker "applied", jalankan SQL migration **langsung** di SQL Editor (semua RPC kita `create or replace` → idempotent, aman). Terjadi di staging **dan** produksi untuk `0011`.

### Promote SELESAI — terbukti LIVE (2026-06-07)
Uji transaksi QRIS **asli (mode live)** di `getfixmaster.vercel.app` sukses end-to-end: log `fersaku-webhook` produksi menampilkan `payment applied { mode: "live" }`, masa aktif bertambah otomatis. `cancel_invoice` terverifikasi ada di produksi (via `pg_proc`). Branch `feat/cloud-auth` ter-merge ke `main` (`73f9986`). **Gateway Fersaku resmi live di produksi.** Live-mode Fersaku tak butuh KYC; sandbox punya `simulate`, live hanya bisa diuji dgn bayar QRIS asli.

### Tiga peningkatan post-promote (2026-06-07)

**1. Code-splitting (Vite).** `src/app/router.tsx` dulu meng-import semua halaman eager → satu entry chunk 972 KB. Sekarang tiap halaman `React.lazy(() => import(...).then(m => ({ default: m.NamedExport })))` (named export di-map ke default). `<Suspense>` boundary di `AppLayout` (fallback `.routeSpinner`) + boundary terpisah untuk 2 route publik (`/track`, `/prototype/ticket`) yang di luar AppLayout. `vite.config.ts`: `manualChunks` **bentuk fungsi** (Vite 8/Rolldown menolak bentuk objek — `ManualChunksFunction`) memisah `react-vendor` + `supabase-vendor`; `chunkSizeWarningLimit: 600` (react-vendor ~504 KB irreducible). Hasil: entry **972 KB → 115 KB** (gzip 265→36). router.tsx perlu `/* eslint-disable react-refresh/only-export-components */` (file config, bukan komponen).

**2. Webhook tangani expired/failed.** `fersaku-webhook` kini bertindak pada 4 event (sebelumnya hanya `payment.paid`): `payment.paid`→`apply_payment`; `payment.expired`→invoice `expired`; `payment.failed`/`payment.cancelled`→`canceled`. Transisi negatif **hanya** dari `pending` (`.eq('status','pending')` → race-safe, tak menimpa paid), via service role. Signature SHA-256 tetap gerbang untuk SEMUA aksi. Deployed staging + produksi.

**3. Realtime auto-refresh UI.** Migration **`0012_realtime_billing.sql`** (**applied staging + produksi 2026-06-07**): tambah `invoices` + `organizations` ke publication `supabase_realtime` (DO block guarded via `pg_publication_tables`). Helper `subscribeOrgBilling(orgId, onChange)` di `supabase-client.ts` → channel `postgres_changes` pada `invoices` (filter `org_id`) + `organizations` (filter `id`), return unsubscribe (no-op bila unconfigured). RLS tetap berlaku di stream realtime → klien hanya terima baris org-nya. `BillingTab` (SettingsPage) subscribe saat mount; tiap event → reload invoice + refresh org di session store → UI berubah **tanpa reload manual** saat webhook menandai paid/expired. Verifikasi `0012`: `select * from pg_publication_tables where pubname='supabase_realtime'` (bukan hanya tracker).

Total migration kini **0001–0012**. Verifikasi: build (entry 115 KB) + 202 test + lint hijau.

> [!NOTE]
> **`0012` SUDAH di-apply (2026-06-07)** ke staging **dan** produksi (user konfirmasi). Realtime auto-refresh kini **AKTIF** di kedua environment — `invoices` + `organizations` terdaftar di publication `supabase_realtime`. UI billing berubah tanpa reload manual saat webhook menandai paid/expired.

### Auth: email confirmation DIMATIKAN (produksi, 2026-06-07)
Supabase Auth produksi disetel **tanpa email confirmation** — akun baru langsung aktif setelah sign up, tak perlu klik link verifikasi email. Alasan: SMTP default Supabase punya rate-limit ketat & UX daftar jadi terhambat. Konsekuensi: tak ada verifikasi kepemilikan email (akun bisa daftar dgn email apa pun). Bila nanti butuh verifikasi (mis. reset password andal / anti-spam), aktifkan kembali + set SMTP kustom. Setelan ini di **dashboard Auth**, bukan di kode/migration.

### Polish billing + wizard + bug tugas cepat (2026-06-07)

**[BUG] Tugas cepat "hari ini" gagal di cloud.** `addQuickTask` (TasksPage) menulis `templateId: ''` (string kosong) untuk tugas ad-hoc tanpa template. Aman di IndexedDB lokal, tapi di Postgres cloud kolom `task_instances.template_id` bertipe **UUID** → `''` memicu `invalid input syntax for type uuid`, jadi tugas cepat **gagal senyap di produksi**. Fix: `TaskInstance.templateId` jadi `ID | null`, UI kirim `null`, `instanceKey(null,...)` → key stabil `adhoc::<tgl>` (tak bentrok dgn generasi template). Migration **`0013_task_instances_nullable_template.sql`**: `alter table task_instances alter column template_id drop not null` (idempotent). +2 unit test. **Pelajaran:** string kosong ≠ NULL di Postgres untuk kolom UUID/FK; mismatch lokal-vs-cloud kelihatan hanya di produksi. Verifikasi `0013`: `select is_nullable from information_schema.columns where table_name='task_instances' and column_name='template_id'` → `YES`.

**Wizard placeholder.** Placeholder nama usaha contoh diganti dari `TechFix Center` (kesan generik/asing seperti FixNova) → **`Sinar Gadget Service`** (autentik konter Indonesia), inisial `TFC` → `SGS`. Murni placeholder, bukan default value.

**Signature page Billing (License Meter).** Tab Langganan didesain ulang ke bahasa "Precision Electronics Bench" — lihat [[Signature Pages]]. License meter (LED fase + charge-gauge bertick), pay dock, tier module ber-spine, receipt-tape riwayat invoice. Token saja; logika billing tak berubah. Catatan: `BillingTab` cloud-only (`isSupabaseConfigured`) jadi tak bisa di-seed lokal → verifikasi visual lewat harness statis (`scripts/shoot-billing.mjs` + preview HTML) yang memuat CSS sumber asli, difoto dark+light.

Total migration kini **0001–0013** (0013 perlu di-apply user ke staging + produksi). Verifikasi: build (entry 115 KB) + **204 test** + lint hijau.

---

### [HISTORIS] Integrasi Mayar — ditinggalkan
Untuk uji di **staging** dipakai environment **sandbox** Mayar (`api.mayar.club`, tanpa uang asli); produksi (`api.mayar.id`) menyusul saat promote. Karena base URL **env-driven** (`MAYAR_API_BASE`), pindah sandbox↔produksi cukup ganti secret, tanpa ubah kode. Bentuk API diverifikasi langsung dari docs resmi sebelum koding (bukan menebak). Dua Edge Function (runtime Deno, di `supabase/functions/`):

1. **`create-invoice`** — dipanggil klien via `functions.invoke`. Verifikasi caller **di dalam fungsi** via `getUser()` (bukan gerbang platform: `verify_jwt = false`), karena gerbang JWT platform menolak token sesi format-baru → fungsi tak terjangkau → klien dapat 401 → UI diam-diam fallback ke mock (gejala "Provider QRIS belum terhubung"). Alur: (a) verifikasi JWT pemanggil via `getUser()` (tolak token kosong/invalid), panggil RPC `start_subscription` sebagai user itu (cek manager + bikin invoice `pending`), (b) `POST {MAYAR_API_BASE}/invoice/create` dengan `extraData.invoiceId` = id invoice kita (**kunci korelasi** balik dari webhook), (c) simpan `provider_ref` + `qris_url` (= hosted payment link Mayar) ke baris invoice, (d) balikkan link. Bila Mayar gagal, invoice di-set `canceled` (tak menggantung pending).
2. **`mayar-webhook`** — endpoint **publik** (Mayar yang manggil, bukan user login → `verify_jwt = false` dideklarasikan di `supabase/config.toml`, jadi `supabase functions deploy mayar-webhook` polos sudah cukup). Pola **acknowledge-then-verify**: **selalu balas 200** (biar "Test URL" Mayar & retry lolos), tapi `apply_payment` (idempotent, service-role) cuma jalan kalau token cocok **dan** event `payment.received`. Korelasi via `extraData.invoiceId` (fallback `provider_ref`).

Keputusan & alasan:
- **Pilih endpoint Invoice, bukan Dynamic QRCode.** Endpoint `qrcode/create` cuma terima `amount` — tak ada cara mengaitkan pembayaran balik ke invoice kita. `invoice/create` mendukung `extraData`, jadi webhook bisa tahu invoice mana yang lunas.
- **Base URL env-driven** (`MAYAR_API_BASE`, default produksi). Tinggal ganti ke `api.mayar.club` kalau mau sandbox tanpa ubah kode.
- **Key Mayar TAK PERNAH di browser** — hanya di Supabase secrets, dibaca `Deno.env.get`. Klien hanya kenal nama fungsi.
- **Token webhook by value, bukan by nama header**: docs Mayar tak menyebut nama header token, dan ping "Test URL" Mayar **tak bawa token & bukan `payment.received`** (log konektivitas membuktikan: header yang masuk cuma `accept`, `cf-*`, `content-type`, dst — nol header auth). Maka handler mencocokkan `MAYAR_WEBHOOK_TOKEN` dengan **nilai semua header** (bukan nebak nama), dan menolak diam-diam (tetap 200) bila tak cocok — nama header di-log (bukan nilainya) untuk diagnosa. Selain itu **non-POST (GET/HEAD) juga dibalas 200** karena Test URL Mayar kemungkinan pakai GET. Awalnya sempat balas 403/405 keras → Test URL gagal; diperbaiki ke acknowledge-then-verify.
- **UI fallback**: `BillingTab.subscribe` coba `createMayarInvoice` dulu; bila fungsi belum di-deploy (error) → jatuh ke mock `start_subscription` + tombol "Saya sudah bayar". Jadi app tetap jalan sebelum & sesudah deploy.
- **Bug CORS (gejala: selalu mock walau fungsi deployed)**: log `create-invoice` cuma berisi **OPTIONS → 200, tak ada POST**, dan UI selalu jatuh ke mock. Akar: `supabase-js` `functions.invoke` mengirim header `apikey` + `x-client-info` (selain `authorization`/`content-type`), tapi `Access-Control-Allow-Headers` semula cuma `authorization, content-type` → browser **memblokir POST** setelah preflight OPTIONS lolos. Fix: tambah `x-client-info, apikey` ke allow-headers. Diverifikasi via `curl -X OPTIONS` (preflight balas header lengkap). Pelajaran: kalau Edge Function dipanggil dari browser via `functions.invoke`, allow-headers **wajib** mencakup `apikey` + `x-client-info`.
- **ESLint**: `supabase/functions` dimasukkan `globalIgnores` (runtime Deno, import URL, di luar `tsconfig.app` yang cuma `src`) — biar `npm run lint` browser-app tak rusak.
- **Sandbox Mayar (`api.mayar.club`) down saat uji** (2026-06): setelah CORS fix, log nyata menunjukkan pipeline lengkap jalan (POST tembus → fungsi panggil Mayar) tapi Mayar balas **404 page not found**. Probe pembanding: `api.mayar.id/hl/v1/invoice/create` POST → **401** (route sehat, butuh auth), sedang `api.mayar.club/hl/v1/invoice/create` POST → **502 lalu 404** (server bermasalah). Base URL sandbox sudah diverifikasi cocok dengan docs resmi (`api-reference/introduction.md`: `https://api.mayar.club/hl/v1`). Kesimpulan: **kode kita benar; sandbox host Mayar yang down/tak melayani**. Opsi: (a) tunggu/retry sandbox, atau (b) pindah ke produksi (`api.mayar.id`) dengan key produksi + nominal kecil.

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

## 2026-06-22 — Paket 5 perbaikan (landing, tracking, garansi, auto-kapital, harga & role)

> [!note] Konteks
> Lima permintaan revisi sekaligus. Dikerjakan bertahap: Fase 1 (aman, tanpa server), Fase 2 (RPC tracking), Fase 3 (RLS admin per-cabang, berisiko).

**1. Landing — galeri menu, hapus komparasi kompetitor.**
Matriks `COMPARE` dihapus; diganti `MENU_GALLERY` (kartu per menu: screenshot dark/light auto-swap + narasi "Tanpa sistem" (FAULT/LED merah) → "Dengan FixMaster" (FIX/LED hijau)). Demo tetap ada. Screenshot via `scripts/shoot-menus.mjs` (16 file `public/screenshots/menu-*-{dark,light}.png`). Nav "Banding"→"Galeri".

**2. Lacak publik — kontak toko + garansi, TANPA harga.**
`track_service` RPC diperluas ([[Data Layer]], migrasi `0035`): tambah `org_phone`, `org_address`, `org_logo_url`, `warranty_service_until`, `warranty_parts_until`, `picked_up`. **Sengaja tanpa** biaya/estimasi/DP. `TrackingPage` kini menampilkan blok Garansi (tanggal s/d, mono) + Kontak Toko (tombol WhatsApp `wa.me` + alamat). Kolom garansi bertipe `date` (bukan timestamptz) — sesuai 0006.

**3. Chip template garansi — per-field, bukan pasangan.**
`StatusModal`: dulu 6 tombol ("Jasa 7h/Part 14h" dst). Kini tiap field garansi (Jasa, Sparepart) punya baris chip angka hari `7 · 14 · 30` yang mengisi field di atasnya. Konteks dari label field, bukan dari teks chip.

**4. Auto-kapital konsisten.**
Logika dipindah ke `src/lib/text.ts`: `capitalizeFirst` (huruf pertama) & `capitalizeLines` (huruf pertama tiap baris non-kosong), + 8 unit test. `Input` pakai `capitalizeFirst`; komponen baru `Textarea` pakai `capitalizeLines`. No servis & email tidak di-cap (`noAutoCap`/type).

**5a. Harga — Skenario A.**
`plans.ts`: Solo Rp 99rb, Pro base Rp 199rb (2 outlet), add-on Rp 50rb/outlet, plafon Rp 349rb. Gap Solo→Pro Rp 100rb (beda kelas terasa). Tetap 2 paket (tier ketiga ditolak).

**5b. Admin per-cabang (RLS, BERISIKO).**
Migrasi `0036`: dulu owner **dan** admin = `is_org_manager` → tembus semua outlet. Kini predikat outlet pakai `is_org_owner(org_id) OR outlet_id IS NULL OR outlet_id IN auth_outlet_ids()`. Owner tembus semua; admin di-scope ke outlet yang ditugaskan (seperti karyawan untuk **cakupan data**, tapi **kewenangan** delete/settle/kelola-tim tetap manager-level via `is_org_manager`). Keuangan (incomes/expenses) baca: owner semua / admin per-cabang / karyawan nol. `SettingsPage`: pemilih outlet kini muncul untuk semua role non-owner (dulu hanya `karyawan`).

> [!note] Status apply migrasi (update 22 Jun 2026)
> `0034` (PO→Keuangan), `0035` (tracking), `0036` (admin-scope) **sudah applied ke STAGING + PRODUKSI**. `0036` (batas keamanan) di-apply ke prod setelah gerbang terpenuhi: admin toko testing sudah di-set outlet, toko pilot owner-only (tanpa admin/karyawan) → nol risiko lockout. Alur: `npm run test:integration` staging (56/56 ✓) → konfirmasi user → `supabase link` prod → `db push` (dry-run dulu) → relink balik staging.

Verifikasi kode: build ✓, 378 unit test ✓, lint ✓. Landing galeri difoto (dark/light). Lihat [[Signature Pages]], [[Data Layer]], [[Conventions]].

#decision #bugfix

---

## Paket 6 — 3 perbaikan UX (servis dedup, password, auto-kapital) (22 Jun 2026)

Tiga permintaan user, dikerjakan via `/goal` (eksekusi otonom + verifikasi).

**6a. Quick-suggest pelanggan di Servis Baru (anti-duplikasi).** Akar masalah: dedup saat simpan sudah ada (`findByPhone` me-link, tak buat baru), tapi tanpa saran cepat user mengetik ulang nama berbeda tipis → record nyaris-duplikat. Solusi: dropdown saran live di `ServiceModal` (helper murni `searchCustomers`, maks 5, cocok nama/HP-ternormalisasi). Klik → isi nama+HP. Backstop `findByPhone` tetap. Lihat [[Signature Pages]], [[Data Layer]].

**6b. Indikator kekuatan password + show-password.** Prop `revealable` di `Input` (tombol mata `eye`/`eye-slash`) untuk login/daftar/reset. Komponen `PasswordStrength` (LED + tick-gauge 4 segmen + chip kriteria, bench-styled — bukan bar generik) saat daftar/reset. Keputusan: syarat WAJIB tetap huruf+angka+≥8 (tak kunci akun lama); **simbol = bonus skor**, bukan syarat. Skor murni `scorePassword` (`lib/business/password.ts`).

**6c. Auto-kapital tiap kata.** Akar masalah: `Input` hanya `capitalizeFirst` (huruf pertama seluruh nilai) → tak kapital setelah spasi. Tambah helper `capitalizeWords` + prop opt-in `autoCapWords` (default tetap `capitalizeFirst` agar field kalimat seperti "Keluhan" tak salah jadi Title Case). Diterapkan ke field nama diri: ServiceModal (Nama Pelanggan, Perangkat), CustomerModal, SupplierModal, InventoryModal, SettingsPage (Nama Usaha). Lihat [[Conventions]].

Verifikasi kode: build ✓, **394 unit test** ✓ (dari 378, +16), lint ✓. AuthPage signup + ServiceModal quick-suggest difoto via Playwright (dark/light). Lihat [[Signature Pages]], [[Data Layer]], [[Conventions]].

#decision #bugfix

---

## Bug: hasil global search terpotong di mobile (22 Jun 2026)

**Gejala:** di mobile, dropdown hasil pencarian global meluber ke luar tepi kiri layar — label section terpotong ("SERVIS"→"ERVIS", "PELANGGAN"→"ELANGGAN").

**Akar masalah:** `.dropdown` di `GlobalSearch.module.css` memakai `position: absolute; right: 0; width: 380px` relatif ke `.root`. Di mobile, `.root` menyusut jadi ikon search kecil di tengah topbar, jadi panel 380px memanjang ke kiri dari titik itu dan keluar layar.

**Fix:** di media query `≤640px`, dropdown di-anchor ke **viewport** (`position: fixed`) full-width minus margin samping (`left/right: var(--space-3)`), tepat di bawah topbar (`top: calc(var(--topbar-height) + 6px)`), dengan `max-height` mengikuti `100dvh`. Desktop tak berubah. Diverifikasi via Playwright (dark/light, 390px). Lihat [[Signature Pages]].

#bugfix

---

---

## Pelajaran utama

> [!tip]
> **Verifikasi dengan render asli, bukan mockup.** Hampir semua bug di atas hanya ketahuan karena UI difoto dengan data nyata via Playwright + cek fungsional (bukan sekadar asumsi "kelihatannya benar").

> [!warning] Jangan campur warna hardcode dengan token semantic
> Background **hardcode** (mis. `#0b0d11`) + teks **token semantic** (`--text-primary`, yang membalik per tema) = resep teks hilang di salah satu tema. Pilih salah satu konsisten: kalau permukaan sengaja gelap di kedua tema, warna teksnya juga harus **nilai tetap / scale token cerah**. Lihat [[Conventions]].

---

## Bug: Logo upload gagal di produksi — "Failed to fetch" (2 Jul 2026)

**Gejala:** Upload logo di Settings → Usaha selalu gagal dengan pesan "Gagal memproses gambar" (sebelum fix error message) / "Failed to fetch" (sesudah).

**Root cause:** Kode lama melakukan `fetch("data:image/png;base64,…").blob()` untuk mengkonversi canvas data URL ke Blob sebelum upload ke Supabase Storage. Browser memblokir `fetch()` ke skema `data:` karena CSP `connect-src` di `vercel.json` tidak mengizinkan skema tersebut (hanya `'self'` dan `https://*.supabase.co`).

**Fix:** Ganti `fileToLogoDataUrl()` (yang return data URL) dengan `fileToLogoBlob()` yang menggunakan `canvas.toBlob()` langsung — tidak ada `fetch()` sama sekali.

**File:** `src/features/settings/SettingsPage.tsx` — commit `33146aa`

**Pelajaran:** Hindari `fetch(data:URL)` di produksi dengan CSP ketat. `canvas.toBlob()` adalah cara idiomatik yang tidak memerlukan network request.

---

## Fitur: Soft delete anggota nonaktif — Migration 0037 (2 Jul 2026)

**Konteks:** Anggota yang sudah dinonaktifkan sebelumnya tidak bisa dihapus permanen dari UI. Ini gap desain — hanya ada badge "Nonaktif", tidak ada aksi lebih lanjut.

**Keputusan: Soft delete, bukan hard delete.**
Alasan: history aktivitas, servis, dan transaksi yang dibuat anggota tetap intact karena foreign key ke `memberships.id` masih valid. Hard delete akan memutus referensi tersebut.

**Implementasi:**
- `supabase/migrations/0037_delete_member.sql` — RPC `delete_member()` dengan 4 guard server-side (security definer):
  1. Caller harus org owner
  2. Target harus sudah nonaktif (`active = false`)
  3. Tidak bisa hapus diri sendiri
  4. Member tidak ditemukan / sudah di-soft-delete
- `src/data/supabase-client.ts` — fungsi `deleteMember()`
- `src/data/supabase-adapter.ts` — tambah `.is('deleted_at', null)` di `list()` agar soft-deleted rows tidak tampil (sebelumnya hanya LocalAdapter yang sudah filter ini, SupabaseAdapter belum)
- `src/features/settings/SettingsPage.tsx` — tombol **Hapus** + ConfirmDialog untuk anggota nonaktif

**Migration dijalankan di:** staging (`fpwwswngqpftaixdlozo`) dan production (`vmitplpvncfvyimgyxrn`) via `supabase db query --linked`.

#bugfix #decision #feature

## Paket audit: 6 perbaikan konsistensi Buku Kas (7 Jul 2026)

Hasil audit kode menyeluruh (laporan: `bug_audit.md` di artifacts). Semua di sisi klien, tanpa migrasi. Keputusan kunci:

- **B1 — Hapus income DP kini mengurangi `service.downPayment`.** Sebelumnya reverse-cascade hanya revert `lunas → selesai`; DP yang dihapus dari Buku Kas meninggalkan `downPayment` basi → pelunasan berikutnya kurang tagih. Deteksi jenis income via string kanonik `dpIncomeDescription()` (alasan string itu wajib satu sumber — lihat `services.ts`). History tiket dapat entri internal `DP <nominal> dihapus dari keuangan`.
- **B3 — Hapus satu leg pelunasan split me-reverse SEMUA leg.** Pelunasan split = beberapa income berdeskripsi sama; hapus satu leg lalu settle ulang = dobel-book sisa leg. Kini semua leg (match `settlementIncomeDescription()` + `serviceId`) dihapus + saldo di-net **per wallet dulu** (dua leg di wallet sama tidak boleh apply ke balance cache basi yang sama) — pola sama dengan `applyKoreksi`.
- **B2 — Income POS (`saleId`) dikunci dari edit.** Lock lama hanya cek `serviceId`; income penjualan lolos → edit nominal memutus audit vs record `Sale` dan void sesudahnya me-reverse angka salah. Fix: `!serviceId && !saleId`.
- **B4 — Expense tertaut PO/modal servis tak bisa dihapus dari Buku Kas.** Tombol hapus disembunyikan bila `expense.poId` terisi atau deskripsi berawalan `Modal servis ` — hapus di sini akan meninggalkan referensi yatim (baris modal di tiket tetap dihitung profit). Hapus lewat halaman pemiliknya (detail servis me-reverse expense+wallet dengan benar).
- **B5 — Filter tab Buku Kas dijalankan SEBELUM `slice(0,100)`.** Urutan lama membuat tab Pemasukan/Pengeluaran kelaparan saat 100 baris terbaru didominasi satu jenis.
- **B6 — Toast error tidak lagi menelan pesan server.** `catch {}` generik di StatusModal (3 tempat) + EntryModal diganti `e instanceof Error ? e.message : fallback` (pola PosPage). Error RLS/network kini terlihat operator.

> [!WARNING]
> Path hapus-income ini **client-side berurutan** (tanpa transaksi) — sama seperti path lokal lain. Untuk cloud, kandidat RPC atomik `delete_service_income` menyusul bila terbukti perlu (lihat improvement I1 di audit).

Verifikasi: build + lint + **394 unit** hijau. Improvement yang SENGAJA ditunda (ada di `bug_audit.md`): RPC koreksi atomik, nomor dokumen anti-tabrakan multi-device, riwayat void POS >8, `max` tanggal entri, try/catch `togglePickup`.

#bugfix

## Paket audit lanjutan: hardening RPC uang + keamanan + integritas klien (10 Jul 2026)

Audit menyeluruh kedua (frontend + data layer + backend Supabase). Sebagian temuan awal ternyata **sudah** diperbaiki di working tree (lihat "sudah ada di working tree" di bawah) — sisanya dikerjakan di batch ini. Keputusan & perbaikan kunci:

### Backend — `0039_harden_money_rpcs.sql` (baru)
- **`is_org_active` ditambahkan ke SEMUA RPC uang** (`process_sale`, `settle_service`, `record_down_payment`, `cancel_service`). Temuan: RPC `SECURITY DEFINER` mem-bypass RLS, jadi guard `is_org_active` yang ada di semua RLS write (0010/0017/0028) TIDAK berlaku di dalam RPC → org yang langganannya habis tetap bisa transaksi tanpa batas, membatalkan enforcement billing 0010. Kini konsisten.
- **Tolak nominal pembayaran negatif** di `process_sale`/`settle_service`. Sebelumnya amount negatif dari klien akan **mendebit** wallet (exploit skimming). `record_down_payment`/`transfer_wallet` sudah menolak `<= 0` — dua RPC ini tadinya inkonsisten.
- **Refund `cancel_service` diamankan**: dibatasi `<= down_payment`, wallet refund di-**`FOR UPDATE` lock** + cek saldo cukup (fail-safe non-negatif). Sebelumnya kasir (`is_org_member`) bisa membukukan expense "Refund DP" sembarang / buat saldo minus — celah penggelapan. (Komentar 0036 keliru menyebut ini manager-level.)
- **Penomoran sale server-side (menutup deferral "nomor dokumen anti-tabrakan multi-device").** `nextDocNumber` klien menghitung `INV-0001` dari daftar sales **ter-scope per-outlet**, sehingga kasir kedua / outlet kedua menabrak `unique(org_id, sale_no)` org-wide tanpa retry. `process_sale` kini menetapkan nomor sendiri: **advisory lock per (org, prefix)** (auto-release saat commit) → `max+1` lintas outlet. Return tetap `uuid` (ponytail); toast klien bisa jarang beda dari nomor tersimpan saat balapan — struk/laporan selalu benar. Upgrade ke return `(id, sale_no)` bila perlu nomor final seketika. `service_no`/`po_number` punya pola laten sama (jalur insert langsung) — ditunda.
- **`check_rate_limit` di-revoke dari `anon/authenticated`.** Hanya dipanggil internal oleh `track_service` (security-definer, jalan sebagai owner fungsi) → aman dicabut; mencegah flood `rate_events` (key acak) & throttle-DoS kuota `track:<orgId>` korban.

> [!WARNING] Ditunda SENGAJA (keputusan produk, belum diubah)
> **Bypass harga langganan** (`start_subscription`/`apply_payment` 0022): harga plan dari klien + cabang "owner mock-confirm" mengizinkan owner mengaktifkan plan tanpa pembayaran webhook. Perlu peta plan→harga server-side + batasi penandaan "lunas" ke `service_role`. **Kuota** `max_outlets`/`max_users` (0001) juga belum di-enforce server-side (helper `withinUserQuota`/`withinOutletQuota` klien bukan batas sebenarnya).

### Frontend & data layer
- **Lost-update cost line servis** ([ServiceDetailPage.tsx](src/features/services/ServiceDetailPage.tsx)): 4 mutator (tambah sparepart/modal, edit, hapus) menulis `{...service, spareparts}` dari closure basi → bisa menghapus baris yang kas/stoknya sudah bergerak. Kini lewat helper `putServiceSpareparts` yang **re-read service** dulu. (Mutex penuh ditunda — cukup untuk klik-cepat single-user.)
- **Resync realtime pasca-outage** ([supabase-adapter.ts](src/data/supabase-adapter.ts)): cek `offline→live` adalah dead code (urutan nyata `offline→connecting→live`), jadi data stale setelah koneksi putus. Diganti flag `wasOffline` (latch di `offline`, resync di `live` berikutnya; skip connect awal). Lihat [[Data Layer]].
- **Keamanan PIN** ([pin.ts](src/lib/pin.ts)): SHA-256 tunggal (10rb kombinasi, brute-force milidetik dari dump) → **PBKDF2-HMAC-SHA256, 210k iterasi, salt acak** (format `s3:`). `verifyPin` tetap kompat hash lama `s2:`; `needsRehash()` + **rehash best-effort saat login** (try/catch agar penolakan RLS staff tak blokir login). Test baru `pin.test.ts`. Lihat [[Testing & Security]].
- **EntryModal**: (a) tambah guard `mustPickOutlet` saat *membuat* entri (samakan dg POS) — cegah salah-stempel outlet; (b) diskriminator income/expense pakai prop `kind`, bukan sniff `serviceId !== undefined` (income legacy bisa salah tertulis ke `expenses`).
- **InventoryModal**: stok/minStock dibulatkan ke integer (`inventoryItemSchema` wajib int, tapi modal tulis langsung via `repository.put` → `type=number` tadinya loloskan "2.5").
- **Sudah ada di working tree (dikirim sepaket):** `0038` (`receive_goods_v2`/`void_po` → `inventory_items`, bukan tabel `inventory` yang tak ada — jika tak di-apply, terima-barang+void PO mati di cloud), backup paksa scope org-wide + restore rollback snapshot ([backupRestore.ts](src/features/settings/backupRestore.ts)), `checkOut` absensi punya `catch`, jam LCD pakai `localTimeSec`.

Verifikasi: `tsc` + `eslint` bersih, **402 unit** hijau (395 → +7 `pin.test.ts`), build produksi sukses.

> [!IMPORTANT] Status deploy 0038 + 0039 — SUDAH DI-APPLY (10 Jul 2026)
> Frontend live di Vercel staging + production (commit `97fe4bb`). Migrasi `0038` + `0039` **ter-apply ke staging DAN production** via `supabase db push` (skrip `deploy-migrations.bat`: push staging → `npm run test:integration` sebagai gate → push production). Terverifikasi lewat `supabase migration list` — 0038 & 0039 muncul di kolom `Remote` untuk project production `vmitplpvncfvyimgyxrn`.

#bugfix #decision #security

## Audit UI menyeluruh per-menu: auth, landing, pengaturan, servis, POS/supplier/tugas, log aktivitas (12 Jul 2026)

Sapuan audit halaman-per-halaman (bukan migrasi, kecuali edge function `delete-account`). Semua terverifikasi: `tsc` + `eslint` bersih, **408 unit** (+6: `authError` ×3, `localDateOf` ×3), build produksi sukses. Temuan besar & keputusan:

### Keamanan & privasi
- **Hapus Akun kini benar-benar menghapus data usaha** ([delete-account/index.ts](supabase/functions/delete-account/index.ts)). Sebelumnya `clearAll()` no-op di cloud + fungsi hanya hapus kredensial → row `organizations` + data (PII, keuangan) jadi **orphan** meski UI klaim "dihapus permanen". Kini edge function cari org tempat caller **owner aktif** (diverifikasi server-side) → `delete organizations` (cascade ke semua tabel) → baru `deleteUser`. **Fail-closed**: gagal hapus data → kredensial TIDAK dihapus (akun utuh, bisa retry). Handler klien jujur — tak klaim sukses saat gagal. ⚠️ **Perlu `supabase functions deploy delete-account`** agar aktif.
- **Terjemahan error auth** ([authError.ts](src/lib/business/authError.ts) + dipasang di wrapper `supabase-client`): pesan Supabase (Inggris) → Indonesia untuk semua jalur (login/signup/reset/update). Signup email terdaftar (`identities.length === 0`) → pesan "sudah terdaftar", bukan "akun dibuat" palsu.
- **PIN hashing** sudah PBKDF2 (sesi 10 Jul); di sini + guard double-submit auth (Enter mem-bypass tombol disabled) & listener `onAuthStateChange` sekali-bind (StrictMode).
- **Login cloud kini masuk jejak audit** (`auth.login`): flag sekali-pakai `consumeLoginAudit` di [auth.ts](src/stores/auth.ts), ditulis di [AuthGate](src/app/AuthGate.tsx) setelah bootstrap (butuh konteks org/employee; reload halaman TIDAK nge-spam karena hanya `signIn` eksplisit yang set flag). Paritas dengan `PinLogin` lokal.
- **Konfirmasi visibilitas audit**: RLS 0019 = INSERT semua member, SELECT **owner-only**, tanpa UPDATE/DELETE (immutable). `activity` bukan `OUTLET_SCOPED` → owner lihat log semua cabang. Lihat [[Testing & Security]].

### Integritas data
- **Bug timezone sistemik (14 titik)**: `createdAt.slice(0,10)` = tanggal **UTC** → sebelum 07:00 WIB tampil tanggal kemarin (tgl masuk servis, filter laporan, ekspor CSV, umur piutang, durasi). Helper baru **`localDateOf`** di [time.ts](src/lib/time.ts). Yang terparah: **bug TULIS** di [StatusModal](src/features/services/StatusModal.tsx) — income pelunasan & expense refund DP tersimpan tanggal UTC. Juga menutup deferral lama `revenueSeries` (key hari UTC).
- **Enforcement kuota outlet** ([SettingsPage](src/features/settings/SettingsPage.tsx) OutletTab) — Solo tak bisa tambah cabang tanpa upgrade (sebelumnya tak dicek).
- **Blokir hapus supplier ber-PO aktif** ([SuppliersPage](src/features/suppliers/SuppliersPage.tsx)) — dulu cuma warning lalu tetap hapus → PO yatim. Kini ditolak.
- **Cap 1000-baris PostgREST**: `list()` kini selalu `.order('created_at', desc)` ([supabase-adapter.ts](src/data/supabase-adapter.ts)) → yang terpotong dijamin data terlama, bukan subset acak (kritis untuk `activity_logs` append-only).

### Ketahanan (pola B6 dituntaskan seluruh app)
- **~20 handler mutasi** yang tadinya `await repository.*` telanjang atau `catch {}` generik kini **try/catch + surface `e.message`**: absensi checkOut (10 Jul), togglePickup ×2, EntryModal/FinancePage, BusinessTab/WalletTab/OutletTab/OutletRow, Inventory/Customers delete, Tasks ×5, 4 modal (Customer/Supplier/PO/TaskTemplate), ServiceModal, WarrantyClaim, ServiceDetail ×3.
- **Guard `mustPickOutlet` di SEMUA jalur transaksi ber-outlet**: EntryModal, ServiceModal, ReceiveModal, void PO (paritas dgn PosPage yang sudah ada) — cegah stempel outlet salah diam-diam.

### UX & konsistensi
- Landing: `scroll-margin-top` anchor tak tertutup sticky header. Settings: teks logo "maks 500KB" (sesuai validasi), dialog Reset tak nyangkut, garansi non-negatif, InventoryModal integer. Jam LCD (attendance + activity) pakai `localTimeStr`/`localTimeSec` (hindari bug `toLocaleTimeString` Chrome/Edge Windows). Filter aksi Log derive dari `ACTION_META` (6 verb tadinya tak terfilter) + cap render 300.

### Ditunda SENGAJA (tercatat, belum dikerjakan)
Nomor `service_no`/`po_number` anti-tabrakan server-side (pola `process_sale` 0039 siap ditiru; intake/PO jarang konkuren) · kerugian garansi tak muncul di profit per-tiket (agregat di Laporan benar) · retensi/arsip `activity_logs` · auto-generate batch tugas gagal senyap (realtime menyembuhkan) · kuota `max_users`/`max_outlets` + bypass harga langganan server-side (dari audit backend 10 Jul).

#bugfix #decision #security

## Skalabilitas: cap baris PostgREST + filter tanggal server-side (Plan B) (13 Jul 2026)

**Konteks**: pertanyaan "layak untuk berapa user / makin banyak data makin lemot/error?". Audit kode menemukan risiko nyata bukan di jumlah user, tapi di **jumlah data satu toko**.

**Temuan (terbukti empiris di staging)**: `useCollection` → `repository.list()` menarik **seluruh riwayat** koleksi tiap render (Dashboard/Laporan/Keuangan/Servis pakai penuh, filter di client). `SupabaseAdapter.list()` hanya dibatasi **cap baris PostgREST (default 1000)** — setelah itu baris terpotong **senyap** (tanpa error). Uji beban: insert 2000 `incomes` ke org buang → REST balikkan 1000 (bug), setelah cap dinaikkan → balikkan 2000. Toko sibuk mencapai 1000 baris `incomes` dalam 1–3 bulan → Dashboard/Laporan/Keuangan mulai tampil **angka salah** (transaksi hilang) tanpa peringatan.

**Plester (dilakukan user)**: naikkan **Max rows → 50000** di dashboard Supabase, staging **dan** production. Menutup kehilangan-data, tapi memunculkan trade-off "benar-tapi-berat": halaman berat kini menarik semua baris sepanjang riwayat.

**Obat sebenarnya — Plan B (commit `f88b3f3`)**: filter tanggal di **query**, bukan client.
- `repository.listByDateRange(collection, dateField, from, to)` di ketiga adapter (Supabase `gte/lte`, Local & InMemory filter string lexicographic). Lihat [[Data Layer]].
- Hook `useCollectionRange` + `rangeForTimestamp` (di `src/hooks/`). **Kenapa `rangeForTimestamp`**: kolom `date` (incomes/expenses/sales) di-filter apa adanya, TAPI `services.createdAt` adalah timestamp **UTC** sementara app mengelompokkan per tanggal **LOKAL** (WIB) — filter `>= from 00:00 UTC` akan membuang baris dini-hari WIB. Solusi: lebarkan bound ±1 hari, lalu filter presisi tetap di client via `localDateOf` (sama seperti bug timezone 12 Jul).
- **Yang di-range**: incomes/expenses/sales (kolom `date`), services (`createdAt`, widened). **Yang tetap FULL** (sengaja): `wallets` (total saldo), `services`/`inventory` di Dashboard (leaderboard teknisi, alert stok, daftar servis terbaru butuh data lintas-periode). Realtime tetap otomatis (invalidasi by prefix `['collection', name]` mencakup key ranged).
- Dashboard & Keuangan punya tombol **muat bulan lampau** (default bulan berjalan). Laporan ikut rentang date-picker-nya.

**Tanpa migrasi DB** — index `(org_id, date)` yang sudah ada (0001) langsung dipakai; `EXPLAIN` tak diperlukan untuk membuktikan itu.

> [!WARNING] Verifikasi tertunda
> Plan B lolos tsc/eslint/**420 unit**/build, tapi **belum di-drive di browser** pada window terakhir (logika murni `summarize`/`computeKpis`/`trendSeries` sudah bertest & tak berubah — yang baru hanya *cakupan baris* yang di-fetch). **Langkah lanjut**: smoke-test Dashboard/Laporan/Keuangan dengan data >1 bulan, bandingkan angka vs SQL, cek tombol "muat bulan lampau".

#decision #perf

## Paket UX: template WA/nota + konfirmasi password + Buku Kas (31 Jul 2026)

Lima permintaan user dalam satu batch, dikerjakan dari yang paling ringan. (Dua item lain — **forgot password** & **weekly backup** — sengaja **di-skip user**, belum dikerjakan.)

**1. Default template WhatsApp & nota dirapikan.** Default lama satu paragraf datar ("Halo {nama}, unit {perangkat} Anda telah kami terima…") — terbaca seperti notifikasi robot. Sekarang **multi-baris berstruktur**: sapaan → blok data (`*bold*` WhatsApp untuk no servis/nominal/status) → satu ajakan aksi → penutup. Perbaikan substansi: template `konfirmasi` dulu menyebut "estimasi biaya adalah **{biaya}**" padahal `{biaya}` = `finalCost` (0 saat tiket belum selesai) → diganti `{estimasi}`. Template `diterima` menambahkan estimasi + link tracking di baris sendiri.
- **Nota** (`serviceReceiptLines` + `printReceipt.ts`): tambah baris **Tanggal** (tanggal masuk = pertanyaan nomor satu saat klaim), **Keluhan**, dan **Kelengkapan** (kondisional). Kepala nota dapat label `NOTA SERVIS`, kaki dapat catatan simpan-nota-untuk-klaim-garansi + penutup ramah. Kolom label dibatasi 38% agar nilai panjang tak mendorong layout thermal.
- Textarea editor Settings `rows=3 → 10`, preview NotifyModal `rows=6 → 12` (default multi-baris jadi tak terpotong).
- **Unit test penjaga**: tiap placeholder di `DEFAULT_WA_TEMPLATES` wajib ada di `WA_TEMPLATE_VARS` — typo seperti `{no_service}` akan terkirim **mentah** ke pelanggan.

**2. Konfirmasi password tanpa umpan balik langsung.** Lapor user "tidak ada matching password di wizard register". Field + validasi `password !== confirm` **sudah ada** (sejak `c35ef2a`); yang tak ada adalah **umpan balik live** — cocok/tidak baru ketahuan setelah klik Daftar. Perbaikan: `Input` konfirmasi kini menerima `error` ("Belum cocok dengan password di atas") / `hint` ("✓ Password cocok") berdasarkan state, muncul **hanya setelah user mulai mengetik** konfirmasi (field kosong tak langsung tampak salah). Dipasang di **AuthPage** *dan* **ResetPasswordPage** — form kembar, kalau cuma satu yang diperbaiki yang lain langsung basi. Nol CSS baru (pakai `hint`/`error` bawaan `Input`).

**3–5. Buku Kas: cap baris, riwayat transfer, filter per-wallet.** Detail implementasi di [[Signature Pages#Keuangan — Cashbook Tape]]. Inti keputusan:
- **Cap 100 keras → paging.** Kombinasi yang bikin user kesal: Plan B (13 Jul) memberi tombol "muat bulan sebelumnya", tapi `slice(0,100)` membuat baris bulan lama **tak pernah kebagian slot** — fitur baru itu praktis mati. Diganti `limit` state + tombol **Tampilkan lebih banyak**, hint `X dari Y baris`.
- **Bug ikutan yang ketemu saat memperbaikinya**: footer (termasuk "muat bulan sebelumnya") berada di dalam cabang non-`EmptyState`, jadi begitu filter menghasilkan 0 baris user **terjebak** tanpa jalan keluar. Footer dipindah keluar.
- **Riwayat transfer dari activity log, bukan tabel baru.** Transfer sengaja tak membukukan income/expense (19 Jun) → tak ada baris ledger untuk dibaca. Ketimbang migrasi `wallet_transfers`, baris dibaca dari `activity` (`action = 'wallet.transfer'`, `meta.amount` + `meta.toWalletId` sudah dicatat sejak awal). **Trade-off yang diterima sadar**: RLS `activity_select` = owner-only (0019) → **admin melihat tab Transfer kosong**. Ditandai `ponytail:` di kode; bikin tabel hanya kalau admin benar-benar butuh.
- Pemetaan log→baris diekstrak ke `transferEntries()` murni di `lib/business/finance.ts` (4 unit test) — di dalam komponen ia tak teruji, dan bagian yang mudah salah justru ada di situ: `meta` opsional, tepi ±1 hari dari `rangeForTimestamp`, dua sisi wallet.

**Verifikasi**: build + eslint + **425 unit test** hijau; di-drive di browser (demo `/demo`) — konfirmasi password live (cocok & tak cocok), filter per-wallet (Bank BCA → 2 baris), tab Transfer + footer saat kosong, dan ketiga template WA ter-render dengan data asli. Baris transfer sendiri **tak bisa** di-drive di demo (RPC `transfer_wallet` balas `Forbidden` untuk org demo) → itulah alasan unit test `transferEntries`.

#decision #bugfix #ux

## Suntikan modal pemilik terhitung sebagai omzet — laba menggelembung 43% (31 Jul 2026)

**Gejala (lapor user, data produksi asli)**: "saya sempat tambah saldo ke wallet untuk modal pembelian sparepart, tapi jadi akhirnya itu dihitung jadi pemasukan, alhasil cashflow tidak sesuai". Bulan Juli: **6 kali suntikan, total Rp 13.500.000** ke wallet BCA. Bulan-bulan sebelumnya berpola sama.

**Dampak terukur** (angka layar user):

| | Tercatat | Sebenarnya |
|---|---|---|
| Pemasukan | Rp 47.697.000 | Rp 34.197.000 |
| Laba bersih | Rp 31.609.528 | **Rp 18.109.528** |
| Margin | 66,3% | 53,0% |

**42,7% dari "laba" yang dilaporkan adalah uang pemilik sendiri** — dan tak ada satu pun error/warning. Tren & perbandingan periode ikut bohong: grafiknya lebih mencerminkan kapan pemilik menyuntik dana daripada kapan bengkel ramai.

**Akar masalah**: satu-satunya cara menambah saldo wallet adalah mencatat Pemasukan. Tak ada konsep "uang bergerak tapi bukan hasil dagang" untuk **satu** wallet (yang ada cuma Transfer, dan itu butuh **dua** wallet). Siklusnya berulang tiap bulan: awal bulan saldo ditarik habis oleh pemilik, tengah bulan disuntik lagi untuk beli sparepart.

**Yang SALAH didiagnosis di awal (dicatat supaya tak terulang)**: permintaan awal user adalah "fitur kalibrasi saldo awal tiap wallet". Kalibrasi **tidak** menyelesaikan ini — saat itu saldonya sudah benar (suntikan tercatat sebagai income → saldo naik sesuai), yang rusak cuma klasifikasinya. Ketahuan setelah alurnya **disimulasikan lebih dulu** sebelum sebaris kode ditulis. Pelajaran: keluhan "cashflow tidak sesuai" bisa berarti saldo salah **atau** klasifikasi salah — pastikan dulu yang mana. (Belakangan user melaporkan saldo BCA juga melenceng dari mutasi bank — lihat keputusan di bawah soal kenapa kalibrasi akhirnya **tidak dibangun**.)

**Perbaikan** (detail di [[Signature Pages#Keuangan — Cashbook Tape]]):
- `IncomeCategory` += `'Modal'` (setoran modal pemilik), `ExpenseCategory` += `'Prive'` (penarikan pemilik). Uangnya tetap menggerakkan saldo & tetap tampil di Buku Kas dengan gaya **netral** (bukan hijau/merah — bukan untung/rugi, sama alasannya dengan baris Transfer).
- Sumber kebenaran tunggal `isCapitalFlow`/`operatingIncomes`/`operatingExpenses` di `lib/business/finance.ts`, disaring **di dalam** tiap fungsi agregasi, bukan di pemanggil. Ada **7** titik yang menjumlah income secara buta; menyaring di pemanggil berarti halaman baru bisa lupa dan berbohong diam-diam — persis penyakit yang sedang diobati.
- `transactionRows` (Laporan) sengaja **tetap** menampilkan baris Modal/Prive — itu daftar transaksi mentah, bukan ringkasan laba; menyembunyikannya bikin saldo tak ada penjelasnya.
- Signature `trendSeries`/`outletComparison`/`periodComparison` dilebarkan membawa `category`; tsc langsung menandai pemanggil yang belum ikut.
- **8 unit test baru** khusus menjaga pengecualian ini (summarize ×2, computeKpis, revenueSeries, trendSeries, periodComparison, outletComparison, + satu yang memastikan `transactionRows` justru TIDAK menyembunyikannya). 433 test total.

**Nol migrasi & data lama swalayan**: kolom `category` bertipe `text` tanpa `CHECK` (0001). Pemilik memperbaiki riwayat sendiri — edit baris lama, ganti kategorinya. Karena nominal & wallet tak berubah, rekonsiliasi `EntryModal` menghitung delta **nol** → **saldo tidak bergerak sedikit pun**. Pengecualian berbasis kategori (bukan tanggal), jadi semua bulan ikut terkoreksi sekaligus.

**Verifikasi di browser** (demo, data seed): catat Modal Rp 13.500.000 ke Bank BCA → saldo **Rp 14.750.000 → Rp 28.250.000**, sementara Pemasukan **tetap** Rp 6.450.000 dan Laba Bersih **tetap** Rp 5.100.000. Dashboard: margin tetap 79,1%, total saldo naik Rp 13,5 jt. Lalu Prive Rp 5.000.000 → saldo turun ke Rp 23.250.000, Pengeluaran **tetap** Rp 1.350.000. Spine baris modal terbaca `rgb(95,107,122)` (netral) vs baris servis `rgb(16,185,129)` (hijau).

#bugfix #decision #finance

### Keputusan: fitur kalibrasi saldo TIDAK dibangun (31 Jul 2026)

Dirancang lengkap dan **disimulasikan** (panel SISTEM/AKTUAL/SELISIH, selisih dibukukan sebagai baris nyata, pilih kategori penyebab), lalu **dibatalkan atas keputusan user** setelah `Modal`/`Prive` jadi: "2 kategori tsb secara tidak langsung bisa dipakai kalibrasi untuk yang sekarang".

**Kenapa itu keputusan yang benar, bukan sekadar hemat kerja**: kalibrasi bekerja dengan membuang seluruh selisih ke satu baris "Kalibrasi saldo" — jejak *kenapa* selisihnya ada hilang selamanya. Mencatat transaksi dengan kategori yang sesuai penyebabnya memperbaiki saldo **dan** menamai penyebabnya. Setiap penyebab sudah punya kategori: suntikan lupa dicatat → `Modal`, tarikan → `Prive`, pelunasan → `Servis`, belanja part → `Sparepart`, biaya → `Operasional`, dan **selisih yang benar-benar tak terlacak → `Lainnya`** (masuk laba, sebagaimana mestinya untuk cash over/short). Kategori terakhir itulah yang membuat panel kalibrasi jadi mubazir — yang hilang cuma kenyamanan menghitung selisih otomatis, bukan kemampuan.

> [!warning] Jebakan yang harus dijaga kalau fitur ini pernah dibahas lagi
> `Modal`/`Prive` terasa "aman" karena tak menyentuh laba, jadi ada godaan menambal SEMUA selisih dengan `Modal`. Itu menghasilkan **cermin terbalik** dari bug yang baru diperbaiki: kalau selisihnya sebenarnya pelunasan servis yang lupa dicatat, omzet jadi terlalu KECIL — dan arah ini jauh lebih sulit ketahuan karena tak ada yang curiga saat laba turun. Aturannya: kategori mengikuti penyebab sebenarnya, bukan mengikuti mana yang paling nyaman untuk laporan.

#decision #finance

## Anggota "hantu": ter-soft-delete tapi akses hidup (produksi, 31 Jul 2026)

**Gejala (lapor user)**: undangan untuk seorang admin tetap "menunggu pendaftaran" padahal orangnya sudah bisa login. Saat mendaftar dia dapat "sudah terdaftar", jadi langsung login dan masuk. Di daftar Anggota Tim dia tak muncul.

**Fakta dari DB produksi** (query read-only ke `memberships` Nuara Service):

| email | name | role | active | deleted_at |
|---|---|---|---|---|
| nuaraservice@ | Rifan Nurdiansyah | owner | true | NULL |
| chpygstmn@ | Chepy | admin | true | NULL |
| bangunnovandaramadhani@ | Bangun | admin | true | NULL |
| **dimasjatiardiansyah@** | **Dimas** | **owner** | **true** | **2026-07-12 22:35** |
| testk24@ | Testk24 | admin | false | 2026-07-12 11:49 |

Baris Dimas ada di keadaan yang seharusnya **mustahil**: `active = true` **dan** `deleted_at` terisi (bandingkan Testk24 yang benar: `active = false` + `deleted_at`). Emailnya cocok persis — dugaan awal "salah ketik email" **salah**, dan baru terbantah setelah query dijalankan.

**Akar masalah — dua definisi "anggota" yang tak sepakat**:
- `list()`/UI: `deleted_at is null` (`supabase-adapter.ts`)
- RLS/auth: `active = true` saja (`auth_org_ids`, `auth_role_in`, `is_org_member`, `is_org_manager`, `is_org_owner`, `auth_outlet_ids`) — **semuanya mengabaikan `deleted_at`**

Biasanya konsisten karena `delete_member` (0037) mewajibkan `active = false` dulu. Yang merusaknya: **`claim_invite` (0008/0024/0033) punya `on conflict ... do update set active = true` yang menghidupkan ulang baris terhapus TANPA membersihkan `deleted_at`**.

**Dampak berlapis, semuanya senyap**:
1. **Keamanan** — akun berperan `owner` punya akses penuh ke seluruh data toko sambil **tak terlihat** di layar pemilik. Pemilik tak punya cara tahu, apalagi mencabutnya, lewat UI mana pun.
2. **Undangan macet** — `getMyMembership()` menemukan baris hantu (ia juga hanya cek `active`), jadi bootstrap berhenti di situ dan `claim_invite()` **tak pernah dipanggil lagi**. Undangan menggantung selamanya.
3. **Tak terdeteksi** — `create_invite` tak memblokir karena membership-nya di org yang **sama** (guard 0033 hanya melihat `org_id <> p_org_id`), jadi pemilik bisa terus mengundang ulang tanpa hasil.

**Perbaikan (`0042_membership_deleted_at_guard.sql`)**:
- **A.** Semua helper RLS ikut menyaring `deleted_at is null`. Diperbaiki di **satu tempat**: setiap policy di DB memanggil helper ini, jadi akses tertutup untuk semua tabel sekaligus tanpa menyentuh satu policy pun.
- **B.** `claim_invite` **membersihkan `deleted_at`** saat klaim, dan saat baris lama memang terhapus (rejoin) ia mengadopsi **peran + nama dari undangan**. Anggota yang masih aktif **tak** diubah perannya — mencegah undangan berperan rendah menurunkan owner terakhir dan mengunci toko.
- **Klien**: `getMyMembership()` menambah `.is('deleted_at', null)` agar baris hantu jatuh ke jalur klaim, bukan menghentikannya.

**Sifat menyembuhkan diri**: setelah di-apply, akun hantu langsung kehilangan akses; begitu ia login ulang, `claim_invite` berjalan, `deleted_at` dibersihkan, perannya mengikuti undangan (owner → admin), dan undangan hilang dari daftar tertunda. **Tanpa SQL manual.** Migrasi sengaja TIDAK mengubah data lama — menutup akses sudah cukup, dan keputusan siapa boleh kembali ada di pemilik.

**Tes**: `tests/integration/tier3d-ghost-member.integration.test.ts` (3 tes) — akses dicabut saat di-soft-delete (memakai baris pelanggan nyata, bukan tabel kosong yang lolos palsu), klaim membersihkan hantu + mengadopsi peran undangan, dan anggota aktif tak bisa diturunkan perannya lewat klaim. **Diverifikasi mereproduksi bug**: sebelum 0042 di-apply, 2 dari 3 tes gagal di staging.

> [!warning] Pelajaran proses
> Tiga hipotesis pertama (salah ketik email, user bikin toko sendiri, bug refresh UI) semuanya **salah**, dan semuanya terdengar masuk akal. Yang menyelesaikan ini adalah **satu query read-only ke DB**, bukan penalaran lebih lanjut atas kode. Untuk bug yang bergantung pada keadaan data, ambil datanya dulu — menulis perbaikan di atas tebakan akan menambah bug kedua.

#bugfix #decision #security

### Lanjutan: layar setup tak lagi jadi jebakan senyap (31 Jul 2026)

Sisa lubang dari bug anggota hantu: `bootstrap()` menelan error klaim (`claimInvite().catch(() => null)`) lalu **diam-diam** menawari orangnya membuat toko baru. Menyelesaikan wizard di situ = toko **tandingan**, dan setelah itu `create_invite` menolak undangan ulang ("sudah anggota toko lain") — buntu tanpa jalan mundur di UI.

Perbaikan: `setupNotice` di session store menampung pesan server saat klaim gagal, dan Wizard **mode cloud** selalu menampilkan pita peringatan di atas form. Dua isi: pesan error bila ada, atau peringatan statis "diundang? jangan isi form ini, masuk pakai email yang persis diundang".

> [!note] Yang menahan beban di sini adalah peringatan STATIS, bukan cabang errornya
> Setelah 0042, cabang error praktis **tak terjangkau dari alur boot**: klaim hanya dipanggil bila `getMyMembership()` null (tak ada membership aktif & tak terhapus), sedangkan guard lintas-toko justru mensyaratkan ADA membership aktif & tak terhapus di org lain. Dua syarat itu tak bisa benar bersamaan. Kegagalan yang realistis adalah yang **senyap** — undangan tak cocok karena email meleset → `claim_invite` mengembalikan null tanpa error. Itu yang ditangkap peringatan statis. Cabang error tetap dipertahankan sebagai jaring pengaman untuk error tak terduga (jaringan, auth, guard baru di masa depan); menelannya kembali ke `catch(() => null)` berarti mengulang kesalahan yang sama.

**Verifikasi**: akun sekali-pakai dibuat di **staging** (bukan produksi), login lewat UI asli sampai mendarat di wizard cloud, pita peringatan terbukti tampil; akun lalu dihapus.

## Audit UI + UX menyeluruh — ergonomi, hierarki tugas, dan kejujuran data (9 Agu 2026)

Audit mencakup render visual **dan** heuristic UX pada 12 route operasional, dark/light,
desktop 1440 px, tablet 1024 px, dan mobile 390×844. Pemeriksaan terukur: overflow
horizontal, teks informasi di bawah 12 px, target sentuh di bawah 44×44 px, posisi
konten utama pada viewport pertama, state kosong, hierarki aksi, dan konsistensi data.

**Akar masalah dan perbaikan lintas-app:**

- Font root 14 px + micro-copy 0.5–0.7 rem membuat label operasional terlalu kecil.
  Root kembali 16 px, token `xs/sm/base` dinaikkan, dan teks daun operasional memiliki
  floor 12 px. Kontrol mobile/touch dipagari 44×44 px melalui fondasi global.
- Deret KPI yang wrap mendorong pekerjaan nyata jauh ke bawah. Dashboard, Servis,
  Keuangan, Laporan, dan Inventori memakai horizontal rail di mobile sehingga filter,
  daftar, grafik, atau buku kas terlihat pada viewport pertama.
- Tabel Servis tablet menyembunyikan kolom aksi. Breakpoint ≤1100 px kini memakai job
  card dua kolom; desktop mempertahankan tabel dan action column sticky yang lebih
  ringkas.
- Shell menggulirkan `<main>`, tetapi perpindahan route hanya mengubah lokasi sehingga
  detail tiket terbuka pada posisi scroll halaman lama. `AppLayout` sekarang mereset
  `window` dan semua ancestor scrollable setiap `location.pathname` berubah.

**Temuan UX/data trust:**

- Tiket `lunas` salah menyebut total biaya sebagai “sisa tagihan”; tiket tanpa biaya
  final menampilkan Rp0 seolah pasti. Readout kini membedakan `Lunas`, `Belum
  ditetapkan`, dan `Menunggu biaya final`.
- Aksi `Tandai Diambil` dapat muncul saat unit masih `pengerjaan`. Syarat kini memakai
  `isAwaitingPickup(service)` atau state yang memang sudah diambil.
- POS mobile tidak memberi jalan cepat kembali ke keranjang. Dock persisten baru
  menampilkan jumlah + total dan melakukan scroll ke register.
- Month input Absensi menampilkan nama bulan berdasarkan locale OS/browser, bukan
  locale aplikasi. Native picker tetap dipakai sebagai overlay, tetapi readout terlihat
  diformat melalui `useFormat`.

Halaman publik/legacy ikut diselaraskan: Tracking menjadi customer status terminal,
404 menjadi route diagnostic, PIN login dan onboarding menjadi access faceplate, serta
Prototype diperbaiki kontras + overflow mobile. Landing V2 yang sudah disetujui tetap
dipertahankan; hanya floating WhatsApp mobile diringkas menjadi target 52×52 px.

**Verifikasi:** 12/12 route pada mobile dan desktop memiliki nol overflow horizontal;
mobile memiliki nol teks daun <12 px dan nol kontrol <44×44 px. Tablet Servis memakai
job card dua kolom. Build, lint, dan 435 unit test hijau; interaksi cart dock serta reset
scroll diverifikasi melalui browser asli.

#decision #bugfix #ux #ui

## Bottom navigation ponsel yang dikendalikan owner (11 Agu 2026)

**Keputusan:** ponsel ≤720 px memakai empat route utama + satu tombol tetap `Lainnya`.
Default-nya **Beranda, Servis, Kasir, Inventori**. Owner dapat memilih sekaligus
mengurutkan empat slot dari Pengaturan → Navigasi; hasil disimpan org-wide di
`Organization.settings.mobileNavigation`, bukan localStorage per perangkat.

**Alasan UX:** sidebar drawer memerlukan buka → cari → pilih untuk setiap perpindahan
modul, padahal alur konter berulang di empat tujuan yang sama. Bottom navigation
menurunkan perpindahan utama menjadi satu tap. Hamburger disembunyikan pada breakpoint
yang sama agar user tidak perlu memahami dua struktur navigasi. `Lainnya` tetap
menyediakan semua menu tersisa, sinyal operasional, cabang, identitas usaha, dan keluar.

**Pagar keamanan dan konsistensi:** pilihan owner bukan izin akses. Helper murni
`getVisibleNavigation` tetap memfilter `managerOnly`/`ownerOnly`; resolver membuang
route tak valid/duplikat lalu mengisi slot kosong dengan fallback yang boleh dibuka
peran aktif. Feature plan-locked tetap tampil memakai LED PRO seperti sidebar.

**Konflik aksi mobile:** dock keranjang POS dinaikkan di atas bottom bar + safe-area.
Pada detail servis bottom bar tidak dirender karena halaman sudah memiliki action bar
kritikal (`Tandai Diambil`, status pembayaran). Tablet 721–1024 px tetap memakai drawer;
desktop tetap memakai diagnostic rail.

**Verifikasi:** build/lint hijau, 441 unit + 59 integration hijau. Browser asli:
360/390/700 px bottom bar tanpa overflow dan tanpa hamburger; 721 px berpindah tepat ke
hamburger/drawer; 1440 px tidak menampilkan bottom bar; pemilihan slot menukar duplikat,
simpan merambat langsung ke bar, reset mengembalikan default, dan More sheet tetap
memperlihatkan bottom bar sebagai jalur tutup yang konsisten.

#decision #navigation #mobile #ux

## Landing V2: satu narasi, bukti desktop + mobile (11 Agu 2026)

**Masalah:** cerita landing sudah responsif secara layout, tetapi belum setara secara
pengalaman. Di desktop hero copy dan konsol terbaca berdampingan; di 390 px hero
mencapai sekitar 1.375 px dan screenshot desktop pada section produk mengecil sampai
detail operasional sulit dibaca. Landing juga belum membuktikan bahwa pengalaman app
mobile benar-benar dirancang, bukan sekadar desktop yang dipaksa mengecil.

**Keputusan:** pertahankan urutan narasi dan CTA yang sama, tetapi ubah prioritas
visualnya sesuai perangkat. Copy hero secara eksplisit menghubungkan meja penerimaan
dan ponsel. Judul/gap hero mobile dipadatkan tanpa menghapus informasi. Section produk
menjadi satu panggung dua perangkat: desktop memakai screenshot dashboard besar dengan
ponsel bertumpuk sebagai instrumen pendamping; pada ≤760 px screenshot mobile tampil
lebih dahulu lalu screenshot desktop sebagai konteks. Dua frame sama-sama menuju
`/demo` dan punya label aksesibel yang spesifik.

**Sumber bukti:** `public/screenshots/demo-mobile-{dark,light}.png` adalah render asli
dashboard `/demo` pada 390×844, bukan aset ilustrasi. `scripts/shoot-demo.mjs` menjaga
kedua tema dapat diregenerasi dan menyalinnya ke `scripts/shots/` agar sinkron dengan
attachment vault.

**Verifikasi:** build, lint, 441 unit test, dan 59 integration test hijau. Kedua aset
mobile diperiksa pada resolusi asli; bottom navigation, KPI utama, dan tema dark/light
terbaca. Render browser akhir diverifikasi pada 1440×960 dan 390×844 tanpa overflow
horizontal; frame ponsel menampilkan kelima item bottom navigation secara utuh.

**Koreksi frame (11 Agu 2026):** label manfaat yang semula ditempel di dasar frame
menutupi bottom navigation pada screenshot. Overlay dihapus; screenshot kini duduk di
dalam bezel ponsel dengan speaker, kamera, tombol samping, dan home indicator. Seluruh
viewport 390×844 tetap terlihat, termasuk lima item bottom navigation.

#decision #landing #responsive #ux

---

### Billing lewat listener notifikasi GoPay (migration `0043`)

**Keputusan user, diambil sadar setelah trade-off dijelaskan.** Billing langganan bisa memakai
akun GoPay merchant sendiri (bebas MDR) sebagai ganti checkout Duitku, dengan konsekuensi yang
diterima di muka.

**Masalah inti:** notifikasi GoPay hanya membawa nominal + waktu, **tanpa order id**. Jadi nominal
dipakai sebagai korelator: tiap invoice diberi sufiks acak 0–999 rupiah (Rp49.000 → Rp49.037).
Keunikannya ditegakkan **partial unique index** di Postgres, bukan kode aplikasi — insert yang
bentrok ditolak database, jadi tidak ada race check-then-insert. Bentrok cuma berbiaya satu retry.

**Kenapa `claim_gopay_payment` service_role-only.** Fungsi ini menandai invoice lunas dengan bukti
tunggal berupa nominal, sedangkan user tahu nominal invoice-nya sendiri. Kalau di-grant ke
`authenticated`, itu mengulang persis celah F5 yang ditutup `0022`. Di-`revoke ... from public`
secara eksplisit karena Postgres meng-grant EXECUTE ke PUBLIC secara default.

**Kenapa parser teks di server, bukan di APK.** Kalimat notifikasi adalah bagian paling rapuh dan
bisa berubah tiap update aplikasi GoPay. Dengan parser di Edge Function, perbaikan = redeploy
fungsi; aplikasi Android tetap penerus bodoh yang tak perlu dirilis ulang. Parser menolak kata
outgoing (`mengirim`, `refund`, `pembayaran ke`) — false negative hanya berbiaya konfirmasi
manual, false positive memberi langganan gratis.

**Bug tertangkap sebelum deploy.** Draf pertama `start_gopay_invoice` menyalin `start_subscription`
versi `0009` (`role in ('owner','admin')`, tanpa supersede). Itu regresi terhadap `0016` yang sudah
mengetatkan billing jadi owner-only. Lebih parah: tanpa supersede, invoice pending menumpuk dan
**tiap invoice terbuka menahan satu nominal yang bisa diklaim** — beberapa nominal hidup sekaligus.
Diperbaiki mengikuti `0016`.

**Batas yang diterima (bukan bug — konsekuensi jalur ini):**
- Notifikasi *fire-and-forget*: fungsi down saat pembayaran masuk → tidak ada retry, invoice
  tetap pending sampai dikonfirmasi manual. Webhook gateway punya retry justru karena ini.
- Butuh HP Android nyala 24/7; Doze/baterai habis = pipeline mati diam-diam.
- Bayar nominal berbeda → tidak terkorelasi, perlu rekonsiliasi manual. Log
  `incoming payment with no matching invoice` adalah antrian kerja manusia.
- Secret di-hardcode dalam APK → APK tidak boleh disebar.

Rollback: kosongkan `VITE_GOPAY_QRIS_URL`, billing kembali ke Duitku tanpa perubahan kode.

**Sisa giliran user:** set `GOPAY_LISTENER_SECRET`, `supabase db push`, deploy fungsi, upload gambar
QRIS ke bucket publik, pasang APK listener, lalu uji 1 transaksi nominal kecil. Screenshot Playwright
pay dock varian `gopay` belum diregenerasi (butuh env + invoice pending nyata).

#decision #billing #gopay #security #keputusan-user

### Gateway hosted (Duitku) dicabut — GoPay listener jadi satu-satunya jalur

Lanjutan keputusan di atas: setelah listener GoPay jalan, Duitku dicabut atas permintaan user.
Dihapus: Edge Function `create-invoice` & `duitku-webhook`, entri `config.toml`, dan
`createPaymentInvoice()` di data layer. `fersaku-webhook` dibiarkan (sudah deprecated sejak
cutover Duitku) hanya untuk callback yang mungkin masih melayang.

**Yang TIDAK dihapus:** kolom `provider`, `provider_ref`, `qris_url` di `invoices`. Baris invoice
historis harus tetap terbaca; membuang kolomnya cuma menghemat beberapa byte tapi merusak riwayat
dan laporan.

**Jebakan yang ditutup.** Invoice pending milik provider lama dulu menampilkan link checkout
tersimpan. Setelah webhook-nya dihapus, link itu berbahaya: halaman Duitku masih bisa menerima
uang, tapi tak ada lagi yang menandai invoice lunas — pelanggan bayar, invoice tetap pending.
Pay dock kini menolak menampilkan link untuk provider non-`gopay`/non-`mock` dan menyuruh
membatalkan lalu membuat ulang.

**Uji integrasi disesuaikan.** `tier2b-edge` dulu menguji `create-invoice` menolak tanpa JWT.
Diganti menguji `gopay-listener` menolak tanpa `X-Listener-Secret` — gerbangnya kini shared secret,
bukan JWT. Assert `[401, 503]`: 401 bila secret terpasang, 503 bila belum diset (fail-closed).
Yang dijaga: **tidak pernah 2xx**, karena 2xx berarti pembayaran bisa dipalsukan tanpa kredensial.

**Konsekuensi yang berubah dari catatan sebelumnya:** rollback dengan mengosongkan
`VITE_GOPAY_QRIS_URL` **tidak lagi** mengembalikan ke Duitku — sekarang jatuh ke invoice `mock`
(konfirmasi manual). Env itu jadi wajib di produksi.

#decision #billing #gopay #cleanup #keputusan-user

### Fersaku ikut dicabut — tinggal 3 Edge Function

Menyusul pencabutan Duitku, `fersaku-webhook` dihapus juga. Sisa Edge Function: `gopay-listener`,
`delete-account`, `health`.

**Temuan F1 jadi usang, tapi pelajarannya diwariskan.** F1 (webhook fail-open saat secret kosong:
`signatureOk = !secret`) hidup di `fersaku-webhook`. Fungsinya sudah tidak ada, jadi entri temuan
ditandai usang — bukan dihapus, karena riwayat audit tetap berguna. Polanya sudah diterapkan sejak
baris pertama di `gopay-listener`: secret kosong → `503`, tidak pernah lolos.

**Migrasi lama tidak disentuh.** `0015` dan `0022` menyebut Fersaku di komentarnya. Migration yang
sudah ter-apply adalah catatan sejarah — menulis ulang komentarnya hanya bikin file dan database
tidak sinkron tanpa manfaat.

#decision #billing #cleanup #keputusan-user

### Bug keamanan: `revoke from public` tidak menutup anon/authenticated di Supabase (`0044`)

**Ditemukan lewat probe langsung ke staging**, bukan lewat review kode — dan itu poinnya.
`claim_gopay_payment` dipanggil tanpa Authorization apa pun membalas `null` (jalur "tidak ada
invoice cocok"), artinya **fungsi benar-benar dieksekusi oleh role `anon`**. Padahal `0043`
mendokumentasikannya sebagai service_role-only.

**Akar masalah.** Supabase memasang default privileges yang meng-grant EXECUTE **eksplisit ke
`anon` dan `authenticated`** untuk tiap fungsi baru di schema `public`. `revoke execute ... from
public` hanya mencabut grant ke pseudo-role PUBLIC, tidak menyentuh grant eksplisit ke dua role
itu. Asumsi "revoke from public = tertutup" salah di Supabase, dan diam-diam salah.

**Kenapa tidak jadi bencana.** Guard pemanggil di `apply_payment` (`0022`) menolak siapa pun yang
bukan service_role atau owner, jadi klaim anon gugur sebelum invoice ditandai lunas — tidak ada
langganan gratis. Sisa dampaknya tetap nyata: anon bisa memicu `expire_stale_gopay_invoices`, dan
bisa membedakan nominal invoice yang terbuka (`null`) dari yang tidak (error).

**Pelajaran yang lebih besar dari bug-nya:** seluruh pertahanan bergantung pada guard di fungsi
**lain**. Siapa pun yang melonggarkan `apply_payment` setahun lagi membuka celah langganan gratis
tanpa menyadarinya, karena `0043` mengklaim dirinya sudah aman. Pertahanan harus berdiri di fungsi
yang bersangkutan.

**Perbaikan dua lapis (`0044`):** revoke ke `anon`/`authenticated`, **dan** guard
`auth.role() <> 'service_role'` di dalam `claim_gopay_payment`. Lapis kedua yang menentukan —
grant bisa muncul lagi sendiri saat fungsi dibuat **pertama kali** di environment baru (produksi),
karena default privileges berlaku saat CREATE, bukan saat CREATE OR REPLACE.

**Jebakan turunan yang hampir saya buat.** Draf pertama memberi guard `auth.role()` juga pada
`expire_stale_gopay_invoices()`. Itu akan mematikan pembuatan invoice: fungsi tersebut dipanggil
dari dalam `start_gopay_invoice`, yang pemanggilnya owner ber-JWT `authenticated`.
`SECURITY DEFINER` mengganti `current_user` (sehingga pemeriksaan hak EXECUTE lolos sebagai pemilik
fungsi) tetapi **tidak** mengganti `auth.role()` yang membaca klaim JWT. Untuk fungsi itu
pencabutan grant sudah cukup — panggilan internal aman, panggilan langsung dari luar ditolak.

#decision #security #billing #gopay #postgres

### Verifikasi end-to-end listener GoPay di staging — LULUS (15 Agu 2026)

Seluruh rantai terbukti di infrastruktur nyata (Xiaomi + GoPay Merchant + staging
`fpwwswngqpftaixdlozo`), bukan hanya unit test:

- **HP baca notifikasi** — logcat `pkg=com.gojek.gopaymerchant`, teks `Pembayaran QRIS statis diterima Rp … di K24 Service, CMH SLTN.`
- **HP → fungsi** — log `GopayListener: HTTP 200` setelah transfer QRIS asli. Kode 200 = secret cocok + fungsi menerima.
- **auth listener** — POST tanpa/`salah` secret → `401` (fail-closed terbukti).
- **korelasi + apply** — `claim_gopay_payment(199860)` (via service_role) mengembalikan UUID invoice; status invoice → `paid`, plan diperpanjang.
- **idempotensi** — klaim kedua nominal sama → `null` (invoice bukan pending lagi). Notifikasi ganda tidak dobel-kredit.

Jebakan operasional yang tercatat saat verifikasi (jangan diulang):
1. **APK diedit ≠ APK terpasang.** File Kotlin benar, tapi HP masih menjalankan build lama `DISCOVERY_MODE=true` → notifikasi cuma dicatat, tak diteruskan. Wajib build **dan** install ulang.
2. **Reinstall memutus notification listener.** Setelah `adb install -r`, toggle Notification access harus dimatikan-hidupkan agar service versi baru ter-bind.
3. **Buffer logcat Xiaomi cepat berputar.** Nyalakan `logcat` sebelum memicu notifikasi, jangan sesudah.

#decision #billing #gopay #verifikasi #staging

### Dashboard operator: kenapa di luar AuthGate, dan kenapa guard diperluas (`0045`)

Vendor FixMaster tidak punya cara melihat kondisi klien sama sekali — semua akses org-scoped, dan
satu-satunya alat pemulihan pembayaran GoPay yang meleset adalah skrip manual bersenjata service
key. `0045` + `/operator` menutup itu.

**Di luar `AuthGate` — keharusan, bukan preferensi gaya.** `AuthGate` menjalankan
`getMyMembership()`; akun tanpa membership dilempar ke Wizard setup. Akun operator **memang** tidak
punya membership (justru bagus: kalau RLS salah pun ia bukan tenant siapa pun). Menaruhnya di dalam
AuthGate akan menjebak operator di wizard pembuatan toko. Jadi route-nya sibling top-level, dan
halaman mengurus sendiri init auth + login + gerbang admin. Preseden persis: `/reset-password`.

Turunannya: saat bukan admin, halaman menampilkan panel "akses ditolak" dan **tidak**
`<Navigate to="/">` seperti `OwnerRoute` — redirect itu justru melempar akun tanpa membership ke
Wizard tenant, gejala membingungkan untuk sebab yang sederhana.

**Guard `apply_payment` diperluas, bukan dibungkus.** Pilihan lain adalah `admin_apply_payment`
yang memalsukan `request.jwt.claims` jadi `service_role` sebelum memanggil `apply_payment`. Ditolak:
pemalsuan klaim menyamarkan siapa pemanggil sebenarnya dan membuat audit menyesatkan. Menambah
`and not is_platform_admin()` di guard itu satu baris, eksplisit, dan bisa dibaca setahun kemudian.

**Metadata + jumlah agregat saja.** Keputusan produk sekaligus keamanan: vendor perlu tahu klien X
jatuh tempo atau dormant, bukan membuka daftar pelanggan klien X. God-view atas data bisnis privat
semua klien adalah risiko kepercayaan yang tak sepadan, dan bikin satu kebocoran jadi fatal. Ada
tes yang mengasersikan tidak ada kolom bocoran di hasil RPC.

**Bug yang tertangkap linter, dan ternyata bug nyata.** Draf pertama me-reset `admin` lewat
`setAdmin(null)` sinkron di dalam `useEffect`. `react-hooks/set-state-in-effect` menolaknya, dan
setelah dilihat lagi itu memang cacat: nilai `admin` dari akun **sebelumnya** bisa terbaca sesaat
saat berganti akun — di permukaan lintas-tenant. Diperbaiki dengan menyimpan `{ userId, ok }` lalu
**menurunkan** `admin` dari perbandingan dengan `userId` aktif, sehingga ganti akun otomatis
mengembalikan status ke "belum diketahui" tanpa effect apa pun.

**Penyimpangan i18n yang disengaja.** Halaman ini memakai string literal Indonesia, bukan `useT()`
(AGENTS.md §3). Alasan: surface internal vendor-only, tak pernah dilihat klien, takkan
diterjemahkan; menambah ~30 kunci di `id.ts` **dan** `en.ts` (paritas dijaga `i18n.test.ts`) hanya
menambah beban. Preseden: BillingTab & FinancePage 100% literal. Disetujui user saat perencanaan.

**Sengaja belum dibangun:** analitik/kohort, drill-down per-org, impersonasi login sebagai klien,
edit data tenant, akses isi bisnis klien.

#decision #security #operator #lintas-tenant #keputusan-user

### Egress Supabase lewat kuota: GlobalSearch menarik tabel penuh di setiap halaman

**Gejala.** Org Supabase melewati kuota egress Free Plan (5 GB) di siklus sebelumnya; masa tenggang
berakhir 7 Sep 2026, setelahnya request dibalas **402**. Produksi ada di org yang sama, jadi 402
berarti aplikasi klien **dan** `gopay-listener` mati bersamaan.

**Diagnosis dari data, bukan tebakan.** Breakdown dashboard: **PostgREST 99,9%**, Auth 46 KB,
Realtime **16 KB**, Functions 72 byte. Per project: produksi ≈3,5 GB, staging ≈40 MB. Jadi bukan
Storage, bukan Realtime, dan bukan pekerjaan pengembangan — murni query database dari pengguna
produksi. (Dugaan awal bahwa lonjakan 14–15 Agu berasal dari sesi dev kami **salah**: staging hanya
~1 MB di hari itu.)

**Akar masalah.** `GlobalSearch` hidup di `Topbar` → `AppLayout`, jadi **ter-mount di setiap halaman
terautentikasi**, dan memanggil `useCollection` untuk `services`, `customers`, `inventory` tanpa
syarat. Karena `list()` = `select('*')` tanpa limit eksplisit, tiap halaman menarik tiga tabel
penuh — `services` membawa `history jsonb` yang append-only dan tumbuh selamanya. Lebih buruk:
`useCollection` meng-invalidate cache pada tiap event realtime, jadi **satu perubahan tiket oleh
siapa pun memicu tarikan tabel penuh di setiap device yang online**, di halaman apa pun, bahkan bila
pengguna tak pernah menyentuh kolom pencarian.

**Perbaikan.** `useCollection(collection, { enabled })` — `enabled: false` melewati fetch **dan**
langganan perubahan. GlobalSearch kini `enabled: open || raw.length > 0`, jadi datanya dimuat hanya
setelah kolom pencarian diaktifkan. Dropdown membedakan "Memuat data…" dari "Tidak ada hasil" supaya
hasil tidak terlihat kosong sesaat. Dijaga `src/hooks/useCollection.test.tsx` (4 tes) agar opsi itu
tak hilang tanpa sengaja.

`staleTime` 30 s → 5 menit. Aman karena kesegaran di aplikasi ini **tidak** bergantung pada timer:
`useCollection` invalidate lewat event realtime, dan realtime egress-nya KB melawan PostgREST MB.
`refetchOnReconnect: 'always'` tetap jadi jaring pengaman bila channel realtime mati diam-diam.

**Yang SENGAJA tidak dilakukan.** Rencana awal "buang `history` dari query daftar" **ditarik setelah
membaca kode**: `StatusModal.tsx:210`, `ServiceDetailPage.tsx:400`, `ServicesPage.tsx:104`, dan
`ServiceModal.tsx:174` melakukan `[...service.history, entriBaru]` — read-modify-write dari koleksi.
Menghapus kolom itu dari daftar akan **menghapus seluruh jejak audit tiket** pada perubahan status
berikutnya. Kehilangan data permanen, bukan sekadar tampilan kosong. Perbaikan yang benar (append
history di sisi server via RPC) adalah refactor tersendiri dan tidak boleh dikerjakan di bawah
tenggat kuota.

**Sisa yang masih layak, urut leverage:** paginasi `activity_logs` (satu konsumen saja,
`ActivityLogPage`, display-only, punya `meta jsonb`), perluas pemakaian `useCollectionRange` untuk
`sales`/`incomes`/`expenses`, lalu baru pindahkan append `history` ke server.

#decision #performance #egress #supabase #biaya

### Paginasi Daftar Servis, dan kenapa KPI tetap dihitung dari data penuh

Halaman `/services` menggambar **seluruh tiket sejak toko berdiri** tanpa batas — dua kali, karena
tabel desktop dan kartu mobile keduanya memetakan array yang sama. Untuk bengkel yang sudah lama
jalan itu ribuan node DOM per render.

**Perbaikan:** `shownRows = rows.slice(0, limit)`, `PAGE_SIZE = 100`, footer "Tampilkan lebih
banyak". Pola dan nama class (`.loadMore`, `.loadMoreHint`) **dipakai ulang** dari `FinancePage`
yang sudah punya solusi identik — bukan bikin baru. `limit` di-reset saat filter berubah, mengikuti
preseden yang sama.

**Keputusan yang menentukan: `stats` TIDAK ikut dipotong.** Lima KPI tetap dihitung dari `visible`
(seluruh tiket non-arsip). Godaannya besar untuk memakai `shownRows` supaya "konsisten dengan yang
terlihat" — itu salah. "Total Servis" dan "Pendapatan Aktual" akan berubah mengikuti seberapa
banyak baris yang kebetulan sudah dimuat, menghasilkan laporan uang yang menyesatkan tanpa satu
pun error. Sama jenisnya dengan jebakan yang membuat kami menolak memangkas baris demi egress:
angka salah yang sunyi lebih berbahaya daripada halaman lambat.

Terverifikasi di render asli (demo, komponen sama): filter "Lunas" → 3 baris, footer
`3 dari 3 tiket · 6 total`, KPI tetap `6` dan `Rp 3.550.000`.

**Batas yang jujur:** ini paginasi **render**, bukan query. Egress belum berkurang karena
`useCollection` masih menarik koleksi penuh. Memangkas egress butuh limit sisi server **plus** RPC
agregat untuk KPI — tanpa RPC itu, KPI-nya pasti salah. Itu pekerjaan tersendiri, bukan tambahan
satu baris.

#decision #ux #performance #servis

### Log Aktivitas: jendela waktu di query — pemangkasan egress yang benar-benar memangkas

Lanjutan pekerjaan egress. Berbeda dari Daftar Servis (yang hanya bisa dipaginasi di sisi render),
`activity_logs` bisa dipangkas **di query** dengan aman, dan alasannya spesifik:

- konsumennya **tepat satu** halaman (`ActivityLogPage`) — tak ada agregat lain yang bergantung padanya
- sifatnya **display-only**: tak ada KPI uang yang dihitung dari keseluruhan tabel
- `useCollectionRange` + `rangeForTimestamp` **sudah ada** dan sudah dipakai FinancePage untuk
  koleksi `activity` yang sama — jadi ini menerapkan pola terbukti, bukan menciptakan yang baru

Sebelumnya `useCollection('activity')` menarik seluruh tabel. Karena tabel ini append-only, tumbuh
selamanya, dan tiap baris membawa `meta jsonb`, ia penyumbang egress besar. **Ironisnya halaman itu
juga tidak benar-benar berfungsi**: hasilnya dipotong diam-diam oleh cap `max_rows` PostgREST (1000),
jadi event lama tak pernah terjangkau meski pengguna mempersempit filter — nasihat di UI
("Persempit filter untuk melihat event lama") menjanjikan sesuatu yang tak bisa ditepati.

Kini jendela = bulan ini, dengan tombol **"Muat bulan sebelumnya"**. Jadi ini memperbaiki egress
**dan** keterjangkauan data sekaligus.

Dua detail yang menentukan benar/salahnya:
1. Readout dilabeli **`TERMUAT`**, bukan `TOTAL`. Angkanya kini jumlah event dalam jendela. Label
   `TOTAL` akan membuat owner menyimpulkan timnya lebih sepi dari kenyataan — angka salah yang
   sunyi, kelas kesalahan yang sama yang kami hindari di KPI Daftar Servis.
2. Tombol muat-bulan-lama dirender **di luar** cabang loading/empty/isi. Kalau tidak, bulan sepi
   jadi jalan buntu: "Belum ada aktivitas" tanpa cara memuat bulan sebelumnya.

Terverifikasi di render asli: `TERMUAT` tampil (`TOTAL` hilang), hint `Bulan ini · 19 event termuat`,
klik tombol → `2 bulan terakhir · 19 event termuat`, nol error console.

#decision #performance #egress #activity

### Pemisahan rilis: egress ke produksi, cutover GoPay ditahan (17 Agu 2026)

Permintaannya "push sampai ke production". Merge `staging` → `main` **ditolak** setelah menelusuri
isinya, dan yang ditemukan lebih buruk dari dugaan awal.

**Jebakannya.** `staging` membawa commit yang mencabut jalur Duitku dari frontend
(`createPaymentInvoice` dihapus). Di produksi `VITE_GOPAY_QRIS_URL` masih kosong, jadi `subscribe()`
jatuh ke `startSubscription()` → invoice `provider: 'mock'`. Dan cabang mock di pay dock
menampilkan tombol **"Saya sudah bayar"** → `applyPayment()` → guard `0022` mengizinkan
`is_org_owner`.

Jadi konsekuensinya bukan "produksi berhenti menagih", melainkan **setiap pemilik toko mendapat
tombol perpanjang-langganan gratis**. Hari ini tombol itu praktis tak pernah muncul karena invoice
produksi ber-provider `duitku`; setelah merge, `mock` jadi jalur default. Runbook Fase 5.4 sebelumnya
hanya menulis "tidak menagih apa pun" — **meremehkan**, dan sudah dikoreksi jadi CAUTION.

**Yang dikerjakan sebagai gantinya.** Branch `perf/egress-hotfix` dari `origin/main`, lalu
`git checkout staging -- <8 file sumber>` — bukan cherry-pick commit, karena commit-commit itu juga
menyentuh `AGENTS.md` dan vault sehingga pasti konflik. Mengambil file sumbernya saja menghasilkan
diff bersih tanpa resolusi konflik.

Verifikasi bahwa pemisahannya benar (bukan sekadar percaya daftar file):
- `git diff --name-only origin/main` → tepat 8 file, semuanya UI/hooks
- `ls supabase/migrations/ | tail` → berhenti di `0042` (0043/0044/0045 tidak ikut)
- `ls supabase/functions/` → `create-invoice` & `duitku-webhook` **masih ada** → billing produksi tak berubah
- jumlah test **445** = 441 (baseline main) + 4 (useCollection). Kalau ada yang menyusup, angkanya
  tidak akan pas. Aritmetika ini dipakai sebagai gerbang, bukan basa-basi.

**Konsekuensi yang diterima:** `AGENTS.md` di `main` menyebut 445 test, di `staging` 457 → konflik
sepele saat Fase 5 di-merge nanti. Dokumentasi vault untuk perubahan egress sengaja **tidak**
diduplikasi ke branch hotfix; ia menyusul bersama merge `staging`.

**Pelajaran yang berlaku umum:** branch panjang-umur yang mencampur *perbaikan mendesak* dengan
*fitur setengah jadi* memaksa pilihan antara menunda yang mendesak atau merilis yang belum siap.
Kalau ada perbaikan mendesak lagi sementara `staging` masih memuat cutover, pakai pola yang sama:
branch dari `main`, ambil file sumbernya saja, verifikasi dengan tiga cek di atas.

#decision #rilis #deploy #billing #keputusan-user

### Promo tidak boleh tanpa jejak — dan kenapa ia dipisah dari pembayaran (`0046`)

Pertanyaan user: kalau ada promo penambahan masa aktif, apakah kemampuan mengubah masa aktif
**tanpa rekam jejak** tetap perlu diadakan? Jawabannya tidak, dan alasannya bukan kepatuhan.

**Promo adalah satu-satunya perubahan masa aktif yang tak punya bukti pendamping.** Pembayaran
meninggalkan mutasi di GoPay Merchant — log yang hilang masih bisa direkonstruksi dari sana. Promo
tidak: tak ada uang, tak ada notifikasi, tak ada sumber kedua. Sekali tidak dicatat, hilang permanen.

**Yang ikut hilang bukan cuma jejak audit.** Tanpa membedakan bulan yang DIBAYAR dari bulan yang
DIBERIKAN, angka retensi jadi fiksi: "klien X aktif 5 bulan berturut-turut" bisa berarti 3 bulan
bayar + 2 bulan promo yang sudah dilupakan. Itu persis merusak satu-satunya hal yang harus
dibuktikan Fase 0 di `docs/roadmap-penjualan.md` — bahwa orang mau **membayar**, bukan sekadar
memakai. Scorecard-nya punya baris "Niat bayar"; tanpa pemisahan ini baris itu tak bisa dijawab
jujur. Saat mulai menjual, "berapa MRR saya?" jadi pertanyaan tanpa jawaban.

**Karena itu `admin_apply_promo` DIPISAH dari `apply_payment`,** bukan digabung sebagai "extend
dengan flag". `apply_payment` tetap berarti uang sungguhan masuk, sehingga pertanyaan "bulan ini
berapa yang dibayar, berapa yang digratiskan" bisa dijawab satu query.

**Kekhawatiran wajar "pencatatan bikin lambat" dijawab dengan desain, bukan pengecualian:** RPC yang
menulis log, bukan operator; dan promo dipilih dari **daftar bernama** (Founding member, Kompensasi
gangguan, Perpanjang trial pilot), bukan kotak hari kosong. Nol beban tambahan, dan hasil sampingnya
lebih berharga daripada audit — jadi bisa dijawab "promo mana yang menghasilkan klien bertahan".

**Alasan wajib untuk suspend & promo** ditegakkan di RPC (menolak string kosong), bukan cuma di form.
Suspend mematikan operasional sebuah usaha; jejak tanpa alasan tidak menjawab pertanyaan yang pasti
ditanyakan berbulan-bulan kemudian.

**`suspended` ternyata sudah ada dan sudah ditegakkan** sejak `0009` — `is_org_active()` false → RLS
memblokir semua operasi tulis org itu. Yang hilang selama ini cuma tuasnya. Jadi fitur "suspend"
bukan menambah kemampuan baru ke sistem keamanan, hanya memberi pegangan pada yang sudah dibangun.

#decision #operator #audit #billing #promo

### `CREATE OR REPLACE` tak bisa mengubah tipe kembalian — dan jebakan grant setelah DROP (`0046`)

`supabase db push` untuk `0046` gagal:

```
ERROR: cannot change return type of existing function (SQLSTATE 42P13)
Row type defined by OUT parameters is different.
```

`0045` membuat `admin_list_orgs()` dengan 13 kolom OUT; `0046` menjadikannya 17 (tambah kolom
scorecard + catatan). **`CREATE OR REPLACE FUNCTION` tidak bisa mengubah tipe kembalian** — termasuk
susunan kolom `RETURNS TABLE`. Harus `drop function if exists ...` lebih dulu.

**Berlaku untuk migrasi mana pun yang menambah/menghapus kolom pada RPC ber-`RETURNS TABLE`.**
Ini akan terulang; catatan ini ada supaya tidak perlu didiagnosis ulang.

**Migrasi Supabase atomik — itu penyelamatnya.** Diverifikasi setelah kegagalan: `operator_actions`
dan `client_notes` belum terbuat (`PGRST205`), fungsi `0046` belum ada (`PGRST202`). Rollback penuh,
tak ada state setengah jadi yang perlu diperbaiki tangan.

**Jebakan turunan yang nyaris lolos.** `DROP` + `CREATE` membuat **DEFAULT PRIVILEGES Supabase
memasang ulang EXECUTE untuk `anon` dan `authenticated`** — persis lubang `0044`. Kalau `0046` hanya
menambahkan `drop` tanpa me-revoke ulang, `admin_list_orgs` kembali terbuka untuk anon **secara
diam-diam**, dan tak ada tes yang gagal karena `tier2c` menguji penolakan lewat gate
`is_platform_admin()` (yang tetap menolak) — bukan lewat lapisan grant.

Jadi aturannya: **setiap `drop function` pada RPC admin wajib diikuti `revoke ... from public, anon`
+ `grant ... to authenticated` di migrasi yang sama.** Terverifikasi lewat probe REST pasca-apply:
`admin_list_orgs` membalas `42501` untuk anon.

**Catatan probe yang ikut dipelajari:** `PGRST202` **bukan** bukti fungsi belum ter-deploy. PostgREST
mencocokkan nama **dan tanda tangan**, jadi body `{}` untuk fungsi berparameter juga menghasilkan
`PGRST202`. Dua kali di sesi ini hal itu hampir menghasilkan kesimpulan salah — kirim argumen yang
benar dulu sebelum menyimpulkan.

#decision #postgres #migrasi #security #supabase

### Audit UI menyeluruh (desktop + mobile, 2 tema) — 5 bug layout ditemukan & diperbaiki

Audit visual sistematis: 12 menu × 2 breakpoint (1440px / 390px) × 2 tema, via
`scripts/audit-ui.mjs` (dijalankan terhadap server mode-lokal terisolasi, `THEME` env baru
ditambahkan) + verifikasi DOM langsung (bounding rect, bukan cuma baca screenshot) untuk tiap
temuan yang meragukan. Tiga dugaan awal **dibuang** setelah diverifikasi salah — nav mengambang
di tengah konten ternyata artefak `fullPage` screenshot pada `position:fixed` (bukan bug), jarak
antar tab Keuangan yang terlihat menempel di gambar terkompresi ternyata konsisten 4px di DOM
sungguhan, dan proporsi bar grafik Laporan yang terlihat janggal ternyata matematisnya benar
(100% vs 81,69%, sesuai rasio Rp 3.550.000/Rp 2.900.000). Disiplin ini penting — jangan laporkan
apa yang "terlihat aneh" di gambar tanpa mengonfirmasi lewat kode/DOM.

**Lima bug nyata, semua terverifikasi lewat pengukuran DOM sebelum DAN sesudah fix:**

1. **Badge status tertimpa kolom AKSI sticky — tabel Servis desktop 1440px, kedua tema.**
   `KONFIRMASI BIAYA`→`KONFIRMA`, `DITERIMA`→`DITERIM`. Root cause SEBENARNYA bukan "terpotong
   tepi viewport" seperti dugaan awal, melainkan **kolom AKSI (`position:sticky; right:0`,
   background solid) menimpa ekor badge STATUS** karena tabel 10-kolom (owner view) 103px lebih
   lebar dari wrapper-nya — dibuktikan lewat bounding rect: badge "Konfirmasi Biaya" (1139–1312px)
   vs AKSI mulai di 1215px, overlap 97px, PERSIS menjelaskan sisa teks yang hilang.
   [ServicesPage.module.css:208-243](src/features/services/ServicesPage.module.css:208): padding
   sel 12px→6px menutup gap 103px itu tepat (diverifikasi: overflow 0px, overlap 0px pada keenam
   baris termasuk label terpanjang). Ditolak: fade-gradient di tepi tabel — `Card glass` di
   baliknya transparan/blur, patch background solid untuk masking akan merusak efek glass.

2. **Kartu wallet/ringkasan Keuangan + KPI Dashboard mobile — kartu ke-3+ tersembunyi total.**
   `grid-auto-columns: minmax(230px, 82vw)` pada breakpoint mobile ternyata **tidak** resolve ke
   82vw seperti niatnya — `minmax()` pada non-`fr` auto-column bersifat sizing intrinsik (tumbuh
   mengikuti KONTEN, dibatasi max), jadi kartu pendek settle di ~230px (nilai MIN), menyisakan
   ~1,5 kartu terlihat dengan peek besar-tapi-terpotong-di-tengah-angka. Untuk Dashboard (5 kartu),
   3 kartu berisi Rp (Pemasukan/Pengeluaran/Total Saldo) **100% tak terlihat, nol indikasi**.
   Fix: ganti `minmax()` dengan `clamp(230px, 76vw, 300px)` — `clamp()` SELALU resolve ke satu
   nilai pasti terlepas dari konten, memaksa tiap kartu lebar sama sehingga peek kartu berikutnya
   jadi sliver kecil konsisten (~40-46px, diverifikasi), bukan potongan besar yang terlihat rusak.
   [FinancePage.module.css:297-311](src/features/finance/FinancePage.module.css:297),
   [DashboardPage.module.css:572-583](src/features/dashboard/DashboardPage.module.css:572) (pola
   sama, ditemukan & diperbaiki sekalian saat mengerjakan #2 — bukan di daftar temuan awal).

3. **Angka nilai stok terpotong tengah digit — strip ringkasan Inventori mobile.**
   `Rp 14.145.000`→`Rp 14.145.00` (nol terakhir hilang, tanpa ellipsis) — pola `overflow-x:auto`
   serupa #2 tapi pada 4 chip inline, bukan kartu. Fix: hapus override `flex-wrap:nowrap` di
   breakpoint mobile, biarkan fallback ke `flex-wrap:wrap` dasar. Dengan hanya 4 chip pendek,
   wrap 2-baris lebih robust daripada scroll — Rp figure SELALU utuh, diverifikasi 0px overflow.
   [InventoryPage.module.css:316-333](src/features/inventory/InventoryPage.module.css:316).

4. **Tombol edit template melompat sendiri ke baris baru — Tugas Internal mobile.**
   Naik/turun dibungkus `.orderBtns` (satu unit `flex-shrink:0`), tapi pensil adalah sibling
   terpisah di `.groupHead` — saat wrap, `.orderBtns` tetap utuh tapi pensil sendirian pindah baris
   dengan jarak kosong janggal. Fix: wrapper baru `.groupActions` membungkus KEDUANYA sebagai satu
   unit (bukan menyatukan ke `.orderBtns` — itu akan ikut menyusutkan pensil ke lebar 26px yang
   memang didesain khusus untuk pasangan panah). Diverifikasi: ketiga tombol kini satu baris
   (top identik). [TasksPage.tsx:298-327](src/features/tasks/TasksPage.tsx:298),
   [TasksPage.module.css:259-275](src/features/tasks/TasksPage.module.css:259).

5. **Nama device/teknisi terpotong tak konsisten — Dashboard mobile (Servis Terbaru & Performa
   Teknisi).** `.recentDetail`/`.leaderName` punya `overflow:hidden` yang **implisit menjadikan
   automatic min-width flex-nya 0** (per spesifikasi CSS: elemen non-`visible` overflow kehilangan
   content-based minimum), sementara sibling (Badge/`.leaderStats`) `white-space:nowrap` tak
   pernah menyusut — nama pendek ("Samsung A52") bisa terpotong LEBIH agresif daripada nama
   panjang, semata tergantung lebar badge tetangganya ("Konfirmasi Biaya" = 155px vs "Lunas" =
   70px, diukur presisi lewat DOM). Fix: `min-width:100px` sebagai lantai + `flex-wrap:wrap` pada
   baris — badge lebar jatuh ke baris sendiri, badge pendek tetap sebaris dengan nama penuh.
   Diverifikasi enam kombinasi nama+badge: badge lebar → wrap + nama utuh; badge pendek → sebaris
   + nama utuh; SATU nama yang genuinely panjang ("MacBook Pro 13\" 2019", 21 karakter) tetap
   ellipsis — itu benar, bukan lagi korban lebar badge tetangga.
   [DashboardPage.module.css:393-433](src/features/dashboard/DashboardPage.module.css:393) &
   [:533-556](src/features/dashboard/DashboardPage.module.css:533).

**Pelajaran metodologis yang berlaku umum:** `minmax(min, max)` pada `grid-auto-columns` BUKAN
"paksa ke nilai preferred" — itu sizing intrinsik yang bisa settle di `min`. Kalau niatnya
"kartu harus selalu N% lebar viewport terlepas dari konten", pakai `clamp(min, preferred, max)`,
bukan `minmax()`. Dan: `overflow:hidden` pada flex child mengubah automatic minimum size-nya jadi
0 secara implisit (spec CSS Flexbox §4.5) — sumber tersembunyi kenapa elemen ber-ellipsis kadang
menyusut jauh lebih agresif dari yang terlihat masuk akal, tanpa `min-width:0` eksplisit di mana
pun dalam kode.

Verifikasi: build hijau, lint bersih, 457 test lulus (tak ada test baru — murni CSS/JSX layout),
audit visual diulang penuh pasca-fix (dark + light) mengonfirmasi kelima perbaikan di data nyata.

#decision #ui #audit #css #flexbox #responsive
