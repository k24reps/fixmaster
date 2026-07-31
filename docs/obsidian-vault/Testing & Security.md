---
title: Testing & Security
aliases: [Testing, QA, Security, RLS Testing, Audit]
tags: [fixmaster, testing, security, rls, audit]
created: 2026-06-10
---

# 🧪 Testing & Security

Bagian dari [[00 - FixMaster MOC]]. Catatan ini = **memori persisten** untuk pekerjaan audit/testing keamanan, supaya lintas-sesi tak perlu menjelaskan ulang lingkungan & keputusan.

## Lingkungan testing (FAKTA — jangan tanya ulang)

- **Staging Supabase**: `https://fpwwswngqpftaixdlozo.supabase.co` (project `fixmaster-staging`, org `rifan6juli-svg`, plan FREE). **Terpisah dari produksi** — aman untuk test yang membuat/menghapus user & org. Per 13 Jun 2026 **disinkronkan ke migrasi 0031** (split-settle + cancel-refund-parsial + DP RPC + transfer_wallet).
- **Produksi Supabase**: project `FixMaster` (`vmitplpvncfvyimgyxrn`, region Singapore). **BERISI DATA & TRANSAKSI ASLI** (sudah ada tes order Fersaku). Per **22 Jun 2026 disinkronkan ke migrasi `0036`** (`0031` transfer_wallet/refund parsial, `0032` org_settings, `0033` satu-toko-per-email, `0034` PO→Keuangan, `0035` tracking kontak+garansi, `0036` admin outlet-scope — semua via `db push`, tracker sinkron). **`0036` di-apply 22 Jun setelah gerbang keamanan terpenuhi**: admin toko testing sudah di-set outlet; toko pilot owner-only (tanpa admin/karyawan) → nol risiko lockout. Operasi ke produksi WAJIB konfirmasi user dulu. CLI default tetap ter-link ke **staging** (relink balik setelah tiap push prod).
- **Kredensial app**: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` ada di `.env.local` (gitignored via `*.local`). Var dibaca di [supabase-client.ts](src/data/supabase-client.ts) (`import.meta.env.VITE_SUPABASE_*`).
- **Kredensial test**: ditaruh di **`.env.test.local`** (root repo, auto-ignored oleh `*.local`). Berisi `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Edge functions ter-deploy di staging**: `create-invoice`, `delete-account`, `fersaku-webhook`, `health` (4 fungsi). Jadi Tier 2 bisa diuji langsung di staging.
- **Tooling lokal**: Node v24 ✅, Supabase CLI 2.101.0 ✅, **Docker ❌ (tidak terpasang)**. Maka `supabase start` (DB lokal) tidak dipakai — kita pakai **staging cloud**.

> [!CAUTION]
> `service_role` key mem-bypass SELURUH RLS. **JANGAN PERNAH** beri prefix `VITE_` (Vite meng-inline var `VITE_` ke bundle browser → kunci admin bocor). Hanya untuk runner test di Node (`process.env`), tak pernah ke klien. Ambil di: Dashboard → Project Settings → API → Project API keys → `service_role`.

## Keputusan testing (sudah disepakati user)

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Lingkungan DB | **Staging cloud** (bukan Docker) | Staging sudah ada; paritas asli; Docker belum terpasang. Trade-off: data test menumpuk → butuh cleanup (pakai service_role) |
| Tooling RLS | **vitest + dua client `@supabase/supabase-js`** (bukan pgTAP) | Lewat jalur PostREST + anon key + JWT yang sama dipakai browser → paling representatif; menyatu dgn 280 test vitest |
| Scope fase ini | **(a) Tests-only — temukan dulu, jangan perbaiki** | Kumpulkan SEMUA temuan, klasifikasi by severity, baru putuskan improvement. Test yg sengaja merah = bukti celah |
| Prioritas mulai | **Tier 1** (isolasi tenant & peran) | ROI keamanan tertinggi untuk SaaS multi-tenant |

## Hasil audit awal (read-only, 10 Jun 2026)

Permukaan yang disisir: auth/password, 3 edge function, validasi zod, link WhatsApp, sink XSS.

