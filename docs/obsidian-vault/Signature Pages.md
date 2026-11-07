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

- **WhatsApp tanpa tumpang tindih (7 Nov 2026).** Di ≤760px tombol WhatsApp masuk ke bar aksi
  bawah sebagai tombol persegi 44px di samping "Lihat paket & harga". Dasar layar yang tertutup
  turun dari 120px ke 61px. Di layar lebar chip melayang baru muncul setelah layar pertama digulir
  (scroll timeline 0–60vh), karena di 1440×900 dan tablet 820 ia menimpa pain rail saat halaman
  dibuka. Nomor langkah `flowNo` tak lagi memakai `opacity` (4,1:1 → kontras penuh).

![[minor-landing-bar-phone-light.png]]

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

- **Data sebulan (28 Sep 2026).** Seed (`src/dev/seed.ts`, juga dipakai `/demo`) menyebar tiket, penjualan, dan kas di hari-hari bulan berjalan (dijepit ke tanggal 1) — dulu semuanya "hari ini", sehingga sakelar Hari ini/Bulan ini tampak tak berfungsi. Total bulan tetap (Pemasukan 6,45 jt, Pengeluaran 1,35 jt); Hari ini: 1 unit masuk, 1 selesai (FM-0007), INV-0001.

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

Bar ini container `demobar`. Keterangan "data contoh · tidak tersimpan" hilang utuh bila isi bar di bawah 772px (terukur, semua label tampil), dan kata "MODE" mengalah di bawah 329px. Keduanya container query karena Pembesaran aplikasi mengubah lebar bar tanpa menggeser media query (7 Nov 2026).

**Aksi sensitif dijinakkan** (`demoGuard()` di [`stores/demo.ts`](src/stores/demo.ts)): Keluar/ganti akun (Sidebar), Reset & Hapus Akun + Backup/Restore (Settings), Kirim WhatsApp & Cetak Nota (NotifyModal) → semua menampilkan toast + ajakan daftar, **tanpa** menjalankan logika destruktif/keluar-app.

**Landing**: poster "Coba Langsung" + tombol "Buka Demo Layar Penuh" sama-sama **meng-link ke rute `/demo`** (navigasi penuh). Iframe embed sudah **dihapus** (gagal di produksi karena header `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'` — yang kini dikembalikan ke setelan paling ketat). Detail di [[Decisions & Bug Fixes]].

![[demo-dashboard-dark.png]]

## Legal — Dokumen Teknis Terkontrol (publik, wajib UU PDP)

Dua route publik standalone (`/privacy`, `/terms`, di luar `AuthGate`) agar bisa ditaut dari consent signup, gateway pembayaran, app store. Di-redesign dari prosa biasa jadi **dokumen teknis terkontrol**. Shell [`LegalLayout`](src/features/legal/LegalLayout.tsx) kini menerima prop `docId`:
- **Doc plate masthead** bersekrup: kode `DOK. PRIVASI-001` / `SK-001`, `REV 2026.06.07`, spec rows (STATUS ber-LED, DASAR UU PDP, BAHASA).
- **Section bernomor manual**: `h2` di-prefix counter `decimal-leading-zero` (01, 02…) lewat CSS counter + badge brand mono.
- Cross-link bergaya kode dokumen. Konten [`PrivacyPage`](src/features/legal/PrivacyPage.tsx) mengacu **UU PDP No. 27/2022**; [`TermsPage`](src/features/legal/TermsPage.tsx) mencakup langganan/trial, pembayaran, larangan, batasan tanggung jawab, penghentian. Keduanya **template itikad baik** — perlu review hukum sebelum launch (ada callout). Signup `AuthPage` menampilkan baris consent bertaut ke kedua halaman.

![[privacy-dark.png]]

- **Panjang baris (7 Nov 2026).** Paragraf, butir, dan intro dibatasi `65ch` (median 68 karakter di 1440px; dulu 90–104). Pelat dokumen dan judul bagian tetap selebar wadah 800px.
- **Revisi 27 Sep 2026 (`PRIVASI-001` §3–4).** Lokasi data mengikuti server sungguhan: VPS di Jakarta, lalu lintas lewat Cloudflare (HTTPS), cadangan 2×/hari terenkripsi AES-256 di penyimpanan cloud. Kalimat "gateway pembayaran" diganti — langganan dikonfirmasi manual sejak `0047`. Pihak pemroses: penyedia server, jaringan, dan pengiriman email. Ubah bagian ini setiap kali lokasi server berpindah ([[Self-Hosting]]).

## Fallback Error — Fault Panel

`ErrorBoundary` (root + route) juga di-redesign dari icon-card generik jadi **panel diagnostik fault** sefamili bench: pelat bersekrup, header **`FAULT` stamp** ber-LED danger berdenyut + **kode fault** (`FX-SYS-500` root / `FX-MOD-500` route), aksi pulih (Coba Lagi / Muat Ulang). Lihat [[Decisions & Bug Fixes]].

---

## Kasir POS — Register Readout

- **Bayar via & kembalian tunai (0095, 28 Sep 2026).** Pad tender berlabel **Bayar via** (bukan "wallet"/"baris") dan hanya menawarkan wallet bersama + wallet cabang aktif. Kembalian selalu dipotong dari pembayaran **tunai** (`changeRowIndex`), berapa pun urutan ketukannya — aturan tertulis "Kembalian selalu diambil dari Tunai (uang tunai)."; chip nominal cepat mengisi baris tunai. Tanpa wallet bertanda tunai: perilaku lama (baris terakhir). LCD menulis "{n} jenis barang".

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
  **Transaksi Baru**. Toast sukses dihapus. Sejak 28 Sep fokus pindah ke kolom cari (bukan
  ke tombol): Enter kosong di cari atau pindaian berikutnya memulai transaksi baru. Register
  desktop kini setinggi layar (lihat "Area bayar muat satu layar" di bawah).
- **Cepat.** Cari mencakup SKU; Enter menambah SKU persis atau satu-satunya hasil
  (`pickOnEnter`, pemindai barcode); "/" memfokuskan cari; fokus otomatis hanya untuk
  mouse. Barang habis tampil redup "Habis" saat dicari.
- **Riwayat (28 Sep):** dikelompokkan per hari (total tanpa yang batal), tiap baris jam ·
  wallet · kasir · pelanggan, tombol kirim ulang WA untuk penjualan berpelanggan; kepala
  menyebut cabang aktif. Keranjang: qty bisa diketik, Kosongkan bisa dikembalikan.
  Kolom pelanggan: saran selalu menjelaskan diri (kurang huruf / mencari / tidak ditemukan) dan
  menawarkan **Tambah pelanggan baru** (`CustomerModal`, terisi dari kueri).
