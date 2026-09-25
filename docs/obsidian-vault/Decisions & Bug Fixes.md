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

> [!] **GlobalSearch sudah DIHAPUS 27 Agu 2026** (lihat entri terakhir catatan ini). Analisis
> egress di bawah tetap berlaku sebagai pelajaran — gerbang `enabled` pada `useCollection`
> juga masih ada — tapi konsumennya tinggal nol.

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

---

## Zoom browser 125-150% & laptop 1366px — tabel Servis dirender di lebar yang tak muat

**Tanggal:** 20 Agu 2026 · **Status:** selesai · **Cabang:** staging

Pertanyaan awalnya soal perbandingan zoom 100% vs 80%. Zoom browser tidak mengubah lebar jendela
fisik — ia mengubah berapa banyak CSS px yang muat di dalamnya. Jadi zoom **80% justru melegakan**
(1440px @ 80% = viewport 1800 CSS px) dan yang berbahaya adalah **zoom masuk**: 1440 @ 125% = 1152,
1920 @ 150% = 1280. Emulasi lebar viewport Playwright setara persis dengan zoom untuk urusan
layout dan media query, jadi seluruh rentang bisa diukur tanpa mengutak-atik zoom asli.

**Temuan.** Tabel `/services` punya 10 kolom dengan **min-content 1056px**, sementara wrapper =
viewport − 360px (sidebar + padding). Artinya tabel baru muat mulai **viewport 1416px**, tapi
breakpoint kartu baru aktif di `max-width: 1100px`. Ada pita **1101–1415px** di mana tabel tetap
dirender lalu overflow — dan kolom AKSI yang `position: sticky; right: 0` dengan background opaque
**menimpa** isi sel di bawahnya alih-alih sekadar menggeser. Terukur lewat DOM rect:

| viewport | ekuivalen | wrapper | overflow | yang tertimpa |
|---|---|---|---|---|
| 1101 | 1920 @ 175% | 741 | +315 | — |
| 1152 | 1440 @ 125% | 792 | +264 | kolom PROFIT |
| 1280 | 1920 @ 150% | 920 | +136 | kolom STATUS + badge |
| 1366 | laptop umum | 1006 | +50 | tepi STATUS |
| 1416 | — | 1056 | 0 | pas |

Pita ini bukan kasus pinggiran: **1366×768 adalah lebar laptop paling umum**, dan bug ini muncul
di sana tanpa zoom sama sekali. Fix padding `12px 6px` sebelumnya dikalibrasi persis di 1440px —
benar untuk lebar itu, tapi menyembunyikan bahwa margin selamatnya nol.

**Kenapa padding tidak bisa dilonggarkan.** Diukur: tiap **+1px padding samping menambah 20px**
kebutuhan viewport (10 kolom × 2 sisi). Padding 12px ⇒ butuh viewport 1536px, artinya laptop
1440px pun tak akan pernah melihat tabelnya. Angka 6px itu memang batas bawah yang perlu, bukan
pilihan estetis.

> [!] **Digantikan.** Angka `1415px` di bawah benar saat ditulis, tapi kemudian diganti
> `@container servisList (max-width: 1055px)` supaya ikut mengikuti zoom aplikasi. Jangan
> menerapkan ulang media query ini — lihat catatan zoom aplikasi berikutnya.

**Fix (satu baris).** Breakpoint `1100px` → `1415px`. Tabel hanya dirender di lebar yang benar-benar
memuatnya; di bawah itu kartu 2 kolom mengambil alih (terukur 353–502px per kartu, docOverflow 0).
Kartu memuat semua kolom kecuali *Modal*, jadi turun ke kartu lebih awal nyaris tak kehilangan data
— sedangkan tabel yang overflow justru **menyembunyikan** data di balik kolom sticky.
[ServicesPage.module.css:356](src/features/services/ServicesPage.module.css:356).

**Sisa yang sengaja dibiarkan.** `/reports` overflow +42px di pita 1025–1151px (transisi sidebar).
Tabel itu **tidak punya kolom sticky**, jadi isinya bergeser dan tetap terjangkau lewat scroll
horizontal — perilaku normal `overflow-x: auto`, bukan penyembunyian. Tidak diubah.

**Pelajaran metodologis.** Breakpoint responsif harus diturunkan dari **min-content konten yang
diukur**, bukan dari angka bulat yang enak dilihat. Dan kombinasi `overflow-x: auto` + kolom
`position: sticky` ber-background opaque itu gagal secara diam-diam: tanpa sticky, overflow cuma
berarti "scroll"; dengan sticky, overflow berarti "data tertutup". Setiap tabel dengan kolom
sticky wajib punya breakpoint yang menjamin ia tak pernah overflow.

Verifikasi: `scripts/audit-zoom.mjs` (11 lebar × 12 halaman) bersih pasca-fix; build hijau, lint
bersih, 457 test lulus (murni CSS — tak ada test baru).

#decision #ui #css #responsive #zoom #playwright

---

## Pengaturan zoom aplikasi — dan kenapa satu breakpoint harus jadi @container

**Tanggal:** 20 Agu 2026 · **Status:** selesai · **Cabang:** staging

Permintaan: zoom yang diatur di dalam aplikasi, bukan di browser. Kontrolnya di Topbar
(kurang / readout mono / tambah), 5 tingkat: 80 · 90 · 100 · 110 · 125%, disimpan di
`localStorage` dan dipasang oleh `initZoom()` sebelum React render.

**Mekanisme: properti CSS `zoom` pada :root, bukan `transform: scale()`.** `zoom` memicu reflow
sungguhan sehingga teks tetap tajam dan layout memakai ruang yang tersedia; `scale()` hanya
melar-kecilkan hasil render (teks buram, scrollbar salah, hit-area geser).

### Jebakan yang menentukan desain

**`zoom` menambah ruang layout tapi TIDAK menggeser media query.** Terukur pada viewport 1152px:
`zoom: 0.8` menaikkan ruang `<main>` dari 858px ke 1146px, sementara
`matchMedia('(max-width: 1415px)')` tetap `true`. Media query ber-satuan `em` juga tidak menolong —
`em` di media query selalu resolve ke font-size awal, bukan ke root (diuji: `88.4375em` tetap
match di root font-size 16px maupun 13px).

Akibatnya dua arah sama-sama salah kalau dibiarkan:
- zoom **keluar** → tabel yang sebenarnya sudah muat tetap disembunyikan;
- zoom **masuk** → tabel yang tak lagi muat tetap dirender lalu overflow, dan kolom AKSI yang
  sticky menutupi data (bug yang baru saja ditutup lewat breakpoint 1415px, kembali lewat pintu lain).

**`@container` adalah satu-satunya yang benar**, karena container query mengukur elemen dalam
koordinat layout yang sudah ter-zoom. Terverifikasi: di `zoom: 0.8` container melaporkan MUAT
saat media query masih melaporkan SEMPIT. Jadi breakpoint tabel Servis diubah dari
`@media (max-width: 1415px)` menjadi `@container servisList (max-width: 1055px)` — ambangnya
diturunkan ulang ke koordinat container (min-content tabel 1056px), dengan pembungkus baru
`.listArea` sebagai container. Hasil terukur:

| viewport | zoom | ruang | tampil |
|---|---|---|---|
| 1440 | 100% | 1080 | tabel |
| 1440 | 125% | 949 | kartu (benar — dulu overflow) |
| 1152 | 100% | 792 | kartu |
| 1152 | **80%** | 1080 | **tabel** (media query tak akan pernah bisa) |

### POS: breakpoint yang TIDAK bisa dijadikan container query

`@media (max-width: 1024px)` di POS terikat pada **kehadiran sidebar**, bukan pada ruang: di
≤1024px sidebar hilang sehingga `.layout` justru MELEBAR dari 667px ke 960px sambil berubah ke
1 kolom. Hubungannya terbalik — tak ada ambang container yang bisa menirukannya. Akar overflow-nya
ternyata lain dan lebih sederhana: kolom keranjang dipatok `400px` mati sementara containernya
menyusut. Diganti `minmax(320px, 400px)` sehingga trek itu bisa mengembalikan ruang sendiri.
Terverifikasi nol regresi: di zoom 100% kolom tetap 400px di 1025/1097/1280/1440, dan overflow
31px di 1097px @ 125% hilang.

### ~~Sisa yang sengaja dibiarkan~~ — SUDAH DIPERBAIKI 21 Agu 2026

> [!] Bagian ini **sudah tidak berlaku**. Saat itu `/reports` dibiarkan menggulung (+42px di 100%,
> +261px di 125% pada 1097px) dengan alasan tabelnya tanpa kolom sticky sehingga isinya tetap
> terjangkau. Alasan itu benar, tapi kesimpulan yang menyertainya — *"ambangnya terikat sidebar
> seperti POS"* — **SALAH**. POS tak bisa dikonversi karena hubungannya terbalik (di <=1024px
> sidebar hilang sehingga `.layout` justru MELEBAR sambil jadi 1 kolom). `/reports` tidak begitu:
> min-content-nya konstan 779px, jadi lebar wadahnya monoton terhadap kebutuhan dan satu container
> query menutupnya dengan bersih. Lihat [[#Tablet: dua pita meluber yang tak bisa dinyatakan satu
> media query]] — di sana overflow ini ikut hilang, termasuk di zoom 125%.

> **Pelajaran:** "tidak bisa dikonversi" pada satu halaman jangan digeneralisasi ke halaman lain
> tanpa mengukur ulang. Dua kasus yang tampak mirip (sama-sama tabel, sama-sama terpengaruh
> sidebar) ternyata berbeda secara mendasar.

### Pelajaran metodologis

Zoom aplikasi dan zoom browser TIDAK setara: browser memiliki viewport sehingga media query-nya
ikut, `zoom` tidak. Konsekuensinya, setiap breakpoint yang menjaga sesuatu dari overflow — bukan
sekadar mengatur selera tata letak — harus berbasis container begitu zoom in-app ada. Dan
breakpoint yang bergantung pada kehadiran elemen lain (sidebar) tidak bisa dikonversi sama sekali;
di sana ruang sempit harus diserap oleh trek grid-nya sendiri.

Verifikasi: `scripts/audit-zoom.mjs` (kini menerima `ZOOM=`, dipasang lewat localStorage supaya
bertahan lintas navigasi) disapu penuh di zoom 80/100/125% × 11 lebar × 12 halaman. Build hijau,
lint bersih, **463 test lulus** (+6 test baru untuk store zoom: langkah berhenti di ujung, 100%
menghapus properti `zoom` alih-alih menulis '1', dan nilai localStorage rusak jatuh ke 100%).

#decision #ui #css #responsive #zoom #container-queries #playwright

---

## Mobile: nol scroll horizontal, dan biaya sebenarnya dari carousel

**Tanggal:** 21 Agu 2026 · **Status:** selesai · **Cabang:** staging

Permintaan: mobile lebih padat, **tidak boleh ada apa pun yang bisa digeser ke samping**.
Disapu dengan `scripts/audit-mobile.mjs` (baru) di 320/360/375/390/414px x 12 halaman, yang
membedakan tiga hal: luberan dokumen, elemen yang benar-benar bisa di-scroll, dan teks terpotong.

### Empat carousel yang dibongkar

`DashboardPage.metrics`, `ServicesPage.stats`, `ReportsPage.metrics`, dan
`FinancePage.walletGrid/.summaryGrid` dulu carousel `scroll-snap`. Diganti grid dua kolom yang
membungkus, dengan `:last-child:nth-child(odd)` melebarkan kartu terakhir hanya bila jumlahnya
ganjil. Alasannya bukan sekadar menuruti permintaan: carousel **selalu menyembunyikan sebagian
isi di balik gestur yang tak terlihat** — catatan lama di kode sendiri mengakui tiga kartu uang
Dashboard "100% off-screen with no peek at all".

### Yang tidak terduga: memadatkan lebih penting daripada membungkus

Begitu kartu jadi ~138px di 320px, isinya tidak muat dan **terpotong diam-diam** — persis mode
gagal yang paling menyesatkan, karena "Rp 6.450.000" yang terpotong terbaca sebagai angka salah,
bukan teks dipendekkan. Terukur sebelum dipadatkan: nilai Reports terpotong 79px, saldo Finance
25px, label StatCard 12px. Perbaikannya bertingkat:

| Tempat | Akar | Perbaikan |
|---|---|---|
| StatCard | ikon 40px + gap + padding 32px memakan 84px dari 138px | padding 12px, ikon 32px, gap 8px |
| Reports `.metric` | ikon sebaris menyisakan ~74px untuk nilai (butuh ~106px) | ditumpuk (`flex-direction: column`) |
| Dashboard `.metricValue` | `clamp()` bertumpu di min 1.25rem | suku vw dinaikkan ke `4.6vw` |
| Finance saldo | `var(--text-xl)` mati | `clamp(0.95rem, 4.6vw, ...)` |

Pelajaran: untuk angka yang tak boleh terpotong, **`clamp()` ber-`vw` mengalahkan ukuran mati** —
ia menala dirinya lintas 320-414px tanpa satu media query per lebar.

### Sumber scroll lain yang ketemu

- **Settings** `.tabs` sengaja `flex-wrap: nowrap; overflow-x: auto`. Delapan tab tak akan pernah
  muat sebaris di 320px. Dibungkus jadi chip beberapa baris + padding/font dipadatkan.
- **Finance** `.tabBar` flex TANPA overflow, jadi ia memampat sampai memotong teks
  ("Pengeluaran" hilang 45px) alih-alih menggulung. Dibiarkan `flex-wrap: wrap`.
- **MobileBottomNav** `min-width` grid container default `auto` = min-content, sehingga lima label
  menolak menyusut dan kotaknya **melar melewati `left/right` yang sudah dipatok** (317px di layar
  320px). `min-width: 0` memaksanya menghormati inset. Jebakan halus: `minmax(0, 1fr)` pada trek
  TIDAK cukup — containernya sendiri juga perlu `min-width: 0`.
- **Suppliers** `.poSummary` `minmax(100px, 1fr)` x3 melebihi 288px yang tersedia; label+angka
  sebaris juga menonjol keluar. Jadi `minmax(0, 1fr)` + isi ditumpuk.
- **POS** harga + chip stok tak muat sebaris di kartu ~138px → `.productMeta { flex-wrap: wrap }`.
- **Kolom lebar-mati yang kurang beberapa piksel**: `.tapeDate` 76px (butuh 79px) dan
  `.docketTotal` 92px (butuh 101px). Ellipsis pada tanggal dan nominal terbaca seperti data rusak.

### Tabel Reports: dari menggulung jadi bertumpuk

Lima kolom tak akan pernah muat di 320px, dan menggulung ke samping justru menyembunyikan kolom
**Nominal** — yang paling dicari. Di <=720px baris tabel jadi flex yang membungkus: `thead`
disembunyikan (isinya swadeskripsi), kolom angka didorong ke kanan lewat `margin-left: auto`
(hanya yang pertama — `td.num ~ td.num` mereset sisanya), dan `.descCell` mengambil baris penuh.
Ditulis generik tanpa penempatan per-kolom karena kelas `.table` dipakai DUA tabel di halaman itu
(Piutang 4 kolom, Rincian Transaksi 5 kolom).

### Sisa yang sengaja dibiarkan

