---
title: Signature Pages
aliases: [Signature Pages, Halaman Bertanda]
tags: [fixmaster, signature-page, design-system, frontend]
created: 2026-06-04
---

# 📄 Signature Pages

Bagian dari [[00 - FixMaster MOC]].

Sembilan halaman utama + halaman detail, masing-masing dengan metafora "alat" tapi berbagi bahasa visual dari [[Design System]]. Screenshot di bawah adalah **render kode asli** (data demo di-seed, difoto via Playwright) — bukan mockup.

> [!info] Komponen bersama tidak diubah
> `StatCard` (dipakai Dashboard & Servis) sengaja dibiarkan utuh. Untuk Reports/Dashboard dibuat tile lokal agar perubahan tidak merembet tak sengaja. Lihat [[Decisions & Bug Fixes]].

---

## Landing — Instrument Bench (publik)

Pintu depan saat **cloud signed-out**. Versi pertama terasa "vibecoded" (gradient hero + icon-card grid + floating pricing badge — template SaaS generik). Di-redesign jadi **sepotong instrumen diagnostik** sefamili dengan auth "Terminal Akses Bench". **Revisi total (9 Jun 2026)** menambah elemen konversi (diadopsi dari analisis kompetitor FixNova/FixMate, tapi **diterjemahkan ke bahasa bench** — bukan tiru visual) + memperbaiki klaim plan yang basi. [`LandingPage`](src/features/landing/LandingPage.tsx):
- **Hero faceplate**: pelat bersekrup 4 sudut, `unitTag` LED hijau, judul ber-engrave gradient, **coverage chips** (HP/Laptop/Tablet/Printer/Konsol/Elektronik — tegaskan cakupan semua elektronik), plus **panel readout hidup** (CAKUPAN, MODUL 14/14, SYNC, DATA + **uptime tick** per detik).
- **Komparasi 3-mode** (`#banding`, data `COMPARISON`, **gantikan** fault panel + module rack + galeri sejak 23 Jun 2026): 5 area operasional (Servis & Garansi, Pelanggan & Loyalitas, Penjualan & Stok, Keuangan & Laporan, Tim/Kontrol/Data) yang memuat **semua 14 modul + fakta jaminan**. Tiap area = **`<details>`/`<summary>` accordion** — di desktop semua terbuka (pointer-events none via `@media min-width:861px`), di mobile ≤860px user bisa lipat/expand (chevron muncul, panel default tertutup kecuali area pertama yang open). Header (`compareHead`): ikon brand + judul + nomor `B0x` + chevron. Dua kolom **MODE MANUAL** (LED merah, `bg-base` redup, item `times` danger) ↔ **MODE FIXMASTER** (LED hijau, border brand, item `check` success), lalu pita **NAIK KELAS** (LED brand, spine gradient, `brand-soft`) berisi pertumbuhan yang dibuka. Semua **fakta dari kode** (margin/turnaround, period comparison, aging, part terlaris, recurrence). Menjawab masalah M1 audit (doomscroll di mobile).
- **Demo langsung** (section "DEMO LANGSUNG · UNIT HIDUP"): dalam **bingkai instrumen** (title-bar 3 dot + address `fixmaster · /demo`), poster kini **berlatar screenshot dashboard produk asli** (theme-aware: `demo-dashboard-dark/light.png` di `public/screenshots/`, diberi **scrim radial** dari token agar judul + tombol play tetap terbaca). Tujuannya mengakhiri "kotak kosong" pasca-penghapusan iframe **dan** memamerkan produk nyata sebelum klik. Poster **meng-link ke rute `/demo` layar penuh** (navigasi browser penuh, **bukan iframe**). Lihat section **Demo Interaktif** di bawah.
- **Strip jaminan** (setelah hero, sebelum fault panel): 4 **fakta produk terverifikasi** — Data terisolasi (RLS per toko), Jalan tanpa internet (lokal-first), Cadangkan kapan saja (ekspor utuh), Tanpa kontrak (trial 14 hari tanpa kartu). **Bukan testimoni/jumlah pelanggan karangan** — menjaga kejujuran yang sama dengan idiom "?" di matriks. Ikon brand-soft, dipisah garis titik atas-bawah.
- **Module rack & galeri menu: DIHAPUS (23 Jun 2026)** — dilebur ke komparasi 3-mode di atas (kolom FIXMASTER memuat tiap modul). Mengurangi panjang halaman dari ~13–15 layar ke target ~6 layar; bundle index ikut turun (~168→163 kB). 16 screenshot `menu-*` tetap di repo (dipakai histori; tak lagi dirujuk landing).
- **Ritme section**: section demo, banding, & manual memakai `sectionAlt` (panel `bg-base` ber-border-radius) agar **berselang** dengan section `bg-app` — memecah monotoni pola pelat-sekrup yang seragam.
- **Spec plates** (pricing): label alat bersekrup, harga mono besar + **framing harga harian** ("± Rp x/hari · setara kopi"). Klaim **diperbaiki agar jujur**: Solo = 1 pengguna · 1 outlet · 2 dompet (bukan lagi "tugas/absensi" / "karyawan tak terbatas"); Pro = pengguna tak terbatas, **outlet tak terbatas** (+Rp50rb/outlet) — bukan lagi render rusak "s/d -1 cabang". Sumber `config/plans.ts` agar tak basi.
- **Matriks banding** (3-brand): **datasheet bench** bersekrup membandingkan FixMaster vs FixNova vs FixMate. Pagar: hanya baris **FixMaster unggul/imbang** (keunggulan kompetitor spt CRM tak ditampilkan); sel kompetitor belum pasti = **"?" amber** (bukan tebakan ya/tidak); 3 fitur khas (Supplier+PO, Tugas, Audit) ber-tag `KHAS`; kolom FixMaster ber-LED "UNIT INI" + brand-soft. Disclaimer bertanggal.
- **Manual plate** (FAQ): pertanyaan jadi `<details>` bergaya lembar manual (data aman? bisa offline? servis apa saja? dst) — bunuh keberatan umum.
- **Serial/compliance plate** (footer): pelat regulasi (SN, ©) menampung tautan legal.
- CTA → `onStart` → `AuthGate` buka `AuthPage`. **Label trial disatukan** jadi **"Mulai Gratis 14 Hari"** (hero + CTA akhir) untuk konsistensi; "MASUK" tetap untuk login, "Pasang Solo/Pro" kontekstual di pricing.
- **Top rail**: kini memuat **toggle tema** sun/moon (`useThemeStore`) di samping tombol MASUK. Anchor nav kini **Perbandingan/Demo/Paket** (`#banding`/`#demo`/`#spec`); di **mobile** anchor disembunyikan agar rail tak berdesakan — sisakan logo + toggle tema + MASUK.