- **Baris keranjang dua baris** (nama selebar struk; harga · qty · jumlah), input uang
  `inputMode="numeric"`, toggle Rp/% ber-`aria-pressed`.

**Area bayar muat satu layar (7 Nov 2026, critique layout).**
- **Desktop (≥1025px):** register setinggi layar dan sejajar tab, bukan di bawah kotak cari.
  `.pagePos` jadi grid dua kolom dan `.layout` memakai `display: contents`, sehingga panel
  bisa merentang dari baris tab. Yang menggulir hanya daftar barang (`.cartItems`, minimal
  104px). LCD tetap di atas dan bar **Proses** (`.payBar`) menempel di bawah. Di 1280×800 dan
  1366×768 tombol Proses terlihat tanpa menggulir.
- **Pelanggan & Diskon dilipat** jadi dua tuts bergaris putus (`.extraKey`, mono, 44px).
  Masing-masing terbuka sendiri bila sudah berisi. Ringkasan Subtotal/Diskon/Total hanya
  muncul bila ada diskon, karena total sudah tertulis di LCD dan di tombol "Proses · Rp …".
- **Status bayar** di desktop hanya tampil bila memberi info baru: lebih dari satu
  pembayaran, lebih bayar, atau belum ada uang masuk. Sisa/kembalian biasa sudah ada di baris
  kedua LCD.
- **Tanda masih ada isi:** daftar barang memudar di bawah selama masih bisa digulir, dan bar
  Proses mendapat bibir pudar bila seluruh panel menggulir (diskon + beberapa pembayaran).
  Keduanya scroll-driven animation; peramban tanpa dukungan tetap berfungsi tanpa pudar.
- **Ponsel & tablet (≤1024px):** bar Proses menempel di dasar layar, di atas menu bawah.
  Dock keranjang menyerahkan tempatnya ke bar itu tepat saat register masuk layar.
- Kartu pilih cabang diberi padding; "Kosongkan" setinggi 44px.

![[pos-dark.png]]

## Inventori — Parts Bin

Tabel jadi **grid laci komponen**. Tiap sparepart = bin berlabel kategori, dengan **LED status** (cyan aman / amber menipis / merah habis), angka stok mono besar, dan **fuel-gauge** ber-tick relatif terhadap stok minimum.

- **Ringkasan stok (7 Nov 2026).** Baris teks "5 item · 2 menipis · Rp …" diganti `PageSummary`: Item, Menipis (LED amber), Habis (LED merah), dan Nilai Stok untuk manajer. Nilai rupiahnya kini mono. Di ponsel tiga hitungan berbagi satu baris dan Nilai Stok turun ke baris sendiri. Sel ini tetap tampil di ponsel karena nilai stok hanya ada di Inventori.

- **Stok masuk: dari mana? (29 Sep 2026).** Menaikkan stok (edit) atau mengisi stok awal (barang baru) memunculkan panel ber-garis-titik yang WAJIB dijawab: **Dibeli sekarang** (harga beli/unit termasuk ongkir + Bayar dari wallet cabang, atau "Sudah dicatat di Keuangan") atau **Koreksi stok** / **Stok yang sudah ada** (tanpa uang keluar, alasan opsional). Pilihan = kartu radio dengan LED brand + spine. Readout: "Stok jadi N · modal rata-rata Rp X · kas −Rp Y". Harga modal dikunci & dihitung otomatis saat membeli. Satu langkah menggantikan dua (koreksi stok + catat Sparepart di Keuangan) — lihat 0096 di [[Data Layer]].

![[inv-dark.png]]

## Dashboard — Diagnostic Panel

- **Servis Baru di ponsel (7 Nov 2026, critique layout).** Aksi cepat konsol hanya tampil di desktop. Navigasi bawah menautkan ke daftar Servis, bukan ke tiket baru, jadi di ponsel Dashboard tidak punya jalan langsung ke Servis Baru. Kini ≤720px tombolnya ada di dok zona jempol `ThumbDock` (`/services?new=1`), dan tombol di konsol disembunyikan supaya tidak dobel. Di tablet sentuh, aksi cepat dan "Lihat semua" naik dari 36px ke 44px.

![[dashboard-dock-390-light.png]]

