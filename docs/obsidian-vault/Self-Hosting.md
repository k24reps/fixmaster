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
menghasilkan replika fungsional produksi. Target sesungguhnya: laptop 24 jam (RAM
8 GB) yang **tetap Windows** + WSL2 + Docker Desktop — keputusan pemilik 23 Sep 2026,
batal instal ulang ke Linux. Stack yang sama persis dengan uji di mesin kerja.

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
   **Lalu pasang ulang 7 policy `storage.objects`** (0014 logo + 0051 backup) sebagai
   `supabase_admin` — skrip `pindah-server/pulihkan-storage-policy.sql`. Policy itu
   tinggal di skema `storage`, jadi restore `public` + data bucket TIDAK membawanya.
   Terlewat saat uji 23 Sep: unggah logo gagal *"new row violates row-level security
   policy"*, dan "Backup sekarang"/unduh backup owner ikut tertolak. Cek:
   `select count(*) from pg_policies where schemaname='storage'` → **7**. (Diperiksa:
   tak ada objek lain di luar `public` dari migrasi — tak ada trigger di `auth.users`;
   cron & vault dibuat ulang di langkah 10.)
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
| Policy `storage.objects` | **0 — terlewat**, dipulihkan 24 Sep (7); unggah logo lolos |
| Jumlah baris tiap tabel `public` vs dump | 24/25 persis; `backup_runs` +3 dari uji backup |
| Tabel realtime | 17/17 |
| `org-backups` privat | ✅ |
| Edge function `health` lewat gateway | 200, `"db":"up"` |
| `select run_auto_backup()` → pg_net | 200, `total 3, failed 0`, 3 berkas |

## Uji login pengguna sungguhan (23 Sep 2026)

Frontend diarahkan ke replika **tanpa menyentuh `.env.local`**: berkas
`.env.selfhost.local` (diabaikan git, `*.local`) berisi `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` self-host, dijalankan `npm run dev -- --mode selfhost`
(konfigurasi `fixmaster-selfhost` di `.claude/launch.json`, port 5190). Berkas mode
Vite menimpa `.env.local`. **Verifikasi dulu** bahwa mode termuat — ambil
`/src/data/supabase-client.ts` dari server dev; Vite menyuntikkan `import.meta.env`
ke modulnya — kalau tidak, pengguna login ke produksi tanpa sadar.

Pemilik login dengan akun & password produksinya. Semua lolos, nol error di enam
layanan:

| Jalur | Bukti di log Envoy |
|---|---|
| Login (hash bcrypt ter-restore) | `POST /auth/v1/token` 200 |
| Realtime | indikator `LIVE` |
| `nav_counts` sebagai pengguna login (RLS) | 200, **112 B** |
| Penulisan melewati RLS (`is_org_active`) | `POST /activity_logs` 201 |
| Pencarian pelanggan sisi server | `name.ilike` 881 B / 293 B, `limit=50`; debounce: 6 huruf → 2 permintaan |
| Dedup nomor HP | satu kueri memuat pola **ber-0 dan ber-62** |
| Laporan | `services` + `created_at=gte` + `completed_at`, **tanpa `history`**, 73,9 KB |

Membaca log Envoy: baris akses memuat query string lengkap. Saat mem-parse, decode
URL **sekali** saja — decode ganda mengubah `%08…` di awal nomor HP menjadi karakter
kontrol dan tampak seperti bug aplikasi.

### Ukuran payload terukur dari sesi nyata — sisa egress terbesar

| Tabel | Per tarikan | Dipicu |
|---|---|---|
| `services` (daftar) | **338 KB** | Dashboard, Servis — ditarik ulang semua perangkat tiap ada perubahan (realtime) |
| `task_instances` | **80 KB** | rel sidebar, **setiap halaman**; tumbuh tiap hari (150 tugas lewat tenggat) |
| `customers` | 82 KB | halaman Pelanggan (belum dipaginasi) |
| `incomes` + `expenses` | ±92 KB | Dashboard, rentang bulan ini |

Satu muat Dashboard ≈ 0,5 MB. Perkiraan: 3 perangkat × ±12 muat ulang/jam × 10 jam
≈ 180 MB/hari ≈ **5 GB/bulan** — urutan besarnya sama dengan kuota free tier yang
habis. `task_instances` adalah ongkos keputusan menahan tugas di klien (demi aturan
visibilitas peran); jalan tengahnya menarik hanya `status=pending`.