### SEO (revisi 11 Jun 2026, diperbarui 23 Jun 2026)
Landing adalah CSR (dirender di `AuthGate`), jadi SEO bertumpu pada **`index.html` statis** + aset publik:
- `public/robots.txt` (allow publik, **disallow `/demo` & `/track`** karena sandbox/lookup) + tunjuk sitemap.
- `public/sitemap.xml` (`/`, `/privacy`, `/terms`).
- `index.html`: title/description **berbasis keyword + benefit** (servis HP/laptop/elektronik, kasir, trial), `<link rel=canonical>` + `og:url`, **JSON-LD** (`SoftwareApplication` + offers dari `plans.ts` + **`availability: InStock`**, `Organization`, `WebSite`, `FAQPage`), dan **`<noscript>`** berisi H1 + value-prop + daftar fitur agar crawler non-JS tetap dapat konten nyata. Meta keywords diperbarui: "bengkel elektronik" diganti "konter hp, toko servis hp".
- **`useEffect` title** di `LandingPage.tsx` kini **sinkron** dengan `index.html` (sebelumnya kehilangan keyword "HP/Laptop/Kasir"). Crawler tetap dapat yang dari `index.html` statis, tapi tab browser history kini konsisten.
- **Eyebrow di atas H1**: `<p className={styles.eyebrow}>Software Manajemen Konter HP & Elektronik</p>` — teks mono brand berwarna sebagai sinyal on-page keyword yang terlihat user, sekaligus memperkuat relevansi H1 yang masih puitis.
- Domain kanonikal: `https://fixmaster.app` (domain kustom di Vercel sejak 1 Jul 2026; sebelumnya `getfixmaster.vercel.app`). Dirujuk di `index.html` (canonical, og:url, JSON-LD), `public/robots.txt`, `public/sitemap.xml`. Link tracking/reset password pakai `window.location.origin` (adaptif otomatis).

> [!important] Galeri menu masalah→solusi (revisi 22 Jun 2026)
> Matriks banding bernama (FixMaster vs FixNova vs FixMate) **DIHAPUS** atas keputusan user. Diganti **galeri menu** (`#galeri`, data `MENU_GALLERY`): satu kartu per menu (Dashboard, Servis, POS, Inventaris, Pelanggan, Keuangan, Laporan, Pengaturan) berisi **screenshot asli** (dark/light auto-swap, `loading="lazy"`) + dua baris narasi bench: **"Tanpa sistem"** (baris FAULT, LED merah — keluhan tanpa aplikasi) → **"Dengan FixMaster"** (baris FIX, LED hijau — manfaat menu). Nav "Banding"→"Galeri". Screenshot diregenerasi via `scripts/shoot-menus.mjs` → `public/screenshots/menu-<slot>-{dark,light}.png` (16 file). Demo interaktif tetap ada. Aturan tetap: klaim fiktif (statistik/testimoni) dilarang.
>
> **Redesign showcase (22 Jun 2026, malam):** grid 2-kolom polos diganti **showcase imersif** (`.showcase` → `.showRow`). Tiap menu = screenshot dibingkai sebagai **layar instrumen** (bezel ber-LED `LIVE` + label menu + stamp, 4 sekrup sudut pakai kelas `.screw` bersama, sheen `.showScan`, hover zoom halus) di satu kolom, dan **panel info** (slot mono, judul besar `font-display`, divider titik, baris TANPA SISTEM→FIXMASTER) di kolom lain. **Desktop**: baris **berselang kiri/kanan** (`data-flip` ganjil → `order:2` pada layar) untuk ritme. **Mobile** (≤860px): menumpuk 1 kolom (layar di atas info, flip di-reset). Token-only, dark/light auto. Verifikasi via Playwright (desktop dark/light + mobile dark).
>
> **DICABUT → komparasi 3-mode (23 Jun 2026).** Atas keputusan user ("tetap hapus showcase"), galeri + module rack + fault panel **dihapus** dan diganti **section komparasi `#banding`** (lihat bullet "Komparasi 3-mode" di atas). Alasan: showcase membuat landing terlalu panjang ("seperti PDF di-scroll"); komparasi sakit→beres→tumbuh lebih ringkas, SEO-friendly, dan menjual tanpa klaim fiktif. Visual produk asli tetap ada di **section Demo** (poster `/demo`). Verifikasi via Playwright (`scripts/shoot-landing-compare.mjs`: desktop dark/light + mobile dark).

> [!note] Audit landing (23 Jun 2026)
> Perbaikan berdasarkan audit sisi tampilan/mobile/SEO/copy:
> - **Copy**: CTA final diubah jadi value re-statement ("Kontermu rapi, uangmu jelas, pelangganmu kembali."); section labels di-humanisasi ("PAKET & HARGA", "PERTANYAAN UMUM · Q&A", "5 AREA"); "FX · BENCH OS" → "Manajemen Konter Reparasi"; "v1.0" dihapus → "SERVIS REPARASI"; fine print semua caps → sentence case.
> - **SEO**: title useEffect sinkron; eyebrow keyword; JSON-LD availability InStock; meta keywords lebih tepat; alt text gambar demo deskriptif.
> - **Mobile UX**: comparison `<article>` → `<details>`/`<summary>` accordion — di mobile collapse/expand (chevron), di desktop non-interaktif (semua open). Menyelesaikan doomscroll M1.
> - **Visual**: demoPlay ring putih 4px untuk kontras lebih tinggi di overlay gelap.

