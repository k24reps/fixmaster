---
target: landing page
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/fixmaster/src/features/landing/LandingPage.tsx"
target_fingerprint: "sha256:7f871150b93eab1e1cb4943cd684a395094ccbe58ec2f4c3fea37ede32895941"
target_path: /home/user/fixmaster/src/features/landing/LandingPage.tsx
timestamp: 2026-11-16T02-29-55Z
slug: src-features-landing-landingpage-tsx
---
Method: dual-agent (A: sub-agen review desain · B: sub-agen detektor + browser)

# Critique: landing page publik

Target `src/features/landing/LandingPage.tsx` (+ `BenchScene.tsx`, `DemoGate.tsx`), live di `/landing-preview`, 320–1920px, dua tema. Mode: Persuade. Disertai audit teknis 15/20 (Good) pada sesi yang sama.

## Skor kesehatan desain

| # | Heuristik | Skor | Isu kunci |
|---|---|---|---|
| 1 | Visibilitas status sistem | 3 | Di 1280×720 adegan diam di langkah 0 (32% terlihat < ambang 0,35, `BenchScene.tsx:181`) |
| 2 | Cocok dengan dunia nyata | 3 | Layar pertama ponsel tidak menyebut HP/laptop/elektronik |
| 3 | Kontrol & kebebasan | 3 | Tidak ada jalan ke demo tanpa nomor WA; bar ponsel melompat ±8.800px |
| 4 | Konsistensi | 3 | Dua gerbang bisa saling bertentangan; silkscreen bocor ke luar mockup |
| 5 | Pencegahan error | 3 | `maxLength` 80 padahal batas aturan 60 (`DemoGate.tsx:176`) |
| 6 | Kenali, bukan ingat | 3 | Nav anchor hilang di ≤1080px |
| 7 | Fleksibilitas | 3 | Pengunjung kembali langsung dapat tombol buka |
| 8 | Estetika minimalis | 2 | 11.535px di 390 (±13,7 layar); cerita keyboard tiga kali |
| 9 | Pemulihan error | 3 | Error submit pertama tidak terdengar oleh pembaca layar |
| 10 | Bantuan | 3 | FAQ belum menjawab "apakah saya akan dihubungi?" |
| **Total** | | **29/40** | **Good (73%)** |

## Vonis spesifisitas desain: Parsial

LLM: separuh atas (BenchScene, gauge harga, meter tahap, lemari laci) milik FixMaster; separuh bawah (papan Konvensional vs FixMaster, grid 12 modul `LandingPage.tsx:464-482`, FAQ akordeon) bisa dipindah ke produk mana pun. Layar pertama 1280×720 dan ponsel jatuh ke "headline kiri + form lead". Kepatuhan sistem baik: One Amber (amber terpisah 963px di 1440), satu sumur, spine dan seam konsisten.

Deterministik: `impeccable detect` exit 0, 10 temuan (7 font-size, 3 radius), semua advisory atau positif palsu (ikon Phosphor di BenchScene.module.css:174, LandingPage.module.css:643, :711; bezel ponsel 40/31px disengaja; clamp() marketing diizinkan). Tidy-up: batas bawah clamp 2.2rem/1.75rem sebagai literal. Overlay headless: 1 temuan `codex-grid-background` (body::before, Ambient Bench Rule, disengaja). Tidak ada overlay yang terlihat pengguna.

## Kesan keseluruhan
Ide inti (meja → ponsel pemilik) milik FixMaster dan dikerjakan rapi, tapi tidak sampai ke pengunjung ponsel dari WhatsApp: headline abstrak + formulir nomor WA dulu, bukti di bawah. Peluang: pindahkan bukti ke depan, pangkas separuh bawah.

## Yang berhasil
1. BenchScene sebagai bukti: data contoh berlabel, autoplay sekali, reduced-motion langsung ke keadaan akhir; nama 57 karakter dan emoji rapi.
2. Gauge harga layak jadi satu-satunya sumur: instrumen sungguhan, aria-valuetext, aturan harga jujur.
3. Kebenaran produk dan ukuran dasar: tanpa testimoni/klaim offline/"bengkel"; 0 kegagalan kontras, 0 teks <12px, 0 luberan di 9 lebar.