- **Peran & target (28 Sep 2026).** Sel hero **Laba servis** hanya untuk **owner** (Laporan, sumber angkanya, owner-only); admin tetap melihat arus kas, Pemasukan, Pengeluaran. **Target Servis** kini menghitung unit **selesai** bulan ini (`serviceMargin(profitMonth).units`, sumber yang sama dengan Laba servis), label "N / target unit selesai" — dulu unit masuk. Label target di Pengaturan & wizard ikut. Karyawan tetap mendarat di Dashboard "Meja saya" (keputusan pemilik, 13a).

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
- **Critique tahap 3 (27 Sep 2026) — "hari ini & yang perlu saya".** Urutan kini:
  1. **Konsol** = cabang yang dilihat + denyut **HARI INI** (Masuk dari `useServiceSummary(today)`,
     Selesai dari `useCategoryProfit(today)`, Hadir) + data; aksi cepat **Servis Baru**
     (`/services?new=1`) & **Kasir** di desktop (ponsel: sudah di navigasi bawah). Tanggal & jam dibuang.
  2. **Karyawan: Meja saya** — strip Tiket saya (`/services?tech=me`), Tugas (sinyal rel), Absensi.
  3. **Perlu Tindakan** — LED + angka mono + **umur** tertua (`alertAges` dari tiket terbuka,
     `openOnly`, maks 60 baris kolom daftar).
  4. **Hero (owner/admin)** — sakelar **Hari ini | Bulan ini**; Pemasukan/Pengeluaran menaut ke
     Keuangan; **Laba servis** = `serviceMargin(category_profit)` (biaya final − harga part tiket
     yang SELESAI) menggantikan "Margin 79%" (arus kas ÷ pemasukan) dan "Rasio biaya" (100 − itu);
     catatan "arus kas, bukan laba".
  5. **Strip readout** (bukan tile ikon, bukan carousel): Unit masuk, **Dalam proses** (definisi
     sama dengan readout Servis), Saldo ("semua cabang" saat satu cabang dipilih). Tiap sel = tautan.
  6. **Target** dengan **penanda laju** (`monthPace`) dan warna menurut jarak ke laju
     (`targetState`); disembunyikan saat satu cabang dipilih (targetnya milik seluruh usaha).
     Sejak 29 Sep 2026 ada baris **Perlu hari ini** (owner/admin, target pendapatan > 0):
     `dailyRevenueTarget` = (target − omzet s/d kemarin) ÷ sisa hari termasuk hari ini — angka
     tetap sepanjang hari, progres hari ini yang bergerak; hilang begitu target bulan tercapai.
     Target Pendapatan = **omzet** operasional (tanpa modal/prive), bukan laba.
  7. **Break-even bulan ini** (owner saja, 29 Sep 2026): satu baris readout di layar hero —
     gauge + persen + LED nada + vonis singkat ("Kas naik, laba belum menutup biaya tetap ·
     kurang Rp 115.000") → Laporan. Komponen `BreakEvenReadout` terpisah supaya tarikan
     pengeluaran 3 bulan & penjualan hanya jalan untuk owner. Belum ada overhead → petunjuk
     mencatat, menaut ke Keuangan.
  7. Papan teknisi: rupiah hanya untuk owner/admin; meter karyawan mengikuti unit selesai.

![[dash3-dark.png]]

## Pelanggan — Contact Registry

**Grid kartu arsip**: plate inisial, **ID mono** (ID-XXXXXX), baris kontak HP/email/alamat mono, readout aktivitas (jumlah servis + total transaksi), penanda **Pelanggan Setia** (LED cyan).

- **Ringkasan di kepala halaman (7 Nov 2026).** Baris teks di bawah chip kategori dipindah ke atas toolbar sebagai `PageSummary`: Pelanggan, Pelanggan Berulang, dan Ditampilkan. Label pendek di ponsel adalah Total, Berulang, dan Tampil.

- **Drawer Riwayat Servis (19 Jun 2026).** Klik kartu pelanggan → **panel geser kanan** (`CustomerHistoryDrawer`) berisi daftar tiket pelanggan itu (newest-first): **LED status per tone** (pakai `STATUS_TONE`), no tiket mono, perangkat (`category · device`), tanggal, biaya, + link ke detail tiket. Data servis sudah di-load di halaman (untuk statistik) → tanpa fetch baru. Kartu kini `role=button` + keyboard (Enter/Space); tombol edit/hapus pakai `stopPropagation` agar tak ikut membuka drawer. Menjawab kebutuhan "lihat unit apa saja yang pernah masuk", bukan sekadar angka jumlah.

- **Filter kategori perangkat + Kirim WA (22 Jun 2026).** Toolbar dapat **dropdown "Semua Perangkat"** — daftar kategori diturunkan dari **riwayat servis** tiap pelanggan (`custCategories`: map customerId → set `service.category`), bukan field di Customer (Customer tak punya kategori sendiri). Filter hanya muncul bila ada ≥1 kategori. Tiap kartu pelanggan ber-nomor kini punya tombol **WhatsApp** (LED hijau hover `--success-soft`) di footer: buka `wa.me` (helper `waLink`/`toWaNumber` dari [[Data Layer]]) dengan sapaan ber-merek toko (`Halo {nama}, {toko} di sini.`) yang bisa diedit user sebelum kirim. **Demo-guarded** (`demoGuard`) seperti `NotifyModal`. Batasan jujur: `wa.me` hanya buka **satu chat per klik** — tak ada auto-blast massal (butuh WA Business API). Tombol hanya tampil bila pelanggan punya nomor.

![[cust-dark.png]]

## Supplier — Vendor Ledger

Tab berlabel **"PO" dan "Supplier"**, masing-masing dengan chip hitungan mono bergaris titik (`.tabCount`), dalam `role="group"` + `aria-pressed`. Dulu "Purchase Order (1)". Modal buat PO berjudul "PO Baru".

Tab PO jadi **baris docket** dengan spine status (biru dipesan / amber sebagian / hijau diterima / abu draft), chip PO mono, total tabular, **tombol Terima mekanis**. Tab Supplier jadi kartu vendor + readout pembelian.

- **Docket dua baris di daftar sempit (7 Nov 2026).** Satu baris docket butuh 685px tanpa nama (status terlebar "Sebagian Diterima" + Terima + ubah = 369px). Di bawah 845px isi (`@container polist (max-width: 52.99rem)`, mis. 1097px @100% atau laptop dengan Pembesaran), status dan tombol turun ke baris kedua: status di kiri, tombol mengumpul di kanan. Nama supplier membungkus maksimal dua baris, tidak lagi dipotong "PT Sumber Kom…".

Deret ringkasan menampilkan **total PO, PO aktif, dan jumlah supplier** sehingga halaman
tetap memberi orientasi saat data sedikit; tombol aksi memenuhi target sentuh mobile.
Sejak 7 Nov 2026 deret itu memakai `PageSummary` bersama. Dulu ada tiga kotak dengan angka
±330px dari labelnya. PO aktif kini membawa LED cyan bila ada.

- **Sinkron PO → Keuangan + void otomatis (19 Jun 2026).** ReceiveModal kini menampilkan **readout nilai diterima** (mono) + **checkbox "Potong dari wallet"** (default ON + wallet utama) dengan pemilih wallet. Terima barang → otomatis catat **Expense `'Pembelian stok PO <no>'`** (partial-aware: senilai yang masuk saat itu) & (bila tunai) potong saldo wallet — atomik via RPC `receive_goods_v2` di cloud, tulis berurutan di lokal. Tiap docket PO (non-draft/non-cancelled) punya **tombol batalkan** (ikon danger): **void otomatis** balikkan stok, refund wallet, hapus expense ter-link, set `cancelled`. Lihat [[Data Layer]] migrasi `0034`.

![[sup-dark.png]]

## Keuangan — Cashbook Tape

- **Per cabang & ponsel (0095, 28 Sep 2026).** Tampilan satu cabang hanya memuat wallet bersama + wallet cabang itu; wallet khusus cabang punya persamaan lengkap (awal + masuk − keluar ± transfer), wallet bersama tetap "gerak cabang ini"; Total berlabel "cabang ini + bersama". Catat Pemasukan/Pengeluaran menawarkan wallet yang sah untuk cabangnya (memilih wallet cabang di "Semua Outlet" mengisi cabangnya), Hitung saldo membuka Tunai cabang dan tak bertanya cabang untuk wallet khusus cabang. Ponsel (≤560px wadah): ringkasan satu baris tiga sel, gerak wallet tanpa "Rp", tombol **Hitung** menempel di sel Total — baris pertama buku kas naik dari y=735 (tertutup navigasi) ke y=709 di 375×812. Pengaturan › Wallet: wallet bisa diubah cabang & penanda **Uang tunai (laci)** kapan saja (dulu hanya ganti nama).

Wallet jadi **meter readout**. Buku kas jadi **pita thermal monospace** dengan spine income/expense (hijau/merah), nominal +/- mono — senada struk POS.

> [!note] Koreksi (27 Sep 2026)
> Paragraf lama ("horizontal rail, Buku Kas di viewport pertama") dan poin "income tidak bisa
> diedit" di bawah sudah usang: pemasukan manual bisa diedit, dan tata letak diganti critique tahap 4.

- **Critique tahap 4 (27 Sep 2026).** Urutan: **pemilih bulan** (‹ September 2026 ›, menggerakkan
  ringkasan DAN buku kas; menggantikan "Muat bulan sebelumnya") → **strip wallet** (sel Total +
  tiap wallet: saldo dan pergerakan bulan `walletMovement` +masuk −keluar ⇄transfer; sel = filter)
  → **strip ringkasan** yang ikut filter wallet → aksi (sebaris 3 di ponsel) → **buku kas per
  hari** (kepala hari = tanggal + arus bersih; baris tanpa kolom tanggal, di wadah sempit dua
  tingkat: keterangan selebar pita, lalu nominal + aksi). Alasan kunci ditulis sebagai tag
  ("terkunci · bulan lalu", "ubah dari tiket/Kasir"), bukan tooltip. Filter wallet di ponsel
  menggulir ke buku kas.
- **Kolom nominal seragam (7 Nov 2026).** Kolom aksi pita selebar dua tombol (`--tape-btns`,
  82px; `max(40px, --control-h)` × 2 pada sentuh) walau baris hanya punya satu tombol atau
  tidak ada. Dulu `auto`, sehingga tepi kanan nominal melompat 1293/1335/1387px dalam satu
  pita. Arus bersih di kepala hari diberi padding kanan yang sama, jadi sejajar dengan kolom
  nominal (1293px di 1440, 621px di 768). Di wadah ≤560px tata letak dua tingkat tetap.

![[finance-tape-columns-dark.png]]
- **EntryModal:** cabang di baris pertama bila `mustPickOutlet`; tanggal `min` awal bulan /
  `max` hari ini (`entryDateError`, cermin 0091); kategori pemasukan hanya Modal/Lainnya;
  saldo di pilihan wallet; `inputMode="numeric"`; `<form>` (Enter menyimpan); **Simpan & tambah
  lagi** (tanggal/kategori/wallet/cabang dipertahankan); peringatan catat ganda
  (`findRecentDuplicate`, 10 menit) — Simpan kedua melanjutkan.
- **Hitung saldo (28 Sep 2026)** — `CountModal`: pilih wallet (kanal ber-LED), ketik uang yang
  benar-benar ada (isi laci / saldo aplikasi bank), readout satu persamaan Aplikasi | Dihitung |
  Selisih (LED: cocok hijau, kurang merah, lebih amber). Selisih dicatat satu ketukan sebagai
  pengeluaran/pemasukan **Lainnya** hari ini (`reconcileWallet`), sehingga saldo = hitungan tanpa
  menimpa angka diam-diam. Baris "awal Rp X" per wallet (bulan ini, semua cabang) melengkapi
  persamaannya.
- **Hapus:** dialog menyebut barisnya (`−Rp 75.000 · Tunai · Beli lem`) dan akibatnya; tombol
  terkunci selama proses (klik ganda tak menghapus dua kali).

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

- **Filter kategori (29 Sep 2026).** Pita tab buku kas punya pilihan kategori (mono, garis titik;
  baris penuh di ponsel) yang bisa digabung dengan tab jenis dan filter wallet. Opsinya kategori
  yang ada di bulan itu. Ringkasan dan judul buku kas ikut ("Pengeluaran · Tunai · Gaji").
  Terbuka lewat `?cat=Gaji&month=2026-08` dari Laporan: nama kategori di kartu Pemasukan/
  Pengeluaran per Kategori dan di rincian break-even adalah tautan ke Keuangan tersaring — cara
  memeriksa isi "Lainnya" atau memastikan gaji sudah dicatat. Laporan multi-bulan membuka bulan
  terakhir periodenya. Opsinya dikelompokkan (`<optgroup>`) sama dengan form catat.
- **Kategori catat = dropdown berkelompok (29 Sep 2026)**, `Select` dengan `groups` (`<optgroup>`):
  Beban Operasional · overhead (Gaji, Sewa, Listrik & Air, Internet & Pulsa, Transportasi & Bensin,
  Perlengkapan & ATK, Perawatan & Perbaikan, Pemasaran & Iklan, Pajak, Retribusi & Iuran (sampah,
  karang taruna, keamanan), Biaya Admin Bank, Konsumsi, Selisih Kas Kurang, Operasional, Lainnya) / Beban Langsung (Garansi, Refund Penjualan, Ongkos Kirim) /
  Persediaan (Sparepart) / Aset Tetap (Peralatan & Inventaris) / Piutang (Kasbon Karyawan) / Prive.
  Pemasukan: Pendapatan (Lainnya) / Non-operasional (Modal, Pelunasan Kasbon, Selisih Kas Lebih). Keterangan di bawah
  mengikuti kategori/kelompok (kasbon dipotong gaji = Gaji penuh + Pelunasan Kasbon; ongkir stok →
  harga beli). Sempat berupa tombol "Uang ini untuk apa?" berbahasa awam — dikembalikan ke dropdown
  atas permintaan pemilik. Tombol **Kamus istilah** di bar bulan; "Arus Kas Bersih" = `Term`.
  Catatan arus non-operasional di bawah ringkasan kini merinci semua kategori non-operasional.

- **Bayar Gaji (29 Sep 2026).** Tombol di baris aksi Keuangan membuka `PayrollModal`: karyawan (label memuat sisa kasbon / "sudah dibayar"), gaji penuh (terisi gaji terakhir), potong kasbon (terisi sisa kasbon), dibayar dari, tanggal, keterangan; readout mono bergaris titik "Gaji (beban) · Potong kasbon · Ditransfer · Sisa kasbon setelah ini". Satu simpan = Gaji penuh + Pelunasan Kasbon (RPC `pay_salary`, 0098).
- **Chip karyawan di buku kas (6 Okt 2026).** Baris Gaji / Kasbon Karyawan / Pelunasan Kasbon memuat chip bergaris titik berisi nama karyawan atau "+ Karyawan"; klik membuka `LinkEmployeeModal` (readout catatan + pilihan karyawan, "Tanpa karyawan" untuk melepas). Tampil juga di bulan terkunci — hanya menautkan, uangnya tetap (0099). Form edit catatan bulan ini juga menampilkan pilihan karyawan.

![[fin-dark.png]]

## Kamus Istilah — Datasheet (29 Sep 2026)

Rute `/istilah` (semua peran, **tanpa item sidebar**): dibuka dari istilah bergaris titik (`Term`)
dan tombol "Kamus istilah" di Laporan & Keuangan. Tiap istilah = lembar data `TERM-nn` dengan LED,
definisi, readout rumus mono, contoh angka konter, dan "muncul di". Anchor yang dibuka menyalakan
spine + LED brand; `scroll-margin-top` 9rem supaya judul tak tertutup topbar menempel. Judul
topbar diambil di `AppLayout` (bukan NAV_ITEMS). Isi di `features/glossary/terms.ts`.

- **Indeks = daftar isi bernomor (7 Nov 2026).** Nomor indeks sama dengan kode TERM-nn. Di layar
  lebar indeks tersusun dalam kolom 17rem (tiga kolom, dibaca ke bawah, istilah terpanjang tetap
  satu baris). Di bawah tiga kolom (container `glossary` ≤53.99rem) ia jadi satu baris geser 44px
  dengan tepi pudar. Dulu awan chip: 8 baris (300px) di ponsel sebelum istilah pertama.

## Laporan — Analyzer Printout

Metric tile mono (spine + LED), break-even jadi **tick gauge**, breakdown kategori + leaderboard jadi **channel analyzer** dengan bar proporsi relatif. Sejak 19 Jun 2026 diperkaya **8 visual analitik** (logika agregasi murni di [`lib/business/reports.ts`](src/lib/business/reports.ts), teruji 19 unit test):

Deret empat metrik: empat kolom sebaris (ikon di kiri) bila wadah ≥1063px, empat kolom dengan
ikon di atas angka sampai 871px, lalu dua kolom (ikon sebaris lagi sampai 510px, di bawahnya
ditumpuk). Ambangnya `@container laporan`, diturunkan dari lebar terukur: 13 karakter mono
("Rp 99.999.999") selalu sebaris; angka yang lebih panjang membungkus setelah "Rp", tak pernah
terpotong. Di ponsel nilai menyusut `clamp(--text-sm, 6.4cqi - 4.2px, --text-xl)`. Kontrol
tanggal menumpuk tanpa overflow.

**Indeks "Isi laporan" (7 Nov 2026).** Halaman ±6 layar, jadi tepat di bawah metrik ada deret
kanal: Break-even · Kategori · Sparepart · Servis & teknisi · Piutang · Rincian transaksi. Tiap
kanal = label + readout mono (mis. "97% tertutup", "2 perlu restok", "Rp 350.000"); LED hanya
pada kanal yang punya status (break-even tertutup/tidak, restok, umur piutang 31+ = merah).
Klik menggulir halus (tanpa animasi bila `prefers-reduced-motion`) dan memindahkan fokus ke
bagian tujuan (`tabIndex=-1`, `scroll-margin-top` = topbar sticky + jarak). Kolom 6 → 3 → 2
pada wadah 922px / 457px (anggaran readout 15 karakter + LED). Readout menampilkan "…" saat
data servis masih dimuat.

Tanpa data periode lalu, kartu metrik **tidak** menampilkan baris delta sama sekali: vonis di
atas sudah menyebutnya sekali ("tidak ada data periode lalu untuk dibandingkan"), sebelumnya
kalimat yang sama diulang di tiga kartu.
1. **Tren Pemasukan vs Pengeluaran** — grafik garis **SVG murni** (komponen [`TrendChart`](src/features/reports/TrendChart.tsx), tanpa library; geometrinya dari `trendGeometry` di `lib/business/reports.ts`, dipakai bersama grafik di laporan PDF supaya keduanya tak bisa menggambar bentuk berbeda) dengan crosshair hover, area pemasukan, gridline + label mono. Bucket auto: harian (≤31 hr) / mingguan (≤184 hr) / bulanan (selebihnya).
2. **Rincian Transaksi** — tabel on-screen (versi layar dari CSV): tag jenis, kategori, keterangan, nominal bertanda; cap 100 baris (sisanya via ekspor).
3. **Laba per Kategori Perangkat** — omzet + laba kotor (finalCost − biaya part) per jenis perangkat (HP/laptop/dst), servis selesai/lunas.
4. **Sparepart Terlaris + Saran Restok** — part paling sering dipakai (qty+biaya) & item ≤ minStock (neediest first).
5. **Funnel Servis + Turnaround** — jumlah unit per status (urutan workflow) + rata-rata hari diterima→selesai (dari history).
6. **Delta vs Periode Lalu** — metric tile pemasukan/pengeluaran/laba menampilkan % perubahan vs jendela sebelumnya yang setara (pengeluaran: naik = merah).
7. **Perbandingan Antar-Outlet** — income/expense/net per cabang (hanya muncul bila >1 outlet; null = "Tanpa Cabang").
8. **Aging Piutang** — tabel servis selesai yang belum lunas (sisa = finalCost − DP), umur dari tanggal selesai dengan tag 0-7 / 8-30 / 31+.

- **Break-even (29 Sep 2026).** **Laba kotor** (laba servis per tanggal selesai + laba penjualan
  − Garansi − Refund Penjualan) dibanding **overhead dari catatan Keuangan** seporsi panjang
  periode (hari mendatang tak dihitung) — `lib/business/overhead.ts`, teruji. Overhead = Gaji,
  Sewa, Operasional, Lainnya; Sparepart (stok) dan Prive tidak. Bulan lewat = realisasi; bulan
  berjalan = per kategori `max(tercatat, rata-rata ≤3 bulan penuh sebelumnya)`; tanpa riwayat
  (bulan pertama) = yang sudah dicatat apa adanya, bertanda "mungkin belum lengkap". **Tidak ada
  isian perkiraan overhead** di wizard maupun Pengaturan — kartu selalu tampil dan, tanpa
  catatan, berisi petunjuk mencatat Gaji/Sewa/Operasional (itulah cara user baru menemukannya).
  Kartu menampilkan rincian per kategori, basis angka, surplus/kekurangan, dan peringatan bila
  bulan lalu tak ada catatan Gaji. Estimasi ditandai **est.**; periode bukan sebulan/sejak tgl 1 diberi catatan "diporsi"; kategori lama tampil "Operasional (lama)" (`categoryLabel`). Sewa cabang **tahunan** (wizard langkah Outlet, atau
  Pengaturan › Usaha › Sewa Tempat) = nominal ÷ 12, catatan Sewa cabang itu diabaikan agar tak
  dobel; form Keuangan memberi keterangan "dihitung sebagai overhead" dan, untuk Sewa, "bayar
  tahunan? atur di Pengaturan" (owner). PDF ikut. Di puncak kartu ada **vonis kas × break-even**
  (`breakEvenVerdict`: sehat / kas naik tapi belum menutup / untung tapi uang tertahan / rugi),
  kotak ber-spine & LED nada dengan baris "Arus kas ±X · Break-even ±Y".
- **Pengeluaran per Kategori dikelompokkan (29 Sep 2026)** menurut perlakuan di break-even
  (`EXPENSE_GROUPS`): Biaya tetap · overhead / Biaya langsung / Stok · jadi biaya saat dipakai /
  Pemilik · bukan biaya — subjudul mono + subtotal, kelompok kosong disembunyikan. Bila subtotal
  overhead (yang dibayar) ≠ overhead break-even (perkiraan/sewa tahunan), ada catatan kecil.
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
- **Trace rail**: event dikelompokkan per hari (header tanggal sticky + hitung). Sebuah **spine vertikal putus-putus** (sinyal kanal) membentang di belakang **signal-node** — lingkaran ber-ring tone (success/warning/danger/info via `actionMeta`) berisi ikon aksi. Tiap baris: label aksi, label entitas (tag mono netral bergaris titik, sejak 7 Nov 2026; dulu amber di tiap baris), aktor + badge peran, lalu **garis titik** yang menyambung ke **timestamp `HH:MM`** tabular di tepi kanan.
- **Filter aksi berkelompok (7 Nov 2026).** 36 aksi dikelompokkan per menu (Servis, Kasir, Pelanggan, Inventori, Supplier, Keuangan, Tugas, Absensi, Akun & sistem) lewat `groupedActionOptions()`; awalan baru jatuh ke "Lainnya", jadi tidak pernah hilang dari filter.
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
  browser berbahasa Inggris). `Absen Keluar` (dulu `Check Out`) memakai aksi secondary—bukan
  danger—karena menyelesaikan shift bukan tindakan destruktif.

