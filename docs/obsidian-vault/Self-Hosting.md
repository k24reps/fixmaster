---
title: Self-Hosting
aliases: [Self-host, Migrasi Supabase, Runbook Self-Host]
tags: [fixmaster, infra, self-host, supabase, runbook]
created: 2026-09-23
---

# 🏠 Self-Hosting Supabase untuk FixMaster

Bagian dari [[00 - FixMaster MOC]]. Latar belakang di [[Decisions & Bug Fixes]].

Runbook memindahkan FixMaster dari Supabase cloud ke Supabase **self-host**. Ditulis
dari uji penuh pada 23 Sep 2026 di mesin kerja (Windows + Docker Desktop), yang
menghasilkan replika fungsional produksi. Target sesungguhnya: laptop 24 jam yang
akan dipasang Ubuntu Server / Debian.

> [!important] Kenapa self-host, bukan pindah akun Supabase
> Kuota egress free tier habis (23 Sep 2026) dan seluruh org di-restrict. Pindah ke
> akun free lain melanggar ToS, butuh langkah pertama yang sama (dump), memberi 5 GB
> yang akan habis lagi, dan berisiko memblokir dua akun sekaligus.

## Fakta terukur (bukan perkiraan)

| | |
|---|---|
| Rilis | `self-hosted/v0.8.1` (9 Sep 2026) — **tambat ke tag rilis, jangan HEAD** |
| Postgres | dump 17.6 = image `supabase/postgres:17.6.1.136` |
| Unduhan image | ±1.984 MB terkompresi (11 image) |
| RAM stack penuh, berisi data | **±1.214 MiB** |
| RAM tanpa studio/meta/supavisor | **±668 MiB** |
| Data produksi | 4.386 baris di 25 tabel `public`, 14 akun, 3 org |

## Urutan yang terbukti

1. **Dump dua kali.** Keduanya lewat Session pooler (`aws-1-...:5432`), BUKAN
   Transaction pooler 6543 — `pg_dump` butuh fitur sesi.
   - Dump lengkap `--no-owner --no-privileges -Fc` → cadangan data + sumber `auth`,
     `storage.buckets`, publikasi.
   - Dump `public` saja `-n public --no-owner -Fc` **dengan** hak akses → sumber
     restore `public`. Lihat jebakan ACL di bawah.
2. Ambil `docker/` dari repo resmi (sparse clone), checkout tag rilis.
3. `cp .env.example .env` lalu `sh utils/generate-keys.sh --update-env > /dev/null`
   (skrip ini MENCETAK semua secret — buang keluarannya). Pastikan `ANON_KEY` bukan
   lagi kunci demo bawaan yang diketahui publik.
4. `docker compose pull`, lalu `docker compose up -d --wait`.
5. `create extension pg_cron;` — tersedia & sudah di `shared_preload_libraries`, tapi
   belum aktif.
6. Restore `auth.users` + `auth.identities` (data saja, `--disable-triggers`, sebagai
   `supabase_admin`). **Sebelum** `public`, karena FK `public` → `auth.users`
   divalidasi saat constraint dibuat.
7. Restore `public` dari dump kedua — lihat jebakan ACL.
8. Restore `storage.buckets` (data saja). Pastikan `org-backups` **privat**.
9. `alter publication supabase_realtime add table ...` untuk 17 tabel — tanpa ini
   sinkron antar-perangkat mati.
10. Buat ulang rahasia vault + jadwal + `BACKUP_CRON_SECRET` (lihat bagian backup).
11. Salin `supabase/functions/{auto-backup,delete-account,health}` ke
    `volumes/functions/`, lalu `docker compose up -d --wait functions`.
12. Verifikasi (bagian terakhir).

## Jebakan — masing-masing ditemukan saat uji

### Hak akses hilang, lalu terbuka diam-diam
- `--no-privileges` membuang **semua** GRANT/REVOKE. Restore dump itu apa adanya
  membuka fungsi bagi `PUBLIC` (bawaan Postgres).
- Lebih halus: Supabase memasang **default privileges** yang memberi `anon` EXECUTE
  atas setiap fungsi baru dan hak penuh atas setiap tabel baru. `pg_dump` menulis ACL
  relatif terhadap bawaan **Postgres**, bukan default Supabase — jadi fungsi yang
  dibuat ulang otomatis dapat hak `anon` dan dump tidak mencabutnya.
- **Perbaikannya, dalam satu transaksi:** cabut default privileges milik `postgres`
  di `public` lebih dulu, restore, dan biarkan entri `DEFAULT ACL` dari dump
  (di-restore paling akhir) mengembalikannya. Keluarkan dari daftar restore: entri
  `SCHEMA public`, komentarnya, ACL-nya, dan 3 `DEFAULT ACL` milik `supabase_admin`.
