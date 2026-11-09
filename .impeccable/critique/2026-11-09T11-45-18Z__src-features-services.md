---
target: tabel kolom menu servis di desktop
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\Lenovo\\Documents\\fixmaster\\.claude\\worktrees\\gracious-euclid-bddc05\\src\\features\\services"
timestamp: 2026-11-09T11-45-18Z
slug: src-features-services
---
Method: dual-agent (A: subagen penilaian desain · B: subagen detektor + overlay browser)

Target: tabel kolom Daftar Servis di desktop (`src/features/services/ServicesPage.tsx` + `ServicesPage.module.css`), diperiksa di demo pada 1112/1152/1280/1366/1440/1920 (gelap), 1366/1920 (terang), 1366 zoom 125%, 1366 Padat.

**Tabel Daftar Servis di desktop dapat skor 25/40 (Cukup).** Di monitor 1920px ia sudah jadi tabel antrean yang rapi dengan gaya bench. Di laptop meja penerimaan (1280–1440px) ia tidak lagi berbentuk tabel: judul kolom hilang dan hanya 2–4 tiket yang muat dalam satu layar. Itu masalah terbesarnya (P1). Detektor otomatis tidak menemukan apa pun di berkas halaman ini; semua masalah di bawah ditemukan lewat pengukuran.

## Skor kesehatan desain

| # | Heuristik | Skor | Masalah kunci |
|---|---|---|---|
| 1 | Status sistem terlihat | 3 | Ada indikator memuat, toast, hitungan di chip, dan "7 dari 7 tiket". Urutan yang sedang aktif tidak terlihat. |
| 2 | Cocok dengan dunia nyata | 3 | Istilahnya istilah konter (Keluhan, Penanganan, Tertahan). Sub-baris "-850.000 +650.000" tanpa label. Ikon microchip terbaca seperti roda gigi. |
| 3 | Kendali dan kebebasan | 3 | Ada Reset filter, Esc, dan status ambil bisa dibatalkan. Kata kunci cari dan filter hilang setelah membuka tiket lalu kembali. |
| 4 | Konsistensi dan standar | 2 | Kartu di ponsel punya spine, baris di desktop tidak. Nomor HP tidak mono. Halaman yang sama tampil sebagai tabel di satu monitor dan tumpukan di monitor lain. Baris menyala saat hover tapi tidak bisa diklik. |
| 5 | Pencegahan kesalahan | 3 | Ada konfirmasi sebelum tandai ambil bila masih ada tagihan, dan Tambah sparepart disembunyikan di tiket Lunas/Batal. Tapi satu klik di "Diambil" langsung membatalkan status ambil. |
| 6 | Mengenali, bukan mengingat | 2 | Aksi ikon hanya diberi label lewat `title`. Margin tanpa label. Teks yang terpotong hanya bisa dibaca dengan hover. |
| 7 | Fleksibilitas dan efisiensi | 2 | Ada pintasan N dan kolom yang bisa diatur. Tidak ada sortir per kolom, tombol "/", atau aksi massal. Kolom hanya bisa diatur di Pengaturan, dan berlaku untuk seluruh toko. |
| 8 | Estetika dan minimalis | 2 | Di laptop: baris "Penanganan –" kosong di 4 dari 7 tiket, lajur kanan selebar 480px kebanyakan kosong, dan nama teknisi turun ke baris ketiga. Di 1920 bersih. |
| 9 | Pemulihan dari kesalahan | 3 | Saat hasil kosong ada jalan keluar (Reset filter), tapi kata kunci yang dicari tidak disebut. |
| 10 | Bantuan dan dokumentasi | 2 | Petunjuk ada (ambang Tertahan, petunjuk kolom), tapi hanya di `title` saat hover. Pengguna keyboard dan layar sentuh tidak bisa membukanya. |
| **Total** | | **25/40** | **Cukup** |

