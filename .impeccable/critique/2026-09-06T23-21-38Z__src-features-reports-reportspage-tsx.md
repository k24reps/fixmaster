---
target: menu laporan
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-06T23-21-38Z
slug: src-features-reports-reportspage-tsx
---
**Method: dual-agent (A: a035af59f444ed844 · B: aafee7a3e1ac33e08)**

## Design Health Score

| # | Heuristik | Skor | Temuan kunci |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Tiga chip delta secara struktural mustahil benar; "Saran Restok" mengabaikan periode di header |
| 2 | Match System / Real World | 3 | Kosakata reparasi kuat, tapi `0.0 hari` (titik) berdampingan `102,0%` (koma) |
| 3 | User Control and Freedom | 1 | Dua input tanggal mentah, tanpa preset, cakupan outlet tidak bisa diklik, nol drill-down |
| 4 | Consistency and Standards | 2 | Tujuh kalimat berbeda untuk satu kondisi kosong; bar berarti kuantitas berbeda tiap kartu |
| 5 | Error Prevention | 1 | Tanpa min/max; rentang terbalik diterima diam-diam, semua kartu lapor nol |
| 6 | Recognition Rather Than Recall | 2 | Pemilik harus mengingat angka periode lalu — yang di layar palsu |
| 7 | Flexibility and Efficiency | 1 | Tabel dipotong 100 baris; jalan keluarnya menyebut tombol yang tidak dirender di Trial/Solo |
| 8 | Aesthetic and Minimalist | 2 | Kerajinan nyata terkubur di bawah 13 kartu sebentuk |
| 9 | Error Recovery | 1 | Tidak ada error state; sembilan empty state tanpa aksi pemulihan |
| 10 | Help and Documentation | 2 | Satu kalimat bagus soal overhead budget; nol penjelasan aging/funnel/definisi laba |
| **Total** | | **17/40** | **Perlu perbaikan struktural** |

Mode Operate — kesepuluh heuristik berlaku.

## Design Specificity Verdict

Setengah terotori. Empat tile metrik adalah objek yang selesai (spine 3px, LED 7px, mono tabular). Tapi sembilan dari tiga belas kartu memakai widget `.channel` yang sama persis, dan seluruh halaman hanya punya dua elemen interaktif — keduanya `<input type="date">`. Metafora di header CSS-nya, "Analyzer Printout", jujur: printout adalah yang jatuh dari mesin di akhir.

Deterministik: CLI bersih pada TSX (titik buta — semuanya di CSS Modules); 5 temuan pada CSS. Nol hex/rgb hardcoded (Token-Only bersih). Overlay runtime: 54 temuan di `<main>`, 34 pada kelas laporan; `transition: width` terinstansiasi 19x.

False positive by intent: 11x ai-color-palette (cyan adalah pilar DESIGN.md), 4x dark-glow pada .metricLed (itu Lit-Signal yang benar), 1.15rem baris 116 (token --text-lg nyata; yang bocor DESIGN.md tidak mendokumentasikan --text-sm/lg/2xl). 72 elemen render di 14px sementara step Body resmi 15px muncul nol kali.

## Priority Issues

### [P0] Chip "vs periode lalu" tidak pernah bisa benar
useCollectionRange hanya mengambil periode terpilih ("plan B"), tapi periodComparison menyaring array yang sama untuk prevFrom..prevTo yang di luar jendela itu. previous selalu {0,0,0}; ratioDelta(x,0) = 1. Chip hanya bisa 0,0% atau +100,0%. Terverifikasi: kehancuran omzet Rp 6.450.000 -> 0 dilaporkan sebagai "0,0%".
Fix: fetch jendela pembanding; ratioDelta kembalikan null saat previous 0 dan current bukan 0; render "tidak ada data periode lalu".

### [P0] Tema terang: setiap angka gagal kontras
.inc/.exp dipaku ke --green-400/--red-400 tanpa override terang. .channelValue.inc 1,87:1; .typeTag.typeInc 1,32:1; .scopeTag 2,17:1 (AA butuh 4,5:1). Perbandingan Antar-Outlet membedakan laba/rugi hanya dengan hijau vs merah — melanggar Lit-Signal.
Fix: token --figure-pos/--figure-neg per tema; tambah LED 7px di baris net outlet.

### [P1] Zoom 125% memotong keempat angka utama
.metrics unstack hanya di @media 720px, tapi zoom tidak menggeser media query. Pada zoom 1.25 wrap menyusut ke 777px; .metricValue clientWidth 96 vs scrollWidth 161; ellipsis memakan 40% tiap angka.
Fix: container-type pada .wrap, ubah @media jadi @container, hapus text-overflow dari .metricValue.

### [P1] Bar Saran Restok terbalik
width = stock/(minStock*2). "1/min 3" -> 16,7%; "2/min 2" -> 50%. Panjang bar menunjuk barang yang kurang mendesak. Kartunya juga tidak difilter periode meski header menyatakan rentang.
Fix: balik ke defisit (minStock-stock)/minStock; danger saat stock<minStock; tag "LIVE - bukan periode".

### [P2] Amber jadi wallpaper, instrument well tidak dibelanjakan
57 elemen amber dalam satu viewport. Dan halaman ini punya NOL instrument well — token --readout-* tidak muncul sekali pun; .beGauge memakai --bg-input. Budget satu per viewport bukan dipatuhi, melainkan tidak dipakai. Laba Bersih dirender identik dengan tiga tetangganya.
Fix: cabut amber dari ikon CardHeader dan .scopeTag; belanjakan satu well pada kalimat vonis halaman.

## Persona Red Flags

- Pemilik di ponsel: Laporan tidak ada di bottom nav, dua ketuk di balik "Lainnya"; ~400px pertama layar 812px adalah chrome; ganti periode = ~10 ketukan di dua date picker native.
- Pemilik deuteranopia: laba/rugi per cabang dibedakan hanya hijau vs merah, pada teks dan bar.
- Pemilik zoom 125%: menerima "Rp 6.4..." — meminta teks lebih besar menghancurkan angka yang diperbesar.
- Keyboard: dua elemen fokusabel; .dateInput:focus outline none, hanya border 1px berubah amber.

## Minor Observations

- .channelName tanpa font-family: angka jatuh ke sans proporsional di empat kartu (Mono Numbers bocor).
- .metric:hover mengangkat 2px + shadow pada div tanpa handler — Mounted-or-Flat, dan menjanjikan drill-down yang tidak ada.
- Sumbu-y kosong membaca 0,0,1,1,1.
- Catatan "Ekspor CSV" tidak digerbang canExport padahal tombolnya dihapus di Trial/Solo.
- Tabel tanpa caption/scope; mode mobile menghapus thead untuk pembaca layar juga.
- Di luar cakupan: .topbar sticky top 14px meninggalkan pita 11,2px tak ter-clip; teks menyembul di 11 dari 21 posisi scroll.

## Questions to Consider

1. Kalau halaman ini harus menjawab satu kalimat — "Bulan ini lebih baik atau lebih buruk?" — bisakah ia?
2. Sembilan dari tiga belas kartu memakai .channel identik. Konsistensi, atau anti-referensi yang menyembunyikan empat instrumen yang tak pernah dirancang?
3. Halaman bernama "Analyzer Printout" dan berperilaku begitu: dua input, tiga belas keluaran, nol jalan bertindak.
