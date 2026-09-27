---
target: Dashboard
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Rif\\Documents\\FixMaster\\src\\features\\dashboard"
timestamp: 2026-09-27T11-52-28Z
slug: src-features-dashboard
---
# Critique Dashboard (src/features/dashboard) — 22/40

Method: dual-agent (A: design review · B: detector + browser)

| # | Heuristik | Skor | Masalah utama |
|---|---|---|---|
| 1 | Status sistem | 3 | Kesegaran data & fault bagus; cabang yang dilihat tak disebut |
| 2 | Dunia nyata | 2 | Subjudul "hari ini" (id.ts:61) padahal semua bulan ini; "Margin 79,1%" = arus kas/pemasukan |
| 3 | Kendali | 2 | Tanpa pilihan periode |
| 4 | Konsistensi | 2 | Belum selesai 3 vs badge 4 vs Dalam proses 2; saldo tak ikut cabang |
| 5 | Cegah salah | 3 | Angka disembunyikan saat gagal |
| 6 | Kenali | 2 | Tile tak bisa diklik; alert tanpa umur |
| 7 | Efisiensi | 1 | Tanpa aksi cepat / tiket saya / varian peran |
| 8 | Estetika | 2 | Jam duplikat; margin+rasio=100; target 85% kosong |
| 9 | Pulih error | 3 | Fault plate + retry, data lama ditandai |
| 10 | Bantuan | 2 | "arus kas, bukan laba" hanya di komentar kode |

Spesifisitas: separuh atas bench (konsol, LCD, seam); separuh bawah generik (tile ikon-dalam-kotak DashboardPage.tsx:461-479, alert ikon pastel css:563-585).
Detektor: CLI exit 0, 6 advisory font-size/radius. Overlay 14–21, mayoritas motif disengaja; nyata di luar dashboard: badge bottom nav 4,3:1. audit-contrast memindai dashboard sebelum demo boot (light: 1 elemen diperiksa) — celah gerbang; pindai ulang benar: 0 gagal.

## Isu prioritas
- [P1] Menjawab bulan ini, bukan hari ini. Fix: readout HARI INI (masuk/selesai/kas) di konsol, sakelar Hari ini|Bulan ini, subjudul.
- [P1] Margin 79,1% menyesatkan (DashboardPage.tsx:171, 256-263); rasio biaya = 100−margin. Fix: margin servis sungguhan atau label "Sisa kas" + keterangan.
- [P1] Tak peduli peran: karyawan dapat layout pemilik minus uang; leaderboard Rp rekan (:404). Fix: varian karyawan (antrean saya, tugas hari ini, absen); Rp hanya manager.
- [P2] Angka buntu & tak konsisten; cakupan cabang tak terlihat; saldo tak ikut cabang; target org vs cabang. Fix: satu definisi, tile = tautan, readout CABANG, saldo/target per cabang.
- [P2] Bench tertinggal + target tanpa laju: tile → strip readout, alert LED+umur, gauge dengan penanda laju (Target() :438).

## Persona
- Pemilik HP: tak ada angka hari ini/cabang/umur alert; kartu uang di carousel samping; 3,3 layar.
- Karyawan: tak ada miliknya; tanpa Servis Baru; melihat Rp rekan.
- Demo: BENCH CONSOLE+jam dulu; target 13% = gagal; margin 79% tak meyakinkan.

## Minor
Tanpa h1; h3 16px; Lihat semua = Button; Servis Baru kosong → daftar; --danger/--success sebagai teks; "Teknisi hadir" semua staf; urutan Servis Terbaru acak, nama terpotong; 21 Tab ke konten.
