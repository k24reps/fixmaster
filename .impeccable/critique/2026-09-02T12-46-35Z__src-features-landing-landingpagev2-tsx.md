---
target: landing page
total_score: 21
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 2
timestamp: 2026-09-02T12-46-35Z
slug: src-features-landing-landingpagev2-tsx
closed: true
---
Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score

Maksimum berlaku: 32 (H7 dan H10 n/a untuk permukaan Persuade).

| # | Heuristik | Skor | Temuan kunci |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Badge diskon pada posisi terpilih jatuh ke 1,16:1 — angka yang membuat Anda memilih lenyap saat dipilih. |
| 2 | Match System / Real World | 4 | Kosakata konter, bukan kosakata software. FM-0241, "Modal sparepart", CIMAHI, WhatsApp kelas satu. |
| 3 | User Control & Freedom | 1 | scroll-margin-top 0px di keempat anchor; aturan 90px ditulis pada `.page main`. Ponsel tanpa navigasi. |
| 4 | Consistency & Standards | 2 | Dua CTA paket berlabel identik. radiogroup tanpa roving tabindex. Dua format mata uang. |
| 5 | Error Prevention | 2 | Harga coret (total 12 bulan) di atas tarif bulanan tanpa satuan. Sekilas terbaca diskon 93%. |
| 6 | Recognition Rather Than Recall | 3 | Pilihan termin harus dibawa 502px ke bawah menuju CTA. |
| 7 | Flexibility & Efficiency | n/a | Permukaan Persuade, jalur tunggal linear. |
| 8 | Aesthetic & Minimalist | 3 | Disiplin nyata, tapi 5 sinyal amber bersaing di viewport hero. |
| 9 | Error Recovery | 3 | Tombol WhatsApp mengambang dihapus di bawah 520px. |
| 10 | Help & Documentation | n/a | FAQ + kontak footer proporsional. |
| Total | | 21/32 | 66% — Acceptable |

## Design Specificity Verdict

Terautentikasi. Konsol hero adalah instrumen bench; strip aritmatika dalam tiket (1.250.000 - 830.000 = 420.000) adalah pernyataan posisi produk yang dirender sebagai objek. Elemen paling lemah: bagian produk (chrome browser + screenshot miring + ponsel) — perabot landing-page standar, dan satu-satunya bagian yang rusak.

Pindaian deterministik CLI: 0 temuan — artefak cakupan. Regex TSX-only tidak bisa melihat 81 deklarasi gaya yang semuanya ada di modul CSS. Mode URL gagal (puppeteer absen) tapi tetap exit 0.

Overlay browser: 68 temuan / 49 elemen — 29 ai-color-palette, 20 dark-glow, 4 gpt-thin-border-wide-shadow, 3 clipped-overflow-container, 3 side-tab, 2 all-caps-body, 2 kicker-above-heading, 2 wide-tracking.

Konvergensi: A menduga `.page { overflow: clip }` penyebab anchor rusak; overlay menandai clipped-overflow-container x3; dikonfirmasi manual. A menilai amber jadi garnish; detektor menemukan 20 dark-glow.

Tabrakan diputuskan: A melaporkan badge aktif 1,14:1, B melaporkan nol kegagalan kontras. Diukur ulang: 1,16:1. A benar; sapuan B terbatas pada state default (termin Bulanan tak punya badge).

False positive dibuang B: low-contrast x2 pada pelat Pro (trik gradient-border; permukaan sebenarnya 16,44:1). B memperbaiki instrumennya dua kali.

Lantai mekanis bersih: 0 overflow horizontal di 375/768/1024/1440; 0 target sentuh di bawah 44x44; 6/6 img punya alt + width/height; 105 sumber daya, 0 status >=400.

## Priority Issues

### [P0] CTA bagian produk tersembunyi di balik mockup ponsel
Pil "Buka demo" x 1068-1196; ponsel x 1082-1306 pada z-index 2. 114/128px tertutup; elementFromPoint mengembalikan gambar ponsel. Bab bukti halaman untuk produk tanpa testimoni. Screenshot 565x400 dari 2160x1440 (~26%), tak ada teks UI terbaca.
Fix: pindahkan pil ke kiri-bawah bingkai; longgarkan crop. Perintah: /impeccable layout

### [P1] Tautan nav header tidak bekerja; seksi tanpa offset scroll
Pasti: scroll-margin-top 0px di #workflow/#product/#pricing/#start. Header sticky berakhir di 84px. Klik nav gagal direproduksi 4x oleh dua agen, tapi lewat harness yang sama — perlu satu konfirmasi manual. Halaman 5.344px desktop / 8.819px ponsel; harga di y=3.197 / y=5.655.
Fix: offset ke target; uji ganti overflow:clip jadi overflow-x:clip. Perintah: /impeccable harden

### [P1] FAQ membantah klaim terkuat produk, 200px di atas CTA akhir
faq.connection.a mengatakan cloud-only dan "tidak bisa mencatat transaksi baru" saat offline. PRODUCT.md Positioning + Prinsip 2 mengatakan lokal-dulu adalah jalur utama. Mode lokal tak pernah disebut di landing. Pertanyaan produk, bukan copy. Perintah: /impeccable clarify

### [P2] Keputusan harga tanpa penenteram; badge lenyap saat dipilih
Badge aktif 1,16:1. Harga coret total-12-bulan di atas tarif bulanan tanpa satuan. Tidak ada "tanpa kartu kredit" / "batal kapan saja" / cara bayar di pelat. Prabayar 12 bulan Rp 948.000-1.908.000 diminta tanpa menyebut transfer/QRIS/kartu. Perintah: /impeccable clarify

### [P2] Ponsel tanpa navigasi dan tanpa WhatsApp
375px: .nav display:none tanpa pengganti; .whatsapp display:none di <=520px. Harga di 64% ke bawah dari 8.819px. DESIGN.md sudah punya pola bottom-bar yang tidak dipakai. Perintah: /impeccable adapt

## Persona Red Flags

Jordan: Rp 4,85 jt tanpa penanda CONTOH DATA; format beda dari seluruh halaman; dua tombol paket identik; centang hijau pada biaya tambahan outlet.
Riley: radiogroup tanpa roving tabindex; aria-label pada div tanpa role (heroConsole, ticketStack) sehingga screen reader kehilangan pembingkaian "contoh"; 7 LED, hanya 3 membawa status.
Casey: tanpa navigasi; WhatsApp dihapus di ponsel; tanpa aksi selama 7.100px; consoleSignal disembunyikan di <=520px.

## Minor Observations

- CTA Solo memakai --bg-base; di tema terang lebih gelap dari latar halaman, terbaca nonaktif.
- parseRp(solo.priceLabel) menyaring non-digit dari string tampilan; harga bergantung pada tanda baca label.
- Teks V-01 6.5px terender 2,09px dan 5,53px.
- #owner-proof punya id tanpa penaut — anchor mati.
- Kolom faqHead menyisakan ~380px kosong di 1440.
- Empat ikon pain rail memakai empat warna sinyal untuk empat hal yang semuanya masalah.

## Questions to Consider

1. Kalau demo satu-satunya bukti, kenapa disajikan lewat screenshot 26% di balik tombol tersembunyi? Klaim gerak disampaikan dengan gambar diam.
2. "Cloud, butuh internet" fakta atau regresi?
3. Kenapa meminta prabayar 12 bulan sambil menolak menyebut cara bayar?
4. LED untuk apa? Tiga dari tujuh tanpa status.