## Server Windows 24 jam — yang berbeda dari mesin kerja

Uji di mesin kerja membuktikan stack-nya; server 24 jam menambah syarat "tetap hidup
tanpa ditunggui":
- **Docker Desktop:** backend WSL2, *Start Docker Desktop when you sign in*. Semua
  layanan compose sudah `restart: unless-stopped`, jadi ikut hidup begitu Docker
  hidup. Windows harus **login otomatis** setelah restart (Docker Desktop tidak jalan
  sebelum ada sesi pengguna).
- **RAM:** batasi VM WSL lewat `%UserProfile%\.wslconfig` (`[wsl2] memory=5GB`) agar
  Windows sendiri tetap punya ruang di mesin 8 GB. Stack penuh terukur ±1,2 GiB.
- **Daya:** sleep/hibernate *Never* saat dicolok; tutup layar = *Do nothing*.
- **Windows Update:** atur *active hours* dan jadwal restart di luar jam toko;
  restart otomatis aman bila login otomatis + Docker autostart sudah terbukti.
- **Line ending:** jebakan CRLF di atas berlaku sama — set `core.autocrlf=false`
  sebelum clone repo self-host.
- **Uji wajib sebelum dipakai toko:** restart Windows sungguhan, lalu tanpa
  menyentuh apa pun pastikan 11 layanan `healthy` dan edge function `health` 200.

## Memindahkan replika yang sudah terbukti (salinan dingin)

Jangan mengulang restore dari dump di mesin tujuan — jebakan ACL di atas harus
dihindari ulang dan hasilnya perlu diverifikasi ulang. Pindahkan replika yang sudah
lolos verifikasi apa adanya:
1. Catat hitungan baris (`cek-baris.sql`: auth.users, vault terbaca, cron, tabel
   realtime, 25 tabel `public`).
2. `docker compose stop` — Postgres berhenti bersih, data dir konsisten.
3. Ekspor volume bernama **`supabase_db-config`** (`/etc/postgresql-custom`). Ia
   berisi **`pgsodium_root.key`**: tanpa kunci ini rahasia vault (`project_url`,
   `backup_cron_secret`) tak terbaca dan backup otomatis mati diam-diam. Data dir
   ada di bind mount `volumes/db/data`, tapi kunci ini TIDAK.
4. `tar.exe -cf` folder `docker/` utuh (±77 MB, 1.881 berkas: `.env`, override,
   functions, data). Tar Windows menyimpan byte apa adanya — LF tetap LF.
5. Di tujuan: ekstrak ke path pendek di luar OneDrive (`C:\fixmaster-server`),
   `docker compose pull`, pulihkan volume, `up -d --wait`, bandingkan hitungan.

Skrip siap pakai: `fixmaster-backup/pindah-server/pasang-server.ps1` (di luar repo,
karena berdampingan dengan arsip yang memuat rahasia). Arsip itu berisi `.env`,
hash password, dan seluruh data toko — perlakukan seperti dump.

**Hasil di laptop server (24 Sep 2026, ±01:00 WIB):** 11/11 `healthy`, hitungan
baris **29/29 sama persis**, vault terbaca 2, `health` 200 `"db":"up"`. Unduhan image
di koneksi rumah ±15–27 menit per image besar. Putaran pertama `up --wait` gagal:
**storage** belum `healthy` dalam batas waktu (mesin 8 GB, start pertama) — tanpa
galat; menjalankan ulang skrip langsung lolos. Peringatan "volume
supabase_db-config already exists but was not created by Docker Compose" tidak
berbahaya (volume dibuat skrip, bukan Compose; efek sampingnya `down -v` tidak
menghapusnya).

## Akses publik: Cloudflare Tunnel (keputusan 24 Sep 2026)

- **Domain terpisah**, bukan `fixmaster.app`. DNS `fixmaster.app` dikelola Vercel
  (`ns1/ns2.vercel-dns.com`); Tunnel dengan hostname tetap butuh zona di Cloudflare,
  dan zona subdomain/CNAME setup bukan fitur paket gratis. Pemilik memilih domain
  murah terpisah agar `fixmaster.app` tak tersentuh. Cloudflare Registrar tidak
  menjual `.id` — `.my.id` dibeli di registrar Indonesia (verifikasi KTP PANDI),
  nameserver diarahkan ke Cloudflare (paket Free).
  **Domain terpilih: `fixmaster.my.id`** → API di **`api.fixmaster.my.id`**. Sengaja
  bukan nama toko: server ini melayani semua tenant, dan hostname sulit diganti
  (tertanam di build + kunci sesi supabase-js).
