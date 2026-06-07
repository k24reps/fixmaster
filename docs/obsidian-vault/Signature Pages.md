---
title: Signature Pages
aliases: [Signature Pages, Halaman Bertanda]
tags: [fixmaster, signature-page, design-system, frontend]
created: 2026-06-04
---

# 📄 Signature Pages

Bagian dari [[00 - FixMaster MOC]].

Sembilan halaman utama + halaman detail, masing-masing dengan metafora "alat" tapi berbagi bahasa visual dari [[Design System]]. Screenshot di bawah adalah **render kode asli** (data demo di-seed, difoto via Playwright) — bukan mockup.

> [!info] Komponen bersama tidak diubah
> `StatCard` (dipakai Dashboard & Servis) sengaja dibiarkan utuh. Untuk Reports/Dashboard dibuat tile lokal agar perubahan tidak merembet tak sengaja. Lihat [[Decisions & Bug Fixes]].

---

## Kasir POS — Register Readout

Panel keranjang jadi **mesin kasir**: layar LCD total bergaya segment-display (digit mono, glow amber, ghost "88.888", scanline, indikator LIVE), badan **struk thermal monospace** dengan garis titik-titik, **perforasi sobek**, footer checkout. Tombol qty mekanis (turun saat ditekan).

![[pos-dark.png]]

## Inventori — Parts Bin

Tabel jadi **grid laci komponen**. Tiap sparepart = bin berlabel kategori, dengan **LED status** (cyan aman / amber menipis / merah habis), angka stok mono besar, dan **fuel-gauge** ber-tick relatif terhadap stok minimum.

![[inv-dark.png]]

## Dashboard — Diagnostic Panel

Panel diagnostik: metric tile mono + level-meter. Membaca KPI dari `computeKpis()` di [[Data Layer]].

![[dash2-dark.png]]

## Pelanggan — Contact Registry

**Grid kartu arsip**: plate inisial, **ID mono** (ID-XXXXXX), baris kontak HP/email/alamat mono, readout aktivitas (jumlah servis + total transaksi), penanda **Pelanggan Setia** (LED cyan).

![[cust-dark.png]]

## Supplier — Vendor Ledger

Tab PO jadi **baris docket** dengan spine status (biru dipesan / amber sebagian / hijau diterima / abu draft), chip PO mono, total tabular, **tombol Terima mekanis**. Tab Supplier jadi kartu vendor + readout pembelian.

![[sup-dark.png]]

## Keuangan — Cashbook Tape

Wallet jadi **meter readout**. Buku kas jadi **pita thermal monospace** dengan spine income/expense (hijau/merah), nominal +/- mono — senada struk POS.

![[fin-dark.png]]

## Laporan — Analyzer Printout

Metric tile mono (spine + LED), break-even jadi **tick gauge**, breakdown kategori + leaderboard jadi **channel analyzer** dengan bar proporsi relatif.

![[rep-dark.png]]

## Tugas — Job Board

Tiap tugas jadi **tiket kerja** dengan spine status (amber pending / merah berkedip telat / hijau selesai), **checkbox mekanis**, due-tag mono. Template jadi baris SOP dengan chip recurrence. Logika di `lib/business/tasks.ts` (`isOverdue`).

![[tsk-dark.png]]

## Absensi — Punch Clock

Kartu jam jadi **readout LCD waktu hidup** (berdetak per detik, scanline, LED status). Kehadiran jadi baris **punch-card**; riwayat jadi **timecard ledger** mono.

![[att-dark.png]]

## Daftar Servis — Repair Job Cards

Halaman `/services`: **tabel padat di desktop**, **kartu kompak di mobile** (responsif). Tiap baris/kartu = job card dengan badge status bertone, nomor servis mono, biaya tabular, dan kolom aksi.

## Detail Servis — Repair Ticket

Halaman `/services/:id`: traveler strip mengikuti status + timestamp asli, BOM sparepart dari data nyata, panel biaya (sisa tagihan & profit), action bar ke modal Edit/Status/WhatsApp.

Fitur tambahan (revisi Fase 4):
- **Toggle "Sudah Diambil"** — menandai barang sudah diambil pelanggan, terpisah dari status pembayaran; indikator status ambil tampil di header.
- **Garansi saat "selesai"** — saat status → `selesai`, StatusModal menampilkan input lama garansi **Jasa** & **Sparepart** (hari), wajib minimal salah satu, prefill default dari Pengaturan + chip preset durasi. Menghasilkan `warrantyServiceUntil` & `warrantyPartsUntil` terpisah (tampil dua baris di header detail).
- **Tombol "Klaim Garansi"** — muncul hanya pada tiket `lunas` yang masih dalam masa garansi → membuka [[Data Layer|tiket klaim tertaut]] gratis lewat `WarrantyClaimModal`, dengan opsi catat kerugian garansi manual.

