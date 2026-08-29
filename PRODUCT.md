# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dua pengguna utama dengan **bobot setara**. Konflik antara keduanya diputuskan kasus per kasus, bukan dengan memenangkan salah satu secara default.

- **Pemilik konter (owner).** Ingin tahu kondisi usaha — margin per tiket, antrean, stok menipis, aktivitas tim — tanpa harus memegang semua pekerjaan sendiri. Sering memeriksa dari ponsel, di luar toko, di sela urusan lain. Akses penuh.
- **Teknisi / kasir di meja penerimaan.** Menerima unit, mencatat keluhan, memperbarui status, melayani penjualan sparepart. Bekerja sambil ada pelanggan menunggu, sering terinterupsi, sering satu tangan memegang perangkat.

Peran teknis di produk: `owner` (akses penuh), `admin` (operasional; tidak bisa lihat laporan), `karyawan` (terbatas). Helper: `roleAllows()`, `isManager()` di `src/config/plans.ts`.

## Product Purpose

Aplikasi web untuk mengelola **usaha reparasi gadget & elektronik** — konter HP, jasa servis laptop, toko reparasi elektronik konsumen.

Menyatukan satu unit yang masuk ke seluruh bagian usaha: tiket servis, kasir, stok sparepart, pelanggan, supplier, keuangan, tugas internal, dan absensi. Tujuannya menghapus penyalinan data manual dari buku → chat → Excel.

Berhasil kalau pemilik bisa menutup toko tanpa menghitung ulang apa pun, dan teknisi tidak pernah mencatat hal yang sama dua kali.

> **Pagar domain — jangan dilanggar.** "Servis" di seluruh produk = **perbaikan perangkat elektronik**. BUKAN bengkel kendaraan, bukan otomotif, bukan mesin industri. Kata "bengkel" pernah membuat sesi sebelumnya salah konteks. Detail: `docs/obsidian-vault/Domain & Scope.md`.

## Positioning

Satu unit masuk, semua bagian usaha ikut tercatat — tanpa entri ulang. Pemakaian sparepart pada satu tiket servis otomatis mengurangi stok dan masuk ke biaya serta margin tiket itu; tidak ada langkah rekonsiliasi terpisah.

Berjalan **lokal lebih dulu** (IndexedDB). Toko tetap bisa bekerja saat internet mati, dan datanya tidak wajib menumpang server orang lain. Mode cloud (Supabase) opsional, bukan syarat.

## Operating Context

- **Adegan pemakaian:** meja penerimaan konter, layar desktop; dan ponsel pemilik di luar toko. Keduanya jalur nyata, bukan salah satu.
- **Alur inti:** terima unit → kerjakan servis → pakai sparepart → catat uang.
- **Multi-outlet** untuk usaha yang sudah punya cabang (fitur Pro).
- **Absensi memakai geofence** — produk meminta izin `geolocation` (dibatasi `geolocation=(self)` di `vercel.json`). Kamera & mikrofon dimatikan.
- **WhatsApp** adalah kanal komunikasi ke pelanggan yang nyata dipakai (template WA fitur Pro; tombol WA di halaman publik).
- **Backup manual** — aplikasi web tidak bisa menjadwalkan pekerjaan saat tertutup, jadi pengingat backup muncul saat aplikasi dibuka (mode lokal). Pengguna cloud dapat backup Supabase.
- Halaman publik `/demo` menjalankan aplikasi asli di atas adapter RAM — pengunjung anonim memakai produk sungguhan tanpa menyentuh IndexedDB miliknya.

## Capabilities and Constraints

**Modul:** Dashboard, Servis, Kasir (POS), Pelanggan, Inventori, Supplier, Keuangan, Tugas Internal, Absensi, Laporan, Log Aktivitas, Pengaturan.

**Model langganan:** uji coba 14 hari → berbayar. Dua tingkat, dibedakan oleh **fitur + kuota**, bukan sekadar batas pemakaian.

| | Solo (`standard`) | Pro (`enterprise`) |
|---|---|---|
| Harga | Rp 99.000/bln | Rp 199.000/bln |
| Pengguna | 1 (pemicu upgrade terkuat: rekrutan kedua) | tak terbatas |
| Outlet | 1 | 2 termasuk, +Rp 50.000/outlet |
| Terkunci | supplier, absensi, tugas, multi-outlet, ekspor/impor, logo, template WA | — |

- Enum `plan_type` di Postgres terkunci (`free`,`standard`,`enterprise`,`trial`,`suspended`). `free` adalah nilai **legacy yang sengaja tidak ditawarkan** — jangan hidupkan tanpa migrasi.
- **Dua mode auth:** lokal (tanpa akun) dan cloud (Supabase Auth email+password). Keduanya harus tetap jalan.
- **Zoom aplikasi** 80%–125% adalah preferensi pengguna (`src/stores/zoom.ts`), memakai properti CSS `zoom` — bukan zoom browser. Konsekuensi terukur: `zoom` **tidak** menggeser media query, dan unit viewport ikut terskala. Breakpoint yang menentukan "muat / tidak muat" wajib `@container`; ukuran setinggi layar wajib lewat `--app-vh`.
- **Bahasa & pasar:** Indonesia adalah bahasa produk dan pasar yang dikejar sekarang. Inggris menyusul, jadi locale `en` harus **tetap dijaga hidup** supaya ekspansi tidak mahal — setiap copy baru wajib punya pasangan di `src/i18n/en.ts` dan `src/i18n/id.ts`. Semua teks UI lewat `useT()` + translation key, tidak pernah string literal.

