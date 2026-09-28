---
target: alur Servis (ulang)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Rif\\Documents\\FixMaster\\src\\features\\services"
timestamp: 2026-09-28T02-25-56Z
slug: src-features-services
---
# Critique ulang Servis — 25/40 (awal 24/40)

Method: dual-agent (A: design review · B: detector + browser)

Uang benar di semua alur (DP, potong stok, split, modal dadakan, refund, koreksi, batal, ekspres).
CLI exit 2: 26 temuan (2 side-tab spine = positif palsu; sisanya advisory, mayoritas printReceipt).
Kontras BERSIH; mobile/zoom bersih kecuali nama panjang di kartu ponsel.

## Bug
- [P1] Tiket batal: tagihan 'Menunggu biaya final' + profit negatif (ServiceDetailPage.tsx:148-155).
- [P1] BOM: 7 anak di grid 6 trek, tombol hapus turun baris (module.css:452).
- [P1] Chip estimasi muncul setelah harga disepakati (StatusModal.tsx:816-824).
- [P2] Hapus baris modal langsung memindahkan kas tanpa konfirmasi (ServiceDetailPage.tsx:396-422).
- [P2] Intake: Cabang dilewati fokus; error di atas jendela tergulir; Enter tak menyimpan; kategori diam-diam Laptop.
- [P2] Ponsel: label tombol utama meluber; nama panjang kartu daftar tak ber-ellipsis.
- [P3] Baris pelunasan tanpa label aksesibel; pengambilan tercatat 'Edit' di log.

## Pertanyaan
- Part ditambah setelah Selesai: biaya final ikut diminta revisi?
- DP yang ditahan saat batal: dihitung pemasukan/laba tiket?
- Part/modal boleh ditambah ke tiket Lunas?
