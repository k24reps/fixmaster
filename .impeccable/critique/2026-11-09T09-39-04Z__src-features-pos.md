---
target: menu kasir di mobile
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Lenovo\\Documents\\fixmaster\\.claude\\worktrees\\gracious-euclid-bddc05\\src\\features\\pos"
timestamp: 2026-11-09T09-39-04Z
slug: src-features-pos
---
Method: dual-agent (A: penilai desain kasir ponsel · B: detektor + ukur DOM)

Cakupan: Kasir (POS) di ponsel, 320/360/390/430 px, tema gelap dan terang, alur penuh (pilih cabang, katalog, cari, tambah, dock, keranjang, tender, kembalian, kurang bayar, pelanggan, ekstra, LUNAS, riwayat), plus uji beban 28 sparepart (13 kategori) yang disuntik ke adapter RAM demo.

## Skor kesehatan desain

| # | Heuristik | Skor | Masalah utama di ponsel |
|---|---|---|---|
| 1 | Status sistem terlihat | 2 | LCD jelas, tapi saat terima uang pita KEMBALIAN setengah tertutup bar Proses dan total LCD sudah tergulir ke atas |
| 2 | Cocok dengan dunia nyata | 3 | Register, "Uang pas", Tunai/QRIS pas; teks keranjang kosong masih "Klik produk" di layar sentuh |
| 3 | Kendali pengguna | 3 | Kosongkan bisa dibatalkan, tender bisa dihapus, riwayat bisa void; daftar saran pelanggan tak bisa ditutup |
| 4 | Konsistensi | 2 | "stok 3" lawan "STOK 3", chip pil di samping tuts mekanis, baris riwayat runtuh |
| 5 | Pencegahan galat | 2 | Bayar kurang diblokir, tapi di 320px dock menutupi Proses dan dengan 3+ kategori total terdorong keluar layar |
| 6 | Kenali, bukan ingat | 2 | Nomor model terpotong ("Keyboard MacBoo…"), toggle tampilan ikon saja, register di bawah seluruh katalog |
| 7 | Fleksibilitas | 3 | Nominal terisi sisa tagihan, "Pas" sekali tap, saran uang cepat, tampilan diingat |
| 8 | Estetika minimal | 2 | 5–7 elemen amber di layar bayar; bar demo + topbar memakan 16% tinggi |
| 9 | Pulih dari galat | 2 | Status "Kurang" ada tapi tertutup bar atau di bawah lipatan; Proses nonaktif tanpa alasan |
| 10 | Bantuan | 2 | Petunjuk tender terpotong satu baris di 390px; tak ada panduan lain |
| **Total** | | **23/40** | **Cukup** |

## Vonis kekhasan desain

**Penilaian desain (A):** lolos di separuh register, belum di separuh katalog. LCD dengan "88" bayangan dan scanline, LED LIVE yang berubah jadi LED hijau LUNAS, keranjang bergaya struk termal dengan tepi berlubang, tuts qty mekanis, tuts bayar ber-LED: ini Register Readout milik FixMaster. Katalognya masih grid toko generik: chip kategori pil, nominal uang cepat berupa pil putus-putus (`PosPage.module.css:1087-1101`), tiga tombol tampilan ikon saja, baris riwayat polos.

**Pemindaian otomatis (B):** `detect` di `src/features/pos` memberi 2 temuan anjuran, keduanya disengaja: radius 1px takik tag (`css:114`) dan ukuran LCD 2.35rem (`css:445`). Komponen khusus kasir (CatalogControls, CustomerModal, Modal) bersih. Detektor tidak menangkap satu pun dari empat masalah terberat; `audit-mobile` juga melaporkan /pos bersih di 5 lebar, karena data contoh hanya punya 2 kategori per cabang dan probe hanya mengukur keadaan sesaat setelah navigasi.

**Overlay:** detect.js berhasil disuntik di peramban headless (390px, gelap, 3 keadaan); tidak ada overlay yang terlihat pengguna. Konsol: glow teks amber di LCD (disengaja, sumur instrumen), glow amber di Proses aktif (bayangan "Powered" yang sah, tapi menambah beban amber), pola garis/grid di body (tekstur bench, positif palsu).

## Kesan umum

Puncaknya kuat: LCD berganti ke LUNAS dan "Serahkan kembalian Rp 900.000" jelas dan dipercaya. Yang gagal adalah perjalanan ke sana di ponsel: dua bug tata letak bisa menyembunyikan total atau menutupi Proses, dan saat pelanggan menyerahkan uang, angka kembalian justru paling tidak terlihat. Peluang terbesar: jadikan bar Proses yang menempel itu penunjuk uang, bukan pengulang total.

