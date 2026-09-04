---
target: perbandingan background demo dan production
total_score: 16
max_score: 20
na_heuristics: 3,5,7,9,10
p0_count: 0
p1_count: 1
timestamp: 2026-08-29T04-32-02Z
slug: src-features-demo-demoapp-tsx
---
Method: dual-agent (A: /root/design_review · B: /root/detector_evidence)

## Design Health Score — treatment background demo saat ini

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 4 | Grid tidak mengganggu status/readout. |
| 2 | Match System / Real World | 3 | Flat steel masih cocok, tetapi metafora PCB/bench berkurang. |
| 3 | User Control and Freedom | n/a | Background tidak memengaruhi kontrol. |
| 4 | Consistency and Standards | 2 | Demo menutupi primitive ambient yang tampil di production. |
| 5 | Error Prevention | n/a | Tidak relevan untuk treatment background. |
| 6 | Recognition Rather Than Recall | 3 | Flat lebih tenang, tetapi spatial scaffold dan identitas berkurang. |
| 7 | Flexibility and Efficiency | n/a | Tidak relevan untuk treatment background. |
| 8 | Aesthetic and Minimalist Design | 4 | Bersih, tetapi agak generik. |
| 9 | Error Recovery | n/a | Tidak relevan untuk treatment background. |
| 10 | Help and Documentation | n/a | Tidak relevan untuk treatment background. |
| **Total** | | **16/20** | **Good, tetapi fidelity demo lemah.** |

## Design Specificity Verdict

Production dengan grid tipis lebih authored untuk FixMaster. Grid 30 px bekerja sebagai material
PCB/blueprint, bukan informasi, dan membuat panel terasa dipasang di atas electronics bench. Demo
flat lebih tenang tetapi lebih mudah tertukar dengan dashboard SaaS generik.

Detector menemukan satu advisory `design-system-font-size` di
`src/features/demo/DemoApp.module.css:47` (`1.6rem` di luar type ramp); valid, tetapi tidak terkait
grid. Browser computed-style membuktikan `body::before` tetap menggambar grid, sementara
`.demoRoot` opak `rgb(11, 13, 16)` menutupinya. Overlay tidak tersedia karena surface evaluasi
read-only; tidak ada overlay yang diklaim.

## Overall Impression

Pilih arah production, tetapi pertahankan grid sebagai ambient yang sangat halus. Demo harus
memperlihatkan produk yang benar-benar akan dipakai calon pelanggan; fidelity lebih bernilai
daripada sedikit tambahan visual calm.

## What's Working

- Production: grid memperkuat identitas Precision Electronics Bench dan mengisi ruang kosong tanpa
  mengalahkan instrument well laba.
- Demo: background flat membuat kartu cepat dipindai dan CTA demo tetap jelas.
- Kedua versi memakai token light-theme yang konsisten; masalahnya layering, bukan palet.

## Priority Issues

1. **P1 — Demo tidak identik dengan produk.** Calon pelanggan dapat mengira demo dan aplikasi
   production berasal dari versi berbeda. Gunakan ambient background yang sama.
2. **P2 — Shell opak membatalkan primitive design system.** `.demoRoot { background:
   var(--bg-base) }` menutup `body::before`; buat shell transparan atau gunakan satu primitive
   ambient bersama, bukan menyalin resep grid.
3. **P2 — Perbandingan screenshot tidak setara.** Demo berada di zoom 80%, production 100%; zoom
   membuat demo lebih padat dan memengaruhi persepsi noise lebih kuat daripada grid itu sendiri.

## Persona Red Flags

- **Alex (power user):** lebih terganggu oleh drift demo-production daripada grid tipis; demo 80%
  juga membuat density terlihat tidak representatif.
- **Sam (accessibility):** flat sedikit lebih tenang, tetapi zoom 80% adalah risiko keterbacaan yang
  lebih nyata. Grid aman bila tipis, hanya di belakang panel, dan netral pada forced-colors.

## Minor Observations

- Perilaku ini sudah ada sejak commit awal demo, bukan regresi maskot atau landing terbaru.
- Jangan menaikkan kontras grid light mode. Bila terasa ramai, turunkan sekitar 20–30%, jangan
  menghapus identitasnya.

## Questions to Consider

- Apakah demo harus menjadi replika jujur production, atau sebuah presentasi yang sengaja lebih
  tenang? Untuk produk ini, replika jujur lebih kuat.
- Apakah zoom demo perlu selalu mulai di 100% agar calon pelanggan membandingkan kondisi yang sama?
