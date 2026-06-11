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
- **Fault panel** (pain points): 6 "gejala toko tanpa sistem" jadi **kartu fault** — spine amber, ikon warning-soft, badge `FAULT` LED merah, lalu baris "fix" ber-LED hijau (gejala→solusi). Resonansi emosional dalam bahasa diagnostik.
- **Demo langsung** (section "DEMO LANGSUNG · UNIT HIDUP"): dalam **bingkai instrumen** (title-bar 3 dot + address `fixmaster · /demo`), poster kini **berlatar screenshot dashboard produk asli** (theme-aware: `demo-dashboard-dark/light.png` di `public/screenshots/`, diberi **scrim radial** dari token agar judul + tombol play tetap terbaca). Tujuannya mengakhiri "kotak kosong" pasca-penghapusan iframe **dan** memamerkan produk nyata sebelum klik. Poster **meng-link ke rute `/demo` layar penuh** (navigasi browser penuh, **bukan iframe**). Lihat section **Demo Interaktif** di bawah.
- **Strip jaminan** (setelah hero, sebelum fault panel): 4 **fakta produk terverifikasi** — Data terisolasi (RLS per toko), Jalan tanpa internet (lokal-first), Cadangkan kapan saja (ekspor utuh), Tanpa kontrak (trial 14 hari tanpa kartu). **Bukan testimoni/jumlah pelanggan karangan** — menjaga kejujuran yang sama dengan idiom "?" di matriks. Ikon brand-soft, dipisah garis titik atas-bawah.
- **Module rack**: kini **14 modul** rack-unit ber-**slot vertikal** (`M01`…`M14`), termasuk **Jejak Audit** & **Backup**. Modul Pro-only (Supplier+PO, Tugas, Absensi) bertanda **badge LED brand + "PRO"** (idiom show-locked sefamili sidebar), sisanya stamp `OK` **teks mono polos tanpa LED** (LED dekoratif dikurangi agar sinyal status tetap bermakna — keputusan revisi 11 Jun).
- **Ritme section**: section demo, banding, & manual memakai `sectionAlt` (panel `bg-base` ber-border-radius) agar **berselang** dengan section `bg-app` — memecah monotoni pola pelat-sekrup yang seragam.
- **Spec plates** (pricing): label alat bersekrup, harga mono besar + **framing harga harian** ("± Rp x/hari · setara kopi"). Klaim **diperbaiki agar jujur**: Solo = 1 pengguna · 1 outlet · 2 dompet (bukan lagi "tugas/absensi" / "karyawan tak terbatas"); Pro = pengguna tak terbatas, **outlet tak terbatas** (+Rp50rb/outlet) — bukan lagi render rusak "s/d -1 cabang". Sumber `config/plans.ts` agar tak basi.
- **Matriks banding** (3-brand): **datasheet bench** bersekrup membandingkan FixMaster vs FixNova vs FixMate. Pagar: hanya baris **FixMaster unggul/imbang** (keunggulan kompetitor spt CRM tak ditampilkan); sel kompetitor belum pasti = **"?" amber** (bukan tebakan ya/tidak); 3 fitur khas (Supplier+PO, Tugas, Audit) ber-tag `KHAS`; kolom FixMaster ber-LED "UNIT INI" + brand-soft. Disclaimer bertanggal.
- **Manual plate** (FAQ): pertanyaan jadi `<details>` bergaya lembar manual (data aman? bisa offline? servis apa saja? dst) — bunuh keberatan umum.
- **Serial/compliance plate** (footer): pelat regulasi (SN, ©) menampung tautan legal.
- CTA → `onStart` → `AuthGate` buka `AuthPage`. **Label trial disatukan** jadi **"Mulai Gratis 14 Hari"** (hero + CTA akhir) untuk konsistensi; "MASUK" tetap untuk login, "Pasang Solo/Pro" kontekstual di pricing.

### SEO (revisi 11 Jun 2026)
Landing adalah CSR (dirender di `AuthGate`), jadi SEO bertumpu pada **`index.html` statis** + aset publik:
- `public/robots.txt` (allow publik, **disallow `/demo` & `/track`** karena sandbox/lookup) + tunjuk sitemap.
- `public/sitemap.xml` (`/`, `/privacy`, `/terms`).
- `index.html`: title/description **berbasis keyword + benefit** (servis HP/laptop/elektronik, kasir, trial), `<link rel=canonical>` + `og:url`, **JSON-LD** (`SoftwareApplication` + offers dari `plans.ts`, `Organization`, `WebSite`, `FAQPage`), dan **`<noscript>`** berisi H1 + value-prop + daftar fitur agar crawler non-JS tetap dapat konten nyata.
- Domain kanonikal: `https://getfixmaster.vercel.app` (ganti satu konstanta bila pakai domain kustom).