Beban kognitif: 4 butir checklist gagal (chunking, grouping, minimal choices, working memory) = tinggi. Titik keputusan >4 opsi: tiap baris (hingga 7 target) dan area di atas daftar (13 kontrol, 482 dari 900px sebelum tiket pertama di 1366).

## Vonis kekhasan

**Penilaian desain: baru setengah khas.** Gaya bench sudah ada di detailnya:
- judul kolom mono huruf kapital;
- nomor tiket, tanggal, dan uang mono;
- pill status ber-LED dari satu peta `STATUS_TONE`;
- pemisah baris titik-titik;
- readout menyala "Belum diambil" dan "Tertahan N hari";
- margin pemilik di bawah harga.

Aksinya juga khas konter: tambah sparepart, kirim nota lewat WA, tandai ambil. Tapi strukturnya masih tabel admin biasa: baris judul, baris data, pill, angka rata kanan, empat tombol ikon polos. Ganti labelnya, dan ini bisa jadi tabel pesanan toko apa saja.

Peluang bench yang terlewat:
- **Baris tidak punya spine diagnostik.** Kartu ponsel punya (`ServicesPage.module.css:158-181`), dan DESIGN.md menyebut spine untuk kartu *dan baris*.
- **Umur tiket**, ukuran utama di usaha reparasi, baru muncul setelah tiket melewati ambang Tertahan.
- **Nomor tiket adalah teks terkecil di baris** (12px), padahal itu stiker di unit yang sedang dipegang teknisi. Nama pelanggan 14px, harga 16px.

**Pemindaian otomatis:**
- `ServicesPage.tsx` bersih (exit 0), CSS halamannya juga tanpa temuan.
- Pemindaian seluruh folder `src/features/services` menemukan 25 hal (exit 2), semuanya di berkas lain:
  - **21 temuan palsu di `printReceipt.ts`.** Warna dan ukuran literal itu milik stylesheet nota thermal 58mm. Memang disengaja, karena dokumen cetak tidak mewarisi token aplikasi.
  - **1 temuan palsu `side-tab` di `StatusModal.module.css:347`.** Itu spine resmi.
  - **3 temuan benar:**
    - `side-tab` di `ServiceDetailPage.module.css:182` (`.costNotice`);
    - `side-tab` di `SparepartPickerModal.module.css:96` (`.context`, terbuka dari aksi cepat di daftar);
    - `font-size: 3rem` di `ServiceDetailPage.module.css:866`, di atas tangga ukuran huruf.
- Detektor tidak menangkap satu pun masalah tabel di bawah ini. Semuanya soal tata letak dan isi, bukan pola CSS.

**Overlay visual:** overlay detektor terpasang di tab **[Human] Daftar Servis** di panel browser. Di tiga keadaan (bawaan, filter Lunas, panel Filter lainnya) ia melaporkan 2 temuan yang sama. Keduanya milik kerangka aplikasi dan sesuai DESIGN.md, jadi positif palsu: glow LED online di topbar (`dark-glow`, `Topbar.module.css:187`) dan grid latar bench (`codex-grid-background`, `global.css:98`).

## Kesan umum
Di 1920px ini antrean yang tertib. Di 1366px, lebar laptop meja penerimaan, tiap tiket jadi blok 3–5 baris tanpa judul kolom. Kolomnya tidak sejajar antarbaris, dan lajur kanan setengah kosong. Peluang terbesarnya: membuat tabel tetap berbentuk tabel di 1280–1440px.

## Yang sudah bekerja
1. **Sinyal tertib dan mudah dibaca.**
   - Semua pill memakai satu peta warna status.
   - Kontras lulus di dua tema: teks redup 5,76:1 (gelap) dan 6,07:1 (terang), judul kolom 5,14 dan 4,94.
   - Tidak ada teks di bawah 12px dan tidak ada yang meluber di 10 konfigurasi, termasuk zoom 125% dan kerapatan Padat.
