---
target: fitur cetak nota (thermal + template di Pengaturan)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Lenovo\\Documents\\fixmaster\\.claude\\worktrees\\gracious-euclid-bddc05\\src\\features\\services\\printReceipt.ts"
target_fingerprint: "sha256:f9af6b20d05fda5cb2843767169dac35266ae5ae00c55a114bfdd5ea8ffce70a"
target_path: "C:\\Users\\Lenovo\\Documents\\fixmaster\\.claude\\worktrees\\gracious-euclid-bddc05\\src\\features\\services\\printReceipt.ts"
timestamp: 2026-11-10T23-40-21Z
slug: src-features-services-printreceipt-ts
---
Method: dual-agent (A: penilai desain · B: detektor + bukti browser)

# Critique: cetak nota servis & struk penjualan

Target: src/features/services/printReceipt.ts, src/features/pos/printSaleReceipt.ts, src/lib/print.ts, dan bagian Pengaturan yang mengisi nota. Lensa: (1) kecocokan printer termal, (2) isi template bisa diatur dari Pengaturan.

## Skor kesehatan desain

| # | Heuristik | Skor | Masalah utama |
|---|---|---|---|
| 1 | Visibilitas status sistem | 2 | Setelah klik cetak tak ada umpan balik; tab popup tetap terbuka; cetak ulang tak bertanda; nota mencetak status pengerjaan yang cepat basi. |
| 2 | Kecocokan dunia nyata | 2 | "Sisa Rp 0" tebal saat biaya akhir belum diisi (FM-0002: estimasi Rp 500.000, DP Rp 200.000). Tombol "Cetak tanda terima" mencetak "NOTA SERVIS". |
| 3 | Kendali & kebebasan | 2 | Tak ada pratinjau, pilihan lebar kertas, atau saklar QR; satu-satunya kendali adalah dialog browser. Cetak ulang tersedia. |
| 4 | Konsistensi & standar | 3 | Satu cangkang openReceiptWindow untuk nota & struk; dua label tombol untuk satu dokumen; nama barang struk di kolom label abu-abu. |
| 5 | Pencegahan error | 1 | Pagar rasio logo/alamat/catatan ada, tapi kegagalan umum lolos: IMEI ganda membuat nota mengecil dan terpotong, Margins None mendorong isi keluar pita cetak, struk batal terlihat sah. |
| 6 | Mengenali, bukan mengingat | 2 | Isi nota tersebar di tab Usaha dan Operasional (kartu ke-6); tak ada bagian bernama Nota/Struk. |
| 7 | Fleksibilitas & efisiensi | 2 | Tombol cetak di momen yang tepat, tapi setiap cetak lewat dialog browser penuh; tak ada printer tersimpan, ESC/POS, atau cetak sekali ketuk. |
| 8 | Estetika & minimalis | 3 | Rapi, tapi boilerplate memakan gulungan: 7 garis pemisah, URL 79 karakter (5 baris di 58mm), ucapan dua baris, fine print tiga baris. |
| 9 | Pemulihan error | 1 | "Popup diblokir browser" tanpa langkah perbaikan dan menutupi tombol Cetak Nota; logo rusak dihapus diam-diam. |
| 10 | Bantuan & dokumentasi | 1 | Tak ada panduan printer: 58/80mm, margin, header/footer browser, Android/RawBT, cetak percobaan. |
| Total | | 19/40 | Poor |

Penilai A memberi 20/40; H5 diturunkan 2 -> 1 setelah bukti pengukuran B (IMEI ganda).

## Vonis kekhasan desain

LLM: suaranya FixMaster (readout mono, pemisah putus-putus, label dokumen berspasi, nama toko dominan, FixMaster satu baris 8,5px), mesinnya halaman web sempit: kolom tetap 280px, tanpa @page size, lima nada abu-abu, webfont tak termuat. Pengaturan tak punya permukaan khusus nota: dua kartu formulir generik di dua tab, tanpa pratinjau.