![[landing-full-dark.png]]

## Demo Interaktif — Bench Hidup (publik, tanpa login)

Pengunjung **memakai FixMaster yang sungguhan** sebelum daftar — bukan video, bukan mockup statis. Route publik **`/demo`** (intersep di level `App`, bukan child router). Landing **meng-link** ke route ini (poster + tombol), **tidak** lagi meng-embed via iframe.

**Arsitektur isolasi** (lihat [[Data Layer]] § InMemoryAdapter):
- [`DemoApp`](src/features/demo/DemoApp.tsx) saat mount: `installRepository(new InMemoryAdapter())` (RAM-only, nol jejak disk — IndexedDB asli pengunjung tak tersentuh), `useDemoStore.enter()`, lalu **pakai ulang seed yang sudah ada** (`src/dev/seed.ts` via `commitWizard({forceLocal:true})`) → konter gadget terkurasi. Sesi masuk sebagai **owner** → semua menu terbuka (termasuk Laporan, Aktivitas, Pengaturan).
- Berjalan di **`MemoryRouter`** sendiri yang memakai ulang `appChildRoutes` (rute anak yang sama dengan app asli, via [`appChildRoutes.tsx`](src/app/appChildRoutes.tsx)) → navigasi sidebar tetap di dalam demo, URL browser tetap `/demo`.
- **Nested-router trap**: `MemoryRouter` tak boleh di dalam `BrowserRouter`. Solusi: `App` mengintersep `pathname.startsWith('/demo')` **sebelum** `RouterProvider` mount → DemoApp jadi satu-satunya router. Route `/demo` **dihapus** dari `router.tsx`.
- **Bersih saat unmount**: `resetRepository()` (kembali ke adapter asli) + `session.reset()` + hapus meta `noindex`.
- **`noindex`**: meta robots disuntik selama demo mounted (demo = sandbox, bukan konten SEO).

**Faceplate demo** ([`DemoChrome`](src/features/demo/DemoChrome.tsx)): bar instrumen menetap di atas app — sekrup sudut, **LED warning berdenyut**, readout mono `MODE DEMO · data contoh · tidak tersimpan`, tombol **Reset Demo** (re-seed dataset awal), dan CTA brand **Daftar Gratis** (`exitDemoToSignup` → `/?auth=1`). Bukan banner SaaS generik.

**Aksi sensitif dijinakkan** (`demoGuard()` di [`stores/demo.ts`](src/stores/demo.ts)): Keluar/ganti akun (Sidebar), Reset & Hapus Akun + Backup/Restore (Settings), Kirim WhatsApp & Cetak Nota (NotifyModal) → semua menampilkan toast + ajakan daftar, **tanpa** menjalankan logika destruktif/keluar-app.

**Landing**: poster "Coba Langsung" + tombol "Buka Demo Layar Penuh" sama-sama **meng-link ke rute `/demo`** (navigasi penuh). Iframe embed sudah **dihapus** (gagal di produksi karena header `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'` — yang kini dikembalikan ke setelan paling ketat). Detail di [[Decisions & Bug Fixes]].

![[demo-dashboard-dark.png]]

## Legal — Dokumen Teknis Terkontrol (publik, wajib UU PDP)

Dua route publik standalone (`/privacy`, `/terms`, di luar `AuthGate`) agar bisa ditaut dari consent signup, gateway pembayaran, app store. Di-redesign dari prosa biasa jadi **dokumen teknis terkontrol**. Shell [`LegalLayout`](src/features/legal/LegalLayout.tsx) kini menerima prop `docId`:
- **Doc plate masthead** bersekrup: kode `DOK. PRIVASI-001` / `SK-001`, `REV 2026.06.07`, spec rows (STATUS ber-LED, DASAR UU PDP, BAHASA).
- **Section bernomor manual**: `h2` di-prefix counter `decimal-leading-zero` (01, 02…) lewat CSS counter + badge brand mono.
- Cross-link bergaya kode dokumen. Konten [`PrivacyPage`](src/features/legal/PrivacyPage.tsx) mengacu **UU PDP No. 27/2022**; [`TermsPage`](src/features/legal/TermsPage.tsx) mencakup langganan/trial, pembayaran, larangan, batasan tanggung jawab, penghentian. Keduanya **template itikad baik** — perlu review hukum sebelum launch (ada callout). Signup `AuthPage` menampilkan baris consent bertaut ke kedua halaman.

![[privacy-dark.png]]

## Fallback Error — Fault Panel

`ErrorBoundary` (root + route) juga di-redesign dari icon-card generik jadi **panel diagnostik fault** sefamili bench: pelat bersekrup, header **`FAULT` stamp** ber-LED danger berdenyut + **kode fault** (`FX-SYS-500` root / `FX-MOD-500` route), aksi pulih (Coba Lagi / Muat Ulang). Lihat [[Decisions & Bug Fixes]].

---

## Kasir POS — Register Readout

Panel keranjang jadi **mesin kasir**: layar LCD total bergaya segment-display (digit mono, glow amber, ghost "88.888", scanline, indikator LIVE), badan **struk thermal monospace** dengan garis titik-titik, **perforasi sobek**, footer checkout. Tombol qty mekanis (turun saat ditekan).

**Tab bar (11 Jun 2026).** Halaman dipecah jadi dua tab bergaya bench (mono uppercase, underline brand saat aktif): **Kasir** (grid produk + register) dan **Transaksi Terakhir** (riwayat + void, manager-only, dengan badge jumlah). Sebelumnya panel riwayat menumpuk di bawah register dan mengganggu alur kasir; kini terpisah sehingga layar kasir bersih dan riwayat punya ruang sendiri. Modal void diangkat ke level halaman agar bisa dipanggil dari tab manapun.

![[pos-dark.png]]

## Inventori — Parts Bin

Tabel jadi **grid laci komponen**. Tiap sparepart = bin berlabel kategori, dengan **LED status** (cyan aman / amber menipis / merah habis), angka stok mono besar, dan **fuel-gauge** ber-tick relatif terhadap stok minimum.

![[inv-dark.png]]

