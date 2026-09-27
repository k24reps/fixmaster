---
title: Signature Pages
aliases: [Signature Pages, Halaman Bertanda]
tags: [fixmaster, signature-page, design-system, frontend]
created: 2026-06-04
---

# 📄 Signature Pages

Bagian dari [[00 - FixMaster MOC]].

Sembilan halaman utama + halaman detail, masing-masing dengan metafora "alat" tapi berbagi bahasa visual dari [[Design System]]. Screenshot di bawah adalah **render kode asli** (data demo di-seed, difoto via Playwright) — bukan mockup.

> [!info] Fondasi bersama — 9 Agu 2026
> Landing baru menjadi acuan seluruh produk. `Card`, `StatCard`, form, tombol, badge,
> modal, toast, sidebar, dan topbar kini diselaraskan dari primitive bersama agar
> Dashboard sampai Pengaturan memiliki chassis yang sama di desktop dan mobile.
> Detail token dan breakpoint ada di [[Design System]].

---

## Landing V2 — Repair Flow Console (aktif)

Rombak total landing dibuat **terpisah** pada 9 Agu 2026, lalu disetujui menjadi
landing utama signed-out di **`/`** lewat
[`LandingPageV2`](src/features/landing/LandingPageV2.tsx). Route
**`/landing-preview`** dipertahankan sebagai alias review yang stabil. Implementasi
lama `LandingPage` tidak dihapus atau ditimpa sehingga masih bisa dirujuk/diaktifkan
kembali bila diperlukan.

![[landing-v2-dark.png]]

- **Arah narasi**: bukan lagi daftar fitur + komparasi panjang. Janji utama adalah
  **“catat servis sekali”**: satu tiket mengikuti unit dari penerimaan → pengerjaan →
  sparepart → uang dan margin tercatat, sehingga nilai produk terbaca sebagai hubungan
  operasional yang konkret—bukan sekadar “semua fitur di satu aplikasi”.
- **Hero**: headline menamai mekanisme khas FixMaster (stok dan margin ikut terhitung),
  lalu konsol pekerjaan aktif membuktikannya lewat tiket FM-0241, rail status, antrean,
  stok, kas, dan readout Volt. Semua angka bersifat data contoh, bukan klaim performa
  pelanggan. Demo aplikasi asli menjadi CTA utama; trial 14 hari tetap tersedia sebagai
  aksi kedua.
- **Ritme**: pain rail (empat gejala toko) → alur empat tahap → pandangan owner/tiket
  digital → screenshot produk asli → dua paket berbasis cara kerja → FAQ → CTA. Pain rail
  menggantikan trust rail generik agar calon klien mengenali masalahnya sebelum membaca
  solusi. Halaman tetap lebih pendek dan lebih visual dari V1.
- **Bukti margin owner (29 Agu 2026)**: empat kartu generik diganti diagnostic rail yang
  menghubungkan margin, waktu pengerjaan, sparepart, serta aktivitas tim. Tiket contoh
  menampilkan sumber angka secara eksplisit—**tagihan Rp1.250.000 − modal sparepart
  Rp830.000 = margin Rp420.000**—dan diberi label “Contoh data”. Klaim margin jadi dapat
  diperiksa calon klien, bukan angka hijau tanpa asal perhitungan.
- **Narasi lintas layar (11 Agu 2026)**: hero kini menyebut alur yang sama di meja dan
  ponsel, ukuran judul + jarak hero dipadatkan khusus layar kecil, dan section produk
  tidak lagi mengecilkan screenshot desktop menjadi bukti yang sulit dibaca. Desktop
  menampilkan dashboard besar dengan ponsel sebagai instrumen pendamping; mobile
  menampilkan screenshot ponsel lebih dahulu, kemudian konteks desktop. Pesan, CTA,
  dan urutan cerita tetap sama—hanya prioritas visualnya yang mengikuti perangkat.
- **Bukti produk desktop + mobile**: `demo-dashboard-{dark,light}.png` dan
  `demo-mobile-{dark,light}.png` di `public/screenshots/` berasal dari `/demo` asli;
  bukan mockup. `scripts/shoot-demo.mjs` meregenerasi keduanya ke `scripts/shots/` dan
  menyalin pasangan yang dipakai landing ke `public/screenshots/`, sehingga bukti produk
  tidak tertinggal dari UI hidup. Frame ponsel memakai bezel (speaker, kamera, tombol
  samping, home indicator) tanpa label yang menutup bottom navigation.
- **Identitas**: tetap memakai token dark/light, mono readout, LED cyan, spine tiket,
  divider titik, serta VOLT Probe sebagai pendamping diagnostik dan logo compact. Tidak
  memakai aset/komponen eksternal baru.
- **Polish VOLT (29 Agu 2026)**: readout hero kini menjadi diagnostic dock lengkap dengan
  indikator sinyal alur, bukan maskot kecil yang mengambang. CTA akhir menempatkan varian
  penuh dalam probe bay dengan trace, LED, dan status “bench siap” sehingga karakter,
  mekanisme produk, dan aksi trial membentuk satu komposisi. Motion hanya tinggal pada
  momen brand CTA dan otomatis berhenti saat reduced motion.
- **Teknis**: `AuthGate` hanya memulihkan sesi cloud dan memuat V2/Auth secara lazy;
  bootstrap repository, wizard, PIN, dan shell aplikasi pindah ke `WorkspaceGate` yang
  baru dimuat setelah sesi membutuhkan workspace. `app/router.tsx` juga memuat V2 dan
  `AppLayout` secara lazy. Copy memakai namespace i18n `landingV2.*`; CTA hero primer
  menuju `/demo`, sedangkan CTA trial membuka panel auth.
- **Hardening funnel + discovery (1 Sep 2026)**: setiap CTA kini membawa intent eksplisit
  (`login`/`signup`), sumber CTA, dan pilihan `standard`/`enterprise` dari pelat harga;
  demo juga keluar langsung ke signup. Vercel Web Analytics merekam tujuh event funnel
  tanpa PII dan menyensor URL sensitif. Rewrite Vercel berubah dari catch-all menjadi
  allowlist route aplikasi sehingga URL asing benar-benar 404. `robots.txt` menyatakan
  kebijakan crawler AI; `llms.txt`, `llms-full.txt`, `index.md`, dan `pricing.md`
  menyediakan versi agent-readable yang jujur dan dapat ditemukan dari sitemap/header.
- **Guardrail copy (28 Agu 2026)**: klaim offline dibedakan secara jujur antara mode
  lokal satu-perangkat dan mode cloud yang memerlukan koneksi; jargon “row-level” diganti
  bahasa akses toko; trial tidak lagi mengaku membuka “semua fitur” karena ekspor/impor
  memang dikecualikan. Tombol harga tidak lagi berpura-pura memilih Solo/Pro ketika alur
  auth belum membawa pilihan paket. Metadata, noscript, dan FAQ JSON-LD memakai janji
  “catat sekali” yang sama; klaim kanal pembayaran QRIS yang belum final dibuang.
