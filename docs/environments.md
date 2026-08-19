# FixMaster — Environments & Alur Rilis Aman

> Panduan menguji fitur/migrasi **tanpa menyentuh data produksi** saat user sudah banyak.
> Audiens: pemilik/teknis. Filosofi: makin berisiko sebuah perubahan, makin perlu lingkungan terpisah.

## Prinsip

- **Aman diubah bebas:** frontend (kode React). Kalau rusak, paling banter UI; rollback Vercel instan.
- **Berisiko saat user banyak:** apa pun yang menyentuh Supabase — **migrasi DB, RLS, Edge Function**. Ini wajib diuji di staging dulu.
- **Lini pertama selalu mode lokal** (IndexedDB) — mayoritas fitur bisa dikembangkan tanpa backend sama sekali.

## Status branch vs produksi (per 17 Agu 2026)

`main` dan `staging` **sengaja berbeda isi**. Jangan asumsikan staging = produksi + sedikit.

| | `main` (= produksi) | `staging` |
|---|---|---|
| Migrasi terakhir | `0042` | `0045` |
| Edge Function | `create-invoice`, `duitku-webhook`, `fersaku-webhook`, `health`, `delete-account` | `gopay-listener`, `health`, `delete-account` |
| Billing | **Duitku** (tidak berubah) | listener GoPay |
| Dashboard operator | tidak ada | `/operator` |
| Perbaikan egress | ✅ sudah | ✅ sudah |

> [!CAUTION]
> **Jangan merge `staging` → `main` tanpa menyelesaikan Fase 5 lebih dulu.** Selama
> `VITE_GOPAY_QRIS_URL` kosong di Vercel Production, invoice jatuh ke `provider: mock` dan pay
> dock menampilkan tombol "Saya sudah bayar" yang bisa diklik pemilik toko untuk memperpanjang
> langganan **tanpa membayar**. Urutan wajibnya ada di
> [`runbook-gopay-cutover.md`](runbook-gopay-cutover.md) Fase 5.

---

## Peta lingkungan

| Lingkungan | Frontend | Backend (Supabase) | Untuk apa |
|---|---|---|---|
| **Lokal** | `npm run dev` | IndexedDB (tanpa cloud) | Pengembangan harian, mayoritas fitur |
| **Preview** | URL preview Vercel (otomatis per branch/PR) | **Supabase staging** | Uji integrasi cloud, demo, review |
| **Production** | `fixmaster.app` (domain kustom, di-alias dari Vercel) | **Supabase produksi** | User asli |

> [!WARNING]
> Secara default, Preview Vercel memakai env var yang sama dengan Production → **menunjuk DB produksi**. Ini berbahaya untuk fitur yang menulis data. Wajib dipisah (lihat di bawah).

## Setup 1 — Project Supabase staging (gratis)

1. Buat project Supabase **kedua**, mis. `fixmaster-staging` (free tier cukup).
2. Jalankan **semua** migrasi `supabase/migrations/` (`0001` → terbaru) di SQL Editor staging, urut.
3. Deploy Edge Functions ke staging: `gopay-listener`, `health`, `delete-account`.
4. Isi dengan **data dummy** (jangan salin data user asli — itu PII).
5. Catat **Project URL** + **anon key** staging.

## Setup 2 — Env var Vercel per-environment

Di **Vercel → Settings → Environment Variables**, set nilai berbeda per scope:

| Variabel | Scope **Production** | Scope **Preview** |
|---|---|---|
| `VITE_SUPABASE_URL` | URL project **produksi** | URL project **staging** |
| `VITE_SUPABASE_ANON_KEY` | anon key **produksi** | anon key **staging** |

> Cara: saat menambah variable, centang scope yang sesuai. Satu nama variable bisa punya nilai berbeda untuk Production vs Preview. Setelah diubah, redeploy.

Hasilnya: **semua URL preview otomatis menulis ke DB staging**, produksi aman.

## Setup 3 — Alur branch

```
main      → Production (Vercel prod + Supabase prod)
staging   → integrasi   (Preview + Supabase staging)
fitur/*   → Preview      (otomatis, pakai Supabase staging)
```

Alur kerja:
1. `git checkout -b fitur/x` dari `staging`.
2. Kembangkan (utamakan mode lokal). Push → Vercel buat URL preview otomatis.
3. PR `fitur/x` → `staging`. CI (lint/build/test) wajib hijau.
4. Uji tuntas di preview (pakai DB staging).
5. PR `staging` → `main`. Setelah merge, produksi ter-deploy.

> Branch `staging` dibuat sekali: `git checkout -b staging && git push -u origin staging`.

## Disiplin migrasi DB (paling penting saat user aktif)

Dengan user yang sedang memakai app, **jangan langsung `DROP`/rename kolom** — sesi yang sedang jalan bisa rusak. Pakai pola **expand–contract**:

| Tahap | Aksi | Aman karena |
|---|---|---|
| **Expand** | Tambah kolom/tabel **baru** (nullable / default) | Kode lama tak terpengaruh |
| **Migrate** | Deploy kode yang baca **lama & baru**; backfill data | Transisi tanpa downtime |
| **Contract** | Setelah stabil, hapus yang lama | Tak ada lagi yang memakai |

Aturan:
- Selalu uji urutan migrasi di **staging** dulu.
- Migrasi maju-saja (forward-only), idempotent-friendly (`if not exists`, `create or replace`).
- Untuk perubahan destruktif, pisah jadi beberapa rilis (expand dulu, contract belakangan).

## Feature flags (rollout bertahap)

Untuk fitur besar/berisiko, kirim dalam keadaan bisa dimatikan:
- Sederhana: env var `VITE_FEATURE_X` (build-time), atau
- Per-tenant: kolom boolean di `organizations` (runtime, bisa diaktifkan untuk akun tertentu dulu).

Kalau bermasalah, matikan tanpa rollback deploy.

## Rollback cepat (kalau ada yang lolos ke produksi)

- **Frontend:** Vercel → Deployments → pilih versi sehat → **Promote to Production** (detik, tanpa rebuild).
- **DB:** lihat [`runbook-backup-recovery.md`](runbook-backup-recovery.md) (PITR / backup harian).
- **Edge Function:** redeploy versi sebelumnya dari git.

## Checklist rilis fitur yang menyentuh DB

- [ ] Dikembangkan + diuji di lokal.
- [ ] Migrasi diuji di **staging** (urut, dari nol).
- [ ] Edge Function (bila ada) di-deploy & diuji di staging.
- [ ] CI hijau (lint/build/test) di PR.
- [ ] Diuji di URL preview (DB staging).
- [ ] Migrasi mengikuti expand–contract (tak ada DROP langsung).
- [ ] Merge `staging` → `main`; jalankan migrasi di Supabase **produksi**.
- [ ] Verifikasi pasca-rilis (`/health`, login, 1 alur inti).

## Opsi masa depan (berbayar)

- **Supabase Branching** (tier Pro): otomatis buat DB sementara per branch git — lebih mulus dari staging manual. Belum perlu untuk skala saat ini.
- **Vercel Environments** lanjutan + protection rules untuk gating rilis.

---

_Terkait: [`README.md`](../README.md) · [`runbook-backup-recovery.md`](runbook-backup-recovery.md) · `docs/obsidian-vault/Tech Stack.md`_
