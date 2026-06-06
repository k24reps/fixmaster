---
title: Iconography
aliases: [Iconography, Icons, Phosphor]
tags: [fixmaster, design-system, icons]
created: 2026-06-04
---

# 🔣 Iconography

Bagian dari [[00 - FixMaster MOC]].

## Migrasi: Font Awesome → Phosphor

Ikon Font Awesome terasa generik (mirip FixNova). Seluruh app dipindah ke **Phosphor Icons** lewat **satu komponen terpusat** `Icon` (`src/components/ui/Icon.tsx`).

## Mekanisme

- Komponen `Icon` memetakan `name` → komponen Phosphor
- Menormalkan prefix lama `fa-` agar markup lama tetap jalan
- Fallback aman bila nama tak dikenal
- Cukup ubah **satu file registry** untuk ganti set ikon di seluruh app

## Cakupan migrasi

| Hal | Detail |
|---|---|
| Statik | 145 tag di 25 file |
| Dinamis | 6 titik (nav, toggle tema, toast, alert, tab, placeholder) |
| Bobot | +~1.5 KB gzip (tree-shaking aktif) |
| CDN | Font Awesome dihapus dari `index.html` |

Ikon kontak baru (phone, envelope, map-pin) ditambahkan untuk [[Signature Pages#Pelanggan — Contact Registry|Pelanggan]].

Tambahan terbaru: `shield-halved` (ShieldCheck — tombol Klaim Garansi & kartu Garansi; sebelumnya jatuh ke fallback tanda-tanya) dan `sliders` (SlidersHorizontal — tab Operasional Pengaturan). Pelajaran: nama ikon yang belum terdaftar **diam-diam** jadi tanda-tanya, jadi setiap nama baru harus ditambahkan ke registry. (Catatan: `text-height`/TextAa dihapus bersama kartu Tampilan — lihat [[Decisions & Bug Fixes]].)

## Terkait
- [[Design System]] · [[Sidebar - Live Diagnostic Rail]]

#design-system #icons
