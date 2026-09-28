---
target: Keuangan (ulang)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\Rif\\Documents\\FixMaster\\src\\features\\finance"
timestamp: 2026-09-28T04-30-27Z
slug: src-features-finance
---
# Critique ulang Keuangan — 27/40 (awal 19/40)

Method: dual-agent (A: design review · B: detector + browser)

Aritmetika benar: 20 titik rekonsiliasi + 9 cek delta wallet cocok; Dashboard & Laporan sepakat.
CLI exit 0, 0 temuan. Kontras halaman BERSIH; mobile & zoom bersih.

## Bug
- [P1] Pemasukan penjualan Kasir bisa dihapus dari Keuangan → penjualan menggantung, stok tak kembali (FinancePage.tsx:539; delete_finance_entry 0071 tanpa penjaga sale_id).
- [P2] Error formulir tema gelap 2,54:1 (Form.module.css .error --danger); nama wallet aktif 4,33:1.
- [P2] Bulan lalu menampilkan saldo sekarang tanpa label; gerak per cabang vs saldo seluruh usaha; tanpa saldo awal.
- [P2] Mencatat dari tampilan bulan lalu: tersimpan ke hari ini tanpa jejak di tampilan.
- [P2] Pengeluaran bisa membuat saldo minus tanpa peringatan (Transfer menolak).
- [P3] Pemasukan jadi tombol utama; Enter menutup batch; label 'Simpan & tambah lagi' terpotong di 375; TransferModal tanpa form; Cabang dilewati fokus.

## Pertanyaan
- Gerak per cabang pada wallet seluruh usaha: apa yang dicocokkan per cabang?
- Saldo awal bulan: hitung di klien atau snapshot server saat kunci bulan?
