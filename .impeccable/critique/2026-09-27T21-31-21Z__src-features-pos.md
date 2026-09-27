---
target: alur Kasir (ulang)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\Rif\\Documents\\FixMaster\\src\\features\\pos"
timestamp: 2026-09-27T21-31-21Z
slug: src-features-pos
---
# Critique ulang Kasir (src/features/pos) — 26/40 (sebelumnya 20/40)

Method: dual-agent (A: design review · B: detector + browser)

| # | Heuristik | Skor | Masalah utama |
|---|---|---|---|
| 1 | Status sistem | 3 | LCD KEMBALIAN hijau saat lebih bayar diblokir |
| 2 | Dunia nyata | 3 | Jargon "wallet", "baris" |
| 3 | Kendali | 2 | Kosongkan tanpa undo; WA tak bisa dikirim ulang |
| 4 | Konsistensi | 3 | ±15 literal di luar i18n |
| 5 | Cegah salah | 2 | Enter menutup LUNAS; Proses terpotong di 768px |
| 6 | Kenali | 3 | Aturan kembalian dari baris terakhir tak terlihat |
| 7 | Efisiensi | 3 | Tanpa ketik qty |
| 8 | Estetika | 3 | "Uang pas" tiga kali |
| 9 | Pulih error | 2 | Pesan lebih bayar menunjuk baris salah |
| 10 | Bantuan | 2 | Minim |

Spesifisitas tinggi. Detektor CLI exit 0 (2 advisory lama); kontras BERSIH 5 keadaan; target 44px; 7 klik untuk transaksi tunai dengan kembalian.

## Isu prioritas
- [P0] Enter di kolom tender (PosPage.tsx:945) menyimpan lalu autoFocus "Transaksi Baru" (:776) menerima Enter yang sama → LUNAS hilang.
- [P1] Register terpotong di 1366x768 (overflow hidden, CSS:377-379): Proses di luar panel dengan 3 baris tender.
- [P1] Ponsel: harga satuan tertimpa tombol qty (grid CSS:652-657 + tombol 44px global).
- [P2] lcdSub (:532-538) tak memeriksa settle.excess; pesan lebih bayar menunjuk baris salah.
- [P2] Panel selesai & riwayat tipis: tanpa rincian bayar, jam, metode, kasir, total harian, kirim ulang WA; filter cabang tak terlihat.

## Persona
- Kasir keyboard: bug Enter; fokus ke BODY setelah Kosongkan; 15 Tab ke tombol Tunai; tak bisa ketik qty.
- Pengguna pertama: jargon wallet; aturan kembalian tersembunyi.
- Pemilik HP: riwayat tanpa total harian/jam; filter cabang tak terlihat.
- Satu tangan: LCD di luar layar saat membayar; harga/qty bertabrakan.

## Minor
.tileLow --warning; aria-live register terlalu cerewet; toast stok bertahan lintas cabang; nextNo tersembunyi multi-cabang; placeholder cari terpotong di 375.