- ~~`/reports` masih menggulung +42px di pita **1025-1151px**~~ — **sudah diperbaiki** pada
  pekerjaan tablet di hari yang sama; lihat catatan Tablet di bawah.
- Ellipsis di 320px pada nama yang memang panjang ("PT Sumber Komponen") — kategori yang sudah
  ditetapkan benar pada audit sebelumnya.

Verifikasi: `audit-mobile.mjs` **nol scroll horizontal dan nol luberan dokumen** di 5 lebar x 12
halaman; pemeriksaan kliping bersih kecuali dua ellipsis di atas; sapuan desktop
(`audit-zoom.mjs`) tanpa regresi. Build hijau, lint bersih, 463 test lulus (murni CSS).

#decision #ui #css #responsive #mobile #playwright

---

## Tablet: dua pita meluber yang tak bisa dinyatakan satu media query

**Tanggal:** 21 Agu 2026 · **Status:** selesai · **Cabang:** staging

Lanjutan pembersihan mobile. Disapu di 744/768/810/834/912/1024/1025/1080/1112/1152/1180/1280px.
Hanya SATU pelanggar tersisa — tabel `/reports` — tapi bentuknya yang menarik: ia meluber di
**dua pita viewport yang terputus**, dengan pita bersih di tengahnya.

| viewport | wadah | min-content | selisih |
|---|---|---|---|
| 744 | 678 | 779 | **-101** |
| 834 | 768 | 779 | **-11** |
| 912 | 846 | 779 | +67 |
| 1024 | 958 | 779 | +179 |
| **1025** | **665** | 779 | **-114** |
| 1112 | 752 | 779 | **-27** |
| 1152 | 792 | 779 | +13 |

Penyebab lompatan 958 → 665 di 1024→1025px adalah **sidebar muncul**: viewport melebar 1px, ruang
konten menyusut 293px. Karena itu tak ada satu pun `@media (max-width: ...)` yang bisa menyatakan
"721-834 ATAU 1025-1151" — tapi kolom `wadah` di tabel di atas **kontinu dan monoton terhadap
kebutuhan**, jadi satu `@container laporanTabel (max-width: 778px)` menutup kedua pita sekaligus,
plus seluruh mobile. Ini pemakaian kedua pelajaran yang sama (lihat catatan zoom & ServicesPage):
**breakpoint yang menjaga sesuatu dari overflow harus berbasis wadah, bukan viewport.**

Ambang 779px stabil terhadap data karena `.descCell` dibatasi `max-width: 280px`, sehingga
min-content tabel tidak tumbuh mengikuti panjang keterangan.

### Dua jebakan saat memindahkan aturannya

1. **`.tableScroll { overflow-x: visible }` di dalam container query adalah aturan MATI** — sebuah
   container tak bisa ditata oleh container query-nya sendiri. Dibuang, bukan dibiarkan
   menyesatkan; saat bertumpuk memang tak ada yang meluber.
2. **Baris terbaca ragged (dua baris / tiga baris berganti-ganti).** Dua sebab bertumpuk:
   `flex-basis: 100%` pada `.descCell` dikalahkan `max-width: 280px` dari aturan dasar sehingga ia
   tetap muat sebaris; dan karena keterangan mendahului kolom Nominal di DOM, begitu ia mengambil
   baris penuh, Nominal terdorong ke baris KETIGA. Perbaikan: `max-width: none` + **`order: 1`**
   supaya keterangan jadi urutan terakhir. Hasil terukur di 1025px: tinggi baris 74px seragam
   untuk kedelapan baris (sebelumnya berganti-ganti).

Tabel Piutang dibungkus `.tableScroll` yang sama (satu baris JSX) supaya kedua tabel punya wadah
dan perlakuan identik — sebelumnya ia telanjang tanpa wadah dan tak pernah teruji karena data demo
tak punya piutang sehingga yang tampil `EmptyState`. Ambang 779px sedikit konservatif untuk 4
kolomnya, tapi dua tabel di halaman yang sama menumpuk bersamaan lebih koheren dibaca.

Verifikasi: sapuan tablet, mobile, desktop, DAN zoom aplikasi 125% semuanya **nol scroll
horizontal** — termasuk `/reports tbl+42` di 1097px yang sebelumnya sengaja dibiarkan, kini ikut
hilang. Build hijau, lint bersih, 463 test lulus.

#decision #ui #css #responsive #tablet #container-queries #playwright

---

## Global search dihapus (27 Agu 2026)

**Tanggal:** 27 Agu 2026 · **Status:** selesai · **Cabang:** staging

Permintaan user: hilangkan fitur pencarian global di Topbar. Dihapus utuh, bukan disembunyikan —
komponen yang tak dipakai tapi tetap ada akan terus ikut di-bundle dan tetap harus dirawat saat
tema/token berubah.

| Dihapus | Alasan |
|---|---|
| `src/components/layout/GlobalSearch.tsx` + `.module.css` | fiturnya |
| `src/lib/business/search.ts` + `search.test.ts` | hanya dipakai GlobalSearch (8 test ikut hilang) |
| `scripts/shoot-search-mobile.mjs` | seluruh skrip khusus memotret dropdown search |
| 2 shot search di `scripts/shoot-revisi.mjs` | selector `getByPlaceholder` akan gagal bila dijalankan ulang |
| blok `.search` di `Topbar.module.css` | **sudah mati sejak lama**: CSS Module men-scope per file, sedangkan `styles.search` tinggal di `GlobalSearch.module.css` — aturan di Topbar tak pernah kena elemennya |

### Yang SENGAJA ditinggal

- **Gerbang `enabled` di `useCollection`** (`{ enabled: false }` melewati fetch **dan** langganan
  realtime) tetap ada beserta 3 tes penjaganya, walau kini nol konsumen di kode produksi. Ia lahir
  dari insiden egress 16 Agu dan tesnya ditulis eksplisit "supaya opsi ini tidak hilang tanpa
  sengaja". Menghapusnya bukan bagian dari permintaan, dan komponen always-mounted berikutnya akan
  membutuhkannya lagi. Kalau dipandang mati, hapus terpisah dengan sadar.
- **Key i18n `common.search`** — sudah tak terpakai bahkan sebelum penghapusan ini.
- Ikon `magnifying-glass` tetap dipakai 7 pencarian per-halaman (Servis, Pelanggan, Inventori, POS,
  Log Aktivitas, picker sparepart, Lacak). Pencarian per-halaman TIDAK tersentuh — yang hilang hanya
  yang lintas-entitas di Topbar.

**Efek samping menyenangkan:** akar penyebab insiden egress terbesar (tiga tabel penuh ditarik di
setiap halaman, ditarik ulang tiap event realtime) kini hilang sepenuhnya, bukan sekadar
digerbangi.

Verifikasi: build hijau, lint bersih, **455 test lulus** (463 - 8), screenshot asli desktop 1440px +
mobile 390px dark/light — topbar rapi tanpa celah sisa, tak ada elemen yang bergeser.

> Sapuan `audit-mobile.mjs` **tidak** dijalankan: skrip itu butuh dev server mode lokal (root
> langsung Wizard "Isi data demo"), sedangkan `.env` sekarang membuat root jadi landing cloud.
> Menghapus satu flex child dari topbar tidak bisa menciptakan overflow baru, dan dua screenshot
> sudah membuktikan hasilnya. Kalau probe itu mau dipakai lagi, ia perlu diarahkan ke server tanpa
> env Supabase.

#decision #cleanup #ui #egress

---

## Dashboard dari panel status menjadi panel keputusan harian (28 Agu 2026)

Audit Impeccable memberi skor heuristic **21/40**: identitas “Precision Electronics Bench” kuat,
tetapi dashboard masih memamerkan status lebih daripada membantu pekerjaan berikutnya. Tiga P1
berasal dari akar yang berbeda:

1. **Notifikasi pasif** — konfirmasi biaya, stok rendah, dan unit siap diambil hanya teks. Kini
   `computeAlerts()` mengembalikan `kind/count/href`; UI menerjemahkan copy dan setiap baris menjadi
   link ke antrean terfilter. `ServicesPage` membaca `status`/`pickup`, `InventoryPage` membaca
   `stock` dan mendapat filter kondisi stok yang terlihat.
2. **Servis Terbaru palsu-sebagai-link** — `<li onClick>` tak bisa keyboard dan menuju `/services`,
   bukan tiket. Kini `<Link to=/services/:id>` dengan focus state, chevron, dan accessible name.
3. **Array kosong sementara berbohong.** `placeholderData: []` membuat UI aman dari `undefined`,
   tetapi `loading` lama dapat padam sebelum respons nyata; dashboard lalu menampilkan Rp0 atau
   “Belum ada servis” saat koneksi gagal. Hook kini mengekspos `refreshing/error/updatedAt`, dan
   `loading` tetap true selama placeholder aktif. Dashboard memakai skeleton, last-known timestamp,
   fault plate + retry, dan menahan semua angka bila query gagal sebelum punya data sah.

### Mobile & motion

Urutan lama pada 390×844: console 205 px → hero 186 px → grid KPI 359 px; Servis Terbaru baru
mulai sekitar y=1196. Kini console **74 px**, hero 153 px, **Perlu Tindakan** y=347–611, dan KPI
rail mulai y=631; tindakan nyata terlihat penuh di viewport pertama. KPI rail memang satu-satunya
horizontal scroller yang disengaja (kartu berikutnya mengintip), sesuai kontrak [[Design System]].
Label KPI terukur 12 px dan dokumen tetap nol overflow.

Detector awal menemukan `margin-left`, dua `padding-left`, dua `width`, dan easing dengan overshoot
sebagai animasi layout/bounce. Collapse sidebar dibuat diskrit; mobile drawer tetap memakai
`transform`; hover baris hanya mengubah warna; gauge/level-meter memakai `scaleX()`; easing global
diganti expo-out tanpa overshoot. Detector akhir: **0 temuan**.

Verifikasi: deep link konfirmasi memilih “Konfirmasi Biaya”, stok memilih “Stok Menipis”, dan klik
servis membuka ID tiket tepat. Render asli dark/light pada 1440×900 + 390×844; screenshot
`dash2-dark.png` diregenerasi. Build + lint hijau, **457/457 test**, audit mobile 320–414 px (hanya
KPI rail yang disengaja), tablet 744–1152 px, dan 11 kombinasi desktop/zoom semuanya tanpa overflow
dokumen atau clipping.

#decision #dashboard #accessibility #responsive #data-integrity #impeccable

---

## Landing V2: polish aksesibilitas + jalur muat signed-out (28 Agu 2026)

Audit Impeccable menemukan kontras teks light theme, focus ring transparan, ketiadaan skip link,
SMIL maskot yang tetap bergerak saat reduced motion, label mobile terlalu kecil, target sentuh di
bawah 44 px, dan pola section bernomor yang berulang. Semuanya diperbaiki tanpa menghilangkan
identitas `Repair Flow Console`: diagnostic spine sekarang pseudo-element, nomor hanya tinggal pada
alur reparasi, sedangkan hierarchy lain memakai judul, seam, LED, dan readout mono.

Warna dekoratif dipisahkan dari warna foreground melalui `--brand-text`, `--accent-text`,
`--success-text`, dan `--focus-ring`. Light theme terukur minimum 4.5:1 untuk teks langsung pada
permukaan solid. Landing punya skip link, outline keyboard solid, kontrol 44×44 px, teks informasi
mobile 14 px, container query `landing`, dan `Mascot` yang menghapus animasi SMIL ketika
`prefers-reduced-motion` aktif. Dua unit test menjaga perilaku maskot.

Jalur signed-out juga dipisah: `AuthGate` cukup memulihkan sesi cloud lalu lazy-load landing/auth;
bootstrap repository, wizard, PIN, dan shell pindah ke `WorkspaceGate`. `AppLayout` dan alias
preview ikut lazy. Hasil build: jalur awal turun sekitar **42 kB gzip** dibanding sebelum split;
vendor Supabase tetap eager karena pemulihan sesi cloud memang diperlukan.

Verifikasi: build hijau, lint bersih, **459/459 test**; dark/light dan mobile difoto ulang. Audit
langsung pada 390/744/834/980/981/1025/1440 px menghasilkan nol overflow dokumen dan nol target
interaktif di bawah 44 px; direct text-contrast audit nol pelanggaran. Deep link `/?auth=1`, FAQ,
skip link keyboard, dan alias preview tetap bekerja.

#decision #landing #accessibility #performance #responsive #impeccable

---

## Light mode tidak lagi pucat + sidebar channel hierarchy (28 Agu 2026)

**Masalah:** light mode memakai empat lapisan putih/abu yang terlalu dekat, shadow terlalu samar,
dan cyan muncul pada hampir semua icon sidebar. Akibatnya panel melebur, active channel kurang
tegas, LED idle tampak seperti status aktif yang pudar, dan channel Pro kehilangan keterbacaan
karena seluruh baris diberi `opacity`.

**Keputusan visual:** light theme menjadi **Bright Workshop Steel**—baja anodized abu-biru untuk
app/chassis, pelat putih untuk permukaan kerja, dan amber/cyan hanya untuk aksi atau status.
Token `rail-bg/well/panel/control/divider/active/shadow` ditambahkan untuk menjaga dark/light dari
satu sistem. Shadow panel light dipadatkan ke blur 8 px; depth utama datang dari jarak luminans,
divider, dan well, bukan ghost card.

Sidebar kini memakai graphite untuk icon idle, port cincin untuk LED tanpa sinyal, semantic ink
untuk readout kecil, serta full border + plate amber + icon cell solid untuk active channel. Side
stripe active dan seam `repeating-linear-gradient` dibuang. Channel terkunci tetap terbaca tanpa
opacity global; badge LED PRO tetap menjadi penanda plan. Selector cabang dan panel identitas
memakai chassis control yang sama.

Token foreground status (`warning-text`, `danger-text`, `info-text`, serta token yang sudah ada)
diterapkan pada Badge, StatCard, field error, dan dashboard metric/action. Ramp 400 yang luminous
tetap dipertahankan untuk layar readout gelap, sehingga light mode kuat tanpa merusak instrumen LCD.

Verifikasi: render browser dark/light desktop 1440×900, collapsed tower, Solo locked-state, drawer
tablet 834×1112, mobile 390×844, control deck, branch dropdown, dan landing light; semuanya nol
overflow dokumen. Audit teks langsung pada sidebar light menghasilkan nol pelanggaran kontras.
Detector Impeccable nol temuan; build dan lint hijau, **459/459 test lulus**. Screenshot rail dark/light diregenerasi dari
`/demo` lewat `scripts/shoot-sidebar.mjs` dan `scripts/shoot-locked-nav.mjs`.

#decision #light-mode #sidebar #design-system #accessibility #impeccable

---

## Landing V2: dari “rapi” generik ke bukti satu pencatatan (28 Agu 2026)

**Masalah:** hero “Konter tetap rapi” mudah dipahami tetapi sama dengan bahasa kategori.
Mekanisme paling khas FixMaster—sparepart terpakai mengurangi stok, masuk ke biaya tiket, lalu
membentuk margin—baru terbaca setelah fold. Rail sesudah hero berisi jaminan generik sebelum calon
klien mengenali masalahnya; demo aplikasi asli justru menjadi CTA kedua. Audit copy juga menemukan
tiga drift fakta: cloud disebut tetap bekerja offline, trial disebut membuka semua fitur walau
ekspor/impor dikecualikan, dan tombol Solo/Pro menyiratkan pilihan paket yang tidak dibawa ke auth.