- Tunnel dikelola dari dashboard (Zero Trust → Networks → Tunnels), `cloudflared`
  dipasang sebagai **service Windows** — jalan tanpa login, tidak seperti Docker
  Desktop. Public hostname `api.<domain>` → `http://localhost:8000` (Envoy).
- **Gateway membuka lebih dari API.** Envoy juga melayani Studio di `/` (basic
  auth, password 32 karakter), `/pg/` (pg-meta), `/graphql/v1`, `/mcp`. Satu WAF
  custom rule (Block) menutup semuanya dari internet; Studio tetap bisa dibuka di
  server lewat `localhost:8000`:
  ```
  (http.host eq "api.<domain>" and not starts_with(http.request.uri.path, "/rest/v1/")
   and not starts_with(http.request.uri.path, "/auth/v1/")
   and not starts_with(http.request.uri.path, "/realtime/v1/")
   and not starts_with(http.request.uri.path, "/storage/v1/")
   and not starts_with(http.request.uri.path, "/functions/v1/"))
  ```
- `.env` diganti lewat `pindah-server/ubah-domain.ps1`: `SUPABASE_PUBLIC_URL`,
  `API_EXTERNAL_URL` (`…/auth/v1`), `SITE_URL=https://fixmaster.app`,
  `ADDITIONAL_REDIRECT_URLS=https://fixmaster.app/**`. Skrip menulis lewat
  `[IO.File]::WriteAllText` — `Set-Content` PowerShell 5.1 menyelipkan CRLF (lihat
  jebakan CRLF). Vault `project_url` tetap `http://api-gw:8000` (alamat internal).
- Frontend (`VITE_SUPABASE_URL`/`ANON_KEY` di Vercel) baru diganti saat cutover.
- **Terbukti 24 Sep 2026 ±01:51 WIB:** `https://api.fixmaster.my.id/functions/v1/health`
  → `"db":"up"` lewat internet, 11/11 healthy setelah `ubah-domain.ps1`.
- Jebakan UI Cloudflare: kolom **Routes** di daftar tunnel hanya menghitung rute
  privat — rute publik ada di tab **Published application routes** (bukan
  *Hostname routes*). WAF di menu akun adalah **Account-level** (Enterprise); custom
  rule gratis ada di menu **domain** → Security rules.
- **Token tunnel = kredensial.** Siapa pun yang memegangnya bisa menjalankan
  konektor untuk tunnel ini dan menyadap lalu lintas `api.`. Jangan tangkap layar
  perintah `service install`; bila terlanjur, refresh token lalu pasang ulang
  service.
  Terjadi 24 Sep 2026: token tertangkap layar → tunnel dihapus & dibuat ulang
  (tombol refresh token tak ditemukan di UI baru). Jebakannya: rekaman CNAME `api`
  milik tunnel lama **tidak ikut terhapus** — hapus manual di DNS → Records, baru
  rute baru bisa disimpan. Health kembali 200 lewat tunnel baru.

## Cutover produksi (24 Sep 2026 ±02:30 WIB)

- **Cek selisih dulu** (`pindah-server/cek-delta.sql`, `max(updated_at)` per tabel di
  produksi): perubahan terakhir 22 Sep 14:00 UTC, dump 23 Sep 13:01 UTC → tak ada
  selisih. Server = sumber data tunggal sejak saat ini; cloud tak lagi menerima data
  — **jangan kembali ke cloud tanpa menyalin data balik**, walau kuota pulih 7 Okt.
- `ENABLE_EMAIL_AUTOCONFIRM=true` (padanan cloud: konfirmasi email mati). Tanpa ini
  pendaftaran toko baru gagal, karena server belum punya SMTP.
