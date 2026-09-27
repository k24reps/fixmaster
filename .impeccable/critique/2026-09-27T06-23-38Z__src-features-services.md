---
target: alur Servis (daftar, detail, update status)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Rif\\Documents\\FixMaster\\src\\features\\services"
timestamp: 2026-09-27T06-23-38Z
slug: src-features-services
---
Method: dual-agent (A: tinjauan desain · B: detektor + browser)

# Critique UX — alur Servis (tahap 1)

Daftar Servis, Detail Tiket, Update Status, Servis Baru — desktop (1440, zoom 0.8) & ponsel (375), lewat /demo.

## Skor: 24/40 — Acceptable

| # | Heuristik | Skor | Isu kunci |
|---|---|---|---|
| 1 | Visibilitas status | 3 | LED, stempel, tally bagus; traveler mencentang tahap yang tak dilalui |
| 2 | Cocok dunia nyata | 3 | Kosakata konter kuat; tombol tutup "Batal" di sebelah status "Dibatalkan" |
| 3 | Kontrol & kebebasan | 2 | Esc/tap luar menutup form terisi tanpa peringatan; Esc di konfirmasi menutup dua jendela |
| 4 | Konsistensi | 2 | "Batal" ganda arti; emoji/glyph sebagai ikon; teks tanpa useT |
| 5 | Pencegahan error | 3 | Banyak penjaga; Batal (final + uang) tanpa konfirmasi |
| 6 | Kenali bukan ingat | 2 | Status tujuan di dropdown; estimasi tak tampil di modal |
| 7 | Efisiensi | 2 | Sakelar express bagus; tanpa shortcut, baris tak bisa diklik, picker menutup per part |
| 8 | Estetika minimalis | 3 | Detail rapi; daftar ponsel tertimbun 5 KPI + 3 baris filter |
| 9 | Pemulihan error | 2 | Validasi via toast, bukan di field |
| 10 | Bantuan | 2 | Petunjuk inline bagus; "Tertahan" hanya di tooltip |

## Kekhasan
Detail tiket sangat khas (tiket reparasi fisik). Daftar setengah generik (5 StatCard, select bawaan, baris tanpa spine). StatusModal & ServiceModal formulir generik; status tujuan = select bawaan.
Detektor: 2 side-tab (.jobCard::before, .expressRow) = positif palsu (spine 3px disengaja); 24 advisory hampir semua printReceipt.ts (nota cetak, positif palsu). Live: 2 kontras rendah nyata + luberan BOM ponsel.

## Isu prioritas
1. [P0] Buntu cabang saat intake menghapus isian (ServiceModal.tsx:144) — pilih cabang di dalam modal, isian tak hilang. harden + clarify
2. [P1] Batal = tombol "Terapkan" amber tanpa konfirmasi, footer "Batal" = tutup — tombol danger berlabel konsekuensi + ConfirmDialog ringkasan refund/part; label konsekuensi Lunas. clarify + harden
3. [P1] Ponsel: .secondaryBtn disembunyikan ≤760px (ServiceDetailPage.module.css:805) → Edit/Cetak Nota/Tandai Diambil/Klaim/Koreksi Biaya hilang; tiket pertama di bawah bottom nav; bomRow luber 8px (badge terpotong) — menu "Lainnya" bottom sheet, KPI jadi strip, filter sekunder dilipat. adapt
4. [P1] Kontras tema terang: .dp (StatusModal.module.css:119, amber-400 di warning-soft) 1,9:1; "Lunas" di costTotal 3,1:1; audit-contrast tak membuka modal — pakai --warning-text, tambah modal ke audit. audit + polish
5. [P2] StatusModal padat: select status, Biaya Final kosong berplaceholder mirip nilai, estimasi tak tampil, Penanganan di bawah garansi, express ±8 blok — tombol kanal ber-LED, isi dari estimasi, Penanganan ke atas, lipat garansi part & Riwayat. distill + layout

## Persona
Teknisi meja: buntu cabang; default kategori Laptop; tanpa IMEI/PIN/kondisi; tanpa cetak/WA setelah simpan; estimasi diketik ulang. Casey: tiket di bawah lipatan; aksi hilang; link nomor 17px; tap luar menutup form. Alex: tanpa shortcut; 4 langkah ganti status; picker per part. Sam: tanpa focus trap; dialog tanpa aria-labelledby; baris split tanpa label; error hanya toast.

## Minor
Traveler mencentang tahap dilewati (ServiceDetailPage.tsx:575); emoji 💵 & glyph ×/✓; i18n literal; ikon QR palsu; picker banyak amber; istilah campur; impeccable.cmd exit code selalu 0; PRODUCT.md masih "cloud (Supabase)".

## Pertanyaan
1. Kenapa "pelanggan menunggu" sakelar, bukan aksi utama "Serahkan unit"?
2. Apa "stempel" bench untuk momen unit diserahkan & nota diberikan?
3. Kenapa keputusan status masih dropdown bawaan browser?