**Keputusan narasi:** hero kini memimpin dengan **“Catat servis sekali. Stok dan margin ikut
terhitung.”** Lead menjelaskan hubungan tiket–sparepart–kas–laporan dan biaya catat ulang dari
buku/chat/Excel. CTA demo menjadi primer karena status produk masih pra-peluncuran dan demo asli
adalah bukti terkuat yang tersedia. Trust rail diganti empat gejala operasional: pelanggan terus
menanyakan status, stok belum mengikuti pemakaian part, margin baru dihitung saat tutup, dan owner
masih harus mengecek staf. Alur empat tahap dipertahankan sebagai penjelasan mekanisme.

Bagian owner menamai hasil keputusan (“servis mana yang untung”), sedangkan panggung produk
membagi dua adegan nyata: operasional di meja dan pantauan dari ponsel. Paket dijelaskan dari cara
kerja hari ini—Solo untuk satu orang/satu outlet, Pro untuk tim/multi-outlet—tanpa badge popularitas
fiktif. Tombol kedua paket menjadi “Mulai uji coba 14 hari” sampai aplikasi benar-benar membawa
pilihan tier ke alur signup.

**Guardrail kejujuran:** pain rail tidak lagi memuat klaim offline. FAQ membedakan mode lokal
satu-perangkat dari mode cloud yang membutuhkan koneksi, menjelaskan isolasi data dalam bahasa
akses pengguna, dan menambahkan fakta “tanpa instalasi”. Final CTA hanya menjanjikan penggunaan
gratis 14 hari, bukan “semua fitur”. `index.html` (title, description, OG/Twitter, noscript,
SoftwareApplication, dan FAQ JSON-LD) diselaraskan; klaim pembayaran QRIS dihapus karena kanal
pembayaran belum menjadi komitmen produk.

**Bukti visual:** `scripts/shoot-demo.mjs` sebelumnya hanya menyalin screenshot mobile ke
`public/screenshots/`; dashboard publik tetap basi. Skrip kini menyalin dashboard dark/light juga,
lalu `scripts/shoot-landing.mjs` memotret bukti produk terbaru di landing.

Verifikasi: build hijau, lint bersih, **459/459 test** lulus; render asli desktop dark/light
1440×960 dan mobile 390×844 diregenerasi. Probe DOM pada
320/360/375/390/414/744/834/980/981/1025/1440 px menemukan nol overflow dokumen, nol teks
terpotong, dan nol target interaktif di bawah 44 px. Headline, pain rail, pricing, FAQ, dan CTA
tetap utuh; rail desktop diberi ruang aman agar tidak tertutup tombol WhatsApp mengambang.

#decision #landing #copywriting #positioning #conversion #truthfulness #impeccable

---

## VOLT Probe menyatukan maskot, logo, dan alat diagnosis (29 Agu 2026)

**Masalah:** VOLT lama memakai pola robot kotak tersenyum dengan antena. Detail sekrup,
LCD, dan tick-gauge memang berasal dari bench, tetapi pada ukuran logo 26–42 px siluetnya
tetap terbaca sebagai chatbot/AI generik. Label “Asisten meja” memperkuat janji AI yang
tidak ada di produk, sementara shell gradien rounded-square membuat app icon kurang khas
untuk usaha reparasi elektronik.

**Keputusan:** VOLT menjadi **VOLT Probe**, continuity tester hidup yang non-humanoid.
Ciri primer adalah probe asimetris; ciri sekunder adalah spine amber, waveform cyan,
selector dial, kabel uji, dan kaki magnet. Ekspresi datang dari sinyal LCD, bukan wajah.
Nama VOLT dipertahankan, tetapi perannya berubah menjadi “Pendamping diagnostik”. Logo,
favicon, PWA maskable icon, Apple touch icon, dan social preview memakai siluet compact
yang sama sehingga brand dan maskot kini satu keluarga bentuk.

**Perbedaan register:** landing boleh menampilkan varian penuh 124 px dengan gerak probe
dan waveform yang halus. Dashboard hanya memakai varian compact statis 30 px; auth,
sidebar, splash, header, dan footer memakai logo statis. Ini menjaga kehangatan di brand
surface tanpa menjadikan maskot ornamen bergerak di ruang kerja atau pengganti penjelasan
keuangan yang serius.

**Sumber & regenerasi:** React SVG memakai token material `--volt-*` agar tidak hardcode
warna UI dan tetap sama sebagai benda fisik di dark/light. SVG publik adalah sumber aset
statis; `npm run brand:render` menghasilkan PNG 192/512, maskable PNG, Apple touch icon,
dan `og-image.png`. Service-worker shell dinaikkan ke `v2` agar identitas lama tidak
tertahan cache.

Verifikasi: build dan lint bersih, **459/459 test** lulus; render landing dark/light,
auth dark/light, sidebar expanded/collapsed dark/light, dashboard demo dark/light, dan
mobile 390×844 menunjukkan siluet tetap terbaca tanpa distorsi. Audit mobile pada
320/360/375/390/414 px dan audit zoom pada 11 lebar efektif 960–2400 px selesai tanpa
regresi; overflow yang dilaporkan hanya rail/carousel horizontal yang disengaja.
Screenshot bukti produk diregenerasi agar landing tidak menampilkan logo lama.

#decision #brand #mascot #logo #pwa #design-system #impeccable

---

## Landing + auth: VOLT sebagai continuity device lintas funnel (29 Agu 2026)

**Masalah:** setelah rebrand VOLT Probe, landing masih menaruh wajah compact sebagai
ornamen kecil dan CTA akhir hanya meletakkan maskot di samping copy. Auth bahkan hanya
memakai logo; rail brand masih mengklaim `QRIS SIAP` dan `DATA TERSINKRON`, padahal itu
bukan pesan yang aman untuk setiap mode/paket. Copy auth seluruhnya hardcoded Indonesia,
pesan VOLT tidak mengikuti login/daftar/reset, dan tombol back/theme/password reveal
sebagian masih di bawah target sentuh 44 px.

**Keputusan desain:** perlakukan landing → auth sebagai satu lintasan perangkat. Di hero,
VOLT duduk dalam diagnostic dock dengan signal meter yang menempel pada konsol pekerjaan.
CTA akhir menjadi probe bay dengan trace, LED, dan status kesiapan alur. Di auth, VOLT
menjadi instrumen statis: varian penuh pada panel brand desktop dan compact status module
pada faceplate mobile. Gerak hanya dipakai pada CTA brand; login/daftar/reset tetap tenang.

**Keputusan copy dan aksesibilitas:** rail auth kini memvisualkan mekanisme produk yang
benar (`SERVIS SIAP`, `STOK TERHUBUNG`, `MARGIN TERHITUNG`), bukan kanal pembayaran yang
belum final. Seluruh copy AuthPage dipindahkan ke `authPage.*` ID/EN dan status VOLT
berubah sesuai mode. Tombol back/theme/reveal/link memenuhi 44 px, breakpoint struktural
auth memakai `@container auth`, dan animasi shell/LED dihentikan pada reduced motion.
`Input` menerima `revealLabels` agar show/hide password ikut bahasa halaman.

**Verifikasi:** build + lint bersih, **459/459 test** lulus. Playwright memotret landing
dark/light desktop + mobile, CTA dark/light, serta auth login/daftar/reset dark, login
light, dan login/daftar mobile. Probe DOM menemukan nol overflow horizontal dan nol tombol
di bawah 44 px pada semua surface itu. Audit aplikasi pada 320/360/375/390/414 px dan 11
lebar efektif zoom 960–2400 px selesai; laporan horizontal hanya carousel aplikasi yang
memang dapat digeser.

#decision #landing #auth #brand #mascot #copywriting #accessibility #impeccable

---

## Landing owner proof: margin yang dapat diaudit (29 Agu 2026)

**Masalah:** section “Tahu servis mana yang untung” menyatakan margin Rp420.000, tetapi
tidak memperlihatkan modal pembentuknya. Empat manfaat juga dirender sebagai grid kartu
identik, sehingga bukti operasional terlihat seperti daftar fitur generik. Pada narrow
viewport kartu tiket masih mengandalkan rotasi/ghost layer, dan struktur dua kolom rumus
belum pernah diuji dengan copy panjang, RTL, atau text-only zoom 200%.

**Keputusan:** headline dipadatkan menjadi “Lihat margin tiap servis sebelum toko tutup”.
Grid kartu diubah menjadi diagnostic rail dengan leader titik. Tiket membawa stamp
**Contoh data** dan formula nyata yang sesuai `serviceProfit()`:
`tagihan servis − modal sparepart = margin` (Rp1.250.000 − Rp830.000 = Rp420.000).
Spine 4 px di sisi kartu yang melanggar guardrail side-stripe dipindah menjadi calibration
rail horizontal di atas tiket. Transform/ghost offset dinetralkan pada mobile.

**Hardening:** semua item grid memiliki `min-width: 0` dan `overflow-wrap`, judul memakai
balanced wrapping, tiket/rail memakai struktur semantik `ul`, `dl`, dan `role=group`,
serta formula turun menjadi input biaya + hasil margin dua tingkat agar angka tidak
dipaksa mengecil. `scripts/audit-landing-owner.mjs` menguji 320/360/390/744/980/1025/
1112/1440 px, long copy + emoji, RTL, forced-colors, dan text scaling 200%—seluruhnya
nol overflow/clipping. Render dark/light/mobile diregenerasi; build + lint bersih dan
**459/459 test** lulus.

#decision #landing #margin #copywriting #responsive #accessibility #impeccable

---

## Demo memakai ambient bench production tanpa mewarisi zoom pengguna (29 Agu 2026)

**Masalah:** production memperlihatkan grid blueprint/PCB tipis dari `body::before`, tetapi
`DemoApp.module.css` memberi `.demoRoot` bidang `--bg-base` opak sehingga grid tertutup.
Akibatnya demo terlihat lebih generik dan tidak identik dengan produk yang dijanjikan. Selain
itu, `/demo` mewarisi `fixmaster-zoom` dari origin yang sama; preferensi 80% membuat density
screenshot tidak setara dengan production 100% dan menurunkan keterbacaan calon pengguna.

**Keputusan visual:** `.demoRoot` dan splash boot dibuat transparan agar memakai satu primitive
ambient global—resep grid tidak diduplikasi. Saat demo aktif, kelas `body.fm-demo-active`
menurunkan `--ambient-bench-opacity` menjadi **0.72**: identitas Precision Electronics Bench
tetap ada, tetapi 28% lebih tenang daripada ruang kerja production.

**Keputusan zoom:** store zoom menyediakan `beginTransientZoom(1)`. Demo dimulai pada 100%; aksi
zoom di Topbar tetap berfungsi selama sesi tetapi tidak menulis `localStorage`. Cleanup memulihkan
zoom sebelum demo beserta tampilan `:root`, sehingga kunjungan demo tidak mengubah preferensi
aplikasi utama. Unit test menjaga set–ubah–pulihkan dan persistensi nilai sebelumnya.

**Bukti visual dan regresi:** `scripts/shoot-demo.mjs` sengaja menanam preferensi 80%, lalu
mengharuskan computed zoom `1`, shell transparan, pseudo-element berisi linear-gradient,
kelas demo aktif, dan opacity `0.72` sebelum mengambil gambar. Dashboard dark/light desktop
1440×960 dan mobile 390×844 diregenerasi; frame menunggu readout laba agar screenshot publik
tidak menangkap instrument kosong. Build hijau, lint bersih setelah nested release worktree
`.tmp-release/**` dikecualikan, dan **460/460 test** lulus.

#decision #demo #design-system #zoom #visual-fidelity #impeccable

---

## Pembayaran langganan kembali manual via WhatsApp (`0047`, 30 Agu 2026)

**Keputusan user:** batalkan gateway GoPay untuk sementara. Volume awal belum membenarkan perangkat listener, secret publik, korelasi nominal unik, dan rekonsiliasi gateway. Pelanggan cukup meminta instruksi serta mengirim bukti bayar lewat WhatsApp; masa aktif hanya berubah setelah operator FixMaster memverifikasi uang masuk.

**Batas kepercayaan yang dipilih:** chat WhatsApp bukan bukti pembayaran dan tombol paket bukan aksi billing. Deep-link membawa nama + **id organisasi stabil**, paket saat ini/pilihan, expiry, outlet, dan nominal agar operator tidak salah mengkredit toko bernama mirip. Tidak ada invoice pending saat tombol diklik, tidak ada tombol “Saya sudah bayar”, dan tidak ada perubahan database di sisi klien.

**Satu transaksi operator:** `admin_confirm_manual_payment` hanya menerima admin platform, plan `standard|enterprise`, 1–12 bulan, nominal positif, referensi, dan alasan. RPC `FOR UPDATE` organisasi → insert invoice `paid` ber-provider `manual_whatsapp` → update plan/expiry dari `greatest(now, expiry)` → `log_operator_action('payment_manual')`. Karena semuanya satu transaksi, tidak mungkin akses bertambah tanpa invoice/audit pendamping.

**Decommission forward-only:** migrasi historis `0043`–`0046` tidak ditulis ulang. `0047` menghapus index/RPC GoPay, RPC self-service/mock, dan promo gratis tanpa mengubah status invoice lama; UI hanya menampilkan baris paid. Source Edge Function listener, parser, env QR, config publik, skrip rekonsiliasi, tab Rekonsiliasi, dan tombol Promo dihapus. Runbook lama diberi banner arsip supaya histori keputusan tetap bisa ditelusuri.

**Trade-off sadar:** operator menjadi bottleneck dan pelanggan tidak aktif otomatis. Ini diterima untuk fase pilot karena volumenya kecil dan kontak langsung justru bernilai. Sinyal menghidupkan otomasi lagi: SLA aktivasi mulai lambat, salah verifikasi berulang, atau volume membuat audit manual sulit dijaga.

**Verifikasi & rilis:** build hijau; 449/449 unit hijau; lint hijau; 76/76 test integrasi staging hijau setelah `0047` diterapkan. Tracker migrasi staging dan production sama-sama `0001`–`0047`; `main`, `staging`, dan HEAD menunjuk commit yang sama (`9947685`). Vercel production `Ready`, ber-alias `fixmaster.app`, bundle live memuat `admin_confirm_manual_payment`, landing render tanpa console error, dan deployment `gopay-listener` staging sudah dihapus.

**Batas parity:** yang disamakan adalah kode aplikasi, urutan migrasi, dan perilaku billing. Kredensial, URL project, serta data staging/production tetap sengaja berbeda. Deployment hosted legacy non-GoPay tidak lagi punya jalur RPC dari aplikasi, tetapi penghapusan remote-nya ditunda sampai target diaudit dan disetujui eksplisit; jangan menyamakan lingkungan dengan menyalin data atau secret.

#decision #billing #whatsapp #operator #security #keputusan-user

---

## Konsol operator dipadatkan & penghapusan organisasi diamankan (`0048`, 30 Agu 2026)