- **Koreksi perpindahan data (1 Sep 2026)**: FAQ tidak lagi mengklaim impor Excel yang
  belum tersedia. Copy visible, noscript, JSON-LD, `pricing.md`, dan `llms-full.txt`
  menyatakan bahwa data inti masih perlu dimasukkan bertahap. Test menjaga semua FAQ
  schema dan harga Solo/Pro tetap sinkron dengan i18n + `config/plans.ts`.
- **Polish aksesibilitas (28 Agu 2026)**: light theme memakai token foreground dengan
  kontras minimum 4.5:1, focus ring solid, skip link, target sentuh 44 px, teks mobile
  minimum 14 px, serta maskot yang tunduk pada reduced motion. Scaffold nomor berulang
  dibuang; urutan angka tinggal pada alur reparasi yang memang bersekuens.
- **Aksesibilitas mobile (1 Sep 2026)**: skip link kini memindahkan fokus aktual ke
  `main#top`; status VOLT CTA berlantai 14 px; tombol WhatsApp fixed disembunyikan pada
  ≤520 px dan aksinya dipindahkan ke footer agar tidak menutup konsol hero.
- **Verifikasi**: render asli dark/light desktop 1440×960 dan mobile 390×844; sapuan
  320/360/375/390/414/744/834/980/981/1025/1440 px nol overflow dokumen, nol teks
  terpotong, dan nol target di bawah 44 px. Direct text-contrast audit sebelumnya tetap
  nol pelanggaran; build + lint bersih dan 470/470 test lulus.
  `scripts/audit-landing-owner.mjs` khusus menjaga section owner pada 320–1440 px,
  synthetic long copy, RTL, forced-colors, serta text scaling 200%.
  `scripts/audit-landing-priorities.mjs` menjaga intent auth/paket, fokus skip link,
  font VOLT, serta relokasi WhatsApp mobile.
  `scripts/shoot-landing.mjs` meregenerasi gambar di bawah dan
  `scripts/sync-vault-attachments.ps1` menyelaraskannya ke vault.

![[landing-owner-dark.png]]

![[landing-phone-frame-desktop.png]]

![[landing-phone-frame-mobile.png]]

## Landing V1 — Instrument Bench (legacy, dipertahankan)

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
- **Fidelity visual**: shell demo transparan sehingga memakai grid blueprint/PCB global yang
  sama dengan production, dengan intensitas 72% selama `body.fm-demo-active`. Demo selalu
  mulai pada zoom 100% melalui sesi zoom sementara; kontrol zoom tetap bekerja tetapi tidak
  mengubah preferensi tersimpan pengguna, lalu nilai sebelumnya pulih saat unmount.
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

- **Revisi 27 Sep 2026 (`PRIVASI-001` §3–4).** Lokasi data mengikuti server sungguhan: VPS di Jakarta, lalu lintas lewat Cloudflare (HTTPS), cadangan 2×/hari terenkripsi AES-256 di penyimpanan cloud. Kalimat "gateway pembayaran" diganti — langganan dikonfirmasi manual sejak `0047`. Pihak pemroses: penyedia server, jaringan, dan pengiriman email. Ubah bagian ini setiap kali lokasi server berpindah ([[Self-Hosting]]).

## Fallback Error — Fault Panel

`ErrorBoundary` (root + route) juga di-redesign dari icon-card generik jadi **panel diagnostik fault** sefamili bench: pelat bersekrup, header **`FAULT` stamp** ber-LED danger berdenyut + **kode fault** (`FX-SYS-500` root / `FX-MOD-500` route), aksi pulih (Coba Lagi / Muat Ulang). Lihat [[Decisions & Bug Fixes]].

---

## Kasir POS — Register Readout

Panel keranjang jadi **mesin kasir**: layar LCD total bergaya segment-display (digit mono, glow amber, ghost "88.888", scanline, indikator LIVE), badan **struk thermal monospace** dengan garis titik-titik, **perforasi sobek**, footer checkout. Tombol qty mekanis (turun saat ditekan).

**Tab bar (11 Jun 2026).** Halaman dipecah jadi dua tab bergaya bench (mono uppercase, underline brand saat aktif): **Kasir** (grid produk + register) dan **Transaksi Terakhir** (riwayat + void, manager-only, dengan badge jumlah). Sebelumnya panel riwayat menumpuk di bawah register dan mengganggu alur kasir; kini terpisah sehingga layar kasir bersih dan riwayat punya ruang sendiri. Modal void diangkat ke level halaman agar bisa dipanggil dari tab manapun.

**Mobile cart dock (9 Agu 2026).** Setelah produk ditambahkan, dock ringkas tetap
terlihat di dasar layar dengan jumlah item + total. Tap membawa pengguna langsung ke
register `#pos-cart`; grid produk tetap dua kolom. Sejak bottom navigation 11 Agu,
dock otomatis duduk di atas bar + safe-area sehingga kedua aksi tetap dapat disentuh.
Ini mencegah status keranjang dan aksi bayar hilang beberapa layar di bawah katalog.
Sejak 27 Sep dock **disembunyikan selama register terlihat** (IntersectionObserver),
dan `#pos-cart` punya `scroll-margin-top` agar LCD tak mendarat di bawah header.

**Critique tahap 2 (27 Sep 2026)** — alur uang dibentuk ulang seperti laci kasir:
- **Cabang dulu.** Di "Semua Outlet" dengan >1 cabang, kolom katalog diganti panel
  **Pilih cabang kasir** (kanal ber-LED) — memanggil `setActiveOutlet`, sama dengan
  selektor sidebar. Pita LCD memuat **chip cabang** (ketuk → jendela ganti cabang).
  Cabang berganti dari mana pun → keranjang dikosongkan dengan pemberitahuan (stoknya
  milik cabang lama).
- **Pad tender.** Satu tuts per wallet; tuts baru terisi **sisa tagihan** (pas = satu
  ketukan). Nominal = uang **diterima**; lebih bayar = **kembalian**, dipotong dari baris
  terakhir (`settleTender`). Chip uang lazim (`cashSuggestions`: pas, pembulatan
  10rb–1jt) untuk baris terakhir. Baris kedua LCD: SISA / KEMBALIAN / UANG PAS.
- **LUNAS.** Setelah simpan, register menahan total + kembalian; panel berisi Cetak
  Struk (struk memuat Dibayar/Kembalian), Kirim WA (bila pelanggan punya nomor), dan
  **Transaksi Baru** (fokus otomatis → Enter). Toast sukses dihapus.
- **Cepat.** Cari mencakup SKU; Enter menambah SKU persis atau satu-satunya hasil
  (`pickOnEnter`, pemindai barcode); "/" memfokuskan cari; fokus otomatis hanya untuk
  mouse. Barang habis tampil redup "Habis" saat dicari.
- **Baris keranjang dua baris** (nama selebar struk; harga · qty · jumlah), input uang
  `inputMode="numeric"`, toggle Rp/% ber-`aria-pressed`.