## Yang sudah bekerja

1. LCD Register Readout khas dan berfungsi di dua tema; di tema terang tetap gelap sesuai aturan sumur instrumen.
2. Bayar cepat: nominal terisi sisa tagihan, "Pas" atau satu nominal cepat selesai dalam satu tap, kembalian dihitung langsung, bayar kurang diblokir.
3. Bisa dipulihkan: Kosongkan bisa dibatalkan ("Kembalikan 14 barang"), panel LUNAS menahan struk, WhatsApp, dan kembalian; badge stok langsung turun. Ukur B: tak ada luberan dokumen, tak ada teks di bawah 12px, kontras area bayar minimal 4.9:1 di dua tema.

## Masalah prioritas

**1. [P0] Chip kategori meluberkan seluruh kolom kasir**
- Apa: dengan 3+ kategori di satu cabang, katalog dan register melebar mengikuti baris chip: 4 chip 382px (ruang 358px di 390), 7 chip 674px, 13 kategori 1266px. Total di kanan dan harga per baris keluar layar dan tidak bisa digeser (`_demoStage_` overflow-x hidden).
- Akar: di ≤1024px `.layout` memakai `grid-template-columns: 1fr` (`PosPage.module.css:1384-1386`); `1fr` polos punya minimum otomatis, dan `.products` (`css:83`) tanpa `min-width: 0`. Trek desktop `1fr minmax(320px,400px)` (`css:67`) perlu dicek juga.
- Kenapa penting: toko sungguhan (LCD, Baterai, IC, Konektor, Fleksibel, Kaca, Aksesoris) kena di hari pertama; kasir tak bisa membaca total.
- Perbaikan: `minmax(0, 1fr)` + `min-width: 0` agar baris chip menggulir sendiri seperti di halaman lain; data contoh dengan 6+ kategori supaya probe menangkapnya.
- Perintah: /impeccable harden

**2. [P1] Di 320px dock keranjang menutupi tombol Proses**
- Apa: dock "3 unit · Rp 3.450.000" (y512–556) menumpuk di atas bar Proses (y492–564). Tap di tengah Proses kena dock, halaman menggulir 821→272, penjualan tidak diproses (diuji dengan tap sungguhan, dua tema).
- Akar: IntersectionObserver di `PosPage.tsx:291` membaca entri pertama saja (`([e]) =>`); setelah cabang dipilih datang dua entri `[false, true]`, yang basi menang dan `cartInView` tetap false. Dock juga tergambar 44px, bukan 56px CSS-nya (aturan `min-height` global di `global.css:160-171`), sehingga margin "nav + 72" meleset.
- Kenapa penting: tombol terbesar di jangkauan jempol tak melakukan apa-apa saat pelanggan menunggu.
- Perbaikan: baca entri terakhir dan hitung margin dari tinggi dock yang terukur.
- Perintah: /impeccable harden

**3. [P1] Bar Proses tidak memberi tahu soal uang**
- Apa: setelah tender dipilih, pita KEMBALIAN setengah tertutup bar Proses (390 gelap: pita y678–711, bar mulai y708), total LCD sudah di bawah topbar, dan bar mengulang total ("Proses · Rp 3.150.000", `PosPage.tsx:1191`). Sebelum tender dipilih, Proses nonaktif bergaris putus-putus tanpa alasan dan tanpa `aria-describedby`.
- Kenapa penting: satu tangan memegang ponsel, satu memegang uang, kasir harus menyebut kembalian. Menggulir ke atas dengan jempol untuk mengecek total adalah titik salah hitung.
- Perbaikan: bar menjadi penunjuk keadaan ("Pilih cara bayar" → "Kurang Rp X" → "Proses · kembalian Rp 850.000", LED hijau, mono); tap saat nonaktif menggulir ke tuts tender; `scroll-padding-bottom` agar status bayar tak masuk ke bawah bar; petunjuk tender boleh dua baris.
- Perintah: /impeccable layout + /impeccable clarify

**4. [P1] Baris Transaksi Terakhir runtuh di semua lebar ponsel**
- Apa: `.historyRow` (`css:1208`) flex tanpa wrap berisi invoice + meta, total, dan tiga tombol ikon 44px. Baris setinggi 247px di 360/390 (173px di 430), "INV-" dan "0002" terpisah baris, meta satu kata per baris, "Tunai" menimpa "Rp 3.100.000".
- Kenapa penting: di sini kasir mengecek apakah penjualan masuk atau perlu dibatalkan; angka uang tertimpa melanggar prinsip kejujuran angka.
- Perbaikan: `@container` yang mengubahnya jadi kartu dua baris: invoice mono + total rata kanan; waktu · dompet · pelanggan; tuts aksi di bawah.
- Perintah: /impeccable adapt