**Masalah UX:** tabel klien memuat Retensi dan Modul yang tidak membantu tugas utama operator—mencari organisasi, memeriksa masa aktif, mengonfirmasi pembayaran WhatsApp, dan memberi dukungan. Identitas hanya nama juga rawan salah pilih saat ada toko bernama mirip; tanggal onboarding tersembunyi; login operator belum terasa sebagai permukaan vendor yang sensitif.

**Keputusan UI:** login diubah menjadi secure bench terminal dengan VOLT Probe, status koneksi, penanda internal, tema, dan error inline. Dashboard mendapat pencarian nama/nomor/UUID, nomor stabil `ORG-XXXXXXXX`, tanggal pendaftaran, reload state, serta layout container-aware: tabel desktop berubah menjadi kartu pada ruang sempit. Retensi/Modul dihapus dari RPC dan UI, bukan sekadar disembunyikan. QA browser asli lulus pada desktop light/dark dan 390 px tanpa overflow; detector Impeccable bersih setelah seluruh radius kembali ke token desain.

**Keputusan penghapusan:** tombol hapus bukan shortcut langsung. Modal menjelaskan cakupan cascade, mewajibkan alasan dan mengetik nomor organisasi, kemudian server menghitung ulang nomor yang sama, mengunci baris, menulis audit, baru menghapus. Auth user dipertahankan agar identitas login tidak ikut musnah diam-diam. Ini lebih aman daripada mengandalkan konfirmasi UI karena pemanggil API tetap harus melewati `is_platform_admin()` dan guard server-side.

**Verifikasi & rilis:** build + lint hijau; 452/452 unit hijau; 78/78 integration staging hijau. Dry-run production hanya menemukan `0048`, migrasi berhasil diterapkan, lalu CLI dikembalikan ke staging. `main` dan `staging` dipromosikan fast-forward ke commit fitur `54d126e`; Vercel production membalas 200 dengan bundle baru yang memuat pencarian organisasi, tanggal pendaftaran, modal hapus, dan RPC `admin_delete_org`. Smoke test `https://fixmaster.app/operator` merender secure bench login tanpa log runtime. Tracker staging dan production sama-sama `0001`–`0048`.

#decision #operator #security #ux #responsive #migration

---

## Aktivasi operator dikunci ke pembayaran terverifikasi (`0049`, 30 Agu 2026)

**Masalah:** konsol masih menonjolkan Dormant/aktivasi pilot dan menyediakan tombol “Aktifkan” yang dapat memilih Trial/Free. Jalur itu bertentangan dengan keputusan pembayaran WhatsApp manual: operator bisa memulihkan akses tanpa invoice paid. Nominal pembayaran juga dapat diketik bebas, preview tidak menunjukkan konteks organisasi/expiry terakhir, dan kegagalan refresh setelah RPC sukses tampil seperti pembayaran gagal—berisiko operator mengulang konfirmasi.

**Keputusan task-first:** readout menjadi filter `Perlu tindakan`, H-7, kedaluwarsa, dan suspended; status WA manual pindah ke masthead. Aktivasi, Retensi, Modul, dan readout Dormant tidak menjadi pekerjaan rutin. Paket selalu ditampilkan sebagai Solo/Pro, expiry negatif menjadi “Kedaluwarsa N hari”, tanggal expiry tampil eksplisit, hapus diturunkan ke menu `Lainnya`, dan jejak aksi mendapat pencarian + load-more 50→200. Error muat kini persisten dan keberhasilan mutasi dipisahkan dari keberhasilan refresh.

**Batas server:** `0049` menghapus `admin_reactivate_org`. `admin_confirm_manual_payment` menghitung ulang nominal resmi dari paket × bulan × outlet, menolak Solo untuk multi-outlet, dan tetap idempoten berdasarkan referensi per organisasi. Modal browser hanya mengirim total hasil formula yang sama; operator melihat org number, paket/expiry saat ini, pembayaran/ref terakhir, biaya bulanan, total, dan expiry proyeksi sebelum commit. `admin_list_orgs` menghapus `sale_count`, `pending_invoices`, `activation_hours` serta menambah `last_paid_reference`.

**Verifikasi & rilis:** project ref staging `fpwwswngqpftaixdlozo` diverifikasi sebelum dry-run; hanya `0049_operator_payment_safety.sql` yang pending lalu diterapkan. Build hijau, lint hijau, **456/456 unit** dan **79/79 integration staging** lulus. Browser asli memverifikasi login desktop serta 390×844: nol document overflow dan semua link/input/button utama 44 px. Commit `4348edc` dipush identik ke `staging` dan `main`; production juga hanya memiliki `0049` sebagai migrasi pending lalu berhasil menerapkannya. CLI dikembalikan ke staging. `https://fixmaster.app/operator` membalas 200, memuat chunk baru dengan `PERLU TINDAKAN`/`lastPaidReference` tanpa `admin_reactivate_org`, merender login operator tanpa overflow, dan mencatat nol warning/error runtime.

#decision #operator #billing #security #whatsapp #impeccable #migration

---

## Tujuh prioritas audit landing ditutup sebagai satu funnel terukur (1 Sep 2026)

**Masalah:** CTA trial dan tombol harga hanya membuka `AuthPage` yang selalu mulai pada
login, sehingga janji tombol tidak sama dengan layar berikutnya dan pilihan Solo/Pro
hilang. FAQ mengklaim impor Excel walau produk baru punya ekspor CSV + backup/restore
JSON. Tidak ada event funnel. Catch-all rewrite mengubah semua URL asing menjadi homepage
200 (soft-404). Lapisan agent-readable belum ada. Skip link hanya mengubah hash, status
VOLT masih 12 px, WhatsApp fixed menutup konten ponsel, dan metadata sosial/schema mudah
drift dari copy serta config harga.

**Keputusan funnel:** intent auth menjadi data eksplisit (`mode`, `source`, `plan`) di
query dan state. Masuk membuka login; trial/demo membuka signup; tombol harga membawa
`standard` atau `enterprise`. Parser tetap menerima `?auth=1` sebagai login legacy.
Event Vercel membentuk funnel `landing_cta_clicked`, `demo_started`,
`demo_signup_clicked`, `signup_started`, `signup_completed`, `activation_completed`, dan
`first_service_created`. Properti hanya konteks rendah-kardinalitas; query/hash dibuang,
route tracking/reset tidak dikirim, dan ID detail servis dinormalisasi.

**Keputusan crawl/discovery:** `vercel.json` hanya me-rewrite route SPA yang benar-benar
ada. URL asing jatuh ke 404 dan build membawa `404.html`. Crawler AI utama diberi kebijakan
eksplisit tanpa membuka `/demo` atau `/track`. `index.md`, `pricing.md`, `llms.txt`, dan
`llms-full.txt` memuat ringkasan, harga, batas paket, serta keterbatasan impor Excel yang
sama dengan halaman manusia; root mengiklankan representasi Markdown lewat `Link` header.

**Keputusan aksesibilitas/metadata:** `main#top` dapat difokuskan dan skip link memindahkan
fokus aktual. Leaf text VOLT mobile dinaikkan ke 14 px. WhatsApp fixed tetap ada di desktop,
tetapi pada ponsel diganti tautan footer. OG/Twitter image menjadi URL absolut. JSON-LD
mendapat ID entitas dan hubungan publisher tanpa membuat rating/review palsu; test membaca
HTML produksi untuk mengunci semua FAQ serta harga terhadap i18n dan `plans.ts`.

**Verifikasi:** build dan lint hijau; **470/470 test** lulus. Playwright memotret landing
dark/light desktop dan mobile 390×844. Audit 320–1440 px, long copy, RTL, forced-colors,
dan text scaling 200% tetap nol overflow/clipping/target <44 px. Probe prioritas memastikan
CTA hero membuka signup, Pro mempertahankan `plan=enterprise`, fokus skip link benar,
font VOLT 14 px, floating WhatsApp hilang di mobile, dan tautan support footer terlihat.
Web Analytics perlu diaktifkan di dashboard Vercel setelah deploy; custom events hanya
tersedia bila paket hosting Vercel mendukungnya.

#decision #landing #auth #analytics #seo #ai-seo #accessibility #vercel #impeccable

## Backup otomatis harian ke Storage (`0051`–`0052`, 2 Sep 2026)

Backup manual sudah ada sejak awal, tapi ia hanya mendarat di perangkat yang menekan tombolnya —
dan pengingatnya bawaannya `off`. Artinya toko yang paling butuh backup adalah toko yang paling
mungkin tidak pernah menekannya.

Bucket privat `org-backups`, path `{orgId}/auto-<ISO>.json`, RLS memakai segmen folder pertama
sebagai `org_id` — konvensi yang sama persis dengan `org-logos` (`0014`). Isinya memakai format
`BackupFile` v1 yang SUDAH ada, jadi hasil backup otomatis bisa di-restore lewat jalur manual
tanpa kode tambahan.

`0052` yang membuatnya benar-benar otomatis: **aplikasi web tidak bisa menjalankan tugas
terjadwal saat ditutup**, jadi pemicunya harus datang dari server. `pg_cron` menyalakan, `pg_net`
mengirim HTTP-nya ke Edge Function. Dua langkah manual di luar migrasi (secret
`BACKUP_CRON_SECRET` dan penjadwalannya) dicatat di kepala berkas migrasinya.

Unduh backup JSON kemudian dikunci khusus Trial, supaya masa coba tidak jadi jalan memanen data
lalu pergi. Paket `suspended` sengaja TETAP bisa mengunduh — toko yang berhenti berlangganan
tidak boleh disandera datanya.

#decision #backup #storage #cron

## Absensi jadi milik PEMILIK, dan jam kerja tak bisa dikarang (`0053`, `0054`, `0056`, 3–5 Sep 2026)

Tiga migrasi, satu tema: absensi adalah data upah, bukan data operasional.

**`0053` — RPC sebagai pintu belakang.** `clock_in` (`0004`) adalah `security definer`, artinya ia
MELEWATI RLS sepenuhnya. Semua penjagaan yang ditulis rapi di policy `attendance_ins`
(`0017`/`0028`) tidak pernah berlaku di jalur itu; yang tersisa hanya "apakah pemanggil anggota org
ini". Seorang teknisi bisa mengabsenkan rekannya sambil berdiri di dalam radius geofence — dan
geofence dibangun persis untuk mencegah itu. Sekaligus diperbaiki: `now()` polos itu UTC, sehingga
check-in 09:00 WIB tersimpan sebagai tanggal/jam yang salah.

**`0054` — satu baris per karyawan per hari, dijamin indeks unik.** Klien sudah menjaganya dan
`0053` menambahkannya ke `clock_in`, tapi keduanya penjagaan waktu-tulis. Indeks inilah yang
membuatnya tak bisa dilanggar lewat REST langsung, restore backup, atau balapan dua perangkat yang
menekan Check In bersamaan. **Sengaja dipisah dari `0053`** karena migrasi ini bisa GAGAL bila data
lama sudah memuat duplikat — dan kegagalannya akan ikut membatalkan pengerasan `clock_in` di
`0053`.

**`0056` — `is_org_manager()` terlalu lebar.** Sampai migrasi ini, admin bisa membaca seluruh
riwayat absensi toko, mengubahnya, menghapusnya, dan mengabsenkan orang lain. Admin memang manager
untuk servis, stok, dan supplier; kehadiran rekan kerja bukan urusan operasional — itu urusan
ketenagakerjaan, dan yang menggaji hanya satu orang. UI sudah dirapikan lebih dulu, tapi itu
**hanya gerbang tampilan**: admin yang memanggil REST langsung tetap melihat segalanya.

> [!important] Pelajaran yang berulang di tiga migrasi ini
> Merapikan UI bukan memperbaiki izin. Setiap kali batas akses "sudah diperbaiki di layar",
> tanyakan jalur REST dan jalur RPC-nya — `security definer` melewati RLS, jadi penjagaan di policy
> tidak ikut berlaku di sana.

#decision #absensi #rls #security

## 64 dari 70 fungsi `security definer` tanpa `set search_path` (`0055`, 4 Sep 2026)

Migrasi `0045` menuliskan aturannya sebagai standar proyek: *"`set search_path = public, pg_temp`
(pola `0020`) — permukaan definer lintas-tenant tak boleh bisa dibajak lewat search_path"*.

Aturan itu ternyata hanya diterapkan pada `0045` ke atas. Saat audit absensi dihitung ulang: dari
**70 fungsi `security definer` di repo, 64 tidak punya `set search_path`** — termasuk
`process_sale`, `settle_service`, `apply_payment`, `claim_invite`, dan `track_service`.

Pelajarannya bukan soal SQL, melainkan soal **standar yang ditulis tapi tidak ditegakkan**. Aturan
yang hanya hidup di komentar satu migrasi akan berlaku untuk migrasi itu saja. Yang membuatnya
nyata adalah audit yang menghitung ulang seluruh permukaan, bukan niat baik.

#decision #security #rls #audit

## Penugasan cabang tidak boleh kosong (`0057`, 5 Sep 2026)

`auth_outlet_ids()` (`0024`/`0042`) sengaja tanpa fallback: anggota tanpa penugasan tidak melihat
transaksi cabang mana pun. Itu arah yang benar (**gagal-tertutup**) — fallback "kosong = semua
cabang" berarti menghapus satu cabang diam-diam membuka SEMUA cabang lain bagi karyawan yang hanya
ditugaskan ke cabang itu.

Yang ditutup di sini jalur salah-simpan: owner mematikan semua chip di Pengaturan → Tim lalu klik
Simpan, dan karyawannya mendadak buta. UI sudah memperingatkan tapi tetap mengizinkan.

#decision #rls #multi-outlet

## Egress: riwayat tiket keluar dari daftar, dan jadi append-only (`0058`–`0059`, 6 Sep 2026)

**Ukurannya yang memicu:** kolom `history` menyumbang **±78% ukuran tiap baris servis** — sumber
egress terbesar di produk. Daftar servis berhenti memuatnya (`SERVICE_LIST_COLUMNS`).

**Tapi ada temuan integritas di baliknya.** Kolom `history` ditandai "append-only" sejak `0001`, dan
tidak ada yang pernah menegakkannya: klien menulis ulang SELURUH array (baca-ubah-tulis), dan
`settle_service`/`cancel_service` menerima `p_history` lalu menimpanya. Akibatnya dua perangkat yang
menambah riwayat ke tiket yang sama dari salinan lama membuat yang menyimpan belakangan **menghapus
entri perangkat lainnya** — dan anggota mana pun bisa mengganti jejak audit lewat REST. Trigger
`0058` menggabungkan: riwayat lama selalu dipertahankan, hanya entri yang belum ada yang ditambahkan
di belakang.

`0059` menambah kolom `services.completion_note`: catatan wajib saat status "selesai" selama ini
hanya hidup di `history`, jadi ia tak bisa tampil di tabel tanpa memuat ulang riwayat tiap tiket.
**Kolom baru WAJIB ikut ditambahkan ke `SERVICE_LIST_COLUMNS`** (`src/data/types.ts`) — tes integrasi
tier3e memeriksanya.

#decision #egress #integrity #servis

## Audit Dashboard & Servis — `0060`–`0068` (7–20 Sep 2026)

Audit menu Dashboard & Servis; pendahulu langsung audit lima menu berikutnya (`0069`–`0079`).