## Dashboard — Diagnostic Panel

Panel diagnostik: metric tile mono + level-meter. Membaca KPI dari `computeKpis()` di [[Data Layer]].

![[dash2-dark.png]]

## Pelanggan — Contact Registry

**Grid kartu arsip**: plate inisial, **ID mono** (ID-XXXXXX), baris kontak HP/email/alamat mono, readout aktivitas (jumlah servis + total transaksi), penanda **Pelanggan Setia** (LED cyan).

- **Drawer Riwayat Servis (19 Jun 2026).** Klik kartu pelanggan → **panel geser kanan** (`CustomerHistoryDrawer`) berisi daftar tiket pelanggan itu (newest-first): **LED status per tone** (pakai `STATUS_TONE`), no tiket mono, perangkat (`category · device`), tanggal, biaya, + link ke detail tiket. Data servis sudah di-load di halaman (untuk statistik) → tanpa fetch baru. Kartu kini `role=button` + keyboard (Enter/Space); tombol edit/hapus pakai `stopPropagation` agar tak ikut membuka drawer. Menjawab kebutuhan "lihat unit apa saja yang pernah masuk", bukan sekadar angka jumlah.

- **Filter kategori perangkat + Kirim WA (22 Jun 2026).** Toolbar dapat **dropdown "Semua Perangkat"** — daftar kategori diturunkan dari **riwayat servis** tiap pelanggan (`custCategories`: map customerId → set `service.category`), bukan field di Customer (Customer tak punya kategori sendiri). Filter hanya muncul bila ada ≥1 kategori. Tiap kartu pelanggan ber-nomor kini punya tombol **WhatsApp** (LED hijau hover `--success-soft`) di footer: buka `wa.me` (helper `waLink`/`toWaNumber` dari [[Data Layer]]) dengan sapaan ber-merek toko (`Halo {nama}, {toko} di sini.`) yang bisa diedit user sebelum kirim. **Demo-guarded** (`demoGuard`) seperti `NotifyModal`. Batasan jujur: `wa.me` hanya buka **satu chat per klik** — tak ada auto-blast massal (butuh WA Business API). Tombol hanya tampil bila pelanggan punya nomor.

![[cust-dark.png]]

## Supplier — Vendor Ledger

Tab PO jadi **baris docket** dengan spine status (biru dipesan / amber sebagian / hijau diterima / abu draft), chip PO mono, total tabular, **tombol Terima mekanis**. Tab Supplier jadi kartu vendor + readout pembelian.

- **Sinkron PO → Keuangan + void otomatis (19 Jun 2026).** ReceiveModal kini menampilkan **readout nilai diterima** (mono) + **checkbox "Potong dari wallet"** (default ON + wallet utama) dengan pemilih wallet. Terima barang → otomatis catat **Expense `'Pembelian stok PO <no>'`** (partial-aware: senilai yang masuk saat itu) & (bila tunai) potong saldo wallet — atomik via RPC `receive_goods_v2` di cloud, tulis berurutan di lokal. Tiap docket PO (non-draft/non-cancelled) punya **tombol batalkan** (ikon danger): **void otomatis** balikkan stok, refund wallet, hapus expense ter-link, set `cancelled`. Lihat [[Data Layer]] migrasi `0034`.

![[sup-dark.png]]

## Keuangan — Cashbook Tape

Wallet jadi **meter readout**. Buku kas jadi **pita thermal monospace** dengan spine income/expense (hijau/merah), nominal +/- mono — senada struk POS.

- **Edit pengeluaran (19 Jun 2026).** Tiap baris **pengeluaran** punya tombol **Edit** (pensil); income tidak (income sistem dari servis/POS — hanya `expense.update` ada di `ActivityAction`, tak ada `income.update`). `EntryModal` kini punya **mode edit**: prefill record + **rekonsiliasi saldo wallet** (wallet sama → selisih `old−new`; wallet diganti → kembalikan lama, potong baru). Log `expense.update` dengan `meta.prevAmount`.
- **Transfer antar wallet (19 Jun 2026).** Dulu **hanya di Pengaturan**; kini tombol **Transfer** juga di menu Keuangan (muncul bila ≥2 wallet) → `TransferModal` memakai helper murni `transfer()` + RPC `transfer_wallet` (atomik, manager-only) yang sama. Transfer **tak membukukan income/expense** (bukan untung/rugi → laporan tak menggelembung), hanya pindah saldo + log `wallet.transfer`.
- **Riwayat transfer + filter per-wallet + paging baris (31 Jul 2026).** Tiga perbaikan yang saling terkait di Buku Kas:
  1. **Tab `TRANSFER`** — transfer antar wallet kini **ikut tampil** di Buku Kas (tab Semua & tab Transfer). Sumbernya **activity log** (`action = 'wallet.transfer'`) karena transfer memang tak punya tabel/ledger sendiri; dibaca lewat `useCollectionRange('activity','createdAt', …)` + `rangeForTimestamp` pada jendela bulan yang sama. Baris transfer bergaya **netral** (spine `--text-muted`, tanpa +/− hijau-merah) dan **tak bisa dihapus/diedit** — audit log immutable. **Batasan sadar:** RLS `activity_select` = **owner-only**, jadi admin melihat tab Transfer kosong (`ponytail:` di kode → bikin tabel `wallet_transfers` kalau admin perlu).
  2. **Klik kartu wallet → filter transaksi wallet itu.** Kartu wallet jadi `<button>` (aria-pressed, hint `LIHAT TRANSAKSI`); judul kartu berubah jadi `Buku Kas · <wallet>` + tombol **Semua wallet** untuk reset. Transfer cocok bila wallet asal **atau** tujuan = filter, dan tandanya jadi berarah (`+` masuk / `−` keluar).
  3. **Cap 100 baris → paging.** Dulu `slice(0,100)` keras: "muat bulan sebelumnya" tak berguna karena baris lama tak pernah kebagian slot. Kini `limit` state (`PAGE_SIZE = 100`) + tombol **Tampilkan lebih banyak**; hint footer jadi `X dari Y baris`. Footer (termasuk "muat bulan sebelumnya") kini **ikut dirender saat kosong** — dulu tersembunyi di cabang `EmptyState`, sehingga filter wallet tanpa hasil jadi jalan buntu.
  - Logika murni pemetaan log→baris ada di `transferEntries()` ([`lib/business/finance.ts`](src/lib/business/finance.ts), 4 unit test: pemetaan dua sisi, abaikan aksi lain, trim tepi ±1 hari dari `rangeForTimestamp`, log tanpa `meta`).

