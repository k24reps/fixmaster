# Laporan lanjutan audit antislop 001 · 6 November 2026

- **Audit asal:** `anti-slop/audit-001-2026-11-06.md`
- **Permintaan pemilik:** "perbaiki semuanya berdasarkan temuan antislop". Nomor 1 sampai 16 dan catatan A diperbaiki; nomor 17 sampai 21 diputuskan sesuai saran di audit.
- **Status:** semua nomor selesai. Ada lima penyimpangan dari usulan awal (di bawah) dan dua pekerjaan yang sengaja tidak diambil.

## Hasil per nomor

| No | Temuan | Hasil | Bukti |
|---|---|---|---|
| 1 | Lacak servis: gangguan jaringan tampil sebagai "tidak ditemukan" | **Selesai.** `isError` punya keadaan sendiri dengan tombol coba lagi; "tidak ditemukan" hanya bila kueri berhasil tanpa data. | `TrackingPage.tsx` |
| 2 | Detail servis: layar kosong saat memuat, error tampil 404 | **Selesai.** `LoadState` saat memuat, error dengan tombol ulang, 404 hanya bila tiket memang tidak ada. | `ServiceDetailPage.tsx` |
| 3 | Keuangan 375px: bar bulan meluber, tombol kamus terpotong | **Selesai.** Bar bulan membungkus (`flex-wrap`), tombol kamus 44px. | DOM 375px: luberan dokumen 0, bar 334px = wadah, tombol 143x44 |
| 4 | Target sentuh di bawah 44px | **Selesai.** Tombol kamus (Keuangan, Laporan) 44px; tautan `Term` diperluas `::after` 8px; tautan kategori Laporan diperluas ke seluruh baris (56px). | `elementFromPoint` di 375px |
| 5 | Indikator fokus lemah di 7 kontrol | **Selesai.** Ketujuhnya memakai `var(--ring)` di `:focus-visible`. Kotak cari Operator ternyata sudah memakai ring lewat `:focus-within`, tidak diubah. | CSS 7 berkas |
| 6 | Lompatan heading h1 ke h3 | **Selesai.** `CardHeader` bawaan `h2` (prop `as`). Kasir punya `<h3>` lepas sendiri, ikut dinaikkan ke `h2`. | 12 menu x 2 tema: 0 lompatan |
| 7 | Animasi berulang tanpa akhir | **Selesai, dengan penyimpangan.** Token `--pulse-cycles: 2`; maskot mulai saat terlihat lalu berhenti. | 12 menu: 0 animasi tanpa akhir di luar proses |
| 8 | Kursor tidak menandakan status | **Selesai.** Tombol nonaktif menampilkan `not-allowed`; `Term` memakai `pointer`; `label[for]` memakai `pointer`. | `Button.module.css`, `Term.module.css`, `global.css` |
| 9 | Em dash di teks UI | **Selesai, dengan penyimpangan.** 64 kunci i18n, 43 berkas sumber, `index.html`, berkas `public/`, data demo ("Pusat Bandung"). | Pemindai AST: hanya kembar server yang tersisa; DOM: 0 em dash di landing dan 12 menu |
| 10 | Em dash sebagai nilai kosong | **Selesai.** `EmptyValue` (tanda pisah pendek + "kosong" untuk pembaca layar) dan `EMPTY_VALUE` untuk string. | Servis dan Absensi: sel kosong terbaca "kosong" |
| 11 | Skrip penambal tertinggal | **Selesai.** `scripts/codemod-icons.mjs` dihapus. | git: D |
| 12 | Kaca di 67 kartu | **Selesai, dengan penyimpangan.** Prop `glass` dihapus dari `Card`. Kartu WhatsApp landing padat. | Landing: 1 elemen ber-blur (header); menu demo: 2 (chassis) |
| 13 | Panah tanpa alasan | **Selesai.** Aturan ditulis di `DESIGN.md`: panah berarti pindah tempat. Dibuang dari CTA hero dan CTA akhir landing serta "Transaksi baru" di Kasir. | Lihat "Panah yang tetap" |
| 14 | Logo melayang di layar memuat | **Selesai.** Animasi `fm-float` dibuang. | `AuthGate.module.css` |
| 15 | Ikon petir di tombol isi data demo | **Selesai.** Diganti `boxes-stacked`. | `Wizard.tsx` |
| 16 | Indikator konsol hero tanpa arti | **Selesai.** "Sinyal alur" dan LED "Online" dibuang beserta CSS dan 3 kunci i18n. | `LandingPageV2.tsx` |
| A | `/prototype/ticket` tayang di produksi | **Selesai.** Rute hanya didaftarkan di dev server (`devOnlyRoutes()`); rewrite `vercel.json` dibuang. | Build produksi tanpa chunk prototipe; dev masih merender halamannya |

