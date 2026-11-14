---
target: menu laporan
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/fixmaster/src/features/reports/ReportsPage.tsx"
target_fingerprint: "sha256:c8d15298200c34eb0607c8be95fbe80be149967328b1d7c4934738576dc73235"
target_path: /home/user/fixmaster/src/features/reports/ReportsPage.tsx
timestamp: 2026-11-14T04-18-49Z
slug: src-features-reports-reportspage-tsx
---
⚠️ DEGRADED: single-context (aturan sesi ini: sub-agent hanya dipakai bila pengguna memintanya. Detektor jalan di konteks yang sama, temuannya kecil, dan tidak mengubah penilaian desain.)

# Kritik & Audit: Laporan (`src/features/reports/ReportsPage.tsx`)

Yang diperiksa: kode ReportsPage, TrendChart, reports.ts, overhead.ts; detektor impeccable; foto Playwright /reports dengan data seed (1440px gelap dan terang, 390px); ukuran elemen yang diukur langsung dari halaman.

## Skor desain (heuristik Nielsen)

| # | Heuristik | Skor | Temuan kunci |
|---|---|---|---|
| 1 | Status sistem terlihat | 3 | Rentang pembanding tidak pernah disebut; hari yang belum terjadi tampil sebagai nol |
| 2 | Cocok dengan dunia nyata | 2 | Laba usaha hanya muncul sebagai "Break-even −Rp 115.000" |
| 3 | Kendali pengguna | 3 | Belum ada tombol kembali ke "bulan ini" |
| 4 | Konsisten | 3 | Kategori diurutkan menurut laba, teknisi menurut omzet; ±13 teks di luar i18n |
| 5 | Cegah kesalahan | 3 | Rentang terbalik ditolak, PDF diblok selagi data dimuat |
| 6 | Kenali, bukan ingat | 3 | Indeks hanya memuat 6 dari 13 kartu |
| 7 | Fleksibel & efisien | 2 | Tanpa pintasan periode, tanpa pembanding tahun lalu, tanpa tautan ke rincian, tabel tanpa urut/cari |
| 8 | Estetis & minimal | 3 | 9 dari 13 kartu berbentuk baris-batang yang sama; 3,9 layar desktop / 6,3 ponsel |
| 9 | Pulih dari kesalahan | 3 | Pesan rentang salah menyebut cara memperbaikinya |
| 10 | Bantuan | 3 | Kamus istilah dan Term ada di tempat yang tepat |
| **Total** | | **28/40** | **Good (batas bawah)** |

## Skor audit teknis
Aksesibilitas 3 · Performa 3 · Responsif 3 · Tema 4 · Integritas implementasi 3 = 16/20 (Good)

## Seberapa khas desainnya
Sangat khas (kotak vonis, baris analyzer, indeks ber-LED, tick-gauge break-even). Kelemahannya monoton: 9 dari 13 kartu baris-batang yang sama, sehingga bagian uang, servis, dan stok tak bisa dibedakan dengan sekali pandang. Detektor: 2× transition width (css:222, :542), 1× ukuran huruf .estTag 0.625rem (css:388), 1× positif palsu "overused font Inter" (printReport.ts:73; Inter font body resmi DESIGN.md). Tanpa overlay browser.

## Kesan umum
Jujur dan teliti soal kas, tapi belum menjawab "untung bersih berapa / apa yang bocor / siapa yang perlu dikejar". Data garansi balik, unit belum diambil, penjualan per barang, dan pelanggan sudah ada di database tapi tak pernah muncul.

## Yang sudah bagus
1. Jujur soal angka: vonis mengaku tanpa pembanding, label stok saat ini/semua periode, PDF ditolak saat data belum lengkap.
2. Break-even yang benar secara akuntansi: overhead diporsi, tanda est., peringatan "Lainnya" >20% dan gaji belum dicatat.
3. Indeks "Isi laporan" sekaligus ringkasan.

## Masalah prioritas
- [P1] Tidak ada Laba Rugi; laba bersih tersamar sebagai "Break-even −Rp 115.000"; laba penjualan kasir (selisih Rp 930.000 di demo) dihitung di grossProfit tapi tak tampil; margin % tidak ada. Perbaikan: kartu Laba Rugi bergaya struk di bawah vonis. → /impeccable shape
- [P1] "vs periode lalu" membandingkan 30 hari penuh Oktober dengan 14 hari data November (to tidak dipotong ke hari ini); grafik memplot 15–30 Nov sebagai nol. Perbaikan: potong ke hari ini, sebut rentang pembanding, hentikan garis di hari ini. → /impeccable harden
- [P1] Mutu servis tak terukur: tanpa % klaim garansi, % batal, unit belum diambil, akurasi estimasi; teknisi diurutkan menurut omzet. Perbaikan: kartu Mutu & Kecepatan Servis, peringkat teknisi menampilkan laba/median hari/klaim. → /impeccable shape
- [P2] Daftar tindak lanjut tak bisa diklik: 0 tautan di 11 baris tabel; piutang tanpa tautan tiket atau tombol WA tagih. → /impeccable polish
- [P2] Ponsel: dua date picker tanpa pintasan periode; label sumbu grafik ikut mengecil (tinggi 7px di 390px). → /impeccable adapt

## Peta kelengkapan
Tingkat 1: Laba Rugi + margin; analisis Kasir (produk terlaris/untung, diskon, void); klaim garansi; unit belum diambil.
Tingkat 2: batal + DP ditahan; pelanggan baru vs langganan; nilai stok & barang mati; target vs realisasi.
Tingkat 3: akurasi estimasi; saldo dompet; supplier; absensi/kasbon; bulan yang sama tahun lalu.
Struktur: ubah indeks menjadi tab bagian (Ringkasan · Uang · Servis · Kasir & Stok · Pelanggan · Piutang) agar tidak menjadi ±10 layar di ponsel.

## Dari sudut pandang tipe pengguna
Pemilik di ponsel: dua date picker, label grafik tak terbaca, 6,3 layar, tak bisa menagih dari daftar piutang. Alex (mahir): tanpa pintasan periode atau pembanding tahun lalu, tabel dibatasi 100 baris tanpa urut/cari. Sam (pembaca layar): grafik dibacakan tanpa angka; tautan kategori setinggi 16px.

## Temuan teknis kecil
- [P2] ±13 teks UI literal tidak lewat useT() (ReportsPage.tsx 308, 372, 481, 796, 899, 938, 958, 989, 1012, 1054, 1071, 1115; TrendChart.tsx:38)
- [P3] Komentar basi ReportsPage.tsx:282 "fitur Pro"; Trial kehilangan tombol ekspor tanpa penanda
- [P3] Isi batang dianimasikan lewat width; .estTag di luar skala tipe

## Pertanyaan untuk dipikirkan
- Ini laporan kas atau laporan laba? Kalau pemilik hanya membaca satu angka, angka yang mana?
- Kalau tiap bagian punya tombol tindakan, di mana batas antara Laporan dan Dashboard?
- Perlukah pengguna Trial melihat bahwa Ekspor PDF ada?