- **Rekap per RENTANG, bukan per bulan (4 Sep 2026).** Periode gaji toko jarang jatuh persis
  tanggal 1 sampai akhir bulan; 26–25 dan per-dua-minggu sama umumnya. Selektor bulan diganti
  rentang bebas (`Dari`/`Sampai`) dengan pintasan Bulan ini / Bulan lalu / 7 hari. Rekap DAN riwayat
  mengikuti rentang yang sama.
- **Riwayat bisa difilter per karyawan (5 Sep 2026).**
- **Salinan & toolbar periode (7 Nov 2026).** Tombol, toast, galat, dan label log memakai "Absen
  Masuk/Keluar" (kode aksi `attendance.checkin/checkout` tetap). Kontrol periode keluar dari
  kartunya dan jadi toolbar polos (`.periodBar`, `role="group"`), sama dengan halaman lain.
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

**Ponsel: antrean di layar pertama (7 Nov 2026, critique layout P1).** Di 390×844 tiket pertama dulu mulai di y=651, hanya 117px terlihat di atas menu bawah. Kini y=373. Penyebabnya diselesaikan begini:
- **Strip readout** (sejak 7 Nov 2026 komponen bersama `PageSummary`, lihat [[Conventions]]): satu baris empat sel dengan label pendek: Total, Proses, Siap ambil, Selesai (`services.stat*Short`). Sel rupiah tidak tampil di ponsel, dan LED pindah ke depan angka.
- **Filter:** Teknisi, Urutan, Tertahan, dan Sembunyikan arsip dilipat ke satu tombol slider di samping kolom cari. Angka pada tombol itu = filter lanjutan aktif + filter terlipat yang menyala. Baris filter hilang bila kosong, dan tetap tampil bila ada tombol reset atau chip Siap ambil.
- **Servis Baru:** pindah ke dok zona jempol (`ThumbDock`), mengambang 8px di atas menu bawah.
- **Chip status:** memudar di tepi yang masih menyimpan chip, supaya terbaca bisa digeser. Pola ini dipakai bersama lewat `CategoryChips`.
- **Nomor tiket di kartu** setinggi tombol status di sebelahnya (`--control-h`, 44px). Dulu 59×22px, padahal itu satu-satunya jalan ke detail dari kartu.

