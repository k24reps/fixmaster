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
- **Terbukti:** pemilik login di `fixmaster.app` lewat server rumah, indikator realtime `LIVE`.

## Backup di luar mesin (24 Sep 2026)

Skrip di repo: `scripts/selfhost/backup/` → dipasang ke `C:\fixmaster-server\backup\`.
- **Isi** tiap arsip `fixmaster-YYYYMMDD-HHmm.7z`: `full.dump` (`--no-owner
  --no-privileges`, memuat `auth.users` + policy storage) + `public.dump` (dengan
  ACL) + folder `volumes/storage`. Format sama dengan dump migrasi — pulihkan dengan
  urutan runbook di atas. Tanpa downtime (pg_dump saat hidup).
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
- Jebakan PowerShell 5.1: stdout biner lewat pipa rusak → dump ditulis di dalam
  kontainer lalu `docker cp`. `docker` bisa tak ada di PATH Task Scheduler → path
  lengkap cadangan. Path storage sangat dalam (>260 karakter saat dibongkar di
  folder panjang) → **bongkar di path pendek** (mis. `C:\pulih`).
- **Uji 24 Sep di mesin kerja:** 558 KB; tanpa password tak terbuka; dengan password
  `full.dump` memuat `auth.users`, `public.services`, policy `org_logos_*`;
  `public.dump` 122 entri ACL; retensi menghapus tepat berkas yang seharusnya.

## Belum dikerjakan

- Berkas `org-logos` toko lain (bila ada) — tidak ada di dump. Logo toko pemilik
  sudah diunggah ulang 24 Sep.
- **SMTP** — reset password & email auth belum terkirim.
- Backup di luar mesin: skrip siap & teruji (lihat bagian di atas); tinggal dipasang
  di server + uji pulih pertama dari arsip Drive.
- Uji restart Windows tanpa disentuh (dilewati pemilik saat pemasangan).
- Akses dari luar: rencananya **Cloudflare Tunnel** tanpa syarat (menembus CGNAT,
  IP dinamis, sekaligus HTTPS). Di Windows `cloudflared` dipasang sebagai service.

#self-host #runbook
