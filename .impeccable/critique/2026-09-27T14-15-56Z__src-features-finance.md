---
target: Keuangan
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Rif\\Documents\\FixMaster\\src\\features\\finance"
timestamp: 2026-09-27T14-15-56Z
slug: src-features-finance
---
# Critique Keuangan (src/features/finance) — 19/40

Method: dual-agent (A: design review · B: detector + browser)

| # | Heuristik | Skor | Masalah utama |
|---|---|---|---|
| 1 | Status sistem | 2 | Tanpa total saldo; ringkasan tak ikut filter wallet; wallet org-wide tanpa label saat bercabang |
| 2 | Dunia nyata | 2 | Tanggal diulang tiap baris; subjudul menjanjikan profitabilitas |
| 3 | Kendali | 2 | Hapus permanen; entri mundur langsung terkunci |
| 4 | Konsistensi | 2 | 0 useT; hapus generik vs void spesifik; inputMode Entry tidak ada |
| 5 | Cegah salah | 1 | Tanggal bebas (bulan lalu & masa depan); tanpa cek duplikat; Servis/Penjualan manual dobel |
| 6 | Kenali | 2 | Wallet Entry tanpa saldo; alasan kunci hanya tooltip |
| 7 | Efisiensi | 1 | Tanpa simpan & tambah lagi, cari, filter kategori, pemilih bulan |
| 8 | Estetika | 3 | Pita tenang; baris ponsel 156px |
| 9 | Pulih error | 2 | Pesan spesifik; error cabang tanpa pemilih |
| 10 | Bantuan | 2 | Hint modal/prive bagus; kunci bulan tak dijelaskan |

Spesifisitas ~60%: pita buku kas bench; kartu wallet polos, 3 tile StatCard, tab generik, <select>.
Detektor: CLI exit 0, 1 advisory (clamp :326). Overlay 10–27 semua motif/shell. audit-contrast, mobile, zoom bersih; kontras modal 0 gagal.
Bug bersama: Modal.tsx tidak mengembalikan fokus (opener dicatat setelah autoFocus).

## Isu prioritas
- [P0] Tanggal bebas: record_finance_entry (0071:63-113) tanpa assert_open_month; tanggal tanpa batas (EntryModal.tsx:227-232). Entri Agustus mengubah bulan lalu & terkunci; entri Jan 2027 memotong saldo tanpa tampil. Fix: batas UI + migrasi 0091.
- [P1] Cabang dicek setelah form terisi (EntryModal.tsx:160-162). Fix: kanal cabang di baris pertama.
- [P1] Tanpa permukaan rekonsiliasi (FinancePage.tsx:365-385): total, pergerakan per wallet, bulan lalu. Fix: strip readout wallet + total + pergerakan + pemilih bulan.
- [P1] Aksi uang tak terlindung: duplikat, Servis/Penjualan manual (EntryModal.tsx:40), hapus generik (:733), tanpa busy.
- [P2] Pita ponsel boros & memotong (module.css:348) + input massal (tanpa simpan & tambah lagi, Enter, inputMode).

## Persona
- Pemilik HP malam: tanpa total; 0 baris di layar pertama; filter tak ubah ringkasan; masa depan menguras saldo.
- Admin massal: pilih ulang kategori/wallet tiap baris; duplikat; cabang setelah ketik; keyboard huruf.
- Demo: catat pertama gagal (Semua Outlet); muat bulan sebelumnya diam.

## Minor
Hint kartu wallet hover-only; label ringkasan patah; 9 "Hapus" identik; income servis tanpa Edit tanpa alasan; transfer tanpa catatan; tab tanpa aria-selected; saldo besar terpotong.