Di desktop, nama perangkat boleh dua baris (dulu "MacBook Pro 13" 2019" terpotong di lajur 117px). Di tablet sentuh, ikon aksi 44px dan lajurnya 4 × `--control-h`. Detail: [[Decisions & Bug Fixes#Daftar Servis ponsel: antrean di layar pertama (7 Nov 2026)]].

![[services-phone-queue-390-dark.png]]
![[services-device-2line-1700-dark.png]]

**Aksi cepat Tambah sparepart (7 Nov 2026, permintaan pemilik).** Tiap baris dan kartu tiket yang masih dikerjakan (belum Lunas atau Batal) punya tombol ikon chip (`microchip`, ikon yang sama dengan baris sparepart di BOM detail). Tombol ini membuka `SparepartPickerModal` yang sama dengan detail tiket, tanpa pindah halaman. Di atas pencarian ada strip tiket tujuan: spine brand, nomor mono, perangkat, pelanggan. Simpannya lewat `addServicePart` (`src/data/serviceParts.ts`), jalur yang kini juga dipakai detail: tiket dibaca ulang, baris inventori `deducted: true`, stok dipotong di transaksi yang sama. Jendela tetap terbuka untuk part berikutnya, dan baris yang sudah masuk terbaca "Tambah lagi". Tiket Selesai yang biaya finalnya sudah ditetapkan mendapat toast peringatan: biaya final belum ikut naik, sesuaikan di detail. Tombol ditaruh paling kiri, sehingga tiga aksi lain tetap sejajar antarbaris. Lajur aksi di Daftar melebar dari 7.5rem ke 10rem. Detail: [[Decisions & Bug Fixes#Aksi cepat Tambah sparepart di Daftar Servis (7 Nov 2026)]].

![[services-quick-part-list-1440-dark.png]]
![[services-quick-part-390-dark.png]]

**Modal dadakan dari aksi cepat (7 Nov 2026, permintaan pemilik; label UI kini "Pembelian Luar", lihat [[Decisions & Bug Fixes#Audit kata UI: nada & panjang (7 Nov 2026)]]).** Untuk owner/admin, jendela yang sama punya dua tuts sumber di bawah strip tiket: **Inventori** (stok dipotong) dan **Modal Dadakan** (beli di luar, dibayar dari wallet). Tutsnya bergaya bench: LED menyala di sumber aktif, tepi bawah 3px, seperti tombol wallet di Hitung saldo. Tab Modal Dadakan memuat form yang sama dengan panel BOM detail: keterangan, nominal, wallet (default wallet terakhir), dan catatan bahwa saldo berkurang dan tercatat di Keuangan. Bila pencarian inventori kosong, ada pintasan "Catat "{nama}" sebagai modal dadakan" yang membawa teks pencarian ke keterangan. Setelah tersimpan, form dikosongkan untuk part berikutnya. Di tab ini Selesai menjadi tombol sekunder, sehingga Simpan Modal satu-satunya aksi utama. Karyawan tidak melihat tuts ini (pengeluaran kas, RLS 0087), dan pemilih di detail tiket tetap hanya inventori. Detail: [[Decisions & Bug Fixes#Modal dadakan dari aksi cepat sparepart (7 Nov 2026)]].

![[services-quick-modal-1440-dark.png]]
![[services-quick-modal-320-light.png]]

**Tampilan ditentukan perangkat (7 Nov 2026, permintaan pemilik).** Pemilih tampilan (Kartu · Daftar · Ringkas) dihapus dari bilah alat. Ponsel (viewport ≤720px) selalu menampilkan **Kartu**; layar yang lebih lebar selalu **Daftar**. Tampilan Ringkas dihapus seluruhnya (markup dan CSS `.tileGrid`/`.tile*`). Ambang 720px sama dengan tata letak ponsel halaman ini di CSS, dibaca lewat hook baru `useMediaQuery` (`src/hooks/useMediaQuery.ts`), dan berganti langsung saat jendela diubah ukurannya. Daftar di layar sempit (tablet 768px, atau laptop dengan Pembesaran 150%) tetap dijaga `@container svcRows`. Kasir, Inventori, dan Pelanggan tetap punya pemilih tampilan. Detail: [[Decisions & Bug Fixes#Tampilan Daftar Servis mengikuti perangkat (7 Nov 2026)]].

![[services-view-phone-390-dark.png]]
![[services-view-list-1440-light.png]]

**Keluhan & Penanganan satu kolom (7 Nov 2026, permintaan pemilik).** Di tampilan Daftar, kedua teks itu kini satu segmen `data-seg="notes"`: Keluhan di atas (jepit 2 baris), Penanganan di bawah (jepit 3 baris). Dulu keduanya segmen terpisah; saat segmen membungkus di layar laptop (kontainer ≤1180px, mis. viewport 1100–1440), Keluhan jatuh di bawah nomor tiket dan Penanganan di bawah pelanggan. Lajurnya 2,5fr bila keduanya aktif (jumlah dua lajur lama), judulnya "Keluhan & Penanganan". Dua sakelar kolom di Pengaturan tetap terpisah dan menentukan baris mana yang tampil. Label di dalam segmen hanya disembunyikan di tata letak berjudul bila ia satu-satunya baris (`.clamp:only-child b`); kalau keduanya tampil, label tetap ada supaya baris keluhan dan penanganan bisa dibedakan. Saat membungkus, segmen ini `flex: 2 1 14rem` agar tidak sesempit kolom teknisi. Tampilan Kartu dan Ringkas tidak berubah. Terukur di demo 1700px (tata letak berjudul): tinggi baris 56–78px, segmen 313px. Detail: [[Decisions & Bug Fixes#Keluhan & Penanganan satu kolom di Daftar Servis (7 Nov 2026)]].

![[services-notes-1700-dark.png]]
![[services-notes-1280-light.png]]

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

- **Batal + biaya pengecekan (29 Sep 2026).** Form Batal punya bagian "Biaya pengecekan dibayar sekarang" (nominal + wallet). Tombol berbunyi "Batalkan · terima Rp X", konfirmasi menyebut wallet-nya; hasilnya tampil sebagai "DP ditahan" + profit unit. Bila ada DP, keterangan mengarahkan: biaya cek yang dipotong dari DP = kurangi refund saja.

**Critique UX tahap 1 (27 Sep 2026).** Bilah aksi = satu daftar `TicketAction`; di ≤760px aksi sekunder masuk tombol **Lainnya** (panel bawah) — dulu Edit, Cetak Nota, Tandai Diambil, Klaim, dan Koreksi Biaya lenyap di ponsel. *Traveler* hanya mencentang tahap yang tercatat di riwayat; yang dilompati bersimpul putus-putus + "dilewati". BOM di bawah 470px (container `bom`) jadi dua baris. Jendela Update Status: kanal status ber-LED, chip "Pakai estimasi", Penanganan tepat di bawah biaya, garansi part & Riwayat dilipat, tombol utama menyebut konsekuensi ("Terima Rp X", "Batalkan · refund Rp X" merah + konfirmasi berisi ringkasan).

Halaman `/services/:id`: traveler strip mengikuti status + timestamp asli, BOM sparepart dari data nyata, panel biaya (sisa tagihan & profit), action bar ke modal Edit/Status/WhatsApp.

- **Servis ditunggu (0089, 25 Sep 2026).** Update Status: Selesai tersedia dari status kerja mana pun; bila target Selesai, owner/admin melihat baris ber-spine brand "Pelanggan menunggu?" dengan sakelar mono LED `TIDAK` / `LANGSUNG LUNAS`. Menyala → blok pembayaran muncul dan tombol jadi **Selesai & Lunas** (selesai + lunas + diambil sekali klik). Detail di [[Decisions & Bug Fixes#Servis ditunggu — paket C (0089, 25 Sep 2026)]].
- **Catatan kecil (28 Sep 2026).** QR di customer stub kini QR lacak **sungguhan** (`qrSvg`, gelap di atas `--paper` di kedua tema) — dulu ikon yang tampak bisa dipindai. Log Teknisi, riwayat Update Status, dan halaman lacak publik menulis **Diambil** / **Batal diambil** untuk tanda ambil (`historyKind` mengenali `PICKUP_NOTE`/`UNPICK_NOTE`; halaman lacak dulu menampilkan "edit" mentah ke pelanggan). Istilah diseragamkan jadi **Ubah Status** (tombol, judul jendela, tooltip). Pemilih sparepart tetap terbuka setelah Tambah (tombol Selesai menutup). Daftar Servis: tombol **N** membuka Servis Baru. Saran pelanggan Servis Baru & Kasir bisa dipilih dengan panah + Enter.
- **Penerimaan unit (0094, 28 Sep 2026).** Servis Baru menambah **IMEI / No. seri**, **Kondisi fisik** (chip cepat Normal · Lecet · Retak layar · Penyok · Bekas air, ditambahkan seperti chip keluhan), dan **Kunci layar** (Tidak dititipkan / PIN / Pola / Sandi + isian bebas autofill, dengan petunjuk "terhapus otomatis saat unit diambil"). Isi kunci layar tak ikut draf intake. Di detail, panel INTAKE menampilkan IMEI/SN mono, Kondisi, dan **Kunci layar** tersamar `PIN ••••` + tombol Tampilkan (menutup sendiri setelah 30 detik); karyawan yang bukan teknisinya melihat "hanya teknisi & owner/admin"; setelah diambil: "PIN · dihapus saat diambil". Nota mencetak IMEI/SN + Kondisi, tidak pernah kunci layar.
- **Serah unit & tiket baru (0093, 28 Sep 2026).** Tiket Selesai (owner/admin) punya aksi utama **Serahkan unit**: Update Status terbuka di Lunas dengan "tandai diambil" menyala, tombolnya "Lunas & serahkan · Rp X". Tiket Lunas yang belum diambil: aksi yang sama langsung menandai diambil. Keduanya berakhir di `TicketDoneModal` — stempel miring **DISERAHKAN**, readout unit/pelanggan/lunas/garansi, **Cetak nota** + **Kirim WA** (template baru `diambil`). Servis Baru yang tersimpan membuka panel yang sama dengan stempel **DITERIMA** (cetak tanda terima, WA `diterima`, Lihat tiket). Part/modal yang ditambah setelah biaya final ditetapkan memunculkan peringatan ber-LED amber di panel BIAYA (tombol Sesuaikan biaya / Koreksi Biaya). Tiket **batal**: baris **DP ditahan** + profit = DP ditahan − (part terpakai + modal dadakan); tiket batal lama tanpa catatan refund tetap "—". Tiket **Lunas**: tombol tambah sparepart hanya owner/admin.
- **Sparepart & Batal (0087/0088, 25 Sep 2026). Modal Dadakan tambah/edit/hapus lewat RPC atomik. Part terpasang di tiket **Lunas** tak punya tombol hapus (stoknya tak bisa kembali). Saat **Batal**, tiap part stok dipilih lewat toggle mono `KE STOK` / `TERPAKAI`; di tiket batal, label BOM jadi `TERPAKAI` / `KEMBALI KE STOK`. Detail di [[Decisions & Bug Fixes#Sparepart tiket servis — paket B (0088, 25 Sep 2026)]].

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
- **Panel SPAREPART** (dulu berlabel "SPAREPART · BILL OF MATERIALS"; label "+ Modal Dadakan" kini "+ Pembelian Luar", "Perbarui Modal" kini "Perbarui Pembelian") punya dua tombol: **"+ Sparepart"** (buka `SparepartPickerModal` — pilih item inventory + qty, idiom bench: LED stok, SKU mono) dan **"+ Modal Dadakan"** (form inline: keterangan + nominal + **dropdown wallet**). Tiap baris bisa dihapus (ikon trash); baris **modal dadakan** juga bisa **diedit** (ikon pensil, hover brand) — form yang sama terbuka pra-isi dengan label "Perbarui Modal".
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

- **Judul & aksi (7 Nov 2026).** Topbar berjudul "Detail Servis" (dulu "Servis", sama dengan
  daftarnya). Tombol WhatsApp jadi sekunder (transparan, ikon hijau, hover hijau lembut) agar tidak
  bersaing dengan Ubah Status. Tahap stepper tanpa `min-width: 92px`; di 1025px stepper tidak
  lagi menggulir.

## Pengaturan — Operasional

Halaman `/settings` punya delapan tab untuk owner cloud (tab yang tak relevan tetap
difilter menurut peran/mode). Tab **Operasional** mengelompokkan konfigurasi alur kerja:
- **Layout profil** — dua kolom sampai 960 px agar ruang desktop terpakai, lalu satu
  kolom di mobile. Tab mobile membungkus ke beberapa baris (strip geser lama menyembunyikan tab terakhir di 320px).
- **Kaki simpan (7 Nov 2026)** — tiap kartu (Profil, Target, Sewa, Garansi, Template
  WhatsApp, Catatan Toko, Navigasi Mobile) menyimpan lewat `.saveFoot`: kanan bawah di balik
  sambungan titik, dengan petunjuk atau sisa karakter di kiri. Dulu ada tiga posisi. Di ≤640px
  tombolnya selebar kartu, dua tombol masing-masing setengah.

![[settings-savefoot-dark.png]]
- **Template Servis** — quick-pick keluhan & kelengkapan (dipindah dari tab Usaha).
- **Garansi** — default lama garansi Jasa & Sparepart (hari) + preset durasi quick-pick yang dipakai StatusModal.
- **Template WhatsApp** — editor per-kunci (Diterima/Selesai/Konfirmasi) dengan daftar variabel `{...}` & reset-ke-default. Override disimpan di `orgConfig`, kosong = fallback ke `DEFAULT_WA_TEMPLATES` via `resolveWaTemplates`. **Sejak 31 Jul 2026** default-nya **multi-baris** (sapaan → blok data → satu ajakan aksi → penutup), `*bold*` WhatsApp untuk no servis/nominal/status; `konfirmasi` memakai `{estimasi}` (bukan `{biaya}` yang berisi `finalCost`). Textarea editor `rows=10` & preview NotifyModal `rows=12` agar tak terpotong. Unit test menjaga tiap placeholder ada di `WA_TEMPLATE_VARS` (typo = `{no_service}` mentah terkirim ke pelanggan).

> Kartu **Tampilan** (pemilih skala Kecil/Normal/Besar) **dihapus**. Ukuran UI kini satu baseline tetap (`html { font-size: 16px }`) yang konsisten di semua device; responsivitas ditangani lewat media query, bukan skala font global. Lihat [[Decisions & Bug Fixes]].

![[settings-operasional-dark.png]]

---

- **Tab bagian & Profil (7 Nov 2026).** Tujuh tombol bagian berada dalam `role="group"` dengan
  `aria-pressed`. Simpan Profil nonaktif sampai nama, alamat, atau telepon berubah, dan tombol
  utama nonaktif kini netral bergaris putus (lihat [[Conventions]]).

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