![[pos-dark.png]]

## Inventori — Parts Bin

Tabel jadi **grid laci komponen**. Tiap sparepart = bin berlabel kategori, dengan **LED status** (cyan aman / amber menipis / merah habis), angka stok mono besar, dan **fuel-gauge** ber-tick relatif terhadap stok minimum.

![[inv-dark.png]]

## Dashboard — Diagnostic Panel

Panel diagnostik: metric tile mono + level-meter. Membaca KPI dari `computeKpis()` di [[Data Layer]].

- **Action-first + state data jujur (28 Agu 2026).** Panel **Perlu Tindakan** kini tepat di bawah
  laba dan setiap baris membuka antrean terfilter (`status=konfirmasi`, `pickup=awaiting`, atau
  `stock=low/out`) — bukan notifikasi pasif yang harus diingat. Servis Terbaru memakai `<Link>`
  penuh ke tiket spesifik (keyboard-focusable), bukan `<li onClick>` ke daftar generik.
- Dashboard membedakan **loading / refresh / gagal / kosong**: skeleton saat fetch pertama,
  timestamp data terakhir saat refresh, fault plate + retry saat gagal, dan angka disembunyikan
  bila koleksi gagal sebelum pernah berhasil. Seluruh copy dashboard kini lewat i18n ID/EN.
- Mobile: BENCH CONSOLE dipadatkan 205→74 px, label KPI kembali ke batas 12 px, dan lima KPI
  menjadi rail satu baris; panel tindakan sudah terlihat di viewport pertama. Breakpoint yang
  bergantung ruang memakai `@container dashboard`, bukan viewport. Gauge memakai `scaleX()` dan
  collapse sidebar diskrit sehingga tak ada animasi properti layout.
- **Arah uang pada tile KPI (23 Sep 2026).** Dua dari lima tile — Pemasukan & Pengeluaran —
  membawa spine 3px + warna angka, menyalin pola kartu ringkasan Keuangan. Tiga sisanya tetap
  netral. Ini **bukan** pengembalian prop `tone` yang dilepas 13 Sep 2026: `flow` hanya punya
  dua nilai dan menyatakan satu hal terukur (arah uang), sedangkan `tone` membiarkan tiap tile
  memilih rona sendiri sehingga hijau berarti "Selesai" di satu kartu dan tak berarti apa-apa
  di kartu berikutnya. "Unit masuk", "Belum selesai", dan "Total saldo" tidak diberi warna
  karena tidak punya arah baik/buruk. Lihat [[Decisions & Bug Fixes]].

![[dash2-dark.png]]

## Pelanggan — Contact Registry

**Grid kartu arsip**: plate inisial, **ID mono** (ID-XXXXXX), baris kontak HP/email/alamat mono, readout aktivitas (jumlah servis + total transaksi), penanda **Pelanggan Setia** (LED cyan).

- **Drawer Riwayat Servis (19 Jun 2026).** Klik kartu pelanggan → **panel geser kanan** (`CustomerHistoryDrawer`) berisi daftar tiket pelanggan itu (newest-first): **LED status per tone** (pakai `STATUS_TONE`), no tiket mono, perangkat (`category · device`), tanggal, biaya, + link ke detail tiket. Data servis sudah di-load di halaman (untuk statistik) → tanpa fetch baru. Kartu kini `role=button` + keyboard (Enter/Space); tombol edit/hapus pakai `stopPropagation` agar tak ikut membuka drawer. Menjawab kebutuhan "lihat unit apa saja yang pernah masuk", bukan sekadar angka jumlah.

- **Filter kategori perangkat + Kirim WA (22 Jun 2026).** Toolbar dapat **dropdown "Semua Perangkat"** — daftar kategori diturunkan dari **riwayat servis** tiap pelanggan (`custCategories`: map customerId → set `service.category`), bukan field di Customer (Customer tak punya kategori sendiri). Filter hanya muncul bila ada ≥1 kategori. Tiap kartu pelanggan ber-nomor kini punya tombol **WhatsApp** (LED hijau hover `--success-soft`) di footer: buka `wa.me` (helper `waLink`/`toWaNumber` dari [[Data Layer]]) dengan sapaan ber-merek toko (`Halo {nama}, {toko} di sini.`) yang bisa diedit user sebelum kirim. **Demo-guarded** (`demoGuard`) seperti `NotifyModal`. Batasan jujur: `wa.me` hanya buka **satu chat per klik** — tak ada auto-blast massal (butuh WA Business API). Tombol hanya tampil bila pelanggan punya nomor.

![[cust-dark.png]]

## Supplier — Vendor Ledger

Tab PO jadi **baris docket** dengan spine status (biru dipesan / amber sebagian / hijau diterima / abu draft), chip PO mono, total tabular, **tombol Terima mekanis**. Tab Supplier jadi kartu vendor + readout pembelian.

Deret ringkasan menampilkan **total PO, PO aktif, dan jumlah supplier** sehingga halaman
tetap memberi orientasi saat data sedikit; tombol aksi memenuhi target sentuh mobile.

- **Sinkron PO → Keuangan + void otomatis (19 Jun 2026).** ReceiveModal kini menampilkan **readout nilai diterima** (mono) + **checkbox "Potong dari wallet"** (default ON + wallet utama) dengan pemilih wallet. Terima barang → otomatis catat **Expense `'Pembelian stok PO <no>'`** (partial-aware: senilai yang masuk saat itu) & (bila tunai) potong saldo wallet — atomik via RPC `receive_goods_v2` di cloud, tulis berurutan di lokal. Tiap docket PO (non-draft/non-cancelled) punya **tombol batalkan** (ikon danger): **void otomatis** balikkan stok, refund wallet, hapus expense ter-link, set `cancelled`. Lihat [[Data Layer]] migrasi `0034`.

![[sup-dark.png]]

## Keuangan — Cashbook Tape

Wallet jadi **meter readout**. Buku kas jadi **pita thermal monospace** dengan spine income/expense (hijau/merah), nominal +/- mono — senada struk POS.

Pada mobile, kartu wallet dan ringkasan menjadi horizontal rail supaya judul dan baris
**Buku Kas** muncul di viewport pertama. Nilai penuh tetap terbaca tanpa memperpanjang
halaman dengan tumpukan kartu sebelum transaksi.