1. **Pelunasan/pembatalan tidak atomik (`0061`).** Klien menyimpan status Lunas/Batal LEBIH DULU,
   baru memanggil RPC uang. Bila RPC gagal (koneksi, langganan, outlet), tiket tertinggal **Lunas
   tanpa pemasukan** atau **Batal tanpa stok kembali** — dan tak bisa diulang karena statusnya sudah
   terminal. `settle_service` kini menulis status + biaya final + riwayat + uang dalam satu transaksi.
2. **RPC uang tidak memeriksa status dan memercayai nominal klien (`0061`).** Baris dikunci
   `for update`, sisa tagihan dihitung server, pelunasan/refund ganda ditolak.
3. **Nomor servis dihitung klien (`0061`).** Trigger BEFORE INSERT + advisory lock.
4. **Kelebihan DP hilang tanpa catatan (`0062`).** Biaya final boleh lebih kecil dari DP, dan
   sisanya dijepit 0 — DP 300.000 dengan biaya final 250.000 berarti 50.000 milik pelanggan menguap.
   Kini refund dibukukan dalam transaksi yang sama.
5. **Koreksi biaya memindahkan pendapatan antar bulan (`0063`).** Implementasi lama menghapus semua
   pemasukan pelunasan lalu membukukan ulang **tertanggal hari ini** — pendapatan bulan lalu pindah
   ke bulan ini. Kini hanya SELISIHNYA yang dibukukan, dan pelunasan lama tidak disentuh.
6. **Angka Servis/Dashboard dari daftar terpotong 1000 tiket (`0063`).** Papan teknisi juga sepanjang
   masa, per nama, termasuk tiket belum dibayar dan klaim garansi. `service_summary` menghitung di
   server.
7. **Stok sparepart dipotong klien dari cache (`0064`).** `stock: cache - qty` bisa menimpa penjualan
   kasir yang bersamaan. Selain itu tulis inventori manager-only (`0017`), jadi karyawan gagal
   menambah sparepart dengan pesan "langganan" yang **menyesatkan**. `update_service_parts` menulis
   daftar part DAN selisih stok dalam satu transaksi, selisih dihitung server dari baris yang
   `deducted`.
8. **Lunas/Batal owner/admin-only hanya di aplikasi (`0065`).** Karyawan bisa memanggil
   `settle_service`/`cancel_service` langsung, bahkan meng-`update` kolom `status` lewat REST.
   Trigger menutup semua jalur sekaligus — RPC `security definer` tetap membawa `auth.uid()`
   pemanggil, jadi RPC-nya ikut tertolak tanpa ditulis ulang.
9. **Celah sisa: `deducted` bisa diubah lewat update biasa (`0066`).** Karyawan bisa menandai part
   "sudah dipotong" tanpa stok benar-benar dipotong, lalu memanggil `update_service_parts` untuk
   "mengembalikan" stok yang tak pernah diambil — **stok inventori menggelembung**. Trigger
   membandingkan stok yang dipegang tiket sebelum & sesudah; bagi karyawan perubahan itu hanya boleh
   terjadi di dalam RPC (penanda transaksi-lokal `fixmaster.parts_rpc`).
10. **Garansi per sparepart** (`0060` lacak publik, `0064`–`0065` klaim per bagian, `0067` garansi
    bawaan per item inventori). Halaman lacak hanya mengembalikan nama part + tanggal akhir
    garansinya; harga modal/jual TIDAK pernah ikut.
11. **Hapus transaksi keuangan ditulis langkah demi langkah (`0068`).** Gagal di tengah meninggalkan
    saldo, baris, dan tiket yang tidak saling cocok. `delete_finance_entry` melakukannya dalam satu
    transaksi, dengan aturan pembalikan yang berbeda per jenis baris (pelunasan, DP, selisih koreksi,
    refund koreksi).

> [!note] Pola yang sama muncul sembilan kali di sini
> Hampir setiap temuan berbentuk **"klien menulis beberapa langkah yang seharusnya satu
> transaksi"**, atau **"aturan ditegakkan di aplikasi tapi tidak di database"**. Keduanya tidak
> terlihat saat aplikasi dipakai normal — hanya muncul saat koneksi putus di tengah, dua perangkat
> menyimpan bersamaan, atau seseorang memanggil REST langsung.

#decision #audit #servis #rpc #integrity

## Audit logika bisnis seluruh menu — `0069`–`0079` (21 Sep 2026)

Audit menu-per-menu atas logika bisnis, dikerjakan dalam lima gelombang: Kasir/Inventori/
Pelanggan (20 temuan), Supplier/Keuangan/Tugas (21), Absensi/Laporan/Log (19), Pengaturan
(17), melanjutkan Dashboard/Servis (`0060`–`0068`). Seluruh temuan diimplementasikan.

**Pola yang dipakai di semua temuan:** server menegakkan, klien mencerminkan hanya untuk
pesan yang ramah sebelum round-trip. Cermin klien TIDAK pernah jadi satu-satunya penjaga.

**Migrasi:**
- `0069`–`0070` Kasir/Inventori/Pelanggan — `process_sale` divalidasi ulang server (harga,
  HPP, total, baris kembar digabung), diskon karyawan dibatasi 10%, stok per cabang, No. HP
  pelanggan unik, hapus pelanggan bertiket diblokir, HPP rata-rata tertimbang saat terima PO.
- `0071`–`0072` Supplier/Keuangan/Tugas — kunci bulan lalu (`assert_open_month`), pengeluaran
  milik PO tak bisa diedit dari Keuangan, `receive_goods_v2` menolak item terhapus alih-alih
  melewatinya diam-diam, nomor PO dari server via advisory lock, `transfer_wallet` bisa
  dibalikkan dan terlihat admin, supplier ber-PO tak bisa dihapus.
- `0073` Kepercayaan log — `activity_stamp_actor` menstempel pelaku di server; `fm_log` +
  trigger mencatat void penjualan/PO dan hapus pemasukan/pengeluaran dari DATABASE, bukan
  dari browser yang bisa mati di tengah jalan.
- `0074` Laporan — `service_receivables` dan `category_profit` sebagai RPC, supaya piutang
  dihitung dari SELURUH tabel dan laba kategori memakai tanggal SELESAI.
- `0075` **Perbaikan bug saya sendiri**, lihat di bawah.
- `0076` Absensi — lat/lng disimpan, tanggal masa depan ditolak, jam dikosongkan untuk baris
  non-hadir, `fm_log` dapat `p_outlet_id`, `purge_activity_logs` (owner-only, minimal 90 hari).
- `0077` Kuota paket — `plan_quota()` mencerminkan `plans.ts` ke database; outlet, wallet, dan
  kursi undangan ditegakkan trigger. `restore_org_data` tidak lagi menghapus `activity_logs`.
- `0078`–`0079` Undangan kedaluwarsa 14 hari.

### Tiga bug yang ditangkap TES, bukan oleh saya

1. **`current_user` di dalam fungsi `security definer` adalah PEMILIK fungsi, bukan pemanggil.**
   Penjaga `activity_stamp_actor` ditulis `current_user = 'authenticated'` sehingga trigger
   tidak pernah menyala dan nama pelaku palsu tetap tersimpan. Tes integrasi memalsukan
   `actor_name` dan barisnya lolos. Tes yang benar adalah `auth.uid() is null` — itulah
   "apakah ini sesi pengguna sungguhan". Diperbaiki `0075`.
2. **`plan_quota` gagal dipasang** dengan `SQLSTATE 42P13` karena `select *` ikut membawa
   kolom `plan`. Harus menyebut kolom secara eksplisit.
3. **`invites_expiry` menyegarkan masa berlaku pada SETIAP update** baris yang belum diklaim,
   sehingga undangan kedaluwarsa bisa hidup lagi hanya karena barisnya tersentuh. Penanda yang
   benar adalah jalur undang-ulang itu sendiri: `created_at` berubah. Diperbaiki `0079`.

**Pelajaran:** ketiganya lolos dari pembacaan kode dan hanya jatuh saat tes integrasi
menjalankannya sungguhan di staging. Cermin klien tidak akan menangkapnya — hanya penegak
server yang diuji sebagai penegak server.

#decision #audit #rls #rpc #integrity #testing

## Pembersihan `/simplify` + ekspor PDF Laporan (22 Sep 2026)

### Pembersihan kualitas (bukan perburuan bug)

Empat agen review paralel — reuse, simplifikasi, efisiensi, altitude — atas diff `0069`–`0079`.
Net **−78 baris** di 23 berkas. Yang layak diingat:

- **`useDerivedQuery`** ([`useCollection.ts`](src/hooks/useCollection.ts)) — lima hook agregat
  (ringkasan servis, piutang, laba kategori, statistik & riwayat pelanggan) menyalin badan yang
  sama persis. Satu salinan LUPA berlangganan perubahan repository dan hanya tampak segar karena
  hook tetangga di halaman yang sama memasangnya. Halaman Pelanggan baru saja melepas
  `useCollection('services')` — sekali lagi, statistiknya membeku diam-diam.
- **`visibleInstances`** ([`lib/business/tasks.ts`](src/lib/business/tasks.ts)) — halaman Tugas
  menyaring per penerima, lampu rel navigasi tidak. Karyawan melihat badge "7" lalu menemukan
  dua baris. Docstring `useNavSignals` sendiri berjanji "rel mencerminkan angka yang sama" —
  janji itu putus di hari pertama. Sekarang keduanya memanggil fungsi yang sama.
- **`SERVER_LOGGED`** ([`lib/activity.ts`](src/lib/activity.ts)) — "apakah server sudah mencatat
  ini?" tersebar sebagai `if (!isCloudMode())` di empat layar, plus satu tempat yang menghapusnya
  sama sekali. Sekarang satu himpunan aksi; menambah trigger berikutnya satu baris.
- **[`src/data/financeEntry.ts`](src/data/financeEntry.ts)** — percabangan cloud/lokal untuk
  mencatat uang keluar dari modal, pola sama dengan `saveServiceParts`.
- **Efisiensi:** hapus template tugas dulu mengirim ratusan DELETE berurutan (jendela 30 hari ×
  template harian 6 item ≈ 186 round-trip + 186 refetch) → `Promise.all`. Absensi menarik dua
  rentang tanggal yang saling tumpang tindih → satu.

### Ekspor PDF Laporan

Tombol **Ekspor PDF** di date bar Laporan, gerbang `exportImport` yang sama dengan CSV.
Dokumen A4 potret berkop toko dengan isi lengkap, termasuk buku transaksi utuh (bukan cap 100
baris seperti di layar).

**Keputusan: dialog cetak browser, BUKAN pustaka PDF klien.** Teks tetap vektor (bisa dicari
dan disalin), grafik tetap SVG, bundle tidak bertambah satu byte. jsPDF/pdfmake menukar semua
itu dengan ~300 KB dan tipografi lebih buruk. Pengguna memilih "Simpan sebagai PDF" di tujuan
cetak — toast mengatakannya, tapi hanya bila jendelanya benar-benar terbuka, karena itu
`openPrintWindow` mengembalikan boolean.

- **[`src/lib/print.ts`](src/lib/print.ts)** (baru) — mekanik jendela cetak (penjaga demo, popup
  diblokir, pemicu cetak `onload`+3s, `escapeHtml`) dipakai bertiga: nota servis, struk
  penjualan, laporan A4. Sejajar `lib/csv.ts` untuk unduhan CSV. **Di sinilah satu-satunya
  tempat warna literal boleh ditulis** — dokumen cetak tidak mewarisi `tokens.css`, dan tinta di
  kertas tidak punya tema gelap.
- **`trendGeometry`** ([`lib/business/reports.ts`](src/lib/business/reports.ts)) — rumus jalur,
  gridline, dan posisi label dipakai `TrendChart` di layar DAN grafik di PDF. Dua salinan berarti
  PDF bisa menggambar bentuk berbeda dari yang dilihat pemilik, dan kertas tidak bisa memperbaiki
  diri. Empat tes menyertainya.

**Pelajaran ukuran kertas:** dua cacat hanya muncul saat dokumen diuji pada lebar A4 asli
(186 mm = 210 − margin 2×12), bukan pada lebar layar: tabel antar-outlet terjepit sampai
memecah "Rp" dan angkanya ke dua baris, dan dua tombol ekspor membungkus terpisah. Memeriksa
dokumen cetak di lebar viewport adalah pengulangan kesalahan lama "membaca screenshot" —
**ukur pada lebar medianya**.

**Verifikasi:** `tsc`, `eslint`, dan 616 test hijau. Dokumen dirender ke tab nyata pada 186 mm
dan diperiksa luberannya lewat `scrollWidth` vs `clientWidth`, bukan lewat gambar.

#decision #refactor #laporan #print #pdf #impeccable

## Penyegaran palet warna — rona sinyal dipisahkan (23 Sep 2026)

Permintaan user: "ubah palet warna yang sudah ada saja, biar tidak terkesan boring,
buat pengguna jadi betah". Lingkupnya sengaja dijaga di `src/styles/tokens.css`
(plus 5 baris komponen untuk tinta tombol) — bukan redesign.

### Cacat nyata yang ditemukan saat mendiagnosis, bukan saat mendesain
- **`--warning` ≈ `--brand`.** `#f59e0b` vs `#f5a623` berjarak **dE 0.018** (OKLab).
  Lewat `STATUS_TONE`, 3 dari 8 status servis — Diterima, Konfirmasi Biaya, Tunggu
  Sparepart — tampil warna identik. Ini cacat baca, bukan sekadar selera.
- **Putih di atas isian sinyal terang.** Tombol `.success` (putih di `#10b981` =
  2.5:1) dan `.danger` (putih di `#ef4444` = 3.8:1) gagal WCAG AA. **Pre-existing**,
  bukan regresi dari pekerjaan ini. `TaskTemplateModal.module.css` sudah menyimpan
  komentar tentang jebakan yang sama pada amber — jadi ini pernah ditemui, lalu
  diperbaiki setempat saja, tidak di sumbernya.
- `--violet-500` & `--pink-500` mati total (nol pemakaian) → dihapus.

### Keputusan
- **Netral diberi suhu, brand tidak disentuh.** Dark → graphite baja ~218deg; light →
  netral hangat ~35deg. Amber `#f5a623` dan cyan `#3dd9c4` tetap, karena itu identitas.
- **`--success`/`--danger` TIDAK digelapkan** meski putih di atasnya gagal. Keduanya
  dipakai ~35 kali sebagai LED indikator di latar gelap; menggelapkannya demi teks
  tombol akan merusak semua indikator itu. Yang diperbaiki **tintanya** (`--on-signal`,
  berbalik antar tema) dan tombol danger dipindah ke `--red-600` solid.

### Pelajaran: pemisahan warna harus diukur perseptual, bukan per-derajat rona
Pemeriksaan pertama memakai selisih derajat rona HSV dan melaporkan emas-vs-oranye
"hanya 11deg" — padahal mata jelas membedakannya. HSV memampatkan wilayah
emas/oranye. Diganti ke **delta-E OKLab**, dengan pasangan lama (dE 0.018) dicetak
sebagai pembanding "terlalu mirip" supaya ambangnya punya dasar, bukan angka karangan.