## Keputusan pemilik (R-37)

- **17 Spine:** pertahankan. Membawa warna status servis.
- **18 Grid blueprint:** pertahankan. Satu-satunya kedalaman ambient.
- **19 Label mono huruf besar:** pertahankan, kurangi di landing. Label huruf besar bertracking di landing turun dari 33 ke 15 (aturan "Silkscreen-Is-Inside-The-Device" di `DESIGN.md`).
- **20 Badge kapsul:** pertahankan untuk status servis, tanpa glow. Terukur 0 badge bercahaya di 12 menu.
- **21 Glow:** hanya LED dan tombol utama. Glow sel ikon navigasi (sidebar) dan garis aktif bottom nav dibuang; terukur 0 di 12 menu.

## Penyimpangan dari usulan audit

1. **No 7:** usulan awal mengecualikan status kritis. Denyut LED kritis ikut dibatasi dua siklus, karena dua denyut sudah cukup menarik perhatian dan LED tetap menyala merah sesudahnya. Yang berulang hanya indikator proses (spinner, LED "menyambung"), yang berhenti sendiri.
2. **No 9:** usulan "pindahkan string tertanam ke `useT()`" tidak dikerjakan. Em dash-nya sudah dibuang, tetapi memindahkan string ke i18n adalah pekerjaan terpisah yang menyentuh banyak berkas.
3. **No 9 dan 10:** teks yang kembar dengan pesan server sengaja dibiarkan: pesan saldo kurang di `src/lib/business/finance.ts` (cermin migrasi 0086), keterangan "Modal servis {no} {nama}" di `ServiceDetailPage.tsx` (cermin 0087), dan pesan `raise exception` di migrasi SQL. Mengubahnya butuh migrasi baru dan pembaruan baris lama di database. Itu keputusan Anda.
4. **No 12:** prop `glass` dihapus seluruhnya, bukan dikosongkan, supaya tidak ada prop yang namanya menjanjikan efek yang tidak ada.
5. **No 15:** ikon diganti (`boxes-stacked`), bukan dibiarkan, walau tombolnya hanya tampil di mode pengembangan.

## Panah yang tetap, dengan alasannya

Sesuai aturan baru di `DESIGN.md` (panah berarti pindah tempat):

- Baris peringatan dan servis terbaru di Dashboard, tautan Break-Even ke Laporan, riwayat tiket pelanggan, daftar Kamus istilah: membuka halaman atau detail lain.
- "Buka demo" di landing: tautan ke `/demo`.
- **Lanjut** di wizard: maju satu langkah.
- Dok keranjang Kasir: pindah ke keranjang.
- **Perbarui status** di detail servis: memajukan tiket ke tahap berikutnya (ditambahkan ke aturan di `DESIGN.md`).

## Temuan baru saat verifikasi

- **Kasir masih melompat h1 ke h3** walau `CardHeader` sudah diperbaiki, karena tiga heading-nya `<h3>` lepas. Dinaikkan ke `h2`; ukuran visual tetap 14px.
- **Area sentuh tautan kategori Laporan tetap 16px** di daftar rincian, karena `::after`-nya terpotong `overflow: hidden` milik nama baris. Area sentuh dipindah ke seluruh baris (56px), di atas batang grafik.

## Verifikasi

- `npm run build`: lulus. `npm run test`: 692 test / 64 berkas lulus. `npm run lint`: bersih.
- DOM lewat panel browser aplikasi (`localhost:5174`):
  - Landing, tema gelap dan terang: 0 kontras gagal, 0 em dash, 0 luberan, 1 `h1`, 0 lompatan heading, 0 animasi tanpa akhir.
  - 12 menu demo x 2 tema: 0 kontras gagal, 0 em dash, 0 luberan, 0 lompatan heading, 0 sel navigasi bercahaya, 0 badge bercahaya.
  - 12 menu di 375px: 0 luberan dokumen. Target kecil yang tersisa: skip link (196x41, hanya tampil saat fokus), label kolom di Pengaturan (teks label; kontrol yang dilabelinya punya target sendiri), dan tautan `Term` yang area sentuhnya sudah diperluas `::after`.

## Belum dikerjakan

- **Screenshot vault** belum diregenerasi: browser Playwright belum terpasang, dan `npx playwright install` butuh unduhan yang perlu izin Anda.
- **Pita tablet dan zoom aplikasi** (`audit-mobile.mjs` dengan `MOBILE=0`, `audit-zoom.mjs`) belum dijalankan, dengan alasan yang sama.
- **Halaman auth, onboarding, legal, dan lacak servis** diperbaiki dari kode; DOM-nya belum diukur.
