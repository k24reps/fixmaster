---
title: FixMaster — Map of Content
aliases: [FixMaster MOC, Home, Index]
tags: [moc, fixmaster, index]
created: 2026-06-04
---

# 🛠️ FixMaster — Map of Content

> [!abstract] Apa ini
> Knowledge base terkurasi untuk **FixMaster** — aplikasi web manajemen **usaha reparasi gadget & elektronik** (HP, laptop, tablet, dan perangkat elektronik konsumen). Vault ini merangkum sistem desain, halaman-halaman bertanda, navigasi, serta keputusan teknis & perbaikan bug penting dari sesi pengembangan.

> [!important] Domain — baca sebelum mulai
> FixMaster = **reparasi GADGET / ELEKTRONIK**, BUKAN bengkel kendaraan (motor/mobil/otomotif). "Servis" = perbaikan perangkat elektronik. Detail & istilah baku di [[Domain & Scope]]. Jika ragu soal konteks bisnis, baca catatan itu lebih dulu — jangan berasumsi.

## 🧭 Mulai dari sini

- [[Domain & Scope]] — **APA itu FixMaster** (anti salah-konteks) — baca paling awal
- [[Conventions]] — penamaan, struktur folder, perintah build/test/lint
- [[Design System]] — identitas visual "Precision Electronics Bench", token, tipografi
- [[Tech Stack]] — React 19 + Vite + TypeScript + Zustand + TanStack Query
- [[Data Layer]] — pola repository, koleksi, adapter IndexedDB/Supabase
- [[Iconography]] — migrasi Font Awesome → Phosphor lewat satu komponen `Icon`

## 🎛️ Navigasi & Layout

- [[Sidebar - Live Diagnostic Rail]] — sidebar sebagai panel kendali bench yang hidup

## 📄 Halaman Bertanda (Signature Pages)

Tiap halaman punya metafora "alat" sendiri tapi berbagi satu bahasa visual. Lihat [[Signature Pages]] untuk ringkasan, atau langsung:

| Halaman | Konsep | Catatan |
|---|---|---|
| Kasir (POS) | Register Readout | [[Signature Pages#Kasir POS — Register Readout\|↗]] |
| Inventori | Parts Bin / Component Drawer | [[Signature Pages#Inventori — Parts Bin\|↗]] |
| Dashboard | Diagnostic Panel | [[Signature Pages#Dashboard — Diagnostic Panel\|↗]] |
| Pelanggan | Contact Registry | [[Signature Pages#Pelanggan — Contact Registry\|↗]] |
| Supplier | Vendor Ledger / Purchase Docket | [[Signature Pages#Supplier — Vendor Ledger\|↗]] |
| Keuangan | Cashbook Tape | [[Signature Pages#Keuangan — Cashbook Tape\|↗]] |
| Laporan | Analyzer Printout | [[Signature Pages#Laporan — Analyzer Printout\|↗]] |
| Tugas | Job Board / Work Order | [[Signature Pages#Tugas — Job Board\|↗]] |
| Absensi | Punch Clock | [[Signature Pages#Absensi — Punch Clock\|↗]] |
| Detail Servis | Repair Ticket | [[Signature Pages#Detail Servis — Repair Ticket\|↗]] |

## 🧠 Keputusan & Pelajaran

- [[Decisions & Bug Fixes]] — keputusan desain + bug nyata yang ditemukan saat verifikasi

## 📅 Log Sesi

- [[2026-06-04]] — sidebar Live Diagnostic Rail, konsistensi tema, pembuatan vault ini

## 🏷️ Tag utama

#fixmaster #design-system #signature-page #bugfix #decision #frontend

---
> [!note] Sumber kebenaran
> Kode hidup ada di repo FixMaster (`src/`). Vault ini adalah lapisan *pengetahuan* di atasnya — kalau kode berubah signifikan, perbarui catatan yang relevan.