### Pelajaran: ambang jangan diturunkan supaya lulus — nilainya yang diperbaiki
Di tema terang, `--brand-text` dan `--warning-text` sama-sama harus cokelat gelap agar
lolos 4.5:1 di atas pil bertint. Pencarian menyeluruh menunjukkan **tidak ada** pasangan
yang memenuhi kontras dan pemisahan sekaligus bila hanya rona yang digeser. Jalan
keluarnya datang dari dimensi lain: warning dibuat **lebih pekat** dari brand
(`#661f0e` vs `#7c4d12`) → dE 0.128 dan kontras keduanya justru naik.

### Pelajaran: gerbang token saja tidak cukup — ukur DOM
Gerbang token sempat melaporkan LULUS sementara pemindaian DOM menemukan **18** elemen
di bawah ambang, karena komponen meracik warna lewat `color-mix` dan lapisan
semi-transparan yang tak terlihat dari daftar token. Baseline diukur dengan
menyuntikkan `tokens.css` lama ke halaman (palet lama = 0 temuan), sehingga jelas ke-18
itu **regresi yang baru dibuat**, bukan warisan — lalu diperbaiki sampai 0.

### Verifikasi
- `scripts/audit-tokens.mjs` — 0 pelanggaran (kontras + pemisahan, dark & light).
- `scripts/audit-contrast.mjs` — 0 temuan dari 405 elemen di 4 kombinasi halaman/tema,
  setara baseline palet lama.
- `npm run build`, `npm run lint`, **616 test / 60 berkas** hijau.
- Perbandingan visual: `scripts/shots/palette-before/` vs `palette-after/`.

### Yang TIDAK diselesaikan oleh perubahan palet
Kesan "membosankan" terbesar di Dashboard bukan dari palet, melainkan dari **lima kartu
KPI yang seluruhnya monokrom** (chip ikon abu, angka putih, label abu) — Pemasukan dan
Pengeluaran tak dibedakan warna sama sekali. Itu keputusan komponen, bukan token; palet
tidak bisa mewarnainya tanpa ikut mewarnai semua chip ikon lain. Belum dikerjakan.
Selain itu `STATUS_TONE` memetakan `diagnosa` dan `pengerjaan` ke rona `info` yang sama,
jadi dua tahap itu tetap sewarna by design.

### Tile KPI Dashboard: arah uang diberi warna, sisanya tidak (23 Sep 2026)

Lanjutan penyegaran palet. Keluhan "membosankan" pada deretan lima tile KPI ternyata
**bukan** soal palet: tile-nya memang sengaja dibuat monokrom pada audit 13 Sep 2026
(commit `9d27fda`, aturan *Lit-Signal*, *One Amber*, *Mounted-or-Flat*), dengan alasan
yang tercatat di `StatCard.tsx` — "hijau berarti 'Selesai' di satu kartu dan tak berarti
apa-apa di kartu berikutnya" — dan di `DashboardPage.module.css`: "'Pengeluaran' bukan
kegagalan dan 'Total saldo' bukan status".

**Keputusan: jangan balikkan audit itu, pakai celah yang sudah disahkannya.** Commit yang
sama menyebut pola yang tetap boleh: kartu ringkasan Keuangan membawa arah uang lewat
**spine 3px + warna angka, tanpa tint kartu**. Pola itu masih hidup di
`FinancePage.module.css` (`.summaryCard.income/.expense`). Jadi dua tile uang di Dashboard
memakai pola yang sama, tiga tile lain tetap netral.

Prop-nya `flow?: 'in' | 'out'`, **bukan** `tone` generik — pembedaannya persis alasan
`tone` dilepas: `flow` hanya punya dua nilai dan menyatakan satu hal terukur, sedangkan
`tone` membiarkan tiap tile memilih rona sendiri. `StatCard` (halaman Servis) sengaja
TIDAK disentuh: "Selesai / Lunas" adalah status-sebagai-hitungan, persis jebakan yang
dijaga komentar komponennya.

**Koreksi menyusul: merah terang sempat jadi magenta.** `--danger-text` tema terang
sebelumnya `#9e0050`, dipilih saat `--warning-text` masih oranye dan butuh jarak besar.
Setelah warning dipindah ke karat pekat `#661f0e`, merah punya ruang kembali ke crimson
sejati `#ab1730` (dE 0.153, kontras 4.60) — penting karena warna itu kini dipakai sebagai
angka uang yang menonjol, dan magenta untuk "Pengeluaran" membaca salah. Tema **gelap**
tidak bisa ikut: menarik `--red-400` ke merah sejati menjatuhkan jaraknya ke oranye
warning menjadi dE 0.082, di bawah ambang — jadi merah-muda di tema gelap adalah harga
yang memang harus dibayar untuk triad emas/oranye/merah.

Verifikasi: `audit-tokens` 0 pelanggaran, `audit-contrast` 0 temuan, build + lint + 616
test hijau, render asli difoto di kedua tema.

## Egress: tanggal selesai keluar dari `history` (`0080`, 23 Sep 2026)

**Pemicunya insiden nyata:** kuota egress free tier organisasi habis dan SELURUH
proyek di-restrict — produksi berhenti melayani permintaan. Dashboard menunjukkan
plan FREE, `t4g.nano`, disk 17%, CPU 2%, dan **"No backups"**. Databasenya kecil;
yang besar adalah cara aplikasi menariknya.

**Akar yang ditemukan.** `completionDate()` (`lib/business/reports.ts`) memindai
seluruh array `history` hanya untuk mengambil SATU stempel waktu: entri pertama
berstatus `selesai`. Karena itu `listByDateRange` memakai `select('*')` dan
menyeret `history` — ≈78% ukuran tiap baris (angka terukur dari `0058`) — untuk
SETIAP tiket dalam rentang tanggal. Penelusuran menunjukkan **hanya satu**
konsumen query rentang `services`, yaitu `ReportsPage.tsx:61`, dan halaman itu
tidak pernah membaca `.history` sama sekali.

**Perbaikannya menyalin `0059` persis.** Kolom `services.completed_at`, backfill
dari history, dipelihara dengan memperluas trigger `services_history_append_only`
(`0058`) — bukan trigger baru: SEMUA jalur pengubah status menulis `history`
(StatusModal, `settle_service`, `cancel_service`), jadi satu titik itu menangkap
semuanya, sedangkan trigger pada kolom `status` bisa meleset dari jalur RPC.
Lalu `listByDateRange` memakai `SERVICE_LIST_COLUMNS` untuk services.

**Dua detail yang mudah salah:**
- Backfill memakai entri `selesai` **PERTAMA** menurut urutan array (`order by
  t.i`), bukan terakhir seperti `0059`. Sengaja berbeda: catatan penanganan ingin
  yang terbaru, tanggal selesai ingin saat tiket pertama kali mencapai `selesai`
  — itu yang direplikasi dari `.find()`.
- Ada penjaga regex sebelum `::timestamptz`. Postgres tidak punya `try_cast`;
  satu baris dengan `at` tak berformat ISO akan menggagalkan SELURUH migrasi di
  produksi.

`completionDate()` tetap punya jalur mundur ke `history` supaya adapter
lokal/demo (yang menyimpan objek utuh dan tak punya kolom itu) terus bekerja.

**Pelajaran: helper tes bisa menelan field baru diam-diam.** Dua tes baru gagal
dengan `null`, dan sempat terbaca seperti bug kode. Penyebabnya `svc()` di
`reports.test.ts` membangun objek eksplisit dan hanya meneruskan override yang ia
sebutkan — `completedAt` terbuang sebelum sampai ke fungsi. Helper fixture wajib
ikut diperbarui tiap ada field baru, kalau tidak ia menguji objek yang bukan
entitas sebenarnya.

**Dampak & batasnya.** Query rentang services turun ≈78% (sekitar 4,5x lebih
kecil). Berapa persen total egress yang dihemat **tidak bisa diklaim tanpa
pengukuran** — bergantung seberapa sering Laporan dibuka. Pantau di
**Organization → Usage** dan **Observability** (menu "Reports" sudah tidak ada).

**Belum dikerjakan:** `inventory`, `customers`, `suppliers` ada di `FULL_LIST`
(`supabase-adapter.ts`) dan menembus cap 1000 baris PostgREST dengan perulangan
`.range()` — seluruh tabel ditarik tiap halaman dipasang. Perbaikannya butuh
pencarian sisi server berpola `queryServices()`, menyentuh UI, jadi dipisah.

Verifikasi: build + lint + **619 test** (616 -> +3) hijau; Laporan diuji asap di
render asli lewat `/demo`, yang justru menguji jalur mundur karena adapter
in-memory tak punya kolom itu.

## Egress: lampu rel nav berhenti menarik tabel utuh (`0081`, 23 Sep 2026)

Lanjutan `0080`, dan ternyata sumbernya LEBIH besar. `useNavSignals` menyalakan
rel diagnostik di `Sidebar.tsx` DAN `MobileBottomNav.tsx` — keduanya bagian
shell, jadi hook ini berjalan di SETIAP halaman terautentikasi. Untuk
menghasilkan tujuh bilangan bulat ia menarik LIMA tabel utuh: services,
inventory (yang bahkan `FULL_LIST`, menembus cap 1000 baris dengan perulangan),
purchase_orders, task_instances, task_templates. Membuka **Pengaturan** pun
membayar seluruh katalog inventaris.

Polanya sudah pernah dikenali sebagian: komentar di hook itu menjelaskan
`attendance` dipersempit ke hari ini justru karena "the rail mounts on every
page (twice, with MobileBottomNav)". Empat tabel lain tertinggal.

### Keputusan: hanya yang tanpa logika peran yang pindah ke server
RPC `nav_counts` (0081) menjawab services + inventory + purchase_orders dalam
satu permintaan. **Tugas sengaja TIDAK ikut.** `taskVisibleTo` menyaring per
peran/cabang, dan komentarnya sendiri memperingatkan halaman Tugas dan rel nav
wajib memakai aturan yang sama — kalau tidak, karyawan melihat badge "7" dengan
dua baris. Menyalin aturan itu ke SQL menciptakan dua implementasi yang bisa
menyimpang diam-diam; hematnya tidak sepadan, karena task_templates kecil dan
task_instances jauh lebih ramping daripada services/inventory.

### SECURITY INVOKER, bukan definer
RLS yang ada (`is_org_member`, 0002) sudah membatasi baris ke org pemanggil,
jadi fungsi ini tidak menambah permukaan hak akses dan tidak perlu menerima
`org_id` dari klien. Penyaringan cabangnya mencerminkan `OUTLET_SCOPED` di
`supabase-adapter.ts`: baris cabang aktif PLUS baris milik org (`outlet_id null`).

### Kuncinya tidak muat di `useDerivedQuery`
`useDerivedQuery` menaruh kunci di bawah satu prefiks `['collection', X]` supaya
`invalidateCollection` (yang mencocokkan prefiks) mengenainya. Angka ini berasal
dari TIGA koleksi, jadi tidak ada satu prefiks yang cukup. Memaksakannya akan
memperburuk abstraksi itu bagi lima pemakainya, jadi hook ini memakai `useQuery`
sendiri plus langganan eksplisit ke tiga koleksi. Tanpa langganan itu, badge
stok habis — yang ditandai kritis dan berkedip — baru berubah setelah staleTime
5 menit.

### Yang BELUM terverifikasi
SQL-nya belum pernah menyentuh database sungguhan: organisasi Supabase sedang
restricted karena kuota egress, jadi staging pun tak bisa dihubungi. Penjaganya
ditinggalkan sebagai `tests/integration/tier3f-nav-counts.integration.test.ts`
— membandingkan hasil RPC dengan perhitungan TypeScript pada data yang sama,
memeriksa isolasi antar-org, dan memastikan karyawan mendapat angka yang sama
dengan owner. **Jalankan berkas itu lebih dulu begitu staging pulih.**

### Temuan sampingan: `tests/` tidak ikut type-check
`npm run build` menjalankan `tsc -b`, tetapi `tsconfig.app.json` hanya
`"include": ["src"]`. Berkas di `tests/` TIDAK diperiksa tipenya oleh gerbang
verifikasi — error tipe di tes integrasi baru ketahuan saat dijalankan, yang
bisa berbulan-bulan kemudian. Berkas baru di atas diperiksa manual dengan
tsconfig sementara (`extends` app + `include: ["tests","src"]` +
`types: ["node","vite/client"]`; tanpa `vite/client`, seluruh impor
`*.module.css` salah dilaporkan hilang).

Verifikasi: build + lint + 619 test hijau; badge rel nav di `/demo` identik
dengan sebelum perubahan (Servis 4, Inventori 2, Supplier 1, Tugas 2, Absensi 1)
tanpa error konsol — dan itu menguji jalur mundurnya, karena adapter in-memory
tidak punya `navCounts`.

### Masih terbuka
`inventory`, `customers`, `suppliers` tetap `FULL_LIST` untuk HALAMANNYA
sendiri (katalog, picker POS, pemilih sparepart). Rel nav sudah berhenti
memicunya, tapi halaman-halaman itu masih menarik tabel penuh. Perbaikannya
butuh pencarian sisi server berpola `queryServices()` dan menyentuh UI.

## Egress: pelanggan keluar dari `FULL_LIST` (23 Sep 2026)

Lanjutan `0080`/`0081`, tanpa migrasi — penting karena Supabase sedang restricted
dan perubahan ini tetap bisa disiapkan.

### Kenapa `FULL_LIST` ada, dan kenapa memotongnya SALAH
Komentarnya di `supabase-adapter.ts` menulis sebabnya: terpotong 1000 baris,
"Kasir tak menampilkan barang lama dan pelanggan lama tak ditemukan (lalu dibuat
ganda)". Jadi memberi cap adalah cara menghidupkan kembali bug itu. Perbaikannya
harus **pencarian sisi server**, bukan pemotongan.

### Jebakan yang nyaris terlewat: ekuivalensi nomor HP
`normalizePhone` memetakan awalan `62` → `0`, jadi "+62 812-3456" dan
"0812 3456" adalah orang yang sama. Tapi database menyimpan nomor **mentah**,
dan `ilike` bekerja pada string mentah itu — sehingga filter digit-berurutan
untuk `08123456` **TIDAK** cocok dengan baris tersimpan "+62 812-3456" (tidak ada
digit `0` di sana sama sekali).

Untuk pencarian, meleset hanya menjengkelkan. Untuk dedup, meleset = **pelanggan
ganda**. Karena itu `phoneVariants()` menghasilkan SEMUA bentuk yang
normalisasinya sama (tepat dua: ber-0 dan ber-62), dan `phoneLookupFilter()`
mencari keduanya. Kelebihan cocok tidak apa-apa; kekurangan cocok fatal.

### Rancangan: server mempersempit, fungsi murni memutuskan
Meniru `serviceSearchFilter`: filter server sengaja longgar, lalu
`searchCustomers` (daftar saran) dan `findByPhone` (dedup) tetap yang
memutuskan. Aturan pencocokan TIDAK diduplikasi ke SQL — hanya hidup di
`lib/business/customers.ts`.

### Yang berubah
- `phoneVariants`, `phoneLookupFilter`, `customerSearchFilter` — fungsi murni, 9 test baru.
- `SupabaseAdapter.queryCustomers({ term?, phone?, limit })`; tanpa filter ia
  mengembalikan `[]`, bukan seluruh tabel.