Deterministik: sumber 11 berkas exit 0, 0 temuan utama, 21 catatan di PRINT_STYLE (design-system-color x10: #555 x6, #9a9a9a, #000, #333, #8a8a8a; design-system-font-size x11: 8,5-14px). Warna literal di dokumen cetak sah (src/lib/print.ts), tapi menunjuk tepat ke nada yang hilang di head 1-bit. HTML popup exit 2: low-contrast .by 3,5:1 (valid untuk kertas), tiny-text/undersized-ui-text 8,5-11,5px (aturan layar, hanya arah; 18-24 titik di 203 dpi masih terbaca). Tidak tertangkap detektor: luberan IMEI ganda dan bug "Sisa Rp 0". Positif palsu: dark-glow LED sidebar, codex-grid-background, overused-font (seluruh aplikasi). Nyata kecil: nested-cards baris logo, kontras placeholder Catatan Toko 4,1:1, straggler di petunjuk Kategori Perangkat.

Overlay: detektor berjalan di tab [Human] penilai B pada 6 tampilan; tab ditutup dan live server dihentikan, tak ada overlay tersisa.

## Yang sudah bagus

1. Satu cangkang openReceiptWindow (printReceipt.ts:111), identitas toko di depan; judul popup jadi nama berkas PDF yang masuk akal.
2. Isi nota menghormati bukti konter reparasi: IMEI/SN, kondisi, kelengkapan, garansi per sparepart; kunci layar tak pernah tercetak; validasi menautkan batas ke kertas.
3. QR buatan sendiri satu path, crispEdges, level M; titik masuk cetak di momen yang tepat (dialog tiket selesai).

## Masalah prioritas

### [P0] Kertas tidak dikendalikan: lebar, ukuran halaman, margin, font diserahkan ke driver
- Apa: @page { margin: 6mm } tanpa size (printReceipt.ts:17), max-width 280px (baris 22), tak ada setelan lebar kertas. JetBrains Mono tak termuat; Consolas -> 27 karakter/baris di 58mm, 40 di 80mm (Font A printer 32/48). IMEI ganda 31 karakter memaksa tabel 273,6px; Chrome mengecilkan seluruh nota ke ~0,67x (4,25pt) di 58mm dan kolom kanan tetap terpotong. Margins None -> isi keluar ~5mm dari pita cetak.
- Kenapa: prioritas #1; IMEI ganda umum di konter HP.
- Perbaikan: setelan Lebar kertas 58/80mm -> @page { size: 58mm auto; margin: 0 }; lebar badan dalam mm (48/72) + padding ~2mm; overflow-wrap: anywhere di td dan .note; break-inside: avoid di QR & baris; font dalam kelipatan titik (32/48 kar/baris), font mono sistem eksplisit; tahap berikut ESC/POS (RawBT, WebUSB/Web Bluetooth).
- Perintah: /impeccable adapt

### [P1] Abu-abu dan logo berwarna hilang di head termal 1-bit
- Apa: 7 garis 1px dashed #9a9a9a (baris 48) dan "DICETAK DENGAN FIXMASTER" (#8a8a8a, baris 84) = 0 titik pada ambang 50%; #555 jadi derau dither; logo berwarna sisa 2-8% titik; logo 1:4 jadi irisan 4,2mm.
- Kenapa: struktur nota dan logo toko lenyap.
- Perbaikan: tinta #000; hierarki lewat tebal/ukuran/spasi; pemisah 1px hitam solid atau baris karakter titik; tak ada teks < ~10px; pratinjau logo 1-bit di Pengaturan.
- Perintah: /impeccable harden

### [P1] Angka uang dan status di kertas salah atau menyesatkan
- Apa: Sisa = max(0, biaya akhir - DP) tebal (notify.ts:299-305) -> "Sisa Rp 0" saat biaya akhir belum diisi; jalur WA sudah benar (paymentBlock, notify.ts:79-92). Tiket batal tetap mengajak lacak & klaim garansi, tanpa DP dikembalikan/ditahan (retainedDownPayment, services.ts:198). Struk batal hanya baris abu 9,5px, TOTAL utuh, alasan hilang. Cetak ulang struk tanpa Dibayar/Kembalian, metode bayar, tanda CETAK ULANG.
- Kenapa: dokumen keuangan pelanggan; memancing sengketa dan retur palsu.
- Perbaikan: logika paymentBlock di nota; batal -> DP dikembalikan/ditahan, sembunyikan garansi & QR; penjualan batal -> pita BATAL hitam, TOTAL dicoret, alasan; cetak ulang -> CETAK ULANG + tanggal + metode bayar.
- Perintah: /impeccable harden

### [P1] Isi template nyaris tak bisa diatur, tersebar, tanpa pratinjau (prioritas #2)
- Apa: bisa diatur hanya nama/alamat/telepon/logo (Usaha) dan Catatan Toko 280 karakter (Operasional, kartu ke-6; di ponsel y~5252/5765px, tombol simpan tertutup navigasi bawah; dipakai juga halaman lacak). Tertanam di kode: ucapan terima kasih, fine print, LACAK STATUS + keterangan QR, label NOTA SERVIS/STRUK PENJUALAN/GARANSI, DICETAK DENGAN FIXMASTER, TRANSAKSI INI DIBATALKAN. Tak ada: lebar kertas, saklar QR/URL/IMEI/teknisi/jam, alamat outlet (INV-0002 Cabang Cimahi mencetak alamat Bandung), pratinjau, cetak percobaan.
- Kenapa: pemilik ingin kaki & syarat garansi sendiri dan melihat hasil tanpa membuang gulungan.
- Perbaikan: bagian "Nota & Struk": pratinjau langsung 58/80mm memakai HTML openReceiptWindow asli di iframe (+ tampilan 1-bit), lebar kertas, kepala/kaki/syarat terisi bawaan, saklar bagian, alamat outlet, Cetak percobaan; Catatan Toko dipindah/ditautkan.
- Perintah: /impeccable shape

### [P2] Tata letak struk memeras nama barang dan mematahkan nomor
- Apa: qty x nama di kolom label 38% abu-abu (printSaleReceipt.ts:16), ~9 kar/baris di 58mm (8 baris untuk nama panjang); tanpa harga satuan; INV-0001 patah; nilai panjang rata kanan bergerigi.
- Perbaikan: barang dua baris (nama penuh hitam; "2 x Rp 75.000 ... Rp 150.000"); nowrap nomor dokumen; nilai panjang ditumpuk rata kiri.
- Perintah: /impeccable layout

## Red flag persona

- Riley: IMEI ganda -> nota 0,67x dan terpotong; nota maksimum 499mm, struk 24 baris 693mm di 58mm; logo 1:4 lolos jadi 4,2mm; tiket batal menyuruh simpan untuk klaim garansi; tanpa break-inside QR bisa terbelah.
- Casey: Cetak Nota di balik "Lainnya"; tab popup tak pernah ditutup; "Popup diblokir browser" tanpa arahan; Chrome Android default Simpan PDF/A4.
- Pemilik di ponsel: tak ada bagian bernama nota; Catatan Toko di dasar halaman, tombol simpan tertutup navigasi bawah; tanpa pratinjau; petunjuk logo tanpa saran hitam-putih; kaki & fine print tak bisa diubah.
- Kasir/teknisi: dialog browser penuh (~10 kontrol, >4 opsi) tiap cetak; "Cetak tanda terima" -> NOTA SERVIS dengan "Sisa Rp 0"; Cetak Struk kalah dari tombol utama Transaksi Baru; struk sulit dicocokkan dengan keranjang; toast gagal menutupi tombol.

## Observasi kecil

- Zona sunyi QR 2 modul (dok qr.ts menuntut 4); modul 3,82 titik -> bulatkan ke 4 titik (0,5mm).
- URL lacak 79 karakter dengan UUID tercetak penuh (5 baris di 58mm).
- Tanggal tanpa jam.
- Nota servis tanpa teknisi dan catatan penanganan.
- String literal di luar i18n: "Popup diblokir browser", "{left} karakter tersisa", placeholder Catatan Toko.
- Placeholder Catatan Toko 4,1:1.
- Logo rusak dihapus diam-diam.
- Glyph x, minus, titik tengah perlu dipetakan bila ada jalur teks ESC/POS.

## Pertanyaan untuk dipikirkan

- Dialog browser itu produknya atau cadangannya? RawBT/ESC-POS menghapus masalah font, margin, dialog, abu-abu sekaligus.
- Nota untuk menenangkan pelanggan atau membela toko saat sengketa?
- Perlukah tanda terima (masuk) dan nota serah (ambil) jadi dua dokumen?
- Haruskah toko berbayar bisa menghapus "DICETAK DENGAN FIXMASTER"?
- Bisakah pratinjau Pengaturan (dengan lebar kertas tersimpan) menggantikan dialog browser di meja kasir?

Belum diverifikasi di printer termal sungguhan: skala driver, header/footer Chrome di margin 6mm, default kertas Android.
