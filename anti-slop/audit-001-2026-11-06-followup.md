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

## Lanjutan setelah Playwright dipasang (6 November 2026, sore)

Atas izin Anda, browser Chromium Playwright dipasang (`npx playwright install chromium`, 112 MB dari CDN resmi Playwright). Tiga hal yang tertunda kini sudah dijalankan.

**Probe tata letak**

- Ponsel (320 sampai 414px x 12 halaman) dan pita tablet (744 sampai 1152px): 0 luberan dokumen.
- Zoom aplikasi 100% dan 125% (11 lebar x 12 halaman): 0 luberan dokumen, 0 tumpang tindih kolom sticky. Satu-satunya wadah yang bisa digeser ke samping adalah rail chip `CatalogControls`, yang memang dirancang begitu sejak 14 September 2026.
- **`audit-zoom.mjs` ternyata rusak diam-diam.** Ia menulis zoom ke localStorage, tetapi demo publik menyematkan zoom sendiri (0.8 untuk mouse), jadi `ZOOM=1` dan `ZOOM=1.25` menghasilkan laporan yang identik. Skrip kini memasang zoom langsung ke halaman dan mencetak zoom yang benar-benar berlaku.

**Halaman publik** (wizard, privasi, syarat, reset sandi, lacak servis; 375 dan 1280px, dua tema)

| Temuan | Hasil |
|---|---|
| Tautan "Kebijakan Privasi" di halaman Syarat 2,8:1 dan tag "reset" di reset sandi 2,6:1 (tema terang) | **Diperbaiki.** Keduanya memakai `--brand` (warna isian) sebagai warna teks. Diganti `--brand-text`, 7,2:1. Dua tautan teks di halaman masuk dengan pola yang sama ikut diganti. |
| Wizard onboarding tanpa `h1` | **Diperbaiki.** Judul langkah jadi `h1`; ukuran visual tetap. |
| Tautan navigasi legal di bawah 44px ("Beranda" 22px, kode dokumen 37px) | **Diperbaiki.** Diikat ke 44px di layar sentuh. |
| Tautan di dalam kalimat ("Kebijakan Privasi", tinggi 19px) | Dibiarkan: target di dalam kalimat dikecualikan WCAG 2.5.8. |
| Tombol "Isi data demo & masuk" 3,1:1 di tema terang | Dibiarkan: hanya tampil di mode pengembangan. |
| Kode dokumen "DOK. SK-001" dan nomor bagian "01" di halaman legal (tema terang) | **Diperbaiki.** Ketahuan dari foto 375px, bukan dari pemindai: kode dokumen duduk di atas latar gradien (dilewati pemindai) dan nomor bagian adalah teks `::before` (tak terbaca pemindai). Keduanya jadi `--brand-text`. |
| Warna hover teks di Lacak servis (tombol cari, coba lagi, baris kontak) | **Diperbaiki.** Pola `--brand` sebagai teks yang sama; hover tidak terukur pemindai. Ikon langkah berikutnya tetap `--brand` (bukan teks, lolos 3:1). |

Setelah perbaikan: 0 kontras gagal di luar tombol dev, 0 em dash, 0 luberan, 0 lompatan heading, tepat satu `h1` di tiap halaman.

**Pelajaran:** pemindai kontras buta terhadap latar gradien, teks pseudo-element, dan keadaan hover. Foto tetap perlu dilihat.

**Screenshot vault**

33 dari 44 gambar di `docs/obsidian-vault/attachments/` dipotret ulang dan disinkron. Skrip yang menyalin ke `public/` (`shoot-demo`, `shoot-menus`) tidak dijalankan; dashboard demo dan halaman Pelanggan dipotret dengan skrip sementara yang hanya menulis ke `scripts/shots/`. Sebelas gambar tidak bisa dibuat ulang di mesin ini, dan tidak satu pun karena perbaikan audit:

| Gambar | Sebab |
|---|---|
| `auth-dark` | Mode lokal: `AuthPage` tidak bisa dirender. |
| `billing-dark`, `bulk-task-dark`, `error-dark` | Butuh berkas HTML harness dari variabel lingkungan yang tidak ada di repo. |
| `fix-mobile-open-dark` | `verify-sidebar.mjs` basi: mencari tombol Menu di 430px, padahal ponsel kini memakai bottom nav. |
| `modal-profit-detail-dark`, `modal-profit-table-dark` | `shoot-modal-profit.mjs` basi: pemilih sparepart tetap terbuka setelah "Tambah" (perilaku sekarang, dicek dengan probe). |
| `settings-operasional-dark`, `status-warranty-dark`, `warranty-detail-dark`, `warranty-modal-loss-dark` | `shoot-revisi-lanjutan.mjs` dan `shoot-warranty.mjs` membuka `/`, yang kini wizard onboarding. |

## Belum dikerjakan

- **Halaman masuk/daftar (`AuthPage`)** belum diukur DOM-nya. Dev server di mesin ini berjalan tanpa `.env` (mode lokal), sehingga `/?auth=1` menampilkan wizard. Perbaikan warnanya dikerjakan dari kode dan dihitung dari token.
- **Dua belas aturan `color: var(--brand)` lain di 11 berkas aplikasi** belum disapu (Operator, Pengaturan, Absensi, Log Aktivitas, riwayat pelanggan, template tugas, demo, serta `Input`, `EmptyState`, `Card`, `Topbar`). Sebagian mungkin ikon, yang cukup 3:1. 12 menu demo lolos ukur, tetapi pseudo-element dan hover tidak terukur di sana.
- **Lima skrip foto basi** (di tabel atas) belum diperbaiki, jadi sebelas gambar vault masih versi lama.