![[fin-dark.png]]

## Laporan — Analyzer Printout

Metric tile mono (spine + LED), break-even jadi **tick gauge**, breakdown kategori + leaderboard jadi **channel analyzer** dengan bar proporsi relatif. Sejak 19 Jun 2026 diperkaya **8 visual analitik** (logika agregasi murni di [`lib/business/reports.ts`](src/lib/business/reports.ts), teruji 19 unit test):
1. **Tren Pemasukan vs Pengeluaran** — grafik garis **SVG murni** (komponen [`TrendChart`](src/features/reports/TrendChart.tsx), tanpa library) dengan crosshair hover, area pemasukan, gridline + label mono. Bucket auto: harian (≤31 hr) / mingguan (≤184 hr) / bulanan (selebihnya).
2. **Rincian Transaksi** — tabel on-screen (versi layar dari CSV): tag jenis, kategori, keterangan, nominal bertanda; cap 100 baris (sisanya via ekspor).
3. **Laba per Kategori Perangkat** — omzet + laba kotor (finalCost − biaya part) per jenis perangkat (HP/laptop/dst), servis selesai/lunas.
4. **Sparepart Terlaris + Saran Restok** — part paling sering dipakai (qty+biaya) & item ≤ minStock (neediest first).
5. **Funnel Servis + Turnaround** — jumlah unit per status (urutan workflow) + rata-rata hari diterima→selesai (dari history).
6. **Delta vs Periode Lalu** — metric tile pemasukan/pengeluaran/laba menampilkan % perubahan vs jendela sebelumnya yang setara (pengeluaran: naik = merah).
7. **Perbandingan Antar-Outlet** — income/expense/net per cabang (hanya muncul bila >1 outlet; null = "Tanpa Cabang").
8. **Aging Piutang** — tabel servis selesai yang belum lunas (sisa = finalCost − DP), umur dari tanggal selesai dengan tag 0-7 / 8-30 / 31+.

- **Ekspor CSV (19 Jun 2026).** Tombol **Ekspor CSV** di date bar mengekspor rincian transaksi (pemasukan+pengeluaran) periode terpilih, ter-scope outlet aktif, terurut terbaru. Helper baru `lib/csv.ts`: `toCsv()` (escaping RFC-4180) + `downloadCsv()` (BOM UTF-8 agar Excel baca rupiah/aksen benar). Nama file memuat scope + rentang tanggal.

> [!warning] Akses Laporan kini **owner-only** (migration `0019`)
> Sebelumnya manager (owner+admin). Sekarang hanya **owner**: nav pakai flag `ownerOnly`, rute dibungkus `OwnerRoute`, dan `reports.view` dicabut dari admin. Lihat [[Decisions & Bug Fixes]].

![[rep-dark.png]]

## Log Aktivitas — Event Recorder · Diagnostic Trace (owner-only)

Halaman `/activity` ([`ActivityLogPage`](src/features/activity/ActivityLogPage.tsx)), **khusus owner** (dijaga `OwnerRoute` + RLS SELECT owner-only, migration `0019`). Menjawab kebutuhan owner mengawasi aktivitas tiap peran. Metafora: **perekam data multi-kanal (event recorder)** sebench dengan POS Register & Cashbook Tape:
- **Faceplate bersekrup** ber-wash grid blueprint: **LED REC merah berdenyut** (`recBlink`) + judul, dan **panel readout LCD** mono ber-glow amber (`TOTAL` / `TAMPIL` / `KANAL`, angka zero-pad tabular). `KANAL` = jumlah aktor unik pada hasil filter.
- **Control strip**: cari (nama aktor / label objek), dropdown peran, dropdown aksi, tombol reset (muncul bila ada filter).
- **Trace rail**: event dikelompokkan per hari (header tanggal sticky + hitung). Sebuah **spine vertikal putus-putus** (sinyal kanal) membentang di belakang **signal-node** — lingkaran ber-ring tone (success/warning/danger/info via `actionMeta`) berisi ikon aksi. Tiap baris: label aksi, label entitas (chip mono amber), aktor + badge peran, dan **timestamp `HH:MM`** tabular berpembatas kiri.
- **Append-only**: tak ada aksi edit/hapus — jejak audit kebal manipulasi. Aksi tercatat: login, POS jual/void, pemasukan/pengeluaran create+update+delete, transfer wallet, inventori CRUD, pelanggan CRUD, absensi check-in/out/koreksi/hapus, tugas buat/selesai, servis create & ubah status. (19 Jun 2026: ditambah `task.create`, `task.complete`, `attendance.checkin`, `attendance.checkout` — sebelumnya tugas tak di-log & absensi hanya koreksi.) Logika presentasi murni di `lib/business/activity.ts`; penulisan via `logActivity()` fire-and-forget. State kosong & loading juga bertema (pulse / spinner mono). Lihat [[Data Layer]].

![[activity-dark.png]]

## Tugas — Job Board

Tiap tugas jadi **tiket kerja** dengan spine status (amber pending / merah berkedip telat / hijau selesai), **checkbox mekanis**, due-tag mono. Template jadi baris SOP dengan chip recurrence. Logika di `lib/business/tasks.ts` (`isOverdue`).

**Bulk pembuatan template** (`TaskTemplateModal`): saat **buat baru**, kolom Judul Tugas jadi **textarea multi-baris** — satu judul per baris. Semua judul dibuat sekaligus (`repository.putMany`) berbagi setelan pengulangan + penerima yang sama; ada penghitung live "N tugas akan dibuat" (mono, brand). Mode **edit** tetap satu judul (`Input` biasa). Parsing: split `\n` → trim → buang baris kosong.

