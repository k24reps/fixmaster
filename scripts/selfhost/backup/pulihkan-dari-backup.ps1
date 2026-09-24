# Bangun ulang server FixMaster dari SATU arsip backup-offsite (.7z).
# Untuk mesin baru / SSD baru: Docker Desktop + 7-Zip sudah terpasang, belum ada
# stack Supabase apa pun. Tidak butuh Git, PostgreSQL, atau repo FixMaster.
#
#   powershell -ExecutionPolicy Bypass -File .\pulihkan-dari-backup.ps1 -Archive "D:\fixmaster-20260924-1300.7z"
#
# Password arsip ditanyakan (tidak tampil). Hasil: C:\fixmaster-server\docker berisi
# stack yang sama persis (kunci .env & vault lama), database terpulihkan dan
# terverifikasi. Log lengkap: C:\fixmaster-server\pulihkan-<waktu>.log
#
# Urutan dan perintah database = restore yang terbukti saat migrasi dari cloud
# (runbook docs/obsidian-vault/Self-Hosting.md). Yang sengaja TIDAK dipulihkan:
# sesi login (semua pengguna login ulang sekali, password tetap).

param(
  [Parameter(Mandatory = $true)][string]$Archive,
  [string]$Target = 'C:\fixmaster-server',
  [string]$Work = 'C:\pulih',
  # Opsional: berkas password DPAPI (backup-pw.dat) di mesin yang sama. Kosong = ditanya.
  [string]$PwFile = ''
)