**5. [P2] Teks dipotong di tempat yang salah**
- Nama produk: "Keyboard MacBoo…" menyembunyikan A1989; dua varian iPhone yang beda di ujung nama terlihat sama.
- 320px: nominal "3.450.000" terpotong 7px ("12.500.000" 13px), chip cabang "Pusat Bandung" jadi elipsis, tuts BANK BCA patah dua baris (juga di 390), petunjuk tender terpotong di 390.
- Perbaikan: clamp dua baris atau potong di tengah agar ujung nama terlihat; SKU mono; kolom nominal melebar di wadah sempit.
- Perintah: /impeccable typeset

## Bendera merah persona

**Casey (satu jempol, sering disela):** register di bawah seluruh katalog; dengan sedikit produk dock tak pernah muncul sebagai umpan balik; daftar saran pelanggan tetap terbuka setelah disela dan menutupi DISKON serta tuts tender; toggle tampilan di kanan atas; "Transaksi Baru" di tengah layar (y543–587 di 390), tidak difokus otomatis.

**Riley (penguji tepi):** 13 kategori membuat LCD 1266px; total 9 digit "Rp 140.460.000" mematahkan "Rp" ke baris sendiri; 14 baris keranjang = keranjang 2273px, LCD 1647px di atas viewport saat mengisi nominal; nominal cepat hanya "Pas / Rp 140.500.000 / Rp 141.000.000"; barang habis hanya muncul saat dicari dan tak bisa difokus.

**Sam (pembaca layar, papan ketik):** `aria-live="polite"` membungkus seluruh `.register` (`PosPage.tsx:806`), tiap ubah qty mengumumkan ulang LCD dan keranjang; tab `role="tab"` tanpa `aria-controls`/tabpanel; input pelanggan pakai listbox + `aria-activedescendant` tanpa `role="combobox"`/`aria-expanded`; Proses nonaktif tanpa `aria-describedby`. Di luar kasir: 13 kontrol sidebar tersembunyi (x≈-265) masih menerima fokus Tab di lebar ponsel karena `aside` tidak `inert` (cangkang aplikasi, semua halaman).

**Kasir yang memegang HP pelanggan:** Proses terjangkau jempol, tapi angka uang di atas atau di luar layar; tombol × hapus tender menempel di kolom nominal; nominal cepat patah ke baris kedua di 360/390; pengambilan HP selesai servis (bayar paling sering di konter) terjadi di detail Servis, bukan di Kasir.

## Catatan kecil
- String di luar i18n: `PosPage.tsx:908` "Belum ada item. Klik produk untuk menambahkan.", `811` `LIVE`, `813` `TOTAL · IDR`, 'PUSAT', 'stok'; teks struk di `printSaleReceipt.ts`.
- "Serahkan kembalian Rp 900.000" (`.doneChange`, `css:574`) huruf proporsional (Aturan Angka Mono).
- `.productCard::after` (`css:107`): takik cyan di tiap kartu tanpa nilai.
- Placeholder pencarian terpotong "Cari nama, kategori, atau SK" (toggle memakan 133px).
- LCD menyebut mata uang dua kali ("TOTAL · IDR" dan "Rp").
- `qtyInput` 34px lebar.
- Di 430px ada ±320px ruang kosong di bawah panel LUNAS.

## Pertanyaan untuk dipertimbangkan
1. Kalau kembalian adalah angka yang ditunggu pelanggan, kenapa kontrol amber terbesar di layar bayar masih mengulang total?
2. Konter reparasi menjual sedikit SKU: apakah register (LCD + keranjang) di atas dengan katalog sebagai lembar pencarian dari bawah lebih pas?
3. Bolehkah Kasir menerima "Ambil servis #SRV-…" sebagai baris keranjang?

## Bukti
- A: `scratchpad/critPosA/shots/` (137 foto; kunci: 27-chips-blowout-390, 09-change-light-360, 14-history-dark-390, 24-stress-hugetotal-dark-390-onecat).
- B: `scratchpad/critPosB/` (detect-pos.json, pos-mobile-measure.json, verify-out.json, overlay-console.json; foto verify-320-payment-before-tap).