| # | Temuan | Lokasi | Keparahan |
|---|--------|--------|:---------:|
| F1 | **Webhook fail-open**: bila `FERSAKU_WEBHOOK_SECRET` kosong, `signatureOk = !secret` → semua request lolos | [fersaku-webhook](supabase/functions/fersaku-webhook/index.ts) (~L66) | 🔴 Tinggi → ✅ **DIPERBAIKI** (fail-closed; perlu deploy) |
| F2 | **Validasi No. HP lemah**: `phone: z.string().trim().min(1)` terima teks/simbol apa pun | [validators.ts](src/lib/validators.ts) | 🟡 Sedang → ✅ **DIPERBAIKI** (digit 8–15, regex pemisah) |
| F3 | **Password tanpa kompleksitas**: hanya `length < 8` | [AuthPage.tsx](src/features/auth/AuthPage.tsx) | 🟡 Sedang → ✅ **DIPERBAIKI** (wajib huruf+angka saat signup) |
| F4 | **Gap struktural**: 280 test menguji cermin klien, bukan penegak server (RLS/RPC) | `supabase/migrations/` | 🔴 Tinggi → **TERBUKTI AMAN** (27/28 lolos) |
| F5 | **Billing bypass**: `apply_payment` di-grant `authenticated` TANPA cek pemanggil → non-owner bisa tandai invoice lunas tanpa bayar | [0009](supabase/migrations/0009_billing.sql) / [0016](supabase/migrations/0016_role_hardening.sql) | 🔴 Tinggi → ✅ **DIPERBAIKI** ([0022](supabase/migrations/0022_apply_payment_guard.sql), applied staging) |

**Sudah AMAN (diverifikasi):**
- Link WhatsApp: `encodeURIComponent` + strip non-digit ([notify.ts](src/lib/business/notify.ts) L19-20) → tak ada injeksi.
- Tidak ada sink XSS (`dangerouslySetInnerHTML`/`innerHTML`/`eval` nihil di `src`).
- `delete-account`: self-only (hapus `user.id` dari JWT sendiri).
- `create-invoice`: JWT + RPC `start_subscription` (manager check) sebelum sentuh Fersaku.
- `fersaku-webhook`: HMAC SHA-256 + `timingSafeEqual` + idempoten + race-safe (selain isu F1).

## Rencana 5-tier (urut prioritas)

1. **Tier 1 — Isolasi tenant & eskalasi peran (RLS)** 🔴: 2 org + 2 user beda peran; uji A tak bisa baca/tulis data B; karyawan tak bisa baca `incomes`/`expenses`, `set_member_role`, `UPDATE plan_type`, hard-delete; RPC ditolak utk org/peran salah; gerbang billing (`plan_expired_at` lampau → tulis terblokir).
2. **Tier 2 — Edge function** 🔴: `create-invoice` tanpa JWT→401; `delete-account` token A tak bisa hapus B; webhook signature salah→no-op + uji F1.
3. **Tier 3 — Anti-drift klien↔server** 🟡: `config/plans.ts` `roleAllows` konsisten dgn matriks RLS.
4. **Tier 4 — E2E Playwright + assertion** 🟢: wizard→servis→POS→keuangan→laporan (menggantikan klik manual). Di atas demo/local-adapter.
5. **Tier 5 — Validasi input & higiene** 🟡: perkuat+uji schema phone (F2), `test:coverage`, `npm audit`.

> [!IMPORTANT]
> Test Tier 1/2 HANYA terhadap **staging**, TIDAK PERNAH produksi (berisiko data & uang asli).

## Hasil testing (11 Jun 2026)

- **Unit (offline)**: 288 lolos (naik dari 280; +8 anti-drift Tier 3). `npm run test`.
- **Integration RLS/RPC (staging)**: 27/28 proteksi lolos. 1 merah = **F5** (apply_payment bypass). `npm run test:integration`.
- **Audit validasi (offline)**: 3 merah = bukti **F2** (phone terima teks/simbol).
- **Tier 4 E2E** (`scripts/e2e-demo-flow.mjs`): 12/12 menu demo render OK, 0 console/page error — fungsional solid.
- **Build + Lint**: bersih.
- **Kesimpulan**: lapisan server SOLID (isolasi tenant, matriks peran, anti-eskalasi, billing gate, restore anti lintas-tenant, track_service tak bocor history internal semua lolos). 2 isu perlu perbaikan: F5 (tinggi), F2 (sedang). F1/F3 dari audit kode menyusul.

Laporan lengkap: `findings_report.md` (artifact).

## Infrastruktur test (reusable)