- **Edit pengeluaran (19 Jun 2026).** Tiap baris **pengeluaran** punya tombol **Edit** (pensil); income tidak (income sistem dari servis/POS — hanya `expense.update` ada di `ActivityAction`, tak ada `income.update`). `EntryModal` kini punya **mode edit**: prefill record + **rekonsiliasi saldo wallet** (wallet sama → selisih `old−new`; wallet diganti → kembalikan lama, potong baru). Log `expense.update` dengan `meta.prevAmount`.
- **Transfer antar wallet (19 Jun 2026).** Dulu **hanya di Pengaturan**; kini tombol **Transfer** juga di menu Keuangan (muncul bila ≥2 wallet) → `TransferModal` memakai helper murni `transfer()` + RPC `transfer_wallet` (atomik, manager-only) yang sama. Transfer **tak membukukan income/expense** (bukan untung/rugi → laporan tak menggelembung), hanya pindah saldo + log `wallet.transfer`.
- **Riwayat transfer + filter per-wallet + paging baris (31 Jul 2026).** Tiga perbaikan yang saling terkait di Buku Kas:
  1. **Tab `TRANSFER`** — transfer antar wallet kini **ikut tampil** di Buku Kas (tab Semua & tab Transfer). Sumbernya **activity log** (`action = 'wallet.transfer'`) karena transfer memang tak punya tabel/ledger sendiri; dibaca lewat `useCollectionRange('activity','createdAt', …)` + `rangeForTimestamp` pada jendela bulan yang sama. Baris transfer bergaya **netral** (spine `--text-muted`, tanpa +/− hijau-merah) dan **tak bisa dihapus/diedit** — audit log immutable. **Batasan sadar:** RLS `activity_select` = **owner-only**, jadi admin melihat tab Transfer kosong (`ponytail:` di kode → bikin tabel `wallet_transfers` kalau admin perlu).
  2. **Klik kartu wallet → filter transaksi wallet itu.** Kartu wallet jadi `<button>` (aria-pressed, hint `LIHAT TRANSAKSI`); judul kartu berubah jadi `Buku Kas · <wallet>` + tombol **Semua wallet** untuk reset. Transfer cocok bila wallet asal **atau** tujuan = filter, dan tandanya jadi berarah (`+` masuk / `−` keluar).
  3. **Cap 100 baris → paging.** Dulu `slice(0,100)` keras: "muat bulan sebelumnya" tak berguna karena baris lama tak pernah kebagian slot. Kini `limit` state (`PAGE_SIZE = 100`) + tombol **Tampilkan lebih banyak**; hint footer jadi `X dari Y baris`. Footer (termasuk "muat bulan sebelumnya") kini **ikut dirender saat kosong** — dulu tersembunyi di cabang `EmptyState`, sehingga filter wallet tanpa hasil jadi jalan buntu.
  - Logika murni pemetaan log→baris ada di `transferEntries()` ([`lib/business/finance.ts`](src/lib/business/finance.ts), 4 unit test: pemetaan dua sisi, abaikan aksi lain, trim tepi ±1 hari dari `rangeForTimestamp`, log tanpa `meta`).
- **Transfer bisa diedit & dibatalkan (0086, 25 Sep 2026).** Sumber tab Transfer kini tabel `walletTransfers`, bukan activity log (poin 1 di atas usang: admin pun melihatnya, `transferEntries` dihapus). Tiap baris transfer punya **pensil** (edit; bulan lalu hanya keterangan) dan **batalkan** (bulan berjalan saja) → `ConfirmDialog` "Batalkan Transfer?". Yang dibatalkan tetap tampil: `.tapeRow.voided` = teks dicoret + redup, spine putus-putus, tag `DIBATALKAN` `--danger-text` + "oleh X", tanpa tanda arah. `TransferModal` dapat field **Keterangan** (jadi deskripsi baris; kosong → "Transfer antar wallet"). Tombol "Balikkan" dihapus.

- **Kategori `Modal` & `Prive` — arus kas pemilik (31 Jul 2026).** Bug lapangan dari toko pilot: pemilik menyuntik uang pribadi ke wallet untuk modal beli sparepart dan mencatatnya sebagai **Pemasukan** (satu-satunya cara menambah saldo). Akibatnya suntikan terhitung omzet — Rp 13,5 jt dalam sebulan menggelembungkan laba **43%** (Rp 31,6 jt dilaporkan vs Rp 18,1 jt sebenarnya; margin 66% vs 53%) **tanpa satu pun error**. Berulang tiap bulan karena siklusnya: awal bulan saldo ditarik habis (prive), tengah bulan disuntik lagi (modal).
  - Perbaikan: `IncomeCategory` += `'Modal'`, `ExpenseCategory` += `'Prive'`. Uangnya **tetap** menggerakkan saldo dan **tetap** tampil di Buku Kas (baris netral seperti Transfer — bukan hijau/merah, karena bukan untung/rugi), tapi **tak pernah** ikut agregasi omzet/laba.
  - **Sumber kebenaran tunggal**: `isCapitalFlow` / `operatingIncomes` / `operatingExpenses` di [`lib/business/finance.ts`](src/lib/business/finance.ts). Penyaringan dilakukan **di dalam** fungsi agregasi (`summarize`, `computeKpis`, `revenueSeries`, `trendSeries`, `outletComparison`, dan `periodComparison` lewat `summarize`), **bukan** di pemanggil — supaya halaman baru tak bisa lupa lalu diam-diam berbohong. `transactionRows` (Laporan) sengaja **tetap** menampilkannya: itu daftar transaksi mentah, bukan ringkasan laba.
  - Signature `trendSeries`/`outletComparison`/`periodComparison` dilebarkan agar membawa `category` — tsc langsung menandai dua pemanggil yang belum ikut saat perubahan dibuat.
  - **Nol migrasi**: kolom `category` bertipe `text` tanpa `CHECK` (0001). Data lama diperbaiki **sendiri oleh pemilik** — edit baris lama, ganti kategorinya; karena nominal & wallet tak berubah, rekonsiliasi menghitung delta **nol** sehingga **saldo tidak bergerak**. Semua bulan ikut terkoreksi otomatis karena pengecualian berbasis kategori, bukan tanggal.
  - Catatan `.capitalNote` di bawah panel ringkasan menampilkan total setoran modal & prive bulan berjalan — supaya turunnya Pemasukan setelah re-kategorisasi ada penjelasannya, bukan angka yang hilang diam-diam. Muncul hanya bila ada nilainya. `EntryModal` menampilkan hint penjelas saat kategori itu dipilih.

![[fin-dark.png]]

## Laporan — Analyzer Printout

Metric tile mono (spine + LED), break-even jadi **tick gauge**, breakdown kategori + leaderboard jadi **channel analyzer** dengan bar proporsi relatif. Sejak 19 Jun 2026 diperkaya **8 visual analitik** (logika agregasi murni di [`lib/business/reports.ts`](src/lib/business/reports.ts), teruji 19 unit test):