$ErrorActionPreference = 'Stop'
$sevenZip = 'C:\Program Files\7-Zip\7z.exe'
$docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $docker) { $docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe' }
$dockerDir = Join-Path $Target 'docker'

function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Native($what) { if ($LASTEXITCODE -ne 0) { throw "$what gagal (exit $LASTEXITCODE)" } }
function RemoveTree($path) {
  # rd dengan awalan \\?\ menembus batas 260 karakter (berkas storage bersarang dalam).
  if (Test-Path -LiteralPath $path) { cmd /c "rd /s /q ""\\?\$path""" | Out-Null }
}

# Dijalankan DI DALAM kontainer supabase-db (pg_restore/psql bawaan image), jadi
# mesin Windows tidak butuh PostgreSQL dan tak ada pipa biner lewat PowerShell.
$restoreDb = @'
#!/bin/bash
set -euo pipefail
cd /tmp/pulih
A="psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q"
P="psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
say() { echo "    $*"; }
copyrows() { awk -v t="$1" '$0 ~ "^COPY "t" " {i=1; next} i && /^\\\.$/ {i=0} i {n++} END {print n+0}'; }

echo "  [1/7] ekstensi pg_cron"
$P -c "create extension if not exists pg_cron;"

echo "  [2/7] akun login (auth.users + auth.identities)"
pg_restore -a --disable-triggers -n auth -t users -t identities full.dump -f - | $A --single-transaction

echo "  [3/7] data toko + hak akses (public)"
# Default privileges Supabase memberi anon/authenticated hak atas objek baru;
# pg_dump menulis ACL relatif terhadap bawaan Postgres. Cabut dulu, lalu entri
# DEFAULT ACL dari dump (dipulihkan paling akhir) mengembalikannya.
pg_restore -l public.dump > full.list
grep -vE " SCHEMA - public | COMMENT - SCHEMA public | ACL - SCHEMA public |DEFAULT ACL .*supabase_admin" full.list > filtered.list
{ cat <<'SQL'
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
SQL
  pg_restore -L filtered.list public.dump -f -; } | $P --single-transaction

echo "  [4/7] storage: bucket, metadata berkas, aturan akses"
pg_restore -a --disable-triggers -n storage -t buckets -t objects full.dump -f - | $A --single-transaction
pg_restore -l full.dump | grep " POLICY storage objects " > pol.list || true
if [ -s pol.list ]; then pg_restore -L pol.list full.dump -f - | $A --single-transaction; fi

echo "  [5/7] tabel realtime"
T=$(pg_restore -l full.dump | grep " PUBLICATION TABLE public supabase_realtime " | awk '{print $(NF-1)}' | sort -u || true)
if [ -n "$T" ]; then $P -c "alter publication supabase_realtime add table $(echo "$T" | sed 's/^/public./' | paste -sd, -);"; fi

echo "  [6/7] rahasia vault + jadwal backup otomatis"
# project_url = gateway DILIHAT DARI kontainer db (jaringan Docker), bukan domain publik.
$P -v s="$BACKUP_CRON_SECRET" > /dev/null <<'SQL'
select vault.create_secret('http://api-gw:8000', 'project_url', 'Gateway self-host, dilihat dari kontainer db');
select vault.create_secret(:'s', 'backup_cron_secret', 'Dicocokkan dengan env BACKUP_CRON_SECRET di layanan functions');
select cron.schedule('fixmaster-auto-backup', '0 18 * * *', 'select run_auto_backup();');
SQL

echo "  [7/7] verifikasi"
FAIL=0
check() { if [ "$2" = "$3" ]; then say "OK   $1: $3"; else say "BEDA $1: dump $2, hasil $3"; FAIL=1; fi; }
q() { $P -At -c "$1"; }

pg_restore -a -n public public.dump -f - | awk '/^COPY public\./ {t=$2; sub(/^public\./,"",t); n=0; i=1; next} i && /^\\\.$/ {print t, n; i=0; next} i {n++}' | sort > cnt.txt
ok=0; bad=0
while read -r t n; do
  s=$(q "select count(*) from public.\"$t\"")
  if [ "$s" = "$n" ]; then ok=$((ok+1)); else bad=$((bad+1)); say "BEDA public.$t: dump $n, hasil $s"; fi
done < cnt.txt
if [ "$bad" -eq 0 ]; then say "OK   tabel public: $ok/$ok jumlah baris sama persis"; else FAIL=1; fi

check "auth.users" "$(pg_restore -a -n auth -t users full.dump -f - | copyrows auth.users)" "$(q 'select count(*) from auth.users')"
check "auth.identities" "$(pg_restore -a -n auth -t identities full.dump -f - | copyrows auth.identities)" "$(q 'select count(*) from auth.identities')"
check "storage.objects" "$(pg_restore -a -n storage -t objects full.dump -f - | copyrows storage.objects)" "$(q 'select count(*) from storage.objects')"
check "policy storage" "$(wc -l < pol.list | tr -d ' ')" "$(q "select count(*) from pg_policies where schemaname='storage'")"
check "tabel realtime" "$(echo "$T" | grep -c . || true)" "$(q "select count(*) from pg_publication_tables where pubname='supabase_realtime'")"
check "vault terbaca" "2" "$(q 'select count(*) from vault.decrypted_secrets where decrypted_secret is not null')"
check "jadwal cron" "1" "$(q 'select count(*) from cron.job')"

norm() { { grep -E "^(GRANT|REVOKE) .* ON (FUNCTION|TABLE|SEQUENCE) public\.|^ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public" || true; } | sort; }
pg_restore -n public public.dump -f - | norm > acl_dump.txt
pg_dump -U postgres -d postgres -n public --schema-only | norm > acl_live.txt
d=$(diff acl_dump.txt acl_live.txt | grep -c '^[<>]' || true)
check "baris hak akses public (beda)" "0" "$d"
say "(hak akses: $(wc -l < acl_live.txt | tr -d ' ') baris)"

$P -c "notify pgrst, 'reload schema';"
exit $FAIL
'@

# ---------- pemeriksaan: jangan pernah menimpa stack yang ada ----------
Step '0/6 Pemeriksaan'
if (-not (Test-Path $Archive)) { throw "Arsip tidak ada: $Archive" }
if (-not (Test-Path $sevenZip)) { throw "7-Zip tidak ada di $sevenZip" }
if (-not (Test-Path $docker)) { throw "docker.exe tidak ditemukan" }
& $docker info --format '{{.ServerVersion}}' | Out-Null
Native 'Docker belum jalan (buka Docker Desktop)'
if (Test-Path $dockerDir) { throw "$dockerDir sudah ada. Skrip ini hanya untuk mesin kosong." }
if (& $docker ps -a --filter 'name=^supabase-db$' --format '{{.Names}}') { throw 'Kontainer supabase-db sudah ada. Skrip ini hanya untuk mesin kosong.' }
& $docker volume inspect supabase_db-config *> $null
if ($LASTEXITCODE -eq 0) { throw 'Volume supabase_db-config sudah ada. Skrip ini hanya untuk mesin kosong.' }
if (Test-Path $Work) { throw "$Work sudah ada - hapus dulu (mungkin sisa percobaan sebelumnya)." }

New-Item -ItemType Directory -Force $Target | Out-Null
$log = Join-Path $Target "pulihkan-$(Get-Date -Format 'yyyyMMdd-HHmm').log"
Start-Transcript -Path $log | Out-Null

try {
  if ($PwFile) {
    $secure = Get-Content $PwFile | ConvertTo-SecureString
  } else {
    $secure = Read-Host 'Password arsip backup' -AsSecureString
  }
  $pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

  # ---------- 1. bongkar ----------
  Step "1/6 Bongkar arsip ke $Work"
  & $sevenZip x "-p$pw" $Archive "-o$Work" -y | Out-Null
  Native 'Bongkar arsip (password salah?)'
  foreach ($f in 'full.dump', 'public.dump', 'db-config.tgz', 'docker\docker-compose.yml', 'docker\.env') {
    if (-not (Test-Path (Join-Path $Work $f))) {
      throw "Arsip tidak memuat $f. Arsip sebelum 24 Sep 2026 siang belum membawa folder docker\ - pakai arsip yang lebih baru."
    }
  }
  $envRaw = [IO.File]::ReadAllText((Join-Path $Work 'docker\.env'))
  if ($envRaw.Contains("`r")) { throw '.env di arsip mengandung CRLF - berhenti.' }
  $cronSecret = ([regex]::Match($envRaw, '(?m)^BACKUP_CRON_SECRET=(.*)$')).Groups[1].Value
  if (-not $cronSecret) { throw 'BACKUP_CRON_SECRET tidak ada di .env' }
  $anon = ([regex]::Match($envRaw, '(?m)^ANON_KEY=(.*)$')).Groups[1].Value

  # ---------- 2. folder compose ----------
  Step "2/6 Pasang folder compose di $dockerDir"
  Copy-Item (Join-Path $Work 'docker') $Target -Recurse
  if (Test-Path (Join-Path $Work 'storage')) {
    Copy-Item (Join-Path $Work 'storage') (Join-Path $dockerDir 'volumes') -Recurse
  }
  Set-Location $dockerDir
  $image = (Select-String -Path 'docker-compose.yml' -Pattern 'image:\s*(supabase/postgres:\S+)').Matches[0].Groups[1].Value
  Write-Host "image database: $image"

  # ---------- 3. image + kunci vault SEBELUM start pertama ----------
  Step '3/6 Unduh image (sekitar 2 GB bila belum ada) + pulihkan kunci vault'
  & $docker compose pull
  Native 'docker compose pull'
  # Harus ada sebelum Postgres menyala pertama kali; kalau tidak, ia membuat
  # pgsodium_root.key baru dan rahasia vault lama tak terbaca. Label compose
  # mencegah peringatan "volume already exists but was not created by Compose".
  & $docker volume create --label com.docker.compose.project=supabase --label com.docker.compose.volume=db-config supabase_db-config | Out-Null
  Native 'buat volume db-config'
  & $docker run --rm -v supabase_db-config:/dst -v "${Work}:/in" --entrypoint tar $image xzf /in/db-config.tgz -C /dst
  Native 'pulihkan db-config'

  # ---------- 4. nyalakan stack kosong ----------
  Step '4/6 Nyalakan stack (start pertama bisa beberapa menit)'
  & $docker compose up -d --wait
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Belum semua healthy - mencoba sekali lagi (storage kadang lambat di start pertama)' -ForegroundColor Yellow
    & $docker compose up -d --wait
    Native 'docker compose up'
  }

  # ---------- 5. pulihkan database (di dalam kontainer) ----------
  Step '5/6 Pulihkan database'
  $sh = Join-Path $Work 'restore-db.sh'
  [IO.File]::WriteAllText($sh, ($restoreDb -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
  & $docker exec supabase-db mkdir -p /tmp/pulih
  Native 'mkdir'
  foreach ($f in 'full.dump', 'public.dump', 'restore-db.sh') {
    & $docker cp (Join-Path $Work $f) "supabase-db:/tmp/pulih/$f" | Out-Null
    Native "docker cp $f"
  }
  & $docker exec -e "BACKUP_CRON_SECRET=$cronSecret" supabase-db bash /tmp/pulih/restore-db.sh
  $dbExit = $LASTEXITCODE
  & $docker exec supabase-db rm -rf /tmp/pulih | Out-Null
  if ($dbExit -ne 0) { throw "Pemulihan database gagal atau verifikasi tidak cocok (exit $dbExit) - lihat keluaran di atas." }

  # ---------- 6. uji jalur API ----------
  Step '6/6 Uji jalur API'
  & $docker compose restart rest functions | Out-Null
  Start-Sleep 5
  $health = curl.exe -s http://localhost:8000/functions/v1/health
  Write-Host "functions/health : $health"
  $auth = curl.exe -s -o NUL -w '%{http_code}' -H "apikey: $anon" http://localhost:8000/auth/v1/health
  Write-Host "auth/health      : HTTP $auth"
  if ($health -notmatch '"db":"up"' -or $auth -ne '200') { throw 'Jalur API belum sehat.' }

  Write-Host ''
  Write-Host 'PULIH. Langkah berikutnya (lihat runbook):' -ForegroundColor Green
  Write-Host '  1. Cloudflare > tunnel fixmaster-server > Add a connector > jalankan service install'
  Write-Host '  2. Salin skrip backup ke C:\fixmaster-server\backup, lalu simpan-password + pasang-jadwal'
  Write-Host '  3. Login di fixmaster.app (semua pengguna login ulang sekali)'
} finally {
  # Bersihkan SALINAN TERBONGKAR: berisi .env dan seluruh data tanpa enkripsi.
  Set-Location $env:USERPROFILE
  RemoveTree $Work
  Stop-Transcript | Out-Null
}