- [helpers.ts](tests/integration/helpers.ts) — harness dual-client (anon+JWT / service_role), setup 2-tenant + teardown.
- `tests/integration/tier1-rls.*`, `tier2-rpc.*`; `src/config/roleMatrix.drift.test.ts` (Tier 3, suite utama); `tests/audit/validators.audit.test.ts` (Tier 5).
- Config: `vitest.integration.config.ts`; script `npm run test:integration`. Kredensial: `.env.test.local`.
- **Pola seed**: `create_organization` RPC bootstrap owner; admin/karyawan ditambah via service_role; user test prefix `fmtest+<runId>-...@example.com`, dibersihkan di teardown.

## Fase perbaikan (11 Jun 2026) — SELESAI

Setelah find-first, keempat temuan diperbaiki + diverifikasi:

- **F5** — [0022_apply_payment_guard.sql](supabase/migrations/0022_apply_payment_guard.sql): guard `apply_payment` (hanya service_role / owner pemilik invoice). **Applied ke staging** (repair history 0005–0021 dulu, lalu `db push` 0022). Test tier2 jadi regresi 2-arah: non-owner ditolak (invoice tetap `pending`), owner sukses (invoice `paid`).
- **F2** — `customerSchema.phone` diperkuat (digit 8–15 + regex pemisah). Audit test kini hijau.
- **F1** — webhook **fail-closed** saat secret kosong. **Sudah di-deploy & aktif di staging** (`functions deploy fersaku-webhook`; secret ter-set; smoke test unsigned POST → `200 ok` no-op). Untuk produksi: deploy + set secret di project produksi.
- **F3** — password wajib huruf+angka (min 8), **hanya saat signup** (login akun lama tak terkunci).

**Verifikasi**: `npm run test` 288 hijau · `npm run test:integration` **36/36 hijau** · build + lint bersih.

## Penegakan outlet per-cabang — RLS 0028 (12 Jun 2026)

Level 2 (tim per-cabang) diaktifkan di staging. Urutan apply: `0023`–`0026` (Expand) → owner assign outlet karyawan via Pengaturan → Tim → jaring pengaman `0027` → RLS lock `0028` (Contract). **Riwayat migrasi staging kini tersinkron penuh** (`supabase migration list` → kolom Local|Remote|Time terisi `0023`–`0028`). Awalnya skema di-apply via SQL Editor (riwayat tak tercatat); lalu di-rapikan via `supabase db push` — semua migrasi idempotent (NOTICE "already exists, skipping" pada objek yang sudah ada), jadi re-apply aman tanpa hapus data. (Catatan: RLS lock sempat bernomor `0027` saat apply manual pertama, lalu di-rename ke `0028` agar urut dengan jaring pengaman `0027_heal_unassigned_outlets`; isi SQL tak berubah.)

- **Test baru**: [tier3-outlet.integration.test.ts](tests/integration/tier3-outlet.integration.test.ts) (6 test) — membuktikan penegakan **server-side** (bukan filter klien): karyawan yang ditugaskan ke Outlet 1 BISA baca/tulis data Outlet 1 + data bersama (`outlet_id null`), tetapi **TIDAK** bisa baca Outlet 2 maupun INSERT service ber-stempel Outlet 2 (ditolak `with check`); manager (owner) lihat **semua** cabang (Model A). Self-contained: bikin org + 2 outlet + karyawan, lalu teardown.
- **Test baru (0029/0030/0031)**: [tier3b-settle-cancel.integration.test.ts](tests/integration/tier3b-settle-cancel.integration.test.ts) (10 test) — membuktikan kasir **karyawan** bisa menyelesaikan billing lewat RPC di bawah `0028`: `settle_service` **split 2 wallet** (lunas + 2 income ber-nomor + wallet dikredit), **ditolak** untuk outlet di luar penugasan, `cancel_service` **refund DP parsial** (income DP dipertahankan + expense refund tercatat + wallet −refund saja + status batal) & **refund 0** (tak ada expense, wallet utuh), dan `record_down_payment` (income DP + kredit wallet + akumulasi DP; ditolak untuk outlet lain). Plus **`transfer_wallet`** (0031): owner pindah saldo (delta-based), ditolak bila saldo kurang / wallet sama / **non-manager**. Membuktikan rekonsiliasi split-payment × RLS + DP + transfer bekerja end-to-end.
- **Test baru (0033)**: [tier3c-one-shop-per-email.integration.test.ts](tests/integration/tier3c-one-shop-per-email.integration.test.ts) (4 test) — membuktikan RPC `create_invite` menegakkan **satu email = satu toko**: menolak email yang sudah jadi **anggota aktif** di org lain & email dengan **undangan tertunda** di org lain; **mengizinkan** email baru lalu **memblokir** email sama di org kedua; **mengizinkan** re-invite (ubah peran) di toko sendiri; menolak **non-manager** (karyawan). Memakai harness `setupTenants` (orgA+orgB).
- **Helper**: `createUser`/`signIn` di [helpers.ts](tests/integration/helpers.ts) di-export agar reusable lintas file test.
- **Hasil**: `npm run test:integration` **56/56 hijau** (36 lama + 6 Tier 3 + 10 Tier 3B + 4 Tier 3C) — tidak ada regresi, tidak ada lockout, penguncian cabang + billing kasir (POS/lunas/batal/DP) + refund parsial + transfer wallet + satu-email-satu-toko terbukti bekerja. Unit `npm run test` **346 hijau** (321 + 15 `realtime-timing` + 9 `orgConfig` + 1 `isAwaitingPickup`), lint bersih, build hijau.