> [!important] Pagar strategi (lihat [[Decisions & Bug Fixes]])
> Landing FixMaster **memuat matriks banding bernama** (FixMaster vs FixNova vs FixMate) — ini **mekanisme inti decoy**: halo hanya bekerja bila pembeli melihat ketiganya berdampingan. Syarat: (1) tiap sel **faktual benar** (sel belum pasti = "?"); (2) **hanya** tampilkan baris di mana FixMaster unggul/imbang — keunggulan kompetitor disembunyikan; (3) nada **faktual, bukan menjatuhkan**. FixMaster & FixNova **tidak boleh mirror** (beda penekanan/kata) agar tak terbaca satu tim. Klaim fiktif (statistik/testimoni) tetap dilarang di semua brand.

![[landing-dark.png]]

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

![[pos-dark.png]]

## Inventori — Parts Bin

Tabel jadi **grid laci komponen**. Tiap sparepart = bin berlabel kategori, dengan **LED status** (cyan aman / amber menipis / merah habis), angka stok mono besar, dan **fuel-gauge** ber-tick relatif terhadap stok minimum.

![[inv-dark.png]]

## Dashboard — Diagnostic Panel

Panel diagnostik: metric tile mono + level-meter. Membaca KPI dari `computeKpis()` di [[Data Layer]].

![[dash2-dark.png]]

## Pelanggan — Contact Registry

**Grid kartu arsip**: plate inisial, **ID mono** (ID-XXXXXX), baris kontak HP/email/alamat mono, readout aktivitas (jumlah servis + total transaksi), penanda **Pelanggan Setia** (LED cyan).

![[cust-dark.png]]

## Supplier — Vendor Ledger

Tab PO jadi **baris docket** dengan spine status (biru dipesan / amber sebagian / hijau diterima / abu draft), chip PO mono, total tabular, **tombol Terima mekanis**. Tab Supplier jadi kartu vendor + readout pembelian.

![[sup-dark.png]]

## Keuangan — Cashbook Tape

Wallet jadi **meter readout**. Buku kas jadi **pita thermal monospace** dengan spine income/expense (hijau/merah), nominal +/- mono — senada struk POS.

![[fin-dark.png]]

## Laporan — Analyzer Printout

Metric tile mono (spine + LED), break-even jadi **tick gauge**, breakdown kategori + leaderboard jadi **channel analyzer** dengan bar proporsi relatif.

> [!warning] Akses Laporan kini **owner-only** (migration `0019`)
> Sebelumnya manager (owner+admin). Sekarang hanya **owner**: nav pakai flag `ownerOnly`, rute dibungkus `OwnerRoute`, dan `reports.view` dicabut dari admin. Lihat [[Decisions & Bug Fixes]].

![[rep-dark.png]]

## Log Aktivitas — Event Recorder · Diagnostic Trace (owner-only)

Halaman `/activity` ([`ActivityLogPage`](src/features/activity/ActivityLogPage.tsx)), **khusus owner** (dijaga `OwnerRoute` + RLS SELECT owner-only, migration `0019`). Menjawab kebutuhan owner mengawasi aktivitas tiap peran. Metafora: **perekam data multi-kanal (event recorder)** sebench dengan POS Register & Cashbook Tape:
- **Faceplate bersekrup** ber-wash grid blueprint: **LED REC merah berdenyut** (`recBlink`) + judul, dan **panel readout LCD** mono ber-glow amber (`TOTAL` / `TAMPIL` / `KANAL`, angka zero-pad tabular). `KANAL` = jumlah aktor unik pada hasil filter.
- **Control strip**: cari (nama aktor / label objek), dropdown peran, dropdown aksi, tombol reset (muncul bila ada filter).
- **Trace rail**: event dikelompokkan per hari (header tanggal sticky + hitung). Sebuah **spine vertikal putus-putus** (sinyal kanal) membentang di belakang **signal-node** — lingkaran ber-ring tone (success/warning/danger/info via `actionMeta`) berisi ikon aksi. Tiap baris: label aksi, label entitas (chip mono amber), aktor + badge peran, dan **timestamp `HH:MM`** tabular berpembatas kiri.
- **Append-only**: tak ada aksi edit/hapus — jejak audit kebal manipulasi. Aksi tercatat: login, POS jual/void, pemasukan/pengeluaran create/delete, inventori CRUD, pelanggan CRUD, absensi edit/hapus, servis create & ubah status. Logika presentasi murni di `lib/business/activity.ts`; penulisan via `logActivity()` fire-and-forget. State kosong & loading juga bertema (pulse / spinner mono). Lihat [[Data Layer]].

