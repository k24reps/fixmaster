# FixMaster — Dashboard Manajemen Servis Reparasi

SaaS multi-tenant untuk manajemen bisnis jasa reparasi **gadget & elektronik** (laptop, HP, printer, dll — _bukan_ bengkel kendaraan). Dibangun sebagai kompetitor [FixNova](file:///c:/Users/Administrator/Documents/Fixnova/dashboard/index.html) yang **lebih lengkap, minim bug, dan lebih cantik**.

> **🤖 Untuk AI agent & developer baru:** baca [`AGENTS.md`](AGENTS.md) lebih dulu (aturan domain + cara pakai knowledge base). Memori project terkurasi ada di [`docs/obsidian-vault/`](docs/obsidian-vault/00%20-%20FixMaster%20MOC.md) — buka sebagai vault Obsidian, mulai dari **00 - FixMaster MOC**.

## Tech Stack
- **Vite + React 19 + TypeScript** — komponen kecil, type-safe.
- **Vanilla CSS + CSS Modules** — sistem desain premium, tanpa Tailwind.
- **Repository Pattern** — local-first (IndexedDB) untuk dev, Supabase untuk produksi.
- **Vitest** — 150 unit + integration test.

## Fitur
- Dashboard KPI, target bulanan, notifikasi, leaderboard teknisi
- Manajemen Servis (state machine status, audit trail, deduksi stok tertunda, per-peran)
- Pelanggan (dedup HP, sinkron balik)
- Inventori (status stok, peringatan dependensi)
- Kasir POS (multi-wallet, re-validasi stok, diskon)
- Keuangan (wallet cascade, reverse-cascade saldo)
- **Tugas Internal** (template berulang harian/mingguan/bulanan/tanggal) — fitur baru
- Absensi (check-in/out, shift lintas-tengah-malam)
- Laporan (break-even, breakdown kategori)
- Supplier & Purchase Order + penerimaan barang → stok — modul baru
- Notifikasi WhatsApp + nota cetak + halaman tracking publik (tanpa login)
- Pengaturan ber-tab per-peran + multi-outlet

## Menjalankan Lokal (mode local-first)
```bash
npm install
npm run dev      # http://localhost:5173
```
Tanpa kredensial Supabase, app jalan penuh memakai IndexedDB (offline, instan).

## Skrip
```bash
npm run dev            # dev server
npm run build          # build produksi (tsc + vite)
npm run lint           # eslint
npm run test           # vitest (unit + integration)
npm run test:coverage  # cakupan test
```

## Deploy Produksi (Supabase + Vercel)

### 1. Setup Supabase
1. Buat project di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, jalankan migrasi berurutan dari `supabase/migrations/`:
   - `0001_initial_schema.sql`
   - `0002_rls_policies.sql`
   - `0003_rpc_functions.sql`
3. Di **Project Settings → API**, salin **Project URL** dan **anon public key**.

### 2. Konfigurasi Environment
Salin `.env.example` → `.env.local` dan isi:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```
Saat env terisi, app otomatis memakai Supabase (bukan IndexedDB).

### 3. Deploy ke Vercel
1. Push repo ke GitHub.
2. Import project di [vercel.com](https://vercel.com).
3. Tambahkan environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) di Vercel.
4. Deploy. `vercel.json` sudah mengatur SPA rewrites + caching.

## Arsitektur
Data layer di-abstraksi lewat antarmuka `Repository`. Dua implementasi:
- `LocalAdapter` (IndexedDB) — per-entitas, indeks `orgId`, soft-delete.
- `SupabaseAdapter` (Postgres) — RLS per-peran + RPC atomik.

Logika bisnis murni (`src/lib/business/*`) bebas DOM dan 100% ter-unit-test: state machine servis, alokasi POS, cascade keuangan, recurrence engine tugas, jam absensi.