Deret empat metrik memakai satu baris seimbang di desktop dan horizontal rail di mobile;
kontrol tanggal menumpuk tanpa overflow, dan grafik tren sudah tampak di viewport mobile
pertama agar laporan tidak terasa seperti deretan kartu ringkasan saja.
1. **Tren Pemasukan vs Pengeluaran** — grafik garis **SVG murni** (komponen [`TrendChart`](src/features/reports/TrendChart.tsx), tanpa library; geometrinya dari `trendGeometry` di `lib/business/reports.ts`, dipakai bersama grafik di laporan PDF supaya keduanya tak bisa menggambar bentuk berbeda) dengan crosshair hover, area pemasukan, gridline + label mono. Bucket auto: harian (≤31 hr) / mingguan (≤184 hr) / bulanan (selebihnya).
2. **Rincian Transaksi** — tabel on-screen (versi layar dari CSV): tag jenis, kategori, keterangan, nominal bertanda; cap 100 baris (sisanya via ekspor).
3. **Laba per Kategori Perangkat** — omzet + laba kotor (finalCost − biaya part) per jenis perangkat (HP/laptop/dst), servis selesai/lunas.
4. **Sparepart Terlaris + Saran Restok** — part paling sering dipakai (qty+biaya) & item ≤ minStock (neediest first).
5. **Funnel Servis + Turnaround** — jumlah unit per status (urutan workflow) + rata-rata hari diterima→selesai (dari history).
6. **Delta vs Periode Lalu** — metric tile pemasukan/pengeluaran/laba menampilkan % perubahan vs jendela sebelumnya yang setara (pengeluaran: naik = merah).
7. **Perbandingan Antar-Outlet** — income/expense/net per cabang (hanya muncul bila >1 outlet; null = "Tanpa Cabang").
8. **Aging Piutang** — tabel servis selesai yang belum lunas (sisa = finalCost − DP), umur dari tanggal selesai dengan tag 0-7 / 8-30 / 31+.

- **Ekspor CSV (19 Jun 2026).** Tombol **Ekspor CSV** di date bar mengekspor rincian transaksi (pemasukan+pengeluaran) periode terpilih, ter-scope outlet aktif, terurut terbaru. Nama file memuat scope + rentang tanggal.
  > [!note] Koreksi (21 Sep 2026)
  > `lib/csv.ts` **tidak lagi** punya `toCsv()`/`downloadCsv()` sendiri. Itu dulu implementasi CSV KEDUA di repo — satu-satunya yang dipakai Laporan, dan satu-satunya yang **tanpa** guard formula-injection serta tanpa tes. Sekarang Laporan memakai `buildCsv`/`csvFilename` dari [`lib/business/export.ts`](src/lib/business/export.ts) yang sama dengan kartu Export Data di Pengaturan; `lib/csv.ts` hanya menyisakan `downloadCsvFile` (Blob + anchor).
- **Ekspor piutang terpisah (21 Sep 2026).** Kartu Piutang punya tombol **Ekspor** sendiri: daftar inilah yang dibawa saat menagih, dan ia **tidak** mengikuti rentang tanggal laporan — jadi tak bisa ikut di ekspor transaksi.
- **Ekspor PDF (22 Sep 2026).** Tombol **Ekspor PDF** bersebelahan dengan Ekspor CSV (keduanya dalam satu `.exportGroup` supaya membungkus bersama), gerbang `exportImport` yang sama. Dokumen **A4 potret berkop toko**: kop + jenis dokumen + periode + cakupan cabang, vonis, empat KPI dengan delta, grafik tren, break-even, kategori pemasukan/pengeluaran, laba per kategori perangkat, sparepart terlaris, funnel, performa teknisi, saran restok, perbandingan antar-outlet (lebar penuh — empat kolom uang tidak muat di setengah halaman), piutang + ringkasan umur, lalu **buku transaksi LENGKAP** (bukan cap 100 baris seperti di layar). Kaki berulang tiap halaman. Lewat dialog cetak browser → "Simpan sebagai PDF"; lihat [[Decisions & Bug Fixes]] dan [[Data Layer]].

> [!warning] Akses Laporan kini **owner-only** (migration `0019`)
> Sebelumnya manager (owner+admin). Sekarang hanya **owner**: nav pakai flag `ownerOnly`, rute dibungkus `OwnerRoute`, dan `reports.view` dicabut dari admin. Lihat [[Decisions & Bug Fixes]].

![[rep-dark.png]]

## Log Aktivitas — Event Recorder · Diagnostic Trace (owner-only)

Halaman `/activity` ([`ActivityLogPage`](src/features/activity/ActivityLogPage.tsx)), **khusus owner** (dijaga `OwnerRoute` + RLS SELECT owner-only, migration `0019`). Menjawab kebutuhan owner mengawasi aktivitas tiap peran. Metafora: **perekam data multi-kanal (event recorder)** sebench dengan POS Register & Cashbook Tape:
- **Faceplate bersekrup** ber-wash grid blueprint: **LED REC merah berdenyut** (`recBlink`) + judul, dan **panel readout LCD** mono ber-glow amber (`TERMUAT` / `TAMPIL` / `KANAL`, angka zero-pad tabular). `KANAL` = jumlah aktor unik pada hasil filter.
- **Jendela waktu di QUERY, bukan cuma di DOM (17 Agu 2026).** Dulu memakai `useCollection('activity')` = tarik seluruh tabel; karena `activity_logs` append-only dan tumbuh selamanya (tiap baris membawa `meta jsonb`), itu penyumbang egress besar — **dan** event lama tetap tak terjangkau karena diam-diam terpotong cap `max_rows` PostgREST (1000). Kini `useCollectionRange('activity', 'createdAt', …)` dengan jendela **bulan ini** + tombol **"Muat bulan sebelumnya"** (`monthsBack`), pola sama dengan Keuangan. Batas render `MAX_RENDERED = 300` tetap ada sebagai lapis kedua.
  - Readout dilabeli **`TERMUAT`**, bukan `TOTAL`: angkanya jumlah event dalam jendela yang dimuat. Melabelinya TOTAL menyesatkan — owner bisa menyimpulkan timnya lebih sepi dari kenyataan hanya karena jendelanya sempit.
  - Tombol muat-bulan-lama sengaja dirender **di luar** cabang loading/empty/isi. Kalau hanya muncul saat ada isi, bulan yang sepi jadi jalan buntu: owner melihat "Belum ada aktivitas" tanpa cara memuat bulan sebelumnya.
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
- **Kontrol owner + lokalisasi (9 Agu 2026).** Owner dapat memilih bulan (default bulan
  berjalan), melihat total jam per karyawan, mengabsenkan manual, serta mengoreksi baris.
  Readout bulan selalu memakai locale aplikasi (`Agustus 2026`, bukan label native
  browser berbahasa Inggris). `Check Out` memakai aksi secondary—bukan danger—karena
  menyelesaikan shift bukan tindakan destruktif.

- **Rekap per RENTANG, bukan per bulan (4 Sep 2026).** Periode gaji toko jarang jatuh persis
  tanggal 1 sampai akhir bulan; 26–25 dan per-dua-minggu sama umumnya. Selektor bulan diganti
  rentang bebas (`Dari`/`Sampai`) dengan pintasan Bulan ini / Bulan lalu / 7 hari. Rekap DAN riwayat
  mengikuti rentang yang sama.
