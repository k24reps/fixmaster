---
title: Design System — Precision Electronics Bench
aliases: [Design System, Tokens, Visual Identity]
tags: [fixmaster, design-system, frontend]
created: 2026-06-04
---

# 🎨 Design System — "Precision Electronics Bench"

Bagian dari [[00 - FixMaster MOC]].

## Identitas

FixMaster memakai bahasa visual **"Precision Electronics Bench"** — meja kerja teknisi elektronik presisi. Tiga pilar warna:

- **Graphite steel** — permukaan grafit/beton sebagai bidang netral
- **Safety amber** (`#f5a623`) — warna brand, aksen utama & status aktif
- **Diagnostic cyan** (`#3dd9c4`) — aksen diagnostik/informasi

Dua tema: **dark (default)** "Graphite Workshop" dan **light** "Concrete & Paper".

## Token (sumber kebenaran tunggal)

Semua warna/spasi/tipografi tinggal di `src/styles/tokens.css`. Komponen **tidak** pakai warna hardcode — semua lewat `var(--token)`, sehingga dark/light otomatis konsisten.

### Tipografi
- **Sans**: Inter (teks umum)
- **Display**: Space Grotesk (judul, logo)
- **Mono**: JetBrains Mono (angka, ID, kode, readout) ← penanda khas bench

### Motif visual bersama
Yang membuat 9 halaman terasa "satu produk" meski beda metafora:
- Font **mono** untuk semua angka/ID
- **LED status**: ok / live / warn / crit (hijau / cyan / amber / merah)
- **Spine** tepi berwarna pada kartu/baris
- **Divider titik-titik** (dotted/perforasi)
- **Tick-gauge** untuk meter & proporsi
- **Fitur terkunci** (plan-gated): channel redup + badge **LED brand + "PRO" mono** — **bukan ikon gembok** generik. Lihat [[Sidebar - Live Diagnostic Rail]].

> [!tip] Prinsip
> "Bahasa visual bersama, bukan asal beda." Tiap halaman punya alat sendiri, tapi semua memakai token + motif yang sama. Lihat [[Signature Pages]].

## Maskot: "Volt" (17 Jul 2026)

Robot bengkel mungil yang **seluruh anatominya lahir dari idiom bench** (bukan clipart):
kepala = pelat instrumen amber + sekrup sudut + knob dial; wajah = **layar readout gelap**
dengan mata LED teal menyala (berkedip, SMIL); antena = status LED berdenyut (idiom
`.ledLive`); dada = layar mini berisi **bolt brand** (kontinuitas logo lama); senyum arc
amber; dagu tick-gauge; lengan kanan melambai. Warna = konstanta brand (#f5a623/#3dd9c4/
#0b0d11), identik di dua tema — layar wajah memang gelap seperti LCD asli.

- **Komponen**: `Mascot` di `src/components/ui/Mascot.tsx` — props `variant` (`face` |
  `full`), `size`, `animated` (SMIL kedip/denyut/lambai). Ekspor via barrel `ui`.
- **Penempatan**: landing hero (full, di atas panel DIAGNOSTIK) + CTA bar (face);
  dashboard strip BENCH CONSOLE (face 26px); `public/logo.svg` + `favicon.svg` +
  `icon-maskable.svg` = badge wajah Volt (shell gradien rounded-square dipertahankan
  agar tiap spot logo 40px tetap terbaca sebagai merek).
- **Kenapa**: perbandingan vs FixMate — FixMaster unggul craft tapi terasa dingin;
  maskot menambah kehangatan TANPA meninggalkan identitas (aturan: elemen visual baru
  wajib otentik bench, bukan pola SaaS generik).

## Terkait
- [[Iconography]] — set ikon Phosphor
- [[Sidebar - Live Diagnostic Rail]] — penerapan token pada navigasi
- [[Signature Pages]] — penerapan per halaman

#design-system #frontend