2. **Aksi konter tersedia langsung di baris.** Tambah sparepart hanya muncul di tiket yang masih dikerjakan. Status ambil bisa diklik dan minta konfirmasi bila masih ada tagihan. LED Tertahan menyebut jumlah hari, dan petunjuknya menyebut ambangnya.
3. **Kolom uang dikerjakan teliti.** Angkanya mono dan rata kanan. Estimasi sengaja dibuat lebih lemah ("Est." 12px redup) dibanding biaya final 16px. Rugi di sub-baris margin memakai oranye peringatan, bukan merah.

## Masalah prioritas

### [P1] Di laptop 1280–1440px, tabel berubah jadi tumpukan
- **Apa:**
  - Judul kolom baru tampil saat wadah ≥1181px (`ServicesPage.module.css:411`), kira-kira viewport ≥1540px dengan sidebar. Di bawah itu segmen membungkus (`flex: 1 1 9rem`, CSS 510).
  - Lajur status + biaya + aksi tetap 11 + 9 + 10rem = 480px (CSS 365). Itu 52% lebar baris di 1366; lima segmen informasi hanya kebagian 458px.
  - Ambang judul tidak memperhitungkan kolom yang aktif. Dengan hanya No., Pelanggan, dan Perangkat, 1366 tetap tanpa judul.
  - Mode Padat di 1366 (wadah 1056px) dan zoom 125% (1167px) juga tidak pernah mendapat judul.

  | Lebar | Tinggi baris | Tiket utuh di layar 900px |
  |---|---|---|
  | 1280 | 150–193px | 2 |
  | 1366 | 112–138px | 3 |
  | 1440 | 90–133px | 4 |
  | 1920 | 56–98px | 5 |

- **Kenapa penting:** di meja penerimaan, antrean ini produknya, dan meja penerimaan memakai laptop. Dengan puluhan tiket aktif, pemindaian di 1366px jadi berlayar-layar gulir.
- **Perbaikan:** tetap pertahankan keputusan 7 Nov (Keluhan & Penanganan satu segmen), tapi hitung ulang ruangnya:
  - Rampingkan lajur kanan. Status pakai `max-content` (±8,5rem). Jadikan seluruh baris tautan ke detail, lalu buang ikon "Lihat tiket" sehingga aksi tinggal 3 × 40 = 120px.
  - Pindahkan nama teknisi ke bawah status atau pelanggan. Sembunyikan otomatis bila toko hanya punya satu teknisi aktif; di demo, "Rizal Pratama" ada di 7 dari 7 baris.
  - Jangan tampilkan baris "Penanganan –" sebelum status Selesai.
  - Hitung ambang judul dari jumlah lajur yang aktif, bukan angka tetap 1181.
- **Perintah:** `/impeccable layout`, lalu `/impeccable adapt`.

### [P2] Data pelanggan terpotong tanpa cara membacanya; nomor HP tidak mono
- **Apa:**
  - Nama dan nomor HP dipotong dengan elipsis tanpa `title` (CSS 433–439, TSX 897–898). Uji teks panjang di 1920: lajur pelanggan 106px, nama hanya tampil 106 dari 366px, dan "+62 812-3456-7890" terpotong 9px.
  - Nomor HP memakai Inter (proporsional), padahal aturan desain mewajibkan angka mono.
  - Nomor tiket memakai `--text-xs` (CSS 660).
- **Kenapa penting:** nomor HP yang kehilangan digit sama dengan nomor yang salah, dan nomor inilah yang dipakai teknisi untuk mencocokkan pelanggan.
- **Perbaikan:** nomor HP mono dan tidak pernah dipotong (lajurnya minimal selebar nomor). Beri `title` pada nama, plus cara membacanya dengan keyboard. Naikkan nomor tiket ke `--text-sm` tebal.
- **Perintah:** `/impeccable typeset`.