![[activity-dark.png]]

## Tugas — Job Board

Tiap tugas jadi **tiket kerja** dengan spine status (amber pending / merah berkedip telat / hijau selesai), **checkbox mekanis**, due-tag mono. Template jadi baris SOP dengan chip recurrence. Logika di `lib/business/tasks.ts` (`isOverdue`).

**Bulk pembuatan template** (`TaskTemplateModal`): saat **buat baru**, kolom Judul Tugas jadi **textarea multi-baris** — satu judul per baris. Semua judul dibuat sekaligus (`repository.putMany`) berbagi setelan pengulangan + penerima yang sama; ada penghitung live "N tugas akan dibuat" (mono, brand). Mode **edit** tetap satu judul (`Input` biasa). Parsing: split `\n` → trim → buang baris kosong.

![[tsk-dark.png]]

![[bulk-task-dark.png]]

## Absensi — Punch Clock

Kartu jam jadi **readout LCD waktu hidup** (berdetak per detik, scanline, LED status). Kehadiran jadi baris **punch-card**; riwayat jadi **timecard ledger** mono.

![[att-dark.png]]

## Daftar Servis — Repair Job Cards

Halaman `/services`: **tabel padat di desktop**, **kartu kompak di mobile** (responsif). Tiap baris/kartu = job card dengan badge status bertone, nomor servis mono, biaya tabular, dan kolom aksi.

## Detail Servis — Repair Ticket

Halaman `/services/:id`: traveler strip mengikuti status + timestamp asli, BOM sparepart dari data nyata, panel biaya (sisa tagihan & profit), action bar ke modal Edit/Status/WhatsApp.

Fitur tambahan (revisi Fase 4):
- **Toggle "Sudah Diambil"** — menandai barang sudah diambil pelanggan, terpisah dari status pembayaran; indikator status ambil tampil di header.
- **Garansi saat "selesai"** — saat status → `selesai`, StatusModal menampilkan input lama garansi **Jasa** & **Sparepart** (hari), wajib minimal salah satu, prefill default dari Pengaturan + chip preset durasi. Menghasilkan `warrantyServiceUntil` & `warrantyPartsUntil` terpisah (tampil dua baris di header detail).
- **Tombol "Klaim Garansi"** — muncul hanya pada tiket `lunas` yang masih dalam masa garansi → membuka [[Data Layer|tiket klaim tertaut]] gratis lewat `WarrantyClaimModal`, dengan opsi catat kerugian garansi manual.

![[detail-dark.png]]

![[warranty-detail-dark.png]]

![[warranty-modal-loss-dark.png]]

![[status-warranty-dark.png]]

---

## Pengaturan — Operasional

Halaman `/settings` punya enam tab. Tab **Operasional** (revisi lanjutan) mengelompokkan konfigurasi alur kerja:
- **Template Servis** — quick-pick keluhan & kelengkapan (dipindah dari tab Usaha).
- **Garansi** — default lama garansi Jasa & Sparepart (hari) + preset durasi quick-pick yang dipakai StatusModal.
- **Template WhatsApp** — editor per-kunci (Diterima/Selesai/Konfirmasi) dengan daftar variabel `{...}` & reset-ke-default. Override disimpan di `orgConfig`, kosong = fallback ke `DEFAULT_WA_TEMPLATES` via `resolveWaTemplates`.

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
- **Panel form (kanan)** — **faceplate bersekrup** di empat sudut, header "Terminal Akses" dengan **power LED** (accent, berkedip `fm-pulse`) + tag mode mono (login/signup/reset), lalu form (email/password/konfirmasi) + tautan.
- **Responsif** — di ≤720px panel brand disembunyikan, form jadi faceplate tunggal dengan wordmark ringkas di atas.

Logika auth tak berubah (Supabase Auth: signIn/signUp/resetPassword). Copy toast signup diperbaiki: tak lagi menyebut "cek email untuk verifikasi" karena email confirmation dimatikan — akun langsung aktif → arahkan ke login. Token `var(--...)` saja.

![[auth-dark.png]]

---

## Terkait
- [[Design System]] · [[Sidebar - Live Diagnostic Rail]] · [[Data Layer]] · [[Decisions & Bug Fixes]]

#signature-page #design-system