- `useCustomerSearch` — meniru bentuk `useServiceArchive` (tunda 300 ms, minimal
  3 huruf, kunci di bawah `['collection','customers',…]`).
- `ServiceModal` tidak lagi menerima prop `customers`; ia mencari sendiri, dan
  dedup simpan memakai query bertarget per nomor.
- `ServicesPage` + `ServiceDetailPage` **berhenti memuat tabel pelanggan sama
  sekali** — keduanya hanya meneruskan prop itu.
- `PosPage` memakai pencarian server; daftar lokal hanya untuk adapter lokal/demo.

### Belum terverifikasi
Jalur cloud belum pernah menyentuh database — Supabase restricted. Penjaganya
`tests/integration/tier3g-customer-search.integration.test.ts`: menyimpan satu
orang dengan EMPAT gaya penulisan nomor, lalu memastikan pencarian dengan bentuk
apa pun menjaring semuanya. **Jalankan begitu staging pulih.** Jalur lokal/demo
tidak berubah secara logika (`findByPhone` tetap menerima daftar penuh yang sama).

### Masih terbuka
- `CustomersPage` masih memuat tabel penuh — halaman penelusuran, butuh UI
  paginasi tersendiri.
- `inventory` dan `suppliers` masih `FULL_LIST`. Inventory lebih rumit: selain
  picker (butuh pencarian), ia juga dipakai agregat di Dashboard, Laporan, dan
  Supplier — itu jalur RPC, bukan pencarian.

Verifikasi: build + lint + **628 test** (619 → +9) hijau; halaman Servis, Kasir,
dan Pelanggan dirender di `/demo` tanpa error konsol.

## Egress: dua halaman berhenti menarik tabel servis (23 Sep 2026)

Setelah pelanggan, sasaran berikutnya DIALIHKAN dari `inventory` ke `services`
berdasarkan bukti, bukan urutan daftar. Inventori ternyata paling terjerat
(picker butuh pencarian, tapi Dashboard/Laporan/Supplier memakainya sebagai
agregat) sekaligus paling kecil — katalog toko terbatas, sedangkan `services`
adalah tabel terbesar dan ditarik utuh oleh dua halaman yang tidak memerlukannya.

### `ServiceDetailPage` menarik seluruh tabel untuk SATU tiket
`services.find((s) => s.id === id)` — dan tepat di bawahnya sudah ada jalur yang
benar, `repository.get('services', id)`, tapi `enabled`-nya menunggu daftar penuh
selesai dimuat dan gagal. Jadi membuka satu tiket lewat tautan langsung menarik
seluruh tabel lebih dulu.

Dibalik: baris tunggal diambil langsung, dan `useCollection('services')` diberi
`enabled: false` — tetap membaca cache bila pengguna datang dari halaman Servis,
tapi tidak pernah memicu pengambilan sendiri.

**Yang harus diperiksa lebih dulu:** `ServiceModal` memakai
`services.map(s => s.serviceNo)` untuk `nextDocNumber`. Daftar kosong berarti
nomor ganda. Ternyata aman — migrasi `0061` memasang trigger `BEFORE INSERT`
(security definer, di bawah advisory lock) yang memberi nomor berikutnya bila
usulan klien bentrok. Daftar klien hanya PETUNJUK, bukan sumber kebenaran.
Tanpa memeriksa itu, perubahan ini akan tampak berbahaya padahal tidak.

### `InventoryPage` menarik seluruh tabel servis untuk satu toast
Hanya untuk peringatan "dipakai di N servis aktif" saat menghapus barang — aksi
yang jarang, peringatannya pun bersifat saran. Dibayar setiap kunjungan.

Diganti `countActiveServicesUsingItem(itemId)`: `head: true` + `count: 'exact'`,
jadi **tidak ada baris yang dikirim sama sekali**. Filternya memakai `contains`
(operator jsonb `@>`) pada `spareparts`. Penghitungan dibungkus try/catch dan
dialog konfirmasi tetap dibuka apa pun hasilnya — peringatan tidak boleh
memblokir aksi.

### Masih terbuka
- `CustomersPage` dan `InventoryPage` masih memuat katalognya sendiri — itu
  memang tugas halamannya, perbaikannya butuh UI paginasi.
- `inventory` masih `FULL_LIST`. Picker (Kasir, SparepartPicker) bisa memakai
  pencarian server seperti pelanggan, tapi Dashboard/Laporan/Supplier
  memerlukannya sebagai agregat — itu jalur RPC, bukan pencarian, dan katalog
  toko relatif kecil sehingga prioritasnya rendah.

Verifikasi: build + lint + 628 test hijau; halaman detail servis dibuka dari
daftar dan halaman Inventori beserta alur hapusnya diuji di `/demo` tanpa error
konsol.

## Verifikasi migrasi tanpa API: SQL langsung (23 Sep 2026)

`0080` dan `0081` diterapkan ke staging DAN produksi **selagi organisasi Supabase
restricted**. Kuncinya: restriksi menyasar **API gateway**, bukan Postgres —
terbukti karena `pg_dump` berhasil lewat Session pooler. `supabase db push` tidak
bisa dipakai (butuh Docker), jadi `psql -f` langsung.

Selalu dengan `-v ON_ERROR_STOP=1 -1`: satu transaksi, berhenti di error pertama.
Kegagalan tidak meninggalkan skema setengah jadi.

### Pelajaran: `CREATE FUNCTION` berhasil TIDAK berarti fungsinya benar
- `language sql` (`nav_counts`) **divalidasi** Postgres saat dibuat, jadi
  `CREATE FUNCTION` yang lolos sudah membuktikan nama kolomnya benar.
- `language plpgsql` (trigger `0080`) **tidak** — badannya baru diperiksa saat
  dijalankan. Jadi logika pengisian `completed_at` masih nol bukti setelah
  migrasi "berhasil".

Diuji dengan menambahkan entri "selesai" ke satu tiket di dalam transaksi yang
di-`rollback` — membuktikan trigger bekerja tanpa mengubah data.

### Pelajaran: migrasi bisa berhasil tapi hasilnya salah
`ON_ERROR_STOP` + transaksi hanya menangkap kegagalan, bukan backfill yang
diam-diam mengisi nol baris. Karena itu tiap migrasi diikuti query pembanding:

| Pemeriksaan | Staging | Produksi |
|---|---|---|
| `completed_at` terisi / punya entri selesai | 36 / 36, terlewat **0** | 282 / 282, terlewat **0** |
| Filter nomor HP menemukan pelanggannya sendiri | — | **285 / 285**, gagal **0** |
| `nav_counts` vs hitung manual | — | identik di 5 kolom |

Pemeriksaan filter nomor HP menjalankan ulang logika `phoneVariants()` +
`phoneLookupFilter()` **dalam SQL** terhadap seluruh pelanggan produksi. Itu
menguji hal yang sama dengan `tier3g` tanpa butuh API, dan itulah yang membuat
merge ke `main` bisa dipertanggungjawabkan: satu-satunya jalur yang bisa MERUSAK
DATA terbukti terhadap data sungguhan.

### Yang tetap belum terbukti
`tier3f` dan `tier3g` belum pernah dijalankan — keduanya lewat supabase-js /
PostgREST yang masih restricted. Verifikasi SQL di atas menguji LOGIKA, bukan
jalur API: penyaringan RLS per organisasi, dan perilaku fungsi saat dipanggil
sebagai pengguna terautentikasi alih-alih superuser. `nav_counts` sengaja
SECURITY INVOKER supaya RLS yang membatasi org — justru bagian itu yang belum
teruji. Jalankan keduanya lebih dulu begitu kuota pulih.

## Keamanan: fungsi pembantu internal terbuka bagi anon (`0082`, 23 Sep 2026)

Ditemukan saat memverifikasi restore ke self-host. Replika lokal terbukti punya ACL
**identik** dengan produksi (353 baris ACL lawan 353, nol beda), sehingga seluruh
postur keamanan produksi bisa diaudit **tanpa menyentuh produksi**.

### Akar masalah: jebakan default privileges Supabase
Supabase memasang `ALTER DEFAULT PRIVILEGES` yang memberi `anon`, `authenticated`,
dan `service_role` EXECUTE atas setiap fungsi baru di `public` **saat dibuat**.
Migrasi lama mencoba menutupnya dari arah yang salah:
- `check_rate_limit` — `revoke ... from anon, authenticated` berhasil mencabut
  grant eksplisit, tapi `PUBLIC` (`=X`) tetap ada, dan anon mewarisinya.
- `restore_org_data` — `revoke all ... from public` tidak menyentuh grant
  **eksplisit** ke anon yang diberikan default privileges.

**Aturan untuk migrasi ke depan:** menutup fungsi dari luar butuh
`revoke execute ... from public, anon, authenticated` sekaligus — mencabut dari
salah satu saja tidak cukup.

### Dampak — terbukti, bukan teori
Dari 52 fungsi `SECURITY DEFINER` yang bisa dipanggil anon, 42 punya pemeriksaan
otorisasi di badannya dan 6 adalah fungsi trigger (tak bisa dipanggil lewat API).
Yang tersisa bermasalah nyata hanya `check_rate_limit`: ketiga parameternya dari
pemanggil dan badannya tak memeriksa siapa pemanggilnya. Ia satu-satunya pengaman
`track_service` terhadap penebakan nomor servis yang **berurutan**. Di replika, anon
memanggilnya dengan jendela waktu negatif (`make_interval(secs => -N)` membuat
kondisi hapusnya mencakup semua) → **`200 true`**, bucket toko terkosongkan.

Tingkatnya **sedang**: `track_service` tidak mengembalikan nama/HP pelanggan (hanya
perangkat, status, riwayat non-internal), tapi pembatasnya bisa dibobol untuk
penelusuran massal, halaman pelacakan toko bisa dilumpuhkan, dan `rate_events` bisa
digelembungkan tanpa batas.

### Yang sengaja TIDAK disentuh
`is_org_active` juga bisa dipanggil anon, tapi dievaluasi oleh **23 kebijakan RLS**
dengan hak pengguna yang login. Mencabut EXECUTE-nya menggagalkan SEMUA penulisan
data karyawan. Selalu periksa pemakaian di `pg_policies` sebelum mencabut hak
sebuah fungsi.

### Verifikasi (di replika, lewat API sebagai anon)
| | Sebelum | Sesudah |
|---|---|---|
| `check_rate_limit` jendela negatif | 200 `true` | 401 (42501) |
| `po_lines_checked` | bisa | 401 |
| `track_service` (halaman pelanggan) | 200 | **200 — tetap jalan** |
| owner → `restore_org_data` | bisa | tetap bisa |

Penjaga regresi: blok baru di `tests/integration/tier2-rpc.integration.test.ts`.

**Status (23 Sep 2026):** diterapkan ke replika, staging, lalu produksi lewat `psql`
langsung (API sedang restricted). Pemeriksaan `has_function_privilege` di produksi
identik baris demi baris dengan replika. Lubangnya tertutup **sebelum** API pulih,
jadi tidak pernah sempat dieksploitasi.

Catatan: `0080`–`0082` diterapkan lewat `psql`, bukan CLI, sehingga
`supabase_migrations.schema_migrations` di produksi masih berakhir di `0079`.
Ketiganya aman diulang bila suatu saat `supabase db push` dijalankan (backfill
hanya menyentuh baris kosong; sisanya `create or replace` dan `revoke`).

## Egress: rel tugas dihitung per template, Dashboard berhenti menarik daftar servis (`0083`, 23 Sep 2026)

Dipicu ukuran payload sungguhan dari sesi login pemilik ke replika self-host
(log Envoy), bukan perkiraan.

### `task_instances`: rencana pertama ternyata tidak menghemat apa pun
Rel sidebar (setiap halaman) menarik `task_instances` utuh: 150 baris, 80 KB,
tumbuh **5 baris/hari**. Rencananya "tarik yang `pending` saja" — tapi pengukuran
menunjukkan **ke-150-nya `pending` dan lewat tenggat, nol yang pernah dicentang**.
Filter itu akan menarik semuanya juga. Ukur dulu sebelum mengoptimasi.

### Jalan keluar: hitung per template, visibilitas tetap di klien
`0081` sengaja tidak memindahkan tugas ke server karena `taskVisibleTo` menyaring
per peran/cabang, dan menyalinnya ke SQL membuat badge bisa menyimpang dari halaman
Tugas. Kuncinya: aturan itu **hanya bergantung pada template**, bukan baris instance.
Maka RPC `task_counts_by_template` (`0083`) menghitung per template, dan klien
menerapkan `taskVisibleTo` yang sama persis pada hasilnya (`visibleTaskCounts`).
Jalur lokal mengelompokkan dari memori dengan `groupTaskCounts` — kedua jalur lewat
satu langkah visibilitas.

- Kesetaraan dibuktikan tes: matriks semua jenis penugasan × tugas tanpa template ×
  template terhapus × campuran status/tanggal, lima profil pengguna, cara lama dan
  baru berdampingan. Plus tes penjaga "bukan nol lawan nol" (18/18).
- `p_today` dikirim klien: server UTC, sehingga 00:00–07:00 WIB `current_date`-nya
  masih kemarin.
- Replika: RPC = hitungan langsung (150/0), **4 kelompok, 337 B lawan 79.627 B** —
  dan **tidak tumbuh** seiring hari; hanya bila template bertambah.
- Pelajaran `0082` diterapkan sejak awal: `revoke ... from public, anon`.

### Dashboard: 338 KB untuk menampilkan 6 baris
Angka ringkasannya sudah dari RPC (`useServiceSummary`); daftar penuh hanya dipakai
untuk 6 "Servis Terbaru" dan cek kosong. Diganti `queryServices({ limit: 6,
visibleOnly: true })` — opsi `visibleOnly` baru, **opt-in**, karena pemakai lain
(arsip, koreksi Keuangan, riwayat pelanggan) harus tetap menemukan tiket arsip.
**337.709 B → 6.865 B (49×)**, tetap 6 baris selamanya. Isinya identik dengan cara
lama (NS-0326…0321, tanpa `history`, tanpa arsip). Mode demo lewat jalur mundur
lokal: 6 tiket, badge tugas 2 — sama dengan sebelum perubahan.

### Membaca log bersama: pisahkan uji dari pengguna lewat user-agent
Satu tarikan `task_instances` 80 KB sempat tampak seperti sisa kode lama. Ternyata
itu `curl` saya sendiri saat membandingkan ukuran. Waktu yang berdekatan menipu;
user-agent tidak.

### Halaman Servis: daftar berjendela 31 hari (disetujui pemilik)
Data toko terbesar: **98% tiket tuntas** (328/334); ±109 tiket masuk/bulan. Daftar
"semua" menuju ±1 MB (batas 1.000 baris) dalam kurang dari setahun; daftar
berjendela tetap konstan karena bergantung pada laju masuk × panjang jendela,
bukan umur toko.

**Aturannya:** muat tiket yang **belum tuntas** (berapa pun umurnya) **atau**
`updated_at` dalam 31 hari (awal hari lokal). Tuntas = sudah diambil **dan**
(lunas **atau** batal) — persis `isClosedOut`. Sejak revisi 23 Sep: **dua kueri
paralel**, lihat "Revisi: 31 hari, dua kueri" di bawah. (Versi pertama memakai satu
`or=(picked_up.is.false,status.not.in.(lunas,batal),updated_at.gte.<batas>)`.)