![[detail-dark.png]]

![[warranty-detail-dark.png]]

![[warranty-modal-loss-dark.png]]

![[status-warranty-dark.png]]

---

## Pengaturan — Operasional

Halaman `/settings` punya enam tab. Tab **Operasional** (revisi lanjutan) mengelompokkan konfigurasi alur kerja:
- **Template Servis** — quick-pick keluhan & kelengkapan (dipindah dari tab Usaha).
- **Garansi** — default lama garansi Jasa & Sparepart (hari) + preset durasi quick-pick yang dipakai StatusModal.
- **Template WhatsApp** — editor per-kunci (Diterima/Selesai/Konfirmasi) dengan daftar variabel `{...}` & reset-ke-default. Override disimpan di `orgConfig`, kosong = fallback ke `DEFAULT_WA_TEMPLATES` via `resolveWaTemplates`.

> Kartu **Tampilan** (pemilih skala Kecil/Normal/Besar) **dihapus**. Ukuran UI kini satu baseline tetap (`html { font-size: 15px }`) yang konsisten di semua device; responsivitas ditangani lewat media query, bukan skala font global. Lihat [[Decisions & Bug Fixes]].

![[settings-operasional-dark.png]]

---

## Pengaturan — Langganan (Billing License Meter)

Tab **Langganan** (`/settings`, owner + cloud-only) memakai metafora **"daya/lisensi bench"** — langganan = daya untuk mengoperasikan workshop. Senada bahasa visual Signature Pages lain (POS Register Readout, Cashbook Tape):

- **License Meter** — kartu status: **LED** fase (ok hijau / warn amber / **crit merah berkedip** `fm-pulse`), nama plan font display, readout sisa hari mono besar, dan **charge-gauge** 24-tick (fill = sisa hari / ~30 hari, warna ikut fase) di atas wash grid blueprint.
- **Pay dock** — invoice pending jadi panel readout (label mono, nominal besar, nama plan) + tombol/link QRIS.
- **Tier modules** — kartu paket ber-**spine** kiri; kartu rekomendasi diberi spine gradient brand + tag mono "DISARANKAN"; harga **mono** tebal.
- **Receipt tape** — riwayat invoice jadi **pita thermal mono** dengan divider titik-titik + spine status (paid hijau / pending amber / void abu) + chip status pill — senada struk POS & Cashbook Keuangan. Tombol Batalkan tetap untuk invoice pending.

Logika tak berubah (subscribe/confirm/cancel + auto-refresh realtime); murni lapisan presentasi pakai token `var(--...)`.

![[billing-dark.png]]

---

## Sign Up / Login — Terminal Akses Bench

Halaman auth (`AuthPage`, cloud-only, sebelum workspace boot) — login / daftar / reset. Dulu kartu glass polos di tengah; kini **split-panel "terminal akses bench"** senada identitas produk:

- **Panel brand (kiri)** — logo + wordmark FixMaster, tagline domain (reparasi gadget/elektronik), dan **diagnostic rail** ber-LED (BENCH ONLINE / DATA TERSINKRON / QRIS SIAP) bergaya mono — gema dari [[Sidebar - Live Diagnostic Rail]]. Wash grid blueprint + radial brand.
- **Panel form (kanan)** — **faceplate bersekrup** di empat sudut, header "Terminal Akses" dengan **power LED** (accent, berkedip `fm-pulse`) + tag mode mono (login/signup/reset), lalu form (email/password/konfirmasi) + tautan.
- **Responsif** — di ≤720px panel brand disembunyikan, form jadi faceplate tunggal dengan wordmark ringkas di atas.

Logika auth tak berubah (Supabase Auth: signIn/signUp/resetPassword). Copy toast signup diperbaiki: tak lagi menyebut "cek email untuk verifikasi" karena email confirmation dimatikan — akun langsung aktif → arahkan ke login. Token `var(--...)` saja.

![[auth-dark.png]]

---

## Terkait
- [[Design System]] · [[Sidebar - Live Diagnostic Rail]] · [[Data Layer]] · [[Decisions & Bug Fixes]]

#signature-page #design-system