## Isu prioritas
- [P1] Bukti tidak terlihat di layar pertama ponsel dan 1280×720 (adegan di y=887/933 di 390/360; submit di bawah lipatan di 360×740; autoplay tak jalan di 1280×720). Fix: strip sinkron ringkas di ponsel antara headline dan gerbang, gema nama di gerbang, rapatkan hero, ambang ±0,2. Command: layout, adapt.
- [P1] Hero tidak menyebut perangkat maupun harga ("servis" ambigu; harga di y≈8.700 di ponsel). Fix: pertahankan headline pemilik, tambah eyebrow/lead "HP, laptop, printer, TV…" + "50 unit pertama gratis". Command: clarify.
- [P2] Momen nomor WA tanpa penenang (`DemoGate.tsx:257-259`, catatan di bawah tombol, menyiratkan akan dihubungi). Fix: satu baris di samping kolom nomor; kebijakan diputuskan pemilik. Command: clarify.
- [P2] Halaman terlalu panjang dan berulang (cerita keyboard 3x, papan vs 24 sel prosa / 2.796px di ponsel, grid modul mengulang rel tahap; beban kognitif 3/8 gagal). Fix: lebur trails, papan vs 4 baris, hapus grid modul, naikkan harga. Command: distill.
- [P2] Arsitektur ponsel (nav hilang ≤1080px `LandingPage.module.css:1252-1255`; `goToGate` `LandingPage.tsx:281-288` selalu ke gerbang akhir lalu memfokus input). Fix: chip Harga, bar ke gerbang terdekat, fokus setelah gulir. Command: adapt.

## Red flag persona
- Jordan: tidak tahu apa yang terjadi setelah "Buka demo"; petunjuk tombol meja di bawah lipatan 1440; "sinkron" dan legenda zona gratis kriptik.
- Riley: "Ganti nama toko" di gerbang hero mengosongkan storage, gerbang akhir tetap menampilkan nama lama dan membuka /demo yang meminta formulir lagi (`DemoGate.tsx:52`, `DemoApp.tsx:26`).
- Casey: `#root` kosong sampai ±280 KB JS gzip; 13,7 layar; tap bar → gulir 8.800px + keyboard; CLS 0,25 dari header tiket.
- Pemilik konter HP solo dari tautan WA: og-image masih headline lama; harga di 75% halaman; "ditelepon sales?" tak dijawab; "penjualan kasir tidak dihitung" terkubur.

## Catatan kecil
- Silkscreen di luar perangkat: `.wellLabel` (LandingPage.module.css:983-989), "CIMAHI" (:1239).
- Cyan dekoratif: baris unggulan papan vs (:431-453), bus trails (:593); LED sebagai bullet (:935).
- Thumb slider amber berbagi viewport dengan CTA amber (:1067).
- Tile "Kategori Anda" (:726) affordance palsu.
- Label "sinkron" 50px di kolom 48px pada 768.
- modulesTitle/modulesLead sama-sama "Semua menu terbuka".
- Di ponsel CTA "Mulai gratis" sebelum gauge.
- Penutup "Dua kolom, lalu demo terbuka" datar.
- twitter:title "Aplikasi Servis HP" berbeda dari og:title dan berpusat pada HP.

## Pertanyaan untuk dipertimbangkan
1. Kenapa pengunjung ponsel harus menyerahkan nomor WA sebelum melihat adegan bergerak? Bisakah gerbang itu sendiri yang menjadi meja penerimaan?
2. Kalau sepuluh kata pertama hero memuat "HP" dan "Rp 1.000", berapa banyak pemilik konter yang tetap menggulir?
3. Cerita keyboard tampil tiga kali: tanda kita tidak percaya adegannya bekerja?