- Bukti paritas: 353 baris ACL produksi vs self-host, **nol beda**.

### Akhir baris CRLF (Windows)
Git for Windows mengeset `core.autocrlf=true` di tingkat **sistem**. CRLF merusak
skrip `.sh` dan — lebih buruk — menyelipkan `\r` tak terlihat ke setiap nilai `.env`,
membuat password/JWT salah tapi tampak benar. Set `core.autocrlf=false` +
`core.eol=lf` **lokal** di repo self-host, hapus `docker/`, checkout ulang. Ukur
dengan menghitung byte (`tr -cd '\r' | wc -c`), jangan `grep $'\r'` — yang terakhir
memberi positif palsu di Git Bash.

### `api-gw` bergantung pada `studio`
Di compose resmi, gateway menunggu Studio `service_healthy`, dan `functions`
menunggu gateway. Perintah "subset" otomatis ikut menyalakan Studio. Membuang Studio
berarti mengubah compose resmi DAN konfigurasi Envoy — tidak sepadan kecuali RAM
benar-benar kurang.

### `VERIFY_JWT` hanya global
`config.toml` cloud mengatur `verify_jwt` **per fungsi**; router self-host
(`volumes/functions/main/index.ts`) hanya punya satu saklar. Aman untuk FixMaster
karena **ketiga** fungsinya `verify_jwt = false` di cloud dan memeriksa sendiri di
dalam. Envoy juga tidak menuntut `apikey` untuk `/functions/v1/`.
(`gopay-listener` hanya folder kosong sisa `0047`.)

### Pemisah `COMPOSE_FILE`
`;` di Windows, `:` di Linux. Set eksplisit `COMPOSE_PATH_SEPARATOR=:` agar `.env`
yang sama bekerja di keduanya.

## Rantai backup otomatis

```
01:00 WIB  pg_cron 'fixmaster-auto-backup'  (0 18 * * *)
  → run_auto_backup()                        (migrasi 0052)
  → vault: project_url, backup_cron_secret
  → net.http_post(project_url || '/functions/v1/auto-backup',
                  header x-cron-secret)
  → edge function cocokkan dengan env BACKUP_CRON_SECRET
  → service role → tulis JSON per org ke bucket org-backups
```

Vault cloud terenkripsi kunci cloud, jadi **tidak di-restore** — dibuat ulang:
- `project_url` = `http://api-gw:8000` (alamat gateway **dilihat dari kontainer db**,
  bukan dari mesin host)
- `backup_cron_secret` = nilai `BACKUP_CRON_SECRET` di `.env`

`BACKUP_CRON_SECRET` diteruskan ke layanan `functions` lewat
`docker-compose.override.yml` — compose resmi tidak disentuh, supaya pembaruan rilis
Supabase tidak menimpanya.

## Jangan di-restore

`auth.sessions`, `auth.refresh_tokens` (URL berganti → supabase-js memakai kunci
penyimpanan lain, sesi lama tak ditemukan; karyawan cukup login ulang, password
tetap), `auth.schema_migrations`, `storage.migrations`, `realtime.messages_*`,
`realtime.subscription`, 7 event trigger, `vault.secrets`. Empat tabel auth yang
hanya ada di cloud (`mfa_recovery_*`, `scim_*`) terbukti 0 baris.

## Verifikasi yang harus lolos

| Pemeriksaan | Hasil uji 23 Sep |
|---|---|
| 11 layanan `healthy` | ✅ |
| `auth.users` / `identities` / punya hash password | 14 / 14 / 14 |
| Paritas ACL (`pg_dump -n public` kedua sisi, baris GRANT/REVOKE) | 353 = 353 |
| Jumlah baris tiap tabel `public` vs dump | 24/25 persis; `backup_runs` +3 dari uji backup |
| Tabel realtime | 17/17 |
| `org-backups` privat | ✅ |
| Edge function `health` lewat gateway | 200, `"db":"up"` |
| `select run_auto_backup()` → pg_net | 200, `total 3, failed 0`, 3 berkas |

## Belum dikerjakan

- Berkas di bucket `org-logos` (logo toko) — tidak ada di dump; Storage API cloud
  sedang restricted.
- Frontend FixMaster belum diarahkan ke self-host (login pengguna sungguhan).
- Akses dari luar: rencananya **Cloudflare Tunnel** tanpa syarat (menembus CGNAT,
  IP dinamis, sekaligus HTTPS).

#self-host #runbook