- **Riwayat bisa difilter per karyawan (5 Sep 2026).**
- **Absensi jadi owner-only (`0056`, 5 Sep 2026).** Halaman ini sengaja TIDAK memakai `isManager()`.
  Rekap jam kerja seluruh tim adalah dasar perhitungan upah sekaligus potret siapa yang sering
  telat — itu milik **pemilik**, bukan siapa pun yang kebetulan berperan manager. Admin melihat
  barisnya sendiri. Sebelumnya batas ini hanya ada di layar; `0056` menjadikannya batas sungguhan
  di database. Lihat [[Decisions & Bug Fixes]].
- **Jam kerja tidak bisa dikarang (`0053`–`0054`, 3 Sep 2026).** Clock-in/out lewat RPC yang kini
  memakai jam server WIB (bukan `now()` polos yang UTC), penjagaan "hanya diri sendiri atau owner"
  ikut masuk ke dalam RPC, dan satu baris per karyawan per hari dijamin indeks unik — termasuk
  terhadap REST langsung dan balapan dua perangkat.

![[att-dark.png]]

## Daftar Servis — Repair Job Cards

**Critique UX tahap 1 (27 Sep 2026).** Lima StatCard diganti **strip readout** satu panel (3+2 di ponsel, sel rupiah dua jalur): tiket pertama kini terlihat di atas navigasi bawah (y 778 → 647 di 375px). Di ponsel pilihan Teknisi & Urutan dilipat ke "Filter lainnya" (hitungannya ikut); tautan nomor tiket berarea sentuh 45px. Detail: [[Decisions & Bug Fixes#UX Servis — critique tahap 1 (27 Sep 2026)]].

Halaman `/services`: **tabel padat di desktop**, **kartu kompak di mobile** (responsif). Tiap baris/kartu = job card dengan badge status bertone, nomor servis mono, biaya tabular, dan kolom aksi.

**Responsive task hierarchy (9 Agu 2026).** Lima KPI berada dalam satu baris desktop;
mobile memakai KPI rail. Pada lebar ≤1100 px tabel diganti dua kolom job card (≤720 px
menjadi satu kolom), sehingga profit, status, dan aksi tidak terpotong di tablet. Badge
status sendiri menjadi pemicu edit; tombol “Status” duplikat dihapus untuk mengurangi
kepadatan aksi.

**Paginasi 100 baris (17 Agu 2026).** Sebelumnya halaman ini menggambar **seluruh tiket sejak toko berdiri**, dua kali (tabel desktop + kartu mobile) — untuk bengkel lama itu ribuan baris dan browser tersendat. Kini `shownRows = rows.slice(0, limit)` dengan `PAGE_SIZE = 100` + footer **"Tampilkan lebih banyak"**, pola & class (`.loadMore`, `.loadMoreHint`) dipakai ulang dari Keuangan agar terasa satu produk. `limit` di-reset ke `PAGE_SIZE` saat salah satu dari empat filter berubah (query, status, perangkat, pengambilan).

> Yang **wajib dijaga**: lima KPI (`stats`) tetap dihitung dari `visible` — **seluruh** tiket — bukan dari `shownRows`. Kalau tidak, "Total Servis" dan "Pendapatan Aktual" berubah mengikuti seberapa banyak baris yang kebetulan sudah dimuat, dan itu laporan yang menyesatkan di halaman yang menampilkan uang. Terverifikasi di render asli: filter ke "Lunas" → 3 baris, footer `3 dari 3 tiket · 6 total`, sementara KPI tetap `6` dan `Rp 3.550.000`.

Catatan: ini paginasi **render**, bukan paginasi query — `useCollection` masih menarik koleksi penuh (dibatasi cap `max_rows` PostgREST). Untuk memangkas egress dibutuhkan limit sisi server + RPC agregat untuk KPI; lihat [[Decisions & Bug Fixes]].

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

- **Penanganan wajib, kolom yang bisa diatur, filter & tiga tampilan (6 Sep 2026).** Catatan
  penanganan wajib diisi saat status → Selesai, dan kini disimpan di kolomnya sendiri
  (`services.completion_note`, `0059`) supaya bisa tampil di tabel tanpa memuat ulang `history`
  tiap tiket. Kolom tabel bisa dipilih pemilik (tersinkron di baris organisasi); tiga mode tampilan.
- **Daftar servis tidak lagi memuat `history` (`0058`, 6 Sep 2026).** Kolom itu menyumbang **±78%
  ukuran tiap baris** — sumber egress terbesar di produk. Daftar memakai `SERVICE_LIST_COLUMNS`;
  **kolom baru WAJIB ikut ditambahkan ke sana**, dijaga tes integrasi tier3e.

## Detail Servis — Repair Ticket

**Critique UX tahap 1 (27 Sep 2026).** Bilah aksi = satu daftar `TicketAction`; di ≤760px aksi sekunder masuk tombol **Lainnya** (panel bawah) — dulu Edit, Cetak Nota, Tandai Diambil, Klaim, dan Koreksi Biaya lenyap di ponsel. *Traveler* hanya mencentang tahap yang tercatat di riwayat; yang dilompati bersimpul putus-putus + "dilewati". BOM di bawah 470px (container `bom`) jadi dua baris. Jendela Update Status: kanal status ber-LED, chip "Pakai estimasi", Penanganan tepat di bawah biaya, garansi part & Riwayat dilipat, tombol utama menyebut konsekuensi ("Terima Rp X", "Batalkan · refund Rp X" merah + konfirmasi berisi ringkasan).

Halaman `/services/:id`: traveler strip mengikuti status + timestamp asli, BOM sparepart dari data nyata, panel biaya (sisa tagihan & profit), action bar ke modal Edit/Status/WhatsApp.

- **Servis ditunggu (0089, 25 Sep 2026).** Update Status: Selesai tersedia dari status kerja mana pun; bila target Selesai, owner/admin melihat baris ber-spine brand "Pelanggan menunggu?" dengan sakelar mono LED `TIDAK` / `LANGSUNG LUNAS`. Menyala → blok pembayaran muncul dan tombol jadi **Selesai & Lunas** (selesai + lunas + diambil sekali klik). Detail di [[Decisions & Bug Fixes#Servis ditunggu — paket C (0089, 25 Sep 2026)]].
- **Sparepart & Batal (0087/0088, 25 Sep 2026).** Modal Dadakan tambah/edit/hapus lewat RPC atomik. Part terpasang di tiket **Lunas** tak punya tombol hapus (stoknya tak bisa kembali). Saat **Batal**, tiap part stok dipilih lewat toggle mono `KE STOK` / `TERPAKAI`; di tiket batal, label BOM jadi `TERPAKAI` / `KEMBALI KE STOK`. Detail di [[Decisions & Bug Fixes#Sparepart tiket servis — paket B (0088, 25 Sep 2026)]].

**Hierarki aksi + kejujuran billing (9 Agu 2026).** Tiket lunas menampilkan
`Pembayaran / Lunas`, bukan “sisa” senilai total biaya. Sebelum biaya final ditetapkan,
readout berkata `Belum ditetapkan`/`Menunggu biaya final`, bukan Rp0 yang tampak pasti.
`Tandai Diambil` hanya tersedia ketika status memang menunggu pengambilan; pada tiket
lunas-belum-diambil ia menjadi satu-satunya aksi primary. Klaim garansi baru primary
setelah unit diambil, sedangkan koreksi biaya tetap secondary.

Fitur tambahan (revisi Fase 4):
- **Toggle "Sudah Diambil"** — menandai barang sudah diambil pelanggan, terpisah dari status pembayaran; indikator status ambil tampil di header. **Tombol kini khusus owner/admin** (16 Jun 2026) — karyawan tetap melihat indikator, tapi tak bisa men-toggle. Aksi sama tersedia sebagai aksi cepat di Daftar Servis.
- **Garansi saat "selesai"** — saat status → `selesai`, StatusModal menampilkan input lama garansi **Jasa** & **Sparepart** (hari), wajib minimal salah satu, prefill default dari Pengaturan. **Chip template (revisi 22 Jun 2026)**: tiap field punya baris chip **angka hari** sendiri (`7 · 14 · 30`) yang mengisi field di atasnya — konteks Jasa/Sparepart dari label field, bukan teks chip (dulu 6 tombol "Jasa 7h / Part 14h" yang ramai). Menghasilkan `warrantyServiceUntil` & `warrantyPartsUntil` terpisah (tampil dua baris di header detail).
- **Tombol "Klaim Garansi"** — muncul hanya pada tiket `lunas` yang masih dalam masa garansi → membuka [[Data Layer|tiket klaim tertaut]] gratis lewat `WarrantyClaimModal`, dengan opsi catat kerugian garansi manual.
  - **Klaim per BAGIAN (`0064`–`0065`, 14–17 Sep 2026).** Modal memilih bagian yang diklaim (jasa
    dan/atau sparepart tertentu), dan hanya bagian yang garansinya masih berlaku. Server
    memvalidasi ulang pilihan itu; seluruh klaim ditulis dalam satu transaksi, bukan beberapa
    langkah klien. Klaim lama diisi mundur (`0068`).
  - **Garansi ditetapkan PER SPAREPART saat tiket Selesai** (`warrantyDays`/`warrantyUntil` di dalam
    JSONB `services.spareparts`, tanpa kolom baru), dengan isian awal dari garansi bawaan item
    inventori (`inventory_items.warranty_days`, `0067`). Halaman lacak publik menampilkan nama part
    + tanggal akhir garansinya saja — harga TIDAK pernah ikut (`0060`).

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

Halaman `/settings` punya delapan tab untuk owner cloud (tab yang tak relevan tetap
difilter menurut peran/mode). Tab **Operasional** mengelompokkan konfigurasi alur kerja:
- **Layout profil** — dua kolom sampai 960 px agar ruang desktop terpakai, lalu satu
  kolom di mobile. Tab mobile tetap satu baris dan dapat digeser horizontal.
- **Template Servis** — quick-pick keluhan & kelengkapan (dipindah dari tab Usaha).
- **Garansi** — default lama garansi Jasa & Sparepart (hari) + preset durasi quick-pick yang dipakai StatusModal.
- **Template WhatsApp** — editor per-kunci (Diterima/Selesai/Konfirmasi) dengan daftar variabel `{...}` & reset-ke-default. Override disimpan di `orgConfig`, kosong = fallback ke `DEFAULT_WA_TEMPLATES` via `resolveWaTemplates`. **Sejak 31 Jul 2026** default-nya **multi-baris** (sapaan → blok data → satu ajakan aksi → penutup), `*bold*` WhatsApp untuk no servis/nominal/status; `konfirmasi` memakai `{estimasi}` (bukan `{biaya}` yang berisi `finalCost`). Textarea editor `rows=10` & preview NotifyModal `rows=12` agar tak terpotong. Unit test menjaga tiap placeholder ada di `WA_TEMPLATE_VARS` (typo = `{no_service}` mentah terkirim ke pelanggan).

> Kartu **Tampilan** (pemilih skala Kecil/Normal/Besar) **dihapus**. Ukuran UI kini satu baseline tetap (`html { font-size: 16px }`) yang konsisten di semua device; responsivitas ditangani lewat media query, bukan skala font global. Lihat [[Decisions & Bug Fixes]].

![[settings-operasional-dark.png]]

---

## Pengaturan — Navigasi Mobile

Tab owner-only **Navigasi** mengatur empat slot utama bottom navigation ponsel.
Setiap posisi berupa selector eksplisit; memilih menu yang sudah dipakai menukar kedua
posisi agar tak menghasilkan duplikat. Preview lima slot selalu memperlihatkan
`Lainnya` sebagai jalur tetap ke menu sekunder, cabang, unit usaha, dan akun.

Konfigurasi disimpan di `Organization.settings.mobileNavigation` melalui `orgConfig`,
sehingga sinkron realtime ke seluruh perangkat. Saat konfigurasi owner memuat route
yang tidak boleh dibuka suatu peran, resolver membuangnya dan mengisi fallback aman.
Default: **Beranda · Servis · Kasir · Inventori · Lainnya**. Bottom bar hanya tampil
≤720 px; tablet memakai drawer dan desktop mempertahankan rail. Detail servis sengaja
menyembunyikan bottom bar karena memiliki action bar kritis sendiri.

Verifikasi render asli: 360/390/700 px tanpa overflow; pada 721 px berpindah tepat ke
hamburger/drawer; desktop 1440 px tidak berubah. Dock Kasir berada di atas bottom bar.

![[settings-navigation-dark.png]]

---

## Pengaturan — Langganan (Billing License Meter)

Tab **Langganan** (`/settings`, owner + cloud-only) memakai metafora **"daya/lisensi bench"** — langganan = daya untuk mengoperasikan workshop. Senada bahasa visual Signature Pages lain (POS Register Readout, Cashbook Tape):

- **License Meter** — kartu status: **LED** fase (ok hijau / warn amber / **crit merah berkedip** `fm-pulse`), nama plan font display, readout sisa hari mono besar, dan **charge-gauge** 24-tick (fill = sisa hari / ~30 hari, warna ikut fase) di atas wash grid blueprint.
- **Hand-off WhatsApp manual (`0047`)** — panel ber-spine hijau + LED menjelaskan tiga langkah: pilih paket, transfer/kirim bukti di WhatsApp, lalu tunggu verifikasi FixMaster. Tombol paket membuka chat dengan identitas organisasi dan nominal sudah terisi; klik ini **tidak** mengubah database.
- **Tier modules** — kartu paket ber-**spine** kiri; kartu rekomendasi diberi spine gradient brand + tag mono "DISARANKAN"; harga **mono** tebal.
- **Receipt tape** — riwayat pembayaran terverifikasi jadi **pita thermal mono** dengan divider titik-titik + spine status (paid hijau / legacy void abu) + chip status pill — senada struk POS & Cashbook Keuangan.

Realtime tetap menyegarkan invoice + organisasi setelah operator mengonfirmasi pembayaran. Jalur self-confirm/mock, QR, dan cancel invoice dari klien sudah dihapus.

![[billing-dark.png]]

---

## Sign Up / Login — Terminal Akses Bench

Halaman auth (`AuthPage`, cloud-only, sebelum workspace boot) — login / daftar / reset. Dulu kartu glass polos di tengah; kini **split-panel "terminal akses bench"** senada identitas produk:

- **Panel brand (kiri)** — logo + wordmark FixMaster, tagline domain
  (reparasi gadget/elektronik), VOLT Probe penuh yang statis, dan **diagnostic rail**
  ber-LED (SERVIS SIAP / STOK TERHUBUNG / MARGIN TERHITUNG) bergaya mono — gema dari
  [[Sidebar - Live Diagnostic Rail]]. QRIS yang belum menjadi janji produk tidak lagi
  ditampilkan. Wash grid blueprint + radial brand.
- **Panel form (kanan)** — **faceplate bersekrup** di empat sudut, header "Terminal
  Akses" dengan **power LED** (accent, berkedip `fm-pulse`) + tag mode terlokalisasi,
  lalu form (email/password/konfirmasi) + tautan. Header memuat tombol **"Beranda"**
  ber-ikon di kiri dan **toggle tema** sun/moon di kanan; seluruh kontrol minimal 44 px.
- **Responsif** — collapse memakai container query `auth` di ≤720px. Panel brand
  disembunyikan, form jadi faceplate tunggal dengan wordmark dan compact VOLT status
  module. Pada lebar sangat sempit label terminal dilepas agar kontrol tidak overflow.
- **Copy per mode + i18n (29 Agu 2026)** — login, daftar, dan reset memiliki heading,
  hint, CTA, pesan VOLT, validasi, toast, label tema, dan consent yang berbeda sesuai
  tugasnya melalui namespace `authPage.*` ID/EN. Pesan “Silakan masuk” tidak lagi bocor
  ke mode daftar/reset. `Input.revealLabels` membuat label aksesibilitas tombol mata ikut
  bahasa aktif.

Logika auth tak berubah (Supabase Auth: signIn/signUp/resetPassword). Copy toast signup diperbaiki: tak lagi menyebut "cek email untuk verifikasi" karena email confirmation dimatikan — akun langsung aktif → arahkan ke login. Token `var(--...)` saja.

**Show-password + indikator kekuatan (22 Jun 2026).** Field password (login, daftar, reset) kini punya **tombol mata** (`revealable` di `Input`, ikon `eye`/`eye-slash`) untuk toggle tampil/sembunyi. Saat **daftar** (dan di halaman reset), muncul **indikator kekuatan** `PasswordStrength` bergaya bench (BUKAN bar generik): **LED status + readout mono** LEMAH/SEDANG/KUAT, **tick-gauge 4 segmen**, dan chip per-kriteria (min. 8 karakter, huruf, angka, **simbol = bonus**). Warna level lewat token (`--danger`/`--warning`/`--success`). Syarat WAJIB tetap huruf+angka+≥8 (tak mengunci akun lama saat login); simbol hanya menambah skor. Skor dihitung helper murni `scorePassword` (`lib/business/password.ts`, teruji unit).

![[auth-dark.png]]

---

## Terkait
- [[Design System]] · [[Sidebar - Live Diagnostic Rail]] · [[Data Layer]] · [[Decisions & Bug Fixes]]

#signature-page #design-system

## Dashboard Operator — Bench Console (vendor-only, lintas-tenant)

Halaman `/operator` ([`OperatorPage`](src/features/operator/OperatorPage.tsx)), **di luar `AuthGate`** (lihat [[Decisions & Bug Fixes]]). Bukan halaman tenant — tidak memakai `AppLayout`, tidak ada sidebar, dan mengurus auth-nya sendiri.

- **Login operator = secure bench terminal.** VOLT Probe menjadi anchor identitas, ditemani status jalur terenkripsi, penanda area internal, toggle tema, kontrol tampil/sembunyikan password, error inline, dan tautan kembali ke beranda. Panel dua bagian runtuh menjadi satu kolom di container sempit; semua kontrol tetap 44 px dan tidak overflow pada 390 px.
- **Readout ringkasan = filter tindakan** (mono, tabular): `KLIEN` / `PERLU TINDAKAN` / `JATUH TEMPO ≤7H` / `KEDALUWARSA` / `DITANGGUHKAN`. Tiap readout adalah tombol filter, bukan angka dekoratif. Status `TAGIHAN · WA MANUAL` dipindahkan ke masthead; sinyal Dormant dihapus karena model dukungan saat ini inbound, bukan daftar follow-up proaktif.
- **Dua tab** dengan badge jumlah, memakai pola & class yang sama dengan `SettingsPage`: **Klien** dan **Jejak aksi**. Tab Rekonsiliasi GoPay dihapus karena tidak ada lagi invoice gateway yang perlu dicocokkan.
- **Desktop tabel, container sempit kartu.** Tabel memakai header sticky mono uppercase, angka rata kanan + `tabular-nums`; pada container ≤960 px, organisasi berubah menjadi kartu bench agar tidak bergantung pada scroll horizontal.
  - **Klien** — pencarian instan berdasarkan nama, nomor pendek `ORG-XXXXXXXX`, atau UUID penuh; LED status + nama + badge DEMO; tanggal pendaftaran; label paket Solo/Pro; status sisa yang tidak pernah memakai angka negatif; tanggal expiry eksplisit; jumlah outlet/user/tiket; aktivitas terakhir; dan catatan internal. Aksi primer adalah **Konfirmasi bayar**; suspend/catatan sekunder; hapus masuk menu `Lainnya` agar bahaya tidak setara visual dengan kerja rutin.
  - **Jejak aksi** — memuat 50 aktivitas terbaru, dapat dicari berdasarkan organisasi/aksi/alasan/operator, lalu ditambah bertahap sampai 200. `detail` jsonb diringkas jadi kalimat pembayaran yang memuat nominal, paket, dan bulan—bukan JSON mentah.
- **Satu modal untuk empat mode aksi** ([`OperatorActionModal`](src/features/operator/OperatorActionModal.tsx)): konfirmasi pembayaran, suspend, catatan, dan hapus organisasi. Aktivasi bebas/Trial/Free dihapus; organisasi suspended hanya pulih melalui pembayaran Solo/Pro. Modal bayar menampilkan nomor organisasi, kondisi paket/expiry sebelum tindakan, outlet, pembayaran/ref terakhir, biaya bulanan, total otomatis, dan expiry proyeksi. Server menghitung ulang nominal; refresh daftar yang gagal setelah commit tidak lagi menyamar sebagai kegagalan pembayaran.
- **Kegagalan data tetap terlihat.** Error pemuatan disimpan sebagai panel persisten dengan tombol retry; loading auth/admin memakai status aksesibel. Login menyebut “operator FixMaster”, bukan nama tabel internal database.