![[tsk-dark.png]]

![[bulk-task-dark.png]]

## Absensi — Punch Clock

Kartu jam jadi **readout LCD waktu hidup** (berdetak per detik, scanline, LED status). Kehadiran jadi baris **punch-card**; riwayat jadi **timecard ledger** mono.

- **Scoping riwayat per peran (19 Jun 2026).** "Kehadiran Hari Ini" tetap papan tim bersama, tapi **Riwayat Absensi** kini di-scope: **manager** (owner/admin) lihat seluruh tim, **karyawan** hanya barisnya sendiri (`attendance.filter(employeeId===me)`). Sebelumnya semua user lihat semua baris (bocor privasi rekan). Aksi koreksi/hapus tetap manager-only.

![[att-dark.png]]

## Daftar Servis — Repair Job Cards

Halaman `/services`: **tabel padat di desktop**, **kartu kompak di mobile** (responsif). Tiap baris/kartu = job card dengan badge status bertone, nomor servis mono, biaya tabular, dan kolom aksi.

**Kolom Modal & Profit (owner-only).** Di desktop, tabel menambah kolom **Modal** (total HPP sparepart + modal dadakan) & **Profit** (`finalCost − modal`, tone hijau untung / merah rugi); kartu mobile menambah baris Profit. Keduanya **hanya tampil untuk owner** (`role === 'owner'` via session) — admin & karyawan tak lihat margin. Profit hanya muncul saat `finalCost > 0` (sebelum biaya final pasti → em-dash, agar tak menyesatkan).

**Tiga kolom uang dibedakan warna (11 Jun 2026).** Untuk scan cepat: **Biaya** = amber (`--brand-hover`), **Modal** = biru info (`--info`), **Profit** = hijau/merah (untung/rugi). Semua mono tabular, lewat token (otomatis benar dark/light).

**Status bisa diklik + aksi Update Status mencolok (11 Jun 2026).** Badge status di tabel & kartu kini **tombol** — klik membuka StatusModal langsung (ikon pensil muncul saat hover, hover brand-soft). Di kolom aksi, tombol update status diubah dari ikon polos jadi **pill brand berlabel "Status"** (border brand, hover terisi penuh + shadow-brand) agar jadi aksi utama yang jelas. Dua jalur ini berbagi handler yang sama dengan ikon-aksi lain.

**Status pengambilan barang (16 Jun 2026).** Pengambilan fisik unit dilacak terpisah dari status bayar (field `pickedUp`/`pickedUpAt`, kolom DB sejak `0006`). Definisi "menunggu diambil" = helper murni **`isAwaitingPickup`** (`!pickedUp` & status `selesai`/`lunas`/`batal`) di `lib/business/services.ts` — satu sumber kebenaran, dipakai bersama dashboard. Di `/services`:
- **Filter Pengambilan** (select baru): Semua / Belum diambil / Sudah diambil.
- **Stat card "Menunggu Diambil"** (tone warning, ikon box) di deret atas.
- **Indikator visual** per baris tabel & kartu mobile — bench motif: **LED warning + readout mono** "Belum diambil" (menonjol) vs penanda redup "Diambil" (hanya dirender untuk unit selesai/lunas/batal; unit proses tak berisik).
- **Aksi cepat "Tandai Diambil"** langsung dari daftar (toggle, tanpa buka detail) — **khusus owner/admin** (karyawan lihat status tapi tak lihat tombolnya).

**Quick-suggest pelanggan di Servis Baru (22 Jun 2026, anti-duplikasi).** Form `ServiceModal` (Servis Baru) kini menampilkan **dropdown saran pelanggan terdaftar** saat mengetik di field Nama / No. HP — maks 5, cocok via nama (substring) atau HP ternormalisasi (helper murni `searchCustomers`, [[Data Layer]]). Klik saran → isi nama+HP sekaligus, mencegah pembuatan pelanggan **nyaris-duplikat** akibat ketik ulang nama berbeda tipis. Dropdown bergaya bench: **spine kiri brand saat hover**, nama + **readout HP mono** di kanan. Backstop tetap: saat simpan, `findByPhone` me-link ke pelanggan existing (tak buat baru). Hanya untuk servis **baru** (bukan edit). Field **Nama Pelanggan** & **Perangkat** kini auto-kapital tiap kata (prop `autoCapWords`, [[Conventions]]).

![[modal-profit-table-dark.png]]

## Detail Servis — Repair Ticket

Halaman `/services/:id`: traveler strip mengikuti status + timestamp asli, BOM sparepart dari data nyata, panel biaya (sisa tagihan & profit), action bar ke modal Edit/Status/WhatsApp.

Fitur tambahan (revisi Fase 4):
- **Toggle "Sudah Diambil"** — menandai barang sudah diambil pelanggan, terpisah dari status pembayaran; indikator status ambil tampil di header. **Tombol kini khusus owner/admin** (16 Jun 2026) — karyawan tetap melihat indikator, tapi tak bisa men-toggle. Aksi sama tersedia sebagai aksi cepat di Daftar Servis.
- **Garansi saat "selesai"** — saat status → `selesai`, StatusModal menampilkan input lama garansi **Jasa** & **Sparepart** (hari), wajib minimal salah satu, prefill default dari Pengaturan. **Chip template (revisi 22 Jun 2026)**: tiap field punya baris chip **angka hari** sendiri (`7 · 14 · 30`) yang mengisi field di atasnya — konteks Jasa/Sparepart dari label field, bukan teks chip (dulu 6 tombol "Jasa 7h / Part 14h" yang ramai). Menghasilkan `warrantyServiceUntil` & `warrantyPartsUntil` terpisah (tampil dua baris di header detail).
- **Tombol "Klaim Garansi"** — muncul hanya pada tiket `lunas` yang masih dalam masa garansi → membuka [[Data Layer|tiket klaim tertaut]] gratis lewat `WarrantyClaimModal`, dengan opsi catat kerugian garansi manual.