**Belum diputuskan** (jangan dikarang): kanal pembayaran langganan, kebijakan retensi/penghapusan data, SLA dukungan, rencana aplikasi native.

## Brand Commitments

- **Nama:** FixMaster. Sub-nama sistem: "BENCH OS" / "Sistem Operasi Konter".
- **Maskot:** VOLT Probe — pendamping diagnostik berbentuk continuity tester, muncul secara statis di dashboard dan lebih ekspresif pada halaman publik (`src/components/ui/Mascot.tsx`). Siluet compact-nya juga menjadi logo FixMaster.
- **Identitas visual terikat:** "Precision Electronics Bench" — graphite steel + safety amber + diagnostic cyan. Ini komitmen, bukan preferensi: tiap elemen visual baru wajib memakai motif bench (LED status, readout mono, spine tepi kartu, tick-gauge, divider titik). **Dilarang** pola SaaS generik — contoh yang sudah diputuskan: fitur terkunci = baris redup + badge LED brand + "PRO" mono, **bukan** ikon gembok.
- **Warna selalu `var(--token)`** dari `src/styles/tokens.css`. Hardcode hex dilarang — token yang menjamin benar di dark & light.
- **Tema:** dark (default) + light. Keduanya kelas satu; tidak ada yang boleh diperlakukan sebagai turunan.
- **Ikon:** hanya lewat komponen `Icon` (Phosphor). Tidak ada emoji atau glyph sebagai pengganti ikon.
- **Tiap halaman punya metafora alatnya sendiri** dalam satu bahasa visual — Kasir = Register Readout, Inventori = Parts Bin, Dashboard = Diagnostic Panel, dst. Daftar lengkap: `docs/obsidian-vault/Signature Pages.md`.
- Kontak publik: `fixmaster.cs@gmail.com`, WhatsApp `628995318638`. Jejak lokasi di footer: CIMAHI.

## Evidence on Hand

**Status: pra-peluncuran. Belum ada pelanggan berbayar.**

Yang boleh dipakai:

- Demo interaktif di `/demo` — aplikasi asli, data contoh terkurasi, RAM-only.
- Screenshot produk di `public/screenshots/` (dashboard & mobile, dark + light).
- Workspace contoh "TechFix Service Center" dengan tiket, teknisi, dan angka contoh (`src/dev/seed.ts`).
- Halaman legal: `/privacy`, `/terms`.

**Yang TIDAK ada dan haram dikarang:** testimoni, nama/logo toko pelanggan, jumlah pengguna atau unduhan, studi kasus, liputan pers, angka pertumbuhan, rating toko aplikasi, klaim "dipercaya X konter".

> Catatan aset (28 Agu 2026): pasangan dashboard dan mobile di `public/screenshots/` sudah diregenerasi dari `/demo` setelah penghapusan global search dan revisi sidebar. `scripts/shoot-demo.mjs` kini menyalin kedua pasangan itu ke aset publik sebelum `scripts/shoot-landing.mjs` memotret landing.

## Product Principles

1. **Satu unit, satu pencatatan.** Data yang sudah masuk tidak pernah diminta ulang. Setiap fitur baru harus menjawab: apakah ini menambah entri manual? Kalau ya, cari jalan lain.
2. **Toko tetap jalan saat internet mati.** Lokal-dulu bukan mode darurat; itu jalur utama. Fitur yang hanya bisa hidup online harus tetap membiarkan alur inti bekerja tanpanya.
3. **Dua adegan, bobot setara.** Layar meja dan ponsel pemilik sama-sama jalur utama. Keputusan yang menguntungkan satu dengan mengorbankan yang lain harus disebut eksplisit, bukan diam-diam.
4. **Kejujuran angka di atas kesan cepat.** Margin, stok, dan kas ditampilkan apa adanya termasuk saat buruk. Tidak ada status yang menyesatkan demi terlihat rapi.
5. **Bench, bukan SaaS generik.** Kalau sebuah elemen bisa dipindah ke produk lain tanpa terasa aneh, ia belum selesai dirancang.

## Accessibility & Inclusion

- **Zoom aplikasi bawaan** 80%–125% — akomodasi keterbacaan yang tidak bergantung pada zoom browser, dan konsekuensi layoutnya wajib dihormati (lihat Capabilities and Constraints).
- Target sentuh minimum `--control-h` (44px) — layar dipakai sambil berdiri, sering satu tangan.
- Kontras teks wajib lulus di **kedua tema**; token warna adalah mekanisme yang menjaminnya.
- Halaman publik menyediakan skip link dan label ARIA pada landmark navigasi.
- Belum ada standar formal (mis. WCAG level tertentu) yang ditetapkan sebagai kewajiban kontraktual.
