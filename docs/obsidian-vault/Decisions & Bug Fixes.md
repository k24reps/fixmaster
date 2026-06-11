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

## Pelajaran utama

> [!tip]
> **Verifikasi dengan render asli, bukan mockup.** Hampir semua bug di atas hanya ketahuan karena UI difoto dengan data nyata via Playwright + cek fungsional (bukan sekadar asumsi "kelihatannya benar").

> [!warning] Jangan campur warna hardcode dengan token semantic
> Background **hardcode** (mis. `#0b0d11`) + teks **token semantic** (`--text-primary`, yang membalik per tema) = resep teks hilang di salah satu tema. Pilih salah satu konsisten: kalau permukaan sengaja gelap di kedua tema, warna teksnya juga harus **nilai tetap / scale token cerah**. Lihat [[Conventions]].

#decision #bugfix