### [P2] Baris belum bergaya bench, dan terlihat bisa diklik padahal tidak
- **Apa:**
  - Baris tidak punya spine.
  - Satu unit menampilkan dua sinyal di dua kolom: "Belum diambil" di kolom perangkat dan "Tertahan 9 hari" di kolom status (FM-0003).
  - Di 1920, LED "Belum diambil" terjepit dari 7×7 jadi 3,9×7px karena `.pickupWait::before` tidak punya `flex-shrink: 0` (CSS 595).
  - Baris berubah warna saat hover, tapi diklik tidak terjadi apa-apa. Jalan ke detail hanya tautan nomor seluas 50×17px dan ikon tautan-eksternal (TSX 562–569).
- **Kenapa penting:** pemilik memindai antrean untuk mencari unit yang macet. Tanpa spine dan dengan sinyal terbelah, tidak ada satu garis yang bisa langsung dipindai.
- **Perbaikan:** tambahkan spine 3px di `.row` berdasarkan `data-tone` (pola yang sama dengan `.jobCard`). Satukan status ambil dan tertahan jadi satu readout di lajur status. Buat baris bisa diklik ke detail, atau hapus warna hover-nya. Tambahkan `flex-shrink: 0` pada LED.
- **Perintah:** `/impeccable polish`.

### [P2] Keyboard dan pembaca layar
- **Apa:**
  - **Banyak tab stop:** 6–7 per baris, dan 12 sebelum baris pertama.
  - **Tombol status kurang konteks:** namanya hanya status ("Diterima"). Ikon pensilnya tetap `opacity: 0` saat fokus, karena hanya `:hover` yang menampilkannya (CSS 329–338).
  - **Label berulang:** "Ubah", "Lihat tiket", dan "Notifikasi & nota" sama di setiap baris tanpa nomor tiket.
  - **Label margin tidak dibaca:** label modal/profit dipasang sebagai `aria-label` pada `<span>` biasa (TSX 529–536), yang tidak dibacakan. Pembaca layar hanya mengucapkan "-850.000 +650.000".
  - **Judul kolom terputus:** judul hanya div biasa, tanpa hubungan ke sel-selnya.
- **Perbaikan:**
  - Beri tombol status nama "Ubah status FM-0006: Diterima".
  - Kaitkan tombol ikon ke nomor tiket dengan `aria-describedby`.
  - Pakai teks `fm-visually-hidden` untuk label margin.
  - Tampilkan pensil saat `:focus-visible`.
  - Pakai semantik tabel/grid yang benar, atau sembunyikan judul dari pembaca layar dan beri label tiap sel.
- **Perintah:** `/impeccable harden`.

### [P2] Interupsi menghapus kata kunci, filter, dan posisi gulir
- **Apa:** kata kunci cari, filter, sortir, dan sakelar disimpan di `useState` lokal (TSX 126–176); hanya sebagian yang dibaca dari URL saat halaman dibuka. Hasil uji: cari "Andi" (2 baris) → buka tiket → kembali lewat tautan Servis → kotak cari kosong, 7 baris, dan posisi gulir kembali ke atas.
- **Kenapa penting:** teknisi di meja terus diinterupsi, dan setiap interupsi berarti mengetik ulang.
- **Perbaikan:** simpan keadaan daftar di search params atau session store, dan kembalikan posisi gulir.
- **Perintah:** `/impeccable harden`.

## Bendera merah persona
**Alex (pengguna mahir):**
- Judul kolom tidak bisa diklik untuk mengurutkan; urutan hanya Terbaru/Terlama.
- Tidak ada tombol "/" untuk lompat ke kotak cari, hanya "N".
- Tidak bisa menandai ambil atau mengirim WA ke banyak tiket sekaligus.
- Kolom hanya bisa diatur di Pengaturan › Operasional, untuk seluruh toko.
- Dengan 6–7 tab stop per baris, antrean penuh butuh ratusan tab.

**Sam (keyboard dan pembaca layar):**
- Tombol status tidak menyebut tiketnya, dan pensilnya tidak tampil saat fokus.
- Nama tombol ikon berulang di tiap baris.
- `aria-label` pada margin diabaikan.
- Teks keluhan lengkap hanya ada di `title`.
- Tautan tiket hanya 50×17px.
- Judul kolom tidak terhubung ke sel.

