---
target: alur Kasir
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Rif\\Documents\\FixMaster\\src\\features\\pos"
timestamp: 2026-09-27T10-23-57Z
slug: src-features-pos
---
# Critique Kasir (src/features/pos) — 20/40

Method: dual-agent (A: design review · B: detector + browser)

| # | Heuristik | Skor | Masalah utama |
|---|---|---|---|
| 1 | Status sistem | 3 | LCD live bagus; "Pembayaran pas" 1,5:1 di tema terang; sukses hanya toast |
| 2 | Dunia nyata | 2 | Tidak ada kembalian; lebih bayar = error |
| 3 | Kendali | 2 | Kosongkan tanpa konfirmasi/undo; keranjang hilang saat pindah menu |
| 4 | Konsistensi | 2 | 0 useT (~60 literal); glyph × − + bukan Icon |
| 5 | Cegah salah | 1 | Syarat cabang dicek setelah bayar diisi; keranjang lintas cabang |
| 6 | Kenali | 2 | Total/sisa/kembalian dihitung di kepala |
| 7 | Efisiensi | 1 | Tanpa autofocus, Enter-add, pencarian SKU/barcode |
| 8 | Estetika | 3 | Register kuat; toggle Rp/% melar; ikon CTA menumpuk |
| 9 | Pulih error | 1 | "Stok … berubah" palsu; barang habis = "tidak ada yang cocok"; "(sidebar)" di HP |
| 10 | Bantuan | 2 | Batas diskon dijelaskan; CTA mati tanpa alasan |

Spesifisitas: ~60% khas (kepala register LCD); katalog grid generik; tender = tumpukan form.
Detektor: CLI 2 advisory (radius 1px :110, font-size .lcd :327), exit 0. Overlay 14–18: mayoritas motif LED/LCD disengaja; nyata: low-contrast paymentStatus light 1,5:1. audit-contrast & audit-mobile hanya memindai keranjang kosong.

## Isu prioritas
- [P0] Buntu cabang + keranjang lintas cabang (PosPage.tsx:249-252, :285-286). Fix: chip CABANG di register, pilih cabang sebelum katalog, rapikan keranjang saat ganti cabang, pesan jujur.
- [P1] Tidak ada kembalian; bayar harus pas; isi otomatis hanya bila 1 wallet (:228, :620). Fix: pad tender (ketuk wallet = sisa), KEMBALIAN di LCD.
- [P1] Kontras status bayar/diskon tema terang (css :566, :604, :656, :660) raw --green-400/--amber-400. Fix: --success-text/--warning-text + LED; audit-contrast isi keranjang.
- [P1] Akhir transaksi lemah: reset instan (:358), struk hanya di tab lain, toast menutupi CTA. Fix: status LUNAS + Cetak/WA + Transaksi Baru (Enter).
- [P2] Ponsel sesak (nama 50px, harga 3 baris di bawah tombol −, keyboard huruf untuk uang, dock di bawah header) + keyboard/barcode (SKU tak dicari :162, Enter tak menambah, 11 Tab ke keranjang).

## Persona
- Kasir keyboard: tanpa autofocus/SKU/pintasan bayar, saran pelanggan tak bisa panah.
- Pengguna pertama: transaksi demo pertama diblokir aturan cabang; struk tak muncul.
- Pemilik di HP: tak bisa jual di Semua Outlet; riwayat tanpa jam/metode/kasir.
- Satu tangan: keyboard huruf, register 944px, dock tak ke tombol bayar.

## Minor
Tombol void ambigu (Batal vs Batalkan Transaksi); barang habis hilang; toast ganda; input wallet tanpa label; Rp/% tanpa aria-pressed; INV LCD ≠ tersimpan di mode Semua; harga kartu desktop pecah baris; Kosongkan 56x13.

## Pertanyaan
Pad tender tunggal? Kasir di mode Semua Outlet? Struk di tab lain?