- **Vercel env:** `VITE_SUPABASE_URL=https://api.fixmaster.my.id` + anon key server,
  **Production saja**. Jebakan: satu entri env yang bertarget Preview+Production
  terhapus UTUH oleh `vercel env rm NAME production` — bukan hanya target itu.
  `vercel env add` non-interaktif butuh `--type config --value … --yes`.
  Preview sengaja dibiarkan **tanpa** Supabase → build uji jalan mode lokal/demo, tak
  mungkin menyentuh data toko. (Sebelumnya Preview memakai kunci produksi.)
- `main` di-fast-forward ke `staging` (`4c58b30`, termasuk fix putaran realtime —
  tanpa itu tiap HP membebani server rumah). Bundle live `supabase-client-*.js`
  memuat `api.fixmaster.my.id`, nol rujukan ke `vmitplpvncfvyimgyxrn`.
- Semua pengguna login ulang sekali (URL berganti → kunci sesi supabase-js lain).
- **Jebakan yang lolos saat cutover: CSP.** `vercel.json` membatasi `connect-src` ke
  `*.supabase.co`, jadi login gagal "Gagal terhubung" (`Failed to fetch`) walau
  server, CORS, dan WAF semuanya sehat — dan alamat yang sama terbuka normal di
  address bar (navigasi tidak tunduk `connect-src`). Ditambah
  `https://api.fixmaster.my.id wss://api.fixmaster.my.id`. Uji dari **konteks
  halaman** (`fetch` di konsol origin fixmaster.app), bukan curl/address bar.
  Setelah deploy CSP baru, browser yang sudah pernah membuka URL yang SAMA masih
  memakai header CSP lama dari cache HTTP (isi `index.html` tak berubah → ETag sama).
  URL baru langsung benar (auth → 401 tanpa apikey = tersambung). Pengguna: muat
  ulang paksa (Ctrl+Shift+R) atau tutup-buka tab.
  **Akar sebenarnya (diukur):** Vercel menjawab revalidasi `If-None-Match` dengan
  **304 tanpa header CSP**, jadi browser menahan CSP lama yang tersimpan — per URL
  (`/`, `/services`, `/settings` masing-masing) dan selamanya selama isi `index.html`
  tak berubah (ETag sama). Gejalanya "kadang Failed to fetch, sembuh setelah muat
  ulang paksa". Perbaikan: rute HTML (`/((?!assets/|fonts/)[^.]*)`) diberi
  `Cache-Control: no-store` agar header selalu datang bersama 200, plus satu komentar
  di `index.html` untuk mengganti ETag sekali. Pelajaran umum: **perubahan yang hanya
  menyentuh header `vercel.json` tidak sampai ke browser yang sudah menyimpan halaman.**
- **Terbukti:** pemilik login di `fixmaster.app` lewat server rumah, indikator realtime `LIVE`.

## Backup di luar mesin (24 Sep 2026)

