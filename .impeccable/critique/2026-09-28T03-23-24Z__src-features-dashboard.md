---
target: Dashboard (ulang)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\Rif\\Documents\\FixMaster\\src\\features\\dashboard"
timestamp: 2026-09-28T03-23-24Z
slug: src-features-dashboard
---
# Critique ulang Dashboard — 27/40 (awal 22/40)

Method: dual-agent (A: design review · B: detector + browser)

Semua angka cocok lintas halaman (Servis, Keuangan, Inventori, Laporan), juga setelah data diubah dan per cabang.
CLI exit 0, 3 advisory (positif palsu). Kontras BERSIH; mobile & zoom bersih.

## Bug
- [P1] Tugas Internal menggandakan instance di demo (TasksPage.tsx:51-77) → badge Tugas 2 → 6.
- [P2] Sel strip/meja menaut ke daftar yang tak cocok (Tiket saya 3 → 7; Unit masuk/Dalam proses → daftar tanpa filter).
- [P2] Hero stat terpotong di 320px (heroAside 1fr 1fr, css:894-899).
- [P2] role=listitem pada Link menghapus peran link (DashboardPage.tsx:615); radiogroup periode tanpa panah.
- [P2] Target bulanan tak bisa diubah setelah onboarding.
- [P3] Rp 0 tampil SURPLUS; Hadir ambigu; umur pickup salah bila completedAt kosong; baris Servis Terbaru ponsel berantakan; periode tak diingat.

## Pertanyaan
- Admin melihat Laba servis padahal Laporan owner-only: disengaja?
- Target Servis = unit masuk atau unit selesai?
- Seed demo disebar sebulan?