Fitur tambahan (profit per unit — revisi 11 Jun 2026):
- **Panel SPAREPART · BOM** punya dua tombol: **"+ Sparepart"** (buka `SparepartPickerModal` — pilih item inventory + qty, idiom bench: LED stok, SKU mono) dan **"+ Modal Dadakan"** (form inline: keterangan + nominal + **dropdown wallet**). Tiap baris bisa dihapus (ikon trash); baris **modal dadakan** juga bisa **diedit** (ikon pensil, hover brand) — form yang sama terbuka pra-isi dengan label "Perbarui Modal".
- **Modal dadakan** membuat Expense kategori `Sparepart` (kas keluar) + memotong wallet terpilih; hapus baris membalikkannya (hapus Expense + refund wallet). **Edit** baris menyinkronkan Expense terkait (nominal/wallet/keterangan) dan **men-net saldo wallet** lewat helper murni `walletDeltasForModalEdit` (refund debit lama + terapkan debit baru; edit di wallet sama → satu delta, mis. 100k→150k = −50k; no-op → nol tulisan). Sparepart inventory hanya memotong stok saat Pengerjaan (tak buat Expense) — anti dobel-hitung. Lihat [[Data Layer]] § Sparepart BOM & modal dadakan.
- **Wallet A1 + ingat terakhir**: dropdown default ke wallet terakhir dipakai (per-perangkat), fallback wallet pertama; bisa diganti per transaksi.
- **Panel BIAYA** kini **read-only** untuk angka finansial: baris **Modal** & **Profit unit** (tone untung/rugi, **owner-only**), Estimasi, Biaya final, dan bila ada DP baris **DP diterima** (negatif) + **Sisa tagihan**. Tak ada lagi tombol input DP/koreksi inline di sini.
- **Input finansial terpusat di StatusModal** (tombol **Update Status**; untuk tiket `lunas` ada tombol **Koreksi Biaya** yang membuka modal sama). StatusModal punya **tab sub-aksi** sesuai status + peran:
  - **Ubah Status** — pilih status tujuan, biaya final, garansi. Saat target **`lunas`** tampil **editor pembayaran (split payment)**: daftar leg `{wallet, nominal}` + tombol **+ Tambah wallet** + ringkasan **terbayar/sisa** (mono, hijau saat balance). Default satu leg menutup penuh; bisa dipecah ke beberapa wallet (mis. Cash + QRIS). Total wajib sama persis dengan sisa tagihan. Memperbaiki kerancuan lama "pelunasan lewat wallet apa" (dulu hard-coded wallet pertama).
  - **Terima DP** — nominal + wallet; mencatat DP sebagai **kas masuk nyata** (Income kategori Servis + kredit wallet) & mengakumulasi `downPayment`. Saat lunas hanya **sisa tagihan** dicatat; saat batal DP otomatis di-refund.
  - **Koreksi Biaya** — owner/admin, hanya saat `lunas`; pra-isi `finalCost`, menyesuaikan pendapatan pelunasan & saldo wallet **tanpa membatalkan tiket** (log internal). Guard: tak boleh < DP. Lihat [[Data Layer]] § DP, pelunasan & koreksi biaya.
- **StatusModal** juga menampilkan ringkasan read-only sparepart & modal terpasang (kelola BOM tetap di halaman detail — satu-satunya input yang tersisa di detail, karena iteratif).
- **UX karyawan saat hanya bisa DP (16 Jun 2026).** Pada unit `selesai`, karyawan tak bisa ubah status (pelunasan owner/admin) sehingga modal jatuh ke DP-only. Dua perbaikan agar tak menyesatkan: (1) StatusModal menampilkan **catatan kontekstual** di atas form DP ("Pekerjaan selesai. Pelunasan hanya bisa owner/admin. Kamu masih bisa menerima DP.") — gaya bench: spine brand kiri + wash brand-soft; (2) tombol action bar di detail **relabel jadi "Terima DP"** (bukan "Update Status") bila satu-satunya aksi yang diizinkan role ini adalah DP. Dihitung via `nextStatuses` + `canSetStatus` (flag `staffDpOnly`/`onlyDp`). Aturan keamanan tak berubah.
- **Tombol Cetak Nota di action bar (19 Jun 2026).** Action bar detail kini punya tombol **Cetak Nota** langsung (dulu cetak hanya di modal Notifikasi & nota; modal itu di detail malah tak pernah dibuka/dead). Logika cetak diekstrak ke helper bersama **`printServiceReceipt(service, org)`** (`features/services/printReceipt.ts`) → dipakai NotifyModal + detail, format nota (thermal mono) identik. Guard demo tetap.
- **Garansi di struk (19 Jun 2026).** `serviceReceiptLines` (`lib/business/notify.ts`) dulu tak pernah menyertakan garansi → struk hanya info toko + biaya. Kini menambah baris **Garansi Jasa s/d** & **Garansi Part s/d** (dari `warrantyServiceUntil`/`warrantyPartsUntil`, terisi otomatis dari default toko saat servis ditandai `selesai`). Lapor user smoke test: "hanya ada info toko saja pada struk".
- **Lacak servis tanpa `?org=` (19 Jun 2026).** `TrackingPage` meng-gate lookup `enabled: !!orgId`, dan `orgId` hanya dari param `?org=`. Buka `/track` langsung (tanpa link resmi) → query mati, tak ada hasil maupun pesan. Kini fallback ke **org sesi** bila login (skenario owner menguji dari app), + pesan jelas bila benar-benar tanpa konteks toko. Lookup tetap org-scoped (no servis seperti FM-0001 berulang antar toko); link resmi `/track?org=&no=` tak berubah.
- **Kontak toko + garansi di halaman lacak (22 Jun 2026).** Lapor user: link lacak "kurang memuat info lengkap". `TrackingPage` kini menampilkan, di bawah timeline: (1) blok **Garansi** — baris Jasa/Sparepart "s/d <tanggal>" (mono), muncul bila ada `warrantyServiceUntil`/`warrantyPartsUntil`; (2) blok **Kontak Toko** — tombol **WhatsApp** (`wa.me/<nomor>` dengan normalisasi `0`→`62`) + alamat (`map-pin`). Label blok bergaya readout mono bench, divider titik. **Sengaja TANPA** biaya/estimasi/DP (keputusan: link publik tak bocorkan harga). Jalur cloud dapat field dari RPC `track_service` yang diperluas (migrasi `0035`, [[Data Layer]]); jalur lokal baca `organizations` langsung. Tipe `TrackServiceResult` (`supabase-client.ts`) + `TrackResult` (`TrackingPage`) diperluas.