> [!NOTE]
> **Model role (revisi 22 Jun 2026, migrasi `0036`).** Owner = akses semua cabang (`is_org_owner`). **Admin kini di-scope per-cabang** (`auth_outlet_ids` + record org-wide), seperti karyawan untuk **cakupan data** — namun **kewenangan** manager-level (delete, settle, kelola tim, tulis keuangan) tetap via `is_org_manager`. Keuangan baca: owner semua / admin per-cabang / karyawan nol. UI Tim: pemilih outlet untuk semua role non-owner; badge "Semua cabang" hanya untuk owner.
> _Model A lama (admin = manager menembus semua cabang, outlet hanya untuk karyawan) **usang** sejak `0036`._ **Gate**: `0036` belum di-apply cloud — owner WAJIB tetapkan outlet tiap admin sebelum apply, lalu `npm run test:integration` staging + konfirmasi sebelum produksi.

## Status

- `[x]` Audit awal read-only (F1–F4 + bagian aman).
- `[x]` Setup runner vitest dual-client + `.env.test.local`.
- `[x]` Tier 1 (isolasi tenant & peran) — 13 test, semua lolos.
- `[x]` Tier 2 (RPC/billing/restore/track) + 2b (edge auth) + Tier 4 E2E + Tier 3 + Tier 5.
- `[x]` **Perbaikan F5/F2/F1/F3 — SELESAI & terverifikasi** (36/36 integration hijau).
- `[ ]` Deploy edge function `fersaku-webhook` agar F1 aktif (aksi user/devops).
- `[ ]` (Opsional) F3 lebih ketat via Supabase Auth password policy.

## Terkait
- [[Data Layer]] (model peran 3-lapis, RLS, migrations 0016/0017) · [[Decisions & Bug Fixes]] · [[Conventions]]

#testing #security #rls

## Tier 3D — anggota hantu (0042)

`tests/integration/tier3d-ghost-member.integration.test.ts` menjaga aturan **anggota ter-soft-delete tidak punya akses apa pun**. Tiga tes: (1) akses dicabut begitu `deleted_at` terisi — memakai baris pelanggan nyata milik org, bukan tabel kosong yang bisa lolos palsu; (2) `claim_invite` membersihkan `deleted_at` dan mengadopsi peran dari undangan saat rejoin, bukan meninggalkan hantu baru; (3) anggota yang **masih aktif** tak bisa diturunkan perannya lewat klaim (guard lockout owner terakhir). Tes ini terbukti **mereproduksi bug**: sebelum 0042 di-apply, 2 dari 3 gagal di staging.

### Skrip deploy tak boleh meng-echo password (31 Jul 2026)

`deploy-migrations.bat` dulu memakai `set /p` untuk meminta password DB — dan `set /p` **menampilkan ketikan apa adanya**. Insiden nyata: password DB **produksi** tampil di layar, ikut ter-screenshot, lalu terkirim ke percakapan; password harus dirotasi. Kini pakai helper `:askpw` yang membungkus `Read-Host -AsSecureString` (PowerShell) sehingga ketikan tertutup. Aturan umum: input rahasia di skrip mana pun tidak boleh muncul di stdout — layar terminal itu permukaan yang bocor (screenshot, screen-share, scrollback).