Skrip di repo: `scripts/selfhost/backup/` → dipasang ke `C:\fixmaster-server\backup\`.
- **Isi** tiap arsip `fixmaster-YYYYMMDD-HHmm.7z`: `full.dump` (`--no-owner
  --no-privileges`, memuat `auth.users` + policy storage) + `public.dump` (dengan
  ACL) + folder `volumes/storage`. Format sama dengan dump migrasi — pulihkan dengan
  urutan runbook di atas. Tanpa downtime (pg_dump saat hidup).
- **Isi tabel `service_secrets` (kunci layar unit, 0094) sengaja TIDAK ikut** —
  kedua `pg_dump` memakai `--exclude-table-data=public.service_secrets`, jadi arsip
  Drive tak pernah memuat PIN pelanggan; hasil pulihkan = tabel kosong (skema tetap).
  Perubahan skrip ini harus disalin ulang ke `/opt/fixmaster/backup/` di VPS.
- **Enkripsi** 7-Zip AES-256 `-mhe=on` (daftar isi ikut terenkripsi). Password
  disimpan Windows DPAPI (`simpan-password.ps1` → `backup-pw.dat`, hanya terbuka oleh
  akun itu di mesin itu) — **pemilik wajib mencatat password di tempat lain**; tanpa
  itu arsip tak bisa dibuka di mesin baru.
- **Tujuan** folder Google Drive for desktop (`G:\My Drive\fixmaster-backup`).
  **Jadwal** Task Scheduler 02:00 + 13:00, `StartWhenAvailable` (jadwal terlewat
  jalan saat menyala), sesi interaktif (Docker Desktop, Drive, DPAPI terikat akun).
- **Retensi** 28 terbaru (14 hari) + salinan pertama tiap bulan selama 12 bulan.
- **Pengawasan** `backup-offsite.log` lokal + `STATUS.txt` di Drive (bisa dicek dari HP).
- **Ikut juga** `.env` dan `db-config.tgz` (diambil dari `/etc/postgresql-custom`
  di kontainer db, memuat `pgsodium_root.key`) — permintaan pemilik agar tak perlu
  salin manual tiap `.env` berubah. Konsekuensi: arsip + password bocor = server
  HIDUP ikut terancam (JWT secret bisa memalsukan token), bukan hanya salinan data.
  Karena itu password minimal 16 karakter. Satu arsip kini cukup untuk membangun
  ulang server dari nol.
- **Terpasang di laptop server 24 Sep 2026 08:13 WIB:** `OK fixmaster-20260924-0813.7z
  592 KB`; task `FixMaster Backup Offsite` terdaftar, run berikut 13:00.
- **Jadwal terbukti:** `fixmaster-20260924-1300.7z` dibuat Task Scheduler tanpa
  disentuh (masih format lama — skrip baru disalin sesudahnya). Arsip format baru
  pertama: `fixmaster-20260924-1330.7z` (manual), folder `skrip\` muncul di Drive.
- Jebakan PowerShell 5.1: stdout biner lewat pipa rusak → dump ditulis di dalam
  kontainer lalu `docker cp`. `docker` bisa tak ada di PATH Task Scheduler → path
  lengkap cadangan. Path storage sangat dalam (>260 karakter saat dibongkar di
  folder panjang) → **bongkar di path pendek** (mis. `C:\pulih`).
- **Uji 24 Sep di mesin kerja:** 558 KB; tanpa password tak terbuka; dengan password
  `full.dump` memuat `auth.users`, `public.services`, policy `org_logos_*`;
  `public.dump` 122 entri ACL; retensi menghapus tepat berkas yang seharusnya.

## Pemulihan dari backup (SSD rusak / mesin baru)

Skrip: `scripts/selfhost/backup/pulihkan-dari-backup.ps1` — juga tersalin otomatis ke
`Drive/fixmaster-backup/skrip/` tiap backup, jadi saat bencana cukup **akun Google +
password arsip**. Syarat mesin: Windows + WSL + Docker Desktop + 7-Zip (tanpa Git,
tanpa PostgreSQL, tanpa repo).

Sejak 24 Sep siang arsip membawa folder `docker\` (tanpa data Postgres & storage,
<1 MB: `.env`, override, edge function, konfigurasi Envoy) — konfigurasi persis sama,
tak perlu clone rilis Supabase. Arsip lebih tua (tanpa `docker\`) ditolak skrip.

Urutan skrip (menolak berjalan bila `C:\fixmaster-server\docker`, kontainer
`supabase-db`, atau volume `supabase_db-config` sudah ada):
1. Bongkar ke path pendek (`C:\pulih`); cek `.env` bebas CRLF.
2. Salin `docker\` + `storage\` ke `C:\fixmaster-server\docker`.
3. `compose pull`, lalu volume `supabase_db-config` dibuat (berlabel compose) dan
   diisi `db-config.tgz` **sebelum** start pertama — kalau tidak, Postgres membuat
   `pgsodium_root.key` baru.
4. `compose up --wait` (diulang sekali: storage lambat di start pertama).
5. Bash di DALAM kontainer db (`pg_restore`/`psql` image): pg_cron → auth.users +
   identities → public dengan trik default privileges → storage.buckets +
   **storage.objects** + policy storage → publikasi realtime → vault + cron →
   verifikasi (jumlah baris tiap tabel public vs COPY di dump, auth, objects, policy,
   realtime, vault 2, cron 1, diff hak akses = 0) → `notify pgrst`.
6. Restart rest+functions, uji `functions/health` + `auth/health`.
`finally` menghapus `C:\pulih` (salinan terbongkar tanpa enkripsi) lewat
`rd \?\…` karena path storage bisa >260 karakter.

Setelah pulih: Cloudflare → tunnel → **Add a connector** → `service install`
(domain/rute tetap); pasang ulang backup offsite; semua pengguna login ulang sekali.
Karena `.env` sama, Vercel dan anon key tidak berubah.

**Uji pulih penuh LOLOS (24 Sep 2026).** Mesin kerja dikosongkan dulu: kontainer +
volume `supabase_db-config` replika lama dihapus atas izin pemilik. Hasil: 25/25 tabel
public sama persis, auth 14/14, storage.objects 3, policy 7, realtime 17, vault 2,
cron 1, diff hak akses 0, `auth/health` 200. Bukti di luar skrip: `run_auto_backup()`
di stack hasil pulih → HTTP 200 `total 3, failed 0` (vault + pgsodium lama + pg_net +
functions + storage semuanya jalan). Jebakan yang ditemukan uji: `*> $null` pada
program native = error fatal di PS 5.1 + Stop; `compose pull` butuh folder Docker di
PATH (`docker-credential-desktop`).

**Uji pulih dengan arsip ASLI LOLOS (24 Sep 2026 13:39):** `fixmaster-20260924-1330.7z`
diunduh dari Drive, dibuka dengan password dari **catatan** pemilik (bukan DPAPI) —
membuktikan catatan password benar. 25/25 tabel, auth 14/14, storage.objects 4 (logo
yang diunggah ulang ikut), policy 7, realtime 17, vault 2, cron 1, diff hak akses 0,
`functions/health` + `auth/health` sehat; `C:\pulih` terhapus otomatis. Data terkini:
tiket terakhir NS-0327 (dibuat setelah cutover), perubahan terakhir 09:13 WIB.
**Replika lokal kini di `C:\Users\Rif\Documents\fixmaster-replika\docker`**
(dihentikan) — salinan produksi per 24 Sep 13:30, tempat uji migrasi.

## Pindah ke VPS Linux (27 Sep 2026)

Laptop rumah mati saat pemilik di luar kota: fixmaster.app terbuka, tapi API membalas
Cloudflare **1033** (tunnel tidak tersambung — laptop mati/tidur/tanpa internet, BUKAN
bug aplikasi; aplikasi rusak dengan tunnel hidup = 502). Tak ada yang bisa menyalakan
ulang dari jauh, jadi server dipindah ke VPS: **SumoPod · Tencent Jakarta · Ubuntu 24.04 ·
2 vCPU / 4 GB / 60 GB (Rp 90.000/bln)**. 2 GB ditolak (stack ±1,2 GiB + restore); VPS
Windows ditolak (Docker Desktop/WSL2 butuh virtualisasi bersarang yang umumnya tak ada).

Skrip di `scripts/selfhost/linux/` (padanan skrip Windows, arsipnya saling terbuka):

| Skrip | Isi |
|---|---|
| `siapkan-vps.sh` | WIB, docker.io + compose v2 + 7zip + rclone, `daemon.json`, swap 2 GB, cloudflared (repo resmi), ufw hanya port SSH sesi ini |
| `pulihkan-dari-backup.sh` | port `pulihkan-dari-backup.ps1`; blok `restoreDb` **dibaca dari .ps1** (satu sumber), jadi .ps1 wajib ikut disalin |
| `backup-offsite.sh` | port `backup-offsite.ps1` lewat rclone; isi arsip & retensi sama |
| `pasang-backup.sh` | password (root 600), remote `gdrive` (scope drive, `config_is_local=false` → `rclone authorize "drive"` di laptop ber-browser), cron `0 2,13` |

Jebakan yang sudah ditangani:
- **Docker melompati ufw.** Port publik compose (8000, 5432, 6543) terbuka ke internet di
  VPS. **`daemon.json` `"ip": "127.0.0.1"` TIDAK cukup** — terukur: ia hanya mengikat
  jaringan bawaan, port jaringan milik compose tetap `0.0.0.0` + `[::]`. Yang menutup:
  `docker-compose.vps.yml` (ditulis `pulihkan-dari-backup.sh`, ditambahkan ke
  `COMPOSE_FILE` di `.env`) dengan `ports: !override` → `127.0.0.1:` untuk `api-gw` dan
  `supavisor`. Berkas itu ikut arsip berikutnya; aman bila dipulihkan ke Windows.
- **Izin eksekusi hilang** dari arsip buatan Windows (bind mount Docker Desktop tampil
  777) → `chmod +x` semua `*.sh` di folder compose.
- **CRLF**: Python di Windows menulis `
` saat menyunting berkas teks — satu skrip
  sempat rusak begini. `.gitattributes` kini `*.sh text eol=lf`; sunting via Python
  pakai `newline=''`.
- **Folder Drive terpisah `fixmaster-vps`.** Kalau laptop hidup lagi dan Task Scheduler-nya
  ikut backup, arsip "terbaru" di folder bersama bisa berisi data basi laptop.
- **Tunnel baru, tunnel lama DIHAPUS.** Dua konektor di tunnel yang sama = Cloudflare
  membagi lalu lintas ke dua database berbeda. Hostname `api.fixmaster.my.id`
  dipindah; aturan WAF (per hostname) tetap berlaku; Vercel tak perlu diubah.
- **Diuji 27 Sep** di kontainer Ubuntu 24.04 ber-Docker sendiri (docker.io 29.1, compose
  2.40, 7zip, rclone 1.60, cloudflared dari repo resmi): arsip buatan skrip **Windows**
  dari replika → `pulihkan-dari-backup.sh` lolos (27/27 tabel, auth 14/14, storage 7,
  policy 7, realtime 18, vault 2, cron 1, ACL beda 0, API 200); storage bisa ditulis;
  `backup-offsite.sh` ke tujuan lokal → arsip 712 KB, password salah ditolak; stack
  dihapus bersih lalu dipulihkan dari arsip buatan **Linux** → lolos lagi. Start pertama
  `supabase-meta` sempat unhealthy; percobaan kedua di skrip menanganinya. Yang TIDAK
  teruji di kontainer: `timedatectl`, ufw, swap, `systemctl` (butuh systemd).
- **Dipasang sungguhan 27 Sep (±11:30–12:20 WIB), SERVER PRODUKSI = VPS** `43.157.228.56`
  (user `ubuntu`, sudo). Arsip `fixmaster-20260926-0200.7z` → 27/27 tabel, auth 13,
  storage 10, vault 2, cron 1, ACL beda 0; port 5432/6543/8000 hanya `127.0.0.1`; ufw aktif
  (22); tunnel `fixmaster-vps` → `localhost:8000`; dari internet `functions/health` 200,
  `auth/health` 200 dengan anon key, Studio & `/pg/` 403 (WAF). Pemilik login, data sampai
  26 Sep 02:00 ada. Backup pertama ke Drive `fixmaster-vps` berhasil. Jebakan baru di mesin
  asli (skrip sudah diperbaiki): kunci dpkg `unattended-upgrades` saat boot pertama
  (`DPkg::Lock::Timeout`); `sudo` membuang `SSH_CONNECTION` (port dari `sshd -T`); rclone
  1.60 `config create` tidak meminta izin → `rclone config reconnect gdrive:`; **hapus
  tunnel tidak menghapus CNAME-nya** — record `api` lama dihapus manual di DNS sebelum rute
  baru bisa disimpan.
- Token tunnel yang sempat terlihat di screenshot sudah di-refresh 27 Sep (API sehat
  sesudahnya); Kebijakan Privasi §3 diperbarui ke server Jakarta.
- **Sisa:** salin delta 26 Sep 02:00 → saat laptop mati; matikan stack + jadwal backup
  laptop begitu pemilik pulang.
- **Celah data**: transaksi antara arsip terakhir dan saat laptop mati hanya ada di
  laptop → salin belakangan dengan `cek-delta.sql`. Laptop tidak boleh jadi server lagi
  (matikan stack + `Disable-ScheduledTask 'FixMaster Backup Offsite'`).

## Alur rilis setelah self-host (berlaku sejak 24 Sep 2026)

| Bagian | Tempat | Cara rilis |
|---|---|---|
| Frontend | Vercel `fixmaster.app` | GitHub: `staging` → Preview (**mode demo, tanpa Supabase**), `main` → Production (server rumah) |
| Database (migrasi) | laptop server | `psql` ke server — bukan Supabase CLI. Uji dulu di replika lokal mesin kerja |
| Edge function | laptop server | salin ke `C:\fixmaster-server\docker\volumes\functions\`, `docker compose up -d functions` |
| Konfigurasi server | laptop server | `scripts/selfhost/atur-env.ps1` (jaga LF) |

**Urutan wajib:** migrasi ke server **sebelum** push ke `main` — frontend yang
memanggil RPC yang belum ada = fitur error di produksi. Staging cloud
(`fpwwswngqpftaixdlozo`) restricted sampai 7 Okt; sampai itu replika lokal
(`fixmaster-replika/docker` di mesin kerja, hasil uji pulih arsip asli) jadi tempat uji.
Server (VPS sejak 27 Sep) = `0001`–`0098` (catatan `supabase_migrations` belum mencatat 0080–0098; 0084–0098 diterapkan lewat `docker cp` + `psql -f`/pemasang; 0086 + fungsi `auto-backup` baru dan 0087–0089 dipasang 25 Sep). Email: Resend `noreply@fixmaster.app` — `RESEND_API_KEY` + `SMTP_*` di `.env`, dipasang `scripts/selfhost/email/pasang-email.ps1`.

## Pemantauan server (27 Sep 2026)

Kejadian 26–27 Sep baru ketahuan saat pemilik mencoba membuka aplikasi. Pemantau harus
berada **di luar** VPS (pemantau di VPS ikut mati bersamanya). Pilihan: **UptimeRobot**
paket gratis — cek tiap 5 menit, email + push aplikasi HP, pemberitahuan pulih juga.
Membuat sendiri (Cloudflare Worker / GitHub Actions) ditolak: butuh penyimpanan status
agar tak spam, dan jadwal Actions sering terlambat serta memakan kuota menit.

- Monitor **Keyword**: `https://api.fixmaster.my.id/functions/v1/health`, kata kunci
  `"db":"up"`, alert bila kata kunci **tidak ada**. Satu cek menguji seluruh rantai:
  DNS → Cloudflare → tunnel → Envoy → edge function → Postgres. Tanpa kunci API (jalur
  `/functions/v1/` lolos WAF).