![[modal-profit-detail-dark.png]]

![[detail-dark.png]]

![[warranty-detail-dark.png]]

![[warranty-modal-loss-dark.png]]

![[status-warranty-dark.png]]

---

## Pengaturan — Operasional

Halaman `/settings` punya enam tab. Tab **Operasional** (revisi lanjutan) mengelompokkan konfigurasi alur kerja:
- **Template Servis** — quick-pick keluhan & kelengkapan (dipindah dari tab Usaha).
- **Garansi** — default lama garansi Jasa & Sparepart (hari) + preset durasi quick-pick yang dipakai StatusModal.
- **Template WhatsApp** — editor per-kunci (Diterima/Selesai/Konfirmasi) dengan daftar variabel `{...}` & reset-ke-default. Override disimpan di `orgConfig`, kosong = fallback ke `DEFAULT_WA_TEMPLATES` via `resolveWaTemplates`. **Sejak 31 Jul 2026** default-nya **multi-baris** (sapaan → blok data → satu ajakan aksi → penutup), `*bold*` WhatsApp untuk no servis/nominal/status; `konfirmasi` memakai `{estimasi}` (bukan `{biaya}` yang berisi `finalCost`). Textarea editor `rows=10` & preview NotifyModal `rows=12` agar tak terpotong. Unit test menjaga tiap placeholder ada di `WA_TEMPLATE_VARS` (typo = `{no_service}` mentah terkirim ke pelanggan).

> Kartu **Tampilan** (pemilih skala Kecil/Normal/Besar) **dihapus**. Ukuran UI kini satu baseline tetap (`html { font-size: 15px }`) yang konsisten di semua device; responsivitas ditangani lewat media query, bukan skala font global. Lihat [[Decisions & Bug Fixes]].

![[settings-operasional-dark.png]]

---

## Pengaturan — Langganan (Billing License Meter)

Tab **Langganan** (`/settings`, owner + cloud-only) memakai metafora **"daya/lisensi bench"** — langganan = daya untuk mengoperasikan workshop. Senada bahasa visual Signature Pages lain (POS Register Readout, Cashbook Tape):

- **License Meter** — kartu status: **LED** fase (ok hijau / warn amber / **crit merah berkedip** `fm-pulse`), nama plan font display, readout sisa hari mono besar, dan **charge-gauge** 24-tick (fill = sisa hari / ~30 hari, warna ikut fase) di atas wash grid blueprint.
- **Pay dock** — invoice pending jadi panel readout (label mono, nominal besar, nama plan) + tombol/link QRIS.
- **Tier modules** — kartu paket ber-**spine** kiri; kartu rekomendasi diberi spine gradient brand + tag mono "DISARANKAN"; harga **mono** tebal.
- **Receipt tape** — riwayat invoice jadi **pita thermal mono** dengan divider titik-titik + spine status (paid hijau / pending amber / void abu) + chip status pill — senada struk POS & Cashbook Keuangan. Tombol Batalkan tetap untuk invoice pending.

Logika tak berubah (subscribe/confirm/cancel + auto-refresh realtime); murni lapisan presentasi pakai token `var(--...)`.

![[billing-dark.png]]

---

## Sign Up / Login — Terminal Akses Bench

Halaman auth (`AuthPage`, cloud-only, sebelum workspace boot) — login / daftar / reset. Dulu kartu glass polos di tengah; kini **split-panel "terminal akses bench"** senada identitas produk:

- **Panel brand (kiri)** — logo + wordmark FixMaster, tagline domain (reparasi gadget/elektronik), dan **diagnostic rail** ber-LED (BENCH ONLINE / DATA TERSINKRON / QRIS SIAP) bergaya mono — gema dari [[Sidebar - Live Diagnostic Rail]]. Wash grid blueprint + radial brand.
- **Panel form (kanan)** — **faceplate bersekrup** di empat sudut, header "Terminal Akses" dengan **power LED** (accent, berkedip `fm-pulse`) + tag mode mono (login/signup/reset), lalu form (email/password/konfirmasi) + tautan. Header kini juga memuat tombol **"Beranda"** ber-ikon di kiri (kembali ke landing — selalu terlihat tanpa scroll, gantikan tautan lama di dasar) dan **toggle tema** sun/moon di kanan.
- **Responsif** — di ≤720px panel brand disembunyikan, form jadi faceplate tunggal dengan wordmark ringkas di atas.

Logika auth tak berubah (Supabase Auth: signIn/signUp/resetPassword). Copy toast signup diperbaiki: tak lagi menyebut "cek email untuk verifikasi" karena email confirmation dimatikan — akun langsung aktif → arahkan ke login. Token `var(--...)` saja.

**Show-password + indikator kekuatan (22 Jun 2026).** Field password (login, daftar, reset) kini punya **tombol mata** (`revealable` di `Input`, ikon `eye`/`eye-slash`) untuk toggle tampil/sembunyi. Saat **daftar** (dan di halaman reset), muncul **indikator kekuatan** `PasswordStrength` bergaya bench (BUKAN bar generik): **LED status + readout mono** LEMAH/SEDANG/KUAT, **tick-gauge 4 segmen**, dan chip per-kriteria (min. 8 karakter, huruf, angka, **simbol = bonus**). Warna level lewat token (`--danger`/`--warning`/`--success`). Syarat WAJIB tetap huruf+angka+≥8 (tak mengunci akun lama saat login); simbol hanya menambah skor. Skor dihitung helper murni `scorePassword` (`lib/business/password.ts`, teruji unit).

![[auth-dark.png]]

---

## Terkait
- [[Design System]] · [[Sidebar - Live Diagnostic Rail]] · [[Data Layer]] · [[Decisions & Bug Fixes]]

#signature-page #design-system