**Teknisi di meja penerimaan:**
- Karyawan tidak bisa menandai ambil dari daftar, karena `renderPickup` mengembalikan `<span>` untuk non-manajer (TSX 465).
- Baris tidak bisa diklik.
- Nama dan nomor HP terpotong tanpa teks hover.
- Di 1280 hanya 2 tiket yang terlihat.
- Kata kunci cari dan filter hilang setelah interupsi.

**Pemilik:**
- Sub-baris margin tanpa label atau "Rp", dan hanya muncul bila tiket punya sparepart. Akibatnya "tanpa sparepart" dan "sparepart belum dicatat" terlihat sama (FM-0005).
- Tidak bisa mengurutkan berdasarkan profit atau lama tertahan.
- Tiket yang sudah Lunas ikut tercampur di antrean secara bawaan.

## Catatan kecil
- Ikon `microchip` 16px terbaca seperti roda gigi, dan ikon ini yang pertama di setiap baris aktif.
- Label dan petunjuk kolom di `SERVICE_COLUMNS` (`src/lib/business/serviceColumns.ts:5-12`) ditulis langsung dalam bahasa Indonesia dan ditampilkan di Pengaturan tanpa `useT()`. Akibatnya bahasa Inggris tetap menampilkan teks Indonesia (melanggar AGENTS §3).
- Di 1920, "Rizal Pratama" patah jadi dua baris di lajur teknisi selebar 82px.
- Di 1366, tombol "Konfirmasi Biaya" selebar 185px di lajur 176px, meluber 3px ke celah. Tidak mengganggu.
- `hideClosed` mati secara bawaan, jadi tiket yang sudah selesai ikut tercampur di antrean kerja.
- Garis kiri penuh pada `.context` di modal sparepart (dibuka dari aksi cepat di daftar) tidak sesuai bentuk spine resmi. Ini temuan detektor.

## Pertanyaan untuk dipertimbangkan
1. Kalau ini antrean kerja, kenapa urutannya berdasarkan tanggal masuk, bukan berdasarkan unit yang paling perlu dikerjakan berikutnya (lama di status, menunggu pelanggan, siap di rak)?
2. Kenapa nomor tiket, stiker di unit yang sedang dipegang teknisi, jadi teks terkecil di baris?
3. Apakah setiap baris di 1366 perlu harga dan empat aksi? Atau uang cukup jadi tampilan pemilik, sementara baris teknisi cukup berisi nomor, perangkat, pelanggan, status, dan umur?
4. Apakah pilihan kolom sebaiknya per layar (laptop meja vs monitor pemilik), bukan satu setelan untuk seluruh toko?

## Bukti
- Lebar wadah per konfigurasi:

  | Konfigurasi | Lebar wadah | Judul kolom |
  |---|---|---|
  | 1112 | 752px | tidak |
  | 1152 | 792px | tidak |
  | 1280 | 920px | tidak |
  | 1366 | 1006px | tidak |
  | 1440 | 1080px | tidak |
  | 1920 | 1314px | ya (satu-satunya) |
  | 1366 zoom 125% | 1167px | tidak |
  | 1366 Padat | 1056px | tidak |

  Tidak ada yang meluber di satu konfigurasi pun.
- Lebar lajur di 1920: No. 104 · Pelanggan 106 · Perangkat 117 · Keluhan & Penanganan 293 · Teknisi 82 · Status 176 · Biaya 144 · Aksi 160.
- Rujukan kode: CSS 158–181, 329–338, 361–383, 365, 411, 433–439, 498–517, 595–602, 660–666; TSX 126–176, 453–477, 529–536, 562–569, 863–880, 895–899.
- Foto (scratch sesi, tidak di-commit): `page-1366-dark.png`, `list-1920-dark.png`, `longtext-row-1920.png`, `row-hidpi-1920.png`, `cols-reduced-1366.png`, plus `measure.json`.