- Arti balasan saat alarm: **1033/530** = tunnel putus (VPS mati / cloudflared berhenti);
  **502** = tunnel hidup tapi stack mati; **200 tanpa `"db":"up"`** = database bermasalah.
- Status: menunggu pemilik mendaftar (akun dibuat pemilik sendiri).

## Belum dikerjakan

- **Tertunda sampai kuota Supabase pulih (7 Okt 2026)** — urutan sebelum menghapus
  proyek cloud; menyimpannya tak berbiaya, menghapusnya tak bisa dibatalkan:
  1. Unduh semua berkas storage dari proyek produksi cloud (`vmitplpvncfvyimgyxrn`) —
     terutama `org-logos` toko lain yang TIDAK ada di dump 23 Sep — dan salin yang
     belum ada ke VPS.
  2. Ambil satu dump terakhir, simpan di Drive sebagai arsip beku.
  3. Alihkan tes integrasi (`.env.test.local` → staging) ke replika lokal, termasuk
     tier3f/tier3g yang belum pernah jalan.
  4. Buang rujukan `supabase.co`: CSP `connect-src` di `vercel.json`, `.env.local`,
     `.env.test.local`, `deploy-migrations.bat`, dokumen lama.
  5. Baru hapus proyek produksi & staging di dashboard Supabase (diklik pemilik).
  Syarat tambahan: VPS sudah 1–2 minggu tenang + satu uji pulih dari arsip
  `fixmaster-vps`.
- **Uji reboot VPS** saat toko sepi: `sudo reboot`, lalu tanpa menyentuh apa pun
  pastikan semua layanan healthy dan `functions/health` 200 (docker & cloudflared
  ter-`enable`, layanan compose `restart: unless-stopped`).
- **Laptop rumah (saat pemilik pulang):** salin delta 26 Sep 02:00 → saat mati ke VPS
  (`cek-delta.sql`), hentikan stack, `Disable-ScheduledTask 'FixMaster Backup Offsite'`.

#self-host #runbook

## Mengganti akun operator

Operator = baris di `platform_admins` (0045), sengaja tanpa jalur dari aplikasi
(tak boleh ada self-promote). Ganti lewat `scripts/selfhost/ganti-operator.sql`: satu
transaksi, operator baru dipasang DULU lalu yang lama dilepas; menolak bila akun baru
belum terdaftar atau email sama. Opsi `-v hapus_akun=ya` menghapus akun login lama —
ditolak bila akun itu anggota toko. Jejak `operator_actions` tetap (menyimpan
`actor_email` teks, `actor_id` tanpa FK). Diuji di replika dengan `rollback`.
Operator awal: `operator@fixmaster.app` (sejak 30 Agu 2026, tanpa keanggotaan toko).