Keputusan pemilik: (1) chip status berarti "dalam jendela" — KPI tetap dari RPC,
tidak berubah; (2) tiket lama tak muncul saat menggulir; (3) 30 hari; plus
pembatas render 50 baris dihapus untuk tampilan berjendela.

Yang harus diverifikasi sebelum aturan ini sah:
- **Definisi "tuntas" saya sempat keliru** — menganggap semua tiket batal tuntas.
  `isClosedOut` mensyaratkan **sudah diambil** untuk lunas maupun batal. Tiket batal
  yang perangkatnya belum dikembalikan adalah barang pelanggan yang masih di toko.
- **Piutang aman menurut definisinya:** `service_receivables` = status `selesai` +
  ada sisa tagihan, dan `selesai` tidak pernah tuntas. Penyaring "Belum lunas"
  (`unpaid`) menampilkan semua piutang, berapa pun umurnya. Tidak ada aturan
  tambahan — menyalin logika piutang ke filter daftar berarti dua definisi.
- **`updated_at` sebagai "kapan ditutup"** — tidak ada trigger yang memeliharanya.
  Sah hanya karena SETIAP jalur penutupan memperbaruinya: `settle_service`,
  `cancel_service` (8/8 RPC pengubah `services` menyetelnya) dan penandaan "sudah
  diambil" di ServicesPage & ServiceDetailPage (`updatedAt: now`). Ditulis sebagai
  KONTRAK di komentar `queryServices`. Jalur penutupan baru yang lupa → tiket lama
  lenyap tepat setelah dilunasi. (`service_summary` 0063 bergantung pada invariant
  yang sama.)
- `picked_up` `NOT NULL default false` — `is.false` tak melewatkan NULL.
- Dua `or` (penyaring cabang + jendela) digabung DAN oleh PostgREST: dengan
  penyaring cabang yang cocok semua tiket, hasil tetap 105 (bukan 326).
- Arsip (`useServiceArchive`) kini **selalu** aktif di cloud, bukan hanya saat
  daftar mentok 1.000. Batas rentangnya = awal jendela: setiap tiket yang **dibuat**
  dalam jendela pasti termuat, karena `updated_at ≥ created_at`.

**Hasil di replika:** 337.709 B → **113.310 B**, 107 tiket (batas = 24 Agu 00:00
WIB). 8 selalu tampil, termasuk tiket lama yang tadinya terkubur: NS-0102 masih
`diagnosa`, NS-0149 lunas belum diambil, dua batal belum dikembalikan, satu
piutang. 17 tiket dibuat sebelum jendela — semuanya sah.

Pembatas render 50 baris dibuat untuk "ribuan tiket sejak toko berdiri"; kini
hanya berlaku saat hasil arsip ikut digabung (maks 1.000). Kaki daftar memakai
ulang petunjuk yang sudah ada: *"105 dari 105 tiket · 326 total · tiket lebih lama:
cari nomor/nama atau pilih tanggal"* (`stats.total` dari RPC = seluruh tiket).

Efek samping yang diterima: ServiceDetailPage tidak lagi menemukan tiket di cache
daftar (kuncinya berbeda), jadi selalu lewat `repository.get(id)` — satu baris.

`0083` BELUM diterapkan ke staging/produksi — merge ke `main` sebelum itu akan
mematikan badge tugas (RPC tidak ada). Perubahan halaman Servis tidak butuh migrasi.

#### Revisi: 31 hari, dua kueri, tanpa asumsi ukuran toko (23 Sep 2026)

Permintaan pemilik: jendela **31 hari** + tiket belum tuntas dari bulan-bulan
sebelumnya selalu tampil — dan **jangan berasumsi ±100 unit/bulan**; itu angka satu
toko, bukan pelanggan FixMaster lain.

Asumsi itu ternyata tersembunyi di kode, bukan hanya di komentar: satu kueri `or`
berurut `created_at desc` dengan `limit` 1.000 (max_rows PostgREST). Toko yang
menyentuh >1.000 tiket dalam jendela akan terpotong dari yang **paling tua** —
tepatnya tiket belum tuntas lama yang harus selalu terpantau. Perbaikannya:
- `queryServices({ openOnly })` → `or=(picked_up.is.false,status.not.in.(lunas,batal))`
- `queryServices({ closedSince })` → `picked_up=eq.true&status=in.(lunas,batal)&updated_at=gte.<batas>`
- Dijalankan paralel, digabung (himpunannya saling lepas), diurutkan di klien
  seperti biasa. Bila salah satu mentok 1.000, `truncated` → jaminan "semua tiket
  yang dibuat dalam jendela termuat" gugur, jadi setiap rentang tanggal ditanyakan ke
  server dan footer menyebut daftar terpotong.
- Komentar kode tidak lagi memuat angka toko mana pun; angka terukur hanya di vault
  ini sebagai data **satu** toko.

Batas atas yang tersisa (sengaja): tiap perubahan servis menarik ulang seluruh
jendela di setiap perangkat. Ongkosnya ∝ laju tiket masuk toko itu × 31 hari. Untuk
toko yang jauh lebih ramai, langkah berikutnya adalah pembaruan per baris dari
payload realtime, bukan jendela yang lebih pendek.

**Terukur di replika (toko pemilik):** 8 belum tuntas (7.856 B) + 103 tuntas
(109.971 B) = 111 tiket, batas `2026-08-22T17:00Z` = 23 Agu 00:00 WIB.

**Kaji ulang "Sembunyikan tuntas" — tetap dipertahankan.** Dulu ia menyembunyikan
riwayat bertahun-tahun; kini paling banyak 31 hari. Tapi dalam jendela itu pun
tiket tuntas mendominasi (103 dari 111 di toko pemilik — rasio yang wajar untuk toko
mana pun, karena tiket aktif dibatasi kapasitas meja kerja sedangkan yang tuntas
menumpuk selama jendela). Tombol ini satu-satunya cara melihat antrean kerja
"semua yang belum tuntas" — chip status hanya satu status sekaligus, dan status
`lunas` belum diambil tidak tuntas.

## Realtime: putaran reconnect → resync tanpa akhir (23 Sep 2026)

**Gejala (log Envoy replika, sesi pemilik):** mulai 14:51:59, ±1 detik setelah token
JWT pertama kedaluwarsa (`JWT_EXPIRY=3600`, `POST /auth/v1/token` 14:51:50), aplikasi
menarik ulang **semua** koleksi yang terpasang + baris organisasi berulang-ulang:
145× daftar servis (113 KB) dalam 3 menit, ±16 MB, lalu melambat ke tiap ±60 detik
dan tidak pernah berhenti. WebSocket-nya sendiri tetap satu koneksi — yang berputar
adalah **kanal**.

**Sidik jarinya:** setiap putaran berisi persis himpunan `notifyAll()` +
`refreshOrganization()` — satu-satunya jalur yang memanggil keduanya adalah cabang
`offline → live` di `SupabaseAdapter.setScope`. Rasio `nav_counts`:`services` ≈ 6:1
(3 koleksi × 2 rel nav) cocok dengan `notifyAll`.

**Akar masalah:** `RealtimeChannel.unsubscribe()` (dipanggil `removeChannel`)
"Triggers onClose() hooks" — callback `subscribe` milik kanal **lama** menerima
`CLOSED`. `subscribeOrgTables` memperlakukannya sebagai putus sungguhan: status
`offline` → `scheduleReconnect` → `connect()` membuang kanal (yang kini baru) →
`CLOSED` lagi → … dan tiap kanal baru yang `SUBSCRIBED` memicu `live` → resync penuh.
Satu putus sungguhan (token kedaluwarsa, jaringan) cukup untuk menyalakan putaran
selamanya. Berlaku juga di cloud — kemungkinan ikut menyumbang egress produksi.

**Perbaikan** (`src/data/supabase-client.ts`): callback mengabaikan kanal yang bukan
kanal aktif (`channel !== ch`), dan `teardownChannel` mengosongkan `channel`
**sebelum** `removeChannel` karena callback `CLOSED` bisa datang sinkron. Tes
`src/data/supabase-client.test.ts` meniru perilaku realtime-js; tanpa perbaikan ia
melihat 10 kanal dalam 2 menit, dengan perbaikan tepat 2.

**Ikutan:** invalidasi `navCounts` memakai `cancelRefetch: false` — satu resync kini
satu panggilan RPC per rel, bukan 6 yang saling membatalkan.

**Terverifikasi di replika:** setelah Vite memuat ulang halaman pemilik, lalu lintas
turun dari tiap ≤60 detik menjadi nol selama 2 menit berikutnya.

## Konsol operator: nomor telepon toko (`0084`, 24 Sep 2026)

Permintaan pemilik: operator bisa melihat nomor telepon yang didaftarkan tiap toko.
`admin_list_orgs` kini mengembalikan `org_phone` (= `organizations.phone`, diisi klien
di Pengaturan → Profil Usaha). Tampil di tabel (di bawah nama) dan kartu, sebagai
readout mono + tag `WA` yang membuka `wa.me` (pakai `toWaNumber`, helper yang sama
dengan notifikasi pelanggan). Pencarian konsol ikut mencocokkan nomor lewat digit
ternormalisasi (`normalizePhone`, minimal 4 digit) — "+62 821-…", "0821 …", "0821…"
saling menemukan.

**Batas privasi 0045 tetap:** permukaan lintas-tenant hanya metadata + agregat.
Nomor TOKO adalah metadata (kontak vendor → klien), bukan isi bisnis klien. Tes
tier2c memang melarang kolom `phone`; kolom baru sengaja bernama `org_phone`, dan
tesnya diperkuat: `org_phone` wajib ada, `phone`/`customer_phone` (nomor pelanggan
milik klien) tetap dilarang.

Mengubah kolom `RETURNS TABLE` butuh `drop function` + create ulang (badan sama
persis dengan 0049) + revoke/grant ulang. Diuji di replika: operator melihat 3 toko
beserta nomornya, owner biasa `Forbidden`, anon ditolak hak akses. Unit 637 tes.
Render terverifikasi dari tangkapan layar pemilik (tabel desktop: 3 toko, nomor +
tag WA di bawah nama); agen tak memotret sendiri karena login butuh password.

## Email backup mingguan ke owner + SMTP reset password (`0085`, 24 Sep 2026)

**Keputusan pemilik:** pengirim `noreply@fixmaster.app` lewat **Resend** (DNS di Vercel
cukup ditambah rekaman SPF/DKIM — nameserver tidak dipindah); satu kunci untuk email
backup (API) dan reset password (SMTP GoTrue). **Tautan unduh 7 hari**, bukan lampiran
(backup toko terbesar sudah 2.5 MB dalam 3 bulan; email yang bocor setelah seminggu
kosong). **Seminggu sekali** (Senin 00:00 UTC = 07:00 WIB, enam jam setelah backup malam).
Balasan diarahkan ke `fixmaster.cs@gmail.com` (Reply-To) — fixmaster.app tak punya kotak masuk.

- **Rantai:** pg_cron `fixmaster-backup-email` → `run_backup_email()` (vault
  `project_url` + `backup_cron_secret`, pola 0052) → Edge Function `backup-email`
  (gerbang `x-cron-secret` yang sama) → Resend. Jejak di tabel **terpisah**
  `backup_email_runs` (owner baca, service role tulis): `latestBackupRun()` membaca baris
  terbaru `backup_runs` sebagai status BACKUP, jadi email tak boleh bercampur di sana.
- **Toko dilewati:** ditangguhkan, **Trial** (backup JSON dikunci selama Trial di
  Pengaturan — email tak boleh jadi jalan pintasnya), demo, atau owner mematikannya
  (`settings.backupEmail = false`; tanpa nilai = aktif agar toko lama ikut terlindungi).
- **Tautan:** `createSignedUrl(…, 7 hari, { download })` memakai `SUPABASE_URL` internal
  Docker; token tak terikat host, jadi origin diganti `SUPABASE_PUBLIC_URL` (sudah
  diteruskan compose resmi). WAF membuka `/storage/v1/`. Diuji di replika: 200,
  `content-disposition: attachment; filename=…`, 2.5 MB; tanpa token 400.
- Tanpa `RESEND_API_KEY` fungsi berjalan **dry run** (dicatat, tak dikirim); tautan tak
  pernah dikembalikan di respons karena respons pg_net tersimpan di database.
  `idempotency-key` per org per minggu: cron/manual yang diulang tak menggandakan email.
- **UI:** kartu Backup & Restore mendapat saklar kanal (LED + mono AKTIF/MATI,
  `role="switch"`) dan satu kalimat status (`backupEmailStatus` di lib/business/backup,
  diuji). Email HTML memakai warna literal & gaya inline — klien email tak mengenal CSS
  var; satu-satunya pengecualian aturan token, di luar aplikasi.
- **Pemasangan server:** paket `pindah-server/email` (dirakit dari repo:
  `scripts/selfhost/email/pasang-email.ps1` + migrasi 0085 + fungsi) — meminta kunci
  secara tersembunyi, mengisi `RESEND_API_KEY` + `SMTP_*` (smtp.resend.com:465, user
  `resend`), menulis override, menyalin fungsi, menerapkan 0085, menyalakan ulang, lalu
  dry run. Diuji di replika dengan `-TanpaKunci`, dua kali (idempoten).
- Templat email GoTrue (reset password) masih bawaan berbahasa Inggris — belum diubah.
- **DNS (25 Sep 2026):** `fixmaster.app` ternyata SUDAH punya rekaman Resend dari akun
  lama (±2 Sep: `resend._domainkey`, `send` MX+SPF region ap-northeast-1, `_dmarc
  p=none`) — cek MX domain utama saja tidak cukup, rekaman email tinggal di subdomain.
  Akun Resend baru mengklaim domain lewat TXT `@ resend-domain-verification=…`
  (ditambahkan via `vercel dns add`, rekaman lain tak disentuh). MX/SPF lama langsung
  Verified; DKIM akun baru berbeda → rekaman lama dihapus, yang baru dipasang (dua DKIM
  di satu nama membuat verifikasi tak menentu). Cek propagasi lewat DoH
  (`dns.google/resolve`) — `nslookup` di Windows kerap time-out ke NS1.
- **Terpasang di server & terbukti (25 Sep 2026):** domain Verified di Resend, `pasang-email.ps1
  -UjiOrg <Nuara>` di laptop server → email backup sungguhan **sampai** di kotak masuk
  owner. Server kini `0001`–`0085`. SMTP reset password terpasang bersamaan (uji
  "Lupa password?" menyusul).
- **Email reset password berbahasa Indonesia:** templat `public/email/reset-password.html`
  (tayang di `fixmaster.app/email/…`, ikut repo & deploy) diambil GoTrue lewat
  `GOTRUE_MAILER_TEMPLATES_RECOVERY`; subjek `Atur ulang password FixMaster`;
  `GOTRUE_MAILER_OTP_EXP=3600` diset eksplisit karena teks email menyebut "1 jam"
  (ubah keduanya bersamaan). Ketiganya di blok `auth` override, ditulis
  `pasang-email.ps1` — jalankan ulang dengan `-TanpaKunci` (kunci di `.env` tetap).
  Go template ikut mengisi `{{ }}` di dalam komentar HTML, jadi komentar templat
  menyebut variabel tanpa kurung kurawal.
